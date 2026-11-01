// Mando universal: pinta en pantalla lo que cada juego pide (botones, elecciones, cartas, joystick…) y devuelve lo que pulsa el jugador.
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function renderPad(root, spec, send, opts = {}) {
  spec = spec || {}; if (root._padStop) root._padStop(); root.innerHTML = ''; root.classList.add('pad'); if (spec.color) root.style.setProperty('--pc', spec.color);
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const act = (action, args) => { if (navigator.vibrate) navigator.vibrate(12); send({ type: 'action', name: action, args: args || {} }); };
  if (spec.title) root.append(h('div', 'p-title', esc(spec.title)));
  if (spec.text) root.append(h('div', 'p-text', esc(spec.text)));
  if (spec.wait) root.append(h('div', 'p-wait', `<i></i>${esc(spec.wait)}`));
  if (spec.choices) { const c = h('div', 'p-choices'); if (spec.choices.prompt) c.append(h('div', 'p-prompt', esc(spec.choices.prompt)));
    for (const o of spec.choices.options || []) { const b = h('button', 'p-btn' + (o.style ? ' ' + o.style : ''), esc(o.label)); b.type = 'button'; b.onclick = () => act(o.action, o.args); c.append(b); } root.append(c); }
  if (spec.buttons && spec.buttons.length) { const g = h('div', 'p-buttons'); for (const o of spec.buttons) { const b = h('button', 'p-btn ' + (o.style || ''), esc(o.label)); b.type = 'button'; b.disabled = !!o.disabled; b.onclick = () => act(o.action, o.args); g.append(b); } root.append(g); }
  if (spec.number) { const n = spec.number; let v = n.value ?? n.min ?? 0; const w = h('div', 'p-number'); const lab = h('div', 'p-prompt', esc(n.label || '')); const val = h('b', '', String(v));
    const step = d => { v = Math.max(n.min ?? -1e9, Math.min(n.max ?? 1e9, v + d * (n.step || 1))); val.textContent = v; };
    const m = h('button', 'p-btn', '−'), p = h('button', 'p-btn', '+'), ok = h('button', 'p-btn primary', esc(n.ok || 'Aceptar')); m.onclick = () => step(-1); p.onclick = () => step(1); ok.onclick = () => act(n.action, { value: v });
    const row = h('div', 'p-row'); row.append(m, val, p); w.append(lab, row, ok); root.append(w); }
  if (spec.cards && spec.cards.length) { const c = h('div', 'p-cards'); for (const o of spec.cards) { const b = h(o.action ? 'button' : 'div', 'p-card', `<b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}`); if (o.color) b.style.setProperty('--cc', o.color); if (o.action) { b.type = 'button'; b.onclick = () => act(o.action, o.args); } c.append(b); } root.append(c); }
  let timer = 0;
  if (spec.joystick || (spec.actionButtons && spec.actionButtons.length)) {
    const input = { x: 0, y: 0, a: false, b: false }; let dirty = true; const pushIn = () => { dirty = false; send({ type: 'input', input: { ...input } }); };
    timer = setInterval(() => { if (dirty || input.x || input.y || input.a || input.b) pushIn(); }, 50);
    const zone = h('div', 'p-rt');
    if (spec.joystick) { const pad = h('div', 'p-joy'); const knob = h('div', 'p-knob'); pad.append(knob); let id = null, cx = 0, cy = 0, R = 1;
      const set = (x, y) => { input.x = x; input.y = y; knob.style.transform = `translate(${x * 42}px, ${-y * 42}px)`; dirty = true; };
      pad.addEventListener('pointerdown', e => { id = e.pointerId; pad.setPointerCapture(id); const r = pad.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2; move(e); });
      const move = e => { if (e.pointerId !== id) return; let x = (e.clientX - cx) / R, y = -(e.clientY - cy) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } set(+x.toFixed(2), +y.toFixed(2)); };
      pad.addEventListener('pointermove', move); const up = e => { if (e.pointerId !== id) return; id = null; set(0, 0); }; pad.addEventListener('pointerup', up); pad.addEventListener('pointercancel', up); zone.append(pad); }
    const ab = h('div', 'p-ab'); for (const o of spec.actionButtons || []) { const b = h('button', 'p-abtn', esc(o.label)); b.type = 'button'; const key = o.id === 'b' ? 'b' : 'a';
      const on = e => { e.preventDefault(); input[key] = true; dirty = true; if (navigator.vibrate) navigator.vibrate(8); }, off = () => { input[key] = false; dirty = true; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointerleave', off); b.addEventListener('pointercancel', off); ab.append(b); }
    zone.append(ab); root.append(zone);
    if (opts.keys) { const map = opts.keys; const down = new Set(); const upd = () => { input.x = (down.has(map.right) ? 1 : 0) - (down.has(map.left) ? 1 : 0); input.y = (down.has(map.up) ? 1 : 0) - (down.has(map.down) ? 1 : 0); input.a = down.has(map.a); input.b = down.has(map.b); dirty = true; };
      const kd = e => { if (Object.values(map).includes(e.code)) { down.add(e.code); upd(); e.preventDefault(); } }, ku = e => { if (down.delete(e.code)) upd(); };
      addEventListener('keydown', kd); addEventListener('keyup', ku); root._keys = () => { removeEventListener('keydown', kd); removeEventListener('keyup', ku); }; }
  }
  root._padStop = () => { clearInterval(timer); if (root._keys) { root._keys(); root._keys = null; } };
  if (!root.children.length) root.append(h('div', 'p-wait', '<i></i>Esperando…'));
}

export const PAD_CSS = `
.pad{display:flex;flex-direction:column;gap:10px;--pc:#ffb43c;color:#efeee9;font:15px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.p-title{font-size:22px;font-weight:800;color:var(--pc)}.p-text{color:#cfcdc7;white-space:pre-line}.p-prompt{font-weight:650;margin-bottom:4px}
.p-wait{display:flex;align-items:center;gap:10px;color:#9d9b96;background:rgba(255,255,255,.05);border-radius:14px;padding:12px}.p-wait i{width:10px;height:10px;border-radius:50%;background:var(--pc);animation:pw 1s infinite alternate}@keyframes pw{to{opacity:.2}}
.p-buttons,.p-choices{display:flex;flex-direction:column;gap:8px}.p-btn{border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:inherit;border-radius:16px;padding:16px;font:inherit;font-size:18px;font-weight:650;cursor:pointer;touch-action:manipulation}
.p-btn.primary{background:linear-gradient(135deg,#ff5434,#ffb43c);color:#1b0a00;border:0}.p-btn.danger{border-color:#ff5434;color:#ffb3a3}.p-btn:disabled{opacity:.4}
.p-row{display:flex;align-items:center;gap:10px;justify-content:center}.p-row b{font-size:28px;min-width:70px;text-align:center}.p-number{display:flex;flex-direction:column;gap:8px}
.p-cards{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px}.p-card{flex:none;min-width:110px;border-radius:12px;padding:10px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-top:5px solid var(--cc,#888);display:flex;flex-direction:column;gap:2px;text-align:left;color:inherit;font:inherit}.p-card small{color:#9d9b96}
.p-rt{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:8px 4px;user-select:none;-webkit-user-select:none;touch-action:none}
.p-joy{width:150px;height:150px;border-radius:50%;background:rgba(255,255,255,.07);border:2px solid rgba(255,255,255,.15);position:relative;touch-action:none}.p-knob{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:var(--pc);box-shadow:0 4px 18px rgba(0,0,0,.4)}
.p-ab{display:flex;flex-direction:column;gap:12px}.p-abtn{width:110px;height:110px;border-radius:50%;border:0;background:linear-gradient(135deg,#ff5434,#ffb43c);color:#1b0a00;font-size:20px;font-weight:800;touch-action:none}
`;
