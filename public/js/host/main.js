// KANEPE — TV (host) uygulaması: lobi, oyun döngüsü, menüler ve telefon iletişimi
import { W, H, PCOL, text, FONT, RES, clearSprites } from './gfx.js';
import * as sfx from './sfx.js';
import GAMES, { CATEGORIES } from '../games/index.js';

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sess = {
  get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

const canvas = $('#game');
const g = canvas.getContext('2d', { alpha: false });
const KEYS = ['up', 'down', 'left', 'right', 'a', 'b'];
const KEYSET = new Set(KEYS);
const BIT = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32 };
const STATEFUL = new Set([...KEYS, 'st', 'stick', 'pad']);
const RTC_CFG = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
const GRACE_MS = 2500; // telefon koparsa oyunu durdurmadan önce bekle

// ------------------------------------------------------------------ durum
const players = [null, null]; // {name, kind: 'phone'|'kbd', connected, wins, rtt, p2p}
const inputs = [mkInput(), mkInput()];
const phoneKeys = [mkKeys(), mkKeys()];
const kbdKeys = [mkKeys(), mkKeys()];
const lastSeq = [0, 0];
const graceT = [null, null];
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
let needDraw = true;
let catFilter = 'all';
let userPaused = false; // kopma olduğunda oyun zaten kullanıcı tarafından durdurulmuş muydu

function mkInput() {
  return { up: false, down: false, left: false, right: false, a: false, b: false, sx: 0, sy: 0, tx: 0.5, ty: 0.5, touch: false };
}
function mkKeys() {
  return { up: false, down: false, left: false, right: false, a: false, b: false };
}
const both = () => !!(players[0] && players[1]);
const pname = (p) => players[p]?.name || `Oyuncu ${p + 1}`;
const isGame = () => state === 'countdown' || state === 'playing';

// ------------------------------------------------------------------ WebSocket
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
// Telefona hızlı mesaj: doğrudan kanal açıksa onu kullan
function sendPhone(p, m) {
  const peer = peers[p];
  if (peer && peer.dc && peer.dc.readyState === 'open') {
    try {
      peer.dc.send(JSON.stringify(m));
      return;
    } catch {}
  }
  send({ ...m, to: p });
}

// ------------------------------------------------------------------ WebRTC (telefon ↔ TV doğrudan)
const peers = [null, null];

function closePeer(p) {
  const peer = peers[p];
  peers[p] = null;
  if (!peer) return;
  try { peer.dc && peer.dc.close(); } catch {}
  try { peer.pc.close(); } catch {}
  if (players[p]) {
    players[p].p2p = false;
    updateSlotNet(p);
  }
}

