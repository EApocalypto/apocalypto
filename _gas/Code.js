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

// ===== STRUKTUR DATA (v2) =====
// Tab "Member"  : 1 baris per ORANG (data diri, rekening, blacklist). Kunci = Kode Member (APX-0001).
// Tab "Akun EA" : 1 baris per AKUN MT5. Hanya menyimpan Kode Member sbg penghubung (tanpa email/WA).
var SHEET_NAME  = 'Akun EA';     // tab akun MT5 (dibaca utk lisensi EA)
var MEMBER_SHEET = 'Member';     // tab data induk member
var MB = { KODE:1, DAFTAR:2, NAMA:3, EMAIL:4, WA:5, BANK:6, REK:7, AN:8, REKVER:9, BL:10, LAST:11, TOKEN:12 };
var MB_HEADERS = ['Kode Member','Waktu Daftar','Nama Panggilan','Email','WhatsApp','Bank','No. Rekening','Atas Nama',
                  'Rekening Diverifikasi','Blacklist','Login Terakhir','Token Sesi (hash)'];
var AC = { LOGIN:1, EXP:2, STATUS:3, KODE:4, SISA:5, NAMA:6, MASA:7, PS:8, SERVER:9, JENIS:10, DAFTAR:11, AKTIVASI:12, REMIND:13 };
var PAKET = { '1 Bulan':'30%', '3 Bulan':'20%', '6 Bulan':'10%', '12 Bulan':'5%' };   // masa langganan -> profit sharing

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
var WEB_MEMBER_SHEET = MEMBER_SHEET;          // (alias lama)
var TANGKAS_SHEET    = 'TANGKAS Harian';      // tab entri harian TANGKAS (Tanggal & Kasih Surprise)
var TANGKAS_CFG_SHEET = 'TANGKAS Pengaturan'; // tab pengaturan admin (jumlah pemenang per hari)
var TANGKAS_OPEN_H   = 20;                    // awal jendela (WIB, zona waktu script = Asia/Jakarta)
var TANGKAS_CLOSE_H  = 21;                    // tutup TEPAT jam ini (WIB)
var TANGKAS_RAND_MAX = 50;                    // buka di menit acak 0..50 setelah OPEN_H (min. 10 menit sebelum tutup). Dirahasiakan sampai buka.
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
  'Nomor Akun / Login MT5',        // A  (dibaca EA)
  'Expired',                       // B  (dibaca EA)
  'Status',                        // C  (dibaca EA) Active / Inactive / Pending / Rejected
  'Kode Member',                   // D  penghubung ke tab Member
  'Sisa Waktu',                    // E  (rumus otomatis)
  'Nama Member',                   // F  (rumus otomatis dari tab Member — hanya tampilan)
  'Masa Berlaku Lisensi',          // G  paket: 1/3/6/12 Bulan
  'Profit Sharing',                // H  dari paket (kosong utk Demo)
  'Server Broker',                 // I  (diisi otomatis oleh EA)
  'Jenis Akun',                    // J  (otomatis: USD/Cent / Real/Demo)
  'Waktu Daftar',                  // K
  'Tanggal Aktivasi',              // L  (otomatis saat Active; batas awal hitung profit)
  'Reminder Perpanjang'            // M  (diisi sistem)
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
  // ---- Riwayat transaksi AKUN APOCALYPTO (hanya akun utama) dari EA ----
  if (p.action === 'apo_deals') {
    if (!checkApiKey(p)) return ContentService.createTextOutput('ERR:BAD_KEY').setMimeType(ContentService.MimeType.TEXT);
    return ContentService.createTextOutput(handleApoDeals(p)).setMimeType(ContentService.MimeType.TEXT);
  }


  // (Endpoint login/getbill/createinvoice halaman penagihan DIHAPUS — penagihan full-otomatis.)

  // ---- Tandai LUNAS (link dari email admin) ----
  // ---- Persetujuan admin TANGKAS (link dari email) ----
  if (p.action === 'tk_appr') return tangkasApprovePage(p);

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

// ---- Akun EA: helper ----
function accSheet() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME); }
// Data kontak pemilik akun (dari tab Member via Kode Member)
function accContact(sheet, row) {
  var kode = String(sheet.getRange(row, AC.KODE).getValue() || '').trim();
  var m = kode ? memberByKode(kode) : null;
  return { kode: kode, login: String(sheet.getRange(row, AC.LOGIN).getValue() || '').trim(),
           nama: m ? m.nama : '', email: m ? m.email : '', wa: m ? m.wa : '', blocked: !!(m && m.blocked) };
}
function setSisaFormula(sheet, row) { sheet.getRange(row, AC.SISA).setFormula('=IF($B' + row + '="","",INT($B' + row + '-NOW()))'); }
function setNamaFormula(sheet, row) { sheet.getRange(row, AC.NAMA).setFormula('=IFERROR(VLOOKUP($D' + row + ',' + "'" + MEMBER_SHEET + "'" + '!$A:$C,3,FALSE),"")'); }

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
  var tz = Session.getScriptTimeZone();

  var sheet = accSheet();
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][AC.LOGIN - 1].toString().trim() !== acc) continue;
    var row = i + 1;
    var status = (data[i][AC.STATUS - 1] || '').toString().toUpperCase().trim();
    var curServer = (data[i][AC.SERVER - 1] || '').toString().trim();
    // PENGAMAN: pemilik akun di-BLACKLIST (tab Member) -> selalu INACTIVE
    var owner = memberByKode(String(data[i][AC.KODE - 1] || '').trim());
    if (owner && owner.blocked) return "INACTIVE|-";
    if (status === "REJECTED") return "INACTIVE|-";
    if (server && !curServer) return firstSync(sheet, row, server, currency);
    if (status === "ACTIVE") {
      var exp = data[i][AC.EXP - 1];
      var actM = data[i][AC.AKTIVASI - 1] || data[i][AC.DAFTAR - 1];
      return "ACTIVE|" + (exp ? Utilities.formatDate(new Date(exp), tz, "yyyy.MM.dd") : "") + "|" +
             (actM ? Utilities.formatDate(new Date(actM), tz, "yyyy.MM.dd") : "") +
             (acc === apoMainLogin() ? "|PUB" : "");   // akun utama Apocalypto -> EA kirim riwayat transaksi
    }
    if (status === "PENDING") return "PENDING|-";
    return "INACTIVE|-";
  }
  return "UNREGISTERED|-";
}

