// TANK TABURU — iki oyuncu birlikte üssü korur, düşman tank dalgalarını durdurur.
// 3 bölüm. Üs vurulursa ya da iki oyuncunun da canı biterse oyun biter.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, rand, pick } from '../host/gfx.js';

const N = 26; // hücre sayısı (13x13 karo, her karo 2x2 hücre)
const CS = 26; // hücre boyutu px
const MAP = N * CS; // 676
const X0 = (W - MAP) / 2;
const Y0 = 22;
const TS = CS * 2; // tank boyutu
const EMPTY = 0, BRICK = 1, STEEL = 2, WATER = 3, BUSH = 4, BASE = 6;
const DV = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // yukarı, sağ, aşağı, sol
const ENEMY_PER_STAGE = 18;
const MAX_ON_FIELD = 5;

const ETYPES = {
  basic: { speed: 80, bullet: 340, hp: 1, score: 100, color: '#b8bdd6' },
  fast: { speed: 165, bullet: 380, hp: 1, score: 200, color: '#ffd23f' },
  power: { speed: 105, bullet: 560, hp: 1, score: 300, color: '#c08bff' },
  armor: { speed: 80, bullet: 400, hp: 4, score: 400, color: '#5fd38d' },
};

const STAGES = [
  {
    map: [
      '.............',
      '.#.#.#.#.#.#.',
      '.#.#.#.#.#.#.',
      '.#.#.#@#.#.#.',
      '.#.#.#.#.#.#.',
      '.....#.#.....',
      '@.##.....##.@',
      '.....#.#.....',
      '.#.#.###.#.#.',
      '.#.#.#.#.#.#.',
      '.#.#.....#.#.',
      '.#.#.....#.#.',
      '.............',
    ],
    enemies: { basic: 11, fast: 4, power: 3, armor: 0 },
  },
  {
    map: [
      '....%...%....',
      '.##.%.#.%.##.',
      '.##...#...##.',
      '....~~~~~....',
      '%%.........%%',
      '#..@.###.@..#',
      '#..@.#%#.@..#',
      '%%.........%%',
      '....~~.~~....',
      '.#.#.....#.#.',
      '.#.#.#.#.#.#.',
      '.#..........#',
      '.#.........#.',
    ],
    enemies: { basic: 7, fast: 5, power: 4, armor: 2 },
  },
  {
    map: [
      '..@.......@..',
      '..@.#.#.#.@..',
      '....#.#.#....',
      '##....@....##',
      '..#.#####.#..',
      '..#.%%%%%.#..',
      '@...%%%%%...@',
      '..#.%%%%%.#..',
      '..#.#####.#..',
      '##....~....##',
      '...#.....#...',
      '.@.#.....#.@.',
      '.@.........@.',
    ],
    enemies: { basic: 4, fast: 5, power: 5, armor: 4 },
  },
];

const SHELL = [[11, 23], [12, 23], [13, 23], [14, 23], [11, 24], [11, 25], [14, 24], [14, 25]];
const PSPAWN = [[8 * CS, 24 * CS], [16 * CS, 24 * CS]];
const ESPAWN = [[0, 0], [12 * CS, 0], [24 * CS, 0]];
const POWERS = ['star', 'shield', 'fort', 'bomb', 'clock', 'life'];
const POWER_NAME = { star: 'GÜÇ!', shield: 'KALKAN!', fort: 'KALE!', bomb: 'BOMBA!', clock: 'ZAMAN DURDU!', life: '+1 CAN' };
const POWER_COL = { star: '#ffd23f', shield: '#2fc7ff', fort: '#b8bdd6', bomb: '#ff6a3d', clock: '#c08bff', life: '#46e38a' };

const overlap = (a, b) => a.x < b.x + TS && a.x + TS > b.x && a.y < b.y + TS && a.y + TS > b.y;

// ------------------------------------------------------------------ çizim
function drawTank(g, cx, cy, dir, color, s = TS, tread = 0, opts = {}) {
  g.save();
  g.translate(cx, cy);
  g.rotate((dir * Math.PI) / 2);
  const k = s / TS;
  g.scale(k, k);
  if (opts.alpha !== undefined) g.globalAlpha = opts.alpha;
  // paletler
  for (const sx of [-1, 1]) {
    g.fillStyle = '#26243a';
    rr(g, sx * 17 - 7, -24, 14, 48, 4);
    g.fill();
    g.fillStyle = '#4a4766';
    for (let i = 0; i < 6; i++) {
      const y = -24 + ((i * 8 + tread) % 48);
      g.fillRect(sx * 17 - 6, y, 12, 3);
    }
  }
  // gövde
  const grad = g.createLinearGradient(-14, -18, 14, 18);
  grad.addColorStop(0, shade(color, 0.25));
  grad.addColorStop(1, shade(color, -0.35));
  rr(g, -13, -18, 26, 36, 6);
  g.fillStyle = grad;
  g.fill();
  g.strokeStyle = shade(color, -0.6);
  g.lineWidth = 2;
  g.stroke();
  // namlu
  g.fillStyle = shade(color, -0.45);
  rr(g, -3.5, -27, 7, 22, 2);
  g.fill();
  // kule
  g.beginPath();
  g.arc(0, 2, 10, 0, Math.PI * 2);
  g.fillStyle = shade(color, 0.1);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.beginPath();
  g.arc(-3, -1, 3.5, 0, Math.PI * 2);
  g.fill();
  if (opts.star) {
    for (let i = 0; i < opts.star; i++) {
      g.fillStyle = '#ffd23f';
      g.fillRect(-9 + i * 7, 12, 4, 4);
    }
  }
  g.restore();
}

