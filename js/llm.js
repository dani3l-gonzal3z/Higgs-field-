// Asistente de IA con tu propia clave (Anthropic o cualquier API compatible con OpenAI, p. ej. OpenRouter).
import { getSettings } from './core.js';
export function llmReady(s = getSettings()) { return !!s.llm.key; }
export async function llmText(prompt, { maxTokens = 3000 } = {}) {
  const s = getSettings().llm; if (!s.key) throw new Error('Configura una clave de IA en Ajustes para usar el asistente.');
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
