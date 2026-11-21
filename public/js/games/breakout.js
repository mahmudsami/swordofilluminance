// TUĞLA KIRICI — iki raket, ortak canlar. Topları düşürmeden bütün tuğlaları birlikte kırın!
// Telefon ekranında parmağını sağa sola kaydırarak raketini yönet. 3 bölüm.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp, rand, pick, sprite, Layer, glow } from '../host/gfx.js';

const FX0 = 40;
const FX1 = 1240;
const FY0 = 64;
const PY = 662; // raket yüksekliği
const PH = 16;
const BW = 96;
const BH = 28;
const GAP = 4;
const COLS = 12;
const BTOP = 96;
const BALL_R = 10;
const LIVES = 5;

const LEVELS = [
  ['111111111111', '122222222221', '1.11111111.1', '111PP11PP111', '111111111111'],
  ['....3333....', '...222222...', '..11111111..', '.1P111111P1.', '222222222222', '111111111111'],
  ['3.3.3.3.3.3.', '.2.2.P.2.2.2', '111111111111', '2P22222222P2', '1.1.1.1.1.1.', '333333333333'],
];
const ROW_COL = ['#ff4f7b', '#ff9a3d', '#ffd23f', '#46e38a', '#2fc7ff', '#8a5cff', '#ff6ad5', '#7fe3ff'];
const PW = { wide: ['#46e38a', 'GENİŞ'], multi: ['#ffd23f', '+2 TOP'], slow: ['#7fe3ff', 'YAVAŞ'], life: ['#ff4f7b', '+CAN'] };

class BreakoutGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.level = 0;
    this.lives = LIVES;
    this.score = [0, 0];
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.brickLayer = new Layer(W, H, (g) => this.paintBricks(g));
    this.paddles = [0, 1].map((p) => ({ p, x: p === 0 ? 440 : 840, w: 150, wideT: 0, vx: 0, tx: null }));
    this.loadLevel(0);
  }

  loadLevel(i) {
    this.level = i;
    this.bricks = [];
    LEVELS[i].forEach((row, r) =>
      row.split('').forEach((ch, c) => {
        if (ch === '.') return;
        const hp = ch === 'P' ? 1 : +ch;
        this.bricks.push({ r, c, hp, max: hp, power: ch === 'P', x: FX0 + c * (BW + 4), y: BTOP + r * (BH + GAP), alive: true });
      })
    );
    this.left = this.bricks.length;
    this.balls = [];
    this.caps = [];
    this.slowT = 0;
    for (const pd of this.paddles) this.attachBall(pd.p);
    this.phase = i === 0 ? 'play' : 'intro';
    this.phaseT = 2;
    this.brickLayer.invalidate();
    this.info();
  }

  info() {
    for (const p of [0, 1]) this.api.info(p, `Bölüm ${this.level + 1}/${LEVELS.length} · ♥ ${this.lives}`);
  }

  attachBall(p) {
    this.balls.push({ x: this.paddles[p].x, y: PY - BALL_R - 1, vx: 0, vy: 0, speed: 520, held: p, holdT: 1.4, owner: p, trail: [] });
  }

  launch(b) {
    const pd = this.paddles[b.held];
    const ang = -Math.PI / 2 + clamp(pd.vx / 2000, -0.5, 0.5) + rand(-0.25, 0.25);
    b.vx = Math.cos(ang) * b.speed;
    b.vy = Math.sin(ang) * b.speed;
    b.held = -1;
    this.api.sfx('bounce');
  }

  onKey(p, k, down) {
    if (down && (k === 'a' || k === 'b' || k === 'up')) {
      for (const b of this.balls) if (b.held === p) this.launch(b);
    }
  }

  updatePaddle(pd, dt) {
    const s = this.api.input[pd.p];
    pd.w = pd.wideT > 0 ? 230 : 150;
    if (pd.wideT > 0) pd.wideT -= dt;
    const half = pd.w / 2;
    const ox = pd.x;
    if (s.touch) {
      const tx = FX0 + half + s.tx * (FX1 - FX0 - pd.w);
      const d = tx - pd.x;
      const step = 2600 * dt;
      pd.x += Math.abs(d) > step ? Math.sign(d) * step : d;
    } else {
      const a = this.api.axis(pd.p);
      pd.x += a.x * 1050 * dt;
    }
    pd.x = clamp(pd.x, FX0 + half, FX1 - half);
    pd.vx = (pd.x - ox) / dt;
  }

  hitBrick(br, b) {
    br.hp--;
    this.shake.add(2, 0.08);
    if (br.hp > 0) {
      this.api.sfx('steel');
      this.repaintBrick(br);
      return;
    }
    br.alive = false;
    this.left--;
    this.score[b.owner] += 10 * br.max;
    const col = ROW_COL[br.r % ROW_COL.length];
    this.parts.burst(br.x + BW / 2, br.y + BH / 2, 10, [col, shade(col, 0.4), '#fff'], { speed: 240, size: 6, life: 0.5 });
    this.api.sfx('hit');
    if (br.power || Math.random() < 0.08) this.caps.push({ type: pick(['wide', 'multi', 'multi', 'slow', 'life']), x: br.x + BW / 2, y: br.y + BH / 2 });
    this.repaintBrick(br);
  }

  repaintBrick(br) {
    if (this.brickLayer.dirty || !this.brickLayer.cv) return;
    const g = this.brickLayer.ctx();
    g.clearRect(br.x - 1, br.y - 1, BW + 2, BH + 2);
    if (br.alive) this.paintBrick(g, br);
  }

  moveBall(b, dt) {
    const steps = Math.ceil((b.speed * dt) / 4);
    const sd = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.x += b.vx * sd;
      b.y += b.vy * sd;
      // duvarlar
      if (b.x - BALL_R < FX0) {
        b.x = FX0 + BALL_R;
        b.vx = Math.abs(b.vx);
        this.api.sfx('bounce');
      }
      if (b.x + BALL_R > FX1) {
        b.x = FX1 - BALL_R;
        b.vx = -Math.abs(b.vx);
        this.api.sfx('bounce');
      }
      if (b.y - BALL_R < FY0) {
        b.y = FY0 + BALL_R;
        b.vy = Math.abs(b.vy);
        this.api.sfx('bounce');
      }
      // raketler
      if (b.vy > 0 && b.y + BALL_R >= PY && b.y + BALL_R <= PY + PH + 6) {
        for (const pd of this.paddles) {
          const half = pd.w / 2;
          if (b.x >= pd.x - half - BALL_R && b.x <= pd.x + half + BALL_R) {
            const off = clamp((b.x - pd.x) / half, -1, 1);
            const ang = -Math.PI / 2 + off * 1.05;
            b.speed = Math.min(this.slowT > 0 ? 470 : 860, b.speed + 12);
            b.vx = Math.cos(ang) * b.speed;
            b.vy = Math.sin(ang) * b.speed;
            b.y = PY - BALL_R;
            b.owner = pd.p;
            this.api.sfx('thock');
            this.api.buzz(pd.p, 20);
            break;
          }
        }
      }
      // tuğlalar (topun çevresindeki hücrelere bak)
      const c0 = Math.floor((b.x - BALL_R - FX0) / (BW + 4));
      const c1 = Math.floor((b.x + BALL_R - FX0) / (BW + 4));
      const r0 = Math.floor((b.y - BALL_R - BTOP) / (BH + GAP));
      const r1 = Math.floor((b.y + BALL_R - BTOP) / (BH + GAP));
      let hit = null;
      for (const br of this.bricks) {
        if (!br.alive || br.c < c0 || br.c > c1 || br.r < r0 || br.r > r1) continue;
        const px = clamp(b.x, br.x, br.x + BW);
        const py = clamp(b.y, br.y, br.y + BH);
        if ((b.x - px) ** 2 + (b.y - py) ** 2 <= BALL_R * BALL_R) {
          hit = br;
          break;
        }
      }
      if (hit) {
        // hangi kenardan çarptı: en az iç içe geçen eksen
        const ox = Math.min(b.x + BALL_R - hit.x, hit.x + BW - (b.x - BALL_R));
        const oy = Math.min(b.y + BALL_R - hit.y, hit.y + BH - (b.y - BALL_R));
        if (ox < oy) {
          b.vx = b.x < hit.x + BW / 2 ? -Math.abs(b.vx) : Math.abs(b.vx);
          b.x += b.vx > 0 ? ox : -ox;
        } else {
          b.vy = b.y < hit.y + BH / 2 ? -Math.abs(b.vy) : Math.abs(b.vy);
          b.y += b.vy > 0 ? oy : -oy;
        }
        this.hitBrick(hit, b);
      }
      // çok yatay gidişi engelle
      const sp = Math.hypot(b.vx, b.vy) || 1;
      if (Math.abs(b.vy) < sp * 0.28) {
        b.vy = (b.vy < 0 ? -1 : 1) * sp * 0.28;
        b.vx = Math.sign(b.vx || 1) * Math.sqrt(sp * sp - b.vy * b.vy);
      }
      if (b.y - BALL_R > H) return false;
    }
    return true;
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    for (const pd of this.paddles) this.updatePaddle(pd, dt);
    if (this.phase === 'intro') {
      this.phaseT -= dt;
      for (const b of this.balls) if (b.held >= 0) b.x = this.paddles[b.held].x;
      if (this.phaseT <= 0) this.phase = 'play';
      return;
    }
    if (this.phase === 'won' || this.phase === 'lost' || this.phase === 'next') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        const pn = this.api.players;
        const detail = `${pn[0].name}: ${this.score[0]} puan · ${pn[1].name}: ${this.score[1]} puan`;
        if (this.phase === 'next') return this.loadLevel(this.level + 1);
        this.phase = 'done';
        if (this.phaseT <= 0 && this.lives <= 0) this.api.end({ coop: true, win: false, title: 'Toplar bitti!', detail: `${this.level + 1}. bölümde kaldınız · ${detail}` });
        else this.api.end({ coop: true, win: true, title: 'Bütün tuğlalar kırıldı!', detail });
      }
      return;
    }
    if (this.slowT > 0) {
      this.slowT -= dt;
      if (this.slowT <= 0) for (const b of this.balls) b.speed = Math.max(b.speed, 560);
    }
    for (const b of this.balls) {
      if (b.held >= 0) {
        b.x = this.paddles[b.held].x;
        b.y = PY - BALL_R - 1;
        b.holdT -= dt;
        if (b.holdT <= 0) this.launch(b);
        continue;
      }
      b.alive = this.moveBall(b, dt);
      b.trail.push(b.x, b.y);
      if (b.trail.length > 16) b.trail.splice(0, 2);
    }
    const before = this.balls.length;
    this.balls = this.balls.filter((b) => b.held >= 0 || b.alive !== false);
    if (this.balls.length < before) this.api.sfx('lose');
    // kapsüller
    for (const c of this.caps) c.y += 170 * dt;
    this.caps = this.caps.filter((c) => {
      if (c.y > H + 20) return false;
      for (const pd of this.paddles) {
        if (Math.abs(c.x - pd.x) < pd.w / 2 + 18 && Math.abs(c.y - (PY + PH / 2)) < 18) {
          this.applyPower(c.type, pd);
          return false;
        }
      }
      return true;
    });
    if (!this.balls.length) {
      this.lives--;
      this.shake.add(8, 0.3);
      this.api.buzz(0, 250);
      this.api.buzz(1, 250);
      this.info();
      if (this.lives <= 0) {
        this.phase = 'lost';
        this.phaseT = 2.6;
        return;
      }
      this.pops.add('TOP DÜŞTÜ!', W / 2, H / 2 + 60, '#ff6b7a', 46, 1.4);
      for (const pd of this.paddles) this.attachBall(pd.p);
    }
    if (this.left <= 0) {
      this.balls = [];
      this.caps = [];
      this.api.sfx('win');
      if (this.level + 1 >= LEVELS.length) {
        this.phase = 'won';
        this.phaseT = 2.6;
      } else {
        this.phase = 'next';
        this.phaseT = 2.4;
      }
    }
  }

  applyPower(type, pd) {
    this.api.sfx('power');
    this.api.buzz(pd.p, 50);
    this.pops.add(PW[type][1], pd.x, PY - 40, PW[type][0], 30, 1);
    if (type === 'wide') pd.wideT = 15;
    else if (type === 'life') {
      this.lives++;
      this.info();
    } else if (type === 'slow') {
      this.slowT = 10;
      for (const b of this.balls) {
        const sp = Math.hypot(b.vx, b.vy) || 1;
        b.speed = 420;
        if (b.held < 0) {
          b.vx = (b.vx / sp) * 420;
          b.vy = (b.vy / sp) * 420;
        }
      }
    } else if (type === 'multi') {
      const src = this.balls.find((b) => b.held < 0) || this.balls[0];
      if (!src) return;
      for (const da of [-0.5, 0.5]) {
        if (this.balls.length >= 10) break;
        const ang = Math.atan2(src.vy || -1, src.vx || 0) + da;
        const sp = src.speed;
        this.balls.push({ x: src.x, y: src.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, speed: sp, held: -1, holdT: 0, owner: pd.p, trail: [] });
      }
    }
  }

  demo() {
    this.balls[0].held = -1;
    this.balls[0].x = 520;
    this.balls[0].y = 420;
    this.caps.push({ type: 'multi', x: 760, y: 470 });
    for (let i = 0; i < 6; i++) this.bricks[i * 3].alive = false;
    this.brickLayer.invalidate();
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#120f33');
    bg.addColorStop(1, '#070616');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,110,255,.06)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = FX0; x <= FX1; x += 50) {
      g.moveTo(x + 0.5, FY0);
      g.lineTo(x + 0.5, H);
    }
    for (let y = FY0; y <= H; y += 50) {
      g.moveTo(FX0, y + 0.5);
      g.lineTo(FX1, y + 0.5);
    }
    g.stroke();
    g.fillStyle = '#2b2660';
    g.fillRect(FX0 - 10, FY0 - 10, 10, H);
    g.fillRect(FX1, FY0 - 10, 10, H);
    g.fillRect(FX0 - 10, FY0 - 10, FX1 - FX0 + 20, 10);
  }

  paintBrick(g, br) {
    const col = br.max > 1 ? ['#9aa0c0', '#c08bff', '#ff6ad5'][br.max - 1] : ROW_COL[br.r % ROW_COL.length];
    const grad = g.createLinearGradient(0, br.y, 0, br.y + BH);
    grad.addColorStop(0, shade(col, 0.25));
    grad.addColorStop(1, shade(col, -0.25));
    rr(g, br.x, br.y, BW, BH, 6);
    g.fillStyle = grad;
    g.fill();
    g.fillStyle = 'rgba(255,255,255,.3)';
    g.fillRect(br.x + 6, br.y + 4, BW - 12, 4);
    if (br.max > 1) {
      // kalan dayanıklılık
      for (let i = 0; i < br.hp; i++) {
        g.fillStyle = 'rgba(20,16,40,.55)';
        g.beginPath();
        g.arc(br.x + BW / 2 + (i - (br.hp - 1) / 2) * 14, br.y + BH / 2 + 3, 4, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (br.power) {
      g.strokeStyle = '#fff';
      g.lineWidth = 2;
      rr(g, br.x + 2, br.y + 2, BW - 4, BH - 4, 5);
      g.stroke();
      text(g, '★', br.x + BW / 2, br.y + BH / 2 + 1, { size: 18, color: '#fff', weight: 800 });
    }
  }

  paintBricks(g) {
    for (const br of this.bricks) if (br.alive) this.paintBrick(g, br);
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    this.brickLayer.draw(g);
    for (const c of this.caps) {
      const [col, label] = PW[c.type];
      const spr = sprite(`bk-cap|${c.type}`, 92, 40, (sg) => {
        rr(sg, 4, 6, 84, 28, 14);
        sg.fillStyle = shade(col, -0.45);
        sg.fill();
        sg.strokeStyle = col;
        sg.lineWidth = 3;
        sg.stroke();
        text(sg, label, 46, 21, { size: 15, color: col, weight: 800 });
      });
      g.drawImage(spr, c.x - 46, c.y - 20, 92, 40);
    }
    for (const pd of this.paddles) {
      const col = PCOL[pd.p];
      g.drawImage(glow(col, 70, 0.35), pd.x - pd.w / 2 - 20, PY - 40, pd.w + 40, 90);
      const grad = g.createLinearGradient(0, PY, 0, PY + PH);
      grad.addColorStop(0, shade(col, 0.35));
      grad.addColorStop(1, shade(col, -0.3));
      rr(g, pd.x - pd.w / 2, PY, pd.w, PH, 8);
      g.fillStyle = grad;
      g.fill();
    }
    for (const b of this.balls) {
      const t = b.trail;
      for (let i = 0; i < t.length; i += 2) {
        g.globalAlpha = (i / t.length) * 0.35;
        g.fillStyle = PCOL[b.owner];
        g.beginPath();
        g.arc(t[i], t[i + 1], BALL_R * (0.4 + (0.6 * i) / t.length), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.drawImage(glow('#ffffff', 22, 0.5), b.x - 22, b.y - 22, 44, 44);
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      g.fill();
    }
    this.parts.draw(g);
    g.restore();
    // üst bilgi
    text(g, `${this.api.players[0].name}  ${this.score[0]}`, FX0, 32, { size: 26, color: PCOL[0], weight: 800, align: 'left' });
    text(g, `${this.score[1]}  ${this.api.players[1].name}`, FX1, 32, { size: 26, color: PCOL[1], weight: 800, align: 'right' });
    text(g, `BÖLÜM ${this.level + 1}/${LEVELS.length}`, W / 2 - 90, 32, { size: 22, color: '#a7a2d1', weight: 800 });
    text(g, '♥'.repeat(Math.max(0, Math.min(this.lives, 8))) + (this.lives > 8 ? '+' : ''), W / 2 + 90, 32, { size: 24, color: '#ff4f7b', weight: 800 });
    if (this.balls.some((b) => b.held >= 0) && this.phase === 'play') text(g, 'Top birazdan fırlıyor… (A ile hemen at)', W / 2, PY - 60, { size: 20, color: 'rgba(255,255,255,.6)', weight: 700 });
    this.pops.draw(g);
    if (this.phase === 'intro') banner(g, `BÖLÜM ${this.level + 1}`, 'Birlikte kırın!', '#ffd23f', 2 - this.phaseT);
    if (this.phase === 'next') banner(g, 'BÖLÜM TAMAM!', `Sıradaki: Bölüm ${this.level + 2}`, '#46e38a', 2.4 - this.phaseT);
    if (this.phase === 'won') banner(g, 'HARİKA!', 'Bütün bölümler bitti', '#46e38a', 2.6 - this.phaseT);
    if (this.phase === 'lost') banner(g, 'TOPLAR BİTTİ', 'Bir dahaki sefere…', '#ff5a5a', 2.6 - this.phaseT);
  }
}

export default {
  id: 'breakout',
  name: 'Tuğla Kırıcı',
  icon: '💥',
  tag: 'Birlikte tuğla kırma',
  mode: 'coop',
  cat: 'takim',
  color: '#ff9a3d',
  desc: 'İki raket, ortak canlar! Topları düşürmeden bütün tuğlaları birlikte kırın. Yıldızlı tuğlalardan güçlendirme düşer: geniş raket, ek top, yavaş top, ek can.',
  howto: ['Telefon ekranında parmağını sağa sola kaydır', 'Raket parmağının olduğu yere gider', 'Top raketin neresine değerse o yöne sekme yapar', 'Bütün toplar düşerse 1 can gider · 3 bölüm'],
  keys: '1. oyuncu A/D + F (topu at) · 2. oyuncu ←/→ + K',
  controller: { layout: 'touch', a: null, b: null, padHint: '◀  parmağını sağa sola kaydır  ▶' },
  create: (api) => new BreakoutGame(api),
};
