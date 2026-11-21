# KANEPE 🛋️

Telefonu kumandaya çeviren, **iki kişilik** parti oyunları sitesi. AirConsole / Jackbox mantığında çalışır:

1. Büyük ekranda (TV, bilgisayar, tablet) site açılır ve bir **oda kodu** + **QR kod** gösterilir.
2. İki oyuncu telefonlarıyla QR'ı okutur (ya da adresi açıp kodu girer).
3. Telefonlar oyuna göre değişen bir kumandaya dönüşür: yön tuşları + A/B düğmeleri, sağ/sol direksiyon ya da dokunmatik saha.

Uygulama indirmek, hesap açmak gerekmiyor.

## Hızlı başlangıç

```bash
npm install
npm start
```

- TV / bilgisayarda: <http://localhost:3000/tv>
- Telefonlar **aynı Wi-Fi ağında** olmalı. Ekrandaki QR kodu okutmak yeterli; sunucu açılırken konsola telefonların gireceği adresi de yazar (ör. `http://192.168.1.20:3000/play`).

Telefon olmadan denemek için lobide boş oyuncu yerindeki **⌨ Klavye** düğmesine basın:

| | Yön | A | B |
|---|---|---|---|
| 1. oyuncu | `W A S D` | `F` | `G` |
| 2. oyuncu | `↑ ← ↓ →` | `K` | `L` |

`Esc` oyunu duraklatır, tanıtım ekranında `Enter` oyunu hemen başlatır.

## Oyunlar

Hepsi iki kişilik. Klasiklerden ilham alındı ama oyunların isimleri, görselleri ve kuralları özgün.

| Oyun | Tür | Mod | Kısaca |
|---|---|---|---|
| 🧱 **Blok Düellosu** | Düşen bloklar | Kafa kafaya | Satır tamamla; 2+ satır silince rakibe çöp satır gider. 3 rauntta 2 alan kazanır. |
| 💊 **Kapsül Kapışması** | Renk eşleştirme | Kafa kafaya | Kapsüllerle aynı renkten 4'lü yapıp mikropları temizle. Kombolar rakibe kapsül yağdırır. |
| 💣 **Bomba Arenası** | Labirent savaşı | Kafa kafaya | Bomba bırak, kutuları patlat, güçlen. Süre bitince arena daralır. |
| 🛡️ **Tank Taburu** | Birlikte savunma | **Takım** | Kristal üssü birlikte koruyun, 3 bölüm boyunca düşman tank dalgalarını durdurun. |
| 🚀 **Yıldız Nöbeti** | Uzay savaşı | **Takım** | 3 uzaylı dalgası + dev ana gemi. Düşen arkadaşı kalp toplayarak geri getirin. |
| 🏒 **Neon Hokey** | Masa hokeyi (spor) | Kafa kafaya | Telefon ekranı senin yarı sahan; parmağını sürükle, ilk 7 golü at. |
| 🏎️ **Turbo Pist** | Araba yarışı | Kafa kafaya | Tepeden bakışlı 3 turluk yarış; turbo pedleri, kayma, çarpışma. |
| ⚡ **Işık İzi** | Neon yılan düellosu | Kafa kafaya | Arkanda kalıcı iz bırak, rakibini sıkıştır; turboyla hızlan. |

## İnternette yayınlama

Sunucu WebSocket kullandığı için sürekli çalışan bir Node.js ortamı gerekir (Render, Railway, Fly.io, bir VPS vb.). Statik barındırma (GitHub Pages, Netlify) **yetmez**.

- Başlatma komutu: `npm start`
- Port: `PORT` ortam değişkeninden okunur (varsayılan 3000).
- HTTPS altında WebSocket otomatik olarak `wss://` kullanır.

İnternette yayınlandığında telefonların aynı ağda olması gerekmez; TV ekranındaki adres ve QR, sitenin kendi adresini gösterir.

## Nasıl çalışıyor?

```
Telefon (kumanda) ──WebSocket──▶ server.js (oda + aktarım) ──WebSocket──▶ TV (oyun motoru)
          ◀──────── kumanda düzeni, titreşim, bilgi ─────────────────────────┘
```

- **`server.js`** — statik dosyaları sunar, 4 harfli oda kodları üretir, telefonları odadaki iki yere yerleştirir ve mesajları TV ile telefonlar arasında taşır. Telefon ya da TV yenilense bile oda 90 saniye korunur, oyuncular kaldığı yere döner.
- **`public/host.html` + `js/host/`** — TV tarafı: lobi, oyun tanıtımı, hazır olma, geri sayım, duraklatma, sonuç ekranı, oturum skor tablosu ve 60 FPS oyun döngüsü. Sesler WebAudio ile anında üretilir (ses dosyası yok).
- **`public/play.html` + `js/play.js`** — telefon kumandası. Çoklu dokunma, kaydırarak yön değiştirme, titreşim, ekranın kapanmasını engelleme ve otomatik yeniden bağlanma içerir.
- **`public/js/games/`** — her oyun tek bir dosya.

### Kumanda düzenleri

Oyun, telefona hangi kumandanın çıkacağını kendisi söyler:

| `layout` | Görünüm | Kullanan |
|---|---|---|
| `dpad` + `dirs: 4` | Artı şeklinde yön tuşları + A/B | Blok, Kapsül, Bomba, Tank, Işık İzi |
| `dpad` + `dirs: 8` | Çapraz destekli yön tuşları | Yıldız Nöbeti |
| `dpad` + `dirs: 'lr'` | Büyük sol/sağ düğmeleri | Turbo Pist |
| `stick` | Analog çubuk | (yeni oyunlar için hazır) |
| `touch` | Tam ekran dokunmatik saha | Neon Hokey |

### Yeni oyun eklemek

`public/js/games/` içine bir dosya ekleyip `index.js` listesine yazmak yeterli:

```js
export default {
  id: 'benimoyun',
  name: 'Benim Oyunum',
  icon: '🎯',
  tag: 'Kısa tür açıklaması',
  mode: 'versus', // ya da 'coop'
  color: '#ff9a3d',
  desc: 'Tanıtım ekranındaki açıklama',
  howto: ['◀ ▶ hareket', 'A: zıpla'],
  controller: { layout: 'dpad', dirs: 4, a: 'ZIPLA', b: null },
  create(api) {
    return {
      update(dt) {},          // saniyede 60 kez
      draw(g) {},             // 1280x720 sanal tuvale çiz
      onKey(p, key, down) {}, // p: 0/1, key: up/down/left/right/a/b
    };
  },
};
```

`api` içinde: `players` (isim, renk), `input[p]` (anlık tuş / çubuk / dokunma durumu), `axis(p)`, `sfx(ad)`, `buzz(p, ms)` (telefonu titret), `info(p, yazı)` (telefondaki başlık), `end({ winner })` ya da `end({ coop: true, win })`.
