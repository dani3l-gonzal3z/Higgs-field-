// Subtítulos palabra a palabra: tiempos (reales si la voz los da, estimados si no), dibujo en lienzo y archivo .ass para FFmpeg.
const PAUSE = { ',': 2.5, ';': 3, ':': 3, '.': 5, '!': 5, '?': 5, '…': 6 };

// Separa «Lucía: texto» en quién habla (se muestra sin resaltar) y lo que dice.
export function splitSpeaker(text) { const m = String(text).match(/^([^:\n]{1,24}):\s+([\s\S]+)$/); return m ? { who: m[1], line: m[2] } : { who: '', line: String(text) }; }

// Palabras con su tiempo relativo al inicio del subtítulo: [{ w, s, e }]
export function wordsFor(sub) {
  const { line } = splitSpeaker(sub.text); const tokens = line.split(/\s+/).filter(Boolean); if (!tokens.length) return [];
  const len = Math.max(0.3, (sub.end ?? (sub.start + (sub.len || 2))) - (sub.start ?? 0));
  if (Array.isArray(sub.words) && sub.words.length) { // tiempos de la voz: se emparejan por orden con las palabras escritas
    if (sub.words.length === tokens.length) return tokens.map((w, i) => ({ w, s: sub.words[i].s, e: sub.words[i].e }));
    const k = sub.words.length / tokens.length; return tokens.map((w, i) => { const a = sub.words[Math.min(sub.words.length - 1, Math.floor(i * k))]; return { w, s: a.s, e: a.e }; });
  }
  // Estimación: cada palabra dura según sus letras, y la puntuación añade pausa.
  const u = tokens.map(w => { const p = w.slice(-1); return { w, wt: w.replace(/[^\p{L}\p{N}]/gu, '').length + 1.5, pause: PAUSE[p] || 0 }; });
  const lead = Math.min(0.15, len * 0.05), span = len - lead - Math.min(0.2, len * 0.08); const total = u.reduce((a, x) => a + x.wt + x.pause, 0) || 1; const k = span / total; let t = lead;
  return u.map(x => { const o = { w: x.w, s: +t.toFixed(3), e: +(t + x.wt * k).toFixed(3) }; t += (x.wt + x.pause) * k; return o; });
}
export function activeIndex(words, rel) { let a = -1; for (let i = 0; i < words.length; i++) if (rel >= words[i].s - 0.02) a = i; return a; }

/* ---------- Lienzo (vista previa y exportación en el navegador) ---------- */
export function drawKaraoke(c, W, H, sub, t, { hi = '#ffd23a' } = {}) {
  const words = sub._w || (sub._w = wordsFor(sub)); const { who } = splitSpeaker(sub.text); const act = activeIndex(words, t - sub.start);
  c.save(); const fs = Math.round(H / 22); c.font = `700 ${fs}px system-ui, sans-serif`; c.textBaseline = 'bottom';
  const items = [...(who ? [{ w: who + ':', who: true }] : []), ...words.map((x, i) => ({ w: x.w, i }))]; const sp = c.measureText(' ').width;
  const lines = []; let cur = [], cw = 0; for (const it of items) { const w = c.measureText(it.w).width; if (cur.length && cw + sp + w > W * 0.84) { lines.push({ it: cur, w: cw }); cur = []; cw = 0; } cur.push({ ...it, ww: w }); cw += (cur.length > 1 ? sp : 0) + w; } if (cur.length) lines.push({ it: cur, w: cw });
  const lh = fs * 1.3; let y = H - H * 0.06 - (Math.min(3, lines.length) - 1) * lh;
  for (const L of lines.slice(-3)) { let x = W / 2 - L.w / 2; c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(x - fs * 0.4, y - lh, L.w + fs * 0.8, lh);
    for (const it of L.it) { c.fillStyle = it.who ? '#9ad7ff' : it.i === act ? hi : it.i < act ? '#ffffff' : 'rgba(255,255,255,.82)'; c.fillText(it.w, x, y - fs * 0.12); x += it.ww + sp; } y += lh; }
  c.restore();
}

/* ---------- Archivo .ass (FFmpeg / libass) ---------- */
const at = s => { s = Math.max(0, s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return `${h}:${String(m).padStart(2, '0')}:${x.toFixed(2).padStart(5, '0')}`; };
const esc = s => String(s).replace(/\\/g, '＼').replace(/[{}]/g, m => m === '{' ? '(' : ')').replace(/\r?\n/g, '\\N');
export function buildASS(subs, { W, H, title = '', titleDur = 2, karaoke = true }) {
  const fs = Math.round(H / 22), tfs = Math.round(H / 12);
  const head = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${W}\nPlayResY: ${H}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n`
    + `Style: Sub,Arial,${fs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H66000000,1,0,0,0,100,100,0,0,3,${Math.round(fs * 0.25)},0,2,${Math.round(W * 0.08)},${Math.round(W * 0.08)},${Math.round(H * 0.06)},1\n`
    + `Style: Title,Arial,${tfs},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,0,0,5,40,40,40,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  const ev = []; if (title) ev.push(`Dialogue: 1,${at(0)},${at(titleDur)},Title,,0,0,0,,{\\fad(400,400)}${esc(title)}`);
  const HI = '&H003AD2FF&', WHO = '&H00FFD79A&', WH = '&H00FFFFFF&';
  for (const sb of subs) { const words = wordsFor(sb); const { who } = splitSpeaker(sb.text); const pre = who ? `{\\c${WHO}}${esc(who)}:{\\c${WH}} ` : '';
    if (!karaoke || !words.length) { ev.push(`Dialogue: 0,${at(sb.start)},${at(sb.end)},Sub,,0,0,0,,${pre}${esc(splitSpeaker(sb.text).line)}`); continue; }
    // Un evento por palabra: la frase entera con la palabra que suena en color.
    const cuts = [0, ...words.slice(1).map(w => w.s), sb.end - sb.start];
    for (let i = 0; i < words.length; i++) { const a = sb.start + (i ? cuts[i] : 0), b = sb.start + (i === words.length - 1 ? cuts[cuts.length - 1] : cuts[i + 1]); if (b - a < 0.01) continue;
      ev.push(`Dialogue: 0,${at(a)},${at(b)},Sub,,0,0,0,,${pre}${words.map((w, j) => j === i ? `{\\c${HI}}${esc(w.w)}{\\c${WH}}` : esc(w.w)).join(' ')}`); } }
  return head + ev.join('\n') + '\n';
}
