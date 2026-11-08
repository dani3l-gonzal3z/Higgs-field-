// 🎓 Aprender: un profe low-poly que te da la clase en la tele con pizarra y voz, a partir de tus PDF o de cualquier tema,
// y que contesta tus preguntas en el momento (empieza a hablar con la primera frase y se calla si le interrumpes).
import { el, btn, toast, seg, uid, db, getSettings, saveSettings, host, emit } from './core.js';
import { llmJSON, llmStream, llmReady } from './llm.js';
import { detectLocal, hasLocalVoice, speakLocal, localBase, localCaps } from './local.js';
import { qrSVG } from './qr.js';

const PDFJS_VER = '5.4.296';
const hideToast = () => { const t = document.getElementById('toast'); if (t) t.classList.remove('show'); };
export const L = { session: null }; // clase en curso
const LEVELS = [['basico', 'Lo básico'], ['normal', 'Normal'], ['fondo', 'A fondo']];
const lvl = () => (getSettings().learn || {}).level || 'normal';

/* ---------- Documentos ---------- */
export async function docsList() { return (await db.all('projects')).filter(p => p.kind === 'doc').sort((a, b) => b.t - a.t); }
async function loadPdfJs() {
  const tries = [['./vendor/pdfjs/pdf.mjs', './vendor/pdfjs/pdf.worker.mjs'], [`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.min.mjs`, `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VER}/build/pdf.worker.min.mjs`]];
  for (const [lib, worker] of tries) { try { const m = await import(new URL(lib, location.href).href); m.GlobalWorkerOptions.workerSrc = new URL(worker, location.href).href; return m; } catch (e) {} }
  throw new Error('No se pudo cargar el lector de PDF');
}
export async function extractText(blob, name = '') {
  const isPdf = /pdf/i.test(blob.type) || /\.pdf$/i.test(name);
  if (!isPdf) { if (/^(text\/|application\/(json|xml|x-markdown))/.test(blob.type) || /\.(txt|md|csv|json|html?)$/i.test(name)) { let t = await blob.text(); if (/html?$/i.test(name) || /html/.test(blob.type)) t = new DOMParser().parseFromString(t, 'text/html').body.innerText; return { text: t, pages: 1 }; } throw new Error('Por ahora entiendo PDF y texto (txt, md, html)'); }
  const pdfjs = await loadPdfJs(); const pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise; const n = Math.min(pdf.numPages, 400); const parts = [];
  for (let i = 1; i <= n; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); let s = ''; for (const it of tc.items) { s += it.str; s += it.hasEOL ? '\n' : ' '; } parts.push(`[p. ${i}]\n` + s.replace(/[ \t]+/g, ' ').trim()); }
  const text = parts.join('\n\n'); if (text.replace(/\[p\. \d+\]|\s/g, '').length < 40) throw new Error('Este PDF no tiene texto (parece escaneado): todavía no leo imágenes');
  return { text, pages: pdf.numPages };
}
export async function addDoc(blob, name, source = 'archivo') {
  const { text, pages } = await extractText(blob, name); const d = { id: 'doc-' + uid(), kind: 'doc', t: Date.now(), title: String(name || 'Documento').replace(/\.[a-z0-9]+$/i, ''), text, pages, source, chars: text.length };
  await db.put('projects', d); emit('docs'); return d;
}
export async function addTextDoc(text, title = 'Notas') { const d = { id: 'doc-' + uid(), kind: 'doc', t: Date.now(), title, text, pages: 1, source: 'texto', chars: text.length }; await db.put('projects', d); emit('docs'); return d; }

// Búsqueda sencilla de los trozos más relevantes (para preguntas sobre documentos largos).
const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const STOP = new Set('para como pero porque cuando donde sobre entre desde hasta este esta estos estas aquel unos unas tiene tienen sera esta esto eso que los las del con por una uno sus mas muy sin the and for with that this from are was'.split(' '));
const terms = s => norm(s).match(/[a-z0-9ñ]{3,}/g)?.filter(w => !STOP.has(w)) || [];
function chunks(text, size = 1400) { const out = []; const paras = text.split(/\n{2,}/); let cur = ''; for (const p of paras) { if ((cur + '\n\n' + p).length > size && cur) { out.push(cur); cur = p; } else cur = cur ? cur + '\n\n' + p : p; } if (cur) out.push(cur); return out.flatMap(c => c.length > size * 2 ? c.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) : [c]); }
export function relevant(text, query, max = 9000) {
  const cs = chunks(text); const q = [...new Set(terms(query))]; if (!q.length) return text.slice(0, max);
  const df = Object.fromEntries(q.map(w => [w, cs.filter(c => norm(c).includes(w)).length || 0.5]));
  const sc = cs.map((c, i) => { const n = norm(c); let s = 0; for (const w of q) { const k = n.split(w).length - 1; if (k) s += (1 + Math.log(k)) * Math.log(1 + cs.length / df[w]); } return { i, s }; }).sort((a, b) => b.s - a.s);
  const pick = []; let len = 0; for (const x of sc) { if (x.s <= 0 && pick.length) break; if (len + cs[x.i].length > max) continue; pick.push(x.i); len += cs[x.i].length; } return pick.sort((a, b) => a - b).map(i => cs[i]).join('\n…\n');
}
function material(doc, focus) { if (!doc) return ''; const t = doc.text; if (t.length <= 28000) return t; if (focus) return relevant(t, focus, 26000);
  const cs = chunks(t, 1600); const step = Math.max(1, Math.floor(cs.length / 14)); return cs.filter((_, i) => i < 4 || i % step === 0).join('\n…\n').slice(0, 26000); }

