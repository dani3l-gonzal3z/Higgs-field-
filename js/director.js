// 🧠 Director IA: de una idea, un capítulo o un libro → guion técnico → previz rodada sola → vídeo final + voces + sonido + música → montaje.
import { $, el, btn, toast, modal, confirmBox, seg, toggle, uid, db, emit, bus, getSettings, money, blobURL, vib, mediaKind, videoMeta, fmtTime, download } from './core.js';
import { STYLES } from './catalog.js';
import { catalog, loadExtraCatalog, readiness, buildInput, estimate, PROVIDERS } from './providers.js';
import { registry } from './registry.js';
import { runJob } from './runner.js';
import { llmJSON, llmText, llmReady } from './llm.js';
import { readBook } from './book.js';
import { host } from './core.js';

const COLORS = ['rojo', 'azul', 'verde', 'amarillo', 'naranja', 'morado', 'rosa', 'blanco', 'negro', 'gris', 'marron', 'granate', 'beige'];
const LAYOUT = 'studio: plató vacío. city: calles de 12 m a lo largo de z en x=0,±48,±96 y a lo largo de x en z=0,±48,±96; cruce en (0,0) con pasos de cebra en z=±8; carriles a x=±3; aceras a ±7; edificios a partir de 6.5 m del eje; parque en (24,-24). highway: autopista a lo largo de z entre x=-11 y 11, mediana en x=0, carriles x=±3 y ±8. desert: abierto, rocas a partir de 14 m del centro. forest: camino de tierra en x=0 a lo largo de z, árboles desde |x|>4.5. grid: espacio abstracto vacío.';
const DSL = `Comandos del plató (JSON). Posiciones en metros (x,z), heading en grados (0 = mira a +z, 90 = +x):
{"op":"add","kind":K,"name":"...","color":"rojo|azul|…","x":0,"z":0,"heading":0,"outfit":O}  K: person, child, car, sport, police, van, truck, bus, box, barrel, cone, ball, wall, ramp, platform, building, house, tree, lamp, column, bench, container, table, chair, stool, sofa, shelf, workbench, bed, tv, desk, door, window, fridge, counter, plant, rug, shutter, console, tires, toolcart, hanglamp, floorlamp, screen, board, crate, machine, pod
O (vestuario de personas): scientist, teen, detective, hero, astronaut, knight, king, robot, alien, cowboy, ninja, pirate, wizard, chef, doctor, cop, soldier, zombie, executive, grandma, grandpa, girl, boy, athlete
{"op":"set","name":"garage|living|kitchen|office|bar|classroom|bedroom|bridge|alley|warehouse|western|interview"} monta un decorado completo de stock centrado en (0,0) (usa place "studio" para interiores; western va en desert). Coloca a los personajes dentro: garage 10x8 m, living 9x7, kitchen 8x7, office 12x9, bar 10x8, classroom 10x9, bedroom 7x6, bridge 12x10, warehouse 24x18; el lado abierto de los interiores es +z.
{"op":"act","target":N,"action":A,"duration":s} A: idle, wave, point, jump, punch, kick, push, throw, fall, stumble, getup, sit, sitground, crouch, kneel, lie, dance, cheer, clap, talk, phone, lookaround, guard, handsup, bow
{"op":"goto","target":N,"to":N|{"x":0,"z":0},"mode":"walk|run|sneak|crawl"}  (vehículos: "speed":kmh, "ram":true para embestir)
{"op":"follow","target":N,"who":N,"mode":"run"} {"op":"flee","target":N,"from":N} {"op":"look","target":N,"at":N} {"op":"headlook","target":N,"at":N|"camera"}
{"op":"drive","target":N,"style":"straight|circle|drift|reverse|turn","speed":kmh,"dir":"left|right"} {"op":"brake","target":N} {"op":"enter","target":persona,"car":coche,"instant":true} {"op":"exit","target":persona}
{"op":"fx","type":"explosion|fire|smoke|sparks|dust","at":N|{"x":0,"z":0}} {"op":"lights","target":N,"on":true} {"op":"siren","target":N,"on":true} {"op":"time","scale":0.3}
Cualquier comando admite "delay": segundos desde el inicio de la escena. Los de una misma entidad se encadenan.`;

const P = { proj: null, list: [], busy: false, shooting: null };
let root = null;
const blank = () => ({ id: 'dir-' + uid(), kind: 'director', t: Date.now(), src: 'idea', idea: '', book: null, chapter: null, opts: { dur: 60, style: 'cine', aspect: '16:9', lang: 'es', coverage: 'cine', depth: true, videoModel: null, voiceModel: 'elevenlabs-tts-turbo-2-5', sfx: true, music: true }, plan: null });
async function loadProjects() { P.list = (await db.all('projects')).filter(p => p.kind === 'director').sort((a, b) => b.t - a.t); }
async function save() { if (P.proj) { P.proj.t = Date.now(); await db.put('projects', P.proj); } }
const shots = () => P.proj && P.proj.plan ? P.proj.plan.scenes.flatMap(sc => sc.shots.map(sh => ({ sc, sh }))) : [];

