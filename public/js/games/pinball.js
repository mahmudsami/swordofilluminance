// PORTAL PİNBALL — iki pinball masası yan yana. Masaların iç kenarındaki portal ağızları ortadaki
// tüplerle birbirine bağlı: ağza giren top rakibin masasına geçer. Tampon, sapan, şerit ve hedeflerden
// kazanılan puanlar KASA'da birikir; rakibin deliğine top düşünce (GOL) kasa, çarpanıyla birlikte skora geçer.
import { W, H, PCOL, RES, drawText, rr, Particles, Popups, Shake, banner, shade, rgba, rand, sprite, Layer, glow } from '../host/gfx.js';

const TW = 600; // masa yerel genişliği (iç kenar x = 600 tarafı)
const TH = 720;
const S = 0.92; // masa çizim ölçeği
const OX = [24, W - 24 - TW * S];
const OY = 52;
const BR = 11; // top yarıçapı
const GRAV = 1050;
const MAXV = 1650;
const SUB = 8; // kare başına fizik alt adımı
const MATCH = 150;
const FLIP_W = 24; // palet açısal hızı (rad/sn)
const FLIP_L = 100;
const FR0 = 11; // palet kalınlığı: pivot ucu
const FR1 = 7; // palet kalınlığı: sivri uç
const HOLD_MAX = 3; // palet en fazla bu kadar havada tutulabilir (topu sonsuza dek bekletmeyi önler)
const MAX_BALLS = 4;
const GOAL_BONUS = 1000;
const SHIELD_T = 12; // kalkan süresi; hedefler kalkan bitince 5 sn sonra yeniden kalkar
const deg = (d) => (d * Math.PI) / 180;
const fmt = (n) => Math.round(n).toLocaleString('tr-TR');
const mx = (x) => TW - x; // sol-sağ ayna

// ------------------------------------------------------------------ masa geometrisi (yerel koordinat)
const PIVOTS = [
  { x: 180, y: 606, rest: deg(28), up: deg(-26) },
  { x: mx(180), y: 606, rest: deg(152), up: deg(206) },
];
// Alt kılavuz, dinlenen paletin üst yüzeyine teğet bağlanır: top köşede sıkışmadan palete yuvarlanır.
const T0 = [180 + FR0 * Math.sin(deg(28)), 606 - FR0 * Math.cos(deg(28))];
const SL_A = [22, 404]; // sapan yüzünün üst ucu
const SL_B = [122, 536]; // sapan yüzünün alt ucu
const MOUTHS = [
  { y0: 196, y1: 256 },
  { y0: 300, y1: 352 },
];
const POSTS = [230, 277, 323, 370];
const LANE_Y = 119;
const BUMPERS = [
  { x: 220, y: 250, r: 24 },
  { x: 380, y: 250, r: 24 },
  { x: 300, y: 330, r: 24 },
];
const CORE = { x: 300, y: 446, r: 13 };
const CORE_HARD = 650; // çekirdekte yalnızca sert (paletten gelen) vuruşlar sayılır
const DROPS = [262, 306, 350].map((y) => ({ x: 32, y0: y - 15, y1: y + 15, y }));

const SEGS = [];
const seg = (ax, ay, bx, by, kind = 'wall', r = 0) => SEGS.push({ ax, ay, bx, by, kind, r, e: kind === 'post' ? 0.5 : 0.45 });
const ARCH = [];
for (let i = 0; i <= 18; i++) {
  const th = Math.PI + (i / 18) * Math.PI;
  ARCH.push([300 + 278 * Math.cos(th), 170 + 145 * Math.sin(th)]);
}
for (let i = 0; i < 18; i++) seg(ARCH[i][0], ARCH[i][1], ARCH[i + 1][0], ARCH[i + 1][1]);
// dış kenar: duvar, sapan yüzü, palete inen kılavuz
seg(22, 170, SL_A[0], SL_A[1]);
seg(SL_A[0], SL_A[1], SL_B[0], SL_B[1], 'sling');
seg(SL_B[0], SL_B[1], T0[0], T0[1]);
// iç kenar: portal ağızları duvarda boşluk
seg(578, 170, 578, MOUTHS[0].y0);
seg(578, MOUTHS[0].y1, 578, MOUTHS[1].y0);
seg(578, MOUTHS[1].y1, mx(SL_A[0]), SL_A[1]);
seg(mx(SL_A[0]), SL_A[1], mx(SL_B[0]), SL_B[1], 'sling');
seg(mx(SL_B[0]), SL_B[1], mx(T0[0]), T0[1]);
for (const x of POSTS) seg(x, 102, x, 136, 'post', 2.5);
// oyun alanı çokgeni (yalnızca çizim)
const FIELD = [...ARCH, [mx(SL_A[0]), SL_A[1]], [mx(SL_B[0]), SL_B[1]], [mx(T0[0]), T0[1]], [434, TH], [166, TH], T0, SL_B, SL_A];

// Top ile kalınlığı uçtan uca değişebilen bir çubuk (kapsül) arasındaki çarpışma.
// w: çubuğun (px, py) etrafındaki açısal hızı (dönen palet). Çarpma hızını döndürür; değmediyse -1.
function collide(b, ax, ay, bx, by, ra, rb, e, w = 0, px = 0, py = 0) {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  let t = ((b.x - ax) * dx + (b.y - ay) * dy) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  const min = BR + ra + (rb - ra) * t;
  let nx = b.x - cx;
  let ny = b.y - cy;
  const d2 = nx * nx + ny * ny;
  if (d2 >= min * min) return -1;
  const svx = -w * (cy - py);
  const svy = w * (cx - px);
  let d = Math.sqrt(d2);
  if (d < 1e-4) {
    nx = -dy;
    ny = dx;
    d = Math.sqrt(l2);
    if (nx * (b.vx - svx) + ny * (b.vy - svy) > 0) {
      nx = -nx;
      ny = -ny;
    }
  }
  nx /= d;
  ny /= d;
  b.x = cx + nx * min;
  b.y = cy + ny * min;
  b.nx = nx;
  b.ny = ny;
  const rvx = b.vx - svx;
  const rvy = b.vy - svy;
  const vn = rvx * nx + rvy * ny;
  if (vn >= 0) return 0;
  b.vx = rvx - (1 + e) * vn * nx + svx;
  b.vy = rvy - (1 + e) * vn * ny + svy;
  return -vn;
}

