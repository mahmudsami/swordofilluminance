// KANEPE — TV (host) uygulaması: lobi, oyun döngüsü, menüler ve telefon iletişimi
import { W, H, PCOL, text, FONT } from './gfx.js';
import * as sfx from './sfx.js';
import GAMES from '../games/index.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sess = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const canvas = $('#game');
const g = canvas.getContext('2d');
const STEP = 1 / 60;

// ------------------------------------------------------------------ durum
const players = [null, null]; // {name, kind: 'phone'|'kbd', connected, wins}
const inputs = [mkInput(), mkInput()];
const padOverride = [null, null];
const padInfo = [null, null];
let state = 'lobby'; // lobby | intro | countdown | playing | paused | results
let gameDef = null;
let game = null;
let gameToken = 0;
let ready = [false, false];
let countdown = 0;
let goFlash = 0;
let pauseReason = null;
let lastResult = null;
let room = null;
let joinBase = location.origin;
let lastCount = 0;

function mkInput() {
  return { up: false, down: false, left: false, right: false, a: false, b: false, sx: 0, sy: 0, tx: 0.5, ty: 0.5, touch: false };
}
function resetInputs() {
  for (let i = 0; i < 2; i++) Object.assign(inputs[i], mkInput());
}
const both = () => !!(players[0] && players[1]);
const pname = (p) => players[p]?.name || `Oyuncu ${p + 1}`;
const isGame = () => state === 'countdown' || state === 'playing';

// ------------------------------------------------------------------ ağ
let ws = null;
let retry = 0;
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    const saved = sess.get('kanepe.room');
    ws.send(JSON.stringify({ t: 'host', code: saved?.code, key: saved?.key }));
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    onMsg(m);
  };
  ws.onclose = () => {
    if (room) toast('Sunucu bağlantısı koptu, yeniden bağlanılıyor…', '#ff5a5a');
    setTimeout(connect, Math.min(5000, 400 * 2 ** retry++));
  };
}
function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

function onMsg(m) {
  switch (m.t) {
    case 'room': {
      const same = room && room.code === m.code;
      room = { code: m.code, key: m.key };
      sess.set('kanepe.room', room);
      m.players.forEach((s, i) => {
        if (s) {
          const keep = same && players[i] && players[i].kind === 'phone' && players[i].name === s.name;
          players[i] = { name: s.name, kind: 'phone', connected: s.connected, wins: keep ? players[i].wins : 0 };
        } else if (players[i]?.kind === 'phone') players[i] = null;
      });
      renderRoom();
      renderSlots();
      pushViews();
      break;
    }
    case 'pjoin': {
      const p = m.p;
      const prev = players[p];
      if (prev && prev.kind === 'kbd') {
        // klavye oyuncusu varsa öbür boş yere kaydır
        if (!players[1 - p]) players[1 - p] = prev;
      }
      const keep = m.again && prev && prev.kind === 'phone';
      players[p] = { name: m.name, kind: 'phone', connected: true, wins: keep ? prev.wins : 0 };
      if (!m.again || !prev || prev.kind !== 'phone') {
        toast(`${m.name} katıldı!`, PCOL[p]);
        sfx.play('join');
        if (state !== 'lobby') ready[p] = false;
      } else {
        toast(`${m.name} geri bağlandı`, PCOL[p]);
      }
      renderSlots(true, p);
      if (state === 'intro') renderIntro();
      if (state === 'paused' && pauseReason === 'disconnect' && allConnected()) resume();
      pushViews();
      break;
    }
    case 'pleave': {
      const s = players[m.p];
      if (!s) break;
      s.connected = false;
      toast(`${s.name} bağlantısı koptu`, '#ff5a5a');
      sfx.play('leave');
      renderSlots();
      if (isGame() || (state === 'paused' && pauseReason === 'user')) pause('disconnect');
      else if (state === 'paused') showPauseModal();
      if (state === 'intro') renderIntro();
      break;
    }
    case 'pgone': {
      const s = players[m.p];
      if (s && s.kind === 'phone') {
        players[m.p] = null;
        toast(`${s.name} ayrıldı`, '#ff5a5a');
        if (state !== 'lobby' && state !== 'intro') toLobby();
      }
      renderSlots();
      if (state === 'intro') renderIntro();
      pushViews();
      break;
    }
    case 'in':
      onInput(m.p, m);
      break;
  }
}