export async function renderDirector(r) {
  root = r; r.innerHTML = ''; await loadProjects(); await loadExtraCatalog();
  if (!P.proj) P.proj = P.list[0] || blank();
  const pr = P.proj;
  if (!llmReady()) r.append(el('section', { class: 'card hero' }, el('div', { class: 'badge prem' }, 'NECESITA IA'), el('h2', {}, 'El Director necesita un cerebro'), el('p', { class: 'note' }, 'Planifica con la IA de Claude cuando abres la app dentro de Claude, o con tu clave de Anthropic u OpenRouter (Ajustes → Asistente de IA).'), el('a', { class: 'b on', href: '#settings' }, 'Ir a Ajustes')));
  r.append(el('div', { class: 'dirtop' }, el('select', { class: 'txt', on: { change: e => { P.proj = P.list.find(x => x.id === e.target.value) || blank(); renderDirector(r); } } }, (P.list.some(x => x.id === pr.id) ? P.list : [pr, ...P.list]).map(x => el('option', { value: x.id, selected: x.id === pr.id }, (x.plan && x.plan.title) || (x.book && x.book.title) || 'Proyecto nuevo'))),
    btn('➕ Nuevo', () => { P.proj = blank(); renderDirector(r); }, 'mini-b'), pr.plan ? btn('🗑', async () => { if (await confirmBox('Borrar proyecto', '¿Borrar este proyecto del Director?', 'Borrar')) { await db.del('projects', pr.id); P.proj = null; renderDirector(r); } }, 'mini-b red') : null));
  if (!pr.plan) { r.append(sourceCard(pr), optsCard(pr), el('div', { class: 'gofoot' }, el('div', { class: 'cost' }, el('b', {}, 'Planificar'), el('small', {}, 'La IA escribe el guion técnico: escenas, planos con cobertura, diálogos y sonido.')), btn(P.busy ? '⏳ Pensando…' : '🧠 Planificar', plan, 'go' + (P.busy ? ' dis' : '')))); return; }
  r.append(planHeader(pr), prodBar(pr)); for (const sc of pr.plan.scenes) r.append(sceneCard(sc));
  r.append(el('div', { class: 'row-btns' }, btn('↺ Volver a planificar', async () => { if (await confirmBox('Volver a planificar', 'Se descartará el guion técnico actual (no lo generado en la galería).', 'Replanificar')) { pr.plan = null; await save(); renderDirector(r); } }, 'mini-b'), btn('🧩 Ajustes de producción', () => modal('Ajustes de producción', optsCard(pr, true), { wide: true }), 'mini-b')));
}
function sourceCard(pr) {
  const c = el('section', { class: 'card' }, el('h3', {}, '¿Qué rodamos?'), seg([['idea', '💡 Idea o capítulo'], ['book', '📚 Libro']], () => pr.src, v => { pr.src = v; renderDirector(root); }));
  if (pr.src === 'idea') { const ta = el('textarea', { class: 'txt', rows: 8, placeholder: 'Escribe la idea o pega el capítulo entero. Ej.: «Capítulo 1: Lucía llega de noche a un pueblo bajo la lluvia, un coche la sigue, se esconde en un callejón y se enfrenta al conductor…»' }); ta.value = pr.idea; ta.addEventListener('input', () => { pr.idea = ta.value; }); ta.addEventListener('change', save); c.append(el('div', { class: 'gap' }), ta); return c; }
  const file = el('input', { type: 'file', accept: '.epub,.pdf,.txt,.md', hidden: true, on: { change: async e => { const f = e.target.files[0]; if (!f) return; toast('📚 Leyendo ' + f.name + '…', 20000); try { const b = await readBook(f, p => toast(`📚 Leyendo PDF… ${Math.round(p * 100)} %`, 20000)); pr.book = b; pr.chapter = 0; await save(); toast(`📚 ${b.title}: ${b.chapters.length} capítulos`); renderDirector(root); } catch (err) { toast('No he podido leer el libro: ' + err.message, 5000); } } } });
  c.append(el('div', { class: 'gap' }), file, btn(pr.book ? '📚 Cambiar libro' : '📚 Subir libro (EPUB, PDF o TXT)', () => file.click(), 'b on'));
  if (pr.book) { const b = pr.book; c.append(el('div', { class: 'lbl' }, `${b.title} · ${b.chapters.length} capítulos`));
    const list = el('div', { class: 'chlist' }); b.chapters.forEach((ch, i) => list.append(el('button', { type: 'button', class: 'chrow' + (pr.chapter === i ? ' on' : ''), on: { click: () => { pr.chapter = i; save(); renderDirector(root); } } }, el('b', {}, `${ch.n}. ${ch.title}`), el('small', {}, `${ch.words.toLocaleString('es-ES')} palabras · ${ch.text.slice(0, 110).replace(/\s+/g, ' ')}…`))));
    c.append(list, el('div', { class: 'row-btns' }, btn('👤 Extraer personajes del libro', () => bookCast(pr), 'mini-b')), el('p', { class: 'note' }, 'Elige un capítulo y pulsa Planificar: la IA lo adapta como guion de cine (no lo lee en voz alta). Si es largo, primero lo resume por partes.')); }
  return c;
}
function optsCard(pr, inModal) {
  const o = pr.opts; const vms = catalog().filter(m => (m.mode === 'v2v' || m.mode === 'i2v') && readiness(m).ok);
  if (!o.videoModel && vms.length) o.videoModel = (vms.find(m => m.mode === 'v2v') || vms[0]).id;
  const c = el('section', { class: 'card' }, el('h3', {}, 'Producción'),
    el('div', { class: 'lbl' }, 'Duración aproximada'), seg([[30, '30 s'], [60, '1 min'], [120, '2 min'], [300, '5 min']], () => o.dur, v => { o.dur = v; save(); }),
    el('div', { class: 'lbl' }, 'Cobertura'), seg([['basic', 'Básica (1-2 planos/escena)'], ['cine', 'Cine (3-5 planos, contraplanos)']], () => o.coverage, v => { o.coverage = v; save(); }),
    el('div', { class: 'lbl' }, 'Estilo visual'), el('div', { class: 'chips' }, STYLES.map(([k, l]) => btn(l, () => { o.style = k; save(); (inModal ? null : renderDirector(root)); }, 'chip' + (o.style === k ? ' on' : '')))),
    el('div', { class: 'lbl' }, 'Formato'), seg([['16:9', '16:9'], ['9:16', '9:16'], ['2.39:1', '2.39'], ['1:1', '1:1']], () => o.aspect, v => { o.aspect = v; save(); }),
    el('div', { class: 'lbl' }, 'Idioma de los diálogos'), seg([['es', 'Español'], ['en', 'English']], () => o.lang, v => { o.lang = v; save(); }),
    el('div', { class: 'lbl' }, 'Modelo de vídeo final'), vms.length ? el('select', { class: 'txt', on: { change: e => { o.videoModel = e.target.value; save(); } } }, vms.map(m => el('option', { value: m.id, selected: m.id === o.videoModel }, `${m.mode === 'v2v' ? '🎬 Desde la previz' : '🖼 Desde el fotograma'} · ${m.name} (${PROVIDERS[m.provider].name}${m.price ? ` · $${m.price.usd}/s` : ''})`))) : el('div', { class: 'note' }, host.claude ? 'Dentro de Claude no se genera: aquí puedes planificar, rodar la previz y montar el animatic.' : 'Añade una clave (fal.ai o Muapi) en Ajustes para generar el vídeo final.'),
    el('div', { class: 'grid2' }, toggle('🔊 Efectos de sonido (MMAudio)', () => o.sfx, v => { o.sfx = v; save(); }), toggle('🎵 Música por escena', () => o.music, v => { o.music = v; save(); }), toggle('🌗 Grabar profundidad', () => o.depth, v => { o.depth = v; save(); })),
    el('p', { class: 'note' }, 'Voces, efectos y música usan Muapi (ElevenLabs, MMAudio, Lyria). Sin clave de Muapi el capítulo se monta sin audio generado.'));
  return c;
}
async function chapterSource(pr) {
  const ch = pr.book.chapters[pr.chapter || 0]; let text = ch.text;
  if (text.length > 24000) { const parts = []; for (let i = 0; i < text.length; i += 12000) parts.push(text.slice(i, i + 12000)); const sums = [];
    for (let i = 0; i < parts.length; i++) { toast(`📚 Resumiendo parte ${i + 1}/${parts.length}…`, 60000); sums.push(await llmText(`Resume para adaptarlo al cine este fragmento de una novela. Conserva los acontecimientos en orden, los personajes con su aspecto, los lugares, la hora y el clima, y las frases de diálogo más importantes (literales). Máximo 500 palabras.\n\nFRAGMENTO:\n${parts[i]}`)); }
    text = sums.join('\n\n'); }
  return `Libro: «${pr.book.title}». ${ch.title}.\n\n${text}`;
}
async function plan() { if (P.busy) return; P.busy = true; renderDirector(root); try { await planCore(P.proj); } catch (e) { toast('No se pudo planificar: ' + e.message, 6000); } P.busy = false; renderDirector(root); }
async function planCore(pr) {
  P.proj = pr; if (!llmReady()) throw new Error('Configura la IA en Ajustes (o escribe tú el plan)');
  let src = pr.src === 'book' ? (pr.book ? null : '') : (pr.idea || '').trim(); if (pr.src === 'book' && !pr.book) throw new Error('Sube un libro primero'); if (pr.src === 'idea' && !src) throw new Error('Escribe la idea o el capítulo');
  {
    if (pr.src === 'book') src = await chapterSource(pr);
    const chars = (await db.all('chars')).map(c => ({ name: c.name, desc: c.desc })); const o = pr.opts; const st = STYLES.find(s => s[0] === o.style);
    toast('🧠 Escribiendo el guion técnico…', 90000);
    const plan = await llmJSON(`Eres director de cine y ayudante de dirección. Adapta el material a un cortometraje para rodar en un plató 3D de previsualización (maniquíes y formas simples) y después generar el vídeo final con IA de vídeo, plano a plano.
Devuelve SOLO JSON válido con esta forma:
{"title":"","logline":"(español)","style":"(inglés, look visual)","characters":[{"name":"nombre corto","kind":"person|child","color":"${COLORS.join('|')}","desc":"(inglés) descripción visual concreta para la IA: edad, complexión, pelo, ropa","voice":"female|male|child + tono"}],
"scenes":[{"id":"S1","heading":"EXT. LUGAR - NOCHE","summary":"(español, 1-2 frases)","place":"studio|city|highway|desert|forest|grid","time":0-24,"weather":"clear|fog|rain|storm|snow","music":"(inglés) prompt de música o vacío",
 "setup":[comandos add que colocan personajes, vehículos y atrezo con x,z,heading explícitos],
 "action":[comandos con "delay" que coreografían TODA la escena (8-30 s)],
 "shots":[{"id":"S1-1","from":segundos dentro de la acción,"duration":3-8,"subject":"nombre","size":"general|conjunto|medio|primer|detalle","angle":"front|tq|side|back|high|low","camera":{"mode":"tripod|follow|front|side|orbit|crane|drone|low|top|pov","lens":18-100,"shake":0-0.6},"description":"(inglés) descripción visual concreta de este plano para la IA de vídeo: quién, con qué ropa, qué hace, dónde, luz y ambiente","dialogue":[{"who":"nombre","line":"(${o.lang === 'es' ? 'español' : 'inglés'})"}],"sfx":"(inglés) efectos de sonido del plano"}]}]}
${DSL}
TRAZADO DE LOS ESCENARIOS: ${LAYOUT}
REGLAS:
- Duración total aproximada: ${o.dur} s. Cobertura ${o.coverage === 'cine' ? 'de cine: cada escena con plano general de situación, planos medios, primeros planos y contraplanos en los diálogos o la acción clave (3-5 planos)' : 'básica: 1-2 planos por escena'}.
- Los planos de una escena reutilizan la misma acción (setup + action) con distintas ventanas "from"/"duration" y cámaras. Que "from"+"duration" quede dentro de la acción.
- Personajes a 1-3 m cuando interactúan; para golpes, a 1-1,3 m y mirándose. Usa solo los tipos y acciones disponibles; aproxima lo que no exista.
- Coherencia: mismos nombres en setup, action, shots y dialogue. La descripción visual de cada personaje debe repetirse igual en cada plano donde aparezca.
- Estilo visual pedido: ${st ? st[2] : 'cinematic'}.${chars.length ? `\n- Personajes ya definidos (respeta su aspecto si aparecen): ${JSON.stringify(chars)}` : ''}
MATERIAL:
${src}`, { maxTokens: 16000 });
    if (!plan || !Array.isArray(plan.scenes) || !plan.scenes.length) throw new Error('La IA no devolvió escenas');
    for (const sc of plan.scenes) { sc.shots = (sc.shots || []).map((sh, i) => ({ id: sh.id || `${sc.id}-${i + 1}`, ...sh, st: {} })); }
    pr.plan = plan; await save(); toast(`🎬 ${plan.title}: ${plan.scenes.length} escenas · ${shots().length} planos`, 4000);
  }
}
async function bookCast(pr) {
  if (!llmReady()) { toast('Configura la IA en Ajustes'); return; }
  toast('👤 Leyendo personajes…', 60000);
  try { const sample = pr.book.chapters.slice(0, 4).map(c => c.text.slice(0, 6000)).join('\n\n---\n\n');
    const r = await llmJSON(`Del siguiente texto de la novela «${pr.book.title}», extrae los personajes principales (máximo 8). Devuelve SOLO JSON: {"characters":[{"name":"","desc":"(inglés) descripción visual concreta y estable para una IA de imagen: edad, complexión, pelo, rasgos, vestuario característico"}]}\n\n${sample}`);
    let n = 0; const have = await db.all('chars'); for (const c of r.characters || []) { if (have.some(h => h.name.toLowerCase() === c.name.toLowerCase())) continue; await db.put('chars', { id: uid(), name: c.name, desc: c.desc, images: [] }); n++; }
    toast(`👤 ${n} personajes nuevos en Personajes`, 4000, { action: { label: 'Ver', fn: () => location.hash = '#chars' } }); } catch (e) { toast('No se pudieron extraer: ' + e.message, 5000); }
}
function planHeader(pr) { const p = pr.plan; const n = shots().length; const secs = shots().reduce((a, x) => a + (+x.sh.duration || 5), 0);
  const m = catalog().find(x => x.id === pr.opts.videoModel); const est = m && m.price ? shots().reduce((a, x) => a + (estimate(m, { duration: +x.sh.duration || 5 }, +x.sh.duration || 5) || 0), 0) : null;
  return el('section', { class: 'card' }, el('h2', {}, p.title || 'Sin título'), el('p', { class: 'note' }, p.logline || ''), el('div', { class: 'note' }, `${p.scenes.length} escenas · ${n} planos · ${fmtTime(secs)} · vídeo final ${m ? `con ${m.name}${est != null ? ` ≈ ${money(est)}` : ''}` : 'sin modelo elegido'}`),
    el('div', { class: 'chips' }, (p.characters || []).map(c => el('span', { class: 'chip', title: c.desc }, `👤 ${c.name}`))), el('div', { class: 'row-btns' }, btn('👤 Guardar personajes', () => saveCast(pr), 'mini-b'), btn('🖨 Storyboard', () => storyboard(pr), 'mini-b'))); }
