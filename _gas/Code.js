/*  ================================================================
    SUMBER UTAMA backend Apocalypto (Google Apps Script).
    File ini di-deploy OTOMATIS oleh GitHub Actions (.github/workflows/deploy-apps-script.yml)
    setiap ada perubahan di folder _gas/ pada branch main.
    Nilai rahasia ditulis sebagai __GAS_...__ dan diisi dari GitHub Secret GAS_SECRETS saat deploy.
    JANGAN menulis kunci asli di file ini (repo ini publik).
    ================================================================ */
/*  ================================================================
    APOCALYPTO — SCRIPT GABUNGAN (LISENSI + PENDAFTARAN)
    ----------------------------------------------------------------
    Dipasang di spreadsheet "Database Member" (tab "Member").
    Menggantikan script lisensi yang lama.

    Fungsi:
    - doGet     : dipanggil EA untuk cek lisensi  -> "STATUS|EXPIRED"
    - doPost    : dipanggil form pendaftaran       -> tambah baris member (Inactive/PENDING)
    - onEdit    : saat admin ubah Status jadi Active, kolom Expired terisi OTOMATIS
                  = tanggal aktivasi + masa berlaku (dari kolom "Masa Berlaku Lisensi")
    - setupSheet: JALANKAN SEKALI dari editor (pilih fungsi "setupSheet" -> Run) untuk:
                  (a) menghapus kolom "Broker",
                  (b) menata header sesuai form,
                  (c) memasang rumus "Sisa Waktu" otomatis,
                  (d) memberi warna KUNING saat sisa waktu <= 3 hari.

    CARA PASANG (ringkas):
    1. Buka "Database Member" -> Extensions -> Apps Script.
    2. Hapus SEMUA kode lama, tempel seluruh isi file ini, Save.
    3. Pilih fungsi "setupSheet" di atas -> klik Run (izinkan akses bila diminta).
    4. Deploy -> Manage deployments -> pensil -> Version: New version -> Deploy.
       (URL Web App tetap sama, EA tidak perlu diubah.)
    ================================================================ */

var SHEET_NAME = 'Member';

// ====== KONFIGURASI EMAIL & FILE PRODUK (ISI BAGIAN INI) ======
var ADMIN_EMAIL      = 'admin@apocalypto.id';                   // email admin utk notifikasi pendaftar baru (internal = tidak kena restriksi akun baru)
var PRODUCT_FOLDER_ID = '1gHAMknQTbpb8A7r8qZp01MWIVpIHuL0H';    // ID folder "Produk" di Drive apocalypto.id (isi: .ex5 + panduan)
var WA_GROUP_URL     = 'https://chat.whatsapp.com/E8rZ29XGZa6I0a1KdksMm6';
var ADMIN_WA_URL     = 'https://wa.me/6281296855550';           // chat langsung admin (utk rehabilitasi ID, dll)
var SHEET_URL        = 'https://docs.google.com/spreadsheets/d/1AQN77zgSE8h1h9QWaHJ38GrIWXVnakUM343JL516Syg/edit';

// ====== KONFIGURASI PENAGIHAN / INVOICE ======
var DEPLOY_URL   = 'https://script.google.com/macros/s/AKfycbwVpdxUgIbZKfqbpO6pv--hPbI0sfa0-y5go0kAiv_pRHAiLxhUkiIsYHY61roVuLtw/exec'; // URL Web App (utk link "Tandai Lunas")
var ADMIN_KEY    = '__GAS_ADMIN_KEY__';        // kunci internal (dipakai link "Tandai Lunas" di email admin).
var API_KEY      = '__GAS_API_KEY__';   // KUNCI RAHASIA: wajib dikirim EA (profit) & form (daftar). Samakan persis di EA (API_KEY) & form (API_KEY).
// ====== SITUS RESMI apocalypto.id ======
// Kunci PUBLIK khusus situs (boleh terlihat di kode situs). Hanya bisa dipakai untuk
// registrasi member & pendaftaran EA — TIDAK bisa dipakai untuk laporan profit EA.
var REG_KEY      = 'APOX-WEB-xBd7W3Yp-aQFm5xuA';
var WEB_MEMBER_SHEET = 'Registrasi Web';      // tab pencatatan registrasi member dari situs (nama, email, WA)
var TANGKAS_SHEET    = 'TANGKAS';             // tab entri harian TANGKAS (Tanggal & Kasih Surprise)
var TANGKAS_OPEN_H   = 20;                    // jam buka (WIB, zona waktu script = Asia/Jakarta)
var TANGKAS_CLOSE_H  = 21;                    // jam tutup (WIB). Entri diterima bila OPEN_H <= jam < CLOSE_H
var TANGKAS_TEST     = false;                 // true = abaikan jam buka (hanya untuk uji coba admin)
// ====== RELAY EMAIL PELANGGAN (sementara, via akun Gmail biasa yg sudah matang) ======
// Email ke PELANGGAN (eksternal) dikirim lewat web app 'relay' yg jalan di masmoel.trading@gmail.com.
// Kosongkan GMAIL_RELAY_URL untuk kembali kirim lewat Workspace (MailApp).
var USE_GMAIL_RELAY = true;    // true = email pelanggan lewat relay Gmail (masmoel.trading); false = langsung dari Workspace (admin@apocalypto.id)
var GMAIL_RELAY_URL = '__GAS_RELAY_URL__';                               // tempel URL /exec web app relay (dari akun Gmail) di sini
var GMAIL_RELAY_KEY = '__GAS_RELAY_KEY__';   // kunci rahasia relay — samakan dgn RELAY_KEY di script relay
var INVOICE_SHEET = 'Invoice';                // nama tab pencatatan invoice
var PROFIT_SHEET  = 'Profit';                 // nama tab pencatatan profit bulanan otomatis dari EA
var BILLING_HOUR  = 9;                         // JAM (zona waktu script) penagihan harian dijalankan. Set > selisih jam broker paling lambat vs lokal (mis. Exness -7j -> jam 9 WIB aman). Script TZ harus Asia/Jakarta.
var REAL_KEYWORDS = ['real', 'live'];         // kata kunci nama server = akun REAL (menunggu verifikasi admin). Selain ini dianggap DEMO (auto-aktif). Tambah kata kunci baru di sini bila ketemu server lain.
var CENT_CURRENCIES = ['USC', 'USX', 'RUX', 'EUX', 'GBX', 'JPX'];   // kode mata uang akun CENT (dari ACCOUNT_CURRENCY EA). Tambah bila broker lain beda.
var BANK_NAMA    = 'Bank Mandiri';
var BANK_REK     = '__GAS_BANK_REK__';
var BANK_AN      = '__GAS_BANK_AN__';
var QRIS_FILE_ID = '';                        // (opsional) ID file gambar QRIS di Drive. Kosongkan bila belum ada.
var KURS_MARGIN_PCT = 0;                       // margin kurs (%) di atas kurs pasar. 0 = murni kurs pasar.
var KURS_FALLBACK   = 0;                       // kurs cadangan (Rp per USD) bila gagal ambil kurs online. 0 = jangan pakai (invoice ditolak bila gagal).
var QUOTA_WARN_AT   = 15;                      // kirim peringatan ke admin bila sisa kuota email harian <= angka ini.
/*  Cara mengisi PRODUCT_FOLDER_ID:
    1. Buat subfolder bernama "Produk" di dalam folder Apocalypto (Google Drive).
    2. Taruh semua file yang mau dikirim ke pendaftar di situ: Apocalypto.ex5,
       panduan (PDF/Word), dsb. SEMUA file di folder ini akan dilampirkan ke email.
    3. Buka folder "Produk", lihat URL-nya, contoh:
       https://drive.google.com/drive/folders/0AbCdEfGhIjKlMnOpQ
       Bagian setelah /folders/ itulah ID-nya. Copy & tempel di atas.
    Update produk di masa depan cukup tambah/timpa file di folder "Produk" — script tak perlu diubah.
    (Catatan: total lampiran email maksimal ~25 MB. File .ex5 & PDF panduan biasanya jauh di bawah itu.)
============================================================ */

// Susunan kolom FINAL (A..P). A/B/C wajib tetap: Akun, Expired, Status (dibaca EA).
// Kolom VPS Adress, Password Investor, Periode Penagihan, Total Profit DIHAPUS.
// Profit & periode invoice sekarang diambil OTOMATIS dari tab Profit.
var HEADERS = [
  'Nomor Akun / Login MT5',        // A
  'Expired',                       // B
  'Status',                        // C
  'Nama Panggilan',                // D
  'Sisa Waktu',                    // E (rumus otomatis)
  'Nomor WhatsApp',                // F
  'Email',                         // G
  'Server Broker',                 // H (diisi otomatis oleh EA)
  'Skema Layanan',                 // I
  'Masa Berlaku Lisensi',          // J
  'Profit Sharing',                // K
  'Pilihan VPS',                   // L
  'Waktu Daftar',                  // M
  'Blacklist',                     // N (centang oleh admin utk memblokir)
  'Jenis Akun',                    // O (Demo = auto-aktif, Real = perlu ACC admin)
  'Reminder Perpanjang',           // P (diisi sistem: tanggal expired yg sudah diingatkan)
  'Tanggal Aktivasi'               // Q (otomatis saat akun jadi Active; batas awal hitung profit)
];

// ---------- 1. CEK LISENSI (dipanggil EA) + CEK DUPLIKAT (dipanggil form) ----------
// - EA memanggil biasa  -> balas teks polos "STATUS|EXPIRED"
// - Form memanggil dg &callback=... -> balas JSONP: callback("STATUS|EXPIRED")
//   dipakai form untuk cek apakah nomor akun sudah terdaftar sebelum kirim.
// ---- Validasi kunci rahasia & input (tolak request liar dari internet) ----
function checkApiKey(p){ return String((p && p.key) || '') === API_KEY; }
// Form pendaftaran: terima kunci situs (REG_KEY) ATAU kunci lama (API_KEY, utk form lama).
function checkFormKey(p){ var k = String((p && p.key) || ''); return k === API_KEY || (REG_KEY && k === REG_KEY); }
function isDigitsStr(s){ return /^\d{3,15}$/.test(String(s||'').trim()); }
function validEmailStr(s){ return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s||'').trim()); }

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var cb = (p.callback || '').toString().replace(/[^a-zA-Z0-9_]/g, ''); // amankan nama callback

  // ---- Profit bulanan OTOMATIS dari EA (telemetry) -> tab "Profit" ----
  if (p.action === 'profit') {
    if (!checkApiKey(p)) return ContentService.createTextOutput('ERR:BAD_KEY').setMimeType(ContentService.MimeType.TEXT);
    return handleProfit(e);
  }

  // ---- Pre-check dari FORM: cek duplikat akun + blacklist WA/email ----
  if (p.action === 'precheck') {
    var res = precheck(p);                       // {dup:bool, blacklist:bool}
    var json = JSON.stringify(res);
    if (cb) return ContentService.createTextOutput(cb + '(' + json + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
  }

  // (Endpoint login/getbill/createinvoice halaman penagihan DIHAPUS — penagihan full-otomatis.)

  // ---- Tandai LUNAS (link dari email admin) ----
  if (p.action === 'paid') {
    if (p.key !== ADMIN_KEY) return ContentService.createTextOutput('Akses ditolak.');
    var msg = markPaid(p.inv);
    return HtmlService.createHtmlOutput(
      '<div style="font-family:Arial;text-align:center;padding:40px;">' +
      '<h2 style="color:#0E1A2B;">EA Apocalypto</h2><p style="font-size:16px;">' + msg + '</p></div>'
    );
  }

  // ---- Default: cek lisensi utk EA ----
  var text = getLicenseText(e);
  if (cb) return ContentService.createTextOutput(cb + '(' + JSON.stringify(text) + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(text);
}

// Cek gabungan: nomor akun sudah ada? WA/email cocok dgn baris ber-Blacklist?
function precheck(p) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var acc   = (p.account || '').toString().trim();
  var wa    = normPhone((p.wa || '').toString());
  var email = (p.email || '').toString().trim().toLowerCase();
  var dup = false, black = false;
  // index kolom: 0=A akun, 5=F WA, 6=G email, 13=N blacklist
  for (var i = 1; i < data.length; i++) {
    if (acc && data[i][0].toString().trim() === acc) dup = true;
    if (isBlacklisted(data[i][13])) {
      var rowWa    = normPhone((data[i][5] || '').toString());
      var rowEmail = (data[i][6] || '').toString().trim().toLowerCase();
      if (wa && rowWa && rowWa === wa) black = true;
      if (email && rowEmail && rowEmail === email) black = true;
    }
  }
  var quota = 999;
  try { quota = MailApp.getRemainingDailyQuota(); } catch (e) { quota = 999; }
  return { dup: dup, blacklist: black, quota: quota };
}

// Normalisasi nomor HP: buang non-digit, hilangkan awalan 62 / 0
function normPhone(s) {
  var d = (s || '').toString().replace(/\D/g, '');
  if (d.indexOf('62') === 0) d = d.substring(2);
  if (d.indexOf('0') === 0)  d = d.substring(1);
  return d;
}

// Kolom blacklist bisa checkbox (TRUE) atau teks (YA/Y/1/X/BLACKLIST)
function isBlacklisted(v) {
  if (v === true) return true;
  var s = (v || '').toString().trim().toLowerCase();
  return s === 'ya' || s === 'y' || s === 'true' || s === '1' || s === 'x' || s === 'blacklist';
}

// Deteksi jenis akun dari nama server: mengandung kata kunci REAL -> "Real", selain itu -> "Demo".
function detectJenis(server){
  var s = (server || '').toString().toLowerCase();
  for (var i = 0; i < REAL_KEYWORDS.length; i++){
    if (s.indexOf(String(REAL_KEYWORDS[i]).toLowerCase()) >= 0) return 'Real';
  }
  return 'Demo';
}
// Deteksi tipe akun: UTAMA dari mata uang akun (ACCOUNT_CURRENCY dikirim EA),
// cadangan dari nama server bila mengandung "cent".
function detectTipe(server, currency){
  var cur = (currency || '').toString().toUpperCase().trim();
  for (var i = 0; i < CENT_CURRENCIES.length; i++){
    if (cur === CENT_CURRENCIES[i]) return 'Cent';
  }
  if (/cent/i.test((server || '').toString())) return 'Cent';   // cadangan: nama server
  return 'USD';
}
// Gabungan utk kolom "Jenis Akun": "USD / Real", "Cent / Real", "USD / Demo", dst.
function labelJenis(server, currency){
  return detectTipe(server, currency) + ' / ' + detectJenis(server);
}

function getLicenseText(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var acc = (p.account || '').toString().trim();
  if (!acc) return "ERROR|NO_ACCOUNT_PROVIDED";
  var server = (p.server || '').toString().trim();   // dikirim EA utk sinkronisasi
  var currency = (p.cur || '').toString().trim();    // ACCOUNT_CURRENCY dari EA (utk deteksi Cent)

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0].toString().trim() === acc) {
      var row = i + 1;
      var status = (data[i][2] || '').toString().toUpperCase().trim();
      var curServer = (data[i][7] || '').toString().trim();   // H Server Broker

      // ---- PENGAMAN: akun di-BLACKLIST -> selalu INACTIVE (EA tidak jalan) ----
      if (isBlacklisted(data[i][13])) return "INACTIVE|-";    // N Blacklist

      // ---- DITOLAK admin (Rejected) -> EA nonaktif & JANGAN sinkron ulang (biar reject nempel) ----
      if (status === "REJECTED") return "INACTIVE|-";

      // ---- SINKRONISASI PERTAMA: EA kirim server & kolom Server masih kosong ----
      if (server && !curServer) {
        return firstSync(sheet, row, server, currency);
      }

      if (status === "ACTIVE") {
        var exp = data[i][1];
        var formatted = exp ? Utilities.formatDate(new Date(exp), Session.getScriptTimeZone(), "yyyy.MM.dd") : "";
        var actM = data[i][16] || data[i][12];   // Q Tanggal Aktivasi (fallback M Waktu Daftar utk akun lama) -> batas awal hitung profit
        var actStr = actM ? Utilities.formatDate(new Date(actM), Session.getScriptTimeZone(), "yyyy.MM.dd") : "";
        return "ACTIVE|" + formatted + "|" + actStr;
      }
      if (status === "PENDING") return "PENDING|-";   // terdaftar, menunggu sinkronisasi/verifikasi admin
      return "INACTIVE|-";                            // dinonaktifkan admin
    }
  }
  return "UNREGISTERED|-";   // belum pernah terdaftar
}