const allConnected = () => [0, 1].every((i) => !players[i] || players[i].kind === 'kbd' || players[i].connected);

// ------------------------------------------------------------------ telefon görünümleri
function gameCard(d) {
  return { id: d.id, name: d.name, icon: d.icon, tag: d.tag, mode: d.mode, color: d.color };
}

function viewFor(p) {
  const other = players[1 - p];
  switch (state) {
    case 'lobby':
      return { mode: 'lobby', games: GAMES.map(gameCard), other: other ? other.name : null };
    case 'intro':
      return {
        mode: 'intro',
        game: { ...gameCard(gameDef), desc: gameDef.desc, howto: gameDef.howto },
        ready: ready[p],
        waitText: other ? `${other.name} bekleniyor…` : 'İkinci oyuncu bekleniyor… Oyunlar iki kişilik.',
      };
    case 'countdown':
    case 'playing':
      return { mode: 'pad', ...gameDef.controller, title: padInfo[p] || gameDef.name, ...(padOverride[p] || {}) };
    case 'paused':
      if (pauseReason === 'disconnect') {
        const gone = [0, 1].filter((i) => players[i] && players[i].kind === 'phone' && !players[i].connected).map(pname).join(', ');
        return { mode: 'menu', title: 'Oyun durdu', text: `${gone || 'Oyuncu'} yeniden bağlanıyor…`, items: [{ id: 'lobby', label: '⌂ Oyun listesine dön' }] };
      }
      return {
        mode: 'menu',
        title: 'Duraklatıldı',
        sub: gameDef.name,
        items: [
          { id: 'resume', label: '▶ Devam et', primary: true },
          { id: 'restart', label: '↻ Baştan başlat' },
          { id: 'lobby', label: '⌂ Oyun listesi' },
        ],
      };
    case 'results': {
      const r = lastResult || {};
      let title;
      if (r.coop) title = r.win ? '🎉 Başardınız!' : '💥 Kaybettiniz';
      else if (r.winner === null || r.winner === undefined) title = '🤝 Berabere';
      else title = r.winner === p ? '🏆 Kazandın!' : '😅 Kaybettin';
      return {
        mode: 'menu',
        title,
        sub: r.detail || gameDef.name,
        items: [
          { id: 'again', label: '↻ Tekrar oyna', primary: true },
          { id: 'lobby', label: '⌂ Başka oyun seç' },
        ],
      };
    }
  }
  return { mode: 'wait', title: 'Bekle', text: '' };
}

function sendView(p) {
  if (players[p]?.kind === 'phone') send({ t: 'ctl', to: p, view: viewFor(p) });
}
function pushViews() {
  sendView(0);
  sendView(1);
}

// ------------------------------------------------------------------ girişler
function setKey(p, k, v) {
  const s = inputs[p];
  if (s[k] === v) return;
  s[k] = v;
  if (state === 'playing' && game && game.onKey) game.onKey(p, k, v);
}

function onInput(p, m) {
  if (p !== 0 && p !== 1) return;
  const k = m.k;
  if (k === 'up' || k === 'down' || k === 'left' || k === 'right' || k === 'a' || k === 'b') {
    if (isGame()) setKey(p, k, !!m.d);
    return;
  }
  if (k === 'stick') {
    inputs[p].sx = Math.max(-1, Math.min(1, +m.x || 0));
    inputs[p].sy = Math.max(-1, Math.min(1, +m.y || 0));
    return;
  }
  if (k === 'pad') {
    inputs[p].touch = !!m.d;
    if (m.d) {
      inputs[p].tx = Math.max(0, Math.min(1, +m.x));
      inputs[p].ty = Math.max(0, Math.min(1, +m.y));
    }
    return;
  }
  if (k === 'pause') {
    if (isGame()) pause('user');
    return;
  }
  if (k === 'pick') {
    if (state === 'lobby' || state === 'intro') selectGame(m.id);
    return;
  }
  if (k === 'ready') {
    if (state === 'intro') {
      ready[p] = true;
      sfx.play('beep');
      renderIntro();
      sendView(p);
      tryStart();
    }
    return;
  }
  if (k === 'back') {
    if (state === 'intro') toLobby();
    return;
  }
  if (k === 'menu') {
    menuAction(m.id);
  }
}

