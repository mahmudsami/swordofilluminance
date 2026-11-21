// KANEPE — telefon kumandası
// Girdiler mümkünse TV'ye doğrudan (WebRTC veri kanalı), değilse sunucu üzerinden (WebSocket) gider.
const $ = (s, r = document) => r.querySelector(s);
const PLAYER_COLORS = ['#ff4f7b', '#2fc7ff'];
const BIT = { up: 1, down: 2, left: 4, right: 8, a: 16, b: 32 };
const RTC_CFG = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
const CATS = [
  ['all', 'Tümü'],
  ['takim', 'Takım'],
  ['spor', 'Spor & Yarış'],
  ['aksiyon', 'Aksiyon'],
  ['bulmaca', 'Bulmaca & Masa'],
];

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};
const sess = {
  get(k) { try { return sessionStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, v); } catch {} },
  del(k) { try { sessionStorage.removeItem(k); } catch {} },
};

let myId = store.get('kanepe.id');
if (!myId) {
  myId = Math.random().toString(36).slice(2) + Date.now().toString(36);
  store.set('kanepe.id', myId);
}

let ws = null;
let retry = 0;
let wantJoin = null; // {code, name}
let slot = -1;
let hostHere = false;
let current = null; // aktif görünüm
let curSig = '';
let cleanupView = null;
let releasePad = null;
let seq = 0;
let keys = 0; // basılı tuşların bit maskesi
let rtt = 0;
let catFilter = 'all';

const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function wsSend(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}
function p2pOpen() {
  return !!(dc && dc.readyState === 'open');
}
// Hız gerektiren her şey: önce doğrudan kanal
function sendFast(m) {
  if (p2pOpen()) {
    try {
      dc.send(JSON.stringify(m));
      return;
    } catch {}
  }
  wsSend(m);
}
// Sıralı kumanda mesajı (TV eski / sırası karışmış mesajları atar)
function sendIn(m) {
  m.t = 'in';
  m.n = ++seq;
  sendFast(m);
}

// ---------------------------------------------------------------- WebSocket
function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => {
    retry = 0;
    updateNet();
    if (wantJoin) wsSend({ t: 'join', code: wantJoin.code, name: wantJoin.name, id: myId });
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    handle(m);
  };
  ws.onclose = () => {
    updateNet();
    if (wantJoin && slot >= 0 && !p2pOpen()) showOverlay('Bağlantı koptu, yeniden bağlanılıyor…');
    setTimeout(connect, Math.min(4000, 300 * 2 ** retry++));
  };
}

// ---------------------------------------------------------------- WebRTC (doğrudan bağlantı)
let pc = null;
let dc = null;
let rtcPending = [];
let rtcRemote = false;
let rtcTries = 0;
let rtcTimer = null;
let rtcRetryTimer = null;

function rtcStop() {
  clearTimeout(rtcTimer);
  const oldPc = pc;
  const oldDc = dc;
  pc = null;
  dc = null;
  try { oldDc && oldDc.close(); } catch {}
  try { oldPc && oldPc.close(); } catch {}
  updateNet();
}

function rtcRetry() {
  clearTimeout(rtcRetryTimer);
  if (rtcTries >= 4 || slot < 0 || !hostHere) return;
  rtcRetryTimer = setTimeout(rtcStart, 1500 * 2 ** rtcTries);
}

function rtcStart() {
  clearTimeout(rtcRetryTimer);
  rtcStop();
  if (!window.RTCPeerConnection || slot < 0 || !hostHere) return;
  rtcTries++;
  let myPc;
  try {
    myPc = pc = new RTCPeerConnection(RTC_CFG);
  } catch {
    return;
  }
  const ch = (dc = myPc.createDataChannel('kanepe', { ordered: true }));
  rtcPending = [];
  rtcRemote = false;
  ch.onopen = () => {
    if (dc !== ch) return;
    clearTimeout(rtcTimer);
    rtcTries = 0;
    updateNet();
    ping();
    sendState();
    hideOverlay();
  };
  ch.onclose = () => {
    if (dc !== ch) return;
    rtcStop();
    rtcRetry();
  };
  ch.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    handle(m);
  };
  myPc.onicecandidate = (e) => {
    if (e.candidate && pc === myPc) wsSend({ t: 'rtc', c: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate });
  };
  myPc.onconnectionstatechange = () => {
    if (pc !== myPc) return;
    if (myPc.connectionState === 'failed') {
      rtcStop();
      rtcRetry();
    }
  };
  myPc
    .createOffer()
    .then((o) => myPc.setLocalDescription(o))
    .then(() => {
      if (pc === myPc) wsSend({ t: 'rtc', sdp: { type: myPc.localDescription.type, sdp: myPc.localDescription.sdp } });
    })
    .catch(() => {});
  rtcTimer = setTimeout(() => {
    if (pc === myPc && !p2pOpen()) {
      rtcStop();
      rtcRetry();
    }
  }, 9000);
}

