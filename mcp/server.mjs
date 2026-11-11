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
import { mediaHandler } from './media.mjs';
import { phoneRoute, cleanupInbox } from './inbox.mjs';
import { setupVoices, stopTTS, speak } from './tts.mjs';

const VERSION = '1.1.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
const PORT = +opt('port', process.env.PLATO_MCP_PORT || 7821);
const OUT = path.resolve(opt('out', process.env.PLATO_OUT || path.join(os.homedir(), 'PlatoStudio')));
const CONF = path.join(os.homedir(), '.plato-studio');
const BASE = flag('base');
const HTTP_ONLY = flag('http-only') || BASE;
const LAN = flag('lan') || BASE;
const KIOSK = flag('kiosk');
const APP_URL = opt('app-url', `http://localhost:${PORT}/index.html?mcp=${PORT}${BASE ? '&base=1' : ''}`);
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
  { name: 'speak', description: 'Free text-to-speech on this computer (no app needed): engine "kokoro" (offline, voices ef_dora, em_alex, em_santa for Spanish; af_heart, am_michael… for English) or "edge" (online, unofficial; voices like es-ES-ElviraNeural). Saves a WAV/MP3 in the output folder and returns its path, duration and word timings (for karaoke subtitles). Use file:<path> to put it in the montage.', inputSchema: { type: 'object', properties: { text: { type: 'string' }, voice: { type: 'string' }, engine: { type: 'string', enum: ['kokoro', 'edge'] }, speed: { type: 'number', description: '0.5–2' } }, required: ['text'] } },
  { name: 'games', description: 'Plató games: any game (board, cards, racing, shooter, trivia, invented…) as a JS module on the Plató Game Kit, played on the TV with phones as controllers. action=api returns the full kit reference to write one; list; get (code); save (pass full module code: the app runs an automatic play-test and returns errors to fix); play (opens the lobby with a QR for phones).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['api', 'list', 'get', 'save', 'play'] }, id: { type: 'string' }, code: { type: 'string' }, note: { type: 'string' } }, required: ['action'] } },
  { name: 'montage', description: 'The app\'s editor timeline: get (clips, audio tracks, subtitles) or export (renders the final video in real time; returns the file).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['get', 'export'] } }, required: ['action'] } },
  { name: 'brand', description: 'Brands and ads: a brand = kit (name, tagline, story, tone, palette by role, fonts, logo, packaging, products) + campaign of spots made of 5-second shots, rendered in the low-poly ad stage and brought to life with an image-to-video model. action=list | get {id} | vocabulary (valid sets/cameras/actions) | create {brief, name?} (the app LLM designs an ORIGINAL brand + first spot) | update {id, kit? (merged), campaign? (replaced), shot_patch? {id, spot?, set?, camera?, action?, flavor?, vo?, onscreen?, prompt?, title?}} | keyframes {id, spot?, shots?:[ids]} (free stills from the ad stage — look at them) | prompts {id, spot?} (English i2v prompts with packaging + VO per shot) | export {id} (brand guide .md + logo .svg) | open {id, tab?}. Never copy real brands. Recipe: guide topic "marcas".', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'get', 'vocabulary', 'create', 'update', 'keyframes', 'prompts', 'export', 'open'] }, id: { type: 'string', description: 'brand id, e.g. "brand-colorin"' }, brief: { type: 'string' }, name: { type: 'string' }, kit: { type: 'object' }, campaign: { type: 'object' }, shot_patch: { type: 'object' }, spot: { type: 'string' }, shots: { type: 'array', items: { type: 'string' } }, tab: { type: 'string', enum: ['marca', 'productos', 'anuncio', 'vida'] } }, required: ['action'] } },
  { name: 'learn', description: 'Video lessons with a 3D teacher, whiteboard, 3D visuals and quizzes, shown on the app screen. action=docs (user material) | add_text {text, title?} | explain {topic? | doc_id?, focus?, level?} (prepare and start a lesson) | list (saved lessons with progress) | open {lesson_id, restart?} | review {lesson_id} (quiz review) | ask {question} (interrupt the teacher; returns the answer) | control {command: pause|resume|next|prev|repeat|stop}.', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['docs', 'add_text', 'explain', 'list', 'open', 'review', 'ask', 'control'] }, topic: { type: 'string' }, focus: { type: 'string' }, level: { type: 'string', enum: ['básico', 'medio', 'avanzado'] }, doc_id: { type: 'string' }, text: { type: 'string' }, title: { type: 'string' }, lesson_id: { type: 'string' }, restart: { type: 'boolean' }, question: { type: 'string' }, command: { type: 'string', enum: ['pause', 'resume', 'next', 'prev', 'repeat', 'stop'] } }, required: ['action'] } },
  { name: 'local', description: 'Local AI on the user\'s computer (no API keys, no provider): hardware check and downloadable packs. action=status (hardware, verdict, packs and services) | install {pack} (starts a download/install job) | job {pack} | remove {pack} | models (Ollama models) | pull {model} (download an Ollama model, e.g. "qwen3:8b") | service {name: ollama|comfy|opencode, op: start|stop} | agent {text} (ask the local opencode agent). Packs: python, ollama, comfy (video engine), sam (masks), personaje (Wan 2.2 Animate, NVIDIA 16-24 GB), objeto (Wan VACE 1.3B, NVIDIA 8 GB), fluidez (FILM), audio (voice/music separation), voz (Seed-VC voice conversion), opencode, hermes. Ask before downloading big packs (they say the size).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['status', 'install', 'job', 'remove', 'models', 'pull', 'service', 'agent'] }, pack: { type: 'string' }, model: { type: 'string' }, name: { type: 'string', enum: ['ollama', 'comfy', 'opencode'] }, op: { type: 'string', enum: ['start', 'stop'] }, text: { type: 'string' } }, required: ['action'] } },
  { name: 'recast', description: 'Local "recast" of a real video (like Higgsfield Genjutsu, but on the user\'s GPU and free): segment → SAM 3.1 mask → only the masked region is cropped, regenerated and pasted back with a soft edge (the rest stays original) → original audio, converted voice or no voice. action=new {path} (video on the user\'s computer) → id | segment {id, start, dur≤20} | mask {id, points:[{x,y,pos}] normalized 0-1 on the first frame, or text (English)} → returns the frame with the mask so you can check it | track {id} (follow the mask through the clip; waits up to ~100 s) | run {id, mode: personaje|objeto|borrar, quality: draft|final, prompt?, ref_path? (character/object image; required for personaje), voice?: {mode: keep|convert|mute, voice?: kokoro id, ref_path?}, dry_run?} | job {id}. Always do draft before final. Needs packs sam + personaje/objeto (see local).', inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['new', 'segment', 'mask', 'track', 'run', 'job'] }, path: { type: 'string' }, id: { type: 'string' }, start: { type: 'number' }, dur: { type: 'number' }, points: { type: 'array', items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' }, pos: { type: 'boolean' } } } }, text: { type: 'string' }, mode: { type: 'string', enum: ['personaje', 'objeto', 'borrar'] }, quality: { type: 'string', enum: ['draft', 'final'] }, prompt: { type: 'string' }, ref_path: { type: 'string' }, voice: { type: 'object' }, dry_run: { type: 'boolean' } }, required: ['action'] } },
  { name: 'guide', description: 'Read the Plató guide for AI agents (works even if the app is not open). No topic: the index and the golden rules. Topics: ' + 'inicio, flujo, plato, camaras, director, marcas, dar-vida, local, recast, aprender, juegos, voces, archivos, errores' + '. Read "inicio" once per session and the topic you are about to work on.', inputSchema: { type: 'object', properties: { topic: { type: 'string' } } } },
  { name: 'task_result', description: 'Get the result of a long operation that returned a task_id. Waits up to wait_seconds (default 40).', inputSchema: { type: 'object', properties: { task_id: { type: 'string' }, wait_seconds: { type: 'number' } }, required: ['task_id'] } },
];
const INSTRUCTIONS = `Plató Studio: a creation studio running in the user's browser — 3D low-poly previz stage, AI video studio (the user's own API keys, pay per use), AI Director, video lessons, TV games, and Brands & Ads (brand kit → ad spot in the low-poly ad stage → brought to life with image-to-video).
Start every session with studio_status (studio_open if the app is not connected), then read guide (no topic) once: it has the golden rules and the recipes. Use guide {"topic":"marcas"|"plato"|"aprender"|"dar-vida"|…} before working in an area.
Golden rules: free things first (3D stage, keyframes, local voices); say the cost before anything that spends money and wait for approval; look at your results (scene_view, brand keyframes) instead of assuming; never copy real brands; long operations return a task_id → task_result.
Scenes: stock_load_set or scene_dsl → take_control new → scene_dsl actions with "delay" → scene_view → cameras_rig coverage → take_record → generate (v2v, inputs.video="last_take").
Ads: brand create → brand get/update → brand keyframes → brand prompts → bring to life (generate, or the Higgsfield MCP if connected) → speak + montage.
Files are saved under ${OUT}.`;
/* Pistas para el cliente: qué lee, qué borra, qué sale fuera y cuesta dinero. */
const RO = { readOnlyHint: true, openWorldHint: false };
const ANN = {
  studio_status: ['Estado del estudio', RO], studio_open: ['Abrir Plató', { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }],
  scene_get: ['Ver la escena (datos)', RO], scene_command: ['Orden en lenguaje natural', { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }],
  scene_dsl: ['Órdenes exactas al plató', { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }], scene_view: ['Mirar el plató', RO],
  stock_list: ['Catálogo de decorados y personajes', RO], stock_load_set: ['Cargar decorado', { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false }],
  camera_set: ['Cámara principal', { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }], cameras_rig: ['Rig multicámara', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }],
  take_control: ['Controlar la toma', { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false }], take_record: ['Grabar la toma', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }],
  models_search: ['Buscar modelos de IA', RO], generate: ['Generar con IA (cuesta dinero)', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }],
  jobs_status: ['Cola de generaciones', RO], gallery_list: ['Galería', RO], gallery_get: ['Exportar de la galería', { readOnlyHint: true, openWorldHint: false }],
  director: ['Director de IA', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }], book_load: ['Cargar libro', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }],
  speak: ['Voz gratis', { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }], games: ['Juegos', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }],
  montage: ['Montaje', { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false }],
  brand: ['Marcas y anuncios', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }], learn: ['Clases', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }],
  local: ['IA local (descargas y servicios)', { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }], recast: ['Recast local de vídeo', { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }],
  guide: ['Guía para IAs', RO], task_result: ['Resultado de tarea larga', RO],
};
for (const t of TOOLS) { const a = ANN[t.name]; if (a) { t.title = a[0]; t.annotations = { title: a[0], ...a[1] }; } }

