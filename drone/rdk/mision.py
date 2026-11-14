"""La cabeza del dron: corre en tu placa (RDK X5, Jetson, Raspberry Pi…) y decide cómo volar.

Recibe de Plató las imágenes de las dos cámaras, la telemetría y tus órdenes en castellano;
devuelve órdenes de vuelo. Cámbialo a tu gusto: el puente (plato_bridge.py) no hay que tocarlo.

Misiones: despegar · rodeo (vuelta alrededor de lo que mira la cámara) · mapear (barrido de una zona
y mosaico del mapa) · seguir (al pájaro, por visión) · casa · aterrizar · esperar.

Ejes ENU como ROS: x este, y norte, z arriba; guiñada en radianes (0 = este, positiva a la izquierda).
"""
import math, re, time, unicodedata

try:
    import cv2, numpy as np
except ImportError:  # sin OpenCV la placa vuela, pero no ve
    cv2 = np = None

CAM = {'w': 640, 'h': 360, 'hfov': 80, 'baseline': 0.06}


def clamp(x, a, b): return max(a, min(b, x))
def wrap(a): return math.atan2(math.sin(a), math.cos(a))


def parse_order(txt):
    s = unicodedata.normalize('NFD', (txt or '').lower()); s = ''.join(c for c in s if unicodedata.category(c) != 'Mn')
    num = re.search(r'(\d+(?:[.,]\d+)?)\s*(m\b|metros)', s); num = float(num.group(1).replace(',', '.')) if num else None
    if re.search(r'aterriz|tierra|baja del todo|posate', s): return {'mision': 'aterrizar'}
    if re.search(r'casa|vuelve|regresa|rtl|vuelta a la base', s): return {'mision': 'casa'}
    if re.search(r'sigue|persigue|seguir|acompana', s): return {'mision': 'seguir'}
    if re.search(r'mapea|mapear|cartograf|barre|escanea|fotografia la zona|ortofoto', s): return {'mision': 'mapear'}
    if re.search(r'rodeo|rodea|orbita|vuelta alrededor|circulo|gira alrededor|da una vuelta', s): return {'mision': 'rodeo', 'radio': num}
    if re.search(r'despeg|arriba|vuela|sube', s): return {'mision': 'despegar', 'alt': num}
    if re.search(r'para|quieto|espera|stop|alto', s): return {'mision': 'esperar'}
    return None


# ── Visión ──
def detectar_pajaro(img):
    """Busca el pájaro (rojo anaranjado) en una imagen BGR. Devuelve dict(box, cx, cy, area) o None.
    Para usar la BPU de la RDK (YOLO con hobot_dnn / TogetherROS), sustituye esta función por tu detector:
    basta con que devuelva la caja del objeto que quieres seguir."""
    if cv2 is None or img is None: return None
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    m = cv2.inRange(hsv, (0, 120, 140), (14, 255, 255)) | cv2.inRange(hsv, (170, 120, 140), (180, 255, 255))
    n, lab, st, cen = cv2.connectedComponentsWithStats(m)
    if n <= 1: return None
    i = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); x, y, w, h, a = st[i]
    if a < 3: return None
    H, W = img.shape[:2]
    return {'box': [int(x), int(y), int(x + w), int(y + h)], 'cx': float(cen[i][0]), 'cy': float(cen[i][1]), 'area': float(a) / (W * H)}


def obstaculo_delante(izq, der, cam):
    """Con las dos cámaras: distancia (m) a lo más cercano en el centro de la imagen, o None. (Estéreo por bloques)"""
    if cv2 is None or izq is None or der is None: return None
    gi, gd = [cv2.resize(cv2.cvtColor(x, cv2.COLOR_BGR2GRAY), (320, 180)) for x in (izq, der)]
    disp = cv2.StereoBM_create(numDisparities=32, blockSize=15).compute(gi, gd).astype(np.float32) / 16.0
    c = disp[60:120, 110:210]; c = c[c > 1]
    if c.size < 50: return None
    fx = (320 / 2) / math.tan(math.radians(cam['hfov'] / 2))
    return fx * cam['baseline'] / float(np.percentile(c, 90))