function onRtc(m) {
  if (!pc) return;
  const myPc = pc;
  if (m.sdp && m.sdp.type === 'answer') {
    myPc
      .setRemoteDescription(m.sdp)
      .then(() => {
        if (pc !== myPc) return;
        rtcRemote = true;
        for (const c of rtcPending) myPc.addIceCandidate(c).catch(() => {});
        rtcPending = [];
      })
      .catch(() => {});
  } else if (m.c) {
    if (rtcRemote) myPc.addIceCandidate(m.c).catch(() => {});
    else rtcPending.push(m.c);
  }
}

// ---------------------------------------------------------------- ağ durumu & gecikme
let pingSent = 0;
function ping() {
  if (slot < 0) return;
  pingSent = performance.now();
  sendFast({ t: 'in', k: 'ping', ts: Math.round(pingSent * 10) / 10 });
}
function sendState() {
  if (slot < 0) return;
  sendIn({ k: 'st', b: keys, r: Math.round(rtt), v: p2pOpen() ? 1 : 0 });
}

function updateNet() {
  const net = $('#net');
  const ok = (ws && ws.readyState === 1) || p2pOpen();
  net.classList.toggle('bad', !ok);
  const lat = $('#lat');
  if (!ok || slot < 0) {
    lat.textContent = '';
    lat.className = 'lat';
    return;
  }
  const ms = Math.round(rtt);
  lat.textContent = `${p2pOpen() ? '⚡' : '☁'} ${ms ? ms + ' ms' : '…'}`;
  lat.className = 'lat ' + (ms > 150 ? 'slow' : ms > 70 ? 'mid' : 'good');
  lat.title = p2pOpen() ? 'TV ile doğrudan bağlantı' : 'Sunucu üzerinden bağlantı';
}

// Kumanda açıkken sık durum gönder: hem takılı tuşları düzeltir hem Wi-Fi'yi uyanık tutar
setInterval(() => {
  if (slot >= 0 && current && current.mode === 'pad') sendState();
}, 150);
setInterval(() => {
  ping();
  updateNet();
}, 2000);

// ---------------------------------------------------------------- mesajlar
function handle(m) {
  switch (m.t) {
    case 'joined': {
      slot = m.slot;
      hostHere = !!m.host;
      sess.set('kanepe.code', m.code);
      store.set('kanepe.name', m.name);
      document.body.style.setProperty('--me', PLAYER_COLORS[slot] || PLAYER_COLORS[0]);
      $('meta[name=theme-color]').setAttribute('content', slot === 0 ? '#3a1730' : '#10304a');
      $('#meName').textContent = m.name;
      $('#meSlot').textContent = `Oyuncu ${slot + 1}`;
      $('#join').classList.add('hidden');
      $('#main').classList.remove('hidden');
      $('#joinBtn').disabled = false;
      if (hostHere) hideOverlay();
      else showOverlay('TV ekranı bekleniyor…');
      if (!current) render({ mode: 'wait', title: 'Bağlandın!', text: 'TV ekranına bak.' });
      vibrate(30);
      keepAwake();
      if (!p2pOpen()) {
        rtcTries = 0;
        setTimeout(rtcStart, 250);
      }
      ping();
      updateNet();
      break;
    }
    case 'error':
      $('#joinBtn').disabled = false;
      if (slot >= 0) leaveToJoin(m.msg);
      else {
        $('#joinErr').textContent = m.msg;
        wantJoin = null;
      }
      break;
    case 'ctl':
      render(m.view);
      break;
    case 'buzz':
      vibrate(m.ms || 60);
      break;
    case 'info': {
      const t = $('.pad .title');
      if (t) t.textContent = m.text;
      if (current) current.title = m.text;
      break;
    }
    case 'pong':
      if (m.ts) {
        const r = performance.now() - m.ts;
        if (r >= 0 && r < 5000) rtt = rtt ? rtt * 0.6 + r * 0.4 : r;
        updateNet();
      }
      break;
    case 'rtc':
      onRtc(m);
      break;
    case 'hostgone':
      hostHere = false;
      rtcStop();
      showOverlay('TV ekranının bağlantısı koptu. Geri gelmesi bekleniyor…');
      break;
    case 'hostback':
      hostHere = true;
      hideOverlay();
      rtcTries = 0;
      setTimeout(rtcStart, 400);
      break;
    case 'closed':
    case 'kicked':
      leaveToJoin(m.reason);
      break;
  }
}

