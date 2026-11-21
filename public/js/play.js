// KANEPE — telefon kumandası
const $ = (s, r = document) => r.querySelector(s);
const PLAYER_COLORS = ['#ff4f7b', '#2fc7ff'];

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
let current = null; // aktif görünüm verisi
let cleanupView = null;

const vibrate = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch {} };
const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------------------------------------------------------- bağlantı
function connect() {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  ws = new WebSocket(url);
  ws.onopen = () => {
    retry = 0;
    setNet(true);
    if (wantJoin) send({ t: 'join', code: wantJoin.code, name: wantJoin.name, id: myId });
  };
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    handle(m);
  };
  ws.onclose = () => {
    setNet(false);
    if (wantJoin && slot >= 0) showOverlay('Bağlantı koptu, yeniden bağlanılıyor…');
    setTimeout(connect, Math.min(4000, 300 * 2 ** retry++));
  };
}

function setNet(ok) {
  $('#net').classList.toggle('bad', !ok);
}

function handle(m) {
  switch (m.t) {
    case 'joined': {
      slot = m.slot;
      sess.set('kanepe.code', m.code);
      store.set('kanepe.name', m.name);
      document.body.style.setProperty('--me', PLAYER_COLORS[slot] || PLAYER_COLORS[0]);
      $('meta[name=theme-color]').setAttribute('content', slot === 0 ? '#3a1730' : '#10304a');
      $('#meName').textContent = m.name;
      $('#meSlot').textContent = `Oyuncu ${slot + 1}`;
      $('#join').classList.add('hidden');
      $('#main').classList.remove('hidden');
      $('#joinBtn').disabled = false;
      if (m.host) hideOverlay(); else showOverlay('TV ekranı bekleniyor…');
      if (!current) render({ mode: 'wait', title: 'Bağlandın!', text: 'TV ekranına bak.' });
      vibrate(30);
      keepAwake();
      break;
    }
    case 'error':
      $('#joinBtn').disabled = false;
      if (slot >= 0) {
        // Oda kapanmış olabilir: katılma ekranına dön
        leaveToJoin(m.msg);
      } else {
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
      if (t) t.innerHTML = m.html ?? esc(m.text);
      break;
    }
    case 'hostgone':
      showOverlay('TV ekranının bağlantısı koptu. Geri gelmesi bekleniyor…');
      break;
    case 'hostback':
      hideOverlay();
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
  sess.del('kanepe.code');
  if (cleanupView) cleanupView();
  cleanupView = null;
  $('#view').innerHTML = '';
  hideOverlay();
  $('#main').classList.add('hidden');
  $('#join').classList.remove('hidden');
  $('#joinErr').textContent = msg || '';
  $('#joinBtn').disabled = false;
  document.body.style.removeProperty('--me');
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
  if (ws && ws.readyState === 1) send({ t: 'join', code, name, id: myId });
  setTimeout(() => ($('#joinBtn').disabled = false), 3000);
});

// Sayfa yenilenmişse aynı odaya otomatik dön
if (sess.get('kanepe.code') && nameIn.value) {
  wantJoin = { code: sess.get('kanepe.code'), name: nameIn.value };
}

$('#pauseBtn').addEventListener('click', () => {
  send({ t: 'in', k: 'pause' });
  vibrate(20);
});
$('#fsBtn').addEventListener('click', () => {
  const d = document;
  try {
    if (d.fullscreenElement) d.exitFullscreen();
    else d.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
  } catch {}
});
if (!document.documentElement.requestFullscreen) $('#fsBtn').classList.add('hidden');

// iOS'ta yakınlaştırmayı engelle
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('contextmenu', (e) => e.preventDefault());
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = Date.now();
  if (now - lastTouchEnd < 300 && e.target.closest('.pad')) e.preventDefault();
  lastTouchEnd = now;
}, { passive: false });

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
  if (document.visibilityState === 'visible' && slot >= 0) keepAwake();
});

