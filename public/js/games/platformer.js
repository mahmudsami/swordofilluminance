// ÇİFTE MACERA — iki kişilik ortak platform oyunu. Her bölüm ancak birlikte çözülebilen bir bulmaca:
// birbirinin kafasına çıkma, basınç plakaları, şalterler, renkli alanlar, kasalar, asansörler,
// lazerler ve zamanlı düğmeler. Açılan bölümler bu TV'de saklanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, sprite, Layer, glow, eyes } from '../host/gfx.js';
import LEVELS from './platformer-levels.js';

const T = 40; // kare boyu
const COLS = 32;
const ROWS = 18;
const STEP = 1 / 120; // sabit fizik adımı
const GRAV = 2000;
const JUMP_V = 650; // ~2,6 kare zıplar: 2 kare çıkılır, 3 kare için kafaya çıkmak ya da kasa gerekir
const RUN = 240;
const PUSH_RUN = 125; // kasa iterken hız
const ACC_G = 2600;
const ACC_A = 1700;
const MAXFALL = 950;
const SPRING_V = 1060;
const COYOTE = 0.08;
const JBUF = 0.12;
const CUT = 0.45; // zıplama tuşu erken bırakılınca kalan hız oranı
const PW = 26;
const PH = 34;
const CS = 36; // kasa boyu
const STEP_UP = 8; // yürürken kendiliğinden çıkılan basamak
const EPS = 1e-4;
const RESTART_HOLD = 1.6;
const STORE = 'kanepe.ciftemacera.v1';
const SIGCOL = ['#ffd23f', '#46e38a', '#ff9a3d', '#b48cff', '#ff6bd5', '#7fe3ff', '#f2f2f2', '#a3e635'];
const DIRV = { l: [-1, 0], r: [1, 0], u: [0, -1], d: [0, 1] };

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
// kayan nokta artıklarını saymayan çakışma (ezme / doluluk denetimleri için)
const overlapE = (a, b, e = 0.05) => a.x < b.x + b.w - e && a.x + a.w > b.x + e && a.y < b.y + b.h - e && a.y + a.h > b.y + e;
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function loadProgress() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE));
    if (v && typeof v.unlocked === 'number') return { unlocked: v.unlocked, best: v.best || {} };
  } catch {}
  return { unlocked: 1, best: {} };
}
function saveProgress(v) {
  try {
    localStorage.setItem(STORE, JSON.stringify(v));
  } catch {}
}

// Küçük mantık dili: a, !a, a&b, a|b, (a|b)&!c
export function compile(expr) {
  if (expr === undefined || expr === null || expr === '') return () => true;
  const toks = String(expr).replace(/\s+/g, '').match(/[a-z]|[&|!()]/g) || [];
  let i = 0;
  const or = () => {
    let l = and();
    while (toks[i] === '|') {
      i++;
      const a = l;
      const r = and();
      l = (s) => a(s) || r(s);
    }
    return l;
  };
  const and = () => {
    let l = not();
    while (toks[i] === '&') {
      i++;
      const a = l;
      const r = not();
      l = (s) => a(s) && r(s);
    }
    return l;
  };
  const not = () => {
    const t = toks[i++];
    if (t === '!') {
      const f = not();
      return (s) => !f(s);
    }
    if (t === '(') {
      const f = or();
      i++;
      return f;
    }
    return (s) => !!s[t];
  };
  return or();
}
const idsOf = (expr) => [...new Set(String(expr || '').match(/[a-z]/g) || [])];

// Harita metnini çözümle (testler de kullanır)
export function parseLevel(def) {
  const grid = [];
  const cells = {};
  const out = { def, grid, ents: [], crates: [], gems: [], flags: [], springs: [], spawn: [null, null], exit: null };
  for (let r = 0; r < ROWS; r++) {
    const row = (def.map[r] || '').padEnd(COLS, '.');
    const line = [];
    for (let c = 0; c < COLS; c++) {
      const ch = row[c];
      let tile = '.';
      if ('#=^~RU'.includes(ch)) tile = ch;
      else if (ch === '1' || ch === '2') out.spawn[+ch - 1] = { x: c * T + T / 2, y: (r + 1) * T };
      else if (ch === 'E') out.exit = { x: c * T, y: (r - 1) * T, w: T, h: 2 * T };
      else if (ch === 'B') out.crates.push({ x: c * T + (T - CS) / 2, y: (r + 1) * T - CS });
      else if (ch === '*') out.gems.push({ x: c * T + T / 2, y: r * T + T / 2 });
      else if (ch === 'F') out.flags.push({ x: c * T + T / 2, y: (r + 1) * T });
      else if (ch === 'S') out.springs.push({ x: c * T, y: r * T });
      else if (ch >= 'a' && ch <= 'z') (cells[ch] = cells[ch] || []).push([c, r]);
      line.push(tile);
    }
    grid.push(line);
  }
  for (const id of Object.keys(cells).sort()) {
    const d = def.ents[id];
    if (!d) throw new Error(`${def.name}: "${id}" tanımlı değil`);
    const cs = cells[id];
    const c0 = Math.min(...cs.map((v) => v[0]));
    const c1 = Math.max(...cs.map((v) => v[0]));
    const r0 = Math.min(...cs.map((v) => v[1]));
    const r1 = Math.max(...cs.map((v) => v[1]));
    if (cs.length !== (c1 - c0 + 1) * (r1 - r0 + 1)) throw new Error(`${def.name}: "${id}" dikdörtgen değil`);
    if (d.under) for (const [c, r] of cs) grid[r][c] = d.under;
    out.ents.push({ ...d, id, c0, r0, cw: c1 - c0 + 1, ch: r1 - r0 + 1 });
  }
  return out;
}

class CoopGame {
  constructor(api) {
    this.api = api;
    this.prog = loadProgress();
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.time = 0;
    this.acc = 0;
    this.deaths = 0;
    this.gemsGot = 0;
    this.gemsAll = 0;
    this.played = 0;
    this.prev = [{}, {}];
    this.tapped = [{}, {}]; // kare arasında basılıp bırakılan tuşlar kaçmasın
    this.state = 'select';
    this.sel = Math.max(0, Math.min(this.prog.unlocked, LEVELS.length) - 1);
    this.L = null;
    this.bg = new Layer(W, H, (g) => this.paintLevel(g));
    this.selBg = new Layer(W, H, (g) => this.paintSelectBg(g));
    this.gemTotals = LEVELS.map((l) => parseLevel(l).gems.length);
    this.infoAll('Bölüm seç: ◀ ▶ · A ile başla');
  }

  infoAll(s) {
    for (const p of [0, 1]) this.api.info(p, s);
  }

  // tuşun bu karede yeni basıldığını sor
  edge(p, k) {
    return !!this.tapped[p][k] || (!!this.api.input[p][k] && !this.prev[p][k]);
  }

  onKey(p, k, down) {
    if (down) this.tapped[p][k] = true;
  }

