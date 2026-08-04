import { Rig } from './rig.js';
import { controllerHTML, Controller } from './controller.js';
import { renderLoop } from './tracks.js';
import { SETS as FALLBACK_SETS } from './config.js';
import { fetchSets, subscribeSets, fetchGallery, subscribeGallery, fetchMeta, subscribeMeta } from './supabase-client.js';
import { initAdmin } from './admin.js';

/* Motion — bundle propio: animate del build mini + inView/stagger/spring. */
const { animate, inView } = window.Motion;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const fmt = s => `${Math.floor(s / 60)}:${pad(Math.floor(s % 60))}`;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const thumb = id => `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`;
const thumbAlt = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const IMG = window.IMG;
// Todo lo que viene de Supabase (sets, galería, bio) lo escribe el dueño desde
// el panel admin y termina en innerHTML de la página pública — sin esto,
// cualquier campo de texto sería una vía de XSS persistente para cualquiera
// que llegue a la contraseña del panel (que no es segura de verdad, ver
// admin.js). Los datos hardcodeados de config.js no lo necesitan (son míos),
// pero esc() es barato y aplicarlo siempre evita tener que acordarse cuál
// campo es de confianza y cuál no.
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const rig = new Rig();
let ctrl = null, entered = false;
const cache = new Map();
let current = 0;                 // índice en SETS del set cargado
let SETS = FALLBACK_SETS;        // reemplazado por los de Supabase si hay red

/* ═══════════ BUCLE ═══════════
   La velocidad angular manda sobre todo: la rotación en pantalla y el rate
   del audio salen de la misma variable. */
let lastRate = null, lastT = performance.now(), refs = null;

function cacheRefs() {
  refs = {
    face: $('[data-face]'), head: $('[data-head]'),
    wave: $('[data-wave]'), jog: $('[data-jog]'),
  };
}