/* ---------- Generar la clase ---------- */
export async function makeLesson({ doc, topic, focus, level = lvl() }) {
  if (!llmReady()) throw new Error('Configura la IA en Ajustes (o usa Plató dentro de Claude)');
  const lv = { basico: 'Nivel básico: sin tecnicismos, con analogías de la vida diaria.', normal: 'Nivel normal: claro y riguroso, con ejemplos.', fondo: 'Nivel a fondo: con detalle técnico, matices y casos límite; quien escucha es un adulto con base.' }[level] || '';
  const mat = material(doc, focus);
  const prompt = `Eres un profesor excelente que da clases en vídeo, de pie junto a una pizarra, para un adulto curioso. Prepara una clase en español${doc ? ` basada en el material de «${doc.title}»` : ` sobre: ${topic}`}.${focus ? ` Céntrate en: ${focus}.` : ''} ${lv}
${mat ? `MATERIAL:\n<<<\n${mat}\n>>>\n` : ''}
Junto al profe hay un escenario 3D low-poly. Úsalo para que se ENTIENDA viendo, no para decorar: que se vea la causa y el efecto, y que quien aprende pueda tocar y probar. Tú das los datos y Plató lo coloca solo (no inventes coordenadas salvo en "machine").
Elige el visual que mejor enseñe cada idea (puedes cambiar de visual a mitad de la clase):
- process: pasos de un proceso o ciclo, con una ficha que los recorre. {"visual":{"kind":"process","loop":false,"steps":[{"label":"Evaporación","info":"una frase","color":"agua","shape":"sphere|cone|box|cylinder"}]}} (3 a 8 pasos; "loop":true para ciclos)
- compare: tamaños o cantidades A ESCALA entre sí (planetas, células, distancias, precios…). {"visual":{"kind":"compare","unit":"km","items":[{"label":"Tierra","value":12742,"info":"…","shape":"sphere|box|bar","color":"azul"}]}}
- timeline: hechos en el tiempo, separados según la fecha. {"visual":{"kind":"timeline","events":[{"label":"Imprenta","year":1450,"info":"…"}]}}
- chart: datos numéricos que crecen ante tus ojos. {"visual":{"kind":"chart","type":"bar|line","unit":"%","series":[{"label":"2020","value":12,"info":"…"}]}}
- map: ideas conectadas alrededor de una central. {"visual":{"kind":"map","center":{"label":"Célula","info":"…"},"nodes":[{"label":"Núcleo","info":"…"},{"label":"ADN","parent":"Núcleo","info":"…"}]}}
- machine: una máquina, un objeto o una estructura por piezas: {"visual":{"kind":"machine","items":[pieza,…],"groups":{…}}} y en pasos siguientes {"add":[pieza,…]} para ir añadiendo piezas.
Todo elemento lleva "label" (1 a 3 palabras) e "info" (una frase: qué es o para qué sirve; sale al tocarlo). Cada elemento aparece justo cuando dices su "label" en voz alta, así que nómbralos en "say" con esa misma palabra.
Empieza el visual YA en el paso 1 o 2, mientras das la teoría, y ve construyendo sobre él.
Además, en "scene" de cualquier paso puedes añadir (combinables entre sí y con lo anterior):
- "camera": plano de documental cuando hables de una parte concreta: {"focus":"etiqueta","mode":"close|xray|cut"} (close = primer plano; xray = el resto se vuelve transparente; cut = corta el resto para ver por dentro). El paso siguiente vuelve solo al plano general.
- "highlight": ["etiqueta"] para hacer brillar partes.
- "control": un mando «Pruébalo tú» para experimentar con una variable (corriente, temperatura, fuerza, velocidad…): {"label":"Corriente","type":"slider|switch","min":0,"max":10,"value":5,"unit":"A","hint":"Sube la corriente y mira el rotor","affects":[{"target":"etiqueta o grupo","prop":"speed|reverse|scale|visible|glow","k":1}]}. speed: a la mitad del recorrido va normal, a cero se para; reverse (switch): invierte el giro; scale: cambia el tamaño; visible (switch): aparece/desaparece; glow: brilla más cuanto más alto. Pon como mucho un mando por visual, cuando de verdad ayude a entender, y en "say" invita a probarlo.
Formato de pieza (solo en machine): {"shape":"box|sphere|cylinder|cone|torus|capsule|plane|ring|loop|coil|gear|magnet|tube|arrow|text","pos":[x,y,z],"size":[…],"rot":[gradosX,gradosY,gradosZ],"color":"rojo|azul|verde|amarillo|naranja|morado|rosa|cian|gris|negro|blanco|marrón|cobre|plata|oro|agua|fuego|#hex","label":"…","info":"…","group":"opcional","anim":"spin|spinx|spinz|orbit|bob|pulse|flow","speed":1}
Medidas: suelo en y=0, y hacia arriba, todo cabe en unas 2 unidades; piensa el plano antes: que las piezas se toquen donde deben y no se atraviesen. box [ancho,alto,fondo] · sphere [radio] · cylinder [radio,alto] (de pie; tumbado con "rot":[90,0,0] o [0,0,90]) · cone [radio,alto] · torus [radio,grosor] · loop [ancho,alto,grosor] (espira rectangular, plano XY) · coil [radio,largo,grosor] con "turns" · gear [radio,grosor] con "teeth" · magnet [ancho,alto,fondo] (norte rojo arriba) · tube con "points":[[x,y,z],…] · arrow con "dir":[x,y,z] y "len" · ring [radio] · text con "text". "orbit" gira alrededor del centro; "flow" va en bucle de pos a "to":[x,y,z]. Piezas que se mueven juntas: "groups":{"Rotor":{"pos":[x,y,z],"anim":"spinz"}} y "group":"Rotor" en cada pieza (coordenadas relativas al grupo).
Ejemplo de machine bien hecha (motor eléctrico; adáptalo, no lo copies):
paso 1 "scene": {"visual":{"kind":"machine","items":[{"shape":"box","pos":[0,0.05,0],"size":[2,0.1,1.2],"color":"gris","label":"Base","info":"Sujeta todo el motor."},{"shape":"box","pos":[-0.75,0.55,0],"size":[0.3,0.8,0.8],"color":"rojo","label":"Imán norte","info":"Uno de los polos que crean el campo magnético."},{"shape":"box","pos":[0.75,0.55,0],"size":[0.3,0.8,0.8],"color":"azul","label":"Imán sur","info":"El polo opuesto; el campo va del norte al sur."},{"shape":"arrow","pos":[-0.55,0.3,0.5],"dir":[1,0,0],"len":1.1,"color":"cian","label":"Campo magnético","info":"Las líneas de fuerza que empujan al cable con corriente."}]}}
paso 2 "scene": {"groups":{"Rotor":{"pos":[0,0.55,0],"anim":"spinz"}},"add":[{"shape":"cylinder","group":"Rotor","pos":[0,0,0],"size":[0.04,1.6],"rot":[90,0,0],"color":"plata","label":"Eje","info":"Gira y saca el movimiento fuera."},{"shape":"loop","group":"Rotor","pos":[0,0,0],"size":[0.8,0.6,0.035],"rot":[0,90,0],"color":"cobre","label":"Espira","info":"El cable con corriente; el campo la empuja y gira."}],"control":{"label":"Corriente","type":"slider","min":0,"max":10,"value":5,"unit":"A","hint":"Bájala a cero y mira qué pasa","affects":[{"target":"Rotor","prop":"speed"}]}}
paso 3 "scene": {"add":[{"shape":"cylinder","group":"Rotor","pos":[0,0,0.6],"size":[0.08,0.14],"rot":[90,0,0],"color":"oro","label":"Conmutador","info":"Invierte la corriente cada media vuelta para que no se pare."}],"camera":{"focus":"Conmutador","mode":"close"}}
paso 4 "check": {"q":"Toca la pieza que invierte la corriente","tap":"Conmutador","explain":"…"}
Reglas:
- Entre 6 y 10 pasos. Empieza enganchando con por qué importa. Un concepto por paso, con ejemplos concretos. Termina con un resumen.
- No despaches la teoría de los primeros pasos en una frase: explícala con calma y con un ejemplo, mientras el modelo se va montando.
- "say": 3 a 5 frases habladas y naturales, sin markdown, sin emojis, sin listas; no leas la pizarra literalmente.
- "board": lo que escribirías: título corto, hasta 5 viñetas de menos de 9 palabras, "formula" para números, ecuaciones o reglas clave (o vacío), "note" opcional.
- Cada 2 o 3 pasos pon en "check" una pregunta de repaso: {"q":"...","options":["...","...","..."],"answer":0,"explain":"por qué, en una frase"}. Si hay un visual en pantalla, alterna con preguntas de tocar: {"q":"Toca …","tap":"etiqueta exacta de un elemento","options":["…","…","…"],"answer":0,"explain":"…"} (las opciones son el plan B si no se puede tocar). En el resto, "check": null.
${doc ? '- Si el material no basta, dilo en el primer paso y completa con conocimiento general fiable, sin inventar datos del documento.' : '- No menciones documentos ni material de apoyo: explica directamente con conocimiento general fiable.'}`;
  const j = await llmJSON(prompt, { maxTokens: 12000 }); if (!j || !Array.isArray(j.steps) || !j.steps.length) throw new Error('La clase no ha salido bien; prueba otra vez');
  j.steps = j.steps.filter(s => s && s.say).slice(0, 14); return { id: 'lesson-' + uid(), docId: doc && doc.id, topic, focus, level, ...j };
}