  // ---------------------------------------------------------------- bölüm kurulumu
  startLevel(i, keepCp = false) {
    this.li = i;
    const L = (this.L = parseLevel(LEVELS[i]));
    this.grid = L.grid;
    this.players = [0, 1].map((p) => this.makePlayer(p, L.spawn[p]));
    this.crates = L.crates.map((c) => ({ kind: 'c', x: c.x, y: c.y, w: CS, h: CS, vx: 0, vy: 0, ground: null, ox: c.x, oy: c.y, dead: false, deadT: 0 }));
    this.gems = L.gems.map((g) => ({ ...g, got: false }));
    this.flags = L.flags.map((f) => ({ ...f, on: false }));
    this.springs = L.springs.map((s) => ({ ...s, t: 0 }));
    if (!keepCp) this.cp = null;
    this.sig = {};
    this.ents = [];
    this.byId = {};
    this.triggers = [];
    this.doors = [];
    this.bridges = [];
    this.movers = [];
    this.lasers = [];
    let ci = 0;
    for (const d of L.ents) {
      const e = { ...d, x: d.c0 * T, y: d.r0 * T, w: d.cw * T, h: d.ch * T };
      if (e.type === 'plate' || e.type === 'lever' || e.type === 'button') {
        e.col = SIGCOL[ci++ % SIGCOL.length];
        e.on = e.type === 'lever' ? !!d.on : false;
        e.timer = 0;
        e.need = d.need || 1;
        e.anim = 0;
        this.triggers.push(e);
      } else if (e.type === 'door') {
        e.cond = compile(d.when);
        e.open = 0;
        e.solid = { x: e.x, y: e.y, w: e.w, h: e.h, ref: e };
        this.doors.push(e);
      } else if (e.type === 'bridge') {
        e.cond = compile(d.when);
        e.on = false;
        e.vis = 0;
        e.solid = { x: e.x, y: e.y, w: e.w, h: d.thick || 14, ref: e };
        this.bridges.push(e);
      } else if (e.type === 'mover') {
        e.cond = compile(d.when);
        e.bx = e.x;
        e.by = e.y;
        e.tx = e.x + (d.to?.[0] || 0) * T;
        e.ty = e.y + (d.to?.[1] || 0) * T;
        e.h = d.thick || 20;
        e.speed = d.speed || 100;
        e.fwd = true;
        e.wait = 0;
        e.ref = e;
        this.movers.push(e);
      } else if (e.type === 'laser') {
        e.cond = compile(d.when);
        e.beam = null;
        e.solid = { x: e.x, y: e.y, w: e.w, h: e.h, ref: e };
        this.lasers.push(e);
      }
      this.ents.push(e);
      this.byId[e.id] = e;
    }
    // eylemcilerin hangi tetikleyicilere bağlı olduğunu gösteren ışıklar
    for (const e of this.ents) e.deps = idsOf(e.when).map((id) => this.byId[id]).filter(Boolean);
    this.solids = [];
    this.levelTime = 0;
    this.levelDeaths = 0;
    this.exitT = 0;
    this.hintT = 10;
    this.acc = 0;
    this.restartP = -1;
    this.bg.invalidate();
    this.updateSignals(0);
    this.rebuildSolids();
    this.state = 'intro';
    this.phaseT = 1.6;
    this.infoAll(`Bölüm ${i + 1}/${LEVELS.length} · ${L.def.name}`);
  }

  makePlayer(p, sp) {
    return {
      kind: 'p', p, x: sp.x - PW / 2, y: sp.y - PH, w: PW, h: PH, vx: 0, vy: 0, ground: null,
      face: p === 0 ? 1 : -1, coyote: 0, jbuf: 0, jumpHeld: true, dead: false, deadT: 0,
      push: 0, squash: 0, walk: 0, holdB: 0, bLock: true,
    };
  }

  restartLevel() {
    this.pops.add('BAŞTAN!', W / 2, H / 2 - 40, '#ffd23f', 54, 1);
    this.api.sfx('lose');
    this.startLevel(this.li);
    this.state = 'play';
  }

  // ---------------------------------------------------------------- dünya sorguları
  tileAt(c, r) {
    if (c < 0 || c >= COLS || r < 0) return '#';
    if (r >= ROWS) return '.';
    return this.grid[r][c];
  }

  solidTile(c, r, b) {
    const t = this.tileAt(c, r);
    if (t === '#') return true;
    if (t === 'R') return !(b.kind === 'p' && b.p === 0);
    if (t === 'U') return !(b.kind === 'p' && b.p === 1);
    return false;
  }

  bodies() {
    return this.players.concat(this.crates);
  }

  rebuildSolids() {
    const s = [];
    for (const d of this.doors) if (d.solid.h > 0.5) s.push(d.solid);
    for (const b of this.bridges) if (b.on) s.push(b.solid);
    for (const m of this.movers) s.push(m);
    for (const l of this.lasers) s.push(l.solid);
    this.solids = s;
  }

