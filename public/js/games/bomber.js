// BOMBA ARENASI — labirentte bomba bırak, kutuları patlat, güçlen, rakibini yakala.
// 5 rauntta 3 alan kazanır. Süre bitince arena daralır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, winDots, shade, rgba } from '../host/gfx.js';

const C = 15;
const R = 13;
const T = 52;
const X0 = 250;
const Y0 = 22;
const NEED = 3;
const ROUND_TIME = 100;
const FUSE = 2.4;
const FIRE_T = 0.55;
const EMPTY = 0;
const HARD = 1;
const SOFT = 2;
const BREAK = 3;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ITEM_COL = { bomb: '#3d7bff', fire: '#ff6a3d', speed: '#2fcf6b' };
const ITEM_NAME = { bomb: '+1 BOMBA', fire: '+1 ALEV', speed: '+HIZ' };

const key = (x, y) => y * C + x;

// ------------------------------------------------------------------ çizim parçaları
export function drawBombIcon(g, x, y, s, t = 0) {
  const pulse = 1 + Math.sin(t * 14) * 0.06;
  g.save();
  g.translate(x, y);
  g.scale(pulse, pulse);
  g.fillStyle = 'rgba(0,0,0,.25)';
  g.beginPath();
  g.ellipse(0, s * 0.42, s * 0.38, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  const grad = g.createRadialGradient(-s * 0.14, -s * 0.12, s * 0.05, 0, 0, s * 0.42);
  grad.addColorStop(0, '#5b5a78');
  grad.addColorStop(1, '#16152a');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, s * 0.04, s * 0.36, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2b2a44';
  g.fillRect(-s * 0.1, -s * 0.38, s * 0.2, s * 0.12);
  g.strokeStyle = '#c9a36b';
  g.lineWidth = s * 0.06;
  g.beginPath();
  g.moveTo(0, -s * 0.36);
  g.quadraticCurveTo(s * 0.12, -s * 0.52, s * 0.24, -s * 0.44);
  g.stroke();
  if (t > 0) {
    g.fillStyle = Math.floor(t * 20) % 2 ? '#ffd23f' : '#ff7a3d';
    g.beginPath();
    g.arc(s * 0.26, -s * 0.46, s * 0.08 + Math.random() * s * 0.04, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.ellipse(-s * 0.13, -s * 0.08, s * 0.08, s * 0.05, -0.6, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawFlameIcon(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#ffb02e';
  g.beginPath();
  g.moveTo(0, -s * 0.42);
  g.bezierCurveTo(s * 0.4, -s * 0.05, s * 0.34, s * 0.36, 0, s * 0.38);
  g.bezierCurveTo(-s * 0.34, s * 0.36, -s * 0.4, -s * 0.05, 0, -s * 0.42);
  g.fill();
  g.fillStyle = '#fff3b0';
  g.beginPath();
  g.moveTo(0, -s * 0.08);
  g.bezierCurveTo(s * 0.18, s * 0.1, s * 0.16, s * 0.3, 0, s * 0.3);
  g.bezierCurveTo(-s * 0.16, s * 0.3, -s * 0.18, s * 0.1, 0, -s * 0.08);
  g.fill();
  g.restore();
}

function drawBoltIcon(g, x, y, s) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#fff36b';
  g.strokeStyle = '#7a5d00';
  g.lineWidth = s * 0.04;
  g.beginPath();
  g.moveTo(s * 0.08, -s * 0.42);
  g.lineTo(-s * 0.26, s * 0.06);
  g.lineTo(-s * 0.02, s * 0.06);
  g.lineTo(-s * 0.1, s * 0.42);
  g.lineTo(s * 0.26, -s * 0.08);
  g.lineTo(s * 0.02, -s * 0.08);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
}

function drawItem(g, type, x, y, s, t) {
  const bob = Math.sin(t * 4) * 2;
  g.save();
  g.shadowColor = ITEM_COL[type];
  g.shadowBlur = 14;
  rr(g, x - s * 0.4, y - s * 0.4 + bob, s * 0.8, s * 0.8, s * 0.18);
  g.fillStyle = ITEM_COL[type];
  g.fill();
  g.restore();
  rr(g, x - s * 0.4, y - s * 0.4 + bob, s * 0.8, s * 0.8, s * 0.18);
  g.strokeStyle = 'rgba(255,255,255,.7)';
  g.lineWidth = 2.5;
  g.stroke();
  if (type === 'bomb') drawBombIcon(g, x, y + bob + 2, s * 0.62);
  else if (type === 'fire') drawFlameIcon(g, x, y + bob, s * 0.7);
  else drawBoltIcon(g, x, y + bob, s * 0.75);
}

export function drawGuy(g, x, y, s, color, face = [0, 1], walk = 0, alpha = 1, squash = 0) {
  g.save();
  g.globalAlpha = alpha;
  g.translate(x, y);
  const bounce = Math.abs(Math.sin(walk * 10)) * s * 0.06;
  // gölge
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath();
  g.ellipse(0, s * 0.4, s * 0.34, s * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  // ayaklar
  const step = Math.sin(walk * 10) * s * 0.08;
  g.fillStyle = shade(color, -0.55);
  g.beginPath();
  g.ellipse(-s * 0.15, s * 0.36 + step * 0.4, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
  g.ellipse(s * 0.15, s * 0.36 - step * 0.4, s * 0.11, s * 0.07, 0, 0, Math.PI * 2);
  g.fill();
  g.translate(0, -bounce);
  g.scale(1 + squash, 1 - squash);
  // yaprak filizi
  g.strokeStyle = '#2a8a4a';
  g.lineWidth = s * 0.05;
  g.beginPath();
  g.moveTo(0, -s * 0.34);
  g.quadraticCurveTo(s * 0.02, -s * 0.46, s * 0.08, -s * 0.5);
  g.stroke();
  g.fillStyle = '#4be37a';
  g.beginPath();
  g.ellipse(s * 0.15, -s * 0.52, s * 0.1, s * 0.05, -0.5, 0, Math.PI * 2);
  g.fill();
  // gövde
  const grad = g.createLinearGradient(0, -s * 0.4, 0, s * 0.35);
  grad.addColorStop(0, shade(color, 0.25));
  grad.addColorStop(1, shade(color, -0.3));
  rr(g, -s * 0.34, -s * 0.36, s * 0.68, s * 0.7, s * 0.28);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = shade(color, -0.55);
  g.lineWidth = s * 0.04;
  g.stroke();
  // yüz
  const lx = face[0] * s * 0.08;
  const ly = face[1] * s * 0.05;
  if (face[1] < 0 && !face[0]) {
    // arkası dönük: göz yok, sadece parlama
  } else {
    for (const sx of [-1, 1]) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.ellipse(sx * s * 0.13 + lx, -s * 0.06 + ly, s * 0.1, s * 0.12, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#141225';
      g.beginPath();
      g.arc(sx * s * 0.13 + lx * 1.4, -s * 0.04 + ly * 1.3, s * 0.05, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(255,120,150,.5)';
    g.beginPath();
    g.ellipse(-s * 0.22 + lx, s * 0.1 + ly, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
    g.ellipse(s * 0.22 + lx, s * 0.1 + ly, s * 0.05, s * 0.03, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,.3)';
  g.beginPath();
  g.ellipse(-s * 0.18, -s * 0.24, s * 0.08, s * 0.04, -0.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

// ------------------------------------------------------------------ oyun
class BomberGame {
  constructor(api) {
    this.api = api;
    this.wins = [0, 0];
    this.round = 0;
    this.time = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.newRound();
  }

  newRound() {
    this.round++;
    this.map = [];
    this.hidden = new Map();
    this.items = new Map();
    this.bombs = [];
    this.fires = new Map();
    this.breaking = [];
    this.drops = [];
    this.clock = ROUND_TIME;
    this.sd = null;
    const safe = new Set([key(1, 1), key(2, 1), key(1, 2), key(C - 2, R - 2), key(C - 3, R - 2), key(C - 2, R - 3)]);
    const types = [];
    for (let y = 0; y < R; y++) {
      const row = [];
      for (let x = 0; x < C; x++) {
        let v = EMPTY;
        if (x === 0 || y === 0 || x === C - 1 || y === R - 1 || (x % 2 === 0 && y % 2 === 0)) v = HARD;
        else if (!safe.has(key(x, y)) && Math.random() < 0.72) v = SOFT;
        row.push(v);
        if (v === SOFT) types.push(key(x, y));
      }
      this.map.push(row);
    }
    // eşya dağıtımı (dengeli)
    types.sort(() => Math.random() - 0.5);
    const pool = [...Array(9).fill('bomb'), ...Array(9).fill('fire'), ...Array(5).fill('speed')];
    pool.forEach((t, i) => types[i] !== undefined && this.hidden.set(types[i], t));

    this.players = [
      this.mkPlayer(0, 1, 1, [0, 1]),
      this.mkPlayer(1, C - 2, R - 2, [0, -1]),
    ];
    this.phase = this.round === 1 ? 'play' : 'intro';
    this.phaseT = 2;
    this.roundWinner = null;
    this.bg = null;
    for (const p of [0, 1]) this.api.info(p, `Raunt ${this.round} · ${this.wins[0]} - ${this.wins[1]}`);
  }

  mkPlayer(p, x, y, face) {
    return { p, x, y, face, alive: true, bombs: 1, range: 2, speed: 3.6, spd: 0, active: 0, pass: new Set(), walk: 0, moving: false, deathT: 0 };
  }

  // ---------------------------------------------------------------- hareket
  bombAt(x, y) {
    return this.bombs.find((b) => b.x === x && b.y === y);
  }

  blocked(x, y, pl) {
    if (x < 0 || y < 0 || x >= C || y >= R) return true;
    if (this.map[y][x] !== EMPTY) return true;
    const b = this.bombAt(x, y);
    return !!(b && !pl.pass.has(b));
  }

  tryMove(pl, dx, dy, step) {
    if (!dx && !dy) return false;
    const hor = dx !== 0;
    const dir = hor ? dx : dy;
    let main = hor ? pl.x : pl.y;
    let side = hor ? pl.y : pl.x;
    const free = (m, s) => (hor ? !this.blocked(m, s, pl) : !this.blocked(s, m, pl));
    const cur = Math.round(main);
    const lane = Math.round(side);
    const off = side - lane;
    let moved = false;
    if (Math.abs(off) > 0.001) {
      let target = null;
      if (free(cur + dir, lane)) target = lane;
      else if (free(cur + dir, lane + Math.sign(off))) target = lane + Math.sign(off);
      if (target === null) return false;
      const d = target - side;
      const mv = Math.min(Math.abs(d), step);
      side += Math.sign(d) * mv;
      step -= mv;
      moved = mv > 0;
      if (Math.abs(target - side) < 0.001) side = target;
      else step = 0;
    }
    if (step > 0) {
      let nm = main + dir * step;
      if (!free(cur + dir, Math.round(side))) nm = dir > 0 ? Math.min(nm, Math.max(main, cur)) : Math.max(nm, Math.min(main, cur));
      if (Math.abs(nm - main) > 0.0001) moved = true;
      main = nm;
    }
    if (hor) {
      pl.x = main;
      pl.y = side;
    } else {
      pl.y = main;
      pl.x = side;
    }
    return moved;
  }

  placeBomb(pl) {
    if (!pl.alive || pl.active >= pl.bombs) return;
    const x = Math.round(pl.x);
    const y = Math.round(pl.y);
    if (this.map[y][x] !== EMPTY || this.bombAt(x, y)) return;
    const b = { x, y, t: FUSE, range: pl.range, owner: pl.p };
    this.bombs.push(b);
    pl.active++;
    for (const o of this.players) if (o.alive && Math.abs(o.x - x) < 0.95 && Math.abs(o.y - y) < 0.95) o.pass.add(b);
    this.api.sfx('place');
  }

  // ---------------------------------------------------------------- patlama
  addFire(x, y, kind) {
    const f = this.fires.get(key(x, y));
    if (f) {
      f.t = FIRE_T;
      if (f.kind !== kind) f.kind = 'c';
    } else this.fires.set(key(x, y), { x, y, t: FIRE_T, kind });
  }

  explode(b) {
    const i = this.bombs.indexOf(b);
    if (i < 0) return;
    this.bombs.splice(i, 1);
    this.players[b.owner].active--;
    for (const pl of this.players) pl.pass.delete(b);
    this.addFire(b.x, b.y, 'c');
    for (const [dx, dy] of DIRS) {
      for (let s = 1; s <= b.range; s++) {
        const x = b.x + dx * s;
        const y = b.y + dy * s;
        const v = this.map[y]?.[x];
        if (v === undefined || v === HARD) break;
        if (v === SOFT) {
          this.map[y][x] = BREAK;
          this.breaking.push({ x, y, t: 0.45 });
          this.addFire(x, y, dx ? 'h' : 'v');
          break;
        }
        if (v === BREAK) break;
        this.addFire(x, y, dx ? 'h' : 'v');
        const it = this.items.get(key(x, y));
        if (it) {
          this.items.delete(key(x, y));
          this.parts.burst(X0 + (x + 0.5) * T, Y0 + (y + 0.5) * T, 10, ITEM_COL[it], { speed: 200 });
          break;
        }
        const ob = this.bombAt(x, y);
        if (ob) {
          ob.t = Math.min(ob.t, 0.07);
          break;
        }
      }
    }
    const cx = X0 + (b.x + 0.5) * T;
    const cy = Y0 + (b.y + 0.5) * T;
    this.parts.burst(cx, cy, 18, ['#ffd23f', '#ff7a3d', '#ff4f2d', '#fff3b0'], { speed: 360, life: 0.6, size: 9, gravity: -100 });
    this.shake.add(7, 0.25);
    this.api.sfx('boom');
  }

  kill(pl) {
    if (!pl.alive) return;
    pl.alive = false;
    pl.deathT = 0;
    this.parts.burst(X0 + (pl.x + 0.5) * T, Y0 + (pl.y + 0.5) * T, 30, [PCOL[pl.p], '#fff', shade(PCOL[pl.p], -0.4)], { speed: 380, size: 9, life: 1 });
    this.shake.add(10, 0.4);
    this.api.sfx('die');
    this.api.buzz(pl.p, 400);
  }

  startSuddenDeath() {
    const order = [];
    let x0 = 1, y0 = 1, x1 = C - 2, y1 = R - 2;
    while (x0 <= x1 && y0 <= y1) {
      for (let x = x0; x <= x1; x++) order.push([x, y0]);
      for (let y = y0 + 1; y <= y1; y++) order.push([x1, y]);
      if (y1 > y0) for (let x = x1 - 1; x >= x0; x--) order.push([x, y1]);
      if (x1 > x0) for (let y = y1 - 1; y > y0; y--) order.push([x0, y]);
      x0++; y0++; x1--; y1--;
    }
    this.sd = { order: order.filter(([x, y]) => this.map[y][x] !== HARD), i: 0, t: 0 };
    this.pops.add('ARENA DARALIYOR!', W / 2, H / 2, '#ff5a5a', 60, 2);
    this.api.sfx('garbage');
  }

  stepSuddenDeath(dt) {
    const sd = this.sd;
    sd.t -= dt;
    while (sd.t <= 0 && sd.i < sd.order.length) {
      sd.t += 0.32;
      const [x, y] = sd.order[sd.i++];
      this.map[y][x] = HARD;
      this.items.delete(key(x, y));
      this.hidden.delete(key(x, y));
      this.breaking = this.breaking.filter((b) => b.x !== x || b.y !== y);
      const bomb = this.bombAt(x, y);
      if (bomb) {
        this.bombs.splice(this.bombs.indexOf(bomb), 1);
        this.players[bomb.owner].active--;
      }
      this.drops.push({ x, y, t: 0.25 });
      this.bg = null;
      for (const pl of this.players) if (pl.alive && Math.round(pl.x) === x && Math.round(pl.y) === y) this.kill(pl);
      this.api.sfx('lock');
    }
  }

  // ---------------------------------------------------------------- güncelleme
  onKey(p, k, down) {
    if (down && (k === 'left' || k === 'right')) this.players[p].last = 'h';
    if (down && (k === 'up' || k === 'down')) this.players[p].last = 'v';
    if (down && (k === 'a' || k === 'b') && (this.phase === 'play' || this.phase === 'settle')) this.placeBomb(this.players[p]);
  }

  updatePlayer(pl, dt) {
    if (!pl.alive) {
      pl.deathT += dt;
      return;
    }
    const s = this.api.input[pl.p];
    let dx = (s.right ? 1 : 0) - (s.left ? 1 : 0);
    let dy = (s.down ? 1 : 0) - (s.up ? 1 : 0);
    if (!dx && !dy) {
      const a = this.api.axis(pl.p);
      if (Math.abs(a.x) > 0.35 || Math.abs(a.y) > 0.35) {
        if (Math.abs(a.x) > Math.abs(a.y)) dx = Math.sign(a.x);
        else dy = Math.sign(a.y);
      }
    }
    const step = pl.speed * dt;
    const tries = [];
    if (dx && dy) {
      // iki yön birden: en son basılan yönü önce dene (köşe dönüşü)
      if (pl.last === 'v') tries.push([0, dy], [dx, 0]);
      else tries.push([dx, 0], [0, dy]);
    } else if (dx) tries.push([dx, 0]);
    else if (dy) tries.push([0, dy]);
    let moved = false;
    for (const [mx, my] of tries) {
      if (this.tryMove(pl, mx, my, step)) {
        moved = true;
        pl.face = [mx, my];
        break;
      }
    }
    if (!moved && tries.length) pl.face = tries[0];
    pl.moving = moved;
    if (moved) pl.walk += dt;
    for (const b of pl.pass) if (Math.abs(pl.x - b.x) >= 0.95 || Math.abs(pl.y - b.y) >= 0.95) pl.pass.delete(b);
    // eşya toplama
    const k = key(Math.round(pl.x), Math.round(pl.y));
    const it = this.items.get(k);
    if (it) {
      this.items.delete(k);
      if (it === 'bomb') pl.bombs = Math.min(8, pl.bombs + 1);
      if (it === 'fire') pl.range = Math.min(8, pl.range + 1);
      if (it === 'speed' && pl.spd < 4) {
        pl.spd++;
        pl.speed += 0.55;
      }
      this.pops.add(ITEM_NAME[it], X0 + (pl.x + 0.5) * T, Y0 + pl.y * T, ITEM_COL[it], 26, 0.9);
      this.api.sfx('pickup');
      this.api.buzz(pl.p, 30);
    }
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    for (const d of this.drops) d.t -= dt;
    this.drops = this.drops.filter((d) => d.t > 0);

    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'result') {
      this.phaseT -= dt;
      for (const pl of this.players) if (!pl.alive) pl.deathT += dt;
      if (this.phaseT <= 0) {
        const w = this.roundWinner;
        if (w !== null && this.wins[w] >= NEED) this.api.end({ winner: w, detail: `Raunt skoru ${this.wins[0]} - ${this.wins[1]}` });
        else this.newRound();
      }
      return;
    }

    if (this.phase === 'play') {
      this.clock -= dt;
      if (this.clock <= 0 && !this.sd) this.startSuddenDeath();
    }
    if (this.sd) this.stepSuddenDeath(dt);

    for (const pl of this.players) this.updatePlayer(pl, dt);

    for (const b of [...this.bombs]) {
      b.t -= dt;
      if (b.t <= 0) this.explode(b);
    }
    for (const [k, f] of this.fires) {
      f.t -= dt;
      if (f.t <= 0) this.fires.delete(k);
    }
    for (const br of this.breaking) {
      br.t -= dt;
      if (br.t <= 0) {
        this.map[br.y][br.x] = EMPTY;
        const it = this.hidden.get(key(br.x, br.y));
        if (it) this.items.set(key(br.x, br.y), it);
        this.parts.burst(X0 + (br.x + 0.5) * T, Y0 + (br.y + 0.5) * T, 8, ['#a4673a', '#7a4a26', '#d39a5e'], { speed: 180, size: 7 });
      }
    }
    this.breaking = this.breaking.filter((b) => b.t > 0);

    for (const pl of this.players) {
      if (pl.alive && this.fires.has(key(Math.round(pl.x), Math.round(pl.y)))) this.kill(pl);
    }

    const alive = this.players.filter((p) => p.alive);
    if (this.phase === 'play' && alive.length <= 1) {
      this.phase = 'settle';
      this.phaseT = 1.3;
    } else if (this.phase === 'settle') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.roundWinner = alive.length === 1 ? alive[0].p : null;
        if (this.roundWinner !== null) this.wins[this.roundWinner]++;
        this.phase = 'result';
        this.phaseT = 2.6;
        this.api.sfx(this.roundWinner === null ? 'lose' : 'power');
      }
    }
  }

  // ---------------------------------------------------------------- çizim
  renderBg() {
    const cv = document.createElement('canvas');
    cv.width = C * T;
    cv.height = R * T;
    const g = cv.getContext('2d');
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        g.fillStyle = (x + y) % 2 ? '#3c8a4e' : '#429556';
        g.fillRect(x * T, y * T, T, T);
      }
    }
    // çim tutamları
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (let i = 0; i < 160; i++) {
      const x = (i * 97) % (C * T);
      const y = (i * 53 + (i % 7) * 31) % (R * T);
      g.fillRect(x, y, 3, 6);
    }
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        if (this.map[y][x] !== HARD) continue;
        // gölge
        g.fillStyle = 'rgba(0,0,0,.25)';
        g.fillRect(x * T + 6, y * T + 8, T, T);
      }
    }
    for (let y = 0; y < R; y++) {
      for (let x = 0; x < C; x++) {
        if (this.map[y][x] !== HARD) continue;
        const px = x * T;
        const py = y * T;
        const grad = g.createLinearGradient(px, py, px, py + T);
        grad.addColorStop(0, '#8d93b8');
        grad.addColorStop(1, '#585e85');
        rr(g, px + 2, py + 2, T - 4, T - 4, 9);
        g.fillStyle = grad;
        g.fill();
        g.fillStyle = 'rgba(255,255,255,.22)';
        rr(g, px + 7, py + 6, T - 14, 8, 4);
        g.fill();
        g.strokeStyle = 'rgba(30,30,60,.5)';
        g.lineWidth = 2;
        rr(g, px + 2, py + 2, T - 4, T - 4, 9);
        g.stroke();
      }
    }
    this.bg = cv;
  }

  drawCrate(g, x, y, burn = 0) {
    const px = X0 + x * T;
    const py = Y0 + y * T;
    g.save();
    if (burn) g.globalAlpha = 0.3 + 0.7 * burn;
    g.fillStyle = 'rgba(0,0,0,.22)';
    g.fillRect(px + 6, py + 8, T - 4, T - 4);
    const grad = g.createLinearGradient(px, py, px, py + T);
    grad.addColorStop(0, burn ? '#ff9a3d' : '#d29a5c');
    grad.addColorStop(1, burn ? '#a33a12' : '#99602f');
    rr(g, px + 3, py + 3, T - 6, T - 6, 6);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = '#6b3f1c';
    g.lineWidth = 3;
    g.stroke();
    g.beginPath();
    g.moveTo(px + 9, py + 9);
    g.lineTo(px + T - 9, py + T - 9);
    g.moveTo(px + T - 9, py + 9);
    g.lineTo(px + 9, py + T - 9);
    g.stroke();
    g.restore();
  }

  drawFire(g, f) {
    const px = X0 + f.x * T;
    const py = Y0 + f.y * T;
    const a = Math.min(1, f.t / FIRE_T * 1.6);
    const flick = 1 + Math.sin(this.time * 50 + f.x * 3 + f.y) * 0.06;
    g.save();
    g.globalAlpha = a;
    g.translate(px + T / 2, py + T / 2);
    g.scale(flick, flick);
    const layers = [['#ff4f2d', 0.5], ['#ffa62d', 0.36], ['#fff3b0', 0.2]];
    for (const [col, w] of layers) {
      g.fillStyle = col;
      if (f.kind === 'h') g.fillRect(-T / 2, -T * w, T, T * w * 2);
      else if (f.kind === 'v') g.fillRect(-T * w, -T / 2, T * w * 2, T);
      else {
        rr(g, -T * (w + 0.06), -T * (w + 0.06), T * (w + 0.06) * 2, T * (w + 0.06) * 2, T * 0.25);
        g.fill();
      }
    }
    g.restore();
  }

  drawPanel(g, p) {
    const pl = this.players[p];
    const cx = p === 0 ? 125 : W - 125;
    const col = PCOL[p];
    rr(g, cx - 110, 22, 220, 676, 22);
    g.fillStyle = rgba(col, 0.1);
    g.fill();
    g.strokeStyle = rgba(col, 0.45);
    g.lineWidth = 2;
    g.stroke();
    text(g, this.api.players[p].name, cx, 68, { size: 34, color: col, weight: 800, stroke: 'rgba(0,0,0,.5)', sw: 6 });
    winDots(g, cx, 106, this.wins[p], NEED, col);
    drawGuy(g, cx, 196, 110, col, [0, 1], pl.alive ? this.time * 0.25 : 0, pl.alive ? 1 : 0.35);
    if (!pl.alive) text(g, 'YANDI!', cx, 196, { size: 32, color: '#ff6b7a', weight: 800, stroke: '#1a0a14', sw: 6 });
    const rows = [['bomb', pl.bombs, 'BOMBA'], ['fire', pl.range, 'ALEV'], ['speed', pl.spd + 1, 'HIZ']];
    rows.forEach(([t, v, label], i) => {
      const y = 300 + i * 92;
      rr(g, cx - 90, y, 180, 76, 16);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fill();
      drawItem(g, t, cx - 50, y + 38, 54, 0);
      text(g, label, cx + 30, y + 24, { size: 17, color: '#a7a2d1' });
      text(g, String(v), cx + 30, y + 52, { size: 34, color: '#fff', weight: 800 });
    });
    const m = Math.max(0, Math.ceil(this.clock));
    const sd = !!this.sd;
    text(g, sd ? 'ARENA' : 'SÜRE', cx, 600, { size: 18, color: sd ? '#ff6b7a' : '#a7a2d1' });
    text(g, sd ? 'DARALIYOR' : `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`, cx, 640, { size: sd ? 28 : 40, color: sd ? '#ff6b7a' : m <= 10 ? '#ffd23f' : '#fff', weight: 800 });
  }

  demo() {
    this.bombs.push({ x: 3, y: 1, t: 1.2, range: 2, owner: 0 });
    this.players[0].x = 1;
    this.players[0].y = 2;
    this.map[3][1] = EMPTY;
    this.items.set(key(1, 3), 'fire');
    this.addFire(11, 11, 'c');
    this.addFire(10, 11, 'h');
    this.addFire(11, 10, 'v');
    this.map[11][10] = EMPTY;
    this.map[10][11] = EMPTY;
    this.map[11][9] = EMPTY;
  }

  draw(g) {
    g.fillStyle = '#0e1a14';
    g.fillRect(0, 0, W, H);
    g.save();
    this.shake.apply(g);
    if (!this.bg) this.renderBg();
    g.drawImage(this.bg, X0, Y0);

    for (const [k, it] of this.items) drawItem(g, it, X0 + ((k % C) + 0.5) * T, Y0 + (Math.floor(k / C) + 0.5) * T, T, this.time);
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) if (this.map[y][x] === SOFT) this.drawCrate(g, x, y);
    for (const br of this.breaking) this.drawCrate(g, br.x, br.y, br.t / 0.45);
    for (const b of this.bombs) {
      const urgent = b.t < 0.8 ? 1.5 : 1;
      drawBombIcon(g, X0 + (b.x + 0.5) * T, Y0 + (b.y + 0.5) * T, T * 0.95, (FUSE - b.t) * urgent + 0.01);
      if (b.t < 0.6 && Math.floor(b.t * 16) % 2) {
        g.fillStyle = 'rgba(255,80,60,.35)';
        g.beginPath();
        g.arc(X0 + (b.x + 0.5) * T, Y0 + (b.y + 0.55) * T, T * 0.36, 0, Math.PI * 2);
        g.fill();
      }
    }
    for (const f of this.fires.values()) this.drawFire(g, f);
    for (const d of this.drops) {
      const s = 1 + d.t * 3;
      g.save();
      g.translate(X0 + (d.x + 0.5) * T, Y0 + (d.y + 0.5) * T - d.t * 120);
      g.scale(s, s);
      rr(g, -T / 2 + 2, -T / 2 + 2, T - 4, T - 4, 9);
      g.fillStyle = '#8d93b8';
      g.fill();
      g.restore();
    }
    const order = [...this.players].sort((a, b) => a.y - b.y);
    for (const pl of order) {
      const px = X0 + (pl.x + 0.5) * T;
      const py = Y0 + (pl.y + 0.5) * T - 4;
      if (pl.alive) drawGuy(g, px, py, T * 1.05, PCOL[pl.p], pl.face, pl.walk);
      else if (pl.deathT < 1.2) drawGuy(g, px, py - pl.deathT * 30, T * 1.05, '#555', [0, 1], 0, 1 - pl.deathT / 1.2, -0.2);
    }
    this.parts.draw(g);
    g.restore();
    this.pops.draw(g);
    this.drawPanel(g, 0);
    this.drawPanel(g, 1);

    if (this.phase === 'intro') banner(g, `RAUNT ${this.round}`, `${this.wins[0]} - ${this.wins[1]}  ·  ${NEED} raunt alan kazanır`, '#ffd23f', 2 - this.phaseT);
    if (this.phase === 'result') {
      const w = this.roundWinner;
      if (w === null) banner(g, 'BERABERE!', 'İkiniz de yandınız', '#ffd23f', 2.6 - this.phaseT);
      else banner(g, `${this.api.players[w].name} RAUNDU ALDI!`, `${this.wins[0]} - ${this.wins[1]}`, PCOL[w], 2.6 - this.phaseT);
    }
  }
}

export default {
  id: 'bomber',
  name: 'Bomba Arenası',
  icon: '💣',
  tag: 'Labirent savaşı',
  mode: 'versus',
  color: '#ff7a3d',
  desc: 'Bomba bırakıp tahta kutuları patlat, çıkan güçlendirmeleri topla ve rakibini alevlerin arasında yakala. Kendi bombana dikkat!',
  howto: ['Yön tuşları: yürü', 'A: bomba bırak', 'Mavi: +1 bomba · Turuncu: +1 alev · Yeşil: hız', 'Süre bitince arena daralır', '5 rauntta 3 alan kazanır'],
  keys: '1. oyuncu WASD + F · 2. oyuncu Oklar + K',
  controller: { layout: 'dpad', dirs: 4, a: 'BOMBA', b: null },
  create: (api) => new BomberGame(api),
};
