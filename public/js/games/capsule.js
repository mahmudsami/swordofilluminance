// KAPSÜL KAPIŞMASI — renkli kapsüllerle mikrop temizleme yarışı.
// Aynı renkten 4'ü yan yana / üst üste gelince silinir. Mikroplarını ilk bitiren raundu alır.
// Kombolar rakibin şişesine fazladan yarım kapsül yağdırır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, winDots, shade, randi } from '../host/gfx.js';

const COLS = 8;
const ROWS = 16;
const CELL = 34;
const NEED = 2;
const DAS = 0.15;
const ARR = 0.055;
const PILL = ['#ff4f6d', '#ffd23f', '#39a0ff'];
const GERMS = 12;

function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function makeGerms(n) {
  const grid = emptyGrid();
  let placed = 0;
  let tries = 0;
  while (placed < n && tries++ < 8000) {
    const x = randi(0, COLS - 1);
    const y = randi(6, ROWS - 1);
    if (grid[y][x]) continue;
    const c = placed % 3;
    const same = (dx, dy) => {
      let k = 0;
      let cx = x + dx;
      let cy = y + dy;
      while (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && grid[cy][cx] && grid[cy][cx].c === c) {
        k++;
        cx += dx;
        cy += dy;
      }
      return k;
    };
    if (same(-1, 0) + same(1, 0) >= 2 || same(0, -1) + same(0, 1) >= 2) continue;
    grid[y][x] = { c, kind: 'germ', seed: Math.random() * 10 };
    placed++;
  }
  return grid;
}

class Bottle {
  constructor(game, p, germGrid) {
    this.game = game;
    this.p = p;
    this.grid = germGrid.map((r) => r.map((c) => (c ? { ...c } : null)));
    this.germs = this.countGerms();
    this.capsuleN = 0;
    this.cap = null;
    this.phase = 'spawn'; // spawn | fall | clear | drop
    this.t = 0.2;
    this.groups = 0;
    this.chain = 0;
    this.incoming = [];
    this.dead = false;
    this.dropT = 0;
    this.dasDir = null;
    this.dasT = 0;
    this.shake = new Shake();
    this.x0 = p === 0 ? 184 : 824;
    this.y0 = 140;
    this.clearSet = null;
  }

  get api() {
    return this.game.api;
  }

  countGerms() {
    let n = 0;
    for (const row of this.grid) for (const c of row) if (c && c.kind === 'germ') n++;
    return n;
  }

  blocked(x, y) {
    if (x < 0 || x >= COLS || y >= ROWS) return true;
    if (y < 0) return false;
    return !!this.grid[y][x];
  }

  // kapsülün iki hücresi: [x, y, renk, link]
  cells(c = this.cap) {
    const { x, y, o, a, b } = c;
    if (o === 0) return [[x, y, a, 'R'], [x + 1, y, b, 'L']];
    if (o === 2) return [[x, y, b, 'R'], [x + 1, y, a, 'L']];
    if (o === 1) return [[x, y - 1, a, 'D'], [x, y, b, 'U']];
    return [[x, y - 1, b, 'D'], [x, y, a, 'U']];
  }

  fits(c) {
    return this.cells(c).every(([x, y]) => !this.blocked(x, y));
  }

  spawn() {
    const nx = this.game.capAt(this.capsuleN++);
    this.cap = { x: 3, y: 0, o: 0, a: nx[0], b: nx[1] };
    this.dropT = 0;
    if (!this.fits(this.cap)) {
      this.cap = null;
      this.die();
    }
  }

  move(dx) {
    if (!this.cap) return false;
    const c = { ...this.cap, x: this.cap.x + dx };
    if (!this.fits(c)) return false;
    this.cap = c;
    this.api.sfx('move');
    return true;
  }

  rotate(dir) {
    if (!this.cap) return;
    const o = (this.cap.o + dir + 4) % 4;
    for (const kx of [0, -1, 1]) {
      const c = { ...this.cap, o, x: this.cap.x + kx };
      if (this.fits(c)) {
        this.cap = c;
        this.api.sfx('rotate');
        return;
      }
    }
  }

  lock() {
    const cells = this.cells();
    this.cap = null;
    // şişenin ağzından taşarsa şişe tıkanır
    if (cells.some(([, y]) => y < 0)) return this.die();
    for (const [x, y, c, link] of cells) this.grid[y][x] = { c, kind: 'pill', link };
    this.api.sfx('lock');
    this.groups = 0;
    this.chain = 0;
    this.startResolve();
  }

