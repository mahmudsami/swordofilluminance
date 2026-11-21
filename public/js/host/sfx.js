// Küçük sentez ses motoru: dosya yok, her şey WebAudio ile üretiliyor.
let ctx = null;
let master = null;
let noiseBuf = null;
let muted = false;
const last = {};

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  const c = init();
  if (c && c.state === 'suspended') c.resume();
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}
export const isMuted = () => muted;
export const isRunning = () => !!ctx && ctx.state === 'running';

function tone(freq, dur, { type = 'square', vol = 0.2, slide = 0, delay = 0, attack = 0.005 } = {}) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noise(dur, { vol = 0.3, freq = 1200, q = 0.7, type = 'lowpass', slide = 0.3, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(f).connect(g).connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  move: () => tone(420, 0.04, { vol: 0.05, type: 'square' }),
  rotate: () => tone(640, 0.06, { vol: 0.06, type: 'triangle', slide: 1.3 }),
  drop: () => { tone(140, 0.12, { vol: 0.18, type: 'square', slide: 0.5 }); noise(0.08, { vol: 0.12, freq: 900 }); },
  lock: () => tone(220, 0.05, { vol: 0.07, type: 'square' }),
  clear: () => [523, 659, 784].forEach((f, i) => tone(f, 0.12, { vol: 0.1, delay: i * 0.05, type: 'square' })),
  big: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, { vol: 0.12, delay: i * 0.05, type: 'square' })),
  garbage: () => { tone(110, 0.25, { vol: 0.16, type: 'sawtooth', slide: 0.6 }); },
  place: () => tone(300, 0.08, { vol: 0.12, type: 'triangle', slide: 0.7 }),
  boom: () => { noise(0.7, { vol: 0.5, freq: 1600, slide: 0.08 }); tone(90, 0.4, { vol: 0.25, type: 'sine', slide: 0.4 }); },
  smallboom: () => noise(0.25, { vol: 0.3, freq: 2200, slide: 0.15 }),
  shoot: () => { tone(880, 0.09, { vol: 0.08, type: 'square', slide: 0.4 }); },
  hit: () => noise(0.12, { vol: 0.25, freq: 3000, slide: 0.3, type: 'bandpass', q: 1.2 }),
  steel: () => tone(1500, 0.05, { vol: 0.07, type: 'triangle', slide: 0.8 }),
  pickup: () => [880, 1175, 1568].forEach((f, i) => tone(f, 0.1, { vol: 0.09, delay: i * 0.06, type: 'triangle' })),
  power: () => [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.09, { vol: 0.08, delay: i * 0.04, type: 'square' })),
  bounce: () => tone(520, 0.05, { vol: 0.1, type: 'triangle', slide: 0.8 }),
  thock: () => { tone(260, 0.07, { vol: 0.2, type: 'sine', slide: 0.6 }); noise(0.05, { vol: 0.15, freq: 4000, type: 'highpass', slide: 0.9 }); },
  goal: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, { vol: 0.12, delay: i * 0.09, type: 'square' })); noise(0.9, { vol: 0.12, freq: 5000, type: 'highpass', slide: 0.9, delay: 0.1 }); },
  count: () => tone(660, 0.12, { vol: 0.14, type: 'square' }),
  go: () => tone(1320, 0.3, { vol: 0.15, type: 'square' }),
  win: () => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i === 7 ? 0.5 : 0.13, { vol: 0.12, delay: [0, .12, .24, .36, .55, .7, .82, .98][i], type: 'square' })),
  lose: () => [392, 349, 311, 262].forEach((f, i) => tone(f, 0.25, { vol: 0.12, delay: i * 0.18, type: 'triangle' })),
  die: () => { tone(600, 0.5, { vol: 0.14, type: 'sawtooth', slide: 0.15 }); },
  join: () => [659, 988].forEach((f, i) => tone(f, 0.12, { vol: 0.1, delay: i * 0.08, type: 'triangle' })),
  leave: () => [659, 440].forEach((f, i) => tone(f, 0.12, { vol: 0.08, delay: i * 0.08, type: 'triangle' })),
  click: () => tone(900, 0.03, { vol: 0.06, type: 'square' }),
  beep: () => tone(1000, 0.08, { vol: 0.08, type: 'square' }),
  engine: () => tone(80, 0.1, { vol: 0.03, type: 'sawtooth' }),
  skid: () => noise(0.18, { vol: 0.05, freq: 2500, type: 'bandpass', q: 3, slide: 0.8 }),
  crash: () => { noise(0.3, { vol: 0.3, freq: 1800, slide: 0.2 }); tone(120, 0.2, { vol: 0.15, type: 'square', slide: 0.5 }); },
  nitro: () => { noise(0.6, { vol: 0.18, freq: 600, slide: 3, type: 'bandpass', q: 2 }); },
  eat: () => tone(760, 0.07, { vol: 0.1, type: 'square', slide: 1.5 }),
};

export function play(name) {
  if (muted || !ctx || ctx.state !== 'running') return;
  const now = performance.now();
  if (last[name] && now - last[name] < 35) return;
  last[name] = now;
  const f = SOUNDS[name];
  if (f) {
    try { f(); } catch {}
  }
}
