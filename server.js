// KANEPE — telefonu kumandaya çeviren parti oyunları sunucusu.
// Görevi: statik dosyaları sunmak ve TV (host) ile telefonlar arasında
// WebSocket mesajlarını taşımak. Oyun mantığının tamamı TV tarafında çalışır.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');

const FIXED_PORT = !!process.env.PORT; // PORT verilmediyse doluysa sıradaki boş portu dener
let PORT = Number(process.env.PORT) || 3000;
const FIRST_PORT = PORT;
const PUBLIC = path.join(__dirname, 'public');
const MAX_PLAYERS = 2;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I ve O yok (1 ve 0 ile karışmasın)
const HOST_GRACE_MS = 90 * 1000; // TV yenilenirse odayı bu kadar tut
const PLAYER_GRACE_MS = 90 * 1000; // telefon koparsa yerini bu kadar tut

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

const ROUTES = { '/': 'index.html', '/tv': 'host.html', '/host': 'host.html', '/play': 'play.html', '/katil': 'play.html' };

function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) {
      // Node 18.0-18.3 'family' değerini sayı (4) olarak verir
      if ((a.family === 'IPv4' || a.family === 4) && !a.internal) out.push(a.address);
    }
  }
  // Ev ağlarında yaygın olan adresleri öne al
  out.sort((a, b) => score(b) - score(a));
  return out;
  function score(ip) {
    if (ip.startsWith('192.168.')) return 3;
    if (ip.startsWith('10.')) return 2;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return 1;
    return 0;
  }
}

function send(res, status, type, body, extra = {}) {
  res.writeHead(status, { 'Content-Type': type, ...extra });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    return send(res, 400, 'text/plain', 'Bad request');
  }
  const p = url.pathname;

  if (p === '/api/info') {
    return send(res, 200, MIME['.json'], JSON.stringify({ ips: lanAddresses(), port: PORT, rooms: rooms.size }), {
      'Cache-Control': 'no-store',
    });
  }

  if (p === '/qr.svg') {
    const data = (url.searchParams.get('d') || '').slice(0, 300);
    if (!data) return send(res, 400, 'text/plain', 'missing d');
    try {
      const svg = await QRCode.toString(data, {
        type: 'svg',
        margin: 1,
        errorCorrectionLevel: 'M',
        color: { dark: '#14132b', light: '#ffffff' },
      });
      return send(res, 200, MIME['.svg'], svg, { 'Cache-Control': 'public, max-age=3600' });
    } catch {
      return send(res, 500, 'text/plain', 'qr error');
    }
  }

  // Statik dosyalar
  let rel = ROUTES[p] || p;
  rel = decodeURIComponent(rel).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, 'text/plain', 'Forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'text/html; charset=utf-8', '<h1>404</h1><p>Sayfa bulunamadı.</p>');
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

// ---------------------------------------------------------------------------
// Odalar
// room = { code, key, host, hostTimer, players: [slot|null], ctl: [view|null] }
// slot = { id, name, ws, timer }
const rooms = new Map();

function makeCode() {
  for (let tries = 0; tries < 1000; tries++) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
  throw new Error('no free room code');
}

