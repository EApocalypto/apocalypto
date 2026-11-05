# Apocalypto — Instruksi Kerja Claude Code

Bahasa: selalu Bahasa Indonesia.

## Identitas Project
- **Nama:** Apocalypto — Jurnal Trading & Berbagi
- **Domain:** `apocalypto.id` (GitHub Pages)
- **Tagline:** "Disiplin dalam trading, murah hati dalam berbagi."
- **Fokus:** Trading CFD XAUUSD (Gold), komunitas member, Expert Advisor MT5

---

## Lokasi File

| Komponen | Path |
|---|---|
| **Workspace lokal** | `C:\Masmoel\Apocalypto\` |
| **Git remote frontend** | `https://github.com/EApocalypto/apocalypto` |
| **Git remote backend** | `https://github.com/EApocalypto/backend` |
| **Database (Google Sheet)** | Google Drive akun `masmoel.trading@gmail.com` |

### Struktur Folder
```
C:\Masmoel\Apocalypto\
├── index.html          # Beranda utama
├── layanan.html        # Hub layanan member (3 kartu)
├── apocalypto.html     # Jurnal trading + grafik dinamis
├── daftar.html         # Form daftar lisensi EA
├── voucher.html        # Program TANGKAS (Rp100.000 harian)
├── profil.html         # Profil & rekening bank member
├── edukasi.html        # Artikel edukasi trading
├── youtube.html        # Channel YouTube
├── site.js             # Navigasi, OTP, sesi member, bridge API
├── style.css           # Tema navy dark & gold
├── gate.js             # Kunci DEV_LOCK (true = Segera Hadir)
├── logo.svg            # Logo SVG
├── CNAME               # apocalypto.id
├── server.py           # Server lokal Python port 8080
├── Buka_Website_Apocalypto.bat
├── Expert Advisor/
│   ├── Apocalypto.mq5  # Source code EA (bisa diedit)
│   └── Apocalypto.ex5  # Compiled (perlu MetaEditor untuk recompile)
├── Produk/             # PDF panduan instalasi & setup EA
├── Logo/               # JPG, PNG, WA Profile
└── Video/              # Presentasi PPTX
```

---

## Arsitektur Backend

### Google Apps Script (Backend Utama)
- Web App URL ada di `site.js` baris 70 (`SCRIPT_URL`)
- Kunci registrasi publik ada di `site.js` baris 71 (`REG_KEY`)
- Deploy di akun `admin@apocalypto.id` (Google Workspace)
- Script utama ada di `C:\Masmoel\Backend\_gas\Code.js` (repo backend) — push ke `main` = deploy otomatis lewat GitHub Actions
- Resume Siklus tersimpan di tab `Resume Siklus` (1 siklus = 1 baris), logikanya `buildSiklus()` di `Code.js` dan `buildCycles()` di `apocalypto.html` harus sama

### Relay Mailer
- Deploy di `masmoel.trading@gmail.com` (Gmail biasa, sementara Workspace masih restriksi)
- Kunci relay (`RELAY_KEY`) hanya ada di script deploy-nya; harus sama dengan `GMAIL_RELAY_KEY` di `Code.js`. Jangan simpan rahasia di repo ini: repo publik dan semua file di-track ikut tayang di GitHub Pages

---

## Konfigurasi Penting

### gate.js — Kunci Produksi
- `DEV_LOCK = true` → publik lihat "Segera Hadir"; `false` → website terbuka penuh
- Hash kode dev ada di `gate.js` baris 13 (`HASH`)
- Akses developer lewat `?dev=<kode>` di URL — tanya pemilik untuk kode aktualnya
- Di lokal (localhost / file://) gate otomatis terbuka tanpa kode

### site.js — Konfigurasi Utama
- **Baris 3:** WhatsApp Admin
- **Baris 5:** `var YT = "#"` — **TODO: isi URL YouTube channel resmi**
- **Baris 70:** URL backend Apps Script
- **Baris 73:** daftar halaman yang butuh login member (`GATED`)

---

## Git & Deploy

### Setup Git (sudah terkonfigurasi)
```
remote: origin = https://github.com/EApocalypto/apocalypto.git
branch: main
user.name: EApocalypto
user.email: masmoel.trading@gmail.com
credential.helper: manager (Windows Credential Manager)
```

### Alur Push ke Website
```powershell
git -C "C:\Masmoel\Apocalypto" add .
git -C "C:\Masmoel\Apocalypto" commit -m "Pesan commit"
git -C "C:\Masmoel\Apocalypto" push origin main
```
Push ke GitHub → GitHub Pages deploy otomatis dalam 1–2 menit.

### Branch
- `main` — produksi
- `tangkas` — fitur TANGKAS (merge ke main bila siap)

---

## Status Saat Ini (November 2026)

| Item | Status |
|---|---|
| DEV_LOCK | `true` — publik lihat "Segera Hadir" |
| YouTube URL | Belum diisi (site.js baris 5) |
| MQL5 link | Belum ada (menunggu akun MQL5) |
| Relay Mailer | Aktif via masmoel.trading@gmail.com |
| EA Apocalypto | Versi terbaru di `Expert Advisor/Apocalypto.mq5` |

---

## Aturan Kerja

1. **Jangan ubah `DEV_LOCK`** tanpa perintah eksplisit pemilik.
2. **Edit `.mq5`** bisa langsung, tapi `.ex5` harus recompile manual via MetaEditor (MT5).
3. Setiap perubahan halaman → commit → push → website update otomatis.
4. Branch `tangkas` ada di remote — checkout ke sana untuk pekerjaan TANGKAS.
5. Konfirmasi ke pemilik sebelum mengubah hal yang menyentuh member data atau payment.

---

## Cara Jalankan Lokal
```powershell
python C:\Masmoel\Apocalypto\server.py
# Buka http://localhost:8080
# Mode demo data otomatis aktif tanpa koneksi backend
```

---

## Kontak Resmi
- **WhatsApp Admin:** 081296855550
- **Email:** admin@apocalypto.id
- **Grup WA:** https://chat.whatsapp.com/E8rZ29XGZa6I0a1KdksMm6
