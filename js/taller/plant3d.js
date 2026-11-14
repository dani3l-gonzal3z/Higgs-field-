// Vista 3D y editor de la planta (three.js). La física y los módulos están en plant.js.
// Arrastra los módulos por el suelo, gíralos, cambia sus medidas y conecta cada señal a un pin de la placa o a un canal del útil.
import { el, btn, toast } from '../core.js';
import { MODULES, GROUPS, COLORS, ioKey } from './plant.js';

const D2R = Math.PI / 180, SNAP = 0.05;
let THREE = null, Orbit = null;
async function three() { if (!THREE) { THREE = await import('three'); ({ OrbitControls: Orbit } = await import('three/addons/controls/OrbitControls.js')); } return THREE; }

/* ---------- Materiales y piezas de construcción ---------- */
function kit() {
  const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...o });
  const mat = { metal: M('#a9b1b8', { metalness: 0.6, roughness: 0.35 }), dark: M('#3a3f45'), frame: M('#6f7a84', { metalness: 0.5, roughness: 0.4 }), yellow: M('#f2b705'), orange: M('#e8772e'), blue: M('#3b6ea8'),
    green: M('#2e9a4f'), red: M('#c8322b'), black: M('#1d1f22'), white: M('#eeeeee'), glass: M('#ffffff', { transparent: true, opacity: 0.35 }), floor: M('#cfd3d8', { roughness: 0.95 }) };
  const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; return o; };
  const cyl = (r, h, m, x = 0, y = 0, z = 0, axis = 'y') => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), m); o.position.set(x, y, z); if (axis === 'z') o.rotation.x = Math.PI / 2; if (axis === 'x') o.rotation.z = Math.PI / 2; o.castShadow = true; return o; };
  const label = (text, color = '#111') => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.roundRect(4, 14, 248, 68, 18); g.fill();
    g.fillStyle = color; g.font = 'bold 50px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 50); const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false })); s.scale.set(0.34, 0.13, 1); s.renderOrder = 10; return s; };
  const beltTex = () => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const g = c.getContext('2d'); g.fillStyle = '#2b2f33'; g.fillRect(0, 0, 64, 16); g.fillStyle = '#41474d'; for (let i = 0; i < 64; i += 16) g.fillRect(i, 0, 6, 16); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
  return { mat, box, cyl, label, beltTex };
}