// Sinkronisasi pertama kali EA melapor server: catat jenis & server + deteksi demo/real.
// Urutan tulis: (1) Jenis Akun, (2) Server Broker, lalu:
//   Demo -> hapus Skema & Profit Sharing, status Active + Expired, Email "aktif".
//   Real -> pertahankan Skema & Profit Sharing, status Inactive (parkir), Email "sedang diverifikasi".
function firstSync(sheet, row, server, currency){
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  var tz = Session.getScriptTimeZone();
  try {
    var curServer = (sheet.getRange(row, AC.SERVER).getValue() || '').toString().trim();
    if (curServer) {   // sudah ter-sync oleh request lain -> balas status terkini
      var st0 = (sheet.getRange(row, AC.STATUS).getValue() || '').toString().toUpperCase().trim();
      if (st0 === 'ACTIVE') {
        var ex0 = sheet.getRange(row, AC.EXP).getValue();
        var ac0 = sheet.getRange(row, AC.AKTIVASI).getValue() || sheet.getRange(row, AC.DAFTAR).getValue();
        return "ACTIVE|" + (ex0 ? Utilities.formatDate(new Date(ex0), tz, "yyyy.MM.dd") : "") + "|" + (ac0 ? Utilities.formatDate(new Date(ac0), tz, "yyyy.MM.dd") : "");
      }
      return (st0 === 'PENDING') ? "PENDING|-" : "INACTIVE|-";
    }
    var jenis = detectJenis(server);
    sheet.getRange(row, AC.JENIS).setValue(labelJenis(server, currency));
    sheet.getRange(row, AC.SERVER).setValue(server);
    if (jenis === 'Demo') {
      sheet.getRange(row, AC.PS).setValue('');                         // Demo = GRATIS
      var months = parseInt(String(sheet.getRange(row, AC.MASA).getValue() || '').replace(/[^0-9]/g, ''), 10);
      var d = new Date(); d.setMonth(d.getMonth() + (months || 1)); d.setHours(23, 59, 0, 0);
      sheet.getRange(row, AC.EXP).setValue(d).setNumberFormat('yyyy.MM.dd HH:mm');
      setSisaFormula(sheet, row);
      sheet.getRange(row, AC.REMIND).setValue('');
      sheet.getRange(row, AC.STATUS).setValue('Active');
      var actNow = new Date();
      sheet.getRange(row, AC.AKTIVASI).setValue(actNow).setNumberFormat('yyyy.MM.dd');
      try { sendActivationEmail(sheet, row, d); } catch (e2) {}
      return "ACTIVE|" + Utilities.formatDate(d, tz, "yyyy.MM.dd") + "|" + Utilities.formatDate(actNow, tz, "yyyy.MM.dd");
    } else {
      sheet.getRange(row, AC.STATUS).setValue('Inactive');             // Real: parkir, tunggu verifikasi admin
      try { sendPendingRealEmail(sheet, row, server); } catch (e3) {}
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
    // Pastikan jadwal otomatis TANGKAS terpasang (sekali saja; aksi apa pun dari situs)
    if (p0.action) ensureTangkasTriggers();
    // ---- Gabung dgn OTP email (situs apocalypto.id) ----
    if (p0.action === 'apo_history') return handleApoHistory(p0);
    if (p0.action === 'otp_send')   return handleOtpSend(p0);
    if (p0.action === 'otp_verify') return handleOtpVerify(p0);
    // ---- Entri harian TANGKAS dari situs ----
    if (p0.action === 'tangkas') return handleTangkas(p0);
    if (p0.action === 'tangkas_status') return otpOut(tangkasStatus());
    if (p0.action === 'tangkas_info')   return handleTangkasInfo(p0);
    if (p0.action === 'profile_get') {
      var mp = authMember(p0);
      if (!mp) return otpOut({ result: 'auth' });
      return otpOut({ result: 'ok', nama: mp.nama, email: mp.email, wa: mp.wa, bank: mp.bank, rek: maskRek(mp.rek), an: mp.an });
    }

    // ---- Expert Advisor (member login): daftar akun MT5 + daftar akun milik member ----
    if (p0.action === 'ea_list')     return handleEaList(p0);
    if (p0.action === 'ea_register') return handleEaRegister(p0);

    // Form pendaftaran lama (tanpa login) sudah tidak dipakai.
    return otpOut({ result: 'error', error: 'USE_SITE' });
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', error: String(err) })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------- 2. EXPERT ADVISOR: pendaftaran akun MT5 oleh member login ----------
function handleEaList(p) {
  if (!checkFormKey(p)) return otpOut({ result: 'error', error: 'BAD_KEY' });
  var me = authMember(p);
  if (!me) return otpOut({ result: 'auth' });
  var sh = accSheet(), out = [], tz = Session.getScriptTimeZone();
  if (sh && sh.getLastRow() >= 2) {
    var d = sh.getRange(2, 1, sh.getLastRow() - 1, HEADERS.length).getValues();
    for (var i = 0; i < d.length; i++) {
      if (String(d[i][AC.KODE - 1]).trim() !== me.kode) continue;
      var exp = d[i][AC.EXP - 1];
      out.push({ login: String(d[i][AC.LOGIN - 1]), status: String(d[i][AC.STATUS - 1]), masa: String(d[i][AC.MASA - 1]),
                 ps: String(d[i][AC.PS - 1]), jenis: String(d[i][AC.JENIS - 1]),
                 exp: (exp instanceof Date) ? Utilities.formatDate(exp, tz, 'yyyy-MM-dd') : '' });
    }
  }
  return otpOut({ result: 'ok', kode: me.kode, akun: out, paket: PAKET });
}
function handleEaRegister(p) {
  if (!checkFormKey(p)) return otpOut({ result: 'error', error: 'BAD_KEY' });
  var me = authMember(p);
  if (!me) return otpOut({ result: 'auth' });
  var login = String(p.login || '').replace(/\D/g, '');
  var masa = String(p.paket || '');
  if (!isDigitsStr(login) || !PAKET[masa]) return otpOut({ result: 'error', error: 'INVALID_INPUT' });
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try {
    var sh = accSheet();
    var d = sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
    for (var i = 0; i < d.length; i++) if (String(d[i][0]).trim() === login) return otpOut({ result: 'duplicate' });
    var r = sh.getLastRow() + 1;
    var row = new Array(HEADERS.length); for (var k = 0; k < row.length; k++) row[k] = '';
    row[AC.LOGIN - 1] = login; row[AC.STATUS - 1] = 'Pending'; row[AC.KODE - 1] = me.kode;
    row[AC.MASA - 1] = masa; row[AC.PS - 1] = PAKET[masa]; row[AC.DAFTAR - 1] = new Date();
    sh.getRange(r, 1, 1, HEADERS.length).setValues([row]);
    sh.getRange(r, AC.LOGIN).setNumberFormat('@');
    setSisaFormula(sh, r); setNamaFormula(sh, r);
    sh.getRange(r, AC.STATUS).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['Active', 'Inactive', 'Pending', 'Rejected'], true).build());
  } finally { lock.releaseLock(); }
  sendRegistrationEmails(me, login, masa, PAKET[masa]);
  return otpOut({ result: 'ok' });
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
// Akun EA LAIN milik member yang sama -> teks info utk ADMIN (cek tunggakan sebelum verifikasi).
function dupIdentityWarn(login, kode){
  try {
    var sh = accSheet(), data = sh.getDataRange().getValues(), hits = [];
    for (var i = 1; i < data.length; i++){
      var rLogin = String(data[i][AC.LOGIN - 1] || '').trim();
      if (!rLogin || rLogin === String(login) || String(data[i][AC.KODE - 1]).trim() !== kode) continue;
      hits.push('   - Login ' + rLogin + ' | Status: ' + (String(data[i][AC.STATUS - 1]) || '-') + ' | Jenis: ' + (String(data[i][AC.JENIS - 1]) || '-'));
    }
    if (!hits.length) return '';
    return '\nℹ️ Member ini juga punya akun lain:\n' + hits.join('\n') + '\nCek dulu tunggakan profit sharing sebelum verifikasi.\n';
  } catch (e) { return ''; }
}

// ---------- 2b. KIRIM EMAIL: file produk ke pendaftar + notifikasi ke admin ----------
function sendRegistrationEmails(m, login, masa, ps) {
  if (m.email) {
    try {
      var attachments = getProductBlobs();
      var introU = '<p style="margin:0 0 12px;">Terima kasih sudah mendaftar <b>EA Apocalypto</b>. Pendaftaran Anda <b>berhasil</b>. File EA (.ex5) &amp; panduan pemasangan sudah terlampir pada email ini.</p>';
      var rowsU = [ ['Kode Member', m.kode], ['Nomor Akun / Login MT5', login], ['Paket', masa + (ps ? ' (profit sharing ' + ps + ')' : '')], ['Status saat ini', 'Menunggu Sinkronisasi'] ];
      var langkah = infoBox(
        '<b>TAHAP SINKRONISASI (wajib, sekali saja):</b>' +
        '<ol style="margin:8px 0 0;padding-left:18px;">' +
          '<li style="margin-bottom:6px;">Pasang EA sesuai panduan terlampir.</li>' +
          '<li style="margin-bottom:6px;">Aktifkan izin WebRequest di MT5: <b>Tools &rarr; Options &rarr; Expert Advisors</b>, centang <b>"Allow WebRequest for listed URL"</b>, tambahkan: <b>https://script.google.com</b>, klik OK.</li>' +
          '<li>Attach EA ke chart &amp; pastikan tombol <b>Algo Trading</b> menyala (hijau).</li>' +
        '</ol>' +
        '<p style="margin:10px 0 0;">Akun <b>Demo</b> aktif otomatis &amp; gratis. Akun <b>Real</b> diverifikasi admin terlebih dahulu.</p>', 'info');
      sendMailUser({ to: m.email, subject: 'EA Apocalypto — File EA, Panduan & Langkah Aktivasi',
        body: 'Pendaftaran berhasil. File EA & panduan terlampir. Pasang EA untuk aktivasi. Butuh bantuan: ' + ADMIN_WA_URL,
        htmlBody: emailShell('Pendaftaran Berhasil &amp; Tahap Sinkronisasi', m.nama, introU, rowsU, langkah), name: 'EA Apocalypto', attachments: attachments });
    } catch (err) {}
  }
  if (ADMIN_EMAIL) {
    try {
      var info = dupIdentityWarn(login, m.kode);
      MailApp.sendEmail({ to: ADMIN_EMAIL,
        subject: '🔔 Pendaftaran EA Baru (Pending): ' + (m.nama || '-') + ' · ' + m.kode + ' (' + login + ')',
        body: 'Ada pendaftaran akun EA BARU (status: Pending — menunggu sinkronisasi EA):\n\n' +
              'Kode Member    : ' + m.kode + '\nNama Panggilan : ' + (m.nama || '-') + '\nLogin MT5      : ' + login + '\n' +
              'WhatsApp       : ' + (m.wa ? '0' + m.wa : '-') + '\nEmail          : ' + (m.email || '-') + '\n' +
              'Paket          : ' + masa + '\nProfit Sharing : ' + (ps || '-') + '\n\n' +
              'Jenis akun (Demo/Real) & Server Broker terisi OTOMATIS saat EA melapor pertama kali. Demo -> aktif otomatis; ' +
              'Real -> Anda menerima notifikasi untuk verifikasi (ubah Status menjadi "Active").\n' + info + '\nBuka Google Sheet:\n' + SHEET_URL,
        name: 'Apocalypto System' });
    } catch (err) {}
  }
  maybeWarnQuota();
}

// ---------- EMAIL #2 (REAL): sinkronisasi berhasil, lisensi menunggu verifikasi admin ----------
// Dikirim dari firstSync() saat EA melapor server & terdeteksi akun Real/Live.
function sendPendingRealEmail(sheet, row, server) {
  var c = accContact(sheet, row);
  try {
    if (c.email) {
      var introU = '<p style="margin:0 0 12px;">Tahap Sinkronisasi EA Apocalypto Anda <b>berhasil</b>.</p>';
      var rowsU = [ ['Nomor Akun / Login MT5', c.login], ['Status', 'Menunggu Verifikasi'] ];
      var noteU = infoBox('Proses aktivasi EA sedang dalam proses verifikasi oleh admin. Silakan pasang ulang EA ke chart setelah proses verifikasi selesai.', 'warn');
      sendMailUser({ to: c.email, subject: 'EA Apocalypto — Akun Real Terdeteksi, Menunggu Verifikasi Admin',
        body: 'Tahap sinkronisasi berhasil. Proses aktivasi sedang diverifikasi admin. Pasang ulang EA ke chart setelah verifikasi selesai.',
        htmlBody: emailShell('Menunggu Verifikasi Admin', c.nama, introU, rowsU, noteU, '#B45309'), name: 'EA Apocalypto' });
    }
  } catch (err) { console.error('sendPendingRealEmail (user) gagal: ' + err); }
  if (ADMIN_EMAIL) {
    try {
      MailApp.sendEmail({ to: ADMIN_EMAIL, subject: '🔴 Verifikasi Akun Real: ' + (c.nama || '-') + ' · ' + c.kode + ' (' + c.login + ')',
        body: 'PERLU VERIFIKASI — akun REAL baru tersinkronisasi:\n\n' +
              'Kode Member    : ' + c.kode + '\nNama Panggilan : ' + (c.nama || '-') + '\nLogin MT5      : ' + c.login + '\n' +
              'Server Broker  : ' + server + ' (terdeteksi: Real)\nWhatsApp       : ' + (c.wa ? '0' + c.wa : '-') + '\nEmail          : ' + (c.email || '-') + '\n\n' +
              'CARA APPROVE: buka tab "Akun EA", cari login ' + c.login + ', ubah Status menjadi "Active". Expired terisi OTOMATIS sesuai Masa Berlaku, ' +
              'dan email konfirmasi aktif dikirim ke member.\n' + dupIdentityWarn(c.login, c.kode) + '\nBuka Google Sheet:\n' + SHEET_URL,
        name: 'Apocalypto System' });
    } catch (err) {}
  }
  maybeWarnQuota();
}

// ---------- 3. AUTO-EXPIRED + EMAIL saat admin approve (Status jadi Active) ----------
// Dipasang sebagai INSTALLABLE trigger (lihat installTriggers) agar boleh kirim email.
function onStatusEdit(e) {
  try {
    var range = e.range;
    var sheet = range.getSheet();
    var editCol = range.getColumn(), editRow = range.getRow();
    if (editRow < 2) return;
    // ---- Tab Member: Blacklist dicentang/dicabut -> semua akun EA milik member ikut ----
    if (sheet.getName() === MEMBER_SHEET) {
      if (editCol === MB.BL) handleMemberBlacklistEdit(editRow, isBlacklisted(e.value));
      return;
    }
    if (sheet.getName() !== SHEET_NAME) return;
    if (editCol === AC.EXP) { handleRenewal(sheet, editRow); return; }   // perpanjangan manual
    if (editCol !== AC.STATUS) return;

    var val = (e.value || '').toString().toUpperCase().trim();
    var old = (e.oldValue || '').toString().toUpperCase().trim();
    if (val === old) return;
    var row = editRow;
    if (val === 'ACTIVE') {
      sheet.getRange(row, AC.AKTIVASI).setValue(new Date()).setNumberFormat('yyyy.MM.dd');
      var expCell = sheet.getRange(row, AC.EXP);
      var cur = expCell.getValue();
      var d = (cur instanceof Date) ? cur : null;
      if (!d) {
        var months = parseInt(String(sheet.getRange(row, AC.MASA).getValue() || '').replace(/[^0-9]/g, ''), 10);
        if (months) {
          d = new Date(); d.setMonth(d.getMonth() + months); d.setHours(23, 59, 0, 0);
          expCell.setValue(d).setNumberFormat('yyyy.MM.dd HH:mm');
          setSisaFormula(sheet, row);
          sheet.getRange(row, AC.REMIND).setValue('');
        }
      }
      if (d) sendActivationEmail(sheet, row, d);
      else console.error('Aktivasi baris ' + row + ' gagal: Masa Berlaku & Expired kosong.');
    } else if (val === 'REJECTED') {
      sendRejectionEmail(sheet, row);
    }
  } catch (err) { console.error('onStatusEdit gagal: ' + err); }
}

// ---------- PERPANJANGAN: admin ubah tanggal Expired (kolom B) ----------
// - Bila diketik sbg teks (mis. "2027.04.03"), diubah jadi Date asli + format.
// - Rumus Sisa Waktu dipastikan ada, penanda reminder di-reset utk siklus baru.
// - Email konfirmasi "Lisensi Diperpanjang" dikirim bila status ACTIVE.
// Perubahan Expired oleh sistem (aktivasi) TIDAK memicu fungsi ini (setValue tak picu onEdit).
function handleRenewal(sheet, row){
  try {
    if ((sheet.getRange(row, AC.LOGIN).getValue() || '').toString().trim() === '') return;
    var cell = sheet.getRange(row, AC.EXP);
    var raw = cell.getValue();
    var d = (raw instanceof Date) ? raw : parseExpired((raw || '').toString());
    if (!d) return;
    if (!(raw instanceof Date)) cell.setValue(d).setNumberFormat('yyyy.MM.dd HH:mm');
    setSisaFormula(sheet, row);
    sheet.getRange(row, AC.REMIND).setValue('');
    var st = (sheet.getRange(row, AC.STATUS).getValue() || '').toString().toUpperCase().trim();
    if (st === 'ACTIVE') { try { sendRenewalConfirmEmail(sheet, row, d); } catch (e1) {} }
  } catch (err) { console.error('handleRenewal gagal: ' + err); }
}

// Email ke user: lisensi telah DIPERPANJANG sampai tanggal baru (header hijau).
function sendRenewalConfirmEmail(sheet, row, expDate){
  try {
    var c = accContact(sheet, row), email = c.email, nama = c.nama, login = c.login;
    if (!email) return;
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

// Email ke user bahwa ID-nya DIBLOKIR (blacklist) -> arahkan ke admin utk rehabilitasi.
function sendBlacklistEmail(m, logins) {
  try {
    if (!m || !m.email) return;
    var introU = '<p style="margin:0 0 12px;">Kami informasikan bahwa keanggotaan Apocalypto Anda telah <b>DIBLOKIR</b>.</p>';
    var rowsU = [ ['Kode Member', m.kode], ['Akun EA', (logins && logins.length) ? logins.join(', ') : '-'], ['Status', 'DIBLOKIR'] ];
    var noteU = infoBox('Selama diblokir, EA tidak akan berjalan dan Anda tidak dapat masuk ke apocalypto.id. Untuk <b>rehabilitasi</b> silakan menghubungi admin.', 'danger');
    sendMailUser({ to: m.email, subject: 'Apocalypto — Keanggotaan Anda Diblokir',
      body: 'Keanggotaan Anda diblokir. Untuk rehabilitasi silakan menghubungi admin: ' + ADMIN_WA_URL,
      htmlBody: emailShell('Pemberitahuan Pemblokiran', m.nama, introU, rowsU, noteU, '#9B2C2C'), name: 'EA Apocalypto' });
    maybeWarnQuota();
  } catch (err) { console.error('sendBlacklistEmail gagal: ' + err); }
}

// Email ke user: ID telah DIREHABILITASI (blacklist dicabut admin) -> aktif kembali.
function sendRehabEmail(m, logins) {
  try {
    if (!m || !m.email) return;
    var introU = '<p style="margin:0 0 12px;"><b>Kabar baik!</b> Keanggotaan Apocalypto Anda telah <b>direhabilitasi</b> dan aktif kembali.</p>';
    var rowsU = [ ['Kode Member', m.kode], ['Akun EA', (logins && logins.length) ? logins.join(', ') : '-'], ['Status', 'AKTIF'] ];
    var noteU = infoBox('Silakan masuk kembali di apocalypto.id. Bila punya akun EA, <b>pasang ulang EA</b> ke chart; EA aktif kembali dalam waktu <b>maksimal 1&times;24 jam</b>.', 'ok');
    sendMailUser({ to: m.email, subject: 'Apocalypto — Keanggotaan Anda Telah Direhabilitasi',
      body: 'Keanggotaan Anda telah direhabilitasi dan aktif kembali.',
      htmlBody: emailShell('Keanggotaan Direhabilitasi', m.nama, introU, rowsU, noteU, '#1E7A46'), name: 'EA Apocalypto' });
    maybeWarnQuota();
  } catch (err) { console.error('sendRehabEmail gagal: ' + err); }
}

// (Email "Dinonaktifkan admin" DIHAPUS — SOP full-otomatis, tidak ada penonaktifan manual.)

// ---------- 3b. REMINDER PERPANJANG: cek harian, kirim saat sisa <= 3 hari ----------
function checkExpiringLicenses() {
  var sheet = accSheet();
  var last = sheet.getLastRow();
  if (last < 2) return;
  var tz = Session.getScriptTimeZone(), now = new Date();
  for (var r = 2; r <= last; r++) {
    var status = (sheet.getRange(r, AC.STATUS).getValue() || '').toString().toUpperCase().trim();
    if (status !== 'ACTIVE') continue;
    var exp = sheet.getRange(r, AC.EXP).getValue();
    if (!exp || !(exp instanceof Date)) continue;
    var daysLeft = Math.floor((exp.getTime() - now.getTime()) / 86400000);
    if (daysLeft < 0) {
      sheet.getRange(r, AC.STATUS).setValue('Inactive');
      try { sendExpiredEmail(sheet, r, exp); } catch (e0) {}
      continue;
    }
    if (daysLeft > 3) continue;
    var expStr = Utilities.formatDate(new Date(exp), tz, 'yyyy.MM.dd');
    if ((sheet.getRange(r, AC.REMIND).getValue() || '').toString().trim() === expStr) continue;
    sendRenewalReminder(sheet, r, exp, daysLeft);
    sheet.getRange(r, AC.REMIND).setValue(expStr);
  }
}

// Email ke user: masa lisensi TELAH BERAKHIR & EA dinonaktifkan otomatis.
function sendExpiredEmail(sheet, row, expDate){
  try {
    var c = accContact(sheet, row), email = c.email, nama = c.nama, login = c.login;
    if (!email) return;
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
    var c = accContact(sheet, row), email = c.email, nama = c.nama, login = c.login;
    if (!email) return;
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
    var c = accContact(sheet, row), email = c.email, nama = c.nama, login = c.login;
    if (!email) return;
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
    var c = accContact(sheet, row), email = c.email, nama = c.nama, login = c.login;
    if (!email) return;
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
// Pemasangan rutin (aman dijalankan berulang): header, rumus, format, trigger, tab pendukung.
function setupSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  memberSheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  ensureHeaders(sheet);
  sheet.getRange(1, 1, 1, HEADERS.length).setBackground('#0E1A2B').setFontColor('#E7C766');
  sheet.setColumnWidths(1, HEADERS.length, 140);
  sheet.getRange('A:A').setNumberFormat('@');
  normalizeExpiredDates(sheet);
  var last = sheet.getLastRow();
  for (var r = 2; r <= last; r++) if (sheet.getRange(r, 1).getValue() !== '') { setSisaFormula(sheet, r); setNamaFormula(sheet, r); }
  applySisaWaktuFormat(sheet);
  applyStatusValidation(sheet);
  installTriggers();
  ensureInvoiceTab();
  ensureProfitTab();
  tangkasSheet();
  PropertiesService.getScriptProperties().deleteProperty('TANGKAS_TRG_V1');
  ensureTangkasTriggers();
}

// RESET TOTAL ke struktur v2 (menghapus SEMUA data). Dijalankan admin dari menu Apocalypto.
function resetDatabaseV2() {
  var ui = null;
  try { ui = SpreadsheetApp.getUi(); } catch (e) {}
  if (ui) {
    var ok = ui.alert('Reset Database', 'SEMUA data (Member, Akun EA, Profit, Invoice, TANGKAS, Profiling, Registrasi Web lama) akan DIHAPUS dan dibuat ulang dengan struktur baru.\n\nLanjutkan?', ui.ButtonSet.YES_NO);
    if (ok !== ui.Button.YES) return;
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var keep = ss.insertSheet('_tmp_' + Date.now());
  ['Registrasi Web', 'TANGKAS Pengaturan', 'Profiling', MEMBER_SHEET, SHEET_NAME, PROFIT_SHEET, INVOICE_SHEET, TANGKAS_SHEET].forEach(function (n) {
    var sh = ss.getSheetByName(n); if (sh) ss.deleteSheet(sh);
  });
  setupSheet();
  ss.deleteSheet(keep);
  ss.setActiveSheet(ss.getSheetByName(MEMBER_SHEET));
  var props = PropertiesService.getScriptProperties();
  props.getKeys().forEach(function (k) { if (/^TANGKAS_(APPR|WIN|TOK|ASKED|OPENED|FINAL|OPEN)_/.test(k)) props.deleteProperty(k); });
  if (ui) ui.alert('Selesai', 'Database sudah dikosongkan & memakai struktur baru (tab Member + Akun EA).', ui.ButtonSet.OK);
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
  var sheet = accSheet();
  var row = findMemberRow(sheet, login);
  if (row < 0) return { ok:false, error:'NOT_FOUND' };
  var v = sheet.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  var c = accContact(sheet, row);
  var jenis  = (v[AC.JENIS - 1] || '').toString();
  var isCent = /cent/i.test(jenis);
  var persen = parsePersen(v[AC.PS - 1]);
  var tz = Session.getScriptTimeZone();
  month = (month || '').toString().trim();
  if (!/^\d{4}-\d{2}$/.test(month)) month = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  var periode = monthToPeriode(month);
  var meta = getProfitMeta(login, month);
  if (meta === null) return { ok:false, error:'NO_PROFIT', periode:periode, month:month };
  var profitUSD = isCent ? (meta.profit / 100) : meta.profit;
  var shareUSD = profitUSD * persen / 100;
  var kurs = getKurs();
  var tagihan = kurs ? Math.round(shareUSD * kurs) : 0;
  return {
    ok:true, login:login, month:month, kode:c.kode,
    finalized:(meta.final === true), lastUpdateStr: meta.updMs ? Utilities.formatDate(new Date(meta.updMs), tz, 'yyyy-MM-dd HH:mm') : '',
    nama:c.nama, email:c.email, wa:c.wa, status:(v[AC.STATUS - 1]||'').toString(),
    jenis:jenis, satuan:(isCent ? 'Cent' : 'USD'), persen:persen, periode:periode,
    profitInput:profitUSD, profitUSD:profitUSD, profitUSDStr: formatUSD(profitUSD),
    shareUSD:shareUSD, shareUSDStr: formatUSD(shareUSD),
    kurs:kurs, kursStr: kurs ? formatRupiah(kurs) : '(gagal ambil kurs)',
    tagihan:tagihan, tagihanStr: formatRupiah(tagihan),
    bank:{ nama:BANK_NAMA, rek:BANK_REK, an:BANK_AN }
  };
}

function ensureInvoiceHeaders(inv){
  var head = ['No Invoice','Tanggal','Login MT5','Kode Member','Nama Member','Periode','Profit (input)','Satuan','Profit USD','Persen','Kurs','Tagihan','Kode Unik','Status','Waktu Lunas'];
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
  inv.appendRow([ invId, new Date(), b.login, b.kode, b.nama, b.periode,
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
  inv.appendRow([ invId, new Date(), b.login, b.kode, b.nama, b.periode,
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
  inv.appendRow([ invId, new Date(), b.login, b.kode, b.nama, b.periode,
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

  var sheet = accSheet();
  var data = sheet.getDataRange().getValues();
  var ok = 0, skip = 0;
  var needReview = [];   // akun Real aktif yg invoice-nya DITAHAN (data basi/kosong) -> verifikasi admin
  for (var i = 1; i < data.length; i++){
    var login = (data[i][AC.LOGIN - 1] || '').toString().trim();
    if (!login) continue;
    var status = (data[i][AC.STATUS - 1] || '').toString().toUpperCase().trim();
    var jenis  = (data[i][AC.JENIS - 1] || '').toString().toLowerCase();
    if (status !== 'ACTIVE') { skip++; continue; }                    // hanya aktif
    // Jangan proses periode SEBELUM member aktif (mis. tagih September utk member yg baru aktif Oktober).
    var actRaw = data[i][AC.AKTIVASI - 1] || data[i][AC.DAFTAR - 1];
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
        var nmR = (data[i][AC.KODE - 1] || '').toString();
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
  var m = memberByKode(String(row[3] || '').trim());
  var email = m ? m.email : '';
  if (!email) return;
  var periode = formatPeriode(row[5]);
  var nama = (m && m.nama) || (row[4]||'').toString() || 'Member';
  var introU = '<p style="margin:0 0 12px;">Pembayaran Profit Sharing Anda sudah kami <b>terima</b>. Terima kasih! 🙏</p>';
  var rowsU = [ ['No. Invoice', (row[0]||'').toString()], ['Nomor Akun', (row[2]||'').toString()], ['Periode', periode],
                ['Jumlah Dibayar', formatRupiah(row[11])], ['Status', 'LUNAS', true] ];
  var noteU = infoBox('Pembayaran Anda telah lunas. EA Apocalypto Anda tetap aktif &mdash; salam profit! 🚀', 'ok');
  sendMailUser({ to: email, subject: 'Pembayaran Diterima (LUNAS) — EA Apocalypto (' + periode + ')',
                 body: 'Pembayaran Profit Sharing periode ' + periode + ' (' + formatRupiah(row[11]) + ') sudah diterima. Status: LUNAS.',
                 htmlBody: emailShell('Pembayaran Diterima', nama, introU, rowsU, noteU, '#1E7A46'), name:'EA Apocalypto' });
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
      .addItem('🛠️ Pasang / Rapikan Struktur', 'setupSheet')
      .addItem('📈 Atur Akun Apocalypto (riwayat transaksi)', 'apoSetMainLogin')
      .addSeparator()
      .addItem('♻️ Reset Database (hapus semua data)', 'resetDatabaseV2')
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

  // ---- 2. Baca akun EA + data member (via Kode Member) ----
  var last = mSheet.getLastRow();
  if (last < 2) return;
  var md = mSheet.getRange(2, 1, last-1, HEADERS.length).getValues();
  var accPerKode = {};
  for (var i=0;i<md.length;i++){ var kd=String(md[i][AC.KODE-1]||'').trim(); if (kd) accPerKode[kd]=(accPerKode[kd]||0)+1; }

  // ---- 3. Hitung profil tiap akun ----
  var out = [];
  for (var i=0;i<md.length;i++){
    var r = md[i];
    var login = String(r[AC.LOGIN-1]||'').trim(); if (!login) continue;
    var kode   = String(r[AC.KODE-1]||'').trim();
    var mem    = kode ? memberByKode(kode) : null;
    var nama   = mem ? mem.nama : '';
    var status = String(r[AC.STATUS-1]||'').trim();
    var stLow  = status.toLowerCase();
    var jenis  = String(r[AC.JENIS-1]||'').trim();
    var jnLow  = jenis.toLowerCase().indexOf('real')>=0 ? 'real' : (jenis ? 'demo' : '');
    var broker = String(r[AC.SERVER-1]||'');
    var skema  = String(r[AC.MASA-1]||'');
    var psharing = String(r[AC.PS-1]||'');
    var blk    = !!(mem && mem.blocked);
    var regDate = r[AC.DAFTAR-1] ? new Date(r[AC.DAFTAR-1]) : null;
    var expDate = r[AC.EXP-1]  ? new Date(r[AC.EXP-1])  : null;
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

    // --- Akun lain milik member yg sama ---
    var dupTxt = (kode && accPerKode[kode]>1) ? (accPerKode[kode]+' akun') : '-';

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
    if (dupTxt!=='-')   note.push('Member punya '+dupTxt);

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

    out.push([ login, kode, nama, jenis, status, seg, score, n,
               Math.round(tot*100)/100, Math.round(avg*100)/100, lastPr, winrate, tren, vol,
               daysReg, daysExp, dormant, skema, psharing, estShare, broker, dupTxt, (blk?'YA':'-'), note.join('; ') ]);
  }

  out.sort(function(a,b){ return b[6]-a[6]; });   // skor tertinggi di atas

  // ---- 4. Tulis tab "Profiling" ----
  var headers = ['Login','Kode Member','Nama','Jenis','Status','Segmen','Skor','Bln Data','Total Profit','Rata2/Bln',
                 'Profit Terakhir','Winrate%','Tren','Volatilitas','Umur Daftar (hr)','Sisa Expired (hr)',
                 'Dormant (bln)','Paket','Profit Sharing','Est. Sharing','Broker','Akun Member','Blacklist','Catatan'];
  var sh = ss.getSheetByName('Profiling') || ss.insertSheet('Profiling');
  sh.clear();
  sh.getRange(1,1,1,headers.length).setValues([headers]).setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (out.length) sh.getRange(2,1,out.length,headers.length).setValues(out);
  try { sh.autoResizeColumns(1, headers.length); } catch(e){}
  try { ss.toast(out.length + ' member diprofilkan. Tab "Profiling" diperbarui.', 'Profiling', 5); } catch(e){}
}


//====================================================================
//  REGISTRASI MEMBER dari situs apocalypto.id -> tab "Member"
//  Situs mengirim (POST): action=member, nama, email, wa, halaman, key=REG_KEY
//  Satu baris per email: kalau email sudah ada, data & "Terakhir" diperbarui
//  dan "Jumlah Registrasi" bertambah (bukan baris baru).
//====================================================================

// Simpan / perbarui 1 baris per email di tab "Member".


//====================================================================
//  TANGKAS (Tanggal & Kasih Surprise) -> tab "TANGKAS"
//  Situs mengirim (POST): action=tangkas, nama, email, wa, bank, rek, an, key=REG_KEY
//  - Hanya diterima pukul TANGKAS_OPEN_H..TANGKAS_CLOSE_H WIB (dicek di server).
//  - Satu entri per member per hari (dicek dari email ATAU WhatsApp).
//  - Admin cukup centang kolom "Pemenang" & isi "Ditransfer" setelah transfer Rp100.000.
//  Balasan: {result:'ok'} | {result:'already'} | {result:'closed'} | {result:'error', error}
//====================================================================
function handleTangkas(p) {
  // IKUTAN DONG: member login + rekening terverifikasi, saat system aktif, 1x per hari.
  // Nomor urut & label TIDAK diberitahukan sebelum pukul 21:00 (mencegah peserta mengatur waktu masuk).
  if (!checkFormKey(p)) return otpOut({ result: 'error', error: 'BAD_KEY' });
  var me = authMember(p);
  if (!me) return otpOut({ result: 'auth' });
  if (!me.rek) return otpOut({ result: 'need_bank' });
  if (!tangkasStatus().open) return otpOut({ result: 'closed' });

  var tz = 'Asia/Jakarta', now = new Date();
  var tgl = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var lock = LockService.getScriptLock();
  lock.tryLock(15000);
  try {
    var sh = tangkasSheet();
    var no = 0;
    var last = sh.getLastRow();
    if (last >= 2) {
      var rows = sh.getRange(2, 1, last - 1, 6).getDisplayValues();   // A tgl .. F email
      for (var i = 0; i < rows.length; i++) {
        if (rows[i][0] !== tgl) continue;
        no++;
        if (String(rows[i][5]).trim().toLowerCase() === me.email) return otpOut({ result: 'already' });
      }
    }
    no++;
    var label = ((no - 1) % daysInMonth(tgl)) + 1;
    sh.appendRow(["'" + tgl, Utilities.formatDate(now, tz, 'HH:mm:ss'), no, label, me.nama, me.email, "'" + me.wa, me.bank, "'" + me.rek, me.an, false, '', '']);
    sh.getRange(sh.getLastRow(), 11).insertCheckboxes();
    return otpOut({ result: 'ok' });
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
  var mode  = (p.mode === 'login' || p.mode === 'bank' || p.mode === 'profile') ? p.mode : 'join';
  var target = '', prof = null;
  var bank = '', rek = '', an = '';
  var nama  = String(p.nama || '').trim().slice(0, 40);
  var email = String(p.email || '').trim().toLowerCase().slice(0, 80);
  var wa    = normPhone(String(p.wa || ''));
  var hal   = String(p.halaman || '').trim().slice(0, 40);
  if (mode === 'profile') {
    // UBAH PROFIL: wajib login; OTP dikirim ke email BARU (bila diganti) atau email lama.
    var meP = authMember(p);
    if (!meP) return otpOut({ result: 'auth' });
    var nE = String(p.new_email || '').trim().toLowerCase().slice(0, 80);
    var nN = String(p.nama || '').trim().slice(0, 40);
    var nW = normPhone(String(p.wa || ''));
    var nB = String(p.bank || '').trim().slice(0, 40), nR = String(p.rek || '').replace(/[^0-9]/g, '').slice(0, 25), nA = String(p.an || '').trim().slice(0, 60);
    if (!nN || !validEmailStr(nE) || !isDigitsStr(nW) || nW.length < 8) return otpOut({ result: 'error', error: 'INVALID_INPUT' });
    if ((nB || nR || nA) && (!nB || nR.length < 6 || !nA)) return otpOut({ result: 'error', error: 'INVALID_BANK' });
    var dupP = findWebMemberDup(nE, nW, meP.row);
    if (dupP) return otpOut({ result: 'registered', by: dupP });
    prof = { nama: nN, email: nE, wa: nW, bank: nB, rek: nR, an: nA };
    email = meP.email; nama = nN; wa = nW; target = nE;
  } else if (mode === 'bank') {
    // VERIFIKASI REKENING (TANGKAS): wajib sudah login (token sesi) -> data rekening disimpan setelah OTP benar
    var me = authMember(p);
    if (!me) return otpOut({ result: 'auth' });
    bank = String(p.bank || '').trim().slice(0, 40);
    rek  = String(p.rek || '').replace(/[^0-9]/g, '').slice(0, 25);
    an   = String(p.an || '').trim().slice(0, 60);
    if (!bank || rek.length < 6 || !an) return otpOut({ result: 'error', error: 'INVALID_INPUT' });
    email = me.email; nama = me.nama; wa = me.wa;
  } else if (mode === 'login') {
    // MASUK: member lama cukup email -> nama & WA diambil dari tab "Member"
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
    if (dup) return otpOut({ result: dup === 'blacklist' ? 'blacklist' : 'registered', by: dup });
  }
  if (mode === 'login' && webMemberBlocked(email)) return otpOut({ result: 'blacklist' });

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
  cache.put(k, JSON.stringify({ code: code, mode: mode, nama: nama, wa: wa, hal: hal, bank: bank, rek: rek, an: an, prof: prof, tries: 0 }), OTP_TTL_SEC);
  cache.put(k + '_t', String(nowMs), OTP_RESEND_SEC + 5);
  cache.put(k + '_n', String(cnt + 1), 3600);

  try {
    var tujuan = mode === 'login' ? 'masuk ke' : mode === 'bank' ? 'memverifikasi data rekening Anda di' : mode === 'profile' ? 'menyimpan perubahan profil Anda di' : 'bergabung di';
    var intro = '<p style="margin:0 0 12px;">Berikut kode untuk ' + tujuan + ' <b>apocalypto.id</b>. Kode berlaku <b>10 menit</b>.</p>' +
      '<div style="text-align:center;margin:18px 0;"><span style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:10px;color:#0E1A2B;background:#F5ECD5;border:1px solid #E6D7A8;border-radius:10px;padding:12px 18px 12px 28px;">' + code + '</span></div>';
    var note = infoBox('Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku sebagai admin. Abaikan email ini bila Anda tidak merasa meminta kode.', 'warn');
    sendMailUser({
      to: target || email,
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
  return otpOut({ result: 'sent', wait: OTP_RESEND_SEC, to: target || email });
}

// Cari member di tab "Member" berdasarkan email -> {nama, wa} atau null.

// Cek email / WA sudah ada di tab "Member" -> 'email' | 'wa' | 'both' | null

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
  if (d.mode === 'profile') {
    var meV = authMember(p);
    if (!meV || meV.email !== email) return otpOut({ result: 'auth' });
    cache.remove(k);
    var pr = d.prof;
    var dupV = findWebMemberDup(pr.email, pr.wa, meV.row);
    if (dupV) return otpOut({ result: 'registered', by: dupV });
    applyProfileChange(meV, pr);
    return otpOut({ result: 'ok', nama: pr.nama, email: pr.email, wa: pr.wa, bank: pr.bank || meV.bank, rek: maskRek(pr.rek || meV.rek), an: pr.an || meV.an });
  }
  if (d.mode === 'bank') {
    var me = authMember(p);
    if (!me || me.email !== email) return otpOut({ result: 'auth' });
    cache.remove(k);
    setMemberBank(me.row, d.bank, d.rek, d.an);
    return otpOut({ result: 'ok', bank: d.bank, rek: maskRek(d.rek), an: d.an });
  }
  cache.remove(k);
  upsertWebMember(d.nama, email, d.wa, d.hal);
  var token = issueMemberToken(email);
  return otpOut({ result: 'ok', nama: d.nama, wa: d.wa, token: token });
}


// Menit buka acak TANGKAS untuk tanggal tsb (dibuat sekali per hari, disimpan di Script Properties).
function tangkasOpenMinute(tgl) {
  var props = PropertiesService.getScriptProperties();
  var key = 'TANGKAS_OPEN_' + tgl;
  var v = props.getProperty(key);
  if (v === null) {
    var lock = LockService.getScriptLock();
    lock.tryLock(5000);
    try {
      v = props.getProperty(key);
      if (v === null) {
        v = String(Math.floor(Math.random() * (TANGKAS_RAND_MAX + 1)));
        props.setProperty(key, v);
        // bersihkan kunci hari-hari lama
        var all = props.getKeys();
        for (var i = 0; i < all.length; i++) {
          if (all[i].indexOf('TANGKAS_OPEN_') === 0 && all[i] < 'TANGKAS_OPEN_' + tgl) props.deleteProperty(all[i]);
        }
      }
    } finally { lock.releaseLock(); }
  }
  return Number(v);
}

// Status TANGKAS saat ini. Menit buka TIDAK dibocorkan sebelum waktunya.
// {open:bool, openedAt:'HH:mm'|null, closeAt:'21:00'}
function tangkasStatus() {
  // {open, openedAt, closeAt, holiday}
  //  - di menit acak sistem MINTA PERSETUJUAN admin (email). Buka hanya setelah admin menyetujui.
  //  - admin pilih "Libur" / tidak menjawab sampai tutup -> holiday:true (halaman: libur, coba lagi besok).
  var tz  = 'Asia/Jakarta';
  var now = new Date();
  var tgl = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var cur = Number(Utilities.formatDate(now, tz, 'H')) * 60 + Number(Utilities.formatDate(now, tz, 'm'));
  var closeAt = ('0' + TANGKAS_CLOSE_H).slice(-2) + ':00';
  if (TANGKAS_TEST) return { open: true, openedAt: null, closeAt: closeAt, holiday: false };
  var props = PropertiesService.getScriptProperties();
  var appr = props.getProperty('TANGKAS_APPR_' + tgl);          // null | 'yes' | 'no'
  if (cur >= TANGKAS_CLOSE_H * 60) return { open: false, openedAt: null, closeAt: closeAt, holiday: appr !== 'yes' };
  if (appr === 'no') return { open: false, openedAt: null, closeAt: closeAt, holiday: true };
  if (cur < TANGKAS_OPEN_H * 60) return { open: false, openedAt: null, closeAt: closeAt, holiday: false };
  var openAt = TANGKAS_OPEN_H * 60 + tangkasOpenMinute(tgl);
  if (cur < openAt) return { open: false, openedAt: null, closeAt: closeAt, holiday: false };
  if (appr !== 'yes') { tangkasAskApproval(tgl, openAt); return { open: false, openedAt: null, closeAt: closeAt, holiday: false }; }
  var at = Number(props.getProperty('TANGKAS_OPENED_' + tgl) || openAt);
  return { open: true, openedAt: ('0' + Math.floor(at / 60)).slice(-2) + ':' + ('0' + (at % 60)).slice(-2), closeAt: closeAt, holiday: false };
}


//====================================================================
//  SESI MEMBER (token) + DATA REKENING  -> tab "Member"
//  Kolom: A Waktu | B Nama | C Email | D WA | E Halaman | F Terakhir | G Jumlah
//         H Bank | I No. Rekening | J Atas Nama | K Rekening Diverifikasi | L Token Sesi (hash)
//====================================================================


function sha256Hex(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t)).map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}
// Buat token sesi baru (dikirim ke browser), simpan hanya hash-nya di kolom L.
// Cek email + token -> data member, atau null.
function maskRek(rek) { rek = String(rek || ''); return rek.length <= 4 ? rek : new Array(rek.length - 3).join('\u2022') + rek.slice(-4); }

//====================================================================
//  TANGKAS — nomor urut, label & pemenang
//  - Nomor urut = urutan masuk per hari (1, 2, 3, ...).
//  - Label = nomor urut yang "berputar" sesuai jumlah hari bulan itu: bulan 30 hari -> 1..30, 31 -> 1, dst.
//  - Pemenang = peserta dgn LABEL = TANGGAL hari itu (tgl 18 -> label 18), diambil sesuai urutan,
//    sebanyak "Jumlah pemenang per hari" di tab "TANGKAS Pengaturan" (diisi admin).
//  - Diumumkan di website setelah pukul 21:00 (kolom "Pemenang" dicentang otomatis).
//====================================================================
function daysInMonth(tgl) { var y = Number(tgl.slice(0, 4)), m = Number(tgl.slice(5, 7)); return new Date(y, m, 0).getDate(); }

function tangkasSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TANGKAS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TANGKAS_SHEET);
    sh.getRange(1, 1, 1, 13).setValues([['Tanggal', 'Waktu', 'No. Urut', 'Label', 'Nama Panggilan', 'Email', 'WhatsApp',
      'Bank', 'No. Rekening', 'Atas Nama', 'Pemenang', 'Ditransfer', 'Catatan Admin']])
      .setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#E7C766');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, 13, 130);
  }
  return sh;
}
function tangkasWinnerCount() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(TANGKAS_CFG_SHEET);
  if (!sh) {
    sh = ss.insertSheet(TANGKAS_CFG_SHEET);
    sh.getRange(1, 1, 3, 2).setValues([
      ['Pengaturan', 'Nilai'],
      ['Jumlah pemenang per hari', 1],
      ['Keterangan', 'Pemenang = peserta dgn label = tanggal hari itu, diambil sesuai urutan masuk. Ubah angka di B2.']
    ]);
    sh.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#E7C766');
    sh.setColumnWidth(1, 220); sh.setColumnWidth(2, 520);
  }
  var n = Number(sh.getRange(2, 2).getValue());
  return (isNaN(n) || n < 0) ? 1 : Math.floor(n);
}
// Tentukan & centang pemenang untuk tanggal tgl (sekali saja). Mengembalikan daftar baris pemenang.
function tangkasFinalize(tgl) {
  var props = PropertiesService.getScriptProperties();
  var sh = tangkasSheet();
  var last = sh.getLastRow();
  var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 11).getValues() : [];
  var disp = last >= 2 ? sh.getRange(2, 1, last - 1, 1).getDisplayValues() : [];
  var day = Number(tgl.slice(8, 10));
  var done = props.getProperty('TANGKAS_FINAL_' + tgl) === '1';
  var nAppr = props.getProperty('TANGKAS_WIN_' + tgl);
  var list = [], winners = [], need = done ? 0 : (nAppr !== null ? Number(nAppr) : 0);
  for (var i = 0; i < rows.length; i++) {
    if (disp[i][0] !== tgl) continue;
    var e = { r: i + 2, no: Number(rows[i][2]), label: Number(rows[i][3]), nama: String(rows[i][4]), email: String(rows[i][5]).toLowerCase(), wa: normPhone(String(rows[i][6])), win: rows[i][10] === true };
    if (!done && need > 0 && e.label === day) { e.win = true; need--; sh.getRange(e.r, 11).setValue(true); }
    list.push(e);
    if (e.win) winners.push(e);
  }
  if (!done) props.setProperty('TANGKAS_FINAL_' + tgl, '1');
  return { list: list, winners: winners };
}
// budi.santoso@gmail.com -> bu**********@gm***.com
function maskEmail(e) {
  e = String(e || ''); var at = e.indexOf('@'); if (at < 1) return '***';
  var u = e.slice(0, at), d = e.slice(at + 1), dot = d.lastIndexOf('.');
  var dn = dot > 0 ? d.slice(0, dot) : d, tld = dot > 0 ? d.slice(dot) : '';
  var mu = u.slice(0, Math.min(2, u.length)) + new Array(Math.max(u.length - 2, 1) + 1).join('*');
  var md = dn.slice(0, Math.min(2, dn.length)) + new Array(Math.max(dn.length - 2, 1) + 1).join('*');
  return mu + '@' + md + tld;
}
// 81234567890 -> ********7890
function maskWa(w) { w = String(w || '').replace(/\D/g, ''); return w.length <= 4 ? w : new Array(w.length - 3).join('*') + w.slice(-4); }
function maskNama(n) { n = String(n || '').trim(); return n.length <= 2 ? n : n.slice(0, 2) + new Array(Math.min(n.length - 2, 4) + 1).join('*'); }

// Status + pengumuman untuk halaman TANGKAS.
//   Sebelum 21:00 -> pengumuman = hari kemarin; setelah 21:00 -> hari ini.
function handleTangkasInfo(p) {
  if (!checkFormKey(p)) return otpOut({ result: 'error', error: 'BAD_KEY' });
  var me = authMember(p);
  if (!me) return otpOut({ result: 'auth' });
  var tz = 'Asia/Jakarta', now = new Date();
  var today = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var cur = Number(Utilities.formatDate(now, tz, 'H')) * 60 + Number(Utilities.formatDate(now, tz, 'm'));
  var closed = cur >= TANGKAS_CLOSE_H * 60;
  var annDate = closed ? today : Utilities.formatDate(new Date(now.getTime() - 86400000), tz, 'yyyy-MM-dd');

  // sudah ikut hari ini?
  var sh = tangkasSheet(), last = sh.getLastRow(), joined = false;
  if (last >= 2) {
    var rows = sh.getRange(2, 1, last - 1, 6).getDisplayValues();
    for (var i = 0; i < rows.length; i++) if (rows[i][0] === today && String(rows[i][5]).trim().toLowerCase() === me.email) { joined = true; break; }
  }
  // pengaman: hari ini TIDAK pernah difinalkan sebelum jam tutup
  var fin = (annDate === today && !closed) ? { list: [], winners: [] } : tangkasFinalize(annDate), mine = null;
  for (var j = 0; j < fin.list.length; j++) if (fin.list[j].email === me.email) { mine = fin.list[j]; break; }
  return otpOut({
    result: 'ok',
    status: tangkasStatus(),
    hasBank: !!me.rek,
    bank: me.bank, rek: maskRek(me.rek), an: me.an,
    joinedToday: joined,
    announce: {
      date: annDate,
      day: Number(annDate.slice(8, 10)),
      total: fin.list.length,
      winners: fin.winners.map(function (w) { return { nama: w.nama, email: maskEmail(w.email), wa: maskWa(w.wa), no: w.no, label: w.label }; }),
      me: mine ? { no: mine.no, label: mine.label, win: mine.win } : null
    }
  });
}


//====================================================================
//  TANGKAS — PERSETUJUAN ADMIN, TRIGGER HARIAN & RESET 24:00
//  - Trigger harian ~19:xx (tangkasPlanDaily) menyiapkan menit acak & menjadwalkan tangkasAsk.
//  - tangkasAsk (di menit acak) mengirim email persetujuan ke ADMIN_EMAIL:
//      tombol "Setujui — N pemenang" atau "Libur hari ini".
//  - Trigger harian ~00:xx (tangkasResetDaily): kirim REKAP pemenang kemarin ke admin
//    (termasuk data rekening, utk transfer 1x24 jam), lalu KOSONGKAN tab "TANGKAS Harian".
//  Trigger dipasang otomatis saat TANGKAS pertama kali dipakai (ensureTangkasTriggers).
//====================================================================
var TANGKAS_WIN_CHOICES = [1, 2, 3, 5];

function ensureTangkasTriggers() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('TANGKAS_TRG_V1') === '1') return;
  try {
    var ts = ScriptApp.getProjectTriggers();
    for (var i = 0; i < ts.length; i++) {
      var f = ts[i].getHandlerFunction();
      if (f === 'tangkasPlanDaily' || f === 'tangkasResetDaily') ScriptApp.deleteTrigger(ts[i]);
    }
    ScriptApp.newTrigger('tangkasPlanDaily').timeBased().everyDays(1).atHour(19).inTimezone('Asia/Jakarta').create();
    ScriptApp.newTrigger('tangkasResetDaily').timeBased().everyDays(1).atHour(0).inTimezone('Asia/Jakarta').create();
    props.setProperty('TANGKAS_TRG_V1', '1');
  } catch (e) { console.error('ensureTangkasTriggers: ' + e); }
}

function tangkasTodayAt(min) {
  var tz = 'Asia/Jakarta';
  var d = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  return new Date(d + 'T' + ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2) + ':00+07:00');
}

// ~19:xx setiap hari: tentukan menit acak hari ini & jadwalkan email persetujuan tepat di menit itu.
function tangkasPlanDaily() {
  var tz = 'Asia/Jakarta', tgl = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  var openAt = TANGKAS_OPEN_H * 60 + tangkasOpenMinute(tgl);
  var ts = ScriptApp.getProjectTriggers();
  for (var i = 0; i < ts.length; i++) if (ts[i].getHandlerFunction() === 'tangkasAsk') ScriptApp.deleteTrigger(ts[i]);
  ScriptApp.newTrigger('tangkasAsk').timeBased().at(tangkasTodayAt(openAt)).create();
}
function tangkasAsk() {
  var tz = 'Asia/Jakarta', tgl = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  tangkasAskApproval(tgl, TANGKAS_OPEN_H * 60 + tangkasOpenMinute(tgl));
}

// Kirim email persetujuan (sekali per hari).
function tangkasAskApproval(tgl, openAt) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('TANGKAS_ASKED_' + tgl)) return;
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    if (props.getProperty('TANGKAS_ASKED_' + tgl)) return;
    var tok = Utilities.getUuid().replace(/-/g, '');
    props.setProperty('TANGKAS_TOK_' + tgl, tok);
    props.setProperty('TANGKAS_ASKED_' + tgl, '1');
    var base = DEPLOY_URL + '?action=tk_appr&d=' + tgl + '&t=' + tok;
    var btn = function (href, label, bg) {
      return '<a href="' + href + '" style="display:inline-block;margin:4px;padding:11px 16px;border-radius:8px;background:' + bg + ';color:#fff;text-decoration:none;font-weight:bold;font-size:14px;">' + label + '</a>';
    };
    var html = btn(base + '&do=form', 'Setujui', '#1d7a45') + btn(base + '&do=no', 'Libur', '#9b2c2c');
    var jam = ('0' + Math.floor(openAt / 60)).slice(-2) + ':' + ('0' + (openAt % 60)).slice(-2);
    var intro = '<p style="margin:0 0 12px;">System TANGKAS <b>siap aktif</b> hari ini (' + formatTanggalID(new Date(tgl + 'T12:00:00+07:00')) + ', waktu acak <b>' + jam + ' WIB</b>). ' +
                'Halaman TANGKAS tetap <b>belum aktif</b> sampai Anda menyetujui. Klik <b>Setujui</b> lalu isi jumlah pemenang hari ini, atau <b>Libur</b>.</p>' +
                '<div style="text-align:center;margin:14px 0;">' + html + '</div>';
    var note = infoBox('Tutup otomatis pukul ' + TANGKAS_CLOSE_H + ':00 WIB. Bila tidak dijawab sampai jam tutup, hari ini dianggap libur.', 'info');
    MailApp.sendEmail({ to: ADMIN_EMAIL, subject: 'TANGKAS ' + tgl + ' — Persetujuan buka (' + jam + ' WIB)',
      htmlBody: emailShell('Persetujuan TANGKAS', 'Admin', intro, [], note), name: 'Apocalypto System' });
  } catch (e) {
    console.error('tangkasAskApproval: ' + e);
    props.deleteProperty('TANGKAS_ASKED_' + tgl);
  } finally { lock.releaseLock(); }
}

// Halaman hasil klik tombol di email admin.
function tangkasApprovePage(p) {
  var tz = 'Asia/Jakarta', now = new Date(), tgl = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  var cur = Number(Utilities.formatDate(now, tz, 'H')) * 60 + Number(Utilities.formatDate(now, tz, 'm'));
  var props = PropertiesService.getScriptProperties();
  var page = function (msg, color) {
    return HtmlService.createHtmlOutput('<div style="font-family:Arial;text-align:center;padding:40px;"><h2 style="color:#0E1A2B;">TANGKAS</h2>' +
      '<p style="font-size:17px;color:' + (color || '#222') + ';">' + msg + '</p></div>').setTitle('TANGKAS');
  };
  var d = String(p.d || ''), tok = props.getProperty('TANGKAS_TOK_' + d);
  if (!tok || String(p.t || '') !== tok) return page('Link tidak valid.', '#9b2c2c');
  if (d !== tgl || cur >= TANGKAS_CLOSE_H * 60) return page('Link sudah kedaluwarsa (TANGKAS ' + d + ' sudah lewat).', '#9b2c2c');
  var prev = props.getProperty('TANGKAS_APPR_' + d);
  if (prev) return page('Sudah diputuskan sebelumnya: <b>' + (prev === 'yes' ? 'DISETUJUI (' + props.getProperty('TANGKAS_WIN_' + d) + ' pemenang)' : 'LIBUR') + '</b>.');
  if (p['do'] === 'form') {
    var f = '<form method="get" action="' + DEPLOY_URL + '" target="_top" style="margin-top:18px;">' +
      '<input type="hidden" name="action" value="tk_appr"><input type="hidden" name="d" value="' + d + '">' +
      '<input type="hidden" name="t" value="' + tok + '"><input type="hidden" name="do" value="yes">' +
      '<label style="display:block;font-size:15px;color:#333;margin-bottom:10px;">Jumlah pemenang hari ini</label>' +
      '<input type="number" name="n" value="1" min="1" max="50" required style="width:110px;font-size:22px;padding:10px;text-align:center;border:2px solid #1d7a45;border-radius:10px;">' +
      '<div style="margin-top:18px;"><button type="submit" style="padding:12px 28px;border:0;border-radius:10px;background:#1d7a45;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;">Setujui &amp; Buka TANGKAS</button></div></form>';
    return HtmlService.createHtmlOutput('<div style="font-family:Arial;text-align:center;padding:40px;"><h2 style="color:#0E1A2B;">TANGKAS ' + d + '</h2>' + f + '</div>')
      .setTitle('TANGKAS').addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  if (p['do'] === 'yes') {
    var n = Math.max(1, Math.min(50, Math.floor(Number(p.n) || 1)));
    var openAt = TANGKAS_OPEN_H * 60 + tangkasOpenMinute(d);
    props.setProperty('TANGKAS_WIN_' + d, String(n));
    props.setProperty('TANGKAS_OPENED_' + d, String(Math.max(openAt, cur)));
    props.setProperty('TANGKAS_APPR_' + d, 'yes');
    return page('&#10003; TANGKAS hari ini <b>DIBUKA</b> dengan <b>' + n + ' pemenang</b>. Tutup otomatis pukul ' + TANGKAS_CLOSE_H + ':00 WIB.', '#1d7a45');
  }
  if (p['do'] === 'no') {
    props.setProperty('TANGKAS_APPR_' + d, 'no');
    return page('TANGKAS hari ini <b>LIBUR</b>. Member melihat informasi libur & diminta mencoba lagi besok.', '#9b2c2c');
  }
  return page('Pilihan tidak dikenal.', '#9b2c2c');
}

// ~00:xx setiap hari: rekap pemenang kemarin ke admin, lalu kosongkan tab peserta & bersihkan data harian.
function tangkasResetDaily() {
  var tz = 'Asia/Jakarta';
  var kemarin = Utilities.formatDate(new Date(Date.now() - 6 * 3600000), tz, 'yyyy-MM-dd');   // aman walau trigger telat
  try {
    var fin = tangkasFinalize(kemarin);
    var sh = tangkasSheet(), last = sh.getLastRow();
    var rows = last >= 2 ? sh.getRange(2, 1, last - 1, 10).getDisplayValues() : [];
    var win = [];
    for (var i = 0; i < rows.length; i++) {
      if (rows[i][0] !== kemarin) continue;
      for (var j = 0; j < fin.winners.length; j++) if (fin.winners[j].r === i + 2) win.push(rows[i]);
    }
    var tableRows = win.map(function (r) { return ['No. ' + r[2] + ' — ' + r[4], r[7] + ' ' + r[8] + ' a.n. ' + r[9] + '<br><span style="font-weight:normal;color:#666;">' + r[5] + ' · WA ' + r[6] + '</span>', true]; });
    var intro = '<p style="margin:0 0 12px;">Rekap TANGKAS <b>' + formatTanggalID(new Date(kemarin + 'T12:00:00+07:00')) + '</b>: ' + fin.list.length + ' peserta, ' + win.length + ' pemenang. ' +
                'Data peserta di spreadsheet sudah <b>dikosongkan</b>; simpan email ini sebagai bukti transfer.</p>';
    var note = infoBox('Transfer hadiah Rp100.000 paling lambat 1x24 jam sejak pengumuman. Cocokkan nama di aplikasi bank dengan "a.n." di atas; bila berbeda, hadiah di-suspend.', 'warn');
    if (fin.list.length) {
      MailApp.sendEmail({ to: ADMIN_EMAIL, subject: 'TANGKAS ' + kemarin + ' — Rekap pemenang (' + win.length + ')',
        htmlBody: emailShell('Rekap Pemenang TANGKAS', 'Admin', intro, tableRows, note), name: 'Apocalypto System' });
    }
  } catch (e) { console.error('tangkasResetDaily rekap: ' + e); }
  // kosongkan tab peserta (header tetap)
  var sh2 = tangkasSheet();
  if (sh2.getLastRow() >= 2) sh2.deleteRows(2, sh2.getLastRow() - 1);
  // bersihkan data harian lama di Script Properties
  var props = PropertiesService.getScriptProperties(), keys = props.getKeys(), today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  for (var k = 0; k < keys.length; k++) {
    var m = keys[k].match(/^TANGKAS_(APPR|WIN|TOK|ASKED|OPENED|FINAL|OPEN)_(\d{4}-\d{2}-\d{2})$/);
    if (m && m[2] < today) props.deleteProperty(keys[k]);
  }
}


//====================================================================
//  PROFIL MEMBER + BLACKLIST TERPUSAT (tab "Member" = data induk)
//====================================================================

// Simpan perubahan profil + samakan Nama/WA/Email di SEMUA akun MT5 member ini (tab Member).

// (lihat handleMemberBlacklistEdit)


//====================================================================
//  TAB "Member" (data induk orang) — v2
//====================================================================
function memberSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(MEMBER_SHEET);
  if (!sh) {
    sh = ss.insertSheet(MEMBER_SHEET);
    sh.getRange(1, 1, 1, MB_HEADERS.length).setValues([MB_HEADERS]).setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#E7C766');
    sh.setFrozenRows(1);
    sh.setColumnWidths(1, MB_HEADERS.length, 150);
  }
  return sh;
}
function memberRows() {
  var sh = memberSheet();
  return sh.getLastRow() >= 2 ? sh.getRange(2, 1, sh.getLastRow() - 1, MB_HEADERS.length).getDisplayValues() : [];
}
function memberObj(v, row) {
  return { row: row, kode: String(v[MB.KODE - 1]).trim(), nama: String(v[MB.NAMA - 1]).trim(),
           email: String(v[MB.EMAIL - 1]).trim().toLowerCase(), wa: normPhone(String(v[MB.WA - 1])),
           bank: String(v[MB.BANK - 1]).trim(), rek: String(v[MB.REK - 1]).replace(/[^0-9]/g, ''), an: String(v[MB.AN - 1]).trim(),
           blocked: String(v[MB.BL - 1]).toUpperCase() === 'TRUE', tokenHash: String(v[MB.TOKEN - 1]) };
}
function findMemberBy(field, value) {   // field: 'email' | 'kode'
  var rows = memberRows();
  value = String(value || '').trim(); if (field === 'email') value = value.toLowerCase();
  if (!value) return null;
  for (var i = 0; i < rows.length; i++) {
    var m = memberObj(rows[i], i + 2);
    if (m[field] === value) return m;
  }
  return null;
}
function memberByKode(kode) { return findMemberBy('kode', kode); }
function findWebMember(email) { return findMemberBy('email', email); }
function findWebMemberRow(email) { var m = findMemberBy('email', email); return m ? m.row : 0; }
function webMemberBlocked(email) { var m = findMemberBy('email', email); return !!(m && m.blocked); }

// email/WA sudah dipakai member lain? -> 'blacklist' | 'email' | 'wa' | 'both' | null
function findWebMemberDup(email, wa, excludeRow) {
  var rows = memberRows(), e = false, w = false, bl = false;
  for (var i = 0; i < rows.length; i++) {
    if (excludeRow && i + 2 === excludeRow) continue;
    var m = memberObj(rows[i], i + 2);
    var me = m.email === email, mw = !!wa && m.wa === wa;
    if (me) e = true; if (mw) w = true;
    if ((me || mw) && m.blocked) bl = true;
  }
  if (bl) return 'blacklist';
  return (e && w) ? 'both' : e ? 'email' : w ? 'wa' : null;
}
function nextMemberKode() {
  var rows = memberRows(), mx = 0;
  for (var i = 0; i < rows.length; i++) { var n = parseInt(String(rows[i][0]).replace(/\D/g, ''), 10); if (n > mx) mx = n; }
  return 'APX-' + ('000' + (mx + 1)).slice(-Math.max(4, String(mx + 1).length));
}
// Gabung (setelah OTP benar): buat member baru (atau perbarui bila email sudah ada).
function upsertWebMember(nama, email, wa, hal) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);
  try {
    var sh = memberSheet(), m = findMemberBy('email', email), now = new Date();
    if (m) { sh.getRange(m.row, MB.NAMA, 1, 3).setValues([[nama, email, "'" + wa]]); sh.getRange(m.row, MB.LAST).setValue(now); return 'update'; }
    var kode = nextMemberKode();
    sh.appendRow([kode, now, nama, email, "'" + wa, '', '', '', '', false, now, '']);
    sh.getRange(sh.getLastRow(), MB.BL).insertCheckboxes();
    return 'new';
  } finally { lock.releaseLock(); }
}
function sha256Hex(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t)).map(function (b) {
    return ('0' + ((b + 256) % 256).toString(16)).slice(-2);
  }).join('');
}
function issueMemberToken(email) {
  var token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  var m = findMemberBy('email', email);
  if (m) { var sh = memberSheet(); sh.getRange(m.row, MB.TOKEN).setValue(sha256Hex(token)); sh.getRange(m.row, MB.LAST).setValue(new Date()); }
  return token;
}
function authMember(p) {
  var email = String((p && p.email) || '').trim().toLowerCase();
  var token = String((p && p.token) || '');
  if (!validEmailStr(email) || token.length < 32) return null;
  var m = findMemberBy('email', email);
  if (!m || !m.tokenHash || m.tokenHash !== sha256Hex(token) || m.blocked) return null;
  return m;
}
function setMemberBank(row, bank, rek, an) {
  memberSheet().getRange(row, MB.BANK, 1, 4).setValues([[bank, "'" + rek, String(an || '').trim().toUpperCase(), new Date()]]);
}
function applyProfileChange(me, pr) {
  var sh = memberSheet();
  sh.getRange(me.row, MB.NAMA, 1, 3).setValues([[pr.nama, pr.email, "'" + pr.wa]]);
  if (pr.rek) setMemberBank(me.row, pr.bank, pr.rek, pr.an);
  // Akun EA cukup menyimpan Kode Member -> tidak ada yang perlu disalin.
}
// Admin centang/cabut Blacklist di tab Member -> semua akun EA milik member ikut.
function handleMemberBlacklistEdit(row, isBlocked) {
  var sh = memberSheet();
  var m = memberObj(sh.getRange(row, 1, 1, MB_HEADERS.length).getDisplayValues()[0], row);
  if (!m.kode) return;
  if (isBlocked) sh.getRange(row, MB.TOKEN).setValue('');   // putus sesi login
  var acc = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  var logins = [];
  if (acc && acc.getLastRow() >= 2) {
    var data = acc.getRange(2, 1, acc.getLastRow() - 1, HEADERS.length).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][AC.KODE - 1]).trim() !== m.kode) continue;
      var r = i + 2, st = String(data[i][AC.STATUS - 1]).toUpperCase().trim();
      logins.push(String(data[i][AC.LOGIN - 1]));
      if (isBlocked) { if (st !== 'INACTIVE' && st !== 'REJECTED') acc.getRange(r, AC.STATUS).setValue('Inactive'); }
      else if (data[i][AC.EXP - 1] instanceof Date && st === 'INACTIVE') acc.getRange(r, AC.STATUS).setValue('Active');
    }
  }
  try { if (isBlocked) sendBlacklistEmail(m, logins); else sendRehabEmail(m, logins); } catch (e) {}
}