async function saveCast(pr) { const have = await db.all('chars'); let n = 0; for (const c of pr.plan.characters || []) { if (have.some(h => h.name.toLowerCase() === c.name.toLowerCase())) continue; await db.put('chars', { id: uid(), name: c.name, desc: c.desc, images: [] }); n++; } toast(`👤 ${n} personajes guardados`); }
function prodBar(pr) { const all = shots(); const done = k => all.filter(x => x.sh.st[k] === 'ok').length;
  return el('section', { class: 'card prod' }, el('h3', {}, 'Producción'),
    el('div', { class: 'pipe' }, step('🎬', 'Rodar previz', `${done('previz')}/${all.length}`, () => shootAll(pr)), step('🎞', 'Animatic', 'montar con la previz', () => assemble(pr, true)), step('✨', 'Vídeo final', `${done('gen')}/${all.length}`, () => genAll(pr)), step('🔊', 'Voces y sonido', `${done('sound')}/${all.length}`, () => soundAll(pr)), step('🎞', 'Montar capítulo', 'con subtítulos', () => assemble(pr, false))),
    el('div', { class: 'row-btns' }, btn('🤖 Todo automático', () => autopilot(pr), 'b hot'), P.shooting ? btn('⏹ Parar rodaje', () => { P.shooting.stop = true; }, 'mini-b red') : null)); }
