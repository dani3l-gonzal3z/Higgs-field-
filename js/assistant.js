// 📱 Asistente del aparato: recoge lo que mandas desde el móvil (mensajes, PDFs, órdenes), actúa y te contesta en el chat.
import { db, toast, getSettings } from './core.js';
import { llmJSON, llmReady } from './llm.js';
import { localBase } from './local.js';

let since = 0, running = false, history = [], chain = Promise.resolve();
const ack = n => fetch(localBase() + '/api/inbox/ack', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n }) }).catch(() => {});
const reply = (text, extra = {}) => { const b = localBase(); if (!b) return; return fetch(b + '/api/outbox', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, ...extra }) }).catch(() => {}); };

export function startAssistant() {
  if (running || !localBase()) return; running = true;
  (async function loop() {
    for (;;) { try { const r = await fetch(localBase() + '/api/inbox' + (since ? '?since=' + since : ''), { cache: 'no-store' }); if (r.ok) { const j = await r.json(); for (const it of j.items || []) { since = Math.max(since, it.n);
          // Las órdenes (pausa, siguiente…) van al momento; las conversaciones y archivos, de una en una y en orden.
          const job = () => handle(it).catch(e => reply('⚠️ ' + e.message, { ref: it.n })).finally(() => ack(it.n));
          if (it.type === 'cmd' && !['explain', 'play'].includes(it.cmd)) job(); else chain = chain.then(job); } } } catch (e) {}
      await new Promise(r => setTimeout(r, 1200)); }
  })();
}

async function handle(it) {
  if (it.type === 'file') return onFile(it);
  if (it.type === 'cmd') { const Lm = await import('./learn.js');
    if (it.cmd === 'explain') { reply('🎓 Preparo la clase en la tele…', { ref: it.n }); await Lm.explain({ docId: it.arg }); return reply(`▶ Clase en marcha. Pregúntame lo que quieras mientras.`, { ref: it.n }); }
    if (it.cmd === 'play') { const G = await import('./games.js'); location.hash = '#games'; const r = await G.gamesPlay(it.arg); return reply('🎮 Partida abierta en la tele.' + (r.phones ? ` Para jugar con el móvil: ${r.phones}` : ''), { ref: it.n }); }
    Lm.lessonControl(it.cmd, it.arg); return; }
  if (it.type === 'chat') return onChat(it);
}

async function onFile(it) {
  const b = localBase(); const r = await fetch(b + '/api/inbox/file/' + it.id); if (!r.ok) throw new Error('No he podido recoger el archivo');
  const blob = new Blob([await r.arrayBuffer()], { type: it.mime });
  if (/^image\//.test(it.mime)) { const { uid } = await import('./core.js'); const id = 'mov-' + uid(); await db.put('gens', { id, t: Date.now(), mode: 'upload', kind: 'image', modelName: 'Desde el móvil', provider: 'upload', prompt: it.name, cost: 0, blob, thumb: blob }); toast('📱 Imagen recibida en la galería');
    return reply(`🖼 «${it.name}» guardada en la galería del aparato.`, { ref: it.n }); }
  if (/^video\//.test(it.mime)) { const { uid } = await import('./core.js'); await db.put('gens', { id: 'mov-' + uid(), t: Date.now(), mode: 'upload', kind: 'video', modelName: 'Desde el móvil', provider: 'upload', prompt: it.name, cost: 0, blob }); toast('📱 Vídeo recibido en la galería');
    return reply(`🎞 «${it.name}» guardado en la galería (puedes usarlo en el montaje).`, { ref: it.n }); }
  const Lm = await import('./learn.js'); const d = await Lm.addDoc(blob, it.name, 'movil');
  toast(`📱 Te han mandado «${d.title}»`, 6000, { action: { label: '🎓 Explícamelo', fn: () => Lm.explain({ docId: d.id }) } });
  if (it.text) return onChat({ ...it, type: 'chat', text: it.text, doc: d });
  return reply(`📄 Tengo «${d.title}» (${d.pages} pág.). ¿Qué hago con él?`, { ref: it.n, card: { actions: [{ label: '🎓 Explícamelo en la tele', cmd: 'explain', arg: d.id }, { label: '📝 Resúmemelo aquí', chat: `Resúmeme «${d.title}» en el chat` }] } });
}