function drawStar(g, x, y, r, color) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  g.closePath();
  g.fillStyle = color;
  g.fill();
}

function drawPowerIcon(g, type, x, y, s) {
  const c = POWER_COL[type];
  rr(g, x - s / 2, y - s / 2, s, s, s * 0.2);
  g.fillStyle = shade(c, -0.55);
  g.fill();
  g.strokeStyle = c;
  g.lineWidth = 3;
  g.stroke();
  g.save();
  g.translate(x, y);
  const r = s * 0.32;
  if (type === 'star') drawStar(g, 0, 0, r, c);
  else if (type === 'shield') {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, -r);
    g.lineTo(r * 0.9, -r * 0.6);
    g.quadraticCurveTo(r * 0.8, r * 0.6, 0, r);
    g.quadraticCurveTo(-r * 0.8, r * 0.6, -r * 0.9, -r * 0.6);
    g.closePath();
    g.fill();
  } else if (type === 'fort') {
    g.fillStyle = c;
    g.fillRect(-r, -r * 0.3, r * 2, r * 1.2);
    for (let i = 0; i < 3; i++) g.fillRect(-r + i * r * 0.8, -r * 0.8, r * 0.4, r * 0.6);
  } else if (type === 'bomb') {
    g.fillStyle = c;
    g.beginPath();
    g.arc(0, r * 0.15, r * 0.8, 0, Math.PI * 2);
    g.fill();
    g.fillRect(-r * 0.2, -r, r * 0.4, r * 0.4);
  } else if (type === 'clock') {
    g.strokeStyle = c;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.moveTo(0, 0);
    g.lineTo(0, -r * 0.7);
    g.moveTo(0, 0);
    g.lineTo(r * 0.5, 0);
    g.stroke();
  } else if (type === 'life') {
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(0, r);
    g.bezierCurveTo(-r * 1.4, -r * 0.2, -r * 0.6, -r * 1.2, 0, -r * 0.4);
    g.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.4, -r * 0.2, 0, r);
    g.fill();
  }
  g.restore();
}

function drawCore(g, x, y, alive, t) {
  // üs: parlayan kristal
  g.save();
  g.translate(x, y);
  g.fillStyle = '#3a3656';
  rr(g, -24, 12, 48, 12, 4);
  g.fill();
  if (alive) {
    g.shadowColor = '#2fc7ff';
    g.shadowBlur = 16 + Math.sin(t * 4) * 6;
    g.fillStyle = '#7fe3ff';
    g.beginPath();
    g.moveTo(0, -24);
    g.lineTo(16, -2);
    g.lineTo(0, 14);
    g.lineTo(-16, -2);
    g.closePath();
    g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,255,255,.7)';
    g.beginPath();
    g.moveTo(0, -20);
    g.lineTo(6, -4);
    g.lineTo(0, 2);
    g.closePath();
    g.fill();
  } else {
    g.fillStyle = '#4b4766';
    for (const [dx, dy, r] of [[-10, 6, 7], [6, 8, 6], [0, 0, 5], [12, 2, 4]]) {
      g.beginPath();
      g.moveTo(dx, dy - r);
      g.lineTo(dx + r, dy + r);
      g.lineTo(dx - r, dy + r);
      g.fill();
    }
  }
  g.restore();
}