  // dikdörtgen bu cisim için boş mu (basamak çıkarken)
  free(b, x, y) {
    const c0 = Math.floor((x + EPS) / T);
    const c1 = Math.floor((x + b.w - EPS) / T);
    const r0 = Math.floor((y + EPS) / T);
    const r1 = Math.floor((y + b.h - EPS) / T);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.solidTile(c, r, b)) return false;
    const box = { x, y, w: b.w, h: b.h };
    for (const s of this.solids) if (overlap(box, s)) return false;
    for (const k of this.crates) if (k !== b && !k.dead && overlap(box, k)) return false;
    return true;
  }

  // ---------------------------------------------------------------- hareket ve çarpışma
  moveX(b, dx) {
    if (!dx) return 0;
    const x0 = b.x;
    b.x += dx;
    const r0 = Math.floor((b.y + EPS) / T);
    const r1 = Math.floor((b.y + b.h - EPS) / T);
    const c = dx > 0 ? Math.floor((b.x + b.w - EPS) / T) : Math.floor((b.x + EPS) / T);
    for (let r = r0; r <= r1; r++) {
      if (!this.solidTile(c, r, b)) continue;
      const rise = b.y + b.h - r * T;
      if (r === r1 && rise > 0 && rise <= STEP_UP && b.ground && this.free(b, b.x, r * T - b.h)) {
        b.y = r * T - b.h;
        continue;
      }
      b.x = dx > 0 ? c * T - b.w : (c + 1) * T;
      break;
    }
    for (const s of this.solids) {
      if (!overlap(b, s)) continue;
      const rise = b.y + b.h - s.y;
      if (rise > 0 && rise <= STEP_UP && b.ground && this.free(b, b.x, s.y - b.h)) {
        b.y = s.y - b.h;
        continue;
      }
      b.x = dx > 0 ? Math.min(b.x, s.x - b.w) : Math.max(b.x, s.x + s.w);
    }
    for (const k of this.crates) {
      if (k === b || k.dead || !overlap(b, k)) continue;
      const rise = b.y + b.h - k.y;
      if (rise > 0 && rise <= STEP_UP && b.ground && this.free(b, b.x, k.y - b.h)) {
        b.y = k.y - b.h;
        continue;
      }
      if (b.kind === 'p') {
        // oyuncu kasayı iter
        const need = dx > 0 ? b.x + b.w - k.x : b.x - (k.x + k.w);
        if (k.ground) this.moveX(k, need);
        b.push = 0.12;
        if (overlap(b, k)) b.x = dx > 0 ? k.x - b.w : k.x + k.w;
      } else b.x = dx > 0 ? Math.min(b.x, k.x - b.w) : Math.max(b.x, k.x + k.w);
    }
    const moved = b.x - x0;
    if (Math.abs(moved - dx) > 1e-6) b.vx = 0;
    if (moved) this.carry(b, moved, 0);
    return moved;
  }

  moveY(b, dy) {
    if (!dy) return 0;
    const y0 = b.y;
    const prevBot = b.y + b.h;
    const prevTop = b.y;
    b.y += dy;
    const c0 = Math.floor((b.x + EPS) / T);
    const c1 = Math.floor((b.x + b.w - EPS) / T);
    let landed = null;
    if (dy > 0) {
      const r = Math.floor((b.y + b.h - EPS) / T);
      for (let c = c0; c <= c1; c++) {
        const t = this.tileAt(c, r);
        if (this.solidTile(c, r, b) || (t === '=' && prevBot <= r * T + 0.01)) {
          b.y = Math.min(b.y, r * T - b.h);
          landed = 'tile';
        }
      }
      for (const s of this.solids) {
        if (overlap(b, s) && prevBot <= s.y + 1.5) {
          b.y = s.y - b.h;
          landed = s.ref || s;
        }
      }
      for (const k of this.crates) {
        if (k !== b && !k.dead && overlap(b, k) && prevBot <= k.y + 1.5) {
          b.y = k.y - b.h;
          landed = k;
        }
      }
      for (const p of this.players) {
        if (p !== b && !p.dead && overlap(b, p) && prevBot <= p.y + 1.5) {
          b.y = p.y - b.h;
          landed = p;
        }
      }
      if (landed) {
        b.ground = landed;
        if (b.vy > 0) b.vy = 0;
      }
    } else {
      const r = Math.floor((b.y + EPS) / T);
      let bump = false;
      for (let c = c0; c <= c1; c++) {
        if (this.solidTile(c, r, b)) {
          b.y = (r + 1) * T;
          bump = true;
        }
      }
      for (const s of this.solids) {
        if (overlap(b, s) && prevTop >= s.y + s.h - 1.5) {
          b.y = s.y + s.h;
          bump = true;
        }
      }
      for (const k of this.crates) {
        if (k !== b && !k.dead && overlap(b, k) && prevTop >= k.y + k.h - 1.5) {
          b.y = k.y + k.h;
          bump = true;
        }
      }
      if (bump && b.vy < 0) b.vy = 0;
    }
    const moved = b.y - y0;
    if (moved) {
      this.carry(b, 0, moved);
      // üstündeki cisim tavana takıldıysa yığın da durur
      if (moved < 0) {
        for (const r of this.bodies()) {
          if (r !== b && !r.dead && r.ground === b && b.y < r.y + r.h - 0.01) {
            b.y = r.y + r.h;
            if (b.vy < 0) b.vy = 0;
          }
        }
      }
    }
    return b.y - y0;
  }

  // üstünde duran cisimleri taşı
  carry(b, dx, dy) {
    if ((this.depth || 0) > 6) return;
    this.depth = (this.depth || 0) + 1;
    for (const r of this.bodies()) {
      if (r === b || r.dead || r.ground !== b) continue;
      if (dx) this.moveX(r, dx);
      if (dy) this.moveY(r, dy);
      r.ground = b;
    }
    this.depth--;
  }

  // ---------------------------------------------------------------- adım
  updateSignals(dt) {
    const sig = this.sig;
    for (const e of this.triggers) {
      if (e.type === 'plate') {
        let n = 0;
        const bot = e.y + e.h;
        for (const b of this.bodies()) {
          if (b.dead) continue;
          if (e.who !== undefined && !(b.kind === 'p' && b.p === e.who)) continue;
          if (b.x < e.x + e.w - 4 && b.x + b.w > e.x + 4 && Math.abs(b.y + b.h - bot) < 3) n++;
        }
        const on = n >= e.need;
        if (on !== e.on) {
          e.on = on;
          if (dt) this.api.sfx(on ? 'click' : 'move');
        }
      } else if (e.type === 'button') {
        if (e.timer > 0) {
          const before = Math.ceil(e.timer * 2);
          e.timer = Math.max(0, e.timer - dt);
          if (e.timer > 0 && Math.ceil(e.timer * 2) !== before) this.api.sfx('move');
        }
        e.on = e.timer > 0;
      }
      e.anim = approach(e.anim, e.on ? 1 : 0, dt * 8);
      sig[e.id] = e.on;
    }
  }

  stepMover(m, dt) {
    const want = m.cond(this.sig);
    let gx;
    let gy;
    if (m.loop) {
      if (!want) return;
      if (m.wait > 0) {
        m.wait -= dt;
        return;
      }
      gx = m.fwd ? m.tx : m.bx;
      gy = m.fwd ? m.ty : m.by;
    } else {
      gx = want ? m.tx : m.bx;
      gy = want ? m.ty : m.by;
    }
    const ddx = gx - m.x;
    const ddy = gy - m.y;
    const dist = Math.hypot(ddx, ddy);
    if (dist < 0.01) {
      if (m.loop) {
        m.fwd = !m.fwd;
        m.wait = 0.5;
      }
      return;
    }
    const len = Math.min(dist, m.speed * dt);
    this.moveMover(m, (ddx / dist) * len, (ddy / dist) * len);
  }

  moveMover(m, dx, dy) {
    const all = this.bodies();
    const saved = all.map((b) => [b, b.x, b.y, b.ground, b.vy]);
    const riders = all.filter((b) => !b.dead && b.ground === m);
    m.x += dx;
    m.y += dy;
    let ok = true;
    for (const b of riders) {
      if (dx) this.moveX(b, dx);
      if (dy) this.moveY(b, dy);
      b.ground = m;
      if (overlapE(b, m)) ok = false;
    }
    for (const b of all) {
      if (b.dead || riders.includes(b) || !overlapE(b, m)) continue;
      if (dy < 0 && b.y + b.h <= m.y - dy + 2) {
        this.moveY(b, m.y - (b.y + b.h));
        b.ground = m;
        if (b.vy > 0) b.vy = 0;
      } else if (dy > 0 && b.y >= m.y + m.h - dy - 2) this.moveY(b, m.y + m.h - b.y);
      else if (dx > 0) this.moveX(b, m.x + m.w - b.x);
      else if (dx < 0) this.moveX(b, m.x - (b.x + b.w));
      if (overlapE(b, m)) ok = false;
    }
    if (!ok) {
      // ezmek yok: bir şey engelliyorsa platform bekler
      m.x -= dx;
      m.y -= dy;
      for (const [b, x, y, gr, vy] of saved) {
        b.x = x;
        b.y = y;
        b.ground = gr;
        b.vy = vy;
      }
    }
  }

  stepDoors(dt) {
    for (const d of this.doors) {
      const want = d.cond(this.sig) ? 1 : 0;
      if (want > d.open) {
        if (d.open === 0) this.api.sfx('steel');
        d.open = Math.min(1, d.open + dt * 2.6);
      } else if (want < d.open) {
        const next = Math.max(0, d.open - dt * 2.6);
        const box = { x: d.x, y: d.y, w: d.w, h: d.h * (1 - next) };
        if (!this.bodies().some((b) => !b.dead && overlapE(b, box))) d.open = next;
      }
      d.solid.h = d.h * (1 - d.open);
    }
    for (const br of this.bridges) {
      const want = br.cond(this.sig);
      if (want && !br.on) {
        if (!this.bodies().some((b) => !b.dead && overlapE(b, br.solid))) br.on = true;
      } else if (!want && br.on) {
        br.on = false;
        for (const b of this.bodies()) if (b.ground === br) b.ground = null;
      }
      br.vis = approach(br.vis, br.on ? 1 : 0, dt * 6);
    }
  }

  stepPlayer(b, dt, controls) {
    const inp = this.api.input[b.p];
    const left = controls && inp.left;
    const right = controls && inp.right;
    const jump = controls && (inp.a || inp.up);
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir) b.face = dir;
    const g = b.ground;
    // havadaki arkadaşın kafasından zıplanmaz (üst üste katlanarak sınırsız yükselmeyi önler)
    const firm = g && !(g.kind === 'p' && !g.ground);
    if (firm) b.coyote = COYOTE;
    else b.coyote -= dt;
    const tap = this.tapped[b.p];
    if (controls && (tap.a || tap.up)) {
      // çok kısa dokunuş da zıplatır (bir kez)
      tap.a = tap.up = false;
      b.jbuf = JBUF;
    } else if (jump && !b.jumpHeld) b.jbuf = JBUF;
    else b.jbuf -= dt;
    b.jumpHeld = jump;
    const max = b.push > 0 ? PUSH_RUN : RUN;
    b.vx = approach(b.vx, dir * max, (g ? ACC_G : ACC_A) * dt);
    if (b.jbuf > 0 && b.coyote > 0) {
      b.vy = -JUMP_V;
      b.jumping = true;
      b.jbuf = 0;
      b.coyote = 0;
      b.ground = null;
      b.squash = -0.35;
      this.api.sfx('rotate');
    }
    // zıplama tuşu erken bırakılırsa kısa zıpla (yay fırlatması kesilmez)
    if (b.vy >= 0) b.jumping = false;
    if (b.jumping && !jump && b.vy < -JUMP_V * CUT) b.vy = -JUMP_V * CUT;
    b.vy = Math.min(MAXFALL, b.vy + GRAV * dt);
    if (b.push > 0) b.push -= dt;
    this.moveX(b, b.vx * dt);
    const wasGround = !!b.ground;
    const fall = b.vy;
    b.ground = null;
    this.moveY(b, b.vy * dt);
    if (b.ground && !wasGround && fall > 320) {
      b.squash = Math.min(0.4, fall / 2200);
      if (fall > 500) this.api.sfx('place');
    }
    if (b.ground && Math.abs(b.vx) > 10) b.walk += dt * Math.abs(b.vx) / 60;
    b.squash = approach(b.squash, 0, dt * 3);
  }

  stepCrate(k, dt) {
    k.vy = Math.min(MAXFALL, k.vy + GRAV * dt);
    const fall = k.vy;
    k.ground = null;
    this.moveY(k, k.vy * dt);
    if (k.ground && fall > 400) this.api.sfx('drop');
  }

  // lazer ışını: duvara, kasaya, kapıya ya da platforma kadar
  traceLaser(e) {
    const [dx, dy] = DIRV[e.dir] || DIRV.r;
    const cx = e.x + T / 2;
    const cy = e.y + T / 2;
    let c = e.c0 + dx;
    let r = e.r0 + dy;
    let end = 0; // ışının uzunluğu (piksel)
    for (let n = 0; n < 40; n++) {
      const t = this.tileAt(c, r);
      if (t === '#' || r >= ROWS) break;
      c += dx;
      r += dy;
    }
    // ışının bittiği kare kenarı
    if (dx > 0) end = c * T - (e.x + T);
    else if (dx < 0) end = e.x - (c + 1) * T;
    else if (dy > 0) end = r * T - (e.y + T);
    else end = e.y - (r + 1) * T;
    end = Math.max(0, end);
    // hareketli engeller (kendi yayıcısı hariç)
    const sx = dx > 0 ? e.x + T : dx < 0 ? e.x : cx;
    const sy = dy > 0 ? e.y + T : dy < 0 ? e.y : cy;
    const hit = (o) => {
      if (o === e.solid) return;
      if (dx) {
        if (cy <= o.y || cy >= o.y + o.h) return;
        const d = dx > 0 ? o.x - sx : sx - (o.x + o.w);
        if (d >= -0.5 && d < end) end = Math.max(0, d);
      } else {
        if (cx <= o.x || cx >= o.x + o.w) return;
        const d = dy > 0 ? o.y - sy : sy - (o.y + o.h);
        if (d >= -0.5 && d < end) end = Math.max(0, d);
      }
    };
    for (const s of this.solids) hit(s);
    for (const k of this.crates) if (!k.dead) hit(k);
    const len = end;
    if (dx) return { x: dx > 0 ? sx : sx - len, y: cy - 3, w: len, h: 6, dx, dy, sx, sy };
    return { x: cx - 3, y: dy > 0 ? sy : sy - len, w: 6, h: len, dx, dy, sx, sy };
  }

  kill(pl) {
    if (pl.dead) return;
    pl.dead = true;
    pl.deadT = 1.1;
    this.deaths++;
    this.levelDeaths++;
    for (const b of this.bodies()) if (b.ground === pl) b.ground = null;
    this.parts.burst(pl.x + PW / 2, pl.y + PH / 2, 26, [PCOL[pl.p], '#ffffff'], { speed: 320, size: 7, life: 0.8, gravity: 600 });
    this.shake.add(6, 0.25);
    this.api.sfx('die');
    this.api.buzz(pl.p, 220);
  }

  respawn(pl) {
    const sp = this.cp ? { x: this.cp.x + (pl.p ? 14 : -14), y: this.cp.y } : this.L.spawn[pl.p];
    Object.assign(pl, { x: sp.x - PW / 2, y: sp.y - PH, vx: 0, vy: 0, ground: null, dead: false, push: 0, squash: 0.3, jumpHeld: true });
    this.parts.burst(sp.x, sp.y - PH / 2, 14, [PCOL[pl.p], '#ffffff'], { speed: 160, size: 5, life: 0.5, gravity: 0 });
  }

  crateReset(k) {
    k.dead = true;
    k.deadT = 0.6;
    for (const b of this.bodies()) if (b.ground === k) b.ground = null;
    this.parts.burst(k.x + CS / 2, k.y + CS / 2, 16, ['#b07a45', '#7a5230'], { speed: 260, size: 7, life: 0.6, gravity: 500 });
    this.api.sfx('smallboom');
  }

  // B: şalter / düğme kullan; basılı tutunca bölüm baştan
  interact(pl, dt, controls) {
    const inp = this.api.input[pl.p];
    const b = controls && inp.b;
    if (!b) {
      pl.holdB = 0;
      pl.bLock = false;
      return;
    }
    if (this.edge(pl.p, 'b')) {
      const cx = pl.x + PW / 2;
      const cy = pl.y + PH / 2;
      for (const e of this.triggers) {
        if (e.type !== 'lever' && e.type !== 'button') continue;
        if (cx < e.x - 6 || cx > e.x + e.w + 6 || cy < e.y - 10 || cy > e.y + e.h + 10) continue;
        if (e.who !== undefined && e.who !== pl.p) {
          this.pops.add(e.who === 0 ? 'Yalnız pembe!' : 'Yalnız mavi!', e.x + T / 2, e.y - 10, PCOL[e.who], 22, 0.8);
          continue;
        }
        if (e.type === 'lever') {
          e.on = !e.on;
          this.api.sfx('click');
        } else {
          e.timer = e.t || 3;
          e.on = true;
          this.api.sfx('beep');
        }
        this.sig[e.id] = e.on;
        pl.bLock = true;
        this.api.buzz(pl.p, 25);
        break;
      }
    }
    if (pl.bLock || pl.dead) return;
    pl.holdB += dt;
    if (pl.holdB >= RESTART_HOLD) {
      pl.holdB = 0;
      pl.bLock = true;
      this.restartLevel();
    }
  }

  step(dt, controls) {
    this.levelTime += dt;
    this.updateSignals(dt);
    for (const m of this.movers) this.stepMover(m, dt);
    this.stepDoors(dt);
    this.rebuildSolids();
    // önce alttakiler: üstte duranlar taşındıktan sonra kendi hareketlerini yapar
    const list = this.bodies().filter((b) => !b.dead);
    list.sort((a, b) => b.y + b.h - (a.y + a.h));
    for (const b of list) {
      if (b.kind === 'p') this.stepPlayer(b, dt, controls);
      else this.stepCrate(b, dt);
    }
    // yaylar (yalnız oyuncular)
    for (const s of this.springs) {
      if (s.t > 0) s.t -= dt;
      for (const pl of this.players) {
        if (pl.dead || pl.vy < 0) continue;
        const cx = pl.x + PW / 2;
        const bot = pl.y + pl.h;
        if (cx > s.x + 4 && cx < s.x + T - 4 && bot > s.y + T - 16 && bot <= s.y + T + 0.5) {
          pl.vy = -SPRING_V;
          pl.jumping = false;
          pl.ground = null;
          pl.squash = -0.4;
          s.t = 0.25;
          this.api.sfx('bounce');
        }
      }
    }
    // tehlikeler
    for (const pl of this.players) {
      if (pl.dead) continue;
      if (pl.y > ROWS * T + 30) {
        this.kill(pl);
        continue;
      }
      const c0 = Math.floor(pl.x / T);
      const c1 = Math.floor((pl.x + PW) / T);
      const r0 = Math.floor(pl.y / T);
      const r1 = Math.floor((pl.y + PH) / T);
      for (let r = r0; r <= r1 && !pl.dead; r++) {
        for (let c = c0; c <= c1; c++) {
          const t = this.tileAt(c, r);
          if (t === '^' && overlap(pl, { x: c * T + 6, y: r * T + T - 15, w: T - 12, h: 15 })) this.kill(pl);
          else if (t === '~' && overlap(pl, { x: c * T, y: r * T + 14, w: T, h: T - 14 })) this.kill(pl);
          if (pl.dead) break;
        }
      }
    }
    for (const k of this.crates) {
      if (k.dead) {
        k.deadT -= dt;
        if (k.deadT <= 0 && this.free(k, k.ox, k.oy) && !this.players.some((p) => !p.dead && overlap(p, { x: k.ox, y: k.oy, w: CS, h: CS }))) {
          Object.assign(k, { x: k.ox, y: k.oy, vx: 0, vy: 0, dead: false, ground: null });
        }
        continue;
      }
      if (k.y > ROWS * T + 30) {
        this.crateReset(k);
        continue;
      }
      const c0 = Math.floor(k.x / T);
      const c1 = Math.floor((k.x + CS) / T);
      const r = Math.floor((k.y + CS - 1) / T);
      for (let c = c0; c <= c1; c++) {
        if (this.tileAt(c, r) === '~' && k.y + CS > r * T + 14) {
          this.crateReset(k);
          break;
        }
      }
    }
    // lazerler
    for (const e of this.lasers) {
      e.on = e.cond(this.sig);
      e.beam = e.on ? this.traceLaser(e) : null;
      if (!e.beam) continue;
      for (const pl of this.players) {
        if (pl.dead) continue;
        const box = { x: pl.x + 3, y: pl.y + 3, w: PW - 6, h: PH - 6 };
        if (overlap(box, e.beam)) this.kill(pl);
      }
    }
    // ölü oyuncular
    for (const pl of this.players) {
      if (!pl.dead) continue;
      pl.deadT -= dt;
      if (pl.deadT <= 0) this.respawn(pl);
    }
    // elmaslar ve bayraklar
    for (const pl of this.players) {
      if (pl.dead) continue;
      const cx = pl.x + PW / 2;
      const cy = pl.y + PH / 2;
      for (const gm of this.gems) {
        if (gm.got || Math.abs(gm.x - cx) > 24 || Math.abs(gm.y - cy) > 28) continue;
        gm.got = true;
        this.parts.burst(gm.x, gm.y, 14, ['#7fe3ff', '#ffffff', '#b48cff'], { speed: 220, size: 5, life: 0.5, gravity: 0 });
        this.pops.add('+1', gm.x, gm.y - 20, '#7fe3ff', 26, 0.7);
        this.api.sfx('pickup');
      }
      for (const f of this.flags) {
        if (f.on || Math.abs(f.x - cx) > 22 || pl.y + PH < f.y - 80 || pl.y > f.y) continue;
        for (const o of this.flags) o.on = false;
        f.on = true;
        this.cp = { x: f.x, y: f.y };
        this.pops.add('KONTROL NOKTASI', f.x, f.y - 90, '#46e38a', 22, 1);
        this.api.sfx('join');
      }
    }
    // çıkış
    const ex = this.L.exit;
    const inside = this.players.every((p) => !p.dead && overlap(p, ex));
    this.exitT = inside ? this.exitT + dt : 0;
    if (controls && this.exitT > 0.45) this.clearLevel();
  }

  simulate(dt, controls) {
    this.acc = Math.min(this.acc + dt, STEP * 10);
    // B tuşu (kare başına bir kez değerlendirilir)
    for (const pl of this.players) this.interact(pl, dt, controls);
    if (this.state !== 'play' && this.state !== 'intro' && this.state !== 'clear') return;
    while (this.acc >= STEP) {
      this.acc -= STEP;
      this.step(STEP, controls);
      if (this.state === 'clear' && controls) break;
    }
  }

  clearLevel() {
    this.state = 'clear';
    this.phaseT = 3;
    const i = this.li;
    const got = this.gems.filter((g) => g.got).length;
    this.gemsGot += got;
    this.gemsAll += this.gems.length;
    this.played++;
    this.clearInfo = { got, all: this.gems.length, time: this.levelTime, deaths: this.levelDeaths };
    this.prog.unlocked = Math.max(this.prog.unlocked, Math.min(LEVELS.length, i + 2));
    const best = this.prog.best[i] || {};
    this.prog.best[i] = { gems: Math.max(best.gems || 0, got), time: Math.min(best.time || 1e9, Math.round(this.levelTime)) };
    saveProgress(this.prog);
    this.api.sfx('win');
    for (const p of [0, 1]) this.api.buzz(p, 120);
    for (const pl of this.players) this.parts.burst(pl.x + PW / 2, pl.y, 24, [PCOL[pl.p], '#ffd23f', '#ffffff'], { speed: 360, size: 7, life: 1, gravity: 300, angle: -Math.PI / 2, spread: 2.4 });
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.state === 'select') {
      const n = Math.min(this.prog.unlocked, LEVELS.length);
      for (const p of [0, 1]) {
        if (this.edge(p, 'left') || this.edge(p, 'up')) this.sel = (this.sel + n - 1) % n;
        else if (this.edge(p, 'right') || this.edge(p, 'down')) this.sel = (this.sel + 1) % n;
        else if (this.edge(p, 'a') || this.edge(p, 'b')) {
          this.api.sfx('go');
          this.startLevel(this.sel);
          break;
        }
        if (this.edge(p, 'left') || this.edge(p, 'right') || this.edge(p, 'up') || this.edge(p, 'down')) this.api.sfx('move');
      }
    } else if (this.state === 'intro') {
      this.phaseT -= dt;
      this.simulate(dt, false);
      if (this.phaseT <= 0) this.state = 'play';
    } else if (this.state === 'play') {
      if (this.hintT > 0) this.hintT -= dt;
      this.simulate(dt, true);
    } else if (this.state === 'clear') {
      this.phaseT -= dt;
      this.simulate(dt, false);
      if (this.phaseT <= 0) {
        if (this.li + 1 >= LEVELS.length) {
          this.state = 'done';
          this.api.end({
            coop: true,
            win: true,
            title: 'MACERA TAMAM!',
            detail: `${this.played} bölüm · ${this.gemsGot}/${this.gemsAll} elmas · ${this.deaths} kez düştünüz`,
          });
        } else this.startLevel(this.li + 1);
      }
    }
    for (const p of [0, 1]) {
      Object.assign(this.prev[p], this.api.input[p]);
      this.tapped[p] = {};
    }
  }

  demo() {
    this.startLevel(1);
    this.state = 'play';
    this.hintT = 0;
    Object.assign(this.players[0], { x: 7 * T + 7, y: 16 * T - PH });
    Object.assign(this.players[1], { x: 8 * T + 7, y: 7 * T - PH });
    this.players[1].face = 1;
    this.byId.c.on = true;
    this.sig.c = true;
    this.bridges[0].on = true;
    this.bridges[0].vis = 1;
    this.gems[0].got = true;
  }

  // ---------------------------------------------------------------- çizim: sabit katman
  paintLevel(g) {
    if (!this.L) return;
    const th = this.L.def.theme;
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, th.sky[0]);
    gr.addColorStop(1, th.sky[1]);
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    // uzak süslemeler
    let seed = (this.li + 3) * 7919;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    g.fillStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i < 50; i++) g.fillRect(rnd() * W, rnd() * H * 0.6, 2, 2);
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let i = 0; i < 7; i++) {
      const x = rnd() * W;
      const w = 60 + rnd() * 120;
      const h = 150 + rnd() * 320;
      g.fillRect(x, H - h, w, h);
      g.fillRect(x + w * 0.3, H - h - 30, w * 0.4, 30);
    }
    const solid = (c, r) => this.tileAt(c, r) === '#';
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r][c];
        const x = c * T;
        const y = r * T;
        if (t === '#') {
          const inner = solid(c, r - 1) && solid(c, r + 1) && solid(c - 1, r) && solid(c + 1, r);
          g.fillStyle = inner ? shade(th.stone, -0.3) : th.stone;
          g.fillRect(x, y, T, T);
          g.fillStyle = 'rgba(0,0,0,.14)';
          g.fillRect(x, y + T / 2 - 1, T, 2);
          g.fillRect(x + ((r % 2) * T) / 2 + T / 4, y, 2, T / 2);
          g.fillRect(x + (((r + 1) % 2) * T) / 2 + T / 4, y + T / 2, 2, T / 2);
          if (!solid(c, r - 1)) {
            g.fillStyle = th.top;
            g.fillRect(x, y, T, 6);
            g.fillStyle = shade(th.top, -0.3);
            g.fillRect(x, y + 6, T, 3);
          }
          if (!solid(c, r + 1)) {
            g.fillStyle = 'rgba(0,0,0,.28)';
            g.fillRect(x, y + T - 4, T, 4);
          }
          if (!solid(c - 1, r)) {
            g.fillStyle = 'rgba(255,255,255,.07)';
            g.fillRect(x, y, 3, T);
          }
          if (!solid(c + 1, r)) {
            g.fillStyle = 'rgba(0,0,0,.2)';
            g.fillRect(x + T - 3, y, 3, T);
          }
        } else if (t === '=') {
          g.fillStyle = '#8a5a34';
          g.fillRect(x, y, T, 12);
          g.fillStyle = '#b37a48';
          g.fillRect(x, y, T, 4);
          g.fillStyle = 'rgba(0,0,0,.25)';
          g.fillRect(x + T - 2, y, 2, 12);
          g.fillStyle = '#5e3c22';
          g.fillRect(x + 6, y + 12, 4, 8);
          g.fillRect(x + T - 10, y + 12, 4, 8);
        } else if (t === '^') {
          g.fillStyle = '#c9cfdc';
          for (let k = 0; k < 3; k++) {
            const sx = x + 4 + k * 11;
            g.beginPath();
            g.moveTo(sx, y + T);
            g.lineTo(sx + 5.5, y + T - 16);
            g.lineTo(sx + 11, y + T);
            g.closePath();
            g.fill();
          }
          g.fillStyle = 'rgba(255,255,255,.6)';
          for (let k = 0; k < 3; k++) g.fillRect(x + 8.5 + k * 11, y + T - 12, 1.5, 6);
        } else if (t === '~') {
          g.fillStyle = '#1f7a2f';
          g.fillRect(x, y + 14, T, T - 14);
        }
      }
    }
    // bayrak direkleri
    for (const f of this.L.flags) {
      g.fillStyle = '#d8d4f0';
      g.fillRect(f.x - 2, f.y - 78, 4, 78);
      g.fillStyle = '#8f88c9';
      g.fillRect(f.x - 7, f.y - 4, 14, 4);
    }
    // çıkış kapısı çerçevesi
    const ex = this.L.exit;
    if (ex) {
      g.fillStyle = '#2a2140';
      rr(g, ex.x - 6, ex.y - 8, ex.w + 12, ex.h + 8, [18, 18, 0, 0]);
      g.fill();
      g.fillStyle = '#0d0a1c';
      rr(g, ex.x, ex.y, ex.w, ex.h, [14, 14, 0, 0]);
      g.fill();
    }
  }

  paintSelectBg(g) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#1b1440');
    gr.addColorStop(1, '#3d2a6e');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.04)';
    for (let i = 0; i < 12; i++) g.fillRect(i * 120 + 20, H - 140 - (i % 3) * 60, 70, 300);
    text(g, 'ÇİFTE MACERA', W / 2, 78, { size: 64, color: '#ffd23f', weight: 800, stroke: 'rgba(0,0,0,.4)', sw: 10 });
    text(g, 'Bölüm seç', W / 2, 132, { size: 26, color: '#d9d4ff', weight: 700 });
  }

  // ---------------------------------------------------------------- çizim: hareketli öğeler
  lights(g, e, x, y) {
    let i = 0;
    for (const d of e.deps) {
      const on = !!this.sig[d.id];
      g.fillStyle = on ? d.col : 'rgba(0,0,0,.5)';
      g.beginPath();
      g.arc(x + i * 11, y, 4, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = d.col;
      g.lineWidth = 1.5;
      g.stroke();
      i++;
    }
  }

  drawPlayer(g, pl) {
    if (pl.dead) return;
    const col = PCOL[pl.p];
    const cx = pl.x + PW / 2;
    const by = pl.y + PH;
    const sq = pl.squash;
    const w = PW * (1 + sq * 0.3);
    const h = PH * (1 - sq * 0.3);
    const step = pl.ground && Math.abs(pl.vx) > 20 ? Math.sin(pl.walk) : 0;
    g.save();
    g.translate(cx, by);
    // ayaklar
    g.fillStyle = shade(col, -0.5);
    g.beginPath();
    g.ellipse(-6 + step * 3, -3, 6, 4, 0, 0, Math.PI * 2);
    g.ellipse(6 - step * 3, -3, 6, 4, 0, 0, Math.PI * 2);
    g.fill();
    // gövde
    g.fillStyle = col;
    rr(g, -w / 2, -h, w, h - 3, 10);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.2)';
    rr(g, -w / 2 + 4, -h * 0.52, w - 8, h * 0.36, 7);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.35)';
    rr(g, -w / 2 + 3, -h + 3, w * 0.35, 6, 3);
    g.fill();
    // aksesuar: pembede yaprak, mavide anten
    if (pl.p === 0) {
      g.fillStyle = '#46e38a';
      g.beginPath();
      g.ellipse(4, -h - 4, 7, 3.5, -0.6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#2e9e5c';
      g.fillRect(0, -h - 3, 2, 5);
    } else {
      g.strokeStyle = shade(col, -0.4);
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(-2, -h);
      g.lineTo(-5, -h - 9);
      g.stroke();
      g.fillStyle = '#ffd23f';
      g.beginPath();
      g.arc(-5, -h - 10, 3.5, 0, Math.PI * 2);
      g.fill();
    }
    eyes(g, pl.face * 4, -h + 13, 5.5, pl.face, pl.vy > 200 ? 0.6 : 0, 0.95);
    g.restore();
    // yeniden başlatma halkası
    if (pl.holdB > 0.15 && !pl.bLock) {
      const t = Math.min(1, pl.holdB / RESTART_HOLD);
      g.strokeStyle = 'rgba(0,0,0,.4)';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(cx, pl.y - 22, 13, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = '#ffd23f';
      g.beginPath();
      g.arc(cx, pl.y - 22, 13, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
      g.stroke();
      text(g, 'baştan', cx, pl.y - 44, { size: 14, color: '#ffd23f', weight: 800, stroke: 'rgba(0,0,0,.6)', sw: 4 });
    }
  }

  crateSprite() {
    return sprite('pf-crate', CS, CS, (g) => {
      g.fillStyle = '#a36b3a';
      g.fillRect(0, 0, CS, CS);
      g.fillStyle = '#c48a52';
      g.fillRect(3, 3, CS - 6, CS - 6);
      g.strokeStyle = '#7a4c26';
      g.lineWidth = 4;
      g.beginPath();
      g.moveTo(5, 5);
      g.lineTo(CS - 5, CS - 5);
      g.moveTo(CS - 5, 5);
      g.lineTo(5, CS - 5);
      g.stroke();
      g.strokeStyle = '#5e3a1c';
      g.lineWidth = 3;
      g.strokeRect(1.5, 1.5, CS - 3, CS - 3);
    });
  }

  gemSprite() {
    return sprite('pf-gem', 28, 28, (g) => {
      g.drawImage(glow('#7fe3ff', 14, 0.5), 0, 0, 28, 28);
      g.fillStyle = '#7fe3ff';
      g.beginPath();
      g.moveTo(14, 3);
      g.lineTo(24, 12);
      g.lineTo(14, 25);
      g.lineTo(4, 12);
      g.closePath();
      g.fill();
      g.fillStyle = '#e6fbff';
      g.beginPath();
      g.moveTo(14, 3);
      g.lineTo(19, 12);
      g.lineTo(14, 12);
      g.lineTo(9, 12);
      g.closePath();
      g.fill();
    });
  }

  drawWorld(g) {
    const tm = this.time;
    // asit yüzeyi ve renkli alanlar
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = this.grid[r][c];
        if (t === '~') {
          const x = c * T;
          const y = r * T + 14 + Math.sin(tm * 3 + c) * 2;
          g.fillStyle = '#46e35a';
          g.fillRect(x, y, T, 5);
          g.fillStyle = 'rgba(120,255,140,.35)';
          g.fillRect(x + ((tm * 30 + c * 17) % T), y + 9, 6, 3);
        } else if (t === 'R' || t === 'U') {
          const col = PCOL[t === 'R' ? 0 : 1];
          const x = c * T;
          const y = r * T;
          g.fillStyle = rgba(col, 0.22);
          g.fillRect(x, y, T, T);
          g.fillStyle = rgba(col, 0.5);
          const off = (tm * 24 + r * 13) % 16;
          for (let k = -1; k < 3; k++) g.fillRect(x + 4, y + off + k * 16, T - 8, 3);
          g.fillStyle = col;
          g.fillRect(x, y, 3, T);
          g.fillRect(x + T - 3, y, 3, T);
        }
      }
    }
    // köprüler
    for (const br of this.bridges) {
      const s = br.solid;
      if (br.vis > 0.02) {
        g.globalAlpha = br.vis;
        g.fillStyle = '#e8d9a8';
        g.fillRect(s.x, s.y, s.w, s.h);
        g.fillStyle = '#b79c5c';
        for (let x = s.x; x < s.x + s.w; x += 20) g.fillRect(x, s.y, 2, s.h);
        g.globalAlpha = 1;
      }
      if (br.vis < 0.98) {
        g.strokeStyle = 'rgba(232,217,168,.45)';
        g.setLineDash([6, 6]);
        g.lineWidth = 2;
        g.strokeRect(s.x + 1, s.y + 1, s.w - 2, s.h - 2);
        g.setLineDash([]);
      }
      this.lights(g, br, s.x + 8, s.y - 8);
    }
    // kapılar
    for (const d of this.doors) {
      const h = d.solid.h;
      g.fillStyle = '#2a2140';
      g.fillRect(d.x - 3, d.y - 8, d.w + 6, 8);
      if (h > 0.5) {
        g.fillStyle = '#6b6f86';
        g.fillRect(d.x + 3, d.y, d.w - 6, h);
        g.fillStyle = '#8c90a8';
        g.fillRect(d.x + 3, d.y, 6, h);
        g.fillStyle = '#ffd23f';
        for (let y = d.y + h - 14; y > d.y; y -= 28) g.fillRect(d.x + 3, y, d.w - 6, 5);
        g.fillStyle = 'rgba(0,0,0,.3)';
        g.fillRect(d.x + 3, d.y + h - 3, d.w - 6, 3);
      }
      this.lights(g, d, d.x + 7, d.y - 14);
    }
    // hareketli platformlar
    for (const m of this.movers) {
      g.fillStyle = '#5d6280';
      rr(g, m.x, m.y, m.w, m.h, 5);
      g.fill();
      g.fillStyle = '#8b91b5';
      g.fillRect(m.x + 3, m.y + 2, m.w - 6, 4);
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(m.x + 3, m.y + m.h - 5, m.w - 6, 3);
      this.lights(g, m, m.x + 9, m.y + m.h / 2 + 1);
    }
    // tetikleyiciler
    for (const e of this.triggers) {
      if (e.type === 'plate') {
        const ph = 9 - e.anim * 5;
        const by = e.y + e.h;
        g.fillStyle = '#2a2140';
        g.fillRect(e.x + 2, by - 4, e.w - 4, 4);
        g.fillStyle = e.on ? e.col : shade(e.col, -0.45);
        rr(g, e.x + 4, by - ph, e.w - 8, ph, 3);
        g.fill();
        if (e.on) g.drawImage(glow(e.col, 26, 0.45), e.x + e.w / 2 - 26, by - 30, 52, 52);
        if (e.who !== undefined) {
          g.fillStyle = PCOL[e.who];
          g.fillRect(e.x + e.w / 2 - 5, by - ph - 3, 10, 3);
        }
        if (e.need > 1) text(g, `×${e.need}`, e.x + e.w / 2, by - 18, { size: 15, color: e.col, weight: 800, stroke: 'rgba(0,0,0,.6)', sw: 4 });
      } else if (e.type === 'lever') {
        const bx = e.x + T / 2;
        const by = e.y + e.h;
        g.fillStyle = '#3b3352';
        rr(g, bx - 12, by - 8, 24, 8, 3);
        g.fill();
        g.strokeStyle = '#c8c4dc';
        g.lineWidth = 4;
        g.beginPath();
        g.moveTo(bx, by - 6);
        g.lineTo(bx + Math.sin(e.on ? 0.6 : -0.6) * 22, by - 6 - Math.cos(0.6) * 22);
        g.stroke();
        g.fillStyle = e.on ? e.col : shade(e.col, -0.4);
        g.beginPath();
        g.arc(bx + Math.sin(e.on ? 0.6 : -0.6) * 22, by - 6 - Math.cos(0.6) * 22, 6, 0, Math.PI * 2);
        g.fill();
        if (e.who !== undefined) {
          g.fillStyle = PCOL[e.who];
          g.fillRect(bx - 12, by - 3, 24, 3);
        }
      } else if (e.type === 'button') {
        const bx = e.x + T / 2;
        const by = e.y + e.h - 16;
        g.fillStyle = '#3b3352';
        rr(g, bx - 14, by - 10, 28, 24, 5);
        g.fill();
        g.fillStyle = e.on ? e.col : shade(e.col, -0.4);
        g.beginPath();
        g.arc(bx, by + 2, 8, 0, Math.PI * 2);
        g.fill();
        if (e.on) {
          const t = e.timer / (e.t || 3);
          g.strokeStyle = e.col;
          g.lineWidth = 4;
          g.beginPath();
          g.arc(bx, by + 2, 15, -Math.PI / 2, -Math.PI / 2 + t * Math.PI * 2);
          g.stroke();
        }
      }
    }
    // yaylar
    for (const s of this.springs) {
      const comp = s.t > 0 ? 6 : 0;
      const bx = s.x + T / 2;
      const by = s.y + T;
      g.strokeStyle = '#c8c4dc';
      g.lineWidth = 3;
      g.beginPath();
      for (let k = 0; k <= 4; k++) g.lineTo(bx + (k % 2 ? 8 : -8), by - 3 - k * (3.2 - comp / 6));
      g.stroke();
      g.fillStyle = '#ff6b7a';
      rr(g, bx - 15, by - 19 + comp, 30, 6, 3);
      g.fill();
    }
    // lazer yayıcıları
    for (const e of this.lasers) {
      g.fillStyle = '#3a3452';
      rr(g, e.x + 4, e.y + 4, T - 8, T - 8, 6);
      g.fill();
      const [dx, dy] = DIRV[e.dir];
      g.fillStyle = e.on ? '#ff3b5c' : '#6b2a3a';
      g.beginPath();
      g.arc(e.x + T / 2 + dx * 10, e.y + T / 2 + dy * 10, 6, 0, Math.PI * 2);
      g.fill();
      this.lights(g, e, e.x + 6, e.y - 6);
    }
    // bayraklar
    for (const f of this.flags) {
      const wave = Math.sin(this.time * 6) * 3;
      g.fillStyle = f.on ? '#46e38a' : '#6b6488';
      g.beginPath();
      g.moveTo(f.x + 2, f.y - 78);
      g.lineTo(f.x + 30, f.y - 70 + wave);
      g.lineTo(f.x + 2, f.y - 58);
      g.closePath();
      g.fill();
    }
    // çıkış ışığı
    const ex = this.L.exit;
    if (ex) {
      const n = this.players.filter((p) => !p.dead && overlap(p, ex)).length;
      g.drawImage(glow(n === 2 ? '#46e38a' : '#ffd23f', 40, 0.4 + 0.15 * Math.sin(this.time * 4)), ex.x + T / 2 - 40, ex.y + 4, 80, 80);
      text(g, `${n}/2`, ex.x + T / 2, ex.y - 22, { size: 18, color: n === 2 ? '#46e38a' : '#ffd23f', weight: 800, stroke: 'rgba(0,0,0,.6)', sw: 5 });
    }
    // elmaslar
    const gs = this.gemSprite();
    for (const gm of this.gems) {
      if (gm.got) continue;
      g.drawImage(gs, gm.x - 14, gm.y - 14 + Math.sin(this.time * 3 + gm.x) * 3, 28, 28);
    }
    // kasalar
    const cs = this.crateSprite();
    for (const k of this.crates) if (!k.dead) g.drawImage(cs, k.x, k.y, CS, CS);
    // oyuncular
    for (const pl of this.players) this.drawPlayer(g, pl);
    // lazer ışınları
    for (const e of this.lasers) {
      const b = e.beam;
      if (!b || (b.w < 1 && b.h < 1)) continue;
      const flick = 0.75 + 0.25 * Math.sin(this.time * 40);
      g.fillStyle = `rgba(255,59,92,${0.35 * flick})`;
      if (b.dx) g.fillRect(b.x, b.y - 4, b.w, b.h + 8);
      else g.fillRect(b.x - 4, b.y, b.w + 8, b.h);
      g.fillStyle = '#ffd0d8';
      if (b.dx) g.fillRect(b.x, b.y + 2, b.w, 2);
      else g.fillRect(b.x + 2, b.y, 2, b.h);
    }
  }

  drawSelect(g) {
    this.selBg.draw(g);
    const n = LEVELS.length;
    const cols = 3;
    const cw = 330;
    const ch = 170;
    const gap = 30;
    const x0 = (W - (cols * cw + (cols - 1) * gap)) / 2;
    const y0 = 180;
    for (let i = 0; i < n; i++) {
      const x = x0 + (i % cols) * (cw + gap);
      const y = y0 + Math.floor(i / cols) * (ch + gap);
      const open = i < this.prog.unlocked;
      const sel = i === this.sel;
      const best = this.prog.best[i];
      if (sel) g.drawImage(glow('#ffd23f', 120, 0.35), x + cw / 2 - 220, y + ch / 2 - 150, 440, 300);
      g.fillStyle = open ? (sel ? '#3e2f78' : '#2b2257') : '#1c1736';
      rr(g, x, y, cw, ch, 18);
      g.fill();
      g.strokeStyle = sel ? '#ffd23f' : 'rgba(255,255,255,.12)';
      g.lineWidth = sel ? 5 : 2;
      g.stroke();
      text(g, String(i + 1), x + 46, y + ch / 2, { size: 72, color: open ? '#ffd23f' : '#4b4470', weight: 800 });
      text(g, LEVELS[i].name, x + 96, y + 56, { size: 28, color: open ? '#ffffff' : '#5d5684', weight: 800, align: 'left' });
      if (!open) text(g, 'kilitli', x + 96, y + 100, { size: 20, color: '#5d5684', weight: 700, align: 'left' });
      else if (best) {
        const total = this.gemTotals[i];
        text(g, `✓ tamamlandı · ${fmtTime(best.time)}`, x + 96, y + 98, { size: 18, color: '#46e38a', weight: 700, align: 'left' });
        text(g, `elmas ${best.gems}/${total}`, x + 96, y + 128, { size: 18, color: '#7fe3ff', weight: 700, align: 'left' });
      } else text(g, 'yeni', x + 96, y + 100, { size: 20, color: '#ff9a3d', weight: 800, align: 'left' });
    }
    text(g, '◀ ▶  bölüm seç   ·   A  başla   ·   oyunda B basılı: bölümü baştan başlat', W / 2, H - 40, { size: 22, color: '#d9d4ff', weight: 700 });
    // köşede iki kahraman
    const bob = Math.sin(this.time * 3) * 4;
    this.drawPlayer(g, { p: 0, x: 120, y: H - 140 + bob, vx: 0, vy: 0, face: 1, squash: 0, walk: 0, ground: 1, holdB: 0 });
    this.drawPlayer(g, { p: 1, x: W - 150, y: H - 140 - bob, vx: 0, vy: 0, face: -1, squash: 0, walk: 0, ground: 1, holdB: 0 });
  }

  draw(g) {
    if (this.state === 'select' || !this.L) {
      this.drawSelect(g);
      this.pops.draw(g);
      return;
    }
    g.save();
    this.shake.apply(g);
    this.bg.draw(g);
    this.drawWorld(g);
    this.parts.draw(g);
    g.restore();
    this.pops.draw(g);
    // üst bilgi şeridi
    g.fillStyle = 'rgba(8,6,24,.6)';
    g.fillRect(0, 0, W, 36);
    text(g, `BÖLÜM ${this.li + 1}/${LEVELS.length} · ${this.L.def.name}`, 16, 19, { size: 21, color: '#ffffff', weight: 800, align: 'left' });
    const got = this.gems.filter((x) => x.got).length;
    g.drawImage(this.gemSprite(), W - 250, 5, 26, 26);
    text(g, `${got}/${this.gems.length}`, W - 220, 19, { size: 21, color: '#7fe3ff', weight: 800, align: 'left' });
    text(g, `düşüş ${this.levelDeaths}`, W - 16, 19, { size: 19, color: '#ffb3c0', weight: 700, align: 'right' });
    text(g, fmtTime(this.levelTime), W / 2 + 160, 19, { size: 20, color: '#d9d4ff', weight: 700 });
    if (this.hintT > 0 && this.state === 'play') {
      const a = Math.min(1, this.hintT);
      g.globalAlpha = a;
      g.fillStyle = 'rgba(8,6,24,.78)';
      rr(g, W / 2 - 520, H - 58, 1040, 44, 14);
      g.fill();
      text(g, this.L.def.hint, W / 2, H - 36, { size: 21, color: '#ffe9a8', weight: 700 });
      g.globalAlpha = 1;
    }
    if (this.state === 'intro') banner(g, `BÖLÜM ${this.li + 1}`, this.L.def.name, '#ffd23f', 1.6 - this.phaseT);
    if (this.state === 'clear' || this.state === 'done') {
      const ci = this.clearInfo || { got: 0, all: 0, time: 0, deaths: 0 };
      banner(g, 'BÖLÜM TAMAM!', `${fmtTime(ci.time)} · elmas ${ci.got}/${ci.all} · düşüş ${ci.deaths}`, '#46e38a', 3 - this.phaseT);
    }
  }
}