// yuvarlak engel (tampon, çekirdek)
function collideCircle(b, o, e) {
  const dx = b.x - o.x;
  const dy = b.y - o.y;
  const min = BR + o.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return -1;
  const d = Math.sqrt(d2);
  const nx = d > 0.01 ? dx / d : 0;
  const ny = d > 0.01 ? dy / d : -1;
  b.x = o.x + nx * min;
  b.y = o.y + ny * min;
  b.nx = nx;
  b.ny = ny;
  const vn = b.vx * nx + b.vy * ny;
  if (vn >= 0) return 0;
  b.vx -= (1 + e) * vn * nx;
  b.vy -= (1 + e) * vn * ny;
  return -vn;
}

class PinballGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.clock = MATCH;
    this.lastSec = MATCH;
    this.golden = false;
    this.score = [0, 0];
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.tables = [0, 1].map((p) => ({
      p,
      bank: 0,
      mult: 1,
      lanes: [false, false, false],
      drops: [true, true, true],
      dropReset: 0,
      shield: 0,
      core: 0,
      coreCool: 0,
      coreFx: 0,
      bump: [0, 0, 0],
      sling: [0, 0],
      portalFx: [0, 0],
      flips: PIVOTS.map((pv) => ({ ...pv, a: pv.rest, w: 0, hold: 0, locked: false })),
    }));
    // Masa katmanları ekrandaki son boyutlarında (ve 2. masa aynalanmış olarak) çizilir:
    // her karede ölçeksiz, birebir kopyalanırlar.
    this.bgLayer = new Layer(W, H, (g) => this.paintBg(g));
    this.layers = [0, 1].map((p) => new Layer(TW * S, TH * S, (g) => {
      if (p === 0) g.scale(S, S);
      else {
        g.translate(TW * S, 0);
        g.scale(-S, S);
      }
      this.paintTable(g, p);
    }));
    this.balls = [];
    this.pending = [
      { t: 0, time: 0.8 },
      { t: 1, time: 0.8 },
    ];
    this.toasts = [];
    this.tap = [[0, 0], [0, 0]]; // ekrandaki sol / sağ düğmenin en kısa basılı kalma süresi
    this.infoT = 0;
    this.phase = 'play';
    this.rescues = 0; // test sayaçları: masadan taşan / takılan top
    this.nudges = 0;
    this.info(true);
  }

  // ---------------------------------------------------------------- yardımcılar
  toGlobal(p, x, y) {
    return p === 0 ? [OX[0] + x * S, OY + y * S] : [OX[1] + (TW - x) * S, OY + y * S];
  }

  newBall(t, x, y, vx, vy) {
    return { t, x, y, vx, vy, nx: 0, ny: 0, pcool: 0, slow: 0, transit: null, trail: [] };
  }

  addBall(t) {
    this.balls.push(this.newBall(t, 300 + rand(-6, 6), 70, rand(-90, 90), 60));
    const [gx, gy] = this.toGlobal(t, 300, 40);
    this.pops.add('YENİ TOP', gx, gy, '#d9d4ff', 18, 0.9);
  }

  ballCount() {
    return this.balls.length + this.pending.length;
  }

  info(force) {
    if (!force && this.infoT > 0) return;
    this.infoT = 0.5;
    for (const p of [0, 1]) {
      const t = this.tables[p];
      this.api.info(p, `Skor ${fmt(this.score[0])} - ${fmt(this.score[1])} · kasan ${fmt(t.bank)} ×${t.mult}`);
    }
  }

  award(p, pts, x, y, label, size = 22) {
    this.tables[p].bank += pts;
    if (label) {
      const [gx, gy] = this.toGlobal(p, x, y);
      this.pops.add(label, gx, gy, label.startsWith('+') ? '#fff' : '#ffd23f', size, 0.8);
    }
    this.info();
  }

  pressed(p, side) {
    const s = this.api.input[p];
    const tp = this.tap[p];
    const leftBtn = s.left || s.b || tp[0] > 0;
    const rightBtn = s.right || s.a || tp[1] > 0;
    // 2. masa aynalı çizilir: ekrandaki sol palet onun yerel sağ paletidir
    if (p === 0) return side === 0 ? leftBtn : rightBtn;
    return side === 1 ? leftBtn : rightBtn;
  }

  onKey(p, k, down) {
    if (!down || this.phase !== 'play') return;
    // çok kısa dokunuşta bile palet en az bir an kalksın
    if (k === 'left' || k === 'b') this.tap[p][0] = 0.12;
    else if (k === 'right' || k === 'a') this.tap[p][1] = 0.12;
    else return;
    this.api.sfx('lock');
  }

  // ---------------------------------------------------------------- olaylar
  teleport(b, which) {
    const from = b.t;
    const to = 1 - from;
    const m = MOUTHS[which];
    const sp = Math.min(800, Math.max(420, Math.hypot(b.vx, b.vy)));
    const y = Math.max(m.y0 + 13, Math.min(m.y1 - 13, b.y));
    const [fx, fy] = this.toGlobal(from, 588, y);
    const [tx, ty] = this.toGlobal(to, 588, y);
    b.transit = { t: 0, d: 0.3, fx, fy, tx, ty, dest: { t: to, x: 586, y, vx: -sp * 0.85, vy: sp * rand(0.1, 0.4) } };
    this.tables[from].portalFx[which] = 0.5;
    this.award(from, 500, 520, y - 30, 'PORTAL +500');
    this.api.sfx('nitro');
    this.api.buzz(to, 50);
  }

  attack(p) {
    const tb = this.tables[p];
    tb.core = 0;
    this.award(p, 1000, CORE.x, CORE.y - 34, 'SALDIRI +1000', 26);
    if (this.ballCount() >= MAX_BALLS) return;
    // rakibin masasına üst portaldan ek top gönder
    const m = MOUTHS[0];
    const y = (m.y0 + m.y1) / 2;
    const [fx, fy] = this.toGlobal(p, 588, y);
    const [tx, ty] = this.toGlobal(1 - p, 588, y);
    const b = this.newBall(p, 588, y, 0, 0);
    b.transit = { t: 0, d: 0.4, fx, fy, tx, ty, dest: { t: 1 - p, x: 586, y, vx: -560, vy: 140 } };
    this.balls.push(b);
    tb.portalFx[0] = 0.6;
    this.pops.add('SALDIRI TOPU!', tx, ty - 50, '#ff6b7a', 30, 1.3);
    this.api.sfx('power');
    this.api.buzz(1 - p, 120);
  }

  // top bir masanın deliğine düştü: o masanın sahibi golü yer
  drain(b) {
    const c = b.t;
    const ct = this.tables[c];
    const [gx, gy] = this.toGlobal(c, 300, 700);
    if (ct.shield > 0) {
      ct.shield = 0;
      Object.assign(b, { x: 300, y: 700, vx: rand(-50, 50), vy: -1250, pcool: 0, trail: [] });
      this.pops.add('KALKAN KURTARDI!', gx, gy - 60, '#7fe3ff', 28, 1.2);
      this.parts.burst(gx, gy, 18, ['#7fe3ff', '#ffffff'], { speed: 300, size: 6, life: 0.6, gravity: 0 });
      this.api.sfx('power');
      return true;
    }
    const sc = 1 - c;
    const st = this.tables[sc];
    const gain = st.bank * st.mult + GOAL_BONUS;
    this.score[sc] += gain;
    this.toasts.push({ c, p: sc, gain, bank: st.bank, mult: st.mult, t: 0, d: 1.9 });
    st.bank = 0;
    st.mult = 1;
    this.parts.burst(gx, gy - 10, 40, [PCOL[sc], '#ffffff', '#ffd23f'], { speed: 420, size: 8, life: 1, gravity: 300, angle: -Math.PI / 2, spread: Math.PI });
    this.shake.add(7, 0.3);
    this.api.sfx('goal');
    this.api.buzz(sc, 120);
    this.api.buzz(c, 300);
    this.info(true);
    if (this.golden) {
      this.finish();
      return false;
    }
    // oyunda hep en az iki top olsun: yeni top, daha az topu olan masaya (eşitse golü yiyene)
    const alive = this.balls.filter((o) => o !== b && !o.dead);
    if (alive.length + this.pending.length < 2) {
      const cnt = [0, 0];
      for (const o of alive) cnt[o.transit ? o.transit.dest.t : o.t]++;
      for (const pd of this.pending) cnt[pd.t]++;
      const target = cnt[0] < cnt[1] ? 0 : cnt[1] < cnt[0] ? 1 : c;
      this.pending.push({ t: target, time: 1.1 });
    }
    return false;
  }

  finish() {
    this.phase = 'over';
    this.overT = 2.6;
    const [a, c] = this.score;
    this.winner = a === c ? null : a > c ? 0 : 1;
    this.api.sfx('win');
  }

  // ---------------------------------------------------------------- fizik
  stepFlippers(tb, dt) {
    for (let side = 0; side < 2; side++) {
      const f = tb.flips[side];
      const want = this.phase === 'play' && this.pressed(tb.p, side);
      if (!want) {
        f.hold = 0;
        f.locked = false;
      } else if (!f.locked) {
        f.hold += dt;
        if (f.hold > HOLD_MAX) f.locked = true;
      }
      const target = want && !f.locked ? f.up : f.rest;
      const diff = target - f.a;
      const step = FLIP_W * dt;
      if (Math.abs(diff) <= step) {
        f.w = Math.abs(diff) > 1e-9 ? diff / dt : 0;
        f.a = target;
      } else {
        f.w = Math.sign(diff) * FLIP_W;
        f.a += Math.sign(diff) * step;
      }
    }
  }

  // tek topun tek alt adımdaki çarpışmaları ve olayları; top masadan çıktıysa false
  collideBall(b) {
    const tb = this.tables[b.t];
    // duvarlar, sapanlar, direkler
    for (const s of SEGS) {
      const imp = collide(b, s.ax, s.ay, s.bx, s.by, s.r, s.r, s.e);
      if (imp < 0) continue;
      if (s.kind === 'sling' && imp > 140) {
        b.vx += b.nx * 470;
        b.vy += b.ny * 470;
        const side = s.ax < 300 ? 0 : 1;
        if (tb.sling[side] <= 0.05) this.award(b.t, 30);
        tb.sling[side] = 0.15;
        this.api.sfx('bounce');
      } else if (imp > 300) this.api.sfx('steel');
    }
    // düşen hedefler
    for (let i = 0; i < 3; i++) {
      if (!tb.drops[i]) continue;
      const d = DROPS[i];
      const imp = collide(b, d.x, d.y0, d.x, d.y1, 5, 5, 0.4);
      if (imp > 300) {
        tb.drops[i] = false;
        this.award(b.t, 250, 70, d.y, '+250');
        this.api.sfx('hit');
        if (tb.drops.every((x) => !x)) {
          tb.shield = SHIELD_T;
          this.award(b.t, 1000, 160, 300, 'KALKAN AÇIK! +1000', 26);
          this.api.sfx('power');
          this.api.buzz(b.t, 80);
        }
      }
    }
    // tamponlar
    for (let i = 0; i < 3; i++) {
      const bm = BUMPERS[i];
      if (collideCircle(b, bm, 0.7) < 0) continue;
      const out = b.vx * b.nx + b.vy * b.ny;
      if (out < 560) {
        b.vx += b.nx * (560 - out);
        b.vy += b.ny * (560 - out);
      }
      if (tb.bump[i] <= 0.05) {
        this.award(b.t, 100, bm.x, bm.y - 36, '+100', 18);
        this.api.sfx('thock');
      }
      tb.bump[i] = 0.15;
    }
    // çekirdek (SALDIRI hedefi)
    const ci = collideCircle(b, CORE, 0.6);
    if (ci > 80 && tb.coreCool <= 0) tb.coreFx = 0.12;
    if (ci > CORE_HARD && tb.coreCool <= 0) {
      tb.coreCool = 0.3;
      tb.coreFx = 0.3;
      tb.core++;
      this.award(b.t, 300, CORE.x, CORE.y - 30, '+300');
      this.api.sfx('pickup');
      if (tb.core >= 3) this.attack(b.t);
    }
    // paletler
    for (const f of tb.flips) {
      const tx = f.x + Math.cos(f.a) * FLIP_L;
      const ty = f.y + Math.sin(f.a) * FLIP_L;
      collide(b, f.x, f.y, tx, ty, FR0, FR1, 0.3, f.w, f.x, f.y);
    }
    // üst şeritler
    if (b.py < LANE_Y && b.y >= LANE_Y) {
      for (let i = 0; i < 3; i++) {
        if (b.x <= POSTS[i] || b.x >= POSTS[i + 1] || tb.lanes[i]) continue;
        tb.lanes[i] = true;
        this.award(b.t, 150, (POSTS[i] + POSTS[i + 1]) / 2, 165, '+150', 18);
        this.api.sfx('beep');
        if (tb.lanes.every(Boolean)) {
          tb.lanes = [false, false, false];
          if (tb.mult < 5) tb.mult++;
          this.award(b.t, 500, 300, 200, `ÇARPAN ×${tb.mult}`, 30);
          this.api.sfx('power');
          this.api.buzz(b.t, 50);
        }
      }
    }
    // portal ağızları
    if (b.x > 571 && (b.pcool <= 0 || b.x > 592)) {
      const yc = b.y;
      const which = Math.abs(yc - (MOUTHS[0].y0 + MOUTHS[0].y1) / 2) < Math.abs(yc - (MOUTHS[1].y0 + MOUTHS[1].y1) / 2) ? 0 : 1;
      this.teleport(b, which);
      return true;
    }
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > MAXV) {
      b.vx *= MAXV / sp;
      b.vy *= MAXV / sp;
    }
    // delik: alttan düşen ya da paletin altından yana kaçan top kaybedilmiştir
    if (b.y > TH + 20 || (b.y > 612 && (b.x < 168 || b.x > 432))) return this.drain(b);
    // güvenlik: masadan taşan top (olmamalı) yukarıdan yeniden düşer
    if (!(b.x > 10 && b.x < 598 && b.y > 10)) {
      this.rescues++;
      Object.assign(b, { x: 300, y: 70, vx: rand(-60, 60), vy: 60, trail: [] });
    }
    return true;
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.infoT > 0) this.infoT -= dt;
    for (const tp of this.tap) {
      if (tp[0] > 0) tp[0] -= dt;
      if (tp[1] > 0) tp[1] -= dt;
    }
    for (const t of this.toasts) t.t += dt;
    if (this.toasts.length && this.toasts[0].t > this.toasts[0].d) this.toasts.shift();
    if (this.phase === 'over') {
      this.overT -= dt;
      if (this.overT <= 0) {
        this.phase = 'done';
        this.api.end({ winner: this.winner, detail: `Skor ${fmt(this.score[0])} - ${fmt(this.score[1])}${this.golden ? ' · altın gol' : ''}` });
      }
      return;
    }
    if (this.phase !== 'play') return;
    if (!this.golden) {
      this.clock -= dt;
      const sec = Math.ceil(this.clock);
      if (sec !== this.lastSec) {
        this.lastSec = sec;
        if (sec <= 10 && sec > 0) this.api.sfx('count');
      }
      if (this.clock <= 0) {
        this.clock = 0;
        if (this.score[0] !== this.score[1]) {
          this.finish();
          return;
        }
        this.golden = true;
        this.pops.add('ALTIN GOL! İlk gol kazanır', W / 2, H / 2, '#ffd23f', 44, 2.4);
        this.api.sfx('power');
      }
    }
    for (const tb of this.tables) {
      for (let i = 0; i < 3; i++) if (tb.bump[i] > 0) tb.bump[i] -= dt;
      for (let i = 0; i < 2; i++) {
        if (tb.sling[i] > 0) tb.sling[i] -= dt;
        if (tb.portalFx[i] > 0) tb.portalFx[i] -= dt;
      }
      if (tb.coreFx > 0) tb.coreFx -= dt;
      if (tb.coreCool > 0) tb.coreCool -= dt;
      if (tb.shield > 0) tb.shield = Math.max(0, tb.shield - dt);
      if (tb.shield <= 0 && tb.drops.every((x) => !x)) {
        tb.dropReset += dt;
        if (tb.dropReset > 5) {
          tb.dropReset = 0;
          tb.drops = [true, true, true];
        }
      }
    }
    // bekleyen yeni toplar
    if (this.pending.length) {
      for (const pd of this.pending) pd.time -= dt;
      for (const pd of this.pending) if (pd.time <= 0) this.addBall(pd.t);
      this.pending = this.pending.filter((x) => x.time > 0);
    }
    // portal tüpündeki toplar
    for (const b of this.balls) {
      if (!b.transit) continue;
      b.transit.t += dt;
      if (b.transit.t >= b.transit.d) {
        const d = b.transit.dest;
        Object.assign(b, { t: d.t, x: d.x, y: d.y, vx: d.vx, vy: d.vy, pcool: 0.5, slow: 0, transit: null, trail: [] });
        const [gx, gy] = this.toGlobal(d.t, d.x, d.y);
        this.parts.burst(gx, gy, 10, ['#ffffff', PCOL[1 - d.t]], { speed: 200, size: 5, life: 0.4, gravity: 0 });
      }
    }

    const sd = dt / SUB;
    for (let k = 0; k < SUB; k++) {
      for (const tb of this.tables) this.stepFlippers(tb, sd);
      // hareket
      for (const b of this.balls) {
        if (b.transit) continue;
        b.px = b.x;
        b.py = b.y;
        b.vy += GRAV * sd;
        b.x += b.vx * sd;
        b.y += b.vy * sd;
        if (b.pcool > 0) b.pcool -= sd;
      }
      // aynı masadaki toplar birbirine çarpar (duvarlar en son çözülür ki top duvardan taşmasın)
      for (let i = 0; i < this.balls.length; i++) {
        const a = this.balls[i];
        if (a.transit) continue;
        for (let j = i + 1; j < this.balls.length; j++) {
          const c = this.balls[j];
          if (c.transit || c.t !== a.t) continue;
          const dx = c.x - a.x;
          const dy = c.y - a.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= 4 * BR * BR || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const push = (2 * BR - d) / 2;
          a.x -= nx * push;
          a.y -= ny * push;
          c.x += nx * push;
          c.y += ny * push;
          const rv = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
          if (rv > 0) {
            a.vx -= rv * nx;
            a.vy -= rv * ny;
            c.vx += rv * nx;
            c.vy += rv * ny;
          }
        }
      }
      // çarpışmalar ve olaylar
      let gone = false;
      for (const b of this.balls) {
        if (b.transit || b.dead) continue;
        if (!this.collideBall(b)) {
          b.dead = true;
          gone = true;
        }
        if (this.phase !== 'play') break;
      }
      if (gone) this.balls = this.balls.filter((b) => !b.dead);
      if (this.phase !== 'play') return;
    }
    // takılı kalan top (olmamalı) dürtülür; paletin üstünde bekletilen top hariç
    for (const b of this.balls) {
      if (b.transit) continue;
      const nearFlip = PIVOTS.some((pv) => Math.hypot(b.x - pv.x, b.y - pv.y) < 140);
      if (Math.hypot(b.vx, b.vy) < 18 && !nearFlip) {
        b.slow += dt;
        if (b.slow > 2) {
          this.nudges++;
          b.vx = rand(-220, 220);
          b.vy = -420;
          b.slow = 0;
        }
      } else b.slow = 0;
      b.trail.push(b.x, b.y);
      if (b.trail.length > 12) b.trail.splice(0, 2);
    }
    if (!this.ballCount()) this.pending.push({ t: 0, time: 0.6 }, { t: 1, time: 0.6 });
  }

  demo() {
    this.pending = [];
    this.balls = [this.newBall(0, 262, 420, 0, 0), this.newBall(1, 330, 210, 0, 0)];
    const y = (MOUTHS[0].y0 + MOUTHS[0].y1) / 2;
    const [fx, fy] = this.toGlobal(0, 588, y);
    const [tx, ty] = this.toGlobal(1, 588, y);
    const tb = this.newBall(0, 588, y, 0, 0);
    tb.transit = { t: 0.15, d: 0.3, fx, fy, tx, ty, dest: { t: 1, x: 586, y, vx: -500, vy: 100 } };
    this.balls.push(tb);
    Object.assign(this.tables[0], { lanes: [true, false, true], bank: 3250, mult: 2, core: 2 });
    Object.assign(this.tables[1], { bank: 1800, shield: 12, drops: [false, true, false] });
    this.tables[0].flips[0].a = this.tables[0].flips[0].up;
    this.tables[1].bump[2] = 0.1;
    this.score = [6400, 4100];
  }

  // ---------------------------------------------------------------- çizim
  paintTable(g, p) {
    const col = PCOL[p];
    g.fillStyle = '#0b0a1d';
    g.fillRect(0, 0, TW, TH);
    // oyun alanı
    g.beginPath();
    FIELD.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    const grad = g.createLinearGradient(0, 0, 0, TH);
    grad.addColorStop(0, shade(col, -0.68));
    grad.addColorStop(0.55, '#110e2d');
    grad.addColorStop(1, '#090719');
    g.fillStyle = grad;
    g.fill();
    g.save();
    g.clip();
    g.strokeStyle = rgba(col, 0.07);
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= TW; x += 30) {
      g.moveTo(x, 0);
      g.lineTo(x, TH);
    }
    for (let y = 0; y <= TH; y += 30) {
      g.moveTo(0, y);
      g.lineTo(TW, y);
    }
    g.stroke();
    // portallara giden ok işaretleri
    for (const m of MOUTHS) {
      const cy = (m.y0 + m.y1) / 2;
      for (let k = 0; k < 3; k++) {
        const x = 470 + k * 30;
        g.fillStyle = rgba(col, 0.16 + k * 0.1);
        g.beginPath();
        g.moveTo(x, cy - 13);
        g.lineTo(x + 18, cy);
        g.lineTo(x, cy + 13);
        g.lineTo(x + 7, cy);
        g.closePath();
        g.fill();
      }
    }
    // tampon altlıkları
    for (const bm of BUMPERS) {
      g.fillStyle = rgba(col, 0.12);
      g.beginPath();
      g.arc(bm.x, bm.y, bm.r + 16, 0, Math.PI * 2);
      g.fill();
    }
    // şerit zeminleri
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 3; i++) g.fillRect(POSTS[i] + 5, 96, POSTS[i + 1] - POSTS[i] - 10, 46);
    // çekirdek altlığı
    g.strokeStyle = 'rgba(255,107,122,.25)';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(CORE.x, CORE.y, CORE.r + 22, 0, Math.PI * 2);
    g.stroke();
    // delik (kale ağzı)
    const dr = g.createLinearGradient(0, 600, 0, TH);
    dr.addColorStop(0, 'rgba(255,59,92,0)');
    dr.addColorStop(1, 'rgba(255,59,92,.32)');
    g.fillStyle = dr;
    g.fillRect(166, 600, 268, 120);
    g.restore();
    // sapan gövdeleri
    for (const side of [0, 1]) {
      const X = (x) => (side ? mx(x) : x);
      g.beginPath();
      g.moveTo(X(SL_A[0]), SL_A[1]);
      g.lineTo(X(SL_B[0]), SL_B[1]);
      g.lineTo(X(SL_A[0]), SL_B[1]);
      g.closePath();
      g.fillStyle = shade(col, -0.45);
      g.fill();
    }
    // portal ışımaları (sabit; yalnız top geçerken ek parlama her karede çizilir)
    for (const m of MOUTHS) {
      const cy = (m.y0 + m.y1) / 2;
      const gr = ((m.y1 - m.y0) / 2 - 3) * 2.2;
      g.drawImage(glow(col, 40, 0.7), 588 - gr, cy - gr, gr * 2, gr * 2);
    }
    // portal ağızları: duvardaki tünel girişleri
    for (const m of MOUTHS) {
      g.fillStyle = '#05040f';
      g.fillRect(578, m.y0, 22, m.y1 - m.y0);
      g.fillStyle = shade(col, 0.3);
      g.fillRect(578, m.y0 - 3, 22, 3);
      g.fillRect(578, m.y1, 22, 3);
    }
    // duvarlar (neon; katmanda bir kez çizildiği için gölge ucuz)
    g.save();
    g.shadowColor = col;
    g.shadowBlur = 14;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const s of SEGS) {
      if (s.kind === 'post') continue;
      g.lineWidth = s.kind === 'sling' ? 7 : 6;
      g.strokeStyle = s.kind === 'sling' ? '#ffffff' : shade(col, 0.35);
      g.beginPath();
      g.moveTo(s.ax, s.ay);
      g.lineTo(s.bx, s.by);
      g.stroke();
    }
    g.restore();
    // şerit direkleri
    g.fillStyle = '#e9e6ff';
    for (const x of POSTS) {
      rr(g, x - 3, 100, 6, 38, 3);
      g.fill();
    }
    // düşen hedef yuvası
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.fillRect(25, DROPS[0].y0 - 4, 14, DROPS[2].y1 - DROPS[0].y0 + 8);
    // palet yuvaları
    g.fillStyle = 'rgba(255,255,255,.1)';
    for (const pv of PIVOTS) {
      g.beginPath();
      g.arc(pv.x, pv.y, 17, 0, Math.PI * 2);
      g.fill();
    }
  }

  bumperSprite(p, lit) {
    const col = PCOL[p];
    return sprite(`pb-bump|${col}|${lit ? 1 : 0}`, 80, 80, (g) => {
      const c = 40;
      if (lit) g.drawImage(glow(col, 40, 0.9), 0, 0, 80, 80);
      g.fillStyle = shade(col, lit ? 0.5 : -0.35);
      g.beginPath();
      g.arc(c, c, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = lit ? '#ffffff' : shade(col, 0.15);
      g.beginPath();
      g.arc(c, c, 15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = lit ? shade(col, 0.6) : shade(col, -0.2);
      g.beginPath();
      g.arc(c, c, 7, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = lit ? '#ffffff' : shade(col, 0.45);
      g.lineWidth = 3;
      g.beginPath();
      g.arc(c, c, 24, 0, Math.PI * 2);
      g.stroke();
    });
  }

  ballSprite() {
    return sprite('pb-ball', 30, 30, (g) => {
      const gr = g.createRadialGradient(11, 10, 2, 15, 15, 12);
      gr.addColorStop(0, '#ffffff');
      gr.addColorStop(0.5, '#d6dbe8');
      gr.addColorStop(1, '#6f7690');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(15, 15, BR, 0, Math.PI * 2);
      g.fill();
    });
  }

  drawFlipper(g, f, col) {
    g.save();
    g.translate(f.x, f.y);
    g.rotate(f.a);
    g.beginPath();
    g.arc(0, 0, FR0, Math.PI / 2, (Math.PI * 3) / 2);
    g.lineTo(FLIP_L, -FR1);
    g.arc(FLIP_L, 0, FR1, -Math.PI / 2, Math.PI / 2);
    g.closePath();
    g.fillStyle = f.locked ? shade(col, -0.3) : shade(col, 0.2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 2.5;
    g.stroke();
    g.fillStyle = shade(col, -0.45);
    g.beginPath();
    g.arc(0, 0, 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  drawTable(g, p) {
    const tb = this.tables[p];
    const col = PCOL[p];
    this.layers[p].draw(g, OX[p], OY);
    g.save();
    if (p === 0) {
      g.translate(OX[0], OY);
      g.scale(S, S);
    } else {
      g.translate(OX[1] + TW * S, OY);
      g.scale(-S, S);
    }
    // şerit ve çarpan ışıkları
    for (let i = 0; i < 3; i++) {
      const x = (POSTS[i] + POSTS[i + 1]) / 2;
      g.fillStyle = tb.lanes[i] ? '#ffd23f' : 'rgba(255,255,255,.14)';
      g.beginPath();
      g.arc(x, 156, 7, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle = tb.mult >= i + 2 ? '#46e38a' : 'rgba(255,255,255,.1)';
      g.beginPath();
      g.arc(255 + i * 30, 186, 6, 0, Math.PI * 2);
      g.fill();
    }
    // tamponlar
    for (let i = 0; i < 3; i++) {
      const bm = BUMPERS[i];
      g.drawImage(this.bumperSprite(p, tb.bump[i] > 0), bm.x - 40, bm.y - 40, 80, 80);
    }
    // çekirdek ve ilerleme halkası
    if (tb.coreFx > 0) g.drawImage(glow('#ff6b7a', 34, 0.8), CORE.x - 34, CORE.y - 34, 68, 68);
    g.fillStyle = tb.coreFx > 0 ? '#ffffff' : '#ff6b7a';
    g.beginPath();
    g.arc(CORE.x, CORE.y, CORE.r, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 5;
    for (let i = 0; i < 3; i++) {
      g.strokeStyle = i < tb.core ? '#ff6b7a' : 'rgba(255,255,255,.15)';
      const a0 = -Math.PI / 2 + (i * Math.PI * 2) / 3 + 0.14;
      g.beginPath();
      g.arc(CORE.x, CORE.y, CORE.r + 9, a0, a0 + (Math.PI * 2) / 3 - 0.28);
      g.stroke();
    }
    // düşen hedefler
    for (let i = 0; i < 3; i++) {
      const d = DROPS[i];
      if (tb.drops[i]) {
        g.fillStyle = '#ffb347';
        rr(g, d.x - 5, d.y0 - 5, 10, d.y1 - d.y0 + 10, 5);
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.fillRect(d.x - 2, d.y0, 2, d.y1 - d.y0);
      } else {
        g.fillStyle = 'rgba(255,179,71,.25)';
        g.fillRect(d.x - 5, d.y - 3, 10, 6);
      }
    }
    // sapan parlaması
    for (let i = 0; i < 2; i++) {
      if (tb.sling[i] <= 0) continue;
      const X = (x) => (i ? mx(x) : x);
      g.strokeStyle = rgba(col, Math.min(1, tb.sling[i] / 0.15));
      g.lineWidth = 12;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(X(SL_A[0]), SL_A[1]);
      g.lineTo(X(SL_B[0]), SL_B[1]);
      g.stroke();
    }
    // portal girdapları
    for (let i = 0; i < 2; i++) {
      const m = MOUTHS[i];
      const cy = (m.y0 + m.y1) / 2;
      const r = (m.y1 - m.y0) / 2 - 3;
      if (tb.portalFx[i] > 0) {
        const gr = r * 2.2 * (1 + tb.portalFx[i]);
        g.drawImage(glow(col, 40, 0.7), 588 - gr, cy - gr, gr * 2, gr * 2);
      }
      g.strokeStyle = shade(col, 0.45);
      g.lineWidth = 3;
      for (let k = 0; k < 3; k++) {
        const a = this.time * (3 + k) + k * 2;
        g.beginPath();
        g.arc(588, cy, r - 3 - k * 6, a, a + 3.6);
        g.stroke();
      }
    }
    // kalkan
    if (tb.shield > 0) {
      const a = tb.shield < 4 && Math.floor(this.time * 8) % 2 ? 0.3 : 0.9;
      g.drawImage(glow('#7fe3ff', 60, 0.45), 240, 640, 120, 120);
      g.fillStyle = `rgba(127,227,255,${a})`;
      rr(g, 196, 698, 208, 8, 4);
      g.fill();
    }
    // paletler
    for (const f of tb.flips) this.drawFlipper(g, f, col);
    // toplar
    const spr = this.ballSprite();
    for (const b of this.balls) {
      if (b.transit || b.t !== p) continue;
      const t = b.trail;
      g.fillStyle = 'rgba(220,230,255,.6)';
      for (let i = RES.low ? t.length : 2; i < t.length; i += 4) {
        g.globalAlpha = (i / t.length) * 0.45;
        g.beginPath();
        g.arc(t[i], t[i + 1], BR * (0.35 + (0.5 * i) / t.length), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.drawImage(spr, b.x - 15, b.y - 15, 30, 30);
    }
    g.restore();
  }

  // zemin, ortadaki portal tüpleri ve sabit yazılar: bir kez çizilir
  paintBg(g) {
    g.fillStyle = '#06051a';
    g.fillRect(0, 0, W, H);
    const x0 = OX[0] + 578 * S;
    const x1 = OX[1] + (TW - 578) * S;
    for (const m of MOUTHS) {
      const cy = OY + ((m.y0 + m.y1) / 2) * S;
      const h = (m.y1 - m.y0) * S * 0.86;
      rr(g, x0, cy - h / 2, x1 - x0, h, h / 2);
      g.fillStyle = '#0d0b26';
      g.fill();
      const grad = g.createLinearGradient(x0, 0, x1, 0);
      grad.addColorStop(0, PCOL[0]);
      grad.addColorStop(1, PCOL[1]);
      g.strokeStyle = grad;
      g.lineWidth = 3;
      g.stroke();
    }
    const cx = W / 2;
    drawText(g, 'KASA', cx, 80, { size: 16, color: '#9a93d6', weight: 800 });
    drawText(g, 'PORTAL', cx, 226, { size: 13, color: '#8f88c9', weight: 800 });
    drawText(g, 'GOL =', cx, 440, { size: 19, color: '#ffd23f', weight: 800 });
    drawText(g, 'kasa × çarpan', cx, 464, { size: 14, color: '#b9b3ea', weight: 700 });
    drawText(g, '+ 1000', cx, 484, { size: 14, color: '#b9b3ea', weight: 700 });
  }

  draw(g) {
    this.bgLayer.draw(g);
    // tüplerde akan enerji
    const x0 = OX[0] + 578 * S;
    const x1 = OX[1] + (TW - 578) * S;
    for (const m of MOUTHS) {
      const cy = OY + ((m.y0 + m.y1) / 2) * S;
      const h = (m.y1 - m.y0) * S * 0.86;
      for (let k = 0; k < 4; k++) {
        const f = (this.time * 0.7 + k / 4) % 1;
        g.fillStyle = rgba(PCOL[0], 0.5);
        g.fillRect(x0 + 24 + f * (x1 - x0 - 58), cy - h / 4 - 2, 10, 4);
        g.fillStyle = rgba(PCOL[1], 0.5);
        g.fillRect(x1 - 34 - f * (x1 - x0 - 58), cy + h / 4 - 2, 10, 4);
      }
    }
    g.save();
    this.shake.apply(g);
    this.drawTable(g, 0);
    this.drawTable(g, 1);
    // tüpte yol alan toplar
    const spr = this.ballSprite();
    for (const b of this.balls) {
      if (!b.transit) continue;
      const tr = b.transit;
      const f = Math.min(1, tr.t / tr.d);
      const x = tr.fx + (tr.tx - tr.fx) * f;
      const y = tr.fy + (tr.ty - tr.fy) * f;
      g.drawImage(glow('#ffffff', 26, 0.8), x - 26, y - 26, 52, 52);
      g.drawImage(spr, x - 14, y - 14, 28, 28);
    }
    this.parts.draw(g);
    g.restore();

    // üst bilgi: isimler, skorlar, süre
    const names = this.api.players.map((pl) => pl.name);
    drawText(g, names[0], OX[0], 26, { size: 24, color: PCOL[0], weight: 800, align: 'left' });
    drawText(g, fmt(this.score[0]), OX[0] + TW * S, 26, { size: 32, color: '#ffffff', weight: 800, align: 'right' });
    drawText(g, names[1], OX[1] + TW * S, 26, { size: 24, color: PCOL[1], weight: 800, align: 'right' });
    drawText(g, fmt(this.score[1]), OX[1], 26, { size: 32, color: '#ffffff', weight: 800, align: 'left' });
    const c = Math.ceil(this.clock);
    if (this.golden) drawText(g, 'ALTIN GOL', W / 2, 26, { size: 20, color: '#ffd23f', weight: 800 });
    else drawText(g, `${Math.floor(c / 60)}:${String(c % 60).padStart(2, '0')}`, W / 2, 26, { size: 30, color: c <= 10 ? '#ff8a8a' : '#ffffff', weight: 800 });
    // orta sütun: kasalar, kural, kalkanlar
    const cx = W / 2;
    for (const p of [0, 1]) {
      const tb = this.tables[p];
      const y = 108 + p * 54;
      drawText(g, fmt(tb.bank), cx, y, { size: 24, color: PCOL[p], weight: 800 });
      drawText(g, `×${tb.mult}`, cx, y + 23, { size: 17, color: tb.mult > 1 ? '#46e38a' : '#8f88c9', weight: 800 });
    }
    let sy = 540;
    for (const p of [0, 1]) {
      const tb = this.tables[p];
      if (tb.shield <= 0) continue;
      drawText(g, `KALKAN ${Math.ceil(tb.shield)}`, cx, sy, { size: 15, color: PCOL[p], weight: 800 });
      sy += 24;
    }
    this.pops.draw(g);
    // gol duyuruları (oyunu kapatmadan, golü yiyen masanın üstünde)
    for (const t of this.toasts) {
      const a = Math.min(1, t.t * 5, (t.d - t.t) * 3);
      const [gx] = this.toGlobal(t.c, 300, 0);
      const sc = t.t < 0.15 ? 0.7 + (t.t / 0.15) * 0.3 : 1;
      drawText(g, 'GOL!', gx, 215, { size: 76, scale: sc, color: PCOL[t.p], weight: 800, stroke: 'rgba(0,0,0,.65)', sw: 10, alpha: a });
      drawText(g, `${names[t.p]} +${fmt(t.gain)}`, gx, 270, { size: 30, color: '#ffffff', weight: 800, stroke: 'rgba(0,0,0,.6)', sw: 7, alpha: a });
      const det = t.bank ? `kasa ${fmt(t.bank)} × ${t.mult} + ${fmt(GOAL_BONUS)}` : `gol bonusu ${fmt(GOAL_BONUS)}`;
      drawText(g, det, gx, 304, { size: 19, color: '#e6e2ff', weight: 700, stroke: 'rgba(0,0,0,.6)', sw: 6, alpha: a });
    }
    if (this.phase === 'over' || this.phase === 'done') {
      const w = this.winner;
      banner(g, w === null ? 'BERABERE' : `${names[w]} KAZANDI!`, `${fmt(this.score[0])} - ${fmt(this.score[1])}`, w === null ? '#ffd23f' : PCOL[w], 2.6 - (this.overT || 0));
    }
  }
}

export default {
  id: 'pinball',
  name: 'Portal Pinball',
  icon: '🌀',
  tag: 'Portallı pinball düellosu',
  mode: 'versus',
  cat: 'aksiyon',
  color: '#b45cff',
  desc: 'İki pinball masası portallarla birbirine bağlı! Tampon, şerit ve hedeflerden puan topla — puanların KASA’da birikir. Topu portaldan rakibin masasına yolla: rakibin deliğine düşerse GOL olur ve kasan, çarpanıyla birlikte skoruna eklenir.',
  howto: [
    'Sol / sağ düğme: sol ve sağ palet',
    'İç kenardaki portal ağzına giren top rakibin masasına geçer',
    'Rakibin deliğine düşen top = GOL: kasan × çarpan + 1000 skoruna eklenir',
    'Üstteki 3 şeridi yak: çarpan +1 · Turuncu hedefleri düşür: KALKAN (deliği bir kez korur)',
    'Ortadaki kırmızı hedefe 3 kez vur: rakibe ek SALDIRI topu',
    'Palet en fazla 3 sn havada kalır · 2,5 dakika, eşitlikte altın gol',
  ],
  keys: '1. oyuncu A / D · 2. oyuncu ← / →',
  controller: { layout: 'ab', a: 'SAĞ PALET', b: 'SOL PALET' },
  create: (api) => new PinballGame(api),
};
