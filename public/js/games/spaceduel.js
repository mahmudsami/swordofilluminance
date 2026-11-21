// UZAY DÜELLOSU — ortadaki yıldızın çekim alanında iki gemi it dalaşı. 5 vuruşa ulaşan kazanır.
// Ekranın bir kenarından çıkan karşıdan girer. Yıldıza düşen patlar!
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp, sprite, Layer, glow, angDiff } from '../host/gfx.js';

const SX = W / 2;
const SY = 380;
const SR = 34; // yıldız yarıçapı
const GM = 2.6e6; // çekim gücü
const TARGET = 5;
const SHIP_R = 16;

class SpaceDuelGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.score = [0, 0];
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.stars = Array.from({ length: 140 }, (_, i) => ({ x: (i * 197) % W, y: (i * 89 + (i % 7) * 53) % H, z: 0.3 + ((i * 37) % 70) / 100 }));
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.ships = [0, 1].map((p) => this.mkShip(p));
    this.bullets = [];
    this.phase = 'play';
    this.info();
  }

  mkShip(p) {
    // yıldızın etrafında yörüngeye yakın başlangıç
    // ekrana sığan dairesel yörünge (kenardan sarıp düzeni bozmasın)
    const x = p === 0 ? SX - 290 : SX + 290;
    const y = SY;
    // yıldız etrafında dairesel yörünge hızı (motor kullanmadan düşmesin)
    const dx = x - SX;
    const dy = y - SY;
    const d = Math.hypot(dx, dy);
    const v = Math.sqrt(GM / d) * 0.97;
    const vx = (-dy / d) * v;
    const vy = (dx / d) * v;
    const ang = Math.atan2(vy, vx);
    return { p, x, y, vx, vy, ang, alive: true, respawn: 0, shield: 1.6, cool: 0, thrust: false };
  }

  info() {
    for (const p of [0, 1]) this.api.info(p, `Skor ${this.score[0]} - ${this.score[1]} · ${TARGET} vuruş`);
  }

  gravity(x, y) {
    const dx = SX - x;
    const dy = SY - y;
    const d2 = Math.max(dx * dx + dy * dy, 900);
    const d = Math.sqrt(d2);
    const a = Math.min(GM / d2, 900);
    return [(dx / d) * a, (dy / d) * a];
  }

  wrap(o) {
    if (o.x < -20) o.x += W + 40;
    if (o.x > W + 20) o.x -= W + 40;
    if (o.y < -20) o.y += H + 40;
    if (o.y > H + 20) o.y -= H + 40;
  }

  explode(s, by) {
    s.alive = false;
    s.respawn = 1.8;
    this.parts.burst(s.x, s.y, 40, [PCOL[s.p], '#fff', '#ffd23f', '#ff7a3d'], { speed: 360, size: 7, life: 1, gravity: 0 });
    this.shake.add(9, 0.35);
    this.api.sfx('boom');
    this.api.buzz(s.p, 350);
    if (by !== null) {
      this.score[by]++;
      this.pops.add('+1', this.ships[by].x, this.ships[by].y - 30, PCOL[by], 36, 1);
      this.info();
      if (this.score[by] >= TARGET) {
        this.phase = 'over';
        this.phaseT = 2.4;
        this.winner = by;
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'done';
        this.api.end({ winner: this.winner, detail: `Skor ${this.score[0]} - ${this.score[1]}` });
      }
    }
    for (const s of this.ships) {
      if (!s.alive) {
        s.respawn -= dt;
        if (s.respawn <= 0 && this.phase === 'play') Object.assign(s, this.mkShip(s.p));
        continue;
      }
      const inp = this.api.input[s.p];
      let turn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      if (!turn && Math.abs(inp.sx) > 0.3) turn = Math.sign(inp.sx);
      s.ang += turn * 4.2 * dt;
      s.thrust = (inp.a || inp.up) && this.phase === 'play';
      if (s.thrust) {
        s.vx += Math.cos(s.ang) * 300 * dt;
        s.vy += Math.sin(s.ang) * 300 * dt;
        if (Math.random() < dt * 40) this.parts.burst(s.x - Math.cos(s.ang) * 18, s.y - Math.sin(s.ang) * 18, 1, ['#ffb02e', '#fff3b0'], { speed: 120, size: 4, life: 0.3, gravity: 0, angle: s.ang + Math.PI, spread: 0.6 });
      }
      const [gx, gy] = this.gravity(s.x, s.y);
      s.vx += gx * dt;
      s.vy += gy * dt;
      const sp = Math.hypot(s.vx, s.vy);
      if (sp > 460) {
        s.vx *= 460 / sp;
        s.vy *= 460 / sp;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      this.wrap(s);
      if (s.shield > 0) s.shield -= dt;
      s.cool -= dt;
      if ((inp.b || inp.down) && s.cool <= 0 && this.phase === 'play' && this.bullets.filter((b) => b.p === s.p).length < 5) {
        s.cool = 0.24;
        this.bullets.push({ p: s.p, x: s.x + Math.cos(s.ang) * 20, y: s.y + Math.sin(s.ang) * 20, vx: s.vx + Math.cos(s.ang) * 520, vy: s.vy + Math.sin(s.ang) * 520, life: 1.5 });
        this.api.sfx('shoot');
      }
      if (Math.hypot(s.x - SX, s.y - SY) < SR + 8) this.explode(s, this.phase === 'play' ? 1 - s.p : null);
    }
    // mermiler
    for (const b of this.bullets) {
      const [gx, gy] = this.gravity(b.x, b.y);
      b.vx += gx * dt * 0.6;
      b.vy += gy * dt * 0.6;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      this.wrap(b);
      if (Math.hypot(b.x - SX, b.y - SY) < SR) b.life = 0;
      for (const s of this.ships) {
        if (!s.alive || s.p === b.p || s.shield > 0 || b.life <= 0) continue;
        if (Math.hypot(s.x - b.x, s.y - b.y) < SHIP_R + 4) {
          b.life = 0;
          if (this.phase === 'play') this.explode(s, b.p);
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    // gemi çarpışması
    const [a, c] = this.ships;
    if (a.alive && c.alive && a.shield <= 0 && c.shield <= 0 && Math.hypot(a.x - c.x, a.y - c.y) < SHIP_R * 2) {
      this.explode(a, null);
      this.explode(c, null);
    }
  }

  demo() {
    this.ships[0].x = 420;
    this.ships[0].y = 470;
    this.ships[0].ang = -0.6;
    this.ships[0].thrust = true;
    this.ships[1].x = 860;
    this.ships[1].y = 260;
    this.ships[1].ang = 2.6;
    this.bullets.push({ p: 0, x: 520, y: 400, vx: 0, vy: 0, life: 1 }, { p: 0, x: 600, y: 350, vx: 0, vy: 0, life: 1 });
    this.score = [2, 1];
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    const bg = g.createRadialGradient(SX, SY, 30, SX, SY, 800);
    bg.addColorStop(0, '#2a1640');
    bg.addColorStop(1, '#05040f');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (const st of this.stars) {
      g.fillStyle = `rgba(255,255,255,${0.2 + st.z * 0.6})`;
      g.fillRect(st.x, st.y, st.z * 2.2, st.z * 2.2);
    }
    // yörünge halkaları
    g.strokeStyle = 'rgba(255,200,120,.06)';
    g.lineWidth = 2;
    for (const r of [140, 240, 340]) {
      g.beginPath();
      g.arc(SX, SY, r, 0, Math.PI * 2);
      g.stroke();
    }
    text(g, this.api.players[0].name, 30, 34, { size: 30, color: PCOL[0], weight: 800, align: 'left' });
    text(g, this.api.players[1].name, W - 30, 34, { size: 30, color: PCOL[1], weight: 800, align: 'right' });
  }

  shipSprite(p) {
    const col = PCOL[p];
    return sprite(`sd-ship|${col}`, 48, 40, (g) => {
      g.translate(24, 20);
      g.fillStyle = shade(col, -0.3);
      g.beginPath();
      g.moveTo(-14, -16);
      g.lineTo(4, -4);
      g.lineTo(4, 4);
      g.lineTo(-14, 16);
      g.lineTo(-8, 0);
      g.closePath();
      g.fill();
      const grad = g.createLinearGradient(-14, 0, 20, 0);
      grad.addColorStop(0, shade(col, -0.2));
      grad.addColorStop(1, shade(col, 0.4));
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(20, 0);
      g.lineTo(-12, -9);
      g.lineTo(-6, 0);
      g.lineTo(-12, 9);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(160,220,255,.85)';
      g.beginPath();
      g.ellipse(4, 0, 5, 3, 0, 0, Math.PI * 2);
      g.fill();
    });
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    // yıldız
    const pulse = 1 + Math.sin(this.time * 3) * 0.05;
    g.drawImage(glow('#ffb347', 150, 0.6), SX - 150 * pulse, SY - 150 * pulse, 300 * pulse, 300 * pulse);
    g.drawImage(glow('#fff1a8', 70, 0.9), SX - 70, SY - 70, 140, 140);
    g.fillStyle = '#fff6d0';
    g.beginPath();
    g.arc(SX, SY, SR, 0, Math.PI * 2);
    g.fill();
    // mermiler
    for (const b of this.bullets) {
      g.fillStyle = b.p === 0 ? '#ffc2d2' : '#c2f0ff';
      g.fillRect(b.x - 3, b.y - 3, 6, 6);
    }
    for (const s of this.ships) {
      if (!s.alive) continue;
      if (s.thrust) {
        g.save();
        g.translate(s.x, s.y);
        g.rotate(s.ang);
        g.fillStyle = '#ffb02e';
        g.beginPath();
        g.moveTo(-10, -5);
        g.lineTo(-24 - Math.random() * 10, 0);
        g.lineTo(-10, 5);
        g.fill();
        g.restore();
      }
      const spr = this.shipSprite(s.p);
      g.save();
      g.translate(s.x, s.y);
      g.rotate(s.ang);
      g.drawImage(spr, -24, -20, 48, 40);
      g.restore();
      if (s.shield > 0) {
        g.strokeStyle = `rgba(127,227,255,${0.4 + 0.3 * Math.sin(this.time * 18)})`;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(s.x, s.y, 26, 0, Math.PI * 2);
        g.stroke();
      }
    }
    this.parts.draw(g);
    g.restore();
    rr(g, W / 2 - 90, 6, 180, 54, 18);
    g.fillStyle = 'rgba(255,255,255,.07)';
    g.fill();
    text(g, String(this.score[0]), W / 2 - 40, 34, { size: 42, color: PCOL[0], weight: 800 });
    text(g, ':', W / 2, 31, { size: 34, color: '#6a6490', weight: 800 });
    text(g, String(this.score[1]), W / 2 + 40, 34, { size: 42, color: PCOL[1], weight: 800 });
    this.pops.draw(g);
    if (this.phase === 'over') banner(g, `${this.api.players[this.winner].name} KAZANDI!`, `${this.score[0]} - ${this.score[1]}`, PCOL[this.winner], 2.4 - this.phaseT);
  }
}

export default {
  id: 'spaceduel',
  name: 'Uzay Düellosu',
  icon: '🛸',
  tag: 'Yerçekimli it dalaşı',
  mode: 'versus',
  cat: 'aksiyon',
  color: '#ffb347',
  desc: 'Ortadaki yıldızın çekim alanında iki gemi! Motorunu dikkatli kullan, mermiler de yıldızın etrafında kıvrılır. Yıldıza düşersen rakip puan alır. 5 vuruşa ulaşan kazanır.',
  howto: ['◀ ▶ dön', 'A basılı tut: motor', 'B basılı tut: ateş', 'Ekranın kenarından çıkan karşıdan girer', 'Yıldıza yaklaşma!'],
  keys: '1. oyuncu A/D dön, W/F motor, S/G ateş · 2. oyuncu ←/→, ↑/K, ↓/L',
  controller: { layout: 'dpad', dirs: 'lr', a: 'MOTOR', b: 'ATEŞ' },
  create: (api) => new SpaceDuelGame(api),
};