// ---------------------------------------------------------------- görünümler
function render(v) {
  if (!v) return;
  if (cleanupView) cleanupView();
  cleanupView = null;
  current = v;
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

  if (v.mode === 'lobby') {
    panel.innerHTML = `
      <h1>Oyun seç<small>${v.other ? `Rakibin: <b style="color:${PLAYER_COLORS[1 - slot]}">${esc(v.other)}</b>` : 'Rakibin bekleniyor… (oyunlar iki kişilik)'}</small></h1>
      <div class="games">${(v.games || [])
        .map((g) => `<button class="gcard" data-id="${esc(g.id)}" style="--c:${esc(g.color)}">
            <span class="badge">${g.mode === 'coop' ? 'TAKIM' : 'KAPIŞMA'}</span>
            <span class="gi">${esc(g.icon)}</span><b>${esc(g.name)}</b><small>${esc(g.tag)}</small></button>`)
        .join('')}</div>`;
    panel.querySelectorAll('.gcard').forEach((b) =>
      b.addEventListener('click', () => {
        vibrate(25);
        send({ t: 'in', k: 'pick', id: b.dataset.id });
      })
    );
  } else if (v.mode === 'intro') {
    const g = v.game || {};
    panel.innerHTML = `
      <h1><span style="color:${esc(g.color)}">${esc(g.icon)}</span> ${esc(g.name)}<small>${esc(g.tag)} · ${g.mode === 'coop' ? 'Birlikte oyna' : 'Kafa kafaya'}</small></h1>
      <p>${esc(g.desc)}</p>
      <ul class="howto">${(g.howto || []).map((h) => `<li>${esc(h)}</li>`).join('')}</ul>
      <button class="big ready ${v.ready ? 'done' : ''}" id="readyBtn">${v.ready ? '✓ HAZIRSIN' : 'HAZIRIM!'}</button>
      ${v.ready ? `<p style="text-align:center">${esc(v.waitText || 'Diğer oyuncu bekleniyor…')}</p>` : ''}
      <button class="ghost" id="backBtn">← Oyun listesi</button>`;
    $('#readyBtn', panel).addEventListener('click', () => {
      if (v.ready) return;
      vibrate(40);
      send({ t: 'in', k: 'ready' });
    });
    $('#backBtn', panel).addEventListener('click', () => send({ t: 'in', k: 'back' }));
  } else if (v.mode === 'menu') {
    panel.classList.add('center');
    panel.innerHTML = `
      <h1>${esc(v.title)}${v.sub ? `<small>${esc(v.sub)}</small>` : ''}</h1>
      ${v.text ? `<p>${esc(v.text)}</p>` : ''}
      <div class="menu">${(v.items || [])
        .map((it) => `<button data-id="${esc(it.id)}" class="${it.primary ? 'primary' : ''}">${esc(it.label)}</button>`)
        .join('')}</div>`;
    panel.querySelectorAll('.menu button').forEach((b) =>
      b.addEventListener('click', () => {
        vibrate(25);
        send({ t: 'in', k: 'menu', id: b.dataset.id });
      })
    );
  } else {
    panel.classList.add('center');
    panel.innerHTML = `${v.spin === false ? '' : '<div class="spinner"></div>'}<h1>${esc(v.title || '')}</h1><p>${esc(v.text || '')}</p>`;
  }
}

