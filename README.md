# Apocalypto - Jurnal Trading & Berbagi

Website resmi ekosistem **Apocalypto** (`apocalypto.id`).

> *"Disiplin dalam trading, murah hati dalam berbagi."*

---

## 📁 Arsitektur Penyimpanan & Pemisahan File

Sesuai instruksi konfigurasi:
1. **Google Drive Cloud (`H:\My Drive\Apocalypto`)**:
   - Dikhususkan untuk **Penyimpanan Database & Backend Cloud**:
     - `Apocalypto Database.gsheet` (Database utama Google Sheet)
     - `Relay Mailer (deploy di akun Gmail masmoel.trading).gs.txt` (Skrip relay pengirim email otomatis)
     - `Backup-codes-admin.txt` (Kode cadangan akun admin)
     - Terhubung dengan Web App URL:
       `https://script.google.com/macros/s/AKfycbwVpdxUgIbZKfqbpO6pv--hPbI0sfa0-y5go0kAiv_pRHAiLxhUkiIsYHY61roVuLtw/exec`

2. **Lokal Workspace (`C:\Masmoel\Apocalypto\`)**:
   - Digunakan untuk **Seluruh File Kerja Pengembangan Operasional**:
     - **Halaman Website Resmi**:
       - `index.html`: Beranda utama (*Jurnal Trading & Berbagi*)
       - `layanan.html`: Pusat layanan member (Akun Apocalypto, TANGKAS, Expert Advisor)
       - `apocalypto.html`: Pemantauan riwayat transaksi dan rekap trading harian/mingguan/bulanan
       - `daftar.html`: Formulir pendaftaran lisensi EA MetaTrader 5
       - `voucher.html`: Program hadiah harian TANGKAS (Rp100.000)
       - `profil.html`: Profil member dan pengaturan rekening bank
       - `edukasi.html`: Artikel & panduan belajar trading
       - `youtube.html`: Channel video resmi
       - `site.js`: Navigasi bersama, sistem OTP email, sesi member, dan jembatan API database
       - `style.css`: Tampilan desain bertema navy dark & gold
       - `gate.js`: Kunci pengaman masa rilis (otomatis aktif di domain publik, otomatis terbuka di lokal)
       - `logo.svg` & `CNAME`: Aset branding dan domain `apocalypto.id`
     - **File Produk & Expert Advisor**:
       - `Expert Advisor/`: `Apocalypto.mq5` (Source code) & `Apocalypto.ex5` (Compiled EA MT5)
       - `Produk/`: `Panduan Instalasi EA ke MT5.pdf` & `Panduan Setup EA Apocalypto.pdf`
       - `Video/`: `video 1/presentasi basic trading.pptx`
       - `Logo/`: Format logo lengkap JPG, PNG, WA Profile

---

## 🚀 Cara Menjalankan & Menguji Website di Lokal

1. **Klik Langsung**:
   - Buka folder `C:\Masmoel\Apocalypto\` di File Explorer.
   - Klik ganda file **`Buka_Website_Apocalypto.bat`** atau **`index.html`**.
   - Website akan terbuka langsung di browser default Anda.
2. **Server Lokal Python**:
   - Jalankan terminal dan ketik:
     ```powershell
     python c:\Masmoel\Apocalypto\server.py
     ```
   - Buka `http://localhost:8080` di browser Anda.

---

## 📞 Kontak Resmi
- **WhatsApp Admin**: 081296855550 (`https://wa.me/6281296855550`)
- **Grup Komunitas WhatsApp**: `https://chat.whatsapp.com/E8rZ29XGZa6I0a1KdksMm6`
- **Email Resmi**: `admin@apocalypto.id`
