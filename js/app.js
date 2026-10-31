// Carcasa de la app: navegación, enlace con el plató, PWA.
import { $, el, toast, db, uid, getSettings, hasAnyKey, spentThisMonth, bus } from './core.js';
import { renderStudio, loadTake } from './studio.js';
import { renderGallery } from './gallery.js';
import { renderEditor } from './editor.js';
import { renderChars } from './chars.js';
import { renderSettings } from './settings.js';

const VIEWS = { plato: ['🎬', 'Plató'], studio: ['✨', 'Estudio', 1], gallery: ['🖼', 'Galería'], edit: ['🎞', 'Montaje', 1], chars: ['👤', 'Personajes', 1], settings: ['⚙️', 'Ajustes'] };
const RENDER = { studio: renderStudio, gallery: renderGallery, edit: renderEditor, chars: renderChars, settings: renderSettings };
const view = $('#view'), frame = $('#plato');

function buildNav() { const t = $('#tabs'); t.innerHTML = ''; const prem = hasAnyKey();
  for (const [k, [ic, lb, p]] of Object.entries(VIEWS)) t.append(el('a', { href: '#' + k, 'data-v': k, class: 'tab' }, el('i', {}, ic), el('span', {}, lb), p && !prem ? el('em', {}, 'PREMIUM') : null)); }
async function updSpend() { const s = getSettings(); const sp = await spentThisMonth(); const b = $('#spend'); b.textContent = `$${sp.toFixed(2)} / ${s.budget.monthly}`; b.classList.toggle('warn', sp > s.budget.monthly * 0.9); b.hidden = !hasAnyKey(s); }
async function route() {
  const v = VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'plato';
  for (const m of document.querySelectorAll('.modal')) m.remove();
  for (const a of document.querySelectorAll('#tabs .tab')) a.classList.toggle('on', a.dataset.v === v);
  document.body.dataset.view = v; frame.hidden = v !== 'plato'; view.hidden = v === 'plato';
  if (v !== 'plato') { view.scrollTop = 0; try { await RENDER[v](view); } catch (e) { console.error(e); view.innerHTML = ''; view.append(el('div', { class: 'empty big' }, 'Algo ha fallado al abrir esta sección: ' + e.message)); } }
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
addEventListener('studio:settings', () => { buildNav(); route(); updSpend(); });
bus.addEventListener('ledger', updSpend);
$('#spend').addEventListener('click', () => location.hash = '#settings');
buildNav(); route(); updSpend();
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
let deferred = null; addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; const b = $('#install'); b.hidden = false; b.onclick = async () => { b.hidden = true; deferred.prompt(); }; });
if (!localStorage.getItem('studio_seen')) { localStorage.setItem('studio_seen', '1'); setTimeout(() => toast('Bienvenido a Plató Studio', 5000, { sub: 'Rueda en 🎬 Plató · genera en ✨ Estudio con tus claves · todo se guarda en tu dispositivo.' }), 1200); }