function frame(t) {
  const dt = Math.min((t - lastT) / 1000, 0.05); lastT = t;

  if (refs) {
    const rate = rig.platter.step(dt);
    refs.face.style.transform = `rotate(${(rig.platter.angle % 360).toFixed(2)}deg)`;

    if (lastRate === null || Math.abs(rate - lastRate) > 0.0015) {
      rig.engine.setRate(rate);
      lastRate = rate;
    }
    const p = rig.engine.position;
    refs.head.style.transform = `translateX(${(p * refs.wave.clientWidth).toFixed(1)}px)`;
    refs.jog.setAttribute('aria-valuenow', Math.round(p * 100));
    $('[data-time]').textContent = fmt(p * rig.engine.duration);
  }
  if (entered && rig.platter) $('#miniVinyl').style.transform = `rotate(${(rig.platter.angle % 360).toFixed(2)}deg)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ═══════════ FORMA DE ONDA (en la pantalla) ═══════════ */
function drawWave() {
  if (!refs) return;
  const wrap = refs.wave, c = $('[data-canvas]');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  c.width = W * dpr; c.height = H * dpr;
  const x = c.getContext('2d'); x.scale(dpr, dpr); x.clearRect(0, 0, W, H);
  if (!rig.engine.buffer) return;
  const d = rig.engine.buffer.getChannelData(0);
  const step = Math.floor(d.length / W) || 1;
  x.fillStyle = '#4f4f4f';
  for (let px = 0; px < W; px++) {
    let mn = 1, mx = -1;
    for (let j = 0; j < step; j++) { const v = d[px * step + j]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const y0 = (1 - mx) * H / 2, y1 = (1 - mn) * H / 2;
    x.fillRect(px, y0, 1, Math.max(1, y1 - y0));
  }
}

/* ═══════════ AUDIO ═══════════
   Tres vías: URL en config, arrastrar un mp3 al reproductor, o el loop
   procedural como DEMO para que funcione sin archivos.

   El caché se indexa por el id ESTABLE del set (el id de Supabase, o el
   índice si todavía no hay uno) — no por posición. Si llega una
   actualización en vivo que reordena el carril, el buffer ya decodificado
   sigue siendo válido: es el mismo set, solo cambió dónde se muestra.
   Indexar por posición aquí fue justo el bug que causaba el delay al
   cambiar de pista: cada actualización remota invalidaba TODO el caché y
   forzaba volver a decodificar/renderizar en vivo — lo que el proyecto ya
   había medido como carísimo (ver CLAUDE.md, "el audio en vivo compite con
   el render offline"). */
function keyFor(i) { return SETS[i]?.id ?? i; }

// Cuántos AudioBuffer decodificados se guardan a la vez. Antes se
// prerrenderizaba y cacheaba TODO el catálogo, lo cual tenía sentido con
// loops sintéticos de unos KB — pero con canciones reales de varios minutos
// cada buffer decodificado pesa cientos de MB, y cachear 4+ de golpe agota
// la memoria de la pestaña. Con un límite chico, cambiar entre los últimos
// sets sigue siendo instantáneo sin arriesgar todo el catálogo en RAM.
const MAX_CACHED = 2;

async function audioFor(i) {
  const key = keyFor(i);
  if (cache.has(key)) {
    const buf = cache.get(key);
    cache.delete(key); cache.set(key, buf); // lo más reciente va al final
    return buf;
  }
  const s = SETS[i];
  let buf;
  if (s.audio) {
    try {
      const r = await fetch(s.audio);
      buf = await rig.decode(await r.arrayBuffer());
      s._demo = false;
    } catch (err) { console.warn('No pude cargar', s.audio, '—', err.message); }
  }
  if (!buf) {
    buf = await renderLoop({ bpm: +s.bpm || 128, seed: (i + 1) * 977, bars: 4 });
    s._demo = true;
  }
  cache.set(key, buf);
  while (cache.size > MAX_CACHED) cache.delete(cache.keys().next().value);
  return buf;
}

/* ═══════════ CARGAR UN SET ═══════════ */
async function loadTo(i, autoplay = true) {
  const s = SETS[i];
  if (!cache.has(keyFor(i))) $('[data-title]').textContent = 'Cargando…';
  const buf = await audioFor(i);
  rig.load(buf, s);
  current = i;
  drawWave();

  $('[data-title]').textContent = s.title + (s._demo ? ' · DEMO' : '');
  $('[data-meta]').textContent = `${s.venue} · ${s.key || ''}`.replace(/·\s*$/, '');

  if (autoplay) rig.platter.start(); else rig.platter.stop();
  ctrl.paint();
  paintSelector();
  paintRail();
  paintDesc();
  paintNow();
}

function paintSelector() {
  $('[data-selnum]').textContent = `${pad(current + 1)}/${pad(SETS.length)}`;
  $('[data-selector]').setAttribute('aria-valuenow', current + 1);
  const el = $('[data-selnum]');
  el.classList.remove('sel-flash'); void el.offsetWidth; el.classList.add('sel-flash');
}

function paintRail() {
  $$('.setcard').forEach(c => {
    const active = +c.dataset.i === current;
    c.classList.toggle('active', active);
    c.setAttribute('aria-current', active ? 'true' : 'false');
  });
}

/* La descripción sube y se desvanece con cada cambio de set — el mismo
   lenguaje de movimiento que el carril: algo se retira, algo nuevo sube a
   ocupar su lugar. Motion, no CSS puro, porque el contenido cambia a medio
   camino (hay que esperar a que se vaya para escribir lo nuevo). */
function paintDesc() {
  const el = $('#setdesc'); if (!el) return;
  const s = SETS[current];
  const go = () => {
    el.innerHTML = `
      <span class="sd-n">${pad(current + 1)}</span>
      <span class="sd-title">${esc(s.title)}</span>
      <span class="sd-meta">${esc(s.venue)} · ${esc(s.bpm)} BPM · ${esc(s.key)}</span>
      <p class="sd-copy">${esc(s.desc)}</p>`;
    if (!reduce) animate(el, { opacity: [0, 1], transform: ['translateY(16px)', 'translateY(0)'] },
      { duration: .5, ease: [.22, .9, .18, 1] });
  };
  if (reduce || !el.firstChild) { go(); return; }
  animate(el, { opacity: [1, 0], transform: ['translateY(0)', 'translateY(-10px)'] },
    { duration: .22, ease: 'easeIn' }).then(go);
}

function paintNow() {
  if (!rig.set) return;
  const live = rig.platter.running;
  document.body.classList.toggle('live', live);
  $('#airTxt').textContent = live ? 'Al aire' : 'Fuera de aire';
  $('#airLbl').textContent = live ? 'Reproduciendo' : 'En pausa';
  $('#nowTitle').textContent = `${pad(current + 1)} / ${rig.set.title.toUpperCase()}`;
  $('#miniTitle').textContent = rig.set.title;
  $('#miniMeta').textContent = `${rig.set.venue} · ${rig.bpm.toFixed(1)} BPM${rig.set._demo ? ' · DEMO' : ''}`;
  const ml = $('#miniLabel'), mi = $('#miniImg');
  const miniCover = rig.set.cover || (rig.set.yt ? thumb(rig.set.yt) : '');
  if (miniCover) { ml.classList.remove('empty'); mi.src = miniCover; } else ml.classList.add('empty');
  const ic = $('#miniIcon');
  if (ic) ic.innerHTML = live ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M6 3l14 9-14 9z"/>';
}

/* ═══════════ VIDEO — pop up dentro de la misma página ═══════════
   Usa la IFrame Player API de YouTube (no un <iframe src=embed> a pelo):
   así se puede escuchar el evento de error real. Si el dueño del video
   desactivó la reproducción externa (lo más común), YouTube lo reporta como
   error 101/150 y ahora se lo decimos al visitante en vez de dejarlo ver
   una pantalla negra sin explicación. */
let ytApiPromise = null;
function loadYTApi() {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise(resolve => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(s);
  });
  return ytApiPromise;
}

const YT_ERRORS = {
  2: 'El link del video está mal formado.',
  5: 'Error del reproductor HTML5 de YouTube.',
  100: 'Este video es privado o fue eliminado.',
  101: 'El dueño de este video desactivó la reproducción fuera de YouTube.',
  150: 'El dueño de este video desactivó la reproducción fuera de YouTube.',
};

function showVidError(msg) {
  $('#vidFrame').style.display = 'none';
  $('#vidFallbackMsg').textContent = msg;
  $('#vidFallback').classList.add('show');
}

let ytPlayer = null;
async function openVideo(s) {
  if (!s?.yt) return;
  rig.platter?.stop(); ctrl?.paint();
  $('#vid').classList.add('open'); document.body.classList.add('locked');
  $('#vidFallback').classList.remove('show');
  $('#vidFrame').style.display = '';
  $('#vidFallbackLink').href = `https://youtube.com/watch?v=${s.yt}${s.ytStart ? '&t=' + s.ytStart + 's' : ''}`;

  // Si la API no responde en 6s (sin red, bloqueada, lo que sea) no se deja
  // el popup con una pantalla negra sin explicación.
  const timeout = new Promise(r => setTimeout(() => r(null), 6000));
  const YT = await Promise.race([loadYTApi(), timeout]);
  if (!$('#vid').classList.contains('open')) return;      // se cerró mientras cargaba
  if (!YT) { showVidError('No se pudo cargar el reproductor de YouTube.'); return; }

  if (ytPlayer) { ytPlayer.loadVideoById({ videoId: s.yt, startSeconds: s.ytStart || 0 }); return; }
  ytPlayer = new YT.Player('vidFrame', {
    videoId: s.yt,
    playerVars: { autoplay: 1, rel: 0, start: s.ytStart || 0 },
    events: { onError: e => showVidError(YT_ERRORS[e.data] || 'No se pudo reproducir este video aquí.') },
  });
}

