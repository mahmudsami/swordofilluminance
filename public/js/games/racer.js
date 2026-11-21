// TURBO PİST — tepeden bakışlı araba yarışı. 3 tur, ilk bitiren kazanır.
// Sarı oklu pedler hız verir, çimen yavaşlatır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp, sprite, Layer } from '../host/gfx.js';

const LAPS = 3;
const N = 600; // pist örnek noktası
const TW = 104; // pist genişliği
const CAR_R = 17;

const TRACKS = [
  {
    name: 'Sahil Pisti',
    grass: ['#3f8f4a', '#46994f'],
    pts: [[800, 632], [560, 632], [330, 616], [170, 560], [110, 420], [170, 290], [320, 238], [460, 300], [560, 410], [690, 410], [770, 270], [880, 160], [1050, 150], [1170, 260], [1160, 440], [1060, 572], [920, 626]],
    boosts: [0.36, 0.74],
  },
  {
    name: 'Şehir Turu',
    grass: ['#4a7d3c', '#528845'],
    pts: [[660, 640], [420, 640], [250, 606], [140, 500], [150, 360], [260, 290], [380, 330], [480, 270], [440, 176], [560, 132], [720, 152], [780, 260], [900, 300], [1010, 214], [1140, 236], [1190, 380], [1110, 500], [960, 520], [860, 612]],
    boosts: [0.2, 0.55, 0.86],
  },
];
let raceNo = 0;

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [0, 1].map((i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3));
}

function buildTrack(pts) {
  const dense = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let k = 0; k < 40; k++) dense.push(catmull(p0, p1, p2, p3, k / 40));
  }
  // yay uzunluğuna göre eşit aralıklı örnekle
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < N; k++) {
    const d = (k / N) * total;
    while (cum[j + 1] < d) j++;
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    const t = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  const dirs = out.map((p, i) => {
    const q = out[(i + 1) % N];
    const r = out[(i - 1 + N) % N];
    const dx = q[0] - r[0];
    const dy = q[1] - r[1];
    const l = Math.hypot(dx, dy) || 1;
    return [dx / l, dy / l];
  });
  return { pts: out, dirs, length: total };
}

function drawCar(g, x, y, a, color, s = 1, opts = {}) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.scale(s, s);
  g.fillStyle = 'rgba(0,0,0,.35)';
  rr(g, -20, -10, 44, 26, 8);
  g.fill();
  // tekerlekler
  g.fillStyle = '#1b1a26';
  for (const [wx, wy] of [[-13, -13], [11, -13], [-13, 9], [11, 9]]) {
    rr(g, wx, wy, 10, 5, 2);
    g.fill();
  }
  // gövde
  const grad = g.createLinearGradient(0, -11, 0, 11);
  grad.addColorStop(0, shade(color, 0.3));
  grad.addColorStop(1, shade(color, -0.25));
  rr(g, -21, -11, 42, 22, 8);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = shade(color, -0.55);
  g.lineWidth = 2;
  g.stroke();
  // şerit
  g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillRect(-21, -2.5, 42, 5);
  // cam
  g.fillStyle = '#1d2b45';
  rr(g, 0, -8, 9, 16, 3);
  g.fill();
  g.fillStyle = 'rgba(160,220,255,.5)';
  rr(g, 2, -6, 4, 6, 2);
  g.fill();
  // spoiler
  g.fillStyle = shade(color, -0.45);
  g.fillRect(-23, -10, 4, 20);
  // farlar
  g.fillStyle = '#fff6c2';
  g.fillRect(18, -9, 3, 5);
  g.fillRect(18, 4, 3, 5);
  if (opts.boost) {
    g.fillStyle = `rgba(255,${150 + Math.random() * 100},40,.9)`;
    g.beginPath();
    g.moveTo(-23, -5);
    g.lineTo(-38 - Math.random() * 14, 0);
    g.lineTo(-23, 5);
    g.fill();
  }
  g.restore();
}

