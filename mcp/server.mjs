#!/usr/bin/env node
// Plató Studio · servidor MCP (sin dependencias, Node 18+).
// Conecta cualquier cliente MCP (Claude Desktop, Claude Code, Cursor, etc.) con la app abierta en el navegador.
//   stdio:  node mcp/server.mjs                      (lo lanza el cliente MCP)
//   HTTP:   node mcp/server.mjs --http-only          (MCP en http://localhost:7821/mcp con token)
// La app se conecta al puente en ws://localhost:7821/bridge. El propio servidor sirve la app en http://localhost:7821/
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const VERSION = '1.0.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const PORT = +opt('port', process.env.PLATO_MCP_PORT || 7821);
const OUT = path.resolve(opt('out', process.env.PLATO_OUT || path.join(os.homedir(), 'PlatoStudio')));
const CONF = path.join(os.homedir(), '.plato-studio');
const HTTP_ONLY = flag('http-only');
const APP_URL = opt('app-url', `http://localhost:${PORT}/index.html?mcp=${PORT}`);
const ORIGINS = new Set([`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`, 'https://dani3l-gonzal3z.github.io', ...String(opt('origin', process.env.PLATO_ORIGINS || '')).split(',').map(s => s.trim()).filter(Boolean)]);
const log = (...a) => process.stderr.write('[plato-mcp] ' + a.join(' ') + '\n');

/* ---------- Token para el modo HTTP ---------- */
function loadToken() {
  const given = opt('token', process.env.PLATO_MCP_TOKEN); if (given) return given;
  try { fs.mkdirSync(CONF, { recursive: true }); const f = path.join(CONF, 'token'); if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim(); const t = crypto.randomBytes(24).toString('hex'); fs.writeFileSync(f, t, { mode: 0o600 }); return t; } catch (e) { return crypto.randomBytes(24).toString('hex'); }
}
const TOKEN = loadToken();