function leaveToJoin(msg) {
  wantJoin = null;
  slot = -1;
  current = null;
  curSig = '';
  sess.del('kanepe.code');
  if (cleanupView) cleanupView();
  cleanupView = null;
  releasePad = null;
  rtcStop();
  $('#view').innerHTML = '';
  hideOverlay();
  $('#main').classList.add('hidden');
  $('#join').classList.remove('hidden');
  $('#joinErr').textContent = msg || '';
  $('#joinBtn').disabled = false;
  document.body.style.removeProperty('--me');
  updateNet();
}

function showOverlay(text) {
  $('#overlayText').textContent = text;
  $('#overlay').classList.remove('hidden');
}
function hideOverlay() {
  $('#overlay').classList.add('hidden');
}

// ---------------------------------------------------------------- katılma
const codeIn = $('#code');
const nameIn = $('#name');
const params = new URLSearchParams(location.search);
codeIn.value = (params.get('c') || sess.get('kanepe.code') || '').toUpperCase().slice(0, 4);
nameIn.value = store.get('kanepe.name') || '';
codeIn.addEventListener('input', () => {
  codeIn.value = codeIn.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  if (codeIn.value.length === 4 && !nameIn.value) nameIn.focus();
});

$('#joinForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = codeIn.value.trim().toUpperCase();
  const name = nameIn.value.trim();
  if (code.length !== 4) return ($('#joinErr').textContent = 'Kod 4 harfli olmalı.');
  if (!name) return ($('#joinErr').textContent = 'Bir isim yaz.');
  $('#joinErr').textContent = '';
  $('#joinBtn').disabled = true;
  wantJoin = { code, name };
  wsSend({ t: 'join', code, name, id: myId });
  setTimeout(() => ($('#joinBtn').disabled = false), 3000);
});

// Sayfa yenilenmişse aynı odaya otomatik dön
if (sess.get('kanepe.code') && nameIn.value) wantJoin = { code: sess.get('kanepe.code'), name: nameIn.value };

$('#pauseBtn').addEventListener('click', () => {
  sendIn({ k: 'pause' });
  vibrate(20);
});
$('#fsBtn').addEventListener('click', () => {
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  } catch {}
});
if (!document.documentElement.requestFullscreen) $('#fsBtn').classList.add('hidden');

// Yakınlaştırma / uzun basma menülerini engelle
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => (wakeLock = null));
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (slot >= 0) {
      keepAwake();
      if (!p2pOpen() && hostHere) {
        rtcTries = 0;
        rtcStart();
      }
    }
  } else if (releasePad) releasePad();
});
window.addEventListener('pagehide', () => releasePad && releasePad());

// ---------------------------------------------------------------- görünümler
function sigOf(v) {
  return JSON.stringify([v.mode, v.layout, v.dirs, v.a, v.b, v.side, v.padHint, v.options, v.cols, v.prompt, v.text, v.sel, v.lock]);
}