class RacerGame {
  constructor(api) {
    this.api = api;
    this.def = TRACKS[(api.preview ? 0 : raceNo++) % TRACKS.length];
    this.track = buildTrack(this.def.pts);
    this.time = 0;
    this.raceTime = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.boostIdx = this.def.boosts.map((f) => Math.floor(f * N));
    this.renderTrack();
    const [sx, sy] = this.track.pts[0];
    const [dx, dy] = this.track.dirs[0];
    const ang = Math.atan2(dy, dx);
    this.cars = [0, 1].map((p) => {
      const side = p === 0 ? -1 : 1;
      const x = sx - dx * 55 + -dy * side * 24;
      const y = sy - dy * 55 + dx * side * 24;
      const c = { p, x, y, a: ang, vx: 0, vy: 0, boost: 0, lastIdx: 0, prog: 0, lap: 1, done: false, finishT: 0, wrong: 0, grass: false, skidT: 0, lapPop: 0 };
      c.lastIdx = this.nearest(x, y).i;
      c.prog = c.lastIdx > N / 2 ? c.lastIdx - N : c.lastIdx;
      return c;
    });
    this.phase = 'race';
    this.winner = null;
    this.endT = 0;
    this.info();
  }

  info() {
    for (const c of this.cars) this.api.info(c.p, `${this.def.name} · Tur ${Math.min(LAPS, c.lap)}/${LAPS}`);
  }

