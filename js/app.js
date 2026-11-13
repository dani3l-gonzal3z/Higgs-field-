// Carcasa de la app: navegación, enlace con el plató, PWA.
import { $, el, toast, db, uid, getSettings, hasAnyKey, spentThisMonth, bus, host } from './core.js';
import { renderStudio, loadTake } from './studio.js';
import { renderGallery } from './gallery.js';
import { renderEditor } from './editor.js';
import { renderChars } from './chars.js';
import { renderSettings } from './settings.js';
import { renderDirector } from './director.js';
import { renderLab } from './lab.js';
import { mcpStart } from './mcp.js';
import { detectLocal, localBase } from './local.js';
import { startAssistant } from './assistant.js';

import { renderGames } from './games.js';
import { renderBrands } from './brands.js';
import { renderRecast } from './recast.js';
import { renderTaller, leaveTaller } from './taller.js';
import { renderHome, renderLearn, PRO, setupSpatialNav } from './home.js';
import { maybeTour, startTour, onGuide, missionsDone, MISSIONS } from './guide.js';

const VIEWS = { home: ['🏠', 'Inicio'], learn: ['🎓', 'Aprender'], director: ['🎬', 'Contar historias'], games: ['🎮', 'Jugar'], brands: ['🏷', 'Marcas'], taller: ['🔌', 'Taller'], plato: ['🎨', 'Crear escenas'], studio: ['✨', 'Estudio IA', 'pro'], lab: ['🧪', 'Laboratorio', 'pro'], gallery: ['🖼', 'Galería', 'pro'], edit: ['🎞', 'Montaje', 'pro'], chars: ['👤', 'Personajes', 'pro'], recast: ['🎭', 'Recast local', 'pro'], settings: ['⚙️', 'Ajustes'] };
const RENDER = { taller: renderTaller, brands: renderBrands, recast: renderRecast, home: renderHome, learn: renderLearn, games: renderGames, director: renderDirector, lab: renderLab, studio: renderStudio, gallery: renderGallery, edit: renderEditor, chars: renderChars, settings: renderSettings };
const view = $('#view'), frame = $('#plato');

function buildNav(v = 'home') { const t = $('#tabs'); t.innerHTML = ''; const [ic, lb, grp] = VIEWS[v];
  if (v !== 'home') t.append(el('a', { href: '#home', class: 'navback', title: 'Inicio' }, '←'), el('div', { class: 'navtitle' }, el('i', {}, ic), el('b', {}, lb)));
  if (grp === 'pro') t.append(el('div', { class: 'subtabs' }, PRO.map(([k, i2, l2]) => el('a', { href: '#' + k, class: 'tab' + (k === v ? ' on' : ''), 'data-v': k }, el('i', {}, i2), el('span', {}, l2))))); }
function updMiss() { const c = $('#missChip'); if (c) c.textContent = `🏅 ${missionsDone()}/${MISSIONS.length}`; }
async function updSpend() { const s = getSettings(); const sp = await spentThisMonth(); const b = $('#spend'); b.textContent = `$${sp.toFixed(2)} / ${s.budget.monthly}`; b.classList.toggle('warn', sp > s.budget.monthly * 0.9); b.hidden = !hasAnyKey(s); }
async function route() {
  const v = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'home';
  for (const m of document.querySelectorAll('.modal')) m.remove();
  if (v !== 'taller') leaveTaller();
  buildNav(v); document.body.dataset.view = v; frame.hidden = v !== 'plato'; view.hidden = v === 'plato';
  // Cada visita pinta en un contenedor nuevo: si llega otra (p. ej. cuando Claude termina de conectar), la anterior escribe en uno ya retirado y no se duplica nada.
  if (v !== 'plato') { view.scrollTop = 0; const box = el('div', { class: 'vbox' }); view.replaceChildren(box); try { await RENDER[v](box); } catch (e) { console.error(e); box.innerHTML = ''; box.append(el('div', { class: 'empty big' }, 'Algo ha fallado al abrir esta sección: ' + e.message)); } }
  maybeTour(v);
}
addEventListener('hashchange', route);
addEventListener('message', async e => {
  if (e.origin !== location.origin || !e.data || typeof e.data !== 'object') return;
  if (e.data.type === 'plato:pack') {
    const take = { id: uid(), t: Date.now(), files: (e.data.files || []).filter(f => f && f.blob), meta: e.data.meta || {} };
    if (!take.files.length) return; await db.put('inbox', take);
    location.hash = '#studio'; setTimeout(() => loadTake(take), 150);
  }
});
addEventListener('studio:settings', () => { route(); updSpend(); });
onGuide(updMiss);
$('#helpBtn').addEventListener('click', () => startTour((location.hash.slice(1) || 'home'), { force: true }));
$('#missChip').addEventListener('click', () => { location.hash = '#home'; setTimeout(() => { const c = $('#missCard'); if (c) c.scrollIntoView({ behavior: 'smooth' }); }, 300); });
$('#homeBtn').addEventListener('click', () => { location.hash = '#home'; });
bus.addEventListener('ledger', updSpend);
$('#spend').addEventListener('click', () => location.hash = '#settings');
window.__studioHost = host;
(async () => { let n = 0; while (!(window.claude && window.claude.use) && n++ < 25) await new Promise(r => setTimeout(r, 200)); if (window.claude && window.claude.use) { host.claude = true; const [sm, dl] = await Promise.all([window.claude.use('sample').catch(() => null), window.claude.use('downloads').catch(() => null)]); host.sample = sm || null; host.save = dl && dl.save ? (o => dl.save(o)) : null; } host.ready = true; try { frame.contentWindow.postMessage({ type: 'host:ready' }, location.origin); } catch (e) {} if (host.claude) route(); mcpStart(); })();
// Servicios del aparato (FFmpeg, voces gratis, proxy): se detectan antes de pintar, con un límite de 1,5 s.
await Promise.race([detectLocal(), new Promise(r => setTimeout(r, 1500))]);
route(); updSpend(); updMiss(); setupSpatialNav();
// El aparato escucha al móvil (chat, archivos y órdenes) mientras esté encendido.
detectLocal().then(() => { if (localBase()) startAssistant(); });
// Arranque: pantalla de bienvenida breve (una vez por sesión)
if (!sessionStorage.getItem('plato_boot')) { sessionStorage.setItem('plato_boot', '1'); const sp = el('div', { id: 'splash' }, el('div', { class: 'sp-logo' }, el('i', {}), el('b', {}, 'PLATÓ')), el('small', {}, 'Aprende · Cuenta · Juega · Crea')); document.body.append(sp); const off = () => { sp.classList.add('out'); setTimeout(() => sp.remove(), 500); }; sp.addEventListener('click', off); setTimeout(off, 1400); }
if (new URLSearchParams(location.search).get('base')) document.body.classList.add('is-base');
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
let deferred = null; addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; const b = $('#install'); b.hidden = false; b.onclick = async () => { b.hidden = true; deferred.prompt(); }; });

