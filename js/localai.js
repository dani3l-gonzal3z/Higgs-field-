// ⚙️ Tarjeta «IA local»: qué puede tu equipo, descargas por packs, modelos de Ollama y agentes locales.
import { el, btn, toast, getSettings, saveSettings, confirmBox } from './core.js';
import { localBase, detectLocal } from './local.js';

const api = async (p, body) => { const r = await fetch(localBase() + p, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'Error'); return j; };
const CATS = [['cerebro', '🧠 Cerebro'], ['video', '🎬 Vídeo'], ['audio', '🎙 Audio'], ['taller', '🔌 Taller'], ['agentes', '🤖 Agentes'], ['base', '🧩 Base']];
const ICON = { ok: '✅', partial: '🟡', installing: '⏳', missing: '⚪' };

export function localAICard() {
  const box = el('section', { class: 'card lai' }, el('h3', {}, '🧠 IA local'), el('div', { class: 'empty' }, 'Comprobando tu equipo…'));
  detectLocal().then(() => fill(box)); return box;
}
async function fill(box) {
  box.innerHTML = ''; box.append(el('h3', {}, '🧠 IA local'));
  if (!localBase()) { box.append(el('p', { class: 'note' }, 'Abre Plató como aplicación (Plato.cmd, Plato.command o ./plato.sh) para descargar modelos y usar la IA en tu propio equipo, sin claves ni proveedores.')); return; }
  let st; try { st = await api('/api/ai/status'); } catch (e) { box.append(el('p', { class: 'note' }, 'Actualiza el servidor de Plató para tener IA local (' + e.message + ').')); return; }
  const h = st.hw, g = h.gpu;
  box.append(el('div', { class: 'lai-hw' },
    el('b', {}, g ? `${g.name}${g.vram && g.vendor === 'nvidia' ? ` · ${g.vram} GB` : ''}` : 'Sin gráfica dedicada'),
    el('small', {}, `${h.cpu ? h.cpu.replace(/\(R\)|\(TM\)|CPU|Processor/g, '').replace(/\s+/g, ' ').trim() + ' · ' : ''}${h.ram} GB de RAM${h.disk != null ? ` · ${h.disk} GB libres` : ''}`),
    el('p', {}, h.verdict)));
  box.append(el('p', { class: 'note' }, 'Todo se guarda en la carpeta .plato-studio/ai de tu usuario y puedes quitarlo cuando quieras. Lo que no cabe en tu equipo aparece marcado.'));
  for (const [cat, label] of CATS) {
    const ps = st.packs.filter(p => p.cat === cat); if (!ps.length) continue;
    const sec = el('div', { class: 'lai-sec' }, el('div', { class: 'lbl' }, label));
    for (const p of ps) sec.append(packRow(p, box, st));
    if (cat === 'cerebro') sec.append(ollamaPanel(st, box));
    if (cat === 'video') sec.append(serviceRow('comfy', 'Motor de vídeo', st.services.comfy.running, st.packs.find(x => x.id === 'comfy').state === 'ok', box));
    if (cat === 'agentes') sec.append(agentPanel(st, box));
    box.append(sec);
  }
}
function packRow(p, box, st) {
  const row = el('div', { class: 'lai-p' + (p.fit.ok ? '' : ' warn') });
  const bar = el('div', { class: 'lai-bar' }, el('i', { style: `width:${Math.round((p.job && p.job.p || 0) * 100)}%` })), line = el('small', { class: 'lai-log' }, p.job && !p.job.done ? p.job.step : p.job && p.job.error ? '❌ ' + p.job.error : '');
  const act = p.state === 'installing' ? el('span', { class: 'tag' }, 'instalando…')
    : p.state === 'ok' && p.external && p.id === 'ollama' ? el('span', { class: 'tag ok' }, 'ya lo tenías')
    : p.state === 'ok' ? btn(p.id === 'hermes' ? 'Desconectar' : 'Quitar', async () => { if (!(await confirmBox('Quitar ' + p.title, 'Se borra de tu equipo. Puedes volver a descargarlo cuando quieras.', 'Quitar'))) return; try { await api('/api/ai/remove', { id: p.id }); toast('Quitado'); detectLocal(true); fill(box); } catch (e) { toast(e.message); } }, 'mini-b')
    : btn(p.id === 'hermes' ? (p.state === 'partial' ? '🔗 Conectar con Plató' : '¿Cómo se instala?') : p.state === 'partial' ? '⬇ Completar' : `⬇ Instalar · ~${p.gb < 1 ? Math.round(p.gb * 1000) + ' MB' : Math.round(p.gb) + ' GB'}`, async () => {
      if (!p.fit.ok && !p.fit.soft) return toast(p.fit.why);
      if (!p.fit.ok && !(await confirmBox('Puede que no vaya', p.fit.why + '. ¿Lo descargo igualmente?', 'Descargar'))) return;
      try { await api('/api/ai/install', { id: p.id }); watch(p.id, bar, line, box); } catch (e) { toast(e.message); } }, p.fit.ok ? 'mini-b on' : 'mini-b');
  row.append(el('div', { class: 'lai-h' }, el('i', {}, ICON[p.state] || '⚪'), el('div', {}, el('b', {}, p.title), el('small', {}, p.desc), el('small', { class: 'lai-lic' }, 'Licencia: ' + p.license + (p.needs.length ? ' · necesita: ' + p.needs.map(n => (st.packs.find(x => x.id === n) || {}).title || n).join(', ') : ''))), act));
  if (!p.fit.ok) row.append(el('small', { class: 'lai-why' }, '⚠️ ' + p.fit.why));
  if (p.state === 'installing' || (p.job && p.job.error)) { row.append(bar, line); if (p.state === 'installing') watch(p.id, bar, line, box); }
  return row;
}
const WATCH = new Set();
function watch(id, bar, line, box) {
  if (WATCH.has(id)) return; WATCH.add(id);
  const tick = async () => { try { const j = await api('/api/ai/job?id=' + id); bar.firstChild.style.width = Math.round((j.p || 0) * 100) + '%'; line.textContent = j.error ? '❌ ' + j.error : (j.step || '') + (j.log && j.log.length ? ' — ' + j.log[j.log.length - 1].slice(0, 90) : '');
      if (j.done) { WATCH.delete(id); toast(j.error ? 'No se pudo instalar: ' + j.error : '✅ Instalado'); detectLocal(true); if (box.isConnected) fill(box); return; } } catch (e) {}
    if (box.isConnected) setTimeout(tick, 1000); else WATCH.delete(id); };
  tick();
}
function serviceRow(name, label, running, installed, box) {
  if (!installed) return el('div');
  return el('div', { class: 'lai-svc' }, el('span', {}, `${running ? '🟢' : '⚫'} ${label} ${running ? 'en marcha' : 'parado'}`),
    btn(running ? 'Parar' : 'Arrancar', async e => { e.currentTarget.textContent = '⏳'; try { await api('/api/ai/service', { name, action: running ? 'stop' : 'start' }); } catch (er) { toast(er.message); } fill(box); }, 'mini-b'),
    el('small', {}, name === 'comfy' ? 'Plató lo arranca solo cuando hace falta y lo deja en segundo plano.' : ''));
}
function ollamaPanel(st, box) {
  const s = getSettings(); const ol = st.services.ollama; const wrap = el('div', { class: 'lai-ol' });
  if (!ol.installed) return wrap;
  if (!ol.running) { wrap.append(serviceRow('ollama', 'Ollama', false, true, box)); return wrap; }
  const models = ol.models || [];
  const use = m => { s.llm.provider = 'local'; s.llm.localModel = m; saveSettings(s, true); toast('🧠 Cerebro local: ' + m); fill(box); };
  wrap.append(el('div', { class: 'lbl' }, `Modelos en tu equipo (Ollama ${ol.version || ''})`));
  if (!models.length) wrap.append(el('p', { class: 'note' }, 'Todavía no hay ninguno. Descarga uno de los recomendados para tu equipo:'));
  for (const m of models) { const on = s.llm.provider === 'local' && (s.llm.localModel || models[0].name) === m.name;
    wrap.append(el('div', { class: 'lai-m' + (on ? ' on' : '') }, el('b', {}, m.name), el('small', {}, `${m.params || ''} · ${m.gb} GB`),
      on ? el('span', { class: 'tag ok' }, 'cerebro de Plató') : btn('Usar como cerebro', () => use(m.name), 'mini-b'),
      btn('🗑', async () => { if (!(await confirmBox('Borrar ' + m.name, 'Libera ' + m.gb + ' GB.', 'Borrar'))) return; await fetch(localBase() + '/api/ollama/api/delete', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: m.name }) }); detectLocal(true); fill(box); }, 'mini-b'))); }
  const have = new Set(models.map(m => m.name)); const rec = st.hw.llm.filter(n => !have.has(n) && !have.has(n + ':latest'));
  const prog = el('small', { class: 'lai-log' }); const inp = el('input', { class: 'txt', placeholder: 'Otro modelo de ollama.com/library (p. ej. qwen3:8b)' });
  const pull = async name => { if (!name) return; prog.textContent = '⏳ ' + name + '…';
    try { const r = await fetch(localBase() + '/api/ollama/api/pull', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: name, stream: true }) });
      if (!r.ok || !r.body) throw new Error('No se pudo descargar ' + name); const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
      for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
        while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); try { const j = JSON.parse(l); if (j.error) throw new Error(j.error); prog.textContent = `⏳ ${name}: ${j.status}${j.total ? ' ' + Math.round((j.completed || 0) / j.total * 100) + '%' : ''}`; } catch (e) { if (e.message && !/JSON/.test(e.message)) throw e; } } }
      toast('✅ ' + name + ' listo'); await detectLocal(true); if (!s.llm.localModel) use(name); else fill(box);
    } catch (e) { prog.textContent = '❌ ' + e.message; } };
  if (rec.length) wrap.append(el('div', { class: 'lbl' }, 'Recomendados para tu equipo'), el('div', { class: 'row-btns' }, rec.map(n => btn('⬇ ' + n, () => pull(n), 'mini-b'))));
  wrap.append(el('div', { class: 'inrow' }, inp, btn('⬇', () => pull(inp.value.trim()), 'mini-b')), prog,
    el('p', { class: 'note' }, 'Con un modelo local, el director, el profe, las marcas y el asistente funcionan sin ninguna clave. Los modelos pequeños son más torpes con planes largos: si algo sale raro, prueba uno más grande.'));
  return wrap;
}
function agentPanel(st, box) {
  const s = getSettings(); const oc = st.services.opencode; const wrap = el('div', { class: 'lai-ag' });
  const ocOk = st.packs.find(p => p.id === 'opencode').state === 'ok'; const model = s.llm.localModel || ((st.services.ollama.models || [])[0] || {}).name;
  if (ocOk) {
    const out = el('div', { class: 'lai-ans' }); const ta = el('textarea', { class: 'txt', rows: 2, placeholder: 'Pídeselo al agente local: «monta una escena de dos personajes en el garaje y grábala»' });
    wrap.append(el('div', { class: 'lbl' }, 'Agente local (opencode + tu modelo + MCP de Plató)'), el('div', { class: 'lai-svc' }, el('span', {}, `${oc.running ? '🟢 en marcha' : '⚫ parado'}${model ? ' · ' + model : ''}`),
      btn(oc.running ? 'Parar' : 'Arrancar', async e => { e.currentTarget.textContent = '⏳'; try { await api('/api/ai/service', { name: 'opencode', action: oc.running ? 'stop' : 'start', model }); } catch (er) { toast(er.message); } fill(box); }, 'mini-b')),
      ta, el('div', { class: 'row-btns' }, btn('🤖 Pedir', async e => { const b = e.currentTarget; if (!ta.value.trim()) return; b.textContent = '⏳ pensando…'; b.disabled = true;
        try { const r = await api('/api/ai/agent', { text: ta.value.trim(), model }); out.textContent = r.text + (r.tools && r.tools.length ? `\n\nHerramientas: ${r.tools.join(', ')}` : ''); } catch (er) { out.textContent = '❌ ' + er.message; } b.textContent = '🤖 Pedir'; b.disabled = false; }, 'mini-b on')), out);
  }
  const hm = st.services.hermes;
  if (!hm.bin) wrap.append(el('p', { class: 'note' }, 'Hermes Agent: con Ollama instalado, abre una terminal y escribe «ollama launch hermes». Luego vuelve aquí y pulsa «Conectar con Plató».'));
  else wrap.append(el('p', { class: 'note' }, hm.linked ? 'Hermes ya puede usar Plató (servidor MCP «plato-studio» en ~/.hermes/config.yaml).' : 'Hermes está instalado: pulsa «Conectar con Plató» para que pueda manejar la app.'));
  return wrap;
}
