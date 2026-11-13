# Plató Studio · Guía para IAs (MCP)

Esta guía es para cualquier IA que maneje Plató a través del servidor MCP `plato-studio` (Claude, Cursor, ChatGPT con MCP, un agente propio…). El servidor la sirve entera como recurso `plato://guide` y por partes con la herramienta `guide` (`guide {"topic":"marcas"}`). Cada sección empieza con su id de tema.

## inicio — Empieza aquí

Plató es un estudio de creación que corre en el navegador del usuario: un plató 3D low-poly para previsualizar, un estudio de vídeo con IA (con las claves del propio usuario, pago por uso), un director que convierte ideas o libros en planos, un profesor que da clases con pizarra y 3D, juegos para la tele y una sección de **marcas y anuncios**.

Cómo funciona la conexión: tú → servidor MCP (Node, en el ordenador del usuario) → WebSocket → la pestaña de la app. Sin la pestaña abierta casi nada funciona.

1. Llama a `studio_status` siempre lo primero. Si dice que la app no está conectada, llama a `studio_open` y espera unos segundos.
2. Lee lo que hay antes de crear: `stock_list`, `brand {"action":"list"}`, `learn {"action":"list"}`, `gallery_list`.
3. Trabaja barato primero: el plató 3D, los fotogramas clave y las voces locales son gratis. Generar con IA cuesta dinero.

Reglas de oro:
- **Antes de gastar, di cuánto**: la app tiene presupuesto mensual y pregunta al usuario por encima de su límite de aprobación automática. Si rechaza, no insistas con otro modelo.
- **Comprueba lo que haces**: `scene_view` para ver el plató, `brand {"action":"keyframes"}` para ver un anuncio. No des por bueno un encuadre sin mirarlo.
- **No copies marcas reales**: nombres, logos, mascotas ni eslóganes. Inspírate en la categoría, crea algo original.
- Las operaciones largas pueden devolver `task_id`: recógelas con `task_result`.
- Los archivos que devuelve el servidor se guardan en la carpeta de salida del usuario (`~/PlatoStudio/<fecha>/`); la respuesta trae la ruta.

## flujo — Qué herramienta para qué

| Quiero… | Herramienta |
|---|---|
| Saber si está todo listo | `studio_status` |
| Montar una escena 3D | `stock_load_set`, `scene_dsl` (preciso) o `scene_command` (lenguaje natural) |
| Ver cómo queda | `scene_view` |
| Cámaras | `camera_set` (principal), `cameras_rig` (varias a la vez) |
| Grabar la toma | `take_control` + `take_record` |
| Pasar la previz a imagen real | `models_search` + `generate` con `inputs.video="last_take"` |
| Película o capítulo entero | `director`, `book_load` |
| Marca + anuncio | `brand` |
| IA en el equipo del usuario (modelos, descargas) | `local` |
| Cambiar persona u objeto de un vídeo real, en local | `recast` |
| Clase sobre un tema o documento | `learn` |
| Circuitos con Arduino o Pico | la sección Taller de la app (`#taller`); circuito en formato `diagram.json` de Wokwi |
| Juego para la tele | `games` |
| Voz en off gratis | `speak` |
| Montaje final | `montage` |
| Leer esta guía | `guide` |

## plato — Escenas 3D

El plató entiende órdenes JSON exactas con `scene_dsl` (`{"commands":[…]}`); la referencia completa está en la descripción de la herramienta y en el recurso `plato://dsl`. Unidades en metros, suelo en y=0, heading en grados (0 mira a +z).

Receta típica:
1. `stock_load_set {"set":"garage","cast":[{"archetype":"detective","name":"Ana"}]}`
2. `take_control {"action":"new"}` (borra la acción grabada, conserva el decorado)
3. `scene_dsl` con órdenes de acción y `delay` para coreografiar.
4. `scene_view` → corrige → repite.
5. `take_record {"cameras":"all"}` o `{"program":true}` para el montaje multicámara.

Consejo: `scene_command` es cómodo para esbozar, pero para algo que tiene que quedar bien usa `scene_dsl`.

## camaras — Cámaras y cobertura

- `camera_set` mueve la principal: `mode` (follow, orbit, dolly…), o `frame {"subject":"Ana","size":"medio","angle":"tq"}`. Tamaños: general, conjunto, medio, primer, detalle. Ángulos: front, tq (tres cuartos), side, back, high, low.
- `cameras_rig {"action":"coverage","target":"Ana"}` pone cuatro cámaras sobre la misma toma; `monitor` enseña todas; `auto_cuts` o `cuts` deciden el montaje.
- `take_record {"program":true}` graba el montaje ya cortado.

## director — Proyectos largos

