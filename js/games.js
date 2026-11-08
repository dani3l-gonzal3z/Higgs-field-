// 🎮 Jugar: crea cualquier juego describiéndolo (la IA lo programa y lo prueba sola) y juégalo en la tele con los móviles como mando.
import { $, el, btn, toast, modal, confirmBox, uid, db, host, copyText } from './core.js';
import { llmText, llmReady } from './llm.js';
import { makeRuntime, testGame } from '../games/host.js';
import { renderPad, PAD_CSS } from '../games/pad.js';
import { qrSVG } from './qr.js';
import { guideEvent } from './guide.js';

const EXAMPLES = [{ id: 'ex-ciudad', file: 'games/examples/ciudad.js', emoji: '🏙️' }, { id: 'ex-pintabolas', file: 'games/examples/pintabolas.js', emoji: '🎨' }];
const PALETTE = ['#e5483b', '#3b7be5', '#3fae5a', '#f2c230', '#8b5bd6', '#f08a24', '#e86aa8', '#2ec4d6'];
const IDEAS = ['Un Monopoly de mi pueblo con calles de verdad', 'Carreras de coches en la Luna para 4', 'Trivial de historia de España por equipos', 'Escondite con linternas en una casa a oscuras', 'Un juego de cartas inventado donde gana quien construya la torre más alta', 'Fútbol de chapas en 3D', 'Cluedo en el salón: quién se comió la tarta', 'Inventa un juego nuevo que no exista para 3 jugadores'];
let root = null; const G = { busy: null, session: null };
if (!document.getElementById('pad-css')) { const s = document.createElement('style'); s.id = 'pad-css'; s.textContent = PAD_CSS; document.head.append(s); }
const exCode = {}; async function exampleCode(ex) { if (!exCode[ex.id]) exCode[ex.id] = await (await fetch(ex.file)).text(); return exCode[ex.id]; }
function metaOf(code) { const m = code.match(/meta\s*:\s*\{([\s\S]*?)\}\s*,/); const g = k => { const r = m && m[1].match(new RegExp(k + "\\s*:\\s*(['\"`])([\\s\\S]*?)\\1")); return r ? r[2] : ''; }; const n = k => { const r = m && m[1].match(new RegExp(k + '\\s*:\\s*(\\d+)')); return r ? +r[1] : null; };
  return { title: g('title') || 'Juego', description: g('description'), minPlayers: n('minPlayers') || 1, maxPlayers: n('maxPlayers') || 8, realtime: !!(m && /realtime\s*:\s*true/.test(m[1])) }; }
async function library() { const saved = (await db.all('projects')).filter(p => p.kind === 'game').sort((a, b) => b.t - a.t);
  const ex = await Promise.all(EXAMPLES.map(async e => { const code = await exampleCode(e); return { id: e.id, example: true, emoji: e.emoji, code, ...metaOf(code) }; }));
  return [...saved.map(g => ({ ...g, ...metaOf(g.code), title: g.title || metaOf(g.code).title })), ...ex]; }

export async function renderGames(r) {
  root = r; r.innerHTML = ''; if (G.session) { const L = layer(); L.classList.add('on'); if (!L.childNodes.length) renderStage(L); r.append(el('div', { class: 'empty' }, 'Partida en marcha…')); return; }
  layer().classList.remove('on');
  const lib = await library();
  const ta = el('textarea', { class: 'txt', rows: 3, placeholder: 'Describe el juego que quieras: reglas, número de jugadores, ambiente… o pide uno que no exista.' });
  const create = el('section', { class: 'card g-create', id: 'gCreate' }, el('h2', {}, '¿A qué jugamos hoy?'), el('p', { class: 'note' }, 'Describe cualquier juego —un clásico, una variante o algo inventado— y Plató lo programa, lo prueba solo y te lo deja listo. Después lo mejoras hablando.'), ta,
    el('div', { class: 'chips' }, IDEAS.map(t => btn(t, () => { ta.value = t; ta.focus(); }, 'chip'))),
    el('div', { class: 'row-btns' }, btn(G.busy ? '⏳ ' + G.busy : '✨ Crear juego', () => createGame(ta.value), 'b hot' + (G.busy ? ' dis' : ''))),
    llmReady() ? null : el('p', { class: 'note' }, 'Para crear juegos hace falta la IA: abre Plató dentro de Claude, pon tu clave en ⚙️ Ajustes, o pídeselo a una IA conectada por MCP.'));
  const grid = el('div', { class: 'g-lib', id: 'gLib' });
  for (const g of lib) grid.append(el('button', { type: 'button', class: 'g-item', 'data-nav': '', on: { click: () => openGame(g) } }, el('i', {}, g.emoji || '🎲'), el('b', {}, g.title), el('small', {}, g.description || ''),
    el('span', { class: 'g-tags' }, el('em', {}, `${g.minPlayers}-${g.maxPlayers} jugadores`), el('em', {}, g.realtime ? 'tiempo real' : 'por turnos'), g.example ? el('em', { class: 'ex' }, 'ejemplo') : null)));
  r.append(create, el('h3', { class: 'sec' }, 'Tus juegos'), grid);
}

