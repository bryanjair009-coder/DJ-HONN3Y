/* ═══════════════════════════════════════════════════════════════════════════
   EL REPRODUCTOR
   ═══════════════════════════════════════════════════════════════════════════

   Se acabó la cabina de dos canales: esto es UN reproductor, fiel a un XDJ de
   mesa. Sin mezcladora, sin EQ, sin crossfader — lo que suena es lo que se ve:
   pantalla, selector, plato, cue, play, tempo. Nada más, porque nada más se
   dibuja (misma regla de siempre: todo control pintado tiene que sonar).

   El selector plateado es el control que de verdad manda: reemplaza al crate
   como forma principal de cambiar de set, tal como el encoder de un
   reproductor real navega la biblioteca.
   ═══════════════════════════════════════════════════════════════════════════ */

const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
const PLAY_ICON  = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24"><path d="M7 4h4v16H7zM13 4h4v16h-4z"/></svg>';

export const controllerHTML = () => `
<div class="player" id="ctrl">
  <div class="screws"><i></i><i></i><i></i><i></i></div>

  <div class="p-top">
    <div class="screen screen--slim" data-screen>
      <div class="scr-row">
        <div class="scr-txt">
          <span class="scr-title" data-title>—</span>
          <span class="scr-meta" data-meta>—</span>
        </div>
        <div class="scr-bpm" data-bpmwrap><span data-bpm>—</span><sup>BPM</sup></div>
      </div>
      <div class="scr-wave" data-wave>
        <canvas data-canvas></canvas>
        <div class="scr-head" data-head></div>
      </div>
      <div class="scr-foot">
        <span class="scr-time" data-time>00:00</span>
        <span class="scr-air">En vivo</span>
      </div>
    </div>

    <div class="selector-col">
      <span class="lbl">Sets</span>
      <div class="selector" data-selector role="slider" tabindex="0"
           aria-label="Selector: arrastra o usa las flechas para cambiar de set"
           aria-valuemin="1" aria-valuenow="1"></div>
      <span class="sel-readout" data-selnum>01/01</span>
    </div>
  </div>

  <div class="p-main">
    <div class="p-left">
      <button class="dirbtn" data-dir aria-pressed="false">Direction</button>
      <div class="searchpair">
        <button data-search="-1" aria-label="Retroceder">◀◀</button>
        <button data-search="1" aria-label="Avanzar">▶▶</button>
      </div>
      <div class="transport">
        <button class="tbig tbig--cue" data-cue aria-label="Cue">Cue</button>
        <button class="tbig tbig--play" data-play aria-label="Play / Pause">${PLAY_ICON}</button>
      </div>
    </div>

    <div class="jogzone">
      <div class="jog" data-jog role="slider" tabindex="0"
           aria-label="Plato: arrastra para rayar, espacio para reproducir"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
        <div class="jog-grip"></div>
        <div class="jog-face" data-face><div class="jog-ticks"></div></div>
        <div class="jog-sheen"></div>
        <div class="jog-tri" data-tri></div>
        <div class="jog-hub"><img data-src="steel" alt=""></div>
      </div>
    </div>

    <div class="p-right">
      <span class="lbl">Tempo</span>
      <div class="tslot">
        <div class="tticks" aria-hidden="true"></div>
        <input type="range" data-tempo min="-8" max="8" step="0.1" value="0" aria-label="Tempo, por ciento">
      </div>
      <button class="tval" data-tval title="Volver a 0.0">+0.0</button>
    </div>
  </div>

  <div class="p-brand">
    <img data-src="steel" alt=""><b>HONN3Y</b><span>Reproductor · XDJ</span>
  </div>
</div>`;

/* ═══════════════════════════════════════════════════════════════════════════
   CABLEADO
   ═══════════════════════════════════════════════════════════════════════════ */
export class Controller {
  constructor(root, rig, hooks = {}) {
    this.root = root; this.rig = rig; this.hooks = hooks;
    this.q = sel => root.querySelector(sel);
    this._wireTransport();
    this._wireJog();
    this._wireTempo();
    this._wireDirection();
    this._wireSearch();
    this._wireSelector();
  }

  /* ── CUE al estilo CDJ: mantener = suena desde el cue; soltar = vuelve y
     para. Si está parado, fija el cue donde esté la aguja. ── */
  _wireTransport() {
    const { rig } = this;
    this.q('[data-play]').onclick = () => this.togglePlay();

    const cueBtn = this.q('[data-cue]');
    cueBtn.addEventListener('pointerdown', e => {
      e.preventDefault(); rig.resume();
      if (!rig.platter.running) rig.cue = rig.engine.position;
      rig.engine.seek(rig.cue);
      rig.platter.start(); cueBtn.classList.add('on');
      this.paint();
    });
    const cueUp = () => {
      if (!cueBtn.classList.contains('on')) return;
      cueBtn.classList.remove('on');
      rig.platter.stop(); rig.engine.seek(rig.cue);
      this.paint();
    };
    cueBtn.addEventListener('pointerup', cueUp);
    cueBtn.addEventListener('pointerleave', cueUp);
    cueBtn.addEventListener('pointercancel', cueUp);
  }

  togglePlay() {
    this.rig.resume();
    this.rig.platter.toggle();
    this.paint();
  }

