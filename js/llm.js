// Asistente de IA con tu propia clave (Anthropic o cualquier API compatible con OpenAI, p. ej. OpenRouter).
import { getSettings, host } from './core.js';
export function llmReady(s = getSettings()) { return !!s.llm.key || !!host.sample; }
export async function llmText(prompt, { maxTokens = 3000 } = {}) {
  const s = getSettings().llm;
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
export async function llmJSON(prompt, o) { const t = await llmText(prompt, o); const a = t.indexOf('{'), b = t.lastIndexOf('}'); return JSON.parse(t.slice(a, b + 1)); }

// Respuesta en streaming: onText recibe el texto acumulado según llega (para hablar frase a frase).
export async function llmStream(prompt, { onText = () => {}, signal, maxTokens = 1200 } = {}) {
  const s = getSettings().llm;
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