function makeKey() {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

function out(ws, msg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function cleanName(n) {
  n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  return n || 'Oyuncu';
}

function playerList(room) {
  return room.players.map((s) => (s ? { name: s.name, connected: !!(s.ws && s.ws.readyState === 1) } : null));
}

function closeRoom(room, reason) {
  for (const s of room.players) {
    if (s) {
      clearTimeout(s.timer);
      out(s.ws, { t: 'closed', reason });
      s.ws && (s.ws.room = null);
    }
  }
  clearTimeout(room.hostTimer);
  rooms.delete(room.code);
}

function freeSlot(room, i, reason) {
  const s = room.players[i];
  if (!s) return;
  clearTimeout(s.timer);
  if (s.ws) {
    out(s.ws, { t: 'kicked', reason });
    s.ws.room = null;
  }
  room.players[i] = null;
  room.ctl[i] = null;
  out(room.host, { t: 'pgone', p: i });
}

const wss = new WebSocketServer({ server, path: '/ws', perMessageDeflate: false, maxPayload: 64 * 1024 });

wss.on('connection', (ws) => {
  ws.alive = true;
  ws.on('pong', () => (ws.alive = true));

  ws.on('message', (raw) => {
    let m;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (!m || typeof m.t !== 'string') return;

    // ---------------- TV (host) ----------------
    if (m.t === 'host') {
      let room = m.code && rooms.get(String(m.code).toUpperCase());
      if (room && room.key === m.key) {
        // Yenilenen TV aynı odaya geri dönüyor
        if (room.host && room.host !== ws) {
          room.host.role = null;
          try { room.host.close(); } catch {}
        }
        clearTimeout(room.hostTimer);
      } else {
        room = { code: makeCode(), key: makeKey(), host: null, hostTimer: null, players: Array(MAX_PLAYERS).fill(null), ctl: Array(MAX_PLAYERS).fill(null) };
        rooms.set(room.code, room);
      }
      room.host = ws;
      ws.role = 'host';
      ws.room = room;
      out(ws, { t: 'room', code: room.code, key: room.key, players: playerList(room) });
      for (const s of room.players) if (s) out(s.ws, { t: 'hostback' });
      return;
    }

    if (ws.role === 'host') {
      const room = ws.room;
      if (!room) return;
      if (m.t === 'ctl' || m.t === 'buzz' || m.t === 'info' || m.t === 'pong' || m.t === 'rtc') {
        const targets = m.to === 'all' || m.to === undefined ? [0, 1] : [Number(m.to)].filter((i) => i >= 0 && i < MAX_PLAYERS);
        for (const i of targets) {
          if (m.t === 'ctl') room.ctl[i] = m.view;
          const s = room.players[i];
          if (s) out(s.ws, m);
        }
      } else if (m.t === 'kick') {
        freeSlot(room, Number(m.p), 'TV seni odadan çıkardı');
      } else if (m.t === 'close') {
        closeRoom(room, 'TV odayı kapattı');
        ws.room = null;
      }
      return;
    }

    // ---------------- Telefon ----------------
    if (m.t === 'join') {
      const code = String(m.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return out(ws, { t: 'error', msg: 'Bu kodla bir oda bulunamadı. TV ekranındaki kodu kontrol et.' });
      const id = String(m.id || '').slice(0, 64) || makeKey();
      const name = cleanName(m.name);
      let i = room.players.findIndex((s) => s && s.id === id);
      let again = i >= 0;
      if (i < 0) i = room.players.findIndex((s) => !s);
      if (i < 0) return out(ws, { t: 'error', msg: 'Oda dolu! Bu oyunlar iki kişilik.' });
      let s = room.players[i];
      if (s) {
        clearTimeout(s.timer);
        if (s.ws && s.ws !== ws) {
          s.ws.room = null;
          out(s.ws, { t: 'kicked', reason: 'Başka bir cihazdan bağlanıldı' });
          try { s.ws.close(); } catch {}
        }
        s.ws = ws;
        s.name = name;
      } else {
        s = room.players[i] = { id, name, ws, timer: null };
      }
      ws.role = 'player';
      ws.room = room;
      ws.slot = i;
      out(ws, { t: 'joined', slot: i, code: room.code, id, name, host: !!room.host });
      if (room.ctl[i]) out(ws, { t: 'ctl', to: i, view: room.ctl[i] });
      out(room.host, { t: 'pjoin', p: i, name, again });
      return;
    }

    if (ws.role === 'player') {
      const room = ws.room;
      if (!room) return;
      if (m.t === 'leave') {
        freeSlot(room, ws.slot, 'Odadan çıktın');
        return;
      }
      // Kumanda girdileri ve WebRTC el sıkışması TV'ye aynen iletilir
      if (m.t === 'in' || m.t === 'rtc') {
        m.p = ws.slot;
        out(room.host, m);
      }
      if (m.t === 'ping') out(ws, { t: 'pong', ts: m.ts });
    }
  });

  ws.on('close', () => {
    const room = ws.room;
    if (!room) return;
    if (ws.role === 'host' && room.host === ws) {
      room.host = null;
      for (const s of room.players) if (s) out(s.ws, { t: 'hostgone' });
      room.hostTimer = setTimeout(() => closeRoom(room, 'TV bağlantısı koptu'), HOST_GRACE_MS);
    } else if (ws.role === 'player') {
      const s = room.players[ws.slot];
      if (s && s.ws === ws) {
        s.ws = null;
        out(room.host, { t: 'pleave', p: ws.slot });
        const slot = ws.slot;
        s.timer = setTimeout(() => {
          if (room.players[slot] === s && !s.ws) freeSlot(room, slot, 'zaman aşımı');
        }, PLAYER_GRACE_MS);
      }
    }
  });
});

// Ölü bağlantıları temizle
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) {
      ws.terminate();
      continue;
    }
    ws.alive = false;
    try { ws.ping(); } catch {}
  }
}, 15000);

// Port doluysa çökmek yerine anlaşılır bir mesaj ver ve (PORT verilmediyse) sıradaki portu dene
wss.on('error', () => {}); // dinleme hataları aşağıda sunucu üzerinden ele alınıyor
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    if (!FIXED_PORT && PORT < FIRST_PORT + 20) {
      console.log(`  ${PORT} portu kullanımda (KANEPE başka bir terminalde açık olabilir), ${PORT + 1} deneniyor…`);
      PORT++;
      setTimeout(() => server.listen(PORT), 150);
      return;
    }
    console.error(`\n  HATA: ${PORT} portu başka bir program tarafından kullanılıyor.`);
    console.error('  KANEPE zaten başka bir terminalde açıksa onu kapatın (Ctrl+C) ya da başka bir port seçin:');
    console.error('    PORT=3005 npm start\n');
    process.exit(1);
  }
  if (err.code === 'EACCES') {
    console.error(`\n  HATA: ${PORT} portunu açma izni yok. 1024'ten büyük bir port deneyin:  PORT=3005 npm start\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  const ips = lanAddresses();
  console.log('\n  KANEPE çalışıyor!\n');
  console.log(`  TV / bilgisayar :  http://localhost:${PORT}/tv`);
  for (const ip of ips) console.log(`  Aynı Wi-Fi'deki telefonlar :  http://${ip}:${PORT}/play`);
  if (PORT !== FIRST_PORT) console.log(`\n  Not: ${FIRST_PORT} portu dolu olduğu için ${PORT} kullanılıyor.`);
  console.log('');
});
