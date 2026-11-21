// TOPÇU DÜELLOSU — sırayla açı ve güç ayarlayıp ateş et. Rüzgâra dikkat, arazi patlamalarla oyulur!
// Rakibin canını ilk bitiren kazanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp, rand, sprite, Layer, glow } from '../host/gfx.js';

const STEP = 2; // arazi sütun genişliği
const NCOL = W / STEP + 1;
const GRAV = 480;
const EXP_R = 54;
const TURN_T = 25;
const TANK_X = [170, W - 170];
const HP = 100;

class ArtilleryGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.sky = new Layer(W, H, (g) => this.paintSky(g));
    this.land = new Layer(W, H, (g) => this.paintLand(g));
    this.makeTerrain();
    this.tanks = [0, 1].map((p) => ({ p, x: TANK_X[p], y: this.ground(TANK_X[p]), hp: HP, ang: p === 0 ? 45 : 135, pow: 62, vy: 0 }));
    this.turn = Math.random() < 0.5 ? 0 : 1;
    this.shot = null;
    this.newTurn(true);
  }

  makeTerrain() {
    const seed = rand(0, 100);
    this.h = new Float32Array(NCOL);
    for (let i = 0; i < NCOL; i++) {
      const x = i * STEP;
      let y = 575 - 170 * Math.exp(-(((x - 640) / 190) ** 2)) - 38 * Math.sin(x / 97 + seed) - 22 * Math.sin(x / 41 + seed * 2);
      for (const tx of TANK_X) {
        const d = Math.abs(x - tx);
        if (d < 46) y = 560 - 20 * Math.sin(tx / 97 + seed);
      }
      this.h[i] = clamp(y, 250, 660);
    }
    // keskin geçişleri yumuşat
    for (let k = 0; k < 3; k++) for (let i = 1; i < NCOL - 1; i++) this.h[i] = (this.h[i - 1] + this.h[i] * 2 + this.h[i + 1]) / 4;
    this.land.invalidate();
  }

  ground(x) {
    const i = clamp(Math.round(x / STEP), 0, NCOL - 1);
    return this.h[i];
  }

  newTurn(first = false) {
    if (!first) this.turn = 1 - this.turn;
    this.wind = Math.round(rand(-10, 10)) / 10;
    this.t = TURN_T;
    this.phase = 'aim';
    this.pushPads();
  }

  pushPads() {
    for (const p of [0, 1]) {
      const info = `♥ ${this.tanks[0].hp} - ${this.tanks[1].hp} · rüzgâr ${this.wind > 0 ? '→' : this.wind < 0 ? '←' : '·'} ${Math.abs(this.wind * 10)}`;
      if (this.phase === 'aim' && this.turn === p) this.api.setPad(p, { title: `Sıra sende · ${info}` });
      else this.api.setPad(p, { layout: 'wait', text: this.phase === 'aim' ? 'Rakibin nişan alıyor…' : 'Atış izleniyor…', sub: info, title: info });
    }
  }

  onKey(p, k, down) {
    if (!down || this.phase !== 'aim' || p !== this.turn) return;
    const tk = this.tanks[p];
    // dokunuşta 1 birim; basılı tutunca update içinde hızlı değişir
    if (k === 'left') tk.ang = clamp(tk.ang + 1, 5, 175);
    if (k === 'right') tk.ang = clamp(tk.ang - 1, 5, 175);
    if (k === 'up') tk.pow = clamp(tk.pow + 1, 15, 100);
    if (k === 'down') tk.pow = clamp(tk.pow - 1, 15, 100);
    if (k === 'a' || k === 'b') this.fire();
    this.holdT = 0;
  }

  muzzle(tk) {
    const a = (tk.ang * Math.PI) / 180;
    return [tk.x + Math.cos(a) * 34, tk.y - 18 - Math.sin(a) * 34, a];
  }

  fire() {
    const tk = this.tanks[this.turn];
    const [mx, my, a] = this.muzzle(tk);
    const v = tk.pow * 9.6;
    this.shot = { x: mx, y: my, vx: Math.cos(a) * v, vy: -Math.sin(a) * v, trail: [] };
    this.phase = 'fly';
    this.api.sfx('boom');
    this.shake.add(3, 0.15);
    this.parts.burst(mx, my, 10, ['#ffd23f', '#fff3b0', '#bbb'], { speed: 160, size: 6, life: 0.4, gravity: -40 });
    this.pushPads();
  }

  explode(x, y) {
    this.shot = null;
    this.phase = 'boom';
    this.phaseT = 1.3;
    // araziyi oy
    for (let i = 0; i < NCOL; i++) {
      const dx = i * STEP - x;
      if (Math.abs(dx) >= EXP_R) continue;
      const bot = y + Math.sqrt(EXP_R * EXP_R - dx * dx);
      if (this.h[i] < bot) this.h[i] = Math.min(H + 60, bot);
    }
    this.land.invalidate();
    this.parts.burst(x, y, 36, ['#ffd23f', '#ff7a3d', '#ff4f2d', '#fff3b0', '#7a5a3a'], { speed: 380, size: 9, life: 0.9, gravity: 300 });
    this.parts.burst(x, y, 16, ['#6e4a2a', '#8a6a3a'], { speed: 260, size: 6, life: 1.2, gravity: 600, angle: -Math.PI / 2, spread: Math.PI });
    this.shake.add(10, 0.4);
    this.api.sfx('boom');
    for (const tk of this.tanks) {
      const d = Math.hypot(tk.x - x, tk.y - 12 - y);
      if (d < EXP_R + 22) {
        const dmg = Math.round(42 * (1 - d / (EXP_R + 22))) + (d < 26 ? 16 : 0);
        if (dmg > 0) {
          tk.hp = Math.max(0, tk.hp - dmg);
          this.pops.add(`-${dmg}`, tk.x, tk.y - 60, '#ff6b7a', 36, 1.2);
          this.api.buzz(tk.p, 250);
        }
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    // tanklar zemine oturur (altı oyulursa düşer)
    for (const tk of this.tanks) {
      const gy = Math.max(this.ground(tk.x - 18), this.ground(tk.x), this.ground(tk.x + 18));
      const target = Math.min(gy, this.ground(tk.x));
      if (tk.y < target - 0.5) {
        tk.vy += 900 * dt;
        tk.y = Math.min(target, tk.y + tk.vy * dt);
      } else {
        tk.y = target;
        tk.vy = 0;
      }
    }
    if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'done';
        this.api.end({ winner: this.winner, detail: `Kalan can: ${this.tanks[0].hp} - ${this.tanks[1].hp}` });
      }
      return;
    }
    if (this.phase === 'aim') {
      const tk = this.tanks[this.turn];
      const s = this.api.input[this.turn];
      this.holdT = (this.holdT || 0) + dt;
      if (this.holdT > 0.25) {
        if (s.left) tk.ang = clamp(tk.ang + 55 * dt, 5, 175);
        if (s.right) tk.ang = clamp(tk.ang - 55 * dt, 5, 175);
        if (s.up) tk.pow = clamp(tk.pow + 38 * dt, 15, 100);
        if (s.down) tk.pow = clamp(tk.pow - 38 * dt, 15, 100);
      }
      if (!(s.left || s.right || s.up || s.down)) this.holdT = 0;
      this.t -= dt;
      if (this.t <= 0) {
        this.pops.add('SÜRE DOLDU!', tk.x, tk.y - 90, '#ff8a8a', 30, 1);
        this.fire();
      }
      return;
    }
    if (this.phase === 'fly') {
      const sh = this.shot;
      const SUB = 4;
      const sd = dt / SUB;
      for (let i = 0; i < SUB; i++) {
        sh.vx += this.wind * 170 * sd;
        sh.vy += GRAV * sd;
        sh.x += sh.vx * sd;
        sh.y += sh.vy * sd;
        if (sh.x < -80 || sh.x > W + 80 || sh.y > H + 40) {
          this.shot = null;
          this.phase = 'boom';
          this.phaseT = 0.8;
          this.pops.add('ISKA!', clamp(sh.x, 80, W - 80), clamp(sh.y, 120, H - 60), '#a7a2d1', 34, 1);
          return;
        }
        for (const tk of this.tanks) {
          if (Math.hypot(tk.x - sh.x, tk.y - 12 - sh.y) < 26) return this.explode(sh.x, sh.y);
        }
        if (sh.x >= 0 && sh.x <= W && sh.y >= this.ground(sh.x)) return this.explode(sh.x, sh.y);
      }
      sh.trail.push(sh.x, sh.y);
      if (sh.trail.length > 60) sh.trail.splice(0, 2);
      return;
    }
    if (this.phase === 'boom') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const dead = this.tanks.filter((t) => t.hp <= 0 || t.y > H - 8);
        if (dead.length) {
          this.winner = dead.length === 2 ? null : 1 - dead[0].p;
          this.phase = 'over';
          this.phaseT = 2.6;
          for (const t of dead) {
            t.hp = 0;
            this.parts.burst(t.x, t.y - 10, 40, [PCOL[t.p], '#ffd23f', '#555'], { speed: 400, size: 9, life: 1.1, gravity: 200 });
          }
          this.api.sfx('win');
          this.pushPads();
          return;
        }
        this.newTurn();
      }
    }
  }

  demo() {
    this.tanks[0].ang = 52;
    this.shot = { x: 520, y: 260, vx: 0, vy: 0, trail: [] };
    for (let i = 0; i < 20; i++) this.shot.trail.push(220 + i * 15, 470 - Math.sin(i / 19 * 2.6) * 220);
    this.phase = 'fly';
    this.tanks[1].hp = 64;
  }

  // ---------------------------------------------------------------- çizim
  paintSky(g) {
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#f6a560');
    sky.addColorStop(0.55, '#f7d38f');
    sky.addColorStop(1, '#ffe7b8');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.drawImage(glow('#fff2c4', 120, 0.9), 980, 80, 240, 240);
    g.fillStyle = 'rgba(160,90,90,.35)';
    g.beginPath();
    g.moveTo(0, 420);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, 360 + Math.sin(x / 130) * 40 + Math.sin(x / 47) * 14);
    g.lineTo(W, H);
    g.lineTo(0, H);
    g.fill();
  }

  paintLand(g) {
    g.beginPath();
    g.moveTo(0, H);
    for (let i = 0; i < NCOL; i++) g.lineTo(i * STEP, this.h[i]);
    g.lineTo(W, H);
    g.closePath();
    const grad = g.createLinearGradient(0, 260, 0, H);
    grad.addColorStop(0, '#8a5a32');
    grad.addColorStop(1, '#4a2e18');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = '#4fae4f';
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < NCOL; i++) i ? g.lineTo(i * STEP, this.h[i] + 3) : g.moveTo(0, this.h[0] + 3);
    g.stroke();
  }

  drawTank(g, tk) {
    const col = PCOL[tk.p];
    const a = (tk.ang * Math.PI) / 180;
    g.save();
    g.translate(tk.x, tk.y);
    // namlu
    g.strokeStyle = shade(col, -0.45);
    g.lineWidth = 8;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(0, -18);
    g.lineTo(Math.cos(a) * 34, -18 - Math.sin(a) * 34);
    g.stroke();
    const spr = sprite(`art-tank|${col}`, 64, 40, (sg) => {
      sg.translate(32, 36);
      sg.fillStyle = '#26243a';
      rr(sg, -28, -12, 56, 12, 6);
      sg.fill();
      sg.fillStyle = '#4a4766';
      for (let i = -22; i <= 22; i += 11) {
        sg.beginPath();
        sg.arc(i, -6, 4, 0, Math.PI * 2);
        sg.fill();
      }
      const grad = sg.createLinearGradient(0, -30, 0, -10);
      grad.addColorStop(0, shade(col, 0.3));
      grad.addColorStop(1, shade(col, -0.25));
      sg.fillStyle = grad;
      rr(sg, -24, -24, 48, 14, 6);
      sg.fill();
      sg.beginPath();
      sg.arc(0, -24, 12, Math.PI, Math.PI * 2);
      sg.fill();
    });
    g.drawImage(spr, -32, -36, 64, 40);
    g.restore();
    // can çubuğu
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.fillRect(tk.x - 32, tk.y - 70, 64, 8);
    g.fillStyle = tk.hp > 40 ? '#46e38a' : tk.hp > 20 ? '#ffd23f' : '#ff5a5a';
    g.fillRect(tk.x - 32, tk.y - 70, 64 * (tk.hp / HP), 8);
  }

  draw(g) {
    this.sky.draw(g);
    g.save();
    this.shake.apply(g);
    this.land.draw(g);
    for (const tk of this.tanks) this.drawTank(g, tk);
    // nişan önizlemesi
    if (this.phase === 'aim') {
      const tk = this.tanks[this.turn];
      const [mx, my, a] = this.muzzle(tk);
      const v = tk.pow * 9.6;
      let x = mx;
      let y = my;
      let vx = Math.cos(a) * v;
      let vy = -Math.sin(a) * v;
      g.fillStyle = rgba(PCOL[this.turn], 0.85);
      for (let i = 0; i < 18; i++) {
        for (let k = 0; k < 2; k++) {
          vx += this.wind * 170 * 0.0125;
          vy += GRAV * 0.0125;
          x += vx * 0.0125;
          y += vy * 0.0125;
        }
        g.beginPath();
        g.arc(x, y, 3.2 - i * 0.12, 0, Math.PI * 2);
        g.fill();
      }
      text(g, `${Math.round(tk.ang)}°  ·  güç ${Math.round(tk.pow)}`, tk.x, tk.y - 96, { size: 22, color: '#fff', weight: 800, stroke: 'rgba(0,0,0,.55)', sw: 6 });
    }
    if (this.shot) {
      const t = this.shot.trail;
      g.fillStyle = 'rgba(80,60,60,.35)';
      for (let i = 0; i < t.length; i += 2) g.fillRect(t[i] - 2, t[i + 1] - 2, 4, 4);
      g.fillStyle = '#20202e';
      g.beginPath();
      g.arc(this.shot.x, this.shot.y, 7, 0, Math.PI * 2);
      g.fill();
    }
    this.parts.draw(g);
    g.restore();
    // üst bilgi
    for (const p of [0, 1]) {
      const left = p === 0;
      const x = left ? 30 : W - 30;
      text(g, this.api.players[p].name, x, 34, { size: 30, color: shade(PCOL[p], -0.25), weight: 800, align: left ? 'left' : 'right', stroke: '#fff', sw: 6 });
      g.fillStyle = 'rgba(0,0,0,.25)';
      g.fillRect(left ? x : x - 220, 58, 220, 14);
      g.fillStyle = PCOL[p];
      g.fillRect(left ? x : x - 220 * (this.tanks[p].hp / HP), 58, 220 * (this.tanks[p].hp / HP), 14);
    }
    // rüzgâr
    rr(g, W / 2 - 120, 10, 240, 66, 18);
    g.fillStyle = 'rgba(40,20,20,.35)';
    g.fill();
    text(g, 'RÜZGÂR', W / 2, 28, { size: 16, color: '#fff', weight: 800 });
    const wl = this.wind * 90;
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(W / 2, 54);
    g.lineTo(W / 2 + wl, 54);
    g.stroke();
    if (Math.abs(wl) > 4) {
      g.beginPath();
      g.moveTo(W / 2 + wl + Math.sign(wl) * 10, 54);
      g.lineTo(W / 2 + wl, 46);
      g.lineTo(W / 2 + wl, 62);
      g.fill();
    }
    if (this.phase === 'aim') {
      const p = this.turn;
      text(g, `${this.api.players[p].name} nişan alıyor · ${Math.ceil(this.t)} sn`, W / 2, 104, { size: 24, color: shade(PCOL[p], -0.3), weight: 800, stroke: 'rgba(255,255,255,.85)', sw: 6 });
    }
    this.pops.draw(g);
    if (this.phase === 'over') {
      const w = this.winner;
      if (w === null || w === undefined) banner(g, 'BERABERE', 'İki tank da devrildi', '#ffd23f', 2.6 - this.phaseT);
      else banner(g, `${this.api.players[w].name} KAZANDI!`, 'Tam isabet', PCOL[w], 2.6 - this.phaseT);
    }
  }
}

export default {
  id: 'artillery',
  name: 'Topçu Düellosu',
  icon: '🎯',
  tag: 'Sıra tabanlı top atışı',
  mode: 'versus',
  cat: 'aksiyon',
  color: '#f6a560',
  desc: 'Sırayla namlunun açısını ve atış gücünü ayarla, rüzgârı hesaba kat ve ateş et! Patlamalar araziyi oyar; rakibinin canını ilk bitiren kazanır.',
  howto: ['◀ ▶ namlu açısı (basılı tut: hızlı)', '▲ ▼ atış gücü', 'A: ateş', 'Rüzgâr her turda değişir', 'Tur başına 25 saniye'],
  keys: '1. oyuncu WASD + F · 2. oyuncu Oklar + K',
  controller: { layout: 'dpad', dirs: 4, a: 'ATEŞ', b: null },
  create: (api) => new ArtilleryGame(api),
};