function menuAction(id) {
  if (id === 'resume' && state === 'paused') resume();
  else if (id === 'restart' && (state === 'paused' || state === 'results')) startGame();
  else if (id === 'again' && state === 'results') startGame();
  else if (id === 'lobby') toLobby();
}

// Klavye
const KEYMAP = {
  KeyW: [0, 'up'], KeyA: [0, 'left'], KeyS: [0, 'down'], KeyD: [0, 'right'], KeyF: [0, 'a'], KeyG: [0, 'b'],
  ArrowUp: [1, 'up'], ArrowLeft: [1, 'left'], ArrowDown: [1, 'down'], ArrowRight: [1, 'right'],
  KeyK: [1, 'a'], KeyL: [1, 'b'], Numpad1: [1, 'a'], Numpad2: [1, 'b'], Period: [1, 'a'], Slash: [1, 'b'],
};

window.addEventListener('keydown', (e) => {
  sfx.unlock();
  updateSoundBtn();
  const map = KEYMAP[e.code];
  if (isGame() && map) {
    e.preventDefault();
    if (!e.repeat) setKey(map[0], map[1], true);
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (isGame()) pause('user');
    else if (state === 'paused' && pauseReason === 'user') resume();
    else if (state === 'results' || state === 'intro') toLobby();
    return;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (state === 'intro') { e.preventDefault(); tryStart(true); }
    return;
  }
  if (e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    if (moveFocus(e.code)) e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  const map = KEYMAP[e.code];
  if (map) setKey(map[0], map[1], false);
});
window.addEventListener('blur', () => {
  for (const [p, k] of Object.values(KEYMAP)) setKey(p, k, false);
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isGame()) pause('user');
});
window.addEventListener('pointerdown', () => {
  sfx.unlock();
  setTimeout(updateSoundBtn, 50);
});

// Menülerde yön tuşlarıyla gezinme
function moveFocus(code) {
  let list;
  if (state === 'lobby') list = [...document.querySelectorAll('#gameGrid .gcard')];
  else if (!$('#modal').classList.contains('hidden')) list = [...document.querySelectorAll('#modalBtns button')];
  else if (state === 'intro') list = [...document.querySelectorAll('.introactions button')];
  if (!list || !list.length) return false;
  let i = list.indexOf(document.activeElement);
  const dir = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1, ArrowUp: -2, KeyW: -2, ArrowDown: 2, KeyS: 2 }[code];
  if (i < 0) i = 0;
  else if (state === 'lobby' && Math.abs(dir) === 2) {
    const cols = getComputedStyle($('#gameGrid')).gridTemplateColumns.split(' ').length;
    i = Math.max(0, Math.min(list.length - 1, i + Math.sign(dir) * cols));
  } else i = (i + Math.sign(dir) + list.length) % list.length;
  list[i].focus();
  sfx.play('click');
  return true;
}

// ------------------------------------------------------------------ akış
function selectGame(id) {
  const d = GAMES.find((x) => x.id === id);
  if (!d) return;
  gameDef = d;
  ready = [players[0]?.kind === 'kbd', players[1]?.kind === 'kbd'];
  state = 'intro';
  sfx.play('pickup');
  showScreen('intro');
  renderIntro();
  pushViews();
}

function tryStart(force = false) {
  if (state !== 'intro') return;
  if (!both()) {
    toast('Oyunlar iki kişilik — ikinci oyuncu katılmalı (ya da klavye ekle)', '#ffd23f');
    return;
  }
  if (!force && !(ready[0] && ready[1])) return;
  startGame();
}