  /* ── el jog: la mano manda ── */
  _wireJog() {
    const { rig } = this;
    const jog = this.q('[data-jog]');
    const ang = e => {
      const r = jog.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };
    let a0 = 0, t0 = 0;

    jog.addEventListener('pointerdown', e => {
      e.preventDefault(); rig.resume();
      jog.setPointerCapture(e.pointerId);
      rig.platter.grab(); a0 = ang(e); t0 = performance.now();
      jog.classList.add('grabbing'); document.body.classList.add('scratching');
    });
    jog.addEventListener('pointermove', e => {
      if (!rig.platter.dragging) return;
      let d = ang(e) - a0;
      if (d > 180) d -= 360; if (d < -180) d += 360;
      const now = performance.now();
      rig.platter.push(d, (now - t0) / 1000);
      a0 = ang(e); t0 = now;
      // NO se hace seek aquí: el rate ya es vel/NOMINAL y el motor mueve la
      // posición solo. Ver turntable.js.
    });
    const end = () => {
      if (!rig.platter.dragging) return;
      rig.platter.release();
      jog.classList.remove('grabbing');
      document.body.classList.remove('scratching');
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => jog.addEventListener(ev, end));

    jog.addEventListener('keydown', e => {
      if (e.key === ' ') { e.preventDefault(); this.togglePlay(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const d = e.key === 'ArrowRight' ? 0.02 : -0.02;
        rig.engine.seek(((rig.engine.position + d) % 1 + 1) % 1);
      }
    });

    this.q('[data-wave]').onclick = e => {
      if (!rig.engine.duration) return;
      const r = e.currentTarget.getBoundingClientRect();
      rig.engine.seek(clamp((e.clientX - r.left) / r.width, 0, 1));
    };
  }

  _wireTempo() {
    const { rig } = this;
    const t = this.q('[data-tempo]');
    t.addEventListener('input', () => { rig.platter.pitch = +t.value; this.paint(); });
    this.q('[data-tval]').onclick = () => { rig.platter.pitch = 0; t.value = 0; this.paint(); };
  }

  /* ── DIRECTION: invierte el sentido del plato. El modelo de rate ya admite
     valores negativos (rayar), así que esto es el mismo camino, no un caso
     especial: el objetivo del motor apunta al revés. ── */
  _wireDirection() {
    const { rig } = this;
    const btn = this.q('[data-dir]'), jog = this.q('[data-jog]');
    btn.onclick = () => {
      rig.platter.toggleDirection();
      const rev = rig.platter.dir < 0;
      btn.classList.toggle('on', rev); btn.setAttribute('aria-pressed', rev);
      jog.classList.toggle('rev', rev);
    };
  }

  /* ── SEARCH: mantener pulsado busca hacia delante o atrás ── */
  _wireSearch() {
    const { rig } = this;
    this.root.querySelectorAll('[data-search]').forEach(btn => {
      const dir = +btn.dataset.search;
      let iv = null;
      const nudge = () => {
        if (!rig.engine.duration) return;
        rig.engine.seek(((rig.engine.position + dir * 0.012) % 1 + 1) % 1);
      };
      const startHold = e => {
        e.preventDefault(); rig.resume();
        btn.classList.add('active'); nudge();
        iv = setInterval(nudge, 55);
      };
      const stopHold = () => { btn.classList.remove('active'); clearInterval(iv); iv = null; };
      btn.addEventListener('pointerdown', startHold);
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stopHold));
    });
  }

  /* ── SELECTOR: el mando plateado. Arrastrar en vertical cambia de set —
     igual que el encoder de navegación de un reproductor real. Cada ~26px de
     arrastre es un "clic" del selector; el resto es giro continuo. ── */
  _wireSelector() {
    const el = this.q('[data-selector]');
    let acc = 0, rot = 0, y0 = 0;

    const step = dir => {
      el.classList.add('grabbing');
      this.hooks.onStep?.(dir);
    };

    el.addEventListener('pointerdown', e => {
      e.preventDefault(); el.setPointerCapture(e.pointerId);
      y0 = e.clientY; acc = 0; el.classList.add('grabbing');
    });
    el.addEventListener('pointermove', e => {
      if (!el.hasPointerCapture(e.pointerId)) return;
      const dy = y0 - e.clientY; y0 = e.clientY;
      acc += dy; rot += dy * 0.7;
      el.style.transform = `rotate(${rot}deg)`;
      const STEP = 26;
      while (Math.abs(acc) >= STEP) {
        const dir = acc > 0 ? 1 : -1;
        acc -= dir * STEP;
        step(dir);
      }
    });
    el.addEventListener('pointerup', () => el.classList.remove('grabbing'));
    el.addEventListener('pointercancel', () => el.classList.remove('grabbing'));
    el.addEventListener('click', e => { if (Math.abs(acc) < 2) step(1); });
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    });
  }

  /* ── pintar el estado del reproductor ── */
  paint() {
    const { rig } = this;
    const on = rig.platter.running;
    document.body.classList.toggle('live', on);
    this.q('[data-play]').innerHTML = on ? PAUSE_ICON : PLAY_ICON;
    this.q('[data-tval]').textContent = (rig.platter.pitch >= 0 ? '+' : '') + rig.platter.pitch.toFixed(1);
    this.q('[data-bpm]').textContent = rig.set ? rig.bpm.toFixed(1) : '—';
    this.hooks.onState?.();
  }
}