  startResolve() {
    const set = this.findMatches();
    if (set) {
      this.clearSet = set.cells;
      this.groups += set.groups;
      this.chain++;
      this.phase = 'clear';
      this.t = 0.32;
      this.api.sfx(this.chain > 1 ? 'big' : 'clear');
      if (this.chain > 1) this.game.pops.add(`ZİNCİR x${this.chain}`, this.x0 + (COLS * CELL) / 2, this.y0 + 200, '#46e38a', 40);
    } else {
      // çözüm bitti
      if (this.groups >= 2) {
        const n = Math.min(4, this.groups);
        this.game.sendGarbage(1 - this.p, n);
      }
      if (this.incoming.length) {
        this.dropGarbage();
        this.phase = 'fall';
        this.t = 0.08;
      } else {
        this.phase = 'spawn';
        this.t = 0.12;
      }
    }
  }

  findMatches() {
    const mark = new Set();
    let groups = 0;
    const scan = (len1, len2, get) => {
      for (let i = 0; i < len1; i++) {
        let run = 1;
        for (let j = 1; j <= len2; j++) {
          const a = j < len2 ? get(i, j) : null;
          const b = get(i, j - 1);
          if (a && b && a.c === b.c) run++;
          else {
            if (b && run >= 4) {
              groups++;
              for (let k = j - run; k < j; k++) mark.add(get.key(i, k));
            }
            run = 1;
          }
        }
      }
    };
    const getH = (y, x) => this.grid[y][x];
    getH.key = (y, x) => y * COLS + x;
    const getV = (x, y) => this.grid[y][x];
    getV.key = (x, y) => y * COLS + x;
    scan(ROWS, COLS, getH);
    scan(COLS, ROWS, getV);
    return mark.size ? { cells: mark, groups } : null;
  }

  removeCleared() {
    let germs = 0;
    for (const key of this.clearSet) {
      const x = key % COLS;
      const y = Math.floor(key / COLS);
      const c = this.grid[y][x];
      if (!c) continue;
      if (c.kind === 'germ') germs++;
      // eşini serbest bırak
      const d = { L: [-1, 0], R: [1, 0], U: [0, -1], D: [0, 1] }[c.link];
      if (d) {
        const o = this.grid[y + d[1]]?.[x + d[0]];
        if (o) o.link = null;
      }
      this.grid[y][x] = null;
      const sx = this.x0 + (x + 0.5) * CELL;
      const sy = this.y0 + (y + 0.5) * CELL;
      this.game.parts.burst(sx, sy, c.kind === 'germ' ? 14 : 6, [PILL[c.c], shade(PILL[c.c], 0.4)], { speed: 280, size: 7, life: 0.7 });
    }
    this.clearSet = null;
    if (germs) {
      this.germs = this.countGerms();
      this.api.buzz(this.p, 40);
      this.game.pops.add(`-${germs}`, this.x0 + (COLS * CELL) / 2, this.y0 + ROWS * CELL + 30, '#46e38a', 34);
    }
  }

  fallStep() {
    const G = this.grid;
    let moved = false;
    for (let y = ROWS - 2; y >= 0; y--) {
      for (let x = 0; x < COLS; x++) {
        const c = G[y][x];
        if (!c || c.kind !== 'pill') continue;
        if (c.link === 'R') {
          if (!G[y + 1][x] && !G[y + 1][x + 1] && G[y][x + 1]) {
            G[y + 1][x] = c;
            G[y + 1][x + 1] = G[y][x + 1];
            G[y][x] = G[y][x + 1] = null;
            moved = true;
          }
          x++;
        } else if (c.link === 'L' || c.link === 'D') {
          continue;
        } else if (c.link === 'U') {
          if (!G[y + 1][x]) {
            G[y + 1][x] = c;
            G[y][x] = y > 0 ? G[y - 1][x] : null;
            if (y > 0) G[y - 1][x] = null;
            moved = true;
          }
        } else if (!G[y + 1][x]) {
          G[y + 1][x] = c;
          G[y][x] = null;
          moved = true;
        }
      }
    }
    return moved;
  }