function render(v) {
  if (!v) return;
  const sig = sigOf(v);
  // Aynı kumanda tekrar gelirse yeniden kurma: basılı tuşlar bırakılmasın
  if (current && v.mode === 'pad' && current.mode === 'pad' && sig === curSig) {
    current = v;
    const t = $('.pad .title');
    if (t) t.textContent = v.title || '';
    return;
  }
  if (cleanupView) cleanupView();
  cleanupView = null;
  releasePad = null;
  current = v;
  curSig = sig;
  const box = $('#view');
  $('#pauseBtn').classList.toggle('hidden', !(v.mode === 'pad' && v.pause !== false));
  box.innerHTML = '';

  if (v.mode === 'pad') {
    cleanupView = buildPad(box, v);
    return;
  }

  const panel = document.createElement('div');
  panel.className = 'panel';
  box.appendChild(panel);

  if (v.mode === 'lobby') renderLobby(panel, v);
  else if (v.mode === 'intro') renderIntro(panel, v);
  else if (v.mode === 'menu') {
    panel.classList.add('center');
    panel.innerHTML = `
      <h1>${esc(v.title)}${v.sub ? `<small>${esc(v.sub)}</small>` : ''}</h1>
      ${v.text ? `<p>${esc(v.text)}</p>` : ''}
      <div class="menu">${(v.items || [])
        .map((it) => `<button data-id="${esc(it.id)}" class="${it.primary ? 'primary' : ''}">${esc(it.label)}</button>`)
        .join('')}</div>`;
    const btns = panel.querySelectorAll('.menu button');
    btns.forEach((b) =>
      b.addEventListener('click', () => {
        if (b.disabled) return;
        vibrate(25);
        // anında geri bildirim
        btns.forEach((x) => (x.disabled = true));
        b.classList.add('sent');
        setTimeout(() => btns.forEach((x) => (x.disabled = false)), 1500);
        sendIn({ k: 'menu', id: b.dataset.id });
      })
    );
  } else {
    panel.classList.add('center');
    panel.innerHTML = `${v.spin === false ? '' : '<div class="spinner"></div>'}<h1>${esc(v.title || '')}</h1><p>${esc(v.text || '')}</p>`;
  }
}

function renderLobby(panel, v) {
  const games = v.games || [];
  const inCat = (g, c) => c === 'all' || g.cat === c || (c === 'takim' && g.mode === 'coop');
  const chips = CATS.filter(([c]) => c === 'all' || games.some((g) => inCat(g, c)))
    .map(([c, n]) => `<button class="chip ${c === catFilter ? 'on' : ''}" data-c="${c}">${esc(n)}</button>`)
    .join('');
  panel.innerHTML = `
    <h1>Oyun seç<small>${v.other ? `Rakibin: <b style="color:${PLAYER_COLORS[1 - slot]}">${esc(v.other)}</b>` : 'Rakibin bekleniyor… (oyunlar iki kişilik)'}</small></h1>
    <div class="chips">${chips}</div>
    <div class="games">${games
      .map((g) => `<button class="gcard ${inCat(g, catFilter) ? '' : 'hidden'}" data-id="${esc(g.id)}" data-cat="${esc(g.cat)}" data-mode="${esc(g.mode)}" style="--c:${esc(g.color)}">
          <span class="badge">${g.mode === 'coop' ? 'TAKIM' : 'KAPIŞMA'}</span>
          <span class="gi">${esc(g.icon)}</span><b>${esc(g.name)}</b><small>${esc(g.tag)}</small></button>`)
      .join('')}</div>`;
  panel.querySelectorAll('.chip').forEach((c) =>
    c.addEventListener('click', () => {
      catFilter = c.dataset.c;
      panel.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === c));
      panel.querySelectorAll('.gcard').forEach((b) => b.classList.toggle('hidden', !inCat({ cat: b.dataset.cat, mode: b.dataset.mode }, catFilter)));
    })
  );
  panel.querySelectorAll('.gcard').forEach((b) =>
    b.addEventListener('click', () => {
      vibrate(25);
      b.classList.add('sent');
      sendIn({ k: 'pick', id: b.dataset.id });
    })
  );
}

