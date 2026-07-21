# CLAUDE.md — contexto para Claude Code

Lee esto antes de tocar nada. Aquí está el *porqué* de las decisiones raras, que
es justo lo que no se deduce del código.

## Qué es

Sitio de presentación de HONEY (DJ, CDMX). Un solo cliente, sin backend.
`npm run build` produce `dist/honey-dj.html`: **un archivo autocontenido** que
funciona con doble clic y sin conexión. Ese es el entregable.

## La tesis de diseño

**La página *es* una pieza de equipo.** El hero es un controlador DJ de dos
platos dibujado con CSS, no una foto.

**La regla del controlador:** un DDJ-FLX4 tiene ~100 mandos; este tiene 30 y
**todos suenan**. Un botón pintado que no hace nada rompe la tesis más que no
dibujarlo. Si añades un mando, cablea un nodo de `rig.js` o no lo dibujes.

El naranja del FLX4 y `--honey` son el mismo color: casualidad útil, la paleta ya
estaba preparada. Sigue significando UNA cosa — señal viva —, así que solo se
enciende lo que suena. Chasis negro, costuras de un pelo,
etiquetas serigrafiadas, un solo plato vivo. La diferenciación viene de textura
y estructura, **no de color**: "casi-negro + un acento brillante" es el default
de todo portfolio oscuro.

Hay **un** acento (`--honey: #e2a52f`) y significa exactamente una cosa: **señal
viva** (al aire). No decorar con él. Si algo no está sonando, no es ámbar.

Regla Chanel: quitar un accesorio antes de salir. La firma es el plato — no
competir con él. Por eso se descartó animar el eje de ancho variable en hover.

## ▓ La trampa nº1: YouTube no se puede rayar

Si alguien pide "que el plato reproduzca los sets de YouTube", **no se puede**:

- `seekTo` → latencia ~200 ms + rebuffer. No sirve para rayar.
- `setPlaybackRate` → pasos fijos 0.25–2, **sin negativos**. No hay marcha atrás.
- `AudioBufferSourceNode` tampoco: su `playbackRate` no admite negativos ni
  expone la posición de lectura.

Un tornamesa necesita leer el buffer **muestra a muestra** con la posición como
variable propia. Eso es Web Audio + un AudioWorklet. Por eso `config.js` tiene
`yt` (miniatura + botón de video) **y** `audio` (lo que suena y se raya).

No intentes "arreglarlo" volviendo a YouTube. Ya se probó. No existe.

## El modelo del plato (`src/turntable.js`)

**Una sola variable manda: la velocidad angular.**

```
rate = vel / NOMINAL          NOMINAL = 200°/s = 33⅓ RPM
pos += rate                   por muestra, en el worklet
```

Consecuencias que parecen magia pero salen solas:

- El **START/STOP no lleva fade**. El audio cae de tono porque el plato frena.
- El **pitch no toca el audio**: mueve `targetVel = NOMINAL·(1+pitch/100)`.
- **Rayar hacia atrás no es un caso especial**: es una velocidad negativa.

Si vas a tocar esto, no metas casos especiales. Si algo necesita un `if`, casi
seguro el modelo ya lo cubre.

### Detalles que costaron sangre

- **Rampa del rate dentro del bloque de audio.** El rAF actualiza a 60 Hz y el
  audio corre a 48 kHz. Sin interpolar el rate a lo largo del bloque se oye un
  zipper horrible al rayar. Está en `WORKLET_SRC`.
- **Umbral de parada 1.5°/s.** Una exponencial tiene cola infinita: con 0.05°/s
  el plato tardaba ~5 s en "parar". A 1.5°/s es imperceptible y frena en ~1.9 s,
  como uno real.
- **La mano quieta para el disco.** Si el puntero sigue apoyado pero no se mueve
  >40 ms, la velocidad decae. Sin esto el audio seguía sonando a la última
  velocidad medida.
- **NO hacer `seek()` en `pointermove`.** El `rate` ya mueve la posición; hacer
  seek encima movía el audio el doble. Una vuelta a velocidad nominal dura
  360/200 = 1.8 s y avanza 1.8 s de audio: la correspondencia sale del modelo.
- **Limitador tanh** en la salida: al rayar los picos se disparan.

### AudioWorklet cae a ScriptProcessor en `file://`

El worklet se crea desde un Blob URL. En `file://` el origen es opaco y
`addModule` falla → cae a `ScriptProcessorNode` (obsoleto, hilo principal, con
jitter). **En https sube solo a worklet.** La consola lo dice al entrar.
No es un bug: es el fallback funcionando.