/* ---------- Herramientas ---------- */
const DSL = `Commands (JSON objects with "op"). Units: metres. Ground y=0, x/z horizontal. heading in degrees: 0 faces +z, 90 faces +x.
- add: {"op":"add","kind":K,"name":"Ana","color":"red|#hex","x":0,"z":0,"heading":0,"count":1,"outfit":ARCHETYPE,"size":[w,h,l],"scale":1}
  people: person, child · vehicles: car, sport, police, van, truck, bus · props: box, barrel, cone, ball, wall, ramp, platform, building, house, tree, lamp, column, bench, container, table, chair, stool, sofa, shelf, workbench, bed, tv, desk, door, window, fridge, counter, plant, rug, shutter, console, tires, toolcart, hanglamp, floorlamp, screen, board, crate, machine, pod
  outfit (people): scientist, teen, detective, hero, astronaut, knight, king, robot, alien, cowboy, ninja, pirate, wizard, chef, doctor, cop, soldier, zombie, executive, grandma, grandpa, girl, boy, athlete
- set: {"op":"set","name":"garage|living|kitchen|office|bar|classroom|bedroom|bridge|alley|warehouse|western|interview","x":0,"z":0} adds a whole stock set
- act: {"op":"act","target":N,"action":A,"duration":s} A: idle wave point jump punch kick push throw fall stumble getup sit sitground crouch kneel lie dance cheer clap talk phone lookaround guard handsup bow
- goto: {"op":"goto","target":N,"to":N|{"x":0,"z":0}|{"of":N|"camera","side":"front|behind|left|right","dist":2},"mode":"walk|run|sneak|crawl"} (vehicles: "speed":kmh, "ram":true)
- follow {"target","who","mode","dist","speed"} · flee {"target","from","duration"} · look {"target","at"} · headlook {"target","at":N|"camera"|null}
- drive {"target","style":"straight|circle|eight|drift|reverse|turn","speed","dir":"left|right"} · brake · enter {"target":person,"car":vehicle,"instant":true} · exit · lights/siren {"on":true}
- place {"target","to":POS,"heading"} · remove · clear · rename · color
- fx {"type":"explosion|fire|smoke|dark smoke|sparks|dust|clear","at":POS,"power":0.5-2}
- env {"preset":"studio|city|highway|desert|forest|grid","time":0-24,"weather":"clear|fog|rain|storm|snow","fog":0-1,"exposure":0.3-3}
- camera {"mode":"free|fixed|follow|front|side|orbit|pov|tripod|crane|drone|vertigo|low|top","target":N,"lens":mm,"dist":m,"height":m,"shake":0-1,"dutch":deg,"cut":true}
- time {"scale":0.05-2} (slow motion)
Any command accepts "delay": seconds from now (choreography). Commands on the same entity chain in order; different entities act in parallel. Targets: exact name | "todos" | "personas" | "vehiculos".
The first action command (not add/env/place) starts recording a TAKE automatically; replays are frame-identical.`;
const media = { type: 'string', description: 'Media reference: "last_take" (latest plató recording), "gallery:<id>", or "file:/absolute/path" on this computer.' };
const TOOLS = [
  { name: 'studio_status', description: 'Check that Plató Studio is connected and see what is available: providers with keys, budget, LLM, scene summary. Call this first.', inputSchema: { type: 'object', properties: {} } },
  { name: 'studio_open', description: 'Open Plató Studio in the browser (or headless) so it connects to this MCP server. Use when studio_status says the app is not connected.', inputSchema: { type: 'object', properties: { headless: { type: 'boolean', description: 'Run hidden in a headless Chromium (needs Playwright installed). Default false: opens your normal browser.' } } } },
  { name: 'scene_get', description: 'Get the full 3D scene: entities with positions/headings/outfits, environment, main camera, multi-camera rig, current take (duration and script) and the layout of the environment.', inputSchema: { type: 'object', properties: {} } },
  { name: 'scene_command', description: 'Give the plató an order in natural language (Spanish or English), e.g. "mete dos coches y que el rojo persiga al azul". The plató converts it to commands. Prefer scene_dsl when you need precise control.', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } },
  { name: 'scene_dsl', description: 'Run exact JSON commands in the 3D plató (deterministic). ' + DSL, inputSchema: { type: 'object', properties: { commands: { type: 'array', items: { type: 'object' } } }, required: ['commands'] } },
  { name: 'scene_view', description: 'Look at the scene: returns a still image from the main camera, from one rig camera (name, e.g. "B") or "all" (multi-camera monitor wall). Use it to check framing and blocking.', inputSchema: { type: 'object', properties: { camera: { type: 'string', description: '"main" (default), a rig camera name, or "all"' } } } },
  { name: 'stock_list', description: 'List the stock: ready-made sets (garage-lab, living room, kitchen, office, bar, classroom, bedroom, spaceship bridge, alley, warehouse, western town, interview stage), character archetypes with costumes, props, actions, camera modes, shot sizes.', inputSchema: { type: 'object', properties: {} } },
  { name: 'stock_load_set', description: 'Replace the scene with a stock set (or a user-saved one) and optionally place a cast on its actor marks.', inputSchema: { type: 'object', properties: { set: { type: 'string', description: 'Set id or name, e.g. "garage"' }, cast: { type: 'array', items: { type: 'object', properties: { archetype: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' } } } } }, required: ['set'] } },
  { name: 'camera_set', description: 'Set the main camera: a move mode and/or a framing of a subject (shot size + angle).', inputSchema: { type: 'object', properties: { mode: { type: 'string' }, target: { type: 'string' }, lens: { type: 'number' }, dist: { type: 'number' }, height: { type: 'number' }, shake: { type: 'number' }, dutch: { type: 'number' }, frame: { type: 'object', properties: { subject: { type: 'string' }, size: { type: 'string', enum: ['general', 'conjunto', 'medio', 'primer', 'detalle'] }, angle: { type: 'string', enum: ['front', 'tq', 'side', 'back', 'high', 'low'] } } } } } },
  { name: 'cameras_rig', description: 'Multi-camera rig: several cameras watching the SAME take. action=add (from a spec or from the current view), coverage (auto 4-camera coverage of a subject), list, remove, clear, view (show one camera in the main view, "main" to go back), monitor (grid of all cameras on/off), auto_cuts (automatic edit alternating cameras), cuts (set your own edit: [{t:seconds,camera:"A"}]).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['add', 'coverage', 'list', 'remove', 'clear', 'view', 'monitor', 'auto_cuts', 'cuts'] }, name: { type: 'string' }, target: { type: 'string', description: 'subject to frame/follow' }, mode: { type: 'string' }, size: { type: 'string', enum: ['general', 'conjunto', 'medio', 'primer', 'detalle'] }, angle: { type: 'string', enum: ['front', 'tq', 'side', 'back', 'high', 'low'] }, lens: { type: 'number' }, dist: { type: 'number' }, height: { type: 'number' }, on: { type: 'boolean' }, cuts: { type: 'array', items: { type: 'object', properties: { t: { type: 'number' }, camera: { type: 'string' } } } } }, required: ['action'] } },
  { name: 'take_control', description: 'Control the take: new (clear the recorded action, keep the set), play (replay from start), stop, start (go to frame 0), info. duration sets a fixed clip length in seconds (0 = auto).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['new', 'play', 'stop', 'start', 'info'] }, duration: { type: 'number' } }, required: ['action'] } },
  { name: 'take_record', description: 'Record the current take to video (real time, deterministic replay). cameras: "main", "all" (one video per rig camera) or a list of names. program=true records the edited multi-camera cut. depth=true adds a depth-pass video. Returns file paths + first frames. Long: may return a task_id (use task_result).', inputSchema: { type: 'object', properties: { cameras: { description: '"main" | "all" | ["A","C"]' }, program: { type: 'boolean' }, depth: { type: 'boolean' }, to_gallery: { type: 'boolean', description: 'Also store the videos in the app gallery (default true)' } } } },
  { name: 'models_search', description: 'Search the AI models the user can use (their own API keys, pay-per-use): video-to-video restyle, image-to-video, text-to-video, images, audio. Shows provider, price per second when known and whether it is ready.', inputSchema: { type: 'object', properties: { query: { type: 'string' }, mode: { type: 'string', enum: ['v2v', 'i2v', 't2v', 't2i', 'i2i', 'audio', 'lip', 'motion'] }, limit: { type: 'number' } } } },
  { name: 'generate', description: 'Generate with an AI model using the user\'s keys (costs money: the app enforces the budget and asks the user above the auto-approve limit). For restyle of a plató take use a v2v model with inputs.video="last_take". Returns the result file. Long: may return a task_id.', inputSchema: { type: 'object', properties: { model_id: { type: 'string' }, prompt: { type: 'string' }, inputs: { type: 'object', properties: { video: media, image: media, end_image: media, control: media }, additionalProperties: media }, duration: { type: 'number' }, aspect: { type: 'string' }, resolution: { type: 'string' }, extra: { type: 'object', description: 'Raw extra input fields for the provider (e.g. voice_id)' } }, required: ['model_id'] } },
  { name: 'jobs_status', description: 'List running and recent generations in the app queue.', inputSchema: { type: 'object', properties: {} } },
  { name: 'gallery_list', description: 'List generated media in the app gallery (newest first).', inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['video', 'image', 'audio'] }, limit: { type: 'number' } } } },
  { name: 'gallery_get', description: 'Export one gallery item to a file on this computer and preview it.', inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] } },
  { name: 'director', description: 'AI Director projects (idea/chapter/book → shot list → automatic previz shooting → final video, voices, SFX, music → montage). action=create: pass your own "plan" JSON (same format as get returns: {title, logline, style, characters:[{name,kind,color,desc,voice}], scenes:[{id,heading,summary,place,time,weather,music,setup:[DSL add/set commands],action:[DSL with delay],shots:[{id,from,duration,subject,size,angle,camera:{mode,lens,shake},description,dialogue:[{who,line}],sfx}]}]}). action=plan: let the app\'s own LLM plan from "idea" (text). action=run: steps among previz, animatic, final, sound, assemble. action=get/list.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['create', 'plan', 'get', 'list', 'run'] }, project_id: { type: 'string' }, plan: { type: 'object' }, idea: { type: 'string' }, options: { type: 'object', description: '{dur, coverage:"basic|cine", style, aspect, lang:"es|en", videoModel, sfx, music}' }, steps: { type: 'array', items: { type: 'string', enum: ['previz', 'animatic', 'final', 'sound', 'assemble'] } } }, required: ['action'] } },
  { name: 'book_load', description: 'Load an e-book (EPUB, PDF, TXT) from this computer into a new Director project. Returns the chapters; then use director action=plan with project_id and options.chapter, or write your own plan.', inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } },
  { name: 'montage', description: 'The app\'s editor timeline: get (clips, audio tracks, subtitles) or export (renders the final video in real time; returns the file).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'export'] } }, required: ['action'] } },
  { name: 'task_result', description: 'Get the result of a long operation that returned a task_id. Waits up to wait_seconds (default 40).', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, wait_seconds: { type: 'number' } }, required: ['task_id'] } },
];
const INSTRUCTIONS = `Plató Studio: a 3D previsualisation stage + AI video studio running in the user's browser (their own API keys, pay per use).
Typical flow: studio_status → stock_list → stock_load_set (or scene_dsl to build) → take_control new → scene_dsl with action commands (use "delay" to choreograph) → scene_view to check → cameras_rig coverage (several angles of the SAME take) → take_record (cameras "all" or program) → generate with a v2v model and inputs.video="last_take" to turn the grey previz into a real-looking shot.
For whole chapters/books use director (you can write the plan yourself) or book_load. Files are saved under ${OUT}. Generations cost the user money: say what you are going to spend.`;

/* ---------- Puente con la app (WebSocket mínimo) ---------- */
let app = null; const pending = new Map(); let seq = 0;
function wsSend(sock, obj) { const data = Buffer.from(JSON.stringify(obj)); const n = data.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  sock.write(Buffer.concat([h, data])); }
function wsAccept(req, sock) {
  const origin = req.headers.origin; if (origin && !ORIGINS.has(origin)) { log('origen rechazado:', origin); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  const key = req.headers['sec-websocket-key']; if (!key) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`); sock.setNoDelay(true);
  let buf = Buffer.alloc(0), frags = [];
  const conn = { sock, send: o => wsSend(sock, o), origin, hello: null };
  sock.on('data', chunk => { buf = Buffer.concat([buf, chunk]);
    for (;;) { if (buf.length < 2) return; const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const mOff = off; if (masked) off += 4; if (buf.length < off + len) return;
      let pl = buf.subarray(off, off + len); if (masked) { const m = buf.subarray(mOff, mOff + 4); pl = Buffer.from(pl); for (let i = 0; i < pl.length; i++) pl[i] ^= m[i & 3]; }
      buf = buf.subarray(off + len);
      if (op === 8) { try { sock.end(Buffer.from([0x88, 0])); } catch (e) {} return; }
      if (op === 9) { const h = Buffer.from([0x8a, pl.length]); sock.write(Buffer.concat([h, pl])); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) { frags.push(pl); if (!fin) continue; const text = Buffer.concat(frags).toString('utf8'); frags = []; onAppMessage(conn, text); } } });
  const bye = () => { if (app === conn) { app = null; log('app desconectada'); for (const [id, p] of pending) { p.reject(new Error('La app se ha desconectado')); pending.delete(id); } } };
  sock.on('close', bye); sock.on('error', bye);
}
function onAppMessage(conn, text) { let m; try { m = JSON.parse(text); } catch (e) { return; }
  if (m.type === 'hello') { conn.hello = m; if (app && app !== conn) { try { app.send({ type: 'replaced' }); app.sock.end(); } catch (e) {} } app = conn; log('app conectada desde', conn.origin || 'origen desconocido'); conn.send({ type: 'welcome', version: VERSION, out: OUT }); return; }
  if (m.type === 'result' && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.result); return; }
  if (m.type === 'progress' && pending.has(m.id)) { const p = pending.get(m.id); p.onProgress && p.onProgress(m); }
}
function callApp(method, params, onProgress) { if (!app) return Promise.reject(Object.assign(new Error('Plató Studio no está conectado.'), { code: 'NOAPP' }));
  const id = 'r' + (++seq); return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); app.send({ type: 'call', id, method, params }); }); }
async function waitForApp(ms) { const t0 = Date.now(); while (!app && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 300)); return !!app; }

/* ---------- Abrir la app ---------- */
let headless = null;
async function openApp(useHeadless) {
  if (useHeadless) { if (headless) return 'Ya hay un navegador oculto abierto.';
    let pw = null; for (const m of ['playwright', 'playwright-core']) { try { pw = await import(m); break; } catch (e) {} }
    if (!pw) throw new Error('Para el modo oculto instala Playwright: npm i -g playwright && npx playwright install chromium');
    const chromium = pw.chromium || (pw.default && pw.default.chromium); const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
    const page = await b.newPage({ viewport: { width: 1280, height: 800 } }); await page.goto(APP_URL); headless = { b, page }; return 'Abierto en un Chromium oculto.'; }
  const cmd = process.platform === 'darwin' ? ['open', [APP_URL]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', APP_URL]] : ['xdg-open', [APP_URL]];
  try { spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { throw new Error('No he podido abrir el navegador. Abre tú: ' + APP_URL); }
  return 'Abriendo ' + APP_URL + ' en tu navegador.';
}

/* ---------- Archivos ---------- */
const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.epub': 'application/epub+zip', '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown', '.srt': 'text/plain', '.json': 'application/json' };
function readLocal(p) { p = p.replace(/^file:(\/\/)?/, ''); if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1)); p = path.resolve(p);
  const st = fs.statSync(p); if (st.size > 300 * 1024 * 1024) throw new Error('Archivo demasiado grande (máx. 300 MB): ' + p);
  return { __file: { name: path.basename(p), mime: MIME[path.extname(p).toLowerCase()] || 'application/octet-stream', b64: fs.readFileSync(p).toString('base64') } }; }
function inlineFiles(v) { if (typeof v === 'string' && /^file:/.test(v)) return readLocal(v); if (Array.isArray(v)) return v.map(inlineFiles); if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = inlineFiles(x); return o; } return v; }
function saveFile(f) { const day = new Date().toISOString().slice(0, 10); const dir = path.join(OUT, day); fs.mkdirSync(dir, { recursive: true });
  let name = String(f.name || 'archivo').replace(/[^\w.\-áéíóúñÁÉÍÓÚÑ]+/g, '_'); let p = path.join(dir, name); let i = 1; while (fs.existsSync(p)) { const e = path.extname(name); p = path.join(dir, `${path.basename(name, e)}-${i++}${e}`); }
  fs.writeFileSync(p, Buffer.from(f.b64, 'base64')); return p; }
function toContent(r) {
  const content = []; if (r == null) return [{ type: 'text', text: 'Hecho.' }]; if (typeof r !== 'object' || Array.isArray(r)) r = { result: r };
  const files = (r.files || []).map(f => ({ ...f, path: saveFile(f) }));
  const data = { ...r }; delete data.files; delete data.images; if (files.length) data.saved_files = files.map(f => ({ path: f.path, label: f.label, bytes: Math.round(f.b64.length * 0.75) }));
  const { text, ...rest } = data; const body = Object.keys(rest).length ? JSON.stringify(rest, null, 1) : '';
  content.push({ type: 'text', text: [text, body].filter(Boolean).join('\n') || 'Hecho.' });
  for (const im of r.images || []) content.push({ type: 'image', data: im.b64, mimeType: im.mime || 'image/jpeg' });
  return content;
}

/* ---------- Ejecución de herramientas ---------- */
const tasks = new Map();
const SOFT = { take_record: 55, generate: 50, director: 50, montage: 55, scene_command: 50, book_load: 50 };
async function runTool(name, args, onProgress) {
  args = args || {};
  if (name === 'task_result') { const t = tasks.get(args.task_id); if (!t) throw new Error('No existe la tarea ' + args.task_id);
    if (!t.done) await Promise.race([t.promise.catch(() => {}), new Promise(r => setTimeout(r, Math.min(110, +args.wait_seconds || 40) * 1000))]);
    if (!t.done) return [{ type: 'text', text: `La tarea ${args.task_id} (${t.tool}) sigue en marcha (${Math.round((Date.now() - t.t0) / 1000)} s). Vuelve a llamar a task_result.` }];
    if (t.error) throw t.error; return toContent(t.result); }
  if (name === 'studio_open') return [{ type: 'text', text: await openApp(!!args.headless) + (await waitForApp(20000) ? ' La app ya está conectada.' : ' Aún no se ha conectado: espera unos segundos y llama a studio_status.') }];
  if (name === 'studio_status' && !app) return [{ type: 'text', text: `Plató Studio no está conectado a este servidor MCP (puerto ${PORT}).\nOpciones: llama a studio_open, o abre ${APP_URL} en el navegador (o la app de GitHub Pages con ?mcp=${PORT}). La pestaña debe quedarse abierta y visible mientras trabajas.` }];
  if (name === 'book_load') args = { ...args, file: readLocal(args.path) };
  else args = inlineFiles(args);
  if (!app && flag('open')) { await openApp(flag('headless')); await waitForApp(25000); }
  const p = callApp(name, args, onProgress);
  const soft = (SOFT[name] || 0) * 1000;
  if (!soft) return toContent(await p);
  const t = { tool: name, t0: Date.now(), done: false, promise: p }; p.then(r => { t.done = true; t.result = r; }, e => { t.done = true; t.error = e; });
  await Promise.race([p.catch(() => {}), new Promise(r => setTimeout(r, soft))]);
  if (t.done) { if (t.error) throw t.error; return toContent(t.result); }
  const id = 't' + Date.now().toString(36); tasks.set(id, t);
  return [{ type: 'text', text: `Sigue trabajando (${name}). task_id=${id}. Llama a task_result con ese id para recoger el resultado.` }];
}

/* ---------- JSON-RPC / MCP ---------- */
const SUPPORTED = ['2025-06-18', '2025-03-26', '2024-11-05'];
async function handle(msg, ctx = {}) {
  const { id, method, params } = msg; const isNote = id === undefined || id === null;
  const ok = result => isNote ? null : { jsonrpc: '2.0', id, result };
  const err = (code, message) => isNote ? null : { jsonrpc: '2.0', id, error: { code, message } };
  try {
    switch (method) {
      case 'initialize': return ok({ protocolVersion: SUPPORTED.includes(params && params.protocolVersion) ? params.protocolVersion : SUPPORTED[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'plato-studio', title: 'Plató Studio', version: VERSION }, instructions: INSTRUCTIONS });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'resources/list': return ok({ resources: [] });
      case 'prompts/list': return ok({ prompts: [] });
      case 'tools/call': {
        const name = params && params.name; if (!TOOLS.some(t => t.name === name)) return err(-32602, 'Herramienta desconocida: ' + name);
        if (ctx.relay) return await ctx.relay(msg);
        const token = params._meta && params._meta.progressToken; let n = 0;
        const onProgress = token != null && ctx.notify ? m => ctx.notify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: token, progress: ++n, message: m.message || '' } }) : null;
        try { return ok({ content: await runTool(name, params.arguments, onProgress) }); }
        catch (e) { return ok({ content: [{ type: 'text', text: (e.code === 'NOAPP' ? `Plató Studio no está conectado. Llama a studio_open o abre ${APP_URL}.` : 'Error: ' + (e.message || e)) }], isError: true }); }
      }
      default: if (method && method.startsWith('notifications/')) return null; return err(-32601, 'Método no encontrado: ' + method);
    }
  } catch (e) { return err(-32603, e.message || String(e)); }
}

/* ---------- Servidor HTTP: puente, MCP por HTTP y la propia app ---------- */
const STATIC = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.png', '.json', '.webmanifest', '.txt', '.ico']);
function serveStatic(req, res) {
  let u = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (u === '/') u = '/index.html';
  const p = path.join(ROOT, path.normalize(u)); const ext = path.extname(p).toLowerCase();
  if (!p.startsWith(ROOT + path.sep) || u.split('/').some(s => s.startsWith('.')) || !STATIC.has(ext) || !fs.existsSync(p) || !fs.statSync(p).isFile()) { res.writeHead(404); res.end('No encontrado'); return; }
  res.writeHead(200, { 'content-type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' }[ext], 'cache-control': 'no-cache' }); fs.createReadStream(p).pipe(res);
}
function readBody(req) { return new Promise((res, rej) => { const c = []; let n = 0; req.on('data', d => { n += d.length; if (n > 400 * 1024 * 1024) { rej(new Error('too big')); req.destroy(); } else c.push(d); }); req.on('end', () => res(Buffer.concat(c).toString('utf8'))); req.on('error', rej); }); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ app: 'plato-studio-mcp', version: VERSION, connected: !!app })); return; }
  if (url.pathname === '/mcp') {
    if (req.method !== 'POST') { res.writeHead(405, { allow: 'POST' }); res.end(); return; }
    const o = req.headers.origin; if (o && !ORIGINS.has(o)) { res.writeHead(403); res.end('Origen no permitido'); return; }
    if ((req.headers.authorization || '') !== 'Bearer ' + TOKEN) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'Falta el token (Authorization: Bearer …). Lo tienes en ' + path.join(CONF, 'token') })); return; }
    if (!/application\/json/.test(req.headers['content-type'] || '')) { res.writeHead(415); res.end('Content-Type debe ser application/json'); return; }
    let msg; try { msg = JSON.parse(await readBody(req)); } catch (e) { res.writeHead(400); res.end('JSON inválido'); return; }
    const many = Array.isArray(msg); const outs = (await Promise.all((many ? msg : [msg]).map(m => handle(m)))).filter(Boolean);
    if (!outs.length) { res.writeHead(202); res.end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(many ? outs : outs[0])); return;
  }
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405); res.end();
});
server.on('upgrade', (req, sock) => { if (new URL(req.url, 'http://x').pathname === '/bridge') wsAccept(req, sock); else sock.destroy(); });

/* ---------- stdio ---------- */
function startStdio(relay) {
  let buf = '', inflight = 0, ended = false; const write = o => process.stdout.write(JSON.stringify(o) + '\n');
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
    let msg; try { msg = JSON.parse(line); } catch (e) { write({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); continue; }
    inflight++; (async () => { try { const out = await handle(msg, { notify: write, relay }); if (out) write(out); } finally { inflight--; if (ended && !inflight) shutdown(); } })(); } });
  process.stdin.on('end', () => { ended = true; if (!inflight) shutdown(); });
}
async function relayTo(msg) { const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(msg) }); return await r.json(); }
function shutdown() { try { headless && headless.b.close(); } catch (e) {} process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

server.on('error', async e => {
  if (e.code !== 'EADDRINUSE') { log('error del servidor:', e.message); process.exit(1); }
  let ours = false; try { const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json(); ours = h.app === 'plato-studio-mcp'; } catch (err) {}
  if (!ours || HTTP_ONLY) { log(`El puerto ${PORT} está ocupado por otro programa. Usa --port.`); process.exit(1); }
  log(`Ya hay otro servidor de Plató Studio en el puerto ${PORT}: reenvío mis peticiones a él.`); startStdio(relayTo);
});
server.listen(PORT, '127.0.0.1', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  log(`v${VERSION} · app: ${APP_URL} · puente: ws://localhost:${PORT}/bridge · MCP HTTP: http://localhost:${PORT}/mcp · archivos: ${OUT}`);
  if (HTTP_ONLY) log('Token HTTP: ' + TOKEN); else startStdio(null);
  if (flag('open') || flag('headless')) { try { log(await openApp(flag('headless'))); } catch (e) { log(e.message); } }
});
