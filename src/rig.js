/* ═══════════════════════════════════════════════════════════════════════════
   REPRODUCTOR — un plato, sin mezcladora
   ═══════════════════════════════════════════════════════════════════════════
   Se quitó la mezcladora a propósito: la referencia ya no es un DJ mezclando
   dos canales, es UN reproductor — un XDJ, no un mixer. Así que no hay EQ, no
   hay crossfader, no hay dos platos. Lo que suena es lo que se ve: plato →
   volumen → limitador → salida. Nada más, porque nada más se dibuja.

     vinilo → volumen → limitador (tanh) → salida
   ═══════════════════════════════════════════════════════════════════════════ */

import { VinylEngine, Platter, installWorklet } from './turntable.js';

function limiterCurve() {
  const c = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    c[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
  }
  return c;
}

export class Rig {
  constructor() { this.ctx = null; this.deck = null; this.useWorklet = false; }

  /* Solo tras un gesto del usuario: el navegador no deja crear un AudioContext
     sonando antes. Por eso existe la puerta de ENTRAR. */
  async init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.useWorklet = await installWorklet(ctx);

    const lim = ctx.createWaveShaper(); lim.curve = limiterCurve();
    lim.connect(ctx.destination);

    this.engine = new VinylEngine(ctx, this.useWorklet);
    this.platter = new Platter();
    this.volume = ctx.createGain(); this.volume.gain.value = 0.85;
    this.engine.out.connect(this.volume).connect(lim);

    this.set = null;
    this.cue = 0;
    return this.useWorklet ? 'worklet' : 'script';
  }

  load(buffer, set) {
    this.engine.load(buffer);
    this.set = set;
    this.cue = 0;
  }

  setVolume(v) { this.volume.gain.setTargetAtTime(v * 0.85, this.ctx.currentTime, 0.01); }

  get bpm() { return this.set ? (+this.set.bpm || 0) * (1 + this.platter.pitch / 100) : 0; }

  async decode(arrayBuffer) { return this.ctx.decodeAudioData(arrayBuffer); }
  resume() { if (this.ctx?.state === 'suspended') this.ctx.resume(); }
}
