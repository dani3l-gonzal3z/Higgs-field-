# 🎬 Plató

**Un estudio-consola para casa: aprende, cuenta historias, juega y crea escenas en 3D, con la IA de tu elección y tus propias claves.** Pagas al proveedor solo lo que generas: sin suscripciones ni créditos que caducan.

Funciona como aplicación propia en tu ordenador o en un aparato conectado a la tele, y también como web instalable (PWA). Tus claves, tu galería, tus juegos y tus proyectos se guardan solo en tu dispositivo.

## Abrirla como aplicación

Necesitas [Node.js 18+](https://nodejs.org) y Chrome, Edge, Chromium o Brave instalados.

| Sistema | Cómo |
|---|---|
| Windows | doble clic en `Plato.cmd` |
| macOS | doble clic en `Plato.command` |
| Linux | `./plato.sh` |

Se abre en su propia ventana (sin barra del navegador), con su propio perfil. Al cerrar la ventana se apaga todo. Añade `--kiosk` para pantalla completa sin bordes (modo tele).

**En un aparato (Jetson, Raspberry Pi o mini-PC con Linux):** `sudo device/install-kiosk.sh` instala lo necesario y hace que Plató arranque solo a pantalla completa al encender.

Con la app abierta así, los móviles de la misma wifi pueden unirse a las partidas escaneando un QR (y solo a eso: el servidor no expone tus claves, ni el MCP, ni el puente a la red).

### Lo que añade el modo aplicación

Abrir Plató como aplicación (o en el aparato) activa tres servicios del propio ordenador:

- **⚡ Exportación rápida con FFmpeg.** El montaje se renderiza más rápido que el tiempo real, sin tener la app delante, con la música bajando sola cuando hablan los personajes y una copia en `~/PlatoStudio/Montajes`. Usa la GPU si hay codificador por hardware (NVENC, VideoToolbox, Quick Sync). Necesita FFmpeg instalado (`sudo apt install ffmpeg` · `brew install ffmpeg` · `winget install ffmpeg`).
- **🗣 Voces gratis sin internet (Kokoro-82M).** Instálalas una vez con `node mcp/server.mjs --setup-voices` (descarga ~120 MB; necesita Python 3 con numpy y onnxruntime y el programa `espeak-ng`). Voces en español (Dora, Álex, Santa), inglés, francés, italiano y portugués. Opcional: voces en línea de Edge (gratis pero no oficiales: pueden dejar de funcionar).
- **🔌 Proxy local.** Higgsfield, Muapi y Replicate funcionan sin montar el mini-proxy de Cloudflare.

El estado de todo esto está en ⚙️ Ajustes → 🏠 Este aparato, donde también puedes probar las voces.

### Subtítulos palabra a palabra

Los subtítulos resaltan la palabra que se está diciendo, en la vista previa y en el vídeo exportado. Con las voces locales o de Edge los tiempos salen de la propia voz; con el resto se estiman por sílabas y pausas.

### Vídeos de stock

Con una clave gratuita de [Pexels](https://www.pexels.com/api/) o [Pixabay](https://pixabay.com/api/docs/) puedes buscar clips reales desde la Galería, el Montaje o cada plano del Director (botón 🎞) y usarlos en vez de generarlos. Cada clip guarda su autor para que puedas citarlo.

## Inicio y guía

La pantalla de inicio tiene cuatro modos grandes —🎓 Aprender (pronto), 🎬 Contar historias, 🎮 Jugar y 🎨 Crear escenas— y debajo el Estudio Pro (Estudio IA, Lab, Galería, Montaje, Personajes). Se maneja con ratón, táctil, flechas del teclado o un mando de consola.

La primera vez que entras en cada parte, una guía te señala lo importante paso a paso; mientras usas el plató van saliendo trucos cuando descubres cosas nuevas, y hay 10 misiones para aprender jugando. El botón **?** repite la guía de la pantalla en la que estés; en Ajustes puedes apagarla o reiniciarla.

## 🎮 Jugar: crea el juego que quieras

Describe cualquier juego —un Monopoly de tu pueblo, carreras en la Luna, un trivial por equipos o algo que no exista— y la IA lo programa en 3D low-poly, **lo prueba sola jugando unas rondas** y, si encuentra fallos, se corrige antes de dártelo. Después puedes mejorarlo hablando («más rápido», «añade trampas»); cada cambio queda como versión y puedes volver atrás.

- Por turnos o en tiempo real, de 1 a 16 jugadores.
- **Móviles como mando**: cada jugador escanea el QR de la tele y en su móvil aparece su mando (botones, cartas, elecciones, joystick). En los juegos con vista propia, el móvil enseña **su cámara en primera persona**.
- Sin móviles también se juega: mandos en la tele, teclado (WASD/flechas) o mando de consola.
- Incluye dos ejemplos: **Ciudad** (tipo Monopoly) y **Pintabolas** (arena de pintura en tiempo real con vista en el móvil).
- El código de los juegos se ejecuta en un entorno aislado (iframe *sandbox* sin acceso a la app ni a tus claves).
- Una IA conectada por MCP también puede crearlos (`games` → `api`, `save`, `play`).

## Qué incluye

| | |
|---|---|
| 🎬 **Plató** (PRO, gratis) | Escena 3D con maniquíes, coches y objetos, órdenes en lenguaje natural, 8 plantillas listas, tomas repetibles al fotograma, línea de tiempo, cámara grabada a mano o con joystick, encuadres de un toque, pases de color, profundidad y normales, y exportación del paquete para cualquier IA de vídeo. |
| 📦 **Stock** | 12 decorados listos (garaje-laboratorio, salón, cocina, oficina, bar, aula, dormitorio, puente de nave, callejón, almacén, pueblo del oeste, plató de entrevista), 24 personajes arquetipo con vestuario básico (científico, detective, superhéroe, astronauta, robot, alien, pirata, mago…) y 26 piezas de atrezo de interior. Guarda tus propios decorados y personajes. |
| 🎥 **Multicámara** | Varias cámaras sobre la misma toma: cobertura automática de un toque, monitor en cuadrícula, realización en directo tocando monitores (o teclas 1-9), realización automática, y grabación de cada cámara o del montaje realizado. |
| 🧠 **Director IA** | Le das una idea, un capítulo o un libro (EPUB, PDF o TXT) y escribe el guion técnico: escenas, planos con cobertura (general, medios, primeros planos, contraplanos), cámara, diálogos, efectos y música. Después **rueda solo** la previz de cada plano en el plató desde distintos ángulos, genera el vídeo final plano a plano, las voces de cada personaje, los efectos de sonido y la música, y monta el capítulo con subtítulos. Botón «Todo automático». |
| 🧪 **Lab** (PREMIUM, clave de Muapi) | Clon de Higgsfield basado en el registro de modelos de [Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI) (MIT): 545 modelos de imagen, vídeo, vídeo→vídeo, lip sync, movimiento y audio (ElevenLabs, MMAudio, Lyria, Suno…) con formularios generados a partir de su esquema y una pestaña 🎥 Cine (cámara, lente, focal, diafragma, movimiento). |
| ✨ **Estudio** (PREMIUM, con tus claves) | Vídeo→vídeo (restyle de tu toma), imagen→vídeo, texto→vídeo, texto→imagen e imagen→imagen. Puedes lanzar varios modelos a la vez para comparar, ves el coste estimado antes de generar, tienes tope de presupuesto mensual y un asistente de IA que mejora los prompts. |
| 🖼 **Galería** | Todo lo generado, con favoritos, comparación A/B sincronizada y la opción de «usar como entrada» para encadenar generaciones. |
| 🎞 **Montaje** | Ordena planos, recórtalos, pon fundidos, un rótulo, música y pistas de audio colocadas en el tiempo (voces, efectos), subtítulos incrustados o en .srt, y exporta el corto final. |
| 👤 **Personajes** | Fichas con descripción e imágenes de referencia para que cada personaje mantenga su identidad entre planos. |
| 🎮 **Jugar** | Crea cualquier juego describiéndolo y juégalo en la tele con los móviles como mando (ver arriba). |
| 🗣 **Voces y montaje** | Voces gratis en el aparato, subtítulos palabra a palabra, exportación rápida con FFmpeg y vídeos de stock (ver «Lo que añade el modo aplicación»). |
| ⚙️ **Ajustes** | Claves, mini-proxy, asistente de IA, presupuesto, historial de gasto (CSV) y catálogo de modelos editable. |

## Usarla desde cualquier IA (MCP)

`mcp/server.mjs` es un servidor MCP sin dependencias (Node 18+) que conecta Claude Desktop, Claude Code, Cursor o cualquier cliente MCP con la app abierta en tu navegador. La IA puede cargar decorados, colocar personajes, coreografiar la acción, mirar la escena (recibe imágenes), montar el rig multicámara, grabar las tomas, dirigir capítulos o libros enteros y generar con tus claves.

**Claude Desktop** (`claude_desktop_config.json`):

```json
{ "mcpServers": { "plato-studio": { "command": "node", "args": ["/ruta/a/Higgs-field-/mcp/server.mjs"] } } }
```

**Claude Code**: `claude mcp add plato-studio -- node /ruta/a/Higgs-field-/mcp/server.mjs`

Después abre la app con `?mcp=7821` (por ejemplo `https://dani3l-gonzal3z.github.io/Higgs-field-/?mcp=7821`) o activa la conexión en ⚙️ Ajustes → IA externa. El servidor también sirve la app en local en `http://localhost:7821`; si tu navegador pone pegas a conectar una web https con localhost, usa esa. La IA también puede pedirlo ella misma con la herramienta `studio_open` (`--headless` la abre en un Chromium oculto si tienes Playwright).

- Tus claves no salen del navegador: el servidor solo hace de puente.
- Gasto: la app aplica tu presupuesto mensual y te pregunta por encima del límite que fijes en Ajustes (por defecto 0,50 $ por orden).
- Los vídeos e imágenes que pide la IA se guardan en `~/PlatoStudio` (cámbialo con `--out`).
- Modo HTTP para clientes remotos: `node mcp/server.mjs --http-only` (endpoint `http://localhost:7821/mcp`, con token `Bearer` guardado en `~/.plato-studio/token`).
- Deja la pestaña visible mientras trabaja: los navegadores pausan las animaciones en segundo plano.

## Publicarla gratis (GitHub Pages)

1. En este repositorio: **Settings → Pages**.
2. *Source*: **Deploy from a branch**. *Branch*: `main` y carpeta `/ (root)`. Pulsa **Save**.
3. En un minuto estará en `https://dani3l-gonzal3z.github.io/Higgs-field-/`.
4. En el móvil, ábrela y elige **Añadir a pantalla de inicio**. Quedará como una app.

## Proveedores

| Proveedor | Cómo se conecta | Clave |
|---|---|---|
| **fal.ai** (recomendado) | Directo desde el navegador. También aloja tus archivos de entrada. | [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) |
| **Higgsfield API** (pago por uso) | A través del mini-proxy o con Plató abierto como aplicación. Credenciales en formato `KEY_ID:KEY_SECRET`. | [console.higgsfield.ai](https://console.higgsfield.ai) |
| **Muapi** | A través del mini-proxy. | [muapi.ai](https://muapi.ai) |
| **Replicate** | A través del mini-proxy. | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) |

Higgsfield, Muapi y Replicate no aceptan llamadas directas desde una web. Para ellos está el **mini-proxy** (`proxy/worker.js`), un Cloudflare Worker gratuito:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Worker**. Ponle nombre y pulsa Deploy.
2. **Edit code** → pega `proxy/worker.js` → **Deploy**.
3. **Settings → Variables and Secrets** → añade el secreto `PROXY_TOKEN` (una contraseña larga). Opcional: `ALLOW_ORIGIN` = `https://dani3l-gonzal3z.github.io`.
4. En la app, **Ajustes → Mini-proxy**: pega la URL del Worker y la contraseña, y pulsa «Probar proxy».

> Higgsfield: la app sube tus imágenes y vídeos con su URL prefirmada (caduca en 1 hora), así que ya no hace falta clave de fal para mandarle entradas. Catálogo ampliado: Kling 3.0 (normal, Pro y Motion Control, que mueve a tus personajes con la toma del plató), Seedance 2.5 (crear y editar), Higgsfield DoP y Soul Cinema. Los precios del catálogo son orientativos: compruébalos en tu consola.

## Catálogo de modelos

Los modelos están en `js/catalog.js` y puedes editarlos desde **Ajustes → Catálogo** sin tocar código. Los que llevan ⚠ no tienen los parámetros verificados en la documentación: pruébalos primero con algo corto. Para añadir un modelo nuevo de cualquier proveedor, copia la plantilla, pon el `endpoint` y traduce los campos (`prompt`, `image`, `video`, `duration`…) a los nombres que use ese modelo.

## Asistente de IA (opcional)

Con una clave de **Anthropic** o de cualquier API **compatible con OpenAI** (por ejemplo OpenRouter), el plató entiende órdenes complejas («dos tipos se pelean y uno sale despedido por la explosión») y el Estudio mejora tus prompts. Sin clave, el plató funciona en modo básico.

## Privacidad y seguridad

- Las claves se guardan en `localStorage` de tu navegador y solo se envían al proveedor o a tu proxy.
- No uses la app con tus claves en un dispositivo compartido.
- El proxy solo reenvía a los dominios de la lista y exige tu contraseña.

## Estructura

```
index.html          carcasa de la app (inicio, navegación, PWA)
plato.html          el plató 3D (three.js)
play.html           mando para el móvil (se une a una partida)
plato.sh · Plato.cmd · Plato.command   abrir como aplicación
device/             arranque automático en un aparato (kiosco)
js/home.js          inicio tipo consola y navegación con mando
js/guide.js         guía, trucos y misiones
js/games.js         Jugar: crear, mejorar y lanzar partidas
js/qr.js            generador de códigos QR
js/local.js         servicios del aparato (FFmpeg, voces, proxy)
js/subs.js          subtítulos palabra a palabra (lienzo y .ass)
js/stock.js         vídeos de stock (Pexels, Pixabay)
js/device.js        tarjeta «Este aparato» en Ajustes
mcp/media.mjs       montaje con FFmpeg y proxy local
mcp/tts.mjs         voces Kokoro (local) y Edge
mcp/tts_kokoro.py   motor de voz Kokoro con onnxruntime
games/kit.js        kit 3D para los juegos (piezas, tableros, cámaras, sonido)
games/runtime.html  entorno aislado donde corre cada juego
games/pad.js        mando universal (tele y móvil)
games/examples/     Ciudad y Pintabolas
vendor/three/       three.js r160 (MIT)
js/core.js          utilidades, ajustes, base de datos local, gasto
js/providers.js     conectores fal / Higgsfield / Muapi / Replicate
js/catalog.js       modelos y estilos por defecto
js/studio.js        generación
js/gallery.js       galería y comparación
js/editor.js        montaje y exportación
js/chars.js         personajes
js/settings.js      ajustes
js/llm.js           asistente de IA con tu clave
js/director.js      Director IA (idea/capítulo/libro → guion → rodaje → generación → montaje)
js/book.js          lectura de EPUB/PDF/TXT y troceado en capítulos
js/lab.js           Lab (clon de Higgsfield)
js/registry.js      registro de modelos y prompts de cámara
js/runner.js        cola de generación compartida
js/mcp.js           puente con el servidor MCP
mcp/server.mjs      servidor MCP (stdio y HTTP) + puente WebSocket + app en local + sala de juegos para móviles
js/vendor/          registro de modelos de Open Generative AI (MIT, ver OGA-LICENSE.txt)
scripts/            script para actualizar ese registro
proxy/worker.js     mini-proxy para Cloudflare
sw.js               uso sin conexión
```

No necesita compilación: son archivos estáticos.

## Créditos

Ideas de montaje y voces inspiradas en [MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MIT). Voces locales con [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) y los archivos ONNX de [kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) (MIT); `mcp/kokoro_vocab.json` procede de ese proyecto. Fonemas con [eSpeak NG](https://github.com/espeak-ng/espeak-ng) (GPL-3.0, se usa como programa aparte, no se incluye).


[three.js](https://threejs.org) r160 (licencia MIT, `vendor/three/LICENSE`).


El registro de modelos del Lab procede de [Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI) (licencia MIT, `js/vendor/OGA-LICENSE.txt`). Para actualizarlo: `node scripts/import-oga-models.mjs <ruta a Open-Generative-AI>/packages/studio/src/models.js`.