// Sinkronisasi pertama kali EA melapor server: catat jenis & server + deteksi demo/real.
// Urutan tulis: (1) Jenis Akun, (2) Server Broker, lalu:
//   Demo -> hapus Skema & Profit Sharing, status Active + Expired, Email "aktif".
//   Real -> pertahankan Skema & Profit Sharing, status Inactive (parkir), Email "sedang diverifikasi".
function firstSync(sheet, row, server, currency){
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var curServer = (sheet.getRange(row, 8).getValue() || '').toString().trim();
    if (curServer) {   // sudah ter-sync oleh request lain -> balas status terkini
      var st0 = (sheet.getRange(row, 3).getValue() || '').toString().toUpperCase().trim();
      if (st0 === 'ACTIVE') {
        var ex0 = sheet.getRange(row, 2).getValue();
        var ac0 = sheet.getRange(row, 17).getValue() || sheet.getRange(row, 13).getValue();   // Q Aktivasi (fallback M)
        return "ACTIVE|" + (ex0 ? Utilities.formatDate(new Date(ex0), Session.getScriptTimeZone(), "yyyy.MM.dd") : "")
             + "|" + (ac0 ? Utilities.formatDate(new Date(ac0), Session.getScriptTimeZone(), "yyyy.MM.dd") : "");
      }
      return (st0 === 'PENDING') ? "PENDING|-" : "INACTIVE|-";
    }

    // (1) Jenis Akun dulu, (2) baru Server Broker
    var jenis = detectJenis(server);                          // 'Demo' / 'Real' (utk logika)
    sheet.getRange(row, 15).setValue(labelJenis(server, currency)); // O Jenis Akun: "USC->Cent / Real", dst (deteksi dari mata uang)
    sheet.getRange(row, 8).setValue(server);                 // H Server Broker

    if (jenis === 'Demo') {
      // Demo = GRATIS: hapus Skema Layanan & Profit Sharing
      sheet.getRange(row, 9).setValue('');                   // I Skema Layanan -> dikosongkan
      sheet.getRange(row, 11).setValue('');                  // K Profit Sharing -> dikosongkan
      var masaStr = (sheet.getRange(row, 10).getValue() || '').toString();   // J Masa Berlaku
      var months = parseInt(masaStr.replace(/[^0-9]/g, ''), 10);
      var d = new Date();
      if (months) d.setMonth(d.getMonth() + months); else d.setMonth(d.getMonth() + 1);
      d.setHours(23, 59, 0, 0);
      sheet.getRange(row, 2).setValue(d).setNumberFormat('yyyy.MM.dd HH:mm');          // B Expired
      sheet.getRange(row, 5).setFormula('=IF($B' + row + '="","",INT($B' + row + '-NOW()))'); // E Sisa Waktu
      sheet.getRange(row, 16).setValue('');                  // P reset penanda reminder
      sheet.getRange(row, 3).setValue('Active');             // C Status -> Active
      var actNow = new Date();
      sheet.getRange(row, 17).setValue(actNow).setNumberFormat('yyyy.MM.dd');  // Q Tanggal Aktivasi (demo auto-aktif)
      try { sendActivationEmail(sheet, row, d); } catch (e2) {}   // Email: demo aktif
      return "ACTIVE|" + Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy.MM.dd")
           + "|" + Utilities.formatDate(actNow, Session.getScriptTimeZone(), "yyyy.MM.dd");
    } else {
      // Real: Skema Layanan (K) & Profit Sharing (M) DIPERTAHANKAN (tidak diubah).
      sheet.getRange(row, 3).setValue('Inactive');           // C Status -> Inactive (parkir, tunggu verifikasi admin)
      try { sendPendingRealEmail(sheet, row, server); } catch (e3) {}   // Email: sedang diverifikasi
      return "INACTIVE|-";
    }
  } catch (err) {
    return "PENDING|-";
  } finally {
    try { lock.releaseLock(); } catch (e4) {}
  }
}

// ---------- 2. PENDAFTARAN (dipanggil form) ----------
function doPost(e) {
  try {
    var p0 = (e && e.parameter) ? e.parameter : {};
    // (Endpoint invoice manual halaman penagihan DIHAPUS — penagihan full-otomatis tiap tgl 1.)

    // ---- Registrasi MEMBER dari situs apocalypto.id (nama, email, WA) ----
    // (action=member tanpa OTP DINONAKTIFKAN — registrasi wajib lewat otp_send/otp_verify)
    if (p0.action === 'member') return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'USE_OTP' })).setMimeType(ContentService.MimeType.JSON);
    // ---- Gabung dgn OTP email (situs apocalypto.id) ----
    if (p0.action === 'otp_send')   return handleOtpSend(p0);
    if (p0.action === 'otp_verify') return handleOtpVerify(p0);
    // ---- Entri harian TANGKAS dari situs ----
    if (p0.action === 'tangkas') return handleTangkas(p0);

    var lock = LockService.getScriptLock();
    lock.tryLock(10000);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(SHEET_NAME);
    var p = e.parameter || {};
    var login = (p.login || '').toString().trim();

    // Tolak bila kunci rahasia salah/absen (anti daftar liar dari internet)
    if (!checkFormKey(p)) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'BAD_KEY' })).setMimeType(ContentService.MimeType.JSON);
    }
    // Validasi input dasar (login angka, email & WA valid, nama terisi)
    if (!isDigitsStr(login) || !validEmailStr(p.email) || !isDigitsStr(normPhone(p.wa)) || !String(p.nama||'').trim()) {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'INVALID_INPUT' })).setMimeType(ContentService.MimeType.JSON);
    }

    // Wajib ada nomor akun
    if (login === '') {
      lock.releaseLock();
      return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: 'NO_LOGIN' })).setMimeType(ContentService.MimeType.JSON);
    }

    var wa    = normPhone((p.wa || '').toString());
    var email = (p.email || '').toString().trim().toLowerCase();

    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      // TOLAK jika nomor akun sudah pernah terdaftar (tidak boleh dobel)
      if (data[i][0].toString().trim() === login) {
        lock.releaseLock();
        return ContentService.createTextOutput(JSON.stringify({ result: 'duplicate' })).setMimeType(ContentService.MimeType.JSON);
      }
      // TOLAK jika WA/email cocok dengan baris yang di-Blacklist (kolom N)
      if (isBlacklisted(data[i][13])) {
        var rowWa    = normPhone((data[i][5] || '').toString());
        var rowEmail = (data[i][6] || '').toString().trim().toLowerCase();
        if ((wa && rowWa && rowWa === wa) || (email && rowEmail && rowEmail === email)) {
          lock.releaseLock();
          return ContentService.createTextOutput(JSON.stringify({ result: 'blacklist' })).setMimeType(ContentService.MimeType.JSON);
        }
      }
    }

    // ALUR BARU: semua pendaftar masuk sebagai PENDING.
    // Jenis akun (Demo/Real) & Server Broker TIDAK diisi dari form — nanti dideteksi
    // otomatis saat EA melapor server pertama kali (firstSync). Expired & Jenis menyusul.
    {
      var r = sheet.getLastRow() + 1;
      sheet.getRange(r, 1, 1, 16).setValues([[
        login,            // A Nomor Akun / Login MT5
        '',               // B Expired (terisi otomatis saat sinkronisasi/ACC)
        'Pending',        // C Status (menunggu sinkronisasi EA)
        p.nama || '',     // D Nama Panggilan
        '',               // E Sisa Waktu (rumus di bawah)
        p.wa || '',       // F Nomor WhatsApp
        p.email || '',    // G Email
        '',               // H Server Broker (diisi otomatis oleh EA saat sinkronisasi)
        p.skema || '',    // I Skema Layanan
        p.masa || '',     // J Masa Berlaku Lisensi
        p.psharing || '', // K Profit Sharing
        p.vps || '',      // L Pilihan VPS
        new Date(),       // M Waktu Daftar
        false,            // N Blacklist (default tidak)
        '',               // O Jenis Akun (diisi otomatis saat deteksi server)
        ''                // P Reminder Perpanjang
      ]]);
      sheet.getRange(r, 5).setFormula('=IF($B' + r + '="","",INT($B' + r + '-NOW()))'); // E Sisa Waktu
      var rule = SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive', 'Pending', 'Rejected'], true).build();
      sheet.getRange(r, 3).setDataValidation(rule);            // dropdown Status
      sheet.getRange(r, 14).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build()); // N checkbox Blacklist
    }

    lock.releaseLock();
    sendRegistrationEmails(p);   // kirim EA ke pendaftar + notif ke admin
    return ContentService.createTextOutput(JSON.stringify({ result: 'ok' })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// Ambil SEMUA file di dalam folder "Produk" sebagai lampiran.
// Pakai Drive API (advanced service "Drive") agar mendukung Shared Drive,
// lalu unduh isi tiap file via UrlFetch. WAJIB aktifkan layanan "Drive API".
function getProductBlobs() {
  var blobs = [];
  try {
    var token = ScriptApp.getOAuthToken();
    var res = Drive.Files.list({
      q: "'" + PRODUCT_FOLDER_ID + "' in parents and trashed=false",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      corpora: 'allDrives',
      pageSize: 100,
      fields: 'files(id,name)'
    });
    var items = (res && res.files) ? res.files : [];
    for (var i = 0; i < items.length; i++) {
      var url = 'https://www.googleapis.com/drive/v3/files/' + items[i].id + '?alt=media&supportsAllDrives=true';
      var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      if (resp.getResponseCode() === 200) {
        blobs.push(resp.getBlob().setName(items[i].name));
      }
    }
  } catch (e) { /* folder tak ditemukan / tak ada akses / Drive API belum aktif */ }
  return blobs;
}

// ================= TEMPLATE EMAIL HTML (gaya elegan, seragam spt invoice) =================
// Header navy + logo emas, kartu putih, tabel rapi, footer link admin & komunitas.
// Kirim email ke PELANGGAN (eksternal). Pakai relay Gmail bila GMAIL_RELAY_URL diisi;
// kalau kosong/gagal -> fallback kirim lewat Workspace (MailApp). opts = {to,subject,body,htmlBody,name,attachments,inlineImages}.
function sendMailUser(opts){
  // Utama: kirim langsung dari Workspace (admin@apocalypto.id, DKIM/SPF/DMARC PASS).
  // Bila Workspace menolak (mis. kuota habis), otomatis jatuh balik ke relay Gmail.
  if (!USE_GMAIL_RELAY){
    try { MailApp.sendEmail(opts); return; }
    catch (e){ console.error('Workspace gagal kirim: ' + e + ' -> coba relay Gmail.'); }
  }
  try{
    if (GMAIL_RELAY_URL && GMAIL_RELAY_URL.indexOf('http') === 0){
      var attArr = [];
      var atts = opts.attachments || [];
      for (var i = 0; i < atts.length; i++){
        var b = atts[i];
        attArr.push({ name: b.getName(), mime: b.getContentType(), b64: Utilities.base64Encode(b.getBytes()) });
      }
      var payload = { key: GMAIL_RELAY_KEY, to: String(opts.to||''), subject: String(opts.subject||''),
                      html: String(opts.htmlBody||''), text: String(opts.body||''),
                      name: String(opts.name||'EA Apocalypto'), atts: attArr };
      var resp = UrlFetchApp.fetch(GMAIL_RELAY_URL, { method:'post', contentType:'application/json',
                      payload: JSON.stringify(payload), muteHttpExceptions:true });
      if (resp.getResponseCode() === 200 && resp.getContentText().indexOf('OK') === 0) return;
      console.error('Relay gagal (' + resp.getResponseCode() + '): ' + resp.getContentText() + ' -> fallback Workspace.');
    }
  } catch (e){ console.error('Relay error: ' + e + ' -> fallback Workspace.'); }
  if (USE_GMAIL_RELAY) MailApp.sendEmail(opts);   // fallback: kirim lewat Workspace
  else throw new Error('Email gagal dikirim lewat Workspace maupun relay');
}

function emailShell(subtitle, nama, introHtml, rows, extraHtml, headerBg){
  var bg = headerBg || '#0E1A2B';   // default navy; bisa diganti (mis. hijau utk "Lisensi Aktif")
  var tableHtml = '';
  if (rows && rows.length){
    tableHtml = '<table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:4px;">';
    for (var i = 0; i < rows.length; i++){
      var hi = rows[i][2] ? 'color:#B8860B;font-size:16px;' : '';
      tableHtml += '<tr><td style="padding:7px 0;color:#666;border-bottom:1px solid #f0f0f0;">' + rows[i][0] + '</td>' +
                   '<td style="padding:7px 0;text-align:right;font-weight:bold;border-bottom:1px solid #f0f0f0;' + hi + '">' + rows[i][1] + '</td></tr>';
    }
    tableHtml += '</table>';
  }
  return (
    '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;color:#222;">' +
      '<div style="background:' + bg + ';padding:18px 20px;border-radius:10px 10px 0 0;">' +
        '<span style="color:#C8A24A;font-size:20px;font-weight:bold;letter-spacing:.5px;">EA APOCALYPTO</span>' +
        '<div style="color:#cbd3e0;font-size:12px;margin-top:2px;">' + (subtitle || '') + '</div>' +
      '</div>' +
      '<div style="border:1px solid #e5e5e5;border-top:none;padding:20px;border-radius:0 0 10px 10px;">' +
        '<p style="margin:0 0 10px;">Halo <b>' + (nama || 'Trader') + '</b>,</p>' +
        (introHtml || '') +
        tableHtml +
        (extraHtml || '') +
        '<p style="font-size:13px;margin-top:18px;">Butuh bantuan? <a href="' + ADMIN_WA_URL + '" style="color:#B8860B;text-decoration:none;font-weight:bold;">Hubungi Admin</a> &nbsp;&middot;&nbsp; <a href="' + WA_GROUP_URL + '" style="color:#B8860B;text-decoration:none;font-weight:bold;">Gabung Komunitas</a></p>' +
        '<p style="font-size:12px;color:#999;margin:10px 0 0;">Salam,<br>Tim EA Apocalypto</p>' +
      '</div>' +
    '</div>'
  );
}
// Kotak info berwarna. kind: 'ok'(hijau) 'warn'(kuning) 'info'(emas) 'danger'(merah)
function infoBox(html, kind){
  var map = { ok:['#E8F6EE','#BFE6CF','#1d7a45'], warn:['#FFF4D6','#F0DFA0','#8a6d1a'],
              info:['#F5ECD5','#E6D7A8','#6b5a1a'], danger:['#FBEAEA','#F0C2C2','#9b2c2c'] };
  var c = map[kind || 'info'];
  return '<div style="background:' + c[0] + ';border:1px solid ' + c[1] + ';border-radius:8px;padding:12px 14px;margin-top:14px;font-size:13px;color:' + c[2] + ';line-height:1.6;">' + html + '</div>';
}
// Format tanggal Indonesia: Date -> "03 Januari 2027"
function formatTanggalID(d){
  try {
    var bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
    var dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt.getTime())) return (d || '').toString();
    var tz = Session.getScriptTimeZone();
    var day = Utilities.formatDate(dt, tz, 'dd');
    var mo  = parseInt(Utilities.formatDate(dt, tz, 'M'), 10) - 1;
    var yr  = Utilities.formatDate(dt, tz, 'yyyy');
    return day + ' ' + (bulan[mo] || '') + ' ' + yr;
  } catch (e) { return (d || '').toString(); }
}

