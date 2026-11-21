// HALAT ÇEKME — A ve B'ye sırayla, olabildiğince hızlı bas! Halatın ortası çizgini geçerse raundu alırsın.
// Aynı tuşa üst üste basmak az güç verir; ritim önemli. 3 rauntta 2 alan kazanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, winDots, shade, rgba, clamp, sprite, Layer } from '../host/gfx.js';
import { drawGuy } from './bomber.js';

const LIMIT = 230; // halatın kazanma mesafesi
const NEED = 2;
const GROUND = 560;

class TugGame {
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
    this.pos = 0; // + sağa (2. oyuncu), - sola (1. oyuncu)
    this.vel = 0;
    this.st = [0, 1].map(() => ({ last: null, rate: 0, taps: [], combo: 0, pull: 0 }));
    this.phase = this.round === 1 ? 'play' : 'intro';
    this.phaseT = 1.8;
    for (const p of [0, 1]) this.api.info(p, `Raunt ${this.round} · ${this.wins[0]} - ${this.wins[1]} · A-B-A-B!`);
  }

  onKey(p, k, down) {
    if (!down || this.phase !== 'play') return;
    if (k !== 'a' && k !== 'b') return;
    const st = this.st[p];
    const good = st.last !== k; // sırayla basmak tam güç
    st.last = k;
    st.combo = good ? st.combo + 1 : 0;
    const power = good ? 26 + Math.min(14, st.combo * 0.6) : 7;
    this.vel += (p === 0 ? -1 : 1) * power;
    st.pull = 0.12;
    st.taps.push(this.time);
    if (good && st.combo % 12 === 0) this.api.buzz(p, 15);
    if (Math.random() < 0.3) this.parts.burst(p === 0 ? W / 2 - 300 + this.pos : W / 2 + 300 + this.pos, GROUND - 10, 2, ['#8a6a3a', '#6e4a2a'], { speed: 120, size: 5, life: 0.4, gravity: 400, angle: -Math.PI / 2, spread: 1.4 });
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    for (const st of this.st) {
      st.taps = st.taps.filter((t) => this.time - t < 1);
      st.rate = st.taps.length;
      if (st.pull > 0) st.pull -= dt;
    }
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'over') {
      this.phaseT -= dt;
      this.pos += this.vel * dt;
      this.vel *= Math.exp(-3 * dt);
      if (this.phaseT <= 0) {
        const w = this.roundWinner;
        if (this.wins[w] >= NEED) {
          this.phase = 'done';
          this.api.end({ winner: w, detail: `Raunt skoru ${this.wins[0]} - ${this.wins[1]}` });
        } else this.newRound();
      }
      return;
    }
    this.vel *= Math.exp(-3.2 * dt);
    this.pos += this.vel * dt;
    if (Math.abs(this.pos) >= LIMIT) {
      const w = this.pos < 0 ? 0 : 1;
      this.roundWinner = w;
      this.wins[w]++;
      this.phase = 'over';
      this.phaseT = 2.6;
      this.shake.add(10, 0.4);
      this.parts.burst(W / 2 + this.pos, GROUND - 40, 40, ['#8a6a3a', '#6e4a2a', '#c9a56a'], { speed: 360, size: 8, life: 1, gravity: 500, angle: -Math.PI / 2, spread: Math.PI });
      this.api.sfx('power');
      this.api.buzz(w, 150);
      this.api.buzz(1 - w, 350);
    }
  }

  demo() {
    this.pos = -90;
    this.st[0].pull = 0.1;
    this.st[0].rate = 9;
    this.st[1].rate = 6;
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    const sky = g.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#5fb8ff');
    sky.addColorStop(1, '#cdeeff');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // tepeler
    g.fillStyle = '#7fc46a';
    g.beginPath();
    g.moveTo(0, 420);
    for (let x = 0; x <= W; x += 40) g.lineTo(x, 400 + Math.sin(x / 160) * 30);
    g.lineTo(W, GROUND);
    g.lineTo(0, GROUND);
    g.fill();
    g.fillStyle = '#5aa34e';
    g.fillRect(0, GROUND, W, H - GROUND);
    // çamur çukuru
    g.fillStyle = '#6e4a2a';
    g.beginPath();
    g.ellipse(W / 2, GROUND + 22, 150, 26, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#8a5f37';
    g.beginPath();
    g.ellipse(W / 2, GROUND + 18, 120, 16, 0, 0, Math.PI * 2);
    g.fill();
    // kazanma çizgileri
    for (const s of [-1, 1]) {
      g.fillStyle = s < 0 ? PCOL[0] : PCOL[1];
      g.fillRect(W / 2 + s * LIMIT - 3, GROUND - 6, 6, 70);
    }
    g.fillStyle = 'rgba(255,255,255,.8)';
    g.fillRect(W / 2 - 2, GROUND - 4, 4, 60);
    text(g, this.api.players[0].name, 40, 40, { size: 34, color: shade(PCOL[0], -0.2), weight: 800, align: 'left', stroke: '#fff', sw: 6 });
    text(g, this.api.players[1].name, W - 40, 40, { size: 34, color: shade(PCOL[1], -0.25), weight: 800, align: 'right', stroke: '#fff', sw: 6 });
    text(g, 'A · B · A · B  —  sırayla bas!', W / 2, 140, { size: 30, color: '#1d3b5c', weight: 800 });
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    const off = this.pos;
    const ropeY = GROUND - 70;
    // halat
    g.strokeStyle = '#c9a56a';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(W / 2 - 430 + off, ropeY + 6);
    g.quadraticCurveTo(W / 2 + off, ropeY + 16, W / 2 + 430 + off, ropeY + 6);
    g.stroke();
    g.strokeStyle = 'rgba(110,80,40,.6)';
    g.lineWidth = 2;
    g.setLineDash([10, 8]);
    g.stroke();
    g.setLineDash([]);
    // orta bayrak
    g.fillStyle = '#ff5a5a';
    g.beginPath();
    g.moveTo(W / 2 + off, ropeY + 12);
    g.lineTo(W / 2 + off - 14, ropeY + 48);
    g.lineTo(W / 2 + off + 14, ropeY + 48);
    g.fill();
    // takımlar (her oyuncu 2 karakter)
    for (const p of [0, 1]) {
      const st = this.st[p];
      const dir = p === 0 ? -1 : 1;
      const lean = st.pull > 0 ? 0.25 : 0.12;
      for (let i = 0; i < 2; i++) {
        const x = W / 2 + dir * (310 + i * 85) + off;
        const y = GROUND - 30;
        g.save();
        g.translate(x, y);
        g.rotate(dir * lean);
        drawGuy(g, 0, 0, 82, PCOL[p], [-dir, 0], st.pull > 0 ? this.time : 0);
        g.restore();
      }
    }
    this.parts.draw(g);
    g.restore();
    // hız göstergeleri
    for (const p of [0, 1]) {
      const st = this.st[p];
      const left = p === 0;
      winDots(g, left ? 40 : W - 40, 82, this.wins[p], NEED, PCOL[p], left ? 'left' : 'right');
      const x = left ? 40 : W - 260;
      g.fillStyle = 'rgba(0,0,0,.15)';
      rr(g, x, 104, 220, 16, 8);
      g.fill();
      g.fillStyle = PCOL[p];
      rr(g, x, 104, Math.max(16, Math.min(220, st.rate * 16)), 16, 8);
      g.fill();
      text(g, `${st.rate} basış/sn`, left ? x : x + 220, 134, { size: 18, color: '#1d3b5c', weight: 800, align: left ? 'left' : 'right' });
    }
    this.pops.draw(g);
    if (this.phase === 'intro') banner(g, `RAUNT ${this.round}`, 'Hazır… ÇEK!', '#ffd23f', 1.8 - this.phaseT);
    if (this.phase === 'over' && this.phaseT < 2.3) {
      const w = this.roundWinner;
      banner(g, `${this.api.players[w].name} ÇEKTİ!`, `${this.wins[0]} - ${this.wins[1]}`, PCOL[w], 2.3 - this.phaseT);
    }
  }
}

export default {
  id: 'tug',
  name: 'Halat Çekme',
  icon: '💪',
  tag: 'Parmak yarışı',
  mode: 'versus',
  cat: 'aksiyon',
  color: '#8a6a3a',
  desc: 'A ve B düğmelerine sırayla, olabildiğince hızlı bas! Aynı düğmeye üst üste basmak az güç verir. Halatı kendi tarafına çeken raundu alır.',
  howto: ['A ve B’ye sırayla bas: A-B-A-B', 'Ritmini bozmadan hızlan', 'Aynı tuşa iki kez basmak zayıf çeker', '3 rauntta 2 alan kazanır'],
  keys: '1. oyuncu F / G · 2. oyuncu K / L',
  controller: { layout: 'ab', a: 'ÇEK', b: 'ÇEK' },
  create: (api) => new TugGame(api),
};
