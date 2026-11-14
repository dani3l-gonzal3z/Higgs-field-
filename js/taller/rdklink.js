// Enlace con la placa que pilota el dron (RDK X5, Jetson, Raspberry Pi…) por WebSocket. Al otro lado: drone/rdk/plato_bridge.py.
// Mandamos: {t:'hola'}, telemetría, órdenes en texto y las imágenes de las dos cámaras (JPEG). Recibimos: órdenes de vuelo,
// detecciones para pintar, avisos y una vista previa del mapa que va montando.
export class RdkLink {
  constructor() { this.ws = null; this.onMsg = () => {}; this.onMap = () => {}; this.onClose = () => {}; this.log = () => {}; this.rx = 0; this.tx = 0; this.lastRx = 0; }
  get connected() { return !!this.ws && this.ws.readyState === 1; }
  connect(url, hello) {
    return new Promise((res, rej) => {
      let ws; try { ws = new WebSocket(url); } catch (e) { rej(e); return; } ws.binaryType = 'arraybuffer'; this.ws = ws; let opened = false;
      const to = setTimeout(() => { if (!opened) { try { ws.close(); } catch (e) {} rej(new Error('La placa no contesta en ' + url)); } }, 6000);
      ws.onopen = () => { opened = true; clearTimeout(to); if (hello) this.send(hello); res(); };
      ws.onerror = () => { if (!opened) { clearTimeout(to); rej(new Error(location.protocol === 'https:' && url.startsWith('ws:') ? 'El navegador no deja abrir ws:// desde una página https. Arranca el puente con --tls y usa wss:// (abre antes https://<ip>:8765 y acepta el certificado), o abre Plató con http://.' : 'No se pudo conectar con ' + url)); } };
      ws.onclose = () => { this.onClose(); };
      ws.onmessage = ev => { this.lastRx = performance.now(); this.rx++;
        if (typeof ev.data === 'string') { let m; try { m = JSON.parse(ev.data); } catch (e) { return; } this.onMsg(m); return; }
        const b = new Uint8Array(ev.data); if (b[0] === 3) this.onMap(new Blob([b.subarray(1)], { type: 'image/jpeg' })); };
    });
  }
  send(obj) { if (this.connected) { this.ws.send(JSON.stringify(obj)); this.tx++; } }
  // Una imagen: byte 0 = cámara (1 izquierda, 2 derecha), bytes 1-4 = número de fotograma, resto JPEG. Si la red va atascada, se salta.
  sendFrame(kind, n, jpeg) { if (!this.connected || this.ws.bufferedAmount > 1.5e6) return false; const h = new Uint8Array(5); h[0] = kind; new DataView(h.buffer).setUint32(1, n >>> 0);
    const buf = new Uint8Array(5 + jpeg.byteLength); buf.set(h); buf.set(new Uint8Array(jpeg), 5); this.ws.send(buf); this.tx++; return true; }
  close() { try { this.ws && this.ws.close(); } catch (e) {} this.ws = null; }
}