/* ---------- Voz ---------- */
function engine() { const e = (getSettings().learn || {}).voice || 'auto'; if (e !== 'auto') return e; return hasLocalVoice('kokoro') ? 'kokoro' : hasLocalVoice('edge') ? 'edge' : 'browser'; }
const VCACHE = new Map();
function tts(text) { // promesa de {blob, words} (o null para la voz del navegador); se reutiliza para adelantar la siguiente frase
  const e = engine(); if (e === 'browser') return Promise.resolve(null); const k = e + '|' + text; if (VCACHE.has(k)) return VCACHE.get(k);
  const s = getSettings(); const voice = (s.voice || {})[e] || (e === 'edge' ? 'es-ES-ElviraNeural' : 'ef_dora');
  const p = speakLocal({ engine: e, text, voice }).catch(err => { console.warn('voz', err); return null; }); VCACHE.set(k, p); if (VCACHE.size > 60) VCACHE.delete(VCACHE.keys().next().value); return p;
}

/* ---------- Reproductor ---------- */
function layer() { let l = document.getElementById('learnlayer'); if (!l) { l = el('div', { id: 'learnlayer' }); document.getElementById('main').append(l); } return l; }
function post(m) { const s = L.session; if (s && s.frame && s.frame.contentWindow) s.frame.contentWindow.postMessage(m, '*'); }
addEventListener('message', e => { const m = e.data || {}; const s = L.session; if (!s || !s.frame || e.source !== s.frame.contentWindow) return;
  if (m.type === 'learn-ready' && s.readyRes) s.readyRes();
  else if (m.type === 'tapReady' && s.tapReady) { const f = s.tapReady; s.tapReady = null; f(m); }
  else if (m.type === 'part' && m.quiz && s.tapPick) s.tapPick(m.label); });