/* ═══════════ CARRIL — portadas verticales junto al reproductor ═══════════
   La activa crece con una transición ascendente (flex-grow animado: las
   demás se reparten el alto sobrante y todo el carril se reacomoda en
   cascada). Click en una portada carga ese set Y, si tiene video, lo abre
   aquí mismo — dos pedidos del mismo gesto porque son la misma intención:
   "quiero esto". */
function renderRail() {
  $('#rail').innerHTML = SETS.map((s, i) => `
  <button class="setcard ${i === current ? 'active' : ''}" data-i="${i}"
          aria-label="${esc(s.title)}" aria-current="${i === current}">
    <span class="sc-cover">
      ${s.cover ? `<img src="${esc(s.cover)}" alt="">`
        : s.yt ? `<img src="${esc(thumb(s.yt))}" onerror="this.onerror=null;this.src='${esc(thumbAlt(s.yt))}'" alt="">`
        : `<img class="sc-bee" data-src="bee" alt="">`}
    </span>
    <span class="sc-shade"></span>
    <span class="sc-n">${pad(i + 1)}</span>
    ${s.yt ? '<span class="sc-play" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg></span>' : ''}
    <span class="sc-txt">
      <b class="sc-title">${esc(s.title)}</b>
      <span class="sc-meta">${esc(s.venue)} · ${esc(s.bpm)} BPM</span>
    </span>
  </button>`).join('');
  $$('#rail [data-src]').forEach(el => el.src = IMG[el.dataset.src]);
}
renderRail();

