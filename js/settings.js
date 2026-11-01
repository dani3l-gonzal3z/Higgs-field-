// ⚙️ Ajustes: plan, claves, proxy, IA, presupuesto, catálogo y datos.
import { el, btn, toast, modal, seg, toggle, getSettings, saveSettings, hasAnyKey, db, money, spentThisMonth, fmtDate, download, copyText, confirmBox, emit } from './core.js';
import { PROVIDERS, catalog } from './providers.js';
import { DEFAULT_CATALOG, MODES } from './catalog.js';
import { mcpSettingsCard } from './mcp.js';

let root = null;
export async function renderSettings(r) {
  root = r; r.innerHTML = ''; const s = getSettings(); const save = () => { saveSettings(s); };
  const prem = hasAnyKey(s);
  r.append(el('section', { class: 'card plans' }, el('h3', {}, 'Tu plan'),
    el('div', { class: 'plan on' }, el('div', { class: 'badge pro' }, 'PRO'), el('b', {}, 'Plató, tomas y exportación'), el('small', {}, 'Gratis y sin claves: monta escenas, dirige, graba y exporta el paquete para cualquier IA.'), el('span', { class: 'st ok' }, '✓ Activo')),
    el('div', { class: 'plan' + (prem ? ' on' : '') }, el('div', { class: 'badge prem' }, 'PREMIUM'), el('b', {}, 'Estudio de generación, montaje y personajes'), el('small', {}, 'Con tus propias claves: pagas al proveedor solo lo que generas. Sin suscripción.'), el('span', { class: 'st' + (prem ? ' ok' : '') }, prem ? '✓ Activo' : 'Añade una clave abajo'))));
  // Claves
  const keys = el('section', { class: 'card' }, el('h3', {}, 'Claves de proveedores'), el('p', { class: 'note' }, 'Se guardan solo en este navegador y se envían únicamente al proveedor (o a tu proxy). No uses este dispositivo compartido.'));
  for (const [id, p] of Object.entries(PROVIDERS)) { const inp = el('input', { class: 'txt', type: 'password', autocomplete: 'off', placeholder: p.keyLabel, value: s.keys[id] || '' }); inp.addEventListener('change', () => { s.keys[id] = inp.value.trim(); save(); renderSettings(r); toast('Guardado'); });
    keys.append(el('div', { class: 'keyrow' }, el('div', { class: 'kh' }, el('b', {}, p.name), p.needsProxy ? el('span', { class: 'tag' }, 'necesita proxy') : el('span', { class: 'tag ok' }, 'directo'), s.keys[id] ? el('span', { class: 'tag ok' }, '✓') : null, el('a', { href: p.keyUrl, target: '_blank', class: 'lnk' }, p.keyHelp)),
      el('div', { class: 'inrow' }, inp, btn('👁', () => { inp.type = inp.type === 'password' ? 'text' : 'password'; }, 'mini-b')))); }
  r.append(keys);
  // Proxy
  const purl = el('input', { class: 'txt', placeholder: 'https://plato-proxy.TU-USUARIO.workers.dev', value: s.proxy.url }); purl.addEventListener('change', () => { s.proxy.url = purl.value.trim().replace(/\/+$/, ''); save(); });
  const ptok = el('input', { class: 'txt', type: 'password', placeholder: 'Contraseña del proxy (PROXY_TOKEN)', value: s.proxy.token }); ptok.addEventListener('change', () => { s.proxy.token = ptok.value.trim(); save(); });
  r.append(el('section', { class: 'card' }, el('h3', {}, 'Mini-proxy (para Higgsfield, Muapi y Replicate)'),
    el('p', { class: 'note' }, 'Esos proveedores no permiten llamadas directas desde el navegador. El proxy es un Cloudflare Worker gratuito que reenvía tus peticiones. Solo tú lo usas, protegido con contraseña.'),
    purl, el('div', { class: 'gap' }), ptok, el('div', { class: 'gap' }), toggle('Usar el proxy también para fal.ai', () => s.proxy.falViaProxy, v => { s.proxy.falViaProxy = v; save(); }),
    el('div', { class: 'row-btns' }, btn('🔌 Probar proxy', testProxy, 'mini-b'), btn('📖 Cómo montarlo (5 min)', proxyHelp, 'mini-b on'))));
  // IA
  const lk = el('input', { class: 'txt', type: 'password', placeholder: 'Clave de la API de IA', value: s.llm.key }); lk.addEventListener('change', () => { s.llm.key = lk.value.trim(); save(); });
  const lm = el('input', { class: 'txt', placeholder: 'Modelo', value: s.llm.model }); lm.addEventListener('change', () => { s.llm.model = lm.value.trim(); save(); });
  const lb = el('input', { class: 'txt', placeholder: 'URL base (OpenRouter por defecto)', value: s.llm.base }); lb.addEventListener('change', () => { s.llm.base = lb.value.trim(); save(); });
  r.append(el('section', { class: 'card' }, el('h3', {}, 'Asistente de IA (director y prompts)'), el('p', { class: 'note' }, 'Lo usa el plató para entender órdenes complejas y el Estudio para mejorar prompts. Sin clave, el plató funciona en modo básico.'),
    seg([['anthropic', 'Anthropic (Claude)'], ['openai', 'Compatible OpenAI / OpenRouter']], () => s.llm.provider, v => { s.llm.provider = v; if (v === 'anthropic' && !s.llm.model) s.llm.model = 'claude-sonnet-5-5'; save(); renderSettings(r); }), el('div', { class: 'gap' }), lk, el('div', { class: 'gap' }), lm, s.llm.provider !== 'anthropic' ? el('div', {}, el('div', { class: 'gap' }), lb) : null));
  r.append(mcpSettingsCard());
  // Presupuesto
  const spent = await spentThisMonth();
  const bud = el('input', { class: 'txt sm', type: 'number', min: 0, step: 1, value: s.budget.monthly }); bud.addEventListener('change', () => { s.budget.monthly = +bud.value || 0; save(); emit('ledger'); });
  const conf = el('input', { class: 'txt sm', type: 'number', min: 0, step: 0.5, value: s.budget.confirmAbove }); conf.addEventListener('change', () => { s.budget.confirmAbove = +conf.value || 0; save(); });
  const eur = el('input', { class: 'txt sm', type: 'number', min: 0, step: 0.01, value: s.budget.eurRate }); eur.addEventListener('change', () => { s.budget.eurRate = +eur.value || 1; save(); });
  const pct = s.budget.monthly ? Math.min(100, spent / s.budget.monthly * 100) : 0;
  r.append(el('section', { class: 'card' }, el('h3', {}, 'Gasto y presupuesto'), el('div', { class: 'bar' }, el('i', { style: `width:${pct}%` + (pct > 90 ? ';background:var(--ac2)' : '') })), el('p', {}, el('b', {}, money(spent)), ` gastado este mes (estimado) de $${s.budget.monthly}`),
    el('div', { class: 'grid3' }, el('label', { class: 'mini' }, 'Tope mensual ($)', bud), el('label', { class: 'mini' }, 'Pedir confirmación desde ($)', conf), el('label', { class: 'mini' }, '1 $ = … €', eur)),
    toggle('Mostrar también en euros', () => s.budget.showEur, v => { s.budget.showEur = v; save(); }),
    el('p', { class: 'note' }, 'Los importes son estimaciones con los precios del catálogo. El cargo real lo ves en el panel de cada proveedor.'),
    el('div', { class: 'row-btns' }, btn('📜 Historial', ledgerView, 'mini-b'), btn('⬇ Exportar CSV', ledgerCSV, 'mini-b'))));
  // Catálogo
  const cat = catalog(s);
  const cl = el('div', { class: 'catlist' }); for (const m of cat) cl.append(el('div', { class: 'catrow' + (m.disabled ? ' dis' : '') }, el('span', { class: 'tag' }, MODES[m.mode] ? MODES[m.mode].icon : '?'), el('div', {}, el('b', {}, m.name, m.verified ? '' : ' ⚠'), el('small', {}, `${PROVIDERS[m.provider] ? PROVIDERS[m.provider].name : m.provider} · ${m.endpoint} · $${m.price ? m.price.usd : '?'}/${m.price ? m.price.per : '?'}`)),
    btn(m.disabled ? 'Activar' : 'Desactivar', () => { const c = JSON.parse(JSON.stringify(cat)); const x = c.find(y => y.id === m.id); x.disabled = !x.disabled; s.catalog = c; save(); renderSettings(r); }, 'mini-b')));
  r.append(el('section', { class: 'card' }, el('h3', {}, `Catálogo de modelos (${cat.length})`), el('p', { class: 'note' }, '⚠ = parámetros sin verificar en la documentación: prueba primero con un vídeo corto. Puedes añadir cualquier modelo de tus proveedores editando el JSON.'), cl,
    el('div', { class: 'row-btns' }, btn('✏️ Editar JSON', catalogEditor, 'mini-b on'), btn('↺ Restaurar original', async () => { if (await confirmBox('Restaurar catálogo', 'Se perderán tus cambios en el catálogo.', 'Restaurar')) { s.catalog = null; save(); renderSettings(r); } }, 'mini-b'))));
  // Datos
  let est = ''; try { const e = await navigator.storage.estimate(); est = `${(e.usage / 1048576).toFixed(0)} MB usados de ~${(e.quota / 1073741824).toFixed(1)} GB`; } catch (e) {}
  r.append(el('section', { class: 'card' }, el('h3', {}, 'Datos y app'), el('p', { class: 'note' }, 'Todo (galería, tomas, personajes) se guarda en este dispositivo. ' + est),
    el('div', { class: 'row-btns' }, btn('⬇ Exportar ajustes', () => exportCfg(false), 'mini-b'), btn('⬇ …con claves', () => exportCfg(true), 'mini-b'), btn('⬆ Importar ajustes', importCfg, 'mini-b'),
      'Notification' in window ? btn('🔔 Avisos al terminar', async () => { const p = await Notification.requestPermission(); toast(p === 'granted' ? 'Te avisaré cuando acaben las generaciones' : 'Permiso no concedido'); }, 'mini-b') : null,
      btn('📦 Persistir almacenamiento', async () => { const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist() : false; toast(ok ? 'El navegador no borrará tus datos' : 'El navegador no lo permite ahora'); }, 'mini-b')),
    el('div', { class: 'row-btns' }, btn('🗑 Vaciar tomas recibidas', async () => { if (await confirmBox('Vaciar', '¿Borrar las tomas enviadas desde el plató?', 'Borrar')) { await db.clear('inbox'); toast('Hecho'); } }, 'mini-b red'), btn('🗑 Vaciar galería', async () => { if (await confirmBox('Vaciar galería', 'Se borran todas las generaciones guardadas en este dispositivo.', 'Borrar todo')) { await db.clear('gens'); emit('gens'); toast('Galería vacía'); } }, 'mini-b red'))));
}
async function testProxy() { const s = getSettings(); if (!s.proxy.url) { toast('Escribe primero la URL del proxy'); return; }
  try { const r = await fetch(s.proxy.url + '/https://api.replicate.com/v1/models', { headers: s.proxy.token ? { 'x-proxy-token': s.proxy.token } : {} }); if (r.status === 403 && (await r.text()).includes('proxy')) toast('El proxy responde pero la contraseña no coincide'); else toast('✅ Proxy funcionando', 3000, { sub: `Respuesta ${r.status} del destino (401 es normal sin clave).` }); }
  catch (e) { toast('❌ No responde', 4000, { sub: 'Revisa la URL y que el Worker esté desplegado.' }); } }
