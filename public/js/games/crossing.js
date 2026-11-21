// KARŞIYA GEÇ — trafiği ve nehri atlayarak karşıya ilk ulaşan sayı alır. 5 sayıya ulaşan kazanır.
// Her basış bir adım zıplatır; basılı tutarsan art arda zıplar.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, rand, pick, clamp, sprite, Layer } from '../host/gfx.js';
import { guySprite } from './bomber.js';

const T = 48;
const TOP = 48; // üst bilgi alanı
const ROWS = 14; // 0: hedef, 1-5 nehir, 6 güvenli, 7-12 yol, 13 başlangıç
const TARGET = 5;
const TIME = 120;
const HOP = 0.11;
const REPEAT = 0.17;
const CAR_COLS = ['#ff5a5a', '#ffd23f', '#46e38a', '#c08bff', '#ff9a3d', '#2fc7ff', '#f2f2f2'];

const LANES = [
  // nehir (kütük / nilüfer), y = satır
  { row: 1, kind: 'log', dir: 1, speed: 70, len: [3, 4], gap: [2, 4] },
  { row: 2, kind: 'pad', dir: -1, speed: 90, len: [2, 3], gap: [2, 3] },
  { row: 3, kind: 'log', dir: 1, speed: 110, len: [2, 4], gap: [2, 4] },
  { row: 4, kind: 'log', dir: -1, speed: 60, len: [4, 5], gap: [2, 3] },
  { row: 5, kind: 'pad', dir: 1, speed: 95, len: [2, 3], gap: [2, 4] },
  // yol
  { row: 7, kind: 'truck', dir: -1, speed: 85, len: [2, 3], gap: [3, 6] },
  { row: 8, kind: 'car', dir: 1, speed: 150, len: [1, 1], gap: [3, 6] },
  { row: 9, kind: 'car', dir: -1, speed: 120, len: [1, 1], gap: [2, 5] },
  { row: 10, kind: 'truck', dir: 1, speed: 70, len: [2, 3], gap: [3, 5] },
  { row: 11, kind: 'car', dir: -1, speed: 180, len: [1, 1], gap: [4, 7] },
  { row: 12, kind: 'car', dir: 1, speed: 105, len: [1, 1], gap: [2, 5] },
];

const rowY = (r) => TOP + r * T;

class CrossingGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.clock = TIME;
    this.sudden = false;
    this.score = [0, 0];
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.lanes = LANES.map((l) => this.mkLane(l));
    this.players = [0, 1].map((p) => this.mkPlayer(p));
    this.phase = 'play';
    this.info();
  }

  mkLane(def) {
    const objs = [];
    let x = -T * 2;
    while (x < W + T * 4) {
      const len = Math.floor(rand(def.len[0], def.len[1] + 1));
      objs.push({ x, w: len * T, col: pick(CAR_COLS) });
      x += len * T + Math.floor(rand(def.gap[0], def.gap[1] + 1)) * T;
    }
    return { ...def, objs, span: x + T * 2 };
  }

  mkPlayer(p) {
    return { p, x: p === 0 ? W / 2 - 3 * T : W / 2 + 3 * T, row: 13, hop: 0, from: null, dead: 0, face: 1, repeat: 0, queued: null, inv: 0 };
  }

  info() {
    for (const p of [0, 1]) this.api.info(p, `Skor ${this.score[0]} - ${this.score[1]} · ${TARGET} sayı`);
  }

  get mult() {
    return 1 + (this.score[0] + this.score[1]) * 0.07;
  }

  onKey(p, k, down) {
    if (!down || this.phase !== 'play') return;
    const pl = this.players[p];
    if (!['up', 'down', 'left', 'right'].includes(k)) return;
    if (pl.hop > 0 || pl.dead > 0) pl.queued = k;
    else this.hop(pl, k);
    pl.repeat = REPEAT + 0.08;
  }

  hop(pl, k) {
    const nr = pl.row + (k === 'up' ? -1 : k === 'down' ? 1 : 0);
    const nx = pl.x + (k === 'left' ? -T : k === 'right' ? T : 0);
    if (nr < 0 || nr > 13 || nx < T / 2 || nx > W - T / 2) return;
    pl.from = [pl.x, pl.row];
    pl.x = nx;
    pl.row = nr;
    pl.hop = HOP;
    pl.face = k === 'up' ? 1 : k === 'down' ? 0 : k === 'left' ? 2 : 3;
    this.api.sfx('move');
  }

  kill(pl, why) {
    pl.dead = 1.1;
    pl.hop = 0;
    const cy = rowY(pl.row) + T / 2;
    if (why === 'water') {
      this.parts.burst(pl.x, cy, 18, ['#9fe3ff', '#fff', '#3fa7e0'], { speed: 220, size: 6, life: 0.6, gravity: 500, angle: -Math.PI / 2, spread: Math.PI });
      this.api.sfx('smallboom');
    } else {
      this.parts.burst(pl.x, cy, 18, [PCOL[pl.p], '#fff', '#ffd23f'], { speed: 260, size: 6, life: 0.6, gravity: 300 });
      this.api.sfx('crash');
      this.shake.add(5, 0.2);
    }
    this.api.buzz(pl.p, 220);
  }

  respawn(pl) {
    const fresh = this.mkPlayer(pl.p);
    pl.x = fresh.x;
    pl.row = 13;
    pl.hop = 0;
    pl.dead = 0;
    pl.inv = 0.6;
    pl.queued = null;
  }

  laneAt(row) {
    return this.lanes.find((l) => l.row === row);
  }

  objUnder(lane, x, pad = 0) {
    for (const o of lane.objs) if (x >= o.x - pad && x <= o.x + o.w + pad) return o;
    return null;
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    // şeritleri kaydır
    const m = this.mult;
    for (const l of this.lanes) {
      const v = l.speed * l.dir * m * dt;
      for (const o of l.objs) {
        o.x += v;
        if (l.dir > 0 && o.x > W + T * 2) o.x -= l.span;
        if (l.dir < 0 && o.x + o.w < -T * 2) o.x += l.span;
      }
    }
    if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'done';
        const [a, b] = this.score;
        this.api.end({ winner: a === b ? null : a > b ? 0 : 1, detail: `Skor ${a} - ${b}` });
      }
      return;
    }
    if (!this.sudden) {
      this.clock -= dt;
      if (this.clock <= 0) {
        this.clock = 0;
        if (this.score[0] !== this.score[1]) return this.finish();
        this.sudden = true;
        this.pops.add('ALTIN SAYI! İlk geçen kazanır', W / 2, H / 2, '#ffd23f', 44, 2);
      }
    }
    for (const pl of this.players) {
      const s = this.api.input[pl.p];
      if (pl.inv > 0) pl.inv -= dt;
      if (pl.dead > 0) {
        pl.dead -= dt;
        if (pl.dead <= 0) this.respawn(pl);
        continue;
      }
      if (pl.hop > 0) {
        pl.hop -= dt;
        if (pl.hop <= 0) {
          pl.hop = 0;
          pl.from = null;
          if (pl.queued) {
            const q = pl.queued;
            pl.queued = null;
            this.hop(pl, q);
          }
        }
      } else {
        // basılı tutulan yön tekrar zıplatır
        const held = ['up', 'down', 'left', 'right'].find((k) => s[k]);
        if (held) {
          pl.repeat -= dt;
          if (pl.repeat <= 0) {
            this.hop(pl, held);
            pl.repeat = REPEAT;
          }
        }
      }
      if (pl.hop > 0) continue; // havadayken çarpışma yok
      const lane = this.laneAt(pl.row);
      if (pl.row === 0) {
        this.score[pl.p]++;
        this.pops.add('+1', pl.x, rowY(0) + 10, PCOL[pl.p], 40, 1);
        this.parts.burst(pl.x, rowY(0) + T / 2, 24, [PCOL[pl.p], '#fff', '#ffd23f'], { speed: 300, size: 7, life: 0.8, gravity: 300 });
        this.api.sfx('goal');
        this.api.buzz(pl.p, 120);
        this.info();
        if (this.score[pl.p] >= TARGET || this.sudden) return this.finish();
        this.respawn(pl);
        continue;
      }
      if (!lane) continue;
      if (lane.kind === 'log' || lane.kind === 'pad') {
        const o = this.objUnder(lane, pl.x, 6);
        if (!o) {
          if (pl.inv <= 0) this.kill(pl, 'water');
        } else {
          pl.x += lane.speed * lane.dir * m * dt;
          if (pl.x < 8 || pl.x > W - 8) this.kill(pl, 'water');
        }
      } else if (pl.inv <= 0) {
        if (this.objUnder(lane, pl.x, -10)) this.kill(pl, 'car');
      }
    }
  }

  finish() {
    this.phase = 'over';
    this.phaseT = 2.2;
    this.api.sfx('win');
  }

  demo() {
    this.players[0].row = 9;
    this.players[1].row = 3;
    this.players[1].x = this.lanes[2].objs[2].x + 60;
    this.score = [2, 1];
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    g.fillStyle = '#10142e';
    g.fillRect(0, 0, W, H);
    // hedef şeridi
    g.fillStyle = '#2f8f45';
    g.fillRect(0, rowY(0), W, T);
    for (let x = 0; x < W; x += 64) {
      g.fillStyle = (x / 64) % 2 ? '#ffd23f' : '#fff';
      g.fillRect(x, rowY(0), 32, 8);
    }
    // nehir
    const river = g.createLinearGradient(0, rowY(1), 0, rowY(6));
    river.addColorStop(0, '#1f6fbf');
    river.addColorStop(1, '#2a8ed6');
    g.fillStyle = river;
    g.fillRect(0, rowY(1), W, T * 5);
    g.strokeStyle = 'rgba(255,255,255,.12)';
    g.lineWidth = 2;
    g.beginPath();
    for (let r = 1; r < 6; r++) {
      for (let x = (r * 37) % 90; x < W; x += 90) {
        g.moveTo(x, rowY(r) + 24);
        g.quadraticCurveTo(x + 14, rowY(r) + 18, x + 28, rowY(r) + 24);
      }
    }
    g.stroke();
    // güvenli şerit
    g.fillStyle = '#3c8a4e';
    g.fillRect(0, rowY(6), W, T);
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i < 60; i++) g.fillRect((i * 97) % W, rowY(6) + ((i * 13) % 40), 3, 6);
    // yol
    g.fillStyle = '#34374a';
    g.fillRect(0, rowY(7), W, T * 6);
    g.fillStyle = 'rgba(255,255,255,.45)';
    for (let r = 8; r <= 12; r++) for (let x = 0; x < W; x += 70) g.fillRect(x, rowY(r) - 2, 36, 4);
    g.fillStyle = '#ffd23f';
    g.fillRect(0, rowY(7), W, 3);
    g.fillRect(0, rowY(13) - 3, W, 3);
    // başlangıç
    g.fillStyle = '#3c8a4e';
    g.fillRect(0, rowY(13), W, T);
    text(g, this.api.players[0].name, 24, 26, { size: 28, color: PCOL[0], weight: 800, align: 'left' });
    text(g, this.api.players[1].name, W - 24, 26, { size: 28, color: PCOL[1], weight: 800, align: 'right' });
  }

  vehicleSprite(kind, col, w) {
    return sprite(`cr-v|${kind}|${col}|${w}`, w, T, (g) => {
      const h = T - 12;
      if (kind === 'car') {
        g.fillStyle = 'rgba(0,0,0,.3)';
        rr(g, 4, 10, w - 6, h, 10);
        g.fill();
        rr(g, 2, 6, w - 4, h, 10);
        g.fillStyle = col;
        g.fill();
        g.fillStyle = 'rgba(20,30,60,.75)';
        rr(g, w * 0.3, 11, w * 0.4, h - 10, 5);
        g.fill();
        g.fillStyle = '#1b1a26';
        for (const [x, y] of [[8, 3], [w - 18, 3], [8, h + 4], [w - 18, h + 4]]) g.fillRect(x, y, 10, 5);
      } else if (kind === 'truck') {
        g.fillStyle = 'rgba(0,0,0,.3)';
        rr(g, 4, 10, w - 6, h, 6);
        g.fill();
        rr(g, 2, 6, w - 4, h, 6);
        g.fillStyle = '#d9dde8';
        g.fill();
        // kabin önde (sağda); sola giden araçlar çizimde aynalanır
        g.fillStyle = col;
        rr(g, w - 36, 6, 34, h, 6);
        g.fill();
        g.fillStyle = 'rgba(20,30,60,.6)';
        g.fillRect(w - 16, 12, 8, h - 12);
        g.fillStyle = 'rgba(0,0,0,.12)';
        for (let x = 12; x < w - 46; x += 18) g.fillRect(x, 10, 3, h - 8);
      } else if (kind === 'log') {
        const grad = g.createLinearGradient(0, 6, 0, T - 6);
        grad.addColorStop(0, '#a8743f');
        grad.addColorStop(1, '#6e4521');
        rr(g, 2, 8, w - 4, T - 16, 16);
        g.fillStyle = grad;
        g.fill();
        g.strokeStyle = 'rgba(60,35,15,.6)';
        g.lineWidth = 2;
        for (let x = 30; x < w - 20; x += 46) {
          g.beginPath();
          g.moveTo(x, 14);
          g.lineTo(x + 20, 14);
          g.stroke();
        }
      } else {
        // nilüfer yaprakları
        for (let x = T / 2; x < w; x += T) {
          g.fillStyle = '#3fbf5f';
          g.beginPath();
          g.arc(x, T / 2, 20, 0.4, Math.PI * 2 - 0.1);
          g.lineTo(x, T / 2);
          g.fill();
          g.fillStyle = '#ff9ad5';
          g.beginPath();
          g.arc(x + 6, T / 2 - 6, 5, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    for (const l of this.lanes) {
      const y = rowY(l.row);
      for (const o of l.objs) {
        if (o.x > W + 4 || o.x + o.w < -4) continue;
        const spr = this.vehicleSprite(l.kind, o.col, o.w);
        if (l.dir < 0 && (l.kind === 'car' || l.kind === 'truck')) {
          g.save();
          g.translate(o.x + o.w, y);
          g.scale(-1, 1);
          g.drawImage(spr, 0, 0, o.w, T);
          g.restore();
        } else g.drawImage(spr, o.x, y, o.w, T);
      }
    }
    for (const pl of this.players) {
      if (pl.dead > 0) continue;
      let x = pl.x;
      let y = rowY(pl.row) + T / 2;
      let lift = 0;
      if (pl.hop > 0 && pl.from) {
        const f = 1 - pl.hop / HOP;
        x = pl.from[0] + (pl.x - pl.from[0]) * f;
        y = rowY(pl.from[1]) + T / 2 + (rowY(pl.row) - rowY(pl.from[1])) * f;
        lift = Math.sin(f * Math.PI) * 14;
      }
      const faceIdx = [0, 1, 2, 3][pl.face] ?? 1;
      const spr = guySprite(PCOL[pl.p], faceIdx === 1 ? 1 : faceIdx === 0 ? 0 : faceIdx, 0, 42);
      if (pl.inv > 0 && Math.floor(this.time * 14) % 2) g.globalAlpha = 0.5;
      g.drawImage(spr, x - spr.lw / 2, y - spr.lh * 0.557 - lift, spr.lw, spr.lh);
      g.globalAlpha = 1;
    }
    this.parts.draw(g);
    g.restore();
    // skor
    rr(g, W / 2 - 130, 4, 260, 40, 14);
    g.fillStyle = 'rgba(0,0,0,.45)';
    g.fill();
    text(g, String(this.score[0]), W / 2 - 92, 25, { size: 32, color: PCOL[0], weight: 800 });
    text(g, String(this.score[1]), W / 2 + 92, 25, { size: 32, color: PCOL[1], weight: 800 });
    const c = Math.ceil(this.clock);
    text(g, this.sudden ? 'ALTIN SAYI' : `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`, W / 2, 25, { size: this.sudden ? 20 : 26, color: this.sudden ? '#ffd23f' : '#fff', weight: 800 });
    this.pops.draw(g);
    if (this.phase === 'over') {
      const [a, b] = this.score;
      const w = a === b ? null : a > b ? 0 : 1;
      banner(g, w === null ? 'BERABERE' : `${this.api.players[w].name} KAZANDI!`, `${a} - ${b}`, w === null ? '#ffd23f' : PCOL[w], 2.2 - this.phaseT);
    }
  }
}

export default {
  id: 'crossing',
  name: 'Karşıya Geç',
  icon: '🚗',
  tag: 'Trafik ve nehir yarışı',
  mode: 'versus',
  cat: 'aksiyon',
  color: '#ffd23f',
  desc: 'Arabalardan kaç, kütüklerin üstünden atlayarak nehri geç! Karşı kıyıya ulaşan sayı alır ve baştan başlar. 5 sayıya ilk ulaşan kazanır.',
  howto: ['Yön tuşu: bir adım zıpla (basılı tut: art arda)', 'Arabaya çarpma, suya düşme', 'Kütük ve nilüferler seni taşır', '5 sayı ya da 2 dakika sonunda önde olan kazanır'],
  keys: '1. oyuncu WASD · 2. oyuncu Oklar',
  controller: { layout: 'dpad', dirs: 4, a: null, b: null },
  create: (api) => new CrossingGame(api),
};