  nearest(x, y) {
    let best = 0;
    let bd = Infinity;
    const P = this.track.pts;
    for (let i = 0; i < N; i += 3) {
      const d = (P[i][0] - x) ** 2 + (P[i][1] - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    for (let i = best - 3; i <= best + 3; i++) {
      const k = (i + N) % N;
      const d = (P[k][0] - x) ** 2 + (P[k][1] - y) ** 2;
      if (d < bd) { bd = d; best = k; }
    }
    return { i: best, d: Math.sqrt(bd) };
  }

  renderTrack() {
    this.bg = new Layer(W, H, (g) => this.paintTrack(g));
    // savrulma izleri: kalıcı, ayrı katman
    this.skid = new Layer(W, H, () => {});
  }

  paintTrack(g) {
    const [g1, g2] = this.def.grass;
    g.fillStyle = g1;
    g.fillRect(0, 0, W, H);
    g.fillStyle = g2;
    for (let x = -H; x < W; x += 80) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 40, 0);
      g.lineTo(x + 40 + H, H);
      g.lineTo(x + H, H);
      g.fill();
    }
    const P = this.track.pts;
    const path = () => {
      g.beginPath();
      P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    // ağaçlar
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 90; k++) {
      const x = rnd() * W;
      const y = rnd() * H;
      if (this.nearest(x, y).d < TW / 2 + 40) continue;
      if (y < 90 && (x < 330 || x > W - 330 || Math.abs(x - W / 2) < 130)) continue;
      const r = 14 + rnd() * 14;
      g.fillStyle = 'rgba(0,0,0,.2)';
      g.beginPath();
      g.arc(x + 5, y + 7, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2b6b34';
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#3c8f45';
      g.beginPath();
      g.arc(x - r * 0.25, y - r * 0.25, r * 0.6, 0, Math.PI * 2);
      g.fill();
    }
    g.lineJoin = 'round';
    g.lineCap = 'round';
    // kenar gölgesi
    path();
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = TW + 34;
    g.stroke();
    // bordür
    path();
    g.strokeStyle = '#f2f2f2';
    g.lineWidth = TW + 18;
    g.stroke();
    path();
    g.strokeStyle = '#e0383e';
    g.lineCap = 'butt';
    g.setLineDash([22, 22]);
    g.stroke();
    g.setLineDash([]);
    g.lineCap = 'round';
    // asfalt
    path();
    g.strokeStyle = '#3a3d4c';
    g.lineWidth = TW;
    g.stroke();
    path();
    g.strokeStyle = 'rgba(255,255,255,.03)';
    g.lineWidth = TW - 30;
    g.stroke();
    // orta çizgi
    path();
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = 3;
    g.setLineDash([18, 22]);
    g.stroke();
    g.setLineDash([]);
    // başlangıç çizgisi (dama)
    const [sx, sy] = P[0];
    const [dx, dy] = this.track.dirs[0];
    g.save();
    g.translate(sx, sy);
    g.rotate(Math.atan2(dy, dx));
    const sq = 9;
    for (let i = -TW / 2; i < TW / 2; i += sq) {
      for (let j = 0; j < 2; j++) {
        g.fillStyle = (Math.floor((i + TW) / sq) + j) % 2 ? '#111' : '#fff';
        g.fillRect(-sq + j * sq, i, sq, sq);
      }
    }
    g.restore();
    // hız pedleri
    for (const bi of this.boostIdx) {
      const [bx, by] = P[bi];
      const [bdx, bdy] = this.track.dirs[bi];
      g.save();
      g.translate(bx, by);
      g.rotate(Math.atan2(bdy, bdx));
      rr(g, -26, -30, 52, 60, 8);
      g.fillStyle = 'rgba(255,210,63,.25)';
      g.fill();
      g.strokeStyle = '#ffd23f';
      g.lineWidth = 6;
      g.lineCap = 'round';
      for (let k = -1; k <= 1; k++) {
        g.beginPath();
        g.moveTo(k * 14 - 6, -16);
        g.lineTo(k * 14 + 6, 0);
        g.lineTo(k * 14 - 6, 16);
        g.stroke();
      }
      g.restore();
    }
  }

  updateCar(c, dt) {
    const s = this.api.input[c.p];
    const gas = s.a || s.up;
    const brake = s.b || s.down;
    let steer = (s.right ? 1 : 0) - (s.left ? 1 : 0);
    if (!steer && Math.abs(s.sx) > 0.15) steer = s.sx;
    if (c.done) {
      // bitişten sonra yavaşça dur
      c.vx *= 1 - 1.5 * dt;
      c.vy *= 1 - 1.5 * dt;
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      return;
    }
    const fx = Math.cos(c.a);
    const fy = Math.sin(c.a);
    const rx = -fy;
    const ry = fx;
    let vf = c.vx * fx + c.vy * fy;
    let vr = c.vx * rx + c.vy * ry;
    const near = this.nearest(c.x, c.y);
    c.grass = near.d > TW / 2 + 4;
    const maxF = c.grass ? 190 : c.boost > 0 ? 640 : 440;
    if (gas) vf += (c.grass ? 380 : 560) * dt;
    if (brake) vf -= (vf > 20 ? 950 : 360) * dt;
    if (!gas && !brake) vf -= vf * 0.9 * dt;
    if (c.boost > 0) {
      c.boost -= dt;
      vf += 900 * dt;
    }
    if (vf > maxF) vf -= Math.min(vf - maxF, (c.grass ? 900 : 500) * dt);
    if (vf < -160) vf = -160;
    const grip = c.grass ? 5 : 7.5;
    vr *= Math.exp(-grip * dt);
    const turn = 3.1 * clamp(vf / 180, -1, 1) * (c.grass ? 0.8 : 1);
    c.a += steer * turn * dt;
    const nfx = Math.cos(c.a);
    const nfy = Math.sin(c.a);
    c.vx = nfx * vf + -nfy * vr;
    c.vy = nfy * vf + nfx * vr;
    c.x += c.vx * dt;
    c.y += c.vy * dt;
    // ekran sınırları
    if (c.x < CAR_R) { c.x = CAR_R; c.vx = Math.abs(c.vx) * 0.4; }
    if (c.x > W - CAR_R) { c.x = W - CAR_R; c.vx = -Math.abs(c.vx) * 0.4; }
    if (c.y < CAR_R) { c.y = CAR_R; c.vy = Math.abs(c.vy) * 0.4; }
    if (c.y > H - CAR_R) { c.y = H - CAR_R; c.vy = -Math.abs(c.vy) * 0.4; }

    // savrulma izi
    if (Math.abs(vr) > 110 || (brake && vf > 200)) {
      const sg = this.skid.ctx();
      sg.fillStyle = 'rgba(20,20,30,.22)';
      for (const side of [-1, 1]) {
        sg.fillRect(c.x - nfx * 14 + -nfy * side * 10 - 2, c.y - nfy * 14 + nfx * side * 10 - 2, 4, 4);
      }
      c.skidT -= dt;
      if (c.skidT <= 0) {
        this.api.sfx('skid');
        c.skidT = 0.2;
      }
    }
    if (c.grass && Math.hypot(c.vx, c.vy) > 80 && Math.random() < dt * 24) {
      this.parts.burst(c.x - nfx * 18, c.y - nfy * 18, 1, ['#6b4a2a', '#4f8a3a'], { speed: 60, size: 5, life: 0.4, gravity: 0 });
    }

    // ilerleme
    let d = near.i - c.lastIdx;
    if (d > N / 2) d -= N;
    if (d < -N / 2) d += N;
    if (Math.abs(d) < N / 6) c.prog += d;
    c.lastIdx = near.i;
    const td = this.track.dirs[near.i];
    c.wrong = vf > 60 && nfx * td[0] + nfy * td[1] < -0.3 ? c.wrong + dt : 0;

    // hız pedi
    for (const bi of this.boostIdx) {
      let k = Math.abs(near.i - bi);
      k = Math.min(k, N - k);
      if (k < 5 && !c.grass && c.boost <= 0.3) {
        c.boost = 0.9;
        this.api.sfx('nitro');
        this.api.buzz(c.p, 40);
      }
    }

    const lap = Math.floor(c.prog / N) + 1;
    if (lap > c.lap) {
      c.lap = lap;
      if (c.lap > LAPS) {
        c.done = true;
        c.finishT = this.raceTime;
        this.api.sfx('goal');
        this.parts.burst(c.x, c.y, 40, [PCOL[c.p], '#fff', '#ffd23f'], { speed: 400, size: 8, life: 1 });
        if (this.winner === null) {
          this.winner = c.p;
          this.endT = 3;
          this.phase = 'finish';
        }
      } else {
        this.pops.add(c.lap === LAPS ? 'SON TUR!' : `TUR ${c.lap}`, c.x, c.y - 30, PCOL[c.p], 34);
        this.api.sfx('pickup');
        this.api.buzz(c.p, 50);
      }
      this.info();
    }
  }

  collideCars() {
    const [a, b] = this.cars;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d >= CAR_R * 2 || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const push = (CAR_R * 2 - d) / 2;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (rv < 0) {
      const j = -rv * 0.75;
      a.vx -= nx * j;
      a.vy -= ny * j;
      b.vx += nx * j;
      b.vy += ny * j;
      if (-rv > 120) {
        this.api.sfx('crash');
        this.shake.add(4, 0.15);
        this.api.buzz(0, 60);
        this.api.buzz(1, 60);
        this.parts.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 8, ['#ffd23f', '#fff'], { speed: 200, size: 4, life: 0.3, gravity: 0 });
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.phase === 'over') return;
    this.raceTime += dt;
    for (const c of this.cars) this.updateCar(c, dt);
    this.collideCars();
    if (this.phase === 'finish') {
      this.endT -= dt;
      if (this.endT <= 0 || this.cars.every((c) => c.done)) {
        this.phase = 'over';
        const l = this.cars[1 - this.winner];
        const gap = l.done ? `${(l.finishT - this.cars[this.winner].finishT).toFixed(2)} sn farkla` : 'rakip daha yoldaydı';
        this.api.end({ winner: this.winner, detail: `${this.def.name} · ${this.fmt(this.cars[this.winner].finishT)} · ${gap}` });
      }
    }
  }

  fmt(t) {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }

  position(p) {
    const me = this.cars[p];
    const o = this.cars[1 - p];
    if (me.done && o.done) return me.finishT <= o.finishT ? 1 : 2;
    if (me.done) return 1;
    if (o.done) return 2;
    return me.prog >= o.prog ? 1 : 2;
  }

  demo() {
    const P = this.track.pts;
    this.cars.forEach((c, i) => {
      const k = 70 + i * 12;
      [c.x, c.y] = P[k];
      c.a = Math.atan2(this.track.dirs[k][1], this.track.dirs[k][0]);
    });
    this.cars[1].boost = 1;
  }

  draw(g) {
    g.save();
    this.shake.apply(g);
    this.bg.draw(g);
    this.skid.draw(g);
    this.parts.draw(g);
    for (const c of this.cars) {
      if (c.boost > 0) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.a);
        g.fillStyle = `rgba(255,${150 + Math.random() * 100},40,.9)`;
        g.beginPath();
        g.moveTo(-24, -5);
        g.lineTo(-40 - Math.random() * 14, 0);
        g.lineTo(-24, 5);
        g.fill();
        g.restore();
      }
      const spr = sprite(`car|${PCOL[c.p]}`, 56, 40, (sg) => drawCar(sg, 28, 20, 0, PCOL[c.p], 1.05));
      g.save();
      g.translate(c.x, c.y);
      g.rotate(c.a);
      g.drawImage(spr, -28, -20, 56, 40);
      g.restore();
      if (c.wrong > 0.8 && !c.done) text(g, 'TERS YÖN!', c.x, c.y - 34, { size: 24, color: '#ffd23f', weight: 800, stroke: '#000', sw: 5 });
    }
    g.restore();
    this.pops.draw(g);

