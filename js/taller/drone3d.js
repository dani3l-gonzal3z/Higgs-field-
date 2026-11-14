// 🚁 Vista del dron: el mundo en 3D, las dos cámaras de a bordo, el piloto (Plató o tu placa por red) y las órdenes.
import { el, btn, toast, download } from '../core.js';
import { Drone, Bird, Zone, Pilot, CAM, enu, fromEnu, findBird, parseOrder } from './drone.js';
import { RdkLink } from './rdklink.js';
import { codeEditor } from './editor.js';

let THREE = null, Orbit = null;
async function three() { if (!THREE) { THREE = await import('three'); ({ OrbitControls: Orbit } = await import('three/addons/controls/OrbitControls.js')); } return THREE; }
const D2R = Math.PI / 180;
export const RDK_FILES = ['plato_bridge.py', 'mision.py', 'ros2_bridge.py', 'README.md'];
// Los archivos de la placa (algunos alojamientos no sirven .py: entonces se busca .py.txt)
export async function rdkFile(name) { const base = new URL('../../drone/rdk/' + name, import.meta.url).href;
  for (const u of [base, base + '.txt']) { try { const r = await fetch(u); if (r.ok) { const t = await r.text(); if (!/^\s*<!doctype html/i.test(t)) return t; } } catch (e) {} } throw new Error('No encuentro ' + name); }

// Generador de números al azar con semilla (el bosque sale igual siempre)
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function buildWorld(scene, zone) {
  const R = rng(7); const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...o });
  // suelo: hierba con manchas
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d'); g.fillStyle = '#5f8f3e'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2500; i++) { g.fillStyle = ['#5a8a3a', '#68984a', '#557f36', '#6d9c4c'][i % 4]; g.globalAlpha = 0.5; g.beginPath(); g.arc(R() * 512, R() * 512, 2 + R() * 10, 0, 7); g.fill(); } g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(40, 40);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshStandardMaterial({ map: tex, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; ground.name = 'suelo'; scene.add(ground);
  // la parcela que mapear: un campo con surcos
  const fc = document.createElement('canvas'); fc.width = 256; fc.height = 256; const fg = fc.getContext('2d'); fg.fillStyle = '#b89a5a'; fg.fillRect(0, 0, 256, 256); fg.fillStyle = '#8f7440'; for (let y = 0; y < 256; y += 8) fg.fillRect(0, y, 256, 3);
  fg.fillStyle = '#4d7a2f'; for (let i = 0; i < 40; i++) { fg.beginPath(); fg.arc(R() * 256, R() * 256, 3 + R() * 6, 0, 7); fg.fill(); }
  const ft = new THREE.CanvasTexture(fc); const field = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: ft, roughness: 1 })); field.rotation.x = -Math.PI / 2; field.position.y = 0.03; scene.add(field);
  const zl = new THREE.LineLoop(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffe14d' })); zl.position.y = 0.08; scene.add(zl);
  const setZone = () => { const [x0, y0] = zone.a, [x1, y1] = zone.b; field.scale.set(x1 - x0, y1 - y0, 1); field.position.set((x0 + x1) / 2, 0.03, -(y0 + y1) / 2);
    zl.geometry.setFromPoints([new THREE.Vector3(x0, 0, -y0), new THREE.Vector3(x1, 0, -y0), new THREE.Vector3(x1, 0, -y1), new THREE.Vector3(x0, 0, -y1)]); };
  setZone();
  // árboles (un bosque disperso; nada rojo en la escena salvo el pájaro, para que la visión sea honesta)
  const N = 260, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), M('#6b4a2f'), N), crown = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 6, 8), M('#2f6b34'), N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(); let k = 0;
  while (k < N) { const x = (R() - 0.5) * 500, z = (R() - 0.5) * 500; if (Math.hypot(x, z) < 25) continue; if (x > zone.a[0] - 8 && x < zone.b[0] + 8 && -z > zone.a[1] - 8 && -z < zone.b[1] + 8) continue;
    const s = 0.7 + R() * 0.8; sc.set(s, s, s); m4.compose(new THREE.Vector3(x, 1.5 * s, z), q, sc); trunk.setMatrixAt(k, m4); m4.compose(new THREE.Vector3(x, (3 + 3) * s, z), q, sc); crown.setMatrixAt(k, m4); k++; }
  trunk.castShadow = crown.castShadow = true; scene.add(trunk, crown);
  // casas
  for (let i = 0; i < 9; i++) { const x = -80 + i * 22 + R() * 6, z = 40 + R() * 25, w = 8 + R() * 5, d = 7 + R() * 4, h = 4 + R() * 2;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(['#d8d2c4', '#c9c1ae', '#e3ddd0'][i % 3])); b.position.set(x, h / 2, z); b.castShadow = true; scene.add(b);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.02, 2.5, 4), M('#6d6a66')); roof.position.set(x, h + 1.25, z); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414); scene.add(roof); }
  // helipuerto
  const pad = new THREE.Mesh(new THREE.CircleGeometry(3, 32), M('#3a3f45')); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.04; scene.add(pad);
  const hc = document.createElement('canvas'); hc.width = hc.height = 128; const hg = hc.getContext('2d'); hg.fillStyle = '#fff'; hg.font = 'bold 100px system-ui'; hg.textAlign = 'center'; hg.textBaseline = 'middle'; hg.fillText('H', 64, 70);
  const hm = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(hc), transparent: true })); hm.rotation.x = -Math.PI / 2; hm.position.y = 0.05; scene.add(hm);
  return { setZone, ground };
}
function droneMesh() { const g = new THREE.Group(); const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.3 });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.24), M('#2b2f36'))); const rot = [];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.03, 0.03), M('#3d434c')); arm.position.set(x * 0.15, 0, z * 0.15); arm.rotation.y = Math.atan2(-z, x); g.add(arm);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.008, 18), new THREE.MeshStandardMaterial({ color: '#9fb4c8', transparent: true, opacity: 0.55 })); r.position.set(x * 0.29, 0.06, z * 0.29); g.add(r); rot.push(r); }
  const cam = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.12), M('#111')); cam.position.set(0.19, -0.07, 0); g.add(cam); g.traverse(o => { o.castShadow = true; });
  g.scale.setScalar(2.2); g.userData.rot = rot; return g; }