/* ---------- Crear y mejorar con IA ---------- */
const API = `KIT DE JUEGOS DE PLATÓ — escribe UN módulo JavaScript (ES) con "export default { … }". Sin imports, sin fetch, sin acceso al DOM ni a window: todo pasa por ctx.
Estructura:
export default {
  meta: { title, description (español, 1 frase), minPlayers, maxPlayers, realtime: true|false, pov: true si cada jugador ve su propia cámara en el móvil },
  setup(ctx) → devuelve el ESTADO inicial: solo datos JSON (números, textos, listas, objetos). Nada de objetos 3D en el estado.
  scene(ctx, state) → construye el mundo 3D una vez con ctx.kit. Guarda referencias a objetos 3D en ctx.local.
  render(ctx, state, dt) → cada fotograma actualiza los objetos 3D a partir del estado (posiciones, colores, visibilidad). No cambies el estado aquí.
  actions: { nombre(ctx, state, player, args) { …modifica state… } } → lo que pulsan los jugadores en el mando (juegos por turnos o eventos).
  update(ctx, state, dt, inputs) → SOLO si realtime: simula; inputs[player.id] = { x: -1..1, y: -1..1, a: bool, b: bool } (joystick y dos botones).
  controller(ctx, state, player) → qué ve ESE jugador en su móvil. Devuelve un objeto con cualquiera de: title, text, color, wait: 'Turno de …', buttons: [{ action, label, args, style: 'primary'|'danger', disabled }], choices: { prompt, options: [{ label, action, args }] }, cards: [{ label, sub, color, action?, args? }] (mano privada o propiedades), number: { label, min, max, step, action } (envía args.value), joystick: true, actionButtons: [{ id: 'a'|'b', label }], pov: true.
  hud(ctx, state) → pantalla grande: { title, lines: [..], scores: [{ name, value, color }], message }.
}
ctx: players [{ id, name, color, index }], player(id), local {}, mode ('host' | 'view' en el móvil con ctx.viewer = id del jugador), time, random(), int(a, b), pick(arr), shuffle(arr), say(texto) (cartel grande), sfx('dice'|'coin'|'win'|'lose'|'hit'|'jump'|'click'|'shoot'|'beep'|'buy'), music('calm'|'action'|'off'), end(idGanador | 'texto').
ctx.kit (mundo low-poly con three.js): env({ sky, ground, light: 'day'|'night'|'studio', fog }), box({ w, h, d, color, x, y, z, ry }), cylinder({ r, h }), sphere({ r, onGround }), cone({ r, h }), plane({ w, d }), group(), text({ text, size, color, bg, face: 'up'|'camera'|'front' }), setText(obj, texto),
  person({ color, pants, skin, hat, scale }) + animate(fig, velocidad0a1, dt), car({ color }), tree(), house({ color, roof, w, h }), coin(), tile({ x, z, ry, w, d, color, base, label, labelSize }),
  board.ring({ tiles, size }) → casillas alrededor de un cuadrado [{ x, z, ry, w, d, index }], board.grid({ cols, rows, size }), board.circle({ n, r }), dice.show([valores], { x, z }) (animación),
  move(obj, { x, y, z }, segundos, alAcabar), hop(obj, destino, s, alAcabar), hopPath(obj, [puntos], s, alAcabar), tween(fn(u 0..1), s, alAcabar), after(s, fn), face(obj, punto), remove(obj), burst({ x, y, z, color }), dist(a, b), ray(origen, dir, objetos) → { object, distance }, clamp, lerp,
  cam.top({ h, tilt }), cam.orbit({ dist, h, speed }), cam.follow(obj, { dist, h }), cam.pov(obj, { h }), cam.look(pos, target), THREE (para lo avanzado), color(nombre) con rojo, azul, verde, amarillo, naranja, morado, rosa, blanco, negro, gris, marron, cian.
Todas las piezas aceptan x, y, z, ry, scale, color y parent (para meterlas en un group). Unidades en metros; el suelo es y = 0.
REGLAS: textos en español; colores de cada jugador = player.color; el estado debe ser serializable y contener todo lo que el móvil necesita para dibujar (en pov el móvil solo recibe el estado); valida en cada acción que es el turno de ese jugador; cada jugador debe tener SIEMPRE algo que hacer o un "wait" claro; usa ctx.end() al terminar; nada de bucles infinitos; código completo, sin "…" ni TODO.`;
const extract = t => { const m = String(t).match(/```(?:js|javascript)?\s*\n([\s\S]*?)```/); const c = (m ? m[1] : t).trim(); if (!/export\s+default/.test(c)) throw new Error('La IA no devolvió un juego válido'); return c; };
async function examplesBlock() { const [a, b] = await Promise.all(EXAMPLES.map(exampleCode)); return `EJEMPLO 1 (por turnos):\n\`\`\`js\n${a}\n\`\`\`\nEJEMPLO 2 (tiempo real con vista en el móvil):\n\`\`\`js\n${b}\n\`\`\``; }
async function buildAndTest(firstPrompt, step) {
  step('Diseñando reglas y escribiendo el juego…'); let code = extract(await llmText(firstPrompt, { maxTokens: 16000 }));
  for (let i = 0; i < 3; i++) { step(i ? `Corrigiendo (${i}/2)…` : 'Probándolo: jugando unas rondas solo…'); const res = await testGame(code); if (res.ok) return { code, fixed: i };
    if (i === 2) throw Object.assign(new Error('El juego sigue fallando: ' + res.errors[0]), { code });
    step(`He encontrado un fallo; lo arreglo (${i + 1}/2)…`);
    code = extract(await llmText(`${API}\n\nEste juego falla en la prueba automática. Corrígelo y devuelve el módulo COMPLETO en un bloque \`\`\`js.\nERRORES:\n${res.errors.join('\n')}\n\nCÓDIGO:\n\`\`\`js\n${code}\n\`\`\``, { maxTokens: 16000 })); }
}
async function createGame(desc) {
  desc = (desc || '').trim(); if (!desc) { toast('Describe el juego que quieres'); return; } if (!llmReady()) { toast('Configura la IA en Ajustes', 3500); return; } if (G.busy) return;
  const step = t => { G.busy = t; const b = root && root.querySelector('.g-create .b.hot'); if (b) b.textContent = '⏳ ' + t; };
  try { const { code, fixed } = await buildAndTest(`${API}\n\n${await examplesBlock()}\n\nPETICIÓN DEL JUGADOR: ${desc}\nCrea un juego NUEVO para esta petición (no copies los ejemplos salvo que encajen). Devuelve SOLO el módulo en un bloque \`\`\`js.`, step);
    const m = metaOf(code); const g = { id: 'game-' + uid(), kind: 'game', t: Date.now(), title: m.title, prompt: desc, code, versions: [{ t: Date.now(), code, note: 'Primera versión' }] };
    await db.put('projects', g); G.busy = null; toast(`🎮 ${m.title} listo${fixed ? ` (me corregí ${fixed} vez${fixed > 1 ? 'es' : ''})` : ''}`, 4000); guideEvent('game-create'); renderGames(root); openGame({ ...g, ...m });
  } catch (e) { G.busy = null; renderGames(root); toast('No he podido crear el juego: ' + e.message, 6000); }
}
async function improveGame(g, ask) {
  ask = (ask || '').trim(); if (!ask) return; if (!llmReady()) { toast('Configura la IA en Ajustes'); return; } if (G.busy) return;
  const step = t => { G.busy = t; toast('⏳ ' + t, 60000); };
  try { const { code } = await buildAndTest(`${API}\n\nJUEGO ACTUAL:\n\`\`\`js\n${g.code}\n\`\`\`\n\nCAMBIOS QUE PIDE EL JUGADOR: ${ask}\nAplica los cambios conservando lo que funciona. Devuelve el módulo COMPLETO en un bloque \`\`\`js.`, step);
    const base = g.example ? { id: 'game-' + uid(), kind: 'game', title: metaOf(g.code).title, prompt: 'A partir de ' + g.title, versions: [{ t: Date.now(), code: g.code, note: 'Original' }] } : await db.get('projects', g.id);
    base.code = code; base.t = Date.now(); base.title = metaOf(code).title; base.versions = [...(base.versions || []), { t: Date.now(), code, note: ask }].slice(-20); await db.put('projects', base);
    G.busy = null; toast('✨ Juego mejorado: v' + base.versions.length, 3500); renderGames(root); openGame({ ...base, ...metaOf(code) });
  } catch (e) { G.busy = null; toast('No he podido mejorarlo: ' + e.message, 6000); }
}
function openGame(g) {
  const ask = el('input', { class: 'txt', placeholder: 'Pide cambios: «más rápido», «que haya trampas», «añade una ronda final»…' });
  const body = el('div', { class: 'g-detail' }, el('p', {}, g.description || ''), el('div', { class: 'note' }, `${g.minPlayers}-${g.maxPlayers} jugadores · ${g.realtime ? 'tiempo real' : 'por turnos'}${g.versions ? ` · versión ${g.versions.length}` : ''}`),
    el('div', { class: 'row-btns' }, btn('▶ Jugar', () => { close(); startSession(g); }, 'b hot')),
    el('div', { class: 'lbl' }, 'Mejorarlo hablando'), el('div', { class: 'inrow' }, ask, btn('✨', () => { close(); improveGame(g, ask.value); }, 'b on')),
    el('div', { class: 'row-btns' }, g.versions && g.versions.length > 1 ? btn('🗂 Versiones', () => versions(g), 'mini-b') : null, btn('</> Ver código', () => modal('Código de ' + g.title, el('pre', { class: 'code' }, g.code), { wide: true }), 'mini-b'),
      btn('📋 Copiar código', () => copyText(g.code), 'mini-b'), !g.example ? btn('🗑 Borrar', async () => { if (await confirmBox('Borrar juego', `¿Borrar «${g.title}»?`, 'Borrar')) { await db.del('projects', g.id); close(); renderGames(root); } }, 'mini-b red') : null));
  const close = modal(`${g.emoji || '🎲'} ${g.title}`, body, { wide: true });
}
function versions(g) { const list = el('div', { class: 'log' }); g.versions.slice().reverse().forEach((v, i) => list.append(el('div', {}, el('em', {}, `v${g.versions.length - i}`), el('span', {}, `${new Date(v.t).toLocaleString('es-ES')} · ${v.note || ''}`),
  btn('↺', async () => { const p = await db.get('projects', g.id); p.code = v.code; p.t = Date.now(); p.versions.push({ t: Date.now(), code: v.code, note: 'Vuelta a v' + (g.versions.length - i) }); await db.put('projects', p); toast('↺ Versión restaurada'); renderGames(root); }, ''))));
  modal('Versiones', list, { wide: true }); }