// Cari akun LAIN (login berbeda) dgn WA ATAU email sama -> teks peringatan utk ADMIN.
// Dipakai sbg dasar admin memutuskan blacklist (mencegah penghindaran profit sharing).
function dupIdentityWarn(login, wa, email){
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    var data = sheet.getDataRange().getValues();
    login = (login || '').toString().trim();
    wa = normPhone((wa || '').toString());
    email = (email || '').toString().trim().toLowerCase();
    var hits = [];
    for (var i = 1; i < data.length; i++){
      var rLogin = (data[i][0] || '').toString().trim();
      if (!rLogin || rLogin === login) continue;                 // lewati baris pendaftar ini sendiri
      var rWa    = normPhone((data[i][5] || '').toString());
      var rEmail = (data[i][6] || '').toString().trim().toLowerCase();
      if (!((wa && rWa && rWa === wa) || (email && rEmail && rEmail === email))) continue;
      var st = (data[i][2] || '').toString().trim() || '-';
      var jn = (data[i][14] || '').toString().trim() || '-';
      var bl = isBlacklisted(data[i][13]) ? ' [BLACKLIST]' : '';
      hits.push('   - Login ' + rLogin + ' | Status: ' + st + ' | Jenis: ' + jn + bl);
    }
    if (!hits.length) return '';
    return '\n⚠️ PERINGATAN DUPLIKAT IDENTITAS\n' +
           'WA/email pendaftar ini SUDAH terdaftar di akun lain:\n' +
           hits.join('\n') + '\n' +
           'Cek dulu apakah ada profit sharing TERTUNGGAK sebelum verifikasi. Bila terbukti menghindar, lakukan BLACKLIST.\n';
  } catch (e) { return ''; }
}

// ---------- 2b. KIRIM EMAIL: file produk ke pendaftar + notifikasi ke admin ----------
function sendRegistrationEmails(p) {
  var login  = (p.login || '').toString().trim();
  var nama   = (p.nama  || '').toString().trim();
  var email  = (p.email || '').toString().trim();

  // (1) EMAIL #1 ke PENDAFTAR: kirim file EA + panduan, arahkan aktivasi WebRequest & sinkronisasi.
  if (email) {
    try {
      var attachments = getProductBlobs();
      var introU = '<p style="margin:0 0 12px;">Terima kasih sudah mendaftar <b>EA Apocalypto</b>. Pendaftaran Anda <b>berhasil</b> dan lolos verifikasi awal. File EA (.ex5) &amp; panduan pemasangan sudah terlampir pada email ini.</p>';
      var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status saat ini', 'Menunggu Sinkronisasi'] ];
      var langkah = infoBox(
        '<b>TAHAP SINKRONISASI (wajib, sekali saja):</b>' +
        '<ol style="margin:8px 0 0;padding-left:18px;">' +
          '<li style="margin-bottom:6px;">Pasang EA sesuai panduan terlampir.</li>' +
          '<li style="margin-bottom:6px;">Aktifkan izin WebRequest di MT5: <b>Tools &rarr; Options &rarr; Expert Advisors</b>, centang <b>"Allow WebRequest for listed URL"</b>, tambahkan: <b>https://script.google.com</b>, klik OK.</li>' +
          '<li>Attach EA ke chart &amp; pastikan tombol <b>Algo Trading</b> menyala (hijau).</li>' +
        '</ol>', 'info');
      var htmlU = emailShell('Pendaftaran Berhasil &amp; Tahap Sinkronisasi', nama, introU, rowsU, langkah);
      sendMailUser({
        to: email,
        subject: 'EA Apocalypto — File EA, Panduan & Langkah Aktivasi',
        body: 'Pendaftaran berhasil. File EA & panduan terlampir. Pasang EA untuk aktivasi. Butuh bantuan: ' + ADMIN_WA_URL,
        htmlBody: htmlU,
        name: 'EA Apocalypto',
        attachments: attachments
      });
    } catch (err) { /* jangan gagalkan pendaftaran karena email */ }
  }

  // (2) Notifikasi ke ADMIN — pendaftar baru (jenis akun belum diketahui sampai EA sinkron).
  if (ADMIN_EMAIL) {
    try {
      var bodyA =
        'Ada pendaftar BARU (status: Pending — menunggu sinkronisasi EA):\n\n' +
        'Nama Panggilan : ' + (p.nama || '-') + '\n' +
        'Login MT5      : ' + login + '\n' +
        'WhatsApp       : ' + (p.wa || '-') + '\n' +
        'Email          : ' + (p.email || '-') + '\n' +
        'Skema Layanan  : ' + (p.skema || '-') + '\n' +
        'Masa Berlaku   : ' + (p.masa || '-') + '\n' +
        'Profit Sharing : ' + (p.psharing || '-') + '\n' +
        'Pilihan VPS    : ' + (p.vps || '-') + '\n\n' +
        'Jenis akun (Demo/Real) & Server Broker akan terisi OTOMATIS saat EA melapor ' +
        'server pertama kali. Jika Demo -> aktif otomatis. Jika Real -> Anda akan ' +
        'menerima notifikasi untuk verifikasi (ubah Status menjadi "Active").\n' +
        dupIdentityWarn(login, p.wa, p.email) +
        '\nBuka Google Sheet:\n' + SHEET_URL;
      var adaDup = dupIdentityWarn(login, p.wa, p.email) !== '';
      MailApp.sendEmail({
        to: ADMIN_EMAIL,
        subject: (adaDup ? '⚠️ Pendaftar Baru (DUPLIKAT identitas): ' : '🔔 Pendaftar Baru (Pending): ') + (nama || '-') + ' (' + login + ')',
        body: bodyA,
        name: 'Apocalypto System'
      });
    } catch (err) { /* diamkan */ }
  }
  maybeWarnQuota();
}

// ---------- EMAIL #2 (REAL): sinkronisasi berhasil, lisensi menunggu verifikasi admin ----------
// Dikirim dari firstSync() saat EA melapor server & terdeteksi akun Real/Live.
function sendPendingRealEmail(sheet, row, server) {
  // (a) ke USER: beri tahu akun terdeteksi Real -> menunggu verifikasi admin
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();   // G Email
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();   // D Nama
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();   // A Login
    if (email) {
      var introU = '<p style="margin:0 0 12px;">Tahap Sinkronisasi EA Apocalypto Anda <b>berhasil</b>.</p>';
      var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status', 'Menunggu Verifikasi'] ];
      var noteU = infoBox('Proses aktivasi EA sedang dalam proses verifikasi oleh admin. Silakan pasang ulang EA ke chart setelah proses verifikasi selesai.', 'warn');
      sendMailUser({
        to: email,
        subject: 'EA Apocalypto — Akun Real Terdeteksi, Menunggu Verifikasi Admin',
        body: 'Tahap sinkronisasi berhasil. Proses aktivasi sedang diverifikasi admin. Pasang ulang EA ke chart setelah verifikasi selesai.',
        htmlBody: emailShell('Menunggu Verifikasi Admin', nama, introU, rowsU, noteU, '#B45309'),   // header amber/oranye
        name: 'EA Apocalypto'
      });
    }
  } catch (err) { console.error('sendPendingRealEmail (user) gagal: ' + err); }

  // (b) ke ADMIN: minta verifikasi akun Real ini
  if (ADMIN_EMAIL) {
    try {
      var nmA = (sheet.getRange(row, 4).getValue() || '').toString().trim();
      var lgA = (sheet.getRange(row, 1).getValue() || '').toString().trim();
      var waA = (sheet.getRange(row, 6).getValue() || '').toString().trim();
      var emA = (sheet.getRange(row, 7).getValue() || '').toString().trim();
      var bodyA =
        'PERLU VERIFIKASI — akun REAL baru tersinkronisasi:\n\n' +
        'Nama Panggilan : ' + (nmA || '-') + '\n' +
        'Login MT5      : ' + lgA + '\n' +
        'Server Broker  : ' + server + ' (terdeteksi: Real)\n' +
        'WhatsApp       : ' + (waA || '-') + '\n' +
        'Email          : ' + (emA || '-') + '\n\n' +
        'CARA APPROVE: buka Google Sheet, cari baris login ' + lgA + ', ubah kolom Status ' +
        'menjadi "Active". Tanggal Expired akan terisi OTOMATIS sesuai Masa Berlaku, dan ' +
        'email konfirmasi aktif akan dikirim ke user.\n' +
        dupIdentityWarn(lgA, waA, emA) +
        '\nBuka Google Sheet:\n' + SHEET_URL;
      var adaDupR = dupIdentityWarn(lgA, waA, emA) !== '';
      MailApp.sendEmail({
        to: ADMIN_EMAIL,
        subject: (adaDupR ? '⚠️🔴 Verifikasi Akun Real (DUPLIKAT identitas): ' : '🔴 Verifikasi Akun Real: ') + (nmA || '-') + ' (' + lgA + ')',
        body: bodyA,
        name: 'Apocalypto System'
      });
    } catch (err) { /* diamkan */ }
  }
  maybeWarnQuota();
}

// ---------- 3. AUTO-EXPIRED + EMAIL saat admin approve (Status jadi Active) ----------
// Dipasang sebagai INSTALLABLE trigger (lihat installTriggers) agar boleh kirim email.
function onStatusEdit(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    if (sheet.getName() !== SHEET_NAME) return;
    var editCol = range.getColumn(), editRow = range.getRow();
    if (editRow < 2) return;

    // ---- Kolom N (Blacklist) dicentang / dicabut admin -> cascade ke ID dgn WA/email sama ----
    if (editCol === 14) {
      handleBlacklistCascade(sheet, editRow, isBlacklisted(e.value));
      return;
    }

    // ---- Kolom B (Expired) diubah manual admin -> PERPANJANGAN lisensi ----
    if (editCol === 2) {
      handleRenewal(sheet, editRow);
      return;
    }

    if (editCol !== 3) return;                                      // selain Status/Blacklist/Expired -> abaikan

    var val = (e.value || '').toString().toUpperCase().trim();
    var old = (e.oldValue || '').toString().toUpperCase().trim();
    if (val === old) return;                                        // nilai tidak berubah -> abaikan
    var row = range.getRow();

    if (val === 'ACTIVE') {
      sheet.getRange(row, 17).setValue(new Date()).setNumberFormat('yyyy.MM.dd');  // Q Tanggal Aktivasi (saat admin aktifkan)
      var expCell = sheet.getRange(row, 2);                         // B Expired
      var cur = expCell.getValue();
      var d = (cur instanceof Date) ? cur : null;                  // pakai expired yg sudah ada bila valid
      if (!d) {                                                     // belum ada -> hitung dari Masa Berlaku
        var masaStr = sheet.getRange(row, 10).getValue().toString(); // J Masa Berlaku Lisensi
        var months = parseInt(masaStr.replace(/[^0-9]/g, ''), 10);
        if (months) {
          d = new Date();
          d.setMonth(d.getMonth() + months);
          d.setHours(23, 59, 0, 0);
          expCell.setValue(d).setNumberFormat('yyyy.MM.dd HH:mm');
          sheet.getRange(row, 5).setFormula('=IF($B' + row + '="","",INT($B' + row + '-NOW()))'); // E Sisa Waktu
          sheet.getRange(row, 16).setValue('');                    // P reset penanda reminder utk siklus baru
        }
      }
      if (d) {
        sendActivationEmail(sheet, row, d);                        // beri tahu user: lisensi sudah aktif (selalu dikirim tiap approve)
      } else {
        console.error('Aktivasi baris ' + row + ' gagal: Masa Berlaku & Expired kosong, email tidak dikirim.');
      }
    }
    else if (val === 'REJECTED') {
      // TOLAK pendaftaran (lunak): EA tetap nonaktif, BUKAN blacklist (WA/email tidak diblokir).
      sendRejectionEmail(sheet, row);
    }
    // Penonaktifan MANUAL (Active -> Inactive) TIDAK mengirim email (SOP full-otomatis).
  } catch (err) { console.error('onStatusEdit gagal: ' + err); }
}

// ---------- PERPANJANGAN: admin ubah tanggal Expired (kolom B) ----------
// - Bila diketik sbg teks (mis. "2027.04.03"), diubah jadi Date asli + format.
// - Rumus Sisa Waktu dipastikan ada, penanda reminder di-reset utk siklus baru.
// - Email konfirmasi "Lisensi Diperpanjang" dikirim bila status ACTIVE.
// Perubahan Expired oleh sistem (aktivasi) TIDAK memicu fungsi ini (setValue tak picu onEdit).
function handleRenewal(sheet, row){
  try {
    if ((sheet.getRange(row, 1).getValue() || '').toString().trim() === '') return;  // baris kosong
    var cell = sheet.getRange(row, 2);                       // B Expired
    var raw = cell.getValue();
    var d = (raw instanceof Date) ? raw : parseExpired((raw || '').toString());
    if (!d) return;                                          // kosong / tidak valid -> abaikan
    if (!(raw instanceof Date)) cell.setValue(d).setNumberFormat('yyyy.MM.dd HH:mm');  // teks -> Date asli
    sheet.getRange(row, 5).setFormula('=IF($B' + row + '="","",INT($B' + row + '-NOW()))'); // E Sisa Waktu
    sheet.getRange(row, 16).setValue('');                    // P reset penanda reminder (siklus baru)
    var st = (sheet.getRange(row, 3).getValue() || '').toString().toUpperCase().trim();
    if (st === 'ACTIVE') { try { sendRenewalConfirmEmail(sheet, row, d); } catch (e1) {} }
  } catch (err) { console.error('handleRenewal gagal: ' + err); }
}

// Email ke user: lisensi telah DIPERPANJANG sampai tanggal baru (header hijau).
function sendRenewalConfirmEmail(sheet, row, expDate){
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();   // G Email
    if (!email) return;
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();   // D Nama
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();   // A Login
    var expID = formatTanggalID(expDate);                                      // "03 April 2027"
    var introU = '<p style="margin:0 0 12px;"><b>Terima kasih!</b> Lisensi EA Apocalypto Anda telah <b>diperpanjang</b>.</p>';
    var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status', 'AKTIF'], ['Berlaku sampai', expID, true] ];
    var noteU = infoBox('EA Anda tetap berjalan tanpa terputus hingga tanggal di atas. Terima kasih sudah memperpanjang layanan. Salam profit! 🚀', 'ok');
    sendMailUser({
      to: email,
      subject: 'EA Apocalypto — Lisensi Anda Diperpanjang',
      body: 'Lisensi akun Anda telah diperpanjang, berlaku sampai ' + expID + '.',
      htmlBody: emailShell('Lisensi Diperpanjang', nama, introU, rowsU, noteU, '#1E7A46'),   // header HIJAU
      name: 'EA Apocalypto'
    });
    maybeWarnQuota();
  } catch (err) { console.error('sendRenewalConfirmEmail gagal: ' + err); }
}

// ---------- BLACKLIST BERANTAI (cascade by WA / Email) ----------
// Dicentang  : SEMUA baris dgn WA ATAU Email sama -> Blacklist=TRUE + Status=Inactive + email "diblokir".
// Dicabut    : SEMUA baris dgn WA ATAU Email sama -> Blacklist=FALSE + Status=Active (yg punya Expired).
//              EA mengecek lisensi 1x/hari, jadi akun efektif aktif kembali dalam <= 1x24 jam.
function handleBlacklistCascade(sheet, row, isBlocked) {
  var wa    = normPhone((sheet.getRange(row, 6).getValue() || '').toString());        // F WhatsApp
  var email = (sheet.getRange(row, 7).getValue() || '').toString().trim().toLowerCase(); // G Email
  if (!wa && !email) return;

  var data = sheet.getDataRange().getValues();
  var emailedTo = {};   // hindari dobel email ke alamat yg sama
  for (var i = 1; i < data.length; i++) {
    var r = i + 1;
    var rWa    = normPhone((data[i][5] || '').toString());
    var rEmail = (data[i][6] || '').toString().trim().toLowerCase();
    var match  = (wa && rWa && rWa === wa) || (email && rEmail && rEmail === email);
    if (!match) continue;

    if (isBlocked) {
      if (!isBlacklisted(data[i][13])) sheet.getRange(r, 14).setValue(true);           // N Blacklist = TRUE
      var st = (data[i][2] || '').toString().toUpperCase().trim();
      if (st !== 'INACTIVE') sheet.getRange(r, 3).setValue('Inactive');                // C Status -> Inactive
      if (rEmail && !emailedTo[rEmail]) { emailedTo[rEmail] = true; try { sendBlacklistEmail(sheet, r); } catch (e1) {} }
    } else {
      if (isBlacklisted(data[i][13])) sheet.getRange(r, 14).setValue(false);           // N Blacklist = FALSE
      var exp = data[i][1];
      if (exp instanceof Date) sheet.getRange(r, 3).setValue('Active');                // C Status -> Active (punya Expired)
      if (rEmail && !emailedTo[rEmail]) { emailedTo[rEmail] = true; try { sendRehabEmail(sheet, r); } catch (e2) {} }
    }
  }
}

