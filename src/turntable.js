/* ═══════════════════════════════════════════════════════════════════════════
   MOTOR DE VINILO — Web Audio
   ═══════════════════════════════════════════════════════════════════════════

   Por qué no se puede hacer con lo de siempre:

   · YouTube no sirve. Su API solo da seekTo (latencia ~200ms + rebuffer) y
     playbackRate en pasos de 0.25 a 2, SIN negativos. No hay forma de mover el
     audio hacia atrás ni de seguir la mano.
   · Un AudioBufferSourceNode tampoco. Su playbackRate no admite negativos y no
     expone la posición de lectura.

   Lo que sí funciona: leer el AudioBuffer nosotros, muestra a muestra, con la
   posición como variable propia:

        pos += rate            rate = +1 → normal
                               rate =  0 → parado (silencio)
                               rate = -2 → hacia atrás al doble

   Eso es literalmente lo que hacen Serato y Traktor. El rate sale de la
   velocidad angular real del jog, así que rayar, frenar, arrancar y el tempo
   son todos el MISMO parámetro. No hay casos especiales.
   ═══════════════════════════════════════════════════════════════════════════ */

const WORKLET_SRC = `
class Vinyl extends AudioWorkletProcessor {
  constructor(){
    super();
    this.ch = null; this.len = 0; this.pos = 0;
    this.rate = 0; this.target = 0; this.tick = 0;
    this.la = null; this.lb = null;          // región de loop, en muestras
    this.port.onmessage = e => {
      const d = e.data;
      if (d.t === 'buf'){ this.ch = d.ch; this.len = d.ch[0].length; this.pos = 0; this.la = this.lb = null; }
      else if (d.t === 'rate') this.target = d.v;
      else if (d.t === 'pos' && this.len) this.pos = d.v * this.len;
      else if (d.t === 'loop'){ this.la = d.a; this.lb = d.b; }
    };
  }
  process(_i, outputs){
    const out = outputs[0], n = out[0].length;
    if (!this.ch || !this.len){ for (const c of out) c.fill(0); return true; }
    const L = this.len, A = this.la, B = this.lb;
    const looping = A !== null && B !== null && B - A > 64;
    const LL = looping ? B - A : 0;
    // Rampa lineal del rate dentro del bloque. Sin esto el rate salta cada 128
    // muestras (el rAF va a 60Hz, el audio a 48kHz) y se oye un zipper al rayar.
    const r0 = this.rate, dr = (this.target - r0) / n;
    let p = this.pos;
    for (let i = 0; i < n; i++){
      if (looping) p = A + (((p - A) % LL) + LL) % LL;
      else p -= Math.floor(p / L) * L;
      const i0 = p | 0, f = p - i0, i1 = (i0 + 1 >= L) ? 0 : i0 + 1;
      for (let c = 0; c < out.length; c++){
        const s = this.ch[c < this.ch.length ? c : 0];
        out[c][i] = s[i0] + (s[i1] - s[i0]) * f;     // interpolación lineal
      }
      p += r0 + dr * i;
    }
    this.pos = p; this.rate = this.target;
    if ((this.tick = (this.tick + 1) % 8) === 0)
      this.port.postMessage({ t:'pos', v: this.pos / L });
    return true;
  }
}
registerProcessor('vinyl', Vinyl);
`;

/* Se registra una sola vez por AudioContext.
   OJO: en file:// el origen es opaco y el Blob URL no carga → devuelve false y
   los platos caen a ScriptProcessor. En https sube solo a worklet. */
export async function installWorklet(ctx) {
  const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
  try { await ctx.audioWorklet.addModule(url); return true; }
  catch { return false; }
  finally { URL.revokeObjectURL(url); }
}

export class VinylEngine {
  constructor(ctx, useWorklet) {
    this.ctx = ctx;
    this.buffer = null;
    this.position = 0;
    this.mode = useWorklet ? 'worklet' : 'script';
    this._rate = 0; this._pos = 0; this._chans = null;
    this._la = null; this._lb = null;

    if (useWorklet) {
      this.node = new AudioWorkletNode(ctx, 'vinyl', { outputChannelCount: [2] });
      this.node.port.onmessage = e => { if (e.data.t === 'pos') this.position = e.data.v; };
    } else {
      this.node = this._script();
    }
    this.out = this.node;
  }

  _script() {
    const n = this.ctx.createScriptProcessor(1024, 0, 2);
    let tick = 0;
    n.onaudioprocess = e => {
      const ob = e.outputBuffer;
      const o = [ob.getChannelData(0), ob.getChannelData(1)];
      const N = o[0].length;
      if (!this._chans) { o[0].fill(0); o[1].fill(0); return; }
      const L = this._chans[0].length, A = this._la, B = this._lb;
      const looping = A !== null && B !== null && B - A > 64;
      const LL = looping ? B - A : 0;
      let p = this._pos;
      for (let i = 0; i < N; i++) {
        if (looping) p = A + (((p - A) % LL) + LL) % LL;
        else p -= Math.floor(p / L) * L;
        const i0 = p | 0, f = p - i0, i1 = (i0 + 1 >= L) ? 0 : i0 + 1;
        for (let c = 0; c < 2; c++) {
          const s = this._chans[c < this._chans.length ? c : 0];
          o[c][i] = s[i0] + (s[i1] - s[i0]) * f;
        }
        p += this._rate;
      }
      this._pos = p;
      if ((tick = (tick + 1) % 4) === 0) this.position = p / L;
    };
    return n;
  }