// La voz suena aquí (la página principal), que es la que recibe tus toques: así el navegador la deja sonar desde el primer clic.
// Al profe le mandamos el texto y el reloj de la voz para mover la boca y los subtítulos.
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
const AUD = { el: null };
export function unlockAudio() {
  try { if (!AUD.el) { AUD.el = new Audio(); AUD.el.setAttribute('playsinline', ''); } AUD.el.src = SILENT; const p = AUD.el.play(); p && p.catch(() => {}); } catch (e) {}
  try { if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } } catch (e) {}
}
addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
function pickVoice() { try { const vs = speechSynthesis.getVoices(); return vs.find(v => /^es/i.test(v.lang) && /natural|neural|google|online|premium|enhanced/i.test(v.name)) || vs.find(v => /^es/i.test(v.lang)) || null; } catch (e) { return null; } }
// Trozos para la voz del navegador: frases, y las largas partidas por comas (máx. ~22 palabras).
function speechChunks(words) { const out = []; let cur = [];
  words.forEach((w, i) => { cur.push(i); if (/[.!?…;:]$/.test(w) || (cur.length >= 14 && /,$/.test(w)) || cur.length >= 22) { out.push(cur); cur = []; } }); if (cur.length) out.push(cur); return out; }
// Misma estimación que usa el profe para mover la boca (segundos a velocidad 1).
function estDur(ws) { let t = 0; for (const w of ws) t += Math.max(0.18, w.replace(/[^\p{L}\p{N}]/gu, '').length * 0.075) + (/[.,;:!?…]$/.test(w) ? 0.28 : 0.05); return t; }
// Autoajuste: compara lo que tarda de verdad la voz con lo estimado y corrige la velocidad de boca y subtítulos.
const RATE = { f: (() => { try { return Math.min(2, Math.max(0.5, +localStorage.getItem('plato.speechRate2') || 1)); } catch (e) { return 1; } })() };
function calib(ws, real) { if (ws.length < 4 || !(real > 0.4)) return; const m = Math.min(2, Math.max(0.5, real / estDur(ws))); RATE.f = RATE.f * 0.6 + m * 0.4; try { localStorage.setItem('plato.speechRate2', RATE.f.toFixed(3)); } catch (e) {} }
function playSpeech(text, a) { const s = L.session; const id = uid();
  return new Promise(res => {
    let done = false, raf = 0, t0 = performance.now(), pausedAt = 0, pausedTotal = 0; const words = text.split(/\s+/).filter(Boolean);
    const fin = ok => { if (done) return; done = true; cancelAnimationFrame(raf); clearTimeout(guardT); post({ type: 'end', id }); if (s.cur && s.cur.id === id) s.cur = null; res(ok); };
    post({ type: 'speak', id, text, words: a && a.words, external: true, rate: 1 / RATE.f });
    let clock = () => (performance.now() - t0 - pausedTotal - (pausedAt ? performance.now() - pausedAt : 0)) / 1000, guardT = 0;
    const tick = () => { if (done) return; post({ type: 'clock', id, t: clock(), paused: !!(s.cur && s.cur.isPaused && s.cur.isPaused()) }); raf = requestAnimationFrame(tick); };
    const browser = () => {
      if (!('speechSynthesis' in window)) { guardT = setTimeout(() => fin(true), (text.length / 14 + 0.6) * 1000); s.cur = { id, pause() { pausedAt = performance.now(); }, resume() { if (pausedAt) { pausedTotal += performance.now() - pausedAt; pausedAt = 0; } }, stop() { fin(false); }, isPaused: () => !!pausedAt }; tick(); return; }
      // Frase a frase, pero todas encoladas de golpe: Chrome corta en silencio las locuciones largas (~15 s) y en el móvil
      // hablar desde el aviso de fin de la frase anterior puede quedarse mudo. Encolando todas, el navegador las encadena solo;
      // cada inicio de frase re-sincroniza boca y subtítulos. Referencias fuertes para que no se pierdan los avisos.
      const chunks = speechChunks(words); const v = pickVoice(); let last = -1, ended = 0, stopped = false;
      const keep = s.utters = []; window.__platoUtters = keep; const est = estDur(words) * RATE.f + 3;
      const t1 = []; // inicio real de cada frase (para el autoajuste)
      chunks.forEach((ch, ci) => {
        const txt = ch.map(k => words[k]).join(' '); const u = new SpeechSynthesisUtterance(txt); keep.push(u);
        if (v) u.voice = v; u.lang = (v && v.lang) || 'es-ES';
        const st = []; let pos = 0; for (const k of ch) { const i = txt.indexOf(words[k], pos); st.push(i < 0 ? pos : i); pos = (i < 0 ? pos : i) + words[k].length; }
        u.onstart = () => { if (done) return; last = ci; t1[ci] = performance.now() - pausedTotal; if (ci === 0) t0 = performance.now(); post({ type: 'word', id, k: ch[0] }); };
        u.onboundary = e => { if (done || (e.name && e.name !== 'word')) return; let j = 0; while (j + 1 < st.length && st[j + 1] <= e.charIndex) j++; post({ type: 'word', id, k: ch[j] }); };
        const end = () => { if (done || stopped || u._end) return; u._end = true; ended++; if (t1[ci]) calib(ch.map(k => words[k]), (performance.now() - pausedTotal - t1[ci]) / 1000); if (ci === chunks.length - 1 || ended >= chunks.length) fin(true); };
        u.onend = end; u.onerror = e => { if (e && (e.error === 'interrupted' || e.error === 'canceled')) return; end(); };
      });
      s.cur = { id, pause() { pausedAt = performance.now(); try { speechSynthesis.pause(); } catch (e) {} }, resume() { if (pausedAt) { pausedTotal += performance.now() - pausedAt; pausedAt = 0; } try { speechSynthesis.resume(); } catch (e) {} }, stop() { stopped = true; try { speechSynthesis.cancel(); } catch (e) {} fin(false); }, isPaused: () => !!pausedAt };
      // Red de seguridad: si el navegador no avisa del final, seguimos igual (sin cortar si todavía está hablando).
      const guard = () => { if (done) return; if (pausedAt || (speechSynthesis.speaking && clock() < est * 1.8)) guardT = setTimeout(guard, 700); else fin(true); }; guardT = setTimeout(guard, est * 1000);
      try { speechSynthesis.cancel(); } catch (e) {}
      setTimeout(() => { if (done || stopped) return; for (const u of keep) speechSynthesis.speak(u); try { speechSynthesis.resume(); } catch (e) {} }, 80); tick(); };
    if (a && a.blob) { const el = AUD.el || (AUD.el = new Audio()); el.setAttribute('playsinline', ''); el.src = URL.createObjectURL(a.blob); clock = () => el.currentTime;
      el.onended = () => fin(true); el.onerror = () => fin(false);
      s.cur = { id, pause() { el.pause(); }, resume() { el.play().catch(() => {}); }, stop() { el.pause(); fin(false); }, isPaused: () => el.paused && !el.ended };
      el.play().then(tick, () => { s.cur = null; browser(); }); }
    else browser();
  }); }
