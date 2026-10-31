// Mini-proxy para Plató Studio (Cloudflare Worker, plan gratuito).
// Uso desde la app:  https://TU-WORKER.workers.dev/https://api.higgsfield.ai/...
// Variables (Settings → Variables and Secrets):
//   PROXY_TOKEN   (secreto, obligatorio recomendado): contraseña que la app envía en la cabecera x-proxy-token.
//   ALLOW_ORIGIN  (opcional): origen permitido, p. ej. https://dani3l-gonzal3z.github.io  (por defecto *).
//   ALLOW_HOSTS   (opcional): lista separada por comas de dominios permitidos. Por defecto los de abajo.
const DEFAULT_HOSTS = ['api.higgsfield.ai', 'platform.higgsfield.ai', 'api.muapi.ai', 'api.replicate.com', 'replicate.delivery', 'queue.fal.run', 'rest.alpha.fal.ai', 'fal.media', 'fal.run', 'cloudfront.net', 'storage.googleapis.com', 'amazonaws.com', 'higgsfield.ai', 'muapi.ai'];

export default {
  async fetch(req, env) {
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOW_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': req.headers.get('Access-Control-Request-Headers') || '*',
      'Access-Control-Expose-Headers': '*',
      'Access-Control-Max-Age': '86400',
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (env.PROXY_TOKEN && req.headers.get('x-proxy-token') !== env.PROXY_TOKEN) return new Response('proxy: contraseña incorrecta', { status: 403, headers: cors });
    const self = new URL(req.url);
    const target = req.url.slice(self.origin.length + 1);
    let t; try { t = new URL(target); } catch (e) { return new Response('proxy: destino no válido. Usa /https://dominio/ruta', { status: 400, headers: cors }); }
    if (t.protocol !== 'https:') return new Response('proxy: solo https', { status: 400, headers: cors });
    const hosts = (env.ALLOW_HOSTS ? env.ALLOW_HOSTS.split(',') : DEFAULT_HOSTS).map(s => s.trim()).filter(Boolean);
    if (!hosts.some(h => t.hostname === h || t.hostname.endsWith('.' + h))) return new Response('proxy: dominio no permitido: ' + t.hostname, { status: 403, headers: cors });
    const h = new Headers(req.headers);
    for (const k of ['x-proxy-token', 'origin', 'referer', 'host', 'cf-connecting-ip', 'x-forwarded-for', 'x-real-ip']) h.delete(k);
    const r = await fetch(t.toString(), { method: req.method, headers: h, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'follow' });
    const out = new Response(r.body, r);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
};
