#!/usr/bin/env python3
# Voces locales de Plató con Kokoro-82M (ONNX). Funciona sin internet y gratis.
# Necesita: Python 3.9+, numpy, onnxruntime y el programa espeak-ng (para pasar el texto a fonemas).
# Modelo y voces (se descargan con `node mcp/server.mjs --setup-voices`):
#   kokoro-v1.0.int8.onnx y voices-v1.0.bin de https://github.com/thewh1teagle/kokoro-onnx (MIT; el modelo Kokoro-82M es Apache-2.0).
# Protocolo: una petición JSON por línea en stdin -> una respuesta JSON por línea en stdout.
#   {"id":"1","text":"Hola","voice":"ef_dora","speed":1.0,"out":"/ruta/salida.wav"}
#   -> {"id":"1","path":"/ruta/salida.wav","dur":1.2,"words":[{"w":"Hola","s":0.05,"e":0.6}]}
import json, os, re, shutil, subprocess, sys, wave

import numpy as np
import onnxruntime as rt

DIR = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.expanduser('~'), '.plato-studio', 'kokoro')
HERE = os.path.dirname(os.path.abspath(__file__))
SR = 24000
# Primera letra de la voz -> idioma de espeak-ng (a: inglés EE. UU., b: británico, e: español, f: francés, h: hindi, i: italiano, p: portugués de Brasil)
LANG = {'a': 'en-us', 'b': 'en-gb', 'e': 'es', 'f': 'fr-fr', 'h': 'hi', 'i': 'it', 'p': 'pt-br'}
PUNCT = '.,;:!?…'
PAUSE = {',': 3, ';': 4, ':': 4, '.': 7, '!': 7, '?': 7, '…': 8}


def out(o):
    sys.stdout.write(json.dumps(o, ensure_ascii=False) + '\n'); sys.stdout.flush()


def find_espeak():
    env = os.environ.get('PLATO_ESPEAK')
    if env and os.path.exists(env): return env
    for n in ('espeak-ng', 'espeak'):
        p = shutil.which(n)
        if p: return p
    for p in (r'C:\Program Files\eSpeak NG\espeak-ng.exe', r'C:\Program Files (x86)\eSpeak NG\espeak-ng.exe', '/opt/homebrew/bin/espeak-ng', '/usr/local/bin/espeak-ng', '/opt/espeak/bin/espeak-ng'):
        if os.path.exists(p): return p
    return None


ESPEAK = find_espeak()


def phonemize(text, lang):
    """Texto -> fonemas IPA con acento (lo mismo que usó Kokoro al entrenar). Devuelve palabras fonéticas."""
    r = subprocess.run([ESPEAK, '-q', '--ipa', '-v', lang, '--stdin'], input=text, capture_output=True, text=True, encoding='utf-8')
    if r.returncode != 0: raise RuntimeError('espeak-ng: ' + (r.stderr or '').strip()[:200])
    return r.stdout.replace('\n', ' ').split()


def load():
    model = None
    for n in ('kokoro-v1.0.int8.onnx', 'kokoro-v1.0.fp16.onnx', 'kokoro-v1.0.onnx'):
        if os.path.exists(os.path.join(DIR, n)): model = os.path.join(DIR, n); break
    voices = os.path.join(DIR, 'voices-v1.0.bin')
    if not model or not os.path.exists(voices): raise RuntimeError('Faltan el modelo o las voces de Kokoro en ' + DIR + '. Ejecuta: node mcp/server.mjs --setup-voices')
    if not ESPEAK: raise RuntimeError('Falta espeak-ng (apt install espeak-ng · brew install espeak-ng · en Windows el instalador de github.com/espeak-ng/espeak-ng)')
    with open(os.path.join(HERE, 'kokoro_vocab.json'), encoding='utf-8') as f: vocab = json.load(f)
    prov = [p for p in ('CUDAExecutionProvider', 'CoreMLExecutionProvider', 'CPUExecutionProvider') if p in rt.get_available_providers()]
    opts = rt.SessionOptions(); opts.intra_op_num_threads = max(1, (os.cpu_count() or 4) - 1)
    sess = rt.InferenceSession(model, sess_options=opts, providers=prov)
    names = {i.name: i for i in sess.get_inputs()}
    return sess, np.load(voices), vocab, ('input_ids' if 'input_ids' in names else 'tokens')


