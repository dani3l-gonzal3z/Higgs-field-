#!/usr/bin/env python3
"""Puente entre Plató y tu placa (RDK X5, Jetson, Raspberry Pi o un PC).

Plató simula el mundo y el dron; esta placa ve por sus dos cámaras (imágenes que Plató renderiza)
y decide cómo volar. La lógica está en mision.py, en esta misma carpeta.

    python3 plato_bridge.py              # ws://<ip-de-la-placa>:8765   (Plató abierto en http:// o en este ordenador)
    python3 plato_bridge.py --tls        # wss://<ip>:8765 con certificado propio (Plató abierto en https://, p. ej. dentro de Claude)
    python3 plato_bridge.py --ros2       # además publica las cámaras y la telemetría en ROS 2 (ver ros2_bridge.py)

Solo usa la biblioteca estándar de Python (y OpenCV/numpy, que mision.py usa para mirar las imágenes).

Protocolo (WebSocket):
  Plató → placa  texto  {"t":"hola","cam":{w,h,hfov,baseline}}  ·  {"t":"telem",...}  ·  {"t":"orden","texto":"sigue ese pájaro","zona":[[x,y],[x,y]]}
                 binario  byte 0 = 1 cámara izquierda / 2 derecha · bytes 1-4 = número de fotograma (uint32) · resto = JPEG
  placa → Plató  texto  {"t":"cmd",...} · {"t":"gimbal","pitch":-90} · {"t":"despega","alt":12} · {"t":"aterriza"}
                        {"t":"det","boxes":[[u0,v0,u1,v1,"pajaro",0.9]]} · {"t":"estado","texto":"..."}
                 binario  byte 0 = 3 · resto = JPEG (vista previa del mapa que va montando)
"""
import argparse, asyncio, base64, hashlib, json, os, ssl, struct, subprocess, sys, time

GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
AQUI = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, AQUI)


# ── WebSocket mínimo (RFC 6455): lo justo para hablar con el navegador ──
class WS:
    def __init__(self, r, w):
        self.r, self.w, self.closed = r, w, False

    async def recv(self):
        """Devuelve (opcode, datos) de un mensaje completo; None si se cierra."""
        data, op0 = b'', None
        while True:
            h = await self.r.readexactly(2)
            fin, op, masked, ln = h[0] & 0x80, h[0] & 0x0F, h[1] & 0x80, h[1] & 0x7F
            if ln == 126: ln = struct.unpack('>H', await self.r.readexactly(2))[0]
            elif ln == 127: ln = struct.unpack('>Q', await self.r.readexactly(8))[0]
            mask = await self.r.readexactly(4) if masked else b'\0\0\0\0'
            pay = bytearray(await self.r.readexactly(ln))
            for i in range(ln): pay[i] ^= mask[i & 3]
            if op == 8: self.closed = True; return None
            if op == 9: await self.send(bytes(pay), 10); continue
            if op == 10: continue
            if op0 is None: op0 = op
            data += pay
            if fin: return op0, bytes(data)

    async def send(self, data, op=None):
        if self.closed: return
        if isinstance(data, str): data, op = data.encode(), op or 1
        op = op or 2; n = len(data)
        head = bytes([0x80 | op]) + (bytes([n]) if n < 126 else bytes([126]) + struct.pack('>H', n) if n < 65536 else bytes([127]) + struct.pack('>Q', n))
        try:
            self.w.write(head + data); await self.w.drain()
        except (ConnectionError, RuntimeError):
            self.closed = True


async def handshake(r, w):
    req = (await r.readuntil(b'\r\n\r\n')).decode('latin-1')
    hd = {k.strip().lower(): v.strip() for k, v in (l.split(':', 1) for l in req.split('\r\n')[1:] if ':' in l)}
    if 'websocket' not in hd.get('upgrade', '').lower():  # una visita normal (p. ej. para aceptar el certificado)
        body = '<!doctype html><meta charset=utf-8><title>Plató · placa</title><h1>✅ Puente de Plató funcionando</h1><p>Ya puedes volver a Plató y conectar.</p>'.encode()
        w.write(b'HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: %d\r\nConnection: close\r\n\r\n' % len(body) + body); await w.drain(); w.close(); return None
    acc = base64.b64encode(hashlib.sha1((hd['sec-websocket-key'] + GUID).encode()).digest()).decode()
    w.write(('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n' % acc).encode()); await w.drain()
    return WS(r, w)


# ── Una sesión: Plató conectado ──
async def session(ws, args):
    import mision
    m = mision.Mision(log=lambda t: print('  ·', t, flush=True))
    ros = None
    if args.ros2:
        try:
            import ros2_bridge; ros = ros2_bridge.Ros2Bridge(m)
        except Exception as e:
            print('ROS 2 no disponible:', e, flush=True)
    print('Plató conectado', flush=True)
    stop = asyncio.Event()

    async def tick():  # la misión decide 20 veces por segundo
        while not stop.is_set():
            for msg in m.tick():
                if isinstance(msg, (bytes, bytearray)): await ws.send(bytes(msg), 2)
                else: await ws.send(json.dumps(msg))
            if ros: ros.spin_once()
            await asyncio.sleep(0.05)

    t = asyncio.create_task(tick())
    try:
        while True:
            got = await ws.recv()
            if got is None: break
            op, data = got
            if op == 1:
                msg = json.loads(data)
                m.on(msg)
                if ros: ros.on(msg)
            elif op == 2 and data:
                kind, n = data[0], struct.unpack('>I', data[1:5])[0]
                m.on_frame(kind, n, data[5:])
                if ros: ros.on_frame(kind, data[5:])
    except (asyncio.IncompleteReadError, ConnectionError):
        pass
    finally:
        stop.set(); t.cancel(); m.close()
        print('Plató desconectado', flush=True)


def make_tls():
    crt, key = os.path.join(AQUI, 'plato.crt'), os.path.join(AQUI, 'plato.key')
    if not os.path.exists(crt):
        print('Creando un certificado propio (plato.crt/plato.key)…', flush=True)
        subprocess.run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '3650', '-subj', '/CN=plato-placa', '-keyout', key, '-out', crt], check=True, capture_output=True)
    ctx = ssl.create_default_context(ssl.Purpose.CLIENT_AUTH); ctx.load_cert_chain(crt, key); return ctx


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--port', type=int, default=8765); ap.add_argument('--tls', action='store_true'); ap.add_argument('--ros2', action='store_true')
    args = ap.parse_args()
    ctx = make_tls() if args.tls else None

    async def on_client(r, w):
        try:
            ws = await handshake(r, w)
            if ws: await session(ws, args)
        except Exception as e:
            print('error:', e, flush=True)
        finally:
            try: w.close()
            except Exception: pass

    srv = await asyncio.start_server(on_client, '0.0.0.0', args.port, ssl=ctx)
    sch = 'wss' if ctx else 'ws'
    print(f'Puente de Plató escuchando en {sch}://0.0.0.0:{args.port}', flush=True)
    if ctx: print(f'Con https: abre una vez https://<ip-de-la-placa>:{args.port} en el navegador y acepta el certificado.', flush=True)
    async with srv: await srv.serve_forever()


if __name__ == '__main__':
    try: asyncio.run(main())
    except KeyboardInterrupt: pass