$('#rail').onclick = async e => {
  const b = e.target.closest('.setcard'); if (!b) return;
  const i = +b.dataset.i;
  if (i !== current) await loadTo(i, true);
  openVideo(SETS[i]);
};

$('#setlist').onclick = async e => {
  const b = e.target.closest('.setrow'); if (!b || !ctrl) return;
  await loadTo(+b.dataset.i, true);
  $('#deck-sec').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

/* ═══════════ SOLTAR UN MP3 ═══════════ */
function wireDrop() {
  const el = $('#ctrl');
  ['dragenter', 'dragover'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => el.addEventListener(ev, e => { e.preventDefault(); el.classList.remove('over'); }));
  el.addEventListener('drop', async e => {
    const f = e.dataTransfer.files[0];
    if (!f || !f.type.startsWith('audio')) return;
    const buf = await rig.decode(await f.arrayBuffer());
    const s = { title: f.name.replace(/\.[^.]+$/, ''), venue: 'Local', bpm: '128', yt: '', audio: f.name, _demo: false };
    rig.load(buf, s);
    $('[data-title]').textContent = s.title;
    $('[data-meta]').textContent = s.venue;
    drawWave();
    rig.platter.start();
    ctrl.paint(); paintNow();
  });
}

/* ═══════════ PUERTA ═══════════ */
$('#enter').onclick = async () => {
  entered = true;
  animate($('#gate'), { clipPath: ['inset(0 0 0 0)', 'inset(0 0 100% 0)'], opacity: [1, .4] },
    { duration: .9, ease: [.65, .02, .18, 1] }).then(() => { $('#gate').style.display = 'none'; });
  document.body.classList.add('entered');
  $('#nav').classList.add('show');

  const mode = await rig.init();
  console.info('motor de audio:', mode);

  $('#ctrl-wrap').innerHTML = controllerHTML();
  $$('#ctrl-wrap [data-src]').forEach(el => el.src = IMG[el.dataset.src]);
  ctrl = new Controller($('#ctrl'), rig, { onState: paintNow, onStep: stepSet });
  cacheRefs();

  // Solo se espera el set que va a sonar — nada más. Antes había además un
  // bucle que prerrenderizaba TODO el catálogo en segundo plano justo
  // después de este primer play; con loops sintéticos de unos KB eso era
  // gratis, pero con canciones reales de varios minutos cada una son varios
  // cientos de MB por buffer, y precargarlas todas de una (aunque fuera "en
  // segundo plano") es la otra mitad del problema de memoria que crasheaba
  // la pestaña. Ahora cada set se descarga/decodifica solo cuando el
  // visitante realmente lo pide (ver MAX_CACHED en audioFor).
  await loadTo(0, true);
  wireDrop();
  addEventListener('resize', drawWave);
};

/* El selector: gira para cambiar de set — el gesto principal ahora que no hay
   crate como única forma de navegar. Mantiene el estado de reproducción. */
function stepSet(dir) {
  const wasPlaying = rig.platter.running;
  const next = (current + dir + SETS.length) % SETS.length;
  loadTo(next, wasPlaying || true);
}

/* ═══════════ MENÚ ═══════════ */
const burger = $('#burger');
const setMenu = on => {
  document.body.classList.toggle('menu', on);
  burger.setAttribute('aria-expanded', on);
  $('#menu').setAttribute('aria-hidden', !on);
};
burger.onclick = () => setMenu(!document.body.classList.contains('menu'));
$$('#menu a').forEach(a => a.onclick = () => setMenu(false));

/* ═══════════ SETLIST / TICKER / GALERÍA ═══════════ */
function renderSetlist() {
  $('#setlist').innerHTML = SETS.map((s, i) => `
  <button class="setrow rev" style="--i:${i}" data-i="${i}">
    <span class="idx">${pad(i + 1)}</span>
    <span class="thumb ${(s.cover || s.yt) ? 'has' : ''}">
      ${s.cover ? `<img src="${esc(s.cover)}" alt="">`
        : s.yt ? `<img src="${esc(thumb(s.yt))}" onerror="this.onerror=null;this.src='${esc(thumbAlt(s.yt))}'" alt="">` : ''}
      <span class="wlmini">WHITE LABEL</span>
    </span>
    <span><h3>${esc(s.title)}</h3><span class="meta">${esc(s.venue)} · ${esc(s.date)} · ${esc(s.bpm)} BPM · ${esc(s.key)}</span></span>
    <span class="dur">${esc(s.dur)}</span>
    <span class="go">Cargar</span>
  </button>`).join('');
}
renderSetlist();

const TICK = ['Fechas abiertas', '<b>●</b> Booking', 'CDMX', 'Techno / Breaks', 'Sets de 2 h', 'Sin género fijo', '<b>●</b> Al aire'];
$('#tick').innerHTML = [...TICK, ...TICK].map(t => `<span>${t}</span>`).join('');

// Recorte fijo, elegido a mano para cada foto (ver README) — solo tiene
// sentido para ESTAS dos fotos. Fotos subidas desde el admin no traen ese
// trabajo de curaduría, así que se muestran simples (object-fit:cover), sin
// z/o inventados al azar.
const FALLBACK_TILES = [
  { c: 't1', src: IMG.deck, z: 2.3, o: '74% 22%', cap: 'Reproductor · detalle' },
  { c: 't2', src: IMG.dj, z: 1.9, o: '38% 8%', cap: 'Cabina · CDMX' },
  { c: 't3', src: IMG.deck, z: 2.4, o: '10% 34%', cap: 'Selector · portadas' },
  { c: 't4', src: IMG.dj, z: 2.1, o: '64% 76%', cap: 'Manos · mezcla' },
  { c: 't5', src: IMG.deck, z: 2.0, o: '66% 88%', cap: 'Cue · 4AM' },
  { c: 't6', src: IMG.dj, z: 1.25, o: '50% 30%', cap: 'Retrato' },
];
let TILES = FALLBACK_TILES;
let galleryIsRemote = false;

function renderGrid() {
  $('#grid').innerHTML = galleryIsRemote
    // Sin recorte curado a mano (t.z/t.o) porque una foto subida por el
    // dueño no lo trae, pero SÍ con el mismo span t1..t6 (se repite en
    // ciclos de 6 para que la rejilla editorial grande/mediana/chica se
    // mantenga sea cual sea el número de fotos) y el mismo data-cap que
    // dispara la animación de caption al hacer hover — sin esos dos, las
    // fotos subidas caían en una casilla de 1 columna sin caption.
    ? TILES.map((t, i) => `
      <figure class="tile t${(i % 6) + 1} rev" style="--i:${i % 3}" data-cap="${esc(t.cap || '')}" data-i="${i}">
        <img src="${esc(t.src)}" alt="${esc(t.cap || '')}">
      </figure>`).join('')
    : TILES.map((t, i) => `
      <figure class="tile ${t.c} rev" style="--i:${i % 3};--z:${t.z};--o:${t.o}" data-cap="${t.cap}" data-i="${i}">
        <img src="${t.src}" alt="${t.cap}">
      </figure>`).join('') + `
      <figure class="tile slot s1 rev"><p>SLOT LIBRE<br>AÑADIR FOTO</p></figure>
      <figure class="tile slot s2 rev"><p>SLOT LIBRE<br>AÑADIR FOTO</p></figure>
      <figure class="tile slot s3 rev"><p>SLOT LIBRE<br>AÑADIR FOTO</p></figure>`;
}
renderGrid();
// El binding de ".rev" para esta primera pasada lo hace el barrido genérico
// más abajo (corre una sola vez, después de que TODO el HTML inicial —
// carril, setlist, galería— ya existe). Solo las actualizaciones en vivo de
// applyGallery() necesitan volver a bindear, porque reemplazan el DOM.

/* ═══════════ REVELADOS ═══════════
   OJO: amount debe ser 0 — los .rev llevan clip-path y Chromium recorta con
   él la caja de intersección, así que el ratio se queda en 0 y cualquier
   umbral mayor no dispara nunca. */
$$('.rev').forEach(el => inView(el, () => el.classList.add('in'), { amount: 0, margin: '0px 0px -12% 0px' }));

inView($('#deck-sec'), () => {
  $('#mini').classList.remove('show');
  return () => { if (entered) $('#mini').classList.add('show'); };
}, { amount: 0, margin: '-70px 0px 0px 0px' });

$('#miniPlay').onclick = () => { if (ctrl) ctrl.togglePlay(); };
$('#miniNext').onclick = () => { if (ctrl) stepSet(1); };

/* ═══════════ LIGHTBOX ═══════════ */
let lbi = 0;
$('#grid').onclick = e => {
  const t = e.target.closest('.tile:not(.slot)'); if (!t) return;
  lbi = +t.dataset.i; openLB();
};
function openLB() {
  $('#lbImg').src = TILES[lbi].src;
  $('#lb').classList.add('open'); document.body.classList.add('locked');
}
$$('[data-lb]').forEach(b => b.onclick = e => {
  e.stopPropagation();
  lbi = (lbi + +b.dataset.lb + TILES.length) % TILES.length; openLB();
});
function closeAll() {
  $$('.modal').forEach(m => m.classList.remove('open'));
  if (ytPlayer) { try { ytPlayer.stopVideo(); } catch {} }
  $('#vidFallback').classList.remove('show');
  document.body.classList.remove('locked');
}
$$('[data-close]').forEach(b => b.onclick = closeAll);
$$('.modal').forEach(m => m.onclick = e => { if (e.target === m) closeAll(); });
addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAll(); setMenu(false); }
  if ($('#lb').classList.contains('open')) {
    if (e.key === 'ArrowRight') { lbi = (lbi + 1) % TILES.length; openLB(); }
    if (e.key === 'ArrowLeft') { lbi = (lbi - 1 + TILES.length) % TILES.length; openLB(); }
  }
});

