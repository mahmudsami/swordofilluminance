// PENALTI ATIŞLARI — telefon ekranında gizli seçim: atan köşesini, kaleci atlayacağı yeri seçer.
// Sırayla 5'er atış; eşitlikte seri penaltılar.
import { W, H, PCOL, text, rr, Particles, Popups, Shake, banner, shade, rgba, clamp, lerp, sprite, Layer, glow } from '../host/gfx.js';

const GL = 360; // kale sol
const GR = 920; // kale sağ
const GT = 200; // kale üst
const GB = 470; // kale alt (çizgi)
const SPOT = [640, 655];
const CHOOSE_T = 9;
const ZONES = [
  { id: '0', label: '↖', sub: 'Sol üst' },
  { id: '1', label: '↑', sub: 'Orta üst' },
  { id: '2', label: '↗', sub: 'Sağ üst' },
  { id: '3', label: '↙', sub: 'Sol alt' },
  { id: '4', label: '↓', sub: 'Orta alt' },
  { id: '5', label: '↘', sub: 'Sağ alt' },
];
const MISS = [0.18, 0.06, 0.18, 0.06, 0, 0.06]; // dışarı / direk olasılığı

function zonePoint(z) {
  const col = z % 3;
  const row = z < 3 ? 0 : 1;
  const x = lerp(GL + 70, GR - 70, col / 2);
  const y = row === 0 ? GT + 62 : GB - 56;
  return [x, y];
}

class PenaltyGame {
  constructor(api) {
    this.api = api;
    this.time = 0;
    this.kick = 0; // toplam atış sayısı
    this.marks = [[], []]; // her oyuncunun atış sonuçları
    this.parts = new Particles();
    this.pops = new Popups();
    this.shake = new Shake();
    this.bg = new Layer(W, H, (g) => this.paintBg(g));
    this.kbd = [0, 0]; // klavye oyuncuları için imleç
    this.startKick();
  }

  get shooter() {
    return this.kick % 2;
  }
  get keeper() {
    return 1 - this.shooter;
  }

  startKick() {
    this.phase = 'choose';
    this.t = CHOOSE_T;
    this.pick = [null, null]; // [atanın seçimi, kalecinin seçimi] oyuncu sırasına göre
    this.ball = { x: SPOT[0], y: SPOT[1], s: 1, vis: true };
    this.keeperPos = { x: 640, y: GB - 70, rot: 0, dz: -1 };
    this.outcome = null;
    this.pushPads();
    for (const p of [0, 1]) this.api.info(p, this.scoreLine());
  }

  scoreLine() {
    const g = (p) => this.marks[p].filter(Boolean).length;
    return `${this.api.players[0].name} ${g(0)} - ${g(1)} ${this.api.players[1].name}`;
  }

  pushPads() {
    const s = this.shooter;
    const k = this.keeper;
    if (this.phase === 'choose') {
      this.api.setPad(s, this.pick[s] === null
        ? { layout: 'choice', cols: 3, prompt: '⚽ Nereye vuracaksın?', options: ZONES, title: 'Sen atıyorsun' }
        : { layout: 'choice', cols: 3, prompt: '✓ Seçimin kilitlendi', options: ZONES, sel: this.pick[s], lock: true, title: 'Sen atıyorsun' });
      this.api.setPad(k, this.pick[k] === null
        ? { layout: 'choice', cols: 3, prompt: '🧤 Nereye atlayacaksın?', options: ZONES, title: 'Kalecisin' }
        : { layout: 'choice', cols: 3, prompt: '✓ Seçimin kilitlendi', options: ZONES, sel: this.pick[k], lock: true, title: 'Kalecisin' });
    } else {
      for (const p of [0, 1]) this.api.setPad(p, { layout: 'wait', text: 'Atış izleniyor…', sub: 'TV ekranına bak', title: this.scoreLine() });
    }
  }

