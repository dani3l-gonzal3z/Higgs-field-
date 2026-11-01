// Ciudad: juego de propiedades por turnos (2-6 jugadores). Ejemplo del Kit de juegos de Plató.
const NAMES = ['Salida', 'Calle Mayor', 'Suerte', 'Plaza Sol', 'Impuesto', 'Estación Norte', 'Av. del Río', 'Suerte', 'Calle Luna', 'Parque',
  'Paseo del Mar', 'Suerte', 'Gran Vía', 'Impuesto', 'Estación Sur', 'Calle Olmo', 'Suerte', 'Av. Sierra', 'Calle Pez', 'Palacio'];
const GROUPS = ['#8b5e3c', '#2ec4d6', '#e86aa8', '#f08a24', '#e5483b', '#f2c230', '#3fae5a', '#3b7be5'];
const LUCK = [['Ganas un concurso de tortillas', 120], ['Multa por aparcar mal', -80], ['Te devuelve Hacienda', 60], ['Reparas el tejado', -120], ['Vendes tu bici vieja', 40], ['Cumpleaños: cada uno te da 20 €', 'gift']];

function current(s) { return s.players[s.turn]; }
function nextTurn(ctx, s) {
  const alive = s.players.filter(p => !p.out);
  if (alive.length <= 1) { ctx.end(alive[0] ? alive[0].id : 'Nadie'); return; }
  let t = s.turn;
  do { t = (t + 1) % s.players.length; if (t === 0) s.round++; } while (s.players[t].out);
  s.turn = t; s.phase = 'roll';
  if (s.round > s.maxRounds) { const best = alive.slice().sort((a, b) => worth(s, b) - worth(s, a))[0]; s.log = 'Fin de las rondas'; ctx.end(best.id); return; }
  s.log = `Turno de ${ctx.player(current(s).id).name}`;
}
function worth(s, p) { return p.money + s.tiles.filter(t => t.owner === p.id).reduce((a, t) => a + t.price, 0); }
function pay(ctx, s, from, to, amount) {
  from.money -= amount; if (to) to.money += amount;
  if (from.money < 0) { from.out = true; for (const t of s.tiles) if (t.owner === from.id) t.owner = null; ctx.say(`💸 ${ctx.player(from.id).name} se arruina`); ctx.sfx('lose'); }
}

