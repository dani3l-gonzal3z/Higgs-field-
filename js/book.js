// 📚 Lectura de libros (EPUB, PDF, TXT/MD) y troceado en capítulos.
function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName]);
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = () => res(window[globalName]); s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.append(s); });
}
const clean = t => t.replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
const HEAD = /^[ \t]*((cap[ií]tulo|chapter|parte|part|libro|book|pr[oó]logo|prologue|ep[ií]logo|epilogue)\b[^\n]{0,80}|[IVXLC]{1,6}\.?\s*$|\d{1,3}\.?\s*$)/gim;
export function splitChapters(text, title = 'Libro') {
  text = clean(text); const marks = []; let m; HEAD.lastIndex = 0;
  while ((m = HEAD.exec(text))) { const line = text.slice(m.index, text.indexOf('\n', m.index) === -1 ? undefined : text.indexOf('\n', m.index)).trim(); if (line.length <= 90) marks.push({ i: m.index, t: line }); }
  let chs = [];
  if (marks.length >= 2) { for (let k = 0; k < marks.length; k++) { const a = marks[k].i, b = k + 1 < marks.length ? marks[k + 1].i : text.length; const body = text.slice(a, b).trim(); if (body.length > 300) chs.push({ title: marks[k].t, text: body }); } if (marks[0].i > 800) chs.unshift({ title: 'Inicio', text: text.slice(0, marks[0].i).trim() }); }
  if (chs.length < 2) { chs = []; const paras = text.split(/\n\n+/); let cur = ''; for (const p of paras) { if ((cur + p).length > 12000 && cur) { chs.push({ title: `Parte ${chs.length + 1}`, text: cur.trim() }); cur = ''; } cur += p + '\n\n'; } if (cur.trim()) chs.push({ title: `Parte ${chs.length + 1}`, text: cur.trim() }); }
  return { title, chapters: chs.map((c, i) => ({ n: i + 1, title: c.title, text: c.text, words: c.text.split(/\s+/).length })) };
}
async function readEpub(file) {
  const JSZip = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js', 'JSZip');
  const zip = await JSZip.loadAsync(file); const xml = s => new DOMParser().parseFromString(s, 'application/xml');
  const cont = xml(await zip.file('META-INF/container.xml').async('string')); const opfPath = cont.querySelector('rootfile').getAttribute('full-path'); const base = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
  const opf = xml(await zip.file(opfPath).async('string')); const title = (opf.querySelector('metadata title') || opf.getElementsByTagName('dc:title')[0] || {}).textContent || file.name.replace(/\.epub$/i, '');
  const man = {}; for (const it of opf.querySelectorAll('manifest item')) man[it.getAttribute('id')] = it.getAttribute('href');
  const chapters = [];
  for (const ref of opf.querySelectorAll('spine itemref')) { const href = man[ref.getAttribute('idref')]; if (!href) continue; const f = zip.file(decodeURIComponent(base + href)) || zip.file(base + href); if (!f) continue;
    const doc = new DOMParser().parseFromString(await f.async('string'), 'text/html'); const h = doc.querySelector('h1,h2,h3'); const text = clean((doc.body ? doc.body.innerText || doc.body.textContent : '') || '');
    if (text.length < 200) continue; chapters.push({ title: (h && h.textContent.trim().slice(0, 90)) || `Capítulo ${chapters.length + 1}`, text }); }
  if (chapters.length < 2) return splitChapters(chapters.map(c => c.text).join('\n\n'), title.trim());
  return { title: title.trim(), chapters: chapters.map((c, i) => ({ n: i + 1, title: c.title, text: c.text, words: c.text.split(/\s+/).length })) };
}
async function readPdf(file, onProgress) {
  const lib = await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js', 'pdfjsLib');
  lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await lib.getDocument({ data: await file.arrayBuffer() }).promise; let out = '';
  for (let i = 1; i <= pdf.numPages; i++) { const pg = await pdf.getPage(i); const tc = await pg.getTextContent(); let last = null, line = '';
    for (const it of tc.items) { const y = it.transform ? Math.round(it.transform[5]) : 0; if (last !== null && Math.abs(y - last) > 2) { out += line.trim() + '\n'; line = ''; } line += it.str + (it.hasEOL ? '\n' : ' '); last = y; }
    out += line.trim() + '\n\n'; onProgress && onProgress(i / pdf.numPages); }
  return splitChapters(out.replace(/-\n(\p{Ll})/gu, '$1'), file.name.replace(/\.pdf$/i, ''));
}
export async function readBook(file, onProgress) {
  const n = file.name.toLowerCase();
  if (n.endsWith('.epub')) return readEpub(file);
  if (n.endsWith('.pdf')) return readPdf(file, onProgress);
  return splitChapters(await file.text(), file.name.replace(/\.(txt|md|markdown)$/i, ''));
}