async function say(text, { gen, scene } = {}) { const s = L.session; if (!s || !text) return false; const a = await tts(text); if (!L.session || s.gen !== gen) return false;
  const p = playSpeech(text, a); if (scene) post({ type: 'scene', scene }); return await p; }
function stopTalk() { const s = L.session; if (!s) return; s.gen++; if (s.cur) s.cur.stop(); try { speechSynthesis.cancel(); } catch (e) {} }

export async function startLesson(lesson, { doc } = {}) {
  endLesson(); if (location.hash !== '#learn') location.hash = '#learn'; const ly = layer(); ly.innerHTML = ''; ly.classList.add('on'); document.body.classList.add('learning');
  const frame = el('iframe', { class: 'ln-frame', src: 'learn.html', allow: 'autoplay' });
  const s = L.session = { lesson, doc, i: 0, gen: 0, paused: false, frame, ly, readyRes: null, mode: 'lesson', quiz: null };
  const ready = new Promise(r => { s.readyRes = r; setTimeout(r, 15000); });
  const stepLbl = el('span', { class: 'ln-step' }); const playB = btn('⏸', () => togglePause(), 'ln-b');
  const ask = el('input', { class: 'txt', placeholder: 'Pregúntale lo que quieras… (te corta y te contesta)', enterkeyhint: 'send' });
  const send = () => { unlockAudio(); const q = ask.value.trim(); if (!q) return; ask.value = ''; answer(q); }; ask.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
  const quiz = el('div', { class: 'ln-quiz', hidden: true }); s.ui = { stepLbl, playB, quiz };
  ly.append(frame, el('div', { class: 'ln-top' }, el('b', {}, lesson.title || 'Clase'), stepLbl, btn('✕', () => endLesson(), 'ln-b')), quiz,
    el('div', { class: 'ln-bar' }, btn('⏮', () => go(s.i - 1), 'ln-b'), playB, btn('⏭', () => go(s.i + 1), 'ln-b'), btn('🔁', () => go(s.i), 'ln-b'), el('div', { class: 'ln-ask' }, ask, btn('Preguntar', send, 'b on'))));
  await ready; if (L.session !== s) return; import('./guide.js').then(m => m.guideEvent && m.guideEvent('learn')).catch(() => {});
  // Adelanta la voz de los dos primeros pasos
  lesson.steps.slice(0, 2).forEach(st => tts(st.say)); run(s);
}
function status() { const s = L.session; const st = s && s.lesson.steps[s.i]; pushStatus(s ? { state: s.mode === 'answer' ? 'answer' : s.paused ? 'paused' : 'lesson', title: s.lesson.title, step: s.i + 1, total: s.lesson.steps.length, quiz: s.quiz ? { q: s.quiz.q, options: s.quiz.options } : null } : { state: 'idle' }); if (s) s.ui.stepLbl.textContent = s.lesson.steps.length ? `${s.i + 1} / ${s.lesson.steps.length}` : ''; }
async function run(s) {
  const gen = s.gen; status();
  while (L.session === s && s.gen === gen && s.i < s.lesson.steps.length) {
    if (s.paused) { await new Promise(r => setTimeout(r, 250)); continue; }
    const st = s.lesson.steps[s.i]; post({ type: 'board', board: st.board || {} }); if (!(st.scene && st.scene.camera)) post({ type: 'camera', cam: null }); status();
    const nx = s.lesson.steps[s.i + 1]; if (nx) tts(nx.say);
    const ok = await say(st.say, { gen, scene: st.scene }); if (L.session !== s || s.gen !== gen) return;
    if (st.check && (st.check.tap || (st.check.options && st.check.options.length))) { const right = await quizAsk(s, st.check); if (L.session !== s || s.gen !== gen) return;
      if (right !== null) { const sol = s.tapUsed ? st.check.tap : (st.check.options || [])[st.check.answer];
        const ex = (right ? '¡Exacto! ' : `No del todo: era ${s.tapUsed ? 'esta, ' : ''}«${sol}». `) + (st.check.explain || ''); await say(ex, { gen }); if (L.session !== s || s.gen !== gen) return; } }
    if (!ok && s.paused) continue; s.i++; await new Promise(r => setTimeout(r, 450));
  }
  if (L.session === s && s.gen === gen && !s.lesson.steps.length) { post({ type: 'board', board: { title: s.lesson.title || 'Pregúntame', bullets: ['Escribe tu pregunta abajo', 'o mándamela desde el móvil'] } }); s.i = 0; return; }
  if (L.session === s && s.gen === gen) { post({ type: 'board', board: { title: '¡Clase terminada!', bullets: ['Pregúntame lo que quieras', 'o repite cualquier paso con ⏮'] } }); s.i = s.lesson.steps.length - 1; status(); }
}
function quizAsk(s, q) { s.tapUsed = false; return (q.tap ? tapAsk(s, q) : Promise.resolve(undefined)).then(r => r !== undefined ? r : (q.options && q.options.length ? optAsk(s, q) : null)); }
function optAsk(s, q) { return new Promise(res => { s.quiz = q; status(); const box = s.ui.quiz; box.hidden = false; box.innerHTML = ''; box.classList.remove('tapq');
  box.append(el('b', {}, q.q), ...q.options.map((o, k) => btn(o, () => pick(k), 'ln-opt'))); s.quizPick = pick;
  function pick(k) { if (s.quiz !== q) return; s.quiz = null; s.quizPick = null; box.hidden = true; status(); res(k === q.answer); } }); }