  dropGarbage() {
    const cols = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
    let i = 0;
    for (const color of this.incoming) {
      const x = cols[i++ % COLS];
      if (!this.grid[0][x]) this.grid[0][x] = { c: color, kind: 'pill', link: null };
    }
    this.incoming = [];
    this.shake.add(6, 0.25);
    this.api.sfx('garbage');
    this.api.buzz(this.p, 120);
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.shake.add(10, 0.4);
    this.api.sfx('die');
    this.api.buzz(this.p, 350);
  }

  get speed() {
    return Math.max(0.16, 0.75 * Math.pow(0.96, Math.floor(this.capsuleN / 4)));
  }

  onKey(k, down) {
    const inp = this.api.input[this.p];
    if (!down) {
      if ((k === 'left' || k === 'right') && this.dasDir === k) {
        const other = k === 'left' ? 'right' : 'left';
        this.dasDir = inp[other] ? other : null;
        this.dasT = DAS;
      }
      return;
    }
    if (this.dead) return;
    if (k === 'left' || k === 'right') {
      this.dasDir = k;
      this.dasT = DAS;
      this.move(k === 'left' ? -1 : 1);
    } else if (k === 'a' || k === 'up') this.rotate(1);
    else if (k === 'b') this.rotate(-1);
  }

  update(dt) {
    this.shake.update(dt);
    if (this.dead) return;
    if (this.phase === 'spawn') {
      this.t -= dt;
      if (this.t <= 0) {
        this.phase = 'play';
        this.spawn();
      }
      return;
    }
    if (this.phase === 'clear') {
      this.t -= dt;
      if (this.t <= 0) {
        this.removeCleared();
        this.phase = 'fall';
        this.t = 0.1;
      }
      return;
    }
    if (this.phase === 'fall') {
      this.t -= dt;
      if (this.t <= 0) {
        if (this.fallStep()) this.t = 0.065;
        else this.startResolve();
      }
      return;
    }
    if (!this.cap) return;
    const inp = this.api.input[this.p];
    if (this.dasDir) {
      if (!inp[this.dasDir]) this.dasDir = null;
      else {
        this.dasT -= dt;
        while (this.dasT <= 0) {
          if (!this.move(this.dasDir === 'left' ? -1 : 1)) {
            this.dasT = 0;
            break;
          }
          this.dasT += ARR;
        }
      }
    }
    const grav = inp.down ? Math.min(0.035, this.speed) : this.speed;
    this.dropT += dt;
    while (this.dropT >= grav && this.cap) {
      this.dropT -= grav;
      const c = { ...this.cap, y: this.cap.y + 1 };
      if (this.fits(c)) this.cap = c;
      else {
        this.lock();
        break;
      }
    }
  }