// =====================================================================
//  AKUN APOCALYPTO — riwayat transaksi akun utama (dikirim otomatis oleh EA)
//  Tab "Transaksi Apocalypto" (per deal) + "Saldo Apocalypto" (saldo/equity harian).
//  Akun utama diatur admin lewat menu Apocalypto -> Atur Akun Apocalypto.
// =====================================================================
var APO_DEAL_SHEET = 'Transaksi Apocalypto';
var APO_BAL_SHEET  = 'Saldo Apocalypto';
var APO_DEAL_HDR = ['Deal', 'Posisi', 'Simbol', 'Tipe', 'Lot', 'Waktu Buka', 'Harga Buka', 'Waktu Tutup', 'Harga Tutup',
                    'Profit', 'Swap', 'Komisi', 'Net', 'Diterima'];
var APO_BAL_HDR  = ['Tanggal', 'Balance', 'Equity', 'Update'];

function apoMainLogin() { return String(PropertiesService.getScriptProperties().getProperty('APO_MAIN_LOGIN') || '').trim(); }
function apoSetMainLogin() {
  var ui = SpreadsheetApp.getUi(), cur = apoMainLogin();
  var r = ui.prompt('Akun Apocalypto', 'Nomor akun MT5 utama yang riwayat transaksinya ditampilkan di situs' +
                    (cur ? ' (sekarang: ' + cur + ')' : '') + ':', ui.ButtonSet.OK_CANCEL);
  if (r.getSelectedButton() !== ui.Button.OK) return;
  var v = String(r.getResponseText() || '').replace(/\D/g, '');
  if (!isDigitsStr(v)) { ui.alert('Nomor akun tidak valid.'); return; }
  var ds = apoSheet(APO_DEAL_SHEET, APO_DEAL_HDR), bs = apoSheet(APO_BAL_SHEET, APO_BAL_HDR);
  if (cur && v !== cur && (ds.getLastRow() > 1 || bs.getLastRow() > 1)) {
    var q = ui.alert('Ganti akun ' + cur + ' -> ' + v,
      'Hapus riwayat transaksi & saldo akun lama (' + cur + ') supaya situs hanya menampilkan akun baru?\n\nYES = hapus data lama   NO = biarkan (data lama & baru tercampur)',
      ui.ButtonSet.YES_NO_CANCEL);
    if (q === ui.Button.CANCEL || q === ui.Button.CLOSE) return;
    if (q === ui.Button.YES) {
      if (ds.getLastRow() > 1) ds.deleteRows(2, ds.getLastRow() - 1);
      if (bs.getLastRow() > 1) bs.deleteRows(2, bs.getLastRow() - 1);
    }
  }
  PropertiesService.getScriptProperties().setProperty('APO_MAIN_LOGIN', v);
  CacheService.getScriptCache().remove('APO_HIST_V1');
  ui.alert('Akun Apocalypto = ' + v + '.\nPasang ulang EA di akun ini supaya mulai mengirim riwayat transaksi. EA di akun lama otomatis berhenti mengirim.');
}
function apoSheet(name, hdr) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, hdr.length).setValues([hdr]).setFontWeight('bold').setBackground('#0E1A2B').setFontColor('#E7C766');
    sh.setFrozenRows(1);
    if (name === APO_DEAL_SHEET) sh.getRange('A:B').setNumberFormat('@');
    if (name === APO_BAL_SHEET) sh.getRange('A:A').setNumberFormat('@');
  }
  return sh;
}
function apoNum(v) { var n = Number(v); return isFinite(n) ? n : 0; }
function apoTime(t) {   // epoch detik (jam SERVER broker) -> "yyyy-MM-dd HH:mm:ss" apa adanya
  var n = Number(t); if (!n) return '';
  return Utilities.formatDate(new Date(n * 1000), 'UTC', 'yyyy-MM-dd HH:mm:ss');
}

