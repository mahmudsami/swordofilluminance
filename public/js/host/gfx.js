// Ortak çizim yardımcıları. Oyunlar 1280x720 sanal çözünürlükte çizer;
// TV ekranı bunu gerçek çözünürlüğe ölçekler (RES.scale).
export const W = 1280;
export const H = 720;
export const FONT = "'Baloo 2', system-ui, 'Segoe UI', Roboto, sans-serif";
export const PCOL = ['#ff4f7b', '#2fc7ff'];
export const PCOL_DARK = ['#8a1f3e', '#0f5c80'];

// Çizim ölçeği ve kalite: TV uygulaması ayarlar.
// scale: 1 sanal piksel kaç gerçek piksel; low: zayıf cihaz modu (daha az efekt)
export const RES = { scale: 1, low: false };

// ------------------------------------------------------------------ önbellekli sprite'lar
const SPR = new Map();
let sprScale = 0;

function makeCanvas(w, h, paint) {
  const s = RES.scale;
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * s));
  c.height = Math.max(1, Math.ceil(h * s));
  const g = c.getContext('2d');
  g.scale(s, s);
  paint(g);
  c.lw = w;
  c.lh = h;
  return c;
}

// Bir kez çizilip tekrar tekrar kullanılan küçük görüntü (anahtar başına)
export function sprite(key, w, h, paint) {
  if (sprScale !== RES.scale) {
    SPR.clear();
    sprScale = RES.scale;
  }
  let c = SPR.get(key);
  if (!c) {
    c = makeCanvas(w, h, paint);
    SPR.set(key, c);
  }
  return c;
}
export function clearSprites() {
  SPR.clear();
}
// sprite'ı sanal boyutunda çiz (x,y sol üst)
export function blit(g, c, x, y) {
  g.drawImage(c, x, y, c.lw, c.lh);
}
// sprite'ı merkezinden, isteğe bağlı döndürerek çiz
export function blitC(g, c, x, y, ang = 0, sc = 1) {
  if (!ang && sc === 1) {
    g.drawImage(c, x - c.lw / 2, y - c.lh / 2, c.lw, c.lh);
    return;
  }
  g.save();
  g.translate(x, y);
  if (ang) g.rotate(ang);
  if (sc !== 1) g.scale(sc, sc);
  g.drawImage(c, -c.lw / 2, -c.lh / 2, c.lw, c.lh);
  g.restore();
}

// Yumuşak ışıma (shadowBlur yerine; çok daha ucuz)
export function glow(color, r, strength = 0.55) {
  return sprite(`glow|${color}|${r}|${strength}`, r * 2, r * 2, (g) => {
    const gr = g.createRadialGradient(r, r, 0, r, r, r);
    gr.addColorStop(0, rgba(color, strength));
    gr.addColorStop(0.45, rgba(color, strength * 0.35));
    gr.addColorStop(1, rgba(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, r * 2, r * 2);
  });
}

// Statik çizimler için katman: bir kez çizilir, ölçek değişince ya da invalidate() ile yeniden çizilir
export class Layer {
  constructor(w, h, paint) {
    this.w = w;
    this.h = h;
    this.paint = paint;
    this.cv = null;
    this.s = 0;
    this.dirty = true;
  }
  invalidate() {
    this.dirty = true;
  }
  get canvas() {
    if (!this.cv || this.dirty || this.s !== RES.scale) {
      const s = RES.scale;
      if (!this.cv) this.cv = document.createElement('canvas');
      const cw = Math.max(1, Math.ceil(this.w * s));
      const ch = Math.max(1, Math.ceil(this.h * s));
      if (this.cv.width !== cw || this.cv.height !== ch) {
        this.cv.width = cw;
        this.cv.height = ch;
      }
      const g = this.cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cw, ch);
      g.setTransform(s, 0, 0, s, 0, 0);
      this.s = s;
      this.dirty = false;
      this.paint(g);
    }
    return this.cv;
  }
  // katmanın üstüne kalıcı ek çizim yapmak için bağlam
  ctx() {
    const c = this.canvas;
    const g = c.getContext('2d');
    g.setTransform(this.s, 0, 0, this.s, 0, 0);
    return g;
  }
  draw(g, x = 0, y = 0) {
    g.drawImage(this.canvas, x, y, this.w, this.h);
  }
}

// ------------------------------------------------------------------ temel çizim
export function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

