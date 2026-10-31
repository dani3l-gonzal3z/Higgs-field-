// Catálogo de modelos. Editable desde Ajustes → Catálogo (se guarda en el navegador).
// fields: nombre del parámetro del proveedor para cada concepto de la app.
//   prompt, negative, image (imagen inicial), end_image, video (vídeo de referencia), control (vídeo de profundidad),
//   refs (lista de imágenes de referencia), duration, aspect, resolution, audio, seed
// fmt: cómo convertir valores (duration: 's' => "5s", 'str' => "5"; aspect: 'falsize' => "landscape_16_9")
// price: { usd, per: 's' (por segundo de vídeo) | 'gen' (por generación) | 'img' (por imagen) }
// verified: true = parámetros comprobados en la documentación del proveedor. false = revisa antes de gastar.
export const MODES = {
  v2v: { label: 'Vídeo → Vídeo', icon: '🎬', desc: 'Tu toma del plató, con el estilo que pidas. Mantiene movimiento y cámara.' },
  i2v: { label: 'Imagen → Vídeo', icon: '🖼', desc: 'Anima un fotograma (por ejemplo el primero de tu toma, ya estilizado).' },
  t2v: { label: 'Texto → Vídeo', icon: '✍️', desc: 'Solo con el prompt.' },
  t2i: { label: 'Texto → Imagen', icon: '🎨', desc: 'Fotogramas clave, personajes, fondos.' },
  i2i: { label: 'Imagen → Imagen', icon: '🪄', desc: 'Estiliza un fotograma (ideal: primer fotograma del plató → look final).' },
};
export const DEFAULT_CATALOG = [
  // ---------- fal.ai ----------
  { id: 'fal-kling-o1-edit', provider: 'fal', mode: 'v2v', name: 'Kling O1 Edit', endpoint: 'fal-ai/kling-video/o1/video-to-video/edit', fields: { prompt: 'prompt', video: 'video_url' }, price: { usd: 0.168, per: 's' }, verified: true, note: 'Transforma el vídeo por texto manteniendo movimiento y cámara.' },
  { id: 'fal-luma-modify', provider: 'fal', mode: 'v2v', name: 'Luma Ray 2 Modify', endpoint: 'fal-ai/luma-dream-machine/ray-2/modify', fields: { prompt: 'prompt', video: 'video_url', image: 'image_url' }, price: { usd: 0.35, per: 's' }, verified: true, note: 'Restyle: cambia lugar, ropa, clima. Acepta imagen de estilo.' },
  { id: 'fal-lucy-restyle', provider: 'fal', mode: 'v2v', name: 'Decart Lucy Restyle', endpoint: 'decart/lucy-restyle', fields: { prompt: 'prompt', video: 'video_url', seed: 'seed' }, price: { usd: 0.05, per: 's' }, verified: true, note: 'Restyle rápido y barato, admite vídeos largos. Precio aproximado: revísalo.' },
  { id: 'fal-id-v2v', provider: 'fal', mode: 'v2v', name: 'ID-V2V (Wan VACE)', endpoint: 'fal-ai/id-v2v', fields: { prompt: 'prompt', video: 'video_url' }, price: { usd: 0.08, per: 's' }, verified: true, note: 'Edición manteniendo identidad y movimiento. Precio aproximado.' },
  { id: 'fal-seedance2-i2v', provider: 'fal', mode: 'i2v', name: 'Seedance 2.0', endpoint: 'bytedance/seedance-2.0/image-to-video', fields: { prompt: 'prompt', image: 'image_url', end_image: 'end_image_url', duration: 'duration', resolution: 'resolution', audio: 'generate_audio' }, fmt: { duration: 'str' }, price: { usd: 0.3024, per: 's' }, verified: true, note: 'Admite imagen final. Audio incluido.' },
  { id: 'fal-veo31-i2v', provider: 'fal', mode: 'i2v', name: 'Veo 3.1', endpoint: 'fal-ai/veo3.1/image-to-video', fields: { prompt: 'prompt', image: 'image_url', duration: 'duration', aspect: 'aspect_ratio', resolution: 'resolution', audio: 'generate_audio' }, fmt: { duration: 's' }, price: { usd: 0.2, per: 's' }, verified: true, note: '$0.20/s sin audio, $0.40/s con audio.' },
  { id: 'fal-kling3-i2v', provider: 'fal', mode: 'i2v', name: 'Kling 3.0 Pro', endpoint: 'fal-ai/kling-video/v3/pro/image-to-video', fields: { prompt: 'prompt', image: 'start_image_url', end_image: 'end_image_url', duration: 'duration', negative: 'negative_prompt' }, fmt: { duration: 'str' }, price: { usd: 0.112, per: 's' }, verified: false, note: 'Ruta del endpoint sin confirmar: compruébala en fal.ai.' },
  { id: 'fal-seedance2-t2v', provider: 'fal', mode: 't2v', name: 'Seedance 2.0', endpoint: 'bytedance/seedance-2.0/text-to-video', fields: { prompt: 'prompt', duration: 'duration', aspect: 'aspect_ratio', resolution: 'resolution', audio: 'generate_audio' }, fmt: { duration: 'str' }, price: { usd: 0.3024, per: 's' }, verified: true },
  { id: 'fal-veo31-t2v', provider: 'fal', mode: 't2v', name: 'Veo 3.1', endpoint: 'fal-ai/veo3.1', fields: { prompt: 'prompt', duration: 'duration', aspect: 'aspect_ratio', resolution: 'resolution', audio: 'generate_audio' }, fmt: { duration: 's' }, price: { usd: 0.2, per: 's' }, verified: false },
  { id: 'fal-flux-dev', provider: 'fal', mode: 't2i', name: 'FLUX dev', endpoint: 'fal-ai/flux/dev', fields: { prompt: 'prompt', aspect: 'image_size', seed: 'seed' }, fmt: { aspect: 'falsize' }, price: { usd: 0.025, per: 'img' }, verified: true },
  { id: 'fal-kontext', provider: 'fal', mode: 'i2i', name: 'FLUX Kontext Pro', endpoint: 'fal-ai/flux-pro/kontext', fields: { prompt: 'prompt', image: 'image_url', seed: 'seed' }, price: { usd: 0.04, per: 'img' }, verified: false },
  // ---------- Higgsfield (API de pago por uso) ----------
  { id: 'hf-seedance2-t2v', provider: 'higgsfield', mode: 't2v', name: 'Seedance 2.0', endpoint: 'bytedance/seedance-2.0/text-to-video', fields: { prompt: 'prompt', duration: 'duration', aspect: 'aspect_ratio', resolution: 'resolution', audio: 'generate_audio' }, price: { usd: 0.144, per: 's' }, verified: true, note: 'Precio aproximado según su web.' },
  { id: 'hf-seedance2-i2v', provider: 'higgsfield', mode: 'i2v', name: 'Seedance 2.0', endpoint: 'bytedance/seedance-2.0/image-to-video', fields: { prompt: 'prompt', image: 'image_url', duration: 'duration', aspect: 'aspect_ratio', resolution: 'resolution' }, price: { usd: 0.144, per: 's' }, verified: false },
  { id: 'hf-soul2', provider: 'higgsfield', mode: 't2i', name: 'Soul 2', endpoint: 'higgsfield-ai/soul/v2/standard', fields: { prompt: 'prompt', aspect: 'aspect_ratio' }, price: { usd: 0.0032, per: 'img' }, verified: false },
  // ---------- Ejemplos para completar (Muapi / Replicate) ----------
  { id: 'muapi-example', provider: 'muapi', mode: 'i2v', name: 'Ejemplo Muapi (edítame)', endpoint: 'NOMBRE-DEL-ENDPOINT', fields: { prompt: 'prompt', image: 'image_url', duration: 'duration', aspect: 'aspect_ratio' }, price: { usd: 0.1, per: 's' }, verified: false, disabled: true, note: 'Copia el slug del modelo desde muapi.ai y activa la fila.' },
  { id: 'rep-example', provider: 'replicate', mode: 'i2v', name: 'Ejemplo Replicate (edítame)', endpoint: 'propietario/modelo', fields: { prompt: 'prompt', image: 'start_image', duration: 'duration' }, price: { usd: 0.1, per: 's' }, verified: false, disabled: true, note: 'Pon el modelo como propietario/nombre y activa la fila.' },
];
export const STYLES = [
  ['cine', '🎞 Cine realista', 'photorealistic live-action cinema, shot on 35mm film, natural skin and materials, subtle film grain'],
  ['anime', '🌸 Anime', 'high-end anime film, clean cel shading, painterly backgrounds'],
  ['cartoon', '🧸 Animación 3D', 'stylized 3D animated feature film, soft global illumination, expressive characters'],
  ['clay', '🟠 Plastilina', 'claymation stop-motion, handmade clay textures, tactile miniature set'],
  ['noir', '🕶 Cine negro', 'black-and-white film noir, hard shadows, high contrast, smoky atmosphere'],
  ['cyber', '🌃 Cyberpunk', 'neon-soaked cyberpunk, wet reflective surfaces, volumetric haze'],
  ['docu', '📹 Documental', 'raw handheld documentary footage, available light, realistic'],
  ['game', '🎮 Videojuego', 'AAA video game cinematic, ultra-detailed real-time render'],
  ['vhs', '📼 VHS 90s', '1990s VHS home video, tape noise, soft colors, timestamp-free'],
  ['comic', '💥 Cómic', 'bold comic book art, ink outlines, halftone shading'],
];