/* ---------- Partida: sala, jugadores, mandos ---------- */
async function lanInfo() { if (host.claude) return null; try { const r = await fetch('/lan', { cache: 'no-store' }); if (!r.ok) return null; const j = await r.json(); return j && j.lan && j.ips && j.ips.length ? j : null; } catch (e) { return null; } }
const code4 = () => Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 24)]).join('');
async function startSession(g) {
  const s = G.session = { game: g, meta: metaOf(g.code), room: code4(), players: [], started: false, net: null, lan: null, rt: null, specs: {}, codeSent: new Set(), lastState: null };
  s.lan = await lanInfo(); if (s.lan) openNet(s);
  addLocal(s, 'Jugador 1'); if ((s.meta.minPlayers || 1) > 1) addLocal(s, 'Jugador 2');
  if (location.hash !== '#games') location.hash = '#games'; else renderGames(root);
}
function addLocal(s, name) { if (s.players.length >= (s.meta.maxPlayers || 8)) { toast('Ya está lleno'); return; } s.players.push({ id: 'L' + uid().slice(0, 6), name, color: PALETTE[s.players.length % PALETTE.length], index: s.players.length, local: true }); }
function openNet(s) {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/game?room=${s.room}&role=host`); s.net = ws;
  const send = (to, data) => { if (ws.readyState === 1) ws.send(JSON.stringify({ to, data })); }; s.sendTo = send;
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.type === 'join') { let p = s.players.find(x => x.id === m.id); if (!p) { if (s.started) { send(m.id, { type: 'ui', spec: { title: s.meta.title, wait: 'Partida en curso: entrarás en la próxima' } }); return; }
        if (s.players.length >= (s.meta.maxPlayers || 8)) { send(m.id, { type: 'ui', spec: { title: 'Sala llena', text: 'No caben más jugadores en este juego.' } }); return; }
        const firstLocal = s.players.findIndex(x => x.local && /^Jugador \d$/.test(x.name)); const color = firstLocal >= 0 ? s.players[firstLocal].color : PALETTE[s.players.length % PALETTE.length];
        p = { id: m.id, name: m.name || 'Jugador', color, remote: true }; if (firstLocal >= 0) s.players.splice(firstLocal, 1, p); else s.players.push(p); s.players.forEach((x, i) => x.index = i); toast(`📱 ${p.name} se une`); }
      else p.online = true; if (s.started) { sendCode(s, p); if (s.specs[p.id]) send(p.id, { type: 'ui', spec: s.specs[p.id] }); } else send(p.id, { type: 'ui', spec: { title: `Hola, ${p.name}`, color: p.color, wait: 'Esperando a que empiece la partida' } }); refreshLobby(); }
    if (m.type === 'leave') { const p = s.players.find(x => x.id === m.id); if (p && !s.started) { s.players = s.players.filter(x => x !== p); s.players.forEach((x, i) => x.index = i); } refreshLobby(); }
    if (m.type === 'msg' && s.rt) { const d = m.data || {}; if (d.type === 'action') s.rt.send({ type: 'action', player: m.from, name: d.name, args: d.args }); if (d.type === 'input') s.rt.send({ type: 'input', player: m.from, input: d.input }); } };
  ws.onclose = () => { if (G.session === s) { s.net = null; } };
}
function sendCode(s, p) { if (!s.sendTo || !p.remote || !s.lastState) return; s.sendTo(p.id, { type: 'code', code: s.game.code, players: s.players.map(({ id, name, color, index }) => ({ id, name, color, index })), state: s.lastState, seed: s.seed }); s.codeSent.add(p.id); }
let lobbyEl = null;
function refreshLobby() { if (lobbyEl && G.session) lobbyEl.replaceWith(lobbyEl = lobby(G.session)); }
function lobby(s) {
  const url = s.lan ? `http://${s.lan.ips[0]}:${s.lan.port}/play.html?room=${s.room}` : null;
  const list = el('div', { class: 'g-players' }, s.players.map(p => el('div', { class: 'g-pl', style: `--c:${p.color}` }, el('i', {}), el('input', { class: 'txt sm', value: p.name, disabled: !p.local, on: { change: e => { p.name = e.target.value.trim() || p.name; } } }), el('small', {}, p.remote ? '📱 móvil' : '⌨️ en la tele'), p.local ? btn('✕', () => { s.players = s.players.filter(x => x !== p); s.players.forEach((x, i) => x.index = i); refreshLobby(); }, 'x') : null)));
  return el('div', { class: 'g-lobby' }, el('div', { class: 'g-lcol' }, el('h2', {}, s.meta.title), el('p', { class: 'note' }, s.meta.description || ''), el('div', { class: 'lbl' }, `Jugadores (${s.players.length}/${s.meta.maxPlayers})`), list,
      el('div', { class: 'row-btns' }, btn('➕ Jugador en la tele', () => { addLocal(s, 'Jugador ' + (s.players.length + 1)); refreshLobby(); }, 'mini-b'), btn('▶ Empezar', () => begin(s), 'b hot'), btn('Salir', endSession, 'mini-b'))),
    el('div', { class: 'g-qr' }, url ? el('div', { html: qrSVG(url) }) : el('div', { class: 'g-noqr' }, '📱'), url ? el('b', {}, `Código ${s.room}`) : el('b', {}, 'Móviles como mando'),
      el('small', {}, url ? `Escanéalo con el móvil (misma wifi) o entra en ${s.lan.ips[0]}:${s.lan.port}/play.html` : 'Abre Plató como aplicación en tu ordenador o aparato (plato.sh / Plato.cmd) y los móviles podrán unirse con un QR. Mientras, jugáis todos en la tele.')));
}
function layer() { let L = document.getElementById('gamelayer'); if (!L) { L = el('div', { id: 'gamelayer' }); document.getElementById('main').append(L); } return L; }
function renderStage(r) {
  const s = G.session; r.innerHTML = '';
  const stage = el('div', { class: 'g-stage' }); const top = el('div', { class: 'g-top' }, el('b', {}, s.meta.title), s.lan ? el('span', { class: 'g-code' }, `📱 ${s.room}`) : null, btn('✕ Salir', endSession, 'mini-b'));
  const pads = el('div', { class: 'g-pads' }); r.append(stage, top, pads);
  if (!s.started) { lobbyEl = lobby(s); r.append(lobbyEl); return; }
  s.stageEl = stage; s.padsEl = pads; mountRuntime(s);
}
async function begin(s) {
  if (s.players.length < (s.meta.minPlayers || 1)) { toast(`Hacen falta al menos ${s.meta.minPlayers} jugadores`); return; }
  s.started = true; s.seed = Math.floor(Math.random() * 1e9); lobbyEl = null; guideEvent('game-play'); renderStage(layer());
}
async function mountRuntime(s) {
  try { s.rt = await makeRuntime(s.stageEl); } catch (e) { toast('No se pudo arrancar el juego: ' + e.message, 5000); return; }
  const locals = s.players.filter(p => !p.remote);
  s.rt.on(m => {
    if (m.type === 'ui') { s.specs[m.player] = m.spec; const p = s.players.find(x => x.id === m.player); if (!p) return; if (p.remote) s.sendTo && s.sendTo(p.id, { type: 'ui', spec: m.spec }); else drawLocalPads(s); }
    if (m.type === 'state') { s.lastState = m.state; for (const p of s.players) if (p.remote) { if (!s.codeSent.has(p.id)) sendCode(s, p); else if (s.specs[p.id] && s.specs[p.id].pov) s.sendTo(p.id, { type: 'state', state: m.state }); } }
    if (m.type === 'over') { s.over = m.result; if (s.sendTo) s.sendTo('all', { type: 'over', result: m.result }); setTimeout(() => showOver(s), 2500); }
    if (m.type === 'error') { s.lastError = `${m.where}: ${m.message}`; showErr(s); }
  });
  s.rt.send({ type: 'load', code: s.game.code, players: s.players.map(({ id, name, color, index }) => ({ id, name, color, index })), mode: 'host', seed: s.seed });
  s.locals = locals; s.padTab = 0; drawLocalPads(s);
}
const KEYS = [{ up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', a: 'Space', b: 'KeyE' }, { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', a: 'Enter', b: 'ShiftRight' }];
function drawLocalPads(s) {
  const box = s.padsEl; if (!box || !box.isConnected) return; const locals = s.players.filter(p => !p.remote); if (!locals.length) { box.hidden = true; return; } box.hidden = false;
  if (s.meta.realtime) { if (box.dataset.rt === '1') return; box.dataset.rt = '1'; box.innerHTML = ''; box.classList.add('rt');
    locals.slice(0, 2).forEach((p, i) => { const d = el('div', { class: 'g-pad' }); box.append(d); renderPad(d, { title: p.name, color: p.color, joystick: true, actionButtons: [{ id: 'a', label: '🅰' }, { id: 'b', label: '🅱' }], text: i ? 'Flechas · Enter · Mayús' : 'WASD · Espacio · E' }, m => { if (m.type === 'input') s.rt.send({ type: 'input', player: p.id, input: m.input }); }, { keys: KEYS[i] }); });
    if (locals.length > 2) box.append(el('div', { class: 'note' }, 'Más de dos jugadores en tiempo real: uníos con el móvil.')); return; }
  // Por turnos: mando del jugador al que le toca (o pestañas para todos)
  const active = locals.find(p => { const sp = s.specs[p.id]; return sp && !sp.wait && ((sp.buttons && sp.buttons.length) || sp.choices || sp.number || (sp.cards || []).some(c => c.action)); }) || locals[s.padTab % locals.length];
  box.innerHTML = ''; const tabs = el('div', { class: 'g-ptabs' }, locals.map(p => btn(p.name, () => { s.padTab = locals.indexOf(p); s.pinned = p.id; drawLocalPads(s); }, 'chip' + (p === active ? ' on' : ''))));
  const d = el('div', { class: 'g-pad' }); box.append(tabs, d); const show = active || locals.find(p => p.id === s.pinned) || locals[0];
  renderPad(d, s.specs[show.id] || { title: show.name, wait: 'Cargando…' }, m => { if (m.type === 'action') s.rt.send({ type: 'action', player: show.id, name: m.name, args: m.args }); });
}
function showOver(s) { if (G.session !== s) return; const close = modal('🏁 Fin de la partida', el('div', {}, el('p', { style: 'font-size:20px' }, s.over || ''), el('div', { class: 'row-btns' }, btn('↺ Otra partida', () => { close(); const g = s.game; endSession(); startSession(g); }, 'b hot'), btn('Salir', () => { close(); endSession(); }, 'mini-b')))); }
function showErr(s) { if (s.errShown) return; s.errShown = true; toast('⚠️ El juego ha fallado: ' + s.lastError, 8000, { action: llmReady() && !s.game.example ? { label: '🔧 Arreglarlo con IA', fn: () => { const g = s.game; endSession(); improveGame(g, 'Arregla este error que ha salido jugando: ' + s.lastError); } } : null }); }
export function endSession() { const s = G.session; if (!s) return; try { s.rt && s.rt.destroy(); } catch (e) {} try { s.net && s.net.close(); } catch (e) {} if (s.padsEl) { for (const p of s.padsEl.querySelectorAll('.pad')) p._padStop && p._padStop(); } G.session = null; const L = document.getElementById('gamelayer'); if (L) { L.innerHTML = ''; L.classList.remove('on'); } if (root && location.hash === '#games') renderGames(root); }