    // HUD
    for (const p of [0, 1]) {
      const c = this.cars[p];
      const left = p === 0;
      const x = left ? 16 : W - 16 - 300;
      rr(g, x, 12, 300, 70, 18);
      g.fillStyle = 'rgba(10,10,30,.72)';
      g.fill();
      g.fillStyle = PCOL[p];
      rr(g, left ? x : x + 292, 12, 8, 70, 4);
      g.fill();
      const pos = this.position(p);
      text(g, `${pos}.`, left ? x + 44 : x + 256, 48, { size: 48, color: pos === 1 ? '#ffd23f' : '#c9c6e8', weight: 800 });
      text(g, this.api.players[p].name, left ? x + 84 : x + 216, 34, { size: 26, color: PCOL[p], weight: 800, align: left ? 'left' : 'right' });
      text(g, c.done ? 'BİTİRDİ!' : `TUR ${Math.min(c.lap, LAPS)} / ${LAPS}`, left ? x + 84 : x + 216, 62, { size: 20, color: '#fff', weight: 700, align: left ? 'left' : 'right' });
    }
    rr(g, W / 2 - 90, 12, 180, 48, 16);
    g.fillStyle = 'rgba(10,10,30,.6)';
    g.fill();
    text(g, this.fmt(this.raceTime), W / 2, 37, { size: 28, color: '#fff', weight: 700 });