class Mision:
    def __init__(self, log=print):
        self.log = log; self.cam = dict(CAM); self.T = None; self.m = 'espera'; self.S = {}; self.out = []
        self.izq = self.der = None; self.det = None; self.det_t = -1e9; self.zona = None; self.mapa = None; self.mapa_t = 0; self.n = 0

    def say(self, t):
        self.log(t); self.out.append({'t': 'estado', 'texto': t})

    # ── lo que llega de Plató ──
    def on(self, msg):
        t = msg.get('t')
        if t == 'hola': self.cam.update(msg.get('cam', {})); self.say('Placa lista: ' + ('OpenCV ' + cv2.__version__ if cv2 else 'sin OpenCV (no veré nada)'))
        elif t == 'telem': self.T = msg
        elif t == 'orden': self.order(msg.get('texto', ''), msg.get('zona'))

    def on_frame(self, kind, n, jpeg):
        if cv2 is None: return
        img = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if kind == 1:
            self.izq = img; self.n = n
            d = detectar_pajaro(img)
            if d:
                self.det, self.det_t = d, (self.T or {}).get('time', 0)
                self.out.append({'t': 'det', 'boxes': [d['box'] + ['pajaro', 1.0]]})
            elif self.m == 'seguir':
                self.out.append({'t': 'det', 'boxes': []})
            if self.m == 'mapear' and self.T and self.T.get('gimbal', 0) <= -80:
                yaw = self.T['yaw']; quieto = abs(wrap(yaw - getattr(self, '_yaw_foto', yaw))) < math.radians(3); self._yaw_foto = yaw
                if quieto: self.pegar_en_mapa(img)   # en los giros, la foto saldría torcida: se salta
        elif kind == 2:
            self.der = img

    def order(self, texto, zona=None):
        o = parse_order(texto)
        if zona: self.zona = zona
        if not o: self.say('No entiendo «%s». Prueba: despega, haz un rodeo, mapea la zona, sigue al pájaro, vuelve a casa, aterriza.' % texto); return
        self.m = 'espera' if o['mision'] == 'esperar' else o['mision']; self.S = dict(o)
        if self.m == 'despegar':
            alt = o.get('alt') or 12; self.out += [{'t': 'gimbal', 'pitch': -20}, {'t': 'despega', 'alt': alt}]; self.say('Despegando a %g m' % alt)
        elif self.m == 'aterrizar':
            self.out.append({'t': 'aterriza'}); self.say('Aterrizando')
        elif self.m == 'espera':
            self.say('Quieto en el aire')

    # ── mosaico: cada foto vertical se pega donde cae en el suelo (con la posición del dron) ──
    def pegar_en_mapa(self, img):
        T, z = self.T, self.zona
        if not z or not T: return
        a = (min(z[0][0], z[1][0]) - 10, min(z[0][1], z[1][1]) - 10); b = (max(z[0][0], z[1][0]) + 10, max(z[0][1], z[1][1]) + 10)
        px = 4  # píxeles por metro
        W, H = int((b[0] - a[0]) * px), int((b[1] - a[1]) * px)
        if self.mapa is None or self.mapa.shape[:2] != (H, W): self.mapa = np.zeros((H, W, 3), np.uint8)
        x, y, h = T['pos']; yaw = T['yaw']
        hw = h * math.tan(math.radians(self.cam['hfov'] / 2)); hh = hw * img.shape[0] / img.shape[1]
        f, l = (math.cos(yaw), math.sin(yaw)), (-math.sin(yaw), math.cos(yaw))
        # esquinas de la foto en el suelo: arriba de la imagen = hacia delante; izquierda = a la izquierda del dron
        esq = [(x + f[0] * df + l[0] * dl, y + f[1] * df + l[1] * dl) for df, dl in ((hh, hw), (hh, -hw), (-hh, -hw), (-hh, hw))]
        dst = np.float32([[(ex - a[0]) * px, (b[1] - ey) * px] for ex, ey in esq])
        src = np.float32([[0, 0], [img.shape[1], 0], [img.shape[1], img.shape[0]], [0, img.shape[0]]])
        M = cv2.getPerspectiveTransform(src, dst)
        warp = cv2.warpPerspective(img, M, (W, H)); mask = warp.any(axis=2)
        self.mapa[mask] = warp[mask]

    def guardar_mapa(self):
        if self.mapa is not None and cv2 is not None:
            cv2.imwrite('mapa.jpg', self.mapa); self.log('Mapa guardado en mapa.jpg (%dx%d)' % (self.mapa.shape[1], self.mapa.shape[0]))

    def close(self):
        self.guardar_mapa()

    # ── 20 veces por segundo ──
    def tick(self):
        out, self.out = self.out, []
        T = self.T
        if not T: return out
        x, y, z = T['pos']; yaw = T['yaw']; S = self.S
        def vel(vx, vy, vz, yr): out.append({'t': 'cmd', 'frame': 'enu', 'vx': round(vx, 3), 'vy': round(vy, 3), 'vz': round(vz, 3), 'yaw_rate': round(yr, 3)})
        def ir(tx, ty, tz, vmax=5):
            dx, dy = tx - x, ty - y; d = math.hypot(dx, dy); sp = min(vmax, d * 0.7)
            yr = clamp(wrap(math.atan2(dy, dx) - yaw) * 1.2, -1, 1) if d > 2 else 0
            vel(dx / d * sp if d > 0.05 else 0, dy / d * sp if d > 0.05 else 0, clamp((tz - z) * 0.8, -2.5, 2.5), yr)
            return d < 1.2 and abs(tz - z) < 1

        if self.m == 'despegar':
            if z > (S.get('alt') or 12) - 0.6: self.m = 'espera'; self.say('En el aire a %.0f m. ¿Qué hago?' % z)
        elif self.m == 'espera':
            if T.get('volando'): vel(0, 0, 0, 0)
        elif self.m == 'rodeo':
            if 'c' not in S:
                p = math.radians(T.get('gimbal', -20)); dist = clamp(z / math.tan(-p), 5, 30) if p < -0.1 else 15
                S['c'] = (x + math.cos(yaw) * dist, y + math.sin(yaw) * dist); S['r'] = clamp(S.get('radio') or math.hypot(S['c'][0] - x, S['c'][1] - y), 6, 30)
                S['ang'] = 0; S['last'] = math.atan2(y - S['c'][1], x - S['c'][0]); S['z0'] = z
                out.append({'t': 'gimbal', 'pitch': -round(math.degrees(math.atan2(z, S['r'])))}); self.say('Rodeo de %.0f m de radio' % S['r'])
            dx, dy = x - S['c'][0], y - S['c'][1]; d = math.hypot(dx, dy) or 1; a = math.atan2(dy, dx)
            S['ang'] += abs(wrap(a - S['last'])); S['last'] = a
            sp, kr = 3.5, (S['r'] - d) * 0.8; face = math.atan2(-dy, -dx)
            vel(-dy / d * sp + dx / d * kr, dx / d * sp + dy / d * kr, clamp((S['z0'] - z) * 0.8, -1, 1), clamp(wrap(face - yaw) * 1.5, -1.2, 1.2))
            if S['ang'] > 2 * math.pi: self.m = 'espera'; self.say('Rodeo terminado')
        elif self.m == 'mapear':
            if 'wp' not in S:
                zn = self.zona or [[x - 30, y + 20], [x + 30, y + 60]]; self.zona = zn
                a = (min(zn[0][0], zn[1][0]), min(zn[0][1], zn[1][1])); b = (max(zn[0][0], zn[1][0]), max(zn[0][1], zn[1][1]))
                H = 25; sw = 2 * H * math.tan(math.radians(self.cam['hfov'] / 2)) * 0.75; n = max(1, math.ceil((b[1] - a[1]) / sw)); step = (b[1] - a[1]) / n
                S['wp'] = []
                for k in range(n):
                    yy = a[1] + step * (k + 0.5); row = [(a[0] - 4, yy), (b[0] + 4, yy)]
                    S['wp'] += row[::-1] if k % 2 else row
                S['i'] = 0; S['H'] = H; self.mapa = None
                out.append({'t': 'gimbal', 'pitch': -90}); self.say('Mapeando la zona: %d pasadas a %d m' % (n, H))
            w = S['wp'][S['i']]
            if ir(w[0], w[1], S['H']):
                S['i'] += 1
                if S['i'] >= len(S['wp']): self.m = 'espera'; out.append({'t': 'gimbal', 'pitch': -20}); self.say('Zona mapeada'); self.guardar_mapa()
            if self.mapa is not None and time.time() - self.mapa_t > 1.5 and cv2 is not None:  # vista previa del mapa para Plató
                self.mapa_t = time.time(); ok, jpg = cv2.imencode('.jpg', cv2.resize(self.mapa, (320, int(320 * self.mapa.shape[0] / self.mapa.shape[1]))), [cv2.IMWRITE_JPEG_QUALITY, 70])
                if ok: out.append(b'\x03' + jpg.tobytes())
        elif self.m == 'seguir':
            if not S.get('g'): S['g'] = True; out.append({'t': 'gimbal', 'pitch': -8}); self.say('Buscando al pájaro…')
            age = T['time'] - self.det_t
            if self.det and age < 0.8:   # las imágenes llegan por red: algo de margen
                b = self.det; W, Hh = self.cam['w'], self.cam['h']
                ex, ey = (b['cx'] - W / 2) / (W / 2), (b['cy'] - Hh / 2) / (Hh / 2)
                fwd = clamp(3 + 2000 * (0.004 - b['area']), -3, 11)  # más pequeño = más lejos = más deprisa
                obst = obstaculo_delante(self.izq, self.der, self.cam)
                if obst is not None and obst < 8: fwd = min(fwd, 0)  # algo muy cerca delante: no avanzar
                S['lastV'] = (math.cos(yaw) * fwd, math.sin(yaw) * fwd, clamp(-3 * ey, -3, 3), clamp(-1.4 * ex, -1.4, 1.4)); vel(*S['lastV'])
                if not S.get('lock'): S['lock'] = True; self.say('¡Lo tengo! Siguiéndolo')
            elif S.get('lastV') and age < 2.0:
                vel(*S['lastV'])  # un parpadeo de la detección: sigue como iba
            else:
                vel(0, 0, 0, 0.6)
                if S.get('lock'): S['lock'] = False; self.say('Lo he perdido; buscando…')
        elif self.m == 'casa':
            h = T.get('casa', [0, 0, 0])
            if not S.get('up'): S['up'] = True; self.say('Volviendo a casa'); out.append({'t': 'gimbal', 'pitch': -20})
            if ir(h[0], h[1], max(z, 12), 7): self.m = 'aterrizar'; out.append({'t': 'aterriza'}); self.say('En casa: aterrizando')
        elif self.m == 'aterrizar':
            if not T.get('volando'): self.m = 'espera'; self.say('En tierra')
        return out
