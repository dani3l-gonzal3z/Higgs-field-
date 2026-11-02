// Arranca el entorno aislado de juegos (games/runtime.html) y habla con él por mensajes.
let BOOT = null;
export function bootFiles(base = '') {
  // three.js: la copia local si existe (funciona sin internet); si no (p. ej. dentro de Claude), el runtime lo carga de su CDN.
  const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
  if (!BOOT) BOOT = Promise.all([fetch(base + 'vendor/three/three.module.min.js').then(r => r.ok ? r.text() : null).catch(() => null), fetch(base + 'games/kit.js').then(r => r.text())]).then(([three, kit]) => ({ three, kit, threeUrl: THREE_CDN }));
  return BOOT;
}
export async function makeRuntime(container, { base = '', hidden = false } = {}) {
  const fr = document.createElement('iframe'); fr.src = base + 'games/runtime.html'; fr.setAttribute('sandbox', 'allow-scripts'); fr.setAttribute('allow', 'autoplay'); fr.className = 'g-runtime'; fr.title = 'Juego';
  if (hidden) fr.style.cssText = 'position:fixed;left:-2000px;top:0;width:480px;height:320px;border:0;opacity:0;pointer-events:none';
  const ls = new Set(); const on = e => { if (e.source !== fr.contentWindow || !e.data) return; for (const f of [...ls]) f(e.data); }; addEventListener('message', on);
  const rt = { frame: fr, send: m => fr.contentWindow && fr.contentWindow.postMessage(m, '*'), on: f => { ls.add(f); return () => ls.delete(f); },
    once: (type, ms = 20000) => new Promise((res, rej) => { const off = rt.on(m => { if (m.type === type) { off(); clearTimeout(t); res(m); } }); const t = setTimeout(() => { off(); rej(new Error('El juego no responde (' + type + ')')); }, ms); }),
    destroy: () => { removeEventListener('message', on); fr.remove(); } };
  const hello = rt.once('hello'); container.append(fr); await hello;
  const files = await bootFiles(base); const booted = rt.once('booted'); rt.send({ type: 'boot', ...files }); await booted; return rt;
}
export async function testGame(code, container = document.body) {
  const rt = await makeRuntime(container, { hidden: true });
  try { const res = rt.once('test-result', 45000); rt.send({ type: 'test', code }); return await res; } finally { rt.destroy(); }
}
