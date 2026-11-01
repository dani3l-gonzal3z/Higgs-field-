// Pintabolas: arena en tiempo real (1-8 jugadores) con vista en primera persona en el móvil. Ejemplo del Kit de juegos de Plató.
const SIZE = 30, SPEED = 6.5, TURN = 2.8, BALL = 20, MATCH = 90;
function freeSpot(ctx, s) { for (let k = 0; k < 40; k++) { const x = ctx.int(-12, 12), z = ctx.int(-12, 12); if (!s.blocks.some(b => Math.abs(b.x - x) < b.w / 2 + 1 && Math.abs(b.z - z) < b.d / 2 + 1)) return { x, z }; } return { x: 0, z: 0 }; }
function blocked(s, x, z, r = 0.4) { if (Math.abs(x) > SIZE / 2 - r || Math.abs(z) > SIZE / 2 - r) return true; return s.blocks.some(b => Math.abs(b.x - x) < b.w / 2 + r && Math.abs(b.z - z) < b.d / 2 + r); }

export default {
  meta: { title: 'Pintabolas', description: 'Arena de bolas de pintura: gira y avanza con el joystick y dispara. Gana quien más pinte en 90 segundos.', minPlayers: 1, maxPlayers: 8, realtime: true, pov: true },

  setup(ctx) {
    const blocks = []; for (let i = 0; i < 14; i++) { const w = ctx.int(1, 3) * 1.2, d = ctx.int(1, 3) * 1.2, x = ctx.int(-11, 11), z = ctx.int(-11, 11); if (Math.hypot(x, z) > 3) blocks.push({ x, z, w, d, h: ctx.pick([1.2, 1.8, 2.4]) }); }
    const s = { blocks, balls: [], time: MATCH, players: [] };
    s.players = ctx.players.map(p => { const sp = freeSpot(ctx, s); return { id: p.id, x: sp.x, z: sp.z, ry: ctx.random() * 6.28, score: 0, cool: 0, hit: 0, speed: 0 }; });
    return s;
  },

  scene(ctx, s) {
    const k = ctx.kit; k.env({ sky: '#bfe3ff', ground: '#cfd6dd', fog: 0.008 });
    k.box({ w: SIZE + 1, h: 1.4, d: 1, z: -SIZE / 2 - 0.5, color: '#7d8a99' }); k.box({ w: SIZE + 1, h: 1.4, d: 1, z: SIZE / 2 + 0.5, color: '#7d8a99' });
    k.box({ w: 1, h: 1.4, d: SIZE + 1, x: -SIZE / 2 - 0.5, color: '#7d8a99' }); k.box({ w: 1, h: 1.4, d: SIZE + 1, x: SIZE / 2 + 0.5, color: '#7d8a99' });
    const cols = ['#f2c230', '#e86aa8', '#2ec4d6', '#f08a24', '#8b5bd6'];
    (s ? s.blocks : []).forEach((b, i) => k.box({ x: b.x, z: b.z, w: b.w, d: b.d, h: b.h, color: cols[i % cols.length] }));
    ctx.local.figs = {}; for (const p of ctx.players) ctx.local.figs[p.id] = k.person({ color: p.color, hat: p.color });
    ctx.local.balls = []; ctx.local.marks = 0;
    if (ctx.mode === 'view' && ctx.viewer && ctx.local.figs[ctx.viewer]) k.cam.follow(ctx.local.figs[ctx.viewer], { dist: 3.6, h: 2.2, look: 4 });
    else k.cam.top({ h: 30, tilt: 0.55 });
    if (ctx.mode !== 'view') k.music('action');
  },

  update(ctx, s, dt, inputs) {
    s.time = Math.max(0, s.time - dt);
    for (const p of s.players) { const inp = inputs[p.id] || {}; p.cool = Math.max(0, p.cool - dt); p.hit = Math.max(0, p.hit - dt);
      p.ry -= (inp.x || 0) * TURN * dt; const v = (inp.y || 0) * SPEED; p.speed = Math.abs(v);
      const nx = p.x + Math.sin(p.ry) * v * dt, nz = p.z + Math.cos(p.ry) * v * dt; if (!blocked(s, nx, p.z)) p.x = nx; if (!blocked(s, p.x, nz)) p.z = nz;
      if (inp.a && p.cool <= 0 && p.hit <= 0) { p.cool = 0.35; s.balls.push({ x: p.x + Math.sin(p.ry) * 0.6, z: p.z + Math.cos(p.ry) * 0.6, vx: Math.sin(p.ry) * BALL, vz: Math.cos(p.ry) * BALL, owner: p.id, life: 1.4 }); ctx.sfx('shoot'); } }
    for (let i = s.balls.length - 1; i >= 0; i--) { const b = s.balls[i]; b.x += b.vx * dt; b.z += b.vz * dt; b.life -= dt;
      let gone = b.life <= 0 || blocked(s, b.x, b.z, 0.1);
      for (const p of s.players) if (!gone && p.id !== b.owner && p.hit <= 0 && Math.hypot(p.x - b.x, p.z - b.z) < 0.55) { gone = true; p.hit = 1.2; const o = s.players.find(q => q.id === b.owner); if (o) o.score++; const sp = freeSpot(ctx, s); p.x = sp.x; p.z = sp.z; ctx.sfx('hit'); ctx.say(`🎨 ${ctx.player(b.owner).name} pinta a ${ctx.player(p.id).name}`, 1.4); }
      if (gone) s.balls.splice(i, 1); }
    if (s.time <= 0) { const best = s.players.slice().sort((a, b) => b.score - a.score)[0]; ctx.end(best ? best.id : 'Empate'); }
  },

  render(ctx, s, dt) {
    const k = ctx.kit;
    for (const p of s.players) { const f = ctx.local.figs[p.id]; if (!f) continue; f.position.set(p.x, 0, p.z); f.rotation.y = p.ry; f.visible = p.hit <= 0 || Math.floor(ctx.time * 10) % 2 === 0; k.animate(f, p.speed / SPEED, dt); }
    while (ctx.local.balls.length < s.balls.length) ctx.local.balls.push(k.sphere({ r: 0.16, color: '#ffffff', glow: 0.3, onGround: false }));
    ctx.local.balls.forEach((m, i) => { const b = s.balls[i]; m.visible = !!b; if (b) { m.position.set(b.x, 1.1, b.z); const o = ctx.player(b.owner); if (o) m.material = m.material.color.getHexString() === o.color.slice(1) ? m.material : new k.THREE.MeshStandardMaterial({ color: o.color, emissive: o.color, emissiveIntensity: 0.4 }); } });
  },

  controller(ctx, s, player) {
    const me = s.players.find(p => p.id === player.id); if (!me) return { title: 'Pintabolas', text: 'Partida en curso: estás mirando' };
    return { title: `🎨 ${me.score} puntos`, text: `⏱ ${Math.ceil(s.time)} s · gira y avanza con el joystick`, color: player.color, joystick: true, actionButtons: [{ id: 'a', label: '🎯 Disparar' }], pov: true };
  },

  hud(ctx, s) {
    return { title: `Pintabolas · ⏱ ${Math.ceil(s.time)} s`, scores: s.players.slice().sort((a, b) => b.score - a.score).map(p => ({ name: ctx.player(p.id).name, value: p.score, color: ctx.player(p.id).color })), message: 'Escanea el QR para jugar desde tu móvil · teclado: WASD + espacio, flechas + Enter' };
  },
};