function makeApi(token) {
  return {
    W,
    H,
    players: [0, 1].map((i) => ({ name: pname(i), color: PCOL[i] })),
    input: inputs,
    axis(p) {
      const s = inputs[p];
      let x = s.sx;
      let y = s.sy;
      if (!x && !y) {
        x = (s.right ? 1 : 0) - (s.left ? 1 : 0);
        y = (s.down ? 1 : 0) - (s.up ? 1 : 0);
        const m = Math.hypot(x, y);
        if (m > 1) { x /= m; y /= m; }
      }
      return { x, y };
    },
    sfx: (n) => token === gameToken && sfx.play(n),
    buzz: (p, ms = 60) => {
      if (token === gameToken && players[p]?.kind === 'phone') send({ t: 'buzz', to: p, ms });
    },
    info: (p, txt) => {
      if (token !== gameToken) return;
      padInfo[p] = txt;
      if (players[p]?.kind === 'phone' && isGame()) send({ t: 'info', to: p, text: txt });
    },
    setPad: (p, patch) => {
      if (token !== gameToken) return;
      padOverride[p] = patch;
      if (isGame()) sendView(p);
    },
    end: (res) => {
      if (token === gameToken && isGame()) endGame(res);
    },
  };
}

function startGame() {
  if (!gameDef) return;
  if (game && game.destroy) game.destroy();
  resetInputs();
  padOverride[0] = padOverride[1] = null;
  padInfo[0] = padInfo[1] = null;
  gameToken++;
  game = gameDef.create(makeApi(gameToken));
  state = 'countdown';
  countdown = 3;
  lastCount = 4;
  goFlash = 0;
  hideModal();
  showScreen('game');
  pushViews();
}

function pause(reason) {
  if (!isGame() && !(state === 'paused' && reason === 'disconnect')) return;
  state = 'paused';
  pauseReason = reason;
  for (let i = 0; i < 2; i++) for (const k of ['up', 'down', 'left', 'right', 'a', 'b']) inputs[i][k] = false;
  showPauseModal();
  pushViews();
}

function resume() {
  if (state !== 'paused' || !allConnected()) return;
  state = 'countdown';
  countdown = 3;
  lastCount = 4;
  hideModal();
  pushViews();
}

function endGame(res) {
  state = 'results';
  lastResult = res || {};
  if (!res.coop && (res.winner === 0 || res.winner === 1) && players[res.winner]) players[res.winner].wins++;
  if (res.coop && res.win) [0, 1].forEach((i) => players[i] && players[i].wins++);
  sfx.play(res.coop && !res.win ? 'lose' : 'win');
  showResultsModal();
  renderSlots();
  pushViews();
}

function toLobby() {
  if (game && game.destroy) game.destroy();
  game = null;
  gameToken++;
  state = 'lobby';
  hideModal();
  showScreen('lobby');
  renderSlots();
  pushViews();
  setTimeout(() => $('#gameGrid .gcard')?.focus({ preventScroll: true }), 50);
}

function showScreen(name) {
  $('#lobby').classList.toggle('hidden', name !== 'lobby');
  $('#intro').classList.toggle('hidden', name !== 'intro');
  canvas.classList.toggle('hidden', name !== 'game');
  if (name === 'game') resize();
}

// ------------------------------------------------------------------ DOM çizimleri
function renderRoom() {
  if (!room) return;
  $('#roomCode').textContent = room.code;
  const url = `${joinBase}/play?c=${room.code}`;
  $('#qr').src = `/qr.svg?d=${encodeURIComponent(url)}`;
  $('#joinUrl').textContent = joinBase.replace(/^https?:\/\//, '') + '/play';
}

function renderSlots(popIt = false, popP = -1) {
  document.querySelectorAll('.slot').forEach((el) => {
    const p = +el.dataset.p;
    const s = players[p];
    el.classList.toggle('filled', !!s);
    el.classList.toggle('off', !!s && s.kind === 'phone' && !s.connected);
    el.classList.toggle('pop', popIt && p === popP);
    if (!s) {
      el.innerHTML = `<div class="av">${p + 1}</div>
        <div class="who"><b>Oyuncu ${p + 1}</b><small>Telefonla katılmayı bekliyor…</small></div>
        <button class="pill kbd" data-kbd="${p}" title="Bu yeri klavye oyuncusuna ver">⌨ Klavye</button>`;
    } else {
      const status = s.kind === 'kbd' ? (p === 0 ? 'Klavye · WASD + F/G' : 'Klavye · Oklar + K/L') : s.connected ? '📱 Bağlı' : '⚠ Bağlantı koptu';
      el.innerHTML = `<div class="av">${esc(s.name.charAt(0).toUpperCase())}</div>
        <div class="who"><b>${esc(s.name)}</b><small>${status}</small></div>
        <span class="wins" title="Kazanılan oyunlar">🏆 ${s.wins}</span>
        <button class="x" data-kick="${p}" title="Çıkar">✕</button>`;
    }
  });
  document.querySelectorAll('[data-kbd]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = +b.dataset.kbd;
      if (!players[p]) players[p] = { name: `Klavye ${p + 1}`, kind: 'kbd', connected: true, wins: 0 };
      sfx.play('join');
      renderSlots(true, p);
      pushViews();
    })
  );
  document.querySelectorAll('[data-kick]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = +b.dataset.kick;
      if (players[p]?.kind === 'phone') send({ t: 'kick', p });
      players[p] = null;
      renderSlots();
      pushViews();
    })
  );
}