## Bugs reales ya cazados — no los reintroduzcas

1. **`clip-path` pone `intersectionRatio` a 0 en Chromium.** Los `.rev` llevan
   clip-path, así que cualquier `threshold`/`amount` > 0 **nunca dispara** y las
   secciones se quedan en negro. Verificado: sin clip-path ratio = 1, con
   clip-path ratio = 0. Por eso `inView(..., { amount: 0 })`.
2. **`min-width:auto` en hijos de grid/flex.** El `input[type=range]` tiene
   tamaño intrínseco (~130 px) y estiraba la pista del hero a 459 px en un
   viewport de 390. Hay una regla explícita de `min-width:0`. No la borres.
3. **`.deck` necesita `overflow:hidden`.** El `#wipe` se queda en
   `translateX(100%)` al acabar la animación de Motion y desborda la página.
4. **Los `@media` van DESPUÉS de su regla base.** No suman especificidad; decide
   el orden de aparición. Un `@media` colocado antes no gana.
5. **`scipy.binary_closing` erosiona el borde del lienzo** por defecto →
   `border_value=1` en `tools/unmatte.py`.
6. **`radial-gradient` se dimensiona a `farthest-corner`, no a `closest-side`.**
   En una máscara circular sobre un elemento cuadrado de 128px la esquina está a
   90.5px del centro, así que `82%` cae en 74px — FUERA del círculo de 64px de
   radio, y la máscara deja el elemento transparente entero. El anillo de
   rayitas del jog no se veía por esto. Lleva `circle closest-side`.
7. **`index.html` es un artefacto generado** por `build.py` desde
   `src/head.html` + `src/body.html`. Antes era un archivo suelto y editar
   `body.html` no llegaba nunca al build: el markup nuevo no aparecía y el
   síntoma era un `null.innerHTML` desconcertante.
8. **Los `OfflineAudioContext` en paralelo NO van más rápido: se pelean.**
   Medido: 4 renders a la vez = 4.5 s; los mismos 4 en serie = 1.6 s.
   `Promise.all` aquí es peor que un bucle.

## ▓ El grano costaba 7x TODA la página

Esto es lo más caro que se ha arreglado aquí, y no se veía por ningún lado.

El grano de película era un `<feTurbulence>` SVG a pantalla completa. Medido, con
la app cargada, en silencio y en reposo — el tiempo de renderizar un loop:

```
mosaico animado ... 1825 ms
mosaico quieto ....  266 ms
sin grano .........  262 ms      ← idéntico al quieto
```

**Un grano quieto cuesta lo mismo que no tener grano.** Animarlo costaba 7x sobre
TODO lo demás. El arranque pasó de 6923 ms a 1730 ms al arreglarlo.

Se juntaban tres cosas:
- `inset:-150%` → el elemento medía 4x el viewport en cada eje = **16x el área**
  (22.6 megapíxeles a 1440x980).
- `animation steps(6)` → esa mole se movía 6 veces por segundo...
- `mix-blend-mode:overlay` → ...y cada movimiento re-mezcla la página entera
  contra un filtro SVG que hay que rasterizar.

Ahora es un PNG (`tools/grain.py`) con `inset:0` y **sin animación**. El grano de
una foto tampoco se mueve.

**La lección, más general:** cuando algo va lento, no adivines. Aquí se
descartaron por medición cuatro hipótesis (que si el ScriptProcessor, que si los
jogs girando, que si los AudioContext, que si el paralelismo) antes de encontrar
al culpable, y el culpable era un div decorativo que nadie miraba. Desactiva
sospechosos de uno en uno y cronometra.

## ▓ Segunda vuelta: de mezcladora de dos platos a UN reproductor

El usuario pidió tirar la mezcladora entera y dejar solo un reproductor fiel a
un Pioneer XDJ-1000MK2: pantalla con portada, plato interactuable, cue, play,
tempo, y el selector plateado para cambiar de set (sustituye al crate como
forma principal de navegar). `rig.js` pasó de Rig+2×Deck+crossfader+EQ a un
Rig de un solo plato: vinilo → volumen → limitador → salida. Nada más, porque
nada más se dibuja — misma regla de siempre.

**Dos bugs reales de esta vuelta:**