const step = (ic, t, s, fn) => el('button', { type: 'button', class: 'pstep', on: { click: fn } }, el('i', {}, ic), el('b', {}, t), el('small', {}, s));
function sceneCard(sc) {
  const c = el('section', { class: 'card scene' }, el('div', { class: 'sch' }, el('b', {}, `${sc.id} · ${sc.heading || ''}`), el('small', {}, sc.summary || '')));
  const g = el('div', { class: 'shots' }); for (const sh of sc.shots) g.append(shotCard(sc, sh)); c.append(g); return c;
}
function shotCard(sc, sh) {
  const st = sh.st || (sh.st = {}); const fin = sh.final, pv = sh.previz;
  const media = fin ? el('video', { src: blobURL(fin.blob), muted: true, loop: true, playsInline: true, on: { mouseenter: e => e.target.play(), click: e => e.target.paused ? e.target.play() : e.target.pause() } }) : pv && pv.frame ? el('img', { src: blobURL(pv.frame), alt: '' }) : el('div', { class: 'ph' }, '🎬');
  const badge = (k, l) => el('span', { class: 'st ' + (st[k] || '') }, l);
  return el('div', { class: 'shot' }, media, el('div', { class: 'sm' }, el('b', {}, `${sh.id} · ${({ general: 'General', conjunto: 'Conjunto', medio: 'Medio', primer: 'Primer plano', detalle: 'Detalle' })[sh.size] || sh.size} · ${(sh.camera && sh.camera.mode) || 'fija'}`), el('small', {}, `${sh.subject || ''} · ${sh.duration || 5} s`),
    el('p', {}, sh.description || ''), (sh.dialogue || []).length ? el('p', { class: 'dlg' }, sh.dialogue.map(d => `${d.who}: «${d.line}»`).join(' ')) : null,
    el('div', { class: 'badges' }, badge('previz', 'previz'), badge('gen', 'final'), badge('sound', 'sonido')),
    el('div', { class: 'row-btns' }, btn('🎬', () => shootList([{ sc, sh }]), 'mini-b'), btn('✨', () => genShot(P.proj, sc, sh), 'mini-b'), btn('🔊', () => soundShot(P.proj, sc, sh), 'mini-b'), pv ? btn('👁 previz', () => modal(sh.id, el('video', { src: blobURL(pv.color), controls: true, autoplay: true, loop: true, playsInline: true, style: 'width:100%' }), { wide: true }), 'mini-b') : null)));
}

