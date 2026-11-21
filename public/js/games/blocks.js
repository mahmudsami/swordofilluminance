// BLOK DÜELLOSU — düşen bloklarla kafa kafaya bulmaca.
// Satır tamamla, rakibine çöp satır gönder. 3 rauntta 2 alan kazanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, winDots, rgba, shade, sprite, Layer } from '../host/gfx.js';

const COLS = 10;
const ROWS = 22; // üstteki 2 satır görünmez
const HID = 2;
const CELL = 30;
const DAS = 0.15;
const ARR = 0.04;
const SOFT = 0.028;
const LOCK = 0.5;
const NEED = 2;
const BX = [170, 810]; // tahta sol kenarları
const BY = 96;
const BW = COLS * CELL;
const BH = (ROWS - HID) * CELL;
const QX = [40, 1145]; // sıradaki parçalar kutusu

const SHAPES = {
  I: ['....', 'IIII', '....', '....'],
  O: ['OO', 'OO'],
  T: ['.T.', 'TTT', '...'],
  S: ['.SS', 'SS.', '...'],
  Z: ['ZZ.', '.ZZ', '...'],
  J: ['J..', 'JJJ', '...'],
  L: ['..L', 'LLL', '...'],
};
const TYPES = Object.keys(SHAPES);
const COLORS = { I: '#35d6ff', O: '#ffd23f', T: '#b45cff', S: '#4be37a', Z: '#ff4d5e', J: '#4a7bff', L: '#ff9a3d', G: '#6a6f8c' };
const KICKS = [[0, 0], [-1, 0], [1, 0], [0, -1], [-2, 0], [2, 0], [-1, -1], [1, -1], [0, 1]];

// Her parça için 4 dönüş hâlinin hücre listesi
const ROT = {};
for (const t of TYPES) {
  let m = SHAPES[t].map((r) => r.split(''));
  ROT[t] = [];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    m.forEach((row, y) => row.forEach((c, x) => c !== '.' && cells.push([x, y])));
    ROT[t].push(cells);
    const n = m.length;
    m = m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
  }
}
// Önizleme kutusu için parça sınırları
const BOUNDS = {};
for (const t of TYPES) {
  const c = ROT[t][0];
  BOUNDS[t] = {
    minX: Math.min(...c.map((v) => v[0])),
    maxX: Math.max(...c.map((v) => v[0])),
    minY: Math.min(...c.map((v) => v[1])),
    maxY: Math.max(...c.map((v) => v[1])),
  };
}

function blockSprite(c, size = CELL) {
  return sprite(`blk|${c}|${size}`, size, size, (g) => {
    const col = COLORS[c] || c;
    const grad = g.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, shade(col, 0.25));
    grad.addColorStop(1, shade(col, -0.25));
    rr(g, 1, 1, size - 2, size - 2, size * 0.18);
    g.fillStyle = grad;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    rr(g, size * 0.16, size * 0.12, size * 0.68, size * 0.16, size * 0.08);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.lineWidth = 2;
    rr(g, 1, 1, size - 2, size - 2, size * 0.18);
    g.stroke();
  });
}

function ghostSprite(c) {
  return sprite(`ghost|${c}`, CELL, CELL, (g) => {
    rr(g, 3, 3, CELL - 6, CELL - 6, 5);
    g.fillStyle = rgba(COLORS[c], 0.12);
    g.fill();
    g.strokeStyle = rgba(COLORS[c], 0.7);
    g.lineWidth = 2;
    g.stroke();
  });
}

class Board {
  constructor(game, p) {
    this.game = game;
    this.p = p;
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    this.seqI = 0;
    this.piece = null;
    this.incoming = 0;
    this.lines = 0;
    this.score = 0;
    this.combo = -1;
    this.dead = false;
    this.deathT = 0;
    this.clearing = null;
    this.spawnDelay = 0;
    this.dropT = 0;
    this.lockT = 0;
    this.lockN = 0;
    this.dasDir = null;
    this.dasT = 0;
    this.shake = new Shake();
    this.x0 = BX[p];
    this.y0 = BY;
  }

