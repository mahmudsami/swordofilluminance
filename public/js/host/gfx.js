// Ortak çizim yardımcıları (oyunlar 1280x720 sanal çözünürlükte çizer)
export const W = 1280;
export const H = 720;
export const FONT = "'Baloo 2', system-ui, 'Segoe UI', Roboto, sans-serif";
export const PCOL = ['#ff4f7b', '#2fc7ff'];
export const PCOL_DARK = ['#8a1f3e', '#0f5c80'];

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  if (g.roundRect) g.roundRect(x, y, w, h, r);
  else g.rect(x, y, w, h);
}

export function text(g, s, x, y, o = {}) {
  const { size = 32, color = '#fff', align = 'center', base = 'middle', weight = 700, stroke, sw = 6, alpha = 1, shadow } = o;
  g.save();
  g.globalAlpha *= alpha;
  g.font = `${weight} ${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = base;
  if (shadow) {
    g.shadowColor = shadow;
    g.shadowBlur = o.blur ?? 18;
  }
  if (stroke) {
    g.lineJoin = 'round';
    g.lineWidth = sw;
    g.strokeStyle = stroke;
    g.strokeText(s, x, y);
  }
  g.fillStyle = color;
  g.fillText(s, x, y);
  g.restore();
}

export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

export class Particles {
  constructor() {
    this.list = [];
  }
  burst(x, y, n, color, o = {}) {
    const { speed = 260, life = 0.7, size = 6, gravity = 500, spread = Math.PI * 2, angle = 0, drag = 1.5, shape = 'sq' } = o;
    for (let i = 0; i < n; i++) {
      const a = angle + (Math.random() - 0.5) * spread;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.list.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: life * (0.6 + Math.random() * 0.4),
        max: life,
        size: size * (0.6 + Math.random() * 0.6),
        color: Array.isArray(color) ? pick(color) : color,
        gravity, drag, shape,
        rot: Math.random() * 6,
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
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt;
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += dt * 6;
    }
  }
  draw(g) {
    for (const p of this.list) {
      const t = p.life / p.max;
      g.globalAlpha = Math.min(1, t * 1.6);
      g.fillStyle = p.color;
      const s = p.size * (0.4 + 0.6 * t);
      if (p.shape === 'circle') {
        g.beginPath();
        g.arc(p.x, p.y, s, 0, Math.PI * 2);
        g.fill();
      } else {
        g.save();
        g.translate(p.x, p.y);
        g.rotate(p.rot);
        g.fillRect(-s / 2, -s / 2, s, s);
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }
}

// Ekranda beliren kısa yazılar ("TETRA!", "+3" ...)
export class Popups {
  constructor() {
    this.list = [];
  }
  add(s, x, y, color = '#fff', size = 40, life = 1.1) {
    this.list.push({ s, x, y, color, size, life, max: life });
  }
  update(dt) {
    for (const p of this.list) {
      p.life -= dt;
      p.y -= 40 * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
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
  g.save();
  g.globalAlpha = Math.min(1, t * 4);
  g.fillStyle = 'rgba(8,6,24,.72)';
  g.fillRect(0, H / 2 - 95, W, 190);
  g.fillStyle = color;
  g.fillRect(0, H / 2 - 95, W, 5);
  g.fillRect(0, H / 2 + 90, W, 5);
  text(g, title, W / 2, H / 2 - (sub ? 18 : 0), { size: 84, color, weight: 800, stroke: 'rgba(0,0,0,.5)', sw: 8 });
  if (sub) text(g, sub, W / 2, H / 2 + 50, { size: 32, color: '#e6e2ff', weight: 600 });
  g.restore();
}

// Raunt galibiyet noktaları
export function winDots(g, x, y, wins, need, color, align = 'center') {
  const r = 9;
  const gap = 26;
  const total = (need - 1) * gap;
  let sx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
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
export function eyes(g, x, y, r, lookX = 0, lookY = 0, gap = 0.9, angry = false) {
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
    if (angry) {
      g.strokeStyle = '#141225';
      g.lineWidth = r * 0.28;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(ex - r * 0.6 * s * -1, y - r * 0.95);
      g.lineTo(ex + r * 0.5 * s * -1, y - r * 0.6);
      g.stroke();
    }
  }
}