  onChoose(p, id) {
    if (this.phase !== 'choose' || this.pick[p] !== null) return;
    const z = +id;
    if (!(z >= 0 && z < 6)) return;
    this.pick[p] = z;
    this.api.sfx('beep');
    this.pushPads();
    if (this.pick[0] !== null && this.pick[1] !== null) this.resolve();
  }

  // klavye oyuncuları: yön tuşlarıyla gizli imleç, A ile onay
  onKey(p, k, down) {
    if (!down || this.phase !== 'choose' || this.pick[p] !== null) return;
    let c = this.kbd[p];
    if (k === 'left' && c % 3 > 0) c--;
    if (k === 'right' && c % 3 < 2) c++;
    if (k === 'up' && c >= 3) c -= 3;
    if (k === 'down' && c < 3) c += 3;
    this.kbd[p] = c;
    if (k === 'a') this.onChoose(p, String(c));
  }

  resolve() {
    const s = this.shooter;
    const k = this.keeper;
    if (this.pick[s] === null) this.pick[s] = Math.floor(Math.random() * 6);
    if (this.pick[k] === null) this.pick[k] = Math.floor(Math.random() * 6);
    const sz = this.pick[s];
    const kz = this.pick[k];
    let out = 'goal';
    if (Math.random() < MISS[sz]) out = Math.random() < 0.5 ? 'post' : 'wide';
    else if (kz === sz) out = 'save';
    else {
      const sameRow = (sz < 3) === (kz < 3);
      const adj = sameRow && Math.abs((sz % 3) - (kz % 3)) === 1;
      const sameCol = sz % 3 === kz % 3;
      if ((adj && Math.random() < 0.35) || (sameCol && Math.random() < 0.25)) out = 'save';
    }
    this.outcome = out;
    this.phase = 'shoot';
    this.t = 0;
    let [tx, ty] = zonePoint(sz);
    if (out === 'wide') {
      tx += sz % 3 === 0 ? -110 : sz % 3 === 2 ? 110 : 0;
      ty -= 90;
    }
    if (out === 'post') {
      if (sz % 3 === 0) tx = GL + 4;
      else if (sz % 3 === 2) tx = GR - 4;
      else ty = GT + 4;
    }
    this.target = [tx, ty];
    const [kx, ky] = zonePoint(kz);
    this.keeperTarget = out === 'save' ? [lerp(kx, tx, 0.75), lerp(ky, ty, 0.75)] : [kx, ky];
    this.api.sfx('shoot');
    this.pushPads();
  }

  update(dt) {
    this.time += dt;
    this.parts.update(dt);
    this.pops.update(dt);
    this.shake.update(dt);
    if (this.phase === 'choose') {
      this.t -= dt;
      if (this.t <= 0) this.resolve();
      return;
    }
    if (this.phase === 'shoot') {
      this.t += dt;
      const D = 0.55; // topun uçuş süresi
      const f = Math.min(1, this.t / D);
      const [tx, ty] = this.target;
      const e = 1 - (1 - f) * (1 - f);
      this.ball.x = lerp(SPOT[0], tx, e);
      this.ball.y = lerp(SPOT[1], ty, e) - Math.sin(f * Math.PI) * 60;
      this.ball.s = lerp(1, 0.55, e);
      // kaleci biraz gecikmeyle atlar
      const kf = clamp((this.t - 0.08) / 0.42, 0, 1);
      const [kx, ky] = this.keeperTarget;
      this.keeperPos.x = lerp(640, kx, kf);
      this.keeperPos.y = lerp(GB - 70, ky, kf);
      this.keeperPos.rot = (kx - 640) / 260 * kf * 1.1;
      if (f >= 1 && !this.landed) {
        this.landed = true;
        const s = this.shooter;
        const out = this.outcome;
        this.marks[s].push(out === 'goal');
        if (out === 'goal') {
          this.parts.burst(tx, ty, 34, [PCOL[s], '#fff', '#ffd23f'], { speed: 380, size: 8, life: 1, gravity: 300 });
          this.shake.add(8, 0.3);
          this.api.sfx('goal');
          this.api.buzz(s, 120);
          this.api.buzz(this.keeper, 250);
        } else if (out === 'save') {
          this.parts.burst(tx, ty, 16, ['#fff', PCOL[this.keeper]], { speed: 260, size: 6, life: 0.6, gravity: 200 });
          this.shake.add(5, 0.2);
          this.api.sfx('thock');
          this.api.buzz(this.keeper, 120);
          this.api.buzz(s, 250);
        } else {
          this.api.sfx(out === 'post' ? 'steel' : 'lose');
          this.api.buzz(s, 250);
        }
      }
      if (this.t > 2.2) {
        this.landed = false;
        this.kick++;
        const fin = this.finished();
        if (fin !== null) {
          this.phase = 'done';
          const g0 = this.marks[0].filter(Boolean).length;
          const g1 = this.marks[1].filter(Boolean).length;
          this.api.end({ winner: fin, detail: `Penaltılar ${g0} - ${g1}` });
          return;
        }
        this.startKick();
      }
    }
  }