async function proxyHelp() { let code = ''; try { code = await (await fetch('proxy/worker.js')).text(); } catch (e) {}
  const pre = el('pre', { class: 'code' }, code || 'Abre proxy/worker.js en el repositorio.');
  modal('Montar el mini-proxy en Cloudflare (gratis)', el('div', {}, el('ol', { class: 'steps' },
    el('li', {}, 'Entra en ', el('a', { href: 'https://dash.cloudflare.com', target: '_blank' }, 'dash.cloudflare.com'), ' (cuenta gratuita) → ', el('b', {}, 'Workers & Pages → Create → Worker'), '. Llámalo, por ejemplo, plato-proxy, y pulsa Deploy.'),
    el('li', {}, el('b', {}, 'Edit code'), ': borra lo que hay, pega el código de abajo y pulsa ', el('b', {}, 'Deploy'), '.'),
    el('li', {}, 'En ', el('b', {}, 'Settings → Variables and Secrets'), ' añade un secreto ', el('code', {}, 'PROXY_TOKEN'), ' con una contraseña larga. Opcional: ', el('code', {}, 'ALLOW_ORIGIN'), ' con la dirección de tu app.'),
    el('li', {}, 'Copia la URL del Worker (termina en .workers.dev) y pégala aquí junto a la contraseña. Pulsa «Probar proxy».')),
    el('div', { class: 'row-btns' }, btn('📋 Copiar código', () => copyText(code), 'b on')), pre), { wide: true }); }