export default {
  meta: { title: 'Ciudad', description: 'Compra calles, cobra alquileres y no te arruines. Gana quien más valga tras 12 rondas, o el último que quede.', minPlayers: 2, maxPlayers: 6, realtime: false },

  setup(ctx) {
    const tiles = NAMES.map((name, i) => {
      if (i === 0) return { name, type: 'start' };
      if (name === 'Suerte') return { name, type: 'luck' };
      if (name === 'Impuesto') return { name, type: 'tax', amount: 100 };
      if (name === 'Parque') return { name, type: 'rest' };
      const price = Math.round((60 + i * 14) / 10) * 10;
      return { name, type: 'prop', price, rent: Math.round(price * 0.3 / 5) * 5, color: GROUPS[Math.floor(i / 2.6) % GROUPS.length], owner: null };
    });
    return { tiles, players: ctx.players.map(p => ({ id: p.id, money: 1500, pos: 0, out: false })), turn: 0, round: 1, maxRounds: 12, phase: 'roll', dice: [0, 0], log: `Empieza ${ctx.players[0].name}` };
  },

  scene(ctx, s) {
    const k = ctx.kit; k.env({ sky: '#a9d0f5', ground: '#7fb069' });
    k.box({ w: 15.6, h: 0.18, d: 15.6, color: '#e9e0c9', y: -0.18 });
    const spots = k.board.ring({ tiles: 20, size: 12 }); ctx.local.spots = spots;
    s.tiles.forEach((t, i) => { const sp = spots[i];
      const label = t.type === 'prop' ? `${t.name}\n${t.price} €` : t.type === 'tax' ? `${t.name}\n-${t.amount} €` : t.name;
      k.tile({ x: sp.x, z: sp.z, ry: sp.ry, w: sp.w, d: sp.d, color: t.type === 'prop' ? t.color : t.type === 'luck' ? '#8b5bd6' : null, base: t.type === 'start' ? '#ffe9a8' : '#f7f2e6', label, labelSize: 0.2 }); });
    k.text({ text: 'CIUDAD', size: 1.6, color: '#c0392b', y: 0.05 });
    k.tree({ x: -3, z: -2 }); k.tree({ x: 3, z: 2.5, color: '#4f9a3f' }); k.house({ x: 2.5, z: -2.5, color: '#f2e2c4' });
    ctx.local.tokens = {}; ctx.local.shown = {}; ctx.local.houses = {};
    ctx.players.forEach((p, i) => { const sp = spots[0]; const fig = k.person({ color: p.color, scale: 0.55, x: sp.x + (i % 3 - 1) * 0.35, z: sp.z + (Math.floor(i / 3) - 0.5) * 0.4 }); ctx.local.tokens[p.id] = fig; ctx.local.shown[p.id] = 0; });
    k.cam.orbit({ dist: 17, h: 14, speed: 0.04 }); k.music('calm');
  },

  render(ctx, s) {
    const k = ctx.kit, spots = ctx.local.spots;
    s.players.forEach((pl, i) => { const fig = ctx.local.tokens[pl.id]; if (!fig) return; fig.visible = !pl.out;
      if (ctx.local.shown[pl.id] !== pl.pos && !fig.userData.moving) { const from = ctx.local.shown[pl.id], path = [];
        for (let j = from; j !== pl.pos; j = (j + 1) % 20) { const sp = spots[(j + 1) % 20]; path.push({ x: sp.x + (i % 3 - 1) * 0.35, y: 0.12, z: sp.z + (Math.floor(i / 3) - 0.5) * 0.4 }); }
        fig.userData.moving = true; ctx.local.shown[pl.id] = pl.pos; k.hopPath(fig, path, 0.22, () => { fig.userData.moving = false; }); } });
    s.tiles.forEach((t, i) => { const h = ctx.local.houses[i]; if (t.owner && (!h || h.userData.owner !== t.owner)) { if (h) k.remove(h); const sp = spots[i]; const owner = ctx.player(t.owner);
        const nh = k.house({ x: sp.x * 0.83, z: sp.z * 0.83, w: 0.55, h: 0.45, color: owner ? owner.color : '#ffffff', roof: '#5a3a2a' }); nh.userData.owner = t.owner; ctx.local.houses[i] = nh; }
      if (!t.owner && h) { k.remove(h); delete ctx.local.houses[i]; } });
  },

  actions: {
    roll(ctx, s, player) {
      const me = current(s); if (me.id !== player.id || s.phase !== 'roll') return;
      s.dice = [ctx.int(1, 6), ctx.int(1, 6)]; ctx.kit.dice.show(s.dice, { x: 0, z: 2 }); const steps = s.dice[0] + s.dice[1];
      const before = me.pos; me.pos = (me.pos + steps) % 20; if (me.pos < before) { me.money += 200; ctx.say(`${player.name} pasa por la Salida: +200 €`); ctx.sfx('coin'); }
      const t = s.tiles[me.pos]; s.log = `${player.name} saca ${steps} y cae en ${t.name}`;
      if (t.type === 'prop') {
        if (!t.owner) { if (me.money >= t.price) { s.phase = 'buy'; return; } }
        else if (t.owner !== me.id) { const owner = s.players.find(p => p.id === t.owner); if (owner && !owner.out) { pay(ctx, s, me, owner, t.rent); s.log += ` · paga ${t.rent} € a ${ctx.player(owner.id).name}`; ctx.sfx('coin'); } }
      } else if (t.type === 'luck') { const [txt, v] = ctx.pick(LUCK);
        if (v === 'gift') { for (const p of s.players) if (p !== me && !p.out) { pay(ctx, s, p, me, 20); } } else if (v > 0) me.money += v; else pay(ctx, s, me, null, -v);
        ctx.say(`🍀 ${txt}`); s.log += ` · ${txt}`;
      } else if (t.type === 'tax') { pay(ctx, s, me, null, t.amount); s.log += ` · paga ${t.amount} € de impuestos`; }
      nextTurn(ctx, s);
    },
    buy(ctx, s, player) { const me = current(s); if (me.id !== player.id || s.phase !== 'buy') return; const t = s.tiles[me.pos];
      if (!t.owner && me.money >= t.price) { me.money -= t.price; t.owner = me.id; ctx.say(`🏠 ${player.name} compra ${t.name}`); ctx.sfx('buy'); s.log = `${player.name} compra ${t.name}`; }
      nextTurn(ctx, s); },
    pass(ctx, s, player) { const me = current(s); if (me.id !== player.id || s.phase !== 'buy') return; s.log = `${player.name} no compra`; nextTurn(ctx, s); },
  },

  controller(ctx, s, player) {
    const me = s.players.find(p => p.id === player.id); if (!me) return { title: 'Ciudad', text: 'Estás mirando la partida' };
    const mine = s.tiles.filter(t => t.owner === me.id).map(t => ({ label: t.name, sub: `alquiler ${t.rent} €`, color: t.color }));
    const head = { title: `💰 ${me.money} €`, text: `Casilla: ${s.tiles[me.pos].name} · Ronda ${Math.min(s.round, s.maxRounds)}/${s.maxRounds}`, color: player.color, cards: mine };
    if (me.out) return { ...head, wait: 'Te has arruinado. ¡A mirar!' };
    const cur = current(s); if (cur.id !== me.id) return { ...head, wait: `Turno de ${ctx.player(cur.id).name}` };
    if (s.phase === 'buy') { const t = s.tiles[me.pos]; return { ...head, choices: { prompt: `¿Compras ${t.name} por ${t.price} €? Cobrarás ${t.rent} € a quien caiga.`, options: [{ label: '🏠 Comprar', action: 'buy' }, { label: 'Pasar', action: 'pass' }] } }; }
    return { ...head, buttons: [{ action: 'roll', label: '🎲 Tirar dados', style: 'primary' }] };
  },

  hud(ctx, s) {
    return { title: `Ciudad · ronda ${Math.min(s.round, s.maxRounds)} de ${s.maxRounds}`, scores: s.players.map(p => ({ name: (s.players[s.turn] === p ? '▶ ' : '') + ctx.player(p.id).name, value: p.out ? 'fuera' : `${p.money} €`, color: ctx.player(p.id).color })), message: s.log };
  },
};