  finished() {
    const n0 = this.marks[0].length;
    const n1 = this.marks[1].length;
    const g0 = this.marks[0].filter(Boolean).length;
    const g1 = this.marks[1].filter(Boolean).length;
    if (n0 <= 5 && n1 <= 5) {
      // kalan atışlarla yetişemiyorsa erken bitir
      if (g0 > g1 + (5 - n1)) return 0;
      if (g1 > g0 + (5 - n0)) return 1;
      if (n0 === 5 && n1 === 5 && g0 !== g1) return g0 > g1 ? 0 : 1;
      return null;
    }
    // seri penaltılar: eşit atışta fark varsa biter
    if (n0 === n1 && g0 !== g1) return g0 > g1 ? 0 : 1;
    return null;
  }

  demo() {
    this.marks = [[true, false, true], [true, true]];
    this.phase = 'shoot';
    this.t = 0.4;
    this.outcome = 'goal';
    this.target = zonePoint(0);
    this.keeperTarget = zonePoint(5);
    this.ball.x = 520;
    this.ball.y = 330;
    this.ball.s = 0.65;
    this.keeperPos = { x: 760, y: GB - 60, rot: 0.4 };
  }

  // ---------------------------------------------------------------- çizim
  paintBg(g) {
    const sky = g.createLinearGradient(0, 0, 0, 330);
    sky.addColorStop(0, '#0d1b3d');
    sky.addColorStop(1, '#2b4377');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const crowd = ['#ff4f7b', '#2fc7ff', '#ffd23f', '#ffffff', '#46e38a'];
    g.fillStyle = '#1a2347';
    g.fillRect(0, 90, W, 160);
    for (let row = 0; row < 6; row++) {
      for (let i = 0; i < 70; i++) {
        g.fillStyle = rgba(crowd[(rnd() * crowd.length) | 0], 0.3 + rnd() * 0.3);
        g.beginPath();
        g.arc(i * 19 + (row % 2) * 9, 108 + row * 24, 6, 0, Math.PI * 2);
        g.fill();
      }
    }
    // çim (perspektif şeritler)
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? '#2f8f45' : '#36a04e';
      const y0 = 250 + i * i * 6;
      const y1 = 250 + (i + 1) * (i + 1) * 6;
      g.fillRect(0, y0, W, y1 - y0);
    }
    g.fillStyle = '#2f8f45';
    g.fillRect(0, 250 + 81 * 6, W, H);
    // ceza sahası çizgileri
    g.strokeStyle = 'rgba(255,255,255,.55)';
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(0, GB);
    g.lineTo(W, GB);
    g.moveTo(GL - 180, GB);
    g.lineTo(GL - 300, H);
    g.moveTo(GR + 180, GB);
    g.lineTo(GR + 300, H);
    g.stroke();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(SPOT[0], SPOT[1] + 22, 12, 5, 0, 0, Math.PI * 2);
    g.fill();
    // kale ağı
    g.fillStyle = 'rgba(255,255,255,.06)';
    g.fillRect(GL, GT, GR - GL, GB - GT);
    g.strokeStyle = 'rgba(255,255,255,.22)';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let x = GL; x <= GR; x += 20) {
      g.moveTo(x, GT);
      g.lineTo(x, GB);
    }
    for (let y = GT; y <= GB; y += 20) {
      g.moveTo(GL, y);
      g.lineTo(GR, y);
    }
    g.stroke();
    g.fillStyle = '#f2f2f2';
    g.fillRect(GL - 10, GT - 10, 10, GB - GT + 10);
    g.fillRect(GR, GT - 10, 10, GB - GT + 10);
    g.fillRect(GL - 10, GT - 10, GR - GL + 20, 10);
  }

  drawKeeper(g, p) {
    const col = PCOL[p];
    const { x, y, rot } = this.keeperPos;
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath();
    g.ellipse(0, 72, 46, 10, 0, 0, Math.PI * 2);
    g.fill();
    // gövde
    g.fillStyle = shade(col, -0.1);
    rr(g, -34, -6, 68, 74, 22);
    g.fill();
    // kollar ve eldivenler
    g.strokeStyle = shade(col, -0.25);
    g.lineWidth = 14;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-30, 10);
    g.lineTo(-62, -30);
    g.moveTo(30, 10);
    g.lineTo(62, -30);
    g.stroke();
    g.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.arc(s * 66, -36, 14, 0, Math.PI * 2);
      g.fill();
    }
    // baş
    g.fillStyle = shade(col, 0.15);
    g.beginPath();
    g.arc(0, -34, 32, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.ellipse(-11, -38, 8, 10, 0, 0, Math.PI * 2);
    g.ellipse(11, -38, 8, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#141225';
    g.beginPath();
    g.arc(-11, -36, 4, 0, Math.PI * 2);
    g.arc(11, -36, 4, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  ballSprite() {
    return sprite('pk-ball', 52, 52, (g) => {
      g.fillStyle = '#fafafa';
      g.beginPath();
      g.arc(26, 26, 24, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#23233a';
      const pent = (x, y, r) => {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
          g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        g.fill();
      };
      pent(26, 26, 8);
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / 5;
        pent(26 + Math.cos(a) * 18, 26 + Math.sin(a) * 18, 5);
      }
    });
  }

  draw(g) {
    this.bg.draw(g);
    g.save();
    this.shake.apply(g);
    const s = this.shooter;
    const k = this.keeper;
    if (this.phase === 'choose') {
      // bölgeler (seçim gizli)
      g.strokeStyle = 'rgba(255,255,255,.12)';
      g.lineWidth = 2;
      g.setLineDash([8, 8]);
      g.beginPath();
      g.moveTo(GL + (GR - GL) / 3, GT);
      g.lineTo(GL + (GR - GL) / 3, GB);
      g.moveTo(GL + ((GR - GL) * 2) / 3, GT);
      g.lineTo(GL + ((GR - GL) * 2) / 3, GB);
      g.moveTo(GL, (GT + GB) / 2);
      g.lineTo(GR, (GT + GB) / 2);
      g.stroke();
      g.setLineDash([]);
    }
    this.drawKeeper(g, k);
    // atıcı karakteri topun arkasında
    if (this.phase === 'choose' || this.t < 0.2) {
      const col = PCOL[s];
      g.fillStyle = shade(col, -0.1);
      g.beginPath();
      g.arc(SPOT[0] - 70, SPOT[1] - 10, 30, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(SPOT[0] - 62, SPOT[1] - 16, 7, 0, Math.PI * 2);
      g.arc(SPOT[0] - 80, SPOT[1] - 16, 7, 0, Math.PI * 2);
      g.fill();
    }
    const b = this.ball;
    const spr = this.ballSprite();
    const sz = 52 * b.s;
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath();
    g.ellipse(b.x, Math.max(b.y + 22 * b.s, lerp(SPOT[1] + 22, GB, 1 - (b.s - 0.55) / 0.45)), 20 * b.s, 6 * b.s, 0, 0, Math.PI * 2);
    g.fill();
    g.save();
    g.translate(b.x, b.y);
    g.rotate(this.time * 8 * (this.phase === 'shoot' ? 1 : 0));
    g.drawImage(spr, -sz / 2, -sz / 2, sz, sz);
    g.restore();
    this.parts.draw(g);
    g.restore();

    // skor tabelası: atış noktaları
    for (const p of [0, 1]) {
      const left = p === 0;
      const x = left ? 30 : W - 30;
      text(g, this.api.players[p].name, x, 30, { size: 30, color: PCOL[p], weight: 800, align: left ? 'left' : 'right', stroke: 'rgba(0,0,0,.5)', sw: 6 });
      const n = Math.max(5, this.marks[0].length, this.marks[1].length);
      for (let i = 0; i < n; i++) {
        const cx = left ? x + 12 + i * 30 : x - 12 - i * 30;
        const m = this.marks[p][i];
        g.fillStyle = m === undefined ? 'rgba(255,255,255,.18)' : m ? '#46e38a' : '#ff5a5a';
        g.beginPath();
        g.arc(cx, 68, 10, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (this.phase === 'choose') {
      rr(g, W / 2 - 230, 520, 460, 120, 22);
      g.fillStyle = 'rgba(6,8,22,.78)';
      g.fill();
      text(g, `${this.api.players[s].name} atıyor · ${this.api.players[k].name} kalede`, W / 2, 552, { size: 24, color: '#fff', weight: 800 });
      const ready = (p) => (this.pick[p] !== null ? '✓ seçti' : 'seçiyor…');
      text(g, `Atıcı: ${ready(s)}   ·   Kaleci: ${ready(k)}`, W / 2, 588, { size: 20, color: '#c9d3f0', weight: 700 });
      text(g, `${Math.ceil(this.t)} sn`, W / 2, 620, { size: 22, color: this.t < 3 ? '#ff8a8a' : '#ffd23f', weight: 800 });
      text(g, 'Seçimler telefonlarda gizli!', W / 2, 30, { size: 20, color: '#a7b4d8', weight: 700 });
    }
    this.pops.draw(g);
    if (this.phase === 'shoot' && this.t > 0.6) {
      const map = { goal: ['GOOOL!', PCOL[s]], save: ['KURTARDI!', PCOL[k]], post: ['DİREK!', '#ffd23f'], wide: ['AUT!', '#ff8a8a'] };
      const [t1, c] = map[this.outcome];
      banner(g, t1, this.scoreLine(), c, this.t - 0.6);
    }
  }
}

export default {
  id: 'penalty',
  name: 'Penaltı Atışları',
  icon: '🥅',
  tag: 'Gizli seçim, zihin oyunu',
  mode: 'versus',
  cat: 'spor',
  color: '#46e38a',
  desc: 'Telefonun ekranı rakibinden gizli! Atarken köşeni, kaleciyken atlayacağın yeri seç. Köşeler riskli: direkten dönebilir. 5’er atış, eşitlikte seri penaltılar.',
  howto: ['Telefonda 6 bölgeden birine dokun', 'Atıcı ve kaleci aynı yeri seçerse kurtarış', 'Kaleci yakın köşeye de uzanabilir', 'Üst köşeler gole yakın ama dışarı gidebilir', 'Sırayla 5 atış · eşitlikte seri penaltı'],
  keys: 'Klavye: yön tuşlarıyla gizli seç, A (F / K) ile onayla',
  controller: { layout: 'choice', cols: 3, options: ZONES, prompt: 'Bekle…' },
  create: (api) => new PenaltyGame(api),
};
