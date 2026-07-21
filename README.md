# proyecto HON3Y

Sitio de presentación de **HONEY** — DJ / selector, CDMX.
Lo llamativo no es el diseño: es que **el reproductor funciona de verdad**.

---

## Arrancar

```bash
npm install          # motion + esbuild
npm run dev          # servidor en http://localhost:3000
npm run build        # → dist/honey-dj.html (un solo archivo, sin red)
```

> **Hace falta servidor.** `index.html` usa módulos ES y `file://` los bloquea por
> CORS. Si solo quieres verlo, abre `dist/honey-dj.html` con doble clic: ese sí
> funciona suelto.

---

## ▓ Lo único que tienes que editar

**`src/config.js`**. Nada más.

```js
{ yt:'dQw4w9WgXcQ', audio:'sets/warehouse.mp3', title:'Warehouse Session', ... }
```

| campo | para qué sirve |
|---|---|
| `yt` | ID de YouTube (lo que va tras `v=`). Da la **miniatura** del vinilo y el botón **Video ↗**. |
| `audio` | URL de un mp3/wav. **Esto es lo que suena y lo que se puede rayar.** |

### Por qué son dos campos y no uno

**YouTube no se puede rayar.** Su API solo expone `seekTo` (latencia ~200 ms y
rebuffer) y `playbackRate` en pasos fijos de 0.25 a 2, **sin negativos**. No hay
forma de mover el audio hacia atrás ni de que siga la mano. Un tornamesa real
necesita control de la posición muestra a muestra → eso es Web Audio, con el
audio real, no con el video.

Así que YouTube se queda para lo que sí sabe hacer (miniatura + ver el video) y
el plato suena por Web Audio.

### Tres formas de meter audio

1. `audio:'url.mp3'` en config
2. **Arrastrar un mp3 al plato** (o el botón "Cargar mp3") — no necesita hosting
3. Nada → el plato sintetiza un **loop de techno** con el BPM del set y lo marca
   `DEMO`. Existe para que el tornamesa sea probable desde el primer segundo.

---

## El reproductor

El hero **es** un reproductor de un plato, hiperrealista, dibujado con CSS —
chapa cepillada, tornillos en las esquinas, aro de agarre moleteado, brillo de
cristal fijo. No es una foto: escala sin pixelar y, sobre todo, **cada mando se
puede tocar**. La pantalla es una franja delgada a propósito — **el plato es el
alma de la página**, no la LCD.

**La regla:** un XDJ real tiene ~15 controles. Este tiene 8 y **todos suenan**.

| mando | qué hace de verdad |
|---|---|
| **Pantalla** (slim) | título, BPM, forma de onda, tiempo. Click en la onda para buscar. |
| **Selector** (plateado) | el mando que de verdad decide qué suena. Arrastra o usa las flechas. |
| **Jog** | rayar. La velocidad angular ES el rate del audio. |
| **Cue / Play** | Cue al estilo CDJ. |
| **Tempo** | ±8%. Mueve el objetivo del motor, no el audio. |
| **Direction** | invierte el sentido del plato. |
| **Track search** (◀◀ ▶▶) | mantener pulsado busca. |

### El carril

A la derecha del reproductor, no debajo. Cada portada es un `.setcard` con
`flex-grow` en transición: la activa crece, las demás se reparten el alto (o el
ancho, en móvil) sobrante. Cuando cambia el set, **todo el carril se reacomoda
en cascada** — esa es la transición ascendente, y sale sola de animar
`flex-grow`, sin JS calculando alturas a mano.

Click en una portada: si no es la activa, la carga en el reproductor; si tiene
link de YouTube, abre el video **en un popup dentro de la misma página**
(`#vid`, con `<iframe>` de youtube-nocookie). Las dos cosas a la vez, porque
son la misma intención: "quiero esto". Sin link, solo carga — no hay nada que
ver.



## Cómo funciona el plato

Todo sale de **una sola variable**: la velocidad angular del jog.

```
rate = velocidad_del_jog / 200°/s        (200°/s = 33⅓ RPM)
pos += rate                               en cada muestra de audio
```

`rate = +1` normal · `0` parado · `-2` hacia atrás al doble.
Es literalmente lo que hacen Serato y Traktor.

Por eso **arrancar, frenar, rayar y el tempo son el mismo camino**, sin casos
especiales. El START/STOP no lleva ningún fade: el audio cae de tono porque el
plato frena. Eso no está programado — sale gratis del modelo.

- `src/turntable.js` — motor Web Audio (AudioWorklet) + física del jog
- `src/rig.js` — el reproductor: un plato, volumen, limitador. Sin mezcladora.
- `src/controller.js` — el reproductor (markup + mandos)
- `src/tracks.js` — generador procedural de techno
- `src/main.js` — cablea motor ↔ UI

### Por qué la entrada tarda ~3 segundos

