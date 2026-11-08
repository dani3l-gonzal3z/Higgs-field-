// Tu profe y tu aula: aspecto, carácter y decoración. Se guarda en Ajustes (settings.learn).
import { el, btn, seg, toast, modal, getSettings, saveSettings } from './core.js';

export const PRESETS = {
  leo: { name: 'Leo', skin: '#e9b48f', hair: '#3b2a20', shirt: '#3d7fd6', pants: '#2b3348', hairStyle: 'corto', beard: 'perilla', glasses: false, outfit: 'camiseta', build: 'normal', height: 1 },
  marta: { name: 'Marta', skin: '#f1c7a5', hair: '#6b3a1f', shirt: '#16a34a', pants: '#1f2937', hairStyle: 'coleta', beard: 'no', glasses: true, outfit: 'camiseta', build: 'delgado', height: 0.96 },
  ruiz: { name: 'Dra. Ruiz', skin: '#c68a62', hair: '#1c1917', shirt: '#7c3aed', pants: '#334155', hairStyle: 'mono', beard: 'no', glasses: true, outfit: 'bata', build: 'normal', height: 1 },
  tomas: { name: 'Don Tomás', skin: '#e2b08c', hair: '#d4d4d8', shirt: '#334155', pants: '#1e293b', hairStyle: 'calvo', beard: 'barba', glasses: true, outfit: 'traje', build: 'fuerte', height: 1.04 },
  nia: { name: 'Nia', skin: '#7a4a2e', hair: '#111111', shirt: '#f97316', pants: '#3f3f46', hairStyle: 'rizado', beard: 'no', glasses: false, outfit: 'camiseta', build: 'normal', height: 0.98 },
};
const STYLES = [['cercano', '🤗 Cercano'], ['divertido', '😄 Divertido'], ['serio', '🧐 Riguroso'], ['socratico', '🤔 Socrático'], ['directo', '🎯 Al grano']];
const STYLE_TXT = {
  cercano: 'cercano y cálido: tuteas, animas y celebras cada avance',
  divertido: 'divertido y con chispa: comparaciones locas, energía y algún chiste',
  serio: 'riguroso y sereno: preciso con los términos, sin florituras',
  socratico: 'socrático: antes de dar una respuesta lanzas una pregunta para que quien aprende la deduzca, y luego confirmas',
  directo: 'directo y al grano: frases cortas y lo esencial primero',
};
const HUMOR_TXT = ['sin bromas', 'alguna broma suave de vez en cuando', 'bastante humor, sin perder el hilo'];
export const ROOMS = [['aula', '🏫 Aula'], ['laboratorio', '🧪 Laboratorio'], ['taller', '🛠 Taller'], ['biblioteca', '📚 Biblioteca'], ['exterior', '🌳 Al aire libre'], ['espacio', '🚀 Espacio']];

export function teacher() { const l = getSettings().learn || {}; return { ...PRESETS.leo, ...(l.teacher || {}) }; }
export function persona() { const l = getSettings().learn || {}; return { style: 'cercano', humor: 1, interests: '', extra: '', rate: 1, ...(l.persona || {}) }; }
export function room() { const l = getSettings().learn || {}; return { theme: 'aula', board: 'verde', props: ['plantas'], ...(l.room || {}) }; }
export const voiceRate = () => Math.max(0.7, Math.min(1.4, +persona().rate || 1));
// Texto para las instrucciones de la IA: quién es el profe y cómo explica
export function personaPrompt() { const t = teacher(), p = persona(); const name = String(t.name || 'el profe').slice(0, 30);
  return `Eres ${name}, el profe de Plató. Tu forma de ser: ${STYLE_TXT[p.style] || STYLE_TXT.cercano}; humor: ${HUMOR_TXT[Math.max(0, Math.min(2, +p.humor || 0))]}.`
    + (p.interests ? ` Cuando pongas ejemplos o analogías, tira sobre todo de: ${String(p.interests).slice(0, 160)}.` : '')
    + (p.extra ? ` Además: ${String(p.extra).slice(0, 240)}.` : '') + ' Mantén esta personalidad en todo lo que digas, sin exagerarla ni presentarte en cada paso.'; }

