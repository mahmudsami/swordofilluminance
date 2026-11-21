// YILDIZ NÖBETİ — iki gemi omuz omuza: dalga dalga gelen uzaylıları durdurun, sonunda dev ana gemiyi indirin.
// Takım oyunu: biri düşerse diğeri devam eder, kalp toplayan takım arkadaşını geri getirir.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, rand, pick, clamp, sprite, glow, Layer } from '../host/gfx.js';

const SHIP_R = 9; // isabet yarıçapı (bağışlayıcı)
const WAVES = [
  ['line', 'sine', 'line', 'dive', 'sine', 'turret', 'v', 'dive'],
  ['sine', 'dive', 'turret', 'v', 'dive', 'sine', 'turret', 'v', 'dive', 'line'],
  ['v', 'turret', 'dive', 'sine', 'turret', 'dive', 'v', 'turret', 'dive', 'sine', 'v'],
];
const ITEM_COL = { power: '#ffd23f', bomb: '#ff6a3d', life: '#ff4f7b', shield: '#2fc7ff' };
const ITEM_TXT = { power: 'GÜÇ', bomb: 'SÜPER', life: 'CAN', shield: 'KALKAN' };

// ------------------------------------------------------------------ önceden çizilmiş görüntüler
function alienSprite(type, frame) {
  const S = 76;
  return sprite(`alien|${type}|${frame}`, S, S, (g) => {
    drawAlien(g, { type, x: S / 2, y: S / 2, seed: 0, flash: 0, hp: 1, max: 1 }, (frame / 4) * ((Math.PI * 2) / 10), true);
  });
}
function turretSprite() {
  return sprite('turret', 110, 76, (g) => drawAlien(g, { type: 'turret', x: 55, y: 34, seed: 0, flash: 0, hp: 1, max: 1 }, 0, true));
}
function shipSprite(color) {
  return sprite(`ship|${color}`, 64, 64, (g) => drawShip(g, 32, 30, color, 0, 1, false, true));
}
function ebSprite(r) {
  return sprite(`eb|${r}`, (r + 3) * 2, (r + 3) * 2, (g) => {
    g.fillStyle = '#ff4f9a';
    g.beginPath();
    g.arc(r + 3, r + 3, r + 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffe0ef';
    g.beginPath();
    g.arc(r + 3, r + 3, Math.max(1, r - 2), 0, Math.PI * 2);
    g.fill();
  });
}
function itemSpriteS(type) {
  return sprite(`sitem|${type}`, 60, 60, (g) => {
    const c = ITEM_COL[type];
    g.drawImage(glow(c, 30, 0.7), 0, 0, 60, 60);
    g.fillStyle = shade(c, -0.5);
    g.beginPath();
    g.arc(30, 30, 18, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = c;
    g.lineWidth = 3;
    g.stroke();
    text(g, { power: 'P', bomb: 'S', life: '♥', shield: 'K' }[type], 30, 32, { size: 22, color: c, weight: 800 });
  });
}
function bossSprite() {
  return sprite('boss', 340, 110, (g) => {
    g.translate(170, 55);
    g.fillStyle = '#2b2150';
    g.beginPath();
    g.moveTo(-160, -10);
    g.lineTo(-60, -50);
    g.lineTo(60, -50);
    g.lineTo(160, -10);
    g.lineTo(110, 40);
    g.lineTo(-110, 40);
    g.closePath();
    g.fill();
    g.fillStyle = '#5b3fbf';
    g.beginPath();
    g.moveTo(-120, -6);
    g.lineTo(-50, -36);
    g.lineTo(50, -36);
    g.lineTo(120, -6);
    g.lineTo(84, 28);
    g.lineTo(-84, 28);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffd23f';
    for (const sx of [-70, 70]) {
      g.beginPath();
      g.arc(sx, 24, 9, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function drawShip(g, x, y, color, t, alpha = 1, shield = false, noFlame = false) {
  g.save();
  g.translate(x, y);
  g.globalAlpha = alpha;
  // motor alevi
  const fl = noFlame ? 0 : 12 + Math.sin(t * 40) * 4;
  g.fillStyle = '#ffb02e';
  g.beginPath();
  g.moveTo(-7, 18);
  g.lineTo(0, 18 + fl);
  g.lineTo(7, 18);
  g.fill();
  g.fillStyle = '#fff3b0';
  g.beginPath();
  g.moveTo(-3, 18);
  g.lineTo(0, 18 + fl * 0.6);
  g.lineTo(3, 18);
  g.fill();
  // kanatlar
  g.fillStyle = shade(color, -0.35);
  g.beginPath();
  g.moveTo(0, -6);
  g.lineTo(24, 16);
  g.lineTo(18, 22);
  g.lineTo(0, 14);
  g.lineTo(-18, 22);
  g.lineTo(-24, 16);
  g.closePath();
  g.fill();
  // gövde
  const grad = g.createLinearGradient(0, -26, 0, 20);
  grad.addColorStop(0, shade(color, 0.4));
  grad.addColorStop(1, shade(color, -0.2));
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(0, -26);
  g.quadraticCurveTo(11, -6, 9, 20);
  g.lineTo(-9, 20);
  g.quadraticCurveTo(-11, -6, 0, -26);
  g.fill();
  // kokpit
  g.fillStyle = '#1d2b45';
  g.beginPath();
  g.ellipse(0, -6, 4.5, 9, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(160,220,255,.7)';
  g.beginPath();
  g.ellipse(-1.5, -9, 1.6, 4, 0, 0, Math.PI * 2);
  g.fill();
  if (shield) {
    g.strokeStyle = `rgba(127,227,255,${0.55 + 0.25 * Math.sin(t * 12)})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 34, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
}

function drawAlien(g, e, t, forSprite = false) {
  g.save();
  g.translate(e.x, e.y);
  g.scale(1.2, 1.2);
  if (e.flash > 0) g.globalCompositeOperation = 'lighter';
  if (e.type === 'turret') {
    g.fillStyle = '#3b2d6b';
    rr(g, -42, -22, 84, 44, 16);
    g.fill();
    g.fillStyle = '#7a5cff';
    rr(g, -34, -16, 68, 32, 12);
    g.fill();
    g.fillStyle = '#ff4f7b';
    for (const sx of [-22, 0, 22]) {
      g.beginPath();
      g.arc(sx, 4, 6 + Math.sin(t * 6 + sx) * 1.5, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#2b2150';
    g.fillRect(-6, 18, 12, 12);
    if (!forSprite) {
      g.fillStyle = 'rgba(0,0,0,.5)';
      g.fillRect(-30, -32, 60, 5);
      g.fillStyle = '#46e38a';
      g.fillRect(-30, -32, 60 * (e.hp / e.max), 5);
    }
  } else {
    const col = e.type === 'dive' ? '#ff7a3d' : e.type === 'sine' ? '#46e38a' : '#c08bff';
    const s = e.type === 'dive' ? 1.15 : 1;
    g.scale(s, s);
    const flap = Math.sin(t * 10 + e.seed) * 4;
    g.fillStyle = shade(col, -0.35);
    g.beginPath();
    g.moveTo(-8, -2);
    g.lineTo(-24, -10 + flap);
    g.lineTo(-18, 8);
    g.closePath();
    g.moveTo(8, -2);
    g.lineTo(24, -10 + flap);
    g.lineTo(18, 8);
    g.closePath();
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(0, 0, 14, 12, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#141225';
    g.beginPath();
    g.ellipse(0, 1, 8, 6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(0, 1, 3, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

class ShooterGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.stars = Array.from({ length: 120 }, () => ({ x: rand(0, W), y: rand(0, H), z: rand(0.2, 1) }));
    this.ships = [0, 1].map((p) => ({
      p, x: p === 0 ? W / 2 - 120 : W / 2 + 120, y: H - 110, lives: 3, bombs: 2, level: 1, score: 0, kills: 0,
      alive: true, out: false, inv: 2, respawn: 0, cool: 0, shield: 0, tilt: 0,
    }));
    this.enemies = [];
    this.pb = [];
    this.eb = [];
    this.items = [];
    this.boss = null;
    this.flash = 0;
    this.bg = new Layer(W, H, (g) => {
      const bg = g.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#0b0626');
      bg.addColorStop(1, '#170b33');
      g.fillStyle = bg;
      g.fillRect(0, 0, W, H);
      const neb = g.createRadialGradient(W * 0.75, H * 0.3, 10, W * 0.75, H * 0.3, 420);
      neb.addColorStop(0, 'rgba(180,92,255,.18)');
      neb.addColorStop(1, 'rgba(180,92,255,0)');
      g.fillStyle = neb;
      g.fillRect(0, 0, W, H);
    });
    this.wave = 0;
    this.startWave(0);
    this.sendInfo();
  }

  sendInfo() {
    for (const s of this.ships) this.api.info(s.p, `${this.boss ? 'ANA GEMİ' : `Dalga ${this.wave + 1}/${WAVES.length}`} · ♥ ${s.lives} · Süper ${s.bombs}`);
  }

  startWave(i) {
    this.wave = i;
    this.queue = [...WAVES[i]];
    this.groupT = 2.2;
    this.phase = 'intro';
    this.phaseT = 2.2;
    this.sendInfo();
  }

  // ---------------------------------------------------------------- düşmanlar
  spawnGroup(kind) {
    const add = (o) => this.enemies.push({ hp: 1, max: 1, r: 21, t: 0, fire: rand(1.2, 3.5), flash: 0, seed: rand(0, 6), ...o });
    if (kind === 'line') {
      const n = 7;
      for (let i = 0; i < n; i++) add({ type: 'line', x: 160 + i * ((W - 320) / (n - 1)), y: -30 - (i % 2) * 40, bx: 160 + i * ((W - 320) / (n - 1)) });
    } else if (kind === 'sine') {
      const fromLeft = Math.random() < 0.5;
      const y0 = rand(120, 260);
      for (let i = 0; i < 8; i++) add({ type: 'sine', x: fromLeft ? -40 - i * 60 : W + 40 + i * 60, y: y0, by: y0, dir: fromLeft ? 1 : -1 });
    } else if (kind === 'v') {
      const cx = rand(350, W - 350);
      for (let i = -3; i <= 3; i++) add({ type: 'line', x: cx + i * 55, y: -30 - Math.abs(i) * 40, bx: cx + i * 55 });
    } else if (kind === 'dive') {
      for (let i = 0; i < 4; i++) add({ type: 'dive', x: rand(150, W - 150), y: -30 - i * 30, hp: 2, max: 2, state: 'in', hover: 0.8 + i * 0.35 });
    } else if (kind === 'turret') {
      const n = this.wave >= 1 ? 2 : 1;
      for (let i = 0; i < n; i++) add({ type: 'turret', x: n === 1 ? W / 2 : 380 + i * 520, y: -50, hp: 16 + this.wave * 4, max: 16 + this.wave * 4, r: 46, fire: 1.4, stay: 14 });
    }
  }

  aim(e, speed, spread = 0, count = 1) {
    const targets = this.ships.filter((s) => s.alive);
    if (!targets.length) return;
    const t = targets.reduce((a, b) => (Math.hypot(a.x - e.x, a.y - e.y) < Math.hypot(b.x - e.x, b.y - e.y) ? a : b));
    const base = Math.atan2(t.y - e.y, t.x - e.x);
    for (let i = 0; i < count; i++) {
      const a = base + (count > 1 ? (i - (count - 1) / 2) * spread : 0);
      this.eb.push({ x: e.x, y: e.y + 10, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 6 });
    }
  }

  moveEnemy(e, dt) {
    e.t += dt;
    e.flash = Math.max(0, e.flash - dt);
    const sp = 1 + this.wave * 0.15;
    if (e.type === 'line') {
      // önce bir süre yukarıda salınır, sonra aşağı süzülür
      const hold = e.t > 1.2 && e.t < 7;
      e.y += (hold ? 6 : e.t >= 7 ? 110 : 120) * sp * dt;
      e.x = e.bx + Math.sin(e.t * 1.6 + e.seed) * 60;
      e.fire -= dt;
      if (e.fire <= 0 && e.y > 40) {
        e.fire = rand(2.6, 5) / sp;
        this.aim(e, 230);
      }
    } else if (e.type === 'sine') {
      e.x += e.dir * 210 * dt;
      e.y = e.by + Math.sin(e.t * 3 + e.seed * 0.2) * 70 + e.t * 12;
      e.fire -= dt;
      if (e.fire <= 0 && e.x > 0 && e.x < W) {
        e.fire = rand(2.5, 5);
        this.eb.push({ x: e.x, y: e.y, vx: 0, vy: 260, r: 6 });
      }
    } else if (e.type === 'dive') {
      if (e.state === 'in') {
        e.y += 160 * dt;
        if (e.y > 110) e.state = 'hover';
      } else if (e.state === 'hover') {
        e.hover -= dt;
        e.x += Math.sin(e.t * 5) * 40 * dt;
        if (e.hover <= 0) {
          const targets = this.ships.filter((s) => s.alive);
          const t = targets.length ? pick(targets) : { x: W / 2, y: H };
          const a = Math.atan2(t.y - e.y, t.x - e.x);
          e.vx = Math.cos(a) * 400 * sp;
          e.vy = Math.sin(a) * 400 * sp;
          e.state = 'dive';
          this.aim(e, 280);
        }
      } else {
        e.x += e.vx * dt;
        e.y += e.vy * dt;
      }
    } else if (e.type === 'turret') {
      if (e.y < 140) e.y += 90 * dt;
      e.x += Math.sin(e.t * 0.8 + e.seed) * 50 * dt;
      e.stay -= dt;
      if (e.stay <= 0) e.y += 120 * dt;
      e.fire -= dt;
      if (e.fire <= 0 && e.y > 60) {
        e.fire = 1.7 - this.wave * 0.2;
        this.aim(e, 250, 0.22, 3);
        this.api.sfx('shoot');
      }
    }
  }

  spawnBoss() {
    this.boss = { x: W / 2, y: -120, hp: 360, max: 360, t: 0, pat: 0, patT: 3, fire: 0, flash: 0, ang: 0 };
    this.sendInfo();
  }

  updateBoss(dt) {
    const b = this.boss;
    b.t += dt;
    b.flash = Math.max(0, b.flash - dt);
    const rage = b.hp < b.max / 2 ? 1.35 : 1;
    if (b.y < 140) {
      b.y += 70 * dt;
      return;
    }
    b.x = W / 2 + Math.sin(b.t * 0.5 * rage) * 380;
    b.patT -= dt;
    if (b.patT <= 0) {
      b.pat = (b.pat + 1) % 4;
      b.patT = b.pat === 3 ? 2.6 : 3.2;
      b.fire = 0;
      if (b.pat === 2) {
        for (let i = 0; i < 4; i++) this.enemies.push({ type: 'dive', x: b.x + (i - 1.5) * 70, y: b.y + 40, hp: 2, max: 2, r: 18, t: 0, fire: 9, flash: 0, seed: i, state: 'hover', hover: 0.6 + i * 0.25 });
      }
    }
    b.fire -= dt;
    if (b.pat === 0 && b.fire <= 0) {
      b.fire = 0.9 / rage;
      const n = 18;
      const off = b.t;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * Math.PI * 2;
        this.eb.push({ x: b.x, y: b.y + 20, vx: Math.cos(a) * 190, vy: Math.sin(a) * 190, r: 7 });
      }
      this.api.sfx('shoot');
    } else if (b.pat === 1 && b.fire <= 0) {
      b.fire = 0.45 / rage;
      this.aim({ x: b.x - 70, y: b.y + 30 }, 320, 0.18, 3);
      this.aim({ x: b.x + 70, y: b.y + 30 }, 320, 0.18, 3);
      this.api.sfx('shoot');
    } else if (b.pat === 3 && b.fire <= 0) {
      b.fire = 0.07 / rage;
      b.ang += 0.38;
      for (const k of [0, Math.PI]) this.eb.push({ x: b.x, y: b.y + 20, vx: Math.cos(b.ang + k) * 230, vy: Math.sin(b.ang + k) * 230, r: 6 });
    }
  }

  // ---------------------------------------------------------------- oyuncular
  onKey(p, k, down) {
    if (!down || k !== 'b') return;
    const s = this.ships[p];
    if (!s.alive || s.bombs <= 0 || this.phase === 'won' || this.phase === 'lost') return;
    s.bombs--;
    this.flash = 0.6;
    s.inv = Math.max(s.inv, 1);
    for (const b of this.eb) this.parts.burst(b.x, b.y, 1, '#ffb3d0', { speed: 80, size: 4, life: 0.4, gravity: 0 });
    this.eb = [];
    for (const e of [...this.enemies]) this.damage(e, 12, s);
    if (this.boss && this.boss.y >= 100) this.damageBoss(30, s);
    this.shake.add(12, 0.5);
    this.api.sfx('boom');
    this.api.buzz(p, 200);
    this.sendInfo();
  }

  updateShip(s, dt) {
    if (!s.alive) {
      if (!s.out) {
        s.respawn -= dt;
        if (s.respawn <= 0) {
          s.alive = true;
          s.x = s.p === 0 ? W / 2 - 120 : W / 2 + 120;
          s.y = H - 100;
          s.inv = 2.5;
        }
      }
      return;
    }
    s.inv = Math.max(0, s.inv - dt);
    s.shield = Math.max(0, s.shield - dt);
    const a = this.api.axis(s.p);
    s.x = clamp(s.x + a.x * 430 * dt, 30, W - 30);
    s.y = clamp(s.y + a.y * 430 * dt, H * 0.32, H - 40);
    s.tilt += (a.x - s.tilt) * Math.min(1, dt * 10);
    s.cool -= dt;
    const inp = this.api.input[s.p];
    if (inp.a && s.cool <= 0) {
      s.cool = 0.11;
      const sh = (dx, ang) => this.pb.push({ x: s.x + dx, y: s.y - 24, vx: Math.sin(ang) * 950, vy: -Math.cos(ang) * 950, p: s.p });
      if (s.level === 1) sh(0, 0);
      else if (s.level === 2) { sh(-8, 0); sh(8, 0); }
      else { sh(0, 0); sh(-8, -0.16); sh(8, 0.16); }
      this.api.sfx('move');
    }
  }

  hitShip(s) {
    if (!s.alive || s.inv > 0) return;
    if (s.shield > 0) {
      s.shield = 0;
      s.inv = 1;
      this.api.sfx('steel');
      return;
    }
    s.alive = false;
    s.lives--;
    s.level = Math.max(1, s.level - 1);
    s.respawn = 2;
    this.parts.burst(s.x, s.y, 40, [PCOL[s.p], '#fff', '#ffd23f'], { speed: 380, size: 8, life: 1, gravity: 0 });
    this.shake.add(10, 0.4);
    this.api.sfx('die');
    this.api.buzz(s.p, 400);
    if (s.lives <= 0) {
      s.out = true;
      this.pops.add(`${this.api.players[s.p].name} DÜŞTÜ — kalp topla, geri getir!`, W / 2, H / 2 + 40, PCOL[s.p], 32, 2.2);
    }
    this.sendInfo();
  }

  damage(e, n, by) {
    e.hp -= n;
    e.flash = 0.06;
    if (e.hp > 0) return;
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    const pts = e.type === 'turret' ? 500 : e.type === 'dive' ? 150 : 100;
    if (by) {
      by.score += pts;
      by.kills++;
    }
    this.parts.burst(e.x, e.y, e.type === 'turret' ? 36 : 14, ['#ffd23f', '#ff7a3d', '#fff', '#c08bff'], { speed: e.type === 'turret' ? 340 : 220, size: 7, life: 0.6, gravity: 0 });
    this.api.sfx(e.type === 'turret' ? 'boom' : 'smallboom');
    const chance = e.type === 'turret' ? 0.9 : e.type === 'dive' ? 0.14 : 0.06;
    if (Math.random() < chance) {
      const needLife = this.ships.some((s) => s.out || s.lives <= 1);
      const type = needLife && Math.random() < 0.45 ? 'life' : pick(['power', 'power', 'bomb', 'shield', 'life']);
      this.items.push({ type, x: e.x, y: e.y, vy: 90, t: 0 });
    }
  }

  damageBoss(n, by) {
    const b = this.boss;
    b.hp -= n;
    b.flash = 0.05;
    if (by) by.score += n * 5;
    if (b.hp <= 0 && this.phase !== 'won') {
      for (let i = 0; i < 6; i++) this.parts.burst(b.x + rand(-120, 120), b.y + rand(-40, 40), 30, ['#ffd23f', '#ff7a3d', '#fff', '#c08bff'], { speed: 500, size: 10, life: 1.2, gravity: 0 });
      this.shake.add(20, 1);
      this.api.sfx('boom');
      this.api.buzz(0, 600);
      this.api.buzz(1, 600);
      if (by) by.score += 5000;
      this.boss = null;
      this.eb = [];
      this.phase = 'won';
      this.phaseT = 3.5;
      this.api.sfx('win');
    }
  }

  pickItem(s, it) {
    this.api.sfx('pickup');
    this.api.buzz(s.p, 50);
    if (it.type === 'power') s.level = Math.min(3, s.level + 1);
    else if (it.type === 'bomb') s.bombs = Math.min(5, s.bombs + 1);
    else if (it.type === 'shield') s.shield = 12;
    else if (it.type === 'life') {
      // önce düşmüş arkadaşı kaldır
      const mate = this.ships[1 - s.p];
      if (mate.out) {
        mate.out = false;
        mate.lives = 1;
        mate.respawn = 0.5;
        this.pops.add(`${this.api.players[mate.p].name} GERİ DÖNDÜ!`, W / 2, H / 2, PCOL[mate.p], 40, 1.6);
      } else s.lives++;
    }
    this.pops.add(ITEM_TXT[it.type], it.x, it.y - 20, ITEM_COL[it.type], 26, 0.8);
    this.sendInfo();
  }

  // ---------------------------------------------------------------- döngü
  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    this.flash = Math.max(0, this.flash - dt);
    for (const st of this.stars) {
      st.y += (40 + st.z * 160) * dt;
      if (st.y > H) {
        st.y = 0;
        st.x = rand(0, W);
      }
    }
    if (this.phase === 'won' || this.phase === 'lost') {
      const won = this.phase === 'won';
      this.phaseT -= dt;
      for (const s of this.ships) if (s.alive && this.phase === 'won') s.y -= (s.y > 300 ? 120 : 0) * dt;
      if (this.phaseT <= 0) {
        const pn = this.api.players;
        const detail = `${pn[0].name}: ${this.ships[0].score} puan · ${pn[1].name}: ${this.ships[1].score} puan`;
        this.phase = 'done';
        this.api.end(won ? { coop: true, win: true, title: 'Ana gemi düştü!', detail } : { coop: true, win: false, title: 'Filo düştü!', detail: `${this.boss ? 'Ana gemide' : `${this.wave + 1}. dalgada`} kaldınız · ${detail}` });
      }
      return;
    }
    if (this.phase === 'done') return;
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
    }

    for (const s of this.ships) this.updateShip(s, dt);

    if (this.phase === 'play') {
      if (this.queue.length) {
        this.groupT -= dt;
        if (this.groupT <= 0) {
          this.spawnGroup(this.queue.shift());
          this.groupT = Math.max(2.2, 4 - this.wave * 0.5);
        }
      } else if (!this.enemies.length && !this.boss) {
        if (this.wave + 1 < WAVES.length) this.startWave(this.wave + 1);
        else {
          this.phase = 'bossintro';
          this.phaseT = 2.5;
          this.spawnBoss();
          this.api.sfx('garbage');
        }
      }
    } else if (this.phase === 'bossintro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'boss';
    }
    if (this.boss && this.phase === 'boss') this.updateBoss(dt);
    else if (this.boss) this.boss.y = Math.min(140, this.boss.y + 70 * dt);

    for (const e of this.enemies) this.moveEnemy(e, dt);
    this.enemies = this.enemies.filter((e) => e.y < H + 60 && e.x > -600 && e.x < W + 600 && !(e.type === 'sine' && e.t > 4 && (e.x < -50 || e.x > W + 50)));

    // oyuncu mermileri
    for (const b of this.pb) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.pb = this.pb.filter((b) => {
      if (b.y < -20) return false;
      for (const e of this.enemies) {
        if (Math.hypot(e.x - b.x, e.y - b.y) < e.r + 4) {
          this.damage(e, 1, this.ships[b.p]);
          this.parts.burst(b.x, b.y, 2, '#fff3b0', { speed: 100, size: 3, life: 0.2, gravity: 0 });
          return false;
        }
      }
      const bo = this.boss;
      if (bo && bo.y > 60 && Math.abs(b.x - bo.x) < 120 && Math.abs(b.y - bo.y) < 50) {
        this.damageBoss(1, this.ships[b.p]);
        this.parts.burst(b.x, b.y, 2, '#fff3b0', { speed: 100, size: 3, life: 0.2, gravity: 0 });
        return false;
      }
      return true;
    });

    // düşman mermileri
    for (const b of this.eb) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }
    this.eb = this.eb.filter((b) => {
      if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
      for (const s of this.ships) {
        if (s.alive && Math.hypot(s.x - b.x, s.y - b.y) < SHIP_R + b.r) {
          this.hitShip(s);
          if (!s.alive || s.inv > 0) return false;
        }
      }
      return true;
    });

    // çarpışma: gemi - düşman
    for (const s of this.ships) {
      if (!s.alive) continue;
      for (const e of this.enemies) if (Math.hypot(s.x - e.x, s.y - e.y) < e.r + SHIP_R + 4) {
        this.hitShip(s);
        if (e.type !== 'turret') this.damage(e, 99, null);
        break;
      }
    }

    // eşyalar
    for (const it of this.items) {
      it.t += dt;
      it.y += it.vy * dt;
      it.x += Math.sin(it.t * 3) * 30 * dt;
    }
    this.items = this.items.filter((it) => {
      if (it.y > H + 30) return false;
      for (const s of this.ships) if (s.alive && Math.hypot(s.x - it.x, s.y - it.y) < 40) {
        this.pickItem(s, it);
        return false;
      }
      return true;
    });

    if (this.ships.every((s) => s.out)) {
      this.phase = 'lost';
      this.phaseT = 3;
      this.api.sfx('lose');
    }
  }

  demo() {
    this.phase = 'play';
    this.spawnGroup('v');
    this.spawnGroup('turret');
    for (const e of this.enemies) e.y = e.type === 'turret' ? 150 : 260 + Math.abs(e.x - W / 2) * 0.2;
    this.ships[0].y -= 40;
    for (let i = 0; i < 5; i++) this.pb.push({ x: this.ships[0].x, y: this.ships[0].y - 60 - i * 70, vx: 0, vy: 0, p: 0 });
    this.eb.push({ x: 700, y: 400, vx: 0, vy: 0, r: 6 }, { x: 760, y: 420, vx: 0, vy: 0, r: 6 });
  }

  // ---------------------------------------------------------------- çizim
  drawBoss(g, b) {
    const spr = bossSprite();
    if (b.flash > 0) g.globalCompositeOperation = 'lighter';
    g.drawImage(spr, b.x - 170, b.y - 55, spr.lw, spr.lh);
    g.globalCompositeOperation = 'source-over';
    const pulse = 14 + Math.sin(this.time * 6) * 3;
    const gl = glow('#ff4f7b', 60, 0.8);
    g.drawImage(gl, b.x - 60, b.y - 60, 120, 120);
    g.fillStyle = '#ff4f7b';
    g.beginPath();
    g.arc(b.x, b.y, pulse + 6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(b.x, b.y, pulse * 0.45, 0, Math.PI * 2);
    g.fill();
  }

  drawHud(g) {
    for (const s of this.ships) {
      const left = s.p === 0;
      const x = left ? 20 : W - 20;
      const al = left ? 'left' : 'right';
      text(g, this.api.players[s.p].name, x, 28, { size: 28, color: PCOL[s.p], weight: 800, align: al });
      text(g, String(s.score), x, 58, { size: 22, color: '#fff', weight: 700, align: al });
      for (let i = 0; i < s.lives; i++) {
        const hx = left ? x + 170 + i * 24 : x - 170 - i * 24;
        g.fillStyle = '#ff4f7b';
        g.beginPath();
        g.moveTo(hx, 34);
        g.bezierCurveTo(hx - 14, 22, hx - 8, 12, hx, 20);
        g.bezierCurveTo(hx + 8, 12, hx + 14, 22, hx, 34);
        g.fill();
      }
      if (s.out) text(g, 'DÜŞTÜ', left ? x + 170 : x - 170, 26, { size: 18, color: '#ff6b7a', weight: 800, align: al });
      for (let i = 0; i < s.bombs; i++) {
        const bx = left ? x + 170 + i * 20 : x - 170 - i * 20;
        g.fillStyle = '#ff6a3d';
        g.beginPath();
        g.arc(bx, 52, 7, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (this.boss) {
      const b = this.boss;
      rr(g, W / 2 - 220, 18, 440, 18, 9);
      g.fillStyle = 'rgba(255,255,255,.1)';
      g.fill();
      rr(g, W / 2 - 220, 18, 440 * Math.max(0, b.hp / b.max), 18, 9);
      g.fillStyle = '#ff4f7b';
      g.fill();
      text(g, 'ANA GEMİ', W / 2, 52, { size: 18, color: '#ffb3c8', weight: 800 });
    } else {
      text(g, `DALGA ${this.wave + 1} / ${WAVES.length}`, W / 2, 30, { size: 26, color: '#a7a2d1', weight: 800 });
    }
  }

  draw(g) {
    this.bg.draw(g);
    g.fillStyle = 'rgba(255,255,255,.75)';
    for (const st of this.stars) g.fillRect(st.x, st.y, st.z * 2.5, st.z * 2.5 + (st.z > 0.8 ? 3 : 0));
    g.save();
    this.shake.apply(g);
    for (const it of this.items) {
      const spr = itemSpriteS(it.type);
      g.drawImage(spr, it.x - 30, it.y - 30, 60, 60);
    }
    if (this.boss) this.drawBoss(g, this.boss);
    const frame = Math.floor(this.time * 8) % 4;
    for (const e of this.enemies) {
      if (e.flash > 0) g.globalCompositeOperation = 'lighter';
      if (e.type === 'turret') {
        const spr = turretSprite();
        g.drawImage(spr, e.x - 55, e.y - 34, spr.lw, spr.lh);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(0,0,0,.5)';
        g.fillRect(e.x - 36, e.y - 40, 72, 6);
        g.fillStyle = '#46e38a';
        g.fillRect(e.x - 36, e.y - 40, 72 * (e.hp / e.max), 6);
      } else {
        const spr = alienSprite(e.type, (frame + (e.seed | 0)) % 4);
        g.drawImage(spr, e.x - 38, e.y - 38, 76, 76);
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.fillStyle = '#ffd6e2';
    for (const b of this.pb) if (b.p === 0) g.fillRect(b.x - 2.5, b.y - 9, 5, 18);
    g.fillStyle = '#c2f0ff';
    for (const b of this.pb) if (b.p === 1) g.fillRect(b.x - 2.5, b.y - 9, 5, 18);
    for (const s of this.ships) {
      if (!s.alive) continue;
      const blink = s.inv > 0 && Math.floor(this.time * 14) % 2;
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.tilt * 0.18);
      g.scale(1.25, 1.25);
      if (blink) g.globalAlpha = 0.35;
      // motor alevi
      const fl = 12 + Math.sin(this.time * 40) * 4;
      g.fillStyle = '#ffb02e';
      g.beginPath();
      g.moveTo(-7, 18);
      g.lineTo(0, 18 + fl);
      g.lineTo(7, 18);
      g.fill();
      g.fillStyle = '#fff3b0';
      g.beginPath();
      g.moveTo(-3, 18);
      g.lineTo(0, 18 + fl * 0.6);
      g.lineTo(3, 18);
      g.fill();
      g.drawImage(shipSprite(PCOL[s.p]), -32, -30, 64, 64);
      if (s.shield > 0) {
        g.strokeStyle = `rgba(127,227,255,${0.55 + 0.25 * Math.sin(this.time * 12)})`;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(0, 0, 34, 0, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }
    for (const b of this.eb) {
      const spr = ebSprite(b.r);
      g.drawImage(spr, b.x - spr.lw / 2, b.y - spr.lh / 2, spr.lw, spr.lh);
    }
    this.parts.draw(g);
    g.restore();
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,255,255,${this.flash * 0.8})`;
      g.fillRect(0, 0, W, H);
    }
    this.pops.draw(g);
    this.drawHud(g);
    if (this.phase === 'intro') banner(g, `DALGA ${this.wave + 1}`, this.wave === 0 ? 'Omuz omuza savaşın!' : 'Daha hızlı geliyorlar!', '#ffd23f', 2.2 - this.phaseT);
    if (this.phase === 'bossintro') banner(g, 'DİKKAT: ANA GEMİ!', 'Birlikte ateş edin!', '#ff4f7b', 2.5 - this.phaseT);
    if (this.phase === 'won') banner(g, 'ZAFER!', 'Galaksi güvende', '#46e38a', 3.5 - this.phaseT);
    if (this.phase === 'lost') banner(g, 'FİLO DÜŞTÜ', 'Bir dahaki sefere…', '#ff5a5a', 3 - this.phaseT);
  }
}

export default {
  id: 'shooter',
  name: 'Yıldız Nöbeti',
  icon: '🚀',
  tag: 'Birlikte uzay savaşı',
  mode: 'coop',
  cat: 'takim',
  color: '#7a5cff',
  desc: 'İki gemi yan yana! Üç dalga uzaylıyı geri püskürtün, sonunda dev ana gemiyi birlikte indirin. Biriniz düşerse diğeri kalp toplayıp onu geri getirebilir.',
  howto: ['Yön tuşları: uç (çapraz da olur)', 'A basılı tut: ateş', 'B: süper bomba — ekrandaki mermileri siler', 'P: güç · K: kalkan · S: süper · ♥: can / arkadaşını kurtar', '3 dalga + ana gemi'],
  keys: '1. oyuncu WASD + F (ateş) / G (süper) · 2. oyuncu Oklar + K / L',
  controller: { layout: 'dpad', dirs: 8, a: 'ATEŞ', b: 'SÜPER' },
  create: (api) => new ShooterGame(api),
};