// Email ke user bahwa ID-nya DIBLOKIR (blacklist) -> arahkan ke admin utk rehabilitasi.
function sendBlacklistEmail(sheet, row) {
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();   // G Email
    if (!email) return;
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();   // D Nama
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();   // A Login
    var introU = '<p style="margin:0 0 12px;">Kami informasikan bahwa ID / akun trading Anda telah <b>DIBLOKIR</b> dari layanan EA Apocalypto.</p>';
    var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status', 'DIBLOKIR'] ];
    var noteU = infoBox('Selama diblokir, EA tidak akan berjalan. Untuk melakukan <b>rehabilitasi ID</b> silakan menghubungi admin.', 'danger');
    sendMailUser({
      to: email,
      subject: 'EA Apocalypto — ID Anda Diblokir',
      body: 'ID / akun trading Anda diblokir. Untuk rehabilitasi ID silakan menghubungi admin: ' + ADMIN_WA_URL,
      htmlBody: emailShell('Pemberitahuan Pemblokiran ID', nama, introU, rowsU, noteU, '#9B2C2C'),   // header MERAH
      name: 'EA Apocalypto'
    });
    maybeWarnQuota();
  } catch (err) { console.error('sendBlacklistEmail gagal: ' + err); }
}

// Email ke user: ID telah DIREHABILITASI (blacklist dicabut admin) -> aktif kembali.
function sendRehabEmail(sheet, row) {
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();   // G Email
    if (!email) return;
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();   // D Nama
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();   // A Login
    var exp   = sheet.getRange(row, 2).getValue();                             // B Expired
    var introU = '<p style="margin:0 0 12px;"><b>Kabar baik!</b> ID / akun trading Anda telah <b>direhabilitasi</b> dan aktif kembali.</p>';
    var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status', 'AKTIF'] ];
    if (exp instanceof Date) rowsU.push(['Berlaku sampai', formatTanggalID(exp), true]);
    var noteU = infoBox('Silakan <b>pasang ulang EA</b> ke chart. EA akan aktif kembali dalam waktu <b>maksimal 1&times;24 jam</b>. Terima kasih telah menyelesaikan kewajiban Anda. Salam profit! 🚀', 'ok') +
                infoBox('Masa perpanjangan dihitung dari <b>tanggal berakhir lisensi Anda</b>, bukan dari tanggal pembayaran. Jadi memperpanjang lebih awal <b>tidak membuat sisa hari Anda hangus</b> &mdash; justru lebih aman agar EA tidak terputus.', 'info');
    sendMailUser({
      to: email,
      subject: 'EA Apocalypto — ID Anda Telah Direhabilitasi',
      body: 'ID / akun Anda telah direhabilitasi dan aktif kembali. Silakan pasang ulang EA ke chart.',
      htmlBody: emailShell('ID Direhabilitasi', nama, introU, rowsU, noteU, '#1E7A46'),   // header HIJAU
      name: 'EA Apocalypto'
    });
    maybeWarnQuota();
  } catch (err) { console.error('sendRehabEmail gagal: ' + err); }
}

// (Email "Dinonaktifkan admin" DIHAPUS — SOP full-otomatis, tidak ada penonaktifan manual.)

// ---------- 3b. REMINDER PERPANJANG: cek harian, kirim saat sisa <= 3 hari ----------
function checkExpiringLicenses() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var tz = Session.getScriptTimeZone();
  var now = new Date();

  for (var r = 2; r <= last; r++) {
    var status = (sheet.getRange(r, 3).getValue() || '').toString().toUpperCase().trim();
    if (status !== 'ACTIVE') continue;

    var exp = sheet.getRange(r, 2).getValue();                     // B Expired
    if (!exp || !(exp instanceof Date)) continue;

    var daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);

    // ---- SUDAH LEWAT EXPIRED: nonaktifkan otomatis + email "berakhir" (sekali) ----
    if (daysLeft < 0) {
      sheet.getRange(r, 3).setValue('Inactive');                   // C Status -> Inactive
      var emailExp = (sheet.getRange(r, 7).getValue() || '').toString().trim();
      if (emailExp) { try { sendExpiredEmail(sheet, r, exp); } catch (e0) {} }
      continue;   // baris jadi Inactive -> tidak diproses lagi besok
    }

    if (daysLeft > 3) continue;                                    // belum masuk H-3

    var expStr = Utilities.formatDate(new Date(exp), tz, 'yyyy.MM.dd');
    var remindedFor = (sheet.getRange(r, 16).getValue() || '').toString().trim(); // P
    if (remindedFor === expStr) continue;                          // sudah diingatkan utk siklus ini

    var email = (sheet.getRange(r, 7).getValue() || '').toString().trim();
    if (email) sendRenewalReminder(sheet, r, exp, daysLeft);
    sheet.getRange(r, 16).setValue(expStr);                        // P tandai sudah diingatkan
  }
}

// Email ke user: masa lisensi TELAH BERAKHIR & EA dinonaktifkan otomatis.
function sendExpiredEmail(sheet, row, expDate){
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();   // G Email
    if (!email) return;
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();   // D Nama
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();   // A Login
    var expID = formatTanggalID(expDate);                                      // "03 Januari 2027"
    var introU = '<p style="margin:0 0 12px;">Masa aktif lisensi EA Apocalypto Anda telah <b>berakhir</b>, dan EA kini <b>nonaktif</b> otomatis.</p>';
    var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status', 'NONAKTIF (Expired)'], ['Berakhir pada', expID, true] ];
    var noteU = infoBox('Untuk mengaktifkan EA kembali, silakan lakukan <b>perpanjangan</b> dengan menghubungi admin. Setelah diperpanjang, Anda akan menerima email konfirmasi dan EA otomatis berjalan lagi.', 'warn') +
                infoBox('Masa perpanjangan dihitung dari <b>tanggal berakhir lisensi Anda</b>, bukan dari tanggal pembayaran. Jadi memperpanjang lebih awal <b>tidak membuat sisa hari Anda hangus</b> &mdash; justru lebih aman agar EA tidak terputus.', 'info');
    sendMailUser({
      to: email,
      subject: 'EA Apocalypto — Lisensi Anda Telah Berakhir',
      body: 'Lisensi akun Anda berakhir pada ' + expID + ' dan EA dinonaktifkan. Hubungi admin untuk perpanjangan: ' + ADMIN_WA_URL,
      htmlBody: emailShell('Lisensi Berakhir', nama, introU, rowsU, noteU, '#B45309'),   // header amber
      name: 'EA Apocalypto'
    });
    maybeWarnQuota();
  } catch (err) { console.error('sendExpiredEmail gagal: ' + err); }
}

// Email pengingat perpanjang ke user
function sendRenewalReminder(sheet, row, expDate, daysLeft) {
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();
    if (!email) return;
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();
    var expStr = formatTanggalID(expDate);   // "03 Januari 2027"
    var sisa = (daysLeft <= 0) ? 'hari ini' : (daysLeft + ' hari lagi');
    var introU = '<p style="margin:0 0 12px;">Masa aktif lisensi EA Apocalypto Anda akan <b>segera berakhir</b>.</p>';
    var rowsU = [ ['Nomor Akun / Login MT5', login], ['Berakhir pada', expStr + ' (' + sisa + ')', true] ];
    var noteU = infoBox('Agar EA tetap berjalan tanpa terputus, silakan lakukan <b>perpanjangan</b> sebelum tanggal tersebut. Hubungi admin untuk proses perpanjangan.', 'warn') +
                infoBox('Masa perpanjangan dihitung dari <b>tanggal berakhir lisensi Anda</b>, bukan dari tanggal pembayaran. Jadi memperpanjang lebih awal <b>tidak membuat sisa hari Anda hangus</b> &mdash; justru lebih aman agar EA tidak terputus.', 'info');
    sendMailUser({
      to: email,
      subject: 'EA Apocalypto — Lisensi Akan Berakhir (' + sisa + ')',
      body: 'Lisensi Anda berakhir ' + expStr + ' (' + sisa + '). Hubungi admin untuk perpanjangan: ' + ADMIN_WA_URL,
      htmlBody: emailShell('Pengingat Perpanjangan Lisensi', nama, introU, rowsU, noteU),
      name: 'EA Apocalypto'
    });
    maybeWarnQuota();
  } catch (err) { /* diamkan */ }
}

// Email ke user Real bahwa lisensinya sudah DIAKTIFKAN admin
function sendActivationEmail(sheet, row, expDate) {
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();   // G Email
    if (!email) return;
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();   // D Nama Panggilan
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();   // A Login
    var expStr = Utilities.formatDate(new Date(expDate), Session.getScriptTimeZone(), 'yyyy.MM.dd');
    // CATATAN: email ini TIDAK melampirkan file EA (user sudah dapat di email pertama).
    // Tanpa lampiran, respons sinkronisasi EA jadi cepat (hindari "Gagal Konek" krn timeout).
    // CATATAN: email ini TIDAK melampirkan file EA (user sudah dapat di email pertama).
    var introU = '<p style="margin:0 0 12px;"><b>Kabar baik!</b> Lisensi EA Apocalypto untuk akun Anda sudah <b>AKTIF</b> dan siap dijalankan.</p>';
    var expID = formatTanggalID(expDate);   // "03 Januari 2027"
    var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status', 'AKTIF'], ['Berlaku sampai', expID, true] ];
    var noteU = infoBox('EA Anda sekarang sudah bisa dijalankan. File EA &amp; panduan sudah kami kirim pada email pendaftaran &mdash; bila terlewat, silakan hubungi admin.', 'ok');
    sendMailUser({
      to: email,
      subject: 'EA Apocalypto — Lisensi Anda Sudah AKTIF',
      body: 'Lisensi akun Anda sudah AKTIF, berlaku sampai ' + expID + '. EA siap dijalankan.',
      htmlBody: emailShell('Lisensi Aktif', nama, introU, rowsU, noteU, '#1E7A46'),   // header HIJAU
      name: 'EA Apocalypto'
    });
    maybeWarnQuota();
  } catch (err) { console.error('sendActivationEmail gagal: ' + err); }
}

// Email SOPAN & profesional ke pendaftar bahwa pendaftaran TIDAK DISETUJUI (Reject, bukan blacklist).
// Dikirim saat admin ubah Status jadi "Rejected". EA tetap nonaktif; WA/email orangnya TIDAK diblokir.
function sendRejectionEmail(sheet, row) {
  try {
    var email = (sheet.getRange(row, 7).getValue() || '').toString().trim();   // G Email
    if (!email) return;
    var nama  = (sheet.getRange(row, 4).getValue() || '').toString().trim();   // D Nama Panggilan
    var login = (sheet.getRange(row, 1).getValue() || '').toString().trim();   // A Login
    var introU = '<p style="margin:0 0 12px;">Terima kasih atas minat Anda terhadap EA Apocalypto dan telah melakukan pendaftaran. Setelah kami tinjau, dengan menyesal kami sampaikan bahwa pendaftaran berikut <b>belum dapat kami proses saat ini</b>.</p>';
    var rowsU = [ ['Nomor Akun / Login MT5', login], ['Status', 'Tidak Disetujui'] ];
    var noteU = infoBox('Hal ini dapat terjadi karena data yang belum lengkap atau kurang sesuai, maupun pendaftaran ganda. Bila Anda merasa ini keliru atau ingin mendaftar ulang dengan data yang benar, silakan hubungi admin kami &mdash; dengan senang hati kami bantu.', 'danger');
    sendMailUser({
      to: email,
      subject: 'EA Apocalypto — Informasi Status Pendaftaran',
      body: 'Mohon maaf, pendaftaran untuk akun ' + login + ' belum dapat kami proses saat ini. Silakan hubungi admin bila ada pertanyaan. Salam, Tim EA Apocalypto.',
      htmlBody: emailShell('Informasi Status Pendaftaran', nama, introU, rowsU, noteU, '#7A2E2E'),   // header merah tua
      name: 'EA Apocalypto'
    });
    maybeWarnQuota();
  } catch (err) { console.error('sendRejectionEmail gagal: ' + err); }
}

// ---- TES: jalankan dari editor utk memastikan pengiriman email berfungsi ----
// Pilih fungsi "tesEmailAktivasi" -> Run. Cek Inbox ADMIN_EMAIL & lihat log (View > Executions).
function tesEmailAktivasi(){
  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('Sisa kuota email hari ini: ' + quota);
  MailApp.sendEmail({
    to: ADMIN_EMAIL,
    subject: 'TES Kirim Email — EA Apocalypto',
    body: 'Email tes berhasil dikirim. MailApp berfungsi normal. Sisa kuota: ' + quota,
    name: 'EA Apocalypto'
  });
  Logger.log('OK: email tes terkirim ke ' + ADMIN_EMAIL);
}

// ---- TES KIRIM KE ALAMAT EKSTERNAL (Gmail/non-apocalypto.id) ----
// Pakai utk cek apakah restriksi "akun baru" sudah lepas.
// Jalankan -> cek INBOX masmoel.trading@gmail.com (termasuk Spam).
//   - Kalau MASUK  : pengiriman eksternal SUDAH jalan (akun matang) -> email pendaftar aman.
//   - Kalau TIDAK  : masih masa tunggu akun baru. Lihat juga angka "Sisa kuota":
//                    ~100 = masih terkunci, ~1500 = sudah lepas.
function tesEmailEksternal(){
  var tujuan = 'masmoel.trading@gmail.com';   // ganti bila ingin tes ke alamat luar lain
  var quota = MailApp.getRemainingDailyQuota();
  Logger.log('Sisa kuota email hari ini: ' + quota);
  MailApp.sendEmail({
    to: tujuan,
    subject: 'TES Kirim EKSTERNAL — EA Apocalypto',
    body: 'Jika email ini masuk, berarti pengiriman ke alamat luar sudah berfungsi. Sisa kuota: ' + quota,
    name: 'EA Apocalypto'
  });
  Logger.log('OK: email tes EKSTERNAL terkirim ke ' + tujuan + ' (cek inbox + Spam di sana)');
}

// Peringatkan admin (SEKALI per hari) bila sisa kuota email harian menipis.
// Dipanggil otomatis di akhir setiap pengiriman email penting.
function maybeWarnQuota(){
  try{
    var left = MailApp.getRemainingDailyQuota();
    if (left > QUOTA_WARN_AT) return;                              // masih aman
    var props = PropertiesService.getScriptProperties();
    var today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
    if (props.getProperty('quotaWarnedDate') === today) return;    // sudah diperingatkan hari ini
    props.setProperty('quotaWarnedDate', today);                   // tandai dulu (hindari dobel)
    if (left <= 0) return;                                         // kuota habis: tak bisa kirim peringatan
    MailApp.sendEmail(ADMIN_EMAIL, '⚠️ Kuota Email Hampir Habis — EA Apocalypto',
      'Peringatan otomatis:\n\n' +
      'Sisa kuota pengiriman email hari ini tinggal ' + left + '.\n\n' +
      'Bila kuota habis, email otomatis (aktivasi lisensi, invoice, reminder perpanjang, ' +
      'konfirmasi pendaftaran) BISA GAGAL terkirim tanpa pemberitahuan. ' +
      'Kuota akan reset otomatis dalam 24 jam.\n\n' +
      'Saran: tunda dulu aktivasi/kirim invoice massal sampai kuota pulih, ' +
      'atau gunakan akun Google Workspace (kuota 1.500/hari) bila kebutuhan tinggi.\n\n' +
      'Apocalypto System', { name:'Apocalypto System' });
  }catch(e){ console.error('maybeWarnQuota: ' + e); }
}