// Cada módulo es un grupo; lo que se mueve o se enciende va en userData.a
function buildModule(K, m) {
  const { mat, box, cyl } = K; const g = new THREE.Group(); const p = m.p; const a = {}; g.userData = { mid: m.id, a };
  switch (m.type) {
    case 'cinta': { const L = p.largo, W = p.ancho, H = p.alto; const tex = K.beltTex(); tex.repeat.set(L / 0.12, 1);
      const belt = box(L, 0.02, W, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }), 0, H - 0.01, 0); g.add(belt); a.tex = tex;
      for (const s of [-1, 1]) { g.add(box(L, 0.08, 0.03, mat.frame, 0, H - 0.05, s * (W / 2 + 0.015))); if (p.barandillas) g.add(box(L, 0.03, 0.012, mat.yellow, 0, H + 0.07, s * (W / 2 + 0.03))); }
      for (const s of [-1, 1]) g.add(cyl(0.04, W, mat.metal, s * L / 2, H - 0.04, 0, 'z'));
      const n = Math.max(2, Math.ceil(L / 1.2) + 1); for (let i = 0; i < n; i++) { const x = -L / 2 + 0.08 + i * (L - 0.16) / (n - 1); for (const s of [-1, 1]) g.add(box(0.04, H - 0.06, 0.04, mat.frame, x, (H - 0.06) / 2, s * (W / 2 - 0.02))); }
      const mot = cyl(0.06, 0.16, mat.blue, L / 2 - 0.04, H - 0.06, W / 2 + 0.1, 'z'); g.add(mot); a.motor = mot; break; }
    case 'emisor': { const y = 1.35; for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(0.03, y + 0.15, 0.03, mat.frame, x * 0.2, (y + 0.15) / 2, z * 0.2));
      for (const s of [-1, 1]) { g.add(box(0.4, 0.22, 0.015, mat.orange, 0, y + 0.1, s * 0.2)); g.add(box(0.015, 0.22, 0.4, mat.orange, s * 0.2, y + 0.1, 0)); } g.add(box(0.44, 0.03, 0.44, mat.frame, 0, y + 0.22, 0)); break; }
    case 'sumidero': { const L = p.largo, W = p.ancho; g.add(box(L, 0.02, W, mat.blue, 0, 0.01, 0)); for (const s of [-1, 1]) { g.add(box(L, 0.45, 0.02, mat.blue, 0, 0.225, s * W / 2)); g.add(box(0.02, 0.45, W, mat.blue, s * L / 2, 0.225, 0)); } break; }
    case 'fotocelula': { const L = p.largo / 2, h = p.altura; for (const s of [-1, 1]) { g.add(box(0.03, h + 0.08, 0.03, mat.frame, 0, (h + 0.08) / 2, s * L)); g.add(box(0.05, 0.07, 0.05, s < 0 ? mat.dark : mat.yellow, 0, h, s * (L - 0.03))); }
      const beam = cyl(0.004, p.largo - 0.1, new THREE.MeshBasicMaterial({ color: '#ff2a2a', transparent: true, opacity: 0.8 }), 0, h, 0, 'z'); beam.castShadow = false; g.add(beam); a.beam = beam; break; }
    case 'inductivo': case 'color': { const h = p.altura; g.add(box(0.03, h, 0.03, mat.frame, 0, h / 2, -0.03)); const body = cyl(0.022, 0.08, m.type === 'color' ? mat.black : mat.metal, 0, h, 0.02, 'z'); g.add(body);
      if (m.type === 'color') { const lens = cyl(0.014, 0.004, new THREE.MeshBasicMaterial({ color: COLORS[p.busca] || '#fff' }), 0, h, 0.062, 'z'); g.add(lens); }
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), new THREE.MeshBasicMaterial({ color: '#552' })); led.position.set(0, h + 0.03, 0.02); g.add(led); a.led = led; break; }
    case 'bascula': { g.add(box(p.largo + 0.04, 0.03, p.ancho + 0.04, mat.metal, 0, p.altura - 0.075, 0)); g.add(box(0.05, p.altura - 0.09, 0.05, mat.frame, 0, (p.altura - 0.09) / 2, 0));
      const scr = box(0.16, 0.08, 0.02, new THREE.MeshBasicMaterial({ color: '#0d2' }), 0, p.altura - 0.3, -(p.ancho / 2 + 0.06)); g.add(scr); a.scr = scr; break; }
    case 'empujador': { const y = 0.87; g.add(box(0.04, y, 0.04, mat.frame, 0, y / 2, -0.32)); g.add(cyl(0.045, 0.32, mat.metal, 0, y, -0.15, 'z'));
      const rod = cyl(0.012, 1, mat.metal, 0, y, 0, 'z'); g.add(rod); const pad = box(0.36, 0.1, 0.04, mat.yellow, 0, y, 0.08); g.add(pad); a.rod = rod; a.pad = pad; a.y = y; break; }
    case 'tope': { g.add(box(0.06, 0.6, 0.06, mat.frame, 0, 0.3, -(p.ancho / 2 + 0.08))); const bar = box(0.03, 0.05, p.ancho, mat.red, 0, 0.74, 0); g.add(bar); a.bar = bar; break; }
    case 'torre': { g.add(cyl(0.015, 1.5, mat.frame, 0, 0.75, 0)); const L = {}; [['verde', '#1ec95a'], ['ambar', '#ffb300'], ['rojo', '#ff2d2d']].forEach(([k, c], i) => { const mm = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0, transparent: true, opacity: 0.9 }); L[k] = cyl(0.05, 0.09, mm, 0, 1.55 + i * 0.095, 0); g.add(L[k]); });
      g.add(cyl(0.05, 0.05, mat.black, 0, 1.55 + 3 * 0.095 - 0.02, 0)); a.L = L; break; }
    case 'panel': { g.add(box(0.12, 0.95, 0.12, mat.frame, 0, 0.475, 0)); const top = box(0.36, 0.06, 0.24, mat.yellow, 0, 1.0, 0); top.rotation.x = -0.35; g.add(top);
      const bt = (k, mm, x, r = 0.025, h = 0.03) => { const o = cyl(r, h, mm, x, 1.04, 0.0); o.rotation.x = -0.35; o.userData.btn = k; g.add(o); return o; };
      bt('marcha', mat.green, -0.12); bt('paro', mat.red, -0.04); a.seta = bt('seta', mat.red, 0.05, 0.04, 0.04); bt('auto', mat.black, 0.13, 0.02, 0.05);
      const luz = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: '#333' })); luz.position.set(0, 1.06, -0.08); g.add(luz); a.luz = luz; break; }
  }
  const top = { cinta: p.alto + 0.35, emisor: 1.8, sumidero: 0.75, fotocelula: p.altura + 0.3, inductivo: p.altura + 0.2, color: p.altura + 0.2, bascula: p.altura + 0.4, empujador: 1.15, tope: 1.05, torre: 2.05, panel: 1.35 }[m.type] || 1;
  const lab = K.label(m.id); lab.position.set(0, top, 0); g.add(lab);
  g.position.set(m.x, 0, m.z); g.rotation.y = (m.rot || 0) * D2R; return g;
}