/* ═══════════ SUPABASE — sets remotos, en vivo ═══════════
   Con red: los sets vienen de la tabla `sets` en Supabase y se repintan solos
   cuando la editas ahí (canal Realtime) — sin recargar la página. Sin red o
   si Supabase no responde: se queda con los de config.js, igual que el audio
   real cae al loop sintético (ver CLAUDE.md, "la trampa del fetch offline").

   A propósito NO se reintenta cargar el set que ya está sonando cuando llega
   una actualización — solo se repintan el carril y el setlist. Interrumpir el
   audio de alguien que está escuchando porque tú editaste una descripción en
   otra pestaña sería peor que la desincronización momentánea. */
function applySets(remote) {
  const prevById = new Map(SETS.map((s, i) => [keyFor(i), s]));
  SETS = remote;
  // Solo se invalida el caché de lo que de verdad cambió (audio o bpm, que
  // son los únicos datos que afectan al buffer ya decodificado/renderizado).
  // Un reordenamiento o una descripción editada no debe tirar audio ya listo.
  for (const key of cache.keys()) {
    const was = prevById.get(key);
    const now = SETS.find((s, i) => keyFor(i) === key);
    if (!now || !was || now.audio !== was.audio || now.bpm !== was.bpm) cache.delete(key);
  }
  current = Math.min(current, SETS.length - 1);
  renderRail();
  renderSetlist();
  $$('#setlist .rev').forEach(el => inView(el, () => el.classList.add('in'), { amount: 0, margin: '0px 0px -12% 0px' }));
}