/* ---------- Rodaje automático en el plató ---------- */
const frameWin = () => document.getElementById('plato').contentWindow;
function shootOne(sc, sh, depth) {
  return new Promise((res, rej) => { const id = uid(); const to = setTimeout(() => { removeEventListener('message', on); rej(new Error('El plató no respondió')); }, ((+sh.from || 0) + (+sh.duration || 5)) * 2 * 1000 + 60000);
    const on = e => { if (e.origin !== location.origin || !e.data || e.data.type !== 'plato:shot-done' || e.data.id !== id) return; clearTimeout(to); removeEventListener('message', on); e.data.error ? rej(new Error(e.data.error)) : res(e.data.files); };
    addEventListener('message', on);
    frameWin().postMessage({ type: 'plato:shoot', id, env: { place: sc.place, time: sc.time, weather: sc.weather }, setup: sc.setup || [], action: sc.action || [], shot: sh, aspect: P.proj.opts.aspect, depth }, location.origin); });
}
async function shootList(list) {
  if (P.shooting) { toast('Ya hay un rodaje en marcha'); return; } const pr = P.proj; const ctl = P.shooting = { stop: false }; const back = location.hash; location.hash = '#plato'; const bar = shootBar();
  let i = 0; for (const { sc, sh } of list) { if (ctl.stop) break; i++; bar(`🎬 Rodando ${sh.id} (${i}/${list.length}) · ${sc.heading || ''}`); sh.st.previz = 'run';
    try { await new Promise(r => setTimeout(r, 400)); const files = await shootOne(sc, sh, pr.opts.depth); const f = n => (files.find(x => n.test(x.name)) || {}).blob;
      sh.previz = { color: f(/color\.(mp4|webm)$/), depth: f(/depth\.(mp4|webm)$/), frame: f(/\.png$/) }; sh.st.previz = 'ok'; await save(); } catch (e) { sh.st.previz = 'err'; toast(`⚠️ ${sh.id}: ${e.message}`, 4000); } }
  bar(null); P.shooting = null; location.hash = back.startsWith('#director') ? back : '#director'; toast(ctl.stop ? '⏹ Rodaje parado' : `🎬 Previz lista: ${list.length} planos`, 3500); }
function shootBar() { let b = $('#shootbar'); if (!b) { b = el('div', { id: 'shootbar' }); document.body.append(b); } return t => { if (!t) { b.remove(); return; } b.innerHTML = ''; b.append(el('span', {}, t), btn('⏹ Parar', () => { if (P.shooting) P.shooting.stop = true; }, 'mini-b red')); }; }
const shootAll = pr => shootList(shots().filter(x => x.sh.st.previz !== 'ok'));

/* ---------- Vídeo final ---------- */
async function charDescs() { const cs = await db.all('chars'); const pc = (P.proj.plan.characters || []); return name => { const c = cs.find(x => x.name.toLowerCase() === String(name || '').toLowerCase()) || pc.find(x => x.name === name); return c ? `${c.name}: ${c.desc}` : ''; }; }
async function shotPrompt(sc, sh) { const d = await charDescs(); const who = [...new Set([sh.subject, ...(sh.dialogue || []).map(x => x.who)])].filter(Boolean).map(d).filter(Boolean); const st = STYLES.find(s => s[0] === P.proj.opts.style);
  return [sh.description, who.length ? 'Characters: ' + who.join('; ') : '', `${sc.heading || ''}`, P.proj.plan.style || '', st ? st[2] : '', 'Keep the exact motion, timing and camera move of the reference video; replace grey mannequins and simple shapes with real people, vehicles and sets.'].filter(Boolean).join('. '); }