`director` convierte una idea, un capítulo o un libro en escenas con planos, y los rueda en previz, animatic y vídeo final con voces, efectos y música.
- `{"action":"plan","idea":"…"}` deja que lo planifique el LLM de la app.
- `{"action":"create","plan":{…}}` usa tu propio plan (formato en la descripción de la herramienta). Si sabes escribir guion, esto da mejores resultados.
- `{"action":"run","project_id":"…","steps":["previz","animatic"]}` y, cuando el usuario apruebe el gasto, `"final"`, `"sound"`, `"assemble"`.
- `book_load {"path":"~/libro.epub"}` carga un libro y devuelve los capítulos.

## marcas — Marcas y anuncios

Una **marca** es un proyecto con su kit (nombre, eslogan, historia, tono, paleta por roles, tipografías, logotipo, envase y productos) y una campaña con spots, cada uno en tomas de 5 s. El kit se reutiliza en todo: etiquetas 3D, logo SVG, guía de marca, prompts de vídeo.

Acciones de `brand`:
- `list` · `get {"id"}` (todo el kit y la campaña) · `vocabulary` (decorados, cámaras y acciones válidas).
- `create {"brief":"…","name":"opcional"}` — la IA de la app crea marca, productos y primer spot.
- `update {"id","kit":{…}}` fusiona campos del kit; `{"id","shot_patch":{"id":"s3","camera":"orbit","vo":"…"}}` cambia una toma; `{"id","campaign":{…}}` reemplaza la campaña.
- `keyframes {"id","shots":["s1","s2"]}` renderiza fotogramas clave en el plató de anuncios (gratis) y te devuelve las imágenes. **Míralas** antes de proponer gastar.
- `prompts {"id"}` — prompts en inglés para un modelo imagen→vídeo, con el envase y los colores de la marca ya descritos, más la voz en off de cada toma.
- `export {"id"}` — guía de marca (.md) y logotipo (.svg).
- `open {"id","tab":"marca|productos|anuncio|vida"}` — lo enseña en pantalla.

Una toma: `{"id":"s1","title":"…","dur":5,"set":"estudio|color|huerta|cocina|picnic","camera":"dolly_in|crane_up|orbit|push_macro|slide|top_down|hero_low|static","action":"grow|slice|rain_stack|spin_fill|open_burst|lineup|float","flavor":"<id de producto>|all","vo":"voz en off","onscreen":"texto en pantalla","prompt":"English prompt"}`.

Receta de anuncio completo:
1. `brand create` con un brief claro (producto, público, tono, qué lo hace distinto). Nada de marcas reales.
2. `brand get` y revisa: contraste de la paleta, que cada producto tenga un color distinto, que el spot tenga gancho → producto → beneficio → cierre con `lineup`.
3. Ajusta con `brand update`.
4. `brand keyframes` de todas las tomas y míralas. Corrige cámara o acción si algo no se lee.
5. `brand prompts` para tener los prompts definitivos.
6. Dar vida (cuesta): ver tema `dar-vida`. Una toma de prueba primero; el resto cuando el usuario apruebe.
7. Voz en off con `speak` (gratis) y montaje con `montage`.

## dar-vida — Generar vídeo con IA

Hay tres caminos, de más a menos integrado:
1. **Desde la app** (`generate`): usa las claves del usuario guardadas en su navegador. Busca modelo con `models_search {"mode":"i2v"}`; pasa la imagen con `inputs.image` (`gallery:<id>`, `file:/ruta.png` o una URL). La app calcula el coste y pide permiso.
2. **Con el MCP de Higgsfield**, si tú también lo tienes conectado: `generate_image` (still del producto con los colores y el logo) → `jobs_wait` → `generate_video` con `medias:[{"role":"start_image","value":"<id del job de imagen>"}]` → `jobs_wait`. Llama antes a la herramienta con `get_cost:true` para saber los créditos y díselos al usuario. Modelos de buena relación calidad/precio: `seedance_2_0_mini` a 720p para vídeo, `gpt_image_2` a 1k para el still.
3. **Dentro de Claude** (artifact de Plató): la pestaña «Dar vida» de una marca hace el camino 2 por sí sola con la cuenta de Higgsfield del usuario.

Para que el vídeo respete la marca: usa como imagen inicial un still o fotograma clave donde el envase ya tenga los colores y el logo, y el prompt de `brand prompts`. Pide planos cortos (5 s) y sin texto sobreimpreso: el texto lo pone el montaje.

## local — IA en el equipo del usuario

Plató puede funcionar sin claves ni proveedores: descarga modelos abiertos y los corre en el ordenador del usuario. Todo va por packs (`local {"action":"status"}` dice cuáles caben en su equipo y cuánto pesan):