const previews = {};
function renderGames() {
  const grid = $('#gameGrid');
  grid.innerHTML = GAMES.map(
    (d) => `<button class="gcard" data-id="${d.id}" style="--c:${d.color}">
      <span class="badge ${d.mode === 'coop' ? 'coop' : ''}">${d.mode === 'coop' ? 'TAKIM OYUNU' : 'KAFA KAFAYA'}</span>
      <img class="prev" alt="" src="${previews[d.id] || ''}" />
      <div class="meta"><span class="gi">${d.icon}</span><div><b>${esc(d.name)}</b><small>${esc(d.tag)}</small></div></div>
    </button>`
  ).join('');
  grid.querySelectorAll('.gcard').forEach((b) => b.addEventListener('click', () => selectGame(b.dataset.id)));
}

function makePreviews() {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 360;
  const cg = c.getContext('2d');
  for (const d of GAMES) {
    try {
      const api = {
        W, H, players: [{ name: 'Ayşe', color: PCOL[0] }, { name: 'Can', color: PCOL[1] }], input: [mkInput(), mkInput()],
        axis: () => ({ x: 0, y: 0 }), sfx() {}, buzz() {}, info() {}, setPad() {}, end() {}, preview: true,
      };
      const inst = d.create(api);
      if (inst.demo) inst.demo();
      cg.setTransform(0.5, 0, 0, 0.5, 0, 0);
      cg.clearRect(0, 0, W, H);
      inst.draw(cg);
      if (inst.destroy) inst.destroy();
      previews[d.id] = c.toDataURL('image/jpeg', 0.85);
    } catch (err) {
      console.warn('önizleme hatası', d.id, err);
    }
  }
  document.querySelectorAll('#gameGrid .gcard').forEach((b) => {
    const img = $('.prev', b);
    if (previews[b.dataset.id]) img.src = previews[b.dataset.id];
  });
}

function renderIntro() {
  if (!gameDef) return;
  const d = gameDef;
  const card = $('.introcard');
  card.style.setProperty('--c', d.color);
  $('#introIcon').textContent = d.icon;
  $('#introTag').textContent = `${d.tag.toUpperCase()} · ${d.mode === 'coop' ? 'TAKIM OYUNU' : 'KAFA KAFAYA'}`;
  $('#introName').textContent = d.name;
  $('#introDesc').textContent = d.desc;
  $('#introHow').innerHTML = d.howto.map((h) => `<li>${esc(h)}</li>`).join('');
  $('#introKeys').innerHTML = d.keys ? `Klavye: ${d.keys}` : '';
  $('#introPrev').src = previews[d.id] || '';
  $('#readyRow').innerHTML = [0, 1]
    .map((p) => {
      const s = players[p];
      const label = !s ? 'Bekleniyor…' : ready[p] ? '✓ HAZIR' : s.kind === 'phone' && !s.connected ? 'bağlantı yok' : 'hazırlanıyor…';
      return `<div class="rd ${ready[p] && s ? 'ok' : ''}"><i></i><span>${esc(s ? s.name : `Oyuncu ${p + 1}`)}</span><em>${label}</em></div>`;
    })
    .join('');
  $('#introWait').innerHTML = both() ? 'Telefonundan <b>HAZIRIM</b>’a bas' : 'İkinci oyuncu bekleniyor… <b>Oyunlar iki kişilik</b>';
  $('#introStart').disabled = !both();
  $('#introStart').style.opacity = both() ? 1 : 0.5;
}
$('#introBack').addEventListener('click', toLobby);
$('#introStart').addEventListener('click', () => tryStart(true));

