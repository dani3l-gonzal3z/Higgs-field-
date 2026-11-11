// 🎭 Recast local: cambia a una persona u objeto de tu vídeo con IA en tu propio equipo.
import { el, btn, toast, seg, db, uid, blobURL, download } from './core.js';
import { localBase, localCaps, detectLocal } from './local.js';

const R = { id: null, info: null, seg: null, points: [], neg: false, text: '', mask: null, preview: null, mode: 'personaje', ref: null, prompt: '', voice: { mode: 'keep', voice: 'ef_dora' }, result: null };
const api = async (p, body, raw) => { const r = await fetch(localBase() + p, raw ? { method: 'POST', body: raw.body, headers: raw.headers } : body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }); const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || 'Error'); return j; };
const b64 = blob => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
const poll = async (id, onTick) => { for (;;) { await new Promise(r => setTimeout(r, 1000)); const j = await api('/api/recast/job?id=' + id); onTick && onTick(j); if (j.done) { if (j.error) throw new Error(j.error); return j; } } };

export async function renderRecast(r) {
  await detectLocal();
  r.append(el('div', { class: 'h-hero rc-hero' }, el('h2', {}, '🎭 Recast local'), el('p', {}, 'Cambia a una persona por tu personaje, o cambia y borra objetos, en tu propio vídeo. La IA trabaja solo en la zona que marcas y el resto queda como lo grabaste. Todo en tu equipo, sin pagar por vídeo.')));
  if (!localBase()) { r.append(el('div', { class: 'empty big' }, 'Esto funciona con Plató abierto como aplicación en tu ordenador (Plato.cmd, Plato.command o ./plato.sh).')); return; }
  const c = (localCaps() || {}).ai || {};
  const need = [!c.sam && 'Máscaras (SAM 3.1)', !c.personaje && !c.objeto && 'un modelo de vídeo (personaje u objeto)'].filter(Boolean);
  if (need.length) r.append(el('div', { class: 'card rc-need' }, el('b', {}, 'Te falta: ' + need.join(' y ')), el('p', { class: 'note' }, `Descárgalo en Ajustes → 🧠 IA local. ${c.tier === 'cpu' || c.tier === 'mac' ? 'Tu equipo no tiene gráfica NVIDIA: la máscara y el audio funcionan, pero generar vídeo necesita una NVIDIA (16-24 GB para el personaje).' : ''}`), el('a', { class: 'mini-b on', href: '#settings' }, 'Ir a Ajustes')));
  const body = el('div', { class: 'rc' }); r.append(body); draw(body);
}
function draw(body) {
  body.innerHTML = '';
  body.append(step1(body));
  if (R.seg) body.append(step2(body));
  if (R.preview) body.append(step3(body), step4(), step5(body));
}
// 1 · Clip y tramo
function step1(body) {
  const sec = el('section', { class: 'card' }, el('h3', {}, '1 · Tu clip'));
  const file = el('input', { type: 'file', accept: 'video/*', style: 'display:none', on: { change: async e => { const f = e.target.files[0]; if (!f) return; sec.querySelector('.rc-st').textContent = '⏳ Subiendo…';
    try { R.info = await api('/api/recast/new', null, { body: f, headers: { 'x-name': encodeURIComponent(f.name) } }); R.id = R.info.id; R.seg = null; R.preview = null; R.mask = null; R.points = []; R.result = null; draw(body); } catch (er) { toast(er.message); } } } });
  sec.append(file, el('div', { class: 'row-btns' }, btn(R.id ? '📁 Otro clip' : '📁 Subir un vídeo', () => file.click(), 'mini-b on')), el('small', { class: 'rc-st' }, R.info ? `${R.info.w}×${R.info.h} · ${R.info.fps.toFixed(0)} fps · ${R.info.dur.toFixed(1)} s` : 'MP4 o MOV. Mejor clips cortos (hasta 20 s por tramo).'));
  if (R.info) {
    const max = R.info.max || 20; const st = el('input', { type: 'range', min: 0, max: Math.max(0, R.info.dur - 0.5), step: 0.1, value: R.seg ? R.seg.start : 0 }), du = el('input', { type: 'range', min: 1, max: Math.min(max, R.info.dur), step: 0.5, value: R.seg ? R.seg.dur : Math.min(5, R.info.dur) });
    const lab = el('small', {}); const img = el('img', { class: 'rc-thumb' }); const upd = () => { lab.textContent = `Desde ${(+st.value).toFixed(1)} s, durante ${(+du.value).toFixed(1)} s`; img.src = `${localBase()}/api/recast/frame?id=${R.id}&t=${st.value}&_=${Date.now()}`; };
    st.addEventListener('change', upd); du.addEventListener('input', () => { lab.textContent = `Desde ${(+st.value).toFixed(1)} s, durante ${(+du.value).toFixed(1)} s`; }); upd();
    sec.append(img, el('div', { class: 'lbl' }, 'Tramo'), st, du, lab, el('div', { class: 'row-btns' }, btn(R.seg ? '✂️ Cambiar tramo' : '✂️ Usar este tramo', async e => { const b = e.currentTarget; b.textContent = '⏳'; try { R.seg = { ...(await api('/api/recast/segment', { id: R.id, start: +st.value, dur: +du.value })), start: +st.value, dur: +du.value }; R.preview = null; R.mask = null; R.points = []; draw(body); } catch (er) { toast(er.message); b.textContent = '✂️ Usar este tramo'; } }, 'mini-b on')));
  }
  return sec;
}
// 2 · Máscara: toques (+/−) o texto, y seguimiento
function step2(body) {
  const sec = el('section', { class: 'card' }, el('h3', {}, '2 · ¿Qué cambias?'), el('p', { class: 'note' }, 'Toca a la persona u objeto en el primer fotograma. Con «Quitar» tocas lo que NO quieres. También puedes escribirlo («el chico de rojo»).'));
  const cv = el('canvas', { class: 'rc-cv' }); const ctx = cv.getContext('2d'); const img = new Image(); let mimg = null;
  const paint = () => { cv.width = img.naturalWidth; cv.height = img.naturalHeight; ctx.drawImage(img, 0, 0);
    if (mimg) { const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height; const tc = t.getContext('2d'); tc.drawImage(mimg, 0, 0, cv.width, cv.height); tc.globalCompositeOperation = 'source-in'; tc.fillStyle = 'rgba(255,60,120,0.5)'; tc.fillRect(0, 0, cv.width, cv.height); ctx.drawImage(t, 0, 0); }
    for (const p of R.points) { ctx.beginPath(); ctx.arc(p.x * cv.width, p.y * cv.height, Math.max(6, cv.width / 90), 0, 7); ctx.fillStyle = p.pos === false ? '#e33' : '#2c6'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); } };
  img.onload = paint; img.src = `${localBase()}/api/recast/f0?id=${R.id}&_=${Date.now()}`;
  if (R.mask) { mimg = new Image(); mimg.onload = paint; mimg.src = 'data:image/png;base64,' + R.mask; }
  cv.addEventListener('click', e => { const b = cv.getBoundingClientRect(); R.points.push({ x: (e.clientX - b.left) / b.width, y: (e.clientY - b.top) / b.height, pos: !R.neg }); paint(); });
  const txt = el('input', { class: 'txt', placeholder: 'O escríbelo en inglés: «man in red shirt», «car»…', value: R.text }); txt.addEventListener('change', () => { R.text = txt.value.trim(); });
  const st = el('small', { class: 'lai-log' });
  sec.append(cv, el('div', { class: 'row-btns' },
    seg([['add', '＋ Marcar'], ['del', '－ Quitar']], () => R.neg ? 'del' : 'add', v => { R.neg = v === 'del'; }),
    btn('↺ Borrar toques', () => { R.points = []; mimg = null; R.mask = null; paint(); }, 'mini-b')), txt,
    el('div', { class: 'row-btns' }, btn('🎯 Ver máscara', async e => { const b = e.currentTarget; b.textContent = '⏳ SAM…'; st.textContent = 'La primera vez arranca el motor y carga SAM: puede tardar un minuto.';
      try { R.mask = (await api('/api/recast/mask', { id: R.id, points: R.points, text: R.text })).mask; mimg = new Image(); mimg.onload = paint; mimg.src = 'data:image/png;base64,' + R.mask; st.textContent = '¿Bien? Pulsa «Seguir por todo el clip». Si no, añade toques.'; } catch (er) { st.textContent = '❌ ' + er.message; } b.textContent = '🎯 Ver máscara'; }, 'mini-b on'),
      R.mask ? btn('🎞 Seguir por todo el clip', async e => { const b = e.currentTarget; b.disabled = true;
        try { await api('/api/recast/track', { id: R.id }); const j = await poll(R.id, j => { b.textContent = `⏳ ${Math.round(j.p * 100)}%`; st.textContent = j.stage; }); R.preview = `${localBase()}/api/recast/file?id=${R.id}&name=preview.mp4&_=${Date.now()}`; draw(body); toast(`Máscara en ${j.out.frames} fotogramas`); }
        catch (er) { st.textContent = '❌ ' + er.message; b.disabled = false; b.textContent = '🎞 Seguir por todo el clip'; } }, 'mini-b on') : null), st);
  if (R.preview) sec.append(el('div', { class: 'lbl' }, 'Así se sigue la máscara'), el('video', { class: 'rc-vid', src: R.preview, controls: true, loop: true, muted: true, autoplay: true, playsinline: true }));
  return sec;
}
// 3 · Qué poner
function step3(body) {
  const c = (localCaps() || {}).ai || {}; const sec = el('section', { class: 'card' }, el('h3', {}, '3 · ¿Qué pones?'));
  const refIn = el('input', { type: 'file', accept: 'image/*', style: 'display:none', on: { change: e => { R.ref = e.target.files[0] || null; draw(body); } } });
  const pr = el('textarea', { class: 'txt', rows: 2, placeholder: R.mode === 'personaje' ? 'Opcional: describe la escena («a knight walking in the street, night»)' : R.mode === 'objeto' ? 'Qué quieres en esa zona (en inglés): «a red vintage car»' : 'Opcional: qué debería verse detrás («brick wall»)' }, R.prompt); pr.addEventListener('change', () => { R.prompt = pr.value.trim(); });
  sec.append(seg([['personaje', '🧍 Personaje'], ['objeto', '📦 Objeto'], ['borrar', '🧽 Borrar']], () => R.mode, v => { R.mode = v; draw(body); }),
    el('p', { class: 'note' }, R.mode === 'personaje' ? `Wan 2.2 Animate copia el movimiento y la cara de la persona y le pone tu personaje, con la luz de la escena.${c.personaje ? '' : ' ⚠️ Falta descargar «Cambiar persona por personaje».'}` : R.mode === 'objeto' ? `Wan VACE rellena la zona con lo que pidas; una imagen de referencia ayuda mucho.${c.objeto ? '' : ' ⚠️ Falta descargar «Cambiar o borrar objetos».'}` : `Wan VACE rellena la zona con el fondo, como si no hubiera estado.${c.objeto ? '' : ' ⚠️ Falta descargar «Cambiar o borrar objetos».'}`),
    refIn, R.mode !== 'borrar' ? el('div', { class: 'rc-ref' }, R.ref ? el('img', { src: blobURL(R.ref) }) : null, btn(R.ref ? 'Cambiar imagen' : R.mode === 'personaje' ? '🖼 Imagen del personaje' : '🖼 Imagen de referencia (opcional)', () => refIn.click(), 'mini-b on')) : null, pr);
  return sec;
}
// 4 · Voz
function step4() {
  const c = (localCaps() || {}).ai || {}; const sec = el('section', { class: 'card' }, el('h3', {}, '4 · Audio'));
  const voices = ((localCaps() || {}).voices || {}).kokoro || []; const sel = el('select', { class: 'txt' }, voices.map(v => el('option', { value: v.id, selected: v.id === R.voice.voice }, v.label))); sel.addEventListener('change', () => { R.voice.voice = sel.value; R.voice.refB64 = null; });
  const up = el('input', { type: 'file', accept: 'audio/*', style: 'display:none', on: { change: async e => { const f = e.target.files[0]; if (f) { R.voice.refB64 = await b64(f); toast('Muestra de voz cargada'); } } } });
  const extra = el('div');
  const fillExtra = () => { extra.innerHTML = ''; if (R.voice.mode === 'convert') extra.append(el('p', { class: 'note' }, `Seed-VC cambia el timbre manteniendo lo que dice y cómo lo dice. Usa una voz de Kokoro o sube 10-20 s de la voz que quieras (solo voces con permiso).${c.voz ? '' : ' ⚠️ Falta descargar «Cambiar la voz».'}`), sel, up, btn('🎙 Subir muestra de voz', () => up.click(), 'mini-b')); };
  sec.append(seg([['keep', 'Original intacto'], ['convert', 'Cambiar la voz'], ['mute', 'Quitar la voz']], () => R.voice.mode, v => { R.voice.mode = v; fillExtra(); }), extra,
    el('p', { class: 'note' }, 'El audio original se copia tal cual, sin recomprimir. Para cambiar o quitar la voz se separa de la música en tu equipo.' + (c.audio ? '' : ' (Necesita «Separar voz y música».)')));
  fillExtra(); return sec;
}
// 5 · Generar
function step5(body) {
  const sec = el('section', { class: 'card' }, el('h3', {}, '5 · Generar')); const st = el('small', { class: 'lai-log' }); const bar = el('div', { class: 'lai-bar' }, el('i', { style: 'width:0' })); const out = el('div', { class: 'rc-out' });
  const go = (quality, dryRun = false) => async e => {
    if (!dryRun && R.mode === 'personaje' && !R.ref) return toast('Sube la imagen del personaje');
    const b = e.currentTarget; sec.querySelectorAll('button').forEach(x => { x.disabled = true; });
    try { await api('/api/recast/run', { id: R.id, mode: R.mode, quality, prompt: R.prompt, refB64: R.ref ? await b64(R.ref) : null, voice: R.voice, dryRun });
      const j = await poll(R.id, j => { st.textContent = j.stage; bar.firstChild.style.width = Math.round(j.p * 100) + '%'; });
      const url = `${localBase()}/api/recast/file?id=${R.id}&name=${j.out.file}&_=${Date.now()}`; R.result = { url, ...j.out, quality, dryRun };
      st.textContent = dryRun ? 'Así queda el recorte y el pegado (sin IA). Lo teñido es lo que cambiaría.' : `Listo en ${Math.round(j.out.secs / 60)} min ${j.out.secs % 60} s · ${j.out.frames} fotogramas · recorte ${j.out.crop.w}×${j.out.crop.h}${j.out.saved ? ' · guardado en ' + j.out.saved : ''}`;
      showResult(out);
    } catch (er) { st.textContent = '❌ ' + er.message; }
    sec.querySelectorAll('button').forEach(x => { x.disabled = false; });
  };
  sec.append(el('p', { class: 'note' }, 'Primero un borrador (480p en la zona, pocos pasos) para ver si funciona; luego la versión final (720p en la zona, más pasos). Gratis: solo cuesta tiempo de tu gráfica.'),
    el('div', { class: 'row-btns' }, btn('👁 Probar recorte (sin IA)', go('draft', true), 'mini-b'), btn('⚡ Borrador', go('draft'), 'mini-b on'), btn('🎬 Final', go('final'), 'mini-b on')), bar, st, out);
  if (R.result) showResult(out);
  return sec;
}
function showResult(out) {
  out.innerHTML = ''; const v = el('video', { class: 'rc-vid', src: R.result.url, controls: true, autoplay: true, playsinline: true });
  out.append(v, el('div', { class: 'row-btns' }, btn('⬇ Descargar', async () => download(await (await fetch(R.result.url)).blob(), R.result.file), 'mini-b'),
    R.result.dryRun ? null : btn('🖼 A la galería', async () => { const blob = await (await fetch(R.result.url)).blob(); await db.put('gens', { id: 'rc-' + uid(), t: Date.now(), mode: 'recast', kind: 'video', modelName: `Recast local · ${R.mode}`, provider: 'local', prompt: R.prompt, cost: 0, blob, dur: R.seg && R.seg.dur }); toast('Guardado en la galería'); }, 'mini-b')));
}
