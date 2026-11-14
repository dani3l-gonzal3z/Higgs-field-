# Dron de Plató con tu placa (RDK X5, Jetson, Raspberry Pi o un PC)

Plató simula el mundo, el dron y sus dos cámaras. Tu placa recibe las imágenes por la red, piensa con su procesador y manda las órdenes de vuelo. Es lo mismo que haría montada en un dron de verdad, pero sin riesgo.

```
Plató (navegador)                                    tu placa
  mundo 3D + vuelo del dron  ── imágenes JPEG ─────▶  plato_bridge.py ─▶ mision.py (visión + misiones)
  órdenes en castellano      ── telemetría ENU ────▶        │
                             ◀── órdenes de vuelo ──        └─▶ (opcional) ROS 2: cámaras, odometría, /cmd_vel
                             ◀── detecciones, mapa ─
```

## Puesta en marcha

1. Copia a una carpeta de la placa: `plato_bridge.py`, `mision.py` y, si usas ROS 2, `ros2_bridge.py` (botones «⬇» en Plató → Taller → 🚁 Dron).
2. Necesita Python 3.8 o más nuevo y OpenCV con numpy (`python3 -c "import cv2"`; en la RDK X5 ya vienen; si no: `sudo apt install python3-opencv`). El puente solo usa la biblioteca estándar.
3. Arranca el puente:
   - Plató abierto como aplicación o en `http://`: `python3 plato_bridge.py` → en Plató, «🔌 Mi placa por red», `ws://<ip-de-la-placa>:8765`.
   - Plató abierto en `https://` (por ejemplo dentro de Claude): `python3 plato_bridge.py --tls`. Abre una vez `https://<ip-de-la-placa>:8765` en el navegador, acepta el certificado y conecta a `wss://<ip>:8765`.
4. Dale órdenes en Plató: «despega», «haz un rodeo», «mapea esta zona» (marca antes la zona tocando dos esquinas en el suelo), «sigue ese pájaro», «vuelve a casa», «aterriza».

## Qué hace mision.py

| Misión | Cómo |
|---|---|
| despegar | sube a 12 m (o «despega a 20 metros») |
| rodeo | vuelta completa alrededor del punto del suelo al que mira la cámara, mirando siempre al centro |
| mapear | barrido en pasadas a 25 m con la cámara vertical (25 % de solape); pega cada foto donde cae en el suelo y guarda `mapa.jpg` |
| seguir | busca al pájaro en la imagen y lo persigue: girar para centrarlo, subir o bajar, acercarse según su tamaño; con las dos cámaras mide la distancia a lo que tenga delante y no avanza si está a menos de 8 m |
| casa / aterrizar | vuelve al punto de despegue y baja |

La visión es la parte que más vas a querer cambiar: `detectar_pajaro()` busca manchas rojo-anaranjadas con OpenCV. Si quieres usar la BPU de la RDK (YOLO con `hobot_dnn` o un nodo de TogetherROS), cambia esa función por tu detector: basta con que devuelva la caja del objeto. Ese cambio no está probado aquí.

## Con ROS 2

`python3 plato_bridge.py --ros2` publica `/plato/camara/izquierda/compressed`, `/plato/camara/derecha/compressed` y `/plato/odom`, y escucha `/cmd_vel` (Twist en el marco del dron) y `/plato/orden` (texto). Mientras lleguen `/cmd_vel`, manda ROS; si dejan de llegar durante 1 s, vuelve a mandar `mision.py`. (No probado aquí: depende de tu instalación de ROS 2.)

## Protocolo

En el encabezado de `plato_bridge.py`. Ejes ENU (x este, y norte, z arriba). Si Plató no recibe órdenes durante 1 s, el dron se queda quieto en el aire.