// Pasang installable trigger onStatusEdit + trigger harian reminder (dipanggil dari setupSheet)
function installTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    var fn = triggers[i].getHandlerFunction();
    if (fn === 'onStatusEdit' || fn === 'checkExpiringLicenses' || fn === 'monthlyBillingRun') ScriptApp.deleteTrigger(triggers[i]);
  }
  // trigger saat admin ubah Status/Blacklist/Expired -> email & cascade
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(ss).onEdit().create();
  // trigger harian (±jam 9 pagi) -> cek lisensi yg akan habis <= 3 hari + auto-nonaktif expired
  ScriptApp.newTrigger('checkExpiringLicenses').timeBased().everyDays(1).atHour(9).create();
  // trigger HARIAN (jam BILLING_HOUR) -> penagihan profit sharing bulan lalu, dijalankan tiap hari
  // (bukan cuma tgl 1) supaya akun yg datanya belum lengkap ditagih begitu datanya siap. Jam dipilih
  // agar SEMUA broker sudah masuk hari baru (broker paling lambat ~7 jam di belakang lokal).
  ScriptApp.newTrigger('monthlyBillingRun').timeBased().everyDays(1).atHour(BILLING_HOUR).create();
}

// ---------- 4. SETUP SEKALI: rapikan kolom, header, rumus, warna ----------
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);

  // (a) Hapus kolom-kolom LAMA yang sudah tidak dipakai (cocokkan nama header).
  //     Termasuk: Broker, VPS Adress, Password Investor, Periode Penagihan, Total Profit.
  //     Data otomatis bergeser kiri -> cocok dgn susunan kolom baru (A..P).
  var obsolete = ['broker', 'vps adress', 'vps address',
                  'password investor / read-only', 'password investor',
                  'periode penagihan', 'total profit'];
  var lastCol = sheet.getLastColumn();
  var hdr = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var c = hdr.length; c >= 1; c--) {   // kanan -> kiri agar index tidak bergeser saat dihapus
    var h = (hdr[c - 1] || '').toString().trim().toLowerCase();
    if (obsolete.indexOf(h) >= 0) sheet.deleteColumn(c);
  }

  // (b) Tulis header final (baris 1 saja)
  ensureHeaders(sheet);

  // (b2) Ubah tanggal Expired yang masih berupa TEKS jadi tanggal asli
  //      (supaya rumus Sisa Waktu tidak #VALUE!)
  normalizeExpiredDates(sheet);

  // (c) Pasang rumus Sisa Waktu utk semua baris berisi akun
  var last = sheet.getLastRow();
  for (var r = 2; r <= last; r++) {
    if (sheet.getRange(r, 1).getValue() !== '') {
      sheet.getRange(r, 5).setFormula('=IF($B' + r + '="","",INT($B' + r + '-NOW()))');
    }
  }

  // (d) Warna kuning saat Sisa Waktu <= 3 hari (0..3)
  applySisaWaktuFormat(sheet);

  // (e) Pasang checkbox kolom Blacklist (P) utk semua baris berisi akun
  applyBlacklistCheckboxes(sheet);

  // (e2) Pasang dropdown Status (Active/Inactive/Pending/Rejected) di semua baris berisi akun
  applyStatusValidation(sheet);

  // (f) Pasang installable trigger utk email aktivasi (Status -> Active)
  installTriggers();

  // (g) Buat tab "Invoice" utk pencatatan penagihan
  ensureInvoiceTab();

  // (h) Buat tab "Profit" utk pencatatan profit bulanan otomatis dari EA
  ensureProfitTab();

  // (i) Bersihkan baris ganda di tab Profit (kalau ada) + rapikan kolom Bulan jadi teks
  dedupeProfitSheet();
}

// Pasang dropdown Status (Active/Inactive/Pending/Rejected) di kolom C semua baris berisi akun.
function applyStatusValidation(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var rule = SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive', 'Pending', 'Rejected'], true).build();
  sheet.getRange(2, 3, last - 1, 1).setDataValidation(rule);   // kolom C mulai baris 2
}

// ================= PROFIT BULANAN (otomatis dari EA) =================
// EA mengirim: ?action=profit&login=..&server=..&role=..&month=YYYY-MM&profit=..&bal=..&eq=..
// Dicatat ke tab "Profit": 1 baris per (Login + Bulan), UPSERT (diperbarui tiap hari).
function ensureProfitHeaders(sh){
  var head = ['Login','Server','Role','Bulan','Profit','Balance','Equity','Update Terakhir','Final'];
  // Selalu tulis ulang baris header (idempoten) supaya tab lama ikut dapat kolom 'Final'.
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  sh.setFrozenRows(1);
  try { sh.getRange(1, 4, sh.getMaxRows(), 1).setNumberFormat('@'); } catch (e) {}  // kolom Bulan = TEKS (cegah "2026-10" jadi tanggal)
}
function ensureProfitTab(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFIT_SHEET) || ss.insertSheet(PROFIT_SHEET);
  ensureProfitHeaders(sh);
}

// Bersihkan baris GANDA di tab Profit: sisakan 1 baris per (Login + Bulan),
// ambil yang paling baru (Update Terakhir), sekaligus rapikan Bulan jadi teks 'YYYY-MM'.
function dedupeProfitSheet(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFIT_SHEET);
  if (!sh) return;
  var last = sh.getLastRow();
  if (last < 2) return;
  var data = sh.getRange(1, 1, last, 9).getValues();   // termasuk kolom I "Final"
  var keep = {};   // key "login|YYYY-MM" -> {row, ms}
  for (var i = 1; i < data.length; i++){
    var login = String(data[i][0]).trim();
    if (!login) continue;
    var mk = monthKey(data[i][3]);
    var key = login + '|' + mk;
    var upd = data[i][7];
    var ms = (upd instanceof Date) ? upd.getTime() : (new Date(upd)).getTime();
    if (isNaN(ms)) ms = i;
    var fin = (String(data[i][8]||'').toUpperCase() === 'YES');
    var row = [ data[i][0], data[i][1], data[i][2], mk, data[i][4], data[i][5], data[i][6], data[i][7], (fin?'YES':'') ];
    if (!keep[key] || ms >= keep[key].ms){
      if (keep[key] && String(keep[key].row[8]).toUpperCase()==='YES') row[8] = 'YES';   // pertahankan Final=YES
      keep[key] = { row: row, ms: ms };
    } else if (fin && String(keep[key].row[8]).toUpperCase()!=='YES'){
      keep[key].row[8] = 'YES';   // baris lama ternyata final -> tandai yg disimpan
    }
  }
  var out = [];
  for (var k in keep) out.push(keep[k].row);
  out.sort(function(a, b){ return (a[0] === b[0]) ? (a[3] < b[3] ? -1 : 1) : (String(a[0]) < String(b[0]) ? -1 : 1); });
  if (last >= 2) sh.getRange(2, 1, last - 1, 9).clearContent();
  if (out.length){
    sh.getRange(2, 4, out.length, 1).setNumberFormat('@');   // Bulan = teks
    sh.getRange(2, 1, out.length, 9).setValues(out);
  }
  SpreadsheetApp.flush();
}
function handleProfit(e){
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try{
    var p = (e && e.parameter) ? e.parameter : {};
    var login = String(p.login || '').trim();
    var month = String(p.month || '').trim();   // format YYYY-MM dari EA
    if (!login || !month) return ContentService.createTextOutput('ERR:NO_LOGIN_OR_MONTH').setMimeType(ContentService.MimeType.TEXT);
    if (!isDigitsStr(login) || !/^\d{4}-\d{2}$/.test(month)) return ContentService.createTextOutput('ERR:BAD_INPUT').setMimeType(ContentService.MimeType.TEXT);
    var fProfit = Number(p.profit||0), fBal = Number(p.bal||0), fEq = Number(p.eq||0);
    if (!isFinite(fProfit) || Math.abs(fProfit) > 1e8) return ContentService.createTextOutput('ERR:BAD_PROFIT').setMimeType(ContentService.MimeType.TEXT);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(PROFIT_SHEET) || ss.insertSheet(PROFIT_SHEET);
    ensureProfitHeaders(sh);

    var vals = [ login, String(p.server||''), String(p.role||''), month,
                 fProfit, fBal, fEq, new Date() ];

    // UPSERT: cari baris dgn Login + Bulan sama -> update; kalau belum ada -> tambah baris baru.
    // Pakai monthKey() agar cocok walau Sheets menyimpan Bulan sebagai tanggal.
    var data = sh.getDataRange().getValues();
    var rowIdx = -1;
    for (var i = 1; i < data.length; i++){
      if (String(data[i][0]).trim() === login && monthKey(data[i][3]) === month){ rowIdx = i + 1; break; }
    }
    if (rowIdx < 0) rowIdx = sh.getLastRow() + 1;          // baris baru
    sh.getRange(rowIdx, 4).setNumberFormat('@');           // Bulan tetap TEKS (cegah auto-tanggal)
    sh.getRange(rowIdx, 1, 1, 8).setValues([vals]);
    // final=1 -> EA menandai bulan ini SUDAH TUTUP & dikirim utuh (dipakai gate penagihan).
    if (String(p.final||'') === '1') sh.getRange(rowIdx, 9).setValue('YES');

    return ContentService.createTextOutput('OK').setMimeType(ContentService.MimeType.TEXT);
  } catch(err){
    return ContentService.createTextOutput('ERR:' + err).setMimeType(ContentService.MimeType.TEXT);
  } finally {
    try { lock.releaseLock(); } catch(e2){}
  }
}

// Jadikan kolom N (Blacklist) checkbox; sel kosong -> FALSE (belum blacklist)
function applyBlacklistCheckboxes(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var col = 14; // N
  var rng = sheet.getRange(2, col, last - 1, 1);
  var vals = rng.getValues();
  for (var i = 0; i < vals.length; i++) {
    if (vals[i][0] === '' || vals[i][0] === null) vals[i][0] = false;
    else vals[i][0] = isBlacklisted(vals[i][0]); // teks lama (YA/x) -> boolean
  }
  rng.setValues(vals);
  rng.setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
}

function ensureHeaders(sheet) {
  sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
  sheet.setFrozenRows(1);
}

// Ubah teks tanggal (mis. "2026.12.31 23:59") di kolom B jadi Date asli.
// EA tetap kompatibel: doGet membaca Date -> diformat "yyyy.MM.dd".
function normalizeExpiredDates(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  var rng = sheet.getRange(2, 2, last - 1, 1); // kolom B (Expired)
  var vals = rng.getValues();
  var changed = false;
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i][0];
    if (v === '' || v === null) continue;
    if (v instanceof Date) continue;            // sudah tanggal asli
    var d = parseExpired(v.toString());
    if (d) { vals[i][0] = d; changed = true; }
  }
  if (changed) rng.setValues(vals);
  rng.setNumberFormat('yyyy.MM.dd HH:mm');
}

// Parse "2026.12.31", "2026-12-31", "2026/12/31 23:59", dll -> Date
function parseExpired(s) {
  s = s.toString().trim();
  var m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return null;
  var y  = parseInt(m[1], 10);
  var mo = parseInt(m[2], 10) - 1;
  var da = parseInt(m[3], 10);
  var hh = m[4] ? parseInt(m[4], 10) : 23;
  var mi = m[5] ? parseInt(m[5], 10) : 59;
  return new Date(y, mo, da, hh, mi, 0);
}

function applySisaWaktuFormat(sheet) {
  var range = sheet.getRange('E2:E10000');
  // buang rule lama yang menyasar kolom E supaya tidak dobel
  var rules = sheet.getConditionalFormatRules().filter(function (rule) {
    var rs = rule.getRanges();
    for (var i = 0; i < rs.length; i++) { if (rs[i].getColumn() === 5) return false; }
    return true;
  });
  var rule = SpreadsheetApp.newConditionalFormatRule()
    .whenNumberBetween(0, 3)
    .setBackground('#FFE58A')
    .setRanges([range])
    .build();
  rules.push(rule);
  sheet.setConditionalFormatRules(rules);
}

// (LOGIN ADMIN / password halaman penagihan DIHAPUS — halaman tidak dipakai lagi.
//  Satu-satunya akses berkunci yang tersisa = link "Tandai Lunas" di email admin,
//  yang memverifikasi ADMIN_KEY langsung di cabang action=paid.)

