// Asistente de IA con tu propia clave (Anthropic o cualquier API compatible con OpenAI, p. ej. OpenRouter).
import { getSettings, host } from './core.js';
import { localBase, localCaps } from './local.js';
// Cerebro local (Ollama a través del servidor de Plató): sin clave, sin proveedor, sin salir de tu equipo.
export function localLLM(s = getSettings()) {
  const c = localCaps(), models = (c && c.ai && c.ai.ollama && c.ai.ollama.models) || [], base = localBase();
  if (!base || !models.length) return null;
  const want = s.llm.localModel && models.includes(s.llm.localModel) ? s.llm.localModel : models[0];
  if (s.llm.provider === 'local' || (!s.llm.key && !host.sample)) return { base: base + '/api/ollama/v1', model: want };
  return null;
}
export function llmReady(s = getSettings()) { return (!!s.llm.key && s.llm.provider !== 'local') || !!host.sample || !!localLLM(s); }
const noThink = t => String(t || '').replace(/<think>[\s\S]*?(<\/think>|$)/g, '').trim();
async function localText(lo, prompt, maxTokens, json) {
  const msgs = [...(/^qwen3/.test(lo.model) ? [{ role: 'system', content: '/no_think' }] : []), { role: 'user', content: prompt }];
  const r = await fetch(lo.base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: lo.model, messages: msgs, max_tokens: maxTokens, temperature: 0.6, stream: false, ...(json ? { response_format: { type: 'json_object' } } : {}) }) });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || 'Error del modelo local'); return noThink(j.choices[0].message.content);
}
export async function llmText(prompt, { maxTokens = 3000, json = false } = {}) {
  const s = getSettings().llm; const lo = localLLM();
  if (lo) return localText(lo, prompt, maxTokens, json);
  if (!s.key && host.sample) { const r = await host.sample(prompt, { modelTier: 'default' }); return r.text || ''; }
  if (!s.key) throw new Error('Configura una clave de IA en Ajustes para usar el asistente.');
  if (s.provider === 'anthropic') {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: s.model || 'claude-sonnet-5-5', max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }) });
    const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'Error de la API de IA'); return (j.content || []).map(c => c.text || '').join('');
  }
  const base = (s.base || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const r = await fetch(base + '/chat/completions', { method: 'POST', headers: { Authorization: 'Bearer ' + s.key, 'content-type': 'application/json' }, body: JSON.stringify({ model: s.model, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }) });
  const j = await r.json(); if (!r.ok) throw new Error((j.error && j.error.message) || 'Error de la API de IA'); return j.choices[0].message.content;
}
export async function llmJSON(prompt, o = {}) { const t = await llmText(prompt, { ...o, json: true }); const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); }

// Respuesta en streaming: onText recibe el texto acumulado según llega (para hablar frase a frase).
export async function llmStream(prompt, { onText = () => {}, signal, maxTokens = 1200 } = {}) {
  const s = getSettings().llm; const lo = localLLM();
  if (lo) { const msgs = [...(/^qwen3/.test(lo.model) ? [{ role: 'system', content: '/no_think' }] : []), { role: 'user', content: prompt }];
    const r = await fetch(lo.base + '/chat/completions', { method: 'POST', signal, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: lo.model, messages: msgs, max_tokens: maxTokens, stream: true }) });
    if (!r.ok || !r.body) throw new Error('El modelo local no responde');
    const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', raw = '';
    for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue;
        try { const piece = JSON.parse(d).choices[0].delta.content || ''; if (piece) { raw += piece; onText(noThink(raw)); } } catch (e) {} } }
    return noThink(raw); }
  if (!s.key && host.sample) { let last = ''; const r = await host.sample(prompt, { modelTier: 'default', signal, onText: ({ text }) => { last = text || ''; onText(last); } }); const t = (r && r.text) || last; onText(t); return t; }
  if (!s.key) throw new Error('Configura una clave de IA en Ajustes para usar el asistente.');
  const anth = s.provider === 'anthropic';
  const r = anth ? await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', signal, headers: { 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json', 'anthropic-dangerous-direct-browser-access': 'true' }, body: JSON.stringify({ model: s.model || 'claude-sonnet-5-5', max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] }) })
    : await fetch((s.base || 'https://openrouter.ai/api/v1').replace(/\/+$/, '') + '/chat/completions', { method: 'POST', signal, headers: { Authorization: 'Bearer ' + s.key, 'content-type': 'application/json' }, body: JSON.stringify({ model: s.model, max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] }) });
  if (!r.ok || !r.body) { let m = 'Error de la API de IA'; try { const j = await r.json(); m = (j.error && j.error.message) || m; } catch (e) {} throw new Error(m); }
  const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '', text = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let i;
    while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line.startsWith('data:')) continue; const d = line.slice(5).trim(); if (d === '[DONE]') continue;
      try { const j = JSON.parse(d); const piece = anth ? (j.type === 'content_block_delta' && j.delta && j.delta.text) || '' : (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || ''; if (piece) { text += piece; onText(text); } } catch (e) {} } }
  return text;
}