/* ---------- Guía, recursos y prompts ---------- */
const GUIDE_FILE = path.join(ROOT, 'docs', 'AGENTS.md');
function guideText() { try { return fs.readFileSync(GUIDE_FILE, 'utf8'); } catch (e) { return INSTRUCTIONS; } }
function guideSections() { const out = {}; const parts = guideText().split(/^## /m); out._head = parts.shift(); for (const p of parts) { const id = p.split(/\s/)[0].toLowerCase(); out[id] = '## ' + p.trim(); } return out; }
function guideTopic(topic) { const S = guideSections(); const ids = Object.keys(S).filter(k => k !== '_head');
  if (!topic) return [S._head.trim(), S.inicio || '', 'Temas: ' + ids.join(', ') + '. Pide uno con guide {"topic":"…"}.'].join('\n\n');
  const k = String(topic).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '-'); const hit = S[k] || S[ids.find(i => i.startsWith(k) || k.startsWith(i))];
  return hit || `No hay tema «${topic}». Temas: ${ids.join(', ')}.`; }
const RESOURCES = [
  { uri: 'plato://guide', name: 'guide', title: 'Guía de Plató para IAs', description: 'Cómo usar todas las herramientas de Plató, con recetas.', mimeType: 'text/markdown', read: () => guideText() },
  { uri: 'plato://dsl', name: 'dsl', title: 'DSL del plató 3D', description: 'Referencia de las órdenes JSON de scene_dsl.', mimeType: 'text/plain', read: () => DSL },
  { uri: 'plato://brand-schema', name: 'brand-schema', title: 'Esquema de marca y anuncio', description: 'Formato del kit de marca, productos y tomas.', mimeType: 'text/markdown', read: () => guideTopic('marcas') },
];
const PROMPTS = [
  { name: 'anuncio', title: 'Crear una marca y su anuncio', description: 'De un brief a marca, productos, spot con tomas, fotogramas y prompts de vídeo.', arguments: [{ name: 'brief', description: 'Qué producto, para quién y con qué tono', required: true }, { name: 'presupuesto', description: 'Cuánto se puede gastar en vídeo (créditos o $)', required: false }],
    text: a => `Quiero una marca y un anuncio para: ${a.brief}.\nSigue la receta del tema "marcas" de la guía (llama a guide {"topic":"marcas"} si no la tienes). Pasos: studio_status → brand create → brand get (revisa paleta, productos y arco del spot; corrige con brand update) → brand keyframes de todas las tomas y míralas → brand prompts. No copies marcas reales. Antes de dar vida a las tomas dime el coste${a.presupuesto ? ` (presupuesto: ${a.presupuesto})` : ''} y espera mi OK; empieza por una sola toma de prueba.` },
  { name: 'clase', title: 'Dar una clase', description: 'Prepara y empieza una clase sobre un tema o un documento.', arguments: [{ name: 'tema', required: true, description: 'De qué es la clase' }, { name: 'nivel', required: false, description: 'básico, medio o avanzado' }],
    text: a => `Dame una clase sobre ${a.tema}${a.nivel ? ` a nivel ${a.nivel}` : ''}. Mira primero learn {"action":"docs"} por si hay material mío relacionado y úsalo como doc_id; si no, usa topic. Luego learn explain.` },
  { name: 'escena', title: 'Montar y grabar una escena', description: 'Escena 3D con cobertura multicámara y grabación.', arguments: [{ name: 'idea', required: true, description: 'Qué pasa en la escena' }],
    text: a => `Monta en el plató esta escena: ${a.idea}. studio_status → stock_list → stock_load_set → take_control new → scene_dsl con la acción → scene_view para comprobar → cameras_rig coverage → take_record program. Enséñame los fotogramas antes de generar nada con IA.` },
  { name: 'juego', title: 'Crear un juego para la tele', description: 'Escribe, prueba y abre un juego del Plató Game Kit.', arguments: [{ name: 'idea', required: true, description: 'El juego' }],
    text: a => `Crea este juego para la tele: ${a.idea}. games api para la referencia → escribe el módulo completo → games save (corrige hasta que la prueba pase) → games play.` },
];


/* ---------- Puente con la app (WebSocket mínimo) ---------- */
let app = null; const pending = new Map(); let seq = 0;
function wsSend(sock, obj) { const data = Buffer.from(JSON.stringify(obj)); const n = data.length; let h;
  if (n < 126) h = Buffer.from([0x81, n]); else if (n < 65536) { h = Buffer.alloc(4); h[0] = 0x81; h[1] = 126; h.writeUInt16BE(n, 2); } else { h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(n), 2); }
  sock.write(Buffer.concat([h, data])); }