// EA -> ?action=apo_deals&login=..&d=<deal;deal;...>&bal=..&eq=..&day=YYYY-MM-DD&key=..
//   deal = deal,posisi,simbol,tipe(B/S/BAL),lot,tBuka,hBuka,tTutup,hTutup,profit,swap,komisi
function handleApoDeals(p) {
  var login = String(p.login || '').trim();
  if (!login || login !== apoMainLogin()) return 'ERR:NOT_MAIN';
  var lock = LockService.getScriptLock(); lock.tryLock(15000);
  try {
    var sh = apoSheet(APO_DEAL_SHEET, APO_DEAL_HDR), added = 0;
    var raw = String(p.d || '').trim();
    if (raw) {
      var have = {}, last = sh.getLastRow();
      if (last >= 2) sh.getRange(2, 1, last - 1, 1).getDisplayValues().forEach(function (r) { have[String(r[0]).trim()] = 1; });
      var rows = [], now = new Date();
      raw.split(';').forEach(function (s) {
        var f = s.split(','); if (f.length < 12) return;
        var id = String(f[0]).replace(/\D/g, ''); if (!id || have[id]) return;
        have[id] = 1;
        var tp = String(f[3]).toUpperCase(), typ = tp === 'B' ? 'BUY' : tp === 'S' ? 'SELL' : 'BALANCE';
        var pr = apoNum(f[9]), sw = apoNum(f[10]), km = apoNum(f[11]);
        rows.push([id, String(f[1]).replace(/\D/g, ''), String(f[2]).replace(/[^\w.#-]/g, '').slice(0, 20), typ, apoNum(f[4]),
                   apoTime(f[5]), apoNum(f[6]), apoTime(f[7]), apoNum(f[8]), pr, sw, km, Math.round((pr + sw + km) * 100) / 100, now]);
      });
      if (rows.length) { sh.getRange(sh.getLastRow() + 1, 1, rows.length, APO_DEAL_HDR.length).setValues(rows); added = rows.length; }
    }
    var day = String(p.day || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(day) && p.bal !== undefined) {
      var bs = apoSheet(APO_BAL_SHEET, APO_BAL_HDR), bl = bs.getLastRow(), row = 0;
      if (bl >= 2) {
        var dd = bs.getRange(2, 1, bl - 1, 1).getDisplayValues();
        for (var i = dd.length - 1; i >= 0; i--) if (String(dd[i][0]) === day) { row = i + 2; break; }
      }
      var v = [[day, apoNum(p.bal), apoNum(p.eq), new Date()]];
      if (row) bs.getRange(row, 1, 1, 4).setValues(v); else bs.getRange(bl + 1, 1, 1, 4).setValues(v);
    }
    CacheService.getScriptCache().remove('APO_HIST_V1');
    return 'OK|' + added;
  } catch (e) { console.error('handleApoDeals: ' + e); return 'ERR:' + e; }
  finally { lock.releaseLock(); }
}

// Situs (member login) -> semua transaksi + saldo harian; filter periode dilakukan di halaman.
function handleApoHistory(p) {
  if (!checkFormKey(p)) return otpOut({ result: 'error', error: 'BAD_KEY' });
  if (!authMember(p)) return otpOut({ result: 'auth' });
  var cache = CacheService.getScriptCache(), hit = cache.get('APO_HIST_V1');
  if (hit) return ContentService.createTextOutput(hit).setMimeType(ContentService.MimeType.JSON);
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = { result: 'ok', login: apoMainLogin(), deals: [], saldo: [] };
  var sh = ss.getSheetByName(APO_DEAL_SHEET);
  if (sh && sh.getLastRow() >= 2) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 13).getValues().forEach(function (r) {
      // [deal, posisi, simbol, tipe, lot, buka, hBuka, tutup, hTutup, profit, swap, komisi, net]
      out.deals.push([String(r[0]), String(r[1]), String(r[2]), String(r[3]), Number(r[4]) || 0, String(r[5]), Number(r[6]) || 0,
                      String(r[7]), Number(r[8]) || 0, Number(r[9]) || 0, Number(r[10]) || 0, Number(r[11]) || 0, Number(r[12]) || 0]);
    });
    out.deals.sort(function (a, b) { return a[7] < b[7] ? -1 : a[7] > b[7] ? 1 : 0; });
  }
  var bs = ss.getSheetByName(APO_BAL_SHEET);
  if (bs && bs.getLastRow() >= 2)
    out.saldo = bs.getRange(2, 1, bs.getLastRow() - 1, 3).getDisplayValues().map(function (r) { return [r[0], Number(String(r[1]).replace(/,/g, '')) || 0, Number(String(r[2]).replace(/,/g, '')) || 0]; })
                  .sort(function (a, b) { return a[0] < b[0] ? -1 : 1; });
  var txt = JSON.stringify(out);
  if (txt.length < 95000) cache.put('APO_HIST_V1', txt, 300);
  return ContentService.createTextOutput(txt).setMimeType(ContentService.MimeType.JSON);
}