// El cerebro: decide qué hacer con lo que le pides y usa las herramientas de la app.
const TOOLS = `Herramientas (usa como mucho una por mensaje):
- explain {doc_id?, topic?, focus?, level?: "basico"|"normal"|"fondo"} → da una clase en la tele (de un documento o de cualquier tema).
- ask {question, doc_id?} → contesta en voz alta en la tele (úsalo si están viendo una clase o piden que lo explique en la tele).
- summary {doc_id, focus?} → resume un documento aquí en el chat.
- lesson {cmd: "pause"|"resume"|"next"|"prev"|"repeat"|"stop"} → controla la clase en marcha.
- open {view: "home"|"learn"|"director"|"games"|"plato"|"studio"|"lab"|"gallery"|"edit"|"settings"} → abre una sección en la tele.
- create_game {idea} → programa un juego nuevo (tarda 1-2 min).
- play_game {id} → abre un juego guardado en la tele.
- chapter {idea} → el Director planifica un capítulo/vídeo (guion, escenas y planos).
- scene {text} → orden para el plató 3D (decorados, personajes, cámaras, acción).
- say {text} → el profe de la tele dice esto en voz alta.`;
async function onChat(it) {
  if (!llmReady()) return reply('Necesito la IA configurada en Ajustes del aparato para conversar.', { ref: it.n });
  const Lm = await import('./learn.js'); const G = await import('./games.js');
  const docs = (await Lm.docsList()).slice(0, 12); const games = (await G.gamesList()).slice(0, 12); const sess = Lm.L.session;
  history.push({ role: 'user', text: it.text }); history = history.slice(-12);
  const prompt = `Eres Plató, un aparato de casa (estudio audiovisual, profesor y consola de juegos) y hablas con su dueño por el chat del móvil. Respondes en español, cercano, breve y útil.
${TOOLS}
Estado: ${sess ? `clase en la tele «${sess.lesson.title}», paso ${sess.i + 1} de ${sess.lesson.steps.length}` : 'sin clase en marcha'}; sección abierta: ${location.hash.slice(1) || 'home'}.
Documentos: ${docs.map(d => `${d.id}: «${d.title}»`).join('; ') || 'ninguno'}${it.doc ? ` (acaba de mandar ${it.doc.id})` : ''}.
Juegos: ${games.map(g => `${g.id}: «${g.title}»`).join('; ') || 'ninguno'}.
Conversación reciente:
${history.map(h => (h.role === 'user' ? 'Usuario: ' : 'Plató: ') + h.text).join('\n')}
Devuelve SOLO JSON: {"reply":"lo que contestas en el chat (puede ser la respuesta completa si es una pregunta general)","tool":null | {"name":"...","args":{...}}}
Si es una pregunta general, contéstala tú en "reply" sin herramienta. Si pide algo que hacen las herramientas, usa la herramienta y en "reply" di qué vas a hacer.`;
  let j; try { j = await llmJSON(prompt, { maxTokens: 2000 }); } catch (e) { return reply('No he entendido bien; ¿me lo repites?', { ref: it.n }); }
  const say = String(j.reply || '').trim(); const t = j.tool && j.tool.name ? j.tool : null;
  if (say && !(t && t.name === 'ask')) { reply(say, { ref: it.n }); history.push({ role: 'assistant', text: say }); }
  if (!t) return;
  try { const out = await runAction(t.name, t.args || {}, it); if (out) { reply(out.text || out, { ref: it.n, card: out.card }); history.push({ role: 'assistant', text: out.text || out }); } }
  catch (e) { reply('⚠️ No he podido: ' + e.message, { ref: it.n }); }
}
async function runAction(name, a, it) {
  const Lm = await import('./learn.js');
  if (name === 'explain') { const l = await Lm.explain({ docId: a.doc_id, topic: a.topic, focus: a.focus, level: a.level }); return `▶ Clase «${l.title}» en la tele (${l.steps.length} pasos). Puedes preguntarme o decirme «pausa», «siguiente»…`; }
  if (name === 'ask') { const doc = a.doc_id ? await db.get('projects', a.doc_id) : null; if (!Lm.L.session) location.hash = '#learn'; const txt = await Lm.answer(a.question || it.text, { doc }); return txt || 'Listo.'; }
  if (name === 'summary') { const d = await db.get('projects', a.doc_id); if (!d) throw new Error('No encuentro ese documento'); const { llmText } = await import('./llm.js');
    const t = await llmText(`Resume en español, claro y bien estructurado (máximo 250 palabras, con viñetas cortas si ayuda), el documento «${d.title}»${a.focus ? ' centrándote en ' + a.focus : ''}:\n<<<\n${Lm.relevant(d.text, a.focus || d.title, 24000)}\n>>>`, { maxTokens: 1500 }); return t; }
  if (name === 'lesson') return Lm.lessonControl(a.cmd, a.arg);
  if (name === 'open') { location.hash = '#' + (a.view || 'home'); return null; }
  if (name === 'say') { if (!Lm.L.session) await Lm.startLesson({ title: 'Plató', steps: [] }); await Lm.answer('Di exactamente esto, sin añadir nada: ' + a.text); return null; }
  if (name === 'create_game') { const G = await import('./games.js'); const g = await G.gamesCreate(a.idea || it.text); return { text: `🎮 «${g.title}» listo${g.fixed ? ' (me corregí sola al probarlo)' : ''}. ${g.description || ''}`, card: { actions: [{ label: '▶ Jugar en la tele', cmd: 'play', arg: g.id }] } }; }
  if (name === 'play_game') { const G = await import('./games.js'); location.hash = '#games'; const r = await G.gamesPlay(a.id); return '🎮 Partida abierta en la tele.' + (r.phones ? ` Para jugar con el móvil: ${r.phones}` : ''); }
  const { runTool } = await import('./mcp.js');
  if (name === 'chapter') { const r = await runTool('director', { action: 'plan', idea: a.idea || it.text }); const p = r && (r.plan || r); return `🎬 Plan listo${p && p.title ? ': «' + p.title + '»' : ''}. Lo tienes en el Director de la tele para rodarlo.`; }
  if (name === 'scene') { location.hash = '#plato'; const r = await runTool('scene_command', { text: a.text || it.text }); return '🎨 ' + ((r && r.text) || 'Hecho en el plató.'); }
  throw new Error('No sé hacer «' + name + '» todavía');
}