function save(part, v) { const s = getSettings(); s.learn = s.learn || {}; s.learn[part] = { ...(s.learn[part] || {}), ...v }; saveSettings(s, true); } // sin redibujar la página (cerraría este panel)
const swatch = (colors, get, set) => { const row = el('div', { class: 'cl-sw' }); const draw = () => { row.innerHTML = ''; for (const c of colors) row.append(el('button', { class: 'sw' + (get() === c ? ' on' : ''), style: `background:${c}`, title: c, onclick: () => { set(c); draw(); } })); const pick = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(get()) ? get() : '#888888', title: 'Otro color' }); pick.addEventListener('input', () => { set(pick.value); }); row.append(pick); }; draw(); return row; };

export function openClassroom() {
  const frame = el('iframe', { class: 'cl-prev', src: 'learn.html?preview=1', title: 'Vista previa del profe' });
  const sendAll = () => { const w = frame.contentWindow; if (!w) return; w.postMessage({ type: 'look', look: teacher() }, '*'); w.postMessage({ type: 'room', room: room() }, '*'); w.postMessage({ type: 'board', board: { title: '¡Hola! Soy ' + (teacher().name || 'tu profe'), bullets: [STYLES.find(s => s[0] === persona().style)?.[1] || '', 'Así daré tus clases'] } }, '*'); };
  const onMsg = e => { if (e.source === frame.contentWindow && e.data && e.data.type === 'learn-ready') sendAll(); }; addEventListener('message', onMsg);
  const tab = { v: 'look' }; const body = el('div', { class: 'cl-body' });
  const setT = v => { save('teacher', v); sendAll(); }, setP = v => { save('persona', v); sendAll(); }, setR = v => { save('room', v); sendAll(); };
  const row = (label, ...kids) => el('div', { class: 'cl-row' }, el('div', { class: 'lbl' }, label), ...kids);
  function draw() { body.innerHTML = ''; const t = teacher(), p = persona(), r = room();
    if (tab.v === 'look') {
      const presets = el('div', { class: 'cl-presets' }, ...Object.entries(PRESETS).map(([k, v]) => btn(v.name, () => { save('teacher', { ...v }); sendAll(); draw(); }, 'mini-b')));
      const name = el('input', { class: 'txt', value: t.name || '', maxlength: 30, placeholder: 'Nombre del profe' }); name.addEventListener('input', () => setT({ name: name.value.trim() }));
      body.append(row('Empieza por uno', presets), row('Nombre', name),
        row('Piel', swatch(['#f6d5bd', '#f1c7a5', '#e9b48f', '#d49a70', '#c68a62', '#9c6644', '#7a4a2e', '#4a2c1d'], () => teacher().skin, c => setT({ skin: c }))),
        row('Pelo', seg([['corto', 'Corto'], ['largo', 'Largo'], ['rizado', 'Rizado'], ['coleta', 'Coleta'], ['mono', 'Moño'], ['calvo', 'Sin pelo']], () => teacher().hairStyle, v => { setT({ hairStyle: v }); })),
        row('Color de pelo', swatch(['#111111', '#3b2a20', '#6b3a1f', '#a0522d', '#d4a017', '#e8d5a3', '#d4d4d8', '#b91c1c', '#2563eb'], () => teacher().hair, c => setT({ hair: c }))),
        row('Cara', seg([['no', 'Nada'], ['perilla', 'Perilla'], ['bigote', 'Bigote'], ['barba', 'Barba']], () => teacher().beard, v => setT({ beard: v })), el('label', { class: 'cl-chk' }, (() => { const c = el('input', { type: 'checkbox' }); c.checked = !!t.glasses; c.addEventListener('change', () => setT({ glasses: c.checked })); return c; })(), ' Gafas')),
        row('Ropa', seg([['camiseta', 'Camiseta'], ['bata', 'Bata'], ['traje', 'Traje']], () => teacher().outfit, v => setT({ outfit: v }))),
        row('Color de la ropa', swatch(['#3d7fd6', '#16a34a', '#f97316', '#7c3aed', '#e11d48', '#0f766e', '#334155', '#facc15', '#f5f5f4'], () => teacher().shirt, c => setT({ shirt: c }))),
        row('Pantalón', swatch(['#2b3348', '#1f2937', '#3f3f46', '#78350f', '#1e3a8a', '#d6d3d1'], () => teacher().pants, c => setT({ pants: c }))),
        row('Complexión', seg([['delgado', 'Delgada'], ['normal', 'Normal'], ['fuerte', 'Fuerte']], () => teacher().build, v => setT({ build: v }))),
        row('Altura', (() => { const i = el('input', { type: 'range', min: 0.88, max: 1.12, step: 0.01, value: t.height || 1 }); i.addEventListener('input', () => setT({ height: +i.value })); return i; })()));
    } else if (tab.v === 'mind') {
      const inter = el('input', { class: 'txt', value: p.interests || '', maxlength: 160, placeholder: 'p. ej. drones, coches, fútbol, cocina…' }); inter.addEventListener('input', () => setP({ interests: inter.value.trim() }));
      const extra = el('textarea', { class: 'txt', rows: 2, maxlength: 240, placeholder: 'p. ej. «hazme muchas preguntas», «usa unidades del sistema internacional», «explícalo como a alguien de FP de electrónica»' }); extra.value = p.extra || ''; extra.addEventListener('input', () => setP({ extra: extra.value.trim() }));
      const rate = el('input', { type: 'range', min: 0.75, max: 1.35, step: 0.05, value: p.rate || 1 }); const rv = el('span', { class: 'cl-val' }, (p.rate || 1).toFixed(2) + '×'); rate.addEventListener('input', () => { rv.textContent = (+rate.value).toFixed(2) + '×'; setP({ rate: +rate.value }); });
      body.append(row('Forma de ser', seg(STYLES, () => persona().style, v => setP({ style: v }))),
        row('Humor', seg([['0', 'Nada'], ['1', 'Un poco'], ['2', 'Mucho']], () => String(persona().humor ?? 1), v => setP({ humor: +v }))),
        row('Ejemplos de lo que te gusta', inter), row('Algo más que deba saber', extra), row('Velocidad al hablar', el('div', { class: 'inrow' }, rate, rv)),
        el('p', { class: 'note' }, 'El carácter cambia cómo te explica en las clases nuevas y en las respuestas. La voz se elige en Ajustes → Este aparato (o la del navegador).'));
    } else {
      const has = k => (room().props || []).includes(k); const tog = (k, label) => { const c = el('input', { type: 'checkbox' }); c.checked = has(k); c.addEventListener('change', () => { const ps = new Set(room().props || []); c.checked ? ps.add(k) : ps.delete(k); setR({ props: [...ps] }); }); return el('label', { class: 'cl-chk' }, c, ' ' + label); };
      body.append(row('Lugar', seg(ROOMS, () => room().theme, v => setR({ theme: v }))),
        row('Pizarra', seg([['verde', 'Verde'], ['negra', 'Negra'], ['blanca', 'Blanca']], () => room().board, v => setR({ board: v }))),
        row('Decoración', el('div', { class: 'cl-chks' }, tog('plantas', '🪴 Plantas'), tog('estanteria', '📚 Estantería'), tog('globo', '🌍 Globo'), tog('lampara', '💡 Lámpara'))));
    } }
  const tabs = seg([['look', '🧑‍🏫 Aspecto'], ['mind', '💭 Carácter'], ['room', '🏫 Aula']], () => tab.v, v => { tab.v = v; draw(); });
  draw();
  const close = modal('Tu profe y tu aula', el('div', { class: 'cl' }, frame, tabs, body), { onClose: () => { removeEventListener('message', onMsg); dispatchEvent(new Event('studio:settings')); } });
  return close;
}