// «Toca la pieza que…»: se responde tocando el modelo (en el móvil salen las piezas como botones). Si no hay modelo, se cae a la de opciones.
const nrm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ]/g, '');
function tapAsk(s, q) { return new Promise(res => {
  const to = setTimeout(() => { s.tapReady = null; res(undefined); }, 1500);
  s.tapReady = m => { clearTimeout(to); if (!m.ok) return res(undefined); s.tapUsed = true;
    const labels = [...new Set(m.labels || [])]; const opts = labels.filter(l => nrm(l) !== nrm(q.tap)).sort(() => Math.random() - 0.5).slice(0, 4).concat([labels.find(l => nrm(l) === nrm(q.tap)) || q.tap]).sort(() => Math.random() - 0.5);
    const qq = { q: q.q, options: opts, tap: q.tap }; s.quiz = qq; status(); const box = s.ui.quiz; box.hidden = false; box.innerHTML = ''; box.classList.add('tapq');
    box.append(el('b', {}, q.q), el('div', { class: 'ln-tap' }, '👆 Toca la pieza en el modelo'), btn('No lo sé', () => done(''), 'ln-opt'));
    const done = lab => { if (s.quiz !== qq) return; s.quiz = null; s.quizPick = null; s.tapPick = null; box.hidden = true; status(); const ok = !!lab && nrm(lab) === nrm(q.tap); post({ type: 'tapResult', ok, label: q.tap, picked: lab }); res(ok); };
    s.tapPick = done; s.quizPick = k => done(opts[k]); };
  post({ type: 'tapQuiz', label: q.tap }); }); }
function go(i) { const s = L.session; if (!s) return; s.i = Math.max(0, Math.min(s.lesson.steps.length - 1, i)); replayScene(s); s.paused = false; s.ui.playB.textContent = '⏸'; s.mode = 'lesson'; if (s.quiz) { s.quiz = null; s.ui.quiz.hidden = true; } s.tapPick = null; s.tapReady = null; stopTalk(); run(s); }
// Reconstruye el modelo 3D tal como estaría al empezar el paso i (los pasos pueden ir añadiendo piezas).
function replayScene(s) { post({ type: 'clearScene' }); let base = null, add = [], groups = {}, control = null;
  for (let k = 0; k < s.i; k++) { const sc = s.lesson.steps[k].scene; if (!sc) continue;
    if (sc.clear) { base = null; add = []; groups = {}; control = null; } if (sc.visual) { base = { visual: sc.visual }; add = []; groups = {}; control = null; } if (sc.items) { base = { items: sc.items }; add = []; groups = {}; control = null; }
    if (sc.add) add.push(...sc.add); if (sc.groups) Object.assign(groups, sc.groups); if (sc.control) control = sc.control; }
  if (base) post({ type: 'scene', scene: { ...base, add, groups, control, ...(base.items ? { rotate: true } : {}), instant: true } }); }
function togglePause(force) { const s = L.session; if (!s) return; s.paused = force != null ? force : !s.paused; s.ui.playB.textContent = s.paused ? '▶' : '⏸'; if (s.cur) s.paused ? s.cur.pause() : s.cur.resume(); status(); }
export function endLesson() { const s = L.session; if (!s) return; stopTalk(); L.session = null; s.ly.classList.remove('on'); s.ly.innerHTML = ''; document.body.classList.remove('learning'); pushStatus({ state: 'idle' }); }
export function lessonControl(cmd, arg) { const s = L.session; if (!s) return 'No hay ninguna clase en marcha.';
  if (cmd === 'pause') togglePause(true); else if (cmd === 'resume') { togglePause(false); if (s.mode === 'answer') go(s.i); } else if (cmd === 'next') go(s.i + 1); else if (cmd === 'prev') go(s.i - 1); else if (cmd === 'repeat') go(s.i); else if (cmd === 'stop') endLesson();
  else if (cmd === 'answer' && s.quizPick) s.quizPick(+arg); return 'Hecho.'; }