  // ---------------------------------------------------------------- çizim
  drawPillCell(g, x, y, color, link, alpha = 1) {
    const px = this.x0 + x * CELL;
    const py = this.y0 + y * CELL;
    const r = CELL / 2 - 2;
    const col = PILL[color];
    g.save();
    g.globalAlpha = alpha;
    g.beginPath();
    const cx = px + CELL / 2;
    const cy = py + CELL / 2;
    // yuvarlak taraf eşin tersinde
    const rad = [r, r, r, r]; // tl, tr, br, bl
    if (link === 'R') { rad[1] = rad[2] = 4; }
    if (link === 'L') { rad[0] = rad[3] = 4; }
    if (link === 'D') { rad[2] = rad[3] = 4; }
    if (link === 'U') { rad[0] = rad[1] = 4; }
    const ox = link === 'R' ? 2 : 2;
    const ow = CELL - 4 + (link === 'R' || link === 'L' ? 2 : 0);
    const oh = CELL - 4 + (link === 'D' || link === 'U' ? 2 : 0);
    const sx = link === 'L' ? px : px + ox;
    const sy = link === 'U' ? py : py + 2;
    if (g.roundRect) g.roundRect(sx, sy, ow, oh, rad);
    else g.rect(sx, sy, ow, oh);
    const grad = g.createLinearGradient(px, py, px, py + CELL);
    grad.addColorStop(0, shade(col, 0.3));
    grad.addColorStop(1, shade(col, -0.2));
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.3)';
    g.lineWidth = 2;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.45)';
    g.beginPath();
    g.ellipse(cx - 4, cy - 6, 6, 3.5, -0.4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  drawGerm(g, x, y, cell, time, dying) {
    const col = PILL[cell.c];
    const cx = this.x0 + (x + 0.5) * CELL;
    const cy = this.y0 + (y + 0.5) * CELL;
    const t = time * 3 + cell.seed;
    const r = CELL * 0.4;
    g.save();
    g.translate(cx, cy);
    // dalgalı gövde
    g.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rr2 = r * (1 + 0.12 * Math.sin(a * 6 + t * 2) + 0.05 * Math.sin(t));
      const px = Math.cos(a) * rr2;
      const py = Math.sin(a) * rr2 * 0.92;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath();
    g.fillStyle = shade(col, -0.1);
    g.fill();
    g.strokeStyle = shade(col, -0.5);
    g.lineWidth = 2;
    g.stroke();
    // gözler
    const look = Math.sin(t * 0.7) * 0.6;
    for (const s of [-1, 1]) {
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(s * r * 0.36, -r * 0.18, r * 0.27, 0, Math.PI * 2);
      g.fill();
      if (dying) {
        g.strokeStyle = '#111';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(s * r * 0.36 - 3, -r * 0.18 - 3);
        g.lineTo(s * r * 0.36 + 3, -r * 0.18 + 3);
        g.moveTo(s * r * 0.36 + 3, -r * 0.18 - 3);
        g.lineTo(s * r * 0.36 - 3, -r * 0.18 + 3);
        g.stroke();
      } else {
        g.fillStyle = '#141225';
        g.beginPath();
        g.arc(s * r * 0.36 + look * 2, -r * 0.14, r * 0.13, 0, Math.PI * 2);
        g.fill();
      }
    }
    // ağız
    g.strokeStyle = '#141225';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-r * 0.3, r * 0.32);
    for (let i = 1; i <= 4; i++) g.lineTo(-r * 0.3 + i * r * 0.15, r * 0.32 + (i % 2 ? -3 : 0));
    g.stroke();
    g.restore();
  }

  draw(g, time) {
    const { x0, y0 } = this;
    const bw = COLS * CELL;
    const bh = ROWS * CELL;
    const col = PCOL[this.p];
    g.save();
    this.shake.apply(g);

    // şişe gövdesi
    g.save();
    g.shadowColor = col;
    g.shadowBlur = 24;
    g.lineWidth = 8;
    g.strokeStyle = shade(col, -0.2);
    g.beginPath();
    const nx0 = x0 + 2.5 * CELL;
    const nx1 = x0 + 5.5 * CELL;
    g.moveTo(nx0, y0 - 46);
    g.lineTo(nx0, y0 - 10);
    g.lineTo(x0 - 6, y0 - 10);
    g.lineTo(x0 - 6, y0 + bh + 6);
    g.quadraticCurveTo(x0 - 6, y0 + bh + 12, x0, y0 + bh + 12);
    g.lineTo(x0 + bw, y0 + bh + 12);
    g.quadraticCurveTo(x0 + bw + 6, y0 + bh + 12, x0 + bw + 6, y0 + bh + 6);
    g.lineTo(x0 + bw + 6, y0 - 10);
    g.lineTo(nx1, y0 - 10);
    g.lineTo(nx1, y0 - 46);
    g.stroke();
    g.restore();
    g.fillStyle = 'rgba(14,12,40,.92)';
    g.fillRect(x0 - 2, y0 - 6, bw + 4, bh + 14);
    g.fillRect(nx0 + 4, y0 - 44, nx1 - nx0 - 8, 40);
    // şişe camı yansıması
    g.fillStyle = 'rgba(255,255,255,.04)';
    g.fillRect(x0 + 6, y0, 10, bh);
    // ızgara noktaları
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.fillRect(x0 + x * CELL + CELL / 2 - 1, y0 + y * CELL + CELL / 2 - 1, 2, 2);

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const c = this.grid[y][x];
        if (!c) continue;
        const clearing = this.clearSet && this.clearSet.has(y * COLS + x);
        const blink = clearing && Math.floor(time * 20) % 2;
        if (c.kind === 'germ') this.drawGerm(g, x, y, c, time, clearing);
        else this.drawPillCell(g, x, y, c.c, c.link, blink ? 0.35 : 1);
        if (clearing) {
          g.fillStyle = 'rgba(255,255,255,.35)';
          g.fillRect(x0 + x * CELL + 2, y0 + y * CELL + 2, CELL - 4, CELL - 4);
        }
      }
    }
    if (this.cap) for (const [x, y, c, link] of this.cells()) this.drawPillCell(g, x, y, c, link);

    if (this.incoming.length) {
      for (let i = 0; i < this.incoming.length; i++) {
        const bob = Math.sin(time * 8 + i) * 3;
        g.fillStyle = PILL[this.incoming[i]];
        g.beginPath();
        g.arc(x0 + 20 + i * 26, y0 - 26 + bob, 9, 0, Math.PI * 2);
        g.fill();
      }
    }

    if (this.dead) {
      g.fillStyle = 'rgba(8,6,24,.6)';
      g.fillRect(x0 - 2, y0 - 6, bw + 4, bh + 14);
      text(g, 'TIKANDI!', x0 + bw / 2, y0 + bh / 2, { size: 50, color: '#ff6b7a', weight: 800, stroke: '#1a0a14', sw: 8 });
    }
    g.restore();

    // başlık
    text(g, this.api.players[this.p].name, x0 + bw / 2, 34, { size: 36, color: col, weight: 800, stroke: 'rgba(0,0,0,.5)', sw: 6 });
    winDots(g, x0 + bw / 2, 66, this.game.wins[this.p], NEED, col);

    // sıradaki kapsül
    const qx = this.p === 0 ? 50 : 1134;
    rr(g, qx, y0, 96, 104, 14);
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.fill();
    text(g, 'SIRADA', qx + 48, y0 + 20, { size: 18, color: '#a7a2d1' });
    const nx = this.game.capAt(this.capsuleN);
    const sx = this.x0;
    const sy = this.y0;
    this.x0 = qx + 48 - CELL;
    this.y0 = y0 + 50;
    this.drawPillCell(g, 0, 0, nx[0], 'R');
    this.drawPillCell(g, 1, 0, nx[1], 'L');
    this.x0 = sx;
    this.y0 = sy;

    // mikrop sayacı
    rr(g, qx, y0 + 124, 96, 120, 14);
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.fill();
    text(g, 'MİKROP', qx + 48, y0 + 146, { size: 18, color: '#a7a2d1' });
    text(g, String(this.germs), qx + 48, y0 + 198, { size: 56, color: this.germs <= 3 ? '#46e38a' : '#fff', weight: 800 });
  }
}

