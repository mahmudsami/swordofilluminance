// IŞIK İZİ — iki neon yılan arkasında kalıcı iz bırakır. Duvara ya da bir ize çarpan kaybeder.
// B ile kısa süre hızlan. 5 rauntta 3 alan kazanır.
import { W, H, PCOL, text, rr, Particles, Shake, banner, winDots, rgba } from '../host/gfx.js';

const CELL = 20;
const COLS = 64;
const ROWS = 33;
const OY = 60;
const NEED = 3;
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

class SnakeGame {
  constructor(api) {
    this.api = api;
    this.wins = [0, 0];
    this.round = 0;
    this.time = 0;
    this.parts = new Particles();
    this.shake = new Shake();
    this.newRound();
  }

  newRound() {
    this.round++;
    this.grid = new Int8Array(COLS * ROWS).fill(-1);
    this.trail = document.createElement('canvas');
    this.trail.width = COLS * CELL;
    this.trail.height = ROWS * CELL;
    this.tick = 0.075;
    this.elapsed = 0;
    const my = Math.floor(ROWS / 2);
    this.snakes = [
      { p: 0, x: 8, y: my, dir: [1, 0], queue: [], acc: 0, alive: true, boost: 0, energy: 1, len: 0 },
      { p: 1, x: COLS - 9, y: my, dir: [-1, 0], queue: [], acc: 0, alive: true, boost: 0, energy: 1, len: 0 },
    ];
    for (const s of this.snakes) this.paint(s, s.x, s.y);
    this.phase = this.round === 1 ? 'play' : 'intro';
    this.phaseT = 2;
    this.roundWinner = null;
    for (const p of [0, 1]) this.api.info(p, `Raunt ${this.round} · ${this.wins[0]} - ${this.wins[1]}`);
  }

  paint(s, x, y) {
    this.grid[y * COLS + x] = s.p;
    s.len++;
    const g = this.trail.getContext('2d');
    g.shadowColor = PCOL[s.p];
    g.shadowBlur = 10;
    g.fillStyle = PCOL[s.p];
    g.fillRect(x * CELL + 3, y * CELL + 3, CELL - 6, CELL - 6);
    // önceki hücreyle birleştir
    const [dx, dy] = s.dir;
    g.shadowBlur = 0;
    if (s.len > 1) g.fillRect(Math.min(x, x - dx) * CELL + 3 + (dx ? CELL / 2 : 0), Math.min(y, y - dy) * CELL + 3 + (dy ? CELL / 2 : 0), dx ? CELL : CELL - 6, dy ? CELL : CELL - 6);
  }

  onKey(p, k, down) {
    if (!down || this.phase !== 'play') return;
    const s = this.snakes[p];
    if (!s.alive) return;
    if (k === 'b' || k === 'a') {
      if (s.energy >= 1) {
        s.boost = 1.1;
        s.energy = 0;
        this.api.sfx('nitro');
      }
      return;
    }
    const d = DIRS[k];
    if (!d) return;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if ((d[0] === -last[0] && d[1] === -last[1]) || (d[0] === last[0] && d[1] === last[1])) return;
    if (s.queue.length < 3) s.queue.push(d);
  }

  step(s) {
    if (s.queue.length) s.dir = s.queue.shift();
    s.x += s.dir[0];
    s.y += s.dir[1];
  }