function wsUpgrade(req, sock, onText, onClose) {
  const key = req.headers['sec-websocket-key']; if (!key) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return null; }
  const acc = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acc}\r\n\r\n`); sock.setNoDelay(true);
  let buf = Buffer.alloc(0), frags = [], closed = false;
  const conn = { sock, send: o => { if (!closed) try { wsSend(sock, o); } catch (e) {} }, origin: req.headers.origin, hello: null, close: () => { try { sock.end(Buffer.from([0x88, 0])); } catch (e) {} } };
  sock.on('data', chunk => { buf = Buffer.concat([buf, chunk]);
    for (;;) { if (buf.length < 2) return; const fin = buf[0] & 0x80, op = buf[0] & 0x0f, masked = buf[1] & 0x80; let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; } else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const mOff = off; if (masked) off += 4; if (buf.length < off + len) return;
      let pl = buf.subarray(off, off + len); if (masked) { const m = buf.subarray(mOff, mOff + 4); pl = Buffer.from(pl); for (let i = 0; i < pl.length; i++) pl[i] ^= m[i & 3]; }
      buf = buf.subarray(off + len);
      if (op === 8) { conn.close(); return; }
      if (op === 9) { const h = Buffer.from([0x8a, pl.length]); sock.write(Buffer.concat([h, pl])); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) { frags.push(pl); if (!fin) continue; const text = Buffer.concat(frags).toString('utf8'); frags = []; try { onText(conn, text); } catch (e) { log('ws:', e.message); } } } });
  const bye = () => { if (closed) return; closed = true; onClose && onClose(conn); };
  sock.on('close', bye); sock.on('error', bye); return conn;
}
const isLocal = req => /^(::1|127\.|::ffff:127\.)/.test(req.socket.remoteAddress || '');
function wsAccept(req, sock) {
  const origin = req.headers.origin; if ((origin && !ORIGINS.has(origin)) || !isLocal(req)) { log('puente rechazado:', origin || req.socket.remoteAddress); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
  wsUpgrade(req, sock, onAppMessage, conn => { if (app === conn) { app = null; log('app desconectada'); for (const [id, p] of pending) { p.reject(new Error('La app se ha desconectado')); pending.delete(id); } } });
}

/* ---------- Relé de partidas: el aparato (anfitrión) y los móviles de los jugadores ---------- */
const rooms = new Map();
function gameAccept(req, sock) {
  const q = new URL(req.url, 'http://x').searchParams; const code = String(q.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8); const role = q.get('role');
  if (!code) { sock.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  if (role === 'host') { if (!isLocal(req)) { sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
    let room = rooms.get(code); if (!room) rooms.set(code, room = { host: null, players: new Map() });
    const c = wsUpgrade(req, sock, (conn, text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } const msg = { type: 'host', data: m.data };
        if (m.to === 'all' || !m.to) for (const p of room.players.values()) p.send(msg); else { const p = room.players.get(m.to); if (p) p.send(msg); if (m.kick && p) p.close(); } },
      conn => { if (room.host === conn) { room.host = null; for (const p of room.players.values()) p.send({ type: 'host-gone' }); setTimeout(() => { if (!room.host && !room.players.size) rooms.delete(code); }, 60000); } });
    if (!c) return; if (room.host) room.host.close(); room.host = c; c.send({ type: 'room', room: code, players: [...room.players.entries()].map(([id, p]) => ({ id, name: p.name })) }); log('partida abierta:', code); return; }
  const room = rooms.get(code); if (!room || !room.host) { sock.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  if (room.players.size >= 16) { sock.end('HTTP/1.1 409 Conflict\r\n\r\n'); return; }
  let id = String(q.get('id') || '').replace(/[^\w-]/g, '').slice(0, 24) || crypto.randomBytes(4).toString('hex'); const name = String(q.get('name') || 'Jugador').slice(0, 24);
  const old = room.players.get(id); if (old) old.close();
  const c = wsUpgrade(req, sock, (conn, text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } if (room.host) room.host.send({ type: 'msg', from: id, data: m }); },
    conn => { if (room.players.get(id) === conn) { room.players.delete(id); if (room.host) room.host.send({ type: 'leave', id }); } });
  if (!c) return; c.name = name; room.players.set(id, c); c.send({ type: 'welcome', id, room: code }); if (room.host) room.host.send({ type: 'join', id, name });
}
function lanIPs() { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address); return out; }

function onAppMessage(conn, text) { let m; try { m = JSON.parse(text); } catch (e) { return; }
  if (m.type === 'hello') { conn.hello = m; if (app && app !== conn) { try { app.send({ type: 'replaced' }); app.sock.end(); } catch (e) {} } app = conn; everConnected = true; log('app conectada desde', conn.origin || 'origen desconocido'); conn.send({ type: 'welcome', version: VERSION, out: OUT }); return; }
  if (m.type === 'result' && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error)) : p.resolve(m.result); return; }
  if (m.type === 'progress' && pending.has(m.id)) { const p = pending.get(m.id); p.onProgress && p.onProgress(m); }
}
function callApp(method, params, onProgress) { if (!app) return Promise.reject(Object.assign(new Error('Plató Studio no está conectado.'), { code: 'NOAPP' }));
  const id = 'r' + (++seq); return new Promise((resolve, reject) => { pending.set(id, { resolve, reject, onProgress }); app.send({ type: 'call', id, method, params }); }); }
async function waitForApp(ms) { const t0 = Date.now(); while (!app && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 300)); return !!app; }

/* ---------- Abrir la app ---------- */
let headless = null;
function findBrowser() {
  const env = process.env, c = [];
  if (process.platform === 'win32') for (const base of [env['PROGRAMFILES'], env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean)) c.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'), path.join(base, 'Chromium/Application/chrome.exe'));
  else if (process.platform === 'darwin') c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
  else for (const d of (env.PATH || '').split(':')) for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) c.push(path.join(d, n));
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch (e) { return false; } }) || null;
}
let appWin = null;
const defaultOpen = () => process.platform === 'darwin' ? ['open', [APP_URL]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', APP_URL]] : ['xdg-open', [APP_URL]];
// Modo base sin ventana propia controlable: se apaga solo cuando la app lleva 20 s desconectada (pestaña o ventana cerrada).
let watchClose = false, goneSince = 0, everConnected = false;
setInterval(() => { if (!watchClose) return; if (app) { goneSince = 0; return; } if (!everConnected) return; goneSince = goneSince || Date.now(); if (Date.now() - goneSince > 20000) { log('La app se ha cerrado: apago Plató.'); shutdown(); } }, 2000).unref();
async function openApp(useHeadless) {
  if (useHeadless) { if (headless) return 'Ya hay un navegador oculto abierto.';
    let pw = null; for (const m of ['playwright', 'playwright-core']) { try { pw = await import(m); break; } catch (e) {} }
    if (!pw) throw new Error('Para el modo oculto instala Playwright: npm i -g playwright && npx playwright install chromium');
    const chromium = pw.chromium || (pw.default && pw.default.chromium); const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist'] });
    const page = await b.newPage({ viewport: { width: 1280, height: 800 } }); await page.goto(APP_URL); headless = { b, page }; return 'Abierto en un Chromium oculto.'; }
  const exe = findBrowser();
  if (exe) { // Ventana propia, sin barra de navegador, con su propio perfil (como una app instalada).
    const args = [`--app=${APP_URL}`, `--user-data-dir=${path.join(CONF, 'app-profile')}`, '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', '--disable-features=Translate', '--window-size=1366,860', '--class=PlatoStudio'];
    if (KIOSK) args.push('--kiosk', '--start-fullscreen', '--noerrdialogs', '--disable-session-crashed-bubble', '--overscroll-history-navigation=0');
    const t0 = Date.now(); appWin = spawn(exe, args, { stdio: 'ignore' });
    appWin.on('exit', code => { appWin = null; if (!BASE || KIOSK) return;
      // Si el navegador «delega» en otra ventana y sale enseguida, no apagamos: vigilamos la conexión de la app.
      if (Date.now() - t0 < 6000) { log('La ventana se abrió aparte; apagaré Plató cuando la cierres.'); watchClose = true; if (code) { try { spawn(...defaultOpen(), { detached: true, stdio: 'ignore' }).unref(); } catch (e) {} } return; }
      log('Ventana cerrada: apago Plató.'); shutdown(); });
    return 'Abriendo Plató en su propia ventana.'; }
  if (BASE && !KIOSK) watchClose = true;
  try { spawn(...defaultOpen(), { detached: true, stdio: 'ignore' }).unref(); } catch (e) { throw new Error('No he podido abrir el navegador. Abre tú: ' + APP_URL); }
  return 'Abriendo ' + APP_URL + ' en tu navegador (instala Chrome o Edge para tener ventana propia).';
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
const SOFT = { brand: 55, learn: 50, take_record: 55, generate: 50, director: 50, montage: 55, scene_command: 50, book_load: 50 };
async function runTool(name, args, onProgress) {
  args = args || {};
  if (name === 'task_result') { const t = tasks.get(args.task_id); if (!t) throw new Error('No existe la tarea ' + args.task_id);
    if (!t.done) await Promise.race([t.promise.catch(() => {}), new Promise(r => setTimeout(r, Math.min(110, +args.wait_seconds || 40) * 1000))]);
    if (!t.done) return [{ type: 'text', text: `La tarea ${args.task_id} (${t.tool}) sigue en marcha (${Math.round((Date.now() - t.t0) / 1000)} s). Vuelve a llamar a task_result.` }];
    if (t.error) throw t.error; return toContent(t.result); }
  if (name === 'guide') return [{ type: 'text', text: guideTopic(args.topic) }];
  if (name === 'local') { const A = await import('./localai.mjs'); const a = args.action;
    if (a === 'status') { const st = await A.aiStatus(); return [{ type: 'text', text: JSON.stringify({ hardware: { gpu: st.hw.gpu, ram: st.hw.ram, disk_free_gb: st.hw.disk, tier: st.hw.tier, verdict: st.hw.verdict, can: st.hw.can, llm_suggestions: st.hw.llm }, packs: st.packs.map(p => ({ id: p.id, title: p.title, state: p.state, size_gb: p.gb, fits: p.fit })), services: st.services }) }]; }
    if (a === 'install') return [{ type: 'text', text: JSON.stringify(A.install(args.pack)) + '\nConsulta el avance con local {"action":"job","pack":"' + args.pack + '"}.' }];
    if (a === 'job') return [{ type: 'text', text: JSON.stringify(A.jobStatus(args.pack) || { done: true, note: 'sin trabajo en curso' }) }];
    if (a === 'remove') return [{ type: 'text', text: JSON.stringify(A.remove(args.pack)) }];
    if (a === 'models') return [{ type: 'text', text: JSON.stringify(await A.ollamaInfo()) }];
    if (a === 'pull') { await A.startOllama(); fetch(A.OLLAMA_URL + '/api/pull', { method: 'POST', body: JSON.stringify({ model: args.model, stream: false }) }).catch(() => {}); return [{ type: 'text', text: `Descargando ${args.model} en Ollama. Comprueba con local {"action":"models"} en unos minutos.` }]; }
    if (a === 'service') { const st = args.op === 'stop'; if (args.name === 'ollama') st ? A.stopOllama() : await A.startOllama(); else if (args.name === 'comfy') st ? A.stopComfy() : await A.startComfy(); else if (args.name === 'opencode') st ? A.stopOpencode() : await A.startOpencode(args.model || ((await A.ollamaInfo()).models || [])[0]?.name); return [{ type: 'text', text: 'Hecho.' }]; }
    if (a === 'agent') { const r = await A.askAgent(args.text, args.model || ((await A.ollamaInfo()).models || [])[0]?.name); return [{ type: 'text', text: r.text }]; }
    throw new Error('Acción desconocida: ' + a); }
  if (name === 'recast') { const R = await import('./recast.mjs'); const a = args.action; const P = p => { p = String(p).replace(/^file:(\/\/)?/, ''); if (p.startsWith('~')) p = path.join(os.homedir(), p.slice(1)); return path.resolve(p); };
    const wait = async (ms = 100000) => { const t0 = Date.now(); for (;;) { const j = R.recastJob(args.id); if (!j || j.done || Date.now() - t0 > ms) return j; await new Promise(r => setTimeout(r, 1500)); } };
    if (a === 'new') return [{ type: 'text', text: JSON.stringify(await R.recastNew(fs.createReadStream(P(args.path)), path.basename(args.path))) }];
    if (a === 'segment') { const r = await R.recastSegment(args.id, +args.start || 0, +args.dur || 5); return [{ type: 'text', text: JSON.stringify({ ...r, frame: undefined, note: 'Ahora marca qué cambiar con recast mask (coordenadas 0-1 sobre la imagen).' }) }, { type: 'image', data: fs.readFileSync(r.frame).toString('base64'), mimeType: 'image/png' }]; }
    if (a === 'mask') { const f = await R.recastMask(args.id, { points: args.points || [], text: args.text || '' }); const ov = await R.maskOverlay(args.id); return [{ type: 'text', text: 'Máscara en rosa. Si está bien, llama a recast track; si no, añade puntos (pos:false para quitar).' }, { type: 'image', data: ov.toString('base64'), mimeType: 'image/png' }]; }
    if (a === 'track') { R.recastTrack(args.id); const j = await wait(); return [{ type: 'text', text: JSON.stringify(j) + (j && !j.done ? '\nSigue en marcha: consulta con recast job.' : '') }]; }
    if (a === 'run') { const v = args.voice || { mode: 'keep' }; if (v.ref_path) v.refB64 = fs.readFileSync(P(v.ref_path)).toString('base64');
      R.recastRun(args.id, { mode: args.mode, quality: args.quality || 'draft', prompt: args.prompt || '', refB64: args.ref_path ? fs.readFileSync(P(args.ref_path)).toString('base64') : null, voice: v, dryRun: !!args.dry_run, outDir: path.join(OUT, new Date().toISOString().slice(0, 10)) });
      const j = await wait(60000); return [{ type: 'text', text: JSON.stringify(j) + (j && !j.done ? '\nGenerando: consulta con recast job (un borrador tarda minutos).' : '') }]; }
    if (a === 'job') return [{ type: 'text', text: JSON.stringify(R.recastJob(args.id) || { done: true }) }];
    throw new Error('Acción desconocida: ' + a); }
  if (name === 'studio_open') return [{ type: 'text', text: await openApp(!!args.headless) + (await waitForApp(20000) ? ' La app ya está conectada.' : ' Aún no se ha conectado: espera unos segundos y llama a studio_status.') }];
  if (name === 'studio_status' && !app) return [{ type: 'text', text: `Plató Studio no está conectado a este servidor MCP (puerto ${PORT}).\nOpciones: llama a studio_open, o abre ${APP_URL} en el navegador (o la app de GitHub Pages con ?mcp=${PORT}). La pestaña debe quedarse abierta y visible mientras trabajas.` }];
  if (name === 'speak') { const r = await speak({ engine: args.engine || 'kokoro', text: args.text, voice: args.voice || (args.engine === 'edge' ? 'es-ES-ElviraNeural' : 'ef_dora'), speed: args.speed || 1 });
    const d = path.join(OUT, 'Voces'); fs.mkdirSync(d, { recursive: true }); const f = path.join(d, `voz-${Date.now()}.${r.mime === 'audio/wav' ? 'wav' : 'mp3'}`); fs.writeFileSync(f, r.audio);
    return [{ type: 'text', text: JSON.stringify({ path: f, media: 'file:' + f, duration: r.dur, words: r.words }) }]; }
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
      case 'initialize': return ok({ protocolVersion: SUPPORTED.includes(params && params.protocolVersion) ? params.protocolVersion : SUPPORTED[0], capabilities: { tools: { listChanged: false }, resources: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: { name: 'plato-studio', title: 'Plató Studio', version: VERSION }, instructions: INSTRUCTIONS });
      case 'ping': return ok({});
      case 'tools/list': return ok({ tools: TOOLS });
      case 'resources/list': return ok({ resources: RESOURCES.map(({ read, ...r }) => r) });
      case 'resources/templates/list': return ok({ resourceTemplates: [{ uriTemplate: 'plato://guide/{topic}', name: 'guide-topic', title: 'Tema de la guía', mimeType: 'text/markdown' }] });
      case 'resources/read': { const uri = params && params.uri; const r = RESOURCES.find(x => x.uri === uri); const m = !r && /^plato:\/\/guide\/(.+)$/.exec(uri || '');
        if (!r && !m) return err(-32002, 'Recurso no encontrado: ' + uri); return ok({ contents: [{ uri, mimeType: r ? r.mimeType : 'text/markdown', text: r ? r.read() : guideTopic(decodeURIComponent(m[1])) }] }); }
      case 'prompts/list': return ok({ prompts: PROMPTS.map(({ text, ...p }) => p) });
      case 'prompts/get': { const p = PROMPTS.find(x => x.name === (params && params.name)); if (!p) return err(-32602, 'Prompt desconocido: ' + (params && params.name)); const a = (params && params.arguments) || {};
        for (const q of p.arguments) if (q.required && !a[q.name]) return err(-32602, 'Falta el argumento ' + q.name);
        return ok({ description: p.description, messages: [{ role: 'user', content: { type: 'text', text: p.text(a) } }] }); }
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
let api = null; cleanupInbox();
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) { api = api || mediaHandler({ ORIGINS, isLocal, OUT, log }); await api(req, res, url); return; }
  if (url.pathname.startsWith('/inbox') || url.pathname.startsWith('/outbox')) { if (await phoneRoute(req, res, url, { log })) return; }
  if (url.pathname === '/health') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ app: 'plato-studio-mcp', version: VERSION, connected: !!app })); return; }
  if (url.pathname === '/lan') { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ lan: LAN, ips: LAN ? lanIPs() : [], port: PORT })); return; }
  if (url.pathname === '/mcp') {
    if (!isLocal(req)) { res.writeHead(403); res.end('Solo desde este ordenador'); return; }
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
server.on('upgrade', (req, sock) => { const p = new URL(req.url, 'http://x').pathname; if (p === '/bridge') wsAccept(req, sock); else if (p === '/game') gameAccept(req, sock); else sock.destroy(); });

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
function shutdown() { try { stopTTS(); } catch (e) {} try { headless && headless.b.close(); } catch (e) {} try { appWin && appWin.kill(); } catch (e) {} process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);

if (flag('setup-voices')) { setupVoices(m => process.stderr.write(m + '\n')).then(() => process.exit(0), e => { process.stderr.write('❌ ' + e.message + '\n'); process.exit(1); }); }
server.on('error', async e => {
  if (e.code !== 'EADDRINUSE') { log('error del servidor:', e.message); process.exit(1); }
  let ours = false; try { const h = await (await fetch(`http://127.0.0.1:${PORT}/health`)).json(); ours = h.app === 'plato-studio-mcp'; } catch (err) {}
  if (ours && BASE) { log(`Plató ya está en marcha en el puerto ${PORT}: abro su ventana.`); try { log(await openApp(false)); } catch (er) { log(er.message); } return; }
  if (!ours || HTTP_ONLY) { log(`El puerto ${PORT} está ocupado por otro programa. Usa --port.`); process.exit(1); }
  log(`Ya hay otro servidor de Plató Studio en el puerto ${PORT}: reenvío mis peticiones a él.`); startStdio(relayTo);
});
if (!flag('setup-voices')) server.listen(PORT, LAN ? '0.0.0.0' : '127.0.0.1', async () => {
  fs.mkdirSync(OUT, { recursive: true });
  log(`v${VERSION} · app: ${APP_URL} · puente: ws://localhost:${PORT}/bridge · MCP HTTP: http://localhost:${PORT}/mcp · archivos: ${OUT}`);
  if (HTTP_ONLY) log('Token HTTP: ' + TOKEN); else startStdio(null);
  if (LAN) log('Móviles en la misma wifi: ' + (lanIPs().map(ip => `http://${ip}:${PORT}/play.html`).join('  ') || 'sin red local'));
  if (flag('open') || flag('headless') || BASE || flag('app')) { try { log(await openApp(flag('headless'))); } catch (e) { log(e.message); } }
});