export function text(g, s, x, y, o = {}) {
  const { size = 32, color = '#fff', align = 'center', base = 'middle', weight = 700, stroke, sw = 6, alpha = 1 } = o;
  const a0 = g.globalAlpha;
  if (alpha !== 1) g.globalAlpha = a0 * alpha;
  g.font = `${weight} ${Math.round(size)}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = base;
  if (stroke) {
    g.lineJoin = 'round';
    g.lineWidth = sw;
    g.strokeStyle = stroke;
    g.strokeText(s, x, y);
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.globalAlpha = a0;
}

const rgbCache = new Map();
export function hexToRgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
    v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    rgbCache.set(hex, v);
  }
  return v;
}

// amt -1..1 : negatif koyulaştırır, pozitif açar
export function shade(hex, amt) {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// açı farkını -PI..PI aralığına getir
export function angDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// ------------------------------------------------------------------ efektler
export class Particles {
  constructor(max = 700) {
    this.list = [];
    this.max = max;
  }
  burst(x, y, n, color, o = {}) {
    const { speed = 260, life = 0.7, size = 6, gravity = 500, spread = Math.PI * 2, angle = 0, drag = 1.5, shape = 'sq' } = o;
    if (RES.low) n = Math.ceil(n / 2);
    const room = this.max - this.list.length;
    if (room <= 0) return;
    if (n > room) n = room;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      const lf = life * (0.6 + Math.random() * 0.4);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: lf,
        max: lf,
        size: size * (0.6 + Math.random() * 0.6),
        color: Array.isArray(color) ? color[(Math.random() * color.length) | 0] : color,
        gravity, drag, circle: shape === 'circle',
      });
    }
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) {
        L[i] = L[L.length - 1];
        L.pop();
        continue;
      }
      const k = 1 - p.drag * dt;
      p.vx *= k;
      p.vy = p.vy * k + p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }
  draw(g) {
    const L = this.list;
    if (!L.length) return;
    let last = '';
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      const t = p.life / p.max;
      g.globalAlpha = t > 0.6 ? 1 : t / 0.6;
      if (p.color !== last) {
        g.fillStyle = p.color;
        last = p.color;
      }
      const s = p.size * (0.4 + 0.6 * t);
      if (p.circle) {
        g.beginPath();
        g.arc(p.x, p.y, s, 0, 6.2832);
        g.fill();
      } else g.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    g.globalAlpha = 1;
  }
  clear() {
    this.list.length = 0;
  }
}

// Ekranda beliren kısa yazılar ("DÖRTLÜ!", "+3" ...)
export class Popups {
  constructor() {
    this.list = [];
  }
  add(s, x, y, color = '#fff', size = 40, life = 1.1) {
    if (this.list.length > 12) this.list.shift();
    this.list.push({ s, x, y, color, size, life, max: life });
  }
  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.y -= 40 * dt;
    }
    if (this.list.some((p) => p.life <= 0)) this.list = this.list.filter((p) => p.life > 0);
  }
  draw(g) {
    for (const p of this.list) {
      const t = 1 - p.life / p.max;
      const sc = t < 0.15 ? 0.6 + (t / 0.15) * 0.5 : 1.1 - Math.min(0.1, (t - 0.15) * 0.4);
      text(g, p.s, p.x, p.y, { size: p.size * sc, color: p.color, stroke: 'rgba(0,0,0,.6)', sw: 7, weight: 800, alpha: Math.min(1, (p.life / p.max) * 3) });
    }
  }
}

// Sarsıntı efekti
export class Shake {
  constructor() {
    this.t = 0;
    this.mag = 0;
  }
  add(mag, t = 0.3) {
    this.mag = Math.max(this.mag, mag);
    this.t = Math.max(this.t, t);
  }
  update(dt) {
    this.t -= dt;
    if (this.t <= 0) {
      this.t = 0;
      this.mag = 0;
    }
  }
  apply(g) {
    if (this.t > 0) g.translate((Math.random() - 0.5) * this.mag * 2, (Math.random() - 0.5) * this.mag * 2);
  }
}

// Oyun içi büyük duyuru ("RAUNT 2", "ALİ KAZANDI")
export function banner(g, title, sub, color = '#fff', t = 1) {
  const a0 = g.globalAlpha;
  g.globalAlpha = Math.max(0, Math.min(1, t * 4));
  g.fillStyle = 'rgba(8,6,24,.74)';
  g.fillRect(0, H / 2 - 95, W, 190);
  g.fillStyle = color;
  g.fillRect(0, H / 2 - 95, W, 5);
  g.fillRect(0, H / 2 + 90, W, 5);
  text(g, title, W / 2, H / 2 - (sub ? 18 : 0), { size: title.length > 22 ? 64 : 84, color, weight: 800, stroke: 'rgba(0,0,0,.5)', sw: 8 });
  if (sub) text(g, sub, W / 2, H / 2 + 50, { size: 32, color: '#e6e2ff', weight: 600 });
  g.globalAlpha = a0;
}

// Raunt galibiyet noktaları
export function winDots(g, x, y, wins, need, color, align = 'center') {
  const r = 9;
  const gap = 26;
  const total = (need - 1) * gap;
  const sx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  for (let i = 0; i < need; i++) {
    g.beginPath();
    g.arc(sx + i * gap, y, r, 0, Math.PI * 2);
    g.fillStyle = i < wins ? color : 'rgba(255,255,255,.12)';
    g.fill();
    if (i < wins) {
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(255,255,255,.7)';
      g.stroke();
    }
  }
}

// Sevimli göz çifti (karakterler için)
export function eyes(g, x, y, r, lookX = 0, lookY = 0, gap = 0.9) {
  for (const s of [-1, 1]) {
    const ex = x + s * r * gap;
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(ex, y, r * 0.62, r * 0.75, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#141225';
    g.beginPath();
    g.arc(ex + lookX * r * 0.28, y + lookY * r * 0.3, r * 0.34, 0, Math.PI * 2);
    g.fill();
  }
}

// Basit dikey gradyanlı arka plan katmanı
export function bgLayer(top, bottom, extra) {
  return new Layer(W, H, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, top);
    gr.addColorStop(1, bottom);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    if (extra) extra(g);
  });
}
