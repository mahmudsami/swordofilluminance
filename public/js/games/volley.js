// PLAJ VOLEYBOLU — iki yarım-daire karakter, file ve yüzen bir top.
// Top senin sahanda yere düşerse rakip sayı alır. 7 sayıya (2 fark) ulaşan kazanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp, sprite, Layer, glow } from '../host/gfx.js';

const GROUND = 640;
const NX = W / 2;
const NW = 10;
const NTOP = 462;
const BR = 64; // karakter yarıçapı
const R = 24; // top yarıçapı
const GRAV = 2000;
const BGRAV = 640;
const TARGET = 7;
const CAP = 11;

class VolleyGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.score = [0, 0];
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.blobs = [0, 1].map((p) => ({ p, x: p === 0 ? 320 : W - 320, y: GROUND, vx: 0, vy: 0, ground: true }));
    this.serve(Math.random() < 0.5 ? 0 : 1);
    this.info();
  }

  info() {
    for (const p of [0, 1]) this.api.info(p, `Skor ${this.score[0]} - ${this.score[1]} · ${TARGET} sayı (2 fark)`);
  }

  serve(p) {
    this.server = p;
    for (const b of this.blobs) {
      b.x = b.p === 0 ? 320 : W - 320;
      b.y = GROUND;
      b.vx = b.vy = 0;
    }
    this.ball = { x: this.blobs[p].x, y: 260, vx: 0, vy: 0, ang: 0 };
    this.phase = 'serve';
    this.phaseT = 0.9;
    this.touches = [0, 0];
    this.lastSide = p;
  }

  bounds(p) {
    return p === 0 ? [BR, NX - NW / 2 - BR] : [NX + NW / 2 + BR, W - BR];
  }

  onKey(p, k, down) {
    if (!down) return;
    const b = this.blobs[p];
    if ((k === 'a' || k === 'up') && b.ground && this.phase !== 'point') {
      b.vy = -800;
      b.ground = false;
      this.api.sfx('rotate');
    }
  }

  updateBlob(b, dt) {
    const s = this.api.input[b.p];
    let dir = (s.right ? 1 : 0) - (s.left ? 1 : 0);
    if (!dir && Math.abs(s.sx) > 0.25) dir = Math.sign(s.sx);
    b.vx += (dir * 460 - b.vx) * Math.min(1, dt * (b.ground ? 16 : 8));
    b.vy += GRAV * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.y >= GROUND) {
      b.y = GROUND;
      b.vy = 0;
      b.ground = true;
    }
    const [x0, x1] = this.bounds(b.p);
    if (b.x < x0) {
      b.x = x0;
      b.vx = 0;
    }
    if (b.x > x1) {
      b.x = x1;
      b.vx = 0;
    }
  }

  ballVsBlob(b) {
    const bl = this.ball;
    const dx = bl.x - b.x;
    const dy = bl.y - b.y;
    const d = Math.hypot(dx, dy);
    const min = BR + R;
    if (d >= min || d === 0) return;
    let nx = dx / d;
    let ny = dy / d;
    // karakter yarım daire: alt kısımdan çarpışmayı yukarı yönlendir
    if (ny > -0.15) {
      ny = -0.15;
      const l = Math.hypot(nx, ny);
      nx /= l;
      ny /= l;
    }
    bl.x = b.x + nx * min;
    bl.y = b.y + ny * min;
    const rvx = bl.vx - b.vx;
    const rvy = bl.vy - b.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      bl.vx -= 1.85 * vn * nx;
      bl.vy -= 1.85 * vn * ny;
      if (bl.vy > -340) bl.vy = -340; // her dokunuş topu biraz yükseltir
      this.api.sfx('thock');
      this.api.buzz(b.p, 25);
      this.parts.burst(bl.x - nx * R, bl.y - ny * R, 5, ['#fff', '#ffe9a8'], { speed: 160, size: 4, life: 0.3, gravity: 0 });
    }
  }

  ballVsRect(x0, y0, x1, y1) {
    const bl = this.ball;
    const px = clamp(bl.x, x0, x1);
    const py = clamp(bl.y, y0, y1);
    const dx = bl.x - px;
    const dy = bl.y - py;
    const d = Math.hypot(dx, dy);
    if (d >= R) return;
    let nx;
    let ny;
    if (d === 0) {
      nx = bl.x < (x0 + x1) / 2 ? -1 : 1;
      ny = 0;
    } else {
      nx = dx / d;
      ny = dy / d;
    }
    bl.x = px + nx * R;
    bl.y = py + ny * R;
    const vn = bl.vx * nx + bl.vy * ny;
    if (vn < 0) {
      bl.vx -= 1.7 * vn * nx;
      bl.vy -= 1.7 * vn * ny;
      this.api.sfx('bounce');
    }
  }

  point(winner) {
    this.score[winner]++;
    this.phase = 'point';
    this.phaseT = 1.6;
    this.pointWinner = winner;
    this.parts.burst(this.ball.x, GROUND - 6, 26, ['#f3d9a0', '#e6c27a', '#fff'], { speed: 300, size: 7, life: 0.8, gravity: 600, angle: -Math.PI / 2, spread: Math.PI });
    this.shake.add(6, 0.25);
    this.api.sfx('goal');
    this.api.buzz(winner, 80);
    this.api.buzz(1 - winner, 250);
    this.info();
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    for (const b of this.blobs) this.updateBlob(b, dt);

    if (this.phase === 'point') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const [a, b] = this.score;
        const top = Math.max(a, b);
        if ((top >= TARGET && Math.abs(a - b) >= 2) || top >= CAP) {
          this.phase = 'done';
          this.api.end({ winner: a > b ? 0 : 1, detail: `Skor ${a} - ${b}` });
          return;
        }
        this.serve(this.pointWinner);
      }
      return;
    }
    if (this.phase === 'serve') {
      this.phaseT -= dt;
      if (this.phaseT > 0) {
        this.ball.x = this.blobs[this.server].x;
        return;
      }
      this.phase = 'play';
    }

    const SUB = 3;
    const sd = dt / SUB;
    const bl = this.ball;
    for (let i = 0; i < SUB; i++) {
      bl.vy += BGRAV * sd;
      bl.x += bl.vx * sd;
      bl.y += bl.vy * sd;
      bl.ang += (bl.vx / R) * sd;
      if (bl.x - R < 0) {
        bl.x = R;
        bl.vx = Math.abs(bl.vx) * 0.9;
        this.api.sfx('bounce');
      }
      if (bl.x + R > W) {
        bl.x = W - R;
        bl.vx = -Math.abs(bl.vx) * 0.9;
        this.api.sfx('bounce');
      }
      this.ballVsRect(NX - NW / 2, NTOP, NX + NW / 2, GROUND);
      for (const b of this.blobs) this.ballVsBlob(b);
      const sp = Math.hypot(bl.vx, bl.vy);
      if (sp > 1050) {
        bl.vx *= 1050 / sp;
        bl.vy *= 1050 / sp;
      }
      if (bl.y + R >= GROUND) {
        bl.y = GROUND - R;
        this.point(bl.x < NX ? 1 : 0);
        return;
      }
    }
  }

  demo() {
    this.ball.x = 470;
    this.ball.y = 330;
    this.ball.ang = 0.5;
    this.blobs[0].x = 430;
    this.blobs[0].y = GROUND - 60;
    this.score = [4, 3];
    this.phase = 'play';
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    const sky = g.createLinearGradient(0, 0, 0, 430);
    sky.addColorStop(0, '#3aa6e8');
    sky.addColorStop(1, '#bfe9ff');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.drawImage(glow('#fff5c2', 160, 0.8), 980 - 160, 120 - 160, 320, 320);
    g.fillStyle = '#fff1a8';
    g.beginPath();
    g.arc(980, 120, 52, 0, Math.PI * 2);
    g.fill();
    // bulutlar
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (const [x, y, s] of [[180, 110, 1], [470, 70, 0.8], [760, 150, 0.9]]) {
      g.beginPath();
      g.arc(x, y, 30 * s, 0, Math.PI * 2);
      g.arc(x + 34 * s, y - 12 * s, 36 * s, 0, Math.PI * 2);
      g.arc(x + 70 * s, y, 28 * s, 0, Math.PI * 2);
      g.fill();
    }
    // deniz
    const sea = g.createLinearGradient(0, 400, 0, 520);
    sea.addColorStop(0, '#1d7fc4');
    sea.addColorStop(1, '#41b6e6');
    g.fillStyle = sea;
    g.fillRect(0, 400, W, 130);
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 3;
    g.beginPath();
    for (let x = 0; x < W; x += 60) {
      g.moveTo(x, 450 + (x % 120 ? 6 : 0));
      g.quadraticCurveTo(x + 15, 444, x + 30, 450);
    }
    g.stroke();
    // kum
    const sand = g.createLinearGradient(0, 520, 0, H);
    sand.addColorStop(0, '#f3d9a0');
    sand.addColorStop(1, '#d9b46b');
    g.fillStyle = sand;
    g.fillRect(0, 520, W, H - 520);
    g.fillStyle = 'rgba(160,120,60,.25)';
    for (let i = 0; i < 140; i++) g.fillRect((i * 97) % W, 530 + ((i * 53) % 180), 3, 2);
    // file ve direkler
    g.fillStyle = '#5b4632';
    g.fillRect(NX - NW / 2, NTOP - 6, NW, GROUND - NTOP + 6);
    g.fillStyle = 'rgba(255,255,255,.9)';
    g.fillRect(NX - 26, NTOP - 6, 52, 8);
    g.strokeStyle = 'rgba(255,255,255,.6)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let y = NTOP + 6; y < NTOP + 90; y += 12) {
      g.moveTo(NX - 24, y);
      g.lineTo(NX + 24, y);
    }
    for (let x = NX - 24; x <= NX + 24; x += 12) {
      g.moveTo(x, NTOP + 2);
      g.lineTo(x, NTOP + 88);
    }
    g.stroke();
    text(g, this.api.players[0].name, 30, 36, { size: 32, color: shade(PCOL[0], -0.2), weight: 800, align: 'left', stroke: '#fff', sw: 6 });
    text(g, this.api.players[1].name, W - 30, 36, { size: 32, color: shade(PCOL[1], -0.25), weight: 800, align: 'right', stroke: '#fff', sw: 6 });
    rr(g, W / 2 - 110, 10, 220, 70, 20);
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fill();
  }

  blobSprite(p) {
    const col = PCOL[p];
    return sprite(`vb|${col}`, BR * 2 + 8, BR + 8, (g) => {
      const cx = BR + 4;
      const cy = BR + 4;
      const grad = g.createLinearGradient(0, 4, 0, cy);
      grad.addColorStop(0, shade(col, 0.3));
      grad.addColorStop(1, shade(col, -0.2));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, BR, Math.PI, Math.PI * 2);
      g.closePath();
      g.fill();
      g.strokeStyle = shade(col, -0.5);
      g.lineWidth = 3;
      g.stroke();
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.ellipse(cx - 26, cy - 40, 14, 7, -0.6, 0, Math.PI * 2);
      g.fill();
    });
  }

  ballSprite() {
    return sprite('vball', R * 2 + 4, R * 2 + 4, (g) => {
      const c = R + 2;
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(c, c, R, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(c - R * 0.9, c, R * 1.1, -0.9, 0.9);
      g.stroke();
      g.strokeStyle = '#2fc7ff';
      g.beginPath();
      g.arc(c + R * 0.9, c, R * 1.1, Math.PI - 0.9, Math.PI + 0.9);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.25)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(c, c, R - 0.5, 0, Math.PI * 2);
      g.stroke();
    });
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    const bl = this.ball;
    const bh = GROUND - bl.y;
    g.fillStyle = `rgba(90,60,20,${0.3 - Math.min(0.22, bh / 1500)})`;
    g.beginPath();
    g.ellipse(bl.x, GROUND + 4, R * (1 - Math.min(0.6, bh / 900)), 6, 0, 0, Math.PI * 2);
    g.fill();
    for (const b of this.blobs) {
      const h = GROUND - b.y;
      g.fillStyle = `rgba(90,60,20,${0.3 - Math.min(0.2, h / 700)})`;
      g.beginPath();
      g.ellipse(b.x, GROUND + 5, BR * (1 - Math.min(0.4, h / 600)), 9, 0, 0, Math.PI * 2);
      g.fill();
      const spr = this.blobSprite(b.p);
      g.drawImage(spr, b.x - BR - 4, b.y - BR - 4, spr.lw, spr.lh);
      // göz topa bakar
      const ex = b.x + (b.p === 0 ? 22 : -22);
      const ey = b.y - 38;
      const ang = Math.atan2(bl.y - ey, bl.x - ex);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex, ey, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#141225';
      g.beginPath();
      g.arc(ex + Math.cos(ang) * 5, ey + Math.sin(ang) * 5, 6, 0, Math.PI * 2);
      g.fill();
    }
    if (this.phase !== 'point' || this.phaseT > 1.3) {
      const spr = this.ballSprite();
      g.save();
      g.translate(bl.x, bl.y);
      g.rotate(bl.ang);
      g.drawImage(spr, -spr.lw / 2, -spr.lh / 2, spr.lw, spr.lh);
      g.restore();
    }
    this.parts.draw(g);
    g.restore();
    text(g, String(this.score[0]), W / 2 - 50, 46, { size: 52, color: shade(PCOL[0], -0.2), weight: 800 });
    text(g, '-', W / 2, 44, { size: 40, color: '#7a6a50', weight: 800 });
    text(g, String(this.score[1]), W / 2 + 50, 46, { size: 52, color: shade(PCOL[1], -0.25), weight: 800 });
    if (this.phase === 'serve') text(g, `${this.api.players[this.server].name} servis atıyor`, W / 2, 110, { size: 26, color: '#fff', weight: 800, stroke: 'rgba(0,0,0,.45)', sw: 6 });
    this.pops.draw(g);
    if (this.phase === 'point' && this.phaseT < 1.5) banner(g, `${this.api.players[this.pointWinner].name} SAYI ALDI`, `${this.score[0]} - ${this.score[1]}`, PCOL[this.pointWinner], 1.5 - this.phaseT);
  }
}

export default {
  id: 'volley',
  name: 'Plaj Voleybolu',
  icon: '🏐',
  tag: 'Kumda voleybol',
  mode: 'versus',
  cat: 'spor',
  color: '#ffb347',
  desc: 'Yüzen topu rakibin sahasına düşür! Topun altına gir, zıplayıp kafanla vur. Top kendi sahanda kuma değerse rakibin sayı alır.',
  howto: ['◀ ▶ koş', 'A: zıpla', 'Topa vurduğun yer yönünü belirler', `${TARGET} sayıya ulaşan kazanır (2 fark gerekir)`],
  keys: '1. oyuncu A/D + W ya da F · 2. oyuncu ←/→ + ↑ ya da K',
  controller: { layout: 'dpad', dirs: 'lr', a: 'ZIPLA', b: null },
  create: (api) => new VolleyGame(api),
};
