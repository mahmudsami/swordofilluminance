// KAFA TOPU — yandan görünüşlü, koca kafalı futbol. Zıpla, kafa vur, şut çek!
// 90 saniyede çok gol atan kazanır; berabere biterse altın gol.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp, sprite, Layer, glow } from '../host/gfx.js';

const GROUND = 640;
const GX = 92; // kale derinliği
const CB = GROUND - 196; // üst direk yüksekliği
const HR = 44; // oyuncu (kafa) yarıçapı
const BR = 22; // top yarıçapı
const GRAV = 2300;
const BGRAV = 1500;
const MATCH = 90;
const MERCY = 7;

class HeadballGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.clock = MATCH;
    this.score = [0, 0];
    this.golden = false;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.players = [this.mkPlayer(0), this.mkPlayer(1)];
    this.resetKickoff(Math.random() < 0.5 ? 0 : 1);
    this.phase = 'play';
    this.phaseT = 0;
    this.info();
  }

  mkPlayer(p) {
    return { p, x: p === 0 ? 330 : W - 330, y: GROUND, vx: 0, vy: 0, ground: true, face: p === 0 ? 1 : -1, kickT: 0, kickCool: 0, kicked: false, jumpHeld: false };
  }

  resetKickoff(toward) {
    for (const pl of this.players) Object.assign(pl, this.mkPlayer(pl.p));
    // top, gol yiyen tarafa hafifçe düşer
    this.ball = { x: W / 2 + (toward === 0 ? -40 : 40), y: 260, vx: toward === 0 ? -60 : 60, vy: 0, spin: 0, ang: 0, rest: 0 };
    this.lastTouch = -1;
  }

  info() {
    for (const p of [0, 1]) this.api.info(p, `Skor ${this.score[0]} - ${this.score[1]}${this.golden ? ' · ALTIN GOL' : ''}`);
  }

  onKey(p, k, down) {
    const pl = this.players[p];
    if (!down) return;
    if (this.phase !== 'play') return;
    if ((k === 'a' || k === 'up') && pl.ground) {
      pl.vy = -840;
      pl.ground = false;
      this.api.sfx('rotate');
    }
    if (k === 'b' && pl.kickCool <= 0) {
      pl.kickT = 0.2;
      pl.kickCool = 0.32;
      pl.kicked = false;
      this.api.sfx('move');
    }
  }

  updatePlayer(pl, dt) {
    const s = this.api.input[pl.p];
    let dir = (s.right ? 1 : 0) - (s.left ? 1 : 0);
    if (!dir && Math.abs(s.sx) > 0.25) dir = Math.sign(s.sx);
    const target = dir * 380;
    pl.vx += (target - pl.vx) * Math.min(1, dt * (pl.ground ? 14 : 6));
    pl.vy += GRAV * dt;
    pl.x += pl.vx * dt;
    pl.y += pl.vy * dt;
    if (pl.y >= GROUND) {
      pl.y = GROUND;
      pl.vy = 0;
      pl.ground = true;
    }
    // oyuncular kalenin içine giremez (kale çizgisinin önünde durur)
    pl.x = clamp(pl.x, GX + HR - 14, W - GX - HR + 14);
    if (pl.kickT > 0) pl.kickT -= dt;
    if (pl.kickCool > 0) pl.kickCool -= dt;
    if (dir) pl.face = dir;
    // topa bakan yöne dön (durunca)
    else pl.face = this.ball.x > pl.x ? 1 : -1;
  }

  collidePlayers() {
    const [a, b] = this.players;
    const ax = a.x;
    const ay = a.y - HR;
    const bx = b.x;
    const by = b.y - HR;
    const dx = bx - ax;
    const dy = by - ay;
    const d = Math.hypot(dx, dy);
    const min = HR * 2 - 6;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const push = (min - d) / 2;
    a.x -= nx * push;
    b.x += nx * push;
    // üstteki oyuncu alttakinin kafasına basabilir
    if (ny > 0.5 && a.vy > 0) {
      a.y = b.y - min * 0.98;
      a.vy = 0;
      a.ground = true;
    } else if (ny < -0.5 && b.vy > 0) {
      b.y = a.y - min * 0.98;
      b.vy = 0;
      b.ground = true;
    }
    a.x = clamp(a.x, GX + HR - 14, W - GX - HR + 14);
    b.x = clamp(b.x, GX + HR - 14, W - GX - HR + 14);
  }

  ballVsCircle(cx, cy, r, vx, vy, e, who) {
    const bl = this.ball;
    const dx = bl.x - cx;
    const dy = bl.y - cy;
    const d = Math.hypot(dx, dy);
    const min = r + BR;
    if (d >= min || d === 0) return false;
    const nx = dx / d;
    const ny = dy / d;
    bl.x = cx + nx * min;
    bl.y = cy + ny * min;
    const rvx = bl.vx - vx;
    const rvy = bl.vy - vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      bl.vx -= (1 + e) * vn * nx;
      bl.vy -= (1 + e) * vn * ny;
      if (-vn > 250) {
        this.api.sfx('thock');
        if (who !== undefined) this.api.buzz(who, 25);
      }
    }
    if (who !== undefined) this.lastTouch = who;
    return true;
  }

  ballVsRect(x0, y0, x1, y1) {
    const bl = this.ball;
    const px = clamp(bl.x, x0, x1);
    const py = clamp(bl.y, y0, y1);
    const dx = bl.x - px;
    const dy = bl.y - py;
    const d = Math.hypot(dx, dy);
    if (d >= BR) return;
    let nx;
    let ny;
    if (d === 0) {
      nx = 0;
      ny = bl.y < (y0 + y1) / 2 ? -1 : 1;
    } else {
      nx = dx / d;
      ny = dy / d;
    }
    bl.x = px + nx * BR;
    bl.y = py + ny * BR;
    const vn = bl.vx * nx + bl.vy * ny;
    if (vn < 0) {
      bl.vx -= 1.6 * vn * nx;
      bl.vy -= 1.6 * vn * ny;
      if (-vn > 200) this.api.sfx('steel');
    }
  }

  kickCheck(pl) {
    if (pl.kickT <= 0 || pl.kicked) return;
    const bl = this.ball;
    const fx = pl.x + pl.face * 34;
    const fy = pl.y - 16;
    const d = Math.hypot(bl.x - fx, bl.y - fy);
    if (d > 62) return;
    pl.kicked = true;
    const power = 980 + Math.abs(pl.vx) * 0.4;
    // yerdeyken yükselen şut, havadayken daha düz vole
    const ang = pl.ground ? -0.5 : -0.25;
    bl.vx = pl.face * Math.cos(ang) * power;
    bl.vy = Math.sin(ang) * power;
    bl.spin = pl.face * 18;
    this.lastTouch = pl.p;
    this.parts.burst(bl.x, bl.y, 8, ['#fff', PCOL[pl.p]], { speed: 220, size: 5, life: 0.35, gravity: 0 });
    this.shake.add(3, 0.1);
    this.api.sfx('shoot');
    this.api.buzz(pl.p, 40);
  }

  goal(scorer) {
    this.score[scorer]++;
    this.phase = 'goal';
    this.phaseT = 2;
    this.scorer = scorer;
    const gx = scorer === 0 ? W - GX / 2 : GX / 2;
    this.parts.burst(gx, GROUND - 100, 50, [PCOL[scorer], '#fff', '#ffd23f'], { speed: 520, size: 9, life: 1.1, gravity: 400, angle: -Math.PI / 2, spread: Math.PI * 1.4 });
    this.shake.add(10, 0.4);
    this.api.sfx('goal');
    this.api.buzz(scorer, 150);
    this.api.buzz(1 - scorer, 300);
    this.info();
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.phase === 'goal') {
      this.phaseT -= dt;
      for (const pl of this.players) this.updatePlayer(pl, dt);
      if (this.phaseT <= 0) {
        const [a, b] = this.score;
        if (this.golden || Math.max(a, b) >= MERCY || (this.clock <= 0 && a !== b)) return this.finish();
        this.resetKickoff(1 - this.scorer);
        this.phase = 'play';
      }
      return;
    }
    if (this.phase !== 'play') return;

    if (!this.golden) {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.clock = 0;
        if (this.score[0] !== this.score[1]) return this.finish();
        this.golden = true;
        this.pops.add('ALTIN GOL! İlk gol kazanır', W / 2, 200, '#ffd23f', 48, 2.2);
        this.api.sfx('power');
        this.info();
      }
    }

    for (const pl of this.players) this.updatePlayer(pl, dt);
    this.collidePlayers();

    // top: alt adımlarla
    const SUB = 3;
    const sd = dt / SUB;
    const bl = this.ball;
    for (let i = 0; i < SUB; i++) {
      bl.vy += BGRAV * sd;
      const drag = 1 - 0.12 * sd;
      bl.vx *= drag;
      bl.vy *= drag;
      bl.x += bl.vx * sd;
      bl.y += bl.vy * sd;
      bl.ang += bl.spin * sd;
      bl.spin *= 1 - 0.8 * sd;
      // zemin, tavan, yan duvarlar
      if (bl.y + BR > GROUND) {
        bl.y = GROUND - BR;
        if (bl.vy > 0) {
          if (bl.vy > 300) this.api.sfx('bounce');
          bl.vy = -bl.vy * 0.68;
          if (Math.abs(bl.vy) < 60) bl.vy = 0;
        }
        bl.vx *= 1 - 1.2 * sd;
        bl.spin = bl.vx / BR;
      }
      if (bl.y - BR < 0) {
        bl.y = BR;
        bl.vy = Math.abs(bl.vy) * 0.7;
      }
      if (bl.x - BR < 0) {
        bl.x = BR;
        bl.vx = Math.abs(bl.vx) * 0.6;
      }
      if (bl.x + BR > W) {
        bl.x = W - BR;
        bl.vx = -Math.abs(bl.vx) * 0.6;
      }
      // üst direkler
      this.ballVsRect(0, CB - 8, GX + 6, CB + 6);
      this.ballVsRect(W - GX - 6, CB - 8, W, CB + 6);
      // oyuncular
      for (const pl of this.players) {
        this.kickCheck(pl);
        this.ballVsCircle(pl.x, pl.y - HR, HR, pl.vx, pl.vy, 0.55, pl.p);
      }
      const sp = Math.hypot(bl.vx, bl.vy);
      if (sp > 1600) {
        bl.vx *= 1600 / sp;
        bl.vy *= 1600 / sp;
      }
      // gol
      if (bl.y > CB + 6) {
        if (bl.x < GX - 8) return this.goal(1);
        if (bl.x > W - GX + 8) return this.goal(0);
      }
    }
    // direğin üstünde takılı kalırsa sahaya it
    if (bl.y < CB && (bl.x < GX + 10 || bl.x > W - GX - 10) && Math.abs(bl.vx) < 40 && Math.abs(bl.vy) < 40) {
      bl.rest += dt;
      if (bl.rest > 0.8) {
        bl.vx = bl.x < W / 2 ? 260 : -260;
        bl.vy = -200;
        bl.rest = 0;
      }
    } else bl.rest = 0;
  }

  finish() {
    this.phase = 'done';
    const [a, b] = this.score;
    this.api.end({ winner: a === b ? null : a > b ? 0 : 1, detail: `Skor ${a} - ${b}${this.golden ? ' (altın gol)' : ''}` });
  }

  demo() {
    this.ball.x = 560;
    this.ball.y = 420;
    this.players[0].x = 470;
    this.players[0].y = GROUND - 80;
    this.players[0].kickT = 0.1;
    this.players[1].x = 900;
    this.score = [2, 1];
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#0d1b3d');
    sky.addColorStop(1, '#27407a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // tribün ve seyirciler
    g.fillStyle = '#1a2347';
    g.fillRect(0, 150, W, 230);
    let seed = 11;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const crowd = ['#ff4f7b', '#2fc7ff', '#ffd23f', '#ffffff', '#46e38a', '#b45cff'];
    for (let row = 0; row < 9; row++) {
      for (let i = 0; i < 64; i++) {
        const x = i * 20 + (row % 2) * 10 + rnd() * 4;
        const y = 170 + row * 24;
        g.fillStyle = rgba(crowd[(rnd() * crowd.length) | 0], 0.35 + rnd() * 0.3);
        g.beginPath();
        g.arc(x, y, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.fillStyle = '#0f1530';
    g.fillRect(0, 380, W, 30);
    // projektörler
    for (const x of [120, W - 120]) {
      g.fillStyle = '#c9d6ff';
      g.fillRect(x - 40, 40, 80, 24);
      g.drawImage(glow('#e8eeff', 140, 0.35), x - 140, 52 - 140, 280, 280);
    }
    // çim
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? '#2f8f45' : '#36a04e';
      g.fillRect(i * 80, 410, 80, GROUND - 410);
    }
    g.fillStyle = '#287a3b';
    g.fillRect(0, GROUND, W, H - GROUND);
    g.fillStyle = 'rgba(255,255,255,.6)';
    g.fillRect(W / 2 - 2, 410, 4, GROUND - 410);
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 4;
    g.beginPath();
    g.ellipse(W / 2, GROUND - 40, 120, 30, 0, Math.PI, Math.PI * 2);
    g.stroke();
    // kaleler (ağ + direk)
    for (const side of [0, 1]) {
      const x0 = side === 0 ? 0 : W - GX;
      g.fillStyle = 'rgba(255,255,255,.08)';
      g.fillRect(x0, CB, GX, GROUND - CB);
      g.strokeStyle = 'rgba(255,255,255,.25)';
      g.lineWidth = 1.5;
      g.beginPath();
      for (let x = x0; x <= x0 + GX; x += 14) {
        g.moveTo(x, CB);
        g.lineTo(x, GROUND);
      }
      for (let y = CB; y <= GROUND; y += 14) {
        g.moveTo(x0, y);
        g.lineTo(x0 + GX, y);
      }
      g.stroke();
      g.fillStyle = '#f2f2f2';
      g.fillRect(side === 0 ? 0 : W - GX - 6, CB - 8, GX + 6, 14);
      g.fillRect(side === 0 ? GX : W - GX - 6, CB - 8, 6, GROUND - CB + 8);
      g.fillStyle = rgba(PCOL[side], 0.9);
      g.fillRect(side === 0 ? 0 : W - GX - 6, CB - 8, GX + 6, 4);
    }
    // isimler
    text(g, this.api.players[0].name, 30, 34, { size: 32, color: PCOL[0], weight: 800, align: 'left', stroke: 'rgba(0,0,0,.5)', sw: 6 });
    text(g, this.api.players[1].name, W - 30, 34, { size: 32, color: PCOL[1], weight: 800, align: 'right', stroke: 'rgba(0,0,0,.5)', sw: 6 });
    rr(g, W / 2 - 150, 8, 300, 78, 20);
    g.fillStyle = 'rgba(5,8,20,.72)';
    g.fill();
  }

  headSprite(p) {
    const col = PCOL[p];
    return sprite(`hb|${col}`, HR * 2 + 8, HR * 2 + 8, (g) => {
      const c = HR + 4;
      const grad = g.createRadialGradient(c - 14, c - 16, 6, c, c, HR);
      grad.addColorStop(0, shade(col, 0.35));
      grad.addColorStop(1, shade(col, -0.25));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(c, c, HR, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = shade(col, -0.55);
      g.lineWidth = 3;
      g.stroke();
      // saç perçemi
      g.fillStyle = shade(col, -0.45);
      g.beginPath();
      g.ellipse(c - 4, c - HR + 10, HR * 0.7, 14, -0.15, Math.PI, Math.PI * 2);
      g.fill();
    });
  }

  ballSprite() {
    return sprite('hb-ball', BR * 2 + 4, BR * 2 + 4, (g) => {
      const c = BR + 2;
      g.fillStyle = '#fafafa';
      g.beginPath();
      g.arc(c, c, BR, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#23233a';
      const pent = (x, y, r) => {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.fill();
      };
      pent(c, c, 7);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        pent(c + Math.cos(a) * 16, c + Math.sin(a) * 16, 5);
      }
      g.strokeStyle = '#9aa0b8';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(c, c, BR - 0.5, 0, Math.PI * 2);
      g.stroke();
    });
  }

  drawPlayer(g, pl) {
    const hx = pl.x;
    const hy = pl.y - HR;
    // gölge
    const h = GROUND - pl.y;
    g.fillStyle = `rgba(0,0,0,${0.3 - Math.min(0.2, h / 900)})`;
    g.beginPath();
    g.ellipse(pl.x, GROUND + 4, HR * (1 - Math.min(0.4, h / 700)), 9, 0, 0, Math.PI * 2);
    g.fill();
    // ayakkabı (şut atarken öne savrulur)
    const swing = pl.kickT > 0 ? Math.sin((1 - pl.kickT / 0.2) * Math.PI) : 0;
    const fx = pl.x + pl.face * (14 + swing * 30);
    const fy = pl.y - 6 - swing * 18;
    g.fillStyle = '#20202e';
    g.beginPath();
    g.ellipse(fx, fy, 20, 10, pl.face * -swing * 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(fx - 12, fy - 2, 24, 3);
    // kafa
    const spr = this.headSprite(pl.p);
    g.drawImage(spr, hx - spr.lw / 2, hy - spr.lh / 2, spr.lw, spr.lh);
    // gözler topa bakar
    const bl = this.ball;
    const ang = Math.atan2(bl.y - hy, bl.x - hx);
    const lx = Math.cos(ang) * 3.5;
    const ly = Math.sin(ang) * 3.5;
    for (const s of [-1, 1]) {
      const ex = hx + pl.face * 12 + s * 13;
      const ey = hy - 4;
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(ex, ey, 9, 11, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#141225';
      g.beginPath();
      g.arc(ex + lx, ey + ly, 4.5, 0, Math.PI * 2);
      g.fill();
    }
    // ağız
    g.strokeStyle = '#141225';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(hx + pl.face * 12, hy + 16, 9, 0.2, Math.PI - 0.2);
    g.stroke();
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    const bl = this.ball;
    // top gölgesi
    const bh = GROUND - bl.y;
    g.fillStyle = `rgba(0,0,0,${0.28 - Math.min(0.2, bh / 1200)})`;
    g.beginPath();
    g.ellipse(bl.x, GROUND + 3, BR * (1 - Math.min(0.5, bh / 800)), 6, 0, 0, Math.PI * 2);
    g.fill();
    for (const pl of this.players) this.drawPlayer(g, pl);
    if (this.phase !== 'goal' || this.phaseT > 1.6) {
      const spr = this.ballSprite();
      g.save();
      g.translate(bl.x, bl.y);
      g.rotate(bl.ang);
      g.drawImage(spr, -spr.lw / 2, -spr.lh / 2, spr.lw, spr.lh);
      g.restore();
    }
    this.parts.draw(g);
    g.restore();

    // skor tabelası
    text(g, String(this.score[0]), W / 2 - 92, 48, { size: 56, color: PCOL[0], weight: 800 });
    text(g, String(this.score[1]), W / 2 + 92, 48, { size: 56, color: PCOL[1], weight: 800 });
    const c = Math.ceil(this.clock);
    text(g, this.golden ? 'ALTIN' : `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`, W / 2, 40, { size: this.golden ? 30 : 36, color: this.golden ? '#ffd23f' : c <= 10 ? '#ff8a8a' : '#fff', weight: 800 });
    text(g, this.golden ? 'GOL' : 'SÜRE', W / 2, 70, { size: 16, color: '#a7b4d8', weight: 700 });
    this.pops.draw(g);
    if (this.phase === 'goal' && this.phaseT < 1.9) banner(g, 'GOOOL!', `${this.api.players[this.scorer].name} attı · ${this.score[0]} - ${this.score[1]}`, PCOL[this.scorer], 1.9 - this.phaseT);
  }
}

export default {
  id: 'headball',
  name: 'Kafa Topu',
  icon: '⚽',
  tag: 'Kafa kafaya futbol',
  mode: 'versus',
  cat: 'spor',
  color: '#36a04e',
  desc: 'Koca kafalı futbolcularla yandan görünüşlü maç! Zıpla, kafa vur, şutunu çek. 90 saniye sonunda çok gol atan kazanır; berabere biterse altın gol.',
  howto: ['◀ ▶ koş', 'A: zıpla (kafa vuruşu için)', 'B: şut çek', 'Sol kale senin (1. oyuncu), sağ kale rakibin', '90 saniye · 7 gole ulaşan erken kazanır'],
  keys: '1. oyuncu A/D koş, W ya da F zıpla, G şut · 2. oyuncu ←/→, ↑ ya da K zıpla, L şut',
  controller: { layout: 'dpad', dirs: 'lr', a: 'ZIPLA', b: 'ŞUT' },
  create: (api) => new HeadballGame(api),
};