// ================= PENAGIHAN / INVOICE =================
function formatRupiah(n){
  n = Math.round(Number(n) || 0);
  return 'Rp ' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
// Format USD gaya Indonesia: $ 1.234,56
function formatUSD(n){
  n = Number(n) || 0;
  var s = n.toFixed(2).split('.');
  s[0] = s[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return '$ ' + s[0] + ',' + s[1];
}
function parsePersen(s){
  // Sel bisa berupa: angka persen (0.05 = 5%), angka biasa (5 = 5%), atau teks ("5%").
  if (typeof s === 'number') {
    return s <= 1 ? s * 100 : s;   // 0.05 -> 5 ; 5 -> 5
  }
  var m = (s || '').toString().match(/(\d+(\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}
// Tampilkan Periode rapi "September 2026" walau di sheet tersimpan sbg tanggal
// (Date) ATAU sbg teks tanggal panjang (mis. "Tue Sep 01 2026 00:00:00 GMT+0700 ...").
function formatPeriode(v){
  var bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var tz = Session.getScriptTimeZone();
  var d = null;
  if (v instanceof Date) {
    d = v;
  } else {
    var s = (v || '').toString().trim();
    if (!s) return '';
    // Hanya perlakukan sbg tanggal bila teksnya memang berbentuk tanggal (ada penanda jam/GMT/pemisah tanggal).
    // Teks bebas seperti "September 2026" atau "Q3 2026" dibiarkan apa adanya.
    if (/\d{4}/.test(s) && /(GMT|\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|\d{4}-\d{2}-\d{2})/.test(s)) {
      var maybe = new Date(s);
      if (!isNaN(maybe.getTime())) d = maybe;
    }
    if (!d) return s;
  }
  var mo = parseInt(Utilities.formatDate(d, tz, 'M'), 10) - 1;
  var yr = Utilities.formatDate(d, tz, 'yyyy');
  return (bulan[mo] || '') + ' ' + yr;
}
// Ambil kurs USD->IDR terkini (saat invoice dibuat). Coba 2 sumber gratis, lalu cadangan manual.
function getKurs(){
  var rate = null;
  try {
    var r1 = UrlFetchApp.fetch('https://open.er-api.com/v6/latest/USD', { muteHttpExceptions:true });
    if (r1.getResponseCode() === 200){
      var j1 = JSON.parse(r1.getContentText());
      if (j1 && j1.rates && j1.rates.IDR) rate = Number(j1.rates.IDR);
    }
  } catch(e){}
  if (!rate){
    try {
      var r2 = UrlFetchApp.fetch('https://api.frankfurter.app/latest?from=USD&to=IDR', { muteHttpExceptions:true });
      if (r2.getResponseCode() === 200){
        var j2 = JSON.parse(r2.getContentText());
        if (j2 && j2.rates && j2.rates.IDR) rate = Number(j2.rates.IDR);
      }
    } catch(e){}
  }
  if (!rate && Number(KURS_FALLBACK) > 0) rate = Number(KURS_FALLBACK);
  if (!rate) return null;
  rate = rate * (1 + (Number(KURS_MARGIN_PCT) || 0) / 100);
  return Math.round(rate);
}
// Kode unik: kalau tagihan bulat (kelipatan 1.000), ganti 3 digit terakhir jadi 100-999 utk cek mutasi.
function applyKodeUnik(tagihan){
  if (tagihan > 0 && tagihan % 1000 === 0){
    var kode = Math.floor(Math.random() * 900) + 100; // 100..999
    return { tagihan: tagihan + kode, kode: kode };
  }
  return { tagihan: tagihan, kode: 0 };
}
function findMemberRow(sheet, login){
  var data = sheet.getDataRange().getValues();
  login = (login || '').toString().trim();
  for (var i = 1; i < data.length; i++){
    if (data[i][0].toString().trim() === login) return i + 1;
  }
  return -1;
}

// Ambil nilai Profit (kolom E tab Profit) utk login + bulan. null bila baris tak ada.
function getProfitFromTab(login, month){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFIT_SHEET);
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  login = (login || '').toString().trim();
  month = monthKey(month);
  var best = null, bestMs = -1;
  for (var i = 1; i < data.length; i++){
    if (String(data[i][0]).trim() === login && monthKey(data[i][3]) === month){
      var upd = data[i][7];
      var ms = (upd instanceof Date) ? upd.getTime() : (new Date(upd)).getTime();
      if (isNaN(ms)) ms = i;
      if (ms >= bestMs){ bestMs = ms; best = Number(data[i][4]) || 0; }   // ambil update TERBARU
    }
  }
  return best;   // null kalau tak ada data
}
// Seperti getProfitFromTab tapi kembalikan {profit, updMs} (timestamp laporan terakhir) utk cek kesegaran data invoice.
function getProfitMeta(login, month){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(PROFIT_SHEET);
  if (!sh) return null;
  var data = sh.getDataRange().getValues();
  login = (login || '').toString().trim();
  month = monthKey(month);
  var best = null, bestMs = -1;
  for (var i = 1; i < data.length; i++){
    if (String(data[i][0]).trim() === login && monthKey(data[i][3]) === month){
      var upd = data[i][7];
      var ms = (upd instanceof Date) ? upd.getTime() : (new Date(upd)).getTime();
      if (isNaN(ms)) ms = 0;
      if (ms >= bestMs){ bestMs = ms; best = { profit: Number(data[i][4]) || 0, updMs: ms, final: (String(data[i][8]||'').toUpperCase()==='YES') }; }
    }
  }
  return best;   // null kalau tak ada data
}
// Normalisasi nilai Bulan ke 'YYYY-MM' — tahan banting walau Sheets ubah jadi Date atau 'YYYY-MM-DD'.
function monthKey(v){
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM');
  var s = String(v||'').trim();
  var m = s.match(/^(\d{4})-(\d{1,2})/);
  if (m) return m[1] + '-' + ('0'+m[2]).slice(-2);
  return s;
}

// '2026-10' -> 'Oktober 2026'
function monthToPeriode(month){
  var bulan = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  var m = (month || '').toString().match(/^(\d{4})-(\d{2})$/);
  if (!m) return (month || '').toString();
  return (bulan[parseInt(m[2], 10) - 1] || '') + ' ' + m[1];
}

// Tarik data member utk invoice. Profit & periode OTOMATIS dari tab Profit.
//   month (opsional, "YYYY-MM"): bulan yang ditagih. Default = bulan berjalan.
function getBillData(login, month){
  login = (login || '').toString().trim();
  if (!login) return { ok:false, error:'NO_LOGIN' };
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var row = findMemberRow(sheet, login);
  if (row < 0) return { ok:false, error:'NOT_FOUND' };
  var v = sheet.getRange(row, 1, 1, 16).getValues()[0];
  var jenis  = (v[14] || '').toString();      // O Jenis Akun (mis. "USD / Real", "Cent / Real", "USD / Demo")
  var isCent = /cent/i.test(jenis);           // akun Cent -> profit dari EA 100x lipat
  var persen = parsePersen(v[10]);            // K Profit Sharing

  // Bulan yang ditagih: pakai param, atau default bulan berjalan (YYYY-MM).
  var tz = Session.getScriptTimeZone();
  month = (month || '').toString().trim();
  if (!/^\d{4}-\d{2}$/.test(month)) month = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  var periode = monthToPeriode(month);

  // Profit OTOMATIS dari tab Profit (login + bulan). null = belum ada datanya.
  var meta = getProfitMeta(login, month);
  if (meta === null) return { ok:false, error:'NO_PROFIT', periode:periode, month:month };
  var profitRaw = meta.profit;
  var profitUSD = isCent ? (profitRaw / 100) : profitRaw;   // akun Cent -> bagi 100 jadi USD

  // Data siap ditagih HANYA bila EA sudah menandai bulan ini "final" (ditulis utuh saat ganti bulan).
  // Backend tidak menebak weekend/libur — cukup percaya penanda final dari EA.
  var finalized = (meta.final === true);
  var lastUpdateStr = meta.updMs ? Utilities.formatDate(new Date(meta.updMs), tz, 'yyyy-MM-dd HH:mm') : '';

  var shareUSD = profitUSD * persen / 100;    // bagian profit sharing dalam USD
  var kurs = getKurs();                        // kurs saat ini (Rp/USD)
  var tagihan = kurs ? Math.round(shareUSD * kurs) : 0;
  return {
    ok:true, login:login, month:month,
    finalized:finalized, lastUpdateStr:lastUpdateStr,
    nama:(v[3]||'').toString(), email:(v[6]||'').toString(), wa:(v[5]||'').toString(),
    status:(v[2]||'').toString(),
    jenis:jenis, satuan:(isCent ? 'Cent' : 'USD'),
    persen:persen, periode:periode,
    profitInput:profitUSD,
    profitUSD:profitUSD, profitUSDStr: formatUSD(profitUSD),
    shareUSD:shareUSD, shareUSDStr: formatUSD(shareUSD),
    kurs:kurs, kursStr: kurs ? formatRupiah(kurs) : '(gagal ambil kurs)',
    tagihan:tagihan, tagihanStr: formatRupiah(tagihan),
    bank:{ nama:BANK_NAMA, rek:BANK_REK, an:BANK_AN }
  };
}

function ensureInvoiceHeaders(inv){
  var head = ['No Invoice','Tanggal','Login MT5','Nama','Email','Periode','Profit (input)','Satuan','Profit USD','Persen','Kurs','Tagihan','Kode Unik','Status','Waktu Lunas'];
  // Selalu tulis ulang baris header (idempoten) agar tab lama ikut ter-update ke kolom baru.
  inv.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  inv.setFrozenRows(1);
}
function ensureInvoiceTab(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = ss.getSheetByName(INVOICE_SHEET) || ss.insertSheet(INVOICE_SHEET);
  ensureInvoiceHeaders(inv);
}

// Buat invoice: catat ke tab Invoice + kirim email member + notif admin
function createInvoice(login, month){
  var b = getBillData(login, month);
  if (!b.ok) return { result:'error', error:b.error };
  if (!b.email) return { result:'error', error:'NO_EMAIL' };
  if (!(b.shareUSD > 0)) return { result:'error', error:'NO_PROFIT' };   // profit <= 0 -> tidak ditagih (jika profit saja)
  if (!b.kurs) return { result:'error', error:'NO_KURS' };

  // Hitung tagihan pakai kurs SAAT INI + tambah kode unik bila bulat
  var base = Math.round(b.shareUSD * b.kurs);
  var uc = applyKodeUnik(base);
  b.tagihan = uc.tagihan;
  b.tagihanStr = formatRupiah(uc.tagihan);
  b.kodeUnik = uc.kode;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = ss.getSheetByName(INVOICE_SHEET) || ss.insertSheet(INVOICE_SHEET);
  ensureInvoiceHeaders(inv);
  var invId = 'INV' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  inv.appendRow([ invId, new Date(), b.login, b.nama, b.email, b.periode,
                  b.profitInput, b.satuan, Math.round(b.profitUSD * 100) / 100, b.persen + '%',
                  b.kurs, b.tagihan, (b.kodeUnik || ''), 'Belum Lunas', '' ]);
  try { sendInvoiceEmail(b, invId); } catch (e) {}
  try { sendAdminInvoiceNotif(b, invId); } catch (e) {}
  return { result:'ok', invId:invId, tagihan:b.tagihan, tagihanStr:b.tagihanStr,
           email:b.email, kurs:b.kurs, kursStr:formatRupiah(b.kurs), kodeUnik:(b.kodeUnik || 0) };
}

// Cek apakah invoice utk login+periode sudah pernah dibuat (hindari tagih dobel).
function invoiceExistsFor(login, periode){
  var inv = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(INVOICE_SHEET);
  if (!inv) return false;
  var data = inv.getDataRange().getValues();
  login = (login || '').toString().trim();
  periode = (periode || '').toString().trim();
  for (var i = 1; i < data.length; i++){
    if ((data[i][2] || '').toString().trim() === login &&     // kolom C Invoice: Login MT5
        (data[i][5] || '').toString().trim() === periode) return true;  // kolom F Invoice: Periode
  }
  return false;
}

// Laporan profit bulanan utk akun DEMO (GRATIS): catat ke tab Invoice (label Free) + email.
function createDemoStatement(login, month){
  var b = getBillData(login, month);
  if (!b.ok) return { result:'error', error:b.error };     // tak ada data profit -> lewati
  if (!b.email) return { result:'error', error:'NO_EMAIL' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = ss.getSheetByName(INVOICE_SHEET) || ss.insertSheet(INVOICE_SHEET);
  ensureInvoiceHeaders(inv);
  var invId = 'FREE' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  inv.appendRow([ invId, new Date(), b.login, b.nama, b.email, b.periode,
                  b.profitInput, 'Free', Math.round(b.profitUSD * 100) / 100, '0%',
                  '', 0, '', 'Free', '' ]);     // Tagihan 0, Status "Free"
  try { sendDemoStatementEmail(b, invId); } catch (e) {}
  return { result:'ok', invId:invId };
}

// Email laporan profit akun DEMO (GRATIS / tanpa tagihan).
function sendDemoStatementEmail(b, invId){
  var introU = '<p style="margin:0 0 12px;">Berikut laporan profit EA Apocalypto Anda.</p>';
  var rowsU = [
    ['No. Invoice', invId],
    ['Nomor Akun', b.login],
    ['Jenis Akun', b.jenis || 'USD / Demo'],
    ['Periode', b.periode],
    ['Total Profit', b.profitUSDStr],
    ['Tagihan', 'GRATIS', true]
  ];
  var noteU = infoBox('Akun Demo tidak dikenakan biaya apa pun. Jika nominal profit berbeda dengan perhitungan Anda, silakan menghubungi Admin.', 'warn');
  sendMailUser({
    to: b.email,
    subject: 'Invoice EA Apocalypto (GRATIS) — ' + b.periode,
    body: 'Invoice akun Demo periode ' + b.periode + ': ' + b.profitUSDStr + ' (GRATIS, tanpa tagihan).',
    htmlBody: emailShell('Invoice', b.nama, introU, rowsU, noteU),
    name: 'EA Apocalypto'
  });
  maybeWarnQuota();
}

// Laporan bulan RUGI/NOL utk akun REAL: tidak ditagih, kirim email dukungan + saran fitur.
// Dicatat ke tab Invoice (Status "Rugi", Tagihan 0) agar ada rekam jejak & tidak dobel kirim.
function createLossStatement(login, month){
  var b = getBillData(login, month);
  if (!b.ok) return { result:'error', error:b.error };     // tak ada data profit -> lewati
  if (!b.email) return { result:'error', error:'NO_EMAIL' };
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = ss.getSheetByName(INVOICE_SHEET) || ss.insertSheet(INVOICE_SHEET);
  ensureInvoiceHeaders(inv);
  var invId = 'LOSS' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss');
  inv.appendRow([ invId, new Date(), b.login, b.nama, b.email, b.periode,
                  b.profitInput, b.satuan, Math.round(b.profitUSD * 100) / 100, '0%',
                  '', 0, '', 'Rugi', '' ]);     // Tagihan 0, Status "Rugi"
  try { sendLossEncouragementEmail(b, invId); } catch (e) {}
  return { result:'ok', invId:invId };
}

// Email dukungan utk akun REAL yang profitnya minus/nol di akhir bulan (tanpa tagihan).
function sendLossEncouragementEmail(b, invId){
  var introU =
    '<p style="margin:0 0 12px;">Terima kasih telah mempercayakan perjalanan trading Anda bersama EA Apocalypto.</p>' +
    '<p style="margin:0 0 12px;">Pada periode <b>' + b.periode + '</b>, hasil akun Anda tercatat <b>' + b.profitUSDStr + '</b>, ' +
      'sehingga <b>tidak ada tagihan profit sharing</b> bulan ini — kami hanya membagi hasil saat Anda profit. ' +
      'Fluktuasi seperti ini adalah bagian yang wajar dari sebuah perjalanan trading; yang membedakan hasil jangka panjang ' +
      'bukanlah satu bulan, melainkan kedisiplinan dan strategi yang terus disempurnakan.</p>';
  var rowsU = [
    ['Nomor Akun', b.login],
    ['Periode', b.periode],
    ['Hasil Periode Ini', b.profitUSDStr],
    ['Tagihan', 'Tidak ada', true]
  ];
  var tips = infoBox(
    '🛡️ <b>Pastikan Cutloss aktif</b> — pengaman terpenting agar satu kejadian pasar ekstrem tidak menggerus modal terlalu dalam.<br><br>' +
    '🎯 <b>Gunakan Virtual Trigger</b> — biarkan robot “menunggu” beberapa layer maya sebelum masuk, agar posisi pertama dibuka di titik yang lebih baik dan tidak terlalu dini.<br><br>' +
    '🤝 <b>Kombinasi Penyelamat (Hold Marti + Tier 3)</b> — saat momentum melemah, hentikan penambahan layer lalu dekatkan target, supaya basket berusaha ditutup aman tanpa menambah risiko baru.<br><br>' +
    '⚖️ <b>Pertimbangkan Setup Konservatif</b> — multiplier dan lot awal yang lebih kecil membuat pertumbuhan risiko lebih landai dan napas akun lebih panjang.', 'info');
  var extraU =
    '<p style="margin:14px 0 0;">Kami ingin membantu Anda melangkah lebih baik di bulan berikutnya. Beberapa fitur Apocalypto yang bisa Anda manfaatkan:</p>' +
    tips +
    '<p style="margin:14px 0 0;">Setiap akun punya karakter yang berbeda. Jika Anda ingin kami bantu meninjau pengaturan yang paling sesuai dengan modal dan gaya Anda, silakan hubungi Admin — dengan senang hati kami dampingi.</p>' +
    '<p style="margin:12px 0 0;">Tetap tenang, tetap disiplin. Kami percaya proses yang baik akan menemukan hasilnya. 🌱</p>' +
    '<p style="font-size:12px;color:#999;font-style:italic;margin:14px 0 0;">Trading mengandung risiko, dan tidak ada pengaturan yang menjamin keuntungan. Saran di atas bersifat umum untuk membantu Anda mengelola risiko dengan lebih baik.</p>';
  sendMailUser({
    to: b.email,
    subject: 'Laporan Bulanan EA Apocalypto — ' + b.periode + ' 🌱',
    body: 'Periode ' + b.periode + ': hasil ' + b.profitUSDStr + '. Tidak ada tagihan profit sharing bulan ini. Tetap semangat & disiplin.',
    htmlBody: emailShell('Laporan & Dukungan Bulanan', b.nama, introU, rowsU, extraU),
    name: 'EA Apocalypto'
  });
  maybeWarnQuota();
}

// ---------- PENAGIHAN OTOMATIS: dijalankan trigger tiap tanggal 1 ----------
// Menagih profit sharing BULAN LALU utk SEMUA akun Real yang Active.
// Lewati: bukan Real, tidak Active, profit <= 0, atau invoice bulan itu sudah ada.
function monthlyBillingRun(){
  var tz = Session.getScriptTimeZone();
  var now = new Date();
  var prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);   // bulan lalu
  var month = Utilities.formatDate(prev, tz, 'yyyy-MM');
  var periode = monthToPeriode(month);

  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var data = sheet.getDataRange().getValues();
  var ok = 0, skip = 0;
  var needReview = [];   // akun Real aktif yg invoice-nya DITAHAN (data basi/kosong) -> verifikasi admin
  for (var i = 1; i < data.length; i++){
    var login = (data[i][0] || '').toString().trim();
    if (!login) continue;
    var status = (data[i][2] || '').toString().toUpperCase().trim();
    var jenis  = (data[i][14] || '').toString().toLowerCase();        // O Jenis Akun
    if (status !== 'ACTIVE') { skip++; continue; }                    // hanya aktif
    // Jangan proses periode SEBELUM member aktif (mis. tagih September utk member yg baru aktif Oktober).
    var actRaw = data[i][16] || data[i][12];                          // Q Tanggal Aktivasi (fallback M Waktu Daftar)
    if (actRaw) {
      var actKey = Utilities.formatDate(new Date(actRaw), tz, 'yyyy-MM');
      if (actKey > month) { skip++; continue; }                       // aktif setelah periode tagih -> lewati total
    }
    if (invoiceExistsFor(login, periode)) { skip++; continue; }      // sudah dikirim bulan itu
    var isReal = jenis.indexOf('real') >= 0;
    try {
      var r;
      if (isReal) {
        var bd = getBillData(login, month);
        var nmR = (data[i][3] || '').toString();
        if (!bd.ok) {                                                          // tak ada data profit -> TAHAN
          needReview.push(login + ' | ' + nmR + ' | TIDAK ADA data profit periode ini');
          r = { result:'skip', error: bd.error };
        } else if (!bd.finalized) {                                            // EA belum menandai bulan ini final -> TAHAN
          needReview.push(login + ' | ' + nmR + ' | menunggu EA menutup bulan (belum final; laporan terakhir ' + (bd.lastUpdateStr||'-') + ')');
          r = { result:'skip', error:'NOT_FINAL' };
        } else if (bd.shareUSD > 0) {
          r = createInvoice(login, month);                                     // data lengkap & profit -> invoice
        } else {
          r = createLossStatement(login, month);                               // data lengkap & rugi/nol -> email dukungan
        }
      } else {
        r = createDemoStatement(login, month);                                 // Demo -> laporan GRATIS
      }
      if (r && r.result === 'ok') ok++; else skip++;
    } catch (e) { skip++; }
  }
  console.log('monthlyBillingRun ' + periode + ': ' + ok + ' terkirim, ' + skip + ' dilewati, ' + needReview.length + ' perlu verifikasi.');
  // Ringkasan ke admin — HANYA bila ada yang ditagih atau ada yang ditahan (hindari email kosong tiap hari).
  if (ADMIN_EMAIL && (ok > 0 || needReview.length > 0)) {
    try {
      MailApp.sendEmail(ADMIN_EMAIL, '🧾 Penagihan Otomatis ' + periode + ' — EA Apocalypto',
        'Penagihan otomatis periode ' + periode + ' selesai.\n\n' +
        'Terkirim (invoice / laporan / email dukungan) : ' + ok + '\n' +
        'Dilewati : ' + skip + ' (bukan aktif / belum ada data profit / sudah diproses)\n\n' +
        (needReview.length
          ? ('⚠️ PERLU VERIFIKASI MANUAL (' + needReview.length + ') — invoice DITAHAN karena data profit basi/kosong:\n- '
             + needReview.join('\n- ')
             + '\n\nSetelah data profit benar, kirim invoice manual dgn menjalankan:\n   createInvoice("<login>", "' + month + '")\n\n')
          : 'Tidak ada akun yang perlu verifikasi manual. 👍\n\n') +
        'Buka Google Sheet:\n' + SHEET_URL);
    } catch (e) {}
  }
}

function getQrisBlob(){
  if (!QRIS_FILE_ID) return null;
  try {
    var token = ScriptApp.getOAuthToken();
    var url = 'https://www.googleapis.com/drive/v3/files/' + QRIS_FILE_ID + '?alt=media&supportsAllDrives=true';
    var r = UrlFetchApp.fetch(url, { headers:{ Authorization:'Bearer ' + token }, muteHttpExceptions:true });
    if (r.getResponseCode() === 200) return r.getBlob().setName('QRIS.png');
  } catch (e) {}
  return null;
}

function sendInvoiceEmail(b, invId){
  var qris = getQrisBlob();
  var qrisHtml = qris ? '<p style="margin:14px 0 6px;font-weight:bold;">Atau scan QRIS:</p><img src="cid:qris" style="width:220px;height:auto;border:1px solid #eee;border-radius:8px;">' : '';
  var html =
    '<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222;">' +
      '<div style="background:#0E1A2B;padding:18px 20px;border-radius:10px 10px 0 0;">' +
        '<span style="color:#C8A24A;font-size:20px;font-weight:bold;">EA APOCALYPTO</span>' +
        '<div style="color:#cbd3e0;font-size:12px;">Invoice Profit Sharing</div>' +
      '</div>' +
      '<div style="border:1px solid #e5e5e5;border-top:none;padding:20px;border-radius:0 0 10px 10px;">' +
        '<p>Halo <b>' + (b.nama || 'Member') + '</b>,</p>' +
        '<p>Berikut tagihan Profit Sharing Anda:</p>' +
        '<table style="width:100%;border-collapse:collapse;font-size:14px;">' +
          '<tr><td style="padding:6px 0;color:#666;">No. Invoice</td><td style="text-align:right;font-weight:bold;">' + invId + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#666;">Nomor Akun</td><td style="text-align:right;">' + b.login + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#666;">Jenis Akun</td><td style="text-align:right;">' + (b.jenis || '-') + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#666;">Periode</td><td style="text-align:right;">' + b.periode + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#666;">Total Profit</td><td style="text-align:right;">' + b.profitUSDStr + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#666;">Profit Sharing</td><td style="text-align:right;">' + b.persen + '%</td></tr>' +
          '<tr><td style="padding:6px 0;color:#666;">Bagian Sharing</td><td style="text-align:right;">' + b.shareUSDStr + '</td></tr>' +
          '<tr><td style="padding:6px 0;color:#666;">Kurs (Rp/USD)</td><td style="text-align:right;">' + b.kursStr + '</td></tr>' +
          '<tr><td style="padding:10px 0;border-top:2px solid #0E1A2B;font-weight:bold;font-size:16px;">TAGIHAN</td><td style="padding:10px 0;border-top:2px solid #0E1A2B;text-align:right;font-weight:bold;font-size:16px;color:#B8860B;">' + b.tagihanStr + '</td></tr>' +
        '</table>' +
        ((b.kodeUnik) ? '<p style="background:#FFF4D6;border:1px solid #F0DFA0;border-radius:8px;padding:10px 12px;margin-top:12px;font-size:13px;color:#8a6d1a;">⚠️ <b>Penting:</b> mohon transfer <b>TEPAT sampai 3 angka terakhir</b> (<b>' + b.tagihanStr + '</b>). 3 digit terakhir adalah kode unik untuk memverifikasi pembayaran Anda.</p>' : '') +
        '<div style="background:#F5ECD5;border-radius:8px;padding:14px;margin-top:16px;">' +
          '<p style="margin:0 0 6px;font-weight:bold;">Cara Pembayaran</p>' +
          '<p style="margin:0;">Transfer ke:<br><b>' + BANK_NAMA + '</b><br>No. Rek: <b>' + BANK_REK + '</b><br>a.n. <b>' + BANK_AN + '</b></p>' +
          qrisHtml +
        '</div>' +
        '<p style="font-size:13px;color:#666;margin-top:16px;">Mohon lakukan pembayaran selambat-lambatnya 3 hari sejak invoice ini diterbitkan. Setelah transfer, mohon konfirmasi ke admin. Terima kasih.</p>' +
        infoBox('Jika nominal profit sharing berbeda dengan perhitungan Anda, silakan menghubungi Admin.', 'warn') +
        '<p style="font-size:13px;margin-top:14px;">Butuh bantuan? <a href="' + ADMIN_WA_URL + '" style="color:#B8860B;">Hubungi Admin</a> &middot; <a href="' + WA_GROUP_URL + '" style="color:#B8860B;">Gabung Komunitas</a></p>' +
      '</div>' +
    '</div>';
  var opts = { to: b.email, subject: 'Invoice Profit Sharing EA Apocalypto — ' + b.periode,
               body: 'Tagihan Profit Sharing Anda: ' + b.tagihanStr, htmlBody: html, name: 'EA Apocalypto' };
  if (qris) opts.inlineImages = { qris: qris };
  sendMailUser(opts);
  maybeWarnQuota();
}

function sendAdminInvoiceNotif(b, invId){
  if (!ADMIN_EMAIL) return;
  var paidUrl = DEPLOY_URL + '?action=paid&inv=' + encodeURIComponent(invId) + '&key=' + encodeURIComponent(ADMIN_KEY);
  var kodeLine = (b.kodeUnik) ? ('Kode Unik    : ' + b.kodeUnik + ' (3 digit terakhir tagihan)\n') : '';
  var body =
    'Invoice baru dibuat & dikirim ke member:\n\n' +
    'No Invoice   : ' + invId + '\n' +
    'Nama         : ' + b.nama + '\n' +
    'Login MT5    : ' + b.login + ' (' + b.satuan + ')\n' +
    'Periode      : ' + b.periode + '\n' +
    'Total Profit : ' + b.profitUSDStr + '\n' +
    'Sharing      : ' + b.persen + '%\n' +
    'Kurs         : ' + b.kursStr + ' /USD\n' +
    'TAGIHAN      : ' + b.tagihanStr + '\n' +
    kodeLine + '\n' +
    'Cocokkan nominal TEPAT di mutasi bank (termasuk 3 digit terakhir). ' +
    'Setelah dana masuk, klik link ini untuk menandai LUNAS:\n' + paidUrl + '\n';
  MailApp.sendEmail(ADMIN_EMAIL, 'Invoice ' + invId + ' — ' + b.nama + ' (' + b.tagihanStr + ')', body, { name:'Apocalypto System' });
}

// Tandai invoice LUNAS + email konfirmasi ke member
function markPaid(invId){
  invId = (invId || '').toString().trim();
  if (!invId) return 'Invoice tidak ditemukan.';
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var inv = ss.getSheetByName(INVOICE_SHEET);
  if (!inv) return 'Tab Invoice tidak ditemukan.';
  var data = inv.getDataRange().getValues();
  for (var i = 1; i < data.length; i++){
    if (data[i][0].toString().trim() === invId){
      var st = (data[i][13] || '').toString().toLowerCase();   // kolom N Status
      if (st === 'lunas') return 'Invoice ' + invId + ' sudah LUNAS sebelumnya.';
      inv.getRange(i + 1, 14).setValue('Lunas');               // N Status
      inv.getRange(i + 1, 15).setValue(new Date());            // O Waktu Lunas
      try { sendPaidEmail(data[i]); } catch (e) {}
      return 'Berhasil! Invoice ' + invId + ' ditandai LUNAS. Email konfirmasi dikirim ke member.';
    }
  }
  return 'Invoice ' + invId + ' tidak ditemukan.';
}

function sendPaidEmail(row){
  var email = (row[4] || '').toString().trim();
  if (!email) return;
  var periode = formatPeriode(row[5]);   // rapikan walau tersimpan sbg tanggal panjang
  var nama = (row[3]||'').toString() || 'Member';
  var introU = '<p style="margin:0 0 12px;">Pembayaran Profit Sharing Anda sudah kami <b>terima</b>. Terima kasih! 🙏</p>';
  var rowsU = [
    ['No. Invoice', (row[0]||'').toString()],
    ['Nomor Akun', (row[2]||'').toString()],
    ['Periode', periode],
    ['Jumlah Dibayar', formatRupiah(row[11])],
    ['Status', 'LUNAS', true]
  ];
  var noteU = infoBox('Pembayaran Anda telah lunas. EA Apocalypto Anda tetap aktif &mdash; salam profit! 🚀', 'ok');
  sendMailUser({ to: email, subject: 'Pembayaran Diterima (LUNAS) — EA Apocalypto (' + periode + ')',
                 body: 'Pembayaran Profit Sharing periode ' + periode + ' (' + formatRupiah(row[11]) + ') sudah diterima. Status: LUNAS.',
                 htmlBody: emailShell('Pembayaran Diterima', nama, introU, rowsU, noteU, '#1E7A46'), name:'EA Apocalypto' });   // header HIJAU
  maybeWarnQuota();
}


//====================================================================
//  PROFILING MEMBER (otomatis) -> tab "Profiling"
//  Gabungan 4 dimensi: Performa, Lifecycle/Churn, Revenue/Sharing, Integritas.
//  Jalankan dari menu "Apocalypto -> Build Profiling" atau Run buildProfiling().
//====================================================================
function onOpen(){
  try{
    SpreadsheetApp.getUi().createMenu('Apocalypto')
      .addItem('🔎 Build Profiling', 'buildProfiling')
      .addToUi();
  } catch(e){}
}

function buildProfiling(){
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var mSheet = ss.getSheetByName(SHEET_NAME);
  var pSheet = ss.getSheetByName(PROFIT_SHEET);
  if (!mSheet) return;

  var now = new Date();
  var nowIdx = now.getFullYear()*12 + now.getMonth();

  // ---- 1. Riwayat profit per login (dari tab Profit) ----
  var hist = {};   // login -> [{idx, profit, bal, eq}]
  if (pSheet && pSheet.getLastRow() >= 2){
    var pd = pSheet.getRange(2, 1, pSheet.getLastRow()-1, 8).getValues();
    for (var i=0;i<pd.length;i++){
      var lg = String(pd[i][0]||'').trim(); if (!lg) continue;
      var mm = monthKey(pd[i][3]).match(/^(\d{4})-(\d{2})$/); if (!mm) continue;
      var idx = parseInt(mm[1],10)*12 + (parseInt(mm[2],10)-1);
      if (!hist[lg]) hist[lg]=[];
      hist[lg].push({ idx:idx, profit:Number(pd[i][4])||0, bal:Number(pd[i][5])||0, eq:Number(pd[i][6])||0 });
    }
    for (var k in hist) hist[k].sort(function(a,b){return a.idx-b.idx;});
  }

  // ---- 2. Baca member + deteksi duplikat WA/email ----
  var last = mSheet.getLastRow();
  if (last < 2) return;
  var md = mSheet.getRange(2, 1, last-1, 17).getValues();   // A..Q
  var waCount={}, emCount={};
  for (var i=0;i<md.length;i++){
    var wa = String(md[i][5]||'').replace(/\D/g,'');
    var em = String(md[i][6]||'').trim().toLowerCase();
    if (wa) waCount[wa]=(waCount[wa]||0)+1;
    if (em) emCount[em]=(emCount[em]||0)+1;
  }

  // ---- 3. Hitung profil tiap member ----
  var out = [];
  for (var i=0;i<md.length;i++){
    var r = md[i];
    var login = String(r[0]||'').trim(); if (!login) continue;
    var nama   = String(r[3]||'');
    var status = String(r[2]||'').trim();
    var stLow  = status.toLowerCase();
    var jenis  = String(r[14]||'').trim();         // Demo / Real
    var jnLow  = jenis.toLowerCase();
    var broker = String(r[7]||'');
    var skema  = String(r[8]||'');
    var psharing = String(r[10]||'');
    var blk    = (r[13]===true || String(r[13]).toUpperCase()==='TRUE');

    var regDate = r[12] ? new Date(r[12]) : null;
    var expDate = r[1]  ? new Date(r[1])  : null;
    var daysReg = (regDate && !isNaN(regDate)) ? Math.floor((now-regDate)/86400000) : '';
    var daysExp = (expDate && !isNaN(expDate)) ? Math.ceil((expDate-now)/86400000)  : '';

    // --- Performa ---
    var h = hist[login] || [];
    var n = h.length, tot=0, win=0;
    for (var j=0;j<n;j++){ tot+=h[j].profit; if (h[j].profit>0) win++; }
    var avg = n ? tot/n : 0;
    var lastPr = n ? h[n-1].profit : '';
    var winrate = n ? Math.round(win/n*100) : '';

    var tren='-';
    if (n>=2){
      var half=Math.floor(n/2), oA=0,nA=0,oc=0,nc=0;
      for (var j=0;j<n;j++){ if (j<half){oA+=h[j].profit;oc++;} else {nA+=h[j].profit;nc++;} }
      oA/=oc; nA/=nc; var diff=nA-oA, thr=Math.max(1, Math.abs(oA)*0.15);
      tren = (diff>thr)?'Naik':((diff<-thr)?'Turun':'Datar');
    }
    var vol='-';
    if (n>=2){
      var vs=0; for (var j=0;j<n;j++){ var d=h[j].profit-avg; vs+=d*d; }
      var sd=Math.sqrt(vs/n), cv=(Math.abs(avg)>0.01)?sd/Math.abs(avg):(sd>0?99:0);
      vol = (cv<0.5)?'Stabil':((cv<1.5)?'Sedang':'Volatil');
    }

    // --- Lifecycle / churn ---
    var isActive = (stLow==='active');
    var gap = n ? (nowIdx - h[n-1].idx) : (daysReg!=='' && daysReg>30 ? 99 : 0);
    var dormant = (isActive && gap>=2) ? gap : '';
    var nearExp = (daysExp!=='' && daysExp>=0 && daysExp<=7);

    // --- Revenue / sharing ---
    var shareFrac=0, sm=psharing.match(/(\d+(?:[.,]\d+)?)/);
    if (sm) shareFrac = parseFloat(sm[1].replace(',','.'))/100;
    var posP=0; for (var j=0;j<n;j++){ if (h[j].profit>0) posP+=h[j].profit; }
    var estShare = (jnLow==='real' && shareFrac>0) ? Math.round(posP*shareFrac*100)/100 : '';

    // --- Integritas ---
    var wa=String(r[5]||'').replace(/\D/g,''), em=String(r[6]||'').trim().toLowerCase();
    var dWA=(wa && waCount[wa]>1), dEM=(em && emCount[em]>1);
    var dupTxt = dWA ? (dEM?'WA+Email':'WA') : (dEM?'Email':'-');

    // --- Segmen ---
    var seg='', note=[];
    if (blk) seg='⛔ Blacklist';
    else if (stLow==='rejected') seg='❌ Ditolak';
    else if (stLow==='pending')  seg='⏳ Pending Sinkron';
    else if (jnLow==='demo')     seg='🧪 Demo-Trial';
    else if (!isActive)          seg='💤 Nonaktif';
    else {   // Real + Active
      if (n===0) seg=(daysReg!=='' && daysReg<=30)?'🆕 Baru (belum ada data)':'⚠️ Aktif tanpa data';
      else if (dormant!=='') seg='😴 Dormant (churn risk)';
      else if (tot>0 && tren==='Naik') seg='🌟 Profit Naik';
      else if (tot>0) seg='✅ Profit';
      else seg='🔻 Rugi';
    }
    if (nearExp)        note.push('Dekat expired '+daysExp+'h');
    if (dupTxt!=='-')   note.push('Duplikat '+dupTxt);

    // --- Skor 0..100 ---
    var score=0;
    if (!blk && stLow!=='rejected'){
      score += isActive?40:(stLow==='pending'?15:10);
      if (winrate!=='') score += Math.round(winrate*0.25);
      score += (tren==='Naik')?10:((tren==='Datar')?3:0);
      score += Math.min(n,6)*3;
      if (jnLow==='real') score += 7;
      if (dormant!=='') score -= 15;
      if (nearExp) score -= 5;
      if (tot>0) score += 5;
    }
    score = Math.max(0, Math.min(100, score));

    out.push([ login, nama, jenis, status, seg, score, n,
               Math.round(tot*100)/100, Math.round(avg*100)/100, lastPr, winrate, tren, vol,
               daysReg, daysExp, dormant, skema, psharing, estShare, broker, dupTxt, (blk?'YA':'-'), note.join('; ') ]);
  }

  out.sort(function(a,b){ return b[5]-a[5]; });   // skor tertinggi di atas

  // ---- 4. Tulis tab "Profiling" ----
  var headers = ['Login','Nama','Jenis','Status','Segmen','Skor','Bln Data','Total Profit','Rata2/Bln',
                 'Profit Terakhir','Winrate%','Tren','Volatilitas','Umur Daftar (hr)','Sisa Expired (hr)',
                 'Dormant (bln)','Skema','Profit Sharing','Est. Sharing','Broker','Duplikat','Blacklist','Catatan'];
  var sh = ss.getSheetByName('Profiling') || ss.insertSheet('Profiling');
  sh.clear();
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (out.length) sh.getRange(2,1,out.length,headers.length).setValues(out);
  try { sh.autoResizeColumns(1, headers.length); } catch(e){}
  try { ss.toast(out.length + ' member diprofilkan. Tab "Profiling" diperbarui.', 'Profiling', 5); } catch(e){}
}


//====================================================================
//  REGISTRASI MEMBER dari situs apocalypto.id -> tab "Registrasi Web"
//  Situs mengirim (POST): action=member, nama, email, wa, halaman, key=REG_KEY
//  Satu baris per email: kalau email sudah ada, data & "Terakhir" diperbarui
//  dan "Jumlah Registrasi" bertambah (bukan baris baru).
//====================================================================
function handleWebMember(p) {
  var out = function(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  if (!checkFormKey(p)) return out({ result: 'error', error: 'BAD_KEY' });
  var nama  = String(p.nama || '').trim().slice(0, 40);
  var email = String(p.email || '').trim().toLowerCase().slice(0, 80);
  var wa    = normPhone(String(p.wa || ''));
  var hal   = String(p.halaman || '').trim().slice(0, 40);
  if (!nama || !validEmailStr(email) || !isDigitsStr(wa)) return out({ result: 'error', error: 'INVALID_INPUT' });

  upsertWebMember(nama, email, wa, hal);
  return out({ result: 'ok' });
}

// Simpan / perbarui 1 baris per email di tab "Registrasi Web".
function upsertWebMember(nama, email, wa, hal) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(WEB_MEMBER_SHEET);
    if (!sh) {
      sh = ss.insertSheet(WEB_MEMBER_SHEET);
      sh.getRange(1, 1, 1, 7).setValues([['Waktu Registrasi', 'Nama Panggilan', 'Email', 'WhatsApp', 'Halaman Tujuan', 'Terakhir', 'Jumlah Registrasi']])
        .setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#E7C766');
      sh.setFrozenRows(1);
      sh.setColumnWidths(1, 7, 160);
    }
    var now = new Date();
    var last = sh.getLastRow();
    if (last >= 2) {
      var emails = sh.getRange(2, 3, last - 1, 1).getValues();
      for (var i = 0; i < emails.length; i++) {
        if (String(emails[i][0]).trim().toLowerCase() === email) {
          var r = i + 2;
          var cnt = Number(sh.getRange(r, 7).getValue()) || 1;
          sh.getRange(r, 2, 1, 6).setValues([[nama, email, "'" + wa, hal, now, cnt + 1]]);
          return 'update';
        }
      }
    }
    sh.appendRow([now, nama, email, "'" + wa, hal, now, 1]);
    return 'new';
  } finally {
    lock.releaseLock();
  }
}


//====================================================================
//  TANGKAS (Tanggal & Kasih Surprise) -> tab "TANGKAS"
//  Situs mengirim (POST): action=tangkas, nama, email, wa, bank, rek, an, key=REG_KEY
//  - Hanya diterima pukul TANGKAS_OPEN_H..TANGKAS_CLOSE_H WIB (dicek di server).
//  - Satu entri per member per hari (dicek dari email ATAU WhatsApp).
//  - Admin cukup centang kolom "Pemenang" & isi "Ditransfer" setelah transfer Rp100.000.
//  Balasan: {result:'ok'} | {result:'already'} | {result:'closed'} | {result:'error', error}
//====================================================================
function handleTangkas(p) {
  var out = function(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  if (!checkFormKey(p)) return out({ result: 'error', error: 'BAD_KEY' });

  var tz  = 'Asia/Jakarta';
  var now = new Date();
  var jam = Number(Utilities.formatDate(now, tz, 'H'));
  if (!TANGKAS_TEST && (jam < TANGKAS_OPEN_H || jam >= TANGKAS_CLOSE_H)) return out({ result: 'closed' });

  var nama  = String(p.nama || '').trim().slice(0, 40);
  var email = String(p.email || '').trim().toLowerCase().slice(0, 80);
  var wa    = normPhone(String(p.wa || ''));
  var bank  = String(p.bank || '').trim().slice(0, 40);
  var rek   = String(p.rek || '').replace(/[^0-9]/g, '').slice(0, 25);
  var an    = String(p.an || '').trim().slice(0, 60);
  if (!nama || !validEmailStr(email) || !isDigitsStr(wa) || !bank || rek.length < 6 || !an) {
    return out({ result: 'error', error: 'INVALID_INPUT' });
  }

  var tgl = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(TANGKAS_SHEET);
    if (!sh) {
      sh = ss.insertSheet(TANGKAS_SHEET);
      sh.getRange(1, 1, 1, 11).setValues([['Tanggal', 'Waktu', 'Nama Panggilan', 'Email', 'WhatsApp', 'Bank / E-wallet', 'No. Rekening', 'Atas Nama', 'Pemenang', 'Ditransfer', 'Catatan Admin']])
        .setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#E7C766');
      sh.setFrozenRows(1);
      sh.setColumnWidths(1, 11, 140);
    }
    var last = sh.getLastRow();
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 5).getDisplayValues();
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][0] !== tgl) continue;
        var rEmail = String(rows[i][3]).trim().toLowerCase();
        var rWa    = normPhone(String(rows[i][4]));
        if (rEmail === email || (rWa && rWa === wa)) return out({ result: 'already' });
      }
    }
    sh.appendRow(["'" + tgl, Utilities.formatDate(now, tz, 'HH:mm:ss'), nama, email, "'" + wa, bank, "'" + rek, an, false, '', '']);
    var r = sh.getLastRow();
    sh.getRange(r, 9).insertCheckboxes();
    return out({ result: 'ok' });
  } finally {
    lock.releaseLock();
  }
}


