// HAZİNE LABİRENTİ — takım oyunu. Labirentteki bütün mücevherleri birlikte toplayın.
// Bekçi robotlar yakalarsa donarsın; arkadaşın sana dokunursa çözülürsün.
// İkiniz aynı anda donarsanız ortak can gider. Köşelerdeki kristaller robotları korkutur.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, sprite, Layer, glow } from '../host/gfx.js';
import { guySprite } from './bomber.js';

const T = 48;
const COLS = 21;
const ROWS = 13;
const X0 = (W - COLS * T) / 2;
const Y0 = 72;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];
const OPP = [2, 3, 0, 1];
const KEYDIR = { right: 0, down: 1, left: 2, up: 3 };
const FACE = [3, 0, 2, 1]; // yön → karakter yüz indeksi (bomber guySprite: 0 aşağı,1 yukarı,2 sol,3 sağ)
const GUARD_COL = ['#ff5a5a', '#c08bff', '#ffb347', '#46e38a'];
const FREEZE = 6;
const LIVES = 3;

const MAPS = [
  {
    rows: [
      '#####################',
      '#o.......#.#.......o#',
      '#.###.##.#.#.##.###.#',
      '#...................#',
      '#.###.#.#####.#.###.#',
      '#.....#...#...#.....#',
      '#####.###.G.###.#####',
      '#.....#.......#.....#',
      '#.###.#.#####.#.###.#',
      '#...................#',
      '#.###.##.#.#.##.###.#',
      '#o.......1 2.......o#',
      '#####################',
    ],
    guards: 3,
    speed: 4.1,
  },
  {
    rows: [
      '#####################',
      '#o...#.........#...o#',
      '#.#.##.###.###.##.#.#',
      '#.#...............#.#',
      '#...#.###.#.###.#...#',
      '###.#.....G.....#.###',
      '#...#.###.#.###.#...#',
      '#.#...............#.#',
      '#.#.##.###.###.##.#.#',
      '#...#....1.2....#...#',
      '#.###.###.#.###.###.#',
      '#o.................o#',
      '#####################',
    ],
    guards: 4,
    speed: 4.6,
  },
];

class MazeGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.lives = LIVES;
    this.score = [0, 0];
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.mazeLayer = new Layer(COLS * T, ROWS * T, (g) => this.paintMaze(g));
    this.gemLayer = new Layer(COLS * T, ROWS * T, (g) => this.paintGems(g));
    this.loadLevel(0);
  }

  loadLevel(i) {
    this.level = i;
    const m = MAPS[i];
    this.wall = [];
    this.gems = new Set();
    this.crystals = new Set();
    this.spawns = [];
    m.rows.forEach((row, y) =>
      row.split('').forEach((ch, x) => {
        this.wall[y * COLS + x] = ch === '#';
        if (ch === '.') this.gems.add(y * COLS + x);
        if (ch === 'o') this.crystals.add(y * COLS + x);
        if (ch === 'G') this.home = [x, y];
        if (ch === '1') this.spawns[0] = [x, y];
        if (ch === '2') this.spawns[1] = [x, y];
      })
    );
    this.total = this.gems.size;
    this.mazeLayer.invalidate();
    this.gemLayer.invalidate();
    this.resetActors();
    this.phase = i === 0 ? 'play' : 'intro';
    this.phaseT = 2.2;
    this.info();
  }

  resetActors() {
    this.players = [0, 1].map((p) => ({ p, x: this.spawns[p][0], y: this.spawns[p][1], dir: -1, want: -1, last: p === 0 ? 2 : 0, tx: 0, ty: 0, frozen: 0, inv: 2, walk: 0 }));
    const m = MAPS[this.level];
    this.guards = [];
    for (let k = 0; k < m.guards; k++) {
      this.guards.push({ k, x: this.home[0], y: this.home[1], dir: -1, tx: 0, ty: 0, state: 'chase', scared: 0, wait: 1 + k * 1.6, color: GUARD_COL[k] });
    }
    this.scareT = 0;
  }

  info() {
    for (const p of [0, 1]) this.api.info(p, `Bölüm ${this.level + 1}/${MAPS.length} · ♥ ${this.lives} · kalan ${this.gems.size}`);
  }

  open(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    return !this.wall[y * COLS + x];
  }

  onKey(p, k, down) {
    if (!down) return;
    const d = KEYDIR[k];
    if (d === undefined) return;
    const pl = this.players[p];
    pl.want = d;
    pl.last = d;
  }

  // ızgara merkezleri arasında hareket; oyuncular yarı yolda geri dönebilir
  step(e, speed, dt, decide) {
    let rem = speed * dt;
    let guard = 0;
    while (rem > 1e-6 && guard++ < 6) {
      if (e.dir < 0) {
        const nd = decide(e);
        if (nd < 0) return false;
        e.dir = nd;
        e.tx = e.x + DX[nd];
        e.ty = e.y + DY[nd];
      } else if (e.want !== undefined && e.want === OPP[e.dir]) {
        // anında geri dönüş
        e.tx -= DX[e.dir];
        e.ty -= DY[e.dir];
        e.dir = e.want;
      }
      const d = Math.abs(e.tx - e.x) + Math.abs(e.ty - e.y);
      if (d <= rem) {
        e.x = e.tx;
        e.y = e.ty;
        rem -= d;
        e.dir = -1;
        this.arrive(e);
      } else {
        e.x += DX[e.dir] * rem;
        e.y += DY[e.dir] * rem;
        rem = 0;
      }
    }
    return true;
  }

  arrive(e) {
    if (e.p === undefined) return;
    const k = e.y * COLS + e.x;
    if (this.gems.has(k)) {
      this.gems.delete(k);
      this.score[e.p] += 10;
      this.patchGem(e.x, e.y);
      this.api.sfx('eat');
      if (this.gems.size % 10 === 0) this.info();
    }
    if (this.crystals.has(k)) {
      this.crystals.delete(k);
      this.score[e.p] += 50;
      this.scareT = 7;
      for (const gd of this.guards) if (gd.state !== 'eaten') {
        gd.state = 'scared';
        if (gd.dir >= 0) {
          // yön değiştir
          gd.tx -= DX[gd.dir];
          gd.ty -= DY[gd.dir];
          gd.dir = OPP[gd.dir];
        }
      }
      this.pops.add('ROBOTLAR KORKTU!', X0 + (e.x + 0.5) * T, Y0 + e.y * T, '#7fe3ff', 30, 1.2);
      this.api.sfx('power');
      this.api.buzz(e.p, 60);
    }
  }

  decidePlayer(pl) {
    if (pl.want >= 0 && this.open(pl.x + DX[pl.want], pl.y + DY[pl.want])) return pl.want;
    // istenen yön henüz kapalıysa eski yönde devam et; dönemeç gelince döner
    if (pl.prevDir >= 0 && this.open(pl.x + DX[pl.prevDir], pl.y + DY[pl.prevDir])) return pl.prevDir;
    return -1;
  }

  decideGuard(gd) {
    const opts = [];
    for (let d = 0; d < 4; d++) {
      if (gd.prevDir >= 0 && d === OPP[gd.prevDir]) continue;
      if (this.open(gd.x + DX[d], gd.y + DY[d])) opts.push(d);
    }
    if (!opts.length) return gd.prevDir >= 0 ? OPP[gd.prevDir] : -1;
    if (gd.state === 'scared') return opts[(Math.random() * opts.length) | 0];
    let tx;
    let ty;
    if (gd.state === 'eaten') [tx, ty] = this.home;
    else {
      const targets = this.players.filter((p) => !p.frozen);
      const pool = targets.length ? targets : this.players;
      // her robotun farklı huyu var
      const t = pool.reduce((a, b) => (Math.abs(a.x - gd.x) + Math.abs(a.y - gd.y) <= Math.abs(b.x - gd.x) + Math.abs(b.y - gd.y) ? a : b));
      tx = t.x;
      ty = t.y;
      if (gd.k === 1) {
        tx += DX[t.dir >= 0 ? t.dir : t.last] * 3;
        ty += DY[t.dir >= 0 ? t.dir : t.last] * 3;
      } else if (gd.k === 2 && Math.floor(this.time / 6) % 2) {
        tx = 1;
        ty = ROWS - 2;
      } else if (gd.k === 3 && Math.random() < 0.35) return opts[(Math.random() * opts.length) | 0];
    }
    let best = opts[0];
    let bd = Infinity;
    for (const d of opts) {
      const dd = (gd.x + DX[d] - tx) ** 2 + (gd.y + DY[d] - ty) ** 2;
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.phase === 'intro' || this.phase === 'caught') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.phase === 'caught') this.resetActors();
        this.phase = 'play';
      }
      return;
    }
    if (this.phase === 'next' || this.phase === 'won' || this.phase === 'lost') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.phase === 'next') return this.loadLevel(this.level + 1);
        const pn = this.api.players;
        const detail = `${pn[0].name}: ${this.score[0]} puan · ${pn[1].name}: ${this.score[1]} puan`;
        const won = this.phase === 'won';
        this.phase = 'done';
        this.api.end(won ? { coop: true, win: true, title: 'Bütün hazine toplandı!', detail } : { coop: true, win: false, title: 'Robotlar kazandı!', detail: `${this.level + 1}. bölümde kaldınız · ${detail}` });
      }
      return;
    }

    if (this.scareT > 0) {
      this.scareT -= dt;
      if (this.scareT <= 0) for (const gd of this.guards) if (gd.state === 'scared') gd.state = 'chase';
    }
    const m = MAPS[this.level];
    // oyuncular
    for (const pl of this.players) {
      const s = this.api.input[pl.p];
      pl.held = s.up || s.down || s.left || s.right;
      if (!pl.held && Math.hypot(s.sx, s.sy) > 0.4) {
        pl.held = true;
        pl.want = Math.abs(s.sx) > Math.abs(s.sy) ? (s.sx > 0 ? 0 : 2) : s.sy > 0 ? 1 : 3;
      }
      if (pl.inv > 0) pl.inv -= dt;
      if (pl.frozen > 0) {
        pl.frozen -= dt;
        if (pl.frozen <= 0) {
          pl.frozen = 0;
          pl.inv = 1.5;
        }
        continue;
      }
      if (pl.dir >= 0) pl.prevDir = pl.dir;
      this.step(pl, 5.3, dt, (e) => this.decidePlayer(e));
      if (pl.dir >= 0) pl.walk += dt;
    }
    // robotlar
    for (const gd of this.guards) {
      if (gd.wait > 0) {
        gd.wait -= dt;
        continue;
      }
      const sp = gd.state === 'eaten' ? 9 : gd.state === 'scared' ? 2.8 : m.speed + this.level * 0.2 + (1 - this.gems.size / this.total) * 0.8;
      if (gd.dir >= 0) gd.prevDir = gd.dir;
      this.step(gd, sp, dt, (e) => this.decideGuard(e));
      if (gd.state === 'eaten' && gd.x === this.home[0] && gd.y === this.home[1]) {
        gd.state = 'chase';
        gd.wait = 1;
      }
    }
    // çarpışmalar
    for (const pl of this.players) {
      for (const gd of this.guards) {
        if (Math.abs(pl.x - gd.x) + Math.abs(pl.y - gd.y) > 0.7) continue;
        if (gd.state === 'scared' && !pl.frozen) {
          gd.state = 'eaten';
          this.score[pl.p] += 200;
          this.pops.add('+200', X0 + (gd.x + 0.5) * T, Y0 + gd.y * T, PCOL[pl.p], 28, 0.9);
          this.parts.burst(X0 + (gd.x + 0.5) * T, Y0 + (gd.y + 0.5) * T, 14, [gd.color, '#fff'], { speed: 240, size: 6, life: 0.5, gravity: 0 });
          this.api.sfx('pickup');
          this.api.buzz(pl.p, 50);
        } else if (gd.state === 'chase' && !pl.frozen && pl.inv <= 0) {
          pl.frozen = FREEZE;
          pl.dir = -1;
          pl.x = Math.round(pl.x);
          pl.y = Math.round(pl.y);
          this.api.sfx('hit');
          this.api.buzz(pl.p, 300);
          this.shake.add(5, 0.2);
          this.pops.add('DONDU!', X0 + (pl.x + 0.5) * T, Y0 + pl.y * T, '#7fe3ff', 30, 1);
        }
      }
    }
    // arkadaşı çözme
    const [a, b] = this.players;
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 0.8 && (a.frozen > 0) !== (b.frozen > 0)) {
      const f = a.frozen > 0 ? a : b;
      f.frozen = 0;
      f.inv = 1.5;
      this.pops.add('KURTARILDI!', X0 + (f.x + 0.5) * T, Y0 + f.y * T, '#46e38a', 30, 1);
      this.api.sfx('join');
      this.api.buzz(0, 40);
      this.api.buzz(1, 40);
    }
    if (a.frozen > 0 && b.frozen > 0) {
      this.lives--;
      this.info();
      this.api.sfx('lose');
      this.shake.add(10, 0.4);
      if (this.lives <= 0) {
        this.phase = 'lost';
        this.phaseT = 2.6;
      } else {
        this.phase = 'caught';
        this.phaseT = 2.2;
      }
      return;
    }
    if (this.gems.size === 0) {
      this.api.sfx('win');
      if (this.level + 1 >= MAPS.length) {
        this.phase = 'won';
        this.phaseT = 2.6;
      } else {
        this.phase = 'next';
        this.phaseT = 2.4;
      }
      this.info();
    }
  }

  demo() {
    this.players[0].x = 6;
    this.players[0].y = 9;
    this.players[1].frozen = 3;
    this.guards[0].x = 8;
    this.guards[0].y = 9;
    this.guards[1].x = 13;
    this.guards[1].y = 3;
    this.guards[1].state = 'scared';
    this.scareT = 5;
    for (let x = 2; x < 6; x++) this.gems.delete(9 * COLS + x);
    this.gemLayer.invalidate();
  }

  // ---------------------------------------------------------------- çizim
  paintMaze(g) {
    g.fillStyle = '#0a0a22';
    g.fillRect(0, 0, COLS * T, ROWS * T);
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!this.wall[y * COLS + x]) continue;
        g.fillStyle = '#1b1a4a';
        g.fillRect(x * T, y * T, T, T);
      }
    }
    // açık alana bakan kenarlara neon çizgi
    g.save();
    g.shadowColor = '#5b8cff';
    g.shadowBlur = 10;
    g.strokeStyle = '#6f9bff';
    g.lineWidth = 3;
    g.lineCap = 'round';
    g.beginPath();
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!this.wall[y * COLS + x]) continue;
        const px = x * T;
        const py = y * T;
        const inset = 4;
        if (this.open(x, y - 1)) {
          g.moveTo(px + inset, py + inset);
          g.lineTo(px + T - inset, py + inset);
        }
        if (this.open(x, y + 1)) {
          g.moveTo(px + inset, py + T - inset);
          g.lineTo(px + T - inset, py + T - inset);
        }
        if (this.open(x - 1, y)) {
          g.moveTo(px + inset, py + inset);
          g.lineTo(px + inset, py + T - inset);
        }
        if (this.open(x + 1, y)) {
          g.moveTo(px + T - inset, py + inset);
          g.lineTo(px + T - inset, py + T - inset);
        }
      }
    }
    g.stroke();
    g.restore();
  }

  gemSprite() {
    return sprite('mz-gem', 20, 20, (g) => {
      g.fillStyle = '#7fe3ff';
      g.beginPath();
      g.moveTo(10, 2);
      g.lineTo(17, 10);
      g.lineTo(10, 18);
      g.lineTo(3, 10);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)';
      g.beginPath();
      g.moveTo(10, 4);
      g.lineTo(13, 9);
      g.lineTo(10, 10);
      g.closePath();
      g.fill();
    });
  }

  paintGems(g) {
    const spr = this.gemSprite();
    for (const k of this.gems) {
      const x = k % COLS;
      const y = Math.floor(k / COLS);
      g.drawImage(spr, x * T + T / 2 - 9, y * T + T / 2 - 9, 18, 18);
    }
  }

  patchGem(x, y) {
    if (this.gemLayer.dirty || !this.gemLayer.cv) return;
    const g = this.gemLayer.ctx();
    g.clearRect(x * T + 4, y * T + 4, T - 8, T - 8);
  }

  robotSprite(color, mode) {
    return sprite(`mz-bot|${color}|${mode}`, 46, 50, (g) => {
      const body = mode === 'scared' ? '#3d5bff' : mode === 'flash' ? '#f2f2ff' : color;
      if (mode !== 'eaten') {
        // anten
        g.strokeStyle = shade(body, -0.4);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(23, 10);
        g.lineTo(23, 3);
        g.stroke();
        g.fillStyle = mode === 'scared' ? '#fff' : '#ffd23f';
        g.beginPath();
        g.arc(23, 4, 4, 0, Math.PI * 2);
        g.fill();
        const grad = g.createLinearGradient(0, 8, 0, 46);
        grad.addColorStop(0, shade(body, 0.25));
        grad.addColorStop(1, shade(body, -0.3));
        rr(g, 4, 9, 38, 34, 10);
        g.fillStyle = grad;
        g.fill();
        g.fillStyle = shade(body, -0.45);
        g.fillRect(8, 41, 8, 7);
        g.fillRect(30, 41, 8, 7);
      }
      // gözler
      g.fillStyle = '#fff';
      rr(g, 9, 17, 12, 12, 4);
      g.fill();
      rr(g, 25, 17, 12, 12, 4);
      g.fill();
      g.fillStyle = mode === 'scared' ? '#3d5bff' : '#141225';
      g.fillRect(13, 21, 5, 6);
      g.fillRect(29, 21, 5, 6);
      if (mode === 'scared') {
        g.strokeStyle = '#fff';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(10, 36);
        for (let i = 1; i <= 6; i++) g.lineTo(10 + i * 4.3, 36 + (i % 2 ? -3 : 0));
        g.stroke();
      }
    });
  }

  draw(g) {
    g.fillStyle = '#05051a';
    g.fillRect(0, 0, W, H);
    g.save();
    this.shake.apply(g);
    this.mazeLayer.draw(g, X0, Y0);
    this.gemLayer.draw(g, X0, Y0);
    for (const k of this.crystals) {
      const x = X0 + ((k % COLS) + 0.5) * T;
      const y = Y0 + (Math.floor(k / COLS) + 0.5) * T;
      const s = 1 + Math.sin(this.time * 6) * 0.15;
      g.drawImage(glow('#b45cff', 30, 0.7), x - 30 * s, y - 30 * s, 60 * s, 60 * s);
      g.fillStyle = '#e2c8ff';
      g.beginPath();
      g.moveTo(x, y - 13 * s);
      g.lineTo(x + 10 * s, y);
      g.lineTo(x, y + 13 * s);
      g.lineTo(x - 10 * s, y);
      g.closePath();
      g.fill();
    }
    for (const gd of this.guards) {
      let mode = gd.state === 'eaten' ? 'eaten' : gd.state === 'scared' ? (this.scareT < 2 && Math.floor(this.time * 8) % 2 ? 'flash' : 'scared') : 'normal';
      const spr = this.robotSprite(gd.color, mode);
      const bob = Math.sin(this.time * 10 + gd.k) * 2;
      g.drawImage(spr, X0 + (gd.x + 0.5) * T - 23, Y0 + (gd.y + 0.5) * T - 27 + bob, 46, 50);
    }
    for (const pl of this.players) {
      const cx = X0 + (pl.x + 0.5) * T;
      const cy = Y0 + (pl.y + 0.5) * T;
      const dir = pl.dir >= 0 ? pl.dir : pl.last;
      const frame = pl.dir >= 0 ? Math.floor(pl.walk * 12) % 4 : 0;
      const spr = guySprite(PCOL[pl.p], FACE[dir] ?? 0, frame, 44);
      if (pl.inv > 0 && Math.floor(this.time * 12) % 2) g.globalAlpha = 0.45;
      g.drawImage(spr, cx - spr.lw / 2, cy - spr.lh * 0.557, spr.lw, spr.lh);
      g.globalAlpha = 1;
      if (pl.frozen > 0) {
        g.fillStyle = 'rgba(160,230,255,.45)';
        rr(g, cx - 24, cy - 28, 48, 52, 10);
        g.fill();
        g.strokeStyle = '#dff6ff';
        g.lineWidth = 2;
        g.stroke();
        g.strokeStyle = '#7fe3ff';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(cx, cy, 30, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (pl.frozen / FREEZE));
        g.stroke();
      }
    }
    this.parts.draw(g);
    g.restore();
    // üst bilgi
    text(g, `${this.api.players[0].name}  ${this.score[0]}`, X0, 36, { size: 28, color: PCOL[0], weight: 800, align: 'left' });
    text(g, `${this.score[1]}  ${this.api.players[1].name}`, X0 + COLS * T, 36, { size: 28, color: PCOL[1], weight: 800, align: 'right' });
    text(g, `BÖLÜM ${this.level + 1}  ·  KALAN ${this.gems.size}`, W / 2 - 50, 36, { size: 24, color: '#a7c6ff', weight: 800 });
    text(g, '♥'.repeat(Math.max(0, this.lives)), W / 2 + 130, 36, { size: 26, color: '#ff4f7b', weight: 800 });
    this.pops.draw(g);
    if (this.phase === 'intro') banner(g, `BÖLÜM ${this.level + 1}`, 'Birlikte toplayın, birbirinizi kurtarın!', '#7fe3ff', 2.2 - this.phaseT);
    if (this.phase === 'caught') banner(g, 'İKİNİZ DE DONDUNUZ!', `Kalan can: ${this.lives}`, '#ff6b7a', 2.2 - this.phaseT);
    if (this.phase === 'next') banner(g, 'BÖLÜM TAMAM!', 'Sıradaki labirent daha zor', '#46e38a', 2.4 - this.phaseT);
    if (this.phase === 'won') banner(g, 'HAZİNE SİZİN!', 'Bütün mücevherler toplandı', '#46e38a', 2.6 - this.phaseT);
    if (this.phase === 'lost') banner(g, 'YAKALANDINIZ', 'Bir dahaki sefere…', '#ff5a5a', 2.6 - this.phaseT);
  }
}

export default {
  id: 'maze',
  name: 'Hazine Labirenti',
  icon: '💎',
  tag: 'Birlikte kaçış',
  mode: 'coop',
  cat: 'takim',
  color: '#5b8cff',
  desc: 'Labirentteki bütün mücevherleri birlikte toplayın! Bekçi robotlar yakalarsa donarsın — arkadaşın sana dokunup kurtarabilir. İkiniz birden donarsanız can gider.',
  howto: ['Yön tuşları: yürü (dönemeçten önce basabilirsin)', 'Robota yakalanınca 6 saniye donarsın', 'Arkadaşına dokunarak onu çöz', 'Mor kristal: robotlar kaçar, onlara dokunup kovala', '2 bölüm · 3 ortak can'],
  keys: '1. oyuncu WASD · 2. oyuncu Oklar',
  controller: { layout: 'dpad', dirs: 4, a: null, b: null },
  create: (api) => new MazeGame(api),
};