function modal({ icon, title, text: txt, color, tally, buttons, hint }) {
  $('#modal').classList.remove('hidden');
  $('.modalcard').style.setProperty('--c', color || 'var(--accent)');
  $('#modalIcon').textContent = icon || '';
  $('#modalTitle').textContent = title || '';
  $('#modalText').textContent = txt || '';
  $('#modalTally').innerHTML = tally
    ? [0, 1].map((p) => (players[p] ? `<div><b>${esc(players[p].name)}</b><span>${players[p].wins}</span></div>` : '')).join('')
    : '';
  const box = $('#modalBtns');
  box.innerHTML = '';
  (buttons || []).forEach((b, i) => {
    const el = document.createElement('button');
    el.className = 'pill' + (i === 0 ? ' strong' : '');
    el.textContent = b.label;
    el.addEventListener('click', b.on);
    box.appendChild(el);
  });
  $('#modalHint').textContent = hint || '';
  setTimeout(() => box.querySelector('button')?.focus({ preventScroll: true }), 30);
}
function hideModal() {
  $('#modal').classList.add('hidden');
}

function showPauseModal() {
  if (pauseReason === 'disconnect') {
    const gone = [0, 1].filter((i) => players[i] && players[i].kind === 'phone' && !players[i].connected).map(pname).join(', ');
    modal({
      icon: '📡',
      title: 'Bağlantı koptu',
      text: `${gone || 'Bir oyuncu'} yeniden bağlanınca oyun kaldığı yerden devam edecek.`,
      color: '#ff5a5a',
      buttons: [{ label: '⌂ Oyun listesi', on: toLobby }],
      hint: 'Telefonda sayfayı yenilemek ya da kodu tekrar girmek yeterli.',
    });
  } else {
    modal({
      icon: '⏸',
      title: 'Duraklatıldı',
      text: gameDef.name,
      buttons: [
        { label: '▶ Devam et', on: resume },
        { label: '↻ Baştan başlat', on: startGame },
        { label: '⌂ Oyun listesi', on: toLobby },
      ],
      hint: 'Esc: devam et',
    });
  }
}

function showResultsModal() {
  const r = lastResult;
  let icon = '🏆';
  let title;
  let color;
  if (r.coop) {
    icon = r.win ? '🎉' : '💥';
    title = r.title || (r.win ? 'Başardınız!' : 'Kaybettiniz');
    color = r.win ? '#46e38a' : '#ff5a5a';
  } else if (r.winner === 0 || r.winner === 1) {
    title = `${pname(r.winner)} kazandı!`;
    color = PCOL[r.winner];
  } else {
    icon = '🤝';
    title = 'Berabere!';
    color = '#ffd23f';
  }
  modal({
    icon,
    title,
    text: r.detail || '',
    color,
    tally: true,
    buttons: [
      { label: '↻ Tekrar oyna', on: startGame },
      { label: '⌂ Başka oyun seç', on: toLobby },
    ],
  });
}

function toast(msg, color) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  if (color) el.style.setProperty('--c', color);
  $('#toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function updateSoundBtn() {
  const b = $('#soundBtn');
  const on = sfx.isRunning() && !sfx.isMuted();
  b.textContent = on ? '🔊 Ses açık' : '🔇 Sesi aç';
  b.classList.toggle('attn', !sfx.isRunning());
}
$('#soundBtn').addEventListener('click', () => {
  if (!sfx.isRunning()) {
    sfx.unlock();
    sfx.setMuted(false);
  } else sfx.setMuted(!sfx.isMuted());
  setTimeout(() => {
    updateSoundBtn();
    sfx.play('join');
  }, 60);
});
$('#fsBtn').addEventListener('click', () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch {}
});

