// Acceso al registro de modelos de Open Generative AI (MIT) y adaptación al catálogo del Estudio.
let REG = null;
export async function registry() { if (!REG) REG = (await import('./vendor/oga-models.js')).default; return REG; }
export const CAT_LABEL = { t2i: 'Texto → Imagen', i2i: 'Imagen → Imagen', t2v: 'Texto → Vídeo', i2v: 'Imagen → Vídeo', v2v: 'Vídeo → Vídeo y herramientas', lip: 'Lip sync', recast: 'Recast', motion: 'Motion control', audio: 'Audio' };
export const KIND_OF = { t2i: 'image', i2i: 'image', t2v: 'video', i2v: 'video', v2v: 'video', lip: 'video', recast: 'video', motion: 'video', audio: 'audio' };
const listy = n => /list$/.test(n || '');
export function mediaFields(r) {
  const out = []; const seen = new Set(); const add = (name, m, max) => { if (!name || seen.has(name)) return; seen.add(name); out.push({ name, m, max }); };
  if (r.vid) add(r.vid, listy(r.vid) ? 'videos' : 'video');
  if (r.img) add(r.img, listy(r.img) ? 'images' : 'image', r.mi);
  if (r.last) add(r.last, 'image');
  if (r.aud) add(r.aud, listy(r.aud) ? 'audios' : 'audio', r.ma);
  for (const [n, o] of Object.entries(r.i || {})) if (o.m) add(n, o.m, o.mx);
  return out;
}
export function paramFields(r) { return Object.entries(r.i || {}).filter(([n, o]) => !o.m && n !== 'prompt' && !(r.fx && n in r.fx)); }
export function toCatalog(r) {
  const mode = { t2i: 't2i', i2i: 'i2i', t2v: 't2v', i2v: 'i2v', v2v: 'v2v' }[r.c]; if (!mode) return null;
  if (mode === 'v2v' && !r.p) return null; // herramientas sin prompt: solo en el Laboratorio
  const I = r.i || {}; const f = {}; const fmt = {};
  if (r.p) f.prompt = 'prompt'; if (r.vid) f.video = r.vid; if (r.img) { f.image = r.img; if (listy(r.img)) fmt.image = 'list'; } if (r.last) f.end_image = r.last;
  if (I.duration) { f.duration = 'duration'; if (I.duration.t === 'string') fmt.duration = 'str'; } if (I.aspect_ratio) f.aspect = 'aspect_ratio'; if (I.resolution) f.resolution = 'resolution';
  if (I.negative_prompt) f.negative = 'negative_prompt'; if (I.seed) f.seed = 'seed'; if (I.generate_audio) f.audio = 'generate_audio';
  return { id: 'oga-' + r.c + '-' + r.id, provider: 'muapi', mode, name: r.n, endpoint: r.e, fields: f, fmt, fixed: r.fx, price: null, verified: true, reg: true, family: r.f,
    note: [r.pv, r.d].filter(Boolean).join(' · ').slice(0, 140), enums: { duration: I.duration && I.duration.e, aspect: I.aspect_ratio && I.aspect_ratio.e, resolution: I.resolution && I.resolution.e } };
}
// Cámaras y ópticas para el modo Cine (adaptado de Open Generative AI, MIT).
export const CAMERA_MAP = { 'Digital 8K modular': 'modular 8K digital cinema camera', 'Cine digital full-frame': 'full-frame digital cinema camera', 'Película 70 mm': 'grand format 70mm film camera', 'Digital S35 de estudio': 'Super 35 studio digital camera', 'Película 16 mm': 'classic 16mm film camera', 'Gran formato digital': 'premium large-format digital cinema camera' };
export const LENS_MAP = { 'Anamórfico clásico': 'classic anamorphic lens', 'Anamórfico compacto': 'compact anamorphic lens', 'Prime años 70': '1970s cinema prime lens', 'Prime moderno': 'premium modern prime lens', 'Prime cálido': 'warm-toned cinema prime lens', 'Prime vintage': 'vintage prime lens', 'Bokeh en remolino': 'swirl bokeh portrait lens', 'Difusión halation': 'halation diffusion filter', 'Prime clínico': 'ultra-sharp clinical prime lens', 'Macro extremo': 'extreme macro lens', 'Tilt creativo': 'creative tilt lens effect' };
export const APERTURE = { 'f/1.4': 'shallow depth of field, creamy bokeh', 'f/4': 'moderate depth of field', 'f/11': 'deep focus, everything sharp' };
export function cinemaPrompt(c) { if (!c) return ''; return [c.camera && `shot on a ${CAMERA_MAP[c.camera]}`, c.lens && LENS_MAP[c.lens], c.focal && `${c.focal}mm focal length`, c.aperture && APERTURE[c.aperture], c.move && c.move].filter(Boolean).join(', '); }
