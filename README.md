# 🎬 Plató Studio

**Previsualiza tu escena en 3D, dirige la acción y la cámara, y genera el vídeo final con IA usando tus propias claves.** Pagas al proveedor solo lo que generas: sin suscripciones ni créditos que caducan.

Es una app web instalable en el móvil (PWA). Todo funciona en tu navegador: tus claves, tu galería y tus proyectos se guardan solo en tu dispositivo.

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
| **Higgsfield API** (pago por uso) | A través del mini-proxy. Credenciales en formato `KEY_ID:KEY_SECRET`. | [console.higgsfield.ai](https://console.higgsfield.ai) |
| **Muapi** | A través del mini-proxy. | [muapi.ai](https://muapi.ai) |
| **Replicate** | A través del mini-proxy. | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) |

Higgsfield, Muapi y Replicate no aceptan llamadas directas desde una web. Para ellos está el **mini-proxy** (`proxy/worker.js`), un Cloudflare Worker gratuito:

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages → Create → Worker**. Ponle nombre y pulsa Deploy.
2. **Edit code** → pega `proxy/worker.js` → **Deploy**.
3. **Settings → Variables and Secrets** → añade el secreto `PROXY_TOKEN` (una contraseña larga). Opcional: `ALLOW_ORIGIN` = `https://dani3l-gonzal3z.github.io`.
4. En la app, **Ajustes → Mini-proxy**: pega la URL del Worker y la contraseña, y pulsa «Probar proxy».

> ⚠️ Higgsfield no da una forma de subir archivos desde su API pública. Para mandarle imágenes o vídeos de entrada, la app los aloja en fal.ai, así que conviene tener también una clave de fal.

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
index.html          carcasa de la app (navegación, PWA)
plato.html          el plató 3D (three.js)
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
mcp/server.mjs      servidor MCP (stdio y HTTP) + puente WebSocket + app en local
js/vendor/          registro de modelos de Open Generative AI (MIT, ver OGA-LICENSE.txt)
scripts/            script para actualizar ese registro
proxy/worker.js     mini-proxy para Cloudflare
sw.js               uso sin conexión
```

No necesita compilación: son archivos estáticos.

## Créditos

El registro de modelos del Lab procede de [Open Generative AI](https://github.com/Anil-matcha/Open-Generative-AI) (licencia MIT, `js/vendor/OGA-LICENSE.txt`). Para actualizarlo: `node scripts/import-oga-models.mjs <ruta a Open-Generative-AI>/packages/studio/src/models.js`.