/* ---------- API para el MCP ---------- */
export async function gamesList() { return (await library()).map(g => ({ id: g.id, title: g.title, description: g.description, players: `${g.minPlayers}-${g.maxPlayers}`, realtime: g.realtime, example: !!g.example, versions: g.versions ? g.versions.length : 1 })); }
export async function gamesGet(id) { const g = (await library()).find(x => x.id === id); if (!g) throw new Error('No existe el juego ' + id); return { id: g.id, title: g.title, code: g.code }; }
export async function gamesSave({ id, code, note }) { const res = await testGame(code); if (!res.ok) return { ok: false, errors: res.errors };
  let g = id && !id.startsWith('ex-') ? await db.get('projects', id) : null; if (!g) g = { id: 'game-' + uid(), kind: 'game', versions: [], prompt: note || 'Creado por una IA externa' };
  g.code = code; g.t = Date.now(); g.title = metaOf(code).title; g.versions = [...(g.versions || []), { t: Date.now(), code, note: note || 'IA externa' }].slice(-20); await db.put('projects', g); guideEvent('game-create'); if (root && location.hash === '#games') renderGames(root); return { ok: true, id: g.id, title: g.title }; }
export async function gamesPlay(id) { const g = (await library()).find(x => x.id === id); if (!g) throw new Error('No existe el juego ' + id); location.hash = '#games'; await startSession(g); return { room: G.session.room, phones: G.session.lan ? `http://${G.session.lan.ips[0]}:${G.session.lan.port}/play.html?room=${G.session.room}` : null }; }
export const GAME_API = API;
// Crear un juego sin pantalla de por medio (lo usa el asistente del móvil).
export async function gamesCreate(desc) {
  if (!llmReady()) throw new Error('Configura la IA en Ajustes');
  const { code, fixed } = await buildAndTest(`${API}\n\n${await examplesBlock()}\n\nPETICIÓN DEL JUGADOR: ${desc}\nCrea un juego NUEVO para esta petición (no copies los ejemplos salvo que encajen). Devuelve SOLO el módulo en un bloque \`\`\`js.`, () => {});
  const m = metaOf(code); const g = { id: 'game-' + uid(), kind: 'game', t: Date.now(), title: m.title, prompt: desc, code, versions: [{ t: Date.now(), code, note: 'Primera versión' }] };
  await db.put('projects', g); guideEvent('game-create'); return { id: g.id, title: m.title, description: m.description, fixed };
}
