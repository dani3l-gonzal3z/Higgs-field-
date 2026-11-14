// Editor de código del Taller: colores, números de línea, línea del error, autocompletado con la API de la placa,
// sangría automática, Tab / Mayús+Tab, Ctrl+/ para comentar. Sin dependencias: un <textarea> encima de un <pre> coloreado.
const KW = {
  python: new Set('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield'.split(' ')),
  cpp: new Set('auto bool break case char class const continue default delete do double else enum extern float for goto if inline int long namespace new private protected public return short signed sizeof static struct switch template this typedef union unsigned using virtual void volatile while byte boolean word uint8_t uint16_t uint32_t int8_t int16_t int32_t String true false nullptr'.split(' ')),
};
const BUILTIN = {
  python: new Set('print range len int float str bool list dict tuple set abs min max round sum enumerate zip map filter isinstance type open sorted reversed any all hex bin ord chr super object Exception ValueError KeyboardInterrupt self'.split(' ')),
  cpp: new Set('setup loop pinMode digitalWrite digitalRead analogRead analogWrite delay delayMicroseconds millis micros Serial tone noTone pulseIn map constrain HIGH LOW INPUT OUTPUT INPUT_PULLUP LED_BUILTIN A0 A1 A2 A3 A4 A5 Wire'.split(' ')),
};
const esc = s => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// Coloreado por expresiones regulares (suficiente y rápido para programas de microcontrolador)
export function highlight(src, lang) {
  const kw = KW[lang] || KW.python, bi = BUILTIN[lang] || BUILTIN.python; const py = lang !== 'cpp';
  const re = py ? /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rbfRBF]?"(?:\\.|[^"\\\n])*"?|[rbfRBF]?'(?:\\.|[^'\\\n])*'?)|(\b0[xXbB][\da-fA-F_]+\b|\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|(@\w+)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/g
    : /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?)|(\b0[xXbB][\da-fA-F]+\b|\b\d+\.?\d*[fFuUlL]*\b)|(#\s*\w+)|([A-Za-z_]\w*)(?=\s*\()|([A-Za-z_]\w*)/g;
  let out = '', last = 0, m;
  while ((m = re.exec(src))) {
    out += esc(src.slice(last, m.index)); last = re.lastIndex; const t = m[0];
    if (m[1]) out += `<span class="tc">${esc(t)}</span>`; else if (m[2]) out += `<span class="ts">${esc(t)}</span>`; else if (m[3]) out += `<span class="tn">${esc(t)}</span>`;
    else if (m[4]) out += `<span class="td">${esc(t)}</span>`;
    else if (m[5]) out += kw.has(t) ? `<span class="tk">${t}</span>` : bi.has(t) ? `<span class="tb">${t}</span>` : `<span class="tf">${t}</span>`;
    else out += kw.has(t) ? `<span class="tk">${t}</span>` : bi.has(t) ? `<span class="tb">${t}</span>` : /^[A-Z][A-Z0-9_]+$/.test(t) ? `<span class="tu">${t}</span>` : t;
  }
  return out + esc(src.slice(last)) + '\n';
}