//====================================================================
//  GABUNG + OTP EMAIL (situs apocalypto.id)
//  1) action=otp_send   : nama, email, wa, halaman -> kirim kode 6 digit ke email (berlaku 10 menit)
//       balasan: {result:'sent', wait} | {result:'wait', wait} | {result:'limit'} | {result:'error'}
//  2) action=otp_verify : email, code -> bila benar, member disimpan ke tab "Registrasi Web"
//       balasan: {result:'ok', nama, wa} | {result:'wrong', left} | {result:'too_many'} | {result:'expired'}
//  Batas: kirim ulang min. 60 detik, maks. 5 kode / email / jam, maks. 5 tebakan / kode.
//====================================================================
var OTP_TTL_SEC    = 600;
var OTP_RESEND_SEC = 60;
var OTP_MAX_HOUR   = 5;
var OTP_MAX_TRY    = 5;

function otpOut(o){ return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function otpKey(email){ return 'otp_' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, email)).slice(0, 40); }

function handleOtpSend(p) {
  if (!checkFormKey(p)) return otpOut({ result: 'error', error: 'BAD_KEY' });
  var mode  = p.mode === 'login' ? 'login' : 'join';
  var nama  = String(p.nama || '').trim().slice(0, 40);
  var email = String(p.email || '').trim().toLowerCase().slice(0, 80);
  var wa    = normPhone(String(p.wa || ''));
  var hal   = String(p.halaman || '').trim().slice(0, 40);
  if (mode === 'login') {
    // MASUK: member lama cukup email -> nama & WA diambil dari tab "Registrasi Web"
    if (!validEmailStr(email)) return otpOut({ result: 'error', error: 'INVALID_INPUT' });
    var found = findWebMember(email);
    if (!found) return otpOut({ result: 'not_found' });
    nama = found.nama; wa = found.wa;
  } else {
    if (!nama || !validEmailStr(email) || !isDigitsStr(wa) || wa.length < 8) {
      return otpOut({ result: 'error', error: 'INVALID_INPUT' });
    }
    // GABUNG: tolak bila email ATAU WhatsApp sudah terdaftar -> arahkan ke Masuk
    var dup = findWebMemberDup(email, wa);
    if (dup) return otpOut({ result: 'registered', by: dup });
  }

  var cache = CacheService.getScriptCache();
  var k = otpKey(email);
  var lastSent = Number(cache.get(k + '_t') || 0);
  var nowMs = Date.now();
  if (lastSent && nowMs - lastSent < OTP_RESEND_SEC * 1000) {
    return otpOut({ result: 'wait', wait: Math.ceil((OTP_RESEND_SEC * 1000 - (nowMs - lastSent)) / 1000) });
  }
  var cnt = Number(cache.get(k + '_n') || 0);
  if (cnt >= OTP_MAX_HOUR) return otpOut({ result: 'limit' });

  var code = String(Math.floor(100000 + Math.random() * 900000));
  cache.put(k, JSON.stringify({ code: code, nama: nama, wa: wa, hal: hal, tries: 0 }), OTP_TTL_SEC);
  cache.put(k + '_t', String(nowMs), OTP_RESEND_SEC + 5);
  cache.put(k + '_n', String(cnt + 1), 3600);

  try {
    var intro = '<p style="margin:0 0 12px;">Berikut kode untuk ' + (mode === 'login' ? 'masuk ke' : 'bergabung di') + ' <b>apocalypto.id</b>. Kode berlaku <b>10 menit</b>.</p>' +
      '<div style="text-align:center;margin:18px 0;"><span style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:10px;color:#0E1A2B;background:#F5ECD5;border:1px solid #E6D7A8;border-radius:10px;padding:12px 18px 12px 28px;">' + code + '</span></div>';
    var note = infoBox('Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku sebagai admin. Abaikan email ini bila Anda tidak merasa meminta kode.', 'warn');
    sendMailUser({
      to: email,
      subject: 'Kode OTP Apocalypto: ' + code,
      body: 'Kode OTP Anda: ' + code + ' (berlaku 10 menit). Jangan berikan kode ini kepada siapa pun. Salam, Tim Apocalypto.',
      htmlBody: emailShell('Kode Verifikasi (OTP)', nama, intro, [], note),
      name: 'Apocalypto'
    });
  } catch (err) {
    console.error('OTP email gagal: ' + err);
    cache.remove(k); cache.remove(k + '_t');
    return otpOut({ result: 'error', error: 'MAIL_FAILED' });
  }
  return otpOut({ result: 'sent', wait: OTP_RESEND_SEC });
}

