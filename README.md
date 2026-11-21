# KANEPE 🛋️

Telefonu kumandaya çeviren, **iki kişilik** parti oyunları sitesi. AirConsole / Jackbox mantığında çalışır:

1. Büyük ekranda (TV, bilgisayar, tablet) site açılır ve bir **oda kodu** + **QR kod** gösterilir.
2. İki oyuncu telefonlarıyla QR'ı okutur (ya da adresi açıp kodu girer).
3. Telefonlar oyuna göre değişen bir kumandaya dönüşür: yön tuşları + A/B, sağ/sol direksiyon, analog çubuk, dokunmatik saha ya da gizli seçim ekranı.

Uygulama indirmek, hesap açmak gerekmiyor.

## Hızlı başlangıç

```bash
npm install
npm start
```

- TV / bilgisayarda: <http://localhost:3000/tv>
- Telefonlar **aynı Wi-Fi ağında** olmalı. Ekrandaki QR kodu okutmak yeterli; sunucu açılırken konsola telefonların gireceği adresi de yazar (ör. `http://192.168.1.20:3000/play`).

Node.js 14 ve üzeri yeterli. 3000 portu doluysa (örneğin KANEPE başka bir terminalde zaten açıksa) sunucu otomatik olarak 3001, 3002… portlarını dener ve kullandığı adresi konsola yazar. Belirli bir port için: `PORT=3005 npm start`.

Telefon olmadan denemek için lobide boş oyuncu yerindeki **⌨ Klavye** düğmesine basın:

| | Yön | A | B |
|---|---|---|---|
| 1. oyuncu | `W A S D` | `F` | `G` |
| 2. oyuncu | `↑ ← ↓ →` | `K` | `L` |

`Esc` oyunu duraklatır, tanıtım ekranında `Enter` oyunu hemen başlatır.

## Gecikme ve performans