// ------------------------------------------------------------------ oyun
class TanksGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.stage = 0;
    this.players = [0, 1].map((p) => ({
      p, lives: 3, level: 0, kills: 0, score: 0, alive: false, x: 0, y: 0, dir: 0, sub: 0,
      shield: 0, frozen: 0, spawnT: 0, respawnT: 0, cool: 0, tread: 0, last: 'v', out: false,
    }));
    this.loadStage(0);
  }

  loadStage(i) {
    this.stage = i;
    const st = STAGES[i];
    this.cells = new Uint8Array(N * N);
    st.map.forEach((row, ty) =>
      row.split('').forEach((ch, tx) => {
        const v = { '#': BRICK, '@': STEEL, '~': WATER, '%': BUSH }[ch] || EMPTY;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.cells[(ty * 2 + dy) * N + tx * 2 + dx] = v;
      })
    );
    for (const [x, y] of SHELL) this.set(x, y, BRICK);
    for (let y = 24; y < 26; y++) for (let x = 12; x < 14; x++) this.set(x, y, BASE);
    this.baseAlive = true;
    this.baseHp = 3;
    this.baseFlash = 0;
    this.fortT = 0;
    const pool = [];
    for (const [t, n] of Object.entries(st.enemies)) for (let k = 0; k < n; k++) pool.push(t);
    // zırhlılar sona doğru
    pool.sort((a, b) => (a === 'armor') - (b === 'armor') || Math.random() - 0.5);
    this.queue = pool;
    this.enemies = [];
    this.bullets = [];
    this.powerups = [];
    this.spawned = 0;
    this.killed = 0;
    this.spawnT = 1;
    this.spawnIdx = 1;
    this.clockT = 0;
    this.phase = i === 0 ? 'play' : 'intro';
    this.phaseT = 2.5;
    for (const pl of this.players) {
      pl.bullets = 0;
      if (pl.lives > 0 || pl.alive) this.spawnPlayer(pl);
    }
    this.sendInfo();
  }

  get(x, y) {
    if (x < 0 || y < 0 || x >= N || y >= N) return STEEL;
    return this.cells[y * N + x];
  }
  set(x, y, v) {
    this.cells[y * N + x] = v;
  }

  sendInfo() {
    for (const pl of this.players) this.api.info(pl.p, `Bölüm ${this.stage + 1} · ♥ ${pl.lives} · ★ ${pl.level}`);
  }

  spawnPlayer(pl) {
    pl.alive = true;
    pl.out = false;
    [pl.x, pl.y] = PSPAWN[pl.p];
    pl.dir = 0;
    pl.sub = 0;
    pl.spawnT = 0.8;
    pl.shield = 3.5;
    pl.frozen = 0;
  }

  // ---------------------------------------------------------------- çarpışma
  rectBlocked(x, y) {
    if (x < 0 || y < 0 || x + TS > MAP || y + TS > MAP) return true;
    const x0 = Math.floor(x / CS);
    const x1 = Math.floor((x + TS - 1) / CS);
    const y0 = Math.floor(y / CS);
    const y1 = Math.floor((y + TS - 1) / CS);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const v = this.get(cx, cy);
        if (v === BRICK || v === STEEL || v === WATER || v === BASE) return true;
      }
    }
    return false;
  }

  allTanks() {
    const list = [];
    for (const pl of this.players) if (pl.alive) list.push(pl);
    for (const e of this.enemies) if (e.spawnT <= 0) list.push(e);
    return list;
  }

  tankBlocked(t, nx, ny) {
    if (this.rectBlocked(nx, ny)) return true;
    const n = { x: nx, y: ny };
    for (const o of this.allTanks()) {
      if (o === t) continue;
      if (overlap(n, o) && !overlap(t, o)) return true;
    }
    // doğmakta olan düşmanların yeri de dolu sayılır
    for (const e of this.enemies) if (e.spawnT > 0 && overlap(n, e) && !overlap(t, e)) return true;
    return false;
  }

  moveTank(t, dist) {
    const [dx, dy] = DV[t.dir];
    t.sub += dist;
    let moved = false;
    while (t.sub >= 1) {
      t.sub -= 1;
      if (this.tankBlocked(t, t.x + dx, t.y + dy)) {
        t.sub = 0;
        return moved ? 'partial' : false;
      }
      t.x += dx;
      t.y += dy;
      moved = true;
    }
    if (moved) t.tread = (t.tread + dist * 0.5) % 48;
    return true;
  }

  turn(t, dir) {
    if (t.dir === dir) return;
    const perp = (t.dir % 2) !== (dir % 2);
    t.dir = dir;
    if (!perp) return;
    // döner dönmez ızgaraya oturt (koridorlara girmeyi kolaylaştırır)
    const axis = dir % 2 === 0 ? 'x' : 'y';
    const v = t[axis];
    const cands = [Math.round(v / CS) * CS, Math.floor(v / CS) * CS, Math.ceil(v / CS) * CS];
    for (const c of cands) {
      const nx = axis === 'x' ? c : t.x;
      const ny = axis === 'y' ? c : t.y;
      if (!this.tankBlocked(t, nx, ny)) {
        t[axis] = c;
        return;
      }
    }
  }

  fire(t, isPlayer) {
    const [dx, dy] = DV[t.dir];
    const cx = t.x + TS / 2 + dx * 24;
    const cy = t.y + TS / 2 + dy * 24;
    let speed;
    let power = false;
    if (isPlayer) {
      speed = t.level >= 1 ? 620 : 420;
      power = t.level >= 3;
    } else speed = ETYPES[t.type].bullet;
    this.bullets.push({ x: cx, y: cy, dir: t.dir, speed, power, owner: t, player: isPlayer });
    if (isPlayer) {
      t.bullets++;
      this.api.sfx('shoot');
    }
  }

  // ---------------------------------------------------------------- mermiler
  updateBullets(dt) {
    const dead = new Set();
    for (const b of this.bullets) {
      if (dead.has(b)) continue;
      const [dx, dy] = DV[b.dir];
      let dist = b.speed * dt;
      while (dist > 0 && !dead.has(b)) {
        const st = Math.min(4, dist);
        dist -= st;
        b.x += dx * st;
        b.y += dy * st;
        if (b.x < 0 || b.y < 0 || b.x > MAP || b.y > MAP) {
          dead.add(b);
          this.spark(b.x, b.y);
          this.api.sfx('steel');
          break;
        }
        if (this.bulletHitsMap(b)) {
          dead.add(b);
          break;
        }
        // tanklar
        const br = { x: b.x - 4, y: b.y - 4 };
        const hitTank = (t) => br.x < t.x + TS && br.x + 8 > t.x && br.y < t.y + TS && br.y + 8 > t.y;
        if (b.player) {
          for (const e of this.enemies) {
            if (e.spawnT > 0 || e.dead || !hitTank(e)) continue;
            dead.add(b);
            this.hitEnemy(e, b.owner);
            break;
          }
          if (!dead.has(b)) {
            for (const pl of this.players) {
              if (pl === b.owner || !pl.alive || pl.spawnT > 0 || !hitTank(pl)) continue;
              dead.add(b);
              if (pl.shield <= 0) {
                pl.frozen = 2.5;
                this.api.buzz(pl.p, 150);
                this.pops.add('DONDUN!', X0 + pl.x + TS / 2, Y0 + pl.y, '#7fe3ff', 26, 0.8);
              }
              this.api.sfx('hit');
              break;
            }
          }
        } else {
          for (const pl of this.players) {
            if (!pl.alive || pl.spawnT > 0 || !hitTank(pl)) continue;
            dead.add(b);
            if (pl.shield <= 0) this.killPlayer(pl);
            else this.api.sfx('steel');
            break;
          }
        }
        if (dead.has(b)) break;
        // mermi-mermi
        for (const o of this.bullets) {
          if (o === b || dead.has(o) || o.player === b.player) continue;
          if (Math.abs(o.x - b.x) < 8 && Math.abs(o.y - b.y) < 8) {
            dead.add(b);
            dead.add(o);
            this.spark(b.x, b.y);
            break;
          }
        }
      }
    }
    if (dead.size) {
      for (const b of dead) if (b.player) b.owner.bullets--;
      this.bullets = this.bullets.filter((b) => !dead.has(b));
    }
  }

  bulletHitsMap(b) {
    const [dx, dy] = DV[b.dir];
    const fx = b.x + dx * 3;
    const fy = b.y + dy * 3;
    const cells = [];
    if (dx) {
      const cx = Math.floor(fx / CS);
      for (let cy = Math.floor((b.y - 12) / CS); cy <= Math.floor((b.y + 12) / CS); cy++) cells.push([cx, cy]);
    } else {
      const cy = Math.floor(fy / CS);
      for (let cx = Math.floor((b.x - 12) / CS); cx <= Math.floor((b.x + 12) / CS); cx++) cells.push([cx, cy]);
    }
    let hit = false;
    let steel = false;
    let base = false;
    for (const [cx, cy] of cells) {
      const v = this.get(cx, cy);
      if (v === BRICK || v === STEEL || v === BASE) {
        hit = true;
        if (v === STEEL) steel = true;
        if (v === BASE) base = true;
      }
    }
    if (!hit) return false;
    if (base) {
      // oyuncular kendi üslerini yanlışlıkla vuramaz
      if (!b.player) this.destroyBase();
      else this.spark(b.x, b.y);
      return true;
    }
    for (const [cx, cy] of cells) {
      const v = this.get(cx, cy);
      if (v === BRICK || (v === STEEL && b.power)) {
        this.set(cx, cy, EMPTY);
        this.parts.burst(X0 + (cx + 0.5) * CS, Y0 + (cy + 0.5) * CS, 6, v === BRICK ? ['#b5532f', '#8a3a1e', '#d9774f'] : ['#9aa0c0', '#d6dbf0'], { speed: 160, size: 6, life: 0.5 });
      }
    }
    if (steel && !b.power) this.api.sfx('steel');
    else this.api.sfx('hit');
    this.spark(b.x, b.y);
    return true;
  }

  spark(x, y) {
    this.parts.burst(X0 + x, Y0 + y, 5, ['#fff3b0', '#ffd23f'], { speed: 140, size: 4, life: 0.25, gravity: 0 });
  }

  explosion(x, y, big = true) {
    this.parts.burst(X0 + x, Y0 + y, big ? 26 : 12, ['#ffd23f', '#ff7a3d', '#ff4f2d', '#fff3b0', '#555'], { speed: big ? 320 : 200, size: big ? 10 : 6, life: 0.7, gravity: 0 });
    this.shake.add(big ? 7 : 3, 0.25);
    this.api.sfx(big ? 'boom' : 'smallboom');
  }

  hitEnemy(e, by) {
    if (e.bonus) {
      e.bonus = false;
      this.dropPower();
    }
    e.hp--;
    if (e.hp > 0) {
      this.api.sfx('steel');
      return;
    }
    e.dead = true;
    this.killed++;
    const sc = ETYPES[e.type].score;
    if (by) {
      by.kills++;
      by.score += sc;
    }
    this.pops.add(String(sc), X0 + e.x + TS / 2, Y0 + e.y + TS / 2, by ? PCOL[by.p] : '#fff', 24, 0.8);
    this.explosion(e.x + TS / 2, e.y + TS / 2);
  }

  killPlayer(pl) {
    pl.alive = false;
    pl.lives--;
    pl.level = 0;
    pl.respawnT = 1.6;
    this.explosion(pl.x + TS / 2, pl.y + TS / 2);
    this.api.buzz(pl.p, 400);
    this.api.sfx('die');
    if (pl.lives <= 0) {
      pl.out = true;
      this.pops.add(`${this.api.players[pl.p].name} DÜŞTÜ`, W / 2, H / 2, PCOL[pl.p], 40, 1.6);
    }
    this.sendInfo();
  }

  destroyBase() {
    if (!this.baseAlive) return;
    this.baseHp--;
    this.baseFlash = 0.6;
    if (this.baseHp > 0) {
      this.explosion(13 * CS, 25 * CS, false);
      this.pops.add(`ÜS VURULDU! (${this.baseHp} can kaldı)`, X0 + 13 * CS, Y0 + 22 * CS, '#ff6b7a', 30, 1.4);
      this.api.buzz(0, 200);
      this.api.buzz(1, 200);
      this.api.sfx('garbage');
      return;
    }
    this.baseAlive = false;
    this.explosion(13 * CS, 25 * CS);
    this.shake.add(14, 0.6);
    this.api.buzz(0, 500);
    this.api.buzz(1, 500);
  }

  dropPower() {
    // boş bir alana güç bırak
    for (let k = 0; k < 30; k++) {
      const x = Math.floor(rand(1, 11)) * TS;
      const y = Math.floor(rand(1, 10)) * TS;
      if (!this.rectBlocked(x, y)) {
        this.powerups = [{ type: pick(POWERS), x, y, t: 16 }];
        this.api.sfx('pickup');
        return;
      }
    }
  }

  applyPower(pl, pw) {
    pl.score += 500;
    this.pops.add(POWER_NAME[pw.type], X0 + pw.x + TS / 2, Y0 + pw.y, POWER_COL[pw.type], 30, 1.2);
    this.api.sfx('power');
    this.api.buzz(pl.p, 60);
    switch (pw.type) {
      case 'star': pl.level = Math.min(3, pl.level + 1); break;
      case 'shield': pl.shield = 10; break;
      case 'life': pl.lives++; break;
      case 'clock': this.clockT = 9; break;
      case 'fort':
        this.fortT = 16;
        this.baseHp = Math.min(3, this.baseHp + 1);
        for (const [x, y] of SHELL) this.set(x, y, STEEL);
        break;
      case 'bomb':
        for (const e of this.enemies) if (!e.dead && e.spawnT <= 0) {
          e.hp = 1;
          e.bonus = false;
          this.hitEnemy(e, pl);
        }
        break;
    }
    this.sendInfo();
  }

  // ---------------------------------------------------------------- düşman
  spawnEnemy() {
    if (!this.queue.length) return;
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (alive >= MAX_ON_FIELD - (this.stage === 0 ? 1 : 0)) return;
    for (let k = 0; k < 3; k++) {
      const [x, y] = ESPAWN[(this.spawnIdx + k) % 3];
      const probe = { x, y };
      if (this.allTanks().some((t) => overlap(probe, t)) || this.enemies.some((e) => !e.dead && e.spawnT > 0 && overlap(probe, e))) continue;
      this.spawnIdx = (this.spawnIdx + k + 1) % 3;
      const type = this.queue.shift();
      this.spawned++;
      this.enemies.push({
        type, x, y, dir: 2, sub: 0, hp: ETYPES[type].hp, speed: ETYPES[type].speed,
        bonus: this.spawned % 6 === 3, spawnT: 0.9, turnT: rand(0.5, 2), fireT: rand(0.6, 1.6), tread: 0, dead: false,
      });
      return;
    }
  }

  pickDir(e) {
    const r = Math.random();
    const ecx = e.x + TS / 2;
    // alt yarıya inince üsse yönelme olasılığı biraz artar
    const deep = e.y > MAP * 0.55 ? 0.08 : 0;
    if (r < 0.28) return 2;
    if (r < 0.36 + deep) return ecx < MAP / 2 - 10 ? 1 : ecx > MAP / 2 + 10 ? 3 : 2;
    if (r < 0.56) {
      const targets = this.players.filter((p) => p.alive);
      if (targets.length) {
        const t = pick(targets);
        const dx = t.x - e.x;
        const dy = t.y - e.y;
        return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
      }
    }
    return Math.floor(Math.random() * 4);
  }

  updateEnemy(e, dt) {
    if (e.spawnT > 0) {
      e.spawnT -= dt;
      return;
    }
    if (this.clockT > 0) return;
    const res = this.moveTank(e, e.speed * dt);
    e.turnT -= dt;
    if (res !== true) {
      if (Math.random() < 0.06) this.turn(e, this.pickDir(e));
      e.fireT -= dt * 2;
    } else if (e.turnT <= 0) {
      this.turn(e, this.pickDir(e));
      e.turnT = rand(1, 3);
    }
    e.fireT -= dt;
    if (e.fireT <= 0) {
      e.fireT = rand(0.9, 2.2);
      if (!this.bullets.some((b) => b.owner === e)) this.fire(e, false);
    }
  }

  // ---------------------------------------------------------------- oyuncu
  onKey(p, k, down) {
    const pl = this.players[p];
    if (down && (k === 'left' || k === 'right')) pl.last = 'h';
    if (down && (k === 'up' || k === 'down')) pl.last = 'v';
  }

  updatePlayer(pl, dt) {
    if (!pl.alive) {
      if (pl.lives > 0) {
        pl.respawnT -= dt;
        if (pl.respawnT <= 0) this.spawnPlayer(pl);
      }
      return;
    }
    if (pl.spawnT > 0) {
      pl.spawnT -= dt;
      return;
    }
    pl.shield = Math.max(0, pl.shield - dt);
    pl.cool -= dt;
    if (pl.frozen > 0) {
      pl.frozen -= dt;
      return;
    }
    const s = this.api.input[pl.p];
    const h = (s.right ? 1 : 0) - (s.left ? 1 : 0);
    const v = (s.down ? 1 : 0) - (s.up ? 1 : 0);
    let dir = -1;
    if (h && v) dir = pl.last === 'h' ? (h > 0 ? 1 : 3) : v > 0 ? 2 : 0;
    else if (h) dir = h > 0 ? 1 : 3;
    else if (v) dir = v > 0 ? 2 : 0;
    if (dir >= 0) {
      this.turn(pl, dir);
      this.moveTank(pl, 150 * dt);
    }
    const maxB = pl.level >= 2 ? 2 : 1;
    if ((s.a || s.b) && pl.cool <= 0 && pl.bullets < maxB) {
      this.fire(pl, true);
      pl.cool = 0.18;
    }
    for (const pw of this.powerups) {
      if (overlap(pl, pw)) {
        this.applyPower(pl, pw);
        pw.t = 0;
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'won' || this.phase === 'lost') {
      this.phaseT -= dt;
      this.updateBullets(dt);
      if (this.phaseT <= 0) {
        const pn = this.api.players;
        const detail = `${pn[0].name}: ${this.players[0].kills} tank · ${pn[1].name}: ${this.players[1].kills} tank`;
        if (this.phase === 'lost') this.api.end({ coop: true, win: false, title: this.baseAlive ? 'Tanklarınız bitti!' : 'Üs düştü!', detail: `${this.stage + 1}. bölümde kaldınız · ${detail}` });
        else this.api.end({ coop: true, win: true, title: 'Bütün bölümler temiz!', detail });
      }
      return;
    }
    if (this.phase === 'clear') {
      this.phaseT -= dt;
      for (const pl of this.players) this.updatePlayer(pl, dt);
      this.updateBullets(dt);
      if (this.phaseT <= 0) this.loadStage(this.stage + 1);
      return;
    }

    // oynanış
    if (this.clockT > 0) this.clockT -= dt;
    this.baseFlash = Math.max(0, this.baseFlash - dt);
    if (this.fortT > 0) {
      this.fortT -= dt;
      if (this.fortT <= 0) for (const [x, y] of SHELL) this.set(x, y, BRICK);
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnEnemy();
      this.spawnT = 2.8 - this.stage * 0.3;
    }
    for (const pl of this.players) this.updatePlayer(pl, dt);
    for (const e of this.enemies) if (!e.dead) this.updateEnemy(e, dt);
    this.updateBullets(dt);
    this.enemies = this.enemies.filter((e) => !e.dead);
    for (const pw of this.powerups) pw.t -= dt;
    this.powerups = this.powerups.filter((p) => p.t > 0);

    if (!this.baseAlive || this.players.every((p) => p.out)) {
      this.phase = 'lost';
      this.phaseT = 3;
      this.api.sfx('lose');
    } else if (this.killed >= ENEMY_PER_STAGE) {
      this.bullets = this.bullets.filter((b) => b.player);
      if (this.stage + 1 >= STAGES.length) {
        this.phase = 'won';
        this.phaseT = 3;
      } else {
        this.phase = 'clear';
        this.phaseT = 3.2;
      }
      this.api.sfx('win');
      // ölüleri bir sonraki bölümde geri getir
      for (const pl of this.players) if (!pl.alive && pl.lives > 0) pl.respawnT = 0;
    }
  }

  demo() {
    this.enemies.push({ type: 'fast', x: 12 * CS, y: 6 * CS, dir: 2, sub: 0, hp: 1, speed: 1, bonus: false, spawnT: 0, turnT: 1, fireT: 1, tread: 0 });
    this.enemies.push({ type: 'armor', x: 20 * CS, y: 9 * CS, dir: 3, sub: 0, hp: 4, speed: 1, bonus: true, spawnT: 0, turnT: 1, fireT: 1, tread: 0 });
    this.players.forEach((p) => (p.spawnT = 0));
    this.players[0].y -= 4 * CS;
    this.bullets.push({ x: this.players[0].x + TS / 2, y: this.players[0].y - 60, dir: 0, speed: 1, player: true, owner: this.players[0] });
  }

  // ---------------------------------------------------------------- çizim
  drawCells(g, layer) {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = this.cells[y * N + x];
        const px = X0 + x * CS;
        const py = Y0 + y * CS;
        if (layer === 0) {
          if (v === BRICK) {
            g.fillStyle = '#6e2c17';
            g.fillRect(px, py, CS, CS);
            g.fillStyle = '#c4613a';
            g.fillRect(px + 1, py + 1, 11, 11);
            g.fillRect(px + 14, py + 1, 11, 11);
            g.fillRect(px + 1, py + 14, 5, 11);
            g.fillRect(px + 8, py + 14, 11, 11);
            g.fillRect(px + 21, py + 14, 4, 11);
            g.fillStyle = 'rgba(255,255,255,.18)';
            g.fillRect(px + 1, py + 1, 11, 2);
            g.fillRect(px + 14, py + 1, 11, 2);
            g.fillRect(px + 8, py + 14, 11, 2);
          } else if (v === STEEL) {
            g.fillStyle = '#8b90ad';
            g.fillRect(px, py, CS, CS);
            g.fillStyle = '#c9cde6';
            g.fillRect(px + 3, py + 3, CS - 6, CS - 6);
            g.fillStyle = '#a5aac8';
            g.fillRect(px + 7, py + 7, CS - 14, CS - 14);
          } else if (v === WATER) {
            g.fillStyle = '#1f5fbf';
            g.fillRect(px, py, CS, CS);
            g.strokeStyle = 'rgba(160,220,255,.55)';
            g.lineWidth = 2;
            g.beginPath();
            const ph = this.time * 3 + x * 0.7;
            for (let k = 0; k < 2; k++) {
              const wy = py + 8 + k * 11;
              g.moveTo(px + 2, wy + Math.sin(ph + k) * 2);
              g.quadraticCurveTo(px + CS / 2, wy - 4 + Math.sin(ph + k) * 2, px + CS - 2, wy + Math.sin(ph + k) * 2);
            }
            g.stroke();
          }
        } else if (v === BUSH) {
          g.fillStyle = '#2f8f3f';
          g.beginPath();
          for (const [ox, oy, r] of [[7, 8, 8], [18, 7, 8], [8, 18, 8], [19, 19, 8], [13, 13, 7]]) {
            g.moveTo(px + ox + r, py + oy);
            g.arc(px + ox, py + oy, r, 0, Math.PI * 2);
          }
          g.fill();
          g.fillStyle = '#4fc25e';
          g.beginPath();
          for (const [ox, oy, r] of [[7, 6, 4], [18, 5, 4], [9, 16, 4], [19, 17, 4]]) {
            g.moveTo(px + ox + r, py + oy);
            g.arc(px + ox, py + oy, r, 0, Math.PI * 2);
          }
          g.fill();
        }
      }
    }
  }

  drawPanel(g, p) {
    const pl = this.players[p];
    const cx = p === 0 ? X0 / 2 : W - X0 / 2;
    const col = PCOL[p];
    rr(g, cx - 130, 22, 260, 676, 22);
    g.fillStyle = rgba(col, 0.09);
    g.fill();
    g.strokeStyle = rgba(col, 0.4);
    g.lineWidth = 2;
    g.stroke();
    text(g, this.api.players[p].name, cx, 66, { size: 34, color: col, weight: 800, stroke: 'rgba(0,0,0,.5)', sw: 6 });
    drawTank(g, cx, 150, 0, pl.out ? '#555' : col, 92, 0, { star: pl.level });
    // canlar
    text(g, 'CAN', cx, 236, { size: 18, color: '#a7a2d1' });
    for (let i = 0; i < Math.max(pl.lives, 0); i++) drawPowerIcon(g, 'life', cx - (Math.min(pl.lives, 5) - 1) * 20 + i * 40, 272, 32);
    if (pl.lives <= 0) text(g, 'BİTTİ', cx, 272, { size: 26, color: '#ff6b7a', weight: 800 });
    text(g, 'GÜÇ', cx, 320, { size: 18, color: '#a7a2d1' });
    for (let i = 0; i < 3; i++) drawStar(g, cx - 40 + i * 40, 352, 15, i < pl.level ? '#ffd23f' : 'rgba(255,255,255,.12)');
    text(g, 'VURDUĞU', cx, 400, { size: 18, color: '#a7a2d1' });
    text(g, String(pl.kills), cx, 436, { size: 40, color: '#fff', weight: 800 });
    text(g, 'PUAN', cx, 478, { size: 18, color: '#a7a2d1' });
    text(g, String(pl.score), cx, 508, { size: 28, color: '#fff', weight: 800 });

    if (p === 0) {
      text(g, 'BÖLÜM', cx, 580, { size: 18, color: '#a7a2d1' });
      text(g, `${this.stage + 1} / ${STAGES.length}`, cx, 616, { size: 44, color: '#ffd23f', weight: 800 });
      text(g, 'ÜS', cx - 62, 668, { size: 20, color: '#a7a2d1', weight: 800 });
      for (let i = 0; i < 3; i++) {
        const on = i < this.baseHp;
        g.fillStyle = on ? '#7fe3ff' : 'rgba(255,255,255,.12)';
        g.beginPath();
        const dx = cx - 18 + i * 36;
        g.moveTo(dx, 654);
        g.lineTo(dx + 12, 668);
        g.lineTo(dx, 682);
        g.lineTo(dx - 12, 668);
        g.closePath();
        g.fill();
      }
    } else {
      text(g, 'KALAN DÜŞMAN', cx, 560, { size: 18, color: '#a7a2d1' });
      const left = ENEMY_PER_STAGE - this.killed;
      for (let i = 0; i < ENEMY_PER_STAGE; i++) {
        const ix = cx - 90 + (i % 9) * 22.5;
        const iy = 592 + Math.floor(i / 9) * 30;
        g.fillStyle = i < left ? '#b8bdd6' : 'rgba(255,255,255,.08)';
        rr(g, ix - 7, iy - 9, 14, 18, 3);
        g.fill();
      }
      if (this.clockT > 0) text(g, `ZAMAN DURDU ${Math.ceil(this.clockT)}`, cx, 670, { size: 22, color: '#c08bff', weight: 800 });
    }
  }

  draw(g) {
    g.fillStyle = '#0d0c1c';
    g.fillRect(0, 0, W, H);
    g.save();
    this.shake.apply(g);
    // zemin
    g.fillStyle = '#1b1a2c';
    g.fillRect(X0, Y0, MAP, MAP);
    g.strokeStyle = 'rgba(255,255,255,.03)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i <= 13; i++) {
      g.moveTo(X0 + i * TS + 0.5, Y0);
      g.lineTo(X0 + i * TS + 0.5, Y0 + MAP);
      g.moveTo(X0, Y0 + i * TS + 0.5);
      g.lineTo(X0 + MAP, Y0 + i * TS + 0.5);
    }
    g.stroke();
    this.drawCells(g, 0);
    drawCore(g, X0 + 13 * CS, Y0 + 25 * CS - 4, this.baseAlive, this.time);
    if (this.baseFlash > 0) {
      g.fillStyle = `rgba(255,80,90,${this.baseFlash * 0.7})`;
      g.fillRect(X0 + 12 * CS, Y0 + 24 * CS, TS, TS);
    }
    if (this.fortT > 0 && this.fortT < 3 && Math.floor(this.time * 6) % 2) {
      g.fillStyle = 'rgba(255,255,255,.2)';
      for (const [x, y] of SHELL) g.fillRect(X0 + x * CS, Y0 + y * CS, CS, CS);
    }

    // güçlendirmeler
    for (const pw of this.powerups) {
      if (pw.t < 4 && Math.floor(this.time * 8) % 2) continue;
      drawPowerIcon(g, pw.type, X0 + pw.x + TS / 2, Y0 + pw.y + TS / 2, TS - 4);
    }

    // tanklar
    for (const e of this.enemies) {
      const cx = X0 + e.x + TS / 2;
      const cy = Y0 + e.y + TS / 2;
      if (e.spawnT > 0) {
        const s = 10 + Math.abs(Math.sin(e.spawnT * 12)) * 16;
        drawStar(g, cx, cy, s, '#fff3b0');
        continue;
      }
      let col = ETYPES[e.type].color;
      if (e.type === 'armor') col = ['#ff6b7a', '#ffd23f', '#5fd38d', '#5fd38d'][Math.max(0, e.hp - 1)] || col;
      if (e.bonus && Math.floor(this.time * 8) % 2) col = '#ff3b5c';
      drawTank(g, cx, cy, e.dir, col, TS, e.tread, { alpha: this.clockT > 0 && Math.floor(this.time * 4) % 2 ? 0.7 : 1 });
    }
    for (const pl of this.players) {
      if (!pl.alive) continue;
      const cx = X0 + pl.x + TS / 2;
      const cy = Y0 + pl.y + TS / 2;
      if (pl.spawnT > 0) {
        drawStar(g, cx, cy, 10 + Math.abs(Math.sin(pl.spawnT * 12)) * 16, PCOL[pl.p]);
        continue;
      }
      const flick = pl.frozen > 0 && Math.floor(this.time * 10) % 2;
      drawTank(g, cx, cy, pl.dir, flick ? '#7fe3ff' : PCOL[pl.p], TS, pl.tread, { star: pl.level });
      if (pl.shield > 0) {
        g.strokeStyle = `rgba(127,227,255,${0.5 + 0.3 * Math.sin(this.time * 20)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(cx, cy, 32, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // mermiler
    for (const b of this.bullets) {
      g.fillStyle = b.player ? '#fff3b0' : '#ffb3b3';
      g.beginPath();
      g.arc(X0 + b.x, Y0 + b.y, b.power ? 5 : 4, 0, Math.PI * 2);
      g.fill();
    }
    this.drawCells(g, 1);
    this.parts.draw(g);
    g.restore();
    this.pops.draw(g);
    this.drawPanel(g, 0);
    this.drawPanel(g, 1);

    if (this.phase === 'intro') banner(g, `BÖLÜM ${this.stage + 1}`, 'Üssü birlikte koruyun!', '#ffd23f', 2.5 - this.phaseT);
    if (this.phase === 'clear') banner(g, 'BÖLÜM TEMİZ!', `Sıradaki: Bölüm ${this.stage + 2}`, '#46e38a', 3.2 - this.phaseT);
    if (this.phase === 'won') banner(g, 'ZAFER!', 'Bütün düşmanlar durduruldu', '#46e38a', 3 - this.phaseT);
    if (this.phase === 'lost') banner(g, this.baseAlive ? 'TANKLAR BİTTİ' : 'ÜS DÜŞTÜ!', 'Bir dahaki sefere…', '#ff5a5a', 3 - this.phaseT);
  }
}

export default {
  id: 'tanks',
  name: 'Tank Taburu',
  icon: '🛡️',
  tag: 'Birlikte savunma',
  mode: 'coop',
  color: '#46a35e',
  desc: 'İkiniz aynı taraftasınız! Alttaki parlayan kristal üssü koruyun, gelen düşman tank dalgalarını durdurun. Yanıp sönen tankı vurursanız güçlendirme düşer.',
  howto: ['Yön tuşları: sür', 'A: ateş (basılı tutabilirsin)', 'Arkadaşını vurursan 2 saniye donar!', 'Yıldız: güçlenen mermi · Kalkan · Kale: çelik duvar', 'Bomba: ekrandaki düşmanlar · Saat: düşmanları dondurur', 'Üs 3 vuruşa dayanır · her bölümde 18 tank · 3 bölüm'],
  keys: '1. oyuncu WASD + F · 2. oyuncu Oklar + K',
  controller: { layout: 'dpad', dirs: 4, a: 'ATEŞ', b: null },
  create: (api) => new TanksGame(api),
};