  load(audioBuffer) {
    this.buffer = audioBuffer;
    const ch = [];
    for (let c = 0; c < Math.min(2, audioBuffer.numberOfChannels); c++)
      ch.push(audioBuffer.getChannelData(c).slice());
    if (this.mode === 'worklet') {
      // SIN la lista de transferibles, postMessage CLONA cada Float32Array
      // completo al cruzar al hilo del worklet. Para un loop demo de unos
      // segundos eso no se nota; para una canción real de varios minutos son
      // cientos de MB copiados de golpe — eso es lo que congelaba/crasheaba
      // la pestaña al reproducir un set real. Pasar los .buffer como
      // transferables mueve la memoria en vez de copiarla: coste ~0.
      this.node.port.postMessage({ t: 'buf', ch }, ch.map(c => c.buffer));
    }
    else { this._chans = ch; this._pos = 0; }
    this.position = 0; this.clearLoop();
  }

  setRate(v) {
    if (this.mode === 'worklet') this.node.port.postMessage({ t: 'rate', v });
    else this._rate = v;
  }

  seek(p01) {
    this.position = p01;
    if (this.mode === 'worklet') this.node.port.postMessage({ t: 'pos', v: p01 });
    else this._pos = p01 * (this._chans ? this._chans[0].length : 0);
  }

  /* Región de loop, en segundos. */
  setLoop(fromSec, toSec) {
    if (!this.buffer) return;
    const sr = this.buffer.sampleRate;
    const a = Math.round(fromSec * sr), b = Math.round(toSec * sr);
    if (this.mode === 'worklet') this.node.port.postMessage({ t: 'loop', a, b });
    else { this._la = a; this._lb = b; }
  }
  clearLoop() {
    if (this.mode === 'worklet') this.node.port.postMessage({ t: 'loop', a: null, b: null });
    else { this._la = this._lb = null; }
  }

  get duration() { return this.buffer ? this.buffer.duration : 0; }
}

/* ═══════════════════════════════════════════════════════════════════════════
   FÍSICA DEL JOG
   Tracción directa = motor con torque contra la inercia del disco. La velocidad
   persigue al objetivo con constante exponencial: corta al arrancar (torque),
   larga al frenar (inercia). Al agarrar el jog la mano manda; al soltar, el
   motor recupera. TODO el audio sale de aquí: rate = vel / NOMINAL.
   ═══════════════════════════════════════════════════════════════════════════ */

export const NOMINAL = 200;            // °/s = 33⅓ RPM

export class Platter {
  constructor() {
    this.angle = 0; this.vel = 0;
    this.running = false; this.pitch = 0; this.dragging = false;
    this.dir = 1;                    // DIRECTION: 1 adelante, -1 atrás
    this._lastMove = 0;
  }
  get rate() { return this.vel / NOMINAL; }
  // El modelo ya soportaba rate negativo (para rayar) — DIRECTION es el mismo
  // camino: el objetivo del motor apunta al revés en vez de la mano.
  get targetVel() { return this.running ? this.dir * NOMINAL * (1 + this.pitch / 100) : 0; }

  start() { this.running = true; }
  stop() { this.running = false; }
  toggle() { this.running = !this.running; }
  toggleDirection() { this.dir *= -1; }
  grab() { this.dragging = true; this._lastMove = performance.now(); }
  release() { this.dragging = false; }

  push(deltaDeg, dt) {
    this.angle += deltaDeg;
    this.vel = this.vel * 0.45 + (deltaDeg / Math.max(dt, 0.004)) * 0.55;
    this._lastMove = performance.now();
  }

  step(dt) {
    if (this.dragging) {
      // Mano apoyada pero quieta = disco parado. Sin esto el audio seguiría a
      // la última velocidad medida.
      if (performance.now() - this._lastMove > 40) this.vel *= Math.pow(0.02, dt);
    } else {
      const tau = this.targetVel > this.vel ? 0.28 : 0.38;
      this.vel += (this.targetVel - this.vel) * (1 - Math.exp(-dt / tau));
      // Cola infinita: con 0.05°/s tardaba ~5s en "parar". A 1.5°/s frena en
      // ~1.9s y es imperceptible — como uno de verdad.
      if (Math.abs(this.vel) < 1.5 && this.targetVel === 0) this.vel = 0;
    }
    this.angle += this.vel * dt;
    return this.rate;
  }
}
