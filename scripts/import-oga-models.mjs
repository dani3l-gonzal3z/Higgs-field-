// Importa el registro de modelos de Open Generative AI (MIT) a un formato compacto para el Laboratorio.
// Uso: node scripts/import-oga-models.mjs <ruta>/packages/studio/src/models.js
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const src = process.argv[2]; const m = await import(pathToFileURL(src).href);
const CATS = { t2iModels: 't2i', t2vModels: 't2v', i2iModels: 'i2i', i2vModels: 'i2v', v2vModels: 'v2v', lipsyncModels: 'lip', recastModels: 'recast', motionControlModels: 'motion', audioModels: 'audio' };
const MEDIA = { image: 'image', video: 'video', audio: 'audio', images_list: 'images', videos_list: 'videos', audios_list: 'audios' };
const out = []; const seen = new Set();
for (const [k, c] of Object.entries(CATS)) for (const x of m[k] || []) {
  if (/spicy|nsfw|adult|undress/i.test(x.id + ' ' + x.name)) continue;
  const key = c + ':' + x.id; if (seen.has(key)) continue; seen.add(key);
  const ins = {}; for (const [n, i] of Object.entries(x.inputs || {})) {
    const o = { t: i.type }; if (i.field && MEDIA[i.field]) o.m = MEDIA[i.field]; else if (/_url$/.test(n) && /image/.test(n)) o.m = 'image'; else if (/_url$/.test(n) && /video/.test(n)) o.m = 'video'; else if (/_url$/.test(n) && /audio/.test(n)) o.m = 'audio'; else if (n === 'images_list') o.m = 'images'; else if (n === 'videos_list') o.m = 'videos'; else if (n === 'audios_list') o.m = 'audios';
    if (i.enum) o.e = i.enum; if (i.default !== undefined) o.d = i.default; if (i.minimum !== undefined) o.min = i.minimum; if (i.maximum !== undefined) o.max = i.maximum; if (i.maxItems) o.mx = i.maxItems; if (i.title && i.title !== n) o.ti = i.title; if (i.description && !o.e && i.type !== 'boolean') o.ds = String(i.description).slice(0, 120);
    ins[n] = o; }
  const r = { id: x.id, n: x.name, e: x.endpoint || x.id, c, f: x.family || '' };
  if (x.description) r.d = String(x.description).replace(/\s+/g, ' ').slice(0, 160);
  if (x.hasPrompt) r.p = 1; if (x.promptRequired) r.pr = 1; if (x.imageField) r.img = x.imageField; if (x.maxImages) r.mi = x.maxImages; if (x.lastImageField) r.last = x.lastImageField; if (x.videoField) r.vid = x.videoField; if (x.audioField) r.aud = x.audioField; if (x.maxAudios) r.ma = x.maxAudios; if (x.fixedParameters) r.fx = x.fixedParameters; if (x.required) r.rq = x.required; if (x.provider_name) r.pv = x.provider_name;
  if (c === 'lip') { if (x.category === 'image') r.img = r.img || 'image_url'; else r.vid = r.vid || 'video_url'; r.aud = r.aud || 'audio_url'; }
  if ((c === 'v2v' || c === 'recast' || c === 'motion') && !r.vid) r.vid = 'video_url';
  if (Object.keys(ins).length) r.i = ins; out.push(r);
}
const banner = '// Registro de modelos importado de Open Generative AI (https://github.com/Anil-matcha/Open-Generative-AI), licencia MIT.\n// Copyright (c) 2026 Open Generative AI Contributors. Generado con scripts/import-oga-models.mjs — no editar a mano.\n';
writeFileSync(new URL('../js/vendor/oga-models.js', import.meta.url), banner + 'export default ' + JSON.stringify(out) + ';\n');
const by = {}; for (const r of out) by[r.c] = (by[r.c] || 0) + 1; console.log(out.length, JSON.stringify(by));