1. **Colores fuera del sistema.** La pantalla usaba una paleta verde azulada
   (#8fd9b8 y compañía) y el botón CUE encendía en azul (#2f6fb0) — dos acentos
   nuevos en una página que solo tiene uno. Se cuela fácil cuando se diseña un
   componente nuevo aislado del resto: antes de dar por bueno un render, greppear
   `#[0-9a-f]{6}` contra la paleta declarada y explicar cada color que sobre.

2. **El audio EN VIVO compite con el render offline — de verdad esta vez.**
   En el mixer de dos platos medí "render con el rig activo: 390ms (1.0x)" y
   concluí que un ScriptProcessor sonando no frena el render. Esa medición
   estaba mal diseñada: el deck de esa prueba estaba INICIALIZADO pero sin
   buffer cargado, así que su callback salía en la primera línea
   (`if (!this._chans) { ...; return; }`) — casi gratis, no representativo.
   Con un plato REPRODUCIENDO de verdad (interpolando muestras, aplicando
   rate) medido aquí: un loop que aislado tarda ~400ms pasa a **~2400ms** con
   el reproductor sonando. La lección: al medir "¿esto compite con aquello?",
   confirma que el "aquello" está haciendo el trabajo real, no la versión
   ociosa de sí mismo. Por eso ahora TODOS los sets se prerrenderizan en
   silencio antes del primer `platter.start()`, no solo los dos primeros.

3. Emparentado con el bug de los jogs de la vuelta anterior: `cacheRefs()` se
   llamaba ANTES del prerender, así que el bucle rAF ya escribía
   `.style.transform` en el jog 60 veces por segundo durante los 4 renders
   (running=false, pero `step()` corre igual). Aporta ~19% del coste. Ahora
   `cacheRefs()` va DESPUÉS del prerender, justo antes del primer `loadTo`.

## El logo estaba roto (`tools/unmatte.py`)

`honey_logo.png` **no tiene transparencia**: es una captura del preview. El
tablero de ajedrez son píxeles RGB reales y el alfa está a 255 en todo el lienzo
(por eso `.getbbox()` no recortaba). Encima el tablero fue *dibujado*, no
generado: el cuadro pasa de 26.5 px arriba a 28 px abajo con jitter, así que
sintetizar la rejilla y restarla no funciona.

Se reconstruye segmentando por **color + estructura + densidad**:

- Tablero y acero cepillado tienen los dos desviación local alta, pero el
  **tablero es plano dentro de cada cuadro** y el metal tiene degradado continuo.
- La ventana de `sd` **debe superar el cuadro (~27 px)** → se usa 61. Con 31 el
  centro de cada cuadro no ve oscilación y el test falla a parches.
- Filtrar por **densidad de vecindario, no por forma**: una apertura morfológica
  se come las celdas del ala porque venas y brillos tienen el mismo grosor.

**Si aparece el PNG original con alfa real, tíralo todo y úsalo.** Siempre será
mejor que la reconstrucción.

## Assets

- `honey_tornamesa.png` es de **407×582** — muy baja resolución. El deck está
  limitado a ~440 px para que no pixele. Con una foto mejor el hero gana mucho.
- El deck se recorta a 407×450 y se le funde el brazo a negro (`tools/prep.py`).
  **Si cambias el recorte, recalibra el plato**: centro (289,194), radio 84 px
  → `left:71.01%; top:43.11%; width:41.3%` en `.platter`.
- La galería son **6 encuadres de 2 fotos** (`--z` zoom + `--o` origen). Con
  `object-fit:cover` a secas salían casi idénticos porque el deck quedó casi
  cuadrado. Sustituir por fotos reales en cuanto haya.

## ▓ Tercera vuelta: el plato manda, el carril es la biblioteca visual

Pedido: pantalla más chica, plato más grande, chasis hiperrealista, el crate
se muda al lado derecho del reproductor con un efecto de tamaño (grande↔chico)
al cambiar de set, y click en una portada abre el video en un popup dentro de
la página.

**Cómo se hizo el efecto de tamaño sin JS de layout:** cada `.setcard` es un
hijo flex con `flex-grow` en transición CSS. La activa tiene `flex-grow:26`,
el resto `flex-grow:5`. Cambiar la clase `.active` es lo único que hace JS
(`paintRail()`); el reflow en cascada — la "transición ascendente" — lo hace
el navegador solo. Es el mismo truco de acordeón de toda la vida, aplicado a
portadas de disco. En `<980px` el carril gira 90°: mismo mecanismo, ahora en
horizontal (`flex-direction:row`), porque en móvil no sobra alto.

**Hiperrealismo, capa por capa, sin salirse de la paleta de un acento:**
aro de agarre moleteado (`repeating-conic-gradient` enmascarado a un anillo
fino), chapa con textura de líneas sutilísima (`repeating-linear-gradient` a
opacidad .014 — invisible salvo por el efecto acumulado), sheen de cristal
**estático** (nunca animado — un brillo que se mueve es ruido, uno fijo es una
superficie curva bajo luz), y cuatro tornillos de esquina (`.screws i`, 6px,
radial-gradient + una muesca diagonal). Todo en gris + el ámbar de siempre.

**El popup de video reutiliza el modal `#vid` que ya existía** (antes solo lo
abría el link "Video ↗", que se fue con el crate viejo). Ahora `openVideo(s)`
es una función compartida: la llama el click de cada `.setcard`. Verificado
con un ID real de YouTube temporalmente en `config.js` (revertido después):
el iframe carga la URL correcta y el plato se pausa al abrir el video — no
tiene sentido que suene el set Y el video del set a la vez.

**Trampa de testing, no del producto:** al probar con un `yt` real, `page.goto`
colgó 30s esperando el evento `load` — sin red de verdad en este sandbox, la
miniatura de YouTube nunca termina de cargar/fallar, y `load` no dispara hasta
que TODOS los recursos resuelven. Con `wait_until='domcontentloaded'` se
evita. No afecta al sitio real (con red, la miniatura falla rápido a los pocos
segundos y `onerror` cae al respaldo `hqdefault`).

La bio ("Cuarto chico, bocina prestada…"), las stats (04 años / 120+ fechas),
`booking@honey.dj` y los links de redes **son placeholders escritos por mí**, no
datos del cliente. No los des por buenos.

## Skills

`https://github.com/nextlevelbuilder/ui-ux-pro-max-skill` **no es una librería**:
es una skill de razonamiento de diseño para agentes (161 reglas, 84 estilos). No
se importa — se usa aquí, en Claude Code.

## ▓ Cuarta vuelta: el nombre real es HONN3Y, no HONEY

El cliente mandó una foto de su tag pintado en la calle: **HONN3Y** (doble N,
3 en vez de E), chorreado en spray. Hasta ahora todo el sitio decía "HONEY" —
error mío, asumido desde el principio sin confirmar. Se corrigió en cada sitio
donde aparecía el nombre: wordmark, nav, footer, puerta, bio, `<title>`,
`DJ_NAME` en `config.js`, placa del reproductor.

**La tipografía del wordmark es Nosifer** (Google Fonts, OFL, bajada de
`raw.githubusercontent.com/google/fonts` — dominio permitido en este sandbox;
`fonts.googleapis.com` NO lo está, así que no sirve para probar aquí, pero el
navegador del usuario final sí tiene red real). Se comparó contra Eater y
Butcherman renderizando las tres con el texto real antes de decidir — Nosifer
es la que más se parece a los goterones de la foto. Subseteada a
`H·O·N·N·3·Y` nada más: **1.4 KB**. Vive en `--font-family:'Tag'` y SOLO se usa
en `.wordmark` y `#gate h1` — el resto de la página sigue con Archivo/Mono. La
audacia se gasta en un solo sitio; el nombre es donde correspondía gastarla.

**Bug real encontrado al aplicarla:** usé `var(--display)` en dos sitios
cuando la variable se llama `--disp`. Un `var()` a una custom property que no
existe invalida TODO el valor de `font-family` (no solo ese término), así que
sin este arreglo el wordmark habría caído en el navegador por defecto sin que
se notara a simple vista en algunos casos. Grep de `var(--display)` en todo
`styles.css` antes de dar por buena cualquier fuente nueva.

**Bug real de layout:** para que los goterones no se recorten dentro del
`overflow:hidden` de la animación de entrada por letra, le puse
`margin-bottom` negativo al `<span>` de cada letra. Eso también reduce el
espacio que el wordmark reserva en el flujo del documento — en móvil, con el
texto ocupando proporcionalmente más alto, las píldoras de género terminaban
literalmente encima de los goterones. Se corrigió subiendo el
`margin-bottom` del `.wordmark` contenedor, no quitando el truco del span
(ambos hacen falta: uno evita el recorte, el otro reserva el espacio real).

**El carril ahora tiene una tercera columna: la descripción del set**
(`#setdesc`, solo escritorio, `<980px` se oculta). Cambia con Motion — sale
hacia arriba y se desvanece, el nuevo texto sube desde abajo — mismo lenguaje
de movimiento que el `flex-grow` del carril de al lado, para que se sientan
como la misma animación aunque los mecanismos sean distintos (uno es CSS
puro, el otro necesita JS porque el contenido cambia a medio camino).

**Los dos links de YouTube van con marca de tiempo real** (`ytStart`, del
`&t=` de la URL): el popup abre el video exactamente donde lo mandó el
cliente, no desde el segundo 0. Se asignaron a los sets 1 y 2 por posición —
sin confirmación explícita de cuál video es cuál set, así que hay que
avisarlo y ofrecer corregir el orden si no es el correcto.

**Bug real, serio, no relacionado con lo anterior — cazado por accidente
durante las pruebas:** las miniaturas de YouTube tenían un `onerror` inline
que NO se desactivaba a sí mismo. Si la miniatura de respaldo (`hqdefault`)
TAMBIÉN fallaba, `onerror` volvía a dispararse, reintentaba la misma URL,
volvía a fallar, y así indefinidamente — un bucle infinito de peticiones de
red en el navegador del visitante. Se disparó por accidente en este sandbox
sin internet (cientos de peticiones en segundos) y así se encontró. Ya
corregido en los dos sitios donde existía (`this.onerror=null` antes de
reasignar `src`). Cualquier `onerror` que reasigna `src` DEBE desactivarse
primero — si no, es una bomba de tiempo esperando una miniatura caída.

**Sobre "quita las fechas próximas":** revisado todo el sitio a fondo — nunca
hubo una sección de "próximos shows" (no existía qué quitar). Lo único
ajustable era el ticker, que decía "Fechas abiertas 2026": el año implicaba
una agenda cerrada a un periodo específico. Se quitó el año — queda "Fechas
abiertas", disponibilidad pura, sin fecha de vencimiento. Si el cliente se
refería a otra cosa, hace falta que diga dónde la vio.

## ▓ Quinta vuelta: el primer audio real (`assets/sets/tomo-1.mp3`)

El cliente mandó el mp3 real del set 1 (63 MB, 33:32, 251kbps). Esto obligó a
resolver algo que hasta ahora era teórico:

**`fetch()` de un archivo local bajo `file://` SIEMPRE falla en Chrome.**
Verificado con la prueba más simple posible: un `.txt` de una palabra en la
misma carpeta, `fetch('data.txt')` → `Failed to fetch`. No es negociable, no
hay flag ni workaround del lado del sitio. Consecuencia real: **el audio real
nunca sonará abriendo `honey-dj.html` con doble clic** — solo funciona
sirviendo el proyecto por http (`npm run dev`, o un hosting real). El código
ya caía con gracia al DEMO sintético en este caso (el `try/catch` de
`audioFor` ya existía), así que no hubo que arreglar nada — solo confirmar
que el respaldo se activa y documentarlo bien claro, porque es la clase de
cosa que un cliente prueba, ve que "no suena", y asume que está roto.

`tools/build.py` NO empotra el audio (63 MB en base64 ≈ 84 MB, absurdo para
un archivo que se vende como "750 KB, un solo archivo"). En vez de eso:
- El chequeo de autocontención (`for leak in (...)`) se ajustó para permitir
  `assets/sets/` específicamente — antes cualquier `"assets/"` restante
  tumbaba el build, y una ruta de audio real siempre iba a quedar así.
- Se copia `assets/sets/*.mp3` a `dist/assets/sets/` después de armar el
  HTML — no va adentro, va al lado.

**BPM real, no inventado.** Con `librosa.beat.beat_track` sobre 6 fragmentos
de 2-4 min repartidos por todo el set: 4 de 6 dieron 152.0 BPM exacto: se usó
ese valor. Los 2 que no (99.4 y 86.1) son casi seguro errores de octava del
detector (mitad/tercio del tempo real) — común en breaks o pasajes con menos
pulso — no una bajada real de tempo. Rutina para el siguiente audio: 4-6
fragmentos repartidos por el set completo, no solo el principio (el tempo de
un DJ set cambia).

Verificado sirviendo el proyecto por `python3 -m http.server` (no `file://`,
por lo de arriba): título sin "· DEMO", forma de onda con desviación
estándar real (no el patrón plano de 4 compases del loop sintético), el
tiempo mostrado avanza solo, y rayar hacia atrás mueve el tiempo real
(`16:46 → 16:41` tras un rayado sostenido — el `%` redondeado no lo muestra
en una pista de 33 min, hay que leer el tiempo, no el porcentaje).

## Verificar antes de dar por bueno

```
scrollWidth <= viewport en 390 / 768 / 1440  (¡tras disparar el #wipe!)
document.querySelectorAll('.rev:not(.in)').length === 0
rate efectivo medido contra el pedido: +1, 0, -1, -3, +2
consola sin errores
```