async function genShot(pr, sc, sh) {
  if (host.claude) { toast('La generación funciona en la app de GitHub Pages'); return null; }
  const m = catalog().find(x => x.id === pr.opts.videoModel); if (!m || !readiness(m).ok) { toast('Elige un modelo de vídeo final listo (Ajustes de producción)'); return null; }
  if (!sh.previz) { toast(`Rueda primero la previz de ${sh.id}`); return null; }
  const prompt = await shotPrompt(sc, sh); const params = { prompt, duration: +sh.duration || 5, aspect: pr.opts.aspect, resolution: '720p', audio: false };
  const input = buildInput(m, params, { video: sh.previz.color, image: sh.previz.frame, control: sh.previz.depth });
  sh.st.gen = 'run'; refresh();
  const job = runJob({ provider: m.provider, endpoint: m.endpoint, name: m.name, input, kind: 'video', est: estimate(m, params, +sh.duration || 5) || 0, mode: 'director', label: `${pr.plan.title} · ${sh.id}`, meta: { project: pr.id, shot: sh.id, role: 'final' } });
  try { const g = await job.promise; sh.final = { id: g.id, blob: g.blob }; sh.st.gen = 'ok'; } catch (e) { sh.st.gen = 'err'; toast(`⚠️ ${sh.id}: ${e.message}`, 4000); }
  await save(); refresh(); return sh.final;
}
async function pool(items, n, fn) { const q = [...items]; await Promise.all(Array.from({ length: Math.min(n, q.length) }, async () => { while (q.length) await fn(q.shift()); })); }
async function genAll(pr, o = {}) { const list = shots().filter(x => x.sh.previz && x.sh.st.gen !== 'ok'); if (!list.length) { toast('No hay planos con previz pendientes de generar'); return; }
  const m = catalog().find(x => x.id === pr.opts.videoModel); const est = m && m.price ? list.reduce((a, x) => a + (estimate(m, { duration: +x.sh.duration || 5 }, +x.sh.duration || 5) || 0), 0) : 0;
  if (!o.silent && !await confirmBox('Generar vídeo final', `${list.length} planos con ${m ? m.name : '?'}${est ? ` · coste estimado ${money(est)}` : ''}. Se generan de 3 en 3.`, 'Generar')) return;
  await pool(list, 3, x => genShot(pr, x.sc, x.sh)); toast('✨ Vídeo final generado', 3500); }

/* ---------- Voces, efectos y música (Muapi) ---------- */
async function soundShot(pr, sc, sh) {
  const s = getSettings(); if (!s.keys.muapi) { toast('Voces y sonido usan Muapi: añade la clave en Ajustes'); return; } if (host.claude) { toast('El audio se genera en la app de GitHub Pages'); return; }
  const reg = await registry(); sh.st.sound = 'run'; refresh(); sh.audio = sh.audio || [];
  try {
    const tasks = [];
    if (pr.opts.sfx && sh.final && sh.sfx) { const mm = reg.find(r => r.id === 'mmaudio-v2-video-to-video'); if (mm) tasks.push(runJob({ provider: 'muapi', endpoint: mm.e, name: mm.n, input: { video_url: sh.final.blob, prompt: sh.sfx }, kind: 'video', label: `${sh.id} · sonido`, meta: { project: pr.id, shot: sh.id, role: 'sfx' } }).promise.then(g => { sh.final = { id: g.id, blob: g.blob }; })); }
    const tts = reg.find(r => r.id === pr.opts.voiceModel) || reg.find(r => r.id === 'elevenlabs-tts-turbo-2-5');
    if (tts && (sh.dialogue || []).length) { const voices = await voiceMap(pr, tts); sh.audio = [];
      for (const [i, d] of sh.dialogue.entries()) { const input = { prompt: d.line }; if (tts.i && tts.i.voice_id && voices[d.who]) input.voice_id = voices[d.who]; if (tts.i && tts.i.language_code) input.language_code = pr.opts.lang;
        tasks.push(runJob({ provider: 'muapi', endpoint: tts.e, name: tts.n, input, kind: 'audio', label: `${sh.id} · ${d.who}`, meta: { project: pr.id, shot: sh.id, role: 'dialogue' } }).promise.then(g => { sh.audio[i] = { id: g.id, blob: g.blob, who: d.who, line: d.line }; })); } }
    if (pr.opts.music && sc.music && !sc.musicGen && sc.shots[0] === sh) { const ly = reg.find(r => r.id === 'lyria-2') || reg.find(r => r.c === 'audio' && /music/.test(r.id)); if (ly) tasks.push(runJob({ provider: 'muapi', endpoint: ly.e, name: ly.n, input: { prompt: sc.music }, kind: 'audio', label: `${sc.id} · música`, meta: { project: pr.id, scene: sc.id, role: 'music' } }).promise.then(g => { sc.musicGen = { id: g.id, blob: g.blob }; })); }
    await Promise.all(tasks); sh.st.sound = 'ok';
  } catch (e) { sh.st.sound = 'err'; toast(`⚠️ Sonido ${sh.id}: ${e.message}`, 4000); }
  await save(); refresh();
}
async function voiceMap(pr, tts) {
  if (!pr.voices) pr.voices = {}; const e = (tts.i && tts.i.voice_id && tts.i.voice_id.e) || []; const opts = e.map(x => typeof x === 'object' ? x : { label: x, value: x });
  const fem = opts.filter(o => /femin|woman|girl|lady|female|arabella|adeline|monika|sweet|lovely|calm_woman|wise_woman/i.test(o.label)), mal = opts.filter(o => !fem.includes(o));
  let fi = 0, mi = 0; for (const c of pr.plan.characters || []) { if (pr.voices[c.name]) continue; const isF = /female|woman|girl|mujer|niña|child/i.test(c.voice || ''); const pool = isF && fem.length ? fem : mal.length ? mal : opts; const pick = pool[(isF ? fi++ : mi++) % Math.max(1, pool.length)]; if (pick) pr.voices[c.name] = pick.value; }
  return pr.voices;
}
async function soundAll(pr) { const list = shots().filter(x => x.sh.st.sound !== 'ok' && (x.sh.final || (x.sh.dialogue || []).length)); if (!list.length) { toast('Nada pendiente de sonido'); return; } await pool(list, 2, x => soundShot(pr, x.sc, x.sh)); toast('🔊 Voces y sonido listos'); }