class CapsuleGame {
  constructor(api) {
    this.api = api;
    this.wins = [0, 0];
    this.round = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.time = 0;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.caps = [];
    const germs = makeGerms(GERMS + (this.round - 1) * 2);
    this.bottles = [new Bottle(this, 0, germs), new Bottle(this, 1, germs)];
    this.phase = this.round === 1 ? 'play' : 'intro';
    this.phaseT = 2;
    this.roundWinner = null;
    for (const p of [0, 1]) this.api.info(p, `Raunt ${this.round} · ${this.wins[0]} - ${this.wins[1]}`);
  }

  capAt(i) {
    while (this.caps.length <= i) this.caps.push([randi(0, 2), randi(0, 2)]);
    return this.caps[i];
  }

  sendGarbage(p, n) {
    const b = this.bottles[p];
    for (let i = 0; i < n; i++) b.incoming.push(randi(0, 2));
    this.pops.add(`+${n} KAPSÜL`, b.x0 + (COLS * CELL) / 2, b.y0 + 120, '#ff5a6a', 36);
  }

  onKey(p, k, down) {
    if (this.phase === 'play') this.bottles[p].onKey(k, down);
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'play') {
      this.bottles.forEach((b) => b.update(dt));
      const cleared = this.bottles.map((b) => b.germs === 0 && b.phase !== 'clear');
      const dead = this.bottles.map((b) => b.dead);
      let w;
      if (cleared[0] || cleared[1]) w = cleared[0] && cleared[1] ? null : cleared[0] ? 0 : 1;
      else if (dead[0] || dead[1]) w = dead[0] && dead[1] ? null : dead[0] ? 1 : 0;
      else return;
      this.roundWinner = w;
      this.roundReason = cleared[0] || cleared[1] ? 'clean' : 'clog';
      if (w !== null) this.wins[w]++;
      this.phase = 'over';
      this.phaseT = 3;
      this.api.sfx(this.roundReason === 'clean' ? 'power' : 'lose');
      return;
    }
    if (this.phase === 'over') {
      this.bottles.forEach((b) => b.shake.update(dt));
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const w = this.roundWinner;
        if (w !== null && this.wins[w] >= NEED) this.api.end({ winner: w, detail: `Raunt skoru ${this.wins[0]} - ${this.wins[1]}` });
        else this.newRound();
      }
    }
  }

  demo() {
    const b = this.bottles[0];
    b.cap = { x: 3, y: 6, o: 1, a: 0, b: 2 };
    b.grid[15][0] = { c: 1, kind: 'pill', link: 'R' };
    b.grid[15][1] = { c: 2, kind: 'pill', link: 'L' };
    this.bottles[1].cap = { x: 4, y: 3, o: 0, a: 1, b: 1 };
  }

  draw(g) {
    const bg = g.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, '#102434');
    bg.addColorStop(1, '#0b0a22');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    // baloncuklar
    for (let i = 0; i < 26; i++) {
      const x = (i * 137) % W;
      const y = H - ((this.time * (20 + (i % 5) * 8) + i * 90) % (H + 40));
      g.strokeStyle = 'rgba(120,220,255,.08)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(x, y, 4 + (i % 4) * 3, 0, Math.PI * 2);
      g.stroke();
    }
    this.bottles.forEach((b) => b.draw(g, this.time));

    const cx = W / 2;
    text(g, `RAUNT ${this.round}`, cx, 150, { size: 30, color: '#a7a2d1', weight: 800 });
    text(g, `${this.wins[0]}`, cx - 50, 220, { size: 80, color: PCOL[0], weight: 800 });
    text(g, '–', cx, 216, { size: 60, color: '#57538a', weight: 800 });
    text(g, `${this.wins[1]}`, cx + 50, 220, { size: 80, color: PCOL[1], weight: 800 });
    text(g, 'Mikroplarını ilk', cx, 320, { size: 22, color: '#e6e2ff', weight: 700 });
    text(g, 'bitiren kazanır!', cx, 348, { size: 22, color: '#e6e2ff', weight: 700 });
    text(g, 'Aynı renkten 4 tane', cx, 430, { size: 17, color: '#6f8ba3', weight: 600 });
    text(g, 'yan yana ya da üst üste', cx, 454, { size: 17, color: '#6f8ba3', weight: 600 });
    text(g, '→ silinir', cx, 478, { size: 17, color: '#6f8ba3', weight: 600 });
    text(g, 'İki grup birden silersen', cx, 540, { size: 17, color: '#6f8ba3', weight: 600 });
    text(g, 'rakibe kapsül yağar', cx, 564, { size: 17, color: '#6f8ba3', weight: 600 });

    this.parts.draw(g);
    this.pops.draw(g);

    if (this.phase === 'intro') banner(g, `RAUNT ${this.round}`, 'Yeni mikroplar geliyor!', '#46e38a', 2 - this.phaseT);
    if (this.phase === 'over' && this.phaseT < 2.7) {
      const w = this.roundWinner;
      const sub = this.roundReason === 'clean' ? 'Şişesini ilk temizleyen o!' : 'Rakibin şişesi tıkandı';
      if (w === null) banner(g, 'BERABERE', '', '#ffd23f', 2.7 - this.phaseT);
      else banner(g, `${this.api.players[w].name} RAUNDU ALDI!`, sub, PCOL[w], 2.7 - this.phaseT);
    }
  }
}

export default {
  id: 'capsule',
  name: 'Kapsül Kapışması',
  icon: '💊',
  tag: 'Renk eşleştirme',
  mode: 'versus',
  color: '#2bb3a3',
  desc: 'Şişene düşen iki renkli kapsülleri yerleştir. Aynı renkten 4 tanesi yan yana ya da üst üste gelince silinir. Mikroplarını ilk temizleyen kazanır!',
  howto: ['◀ ▶ kapsülü kaydır', '▼ hızlı indir', 'A / ▲ sağa, B sola döndür', 'İki grup birden silersen rakibine kapsül yağar', '3 rauntta 2 alan kazanır'],
  keys: '1. oyuncu WASD + F / G · 2. oyuncu Oklar + K / L',
  controller: { layout: 'dpad', dirs: 4, a: 'DÖNDÜR ↻', b: 'DÖNDÜR ↺' },
  create: (api) => new CapsuleGame(api),
};
