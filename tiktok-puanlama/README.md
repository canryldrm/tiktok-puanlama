# 🎬 TikTok Live Fotoğraf Puanlama Overlay'i

TikTok canlı yayınlarında izleyicilerin fotoğraflara yorum ile puan vermesini sağlayan interaktif overlay sistemi.

## ✨ Özellikler

- **Yorum ile Puanlama**: İzleyiciler 1-10 arası sayı yazarak puan verir
- **Anlık Ortalama**: Tüm oyların ortalaması canlı olarak gösterilir
- **Racon Sistemi**: "Şapka & Bıyık" hediyesi gönderenler otomatik 10 puan alır (ortalamaya dahil değil)
- **Racon Kralı**: En çok jeton atan kişi özel banner'da gösterilir
- **30 Saniye Geri Sayım**: Her oylama turu 30 saniye sürer
- **Sıra Sistemi**: Birden fazla katılımcı/fotoğraf için kuyruk yönetimi
- **Şeffaf Arka Plan**: OBS Browser Source olarak doğrudan kullanılabilir
- **Kontrol Paneli**: Yayıncı için kolay yönetim arayüzü

## 🚀 Kurulum

### Gereksinimler
- [Node.js](https://nodejs.org/) (v16 veya üzeri)
- [OBS Studio](https://obsproject.com/)

### Adımlar

1. **Bağımlılıkları kur:**
   ```bash
   cd tiktok-rating-overlay
   npm install
   ```

2. **Sunucuyu başlat:**
   ```bash
   npm start
   ```
   Sunucu `http://localhost:3000` adresinde çalışacak.

## 🎮 Kullanım

### 1. Kontrol Panelini Aç
Tarayıcıda aç: **http://localhost:3000/panel.html**

### 2. TikTok'a Bağlan
- Kontrol panelinde TikTok kullanıcı adını gir (ör: `@kullaniciadi`)
- "Bağlan" butonuna bas
- Yeşil nokta = bağlantı başarılı ✅

### 3. OBS'ye Overlay Ekle
1. OBS'de **Kaynaklar** → **+** → **Tarayıcı (Browser Source)**
2. URL: `http://localhost:3000/overlay.html`
3. Genişlik: `1920`, Yükseklik: `1080` (veya yayın çözünürlüğün)
4. ✅ **"Sayfa artık görünür olmadığında kaynağı kapat"** seçeneğini kapat
5. Tamam

### 4. Oylama Başlat
- Kontrol panelinden **"Oylamayı Başlat"** butonuna bas
- 30 saniyelik geri sayım başlar
- İzleyiciler yoruma **1-10 arası sayı** yazarak puan verir

### 5. Sıra Sistemi
- Kontrol panelinden **"Sıra Yönetimi"** bölümünde isim ekle
- **"Sıradakine Geç"** butonu ile sıradaki kişiye geç (otomatik oylama başlar)

## 🎩 Racon Sistemi

- İzleyiciler "Şapka & Bıyık" hediyesi gönderdiğinde **otomatik 10 puan** alır
- Bu puanlar **ortalamaya dahil edilmez**, ayrı gösterilir
- En çok jeton atan kişi **"Racon Kralı"** olur ve üstte altın banner'da gösterilir
- Racon hediye adını kontrol panelinden değiştirebilirsin

## 🖥️ Ekranlar

| Sayfa | URL | Açıklama |
|-------|-----|----------|
| Overlay | `http://localhost:3000/overlay.html` | OBS Browser Source |
| Kontrol Paneli | `http://localhost:3000/panel.html` | Yayıncı yönetim paneli |

## 📁 Dosya Yapısı

```
tiktok-rating-overlay/
├── package.json          # Proje bağımlılıkları
├── server.js             # Node.js backend
├── public/
│   ├── overlay.html      # OBS overlay
│   ├── overlay.css       # Overlay stilleri
│   ├── overlay.js        # Overlay logic
│   ├── panel.html        # Kontrol paneli
│   ├── panel.css         # Panel stilleri
│   └── panel.js          # Panel logic
└── README.md
```

## ⚠️ Notlar

- `tiktok-live-connector` resmi olmayan bir kütüphanedir
- TikTok güncellemeleri sonrası çalışmayı durdurabilir
- Canlı yayın aktif olmalıdır ki bağlantı kurulabilsin
- Her kullanıcı sadece 1 oy verebilir (son oyu geçerli sayılır)
