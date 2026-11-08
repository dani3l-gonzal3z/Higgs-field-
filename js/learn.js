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
Devuelve SOLO un JSON con esta forma:
{"title":"título corto","summary":"una frase","steps":[{"say":"lo que dices en voz alta","board":{"title":"...","bullets":["..."],"formula":"","note":""},"check":null}]}
Reglas:
- Entre 6 y 10 pasos. Empieza enganchando con por qué importa. Un concepto por paso, con ejemplos concretos. Termina con un resumen.
- "say": 2 a 4 frases habladas y naturales, sin markdown, sin emojis, sin listas; no leas la pizarra literalmente.
- "board": lo que escribirías: título corto, hasta 5 viñetas de menos de 9 palabras, "formula" para números, ecuaciones o reglas clave (o vacío), "note" opcional.
- Cada 2 o 3 pasos pon en "check" una pregunta de repaso: {"q":"...","options":["...","...","..."],"answer":0,"explain":"por qué, en una frase"}. En el resto, "check": null.
- Si el material no basta, dilo en el primer paso y completa con conocimiento general fiable, sin inventar datos del documento.`;
  const j = await llmJSON(prompt, { maxTokens: 6000 }); if (!j || !Array.isArray(j.steps) || !j.steps.length) throw new Error('La clase no ha salido bien; prueba otra vez');
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
let spokenWait = new Map(); addEventListener('message', e => { const m = e.data || {}; if (m.type === 'spoken' && spokenWait.has(m.id)) { spokenWait.get(m.id)(m.ok); spokenWait.delete(m.id); } if (m.type === 'learn-ready' && L.session && L.session.readyRes) L.session.readyRes(); });
async function say(text, { gen } = {}) { const s = L.session; if (!s || !text) return false; const a = await tts(text); if (!L.session || s.gen !== gen) return false;
  const id = uid(); const done = new Promise(r => spokenWait.set(id, r)); post({ type: 'speak', id, text, audio: a && a.blob, words: a && a.words, lang: 'es', rate: 1 }); return await done; }
function stopTalk() { const s = L.session; if (!s) return; s.gen++; post({ type: 'stop' }); for (const [, r] of spokenWait) r(false); spokenWait.clear(); }

export async function startLesson(lesson, { doc } = {}) {
  endLesson(); if (location.hash !== '#learn') location.hash = '#learn'; const ly = layer(); ly.innerHTML = ''; ly.classList.add('on'); document.body.classList.add('learning');
  const frame = el('iframe', { class: 'ln-frame', src: 'learn.html', allow: 'autoplay' });
  const s = L.session = { lesson, doc, i: 0, gen: 0, paused: false, frame, ly, readyRes: null, mode: 'lesson', quiz: null };
  const ready = new Promise(r => { s.readyRes = r; setTimeout(r, 15000); });
  const stepLbl = el('span', { class: 'ln-step' }); const playB = btn('⏸', () => togglePause(), 'ln-b');
  const ask = el('input', { class: 'txt', placeholder: 'Pregúntale lo que quieras… (te corta y te contesta)', enterkeyhint: 'send' });
  const send = () => { const q = ask.value.trim(); if (!q) return; ask.value = ''; answer(q); }; ask.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
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
    const st = s.lesson.steps[s.i]; post({ type: 'board', board: st.board || {} }); status();
    const nx = s.lesson.steps[s.i + 1]; if (nx) tts(nx.say);
    const ok = await say(st.say, { gen }); if (L.session !== s || s.gen !== gen) return;
    if (st.check && st.check.options) { const right = await quizAsk(s, st.check); if (L.session !== s || s.gen !== gen) return;
      const ex = (right ? '¡Exacto! ' : `No del todo: era «${st.check.options[st.check.answer]}». `) + (st.check.explain || ''); await say(ex, { gen }); if (L.session !== s || s.gen !== gen) return; }
    if (!ok && s.paused) continue; s.i++; await new Promise(r => setTimeout(r, 450));
  }
  if (L.session === s && s.gen === gen && !s.lesson.steps.length) { post({ type: 'board', board: { title: s.lesson.title || 'Pregúntame', bullets: ['Escribe tu pregunta abajo', 'o mándamela desde el móvil'] } }); s.i = 0; return; }
  if (L.session === s && s.gen === gen) { post({ type: 'board', board: { title: '¡Clase terminada!', bullets: ['Pregúntame lo que quieras', 'o repite cualquier paso con ⏮'] } }); s.i = s.lesson.steps.length - 1; status(); }
}
function quizAsk(s, q) { return new Promise(res => { s.quiz = q; status(); const box = s.ui.quiz; box.hidden = false; box.innerHTML = '';
  box.append(el('b', {}, q.q), ...q.options.map((o, k) => btn(o, () => pick(k), 'ln-opt'))); s.quizPick = pick;
  function pick(k) { if (s.quiz !== q) return; s.quiz = null; s.quizPick = null; box.hidden = true; status(); res(k === q.answer); } }); }
function go(i) { const s = L.session; if (!s) return; s.i = Math.max(0, Math.min(s.lesson.steps.length - 1, i)); s.paused = false; s.ui.playB.textContent = '⏸'; s.mode = 'lesson'; if (s.quiz) { s.quiz = null; s.ui.quiz.hidden = true; } stopTalk(); run(s); }
function togglePause(force) { const s = L.session; if (!s) return; s.paused = force != null ? force : !s.paused; s.ui.playB.textContent = s.paused ? '▶' : '⏸'; post({ type: s.paused ? 'pause' : 'resume' }); status(); }
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
Si ayuda, la PRIMERA línea puede ser «PIZARRA: título | punto 1 | punto 2» con lo que escribirías en la pizarra; después la respuesta hablada.
${s.lesson.title ? `Clase: «${s.lesson.title}»${st ? `, ahora en: ${(st.board && st.board.title) || ''} — ${st.say}` : ''}.` : ''}
${d ? `Material relevante de «${d.title}»:\n<<<\n${relevant(d.text, question + ' ' + ((st && st.say) || ''), 7000)}\n>>>\nSi el material no responde, dilo y contesta con conocimiento general.` : ''}
PREGUNTA: ${question}`;
  const q = []; let used = 0, board = false, full = ''; let speaking = null;
  const pump = async () => { while (q.length && L.session === s && s.gen === gen) { const t = q.shift(); const nxt = q[0]; if (nxt) tts(nxt); await say(t, { gen }); } speaking = null; };
  const feed = (text, final) => { full = text; let body = text;
    if (!board) { const nl = text.indexOf('\n'); if (/^\s*PIZARRA:/i.test(text)) { if (nl < 0 && !final) return; const line = (nl < 0 ? text : text.slice(0, nl)).replace(/^\s*PIZARRA:\s*/i, ''); const [title, ...bul] = line.split('|').map(x => x.trim()).filter(Boolean); post({ type: 'board', board: { title, bullets: bul } }); board = true; used = nl < 0 ? text.length : nl + 1; } else if (text.trim().length > 9 || final) board = true; }
    body = text.slice(used); const re = /[^.!?…]+[.!?…]+["»)]?(\s|$)/g; let m, last = 0; while ((m = re.exec(body))) { const sen = m[0].trim(); if (sen.length > 1) { q.push(sen); tts(sen); } last = re.lastIndex; }
    if (final && body.slice(last).trim()) { q.push(body.slice(last).trim()); last = body.length; } used += last; if (q.length && !speaking) speaking = pump(); };
  try { const t = await llmStream(prompt, { onText: x => { if (L.session === s && s.gen === gen) feed(x, false); } }); if (L.session === s && s.gen === gen) feed(t, true); }
  catch (e) { if (L.session === s) { q.push('Perdona, no he podido pensar la respuesta: ' + e.message); if (!speaking) speaking = pump(); } }
  while (speaking) await speaking; if (L.session === s && s.gen === gen) { post({ type: 'pose', name: 'idle' }); s.mode = 'lesson'; s.paused = true; s.ui.playB.textContent = '▶'; status(); }
  return full.replace(/^\s*PIZARRA:.*\n?/i, '').trim();
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
  const go = async (b) => { const t = topic.value.trim(); if (!t) { toast('Escribe un tema o sube un documento'); return; } busy(b, 'Preparando la clase…'); try { await explain({ topic: t, focus: focus.value.trim() }); } catch (e) { toast('⚠️ ' + e.message, 6000); } busy(b); };
  file.addEventListener('change', async () => { const f = file.files[0]; if (!f) return; const t = toast('📄 Leyendo ' + f.name + '…', 60000); try { const d = await addDoc(f, f.name); hideToast(); toast(`📄 «${d.title}» listo (${d.pages} pág.)`); renderLearn(r); } catch (e) { hideToast(); toast('⚠️ ' + e.message, 6000); } file.value = ''; });
  const eng = engine(); const vnote = { kokoro: 'Voz del aparato (gratis, sin internet)', edge: 'Voz de Edge (gratis, en línea)', browser: 'Voz del navegador' }[eng];
  r.append(el('section', { class: 'card ln-hero' }, el('div', { class: 'badge prem' }, 'APRENDER'), el('h2', {}, '🎓 Tu profe para cualquier tema'),
    el('p', { class: 'note' }, 'Te da la clase en la tele con pizarra y voz, a partir de tus documentos o de lo que le pidas. Puedes interrumpirle con preguntas en cualquier momento.'),
    topic, focus, el('div', { class: 'lbl' }, 'Nivel'), seg(LEVELS, () => lvl(), v => { s.learn.level = v; saveSettings(s); }),
    el('div', { class: 'row-btns' }, btn('🎓 Explícamelo', e => go(e.currentTarget), 'b hot'), btn('📄 Subir PDF o documento', () => file.click(), 'b on'), btn('📝 Pegar texto', () => pasteText(r), 'mini-b')), file,
    el('p', { class: 'note' }, `🗣 ${vnote}.${eng === 'browser' && !host.claude ? ' Con Plató abierto como aplicación y las voces instaladas suena mucho mejor.' : ''}`)));
  const docs = await docsList();
  const lib = el('div', { class: 'ln-lib' }); for (const d of docs) lib.append(el('div', { class: 'ln-doc' }, el('i', {}, d.source === 'movil' ? '📱' : d.source === 'texto' ? '📝' : '📄'), el('div', {}, el('b', {}, d.title), el('small', {}, `${d.pages > 1 ? d.pages + ' páginas · ' : ''}${Math.round(d.chars / 1000)}k caracteres`)),
    btn('🎓 Clase', async e => { const b = e.currentTarget; busy(b, 'Preparando…'); try { await explain({ docId: d.id, focus: focus.value.trim() }); } catch (er) { toast('⚠️ ' + er.message, 6000); } busy(b); }, 'b on'),
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