Los 4 sets se renderizan en silencio **antes** de que suene nada, no perezosamente
según se seleccionan. Medido: un loop tarda ~400ms aislado, pero con el
reproductor YA sonando (el motor real interpolando muestras en el hilo
principal) el mismo render pasa a ~2.4s — el audio en vivo compite de verdad
con el render offline. Cachear todo antes del primer play evita que el
selector tropiece cada vez que aterriza en un set nuevo.

### AudioWorklet vs ScriptProcessor

El motor intenta usar un **AudioWorklet** (hilo de audio propio, sin glitches).
En `file://` falla — el origen es opaco y el Blob URL del worklet no carga — y
cae a `ScriptProcessorNode`, que suena igual pero con jitter porque corre en el
hilo principal.

**Al desplegar en un dominio https sube solo a worklet.** No hay que tocar nada.
Compruébalo en la consola: `motor de audio: worklet`.

## Estructura

```
src/config.js       ← ▓ EDITA ESTO ▓
src/turntable.js    motor de audio + física del jog
src/rig.js          el reproductor: un plato, sin mezcladora
src/controller.js   el reproductor (pantalla, selector, jog, transporte)
src/tracks.js       loops procedurales
src/main.js         UI
src/styles.css      sistema de diseño
src/head.html       <head>   ─┐  index.html se COMPONE de estos dos:
src/body.html       markup   ─┘  es un artefacto, no lo edites a mano
src/vendor/motion.js  bundle propio de Motion (13.7 KB)

tools/unmatte.py    reconstruye el alfa del logo
tools/prep.py       pipeline de imágenes (B/N, recorte, webp)
tools/grain.py      genera el mosaico de grano (¡léelo!)
tools/build.py      compone index.html + ensambla dist/honey-dj.html

assets/             webp + fuentes subseteadas + grain.png
```

> **`index.html` es un artefacto generado.** Lo compone `build.py` desde
> `src/head.html` + `src/body.html`. Si lo editas a mano, el siguiente build se
> lo lleva por delante. El markup se toca en `src/body.html`.

## Motion

`src/vendor/motion.js` es un bundle a medida: `animate` del build **mini** +
`inView`, `stagger` y `spring` del completo = **13.7 KB** (el UMD entero pesa
139 KB, y traer el `animate` completo costaba 49 KB más por un solo muelle).

Regenerar: `npm run motion`

Se usa en: la puerta (`clipPath`), la limpiada de crossfader, los revelados
(`inView`) y el muelle del reset de pitch (`spring` como generador suelto).

## Sistema de diseño

6 grises y **un** acento. `--honey: #e2a52f`, sacado del bronce de la abeja, y
significa una sola cosa: **señal viva**. Si sobra, ponlo en `#eae8e3`.

Tipografía: *el póster* (Archivo variable, ancho 62 → flyer fotocopiado),
*la máquina* (Space Mono para BPM/KEY/TIME), y *el tag* (Nosifer, solo para el
nombre — el grafiti real del cliente, chorreado como está pintado en la
calle. 1.4 KB, subseteada a H·O·N·N·3·Y nada más. No se usa en ningún otro
sitio de la página).

## Pendiente

- [ ] **Confirmar que los 2 links de YouTube van con los sets correctos** — se
      asignaron por posición (set 1 → primer link, set 2 → segundo), sin que
      el cliente dijera cuál es cuál
- [ ] Links de YouTube para los sets 3 y 4
- [ ] Audio real para los sets 2, 3 y 4 — el set 1 (Warehouse Session) ya
      suena de verdad (`assets/sets/tomo-1.mp3`, 152 BPM detectado del
      audio); los otros tres siguen con loop sintetizado (DEMO)
- [ ] Email de booking y redes (hoy son placeholders)
- [ ] Bio y **descripciones de los sets 2, 3 y 4: siguen inventadas**
      (campo `desc` en `config.js`) — la del set 1 ya la confirmó el cliente
      (sótano, CDMX)
- [ ] `key` (tonalidad Camelot) del set 1 sigue siendo un placeholder —
      el BPM se detectó del audio real, la tonalidad no (requiere otro
      análisis, no lo pedí a menos que haga falta)
- [ ] Fotos reales para la galería (hay 3 slots libres)
- [ ] PNG del logo con alfa real (ver CLAUDE.md)

## ▓ El audio real NO funciona abriendo `honey-dj.html` con doble clic

`fetch()` de un archivo local bajo `file://` falla siempre en Chrome — no es
un bug de este proyecto, es una restricción de seguridad del navegador sin
vuelta atrás (verificado: falla incluso para un `.txt` de una palabra en la
misma carpeta). El plato cae de forma silenciosa al loop DEMO cuando esto
pasa — no se rompe, pero tampoco suena lo real.

**El audio real solo funciona:**
- corriendo `npm run dev` (servidor local), o
- subiendo el proyecto completo (con `assets/sets/`) a un hosting real

`tools/build.py` copia `assets/sets/*.mp3` junto a `dist/honey-dj.html`
automáticamente. Si subes la carpeta `dist/` entera a un servidor, el audio
real funciona ahí también — solo no funciona con doble clic en tu escritorio.