// ---------------------------------------------------------------- kumanda
function buildPad(box, v) {
  const layout = v.layout || 'dpad';
  const dirs = v.dirs || 4;
  const btnList = [];
  if (v.a !== null && v.a !== undefined) btnList.push(['a', 'A', v.a]);
  if (v.b !== null && v.b !== undefined) btnList.push(['b', 'B', v.b]);

  const pad = document.createElement('div');
  pad.className = 'pad' + (layout === 'touch' && !btnList.length ? ' single' : '');
  let dirHTML = '';
  if (layout === 'dpad' && dirs === 'lr') {
    dirHTML = '<div class="lr"><div class="arm left">◀</div><div class="arm right">▶</div></div>';
  } else if (layout === 'dpad') {
    dirHTML = '<div class="dpad"><div class="hub"></div><div class="arm up">▲</div><div class="arm down">▼</div><div class="arm left">◀</div><div class="arm right">▶</div></div>';
  } else if (layout === 'stick') {
    dirHTML = '<div class="stick"><div class="knob"></div></div>';
  } else if (layout === 'touch') {
    dirHTML = `<div class="touchpad" data-side="${esc(v.side || '')}"><div class="mid"></div><div class="goal"></div><div class="arrow">${esc(v.padHint || '')}</div><div class="dotf"></div></div>`;
  }
  const btnHTML = btnList.length
    ? `<div class="btns ${btnList.length === 1 ? 'solo' : ''}">${btnList
        .map(([k, l, label]) => `<div class="btn ${k}" data-k="${k}"><span>${l}</span>${label ? `<small>${esc(label)}</small>` : ''}</div>`)
        .join('')}</div>`
    : '';
  pad.innerHTML = `<div class="title">${v.html ?? esc(v.title || '')}</div>
    <div class="zones"><div class="zone dirz">${dirHTML}</div>${btnList.length ? `<div class="zone btnz">${btnHTML}</div>` : ''}</div>`;
  box.appendChild(pad);

  const dirZone = $('.dirz', pad);
  const btnZone = $('.btnz', pad);
  const dirEl = $('.dpad, .lr', pad);
  const stickEl = $('.stick', pad);
  const touchEl = $('.touchpad', pad);
  const btnEls = [...pad.querySelectorAll('.btn')];

  const pointers = new Map(); // pointerId -> {role, key}
  const keyCount = { up: 0, down: 0, left: 0, right: 0, a: 0, b: 0 };
  let dirPointer = null;
  let dirSet = new Set();

  function keyDown(k) {
    if (keyCount[k]++ === 0) {
      send({ t: 'in', k, d: 1 });
      vibrate(12);
    }
    mark(k, true);
  }
  function keyUp(k) {
    if (keyCount[k] > 0 && --keyCount[k] === 0) {
      send({ t: 'in', k, d: 0 });
      mark(k, false);
    }
  }
  function mark(k, on) {
    const e = k === 'a' || k === 'b' ? $(`.btn.${k}`, pad) : dirEl && $(`.arm.${k}`, dirEl);
    if (e) e.classList.toggle('on', on && keyCount[k] > 0);
  }

  function computeDir(x, y) {
    const s = new Set();
    if (!dirEl) return s;
    const r = dirEl.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    if (dirs === 'lr') {
      s.add(dx < 0 ? 'left' : 'right');
      return s;
    }
    if (Math.hypot(dx, dy) < r.width * 0.11) return s;
    if (dirs === 8) {
      const sector = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
      const map = [['right'], ['right', 'down'], ['down'], ['down', 'left'], ['left'], ['left', 'up'], ['up'], ['up', 'right']];
      map[sector].forEach((k) => s.add(k));
    } else {
      s.add(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down');
    }
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
    for (const b of btnEls) {
      const r = b.getBoundingClientRect();
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)) / (r.width / 2);
      if (d < bd) { bd = d; best = b.dataset.k; }
    }
    return best;
  }

  // analog çubuk & dokunmatik saha gönderimi (saniyede ~40)
  let lastSend = 0;
  let pending = null;
  let sendTimer = null;
  function sendAnalog(m, force) {
    pending = m;
    const now = performance.now();
    if (force || now - lastSend >= 25) {
      clearTimeout(sendTimer);
      sendTimer = null;
      lastSend = now;
      send(pending);
      pending = null;
    } else if (!sendTimer) {
      sendTimer = setTimeout(() => {
        sendTimer = null;
        lastSend = performance.now();
        if (pending) send(pending);
        pending = null;
      }, 25 - (now - lastSend));
    }
  }

  let stickOrigin = null;
  function resetStick() {
    if (!stickEl) return;
    const zr = dirZone.getBoundingClientRect();
    stickEl.style.left = zr.width / 2 + 'px';
    stickEl.style.top = (window.innerHeight > window.innerWidth ? zr.height * 0.62 : zr.height / 2) + 'px';
    $('.knob', stickEl).style.transform = '';
  }
  function moveStick(x, y) {
    const r = stickEl.getBoundingClientRect();
    const R = r.width * 0.4;
    let dx = (x - stickOrigin.x) / R;
    let dy = (y - stickOrigin.y) / R;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    $('.knob', stickEl).style.transform = `translate(${dx * R}px, ${dy * R}px)`;
    sendAnalog({ t: 'in', k: 'stick', x: +dx.toFixed(2), y: +dy.toFixed(2) });
  }

  function touchPos(x, y) {
    const r = touchEl.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (x - r.left) / r.width));
    const ny = Math.min(1, Math.max(0, (y - r.top) / r.height));
    const dot = $('.dotf', touchEl);
    dot.style.left = nx * 100 + '%';
    dot.style.top = ny * 100 + '%';
    return [nx, ny];
  }

  function inZone(z, x, y) {
    if (!z) return false;
    const r = z.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top - 60 && y <= r.bottom;
  }

  function down(e) {
    e.preventDefault();
    try { pad.setPointerCapture(e.pointerId); } catch {}
    const x = e.clientX;
    const y = e.clientY;
    if (btnZone && inZone(btnZone, x, y)) {
      const k = nearestBtn(x, y);
      pointers.set(e.pointerId, { role: 'btn', key: k });
      keyDown(k);
      return;
    }
    if (layout === 'touch') {
      pointers.set(e.pointerId, { role: 'touch' });
      touchEl.classList.add('on');
      const [nx, ny] = touchPos(x, y);
      sendAnalog({ t: 'in', k: 'pad', x: +nx.toFixed(3), y: +ny.toFixed(3), d: 1 }, true);
      return;
    }
    if (layout === 'stick') {
      for (const [id, p] of pointers) if (p.role === 'stick') pointers.delete(id);
      pointers.set(e.pointerId, { role: 'stick' });
      const zr = dirZone.getBoundingClientRect();
      stickOrigin = { x, y };
      stickEl.style.left = x - zr.left + 'px';
      stickEl.style.top = y - zr.top + 'px';
      moveStick(x, y);
      return;
    }
    // d-pad: yeni parmak eskisini devralır
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
      if (k !== p.key && inZone(btnZone, x, y)) {
        keyUp(p.key);
        p.key = k;
        keyDown(k);
      }
    } else if (p.role === 'stick') moveStick(x, y);
    else if (p.role === 'touch') {
      const [nx, ny] = touchPos(x, y);
      sendAnalog({ t: 'in', k: 'pad', x: +nx.toFixed(3), y: +ny.toFixed(3), d: 1 });
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
      sendAnalog({ t: 'in', k: 'stick', x: 0, y: 0 }, true);
      resetStick();
    } else if (p.role === 'touch') {
      touchEl.classList.remove('on');
      sendAnalog({ t: 'in', k: 'pad', d: 0 }, true);
    }
  }

  pad.addEventListener('pointerdown', down);
  pad.addEventListener('pointermove', move);
  pad.addEventListener('pointerup', up);
  pad.addEventListener('pointercancel', up);
  pad.addEventListener('lostpointercapture', up);
  requestAnimationFrame(resetStick);
  window.addEventListener('resize', resetStick);

  return () => {
    window.removeEventListener('resize', resetStick);
    clearTimeout(sendTimer);
    // basılı kalan tuşları bırak
    for (const k of Object.keys(keyCount)) if (keyCount[k] > 0) { keyCount[k] = 1; keyUp(k); }
    if (layout === 'stick') send({ t: 'in', k: 'stick', x: 0, y: 0 });
    if (layout === 'touch') send({ t: 'in', k: 'pad', d: 0 });
  };
}

connect();