async function onRtc(p, m) {
  if (p !== 0 && p !== 1 || !window.RTCPeerConnection) return;
  if (m.sdp && m.sdp.type === 'offer') {
    closePeer(p);
    let pc;
    try {
      pc = new RTCPeerConnection(RTC_CFG);
    } catch {
      return;
    }
    const peer = { pc, dc: null, queue: [], remote: false };
    peers[p] = peer;
    pc.ondatachannel = (e) => {
      const ch = e.channel;
      peer.dc = ch;
      ch.onopen = () => {
        if (peers[p] !== peer) return;
        if (players[p]) {
          players[p].p2p = true;
          updateSlotNet(p);
        }
      };
      ch.onclose = () => {
        if (peers[p] === peer) closePeer(p);
      };
      ch.onmessage = (ev) => {
        if (peers[p] !== peer) return;
        let msg;
        try { msg = JSON.parse(ev.data); } catch { return; }
        onPhone(p, msg, true);
      };
    };
    pc.onicecandidate = (e) => {
      if (e.candidate && peers[p] === peer) send({ t: 'rtc', to: p, c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' && peers[p] === peer) closePeer(p);
    };
    try {
      await pc.setRemoteDescription(m.sdp);
      if (peers[p] !== peer) return;
      peer.remote = true;
      for (const c of peer.queue) pc.addIceCandidate(c).catch(() => {});
      peer.queue = [];
      const ans = await pc.createAnswer();
      await pc.setLocalDescription(ans);
      if (peers[p] === peer) send({ t: 'rtc', to: p, sdp: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
    } catch {
      if (peers[p] === peer) closePeer(p);
    }
  } else if (m.c) {
    const peer = peers[p];
    if (!peer) return;
    if (peer.remote) peer.pc.addIceCandidate(m.c).catch(() => {});
    else peer.queue.push(m.c);
  }
}

// ------------------------------------------------------------------ sunucu mesajları
function onMsg(m) {
  switch (m.t) {
    case 'room': {
      const same = room && room.code === m.code;
      room = { code: m.code, key: m.key };
      sess.set('kanepe.room', room);
      m.players.forEach((s, i) => {
        if (s) {
          const prev = players[i];
          const keep = same && prev && prev.kind === 'phone' && prev.name === s.name;
          players[i] = { name: s.name, kind: 'phone', connected: s.connected, wins: keep ? prev.wins : 0, rtt: keep ? prev.rtt : 0, p2p: !!peers[i] && keep && prev.p2p };
        } else if (players[i]?.kind === 'phone') {
          players[i] = null;
          closePeer(i);
        }
      });
      renderRoom();
      renderSlots();
      pushViews();
      break;
    }
    case 'pjoin': {
      const p = m.p;
      const prev = players[p];
      clearTimeout(graceT[p]);
      graceT[p] = null;
      if (prev && prev.kind === 'kbd' && !players[1 - p]) players[1 - p] = prev; // klavye oyuncusunu öbür yere kaydır
      const again = m.again && prev && prev.kind === 'phone';
      players[p] = { name: m.name, kind: 'phone', connected: true, wins: again ? prev.wins : 0, rtt: again ? prev.rtt : 0, p2p: again ? prev.p2p : false };
      lastSeq[p] = 0;
      if (!again) {
        closePeer(p);
        toast(`${m.name} katıldı!`, PCOL[p]);
        sfx.play('join');
        if (state !== 'lobby') ready[p] = false;
      } else if (prev && !prev.connected) {
        toast(`${m.name} geri bağlandı`, PCOL[p]);
      }
      renderSlots(!again, p);
      if (state === 'intro') renderIntro();
      if (state === 'paused' && pauseReason === 'disconnect' && allConnected()) {
        if (userPaused) {
          pauseReason = 'user';
          showPauseModal();
          pushViews();
        } else resume();
      }
      // sadece bu telefona görünüm gönder (öbürünün kumandası bozulmasın)
      sendView(p);
      if (!again) sendView(1 - p);
      break;
    }
    case 'pleave': {
      const p = m.p;
      const s = players[p];
      if (!s) break;
      s.connected = false;
      phoneKeys[p] = mkKeys();
      inputs[p].sx = inputs[p].sy = 0;
      inputs[p].touch = false;
      for (const k of KEYS) applyKey(p, k);
      renderSlots();
      if (state === 'intro') renderIntro();
      if (isGame()) {
        // kısa kopmalarda oyunu durdurma; telefon genelde hemen geri gelir
        clearTimeout(graceT[p]);
        graceT[p] = setTimeout(() => {
          graceT[p] = null;
          if (players[p] && players[p].kind === 'phone' && !players[p].connected) {
            toast(`${s.name} bağlantısı koptu`, '#ff5a5a');
            sfx.play('leave');
            if (isGame()) pause('disconnect');
          }
        }, GRACE_MS);
      } else if (state === 'paused') {
        if (pauseReason === 'user') userPaused = true;
        pauseReason = 'disconnect';
        showPauseModal();
        pushViews();
      }
      break;
    }
    case 'pgone': {
      const s = players[m.p];
      closePeer(m.p);
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
      onPhone(m.p, m, false);
      break;
    case 'rtc':
      onRtc(m.p, m);
      break;
  }
}

const allConnected = () => [0, 1].every((i) => !players[i] || players[i].kind === 'kbd' || players[i].connected);

// ------------------------------------------------------------------ telefon görünümleri
function gameCard(d) {
  return { id: d.id, name: d.name, icon: d.icon, tag: d.tag, mode: d.mode, color: d.color, cat: d.cat };
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
// Telefon ve klavye ayrı tutulur; oyuna ikisinin birleşimi gider.
function applyKey(p, k) {
  if (state !== 'playing') return;
  const v = phoneKeys[p][k] || kbdKeys[p][k];
  if (inputs[p][k] === v) return;
  inputs[p][k] = v;
  if (game && game.onKey) game.onKey(p, k, v);
}
function syncKeys() {
  for (let p = 0; p < 2; p++) for (const k of KEYS) applyKey(p, k);
}
function releaseGameKeys() {
  for (let p = 0; p < 2; p++) {
    for (const k of KEYS) {
      if (inputs[p][k]) {
        inputs[p][k] = false;
        if (game && game.onKey) game.onKey(p, k, false);
      }
    }
  }
}
function resetInputs() {
  for (let i = 0; i < 2; i++) Object.assign(inputs[i], mkInput());
}

function onPhone(p, m, viaP2P) {
  if ((p !== 0 && p !== 1) || !players[p] || players[p].kind !== 'phone') return;
  const k = m.k;
  if (k === 'ping') {
    sendPhone(p, { t: 'pong', ts: m.ts });
    return;
  }
  // durum mesajlarında eski / sırası karışmış olanları at
  if (STATEFUL.has(k) && m.n !== undefined) {
    if (m.n <= lastSeq[p]) return;
    lastSeq[p] = m.n;
  }
  if (KEYSET.has(k)) {
    phoneKeys[p][k] = !!m.d;
    applyKey(p, k);
    return;
  }
  if (k === 'st') {
    const b = m.b | 0;
    for (const kk of KEYS) {
      phoneKeys[p][kk] = !!(b & BIT[kk]);
      applyKey(p, kk);
    }
    const pl = players[p];
    const rtt = +m.r || 0;
    const p2p = !!m.v || viaP2P;
    if (Math.abs(rtt - (pl.rtt || 0)) > 4 || pl.p2p !== p2p) {
      pl.rtt = rtt;
      pl.p2p = p2p;
      updateSlotNet(p);
    }
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
      inputs[p].tx = Math.max(0, Math.min(1, +m.x || 0));
      inputs[p].ty = Math.max(0, Math.min(1, +m.y || 0));
    }
    return;
  }
  if (k === 'choose') {
    if (state === 'playing' && game && game.onChoose) game.onChoose(p, String(m.id));
    return;
  }
  if (k === 'pause') {
    if (isGame()) pause('user');
    return;
  }
  if (k === 'pick') {
    if (state === 'lobby' || state === 'intro') selectGame(m.id);
    else sendView(p);
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
  if (k === 'menu') menuAction(m.id, p);
}

function menuAction(id, p) {
  if (id === 'resume' && state === 'paused') resume();
  else if (id === 'restart' && (state === 'paused' || state === 'results')) startGame();
  else if (id === 'again' && state === 'results') startGame();
  else if (id === 'lobby') toLobby();
  else if (p !== undefined) sendView(p); // geçersiz istek: telefonun görünümünü tazele
}

// Klavye
const KEYMAP = {
  KeyW: [0, 'up'], KeyA: [0, 'left'], KeyS: [0, 'down'], KeyD: [0, 'right'], KeyF: [0, 'a'], KeyG: [0, 'b'],
  ArrowUp: [1, 'up'], ArrowLeft: [1, 'left'], ArrowDown: [1, 'down'], ArrowRight: [1, 'right'],
  KeyK: [1, 'a'], KeyL: [1, 'b'], Numpad1: [1, 'a'], Numpad2: [1, 'b'], Period: [1, 'a'], Slash: [1, 'b'],
};
// Klavye oyuncuları sıra tabanlı oyunlarda seçimleri yön + A ile yapar; bunun için oyunlar onKey'i kullanır.

window.addEventListener('keydown', (e) => {
  sfx.unlock();
  updateSoundBtn();
  const map = KEYMAP[e.code];
  if (isGame() && map) {
    e.preventDefault();
    if (!e.repeat) {
      kbdKeys[map[0]][map[1]] = true;
      applyKey(map[0], map[1]);
    }
    return;
  }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (isGame()) pause('user');
    else if (state === 'paused' && pauseReason === 'user') resume();
    else if (state === 'results' || state === 'intro') toLobby();
    return;
  }
  if (e.code === 'Enter' || e.code === 'NumpadEnter') {
    if (state === 'intro') {
      e.preventDefault();
      tryStart(true);
    }
    return;
  }
  if (e.code.startsWith('Arrow') || ['KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) {
    if (moveFocus(e.code)) e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => {
  const map = KEYMAP[e.code];
  if (map) {
    kbdKeys[map[0]][map[1]] = false;
    applyKey(map[0], map[1]);
  }
});
window.addEventListener('blur', () => {
  for (let p = 0; p < 2; p++) {
    kbdKeys[p] = mkKeys();
    for (const k of KEYS) applyKey(p, k);
  }
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
  if (state === 'lobby') list = [...document.querySelectorAll('#gameGrid .gcard:not(.hidden)')];
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
  list[i].scrollIntoView({ block: 'nearest' });
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
    players: [0, 1].map((i) => ({ name: pname(i), color: PCOL[i], kbd: players[i]?.kind === 'kbd' })),
    input: inputs,
    axis(p) {
      const s = inputs[p];
      let x = s.sx;
      let y = s.sy;
      if (!x && !y) {
        x = (s.right ? 1 : 0) - (s.left ? 1 : 0);
        y = (s.down ? 1 : 0) - (s.up ? 1 : 0);
        const m = Math.hypot(x, y);
        if (m > 1) {
          x /= m;
          y /= m;
        }
      }
      return { x, y };
    },
    sfx: (n) => token === gameToken && sfx.play(n),
    buzz: (p, ms = 60) => {
      if (token === gameToken && players[p]?.kind === 'phone') sendPhone(p, { t: 'buzz', ms });
    },
    info: (p, txt) => {
      if (token !== gameToken || padInfo[p] === txt) return;
      padInfo[p] = txt;
      if (players[p]?.kind === 'phone' && isGame()) sendPhone(p, { t: 'info', text: txt });
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
  clearSprites();
  resize();
  game = gameDef.create(makeApi(gameToken));
  state = 'countdown';
  countdown = 3;
  lastCount = 4;
  goFlash = 0;
  fps.warm = 1.5;
  hideModal();
  showScreen('game');
  pushViews();
  needDraw = true;
}

function pause(reason) {
  if (!isGame()) return;
  releaseGameKeys();
  state = 'paused';
  pauseReason = reason;
  userPaused = reason === 'user';
  showPauseModal();
  pushViews();
  needDraw = true;
}

function resume() {
  if (state !== 'paused' || !allConnected()) return;
  state = 'countdown';
  countdown = 2;
  lastCount = 3;
  hideModal();
  pushViews();
  needDraw = true;
}

function endGame(res) {
  res = res || {};
  releaseGameKeys();
  state = 'results';
  lastResult = res;
  if (!res.coop && (res.winner === 0 || res.winner === 1) && players[res.winner]) players[res.winner].wins++;
  if (res.coop && res.win) [0, 1].forEach((i) => players[i] && players[i].wins++);
  sfx.play(res.coop && !res.win ? 'lose' : 'win');
  showResultsModal();
  renderSlots();
  pushViews();
  needDraw = true;
}

function toLobby() {
  if (game && game.destroy) game.destroy();
  game = null;
  gameToken++;
  state = 'lobby';
  for (let i = 0; i < 2; i++) {
    clearTimeout(graceT[i]);
    graceT[i] = null;
  }
  hideModal();
  showScreen('lobby');
  renderSlots();
  pushViews();
  clearSprites();
  setTimeout(() => $('#gameGrid .gcard:not(.hidden)')?.focus({ preventScroll: true }), 50);
}

function showScreen(name) {
  $('#lobby').classList.toggle('hidden', name !== 'lobby');
  $('#intro').classList.toggle('hidden', name !== 'intro');
  canvas.classList.toggle('hidden', name !== 'game');
  // oyun sırasında arka plan animasyonlarını durdur (performans)
  document.body.classList.toggle('ingame', name === 'game');
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

function netLabel(s) {
  if (s.kind === 'kbd') return '';
  if (!s.connected) return '';
  const ms = Math.round(s.rtt || 0);
  const cls = ms > 150 ? 'slow' : ms > 70 ? 'mid' : 'good';
  return `<span class="netinfo ${cls}" title="${s.p2p ? 'Telefon TV’ye doğrudan bağlı' : 'Sunucu üzerinden bağlı'}">${s.p2p ? '⚡ Doğrudan' : '☁ Sunucu'}${ms ? ` · ${ms} ms` : ''}</span>`;
}

function updateSlotNet(p) {
  const el = document.querySelector(`.slot[data-p="${p}"] .netslot`);
  if (el && players[p]) el.innerHTML = netLabel(players[p]);
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
        <div class="who"><b>${esc(s.name)}</b><small>${status} <span class="netslot">${netLabel(s)}</span></small></div>
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
      if (state === 'intro') {
        ready[p] = true;
        renderIntro();
      }
      pushViews();
    })
  );
  document.querySelectorAll('[data-kick]').forEach((b) =>
    b.addEventListener('click', () => {
      const p = +b.dataset.kick;
      if (players[p]?.kind === 'phone') send({ t: 'kick', p });
      closePeer(p);
      players[p] = null;
      renderSlots();
      pushViews();
    })
  );
}

const inCat = (d, c) => c === 'all' || d.cat === c || (c === 'takim' && d.mode === 'coop');

function renderTabs() {
  $('#tabs').innerHTML = CATEGORIES.map((c) => {
    const n = GAMES.filter((d) => inCat(d, c.id)).length;
    return n ? `<button class="tab ${c.id === catFilter ? 'on' : ''}" data-c="${c.id}">${esc(c.name)} <i>${n}</i></button>` : '';
  }).join('');
  document.querySelectorAll('#tabs .tab').forEach((b) =>
    b.addEventListener('click', () => {
      catFilter = b.dataset.c;
      renderTabs();
      document.querySelectorAll('#gameGrid .gcard').forEach((c) => {
        const d = GAMES.find((x) => x.id === c.dataset.id);
        c.classList.toggle('hidden', !inCat(d, catFilter));
      });
    })
  );
}

const previews = {};
function renderGames() {
  const grid = $('#gameGrid');
  grid.innerHTML = GAMES.map(
    (d) => `<button class="gcard ${inCat(d, catFilter) ? '' : 'hidden'}" data-id="${d.id}" style="--c:${d.color}">
      <span class="badge ${d.mode === 'coop' ? 'coop' : ''}">${d.mode === 'coop' ? 'TAKIM' : 'KAPIŞMA'}</span>
      <img class="prev" alt="" ${previews[d.id] ? `src="${previews[d.id]}"` : ''} />
      <div class="meta"><span class="gi">${d.icon}</span><div><b>${esc(d.name)}</b><small>${esc(d.tag)}</small></div></div>
    </button>`
  ).join('');
  grid.querySelectorAll('.gcard').forEach((b) => b.addEventListener('click', () => selectGame(b.dataset.id)));
  renderTabs();
}

// Önizlemeleri lobiyi kilitlemeden, sırayla üret
function makePreviews() {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 270;
  const cg = c.getContext('2d', { alpha: false });
  const list = [...GAMES];
  const saved = { scale: RES.scale, low: RES.low };
  const next = () => {
    const d = list.shift();
    if (!d) {
      RES.scale = saved.scale;
      RES.low = saved.low;
      clearSprites();
      return;
    }
    if (game) {
      // oyun başladıysa kalanları sonra üret
      list.unshift(d);
      setTimeout(next, 1500);
      return;
    }
    try {
      RES.scale = 480 / W;
      RES.low = false;
      const api = {
        W, H, players: [{ name: 'Ayşe', color: PCOL[0] }, { name: 'Can', color: PCOL[1] }], input: [mkInput(), mkInput()],
        axis: () => ({ x: 0, y: 0 }), sfx() {}, buzz() {}, info() {}, setPad() {}, end() {}, preview: true,
      };
      const inst = d.create(api);
      if (inst.demo) inst.demo();
      cg.setTransform(RES.scale, 0, 0, RES.scale, 0, 0);
      cg.fillStyle = '#000';
      cg.fillRect(0, 0, W, H);
      inst.draw(cg);
      if (inst.destroy) inst.destroy();
      previews[d.id] = c.toDataURL('image/jpeg', 0.82);
      const img = document.querySelector(`#gameGrid .gcard[data-id="${d.id}"] .prev`);
      if (img) img.src = previews[d.id];
      if (state === 'intro' && gameDef && gameDef.id === d.id) $('#introPrev').src = previews[d.id];
    } catch (err) {
      console.warn('önizleme hatası', d.id, err);
    }
    RES.scale = saved.scale;
    RES.low = saved.low;
    clearSprites();
    setTimeout(next, 16);
  };
  next();
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
  $('#introKeys').innerHTML = d.keys ? `Klavye: ${esc(d.keys)}` : '';
  if (previews[d.id]) $('#introPrev').src = previews[d.id];
  else $('#introPrev').removeAttribute('src');
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

function netSummary() {
  return [0, 1]
    .filter((p) => players[p] && players[p].kind === 'phone' && players[p].connected)
    .map((p) => `${players[p].name}: ${players[p].p2p ? 'doğrudan' : 'sunucu'}${players[p].rtt ? ` ${Math.round(players[p].rtt)} ms` : ''}`)
    .join(' · ');
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
    const net = netSummary();
    modal({
      icon: '⏸',
      title: 'Duraklatıldı',
      text: gameDef.name,
      buttons: [
        { label: '▶ Devam et', on: resume },
        { label: '↻ Baştan başlat', on: startGame },
        { label: '⌂ Oyun listesi', on: toLobby },
      ],
      hint: `Esc: devam et${net ? ` · Bağlantı: ${net}` : ''}`,
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

// ------------------------------------------------------------------ performans / kalite
// level 0: en fazla 1920 px genişlik, 1: 1440, 2: 1120 (az efekt)
const perf = { forced: store.get('kanepe.perf') === '1', level: 0 };
const fps = { acc: 0, n: 0, warm: 0 };
const CAPS = [1920, 1440, 1120];

function updatePerfBtn() {
  const b = $('#perfBtn');
  b.textContent = perf.forced ? '⚡ Performans modu: açık' : '⚡ Performans modu';
  b.classList.toggle('on', perf.forced);
}
$('#perfBtn').addEventListener('click', () => {
  perf.forced = !perf.forced;
  store.set('kanepe.perf', perf.forced ? '1' : '0');
  updatePerfBtn();
  resize();
});

function adapt(dt) {
  if (perf.forced || perf.level >= 2) return;
  if (fps.warm > 0) {
    fps.warm -= dt;
    fps.acc = 0;
    fps.n = 0;
    return;
  }
  fps.acc += dt;
  fps.n++;
  if (fps.n >= 120) {
    const avg = fps.acc / fps.n;
    fps.acc = 0;
    fps.n = 0;
    // ~45 FPS'in altına düşüyorsa çözünürlüğü azalt
    if (avg > 0.022) {
      perf.level++;
      fps.warm = 2;
      resize();
    }
  }
}

// ------------------------------------------------------------------ çizim döngüsü
function resize() {
  const cw = window.innerWidth;
  const ch = window.innerHeight;
  const s = Math.min(cw / W, ch / H);
  const w = Math.floor(W * s);
  const h = Math.floor(H * s);
  const st = canvas.style;
  st.width = w + 'px';
  st.height = h + 'px';
  st.left = Math.floor((cw - w) / 2) + 'px';
  st.top = Math.floor((ch - h) / 2) + 'px';
  const dpr = window.devicePixelRatio || 1;
  const cap = perf.forced ? CAPS[2] : CAPS[perf.level];
  const bw = Math.max(480, Math.min(Math.round(w * dpr), cap));
  if (canvas.width !== bw) {
    canvas.width = bw;
    canvas.height = Math.round((bw * H) / W);
  }
  RES.scale = canvas.width / W;
  RES.low = perf.forced || perf.level >= 2;
  needDraw = true;
}
window.addEventListener('resize', resize);

let lastT = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - lastT) / 1000;
  lastT = now;
  if (dt > 0.25) dt = 0.25;
  if (dt <= 0) return;
  if (!game) return;
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
      sfx.play('go');
      syncKeys(); // geri sayımda basılı tutulan tuşları oyuna bildir
    }
    needDraw = true;
  } else if (state === 'playing') {
    // değişken adım: 50/60/120 Hz ekranlarda takılmasız hareket
    let rem = Math.min(dt, 0.1);
    while (rem > 0.0005 && state === 'playing') {
      const st = rem > 0.02 ? 0.02 : rem;
      game.update(st);
      rem -= st;
    }
    if (goFlash > 0) goFlash -= dt;
    needDraw = true;
    adapt(dt);
  }
  if (needDraw && game) {
    draw();
    needDraw = state === 'countdown' || state === 'playing';
  }
}

function draw() {
  const s = RES.scale;
  g.setTransform(s, 0, 0, s, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  try {
    game.draw(g);
  } catch (err) {
    console.error(err);
  }
  g.setTransform(s, 0, 0, s, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
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
  updatePerfBtn();
  resize();
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
    } else {
      $('#lanHint').textContent = 'İpucu: telefonlar TV ile aynı Wi-Fi’deyse doğrudan (⚡) bağlanır, gecikme en aza iner.';
    }
  } catch {}
  renderRoom();
  connect();
  requestAnimationFrame(frame);
  try {
    await document.fonts.load(`700 20px ${FONT}`);
    await document.fonts.load(`800 20px ${FONT}`);
  } catch {}
  setTimeout(makePreviews, 50);
  setTimeout(() => $('#gameGrid .gcard:not(.hidden)')?.focus({ preventScroll: true }), 100);
}
boot();