async function ledgerView() { const all = (await db.all('ledger')).sort((a, b) => b.t - a.t).slice(0, 200);
  const t = el('div', { class: 'ledger' }, all.length ? all.map(x => el('div', { class: 'lr ' + x.status }, el('span', {}, fmtDate(x.t)), el('b', {}, x.model), el('span', {}, x.status === 'ok' ? '✓' : x.status === 'fail' ? '✕' : '⏳'), el('span', {}, x.cost ? '$' + x.cost.toFixed(3) : '—'))) : el('div', { class: 'empty' }, 'Sin movimientos.'));
  modal('Historial de gasto (estimado)', t, { wide: true }); }
async function ledgerCSV() { const all = (await db.all('ledger')).sort((a, b) => a.t - b.t); const csv = 'fecha,modelo,proveedor,estado,coste_usd\n' + all.map(x => [new Date(x.t).toISOString(), `"${x.model}"`, x.provider, x.status, (x.cost || 0).toFixed(4)].join(',')).join('\n'); download(new Blob([csv], { type: 'text/csv' }), 'gasto-plato-studio.csv'); }
function catalogEditor() { const s = getSettings(); const ta = el('textarea', { class: 'txt code', rows: 22, spellcheck: false }); ta.value = JSON.stringify(catalog(s), null, 1);
  const tpl = { id: 'mi-modelo', provider: 'fal', mode: 'i2v', name: 'Mi modelo', endpoint: 'propietario/modelo/ruta', fields: { prompt: 'prompt', image: 'image_url', duration: 'duration' }, fmt: { duration: 'str' }, price: { usd: 0.1, per: 's' }, verified: false };
  let close; const body = el('div', {}, el('p', { class: 'note' }, 'provider: fal | higgsfield | muapi | replicate · mode: v2v | i2v | t2v | t2i | i2i · fields traduce los conceptos de la app (prompt, negative, image, end_image, video, control, refs, duration, aspect, resolution, audio, seed) al nombre del parámetro de cada modelo · fmt.duration: "s" → "5s", "str" → "5" · fmt.aspect: "falsize" · fixed: parámetros fijos extra.'),
    el('div', { class: 'row-btns' }, btn('📋 Copiar plantilla de modelo', () => copyText(JSON.stringify(tpl, null, 1)), 'mini-b')), ta,
    el('div', { class: 'acts' }, btn('Cancelar', () => close()), btn('Guardar', () => { try { const c = JSON.parse(ta.value); if (!Array.isArray(c)) throw new Error('Debe ser una lista [ … ]'); for (const m of c) { if (!m.id || !m.provider || !m.mode || !m.endpoint) throw new Error('Cada modelo necesita id, provider, mode y endpoint'); if (!PROVIDERS[m.provider]) throw new Error('Proveedor desconocido: ' + m.provider); } s.catalog = c; saveSettings(s); close(); renderSettings(root); toast('Catálogo guardado'); } catch (e) { toast('JSON no válido: ' + e.message, 4500); } }, 'b on')));
  close = modal('Catálogo de modelos', body, { wide: true }); }
function exportCfg(withKeys) { const s = getSettings(); const o = JSON.parse(JSON.stringify(s)); if (!withKeys) { for (const k in o.keys) o.keys[k] = ''; o.llm.key = ''; o.proxy.token = ''; } download(new Blob([JSON.stringify(o, null, 1)], { type: 'application/json' }), withKeys ? 'plato-studio-ajustes-CON-CLAVES.json' : 'plato-studio-ajustes.json'); }
function importCfg() { const f = el('input', { type: 'file', accept: 'application/json', on: { change: async e => { try { const o = JSON.parse(await e.target.files[0].text()); const s = getSettings(); for (const k of ['keys', 'proxy', 'llm', 'budget']) if (o[k]) for (const kk in o[k]) if (o[k][kk] !== '' && o[k][kk] != null) s[k][kk] = o[k][kk]; if (o.catalog) s.catalog = o.catalog; saveSettings(s); renderSettings(root); toast('Ajustes importados'); } catch (err) { toast('Archivo no válido'); } } } }); f.click(); }