function renderIntro(panel, v) {
  const g = v.game || {};
  panel.classList.add('intro');
  panel.innerHTML = `
    <div class="introscroll">
      <h1><span style="color:${esc(g.color)}">${esc(g.icon)}</span> ${esc(g.name)}<small>${esc(g.tag)} · ${g.mode === 'coop' ? 'Birlikte oyna' : 'Kafa kafaya'}</small></h1>
      <p>${esc(g.desc)}</p>
      <ul class="howto">${(g.howto || []).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
    </div>
    <div class="introbar">
      <button class="big ready ${v.ready ? 'done' : ''}" id="readyBtn">${v.ready ? '✓ HAZIRSIN' : 'HAZIRIM!'}</button>
      <p class="waittext ${v.ready ? '' : 'hidden'}">${esc(v.waitText || 'Diğer oyuncu bekleniyor…')}</p>
      <button class="ghost" id="backBtn">← Oyun listesi</button>
    </div>`;
  const rb = $('#readyBtn', panel);
  rb.addEventListener('click', () => {
    if (rb.classList.contains('done')) return;
    vibrate(40);
    rb.classList.add('done');
    rb.textContent = '✓ HAZIRSIN';
    $('.waittext', panel).classList.remove('hidden');
    sendIn({ k: 'ready' });
  });
  $('#backBtn', panel).addEventListener('click', () => sendIn({ k: 'back' }));
}