def segments(text):
    """Trocea en tramos de palabras + su puntuación final, para conservar las pausas."""
    text = re.sub(r'[¡¿«»"“”()\[\]]', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return [(m.group(1).strip(), m.group(2)) for m in re.finditer(r'([^.,;:!?…]+)([.,;:!?…]*)', text) if m.group(1).strip()]


def speak(sess, voices, vocab, tok_name, text, voice, speed):
    if voice not in voices.files: voice = 'ef_dora' if 'ef_dora' in voices.files else voices.files[0]
    lang = LANG.get(voice[0], 'en-us')
    segs = segments(text)
    if not segs: raise RuntimeError('Texto vacío')
    # Agrupa tramos en bloques de menos de ~400 fonemas (el modelo admite 510).
    blocks, cur, n = [], [], 0
    for words, p in segs:
        ph_words = phonemize(words, lang)
        ortho = words.split()
        ph = ' '.join(ph_words) + (p[:1] if p else '')
        if cur and n + len(ph) > 400: blocks.append(cur); cur, n = [], 0
        cur.append((ortho, ph_words, p, ph)); n += len(ph) + 1
    if cur: blocks.append(cur)
    audio_parts, words_out, t0 = [], [], 0.0
    gap = np.zeros(int(SR * 0.12), dtype=np.float32)
    for bl in blocks:
        phon = ' '.join(x[3] for x in bl)
        tokens = [vocab[c] for c in phon if c in vocab][:508]
        if not tokens: continue
        style = voices[voice][len(tokens) - 1]
        a = sess.run(None, {tok_name: np.array([[0, *tokens, 0]], dtype=np.int64), 'style': np.asarray(style, dtype=np.float32), 'speed': np.array([speed], dtype=np.float32)})[0].ravel().astype(np.float32)
        # Tiempos por palabra: proporcionales a los fonemas de cada palabra + pausas de la puntuación, dentro del tramo con voz.
        loud = np.where(np.abs(a) > 0.02)[0]
        s0, s1 = (loud[0] / SR, loud[-1] / SR) if len(loud) else (0, len(a) / SR)
        units = []
        for ortho, ph_words, p, _ in bl:
            weights = [len(w) for w in ph_words] if len(ph_words) == len(ortho) else [max(1, len(w)) for w in ortho]
            for i, w in enumerate(ortho): units.append([w + (p if i == len(ortho) - 1 else ''), weights[i] + 1, PAUSE.get(p[:1], 0) if i == len(ortho) - 1 else 0])
        total = sum(u[1] + u[2] for u in units) or 1
        k = (s1 - s0) / total; t = s0
        for w, wt, pause in units:
            words_out.append({'w': w, 's': round(t0 + t, 3), 'e': round(t0 + t + wt * k, 3)}); t += (wt + pause) * k
        audio_parts += [a, gap]; t0 += (len(a) + len(gap)) / SR
    audio = np.concatenate(audio_parts) if audio_parts else np.zeros(SR // 2, dtype=np.float32)
    return audio, words_out


def write_wav(path, audio):
    pcm = (np.clip(audio, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())


def main():
    try: sess, voices, vocab, tok = load()
    except Exception as e: out({'error': str(e)}); return
    out({'ready': True, 'voices': list(voices.files), 'espeak': ESPEAK})
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try:
            q = json.loads(line)
            audio, words = speak(sess, voices, vocab, tok, str(q.get('text', ''))[:5000], q.get('voice') or 'ef_dora', float(q.get('speed') or 1.0))
            write_wav(q['out'], audio)
            out({'id': q.get('id'), 'path': q['out'], 'dur': round(len(audio) / SR, 3), 'words': words})
        except Exception as e:
            out({'id': (q or {}).get('id') if isinstance(locals().get('q'), dict) else None, 'error': str(e)})


if __name__ == '__main__':
    main()
