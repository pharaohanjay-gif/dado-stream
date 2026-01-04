# 🎬 WibuStream - Platform Streaming Lengkap

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://opensource.org/licenses/MIT)

> Platform streaming drama China, anime, dan baca komik terlengkap. Streaming gratis tanpa batas!

## 📋 Daftar Isi

- [Fitur](#-fitur)
- [Teknologi](#-teknologi)
- [Struktur Project](#-struktur-project)
- [Instalasi](#-instalasi)
- [Penggunaan](#-penggunaan)
- [API Endpoints](#-api-endpoints)
- [Troubleshooting](#-troubleshooting)
- [FAQ](#-faq)

---

## ✨ Fitur

### 📺 Drama China
- ✅ Drama terbaru dan trending
- ✅ VIP content unlocked
- ✅ Subtitle Indonesia
- ✅ Auto-play next episode
- ✅ Multi-server streaming

### 🎌 Anime
- ✅ Anime season terbaru
- ✅ Sub Indo berkualitas
- ✅ Multiple streaming servers
- ✅ HD quality

### 📚 Komik
- ✅ Manhwa populer
- ✅ Update cepat
- ✅ Baca online gratis
- ✅ Interface bersih

### 🎨 UI/UX
- ✅ Dark mode & Light mode
- ✅ Responsive design (Mobile, Tablet, Desktop)
- ✅ Modern glassmorphism design
- ✅ Smooth animations
- ✅ Fast loading

---

## 🛠 Teknologi

### Backend
```json
{
  "runtime": "Node.js",
  "framework": "Express.js",
  "language": "TypeScript",
  "http-client": "Axios",
  "proxy": "CORS-enabled"
}
```

### Frontend
- **HTML5** - Semantic structure
- **CSS3** - Modern styling dengan gradients
- **Vanilla JavaScript** - No framework, pure performance
- **HLS.js** - Video streaming support

### External API
- **Sansekai API** (`https://api.sansekai.my.id`)
  - DramaBox endpoints
  - Anime endpoints
  - Komik endpoints

---

## 📁 Struktur Project

```
wibu/
├── 📁 dist/                    # Compiled TypeScript
│   ├── server.js              # Compiled server
│   ├── server.d.ts            # Type definitions
│   └── source maps
│
├── 📁 public/                  # Frontend files
│   ├── index.html             # Main HTML (351 lines)
│   ├── 📁 css/
│   │   └── styles.css         # All styles (38KB)
│   └── 📁 js/
│       └── app.js             # Main app logic (52KB)
│
├── 📁 src/                     # TypeScript source
│   └── server.ts              # Express server (473 lines)
│
├── 📁 node_modules/           # Dependencies
│
├── package.json               # Project config
├── tsconfig.json              # TS compiler config
└── README.md                  # This file
```

---

## 🚀 Instalasi

### Prerequisites
- Node.js v18+ 
- npm v9+
- Windows/Linux/macOS

### Step-by-Step

1. **Clone atau extract project**
   ```bash
   cd c:\Users\mufti\Downloads\wibu\wibu
   ```

2. **Install dependencies**
   ```powershell
   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
   npm install
   ```

3. **Build TypeScript**
   ```powershell
   npm run build
   ```

4. **Start server**
   ```powershell
   npm start
   ```

5. **Buka browser**
   ```
   http://localhost:3000
   ```

---

## 📖 Penggunaan

### Development Mode
```powershell
npm run dev
```
Server akan auto-reload saat ada perubahan di `src/server.ts`.

### Production Mode
```powershell
npm run build
npm start
```

### Port Configuration
Default port: `3000`

Ubah di file `src/server.ts`:
```typescript
const PORT = process.env.PORT || 3000;
```

---

## 🔌 API Endpoints

### DramaBox Endpoints

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/dramabox/latest` | GET | Drama terbaru | ✅ |
| `/api/dramabox/trending` | GET | Drama trending | ✅ |
| `/api/dramabox/vip` | GET | Drama VIP | ✅ |
| `/api/dramabox/foryou` | GET | Rekomendasi | ✅ |
| `/api/dramabox/dubindo` | GET | Dub Indonesia | ✅ |
| `/api/dramabox/search?q=<query>` | GET | Cari drama | ✅ |
| `/api/dramabox/detail?bookId=<id>` | GET | Detail drama | ✅ |
| `/api/dramabox/allepisode?bookId=<id>` | GET | Semua episode | ✅ |

### Anime Endpoints

| Endpoint | Method | Description | Status |
|----------|--------|-------------|--------|
| `/api/anime/latest` | GET | Anime terbaru | ✅ |
| `/api/anime/search?q=<query>` | GET | Cari anime | ✅ |
| `/api/anime/detail?urlId=<id>` | GET | Detail anime | ✅ |
| `/api/anime/getvideo?chapterUrlId=<id>` | GET | Video URL | ✅ |

### Komik Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/komik/latest` | GET | Komik terbaru |
| `/api/komik/recommended` | GET | Rekomendasi |
| `/api/komik/popular` | GET | Populer |
| `/api/komik/search?q=<query>` | GET | Cari komik |
| `/api/komik/detail?manga_id=<id>` | GET | Detail komik |
| `/api/komik/chapterlist?manga_id=<id>` | GET | List chapter |
| `/api/komik/getimage?chapter_id=<id>` | GET | Images chapter |

### Proxy Endpoints

| Endpoint | Description |
|----------|-------------|
| `/api/proxy/image?url=<url>` | Image proxy (bypass CORS) |
| `/api/proxy/video?url=<url>` | Video proxy (ISP bypass) |

---

## 🛡️ Troubleshooting

### ❌ Error 500 pada API Endpoints

**Problem:** ISP blocking atau SSL certificate issues

**Solution:** Sudah ditambahkan automatic fallback bridge!

```typescript
// Retry mechanism built-in:
1. Try direct connection dengan SSL bypass
2. Jika gagal, fallback ke allorigins.win bridge
3. Return error jika semua gagal
```

### ❌ Video tidak bisa dimainkan

**Problem:** DNS/ISP blocking

**Solution:** Video sudah di-proxy melalui `/api/proxy/video`

### ❌ Image tidak muncul

**Problem:** CORS block

**Solution:** Image sudah di-proxy melalui `/api/proxy/image`

### ❌ npm command tidak bisa dijalankan

**Problem:** PowerShell execution policy

**Solution:**
```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

### ❌ Port 3000 sudah digunakan

**Solution:** Kill process yang menggunakan port:
```powershell
Get-Process | Where-Object {$_.ProcessName -eq "node"} | Stop-Process -Force
```

Atau ubah port di `src/server.ts`.

---

## 📊 Performance

- **Server Response Time:** < 2s (dengan bridge fallback)
- **Direct API:** < 500ms
- **Bridge Fallback:** < 3s
- **Video Proxy:** Support Range requests (scrubbing)
- **Image Proxy:** Cached 24 hours

---

## 🔐 Security

### SSL/TLS
```typescript
httpsAgent: new (require('https').Agent)({
    rejectUnauthorized: false  // Accept self-signed certs
})
```

### DNS Override
```typescript
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
```

### CORS
```typescript
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
```

---

## 🎯 Roadmap

- [ ] User authentication
- [ ] Watchlist/Favorites
- [ ] Download episodes
- [ ] PWA support
- [ ] Multi-language subtitle
- [ ] Comment system
- [ ] Rating system

---

## 📝 FAQ

**Q: Apakah ini legal?**  
A: Project ini hanya proxy untuk API publik Sansekai. Gunakan dengan bijak.

**Q: Kenapa beberapa video tidak bisa diputar?**  
A: Mungkin video source sedang down. Coba server lain atau refresh.

**Q: Apakah bisa di-deploy ke hosting?**  
A: Ya! Deploy ke Heroku, Railway, Vercel, atau VPS.

**Q: Bagaimana cara update content?**  
A: Content otomatis update dari Sansekai API.

**Q: Apakah mobile-friendly?**  
A: Ya! Fully responsive untuk semua device.

---

## 📄 License

MIT License - Copyright (c) 2026 WibuStream

---

## 🙏 Credits

- **API:** [Sansekai API](https://api.sansekai.my.id)
- **Fonts:** [Google Fonts - Inter](https://fonts.google.com/specimen/Inter)
- **Icons:** Emoji Unicode
- **Bridge:** [AllOrigins](https://allorigins.win)

---

## 📞 Support

Jika ada masalah atau pertanyaan:
1. Check [Troubleshooting](#-troubleshooting) section
2. Check console logs untuk error details
3. Test individual API endpoints
4. Restart server

---

**Made with ❤️ for Wibu Community**

🎬 Happy Streaming! 🍿