  get api() {
    return this.game.api;
  }

  collide(t, r, x, y) {
    for (const [cx, cy] of ROT[t][r]) {
      const X = x + cx;
      const Y = y + cy;
      if (X < 0 || X >= COLS || Y >= ROWS) return true;
      if (Y >= 0 && this.grid[Y][X]) return true;
    }
    return false;
  }

  spawn() {
    const t = this.game.pieceAt(this.seqI++);
    const n = SHAPES[t].length;
    const x = Math.floor((COLS - n) / 2);
    let y = 1;
    if (this.collide(t, 0, x, y)) y = 0;
    this.piece = { t, r: 0, x, y };
    this.dropT = 0;
    this.lockT = 0;
    this.lockN = 0;
    if (this.collide(t, 0, x, y)) {
      this.piece = null;
      this.die();
    }
  }

  grounded() {
    const p = this.piece;
    return p && this.collide(p.t, p.r, p.x, p.y + 1);
  }

  touched() {
    if (this.grounded() && this.lockN < 15) {
      this.lockT = 0;
      this.lockN++;
    }
  }

  move(dx) {
    const p = this.piece;
    if (!p || this.collide(p.t, p.r, p.x + dx, p.y)) return false;
    p.x += dx;
    this.touched();
    this.api.sfx('move');
    return true;
  }

  rotate(dir) {
    const p = this.piece;
    if (!p || p.t === 'O') return;
    const nr = (p.r + dir + 4) % 4;
    for (const [kx, ky] of KICKS) {
      if (!this.collide(p.t, nr, p.x + kx, p.y + ky)) {
        p.x += kx;
        p.y += ky;
        p.r = nr;
        this.touched();
        this.api.sfx('rotate');
        return;
      }
    }
  }

  hardDrop() {
    const p = this.piece;
    if (!p) return;
    let n = 0;
    while (!this.collide(p.t, p.r, p.x, p.y + 1)) {
      p.y++;
      n++;
    }
    this.score += n * 2;
    for (const [cx, cy] of ROT[p.t][p.r]) {
      const sx = this.x0 + (p.x + cx + 0.5) * CELL;
      const sy = this.y0 + (p.y + cy - HID + 0.5) * CELL;
      this.game.parts.burst(sx, sy, 2, COLORS[p.t], { speed: 120, life: 0.35, gravity: -200, size: 5 });
    }
    this.shake.add(3, 0.12);
    this.api.sfx('drop');
    this.lock();
  }

  ghostY() {
    const p = this.piece;
    let y = p.y;
    while (!this.collide(p.t, p.r, p.x, y + 1)) y++;
    return y;
  }

  lock() {
    const p = this.piece;
    let allHidden = true;
    for (const [cx, cy] of ROT[p.t][p.r]) {
      const Y = p.y + cy;
      if (Y >= 0) this.grid[Y][p.x + cx] = p.t;
      if (Y >= HID) allHidden = false;
    }
    this.piece = null;
    if (allHidden) return this.die();
    this.api.sfx('lock');

    const full = [];
    for (let y = 0; y < ROWS; y++) if (this.grid[y].every((c) => c)) full.push(y);
    if (full.length) {
      const n = full.length;
      this.combo++;
      this.lines += n;
      this.score += [0, 100, 300, 500, 800][n] * (1 + Math.max(0, this.combo) * 0.5);
      let atk = [0, 0, 1, 2, 4][n] + (this.combo >= 2 ? Math.floor(this.combo / 2) : 0);
      // tahtayı tamamen temizlemek ekstra saldırı
      const perfect = this.grid.every((row, y) => full.includes(y) || row.every((c) => !c));
      if (perfect) atk += 4;
      const cancel = Math.min(atk, this.incoming);
      this.incoming -= cancel;
      atk -= cancel;
      if (atk > 0) this.game.sendGarbage(1 - this.p, atk);
      const cx = this.x0 + BW / 2;
      const cy = this.y0 + (full[0] - HID) * CELL;
      const label = perfect ? 'TERTEMİZ!' : ['', '', 'İKİLİ!', 'ÜÇLÜ!', 'DÖRTLÜ!'][n];
      if (label) this.game.pops.add(label, cx, cy, n === 4 || perfect ? '#ffd23f' : '#fff', n === 4 || perfect ? 56 : 42);
      if (this.combo >= 1) this.game.pops.add(`KOMBO x${this.combo + 1}`, cx, cy + 50, '#46e38a', 30);
      for (const y of full) {
        for (let x = 0; x < COLS; x += 2) {
          this.game.parts.burst(this.x0 + (x + 1) * CELL, this.y0 + (y - HID + 0.5) * CELL, 3, COLORS[this.grid[y][x]], { speed: 300, life: 0.7, size: 7 });
        }
      }
      if (n === 4) {
        this.shake.add(8, 0.3);
        this.api.buzz(this.p, 60);
      }
      this.api.sfx(n >= 4 ? 'big' : 'clear');
      this.clearing = { rows: full, t: 0.26 };
    } else {
      this.combo = -1;
      if (this.incoming > 0) {
        const n = this.incoming;
        this.incoming = 0;
        this.addGarbage(n);
        if (this.dead) return;
      }
      this.spawnDelay = 0.05;
    }
  }