// completions: [{ label: 'time.sleep_ms', detail: 'espera en ms', insert?: 'time.sleep_ms()' }]
export function codeEditor({ value = '', lang = 'python', onChange = () => {}, completions = [] } = {}) {
  const root = document.createElement('div'); root.className = 'ce';
  root.innerHTML = '<div class="ce-g"></div><div class="ce-s"><pre class="ce-h" aria-hidden="true"></pre><div class="ce-err"></div><textarea class="ce-t" spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off"></textarea></div><div class="ce-ac" hidden></div><div class="ce-tip" hidden></div>';
  const g = root.querySelector('.ce-g'), sc = root.querySelector('.ce-s'), pre = root.querySelector('.ce-h'), ta = root.querySelector('.ce-t'), ac = root.querySelector('.ce-ac'), errBar = root.querySelector('.ce-err'), tip = root.querySelector('.ce-tip');
  let comps = completions, errLine = 0, raf = 0; const ind = lang === 'cpp' ? '  ' : '    ';
  ta.value = value;
  const paint = () => { raf = 0; pre.innerHTML = highlight(ta.value, lang); const n = ta.value.split('\n').length; if (g.childElementCount !== n) g.innerHTML = Array.from({ length: n }, (_, i) => `<span${i + 1 === errLine ? ' class="e"' : ''}>${i + 1}</span>`).join(''); placeErr(); };
  const lh = () => parseFloat(getComputedStyle(ta).lineHeight) || 18;
  const placeErr = () => { errBar.hidden = !errLine; if (errLine) errBar.style.top = (8 + (errLine - 1) * lh()) + 'px'; for (const s of g.children) s.classList.toggle('e', +s.textContent === errLine); };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(paint); };
  const sync = () => { pre.style.transform = `translate(${-ta.scrollLeft}px,${-ta.scrollTop}px)`; errBar.style.transform = `translateY(${-ta.scrollTop}px)`; g.style.transform = `translateY(${-ta.scrollTop}px)`; hideAc(); };
  ta.addEventListener('scroll', sync);
  ta.addEventListener('input', () => { if (errLine) { errLine = 0; tip.hidden = true; } schedule(); onChange(ta.value); maybeAc(); });
  // ---- autocompletado
  let items = [], pick = 0, from = 0;
  const hideAc = () => { ac.hidden = true; items = []; };
  const wordBefore = () => { const s = ta.selectionStart; const m = /[A-Za-z_][\w.]*$/.exec(ta.value.slice(Math.max(0, s - 60), s)); return m ? m[0] : ''; };
  function maybeAc(force) {
    const w = wordBefore(); if (!force && w.length < 2 && !w.endsWith('.')) return hideAc();
    const low = w.toLowerCase(); const seen = new Set();
    const docWords = [...new Set(ta.value.match(/\b[A-Za-z_]\w{2,}\b/g) || [])].map(x => ({ label: x, detail: '' }));
    items = [...comps, ...docWords].filter(c => { const l = c.label.toLowerCase(); if (seen.has(c.label) || c.label === w) return false; const ok = l.startsWith(low) || (low.includes('.') ? false : l.split('.').pop().startsWith(low) && low.length > 2); if (ok) seen.add(c.label); return ok; }).slice(0, 9);
    if (!items.length) return hideAc(); from = ta.selectionStart - w.length; pick = 0; drawAc();
  }
  function drawAc() {
    ac.innerHTML = items.map((c, i) => `<div class="${i === pick ? 'on' : ''}" data-i="${i}"><b>${esc(c.label)}</b>${c.detail ? `<small>${esc(c.detail)}</small>` : ''}</div>`).join('');
    const pos = caretXY(from); ac.style.left = Math.min(pos.x, root.clientWidth - 230) + 'px'; ac.style.top = (pos.y + lh() + 2) + 'px'; ac.hidden = false;
  }
  function accept(i = pick) { const c = items[i]; if (!c) return; const ins = c.insert || c.label; const s = ta.selectionStart; ta.setRangeText(ins, from, s, 'end'); if (ins.endsWith('()')) ta.selectionStart = ta.selectionEnd = ta.selectionStart - 1; hideAc(); schedule(); onChange(ta.value); ta.focus(); }
  ac.addEventListener('pointerdown', e => { const d = e.target.closest('[data-i]'); if (d) { e.preventDefault(); accept(+d.dataset.i); } });
  let cw = 0; const charW = () => { if (cw) return cw; const sp = document.createElement('span'); sp.textContent = 'x'.repeat(40); sp.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit'; pre.appendChild(sp); cw = sp.getBoundingClientRect().width / 40 || 7.2; sp.remove(); return cw; };
  function caretXY(i) { const before = ta.value.slice(0, i); const line = before.split('\n').length - 1; const col = before.length - before.lastIndexOf('\n') - 1; return { x: g.offsetWidth + 10 + col * charW() - ta.scrollLeft, y: 8 + line * lh() - ta.scrollTop }; }
  // ---- teclas
  ta.addEventListener('keydown', e => {
    if (!ac.hidden) {
      if (e.key === 'ArrowDown') { e.preventDefault(); pick = (pick + 1) % items.length; return drawAc(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); pick = (pick + items.length - 1) % items.length; return drawAc(); }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); return accept(); }
      if (e.key === 'Escape') { e.preventDefault(); return hideAc(); }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ' ') { e.preventDefault(); return maybeAc(true); }
    const v = ta.value, s = ta.selectionStart, en = ta.selectionEnd;
    const lineStart = v.lastIndexOf('\n', s - 1) + 1;
    if (e.key === 'Tab') { e.preventDefault();
      if (s === en && !e.shiftKey) { ta.setRangeText(ind, s, en, 'end'); }
      else { const ls = lineStart, le = v.indexOf('\n', en - (en > s && v[en - 1] === '\n' ? 1 : 0)); const end = le < 0 ? v.length : le; const block = v.slice(ls, end).split('\n');
        const nb = block.map(l => e.shiftKey ? l.replace(new RegExp('^( {1,' + ind.length + '}|\\t)'), '') : ind + l).join('\n'); ta.setRangeText(nb, ls, end, 'select'); }
      schedule(); onChange(ta.value); return; }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const line = v.slice(lineStart, s); let pad = /^\s*/.exec(line)[0];
      const t = line.trimEnd(); if ((lang !== 'cpp' && t.endsWith(':')) || (lang === 'cpp' && t.endsWith('{'))) pad += ind;
      if (lang === 'cpp' && v[s] === '}') { ta.setRangeText('\n' + pad + '\n' + pad.slice(ind.length), s, en, 'start'); ta.selectionStart = ta.selectionEnd = s + 1 + pad.length; }
      else if (lang !== 'cpp' && /^\s*(return|pass|break|continue|raise)\b/.test(line)) ta.setRangeText('\n' + pad.slice(ind.length), s, en, 'end');
      else ta.setRangeText('\n' + pad, s, en, 'end');
      schedule(); onChange(ta.value); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); const cm = lang === 'cpp' ? '// ' : '# ';
      const le = v.indexOf('\n', en); const end = le < 0 ? v.length : le; const lines = v.slice(lineStart, end).split('\n'); const all = lines.every(l => !l.trim() || l.trimStart().startsWith(cm.trim()));
      ta.setRangeText(lines.map(l => !l.trim() ? l : all ? l.replace(new RegExp('^(\\s*)' + cm.trim().replace(/\//g, '\\/') + ' ?'), '$1') : l.replace(/^(\s*)/, '$1' + cm)).join('\n'), lineStart, end, 'select'); schedule(); onChange(ta.value); return; }
    const pairs = { '(': ')', '[': ']', '{': '}', '"': '"', "'": "'" };
    if (pairs[e.key] && s !== en) { e.preventDefault(); ta.setRangeText(e.key + v.slice(s, en) + pairs[e.key], s, en, 'end'); schedule(); onChange(ta.value); return; }
    if (')]}'.includes(e.key) && v[s] === e.key && s === en) { e.preventDefault(); ta.selectionStart = ta.selectionEnd = s + 1; }
  });
  ta.addEventListener('blur', () => setTimeout(hideAc, 150));
  new ResizeObserver(() => { cw = 0; }).observe(root);
  paint();
  return {
    el: root, ta,
    get value() { return ta.value; }, set value(v) { ta.value = v; errLine = 0; tip.hidden = true; paint(); },
    setCompletions(c) { comps = c; },
    // Marca la línea del error y la enseña
    markError(line, msg) { errLine = line || 0; paint(); if (!line) { tip.hidden = true; return; } ta.scrollTop = Math.max(0, (line - 4) * lh()); sync(); if (msg) { tip.textContent = msg; tip.hidden = false; tip.style.top = (8 + line * lh() - ta.scrollTop + 2) + 'px'; } },
    // Marca la línea que se está ejecutando (paso a paso)
    focus() { ta.focus(); },
  };
}

/* ---------- Qué se puede autocompletar en cada placa ---------- */
const C = (label, detail, insert) => ({ label, detail, insert });
const MPY = [C('from machine import Pin', 'importa Pin'), C('import time', ''), C('Pin', 'pin digital', 'Pin()'), C('Pin.OUT', 'salida'), C('Pin.IN', 'entrada'), C('Pin.PULL_UP', 'resistencia a +'), C('Pin.PULL_DOWN', 'resistencia a GND'), C('Pin.IRQ_RISING', 'flanco de subida'), C('Pin.IRQ_FALLING', 'flanco de bajada'),
  C('value', 'lee o escribe 0/1', 'value()'), C('on', 'pone a 1', 'on()'), C('off', 'pone a 0', 'off()'), C('toggle', 'invierte', 'toggle()'), C('irq', 'interrupción', 'irq(handler=, trigger=)'),
  C('ADC', 'entrada analógica', 'ADC()'), C('read_u16', '0 … 65535', 'read_u16()'), C('PWM', 'salida PWM', 'PWM()'), C('freq', 'frecuencia (Hz)', 'freq()'), C('duty_u16', 'ciclo 0 … 65535', 'duty_u16()'), C('duty_ns', 'pulso en ns', 'duty_ns()'),
  C('time.sleep', 'segundos', 'time.sleep()'), C('time.sleep_ms', 'milisegundos', 'time.sleep_ms()'), C('time.sleep_us', 'microsegundos', 'time.sleep_us()'), C('time.ticks_ms', 'ms desde el arranque', 'time.ticks_ms()'), C('time.ticks_us', 'µs desde el arranque', 'time.ticks_us()'), C('time.ticks_diff', 'resta de ticks', 'time.ticks_diff()'),
  C('time_pulse_us', 'mide un pulso', 'time_pulse_us()'), C('I2C', 'bus I2C', 'I2C()'), C('SoftI2C', 'I2C por software', 'SoftI2C()'), C('scan', 'busca direcciones I2C', 'scan()'), C('writeto', 'escribe en I2C', 'writeto()'), C('readfrom', 'lee de I2C', 'readfrom()'), C('readfrom_mem', 'lee registro', 'readfrom_mem()'), C('writeto_mem', 'escribe registro', 'writeto_mem()'),
  C('Timer', 'temporizador', 'Timer()'), C('Timer.PERIODIC', ''), C('Timer.ONE_SHOT', ''), C('while True:', 'bucle infinito'), C('neopixel.NeoPixel', 'tira de LEDs', 'neopixel.NeoPixel()'), C('ssd1306.SSD1306_I2C', 'pantalla OLED', 'ssd1306.SSD1306_I2C(128, 64, i2c)'), C('fill', 'rellena', 'fill()'), C('text', 'escribe texto', 'text()'), C('show', 'refresca la pantalla', 'show()'), C('pixel', 'un punto', 'pixel()'), C('rect', 'rectángulo', 'rect()'), C('fill_rect', 'rectángulo relleno', 'fill_rect()'), C('line', 'línea', 'line()')];
const ESP = [C('ADC.ATTN_11DB', 'rango 0-3,3 V'), C('read', '0 … 4095', 'read()'), C('atten', 'atenuación', 'atten()'), C('width', 'bits', 'width()'), C('duty', '0 … 1023', 'duty()'), C('import neopixel', ''), C('import network', ''), C('network.WLAN', 'WiFi', 'network.WLAN(network.STA_IF)')];
const STM = [C('import pyb', ''), C('pyb.LED', 'LED de la placa', 'pyb.LED()'), C('pyb.Switch', 'botón USR', 'pyb.Switch()'), C('pyb.Timer', 'temporizador', 'pyb.Timer()'), C('pyb.Timer.PWM', 'modo PWM'), C('channel', 'canal del temporizador', 'channel()'), C('pulse_width_percent', '0 … 100', 'pulse_width_percent()'), C('pyb.delay', 'ms', 'pyb.delay()'), C('pyb.udelay', 'µs', 'pyb.udelay()'), C('pyb.millis', 'ms desde el arranque', 'pyb.millis()'), C('pyb.ADC', 'analógica', 'pyb.ADC()'), C('pyb.Servo', 'servo', 'pyb.Servo()'), C('high', 'pone a 1', 'high()'), C('low', 'pone a 0', 'low()'), C('Pin.OUT_PP', 'salida push-pull')];
const GPIO = lib => [C(`import ${lib} as GPIO`, ''), C('GPIO.setmode', 'BOARD o BCM', 'GPIO.setmode()'), C('GPIO.BOARD', 'numeración física'), C('GPIO.BCM', 'numeración BCM'), C('GPIO.setup', 'configura un pin', 'GPIO.setup()'), C('GPIO.OUT', ''), C('GPIO.IN', ''), C('GPIO.output', 'escribe', 'GPIO.output()'), C('GPIO.input', 'lee', 'GPIO.input()'), C('GPIO.HIGH', ''), C('GPIO.LOW', ''), C('GPIO.PUD_UP', 'pull-up'), C('GPIO.PUD_DOWN', 'pull-down'), C('pull_up_down', '', 'pull_up_down=GPIO.PUD_UP'), C('GPIO.PWM', 'PWM', 'GPIO.PWM()'), C('start', 'arranca el PWM', 'start()'), C('ChangeDutyCycle', '0 … 100', 'ChangeDutyCycle()'), C('ChangeFrequency', 'Hz', 'ChangeFrequency()'), C('GPIO.cleanup', 'libera los pines', 'GPIO.cleanup()'), C('GPIO.add_event_detect', 'interrupción', 'GPIO.add_event_detect()'), C('GPIO.RISING', ''), C('GPIO.FALLING', ''), C('GPIO.BOTH', ''), C('GPIO.wait_for_edge', '', 'GPIO.wait_for_edge()'), C('time.sleep', 'segundos', 'time.sleep()')];
const ZERO = [C('from gpiozero import LED, Button', ''), C('LED', 'LED (BCM)', 'LED()'), C('PWMLED', 'LED con brillo', 'PWMLED()'), C('Button', 'botón (BCM)', 'Button()'), C('Servo', 'servo -1 … 1', 'Servo()'), C('AngularServo', 'servo en grados', 'AngularServo()'), C('DistanceSensor', 'HC-SR04', 'DistanceSensor(echo=, trigger=)'), C('TonalBuzzer', 'zumbador', 'TonalBuzzer()'), C('when_pressed', 'al pulsar'), C('when_released', 'al soltar'), C('is_pressed', ''), C('blink', 'parpadea', 'blink()'), C('from signal import pause', ''), C('pause', 'espera para siempre', 'pause()')];
const WPI = [C('import wiringpi as wp', ''), C('wp.wiringPiSetupPhys', 'numeración física', 'wp.wiringPiSetupPhys()'), C('wp.pinMode', '', 'wp.pinMode()'), C('wp.OUTPUT', ''), C('wp.INPUT', ''), C('wp.digitalWrite', '', 'wp.digitalWrite()'), C('wp.digitalRead', '', 'wp.digitalRead()'), C('wp.delay', 'ms', 'wp.delay()'), C('wp.softPwmCreate', '', 'wp.softPwmCreate()'), C('wp.softPwmWrite', '', 'wp.softPwmWrite()'), C('wp.softToneCreate', '', 'wp.softToneCreate()'), C('wp.softToneWrite', '', 'wp.softToneWrite()'), C('wp.pullUpDnControl', '', 'wp.pullUpDnControl()'), C('wp.PUD_UP', '')];
const CPP = [C('pinMode', 'configura un pin', 'pinMode()'), C('digitalWrite', 'escribe HIGH/LOW', 'digitalWrite()'), C('digitalRead', 'lee', 'digitalRead()'), C('analogRead', '0 … 1023', 'analogRead()'), C('analogWrite', 'PWM 0 … 255', 'analogWrite()'), C('delay', 'ms', 'delay()'), C('delayMicroseconds', 'µs', 'delayMicroseconds()'), C('millis', 'ms desde el arranque', 'millis()'), C('micros', 'µs', 'micros()'),
  C('Serial.begin', 'abre el puerto serie', 'Serial.begin(9600)'), C('Serial.println', '', 'Serial.println()'), C('Serial.print', '', 'Serial.print()'), C('Serial.available', '', 'Serial.available()'), C('Serial.read', '', 'Serial.read()'), C('OUTPUT', ''), C('INPUT', ''), C('INPUT_PULLUP', ''), C('HIGH', ''), C('LOW', ''), C('LED_BUILTIN', 'LED de la placa'),
  C('tone', 'suena una nota', 'tone()'), C('noTone', '', 'noTone()'), C('pulseIn', 'mide un pulso', 'pulseIn()'), C('map', 'cambia de escala', 'map()'), C('constrain', '', 'constrain()'), C('#include <Servo.h>', ''), C('#include <LiquidCrystal.h>', ''), C('#include <Wire.h>', ''), C('#include <Adafruit_SSD1306.h>', ''), C('#include <Adafruit_NeoPixel.h>', ''), C('attach', '', 'attach()'), C('write', '', 'write()'), C('Wire.begin', '', 'Wire.begin()'), C('Wire.beginTransmission', '', 'Wire.beginTransmission()'), C('Wire.write', '', 'Wire.write()'), C('Wire.endTransmission', '', 'Wire.endTransmission()'), C('Wire.requestFrom', '', 'Wire.requestFrom()'), C('Wire.read', '', 'Wire.read()'), C('void setup() {', ''), C('void loop() {', '')];
export function completionsFor(b, pins = []) {
  let list = b.lang === 'cpp' ? CPP : b.flavor === 'linux' ? (b.lib === 'gpiozero' ? ZERO : b.lib === 'wiringpi' ? WPI : GPIO(b.lib)) : b.flavor === 'stm32' ? [...MPY, ...STM] : b.flavor === 'esp32' ? [...MPY, ...ESP] : MPY;
  return [...list, ...pins.map(p => C(p.code, p.label))];
}
