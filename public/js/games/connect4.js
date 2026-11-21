// DÖRTLE — sırayla taş bırak, yatay, dikey ya da çapraz 4'lü yapan kazanır. 3 oyunda 2 alan kazanır.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, winDots, shade, rgba, sprite, Layer } from '../host/gfx.js';

const COLS = 7;
const ROWS = 6;
const CELL = 82;
const BX = (W - COLS * CELL) / 2;
const BY = 170;
const TURN_T = 15;
const NEED = 2;

class Connect4Game {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.wins = [0, 0];
    this.round = 0;
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.board = new Layer(COLS * CELL + 40, ROWS * CELL + 40, (g) => this.paintBoard(g));
    this.starter = Math.random() < 0.5 ? 0 : 1;
    this.newRound();
  }

  newRound() {
    this.round++;
    this.grid = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    this.turn = this.round === 1 ? this.starter : this.turn;
    this.cursor = 3;
    this.t = TURN_T;
    this.drop = null;
    this.winLine = null;
    this.phase = this.round === 1 ? 'play' : 'intro';
    this.phaseT = 1.6;
    this.moves = 0;
    this.pushPads();
  }

  pushPads() {
    for (const p of [0, 1]) {
      const info = `Oyun ${this.round} · ${this.wins[0]} - ${this.wins[1]}`;
      if (this.phase === 'play' && this.turn === p && !this.drop) this.api.setPad(p, { title: `Sıra sende! · ${info}` });
      else this.api.setPad(p, { layout: 'wait', text: this.phase === 'play' ? 'Rakibin oynuyor…' : 'Bekle…', sub: info, title: info });
    }
  }

  onKey(p, k, down) {
    if (!down || this.phase !== 'play' || this.drop || p !== this.turn) return;
    if (k === 'left') this.cursor = (this.cursor + COLS - 1) % COLS;
    else if (k === 'right') this.cursor = (this.cursor + 1) % COLS;
    else if (k === 'a' || k === 'down' || k === 'b') this.place(this.cursor);
    if (k === 'left' || k === 'right') this.api.sfx('move');
  }

  topFree(c) {
    for (let r = ROWS - 1; r >= 0; r--) if (this.grid[r][c] < 0) return r;
    return -1;
  }

  place(c) {
    let r = this.topFree(c);
    if (r < 0) {
      // dolu sütun: en yakın boş sütuna kaydır
      for (let d = 1; d < COLS && r < 0; d++) {
        for (const cc of [c - d, c + d]) {
          if (cc >= 0 && cc < COLS && this.topFree(cc) >= 0) {
            c = cc;
            r = this.topFree(cc);
            break;
          }
        }
      }
      if (r < 0) return;
      this.cursor = c;
    }
    this.drop = { c, r, y: -1, vy: 0, p: this.turn, bounced: false };
    this.api.sfx('place');
    this.pushPads();
  }

  check(r, c, p) {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
      const line = [[r, c]];
      for (const s of [1, -1]) {
        let rr2 = r + dr * s;
        let cc = c + dc * s;
        while (rr2 >= 0 && rr2 < ROWS && cc >= 0 && cc < COLS && this.grid[rr2][cc] === p) {
          line.push([rr2, cc]);
          rr2 += dr * s;
          cc += dc * s;
        }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        this.phase = 'play';
        this.pushPads();
      }
      return;
    }
    if (this.phase === 'over') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const w = this.roundWinner;
        if (w !== null && this.wins[w] >= NEED) {
          this.phase = 'done';
          this.api.end({ winner: w, detail: `Oyunlar ${this.wins[0]} - ${this.wins[1]}` });
          return;
        }
        // kaybeden başlar
        this.turn = w === null ? 1 - this.lastStarter : 1 - w;
        this.newRound();
      }
      return;
    }
    if (this.drop) {
      const d = this.drop;
      d.vy += 40 * dt;
      d.y += d.vy * dt;
      if (d.y >= d.r) {
        if (!d.bounced && d.vy > 3) {
          d.y = d.r;
          d.vy = -d.vy * 0.25;
          d.bounced = true;
          this.api.sfx('lock');
        } else {
          this.grid[d.r][d.c] = d.p;
          this.drop = null;
          this.moves++;
          this.afterMove(d.r, d.c, d.p);
        }
      }
      return;
    }
    this.t -= dt;
    if (this.t <= 0) {
      this.pops.add('SÜRE DOLDU!', W / 2, BY - 40, '#ff8a8a', 34, 1);
      this.place(this.cursor);
    }
  }

  afterMove(r, c, p) {
    if (this.moves === 1) this.lastStarter = p;
    const line = this.check(r, c, p);
    if (line) {
      this.winLine = line;
      this.roundWinner = p;
      this.wins[p]++;
      this.phase = 'over';
      this.phaseT = 2.8;
      for (const [lr, lc] of line) this.parts.burst(BX + (lc + 0.5) * CELL, BY + (lr + 0.5) * CELL, 10, [PCOL[p], '#fff'], { speed: 260, size: 6, life: 0.8, gravity: 200 });
      this.shake.add(6, 0.3);
      this.api.sfx('power');
      this.api.buzz(p, 150);
      this.api.buzz(1 - p, 300);
      this.pushPads();
      return;
    }
    if (this.moves >= COLS * ROWS) {
      this.roundWinner = null;
      this.phase = 'over';
      this.phaseT = 2.4;
      this.pushPads();
      return;
    }
    this.turn = 1 - p;
    this.t = TURN_T;
    this.pushPads();
  }

  demo() {
    const seq = [3, 3, 2, 4, 4, 2, 5, 1, 2];
    seq.forEach((c, i) => {
      this.grid[this.topFree(c)][c] = i % 2;
    });
    this.turn = 1;
    this.cursor = 6;
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#3b2618');
    bg.addColorStop(1, '#22150d');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.03)';
    g.lineWidth = 2;
    for (let y = 20; y < H; y += 26) {
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(W * 0.3, y + 8, W * 0.6, y - 8, W, y + 4);
      g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,.35)';
    rr(g, BX - 14, BY - 6, COLS * CELL + 40, ROWS * CELL + 40, 26);
    g.fill();
    for (const p of [0, 1]) {
      const left = p === 0;
      text(g, this.api.players[p].name, left ? 60 : W - 60, 60, { size: 36, color: PCOL[p], weight: 800, align: left ? 'left' : 'right', stroke: 'rgba(0,0,0,.5)', sw: 6 });
    }
  }

  paintBoard(g) {
    // delikli mavi tahta (taşlar arkadan görünür)
    const w = COLS * CELL + 40;
    const h = ROWS * CELL + 40;
    g.beginPath();
    rr(g, 0, 0, w, h, 24);
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = 20 + (c + 0.5) * CELL;
        const y = 20 + (r + 0.5) * CELL;
        g.moveTo(x + CELL * 0.38, y);
        g.arc(x, y, CELL * 0.38, 0, Math.PI * 2, true);
      }
    }
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#3d6dff');
    grad.addColorStop(1, '#2443b8');
    g.fillStyle = grad;
    g.fill('evenodd');
    g.strokeStyle = 'rgba(255,255,255,.2)';
    g.lineWidth = 3;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        g.beginPath();
        g.arc(20 + (c + 0.5) * CELL, 20 + (r + 0.5) * CELL, CELL * 0.38, 0, Math.PI * 2);
        g.stroke();
      }
    }
  }

  discSprite(p) {
    return sprite(`c4|${p}`, CELL, CELL, (g) => {
      const c = CELL / 2;
      const col = PCOL[p];
      const grad = g.createRadialGradient(c - 10, c - 12, 4, c, c, CELL * 0.42);
      grad.addColorStop(0, shade(col, 0.35));
      grad.addColorStop(1, shade(col, -0.3));
      g.fillStyle = grad;
      g.beginPath();
      g.arc(c, c, CELL * 0.42, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = shade(col, -0.45);
      g.lineWidth = 4;
      g.beginPath();
      g.arc(c, c, CELL * 0.3, 0, Math.PI * 2);
      g.stroke();
    });
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    // taşlar (tahtanın arkasında)
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const p = this.grid[r][c];
        if (p >= 0) g.drawImage(this.discSprite(p), BX + c * CELL + 20, BY + r * CELL + 20, CELL, CELL);
      }
    }
    if (this.drop) g.drawImage(this.discSprite(this.drop.p), BX + this.drop.c * CELL + 20, BY + this.drop.y * CELL + 20, CELL, CELL);
    this.board.draw(g, BX, BY);
    // kazanma çizgisi
    if (this.winLine) {
      const pulse = 0.6 + 0.4 * Math.sin(this.time * 10);
      g.strokeStyle = `rgba(255,255,255,${pulse})`;
      g.lineWidth = 6;
      for (const [r, c] of this.winLine) {
        g.beginPath();
        g.arc(BX + 20 + (c + 0.5) * CELL, BY + 20 + (r + 0.5) * CELL, CELL * 0.4, 0, Math.PI * 2);
        g.stroke();
      }
    }
    // imleç taşı
    if (this.phase === 'play' && !this.drop) {
      const bob = Math.sin(this.time * 6) * 4;
      g.drawImage(this.discSprite(this.turn), BX + this.cursor * CELL + 20, BY - CELL + 10 + bob, CELL, CELL);
    }
    this.parts.draw(g);
    g.restore();
    for (const p of [0, 1]) {
      const left = p === 0;
      winDots(g, left ? 60 : W - 60, 104, this.wins[p], NEED, PCOL[p], left ? 'left' : 'right');
      if (this.phase === 'play' && this.turn === p && !this.drop) {
        text(g, 'SIRA SENDE', left ? 60 : W - 60, 148, { size: 22, color: '#ffd23f', weight: 800, align: left ? 'left' : 'right' });
        const f = Math.max(0, this.t / TURN_T);
        g.fillStyle = 'rgba(255,255,255,.12)';
        g.fillRect(left ? 60 : W - 260, 172, 200, 10);
        g.fillStyle = f < 0.3 ? '#ff5a5a' : PCOL[p];
        g.fillRect(left ? 60 : W - 260 + 200 * (1 - f), 172, 200 * f, 10);
      }
    }
    text(g, `OYUN ${this.round}`, W / 2, 40, { size: 28, color: '#f3e2c0', weight: 800 });
    this.pops.draw(g);
    if (this.phase === 'intro') banner(g, `OYUN ${this.round}`, `${this.api.players[this.turn].name} başlıyor`, '#ffd23f', 1.6 - this.phaseT);
    if (this.phase === 'over' && this.phaseT < 2.2) {
      const w = this.roundWinner;
      if (w === null) banner(g, 'BERABERE', 'Tahta doldu', '#ffd23f', 2.2 - this.phaseT);
      else banner(g, `${this.api.players[w].name} DÖRTLEDİ!`, `${this.wins[0]} - ${this.wins[1]}`, PCOL[w], 2.2 - this.phaseT);
    }
  }
}

export default {
  id: 'connect4',
  name: 'Dörtle',
  icon: '🔴',
  tag: 'Sırayla dörtlü bağla',
  mode: 'versus',
  cat: 'bulmaca',
  color: '#3d6dff',
  desc: 'Sırayla taş bırakın; yatay, dikey ya da çapraz dört taşı yan yana getiren kazanır. Hamle başına 15 saniye var!',
  howto: ['◀ ▶ sütun seç', 'A: taşı bırak', 'Sıra sende değilken telefonun bekler', '3 oyunda 2 alan kazanır'],
  keys: '1. oyuncu A/D + F · 2. oyuncu ←/→ + K',
  controller: { layout: 'dpad', dirs: 'lr', a: 'BIRAK', b: null },
  create: (api) => new Connect4Game(api),
};