/* ---------- Montaje ---------- */
async function assemble(pr, animatic, o = {}) {
  const list = shots(); const clips = [], tracks = [], subs = []; let t = 0;
  for (const { sc, sh } of list) { const v = animatic ? sh.previz && sh.previz.color : (sh.final && sh.final.blob) || (sh.previz && sh.previz.color); if (!v) continue;
    const gid = 'dirclip-' + pr.id + '-' + sh.id + (animatic ? '-a' : ''); const meta = await videoMeta(v); const dur = Math.min(meta.duration || +sh.duration || 5, +sh.duration || meta.duration || 5);
    await db.put('gens', { id: gid, t: Date.now(), kind: 'video', modelName: `${pr.plan.title} · ${sh.id}${animatic ? ' (previz)' : ''}`, provider: 'edit', prompt: sh.description || '', cost: 0, blob: v, thumb: sh.previz && sh.previz.frame, dur: meta.duration || dur, hidden: true });
    const cid = uid();
    if (sc.shots[0] === sh && sc.musicGen && !animatic) tracks.push({ id: uid(), blob: sc.musicGen.blob, clipId: cid, at: 0, vol: 0.35, label: `Música ${sc.id}` });
    let lt = 0.3; (sh.dialogue || []).forEach((d, i) => { const a = !animatic && sh.audio && sh.audio[i]; const len = Math.max(1.2, d.line.length / 14); if (a) tracks.push({ id: uid(), blob: a.blob, clipId: cid, at: lt, vol: 1, label: `${d.who}` }); subs.push({ id: uid(), clipId: cid, at: lt, len, text: `${d.who}: ${d.line}` }); lt += len + 0.2; });
    clips.push({ id: cid, genId: gid, in: 0, out: dur, trans: clips.length ? 'cut' : 'fade' }); t += dur; }
  if (!clips.length) { toast(animatic ? 'Rueda primero la previz' : 'No hay planos todavía'); return; }
  const cur = await db.get('projects', 'current'); if (!o.silent && cur && cur.clips && cur.clips.length && !cur.fromDirector) { if (!await confirmBox('Sustituir el montaje', 'El montaje actual se sustituirá por este capítulo.', 'Sustituir')) return; }
  await db.put('projects', { id: 'current', title: pr.plan.title + (animatic ? ' (animatic)' : ''), clips, music: null, musicVol: 0.6, clipVol: 1, aspect: ['16:9', '9:16', '1:1', '4:3'].includes(pr.opts.aspect) ? pr.opts.aspect : '16:9', tracks, subs, burnSubs: true, fromDirector: pr.id });
  emit('gens'); toast(animatic ? '🎞 Animatic montado' : '🎞 Capítulo montado', 3500, { action: { label: 'Ir al montaje', fn: () => location.hash = '#edit' } });
}
async function autopilot(pr) {
  if (!await confirmBox('Todo automático', host.claude ? 'Rodaré toda la previz y montaré el animatic (la generación se hace en la app de GitHub).' : 'Rodaré la previz de todos los planos, generaré el vídeo final, las voces, el sonido y la música, y montaré el capítulo. Verás el coste antes de generar.', 'Adelante')) return;
  await shootAll(pr); if (host.claude) { await assemble(pr, true); return; }
  if (catalog().find(x => x.id === pr.opts.videoModel)) await genAll(pr); if (getSettings().keys.muapi) await soundAll(pr); await assemble(pr, false);
}
function refresh() { if (root && location.hash === '#director' && !P.shooting) renderDirector(root); }

/* ---------- API para el MCP (sin interfaz) ---------- */
const KEEP = ['previz', 'final', 'audio', 'musicGen'];
function strip(o) { return JSON.parse(JSON.stringify(o, (k, v) => KEEP.includes(k) ? (v ? (Array.isArray(v) ? v.filter(Boolean).length + ' clips' : 'ok') : undefined) : v)); }
function normPlan(plan) {
  if (!plan || !Array.isArray(plan.scenes) || !plan.scenes.length) throw new Error('El plan necesita "scenes" con al menos una escena');
  plan.characters = plan.characters || []; plan.scenes.forEach((sc, i) => { sc.id = sc.id || 'S' + (i + 1); sc.setup = sc.setup || []; sc.action = sc.action || []; sc.place = sc.place || 'studio';
    sc.shots = (sc.shots || []).map((sh, j) => ({ from: 0, duration: 5, size: 'medio', angle: 'tq', ...sh, id: sh.id || `${sc.id}-${j + 1}`, st: {} })); if (!sc.shots.length) throw new Error(`La escena ${sc.id} no tiene planos`); });
  return plan;
}
function summary(pr) { const all = pr.plan ? pr.plan.scenes.flatMap(sc => sc.shots) : []; const n = k => all.filter(sh => sh.st && sh.st[k] === 'ok').length;
  return { project_id: pr.id, title: (pr.plan && pr.plan.title) || (pr.book && pr.book.title) || 'Proyecto nuevo', scenes: pr.plan ? pr.plan.scenes.length : 0, shots: all.length, done: { previz: n('previz'), final: n('gen'), sound: n('sound') } }; }
async function getPr(id) { const pr = id ? await db.get('projects', id) : P.proj; if (!pr || pr.kind !== 'director') throw new Error('No existe el proyecto ' + (id || '')); return pr; }
export async function dirList() { await loadProjects(); return { projects: P.list.map(summary) }; }
export async function dirGet(id) { const pr = await getPr(id); return { ...summary(pr), options: pr.opts, book: pr.book ? { title: pr.book.title, chapter: pr.chapter, chapters: pr.book.chapters.map(c => ({ n: c.n, title: c.title, words: c.words })) } : undefined, plan: pr.plan ? strip(pr.plan) : null }; }
export async function dirCreate({ plan, options, idea }) { const pr = blank(); Object.assign(pr.opts, options || {}); if (idea) pr.idea = idea; pr.plan = normPlan(plan); await db.put('projects', pr); P.proj = pr; refresh(); return dirGet(pr.id); }
export async function dirPlan({ project_id, idea, options }) { const pr = project_id ? await getPr(project_id) : blank(); if (idea) { pr.src = 'idea'; pr.idea = idea; }
  if (options) { const { chapter, ...rest } = options; Object.assign(pr.opts, rest); if (chapter != null && pr.book) { pr.src = 'book'; pr.chapter = Math.max(0, Math.min(pr.book.chapters.length - 1, (+chapter || 1) - 1)); } }
  await planCore(pr); refresh(); return dirGet(pr.id); }