- **Doğrudan bağlantı (⚡):** Telefon, TV ile aynı ağdaysa girdiler sunucuya uğramadan WebRTC veri kanalıyla doğrudan TV'ye gider. Sunucu internette (uzakta) olsa bile tuş gecikmesi yerel ağ hızındadır.
- **Sunucu üzerinden (☁):** Doğrudan bağlantı kurulamazsa (farklı ağlar, WebRTC desteklemeyen tarayıcı) otomatik olarak WebSocket yoluna geçilir.
- Telefonun üst çubuğunda ve TV lobisinde her oyuncunun bağlantı türü ile gecikmesi (ms) görünür.
- Telefon kumandası açıkken saniyede birkaç küçük durum mesajı gönderir: hem takılı kalan tuşları düzeltir hem de telefonun Wi‑Fi'sinin uykuya geçip gecikme eklemesini önler.
- Kısa bağlantı kopmalarında (2,5 sn'den kısa) oyun durmaz.
- Çizim motoru sabit görüntüleri önbelleğe alır; kare başına çizim süresi 1080p'de oyun başına 1–4 ms civarındadır. Ekran kare kaçırmaya başlarsa çözünürlük kendiliğinden düşürülür. Zayıf TV tarayıcıları için lobide **⚡ Performans modu** düğmesi vardır.

## Oyunlar

19 oyun, hepsi iki kişilik. Klasiklerden ve türlerden ilham alındı ama oyunların isimleri, görselleri ve kuralları özgün.

| Oyun | Tür | Mod | Kumanda | Kısaca |
|---|---|---|---|---|
| 🛡️ **Tank Taburu** | Birlikte savunma | **Takım** | Yön + ateş | Kristal üssü birlikte koruyun; 3 bölüm boyunca düşman tank dalgaları. |
| 🚀 **Yıldız Nöbeti** | Uzay savaşı | **Takım** | 8 yön + ateş/süper | 3 uzaylı dalgası + dev ana gemi; düşen arkadaşı kalp toplayarak geri getirin. |
| 💥 **Tuğla Kırıcı** | Tuğla kırma | **Takım** | Dokunmatik kaydırma | İki raket, ortak canlar, güçlendirmeler; 3 bölüm. |
| 💎 **Hazine Labirenti** | Labirent kaçışı | **Takım** | Yön | Mücevherleri toplayın, robotlara yakalanırsanız donarsınız; arkadaşınız dokunup kurtarır. |
| ⚽ **Kafa Topu** | Futbol | Kafa kafaya | Sol/sağ + zıpla/şut | Koca kafalı yandan futbol; 90 saniye, berabere biterse altın gol. |
| 🏐 **Plaj Voleybolu** | Voleybol | Kafa kafaya | Sol/sağ + zıpla | Topu rakibin sahasına düşür; 7 sayı, 2 fark. |
| 🥅 **Penaltı Atışları** | Gizli seçim | Kafa kafaya | Seçim ızgarası | Telefonda gizlice köşe seç: atıcı ve kaleci zihin oyunu. |
| 🏒 **Neon Hokey** | Masa hokeyi | Kafa kafaya | Dokunmatik saha | Telefon ekranı senin yarı sahan; ilk 7 gol. |
| 🏎️ **Turbo Pist** | Araba yarışı | Kafa kafaya | Direksiyon + gaz/fren | Tepeden bakışlı 3 turluk yarış, turbo pedleri. |
| 💣 **Bomba Arenası** | Labirent savaşı | Kafa kafaya | Yön + bomba | Kutuları patlat, güçlen; süre bitince arena daralır. |
| ⚡ **Işık İzi** | Neon yılan | Kafa kafaya | Yön + turbo | Arkanda kalıcı iz bırak, rakibini sıkıştır. |
| 🥋 **Sumo Halkası** | İtişme | Kafa kafaya | Analog çubuk + hamle | Rakibi daralan halkanın dışına it. |
| 🛸 **Uzay Düellosu** | It dalaşı | Kafa kafaya | Dön + motor/ateş | Yıldızın çekim alanında kıvrılan mermilerle düello. |
| 🎯 **Topçu Düellosu** | Sıra tabanlı atış | Kafa kafaya | Açı/güç + ateş | Rüzgâr, kırılabilir arazi, sırayla atış. |
| 🚗 **Karşıya Geç** | Yol/nehir yarışı | Kafa kafaya | Yön (zıpla) | Trafiği ve nehri geç; 5 sayıya ilk ulaşan kazanır. |
| 💪 **Halat Çekme** | Parmak yarışı | Kafa kafaya | Büyük A / B | A‑B‑A‑B ritmiyle en hızlı basan halatı çeker. |
| 🧱 **Blok Düellosu** | Düşen bloklar | Kafa kafaya | Yön + döndür/bırak | Satır tamamla, rakibe çöp satır gönder. |
| 💊 **Kapsül Kapışması** | Renk eşleştirme | Kafa kafaya | Yön + döndür | Aynı renkten 4'lü yapıp mikropları ilk temizleyen kazanır. |
| 🔴 **Dörtle** | Masa oyunu | Kafa kafaya | Sol/sağ + bırak | Sırayla taş bırak, 4'lü bağlayan kazanır. |

## İnternette yayınlama

Sunucu WebSocket kullandığı için sürekli çalışan bir Node.js ortamı gerekir (Render, Railway, Fly.io, bir VPS vb.). Statik barındırma (GitHub Pages, Netlify) **yetmez**.

- Başlatma komutu: `npm start`
- Port: `PORT` ortam değişkeninden okunur (varsayılan 3000).
- HTTPS altında WebSocket otomatik olarak `wss://` kullanır.
- Telefonlar TV ile aynı Wi‑Fi'deyse WebRTC ile doğrudan bağlanır; sunucunun uzak olması oyun gecikmesini etkilemez. Bağlantı kurulumu için Google'ın herkese açık STUN sunucusu kullanılır.

## Nasıl çalışıyor?

```
Telefon ──(WebSocket: katılma, el sıkışma, menüler)──▶ server.js ──▶ TV
Telefon ════(WebRTC veri kanalı: kumanda girdileri, titreşim)════════▶ TV
```

- **`server.js`** — statik dosyaları sunar, 4 harfli oda kodları üretir, telefonları odadaki iki yere yerleştirir, WebRTC el sıkışmasını ve (doğrudan bağlantı yoksa) mesajları TV ile telefonlar arasında taşır. Telefon ya da TV yenilense bile oda 90 saniye korunur, oyuncular kaldığı yere döner.
- **`public/host.html` + `js/host/`** — TV tarafı: lobi ve kategori filtreleri, oyun tanıtımı, hazır olma, geri sayım, duraklatma, sonuç ekranı, oturum skor tablosu, uyarlanabilir kaliteli oyun döngüsü. Sesler WebAudio ile anında üretilir (ses dosyası yok).
- **`public/play.html` + `js/play.js`** — telefon kumandası: çoklu dokunma, kaydırarak yön değiştirme, sıralı (eskiyi atan) girdi mesajları, gecikme ölçümü, titreşim, ekranın kapanmasını engelleme ve otomatik yeniden bağlanma.
- **`public/js/games/`** — her oyun tek bir dosya; `index.js` oyun listesi ve kategoriler.

### Kumanda düzenleri

Oyun, telefona hangi kumandanın çıkacağını kendisi söyler (`controller`), oyun sırasında da `api.setPad()` ile oyuncu başına değiştirebilir:

| `layout` | Görünüm | Örnek |
|---|---|---|
| `dpad` + `dirs: 4` | Artı şeklinde yön tuşları + A/B | Blok, Bomba, Tank, Labirent |
| `dpad` + `dirs: 8` | Çapraz destekli yön tuşları | Yıldız Nöbeti |
| `dpad` + `dirs: 'lr'` | Büyük sol/sağ düğmeleri | Turbo Pist, Kafa Topu, Dörtle |
| `stick` | Analog çubuk | Sumo Halkası |
| `touch` | Tam ekran dokunmatik saha (x, y) | Neon Hokey, Tuğla Kırıcı |
| `ab` | Sadece iki büyük A / B düğmesi | Halat Çekme |
| `choice` | Gizli seçim ızgarası (`options`, `cols`) | Penaltı Atışları |
| `wait` | Bekleme mesajı (sıra rakipteyken) | Dörtle, Topçu Düellosu |

### Yeni oyun eklemek

`public/js/games/` içine bir dosya ekleyip `index.js` listesine yazmak yeterli:

```js
import { W, H, PCOL, text, Layer, sprite } from '../host/gfx.js';

export default {
  id: 'benimoyun',
  name: 'Benim Oyunum',
  icon: '🎯',
  tag: 'Kısa tür açıklaması',
  mode: 'versus', // ya da 'coop'
  cat: 'aksiyon', // takim | spor | aksiyon | bulmaca
  color: '#ff9a3d',
  desc: 'Tanıtım ekranındaki açıklama',
  howto: ['◀ ▶ hareket', 'A: zıpla'],
  controller: { layout: 'dpad', dirs: 4, a: 'ZIPLA', b: null },
  create(api) {
    return {
      update(dt) {},          // her karede, saniye cinsinden dt ile
      draw(g) {},             // 1280x720 sanal tuvalin tamamını çiz
      onKey(p, key, down) {}, // p: 0/1, key: up/down/left/right/a/b
      onChoose(p, id) {},     // 'choice' kumandasında seçim yapıldığında
    };
  },
};
```

`api` içinde: `players` (isim, renk), `input[p]` (anlık tuş / çubuk / dokunma durumu), `axis(p)`, `sfx(ad)`, `buzz(p, ms)` (telefonu titret), `info(p, yazı)` (telefondaki başlık), `setPad(p, düzen)`, `end({ winner })` ya da `end({ coop: true, win })`.

Performans için sabit görüntüleri `Layer` (bir kez çizilen katman) ve `sprite` (önbellekli küçük görüntü) ile çizin; her karede `shadowBlur` kullanmaktan kaçının (yerine `glow()` hazır ışıma görüntüsü var).
