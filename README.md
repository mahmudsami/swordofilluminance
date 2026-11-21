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
- Telefonun üst çubuğunda ve TV lobisinde her oyuncunun bağlantı türü ile **kumanda → TV** gecikmesi görünür. TV her yanıtta mesajı kendi saatiyle ne zaman aldığını da bildirir; telefon iki saatin farkını en hızlı ölçümden bulup iki yönü ayrı hesaplar. Telefondaki rozete dokununca ayrıntılar açılır: kumanda → TV, TV → telefon, gidiş-dönüş, bağlantı türü ve TV'nin kare süresi. Telefonun Wi‑Fi uykusu çoğunlukla yalnız TV → telefon yönünü geciktirir (titreşim gecikir, kumanda etkilenmez).
- **Wi‑Fi uykusu:** Telefonlar birkaç yüz ms trafik görmeyince Wi‑Fi radyosunu uyutur; bu sırada TV'den gelen paketler 100–300 ms bekletilir. Bu yüzden kumanda 50 ms'de bir (menülerde 100 ms'de bir) küçük bir durum mesajı gönderir, TV de hemen yanıtlar. Hem bağlantı uyanık kalır hem takılı kalan tuşlar düzelir hem de gecikme sürekli ölçülür.
- Doğrudan kanal sırasız çalışır: kaybolan bir paket arkasındaki girdileri bekletmez; TV eski / sırası karışmış girdileri sıra numarasından tanıyıp atar.
- Bazı modemler cihazlar arası çok yayını (mDNS) engeller ve tarayıcılar yerel IP'yi gizlediği için doğrudan bağlantı kurulamaz. Sunucu TV ile aynı bilgisayardaysa TV, gerçek yerel IP adreslerini de telefona bildirir; böylece bu ağlarda da ⚡ bağlantı kurulur.
- Kısa bağlantı kopmalarında (2,5 sn'den kısa) oyun durmaz.
- Gecikme hâlâ yüksekse: telefon ve bilgisayar aynı Wi‑Fi'de mi (misafir ağı değil), mümkünse 5 GHz ağ kullanın; telefonda pil tasarrufu modunu kapatın. Televizyonda **Oyun Modu**'nu açın: kapalıyken televizyonlar görüntüye 50–150 ms ekleyebilir (bu gecikme telefondaki sayıya yansımaz ama hissedilir).
- Çizim motoru sabit görüntüleri önbelleğe alır; kare başına çizim süresi 1080p'de oyun başına 1–4 ms civarındadır. Ekran kare kaçırmaya başlarsa çözünürlük yaklaşık bir saniye içinde kendiliğinden, gerekirse birkaç kademe düşürülür; yavaş çizen bir TV'de tuşlar da kare bitene kadar beklediği için bu, kumanda gecikmesini doğrudan azaltır. Skor ve puan yazıları önbellekten çizilir, aynı anda çalan ses sayısı sınırlıdır. Zayıf TV tarayıcıları için lobide **⚡ Performans modu** düğmesi vardır.

## Oyunlar

21 oyun, hepsi iki kişilik. Klasiklerden ve türlerden ilham alındı ama oyunların isimleri, görselleri ve kuralları özgün.

| Oyun | Tür | Mod | Kumanda | Kısaca |
|---|---|---|---|---|
| 🧗 **Çifte Macera** | Ortak platform bulmacası | **Takım** | Sol/sağ + zıpla/kullan | 6 bölümlük macera: birbirinizin kafasına çıkın, kasaları itin, plakalarla kapı açın, asansör çağırın, renkli alanlardan geçin, lazerleri atlatın, zamanlı düğmelere aynı anda basın. |
| 🛡️ **Tank Taburu** | Birlikte savunma | **Takım** | Yön + ateş | Kristal üssü birlikte koruyun; 3 bölüm boyunca düşman tank dalgaları. |
| 🚀 **Yıldız Nöbeti** | Uzay savaşı | **Takım** | 8 yön + ateş/süper | 3 uzaylı dalgası + dev ana gemi; düşen arkadaşı kalp toplayarak geri getirin. |
| 💥 **Tuğla Kırıcı** | Tuğla kırma | **Takım** | Dokunmatik kaydırma | İki raket, ortak canlar, güçlendirmeler; 3 bölüm. |
| 💎 **Hazine Labirenti** | Labirent kaçışı | **Takım** | Yön | Mücevherleri toplayın, robotlara yakalanırsanız donarsınız; arkadaşınız dokunup kurtarır. |
| ⚽ **Kafa Topu** | Futbol | Kafa kafaya | Sol/sağ + zıpla/şut | Koca kafalı yandan futbol; 90 saniye, berabere biterse altın gol. |
| 🏐 **Plaj Voleybolu** | Voleybol | Kafa kafaya | Sol/sağ + zıpla | Topu rakibin sahasına düşür; 7 sayı, 2 fark. |
| 🥅 **Penaltı Atışları** | Gizli seçim | Kafa kafaya | Seçim ızgarası | Telefonda gizlice köşe seç: atıcı ve kaleci zihin oyunu. |
| 🏒 **Neon Hokey** | Masa hokeyi | Kafa kafaya | Dokunmatik saha | Telefon ekranı senin yarı sahan; ilk 7 gol. |
| 🏎️ **Turbo Pist** | Araba yarışı | Kafa kafaya | Direksiyon + gaz/fren | Tepeden bakışlı 3 turluk yarış, turbo pedleri. |
| 🌀 **Portal Pinball** | Pinball düellosu | Kafa kafaya | Sol / sağ palet | Yan yana iki masa portallarla bağlı. Tampon, şerit ve hedeflerden puanlar kasada birikir; rakibin deliğine top düşünce kasa × çarpan skora geçer. Kalkan, çarpan ve saldırı topu ekstraları. |
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

### Çifte Macera hakkında

- Her bölüm tek ekrandır ve ancak iki oyuncu birlikte çalışınca geçilir; ikiniz de çıkış kapısına girince bölüm biter.
- Bölümler: **İlk Adımlar** (kafaya çıkma, plaka), **Renkli Kapılar** (renkli alanlar, köprü, şalter), **Kasa Ustası** (kasa basamağı, iki plakalı kapı), **Asansör** (hareketli platformlar, karşılıklı çağrılan asansörler), **Lazer Labirenti** (lazer + kasa gölgesi, kısa süreli düğmeler), **Son Kule** (ağır plaka, renkli alanlar, iki düğmeyi aynı anda basma).
- Açılan bölümler ve en iyi süre / elmas sayısı o TV'nin tarayıcısında saklanır; oyun açılınca bölüm seçilebilir.
- Takılırsanız **B'yi basılı tutun**: bölüm baştan başlar.
- Bölümler `public/js/games/platformer-levels.js` içinde metin haritalardır; yeni bölüm eklemek için bir harita ve nesne tablosu yazmak yeterli (dosyanın başında açıklama var).

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
| `dpad` + `dirs: 'lr'` | Büyük sol/sağ düğmeleri | Çifte Macera, Turbo Pist, Kafa Topu, Dörtle |
| `stick` | Analog çubuk | Sumo Halkası |
| `touch` | Tam ekran dokunmatik saha (x, y) | Neon Hokey, Tuğla Kırıcı |
| `ab` | Sadece iki büyük A / B düğmesi | Halat Çekme, Portal Pinball |
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

Basılıp hemen bırakılan çok kısa dokunuşlar iki kare arasında kalabilir; zıplama, ateş gibi tek seferlik eylemleri `input` durumundan değil `onKey` ile yakalayın.

Performans için sabit görüntüleri `Layer` (bir kez çizilen katman) ve `sprite` (önbellekli küçük görüntü) ile çizin; her karede `shadowBlur` kullanmaktan kaçının (yerine `glow()` hazır ışıma görüntüsü var).