// Cari member di tab "Registrasi Web" berdasarkan email -> {nama, wa} atau null.
function findWebMember(email) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WEB_MEMBER_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 2, sh.getLastRow() - 1, 3).getDisplayValues();   // B nama, C email, D WA
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).trim().toLowerCase() === email) {
      return { nama: String(rows[i][0]).trim(), wa: normPhone(String(rows[i][2])) };
    }
  }
  return null;
}

// Cek email / WA sudah ada di tab "Registrasi Web" -> 'email' | 'wa' | 'both' | null
function findWebMemberDup(email, wa) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(WEB_MEMBER_SHEET);
  if (!sh || sh.getLastRow() < 2) return null;
  var rows = sh.getRange(2, 3, sh.getLastRow() - 1, 2).getDisplayValues();   // C email, D WA
  var e = false, w = false;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === email) e = true;
    if (wa && normPhone(String(rows[i][1])) === wa) w = true;
  }
  return (e && w) ? 'both' : e ? 'email' : w ? 'wa' : null;
}

function handleOtpVerify(p) {
  if (!checkFormKey(p)) return otpOut({ result: 'error', error: 'BAD_KEY' });
  var email = String(p.email || '').trim().toLowerCase().slice(0, 80);
  var code  = String(p.code || '').replace(/\D/g, '');
  if (!validEmailStr(email) || code.length !== 6) return otpOut({ result: 'wrong' });

  var cache = CacheService.getScriptCache();
  var k = otpKey(email);
  var raw = cache.get(k);
  if (!raw) return otpOut({ result: 'expired' });
  var d = JSON.parse(raw);
  if (d.tries >= OTP_MAX_TRY) { cache.remove(k); return otpOut({ result: 'too_many' }); }
  if (d.code !== code) {
    d.tries++;
    if (d.tries >= OTP_MAX_TRY) { cache.remove(k); return otpOut({ result: 'too_many' }); }
    cache.put(k, JSON.stringify(d), OTP_TTL_SEC);
    return otpOut({ result: 'wrong', left: OTP_MAX_TRY - d.tries });
  }
  cache.remove(k);
  upsertWebMember(d.nama, email, d.wa, d.hal);
  return otpOut({ result: 'ok', nama: d.nama, wa: d.wa });
}