// Pregunta en directo: corta lo que esté diciendo, piensa con el material y contesta frase a frase según llega.
export async function answer(question, { doc } = {}) {
  let s = L.session; if (!s) { await startLesson({ title: 'Preguntas', steps: [] }, { doc }); s = L.session; }
  stopTalk(); const gen = s.gen; s.mode = 'answer'; status(); post({ type: 'pose', name: 'think' });
  const d = doc || s.doc; const st = s.lesson.steps[s.i];
  const prompt = `Eres el profesor de una clase en vídeo y te acaban de interrumpir con una pregunta. Contesta en español, hablando, en 2 a 5 frases claras (máximo 90 palabras), sin markdown ni listas ni emojis.
Si ayuda, antes de la respuesta puedes poner una línea «PIZARRA: título | punto 1 | punto 2» y/o una línea «ESCENA: {json}» con un visual 3D en una sola línea, por ejemplo {\"visual\":{\"kind\":\"process|compare|timeline|chart|map\",…datos…}} (process: \"steps\":[{\"label\",\"info\"}] · compare: \"items\":[{\"label\",\"value\",\"info\"}],\"unit\" · timeline: \"events\":[{\"label\",\"year\",\"info\"}] · chart: \"series\":[{\"label\",\"value\"}] · map: \"center\":{\"label\"},\"nodes\":[{\"label\",\"parent\"}]); cada elemento aparece cuando dices su etiqueta, así que nómbrala). Después, la respuesta hablada.
${s.lesson.title ? `Clase: «${s.lesson.title}»${st ? `, ahora en: ${(st.board && st.board.title) || ''} — ${st.say}` : ''}.` : ''}
${d ? `Material relevante de «${d.title}»:\n<<<\n${relevant(d.text, question + ' ' + ((st && st.say) || ''), 7000)}\n>>>\nSi el material no responde, dilo y contesta con conocimiento general.` : ''}
PREGUNTA: ${question}`;
  const q = []; let used = 0, board = false, full = ''; let speaking = null;
  const pump = async () => { while (q.length && L.session === s && s.gen === gen) { const t = q.shift(); const nxt = q[0]; if (nxt) tts(nxt); await say(t, { gen }); } speaking = null; };
  const feed = (text, final) => { full = text; let body = text;
    // Líneas de cabecera opcionales: PIZARRA: … y ESCENA: {…}
    while (!board) { const rest = text.slice(used); const m0 = rest.match(/^\s*(PIZARRA|ESCENA):/i); if (!m0) { if (rest.trim().length > 9 || final) board = true; else return; break; }
      const nl = rest.indexOf('\n'); if (nl < 0 && !final) return; const line = (nl < 0 ? rest : rest.slice(0, nl)); used += nl < 0 ? rest.length : nl + 1;
      if (/^\s*PIZARRA:/i.test(line)) { const [title, ...bul] = line.replace(/^\s*PIZARRA:\s*/i, '').split('|').map(x => x.trim()).filter(Boolean); post({ type: 'board', board: { title, bullets: bul } }); }
      else { try { const j = JSON.parse(line.replace(/^\s*ESCENA:\s*/i, '').trim()); post({ type: 'scene', scene: j }); } catch (e) {} } }
    body = text.slice(used); const re = /[^.!?…]+[.!?…]+["»)]?(\s|$)/g; let m, last = 0; while ((m = re.exec(body))) { const sen = m[0].trim(); if (sen.length > 1) { q.push(sen); tts(sen); } last = re.lastIndex; }
    if (final && body.slice(last).trim()) { q.push(body.slice(last).trim()); last = body.length; } used += last; if (q.length && !speaking) speaking = pump(); };
  try { const t = await llmStream(prompt, { onText: x => { if (L.session === s && s.gen === gen) feed(x, false); } }); if (L.session === s && s.gen === gen) feed(t, true); }
  catch (e) { if (L.session === s) { q.push('Perdona, no he podido pensar la respuesta: ' + e.message); if (!speaking) speaking = pump(); } }
  while (speaking) await speaking; if (L.session === s && s.gen === gen) { post({ type: 'pose', name: 'idle' }); s.mode = 'lesson'; s.paused = true; s.ui.playB.textContent = '▶'; status(); }
  return full.replace(/^\s*(PIZARRA|ESCENA):.*\n?/gim, '').trim();
}

/* ---------- Estado para el móvil ---------- */
let lastStatus = ''; function pushStatus(st) { const b = localBase(); if (!b) return; const j = JSON.stringify(st); if (j === lastStatus) return; lastStatus = j; fetch(b + '/api/outbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: st }) }).catch(() => {}); }

/* ---------- Pantalla ---------- */
export async function explain({ docId, topic, focus, level } = {}) {
  const doc = docId ? await db.get('projects', docId) : null; if (docId && !doc) throw new Error('No encuentro ese documento');
  location.hash = '#learn'; const t = toast(`🎓 Preparando la clase${doc ? ' de «' + doc.title + '»' : ''}…`, 60000);
  try { const lesson = await makeLesson({ doc, topic: topic || (doc && doc.title), focus, level }); hideToast(); startLesson(lesson, { doc }).catch(e => toast('⚠️ ' + e.message, 6000)); return lesson; }
  catch (e) { hideToast(); throw e; }
}
export async function renderLearn(r) {
  r.innerHTML = ''; await detectLocal(); const s = getSettings(); s.learn = s.learn || {};
  const topic = el('textarea', { class: 'txt', rows: 2, placeholder: '¿Qué quieres aprender? «cómo funciona un motor eléctrico», «la Revolución francesa en 10 minutos», «derivadas desde cero»…' });
  const focus = el('input', { class: 'txt', placeholder: 'Opcional: en qué centrarse o para qué lo necesitas' });
  const file = el('input', { type: 'file', accept: '.pdf,.txt,.md,.html,application/pdf,text/*', hidden: true });
  const busy = (b, t) => { b.disabled = !!t; if (t) { b.dataset.l = b.dataset.l || b.textContent; b.textContent = '⏳ ' + t; } else if (b.dataset.l) b.textContent = b.dataset.l; };
  const go = async (b) => { unlockAudio(); const t = topic.value.trim(); if (!t) { toast('Escribe un tema o sube un documento'); return; } busy(b, 'Preparando la clase…'); try { await explain({ topic: t, focus: focus.value.trim() }); } catch (e) { toast('⚠️ ' + e.message, 6000); } busy(b); };
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; const t = toast('📄 Leyendo ' + f.name + '…', 60000); try { const d = await addDoc(f, f.name); hideToast(); toast(`📄 «${d.title}» listo (${d.pages} pág.)`); renderLearn(r); } catch (e) { hideToast(); toast('⚠️ ' + e.message, 6000); } file.value = ''; });
  const eng = engine(); const vnote = { kokoro: 'Voz del aparato (gratis, sin internet)', edge: 'Voz de Edge (gratis, en línea)', browser: 'Voz del navegador' }[eng];
  r.append(el('section', { class: 'card ln-hero' }, el('div', { class: 'badge prem' }, 'APRENDER'), el('h2', {}, '🎓 Tu profe para cualquier tema'),
    el('p', { class: 'note' }, 'Te da la clase en la tele con pizarra y voz, a partir de tus documentos o de lo que le pidas. Puedes interrumpirle con preguntas en cualquier momento.'),
    topic, focus, el('div', { class: 'lbl' }, 'Nivel'), seg(LEVELS, () => lvl(), v => { s.learn.level = v; saveSettings(s); }),
    el('div', { class: 'row-btns' }, btn('🎓 Explícamelo', e => go(e.currentTarget), 'b hot'), btn('📄 Subir PDF o documento', () => file.click(), 'b on'), btn('📝 Pegar texto', () => pasteText(r), 'mini-b')), file,
    el('p', { class: 'note' }, `🗣 ${vnote}.${eng === 'browser' && !host.claude ? ' Con Plató abierto como aplicación y las voces instaladas suena mucho mejor.' : ''}`)));
  const docs = await docsList();
  const lib = el('div', { class: 'ln-lib' }); for (const d of docs) lib.append(el('div', { class: 'ln-doc' }, el('i', {}, d.source === 'movil' ? '📱' : d.source === 'texto' ? '📝' : '📄'), el('div', {}, el('b', {}, d.title), el('small', {}, `${d.pages > 1 ? d.pages + ' páginas · ' : ''}${Math.round(d.chars / 1000)}k caracteres`)),
    btn('🎓 Clase', async e => { unlockAudio(); const b = e.currentTarget; busy(b, 'Preparando…'); try { await explain({ docId: d.id, focus: focus.value.trim() }); } catch (er) { toast('⚠️ ' + er.message, 6000); } busy(b); }, 'b on'),
    btn('❓', () => askDoc(d), 'mini-b'),
    btn('🗑', async () => { await db.del('projects', d.id); renderLearn(r); }, 'mini-b')));
  r.append(el('h3', { class: 'sec' }, 'Tus documentos'), docs.length ? lib : el('div', { class: 'empty' }, 'Sube un PDF o mándalo desde el móvil y te lo explico.'));
  r.append(await phoneCard());
}
function askDoc(d) { const q = el('input', { class: 'txt', placeholder: '¿Qué quieres saber de «' + d.title + '»?', enterkeyhint: 'send' });
  import('./core.js').then(({ modal }) => { const close = modal('❓ Pregunta sobre el documento', el('div', {}, q, el('div', { class: 'row-btns' }, btn('Preguntar', go, 'b hot'))));
    async function go() { const t = q.value.trim(); if (!t) return; close(); await startLesson({ title: d.title, steps: [] }, { doc: d }); answer(t, { doc: d }); } q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); setTimeout(() => q.focus(), 50); }); }