  finishClear() {
    const rows = this.clearing.rows;
    this.clearing = null;
    this.grid = this.grid.filter((_, y) => !rows.includes(y));
    while (this.grid.length < ROWS) this.grid.unshift(Array(COLS).fill(null));
    this.spawnDelay = 0.04;
  }

  addGarbage(n) {
    const hole = Math.floor(Math.random() * COLS);
    const removed = this.grid.splice(0, n);
    for (let i = 0; i < n; i++) {
      const row = Array(COLS).fill('G');
      row[hole] = null;
      this.grid.push(row);
    }
    this.shake.add(6, 0.25);
    this.api.sfx('garbage');
    this.api.buzz(this.p, 120);
    if (removed.some((r) => r.some((c) => c))) this.die();
  }

  die() {
    if (this.dead) return;
    this.dead = true;
    this.piece = null;
    this.deathT = 0;
    this.shake.add(10, 0.4);
    this.api.sfx('die');
    this.api.buzz(this.p, 350);
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
      if (this.piece) this.move(k === 'left' ? -1 : 1);
    } else if (k === 'up' || k === 'a') this.rotate(1);
    else if (k === 'b') this.hardDrop();
  }

  update(dt) {
    this.shake.update(dt);
    if (this.dead) {
      this.deathT += dt;
      return;
    }
    if (this.clearing) {
      this.clearing.t -= dt;
      if (this.clearing.t <= 0) this.finishClear();
      return;
    }
    if (this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) this.spawn();
      return;
    }
    const p = this.piece;
    if (!p) return;
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

    const grav = inp.down ? Math.min(SOFT, this.game.gravity) : this.game.gravity;
    this.dropT += dt;
    while (this.dropT >= grav) {
      this.dropT -= grav;
      if (!this.collide(p.t, p.r, p.x, p.y + 1)) {
        p.y++;
        if (inp.down) this.score += 1;
      } else {
        this.dropT = 0;
        break;
      }
    }

    if (this.grounded()) {
      this.lockT += dt;
      if (this.lockT >= LOCK) this.lock();
    } else this.lockT = 0;
  }

  // ---------------------------------------------------------------- çizim (sadece değişen kısımlar)
  draw(g) {
    const { x0, y0 } = this;
    g.save();
    this.shake.apply(g);

    // yerleşmiş bloklar
    const greyFrom = this.dead ? ROWS - Math.floor(this.deathT * 45) : ROWS + 1;
    for (let y = HID; y < ROWS; y++) {
      const row = this.grid[y];
      for (let x = 0; x < COLS; x++) {
        const c = row[x];
        if (c) g.drawImage(blockSprite(y >= greyFrom ? 'G' : c), x0 + x * CELL, y0 + (y - HID) * CELL, CELL, CELL);
      }
    }

    // silinen satır parlaması
    if (this.clearing) {
      g.fillStyle = `rgba(255,255,255,${0.85 * (this.clearing.t / 0.26)})`;
      for (const y of this.clearing.rows) g.fillRect(x0, y0 + (y - HID) * CELL, BW, CELL);
    }

    // gölge ve aktif parça
    const p = this.piece;
    if (p) {
      const gy = this.ghostY();
      const gs = ghostSprite(p.t);
      const bs = blockSprite(p.t);
      for (const [cx, cy] of ROT[p.t][p.r]) {
        const Y = gy + cy;
        if (Y >= HID) g.drawImage(gs, x0 + (p.x + cx) * CELL, y0 + (Y - HID) * CELL, CELL, CELL);
      }
      const flash = this.grounded() ? 0.5 + 0.5 * Math.sin(this.lockT * 30) : 0;
      for (const [cx, cy] of ROT[p.t][p.r]) {
        const Y = p.y + cy;
        if (Y < HID) continue;
        const px = x0 + (p.x + cx) * CELL;
        const py = y0 + (Y - HID) * CELL;
        g.drawImage(bs, px, py, CELL, CELL);
        if (flash > 0) {
          g.fillStyle = `rgba(255,255,255,${0.15 * flash})`;
          g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
        }
      }
    }

    // gelen çöp göstergesi
    if (this.incoming > 0) {
      const mx = this.p === 0 ? x0 + BW + 12 : x0 - 22;
      const h = Math.min(ROWS - HID, this.incoming) * CELL;
      const pulse = 0.65 + 0.35 * Math.sin(this.game.time * 11);
      g.fillStyle = `rgba(255,80,90,${pulse})`;
      g.fillRect(mx, y0 + BH - h, 10, h);
    }

    if (this.dead && this.deathT > 0.3) {
      g.fillStyle = `rgba(8,6,24,${Math.min(0.6, (this.deathT - 0.3) * 1.5)})`;
      g.fillRect(x0, y0, BW, BH);
      text(g, 'ELENDİ', x0 + BW / 2, y0 + BH / 2, { size: 54, color: '#ff6b7a', weight: 800, stroke: '#1a0a14', sw: 8, alpha: Math.min(1, (this.deathT - 0.3) * 3) });
    }
    g.restore();

    winDots(g, x0 + BW / 2, 72, this.game.wins[this.p], NEED, PCOL[this.p]);

    // sıradaki parçalar
    const qx = QX[this.p];
    for (let i = 0; i < 3; i++) {
      const t = this.game.pieceAt(this.seqI + i);
      const s = i === 0 ? 22 : 17;
      const b = BOUNDS[t];
      const ox = qx + 48 - ((b.maxX - b.minX + 1) * s) / 2;
      const oy = y0 + 72 + i * 80 - ((b.maxY - b.minY + 1) * s) / 2;
      const spr = blockSprite(t, s);
      for (const [cx, cy] of ROT[t][0]) g.drawImage(spr, ox + (cx - b.minX) * s, oy + (cy - b.minY) * s, s, s);
    }
    text(g, String(this.lines), qx + 48, y0 + 372, { size: 36, color: '#fff', weight: 800 });
    text(g, String(Math.floor(this.score)), qx + 48, y0 + 450, { size: 28, color: '#fff', weight: 800 });
  }
}