| Pack | Para qué | Equipo |
|---|---|---|
| `ollama` | LLM local: director, profe, marcas y asistente sin claves | cualquiera (mejor con 16 GB de RAM) |
| `comfy` | motor de vídeo (ComfyUI, sin interfaz; Plató lo arranca) | NVIDIA; sin ella solo sirve para máscaras |
| `sam` | máscaras SAM 3.1 (toques o texto) y seguimiento | cualquiera (lento sin gráfica) |
| `personaje` | Wan 2.2 Animate 14B fp8: cambia una persona por un personaje | NVIDIA 16 GB + 32 GB RAM (o 12 + 48) |
| `objeto` | Wan VACE 1.3B: cambia o borra objetos | NVIDIA 8 GB |
| `fluidez` | interpolación FILM (dobla fotogramas) | con `comfy` |
| `audio` | separar voz y música | cualquiera |
| `voz` | Seed-VC: cambiar el timbre de la voz | mejor con gráfica |
| `opencode` / `hermes` | agentes locales conectados al MCP de Plató | con `ollama` |

Reglas: di el tamaño antes de descargar (`personaje` son ~28 GB); si `fits.ok` es falso, explica por qué y no insistas. Las instalaciones son trabajos: `install` → `job` hasta `done`. Para modelos de lenguaje: `models`, `pull {"model":"qwen3:8b"}`.

## recast — Cambiar personas u objetos de un vídeo real (local)

Es el efecto «Genjutsu», pero en la gráfica del usuario y gratis. Solo se regenera la zona de la máscara: se recorta, se genera a buena resolución y se pega con borde suave; fuera de la máscara quedan los píxeles originales. El audio original se copia tal cual (o se cambia la voz con Seed-VC, o se quita).

1. `recast {"action":"new","path":"~/Videos/clip.mp4"}` → `id`.
2. `recast {"action":"segment","id","start":0,"dur":5}` (máx. 20 s) → te devuelve el primer fotograma.
3. `recast {"action":"mask","id","points":[{"x":0.42,"y":0.55}]}` (0-1 sobre esa imagen; `"pos":false` para excluir) o `"text":"man in red shirt"`. Mira la imagen que devuelve: la máscara va en rosa.
4. `recast {"action":"track","id"}` → la sigue por todo el tramo.
5. `recast {"action":"run","id","mode":"personaje","quality":"draft","ref_path":"~/personaje.png","prompt":"..."}`. Modos: `personaje` (necesita imagen), `objeto` (imagen opcional + prompt en inglés), `borrar`. `dry_run:true` prueba recorte y pegado sin IA.
6. `recast {"action":"job","id"}` hasta `done`; el resultado se guarda en la carpeta del usuario. Si el borrador convence, repite con `"quality":"final"`.

Voz: `"voice":{"mode":"convert","voice":"ef_dora"}` (voz de Kokoro como referencia) o `"ref_path"` con 10-20 s de una voz con permiso. Nunca cambies la cara o la voz de una persona real sin su consentimiento.

## aprender — Clases

`learn` da clases en vídeo con un profesor 3D, pizarra, escenas y preguntas.
- `docs` lista el material del usuario; `add_text {"text","title"}` añade material.
- `explain {"topic":"…"}` o `{"doc_id":"…","focus":"…","level":"básico|medio|avanzado"}` prepara y empieza la clase en pantalla.
- `list` clases guardadas (con progreso); `open {"lesson_id","restart":false}` la retoma; `review {"lesson_id"}` hace el repaso de preguntas.
- `ask {"question"}` interrumpe al profesor con una pregunta; devuelve la respuesta.
- `control {"command":"pause|resume|next|prev|repeat|stop"}`.

## juegos — Juegos para la tele

`games {"action":"api"}` devuelve la referencia del Plató Game Kit. Escribe el módulo completo y guárdalo con `save`: la app lo prueba sola y te devuelve los errores para corregir. `play` abre la sala con un QR para que los móviles sean mandos.

## voces — Voz

`speak` genera voz gratis en el ordenador del usuario: `kokoro` (sin conexión; en español `ef_dora`, `em_alex`) o `edge` (en línea; p. ej. `es-ES-ElviraNeural`). Devuelve la ruta, la duración y los tiempos de cada palabra. Para meterla en el montaje usa `file:<ruta>`.

## archivos — Referencias de medios

Donde una herramienta pide un medio puedes pasar:
- `last_take` o `last_take:B` — la última toma grabada (de la cámara B).
- `gallery:<id>` — algo de la galería (lo ves con `gallery_list`).
- `file:/ruta/al/archivo` — un archivo del ordenador del usuario (máx. 300 MB).
- Una URL `https://…`.

## errores — Problemas típicos

- «Plató Studio no está conectado»: `studio_open`, o pide al usuario que abra la app y active el MCP en Ajustes.
- «El plató no responde»: la pestaña está en segundo plano; pide que la deje visible.
- «Superaría tu presupuesto»: no lo rodees; dile al usuario cuánto falta y que lo suba en Ajustes si quiere.
- «El usuario no lo ha aprobado»: para y pregunta qué prefiere.
- Herramienta desconocida en la app: la app está desactualizada; pide recargar.