// ------------------------------------------------------------------ çizim döngüsü
let dpr = 1;
let view = { s: 1, ox: 0, oy: 0 };
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  canvas.width = Math.round(cw * dpr);
  canvas.height = Math.round(ch * dpr);
  const s = Math.min(cw / W, ch / H);
  view = { s, ox: (cw - W * s) / 2, oy: (ch - H * s) / 2 };
}
window.addEventListener('resize', resize);

let acc = 0;
let lastT = performance.now();
function frame(now) {
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.1) dt = 0.1;

  if (game) {
    if (state === 'countdown') {
      countdown -= dt;
      const c = Math.ceil(countdown);
      if (c !== lastCount && c > 0) {
        lastCount = c;
        sfx.play('count');
      }
      if (countdown <= 0) {
        state = 'playing';
        goFlash = 0.8;
        acc = 0;
        sfx.play('go');
        // geri sayım sırasında basılı tutulan tuşları oyuna bildir
        if (game.onKey) for (let p = 0; p < 2; p++) for (const k of ['up', 'down', 'left', 'right', 'a', 'b']) if (inputs[p][k]) game.onKey(p, k, true);
      }
    } else if (state === 'playing') {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < 6 && state === 'playing') {
        game.update(STEP);
        acc -= STEP;
        n++;
      }
      if (n === 6) acc = 0;
      if (goFlash > 0) goFlash -= dt;
    }
    draw();
  }
  requestAnimationFrame(frame);
}

function draw() {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#07061a';
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(view.s * dpr, 0, 0, view.s * dpr, view.ox * dpr, view.oy * dpr);
  g.save();
  g.beginPath();
  g.rect(0, 0, W, H);
  g.clip();
  try {
    game.draw(g);
  } catch (err) {
    console.error(err);
  }
  g.restore();

  if (state === 'countdown') {
    const c = Math.max(1, Math.ceil(countdown));
    const f = countdown - Math.floor(countdown);
    g.fillStyle = 'rgba(8,6,24,.35)';
    g.fillRect(0, 0, W, H);
    const sc = 1 + f * 0.5;
    text(g, String(c), W / 2, H / 2, { size: 200 * sc, color: '#ffd23f', weight: 800, stroke: '#1a1238', sw: 14, alpha: 0.4 + f * 0.6 });
    text(g, gameDef.name, W / 2, H / 2 + 150, { size: 34, color: '#fff', weight: 700, stroke: 'rgba(0,0,0,.6)', sw: 6 });
  } else if (state === 'playing' && goFlash > 0) {
    const t = goFlash / 0.8;
    text(g, 'BAŞLA!', W / 2, H / 2, { size: 150 + (1 - t) * 60, color: '#46e38a', weight: 800, stroke: '#0b2e1a', sw: 12, alpha: t });
  }
}

// ------------------------------------------------------------------ başlangıç
async function boot() {
  renderGames();
  renderSlots();
  updateSoundBtn();
  try {
    const info = await (await fetch('/api/info')).json();
    const local = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);
    if (local && info.ips && info.ips.length) {
      joinBase = `${location.protocol}//${info.ips[0]}:${location.port || info.port}`;
      $('#lanHint').textContent = 'Telefonlar bu bilgisayarla aynı Wi-Fi ağına bağlı olmalı.';
    } else if (local) {
      $('#lanHint').textContent = 'Ağ adresi bulunamadı: bilgisayarın Wi-Fi’ye bağlı olduğundan emin ol.';
    } else if (location.protocol === 'http:' && /^(\d+\.){3}\d+$/.test(location.hostname)) {
      $('#lanHint').textContent = 'Telefonlar bu bilgisayarla aynı Wi-Fi ağına bağlı olmalı.';
    }
  } catch {}
  renderRoom();
  connect();
  requestAnimationFrame(frame);
  try {
    await document.fonts.load(`700 20px ${FONT}`);
    await document.fonts.load(`800 20px ${FONT}`);
  } catch {}
  makePreviews();
  setTimeout(() => $('#gameGrid .gcard')?.focus({ preventScroll: true }), 100);
}
boot();