export default {
  id: 'platformer',
  name: 'Çifte Macera',
  icon: '🧗',
  tag: 'Ortak platform bulmacası',
  mode: 'coop',
  cat: 'takim',
  color: '#46e38a',
  desc: 'Bölüm bölüm ilerleyen ortak platform macerası. Birbirinizin kafasına çıkın, kasaları itin, plakalara basıp kapıları açın, asansörleri çağırın, lazerleri atlatın. Her bölüm ancak birlikte çözülür — ikiniz de çıkış kapısına ulaşınca bölüm biter.',
  howto: [
    '◀ ▶ yürü · A zıpla (uzun bas: daha yükseğe)',
    'B: şalter ve düğmeleri kullan',
    'Arkadaşının kafasına çık: tek başına çıkamayacağın yerlere ulaş',
    'Kasaları it: basamak yap ya da plakaya koy',
    'Pembe alandan yalnız pembe, mavi alandan yalnız mavi geçer',
    'B basılı tut: bölümü baştan başlat · Açılan bölümler bu TV’de saklanır',
  ],
  keys: '1. oyuncu A / D, zıpla W ya da F, kullan G · 2. oyuncu ← / →, zıpla ↑ ya da K, kullan L',
  controller: { layout: 'dpad', dirs: 'lr', a: 'ZIPLA', b: 'KULLAN' },
  create: (api) => new CoopGame(api),
};
