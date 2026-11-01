// Kit de juegos de Plató: mundo low-poly listo para que cualquier juego (escrito a mano o por la IA) se construya en pocas líneas.
import * as THREE from 'three';

// Calidad automática: en GPU por software (Raspberry Pi sin aceleración, máquinas virtuales) quita sombras y baja la resolución para ir fluido.
let LOW = false;
function softGPU(gl) { try { const i = gl.getExtension('WEBGL_debug_renderer_info'); return /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(i ? i.UNMASKED_RENDERER_WEBGL : gl.RENDERER))); } catch (e) { return false; } }
export function createKit(root, { mode = 'host', quality } = {}) {
  // En la prueba automática no hace falta GPU: un renderizador falso evita crear (y destruir) un contexto WebGL.
  const renderer = mode === 'test' ? { domElement: document.createElement('canvas'), shadowMap: {}, setPixelRatio() {}, setSize() {}, render() {}, dispose() {} }
    : new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
  if (mode !== 'test') LOW = quality ? quality === 'low' : softGPU(renderer.getContext());
  renderer.setPixelRatio(LOW ? 1 : Math.min(devicePixelRatio || 1, 2)); renderer.shadowMap.enabled = !LOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; root.append(renderer.domElement);
  const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 2000); camera.position.set(0, 14, 16); camera.lookAt(0, 0, 0);
  const hemi = new THREE.HemisphereLight('#dfe8ff', '#4a3f35', 1.1); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.position.set(12, 24, 10); sun.castShadow = !LOW; sun.shadow.mapSize.set(LOW ? 512 : 2048, LOW ? 512 : 2048);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 }); sun.shadow.bias = -0.0004; scene.add(sun);
  let ground = null; const tweens = []; const parts = []; let camMode = null;
  const mats = new Map(); const mat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!mats.has(k)) mats.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: o.rough ?? 0.7, metalness: o.metal ?? 0, emissive: o.glow ? c : '#000000', emissiveIntensity: o.glow ? (+o.glow || 1) : 0, transparent: o.opacity != null, opacity: o.opacity ?? 1 })); return mats.get(k); };
  const COLORS = { rojo: '#e5483b', azul: '#3b7be5', verde: '#3fae5a', amarillo: '#f2c230', naranja: '#f08a24', morado: '#8b5bd6', rosa: '#e86aa8', blanco: '#f2f2f2', negro: '#25262b', gris: '#9aa0a6', marron: '#8b5e3c', cian: '#2ec4d6' };
  const col = c => COLORS[c] || c || '#9aa0a6';
  const place = (o, p = {}) => { o.position.set(p.x || 0, p.y || 0, p.z || 0); if (p.ry != null) o.rotation.y = p.ry; if (p.scale) o.scale.setScalar(p.scale); o.traverse(m => { if (m.isMesh) { m.castShadow = p.shadow !== false; m.receiveShadow = true; } }); if (p.add !== false) (p.parent || scene).add(o); return o; };
  const mesh = (geo, c, p = {}) => place(new THREE.Mesh(geo, mat(col(c), p)), p);
  const fit = () => { const w = root.clientWidth || innerWidth, h = root.clientHeight || innerHeight; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
  addEventListener('resize', fit); fit();

  function labelTexture(text, { color = '#ffffff', bg = null, size = 64, bold = true, pad = 16 } = {}) {
    const lines = String(text).split('\n'); const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true }); const font = `${bold ? '700 ' : ''}${size}px system-ui, sans-serif`; g.font = font;
    const w = Math.max(...lines.map(l => g.measureText(l).width)) + pad * 2, h = lines.length * size * 1.2 + pad * 2; c.width = Math.ceil(w); c.height = Math.ceil(h);
    g.font = font; if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(0, 0, c.width, c.height, size * 0.3) : g.rect(0, 0, c.width, c.height); g.fill(); }
    g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; lines.forEach((l, i) => g.fillText(l, c.width / 2, pad + size * 0.6 + i * size * 1.2));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { t, w: c.width, h: c.height };
  }

  const kit = {
    THREE, scene, camera, renderer, COLORS, color: col,
    env({ sky = '#9cc6ee', ground: gc = '#6a9a55', fog = 0.012, light = 'day', size = 400 } = {}) {
      scene.background = new THREE.Color(light === 'night' ? '#0b1020' : sky); scene.fog = fog ? new THREE.FogExp2(scene.background, fog) : null;
      hemi.intensity = light === 'night' ? 0.35 : 1.1; sun.intensity = light === 'night' ? 0.5 : light === 'studio' ? 1.6 : 2.2; sun.color.set(light === 'night' ? '#9fb6ff' : '#fff4e0');
      if (ground) { scene.remove(ground); ground = null; } if (gc && gc !== 'none') { ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat(col(gc), { rough: 0.95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground); }
      return kit; },
    group(p = {}) { return place(new THREE.Group(), p); },
    box(p = {}) { const w = p.w ?? 1, h = p.h ?? 1, d = p.d ?? 1; const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); return mesh(g, p.color, p); },
    cylinder(p = {}) { const h = p.h ?? 1; const g = new THREE.CylinderGeometry(p.rTop ?? p.r ?? 0.5, p.r ?? 0.5, h, p.sides ?? 24); g.translate(0, h / 2, 0); return mesh(g, p.color, p); },
    sphere(p = {}) { const r = p.r ?? 0.5; const g = new THREE.SphereGeometry(r, 24, 16); if (p.onGround !== false) g.translate(0, r, 0); return mesh(g, p.color, p); },
    cone(p = {}) { const h = p.h ?? 1; const g = new THREE.ConeGeometry(p.r ?? 0.5, h, p.sides ?? 20); g.translate(0, h / 2, 0); return mesh(g, p.color, p); },
    plane(p = {}) { const g = new THREE.PlaneGeometry(p.w ?? 1, p.d ?? 1); g.rotateX(-Math.PI / 2); return mesh(g, p.color, { ...p, y: (p.y ?? 0) + 0.01 }); },
    text(p = {}) { const { t, w, h } = labelTexture(p.text ?? '', { color: p.color || '#ffffff', bg: p.bg || null, size: 64, bold: p.bold !== false }); const s = (p.size ?? 0.6) / 64 * 1.0;
      if (p.face === 'camera') { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.scale.set(w * s, h * s, 1); return place(sp, { ...p, shadow: false }); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w * s, h * s), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })); if (p.face !== 'front') m.rotation.x = -Math.PI / 2; const g = new THREE.Group(); g.add(m); return place(g, { ...p, y: (p.y ?? 0) + 0.02, shadow: false }); },
    setText(obj, text, p = {}) { const m = obj.isSprite ? obj : obj.children[0]; if (!m) return; const { t, w, h } = labelTexture(text, { color: p.color || '#ffffff', bg: p.bg || null }); m.material.map.dispose(); m.material.map = t; m.material.needsUpdate = true; const s = (p.size ?? 0.6) / 64; if (m.isSprite) m.scale.set(w * s, h * s, 1); else { m.geometry.dispose(); m.geometry = new THREE.PlaneGeometry(w * s, h * s); } },
    person(p = {}) { const g = new THREE.Group(); const c = col(p.color || '#3b7be5'), skin = p.skin || '#e8c9a8', s = p.scale ?? 1;
      const add = (geo, cc, x, y, z) => { const m = new THREE.Mesh(geo, mat(cc)); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
      const legL = add(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), p.pants || '#2d3340', -0.11, 0.3, 0), legR = add(new THREE.CapsuleGeometry(0.09, 0.42, 4, 8), p.pants || '#2d3340', 0.11, 0.3, 0);
      add(new THREE.CapsuleGeometry(0.2, 0.36, 4, 10), c, 0, 0.88, 0); const head = add(new THREE.SphereGeometry(0.17, 16, 12), skin, 0, 1.32, 0);
      add(new THREE.BoxGeometry(0.2, 0.05, 0.06), '#1e2024', 0, 1.36, 0.15);
      const armL = add(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), c, -0.3, 0.88, 0), armR = add(new THREE.CapsuleGeometry(0.07, 0.4, 4, 8), c, 0.3, 0.88, 0);
      if (p.hat) { const h = add(new THREE.CylinderGeometry(0.14, 0.17, 0.16, 16), col(p.hat), 0, 1.5, 0); add(new THREE.CylinderGeometry(0.26, 0.26, 0.02, 20), col(p.hat), 0, 1.43, 0); h.castShadow = true; }
      g.scale.setScalar(s); g.userData.rig = { legL, legR, armL, armR, head }; g.userData.walk = 0; return place(g, p); },
    animate(fig, speed = 0, dt = 1 / 60) { const r = fig.userData.rig; if (!r) return; fig.userData.walk = (fig.userData.walk || 0) + dt * (2 + speed * 3); const a = Math.sin(fig.userData.walk * 4) * Math.min(1, speed) * 0.7;
      r.legL.rotation.x = a; r.legR.rotation.x = -a; r.armL.rotation.x = -a; r.armR.rotation.x = a; },
    car(p = {}) { const g = new THREE.Group(); const c = col(p.color || '#e5483b'); const add = (geo, cc, x, y, z) => { const m = new THREE.Mesh(geo, mat(cc, cc === '#9fd8ff' ? { rough: 0.1 } : {})); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
      add(new THREE.BoxGeometry(1.8, 0.5, 3.8), c, 0, 0.55, 0); add(new THREE.BoxGeometry(1.5, 0.45, 1.9), c, 0, 1.0, -0.2); add(new THREE.BoxGeometry(1.52, 0.36, 0.05), '#9fd8ff', 0, 1.0, 0.76);
      for (const [x, z] of [[-0.85, 1.2], [0.85, 1.2], [-0.85, -1.2], [0.85, -1.2]]) { const w = add(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16), '#1d1d1f', x, 0.36, z); w.rotation.z = Math.PI / 2; }
      return place(g, p); },
    tree(p = {}) { const g = new THREE.Group(); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), mat('#6b4a30')); t.position.y = 0.6; const f = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 0), mat(col(p.color || '#3f8f3a'))); f.position.y = 1.7; g.add(t, f); return place(g, p); },
    house(p = {}) { const g = new THREE.Group(); const w = p.w ?? 2, h = p.h ?? 1.6; const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat(col(p.color || '#e8dcc4'))); b.position.y = h / 2; const r = new THREE.Mesh(new THREE.ConeGeometry(w * 0.78, h * 0.7, 4), mat(col(p.roof || '#a8432f'))); r.position.y = h + h * 0.35; r.rotation.y = Math.PI / 4; g.add(b, r); return place(g, p); },
    coin(p = {}) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 20), mat('#f2c230', { metal: 0.6, rough: 0.3 })); m.rotation.x = Math.PI / 2; const g = new THREE.Group(); g.add(m); m.position.y = 0.4; return place(g, p); },
    tile(p = {}) { const g = new THREE.Group(); const w = p.w ?? 1.6, d = p.d ?? 1.6; const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat(col(p.base || '#f4efe4'))); base.position.y = 0.06; base.receiveShadow = true; g.add(base);
      if (p.color) { const band = new THREE.Mesh(new THREE.BoxGeometry(w, 0.14, d * 0.28), mat(col(p.color))); band.position.set(0, 0.07, -d / 2 + d * 0.14); g.add(band); }
      place(g, p); if (p.label) { const t = kit.text({ text: p.label, size: p.labelSize ?? 0.28, color: p.labelColor || '#2a2420', parent: g, y: 0.13, z: p.color ? d * 0.12 : 0, add: true }); g.userData.label = t; } return g; },
    board: {
      ring({ tiles = 20, size = 12 } = {}) { const per = tiles / 4, out = []; const half = size / 2, step = size / per;
        for (let i = 0; i < tiles; i++) { const side = Math.floor(i / per), k = i % per; let x, z, ry;
          if (side === 0) { x = half - k * step; z = half; ry = 0; } else if (side === 1) { x = -half; z = half - k * step; ry = Math.PI / 2; } else if (side === 2) { x = -half + k * step; z = -half; ry = Math.PI; } else { x = half; z = -half + k * step; ry = -Math.PI / 2; }
          out.push({ x, z, ry, side, index: i, w: step * 0.94, d: step * 0.94 }); } return out; },
      grid({ cols = 8, rows = 8, size = 1.5, y = 0 } = {}) { const out = []; for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) out.push({ x: (c - (cols - 1) / 2) * size, z: (r - (rows - 1) / 2) * size, y, col: c, row: r, index: r * cols + c, w: size * 0.95, d: size * 0.95 }); return out; },
      circle({ n = 12, r = 6 } = {}) { return Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return { x: Math.cos(a) * r, z: Math.sin(a) * r, ry: -a + Math.PI / 2, index: i }; }); },
    },
    dice: {
      show(values = [1], p = {}) { const out = []; values.forEach((v, i) => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat('#fafafa', { rough: 0.4 })); d.castShadow = true;
          const lab = kit.text({ text: String(v), size: 0.55, color: '#1e2024', face: 'camera', parent: d, y: 0.6, add: true }); d.add(lab); const x = (p.x ?? 0) + (i - (values.length - 1) / 2) * 1.2, z = p.z ?? 0;
          d.position.set(x, 4, z); scene.add(d); out.push(d); kit.tween(t => { d.position.y = 0.4 + Math.abs(Math.cos(t * Math.PI * 2.5)) * 3.5 * (1 - t); d.rotation.set(t * 9, t * 7, t * 5); }, 0.9, () => { d.rotation.set(0, 0, 0); kit.after(2.2, () => scene.remove(d)); }); });
        kit.sfx('dice'); return out; },
    },
    tween(fn, secs = 0.5, done) { tweens.push({ fn, t: 0, secs, done }); },
    after(secs, fn) { tweens.push({ fn: () => {}, t: 0, secs, done: fn }); },
    move(obj, to, secs = 0.5, done) { const f = obj.position.clone(); const tt = new THREE.Vector3(to.x ?? f.x, to.y ?? f.y, to.z ?? f.z); kit.tween(u => { const e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2; obj.position.lerpVectors(f, tt, e); }, secs, done); },
    hop(obj, to, secs = 0.35, done, height = 0.8) { const f = obj.position.clone(); const tt = new THREE.Vector3(to.x ?? f.x, to.y ?? f.y, to.z ?? f.z); kit.tween(u => { obj.position.lerpVectors(f, tt, u); obj.position.y += Math.sin(u * Math.PI) * height; }, secs, done); },
    hopPath(obj, points, secs = 0.3, done) { let i = 0; const next = () => { if (i >= points.length) { done && done(); return; } kit.hop(obj, points[i++], secs, next); kit.sfx('click'); }; next(); },
    face(obj, target) { obj.rotation.y = Math.atan2((target.x ?? 0) - obj.position.x, (target.z ?? 0) - obj.position.z); },
    remove(obj) { if (obj && obj.parent) obj.parent.remove(obj); },
    burst(p = {}) { const n = p.n ?? 18, c = col(p.color || '#f2c230'); for (let i = 0; i < n; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(p.size ?? 0.09, 6, 4), mat(c, { glow: 0.6 })); m.position.set(p.x || 0, (p.y ?? 0.6), p.z || 0); scene.add(m);
        parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 5 + 1, (Math.random() - 0.5) * 5), life: 0.9 }); } },
    dist(a, b) { const pa = a.position || a, pb = b.position || b; return Math.hypot((pa.x || 0) - (pb.x || 0), (pa.z || 0) - (pb.z || 0)); },
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), lerp: (a, b, t) => a + (b - a) * t,
    ray(origin, dir, objects, far = 100) { const rc = new THREE.Raycaster(new THREE.Vector3(origin.x, origin.y ?? 1, origin.z), new THREE.Vector3(dir.x, dir.y ?? 0, dir.z).normalize(), 0, far); const h = rc.intersectObjects(objects, true)[0]; if (!h) return null; let o = h.object; while (o.parent && !objects.includes(o)) o = o.parent; return { object: o, distance: h.distance, point: h.point }; },
    cam: {
      look(pos, target = { x: 0, y: 0, z: 0 }) { camMode = null; camera.position.set(pos.x, pos.y, pos.z); camera.lookAt(target.x || 0, target.y || 0, target.z || 0); },
      top({ h = 22, target = { x: 0, z: 0 }, tilt = 0.55 } = {}) { camMode = null; camera.position.set(target.x || 0, h, (target.z || 0) + h * tilt); camera.lookAt(target.x || 0, 0, target.z || 0); },
      orbit({ target = { x: 0, y: 0, z: 0 }, dist = 18, h = 12, speed = 0.08 } = {}) { camMode = { k: 'orbit', target, dist, h, speed, a: 0.6 }; },
      follow(obj, { dist = 6, h = 3.5, look = 1 } = {}) { camMode = { k: 'follow', obj, dist, h, look }; },
      pov(obj, { h = 1.5, back = 0, ahead = 8 } = {}) { camMode = { k: 'pov', obj, h, back, ahead }; },
    },
    hud(spec) { hudSpec = spec; drawHud(); },
    say(text, secs = 2.6) { if (mode === 'test') return; const d = document.createElement('div'); d.className = 'k-say'; d.textContent = text; sayBox.append(d); setTimeout(() => d.remove(), secs * 1000); },
    sfx(name) { if (mode === 'test') return; try { audio.sfx(name); } catch (e) {} },
    music(style) { if (mode === 'test') return; try { audio.music(style); } catch (e) {} },
  };

  /* HUD en pantalla grande */
  const hudEl = document.createElement('div'); hudEl.className = 'k-hud'; root.append(hudEl); const sayBox = document.createElement('div'); sayBox.className = 'k-saybox'; root.append(sayBox); let hudSpec = null;
  const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
  function drawHud() { const s = hudSpec || {}; hudEl.innerHTML = `${s.title ? `<div class="k-title">${esc(s.title)}</div>` : ''}${(s.lines || []).map(l => `<div class="k-line">${esc(l)}</div>`).join('')}`
    + (s.scores && s.scores.length ? `<div class="k-scores">${s.scores.map(x => `<div style="--c:${col(x.color || '#ffffff')}"><i></i><span>${esc(x.name)}</span><b>${esc(x.value)}</b></div>`).join('')}</div>` : '')
    + (s.message ? `<div class="k-msg">${esc(s.message)}</div>` : ''); }

  /* Sonido sintetizado */
  const audio = (() => { let ac = null; const ctx = () => (ac = ac || new (window.AudioContext || window.webkitAudioContext)());
    const tone = (f, d, type = 'sine', v = 0.15, slide = 0, delay = 0) => { const c = ctx(); const o = c.createOscillator(), g = c.createGain(); o.type = type; const t0 = c.currentTime + delay; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t0 + d); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(c.destination); o.start(t0); o.stop(t0 + d + 0.02); };
    const noise = (d, v = 0.2) => { const c = ctx(); const b = c.createBuffer(1, c.sampleRate * d, c.sampleRate); const a = b.getChannelData(0); for (let i = 0; i < a.length; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / a.length); const s = c.createBufferSource(); s.buffer = b; const g = c.createGain(); g.gain.value = v; s.connect(g); g.connect(c.destination); s.start(); };
    let loop = null;
    return { sfx(n) { ({ dice: () => { for (let i = 0; i < 5; i++) tone(300 + Math.random() * 400, 0.05, 'square', 0.06, 0, i * 0.08); }, coin: () => { tone(988, 0.08, 'square', 0.1); tone(1319, 0.2, 'square', 0.1, 0, 0.08); }, win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, 0, i * 0.12)),
        lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.08, 0, i * 0.15)), hit: () => { noise(0.15, 0.25); tone(160, 0.15, 'square', 0.1, -80); }, jump: () => tone(300, 0.2, 'square', 0.1, 400), click: () => tone(800, 0.04, 'square', 0.05),
        shoot: () => { tone(900, 0.12, 'sawtooth', 0.08, -700); noise(0.06, 0.1); }, beep: () => tone(660, 0.12, 'sine', 0.12), buy: () => { tone(660, 0.1, 'triangle', 0.12); tone(990, 0.15, 'triangle', 0.12, 0, 0.1); } })[n]?.(); },
      music(style) { if (loop) { clearInterval(loop); loop = null; } if (!style || style === 'off') return; const sc = style === 'action' ? [220, 262, 330, 392, 330, 262] : [262, 330, 392, 523, 392, 330]; let i = 0; loop = setInterval(() => { tone(sc[i++ % sc.length], 0.35, 'triangle', 0.035); if (i % 3 === 0) tone(sc[0] / 2, 0.5, 'sine', 0.04); }, style === 'action' ? 180 : 320); } }; })();

  /* Bucle */
  let last = performance.now(); const hooks = [];
  kit.onFrame = fn => hooks.push(fn);
  function frame(now) { requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
    for (let i = tweens.length - 1; i >= 0; i--) { const tw = tweens[i]; tw.t += dt; const u = Math.min(1, tw.t / tw.secs); try { tw.fn(u); } catch (e) {} if (u >= 1) { tweens.splice(i, 1); tw.done && tw.done(); } }
    for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= dt; p.v.y -= 9 * dt; p.m.position.addScaledVector(p.v, dt); if (p.life <= 0 || p.m.position.y < 0) { scene.remove(p.m); parts.splice(i, 1); } }
    for (const h of hooks) h(dt);
    if (camMode) { const c = camMode; if (c.k === 'orbit') { c.a += c.speed * dt; camera.position.set((c.target.x || 0) + Math.cos(c.a) * c.dist, c.h, (c.target.z || 0) + Math.sin(c.a) * c.dist); camera.lookAt(c.target.x || 0, c.target.y || 0, c.target.z || 0); }
      else if (c.k === 'follow' && c.obj) { const o = c.obj, ry = o.rotation.y; const want = new THREE.Vector3(o.position.x - Math.sin(ry) * c.dist, o.position.y + c.h, o.position.z - Math.cos(ry) * c.dist); camera.position.lerp(want, 1 - Math.exp(-6 * dt)); camera.lookAt(o.position.x + Math.sin(ry) * c.look, o.position.y + 1, o.position.z + Math.cos(ry) * c.look); }
      else if (c.k === 'pov' && c.obj) { const o = c.obj, ry = o.rotation.y; camera.position.set(o.position.x - Math.sin(ry) * c.back, o.position.y + c.h, o.position.z - Math.cos(ry) * c.back); camera.lookAt(o.position.x + Math.sin(ry) * c.ahead, o.position.y + c.h * 0.8, o.position.z + Math.cos(ry) * c.ahead); } }
    if (mode !== 'test') renderer.render(scene, camera); }
  requestAnimationFrame(frame);
  kit.env();
  return kit;
}