  crash(s) {
    s.alive = false;
    const px = (s.x + 0.5) * CELL;
    const py = OY + (s.y + 0.5) * CELL;
    this.parts.burst(px, py, 40, [PCOL[s.p], '#fff', '#ffd23f'], { speed: 420, size: 7, life: 0.9, gravity: 0 });
    this.shake.add(10, 0.4);
    this.api.sfx('boom');
    this.api.buzz(s.p, 400);
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.shake.update(dt);
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const w = this.roundWinner;
        if (w !== null && this.wins[w] >= NEED) this.api.end({ winner: w, detail: `Raunt skoru ${this.wins[0]} - ${this.wins[1]}` });
        else this.newRound();
      }
      return;
    }
    this.elapsed += dt;
    this.tick = Math.max(0.042, 0.075 - this.elapsed * 0.0006);
    for (const s of this.snakes) {
      s.energy = Math.min(1, s.energy + dt / 4);
      if (s.boost > 0) s.boost -= dt;
      s.acc += dt * (s.boost > 0 ? 1.8 : 1);
    }
    // iki yılanı da adım adım ilerlet (aynı anda çarpışmayı adil ölçmek için)
    let guard = 0;
    while (guard++ < 8) {
      const movers = this.snakes.filter((s) => s.alive && s.acc >= this.tick);
      if (!movers.length) break;
      for (const s of movers) {
        s.acc -= this.tick;
        this.step(s);
      }
      const dead = new Set();
      for (const s of movers) {
        if (s.x < 0 || s.y < 0 || s.x >= COLS || s.y >= ROWS || this.grid[s.y * COLS + s.x] !== -1) dead.add(s);
      }
      if (movers.length === 2 && movers[0].x === movers[1].x && movers[0].y === movers[1].y) movers.forEach((s) => dead.add(s));
      for (const s of movers) {
        if (dead.has(s)) this.crash(s);
        else this.paint(s, s.x, s.y);
      }
      if (dead.size) break;
    }
    const alive = this.snakes.filter((s) => s.alive);
    if (alive.length < 2) {
      this.roundWinner = alive.length === 1 ? alive[0].p : null;
      if (this.roundWinner !== null) this.wins[this.roundWinner]++;
      this.phase = 'over';
      this.phaseT = 2.6;
    }
  }

  demo() {
    for (let i = 0; i < 26; i++) {
      for (const s of this.snakes) {
        if (i === 10) s.dir = s.p ? [0, 1] : [0, -1];
        if (i === 18) s.dir = s.p ? [-1, 0] : [1, 0];
        this.step(s);
        this.paint(s, s.x, s.y);
      }
    }
  }

  draw(g) {
    g.fillStyle = '#07071a';
    g.fillRect(0, 0, W, H);
    g.save();
    this.shake.apply(g);
    // ızgara
    g.strokeStyle = 'rgba(120,110,255,.08)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x <= COLS; x += 2) {
      g.moveTo(x * CELL + 0.5, OY);
      g.lineTo(x * CELL + 0.5, OY + ROWS * CELL);
    }
    for (let y = 0; y <= ROWS; y += 2) {
      g.moveTo(0, OY + y * CELL + 0.5);
      g.lineTo(W, OY + y * CELL + 0.5);
    }
    g.stroke();
    g.strokeStyle = 'rgba(160,150,255,.5)';
    g.lineWidth = 3;
    g.strokeRect(1.5, OY + 1.5, COLS * CELL - 3, ROWS * CELL - 3);
    g.drawImage(this.trail, 0, OY);
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const px = s.x * CELL;
      const py = OY + s.y * CELL;
      g.save();
      g.shadowColor = '#fff';
      g.shadowBlur = 18;
      g.fillStyle = '#fff';
      rr(g, px + 1, py + 1, CELL - 2, CELL - 2, 6);
      g.fill();
      g.restore();
      if (s.boost > 0) {
        g.strokeStyle = rgba(PCOL[s.p], 0.8);
        g.lineWidth = 3;
        g.beginPath();
        g.arc(px + CELL / 2, py + CELL / 2, 16 + Math.sin(this.time * 30) * 3, 0, Math.PI * 2);
        g.stroke();
      }
    }
    this.parts.draw(g);
    g.restore();

    // üst bilgi
    for (const p of [0, 1]) {
      const s = this.snakes[p];
      const left = p === 0;
      const x = left ? 20 : W - 20;
      text(g, this.api.players[p].name, x, 30, { size: 32, color: PCOL[p], weight: 800, align: left ? 'left' : 'right' });
      winDots(g, left ? 250 : W - 250, 30, this.wins[p], NEED, PCOL[p], left ? 'left' : 'right');
      // turbo enerjisi
      const bx = left ? 360 : W - 360 - 120;
      rr(g, bx, 22, 120, 16, 8);
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.fill();
      rr(g, bx, 22, 120 * s.energy, 16, 8);
      g.fillStyle = s.energy >= 1 ? PCOL[p] : rgba(PCOL[p], 0.5);
      g.fill();
      text(g, 'TURBO', bx + 60, 30, { size: 12, color: '#fff', weight: 800 });
    }
    text(g, `RAUNT ${this.round}`, W / 2, 30, { size: 26, color: '#a7a2d1', weight: 800 });

    if (this.phase === 'intro') banner(g, `RAUNT ${this.round}`, `${this.wins[0]} - ${this.wins[1]}`, '#ffd23f', 2 - this.phaseT);
    if (this.phase === 'over' && this.phaseT < 2.3) {
      const w = this.roundWinner;
      if (w === null) banner(g, 'KAFA KAFAYA!', 'İkiniz de çarptınız', '#ffd23f', 2.3 - this.phaseT);
      else banner(g, `${this.api.players[w].name} RAUNDU ALDI!`, `${this.wins[0]} - ${this.wins[1]}`, PCOL[w], 2.3 - this.phaseT);
    }
  }
}

export default {
  id: 'snake',
  name: 'Işık İzi',
  icon: '⚡',
  tag: 'Neon yılan düellosu',
  mode: 'versus',
  color: '#b45cff',
  desc: 'Arkanda kalıcı bir ışık izi bırakarak ilerliyorsun. Rakibini sıkıştır, duvara ya da bir ize çarpan kaybeder. Turbo ile kısa süre hızlan!',
  howto: ['Yön tuşları: dön', 'A / B: turbo (dolunca tekrar kullanılır)', 'Duvar ve izler ölümcül', '5 rauntta 3 alan kazanır'],
  keys: '1. oyuncu WASD + F · 2. oyuncu Oklar + K',
  controller: { layout: 'dpad', dirs: 4, a: 'TURBO', b: null },
  create: (api) => new SnakeGame(api),
};