/* ═══════════ SUPABASE — galería, en vivo ═══════════
   Mismo trato que los sets: si hay fotos en la tabla "gallery" se muestran
   esas (simples, sin el recorte a mano de las 6 fotos fijas); si no hay
   ninguna o no hay red, se queda con las 6 fotos + los 3 "SLOT LIBRE" de
   siempre. */
function applyGallery(rows) {
  galleryIsRemote = rows.length > 0;
  TILES = galleryIsRemote ? rows.map(r => ({ src: r.image_url, cap: r.caption })) : FALLBACK_TILES;
  renderGrid();
  $$('#grid .rev').forEach(el => inView(el, () => el.classList.add('in'), { amount: 0, margin: '0px 0px -12% 0px' }));
}

/* ═══════════ SUPABASE — bio, stats y redes, en vivo ═══════════
   Usa textContent/href, no innerHTML — no hace falta esc() aquí. Si un campo
   viene vacío se deja el texto que ya estaba en el HTML (el de siempre),
   para no mostrar bio en blanco antes de que el dueño llene el panel. */
function applyMeta(meta) {
  const setText = (id, val) => { if (val) { const el = document.getElementById(id); if (el) el.textContent = val; } };
  setText('bioLead', meta.bio_lead);
  setText('bioP1', meta.bio_p1);
  setText('bioP2', meta.bio_p2);
  setText('sYears', meta.stat_years);
  setText('sDates', meta.stat_dates);
  if (meta.contact_email) {
    const mail = document.getElementById('mailLink');
    if (mail) { mail.href = 'mailto:' + meta.contact_email; mail.textContent = meta.contact_email; }
  }
  const links = { linkInstagram: meta.social_instagram, linkSoundcloud: meta.social_soundcloud, linkYoutube: meta.social_youtube, linkRA: meta.social_ra };
  for (const [id, url] of Object.entries(links)) {
    if (!url) continue;
    const el = document.getElementById(id);
    if (el) el.href = url;
  }
}

(async () => {
  try {
    const remote = await fetchSets();
    if (remote.length) applySets(remote);
  } catch (err) { console.warn('Supabase no disponible, uso sets locales:', err.message); }

  try { applyGallery(await fetchGallery()); }
  catch (err) { console.warn('Supabase no disponible, uso galería local:', err.message); }

  try { applyMeta(await fetchMeta()); }
  catch (err) { console.warn('Supabase no disponible, uso bio local:', err.message); }

  subscribeSets(async () => {
    try {
      const remote = await fetchSets();
      if (remote.length) applySets(remote);
    } catch (err) { console.warn('No pude refrescar sets desde Supabase:', err.message); }
  });
  subscribeGallery(async () => {
    try { applyGallery(await fetchGallery()); }
    catch (err) { console.warn('No pude refrescar la galería desde Supabase:', err.message); }
  });
  subscribeMeta(async () => {
    try { applyMeta(await fetchMeta()); }
    catch (err) { console.warn('No pude refrescar la bio desde Supabase:', err.message); }
  });

  initAdmin();
})();