class BlocksGame {
  constructor(api) {
    this.api = api;
    this.wins = [0, 0];
    this.round = 0;
    this.time = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.newRound();
  }

  newRound() {
    this.round++;
    this.seq = [];
    this.levelTime = 0;
    this.boards = [new Board(this, 0), new Board(this, 1)];
    this.boards.forEach((b) => b.spawn());
    this.phase = this.round === 1 ? 'play' : 'intro';
    this.phaseT = 2;
    this.roundWinner = null;
    for (const p of [0, 1]) this.api.info(p, `Raunt ${this.round} · ${this.wins[0]} - ${this.wins[1]}`);
  }

  pieceAt(i) {
    while (this.seq.length <= i) {
      const bag = [...TYPES];
      for (let k = bag.length - 1; k > 0; k--) {
        const j = Math.floor(Math.random() * (k + 1));
        [bag[k], bag[j]] = [bag[j], bag[k]];
      }
      this.seq.push(...bag);
    }
    return this.seq[i];
  }

  get level() {
    return 1 + Math.floor(this.levelTime / 25);
  }

  get gravity() {
    return Math.max(0.05, 0.75 * Math.pow(0.8, this.level - 1));
  }

  sendGarbage(p, n) {
    const b = this.boards[p];
    if (b.dead) return;
    b.incoming += n;
    this.pops.add(`+${n}`, b.x0 + BW / 2, b.y0 + 520, '#ff5a6a', 46);
  }