function birdMesh() { const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: '#ff5a1f' }); // color vivo y sin sombrear: la visión lo busca por color
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), m); body.scale.set(1.8, 0.8, 0.8); g.add(body);
  const wg = new THREE.PlaneGeometry(0.4, 0.9); wg.translate(0, 0.45, 0); const w1 = new THREE.Mesh(wg, new THREE.MeshBasicMaterial({ color: '#ff5a1f', side: THREE.DoubleSide })); const w2 = w1.clone();
  g.add(w1, w2); g.userData.w = [w1, w2]; return g; }

/* ---------- La vista ---------- */
export async function droneView(opts = {}) {
  await three(); const say = opts.say || (() => {});
  const S = { mode: 'plato', url: localStorage.getItem('plato.dron.url') || 'ws://rdk-x5.local:8765', zoneMode: 0 };
  const drone = new Drone(), bird = new Bird(), zone = new Zone(), pilot = new Pilot(), link = new RdkLink();
  const root = el('div', { class: 'dr' }); const vw = el('div', { class: 'dr-vwrap' }); const hud = el('div', { class: 'dr-hud' }); const pipC = el('canvas', { class: 'dr-pip', width: 320, height: 180 }); const mapImg = el('img', { class: 'dr-map', hidden: true, alt: 'Mapa' });
  const side = el('div', { class: 'dr-side' }); root.append(vw, side); vw.append(hud, pipC, mapImg);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false }); renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1)); renderer.shadowMap.enabled = true; vw.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#bcd6ee'); scene.fog = new THREE.Fog('#bcd6ee', 90, 320);
  scene.add(new THREE.HemisphereLight('#ffffff', '#55703a', 1.0)); const sun = new THREE.DirectionalLight('#fff', 1.8); sun.position.set(60, 120, 40); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, far: 400 }); scene.add(sun, sun.target);
  const world = buildWorld(scene, zone); const dm = droneMesh(), bm = birdMesh(); scene.add(dm, bm);
  const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 1000); cam.position.set(-14, 9, 16); const ctl = new Orbit(cam, renderer.domElement); ctl.target.set(0, 1, 0); ctl.enableDamping = true; ctl.maxPolarAngle = Math.PI * 0.495; ctl.update();
  // cámaras de a bordo: dos, separadas 6 cm, con el mismo campo que la de verdad
  const vfov = 2 * Math.atan(Math.tan(CAM.hfov / 2 * D2R) * CAM.h / CAM.w) / D2R; const camL = new THREE.PerspectiveCamera(vfov, CAM.w / CAM.h, 0.1, 600), camR = camL.clone();
  const rtFull = new THREE.WebGLRenderTarget(CAM.w, CAM.h), rtSmall = new THREE.WebGLRenderTarget(320, 180); const px = new Uint8Array(CAM.w * CAM.h * 4), pxs = new Uint8Array(320 * 180 * 4);
  const enc = document.createElement('canvas'); enc.width = CAM.w; enc.height = CAM.h; const encG = enc.getContext('2d'); const imgD = encG.createImageData(CAM.w, CAM.h);
  let boxes = [], frameN = 0, encBusy = false, last = performance.now(), acc = 0, tPilot = 0, tTelem = 0, tFrame = 0, disposed = false, logLines = [];
  const log = t => { logLines.push(t); logLines = logLines.slice(-60); if (R.log) { R.log.textContent = logLines.join('\n'); R.log.scrollTop = R.log.scrollHeight; } say(t); };
  pilot.log = t => log('🧠 ' + t);

  function placeCams() { const e = enu(drone.p); const y = drone.yaw, p = drone.gimbal * D2R; const f = new THREE.Vector3(...fromEnu([Math.cos(y) * Math.cos(p), Math.sin(y) * Math.cos(p), Math.sin(p)]));
    const left = new THREE.Vector3(...fromEnu([-Math.sin(y), Math.cos(y), 0])); const up = new THREE.Vector3().crossVectors(f, left).normalize(); const o = new THREE.Vector3(...fromEnu(e)).add(new THREE.Vector3(0, -0.15, 0));
    for (const [c, off] of [[camL, 0], [camR, -CAM.baseline]]) { c.position.copy(o).addScaledVector(left, off); c.up.copy(up); c.lookAt(c.position.clone().add(f)); } }
  // Una foto de la cámara: píxeles de arriba abajo (como cualquier imagen)
  function grab(c, rt, buf, w, h) { renderer.setRenderTarget(rt); renderer.render(scene, c); renderer.readRenderTargetPixels(rt, 0, 0, w, h, buf); renderer.setRenderTarget(null);
    const row = w * 4, tmp = new Uint8Array(row); for (let y = 0; y < h / 2; y++) { const a = y * row, b = (h - 1 - y) * row; tmp.set(buf.subarray(a, a + row)); buf.copyWithin(a, b, b + row); buf.set(tmp, b); } return buf; }
  async function sendJpeg(kind, c) { grab(c, rtFull, px, CAM.w, CAM.h); imgD.data.set(px); encG.putImageData(imgD, 0, 0); const blob = await new Promise(r => enc.toBlob(r, 'image/jpeg', 0.72)); if (blob) link.sendFrame(kind, frameN, await blob.arrayBuffer()); }

  /* ── panel ── */
  const R = {};
  function panel() { side.innerHTML = '';
    side.append(el('div', { class: 'pl-h' }, el('b', {}, '🚁 Dron con visión'), el('small', {}, 'RDK X5 · dos cámaras')));
    const seg = el('div', { class: 'tl-seg' }, btn('🧠 Piloto de Plató', () => setMode('plato'), 'mini-b' + (S.mode === 'plato' ? ' on' : '')), btn('🔌 Mi placa por red', () => setMode('rdk'), 'mini-b' + (S.mode === 'rdk' ? ' on' : ''))); side.append(seg);
    if (S.mode === 'plato') side.append(el('p', { class: 'muted' }, 'Plató hace de cabeza del dron con la misma lógica que mision.py: mira la imagen de la cámara, busca al pájaro por color y vuela. Sirve para probar antes de conectar la placa.'));
    else { const url = el('input', { class: 'txt', value: S.url, placeholder: 'ws://192.168.1.50:8765', on: { change: e => { S.url = e.target.value.trim(); try { localStorage.setItem('plato.dron.url', S.url); } catch (er) {} } } });
      side.append(el('p', { class: 'muted' }, 'Tu placa ve por sus dos cámaras (Plató le manda las imágenes que renderiza), piensa con su procesador y manda las órdenes de vuelo. En la placa: python3 plato_bridge.py'), url,
        el('div', { class: 'pl-row' }, link.connected ? btn('⏏ Desconectar', () => { link.close(); panel(); }, 'mini-b') : btn('🔌 Conectar', connect, 'mini-b on'), el('small', { class: 'muted' }, link.connected ? 'conectada' : 'sin conectar'))); }
    // órdenes
    const inp = el('input', { class: 'txt', placeholder: 'Dile al dron qué hacer: «sigue ese pájaro»', on: { keydown: e => { if (e.key === 'Enter' && e.target.value.trim()) { order(e.target.value.trim()); e.target.value = ''; } } } });
    side.append(el('div', { class: 'pl-h' }, el('b', {}, '🗣 Órdenes')), inp, el('div', { class: 'pl-row' }, ...[['🛫 Despega', 'despega'], ['🔄 Haz un rodeo', 'haz un rodeo'], ['🗺 Mapea la zona', 'mapea esta zona'], ['🐦 Sigue al pájaro', 'sigue ese pájaro'], ['⏸ Espera', 'espera'], ['🏠 Vuelve a casa', 'vuelve a casa'], ['🛬 Aterriza', 'aterriza']].map(([l, t]) => btn(l, () => order(t), 'mini-b'))));
    side.append(el('div', { class: 'pl-row' }, btn(S.zoneMode ? '📍 Toca dos esquinas en el suelo…' : '📐 Marcar la zona en el suelo', () => { S.zoneMode = S.zoneMode ? 0 : 1; panel(); }, 'mini-b' + (S.zoneMode ? ' on' : '')), btn('↺ Reiniciar', reset, 'mini-b'), btn('🎥 Seguir al dron', () => { S.follow = !S.follow; panel(); }, 'mini-b' + (S.follow !== false ? ' on' : ''))));
    side.append(el('div', { class: 'pl-h' }, el('b', {}, '📟 Registro')), R.log = el('pre', { class: 'tl-mon dr-log' }, logLines.join('\n')));
    // archivos para la placa
    const files = el('div', { class: 'pl-row' }, ...RDK_FILES.map(f => btn('⬇ ' + f, async () => { try { const t = f === 'mision.py' && S.code ? S.code : await rdkFile(f); download(new Blob([t], { type: 'text/plain' }), f); } catch (e) { toast(e.message, 2000); } }, 'mini-b')));
    side.append(el('div', { class: 'pl-h' }, el('b', {}, '🧩 Para la placa'), el('small', {}, 'cópialos a una carpeta y arranca el puente')), files);
    const edHost = el('div', { class: 'dr-ed' }); side.append(el('details', { on: { toggle: async e => { if (!e.target.open || edHost.firstChild) return; try { S.code = S.code || await rdkFile('mision.py'); } catch (er) { S.code = '# ' + er.message; } const ed = codeEditor({ value: S.code, lang: 'python', onChange: v => { S.code = v; } }); ed.el.classList.add('tl-code'); edHost.append(ed.el); } } }, el('summary', {}, '📄 mision.py (la cabeza del dron; edítala y descárgala)'), edHost));
    side.append(el('p', { class: 'muted pl-tip' }, 'Con Plató en https (dentro de Claude): arranca el puente con --tls, abre una vez https://<ip-de-la-placa>:8765 y acepta el certificado, y conecta a wss://<ip>:8765. Con ROS 2: --ros2 publica las cámaras y escucha /cmd_vel.'));
  }
  function setMode(m) { if (S.mode === m) return; S.mode = m; if (m === 'plato') link.close(); boxes = []; panel(); }
  async function connect() { try { log(`Conectando con ${S.url}…`); await link.connect(S.url, { t: 'hola', cam: CAM, plato: 1 }); log('🔌 Placa conectada'); } catch (e) { log('❌ ' + e.message); toast(e.message, 4000); } panel(); }
  link.onMsg = m => { if (m.t === 'det') { boxes = (m.boxes || []).map(b => ({ box: b.slice(0, 4), label: b[4] || '' })); S.detT = performance.now(); } else if (m.t === 'estado') log('🤖 ' + m.texto); else drone.command(m); };
  link.onMap = blob => { const u = URL.createObjectURL(blob); const old = mapImg.src; mapImg.src = u; mapImg.hidden = false; if (old && old.startsWith('blob:')) URL.revokeObjectURL(old); };
  link.onClose = () => { log('Placa desconectada: el dron se queda quieto en el aire'); if (!disposed) panel(); };
  link.log = log;
  function order(texto) { log('🗣 ' + texto); const zn = [zone.a, zone.b];
    if (S.mode === 'rdk') { if (!link.connected) return toast('Conecta primero la placa', 1500); link.send({ t: 'orden', texto, zona: zn }); if (/mapea|barre|escanea/.test(texto)) zone.set(zone.a, zone.b); return; }
    if (!parseOrder(texto)) { pilot.order(texto, zn); return; } for (const m of pilot.order(texto, zn)) drone.command(m); if (/mapea|barre|escanea/.test(texto)) zone.set(zone.a, zone.b); }
  function reset() { drone.reset(); bird.p = [30, 15, -40]; zone.set(zone.a, zone.b); pilot.m = 'espera'; boxes = []; mapImg.hidden = true; log('Mundo reiniciado'); }

  /* ── tocar el suelo para marcar la zona ── */
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let down = null;
  renderer.domElement.addEventListener('pointerdown', e => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', e => { if (!S.zoneMode || !down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return; const r = renderer.domElement.getBoundingClientRect(); ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, cam);
    const h = ray.intersectObject(world.ground)[0]; if (!h) return; const p = [h.point.x, -h.point.z];
    if (S.zoneMode === 1) { S.za = p; S.zoneMode = 2; panel(); } else { zone.set(S.za, p); world.setZone(); S.zoneMode = 0; log(`Zona: ${Math.round(zone.b[0] - zone.a[0])} × ${Math.round(zone.b[1] - zone.a[1])} m`); panel(); } });

  /* ── bucle ── */
  const ro = new ResizeObserver(() => { const w = vw.clientWidth, h = vw.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }); ro.observe(vw);
  const pip = pipC.getContext('2d');
  function frame(now) { if (disposed) return; requestAnimationFrame(frame); const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt;
    const p0 = dm.position.clone();
    while (acc >= 1 / 60) { drone.step(1 / 60); bird.step(1 / 60); zone.mark(drone); acc -= 1 / 60; }
    // mallas
    dm.position.set(...drone.p).add(new THREE.Vector3(0, 0.35, 0)); dm.rotation.set(0, 0, 0); dm.rotateY(drone.yaw); dm.rotateZ(drone.tilt[1] * 0.6); dm.rotateX(drone.tilt[0] * 0.6); for (const r of dm.userData.rot) r.rotation.y += drone.flying ? 1.2 : 0;
    bm.position.set(...bird.p); bm.rotation.y = -bird.h; const fl = Math.sin(bird.flap) * 0.7; bm.userData.w[0].rotation.x = -Math.PI / 2 + fl; bm.userData.w[1].rotation.x = Math.PI / 2 - fl;
    if (S.follow !== false) { const d = dm.position.clone().sub(p0); cam.position.add(d); ctl.target.copy(dm.position); }
    placeCams();
    // piloto: 10 veces por segundo mira la cámara (320×180) y decide
    if (S.mode === 'plato' && now - tPilot > 100) { tPilot = now; grab(camL, rtSmall, pxs, 320, 180); const b = findBird(pxs, 320, 180); boxes = b ? [{ box: b.box, label: 'pájaro' }] : [];
      pilot.on(drone.telem()); pilot.on({ t: 'det', bird: b }); for (const m of pilot.tick()) drone.command(m); }
    if (S.mode === 'rdk' && boxes.length && now - (S.detT || 0) > 1000) boxes = [];
    // placa por red: telemetría 20/s, imágenes de las dos cámaras 10/s
    if (S.mode === 'rdk' && link.connected) { if (now - tTelem > 50) { tTelem = now; link.send(drone.telem()); }
      if (now - tFrame > 100 && !encBusy) { tFrame = now; encBusy = true; frameN++; (async () => { try { await sendJpeg(1, camL); await sendJpeg(2, camR); } catch (e) {} encBusy = false; })(); } }
    ctl.update(); renderer.render(scene, cam);
    // imagen de a bordo (cámara izquierda) en una esquina, con lo que la cabeza ha detectado
    const sz = renderer.getSize(new THREE.Vector2()), W = sz.x, H = sz.y; const pw = Math.round(Math.min(W * 0.36, 360)), ph = Math.round(pw * CAM.h / CAM.w);
    renderer.setScissorTest(true); renderer.setScissor(W - pw - 8, 8, pw, ph); renderer.setViewport(W - pw - 8, 8, pw, ph); renderer.render(scene, camL); renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
    pipC.style.width = pw + 'px'; pipC.style.height = ph + 'px'; pipC.style.right = '8px'; pipC.style.bottom = '8px';
    pip.clearRect(0, 0, 320, 180); pip.strokeStyle = '#00ff88'; pip.lineWidth = 2; pip.font = '12px system-ui'; pip.fillStyle = '#00ff88';
    for (const b of boxes) { const [u0, v0, u1, v1] = b.box.map((v, i) => v * (i % 2 ? 180 / CAM.h : 320 / CAM.w)); pip.strokeRect(u0 - 3, v0 - 3, u1 - u0 + 6, v1 - v0 + 6); pip.fillText(b.label, u0, Math.max(10, v0 - 6)); }
    pip.fillStyle = 'rgba(0,0,0,.45)'; pip.fillRect(0, 0, 120, 16); pip.fillStyle = '#fff'; pip.fillText(`cámara izq. · ${Math.round(drone.gimbal)}°`, 4, 12);
    hudPaint(); }
  let hudT = 0; function hudPaint() { const now = performance.now(); if (now - hudT < 200) return; hudT = now; const e = enu(drone.p); const dB = Math.hypot(drone.p[0] - bird.p[0], drone.p[1] - bird.p[1], drone.p[2] - bird.p[2]);
    const t = `${drone.flying ? '🟢 en vuelo' : '⚪ en tierra'} · ↑ ${e[2].toFixed(1)} m · ${Math.hypot(...drone.v).toFixed(1)} m/s · 🔋 ${drone.bat.toFixed(0)} %\n${S.mode === 'plato' ? '🧠 ' + pilot.estado : link.connected ? '🔌 placa conectada' : '⚠ placa sin conectar'}\n🐦 a ${dB.toFixed(0)} m · 🗺 zona vista ${(zone.coverage * 100).toFixed(0)} %${drone.crash ? '\n💥 ' + drone.crash : ''}`;
    if (hud.textContent !== t) hud.textContent = t; }

  panel(); log('Listo. Pulsa «Despega» o escribe una orden.'); requestAnimationFrame(t => { last = t; frame(t); });
  return { el: root, drone, bird, zone, pilot, link, order, dispose: () => { disposed = true; link.close(); ro.disconnect(); ctl.dispose(); renderer.dispose(); rtFull.dispose(); rtSmall.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } };
}