function pasteText(r) { const ta = el('textarea', { class: 'txt', rows: 10, placeholder: 'Pega aquí apuntes, un artículo, un capítulo…' }); const ti = el('input', { class: 'txt', placeholder: 'Título' });
  import('./core.js').then(({ modal }) => { const close = modal('📝 Pegar texto', el('div', {}, ti, el('div', { class: 'gap' }), ta, el('div', { class: 'row-btns' }, btn('Guardar', async () => { if (ta.value.trim().length < 30) { toast('Pega algo más de texto'); return; } await addTextDoc(ta.value.trim(), ti.value.trim() || 'Notas'); close(); renderLearn(r); }, 'b hot')))); }); }
export async function phoneCard() {
  const box = el('section', { class: 'card ln-phone' }, el('h3', {}, '📱 Habla con Plató desde el móvil'));
  const b = localBase(); const c = localCaps();
  if (!b || !c || !c.pair) { box.append(el('p', { class: 'note' }, host.claude ? 'Necesita Plató en tu ordenador: el móvil se conecta al aparato por tu wifi.' : 'Abre Plató como aplicación (Plato.cmd / ./plato.sh) y aquí aparecerá un QR: con el móvil podrás chatear con el aparato, mandarle PDFs y pedirle cosas.')); return box; }
  let lan = null; try { lan = await (await fetch(b + '/lan', { cache: 'no-store' })).json(); } catch (e) {}
  if (!lan || !lan.lan || !lan.ips || !lan.ips.length) { box.append(el('p', { class: 'note' }, 'Plató no está abierto a tu wifi. Ábrelo con Plato.cmd / ./plato.sh (modo aplicación) para conectar el móvil.')); return box; }
  const url = `http://${lan.ips[0]}:${lan.port}/movil.html#k=${c.pair}`; const q = el('div', { class: 'g-qr' }); q.innerHTML = qrSVG(url, { border: 2 });
  box.append(el('div', { class: 'ln-pair' }, q, el('div', {}, el('p', {}, 'Escanéalo con la cámara del móvil (misma wifi). Tendrás un chat con el aparato: mándale PDFs, pregúntale, pídele que te explique algo, que cree un juego o que prepare un capítulo.'),
    el('p', { class: 'note' }, 'Añádelo a la pantalla de inicio del móvil para tenerlo como una app. El enlace incluye un código: no lo compartas.'), el('code', { class: 'ln-url' }, url),
    btn('🔄 Cambiar código', async () => { await fetch(b + '/api/pair', { method: 'POST' }); await detectLocal(true); const p = box.parentElement; const n = await phoneCard(); box.replaceWith(n); }, 'mini-b'))));
  return box;
}