  onKey(p, k, down) {
    if (this.phase !== 'play') return;
    this.boards[p].onKey(k, down);
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
      this.levelTime += dt;
      this.boards.forEach((b) => b.update(dt));
      const dead = this.boards.map((b) => b.dead);
      if (dead[0] || dead[1]) {
        this.phase = 'over';
        this.phaseT = 3;
        this.roundWinner = dead[0] && dead[1] ? null : dead[0] ? 1 : 0;
        if (this.roundWinner !== null) this.wins[this.roundWinner]++;
        this.api.sfx('lose');
      }
      return;
    }
    if (this.phase === 'over') {
      // sadece elenme animasyonu ilerler; kazananın parçası olduğu yerde durur
      for (const b of this.boards) {
        b.shake.update(dt);
        if (b.dead) b.deathT += dt;
      }
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const w = this.roundWinner;
        if (w !== null && this.wins[w] >= NEED) this.api.end({ winner: w, detail: `Raunt skoru ${this.wins[0]} - ${this.wins[1]}` });
        else this.newRound();
      }
    }
  }

  demo() {
    for (const b of this.boards) {
      for (let y = ROWS - 1; y > ROWS - 9; y--) {
        const hole = Math.floor(Math.random() * COLS);
        for (let x = 0; x < COLS; x++) if (x !== hole && Math.random() > 0.12) b.grid[y][x] = TYPES[(x + y * 3 + b.p) % 7];
      }
      b.piece.y = 8;
      b.incoming = b.p ? 3 : 0;
      b.lines = 6 + b.p * 3;
    }
  }

  // Değişmeyen her şey tek katmanda: arka plan, çerçeveler, ızgara, etiketler
  paintBg(g) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#15123a');
    bg.addColorStop(1, '#0a0920');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.025)';
    for (let x = 0; x < W; x += 40) for (let y = (x / 40) % 2 ? 20 : 0; y < H; y += 40) g.fillRect(x, y, 3, 3);
    for (const p of [0, 1]) {
      const x0 = BX[p];
      const col = PCOL[p];
      g.save();
      g.shadowColor = rgba(col, 0.6);
      g.shadowBlur = 26;
      rr(g, x0 - 8, BY - 8, BW + 16, BH + 16, 14);
      g.fillStyle = shade(col, -0.55);
      g.fill();
      g.restore();
      rr(g, x0 - 3, BY - 3, BW + 6, BH + 6, 8);
      g.fillStyle = '#0d0b24';
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,.045)';
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 1; x < COLS; x++) {
        g.moveTo(x0 + x * CELL + 0.5, BY);
        g.lineTo(x0 + x * CELL + 0.5, BY + BH);
      }
      for (let y = 1; y < ROWS - HID; y++) {
        g.moveTo(x0, BY + y * CELL + 0.5);
        g.lineTo(x0 + BW, BY + y * CELL + 0.5);
      }
      g.stroke();
      // çöp göstergesi yuvası
      const mx = p === 0 ? x0 + BW + 12 : x0 - 22;
      rr(g, mx, BY, 10, BH, 5);
      g.fillStyle = 'rgba(255,255,255,.06)';
      g.fill();
      text(g, this.api.players[p].name, x0 + BW / 2, 38, { size: 36, color: col, weight: 800, stroke: 'rgba(0,0,0,.5)', sw: 6 });
      const qx = QX[p];
      rr(g, qx, BY, 96, 300, 14);
      g.fillStyle = 'rgba(255,255,255,.05)';
      g.fill();
      text(g, 'SIRADA', qx + 48, BY + 22, { size: 18, color: '#a7a2d1', weight: 700 });
      text(g, 'SATIR', qx + 48, BY + 340, { size: 18, color: '#a7a2d1' });
      text(g, 'PUAN', qx + 48, BY + 420, { size: 18, color: '#a7a2d1' });
    }
    const cx = W / 2;
    text(g, `${NEED} raunt alan kazanır`, cx, 255, { size: 18, color: '#7d79ad', weight: 600 });
    rr(g, cx - 110, 300, 220, 110, 18);
    g.fillStyle = 'rgba(255,255,255,.05)';
    g.fill();
    text(g, 'HIZ', cx, 330, { size: 20, color: '#a7a2d1' });
    text(g, 'İkili satır → 1 çöp', cx, 540, { size: 17, color: '#6f6ba3', weight: 600 });
    text(g, 'Üçlü → 2  ·  Dörtlü → 4', cx, 566, { size: 17, color: '#6f6ba3', weight: 600 });
    text(g, 'Kendi satırın gelen çöpü siler', cx, 592, { size: 17, color: '#6f6ba3', weight: 600 });
  }

  draw(g) {
    this.bg.draw(g);
    this.boards.forEach((b) => b.draw(g));

    const cx = W / 2;
    text(g, `RAUNT ${this.round}`, cx, 130, { size: 30, color: '#a7a2d1', weight: 800 });
    text(g, `${this.wins[0]}`, cx - 50, 200, { size: 80, color: PCOL[0], weight: 800 });
    text(g, '–', cx, 196, { size: 60, color: '#57538a', weight: 800 });
    text(g, `${this.wins[1]}`, cx + 50, 200, { size: 80, color: PCOL[1], weight: 800 });
    text(g, String(this.level), cx, 375, { size: 52, color: '#ffd23f', weight: 800 });
    const m = Math.floor(this.levelTime / 60);
    const s = Math.floor(this.levelTime % 60);
    text(g, `${m}:${String(s).padStart(2, '0')}`, cx, 450, { size: 30, color: '#e6e2ff', weight: 700 });

    this.parts.draw(g);
    this.pops.draw(g);

    if (this.phase === 'intro') banner(g, `RAUNT ${this.round}`, `${this.wins[0]} - ${this.wins[1]}`, '#ffd23f', 2 - this.phaseT);
    if (this.phase === 'over' && this.phaseT < 2.6) {
      const w = this.roundWinner;
      if (w === null) banner(g, 'BERABERE', 'İkiniz de aynı anda elendiniz', '#ffd23f', 2.6 - this.phaseT);
      else banner(g, `${this.api.players[w].name} RAUNDU ALDI!`, `${this.wins[0]} - ${this.wins[1]}`, PCOL[w], 2.6 - this.phaseT);
    }
  }
}

export default {
  id: 'blocks',
  name: 'Blok Düellosu',
  icon: '🧱',
  tag: 'Düşen bloklar',
  mode: 'versus',
  cat: 'bulmaca',
  color: '#8a5cff',
  desc: 'Düşen blokları yerleştir, satırları tamamla. Aynı anda iki ya da daha fazla satır silersen rakibine çöp satır gönderirsin!',
  howto: ['◀ ▶ parçayı kaydır (basılı tut: hızlı kayar)', '▼ hızlı indir', 'A ya da ▲ döndür', 'B anında bırak', '3 rauntta 2 alan kazanır'],
  keys: '1. oyuncu WASD + F (döndür) / G (bırak) · 2. oyuncu Oklar + K / L',
  controller: { layout: 'dpad', dirs: 4, a: 'DÖNDÜR', b: 'BIRAK' },
  create: (api) => new BlocksGame(api),
};