    if (this.phase === 'finish' || this.phase === 'over') {
      banner(g, `${this.api.players[this.winner].name} KAZANDI!`, `Süre ${this.fmt(this.cars[this.winner].finishT)}`, PCOL[this.winner], 3 - this.endT);
    }
  }
}

export default {
  id: 'racer',
  name: 'Turbo Pist',
  icon: '🏎️',
  tag: 'Araba yarışı',
  mode: 'versus',
  cat: 'spor',
  color: '#ff4f7b',
  desc: 'Tepeden bakışlı çılgın bir yarış! Virajlarda kaymayı kontrol et, sarı oklu pedlerden geçip turbo kap, rakibini piste sıkıştır. 3 turu ilk bitiren kazanır.',
  howto: ['◀ ▶ direksiyon', 'A: gaz', 'B: fren / geri', 'Sarı oklar turbo verir · çimen yavaşlatır', `${LAPS} tur — ilk bitiren kazanır`],
  keys: '1. oyuncu A/D direksiyon, W ya da F gaz, S ya da G fren · 2. oyuncu ←/→, ↑ ya da K gaz, ↓ ya da L fren',
  controller: { layout: 'dpad', dirs: 'lr', a: 'GAZ', b: 'FREN' },
  create: (api) => new RacerGame(api),
};
