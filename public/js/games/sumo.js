// SUMO HALKASI — rakibini halkanın dışına it! Analog çubukla hareket, A ile hamle.
// Halka zamanla daralır. 5 rauntta 3 alan kazanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, winDots, shade, rgba, clamp, sprite, Layer } from '../host/gfx.js';

const CX = W / 2;
const CY = 392;
const R0 = 290;
const RMIN = 165;
const PR = 42;
const ACC = 1500;
const MAXV = 430;
const NEED = 3;

class SumoGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.wins = [0, 0];
    this.round = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.newRound();
  }

  newRound() {
    this.round++;
    this.ringR = R0;
    this.roundT = 0;
    this.ws = [0, 1].map((p) => ({ p, x: CX + (p === 0 ? -150 : 150), y: CY, vx: 0, vy: 0, ang: p === 0 ? 0 : Math.PI, dashT: 0, dashCool: 0, out: false, fallT: 0 }));
    this.phase = this.round === 1 ? 'play' : 'intro';
    this.phaseT = 1.8;
    for (const p of [0, 1]) this.api.info(p, `Raunt ${this.round} · ${this.wins[0]} - ${this.wins[1]}`);
  }

  onKey(p, k, down) {
    if (!down || k !== 'a' || this.phase !== 'play') return;
    const w = this.ws[p];
    if (w.out || w.dashCool > 0) return;
    const a = this.api.axis(p);
    let dx = a.x;
    let dy = a.y;
    const m = Math.hypot(dx, dy);
    if (m < 0.2) {
      dx = Math.cos(w.ang);
      dy = Math.sin(w.ang);
    } else {
      dx /= m;
      dy /= m;
    }
    w.vx += dx * 760;
    w.vy += dy * 760;
    w.dashT = 0.28;
    w.dashCool = 1.1;
    this.parts.burst(w.x - dx * PR, w.y - dy * PR, 8, ['#f3e2c0', '#d9c39a'], { speed: 160, size: 6, life: 0.4, gravity: 0 });
    this.api.sfx('nitro');
    this.api.buzz(p, 35);
  }

  updateW(w, dt) {
    if (w.out) {
      w.fallT += dt;
      w.x += w.vx * dt * 0.5;
      w.y += w.vy * dt * 0.5;
      return;
    }
    const a = this.api.axis(w.p);
    w.vx += a.x * ACC * dt;
    w.vy += a.y * ACC * dt;
    const fr = Math.exp(-2.4 * dt);
    w.vx *= fr;
    w.vy *= fr;
    const sp = Math.hypot(w.vx, w.vy);
    const lim = w.dashT > 0 ? 1100 : MAXV;
    if (sp > lim) {
      // hamle bitince yavaşça normale dön
      const k = Math.max(lim / sp, 1 - 4 * dt);
      w.vx *= k;
      w.vy *= k;
    }
    w.x += w.vx * dt;
    w.y += w.vy * dt;
    if (Math.hypot(a.x, a.y) > 0.2) w.ang = Math.atan2(a.y, a.x);
    else if (sp > 40) w.ang = Math.atan2(w.vy, w.vx);
    if (w.dashT > 0) w.dashT -= dt;
    if (w.dashCool > 0) w.dashCool -= dt;
  }

  collide() {
    const [a, b] = this.ws;
    if (a.out || b.out) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    const min = PR * 2;
    if (d >= min || d === 0) return;
    const nx = dx / d;
    const ny = dy / d;
    const push = (min - d) / 2;
    a.x -= nx * push;
    a.y -= ny * push;
    b.x += nx * push;
    b.y += ny * push;
    const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (rel > 0) {
      const j = (rel * 2.05) / 2;
      a.vx -= j * nx;
      a.vy -= j * ny;
      b.vx += j * nx;
      b.vy += j * ny;
      // hamle yapan daha sert iter
      if (a.dashT > 0) {
        b.vx += nx * 320;
        b.vy += ny * 320;
      }
      if (b.dashT > 0) {
        a.vx -= nx * 320;
        a.vy -= ny * 320;
      }
      if (rel > 200) {
        this.api.sfx('thock');
        this.shake.add(Math.min(8, rel / 90), 0.15);
        this.parts.burst((a.x + b.x) / 2, (a.y + b.y) / 2, 6, ['#fff', '#ffd23f'], { speed: 200, size: 5, life: 0.3, gravity: 0 });
        this.api.buzz(0, 30);
        this.api.buzz(1, 30);
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
    if (this.phase === 'over') {
      this.phaseT -= dt;
      for (const w of this.ws) this.updateW(w, dt);
      if (this.phaseT <= 0) {
        const wn = this.roundWinner;
        if (wn !== null && this.wins[wn] >= NEED) this.api.end({ winner: wn, detail: `Raunt skoru ${this.wins[0]} - ${this.wins[1]}` });
        else this.newRound();
      }
      return;
    }
    this.roundT += dt;
    if (this.roundT > 15) this.ringR = Math.max(RMIN, R0 - (this.roundT - 15) * 4.5);
    for (const w of this.ws) this.updateW(w, dt);
    this.collide();
    for (const w of this.ws) {
      if (!w.out && Math.hypot(w.x - CX, w.y - CY) > this.ringR + 4) {
        w.out = true;
        this.parts.burst(w.x, w.y, 24, ['#f3e2c0', '#d9c39a', PCOL[w.p]], { speed: 260, size: 7, life: 0.7, gravity: 0 });
        this.api.sfx('die');
        this.api.buzz(w.p, 300);
      }
    }
    const out = this.ws.map((w) => w.out);
    if (out[0] || out[1]) {
      this.roundWinner = out[0] && out[1] ? null : out[0] ? 1 : 0;
      if (this.roundWinner !== null) this.wins[this.roundWinner]++;
      this.phase = 'over';
      this.phaseT = 2.4;
      this.shake.add(10, 0.35);
      this.api.sfx(this.roundWinner === null ? 'lose' : 'power');
    }
  }

  demo() {
    this.ws[0].x = CX - 60;
    this.ws[1].x = CX + 30;
    this.ws[1].y = CY - 40;
    this.ws[0].dashT = 0.2;
    this.ringR = 250;
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    g.fillStyle = '#2a1d14';
    g.fillRect(0, 0, W, H);
    // tahta zemin
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 2 ? '#3a2819' : '#33241a';
      g.fillRect(0, i * 56, W, 56);
    }
    // yükseltilmiş kare kil platform
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.fillRect(CX - 352, CY - 330, 716, 680);
    g.fillStyle = '#b98a57';
    g.fillRect(CX - 360, CY - 340, 720, 680);
    g.fillStyle = '#c99a65';
    g.fillRect(CX - 340, CY - 320, 680, 640);
    // kum yüzey
    const grad = g.createRadialGradient(CX, CY, 40, CX, CY, R0 + 40);
    grad.addColorStop(0, '#efdcb4');
    grad.addColorStop(1, '#d9bf8c');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(CX, CY, R0 + 26, 0, Math.PI * 2);
    g.fill();
    // başlangıç çizgileri
    g.fillStyle = '#fff';
    g.fillRect(CX - 70, CY - 26, 8, 52);
    g.fillRect(CX + 62, CY - 26, 8, 52);
    text(g, this.api.players[0].name, 40, 40, { size: 32, color: PCOL[0], weight: 800, align: 'left', stroke: 'rgba(0,0,0,.6)', sw: 6 });
    text(g, this.api.players[1].name, W - 40, 40, { size: 32, color: PCOL[1], weight: 800, align: 'right', stroke: 'rgba(0,0,0,.6)', sw: 6 });
  }

  wrestlerSprite(p) {
    const col = PCOL[p];
    const S = PR * 2 + 24;
    return sprite(`sumo|${col}`, S, S, (g) => {
      const c = S / 2;
      g.fillStyle = 'rgba(0,0,0,.3)';
      g.beginPath();
      g.arc(c + 5, c + 7, PR, 0, Math.PI * 2);
      g.fill();
      // gövde (yukarıdan)
      const grad = g.createRadialGradient(c - 10, c - 12, 6, c, c, PR);
      grad.addColorStop(0, '#ffe2c4');
      grad.addColorStop(1, '#e0a77c');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(c, c, PR, 0, Math.PI * 2);
      g.fill();
      // kemer
      g.strokeStyle = col;
      g.lineWidth = 12;
      g.beginPath();
      g.arc(c, c, PR - 8, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = shade(col, -0.4);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(c, c, PR - 2, 0, Math.PI * 2);
      g.stroke();
      // kollar (öne doğru, +x yönünde)
      g.fillStyle = '#efbf98';
      g.beginPath();
      g.ellipse(c + PR * 0.55, c - PR * 0.62, 14, 10, 0.4, 0, Math.PI * 2);
      g.ellipse(c + PR * 0.55, c + PR * 0.62, 14, 10, -0.4, 0, Math.PI * 2);
      g.fill();
      // baş ve topuz
      g.fillStyle = '#f2c29d';
      g.beginPath();
      g.arc(c + 6, c, 17, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#20202e';
      g.beginPath();
      g.arc(c - 2, c, 11, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.arc(c - 10, c, 6, 0, Math.PI * 2);
      g.fill();
    });
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    // daralan halka: dışarısı koyulaşır
    if (this.ringR < R0) {
      g.fillStyle = 'rgba(80,50,30,.35)';
      g.beginPath();
      g.arc(CX, CY, R0 + 26, 0, Math.PI * 2);
      g.arc(CX, CY, this.ringR, 0, Math.PI * 2, true);
      g.fill('evenodd');
    }
    // halat
    g.strokeStyle = '#8a6a3a';
    g.lineWidth = 14;
    g.beginPath();
    g.arc(CX, CY, this.ringR + 7, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = '#c9a56a';
    g.lineWidth = 6;
    g.setLineDash([16, 10]);
    g.beginPath();
    g.arc(CX, CY, this.ringR + 7, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
    if (this.ringR < R0 && Math.floor(this.time * 4) % 2) {
      g.strokeStyle = 'rgba(255,90,90,.6)';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(CX, CY, this.ringR, 0, Math.PI * 2);
      g.stroke();
    }
    for (const w of this.ws) {
      const spr = this.wrestlerSprite(w.p);
      const sc = w.out ? Math.max(0.3, 1 - w.fallT * 0.8) : 1;
      g.save();
      g.globalAlpha = w.out ? Math.max(0, 1 - w.fallT) : 1;
      g.translate(w.x, w.y);
      g.rotate(w.ang);
      g.scale(sc, sc);
      g.drawImage(spr, -spr.lw / 2, -spr.lh / 2, spr.lw, spr.lh);
      g.restore();
      if (w.dashT > 0) {
        g.strokeStyle = rgba(PCOL[w.p], 0.7);
        g.lineWidth = 4;
        g.beginPath();
        g.arc(w.x, w.y, PR + 8, 0, Math.PI * 2);
        g.stroke();
      }
      // hamle doluluk göstergesi
      if (!w.out) {
        const f = 1 - Math.max(0, w.dashCool) / 1.1;
        g.strokeStyle = f >= 1 ? PCOL[w.p] : 'rgba(255,255,255,.35)';
        g.lineWidth = 4;
        g.beginPath();
        g.arc(w.x, w.y, PR + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
        g.stroke();
      }
    }
    this.parts.draw(g);
    g.restore();
    winDots(g, 40, 76, this.wins[0], NEED, PCOL[0], 'left');
    winDots(g, W - 40, 76, this.wins[1], NEED, PCOL[1], 'right');
    text(g, `RAUNT ${this.round}`, W / 2, 30, { size: 26, color: '#f3e2c0', weight: 800 });
    if (this.ringR < R0) text(g, 'HALKA DARALIYOR', W / 2, 62, { size: 18, color: '#ff8a8a', weight: 800 });
    this.pops.draw(g);
    if (this.phase === 'intro') banner(g, `RAUNT ${this.round}`, `${this.wins[0]} - ${this.wins[1]}`, '#ffd23f', 1.8 - this.phaseT);
    if (this.phase === 'over' && this.phaseT < 2.1) {
      const wn = this.roundWinner;
      if (wn === null) banner(g, 'İKİSİ DE DÜŞTÜ!', 'Berabere', '#ffd23f', 2.1 - this.phaseT);
      else banner(g, `${this.api.players[wn].name} RAUNDU ALDI!`, `${this.wins[0]} - ${this.wins[1]}`, PCOL[wn], 2.1 - this.phaseT);
    }
  }
}

export default {
  id: 'sumo',
  name: 'Sumo Halkası',
  icon: '🥋',
  tag: 'İtiş kakış',
  mode: 'versus',
  cat: 'aksiyon',
  color: '#c99a65',
  desc: 'Rakibini halkanın dışına it! Analog çubukla manevra yap, doğru anda A ile hamle yaparak sert bir itiş yap. Halka zamanla daralır.',
  howto: ['Sol taraf: analog çubuk — sürükle ve yönlen', 'A: hamle (ani itiş, kısa bekleme süresi var)', 'Halkadan çıkan raundu kaybeder', '5 rauntta 3 alan kazanır'],
  keys: '1. oyuncu WASD + F · 2. oyuncu Oklar + K',
  controller: { layout: 'stick', a: 'HAMLE', b: null },
  create: (api) => new SumoGame(api),
};