export async function dirFromBook(file) { const b = await readBook(file); const pr = blank(); pr.src = 'book'; pr.book = b; pr.chapter = 0; await db.put('projects', pr); P.proj = pr; refresh();
  return { project_id: pr.id, title: b.title, chapters: b.chapters.map(c => ({ n: c.n, title: c.title, words: c.words, start: c.text.slice(0, 160) })) }; }
export async function dirRun({ project_id, steps }, approve) { const pr = await getPr(project_id); P.proj = pr; const done = [];
  for (const st of steps && steps.length ? steps : ['previz', 'animatic']) {
    if (st === 'previz') { await shootList(shots().filter(x => x.sh.st.previz !== 'ok')); }
    else if (st === 'animatic') await assemble(pr, true, { silent: true });
    else if (st === 'final') { const m = catalog().find(x => x.id === pr.opts.videoModel); if (!m) throw new Error('Elige options.videoModel (un modelo v2v o i2v listo) con director action=create/plan');
      const list = shots().filter(x => x.sh.previz && x.sh.st.gen !== 'ok'); const est = m.price ? list.reduce((a, x) => a + (estimate(m, { duration: +x.sh.duration || 5 }, +x.sh.duration || 5) || 0), 0) : null;
      await approve(est, `Vídeo final de ${list.length} planos con ${m.name}`); await genAll(pr, { silent: true }); }
    else if (st === 'sound') { await approve(null, 'Voces, efectos y música (Muapi)'); await soundAll(pr); }
    else if (st === 'assemble') await assemble(pr, false, { silent: true });
    done.push(st); await save(); }
  return { ...summary(pr), steps_done: done, text: done.includes('assemble') || done.includes('animatic') ? 'Montaje listo en 🎞 Montaje (usa montage action=export para el vídeo).' : undefined };
}

/* ---------- Storyboard imprimible (HTML → PDF desde el navegador) ---------- */
const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const dataURL = b => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(''); fr.readAsDataURL(b); });
const SIZE_ES = { general: 'Plano general', conjunto: 'Plano de conjunto', medio: 'Plano medio', primer: 'Primer plano', detalle: 'Plano detalle' };
const ANG_ES = { front: 'frontal', tq: '3/4', side: 'perfil', back: 'espalda', high: 'picado', low: 'contrapicado' };
async function storyboard(pr) { const p = pr.plan; const out = []; let n = 0;
  for (const sc of p.scenes) { out.push(`<section><h2>${esc(sc.id)} · ${esc(sc.heading || '')}</h2><p class="s">${esc(sc.summary || '')}${sc.music ? ` · 🎵 ${esc(sc.music)}` : ''}</p><div class="g">`);
    for (const sh of sc.shots) { n++; const img = sh.previz && sh.previz.frame ? await dataURL(sh.previz.frame) : '';
      out.push(`<div class="c">${img ? `<img src="${img}" alt="">` : '<div class="ph">Sin previz todavía</div>'}<div class="m"><b>${n}. ${esc(sh.id)}</b> · ${esc(SIZE_ES[sh.size] || sh.size || '')}${sh.angle ? ' ' + esc(ANG_ES[sh.angle] || sh.angle) : ''} · cámara ${esc((sh.camera && sh.camera.mode) || 'fija')}${sh.camera && sh.camera.lens ? ' ' + sh.camera.lens + ' mm' : ''} · ${sh.duration || 5} s</div><p>${esc(sh.description || '')}</p>${(sh.dialogue || []).map(d => `<p class="d"><b>${esc(d.who)}:</b> «${esc(d.line)}»</p>`).join('')}${sh.sfx ? `<p class="x">🔊 ${esc(sh.sfx)}</p>` : ''}</div>`); }
    out.push('</div></section>'); }
  const cast = (p.characters || []).map(c => `<li><b>${esc(c.name)}</b> — ${esc(c.desc || '')}</li>`).join('');
  const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${esc(p.title)} · storyboard</title><style>body{font:13px/1.45 system-ui,sans-serif;margin:28px;color:#111}h1{margin:0 0 4px}h2{font-size:15px;margin:22px 0 4px;border-bottom:2px solid #111;padding-bottom:3px}.s{color:#555;margin:0 0 10px}.g{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.c{border:1px solid #ccc;border-radius:6px;overflow:hidden;break-inside:avoid}.c img,.ph{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#eee}.ph{display:grid;place-items:center;color:#999}.m{padding:6px 8px;background:#f4f4f4;font-size:11.5px}.c p{margin:5px 8px}.d{color:#7a3b00}.x{color:#555;font-size:11.5px}ul{padding-left:18px}@media print{body{margin:10mm}.g{grid-template-columns:repeat(3,1fr)}}</style></head><body><h1>${esc(p.title)}</h1><p>${esc(p.logline || '')}</p>${cast ? `<h2>Personajes</h2><ul>${cast}</ul>` : ''}${out.join('')}<p class="s" style="margin-top:20px">Plató Studio · ${n} planos · ${new Date().toLocaleDateString('es-ES')}</p></body></html>`;
  download(new Blob([html], { type: 'text/html' }), `storyboard-${(p.title || 'proyecto').replace(/[^\w-]+/g, '_')}.html`); toast('🖨 Storyboard descargado', 3500, { sub: 'Ábrelo y usa Imprimir → Guardar como PDF para compartirlo.' }); }