/* ---------- La vista ---------- */
// opts: { plant, pinOptions(dir, type) → [[valor, texto]], getIO() → io | null, isRunning(), onChange(), controllerBar() → nodo, extraOverview() → nodo }
export async function plantView(opts) {
  await three(); const P = opts.plant; const K = kit();
  const root = el('div', { class: 'pl' }); const view = el('div', { class: 'pl-view', tabindex: 0 }); const side = el('div', { class: 'pl-side' }); const hud = el('div', { class: 'pl-hud' }); const pad = el('div', { class: 'pl-pad' });
  const bar = el('div', { class: 'pl-bar' }); root.append(bar, el('div', { class: 'pl-main' }, el('div', { class: 'pl-vwrap' }, view, hud, pad), side));
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; view.append(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9edf1'); scene.fog = new THREE.Fog('#e9edf1', 18, 45);
  const cam = new THREE.PerspectiveCamera(45, 1, 0.05, 200); cam.position.set(3.5, 3.8, 5.2);
  const ctl = new Orbit(cam, renderer.domElement); ctl.target.set(0.3, 0.6, 0); ctl.maxPolarAngle = Math.PI * 0.48; ctl.enableDamping = true; ctl.update();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f96', 1.1)); const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(5, 9, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 30 }); scene.add(sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), K.mat.floor); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(40, 80, '#9aa1a8', '#b9bec4'); grid.position.y = 0.002; scene.add(grid);
  const modsG = new THREE.Group(), itemsG = new THREE.Group(); scene.add(modsG, itemsG);
  const groups = new Map(); let sel = null, selBox = null; let manual = false; let disposed = false;
  const itemGeo = new THREE.BoxGeometry(1, 1, 1); const itemMat = {}; const itemMesh = new Map();
  const colorMat = c => itemMat[c] || (itemMat[c] = new THREE.MeshStandardMaterial({ color: COLORS[c] || c, roughness: c === 'metal' ? 0.3 : 0.7, metalness: c === 'metal' ? 0.8 : 0.05 }));

  function rebuild(id) { for (const [mid, g] of groups) if (!id || mid === id) { modsG.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); groups.delete(mid); }
    for (const m of P.modules) if (!groups.has(m.id)) { const g = buildModule(K, m); modsG.add(g); groups.set(m.id, g); } markSel(); if (pad.childElementCount !== P.modules.filter(m => m.type === 'panel').length) paintPad(); }
  function place(m) { const g = groups.get(m.id); if (g) { g.position.set(m.x, 0, m.z); g.rotation.y = (m.rot || 0) * D2R; } markSel(); }
  function markSel() { if (selBox) { scene.remove(selBox); selBox = null; } const g = sel && groups.get(sel); if (g) { selBox = new THREE.BoxHelper(g, '#1f7aff'); scene.add(selBox); } }
  const changed = () => { opts.onChange && opts.onChange(); };

  /* ── barra de herramientas ── */
  const addMenu = el('div', { class: 'pl-add', hidden: true });
  for (const [gk, gt] of GROUPS) { addMenu.append(el('b', {}, gt)); for (const [t, info] of Object.entries(MODULES).filter(([, i]) => i.group === gk)) addMenu.append(btn(`${info.icon} ${info.name}`, () => { addMenu.hidden = true; addAt(t); }, 'mini-b')); }
  function addAt(type) { const tgt = ctl.target; const m = P.add(type, snap(tgt.x), snap(tgt.z), 0); rebuild(); select(m.id); changed(); toast(`${MODULES[type].name} añadido: arrástralo a su sitio`, 1600); }
  const runBtn = btn('▶ Probar la planta', () => { manual = !manual; paintBar(); }, 'b');
  function paintBar() { const ext = opts.isRunning && opts.isRunning(); runBtn.textContent = ext ? '● Con la placa' : manual ? '⏸ Parar la planta' : '▶ Probar sin placa'; runBtn.classList.toggle('on', ext || manual); runBtn.disabled = !!ext; }
  bar.append(btn('＋ Módulo', () => { addMenu.hidden = !addMenu.hidden; }, 'b'), runBtn, btn('↺ Vaciar', () => { P.reset(); for (const [, mm] of itemMesh) itemsG.remove(mm); itemMesh.clear(); }, 'b'),
    btn('⟲', () => rotSel(-15), 'b'), btn('⟳', () => rotSel(15), 'b'), btn('⧉', dupSel, 'b'), btn('🗑', delSel, 'b'), btn('🎯', frameAll, 'b'), addMenu);
  const snap = v => +(Math.round(v / SNAP) * SNAP).toFixed(2);
  function rotSel(d) { const m = selM(); if (!m) return toast('Elige un módulo', 900); m.rot = (((m.rot || 0) + d) % 360 + 360) % 360; place(m); changed(); panel(); }
  function dupSel() { const m = selM(); if (!m) return; const n = P.add(m.type, m.x + 0.3, m.z + 0.3, m.rot, JSON.parse(JSON.stringify(m.p))); rebuild(); select(n.id); changed(); }
  function delSel() { const m = selM(); if (!m) return; P.remove(m.id); sel = null; rebuild(); changed(); panel(); }
  function frameAll() { if (!P.modules.length) return; const xs = P.modules.map(m => m.x), zs = P.modules.map(m => m.z); const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cz = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(3, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) / Math.min(1, cam.aspect * 1.1); ctl.target.set(cx, 0.6, cz); cam.position.set(cx + span * 0.7, span * 0.75 + 1, cz + span * 1.0); ctl.update(); }
  const selM = () => P.modules.find(m => m.id === sel);
  function select(id) { sel = id; markSel(); panel(); }

  /* ── ratón: elegir, arrastrar, pulsar botones de la botonera ── */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3();
  const pick = e => { const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam); };
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', e => { if (e.button !== 0) return; pick(e); const hits = ray.intersectObjects(modsG.children, true); const h = hits.find(x => !(x.object instanceof THREE.Sprite)) || hits[0];
    if (!h) { drag = { none: true, x: e.clientX, y: e.clientY }; return; }
    let o = h.object; const b = o.userData.btn; while (o && !o.userData.mid) o = o.parent; if (!o) return; const mid = o.userData.mid;
    if (b) { const u = P.ui[mid] = P.ui[mid] || {}; if (b === 'seta') u.seta = true; else if (b === 'auto') u.auto = u.auto === false; else { u[b] = true; drag = { btn: [mid, b] }; } ctl.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); return; }
    if (sel !== mid) select(mid); const m = selM(); ray.ray.intersectPlane(plane, hit); drag = { mid, dx: hit.x - m.x, dz: hit.z - m.z, moved: false }; ctl.enabled = false; renderer.domElement.setPointerCapture(e.pointerId); });
  renderer.domElement.addEventListener('pointermove', e => { if (!drag || drag.none || drag.btn) return; pick(e); if (!ray.ray.intersectPlane(plane, hit)) return; const m = selM(); if (!m) return;
    const x = snap(hit.x - drag.dx), z = snap(hit.z - drag.dz); if (x !== m.x || z !== m.z) { m.x = x; m.z = z; drag.moved = true; place(m); } });
  renderer.domElement.addEventListener('pointerup', e => { ctl.enabled = true; if (!drag) return;
    if (drag.btn) { const [mid, b] = drag.btn; (P.ui[mid] || {})[b] = false; }
    else if (drag.none) { if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4 && sel) select(null); }
    else if (drag.moved) { changed(); panel(); } drag = null; });
  view.addEventListener('keydown', e => { if (e.target !== view) return; if (e.key === 'Delete' || e.key === 'Backspace') { delSel(); e.preventDefault(); } else if (e.key === 'r' || e.key === 'R') rotSel(e.shiftKey ? -90 : 90); else if ((e.ctrlKey || e.metaKey) && e.key === 'd') { dupSel(); e.preventDefault(); } else if (e.key === 'Escape') select(null); });

  /* ── panel lateral ── */
  const live = []; // [nodo, () => texto]
  function sigRow(k, dir, type, label) {
    const cur = P.map[k] || ''; const used = new Map(Object.entries(P.map).filter(([kk]) => kk !== k).map(([kk, v]) => [v, kk]));
    const s = el('select', { class: 'pl-sel', on: { change: e => { if (e.target.value) P.map[k] = e.target.value; else delete P.map[k]; changed(); panel(); } } }, el('option', { value: '' }, '— sin conectar —'),
      ...opts.pinOptions(dir, type).map(([v, t]) => el('option', { value: v }, t + (used.has(v) ? `  (ya: ${used.get(v)})` : ''))));
    s.value = cur;
    const val = el('code', { class: 'pl-val' }); live.push([val, () => { const v = dir === 'in' ? P.sens[k] : P.outs[k]; return v == null ? '·' : typeof v === 'number' ? (type === 'a' ? v.toFixed(2) + ' V' : Math.round(v * 100) + ' %') : v ? '1' : '0'; }]);
    const fopts = type === 'a' ? [['', 'auto'], ['0', '0 V'], ['1.65', '1,65 V'], ['3.3', '3,3 V']] : type === 'enc' ? [] : [['', 'auto'], ['0', '0'], ['1', '1']];
    const f = fopts.length ? el('select', { class: 'pl-force', title: dir === 'in' ? 'Forzar el sensor (inyectar un fallo)' : 'Forzar el actuador a mano', on: { change: e => { const v = e.target.value; if (v === '') delete P.force[k]; else P.force[k] = type === 'a' ? +v : v === '1'; } } }, ...fopts.map(([v, t]) => el('option', { value: v }, t))) : '';
    if (f) f.value = P.force[k] == null ? '' : type === 'a' ? String(P.force[k]) : P.force[k] ? '1' : '0';
    return el('div', { class: 'pl-sig' + (cur ? ' on' : '') }, el('span', { class: 'pl-dir' }, dir === 'in' ? '→ placa' : '← placa'), el('span', { class: 'pl-lab' }, el('b', {}, k), ' ', label), s, val, f);
  }
  function param(m, k, v0) { const set = v => { m.p[k] = v; rebuild(m.id); changed(); };
    if (typeof v0 === 'boolean') return el('label', { class: 'pl-p' }, el('span', {}, k), el('input', { type: 'checkbox', checked: !!m.p[k], on: { change: e => set(e.target.checked) } }));
    if (k === 'fallo') { const s = el('select', { on: { change: e => set(e.target.value) } }, ...['ninguno', 'siempre', 'nunca', 'intermitente', ...(m.type === 'empujador' ? ['atascado'] : [])].map(x => el('option', { value: x }, x))); s.value = m.p[k]; return el('label', { class: 'pl-p' }, el('span', {}, 'fallo'), s); }
    if (k === 'busca') { const s = el('select', { on: { change: e => set(e.target.value) } }, ...Object.keys(COLORS).map(x => el('option', { value: x }, x))); s.value = m.p[k]; return el('label', { class: 'pl-p' }, el('span', {}, 'busca'), s); }
    if (k === 'modo') { const s = el('select', { on: { change: e => set(e.target.value) } }, el('option', { value: 'auto' }, 'solo, cada «cada» s'), el('option', { value: 'señal' }, 'cuando lo pida la placa')); s.value = m.p[k]; return el('label', { class: 'pl-p' }, el('span', {}, 'modo'), s); }
    return el('label', { class: 'pl-p' }, el('span', {}, k), el('input', { class: 'txt', type: typeof v0 === 'number' ? 'number' : 'text', step: 'any', value: String(m.p[k]), on: { change: e => set(typeof v0 === 'number' ? (+e.target.value || 0) : e.target.value) } }));
  }
  function panel() { live.length = 0; side.innerHTML = ''; const m = selM();
    if (!m) { side.append(el('div', { class: 'pl-h' }, el('b', {}, '🏭 ' + (P.title || 'Tu planta')), el('small', {}, `${P.modules.length} módulos`)));
      if (opts.controllerBar) side.append(opts.controllerBar());
      const sigs = P.signals(); const on = sigs.filter(s => P.map[s[0]]);
      side.append(el('div', { class: 'pl-h' }, el('b', {}, '🔗 Señales'), el('small', {}, `${on.length} de ${sigs.length} conectadas`)));
      if (opts.extraOverview) side.append(opts.extraOverview());
      for (const [k, dir, type, label] of sigs) side.append(sigRow(k, dir, type, label));
      if (!sigs.length) side.append(el('p', { class: 'muted' }, 'Añade módulos con «＋ Módulo» o carga un ejemplo.'));
      side.append(el('p', { class: 'muted pl-tip' }, 'Toca un módulo para editarlo; arrástralo para moverlo (R gira, Supr borra). «→ placa» son los sensores que la placa lee; «← placa», lo que la placa manda.'));
      return; }
    const info = MODULES[m.type];
    side.append(el('div', { class: 'pl-h' }, el('b', {}, `${info.icon} ${m.id} · ${info.name}`), btn('✕', () => select(null), 'mini-b')), el('p', { class: 'muted' }, info.help));
    const pos = (k, label, step) => el('label', { class: 'pl-p' }, el('span', {}, label), el('input', { class: 'txt', type: 'number', step, value: String(m[k] || 0), on: { change: e => { m[k] = +e.target.value || 0; place(m); changed(); } } }));
    side.append(el('div', { class: 'pl-grid' }, pos('x', 'x (m)', 0.05), pos('z', 'z (m)', 0.05), pos('rot', 'giro (°)', 15)));
    side.append(el('div', { class: 'pl-grid' }, ...Object.entries(info.params).map(([k, v]) => param(m, k, v))));
    side.append(el('div', { class: 'pl-h' }, el('b', {}, '🔗 Señales')));
    for (const [k, dir, type, label] of info.io) side.append(sigRow(ioKey(m, k), dir, type, label));
    if (m.type === 'sumidero') { const c = el('div', { class: 'pl-count' }); live.push([c, () => { const s = P.state[m.id] || { n: 0, por: {} }; return `${s.n} piezas · ` + Object.entries(s.por).map(([t, n]) => `${t} ${n}`).join(' · '); }]); side.append(c); }
  }

  /* ── botonera y contadores sobre la vista ── */
  const padLive = [];
  function paintPad() { pad.innerHTML = ''; padLive.length = 0; for (const m of P.modules.filter(m => m.type === 'panel')) { const u = () => (P.ui[m.id] = P.ui[m.id] || {});
      const hold = (k, label, cls) => { const b = el('button', { class: 'pl-pb ' + cls, type: 'button' }, label); const on = v => { u()[k] = v; b.classList.toggle('down', v); };
        b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); on(true); }); b.addEventListener('pointerup', () => on(false)); b.addEventListener('pointercancel', () => on(false)); return b; };
      const seta = el('button', { class: 'pl-pb seta', type: 'button', on: { click: () => { u().seta = true; } } }, 'SETA'); const auto = el('button', { class: 'pl-pb sel', type: 'button', on: { click: () => { u().auto = u().auto === false; } } }, 'AUTO');
      padLive.push([seta, () => (P.state[m.id] || {}).seta ? 'SETA ⛔' : 'SETA'], [auto, () => u().auto === false ? 'MAN' : 'AUTO']);
      pad.append(el('div', { class: 'pl-pbox' }, el('small', {}, m.id), hold('marcha', 'I', 'go'), hold('paro', 'O', 'stop'), seta, auto)); } }

  /* ── bucle: física + pintado ── */
  const ro = new ResizeObserver(() => { const w = view.clientWidth, h = view.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }); ro.observe(view);
  let last = performance.now(), acc = 0, liveT = 0, lastClock = null; const nullIO = { out: () => false, in: () => {}, enc: null };
  function frame(now) { if (disposed) return; requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const ext = opts.isRunning && opts.isRunning(); const io = ext ? opts.getIO() : null;
    // Con la placa simulada, la planta va al ritmo de SU reloj (si el emulador va lento, el mundo también: la placa nunca ve el futuro)
    let sdt = dt; const c = ext && opts.clock ? opts.clock() : null; if (c != null) { sdt = lastClock == null || c < lastClock ? 0 : Math.min(0.1, c - lastClock); lastClock = c; } else lastClock = null;
    if (ext || manual) { acc += sdt; let n = 0; while (acc >= 1 / 120 && n++ < 24) { P.step(1 / 120, io || nullIO); acc -= 1 / 120; } } else acc = 0;
    paint(); ctl.update(); renderer.render(scene, cam);
    if (now - liveT > 150) { liveT = now; for (const [node, f] of [...live, ...padLive]) { const t = f(); if (node.textContent !== t) node.textContent = t; } hudPaint(); paintBar(); } }
  function paint() { const S = P.state; const blink = (performance.now() / 300 | 0) % 2;
    for (const m of P.modules) { const g = groups.get(m.id); if (!g) continue; const a = g.userData.a, s = S[m.id] || {};
      if (m.type === 'cinta') { a.tex.offset.x = -(s.pos || 0) / 0.12; a.motor.material = Math.abs(s.v || 0) > 0.01 ? K.mat.green : K.mat.blue; }
      else if (m.type === 'fotocelula') { a.beam.material.opacity = s.hit ? 0.15 : 0.85; }
      else if (m.type === 'inductivo' || m.type === 'color') { a.led.material.color.set(P.sens[ioKey(m, 'det')] ? '#ffcc00' : s.hit ? '#3a6' : '#442'); }
      else if (m.type === 'empujador') { const ext = (s.x || 0) * m.p.carrera; a.pad.position.z = 0.08 + ext; a.rod.scale.y = ext + 0.08; a.rod.position.z = 0.005 + (ext + 0.08) / 2; }
      else if (m.type === 'tope') a.bar.position.y = 0.74 + (s.up || 0) * 0.12;
      else if (m.type === 'torre') { for (const k of ['verde', 'ambar', 'rojo']) a.L[k].material.emissiveIntensity = s[k] ? 1.4 : 0; if (s.sirena) a.L.rojo.material.emissiveIntensity = blink ? 1.6 : 0.2; }
      else if (m.type === 'panel') { a.luz.material.color.set(s.luz ? '#5f5' : '#333'); a.seta.position.y = s.seta ? 1.02 : 1.04; }
      else if (m.type === 'bascula') a.scr.material.color.set((s.kg || 0) > 0 ? '#2f8' : '#0a3'); }
    const seen = new Set(); for (const it of P.items) { seen.add(it.id); let mm = itemMesh.get(it.id); if (!mm) { mm = new THREE.Mesh(itemGeo, colorMat(it.color)); mm.castShadow = true; mm.scale.set(it.w, it.h, it.d); itemsG.add(mm); itemMesh.set(it.id, mm); }
      mm.position.set(it.x, it.y + it.h / 2, it.z); mm.rotation.y = (it.rot || 0) * D2R; }
    for (const [id, mm] of itemMesh) if (!seen.has(id)) { itemsG.remove(mm); itemMesh.delete(id); }
    if (selBox) selBox.update(); }
  function hudPaint() { const st = P.stats; const bins = P.modules.filter(m => m.type === 'sumidero').map(m => { const s = P.state[m.id] || { n: 0, por: {} }; return `${m.id}: ${s.n}` + (Object.keys(s.por).length ? ' (' + Object.entries(s.por).map(([t, n]) => `${t} ${n}`).join(', ') + ')' : ''); });
    const t = `⏱ ${P.t.toFixed(1)} s · 📦 ${st.emitidas} soltadas · ${P.items.length} en línea${st.suelo ? ` · ⚠ ${st.suelo} al suelo` : ''}${bins.length ? '\n' + bins.join('\n') : ''}`; if (hud.textContent !== t) hud.textContent = t; }

  rebuild(); panel(); paintPad(); paintBar(); requestAnimationFrame(t => { last = t; frame(t); }); setTimeout(frameAll, 50);
  return { el: root, refresh: () => { sel = null; rebuild(); panel(); paintPad(); frameAll(); }, panel: () => panel(), pads: () => paintPad(),
    dispose: () => { disposed = true; ro.disconnect(); ctl.dispose(); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } };
}