// ---------------------------------------------------------------- kumanda
function buildPad(box, v) {
  const layout = v.layout || 'dpad';
  const dirs = v.dirs || 4;
  const btnList = [];
  if (layout !== 'choice' && layout !== 'wait') {
    if (v.a !== null && v.a !== undefined) btnList.push(['a', 'A', v.a]);
    if (v.b !== null && v.b !== undefined) btnList.push(['b', 'B', v.b]);
  }

  const pad = document.createElement('div');
  pad.className = `pad lay-${layout}` + (!btnList.length ? ' single' : '');
  let dirHTML = '';
  if (layout === 'dpad' && dirs === 'lr') {
    dirHTML = '<div class="lr"><div class="arm left">◀</div><div class="arm right">▶</div></div>';
  } else if (layout === 'dpad') {
    dirHTML = '<div class="dpad"><div class="hub"></div><div class="arm up">▲</div><div class="arm down">▼</div><div class="arm left">◀</div><div class="arm right">▶</div></div>';
  } else if (layout === 'stick') {
    dirHTML = '<div class="stick"><div class="knob"></div></div>';
  } else if (layout === 'touch') {
    dirHTML = `<div class="touchpad" data-side="${esc(v.side || '')}"><div class="mid"></div><div class="goal"></div><div class="arrow">${esc(v.padHint || '')}</div><div class="dotf"></div></div>`;
  } else if (layout === 'choice') {
    const cols = v.cols || 3;
    dirHTML = `<div class="choice">
      ${v.prompt ? `<div class="prompt">${esc(v.prompt)}</div>` : ''}
      <div class="cgrid" style="grid-template-columns:repeat(${cols},1fr)">${(v.options || [])
        .map((o) => `<button class="copt ${v.sel === o.id ? 'sel' : ''} ${o.dis ? 'dis' : ''}" data-id="${esc(o.id)}" ${v.lock || o.dis ? 'disabled' : ''}>${esc(o.label)}${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`)
        .join('')}</div></div>`;
  } else if (layout === 'wait') {
    dirHTML = `<div class="padwait"><div class="spinner"></div><b>${esc(v.text || 'Bekle…')}</b>${v.sub ? `<small>${esc(v.sub)}</small>` : ''}</div>`;
  }
  const btnHTML = btnList.length
    ? `<div class="btns ${btnList.length === 1 && layout !== 'ab' ? 'solo' : ''}">${(layout === 'ab' ? [...btnList].reverse() : btnList)
        .map(([k, l, label]) => `<div class="btn ${k}" data-k="${k}"><span>${l}</span>${label ? `<small>${esc(label)}</small>` : ''}</div>`)
        .join('')}</div>`
    : '';
  pad.innerHTML = `<div class="title">${esc(v.title || '')}</div>
    <div class="zones">${layout === 'ab' ? '' : `<div class="zone dirz">${dirHTML}</div>`}${btnList.length ? `<div class="zone btnz">${btnHTML}</div>` : ''}</div>`;
  box.appendChild(pad);

  const dirZone = $('.dirz', pad);
  const btnZone = $('.btnz', pad);
  const dirEl = $('.dpad, .lr', pad);
  const stickEl = $('.stick', pad);
  const touchEl = $('.touchpad', pad);
  const btnEls = [...pad.querySelectorAll('.btn')];
  const armEls = {};
  pad.querySelectorAll('.arm').forEach((e) => (armEls[[...e.classList].find((c) => BIT[c])] = e));
  for (const b of btnEls) armEls[b.dataset.k] = b;

  // Seçim düğmeleri (sıra tabanlı oyunlar)
  if (layout === 'choice') {
    pad.querySelectorAll('.copt').forEach((b) =>
      b.addEventListener('click', () => {
        if (b.disabled) return;
        vibrate(25);
        pad.querySelectorAll('.copt').forEach((x) => x.classList.toggle('sel', x === b));
        sendIn({ k: 'choose', id: b.dataset.id });
      })
    );
  }

  // Ölçüleri önbelleğe al (her dokunuşta yeniden hesaplamamak için)
  let R = null;
  function measure() {
    const rect = (e) => (e ? e.getBoundingClientRect() : null);
    R = {
      dir: rect(dirEl),
      dirZone: rect(dirZone),
      btnZone: rect(btnZone),
      touch: rect(touchEl),
      stick: rect(stickEl),
      btns: btnEls.map((b) => [b.dataset.k, rect(b)]),
    };
  }

  const pointers = new Map(); // pointerId -> {role, key}
  const keyCount = { up: 0, down: 0, left: 0, right: 0, a: 0, b: 0 };
  let dirPointer = null;
  let dirSet = new Set();

  function keyDown(k) {
    if (keyCount[k]++ === 0) {
      keys |= BIT[k];
      sendIn({ k, d: 1 });
      vibrate(10);
      if (armEls[k]) armEls[k].classList.add('on');
    }
  }
  function keyUp(k) {
    if (keyCount[k] > 0 && --keyCount[k] === 0) {
      keys &= ~BIT[k];
      sendIn({ k, d: 0 });
      if (armEls[k]) armEls[k].classList.remove('on');
    }
  }

  function computeDir(x, y) {
    const s = new Set();
    if (!dirEl || !R.dir) return s;
    const r = R.dir;
    const dx = x - (r.left + r.width / 2);
    const dy = y - (r.top + r.height / 2);
    if (dirs === 'lr') {
      s.add(dx < 0 ? 'left' : 'right');
      return s;
    }
    if (Math.hypot(dx, dy) < r.width * 0.1) return s;
    if (dirs === 8) {
      const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const map = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
      map[sector].forEach((k) => s.add(k));
      return s;
    }
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    let horiz = ax > ay;
    // çapraza yakın titremeleri engelle: eksen değiştirmek için belirgin fark gerekir
    if (dirSet.size === 1) {
      const cur = [...dirSet][0];
      const curH = cur === 'left' || cur === 'right';
      if (curH !== horiz) horiz = curH ? ax * 1.3 > ay : !(ay * 1.3 > ax);
    }
    s.add(horiz ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
    return s;
  }
  function setDir(ns) {
    for (const k of dirSet) if (!ns.has(k)) keyUp(k);
    for (const k of ns) if (!dirSet.has(k)) keyDown(k);
    dirSet = ns;
  }

  function nearestBtn(x, y) {
    let best = null;
    let bd = Infinity;
    for (const [k, r] of R.btns) {
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) / (r.width / 2);
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  // analog çubuk & dokunmatik saha (en fazla ~60 Hz)
  let lastSend = 0;
  let pendingMsg = null;
  let sendTimer = null;
  function sendAnalog(m, force) {
    pendingMsg = m;
    const now = performance.now();
    if (force || now - lastSend >= 15) {
      clearTimeout(sendTimer);
      sendTimer = null;
      lastSend = now;
      sendIn(pendingMsg);
      pendingMsg = null;
    } else if (!sendTimer) {
      sendTimer = setTimeout(() => {
        sendTimer = null;
        lastSend = performance.now();
        if (pendingMsg) sendIn(pendingMsg);
        pendingMsg = null;
      }, 15 - (now - lastSend));
    }
  }

  let stickOrigin = null;
  let knob = stickEl ? $('.knob', stickEl) : null;
  function resetStick() {
    if (!stickEl || !R) return;
    const zr = R.dirZone;
    stickEl.style.left = zr.width / 2 + 'px';
    stickEl.style.top = (window.innerHeight > window.innerWidth ? zr.height * 0.62 : zr.height / 2) + 'px';
    knob.style.transform = '';
  }
  function moveStick(x, y) {
    const R0 = (R.stick ? R.stick.width : 200) * 0.4;
    let dx = (x - stickOrigin.x) / R0;
    let dy = (y - stickOrigin.y) / R0;
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    knob.style.transform = `translate(${dx * R0}px, ${dy * R0}px)`;
    sendAnalog({ k: 'stick', x: +dx.toFixed(2), y: +dy.toFixed(2) });
  }

  let dot = touchEl ? $('.dotf', touchEl) : null;
  function touchPos(x, y) {
    const r = R.touch;
    const nx = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (y - r.top) / r.height));
    dot.style.transform = `translate(${nx * r.width}px, ${ny * r.height}px)`;
    return [nx, ny];
  }

  const inRect = (r, x, y) => r && x >= r.left && x <= r.right && y >= r.top - 60 && y <= r.bottom;

  function down(e) {
    if (layout === 'choice' || layout === 'wait') return;
    e.preventDefault();
    if (!R) measure();
    try { pad.setPointerCapture(e.pointerId); } catch {}
    const x = e.clientX;
    const y = e.clientY;
    if (btnZone && (layout === 'ab' || inRect(R.btnZone, x, y))) {
      const k = nearestBtn(x, y);
      pointers.set(e.pointerId, { role: 'btn', key: k });
      keyDown(k);
      return;
    }
    if (layout === 'touch') {
      pointers.set(e.pointerId, { role: 'touch' });
      touchEl.classList.add('on');
      const [nx, ny] = touchPos(x, y);
      sendAnalog({ k: 'pad', x: +nx.toFixed(3), y: +ny.toFixed(3), d: 1 }, true);
      return;
    }
    if (layout === 'stick') {
      for (const [id, p] of pointers) if (p.role === 'stick') pointers.delete(id);
      pointers.set(e.pointerId, { role: 'stick' });
      const zr = R.dirZone;
      stickOrigin = { x, y };
      stickEl.style.left = x - zr.left + 'px';
      stickEl.style.top = y - zr.top + 'px';
      moveStick(x, y);
      return;
    }
    if (dirPointer !== null) pointers.delete(dirPointer);
    dirPointer = e.pointerId;
    pointers.set(e.pointerId, { role: 'dir' });
    setDir(computeDir(x, y));
  }

  function move(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    if (p.role === 'dir') setDir(computeDir(x, y));
    else if (p.role === 'btn') {
      const k = nearestBtn(x, y);
      if (k !== p.key && (layout === 'ab' || inRect(R.btnZone, x, y))) {
        keyUp(p.key);
        p.key = k;
        keyDown(k);
      }
    } else if (p.role === 'stick') moveStick(x, y);
    else if (p.role === 'touch') {
      const [nx, ny] = touchPos(x, y);
      sendAnalog({ k: 'pad', x: +nx.toFixed(3), y: +ny.toFixed(3), d: 1 });
    }
  }

  function up(e) {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    pointers.delete(e.pointerId);
    if (p.role === 'dir') {
      if (dirPointer === e.pointerId) {
        dirPointer = null;
        setDir(new Set());
      }
    } else if (p.role === 'btn') keyUp(p.key);
    else if (p.role === 'stick') {
      sendAnalog({ k: 'stick', x: 0, y: 0 }, true);
      resetStick();
    } else if (p.role === 'touch') {
      touchEl.classList.remove('on');
      sendAnalog({ k: 'pad', d: 0 }, true);
    }
  }

  function releaseAll() {
    pointers.clear();
    dirPointer = null;
    for (const k of Object.keys(keyCount)) if (keyCount[k] > 0) {
      keyCount[k] = 1;
      keyUp(k);
    }
    dirSet = new Set();
    if (layout === 'stick') {
      sendAnalog({ k: 'stick', x: 0, y: 0 }, true);
      resetStick();
    }
    if (layout === 'touch') {
      touchEl.classList.remove('on');
      sendAnalog({ k: 'pad', d: 0 }, true);
    }
  }

  function onResize() {
    measure();
    resetStick();
  }

  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointermove', move);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('lostpointercapture', up);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  requestAnimationFrame(() => {
    measure();
    resetStick();
  });
  releasePad = releaseAll;

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    clearTimeout(sendTimer);
    releaseAll();
    keys = 0;
  };
}

connect();
