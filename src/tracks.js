/* ═══════════════════════════════════════════════════════════════════════════
   PISTAS DEMO PROCEDURALES
   ═══════════════════════════════════════════════════════════════════════════
   Un tornamesa sin audio no se puede probar, y no hay archivos todavía. Así que
   se sintetiza un loop de techno con OfflineAudioContext: bombo, hats, clap,
   bajo y un stab. Cada set usa su propio BPM y su propia semilla, así que suenan
   distintos entre sí.

   Es DEMO explícito, no relleno disimulado. En cuanto haya un mp3 (por URL o
   arrastrándolo al plato) esto desaparece.

   El truco del loop sin costura: se renderiza más largo que el loop y la cola
   que sobra se suma al principio. Si no, el bombo del último tiempo se corta en
   seco y se oye un click en cada vuelta.
   ═══════════════════════════════════════════════════════════════════════════ */

/* PRNG con semilla: mismo set → mismo loop siempre */
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5;  s >>>= 0;
    return s / 4294967296;
  };
}

function noise(ctx, dur = 1) {
  const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function kick(ctx, out, t) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(128, t);
  o.frequency.exponentialRampToValueAtTime(43, t + 0.055);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1.0, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.30);
  o.connect(g).connect(out); o.start(t); o.stop(t + 0.35);
  // click de ataque: sin esto el bombo no corta la mezcla
  const c = ctx.createBufferSource(), cg = ctx.createGain(), hp = ctx.createBiquadFilter();
  c.buffer = ctx._noise; hp.type = 'highpass'; hp.frequency.value = 1200;
  cg.gain.setValueAtTime(0.35, t); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.008);
  c.connect(hp).connect(cg).connect(out); c.start(t); c.stop(t + 0.02);
}

function hat(ctx, out, t, open, lvl) {
  const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = ctx._noise;
  hp.type = 'highpass'; hp.frequency.value = open ? 6000 : 8200;
  g.gain.setValueAtTime(lvl, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + (open ? 0.17 : 0.032));
  s.connect(hp).connect(g).connect(out); s.start(t); s.stop(t + 0.25);
}

function clap(ctx, out, t) {
  for (let i = 0; i < 3; i++) {
    const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    const tt = t + i * 0.010;
    s.buffer = ctx._noise;
    bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.2;
    g.gain.setValueAtTime(0.42, tt);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.045);
    s.connect(bp).connect(g).connect(out); s.start(tt); s.stop(tt + 0.2);
  }
  const s = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = ctx._noise;
  bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 0.9;
  g.gain.setValueAtTime(0.26, t + 0.03);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
  s.connect(bp).connect(g).connect(out); s.start(t + 0.03); s.stop(t + 0.3);
}

function bass(ctx, out, t, dur, freq) {
  const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = freq;
  f.type = 'lowpass'; f.Q.value = 7;
  f.frequency.setValueAtTime(170, t);
  f.frequency.exponentialRampToValueAtTime(1100, t + 0.025);
  f.frequency.exponentialRampToValueAtTime(190, t + dur * 0.85);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.42, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}

function stab(ctx, out, t, dur, root) {
  [0, 3, 7, 10].forEach(semi => {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square';
    o.frequency.value = root * Math.pow(2, semi / 12);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.055, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
  });
}

/**
 * Renderiza un loop de techno.
 * @param {number} bpm   tempo
 * @param {number} seed  semilla: mismo número → mismo loop
 * @param {number} bars  compases (4/4)
 */
export async function renderLoop({ bpm = 128, seed = 1, bars = 4, sampleRate = 44100 } = {}) {
  const beat = 60 / bpm;
  const dur = bars * 4 * beat;
  const TAIL = 0.6;                                   // margen para las colas
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil((dur + TAIL) * sampleRate), sampleRate);
  ctx._noise = noise(ctx, 1);

  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  const R = rng(seed);
  const root = 41.2 * Math.pow(2, Math.floor(R() * 3) / 12);   // E1 y vecinos
  const sixteenth = beat / 4;
  const openHatSlot = 2 + Math.floor(R() * 2);

  for (let b = 0; b < bars * 4; b++) {
    const t = b * beat;
    kick(ctx, master, t);                                       // four to the floor
    if (b % 4 === 1 || b % 4 === 3) clap(ctx, master, t);
    for (let h = 0; h < 4; h++) {
      const th = t + h * sixteenth;
      const open = h === openHatSlot && (b % 2 === 1);
      if (h % 2 === 1 || R() > 0.62) hat(ctx, master, th, open, open ? 0.18 : 0.10 + R() * 0.05);
    }
    for (let s = 0; s < 4; s++) {
      if (s === 0) continue;                                    // hueco para el bombo
      if (R() > 0.42) bass(ctx, master, t + s * sixteenth, sixteenth * 0.85, root);
    }
    if (b % 8 === 6 && R() > 0.3) stab(ctx, master, t + beat / 2, beat * 0.7, root * 4);
  }

  const rendered = await ctx.startRendering();

  // Plegar la cola sobre el principio → loop sin click en la vuelta.
  // El buffer de salida lo fabrica el PROPIO OfflineAudioContext: antes se creaba
  // un AudioContext de usar y tirar solo para esto, y a partir del segundo plato
  // el navegador dejaba de concederlos y la carga se colgaba sin lanzar error.
  const N = Math.round(dur * sampleRate);
  const outBuf = ctx.createBuffer(2, N, sampleRate);
  const tailN = rendered.length - N;
  for (let c = 0; c < 2; c++) {
    const src = rendered.getChannelData(c);
    const dst = outBuf.getChannelData(c);
    dst.set(src.subarray(0, N));
    for (let i = 0; i < tailN && i < N; i++) dst[i] += src[N + i];
  }
  return outBuf;
}
