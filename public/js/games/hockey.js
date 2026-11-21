// NEON HOKEY — masa hokeyi. Telefon ekranı senin yarı sahan: parmağını sürükle, diski rakip kaleye sok.
// İlk 7 golü atan kazanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp } from '../host/gfx.js';

const L = 50;
const R = 1230;
const TOP = 114;
const BOT = 700;
const MID = (L + R) / 2;
const CY = (TOP + BOT) / 2;
const GOAL = 120; // kale yarı yüksekliği
const MR = 40; // raket yarıçapı
const PR = 24; // disk yarıçapı
const MAXV = 1900;
const TARGET = 7;
const SUB = 4;

class HockeyGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.score = [0, 0];
    this.mallets = [this.mkMallet(0), this.mkMallet(1)];
    this.trail = [];
    this.resetPuck(Math.random() < 0.5 ? 0 : 1);
    this.phase = 'play';
    this.phaseT = 0;
    this.lastHit = -1;
    this.hitCool = 0;
    this.info();
    api.setPad(0, { side: 'left' });
    api.setPad(1, { side: 'right' });
  }

  mkMallet(p) {
    const x = p === 0 ? L + 120 : R - 120;
    return { p, x, y: CY, vx: 0, vy: 0, tx: x, ty: CY, flash: 0 };
  }

  resetPuck(side) {
    this.puck = { x: side === 0 ? MID - 180 : MID + 180, y: CY, vx: 0, vy: 0 };
    this.trail = [];
  }

  info() {
    for (const p of [0, 1]) this.api.info(p, `Skor ${this.score[0]} - ${this.score[1]} · ilk ${TARGET} gol`);
  }

  bounds(p) {
    return p === 0 ? [L + MR, MID - MR, TOP + MR, BOT - MR] : [MID + MR, R - MR, TOP + MR, BOT - MR];
  }

  updateMallet(m, dt) {
    const s = this.api.input[m.p];
    const [x0, x1, y0, y1] = this.bounds(m.p);
    const ox = m.x;
    const oy = m.y;
    if (s.touch) {
      // telefon ekranı = kendi yarı saha (ekrandaki gibi)
      m.tx = x0 + s.tx * (x1 - x0);
      m.ty = y0 + s.ty * (y1 - y0);
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const d = Math.hypot(dx, dy);
      const maxStep = 2600 * dt;
      if (d > maxStep) {
        m.x += (dx / d) * maxStep;
        m.y += (dy / d) * maxStep;
      } else {
        m.x = m.tx;
        m.y = m.ty;
      }
    } else {
      const a = this.api.axis(m.p);
      m.x += a.x * 760 * dt;
      m.y += a.y * 760 * dt;
    }
    m.x = clamp(m.x, x0, x1);
    m.y = clamp(m.y, y0, y1);
    m.vx = (m.x - ox) / dt;
    m.vy = (m.y - oy) / dt;
  }

  collideMallet(m) {
    const p = this.puck;
    const dx = p.x - m.x;
    const dy = p.y - m.y;
    const d = Math.hypot(dx, dy);
    const min = MR + PR;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    p.x = m.x + nx * min;
    p.y = m.y + ny * min;
    const rvx = p.vx - m.vx;
    const rvy = p.vy - m.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      p.vx -= 1.9 * vn * nx;
      p.vy -= 1.9 * vn * ny;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAXV) {
        p.vx *= MAXV / sp;
        p.vy *= MAXV / sp;
      }
      if (this.hitCool <= 0) {
        const power = Math.min(1, -vn / 1400);
        this.api.sfx('thock');
        if (power > 0.4) this.parts.burst(p.x - nx * PR, p.y - ny * PR, 6, ['#fff', PCOL[m.p]], { speed: 200 * power, size: 5, life: 0.35, gravity: 0 });
        if (power > 0.6) this.shake.add(3 * power, 0.12);
        this.api.buzz(m.p, 20 + Math.round(power * 30));
        this.hitCool = 0.08;
      }
      m.flash = 0.15;
      this.lastHit = m.p;
    }
  }

  wallCollide() {
    const p = this.puck;
    let hit = false;
    if (p.y - PR < TOP) {
      p.y = TOP + PR;
      p.vy = Math.abs(p.vy) * 0.9;
      hit = true;
    } else if (p.y + PR > BOT) {
      p.y = BOT - PR;
      p.vy = -Math.abs(p.vy) * 0.9;
      hit = true;
    }
    const inMouth = p.y > CY - GOAL && p.y < CY + GOAL;
    if (!inMouth) {
      if (p.x - PR < L) {
        p.x = L + PR;
        p.vx = Math.abs(p.vx) * 0.9;
        hit = true;
      } else if (p.x + PR > R) {
        p.x = R - PR;
        p.vx = -Math.abs(p.vx) * 0.9;
        hit = true;
      }
    } else {
      // kale direkleri
      for (const [px, py] of [[L, CY - GOAL], [L, CY + GOAL], [R, CY - GOAL], [R, CY + GOAL]]) {
        const dx = p.x - px;
        const dy = p.y - py;
        const d = Math.hypot(dx, dy);
        if (d < PR && d > 0) {
          const nx = dx / d;
          const ny = dy / d;
          p.x = px + nx * PR;
          p.y = py + ny * PR;
          const vn = p.vx * nx + p.vy * ny;
          if (vn < 0) {
            p.vx -= 1.9 * vn * nx;
            p.vy -= 1.9 * vn * ny;
          }
          hit = true;
        }
      }
    }
    if (hit && Math.hypot(p.vx, p.vy) > 150) this.api.sfx('bounce');
  }

  goal(scorer) {
    this.score[scorer]++;
    this.phase = 'goal';
    this.phaseT = 1.8;
    this.scorer = scorer;
    const gx = scorer === 0 ? R : L;
    this.parts.burst(gx, CY, 50, [PCOL[scorer], '#fff', '#ffd23f'], { speed: 600, size: 9, life: 1.1, gravity: 300, angle: scorer === 0 ? Math.PI : 0, spread: Math.PI * 1.2 });
    this.shake.add(12, 0.5);
    this.api.sfx('goal');
    this.api.buzz(scorer, 120);
    this.api.buzz(1 - scorer, 300);
    this.info();
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    this.hitCool -= dt;
    for (const m of this.mallets) m.flash = Math.max(0, m.flash - dt);

    if (this.phase === 'goal') {
      this.phaseT -= dt;
      const sd = dt / SUB;
      for (let i = 0; i < SUB; i++) for (const m of this.mallets) this.updateMallet(m, sd);
      if (this.phaseT <= 0) {
        if (this.score[this.scorer] >= TARGET) {
          this.phase = 'done';
          this.api.end({ winner: this.scorer, detail: `Skor ${this.score[0]} - ${this.score[1]}` });
          return;
        }
        this.resetPuck(1 - this.scorer);
        this.phase = 'play';
      }
      return;
    }
    if (this.phase !== 'play') return;

    const sd = dt / SUB;
    const p = this.puck;
    for (let i = 0; i < SUB; i++) {
      for (const m of this.mallets) this.updateMallet(m, sd);
      p.x += p.vx * sd;
      p.y += p.vy * sd;
      const f = 1 - 0.35 * sd;
      p.vx *= f;
      p.vy *= f;
      for (const m of this.mallets) this.collideMallet(m);
      this.wallCollide();
      if (p.x < L - PR * 0.6) return this.goal(1);
      if (p.x > R + PR * 0.6) return this.goal(0);
    }
    this.trail.push([p.x, p.y]);
    if (this.trail.length > 14) this.trail.shift();
  }

  demo() {
    this.puck.x = MID + 140;
    this.puck.y = CY - 90;
    this.trail = Array.from({ length: 12 }, (_, i) => [MID - 100 + i * 20, CY + 60 - i * 12.5]);
    this.mallets[0].x = MID - 260;
    this.mallets[0].y = CY + 120;
    this.mallets[1].y = CY - 160;
    this.score = [3, 2];
  }

  drawTable(g) {
    // gövde
    g.save();
    g.shadowColor = 'rgba(80,180,255,.45)';
    g.shadowBlur = 40;
    rr(g, L - 18, TOP - 18, R - L + 36, BOT - TOP + 36, 34);
    g.fillStyle = '#18324d';
    g.fill();
    g.restore();
    const grad = g.createLinearGradient(0, TOP, 0, BOT);
    grad.addColorStop(0, '#0f3354');
    grad.addColorStop(1, '#0a2440');
    rr(g, L, TOP, R - L, BOT - TOP, 22);
    g.fillStyle = grad;
    g.fill();
    // hava delikleri
    g.fillStyle = 'rgba(160,220,255,.08)';
    for (let x = L + 30; x < R; x += 40) for (let y = TOP + 26; y < BOT; y += 40) g.fillRect(x, y, 3, 3);
    // yarı sahalar renk
    g.fillStyle = rgba(PCOL[0], 0.05);
    g.fillRect(L, TOP, MID - L, BOT - TOP);
    g.fillStyle = rgba(PCOL[1], 0.05);
    g.fillRect(MID, TOP, R - MID, BOT - TOP);
    // çizgiler
    g.save();
    g.shadowBlur = 14;
    g.lineWidth = 4;
    g.shadowColor = '#7fe3ff';
    g.strokeStyle = 'rgba(127,227,255,.6)';
    g.beginPath();
    g.moveTo(MID, TOP);
    g.lineTo(MID, BOT);
    g.stroke();
    g.beginPath();
    g.arc(MID, CY, 90, 0, Math.PI * 2);
    g.stroke();
    for (const p of [0, 1]) {
      g.shadowColor = PCOL[p];
      g.strokeStyle = rgba(PCOL[p], 0.75);
      const gx = p === 0 ? L : R;
      g.beginPath();
      g.arc(gx, CY, GOAL + 40, p === 0 ? -Math.PI / 2 : Math.PI / 2, p === 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
      g.stroke();
    }
    g.restore();
    // kale ağızları
    for (const p of [0, 1]) {
      const gx = p === 0 ? L : R;
      g.save();
      g.shadowColor = PCOL[p];
      g.shadowBlur = 24;
      g.fillStyle = '#05101d';
      g.fillRect(p === 0 ? gx - 22 : gx, CY - GOAL, 22, GOAL * 2);
      g.fillStyle = PCOL[p];
      g.fillRect(p === 0 ? gx - 4 : gx, CY - GOAL - 8, 4, 16);
      g.fillRect(p === 0 ? gx - 4 : gx, CY + GOAL - 8, 4, 16);
      g.restore();
    }
  }

  drawMallet(g, m) {
    const col = PCOL[m.p];
    g.save();
    g.translate(m.x, m.y);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath();
    g.arc(5, 8, MR, 0, Math.PI * 2);
    g.fill();
    g.shadowColor = col;
    g.shadowBlur = 20 + m.flash * 120;
    const grad = g.createRadialGradient(-10, -12, 4, 0, 0, MR);
    grad.addColorStop(0, shade(col, 0.4));
    grad.addColorStop(1, shade(col, -0.25));
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, MR, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = shade(col, -0.5);
    g.lineWidth = 4;
    g.beginPath();
    g.arc(0, 0, MR * 0.62, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = shade(col, 0.15);
    g.beginPath();
    g.arc(0, 0, MR * 0.42, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath();
    g.ellipse(-8, -10, 9, 5, -0.6, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // dokunma hedefi
    const s = this.api.input[m.p];
    if (s.touch) {
      g.strokeStyle = rgba(col, 0.35);
      g.lineWidth = 2;
      g.setLineDash([6, 6]);
      g.beginPath();
      g.arc(m.tx, m.ty, MR * 0.5, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
  }

  draw(g) {
    g.fillStyle = '#081220';
    g.fillRect(0, 0, W, H);
    // skor tabelası
    text(g, this.api.players[0].name, L + 10, 46, { size: 34, color: PCOL[0], weight: 800, align: 'left' });
    text(g, this.api.players[1].name, R - 10, 46, { size: 34, color: PCOL[1], weight: 800, align: 'right' });
    rr(g, MID - 120, 4, 240, 74, 20);
    g.fillStyle = 'rgba(255,255,255,.06)';
    g.fill();
    text(g, String(this.score[0]), MID - 56, 44, { size: 64, color: PCOL[0], weight: 800 });
    text(g, ':', MID, 40, { size: 50, color: '#57538a', weight: 800 });
    text(g, String(this.score[1]), MID + 56, 44, { size: 64, color: PCOL[1], weight: 800 });
    text(g, `ilk ${TARGET} gol kazanır`, MID, 88, { size: 16, color: '#7d97b8', weight: 700 });

    g.save();
    this.shake.apply(g);
    this.drawTable(g);

    // disk izi
    const p = this.puck;
    const sp = Math.hypot(p.vx, p.vy);
    this.trail.forEach(([x, y], i) => {
      const a = (i / this.trail.length) * Math.min(1, sp / 900);
      g.fillStyle = `rgba(255,240,160,${a * 0.35})`;
      g.beginPath();
      g.arc(x, y, PR * (0.4 + (0.6 * i) / this.trail.length), 0, Math.PI * 2);
      g.fill();
    });
    for (const m of this.mallets) this.drawMallet(g, m);
    if (this.phase !== 'goal') {
      g.save();
      g.translate(p.x, p.y);
      g.fillStyle = 'rgba(0,0,0,.35)';
      g.beginPath();
      g.arc(4, 6, PR, 0, Math.PI * 2);
      g.fill();
      g.shadowColor = '#ffe680';
      g.shadowBlur = 24;
      g.fillStyle = '#ffe14d';
      g.beginPath();
      g.arc(0, 0, PR, 0, Math.PI * 2);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = '#fff6c2';
      g.beginPath();
      g.arc(0, 0, PR * 0.62, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ffcf26';
      g.beginPath();
      g.arc(0, 0, PR * 0.32, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
    this.parts.draw(g);
    g.restore();
    this.pops.draw(g);

    if (this.phase === 'goal' && this.phaseT < 1.7) {
      banner(g, 'GOOOL!', `${this.api.players[this.scorer].name} attı  ·  ${this.score[0]} - ${this.score[1]}`, PCOL[this.scorer], 1.7 - this.phaseT);
    }
  }
}

export default {
  id: 'hockey',
  name: 'Neon Hokey',
  icon: '🏒',
  tag: 'Masa hokeyi',
  mode: 'versus',
  color: '#2fc7ff',
  desc: 'Hızlı ve sert bir masa hokeyi maçı. Telefonunun ekranı senin yarı sahan: parmağını sürükledikçe raketin TV’de aynı yere gider.',
  howto: ['Telefon ekranı = sahadaki kendi yarın', 'Parmağını sürükle, raket takip etsin', 'Hızlı kaydırırsan sert vurursun', `İlk ${TARGET} golü atan kazanır`],
  keys: '1. oyuncu WASD · 2. oyuncu Oklar',
  controller: { layout: 'touch', a: null, b: null, padHint: '◀ ▶ ▲ ▼  Parmağını sürükle' },
  create: (api) => new HockeyGame(api),
};
