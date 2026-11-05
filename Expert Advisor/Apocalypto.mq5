//+------------------------------------------------------------------+
//|                                                    EA Apocalypto |
//|   Strategi: Parabolic SAR + AVERAGING + TP Berlapis + Copy Trade |
//+------------------------------------------------------------------+
#property copyright "Masmoel"
#property link      ""
#property version   "1.0"
#property description "Apocalypto"

#property description "====================================================="
#property description "🛡️ PERINGATAN HAK CIPTA KEKAYAAN INTELEKTUAL"
#property description "UU No.28 Tahun 2014 Pasal 9:"
#property description "\"Setiap Orang yang tanpa izin Pencipta atau Pemegang"
#property description "Hak Cipta dilarang melakukan Penggandaan dan/atau"
#property description "Penggunaan Secara Komersial Ciptaan\""
#property description "====================================================="

#include <Trade\Trade.mqh>
CTrade trade;
CTrade copyTrade;   // instance khusus eksekusi copy di akun SLAVE

// Penanda build (untuk cek versi antar-terminal). Ubah tiap ada perubahan yang perlu di-recompile.
#define APO_BUILD "1103"

//==================================================================
//  COPY TRADE LOKAL (v2.0) - enum & state runtime
//==================================================================
enum ENUM_COPY_ROLE { Master = 0, Slave = 1, Monitor = 2, SubSlave = 3 };
enum ENUM_COPY_LOT  { LOT_SAME = 0, LOT_MULTIPLIER = 1, LOT_BALANCE_RATIO = 2, LOT_FIXED = 3 };
enum ENUM_ENTRY_MODE { Averaging = 0, Grid = 1 };

ENUM_COPY_ROLE gCopyRole        = Master;
bool     gSubSlave            = false;              // true bila EA Behaviour = SubSlave: slave RINGAN (copy penuh 1 file, tanpa gerbang/analisa, tak bisa pindah master, tak bisa relay).
string         gCopyFile        = "";
long           gCopyLastHbLocal = 0;
int            gCopyMirrored    = 0;      // jumlah posisi mirror aktif (dashboard SLAVE)
bool           gCopyStale       = false;  // true = file Master basi / Master offline
bool           gSlaveBreak      = false;  // true = KODE 55 di Slave -> berhenti menyalin
bool           gSlaveArmed      = false;  // gerbang: true = master sudah >= InpStartLayer layer
bool           gSlaveManualClose= false;  // true = user RESET di slave -> tahan copy sampai master flat
bool           gSlaveWasMirroring= false; // true = slave sedang punya mirror utk basket master ini
ulong          gSlaveMFounder   = 0;      // tiket founder (L1) basket master yang sedang di-mirror slave (identitas basket, deteksi rollover vs close-manual)
int            gMasterSlot      = 1;      // slot file master aktif (slave multi-master): CT<gMasterSlot>
bool           gMasterDropOpen  = false;  // true = daftar dropdown pilih master sedang terbuka
datetime       gSlavePopupLast  = 0;      // throttle popup info mode SLAVE

// Strategi tunggal: AVERAGING (mean-reversion + martingale). Mode Trending & One Way sudah dihapus.

input group "=== 1. INFORMASI & SETUP UMUM ==="
input string   InpLicenseInfo       = "Silakan menghubungi Admin"; // Info Lisensi
input string   InpStartTime         = "00:00";                     // Jam Mulai Trading (HH:MM)
input string   InpEndTime           = "23:00";                     // Jam Akhir Trading (HH:MM)

input group "=== 2. SETUP TRADING ==="
input ENUM_COPY_ROLE InpCopyRole     = Master;                      // EA Behaviour
input ENUM_ENTRY_MODE InpEntryMode   = Averaging;                   // Mode Entry
input int      InpBBOffset           = 50;                          // Jarak Kontraksi (pts)
input double   InpLot                = 0.01;                        // Lot Awal
input double   InpAvgMult            = 2.0;                         // Multiplier
input int      InpMaxLayer           = 10;                          // Max Layer
input int      InpVirtualEntryLayer  = 0;                           // Virtual Trigger
input int      InpStartLayer         = 0;                           // Start Layer
input double   InpFloating            = 0.0;                         // Floating ($)
input int      InpRSI                 = 0;                           // RSI
input double   InpDailyTarget        = 0.0;                         // Target Profit Harian ($)
input double   InpCycleTarget        = 0.0;                         // Target Profit Siklus ($)
input int      InpFloorArmPts        = 0;                           // Jarak Aktif Lantai (poin)
input double   InpCutloss            = 0.0;                         // Cutloss ($)
input int      InpCutlossByRSI       = 0;                           // Cutloss RSI


input group "=== 3. SETUP COPY TRADE ==="
input string   InpCopyFileName      = "CT.csv";               // File Name
input string   InpRelayFile         = "";                     // Relay File
input ENUM_COPY_LOT InpCopyLotMode  = LOT_SAME;               // Lot Slave Mode
input double   InpCopyLotValue      = 1.0;                    // Multiplier Lot
input string   InpSlaveName         = "";                     // Nama Akun Slave
input string   InpMasterSuffix      = "";                     // Suffix Master
input string   InpSlaveSuffix       = "";                     // Suffix Slave
input string   InpMasterFileBase    = "CT";                   // Master File
input int      InpMasterSlotMax     = 2;                      // Slot Master
input int      InpPriceValidate     = 0;                      // Validasi Harga Slave


// ================= PARAMETER TERKUNCI / HARDCODE (tidak tampil di F7) =================
// --- Setup Exit (TP berlapis) ---
const int      InpTPSingle          = 500;   // Target Profit Single (pts)
const int      InpTPLayer1          = 2;     // Layer Tier-1
const int      InpTPValue1          = 250;   // Target Profit Tier-1 (pts)
const int      InpTPLayer2          = 4;     // Layer Tier-2
const int      InpTPValue2          = 100;   // Target Profit Tier-2 (pts)
const int      InpTPLayer3          = 6;     // Layer Tier-3
const int      InpTPValue3          = 5;     // Target Profit Tier-3 (pts)
// --- Copy Trade (teknis) ---
const int      InpCopyMaxSlippage   = 30;    // Max slippage (pts)
const int      InpCopyStaleSec      = 30;    // Master offline (second)
const int      InpCopyTimerMs       = 300;   // Interval sinkron (ms)
// --- Magic Number & indikator ---
const long     InpSlaveMagic        = 300681;                 // Magic Number Slave
const long     InpMagic             = 300680;                 // Magic Number (dasar hitung profit sharing)
const int      InpAvgMinGapPts       = 0;
const ENUM_TIMEFRAMES InpTimeframe  = PERIOD_M1;
const int      InpSlippage          = 20;
const int      InpDeviation         = 50;
const double   InpSarStep           = 0.02;
const double   InpSarMax            = 0.2;
const int      InpBBPeriod          = 20;
const double   InpBBDev             = 2.0;
const int      InpRSIPeriod         = 14;
// --- Lisensi / profit sharing ---
const bool     InpUseLicense        = true;
string         InpUrlLicense        = "https://script.google.com/macros/s/AKfycbwVpdxUgIbZKfqbpO6pv--hPbI0sfa0-y5go0kAiv_pRHAiLxhUkiIsYHY61roVuLtw/exec";
const bool     InpSendProfit        = true;                        // Kirim Profit Bulanan (wajib untuk profit sharing)
const string   API_KEY              = "APOX-7f3Q9k2R-mZ8tLv6N-4aH1sD5e";   // KUNCI RAHASIA: wajib sama dgn API_KEY di Google Script.

int      lastLicenseCheckDay  = -1;
int      gLastProfitDay       = -1;                 // throttle kirim profit: tandai HANYA bila sukses (retry sampai berhasil)
datetime gLastProfitTry       = 0;                  // waktu percobaan kirim profit terakhir (retry maksimal tiap 30 menit)
int      gReportedMonthNum    = 0;                  // bulan (yyyymm) yang sedang dilaporkan EA; deteksi ganti bulan -> finalisasi bulan lalu
datetime gProfitFloor         = 0;                  // batas awal hitung profit (tanggal AKTIVASI, dari server lisensi). 0 = tak ada.
bool     gApoPublish          = false;              // true = akun ini AKUN UTAMA Apocalypto (flag "PUB" dari server lisensi) -> kirim riwayat transaksi ke situs
datetime gApoLastTry          = 0;                  // waktu kirim riwayat terakhir (throttle)
bool     gApoBacklog          = false;              // masih ada sisa riwayat yg belum terkirim -> kirim lebih cepat
datetime lastBarTime          = 0;
int      hSAR                 = INVALID_HANDLE;
int      hBBN                 = INVALID_HANDLE;
int      hRSI                 = INVALID_HANDLE;
int      gCanvasBaseY         = -1;      // Y baris-1 kanvas saat ini (deteksi perubahan posisi)
bool     gCanvasBottom        = false;   // true = blok teks di BAWAH (harga sedang di atas)
double   lastLot              = 0.0;
double   lastEntry            = 0.0;
// --- MODE GRID: titik kontraksi (trigger BB + Jarak Kontraksi) disimpan; tiap candle M1 berikutnya
//     close < harga pemicu -> SELL, close > harga pemicu -> BUY (market). Harga pemicu tetap sampai siklus selesai.
bool     gGridArmed           = false;              // grid sudah terpicu (titik kontraksi tersimpan), menunggu candle berikutnya
double   gGridRef             = 0.0;                // harga pemicu grid (titik kontraksi) = batas BUY/SELL semua layer siklus ini
int      gGridSide            = 0;                  // sisi kontraksi saat trigger: +1 tembus BB bawah, -1 tembus BB atas
datetime gGridArmBar          = 0;                  // candle saat trigger (layer pertama paling cepat di candle berikutnya)
double   gCommPerLot          = 0.0;
int      gDigitFactor         = 1;
double   gPt                  = 0.0;
double   gSarRunAvg           = 0.0;
ulong    gAdopted[];

// ---- VIRTUAL ENGINE (simulasi averaging: gerbang entry L1 real) ----
bool     gVAlive             = false;
int      gVDir               = 0;                   // +1 BUY / -1 SELL (arah kontraksi = averaging)
int      gVCount             = 0;                   // jumlah layer virtual
double   gVEntry[];                                 // harga entry tiap layer virtual
double   gVLot[];                                   // lot tiap layer virtual
datetime gVLastBar           = 0;
bool     gVTriggeredReal     = false;               // (legacy) tak dipakai lagi utk gating
bool     gRealFromVirtual    = false;               // basket real berjalan digerbang virtual? (true=averaging via virtual). Virtual hanya reset kalau basket ini selesai.
bool     gHoldTP              = false;
bool     gHoldMarti           = false;              // tombol: tahan penambahan layer averaging (basket berjalan). L1 baru tetap boleh.
bool     gRSIAnomaly          = false;              // kanvas RSI: LATCH merah. Sekali anomali (RSI lawan arah posisi) terjadi di siklus ini, tetap merah sampai flat/siklus baru.
bool     gForceTier3          = false;              // tombol: paksa target ke Tier-3 (InpTPValue3) walau layer belum sampai. Auto-off saat basket tutup.
int      gRsiT3LastLayer      = 0;                  // auto Tier-3: layer terakhir yang sudah dievaluasi (edge, 1x per layer baru)
int      gRsiCLLastLayer      = 0;                  // cutloss by RSI: layer terakhir yang sudah dievaluasi (edge, 1x per layer baru)
int      gCutlossByRSI        = 0;                  // cutloss by RSI on/off (0/1). Live via panel (tombol CL By RSI).
double   gCycleTarget         = 0.0;
// --- PENJAGA LANTAI (Profit Floor): otomatis saat TP Hold. Lantai = level TP Tier basket real. ---
// "Jarak Lantai" (poin) dipakai 2 peran: (1) jarak aktivasi = harga harus lewat TP Tier sejauh ini utk ARM;
// (2) jarak trailing = stop = puncak - jarak, di-clamp minimal di TP Tier. Bisa diubah live termasuk saat ARM.
double   gFloorArmPts         = 100.0;              // floor: jarak (poin) aktivasi & trailing (panel-editable)
bool     gTrailArmed          = false;              // floor: sudah ARM? (harga sudah melewati TP Tier + Jarak Lantai)
double   gTrailRefLvl         = 0.0;                // floor: level TP Tier basket real terkini (lantai/clamp)
double   gTrailPeak           = 0.0;                // floor: puncak (BUY) / lembah (SELL) harga sejak ARM
double   gTrailStop           = 0.0;                // floor: level stop trailing terkini (utk gambar garis biru)
int      gTrailDir            = 0;                  // floor: arah basket real (+1 BUY / -1 SELL)
int      gVirtualEntryLayer   = 0;                  // runtime: gerbang virtual (default InpVirtualEntryLayer, bisa diatur dari panel)
int      gSlaveStartLayer     = 0;                  // runtime: gerbang copy slave (default InpStartLayer, diatur via tombol VL saat mode SLAVE)
double   gBcastFloatMinus     = 0.0;                // master: ambang floating- ($) yang disiarkan ke slave (0 = nonaktif)
double   gMasterFloatMinus    = 0.0;                // slave: ambang floating- ($) SIARAN master (dipakai bila slave tak set lokal)
double   gEffFloatMinus       = 0.0;                // slave: ambang floating- EFEKTIF (lokal slave override, else siaran master)
double   gSlaveFloatOverride   = 0.0;                // slave: Floating- override via KODE 44 (0=tak ada; menang atas input & siaran)
int      gEffStartLayer       = 0;                  // slave: Start Layer EFEKTIF (lokal slave override, else siaran master; 55-STOP selalu menang)
int      gBcastRSI            = 0;                  // master: ambang RSI yang disiarkan ke slave (panel-editable). Di slave: nilai SIARAN master hasil baca file.
int      gEffRSI              = 0;                  // slave: ambang RSI EFEKTIF (milik slave InpRSI, else siaran master; 0 = gerbang RSI off)
// --- MONITOR (agregasi status slave; dibaca dari file *.slv*.csv di folder Common) ---
long     gMonLogin[];                               // monitor: login tiap slave aktif
string   gMonName[];                                // monitor: nama akun tiap slave (dari input slave)
int      gMonGateL[];                               // monitor: gerbang start layer efektif tiap slave (-1 = tak dikirim)
double   gMonGateF[];                               // monitor: gerbang floating- efektif tiap slave ($)
int      gMonGateR[];                               // monitor: gerbang RSI efektif tiap slave (0 = off)
int      gMonBreak[];                               // monitor: slave sedang KODE 55 (Off)? 1=ya
string   gMonBuild[];                               // monitor: build EA tiap slave (deteksi versi lama)
long     gMonHb[];                                  // monitor: heartbeat terakhir tiap slave (anti-kedip: buang hanya bila basi)
double   gMonFloat[];                               // monitor: floating ($) tiap slave
double   gMonDaily[];                               // monitor: profit harian ($) tiap slave
double   gMonEquity[];                              // monitor: equity ($) tiap slave
int      gMonCount            = 0;                  // monitor: jumlah slave aktif (tidak basi)
int      gMonRowsDrawn        = 0;                  // monitor: jumlah baris objek yang tergambar (utk bersih-bersih)
// --- MONITOR: ringkasan MASTER (dibaca dari file snapshot master) ---
bool     gMonMOnline          = false;             // master online?
int      gMonMLayer           = 0;                 // master: jumlah posisi = entry level (L{n})
double   gMonMFloat           = 0.0;               // master: floating ($)
int      gMonMStartL          = 0;                 // master: Start Layer yang disiarkan
double   gMonMFMinus          = 0.0;               // master: ambang Floating- yang disiarkan
int      gMonMRSI             = 0;                 // master: ambang RSI yang disiarkan
double   gMonMRSInow          = 50.0;              // master: RSI SAAT INI (live) untuk kolom gate monitor
double   gMonMCut             = 0.0;               // master: nilai Cutloss ($) (0 = No Cutloss)
int      gMonMBreak           = 0;                  // master: sedang KODE 55? 1=ya (status "Off")
double   gMasterFloat         = 0.0;                // slave: floating EA master ($) hasil baca file (untuk gerbang floating)
int      gMasterNP            = 0;                  // slave: jumlah posisi master di file (0 = master flat -> tak ada data garis)
double   gMasterLotSum        = 0.0;                // slave: total lot basket master (untuk garis harga pemicu copy)
double   gMasterEntryLotSum   = 0.0;                // slave: Σ(harga_buka * lot) master (untuk garis harga pemicu copy)
int      gMasterDir           = 0;                  // slave: arah basket master (0=BUY, 1=SELL)
double   gMasterRSI           = 50.0;               // slave: RSI master SAAT INI hasil siaran (untuk trigger gerbang RSI mirror pertama)
double   gMasterEntryRSI      = 0.0;                // slave: RSI master SAAT L1 basket dibuka (siaran). 0 = tak ada/basket flat. Dipakai gerbang kelayakan RSI slave.
double   gMasterL1RSI         = 0.0;                // master: RSI saat L1 basket berjalan dibuka (disiarkan ke slave; reset 0 saat flat)
int      gOvStartLayer        = 0;                  // slave: override Start Layer dari panel (menang atas InpStartLayer & siaran master; 0 = ikut F7/siaran)
int      gOvRSI               = 0;                  // slave: override RSI dari panel (menang atas InpRSI & siaran master; 0 = ikut F7/siaran)
int      gPriceValidate       = 0;                  // slave: validasi harga "makin minus" sebelum copy layer tambahan (0=off, 1=on). Live via panel.
int      gPrevPosCount        = 0;
ulong    gCycleFounder        = 0;                   // tiket L1/founder siklus saat ini (deteksi siklus BARU, tahan tutup-buka 1 tick)
double   gCycleMinFloat       = 0.0;                 // floating MINUS terdalam dalam 1 siklus (reset saat L1 baru)
int      gRealPrevCountV      = 0;                    // jumlah posisi real tick lalu (deteksi real selesai siklus -> reset virtual)
bool     gPoliceFirstRun      = true;                // tick pertama setelah start: REKONSTRUKSI basket warisan (adopsi semua magic-0 searah)

int      gSarRunMin  = 0, gSarRunMax = 0, gSarRunCount = 0;
double   gBEP        = 0.0, gTarget = 0.0;
int      startHour   = 0, startMin = 0;
int      endHour     = 23, endMin = 59;

string cloudExpDate = "TIDAK VALID";
string cloudAccount = "TIDAK VALID";

//+------------------------------------------------------------------+
//| 1. FUNGSI PENGECEKAN LISENSI ONLINE                              |
//+------------------------------------------------------------------+
bool CheckCloudLicense(bool isInit)
  {
   if(!InpUseLicense)
     {
      cloudAccount = "LICENSE OFF";
      cloudExpDate = "DISABLED";
      return true;
     }

   if(MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION))
     {
      cloudAccount = "BACKTEST";
      cloudExpDate = "TESTER MODE";
      return true;
     }

   long accNum = AccountInfoInteger(ACCOUNT_LOGIN);
   cloudAccount = IntegerToString(accNum);
   // Kirim nama server + mata uang akun -> dipakai backend utk sinkronisasi pertama
   // (deteksi Demo/Real dari server, USD/Cent dari mata uang mis. "USC"). Hanya
   // berdampak saat kolom Server di sheet masih kosong; setelah itu diabaikan backend.
   string accServer = AccountInfoString(ACCOUNT_SERVER);
   string accCur    = AccountInfoString(ACCOUNT_CURRENCY);
   string checkUrl  = InpUrlLicense + "?account=" + cloudAccount
                    + "&server=" + UrlEncode(accServer)
                    + "&cur=" + UrlEncode(accCur);
   char post[], result[]; string headers;

   // Timeout 15 dtk: sinkronisasi PERTAMA (tulis sheet + kirim email) bisa >5 dtk.
   int res = WebRequest("GET", checkUrl, "", NULL, 15000, post, 0, result, headers);

   if(res == 200)
     {
      string responseText = CharArrayToString(result);
      string sep[];
      StringSplit(responseText, StringGetCharacter("|", 0), sep);

      if(ArraySize(sep) >= 2)
        {
         string status = sep[0], expDate = sep[1];
         if(status == "ACTIVE")
           {
            datetime expT = StringToTime(expDate);
            if(TimeCurrent() > expT) { Alert("⚠️ LISENSI KADALUARSA!"); ExpertRemove(); return false; }
            cloudExpDate = expDate;
            // Field ke-3 (opsional) = tanggal AKTIVASI -> batas awal hitung profit (bulan aktivasi).
            if(ArraySize(sep) >= 3 && sep[2] != "" && sep[2] != "-") gProfitFloor = StringToTime(sep[2]);
            else gProfitFloor = 0;
            // Field ke-4 (opsional) = "PUB" -> akun utama Apocalypto: riwayat transaksi ditampilkan di situs.
            gApoPublish = (ArraySize(sep) >= 4 && sep[3] == "PUB");
            return true;
           }
         else if(status == "PENDING")
           {
            // Akun REAL terdeteksi & sudah tersinkronisasi, menunggu verifikasi admin.
            // (Akun DEMO tidak akan pernah PENDING: backend mengaktifkannya otomatis.)
            cloudExpDate = "MENUNGGU VERIFIKASI";
            Alert("⏳ Akun REAL terdeteksi. Lisensi MENUNGGU VERIFIKASI admin.\n",
                  "Anda akan menerima email saat lisensi sudah aktif, lalu pasang ulang EA.");
            ExpertRemove();
            return false;
           }
         else if(status == "INACTIVE")
           {
            // Akun REAL baru yg sudah sinkron = diparkir Inactive menunggu verifikasi admin.
            // (Juga dipakai bila admin menonaktifkan akun.)
            cloudExpDate = "BELUM AKTIF";
            Alert("⏳ Lisensi BELUM AKTIF.\n",
                  "Akun Real: mohon tunggu email AKTIVASI dari admin, lalu pasang ulang EA ke chart.\n",
                  "Bila akun Anda sebelumnya aktif/dinonaktifkan, silakan hubungi admin.");
            ExpertRemove();
            return false;
           }
         else if(status == "UNREGISTERED") { Alert("❌ AKUN BELUM TERDAFTAR!"); ExpertRemove(); return false; }
        }
     }
   if(isInit) { Alert("❌ Gagal Konek Server Lisensi!"); return false; }
   return true;
  }

// Encode minimal utk query string (spasi & karakter non-aman jadi %XX).
string UrlEncode(string s)
  {
   string out = "";
   for(int i = 0; i < StringLen(s); i++)
     {
      ushort c = StringGetCharacter(s, i);
      bool safe = (c >= '0' && c <= '9') || (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z')
                  || c == '-' || c == '_' || c == '.' || c == '~';
      if(safe) out += ShortToString(c);
      else     out += StringFormat("%%%02X", c);
     }
   return out;
  }

//+------------------------------------------------------------------+
//| KIRIM PROFIT BULANAN KE SERVER (telemetry via Apps Script)        |
//|  GET: <UrlLisensi>?action=profit&login=..&server=..&role=..       |
//|       &month=YYYY-MM&profit=..&bal=..&eq=..                       |
//|  Profit = realized bulan berjalan utk magic sesuai PERAN          |
//|  (master=InpMagic, slave=InpSlaveMagic) di simbol chart.          |
//+------------------------------------------------------------------+
// Kirim realisasi profit untuk bulan (y,mo). isFinal=true -> tandai bulan itu SUDAH TUTUP
// (ditulis UTUH sekali saat EA ganti bulan). Rentang hitung = [awal bln, awal bln berikutnya),
// dibatasi gProfitFloor (tgl aktivasi) & waktu sekarang (utk bulan berjalan).
// Return TRUE bila sukses ATAU kondisi tak perlu kirim; FALSE hanya bila kirim GAGAL -> dicoba lagi.
bool SendProfitMonth(int y, int mo, bool isFinal)
  {
   if(!InpSendProfit) return true;
   if(StringLen(InpUrlLicense) < 10) return true;            // URL belum di-set -> jangan retry
   if(gCopyRole == Monitor) return true;                     // monitor tak trading
   if(MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION)) return true;

   long magic = (gCopyRole == Slave) ? InpSlaveMagic : InpMagic;

   MqlDateTime d; d.year=y; d.mon=mo; d.day=1; d.hour=0; d.min=0; d.sec=0;
   datetime mStart = StructToTime(d);
   int ny=y, nm=mo+1; if(nm>12){ nm=1; ny++; }
   MqlDateTime d2; d2.year=ny; d2.mon=nm; d2.day=1; d2.hour=0; d2.min=0; d2.sec=0;
   datetime mEnd = StructToTime(d2);

   datetime startCalc = mStart; if(gProfitFloor > startCalc) startCalc = gProfitFloor;
   datetime endCalc   = mEnd;   if(endCalc > TimeCurrent()+1) endCalc = TimeCurrent()+1;   // bln berjalan -> sampai sekarang
   string monthStr = StringFormat("%04d-%02d", y, mo);

   double realized = 0.0;
   if(HistorySelect(startCalc, endCalc))
     {
      int total = HistoryDealsTotal();
      for(int i = 0; i < total; i++)
        {
         ulong tk = HistoryDealGetTicket(i);
         if(tk == 0) continue;
         if((long)HistoryDealGetInteger(tk, DEAL_MAGIC) != magic) continue;
         if(HistoryDealGetString(tk, DEAL_SYMBOL) != _Symbol) continue;
         realized += HistoryDealGetDouble(tk, DEAL_PROFIT)
                   + HistoryDealGetDouble(tk, DEAL_SWAP)
                   + HistoryDealGetDouble(tk, DEAL_COMMISSION);
        }
     }

   long   login  = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   string server = AccountInfoString(ACCOUNT_SERVER);
   double bal    = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq     = AccountInfoDouble(ACCOUNT_EQUITY);
   string role   = (gCopyRole == Slave) ? "SLAVE" : "MASTER";

   string url = InpUrlLicense + "?action=profit"
              + "&login="  + IntegerToString(login)
              + "&server=" + UrlEncode(server)
              + "&role="   + role
              + "&month="  + monthStr
              + "&profit=" + DoubleToString(realized, 2)
              + "&bal="    + DoubleToString(bal, 2)
              + "&eq="     + DoubleToString(eq, 2)
              + "&key="    + UrlEncode(API_KEY)
              + (isFinal ? "&final=1" : "");

   char post[], result[]; string headers;
   int res = WebRequest("GET", url, "", NULL, 5000, post, 0, result, headers);
   string resp = (ArraySize(result) > 0) ? CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8) : "";
   bool okResp = (res == 200 && StringFind(resp, "OK") == 0);   // server balas "OK"; "ERR:..." = gagal walau HTTP 200
   if(okResp)
     {
      Print("📤 Profit ", (isFinal ? "FINAL " : ""), "terkirim: ", monthStr, " = ", DoubleToString(realized, 2), " (", role, ").");
      return true;
     }
   Print("ℹ️ Kirim profit GAGAL (", monthStr, " res=", res, ", resp=", resp, ") -> dicoba lagi (tiap 30 menit).");
   return false;
  }

//+------------------------------------------------------------------+
//| RIWAYAT TRANSAKSI AKUN UTAMA APOCALYPTO -> situs apocalypto.id     |
//|  Aktif HANYA bila server lisensi membalas flag "PUB" (akun utama   |
//|  diatur admin di spreadsheet). Semua posisi tertutup + deposit/WD  |
//|  akun dikirim bertahap; server membuang deal yang sudah ada.       |
//|  POST <UrlLisensi>  body: action=apo_deals&login=..&d=..&day=..&bal=..&eq=.. |
//+------------------------------------------------------------------+
bool ApoSendBatch(string d)
  {
   // Data dikirim lewat BODY (POST), bukan URL: WebRequest menolak URL panjang (err 4002).
   long   login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   MqlDateTime t; TimeToStruct(TimeCurrent(), t);
   string body = "action=apo_deals"
               + "&login=" + IntegerToString(login)
               + "&day="   + StringFormat("%04d-%02d-%02d", t.year, t.mon, t.day)
               + "&bal="   + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 2)
               + "&eq="    + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 2)
               + "&d="     + UrlEncode(d)
               + "&key="   + UrlEncode(API_KEY);
   char post[], result[]; string headers;
   int len = StringToCharArray(body, post, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(post, len - 1);              // buang terminator nol
   ResetLastError();
   int res = WebRequest("POST", InpUrlLicense, "Content-Type: application/x-www-form-urlencoded\r\n",
                        20000, post, result, headers);
   int err = GetLastError();
   string resp = (ArraySize(result) > 0) ? CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8) : "";
   if(res == 200 && StringFind(resp, "OK") == 0) return true;
   if(StringFind(resp, "ERR:NOT_MAIN") == 0) gApoPublish = false;   // akun utama sudah diganti admin -> berhenti
   Print("ℹ️ Kirim riwayat transaksi GAGAL (res=", res, ", err=", err, ", len=", ArraySize(post), ", resp=", StringSubstr(resp, 0, 120), ") -> dicoba lagi nanti.");
   return false;
  }

// Dipanggil dari OnTick & OnTimer. Pakai jam lokal (TimeLocal) supaya tetap jalan saat tidak ada tick.
void ApoTick()
  {
   if(!gApoPublish || gCopyRole == Monitor) return;
   if(TimeLocal() - gApoLastTry < (gApoBacklog ? 20 : 300)) return;
   gApoLastTry = TimeLocal();
   ApoSendHistory();
  }

void ApoSendHistory()
  {
   if(StringLen(InpUrlLicense) < 10) return;
   if(MQLInfoInteger(MQL_TESTER) || MQLInfoInteger(MQL_OPTIMIZATION)) return;

   const int MAXN = 30, PER = 10;                       // maks deal per kali kirim / per request
   string   gv   = "APXH_" + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   datetime from = GlobalVariableCheck(gv) ? (datetime)GlobalVariableGet(gv) : 0;
   if(!HistorySelect(from, TimeCurrent() + 86400)) return;

   // 1) kumpulkan deal tutup (OUT) + deposit/WD, urut waktu
   ulong tk[]; long pos[]; datetime tm[]; int n = 0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total && n < MAXN + 1; i++)
     {
      ulong k = HistoryDealGetTicket(i);
      if(k == 0) continue;
      long typ = HistoryDealGetInteger(k, DEAL_TYPE), ent = HistoryDealGetInteger(k, DEAL_ENTRY);
      bool isBal = (typ == DEAL_TYPE_BALANCE);
      bool isOut = (typ == DEAL_TYPE_BUY || typ == DEAL_TYPE_SELL) &&
                   (ent == DEAL_ENTRY_OUT || ent == DEAL_ENTRY_OUT_BY || ent == DEAL_ENTRY_INOUT);
      if(!isBal && !isOut) continue;
      ArrayResize(tk, n + 1); ArrayResize(pos, n + 1); ArrayResize(tm, n + 1);
      tk[n] = k; pos[n] = isBal ? 0 : HistoryDealGetInteger(k, DEAL_POSITION_ID);
      tm[n] = (datetime)HistoryDealGetInteger(k, DEAL_TIME); n++;
     }
   gApoBacklog = (n > MAXN);
   if(n > MAXN) n = MAXN;

   // 2) baca detail tiap deal (properti deal OUT dulu, lalu cari deal IN posisinya)
   string items[]; ArrayResize(items, n);
   for(int i = 0; i < n; i++)
     {
      HistorySelect(from, TimeCurrent() + 86400);
      ulong  k   = tk[i];
      long   typ = HistoryDealGetInteger(k, DEAL_TYPE);
      string sym = HistoryDealGetString(k, DEAL_SYMBOL);
      double vol = HistoryDealGetDouble(k, DEAL_VOLUME);
      double pc  = HistoryDealGetDouble(k, DEAL_PRICE);
      double pr  = HistoryDealGetDouble(k, DEAL_PROFIT);
      double sw  = HistoryDealGetDouble(k, DEAL_SWAP);
      double cm  = HistoryDealGetDouble(k, DEAL_COMMISSION);
      if(typ == DEAL_TYPE_BALANCE)
        {
         items[i] = StringFormat("%I64u,0,,BAL,0,0,0,%I64d,0,%.2f,0,0", k, (long)tm[i], pr);
         continue;
        }
      // arah posisi = kebalikan deal penutup; harga & waktu buka dari deal IN posisi tsb
      string   side = (typ == DEAL_TYPE_SELL) ? "B" : "S";
      datetime tOpen = 0; double pOpen = 0; string cmt = "";
      if(pos[i] > 0 && HistorySelectByPosition(pos[i]))
        {
         int m = HistoryDealsTotal();
         for(int j = 0; j < m; j++)
           {
            ulong q = HistoryDealGetTicket(j);
            if(q == 0 || HistoryDealGetInteger(q, DEAL_ENTRY) != DEAL_ENTRY_IN) continue;
            tOpen = (datetime)HistoryDealGetInteger(q, DEAL_TIME);
            pOpen = HistoryDealGetDouble(q, DEAL_PRICE);
            side  = (HistoryDealGetInteger(q, DEAL_TYPE) == DEAL_TYPE_BUY) ? "B" : "S";
            cmt   = HistoryDealGetString(q, DEAL_COMMENT);   // komentar posisi (layer info)
            double vIn = HistoryDealGetDouble(q, DEAL_VOLUME);
            if(vIn > 0) cm += HistoryDealGetDouble(q, DEAL_COMMISSION) * MathMin(1.0, vol / vIn);
            break;
           }
        }
      // Max floating siklus disimpan di Global Variable saat siklus selesai (ResetTogglesOnNewL1)
      double mf = 0.0;
      string mfKey = "ApoMF_" + IntegerToString(pos[i]);
      if(GlobalVariableCheck(mfKey)) mf = GlobalVariableGet(mfKey);
      int dg = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS); if(dg <= 0) dg = _Digits;
      items[i] = StringFormat("%I64u,%I64d,%s,%s,%.2f,%I64d,%s,%I64d,%s,%.2f,%.2f,%.2f,%s,%.2f",
                              k, pos[i], sym, side, vol, (long)tOpen, DoubleToString(pOpen, dg),
                              (long)tm[i], DoubleToString(pc, dg), pr, sw, cm, cmt, mf);
     }

   // 3) kirim per PER deal; tandai waktu deal terakhir yg sukses (server buang duplikat)
   if(n == 0) { ApoSendBatch(""); return; }             // tak ada transaksi baru -> cukup saldo/equity hari ini
   for(int s = 0; s < n; s += PER)
     {
      string d = "";
      int e = MathMin(n, s + PER);
      for(int i = s; i < e; i++) d += (i > s ? ";" : "") + items[i];
      if(!ApoSendBatch(d)) { gApoBacklog = false; return; }
      GlobalVariableSet(gv, (double)tm[e - 1]);
     }
  }

//+------------------------------------------------------------------+
//| INITIALIZATION & MAIN LOOP                                       |
//+------------------------------------------------------------------+
// Resolusi parameter yang bisa diubah via F7 ATAU panel (+/-):
//  - Nilai F7 BERUBAH sejak init terakhir  -> pakai nilai F7 (panel ikut). "F7 menang."
//  - Nilai F7 SAMA (mis. restart/refresh)   -> pulihkan nilai panel terakhir.
double PanelParam(string key, double inputVal)
  {
   string kIn = key + "I";   // bayangan nilai input F7 saat init terakhir
   double res;
   if(GlobalVariableCheck(StateKey(key)) && GlobalVariableCheck(StateKey(kIn))
      && inputVal == GlobalVariableGet(StateKey(kIn)))
      res = GlobalVariableGet(StateKey(key));   // F7 tak berubah -> nilai panel terakhir
   else
      res = inputVal;                           // F7 berubah / pertama kali -> F7 menang
   GlobalVariableSet(StateKey(key), res);
   GlobalVariableSet(StateKey(kIn), inputVal);
   return res;
  }

int OnInit()
  {
   if(!CheckCloudLicense(true)) return(INIT_FAILED);

   gDigitFactor = (_Digits == 3 || _Digits == 5) ? 10 : 1;
   gPt          = _Point * gDigitFactor;

   trade.SetExpertMagicNumber(InpMagic);
   trade.SetDeviationInPoints(InpDeviation * gDigitFactor);
   trade.SetTypeFillingBySymbol(_Symbol);

   // === COPY TRADE (v2.0) setup ===
   gCopyRole = (ENUM_COPY_ROLE)InpCopyRole;
   gSubSlave = (gCopyRole == SubSlave);   // SubSlave diperlakukan sbg Slave ringan di seluruh alur
   if(gSubSlave) gCopyRole = Slave;
   gMasterSlot = 1;
   if(GlobalVariableCheck(StateKey("mSlot"))) gMasterSlot = (int)GlobalVariableGet(StateKey("mSlot"));
   if(gMasterSlot < 1 || gMasterSlot > InpMasterSlotMax) gMasterSlot = 1;
   ApplyMasterSlotFile();
   copyTrade.SetExpertMagicNumber(InpSlaveMagic);
   copyTrade.SetDeviationInPoints(InpCopyMaxSlippage * gDigitFactor);
   copyTrade.SetTypeFillingBySymbol(_Symbol);
   EventSetMillisecondTimer(InpCopyTimerMs > 0 ? InpCopyTimerMs : 300);   // Master/Slave/Monitor perlu timer

   // === MODE MONITOR: hanya baca status slave & tampilkan tabel (tidak trading) ===
   if(gCopyRole == Monitor)
     {
      MonitorInit();
      MonitorScan();
      MonitorRender();
      ChartRedraw();
      return(INIT_SUCCEEDED);
     }

   // SLAVE & MONITOR tidak butuh indikator strategi (Slave hanya mirror; Monitor hanya baca status).
   if(gCopyRole == Master)
     {
      hSAR = iSAR(_Symbol, InpTimeframe, InpSarStep, InpSarMax);
      if(hSAR == INVALID_HANDLE) { Alert("❌ Gagal membuat indikator Parabolic SAR!"); return(INIT_FAILED); }

      hBBN = iBands(_Symbol, InpTimeframe, InpBBPeriod, 0, InpBBDev, PRICE_CLOSE);
      if(hBBN == INVALID_HANDLE) { Alert("❌ Gagal membuat indikator Bollinger Bands (dibutuhkan untuk entry)!"); return(INIT_FAILED); }
     }

   // RSI utk ditampilkan di kanvas chart (semua mode). SubSlave: dilewati (ringan, tanpa analisa).
   if(!gSubSlave)
      hRSI = iRSI(_Symbol, PERIOD_CURRENT, InpRSIPeriod, PRICE_CLOSE);

   MqlDateTime dtNow;
   TimeToStruct(TimeCurrent(), dtNow);
   lastLicenseCheckDay = dtNow.day;

   lastBarTime = iTime(_Symbol, InpTimeframe, 0);

   ParseTradingHours();
   gCommPerLot   = CommissionPerLot();

   if(GlobalVariableCheck(StateKey("holdTP")))
      gHoldTP = (GlobalVariableGet(StateKey("holdTP")) != 0.0);
   if(GlobalVariableCheck(StateKey("holdMarti")))
      gHoldMarti = (GlobalVariableGet(StateKey("holdMarti")) != 0.0);
   if(GlobalVariableCheck(StateKey("repM")))
      gReportedMonthNum = (int)GlobalVariableGet(StateKey("repM"));   // bulan terakhir yg dilaporkan (deteksi ganti bulan tahan restart)
   if(GlobalVariableCheck(StateKey("t3")))
      gForceTier3 = (GlobalVariableGet(StateKey("t3")) != 0.0);
   if(InpEntryMode == Grid) gForceTier3 = false;                 // mode Grid: Tier 3 tidak dipakai
   gCycleTarget = PanelParam("cycleTgt", InpCycleTarget);
   gSlaveFloatOverride = PanelParam("slvFloat", (InpFloating != 0.0 ? MathAbs(InpFloating) : 0.0));   // slave: override Floating (default ikut F7)
   if(GlobalVariableCheck(StateKey("mL1RSI")))
      gMasterL1RSI = GlobalVariableGet(StateKey("mL1RSI"));
   gOvStartLayer = (int)PanelParam("ovSL",  (double)(InpStartLayer > 0 ? InpStartLayer : 0));   // slave: override Start Layer
   gOvRSI        = (int)PanelParam("ovRSI", (double)(InpRSI > 0 ? InpRSI : 0));                  // slave: override RSI
   gPriceValidate = (int)PanelParam("pVal", (double)(InpPriceValidate != 0 ? 1 : 0));            // slave: validasi harga on/off (default ikut F7)
   gCutlossByRSI  = (int)PanelParam("clRSI", (double)(InpCutlossByRSI != 0 ? 1 : 0));            // cutloss by RSI on/off (default ikut F7)

   gFloorArmPts = PanelParam("flrArm", (double)(InpFloorArmPts > 0 ? InpFloorArmPts : 0));

   gVirtualEntryLayer = (int)PanelParam("vLayer", (double)(InpVirtualEntryLayer > 0 ? InpVirtualEntryLayer : 0));

   gSlaveStartLayer = (int)PanelParam("sLayer", (double)(InpStartLayer > 0 ? InpStartLayer : 0));
   gBcastFloatMinus = PanelParam("bcFloat", (InpFloating != 0.0 ? MathAbs(InpFloating) : 0.0));   // master: ambang floating- disiarkan (panel-editable; isi angka saja, tanda +/- diabaikan)
   gBcastRSI = (int)PanelParam("bRSI", (double)(InpRSI > 0 ? InpRSI : 0));   // F7 diubah -> menang; else nilai panel terakhir
   if(GlobalVariableCheck(StateKey("sManual")))
      gSlaveManualClose = (GlobalVariableGet(StateKey("sManual")) != 0.0);

   // === SUB-SLAVE (slave RINGAN): paksa SEMUA gerbang/analisa OFF & file tunggal ===
   //   Hanya copy penuh dari 1 file (InpCopyFileName) yg ditempel; tak pakai gerbang, RSI,
   //   validasi harga, target, virtual, multi-master, maupun relay.
   if(gSubSlave)
     {
      gOvStartLayer = 0; gOvRSI = 0; gSlaveFloatOverride = 0.0;
      gSlaveStartLayer = 0; gBcastFloatMinus = 0.0; gBcastRSI = 0;
      gCycleTarget = 0.0; gVirtualEntryLayer = 0; gPriceValidate = 0; gFloorArmPts = 0.0;
      gCutlossByRSI = 0;
     }

   // Daftar adopsi (gAdopted[]) TIDAK dipersist: PoliceManualPositions akan MEMBANGUN ULANG
   // dari posisi manual yang masih ada (validasi rantai SOP oldest-first) di tick pertama.
   ClearAdopted();

   VirtualRestore();     // pulihkan siklus virtual (tahan compile/re-attach/restart)

   // Pulihkan flag "basket dari virtual?" (menentukan apakah virtual reset saat basket selesai).
   if(GlobalVariableCheck(StateKey("realFromV")))
      gRealFromVirtual = (GlobalVariableGet(StateKey("realFromV")) != 0.0);
   if(CountMyPositions() == 0) { gRealFromVirtual = false; GlobalVariableDel(StateKey("realFromV")); }
   if(InpEntryMode == Grid) GridLoad(); else GridReset();   // mode Grid: pulihkan titik kontraksi / acuan grid

   if(CountMyPositions() > 0)
     {
      if(GlobalVariableCheck(StateKey("lastLot")))   lastLot   = GlobalVariableGet(StateKey("lastLot"));
      if(GlobalVariableCheck(StateKey("lastEntry"))) lastEntry = GlobalVariableGet(StateKey("lastEntry"));
      if(lastLot <= 0.0 || lastEntry <= 0.0)
        {
         double l, e;
         if(NewestPosition(l, e))
           {
            if(lastLot   <= 0.0) lastLot   = l;
            if(lastEntry <= 0.0) lastEntry = e;
           }
        }
     }
   else
      ClearState();

   gPrevPosCount = CountMyPositions();
   // Set founder siklus ke basket yg sudah ada -> restart TIDAK dianggap "siklus baru" (jaga exit/override).
   { ulong fnd = 0; long oT = 0;
     for(int i = PositionsTotal()-1; i >= 0; i--)
       { ulong t = PositionGetTicket(i); if(t==0) continue;
         if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
         long tm = (long)PositionGetInteger(POSITION_TIME_MSC);
         if(fnd==0 || tm<oT){ oT=tm; fnd=t; } }
     gCycleFounder = fnd; }

   gCanvasBaseY = -1;          // paksa UpdateCanvasPosition menata & menyembunyikan ulang baris kanvas setelah init/F7
   CreateDashboard();
   if(gCopyRole == Slave)                          // panel slave: isi awal kotak override milik slave
     {
      ObjectSetString(0, "DB_EditBSL",   OBJPROP_TEXT, IntegerToString(gOvStartLayer));
      ObjectSetString(0, "DB_EditBRSI",  OBJPROP_TEXT, IntegerToString(gOvRSI));
      ObjectSetString(0, "DB_EditFloat", OBJPROP_TEXT, DoubleToString(gSlaveFloatOverride, 2));
     }
   UpdateSarRunStats();
   UpdateDashboard();
   ChartRedraw();

   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   if(gVAlive) VirtualPersist();          // simpan state virtual terkini sebelum reload/recompile
   if(hSAR != INVALID_HANDLE) IndicatorRelease(hSAR);
   if(hBBN != INVALID_HANDLE) IndicatorRelease(hBBN);
   if(hRSI != INVALID_HANDLE) IndicatorRelease(hRSI);
   ObjectsDeleteAll(0, "DB_");
   ObjectsDeleteAll(0, "MON_");
  }

// Ubah cepat Target Profit Siklus lewat tombol +/- (langkah 25 $). Tidak boleh < 0.
void AdjustCycleTarget(double delta)
  {
   gCycleTarget += delta;
   if(gCycleTarget < 0.0) gCycleTarget = 0.0;
   GlobalVariableSet(StateKey("cycleTgt"), gCycleTarget);
   ObjectSetString(0, "DB_EditCycle", OBJPROP_TEXT, DoubleToString(gCycleTarget, 2));
   // Target Siklus kini TERPISAH dari Floating (punya bar sendiri). KODE 44 yang mengeset keduanya.
   Print("🎯 Target Profit Siklus: ", DoubleToString(gCycleTarget, 2), " (0 = off).");
  }

// Ubah cepat Jarak Aktif Lantai (poin) lewat tombol +/- (langkah 50 poin). Tidak boleh < 0.
void AdjustFloorArm(double delta)
  {
   gFloorArmPts += delta;
   if(gFloorArmPts < 0.0) gFloorArmPts = 0.0;
   GlobalVariableSet(StateKey("flrArm"), gFloorArmPts);
   ObjectSetString(0, "DB_EditFloor", OBJPROP_TEXT, DoubleToString(gFloorArmPts, 0));
   Print("🛡️ Jarak Aktif Lantai: ", DoubleToString(gFloorArmPts, 0), " poin.");
  }

// Ubah cepat Virtual Entry Layer lewat tombol +/- (langkah 1). 0 = virtual OFF (entry L1 langsung).
// (Virtual = fitur strategi MASTER. Di slave bar ini boleh tampil bila diisi, tapi tak memengaruhi copy.)
void AdjustVirtualLayer(int delta)
  {
   gVirtualEntryLayer += delta;
   if(gVirtualEntryLayer < 0) gVirtualEntryLayer = 0;
   GlobalVariableSet(StateKey("vLayer"), (double)gVirtualEntryLayer);
   ObjectSetString(0, "DB_EditVLayer", OBJPROP_TEXT, IntegerToString(gVirtualEntryLayer));
   Print("🌒 Virtual Entry Layer: ", gVirtualEntryLayer, " (0 = off, L1 langsung).");
  }

// SLAVE: override Start Layer dari panel (menang atas InpStartLayer & siaran master). 0 = ikut F7/siaran.
void AdjustSlaveStartOv(int delta)
  {
   gOvStartLayer += delta;
   if(gOvStartLayer < 0) gOvStartLayer = 0;
   GlobalVariableSet(StateKey("ovSL"), (double)gOvStartLayer);
   ObjectSetString(0, "DB_EditBSL", OBJPROP_TEXT, IntegerToString(gOvStartLayer));
   Print("🛰️ Slave Start Layer (override panel): ", gOvStartLayer, " (0 = ikut F7/siaran).");
  }

// SLAVE: override RSI dari panel (langkah 5). 0 = ikut F7/siaran.
void AdjustSlaveRSIOv(int delta)
  {
   gOvRSI += delta;
   if(gOvRSI < 0)   gOvRSI = 0;
   if(gOvRSI > 100) gOvRSI = 100;
   GlobalVariableSet(StateKey("ovRSI"), (double)gOvRSI);
   ObjectSetString(0, "DB_EditBRSI", OBJPROP_TEXT, IntegerToString(gOvRSI));
   Print("🛰️ Slave RSI (override panel): ", gOvRSI, " (0 = ikut F7/siaran).");
  }

// Floating ($) via bar panel — role-aware: SLAVE set override miliknya; MASTER set nilai broadcast.
void AdjustFloatingBar(double delta)
  {
   if(gCopyRole == Slave)
     {
      gSlaveFloatOverride += delta;
      if(gSlaveFloatOverride < 0.0) gSlaveFloatOverride = 0.0;
      GlobalVariableSet(StateKey("slvFloat"), gSlaveFloatOverride);
      ObjectSetString(0, "DB_EditFloat", OBJPROP_TEXT, DoubleToString(gSlaveFloatOverride, 2));
      Print("🌊 Floating Slave (override): ", DoubleToString(gSlaveFloatOverride, 2), " (0 = ikut F7/siaran).");
     }
   else
     {
      gBcastFloatMinus += delta;
      if(gBcastFloatMinus < 0.0) gBcastFloatMinus = 0.0;
      GlobalVariableSet(StateKey("bcFloat"), gBcastFloatMinus);
      ObjectSetString(0, "DB_EditFloat", OBJPROP_TEXT, DoubleToString(gBcastFloatMinus, 2));
      Print("📡 Broadcast Floating utk slave: ", DoubleToString(gBcastFloatMinus, 2), " (0 = off).");
     }
  }

// Set Floating dari kotak edit (role-aware).
void SetFloatingBarFromEdit()
  {
   double v = StringToDouble(ObjectGetString(0, "DB_EditFloat", OBJPROP_TEXT));
   if(v < 0.0) v = 0.0;
   if(gCopyRole == Slave) { gSlaveFloatOverride = v; GlobalVariableSet(StateKey("slvFloat"), v); }
   else                   { gBcastFloatMinus   = v; GlobalVariableSet(StateKey("bcFloat"), v); }
   ObjectSetString(0, "DB_EditFloat", OBJPROP_TEXT, DoubleToString(v, 2));
  }

// Validasi Harga ON/OFF (0/1). Perbarui tampilan tombol toggle.
void SetPriceValidate(int v)
  {
   gPriceValidate = (v != 0) ? 1 : 0;
   GlobalVariableSet(StateKey("pVal"), (double)gPriceValidate);
   ObjectSetString (0, "DB_BtnPV", OBJPROP_TEXT,    gPriceValidate ? "Active" : "Non Active");
   ObjectSetInteger(0, "DB_BtnPV", OBJPROP_BGCOLOR, gPriceValidate ? clrSeaGreen : clrGainsboro);
   ObjectSetInteger(0, "DB_BtnPV", OBJPROP_COLOR,   gPriceValidate ? clrWhite    : clrGray);
   Print("🔎 Validasi CT: ", (gPriceValidate ? "Active" : "Non Active"));
  }
void TogglePriceValidate() { SetPriceValidate(gPriceValidate == 0 ? 1 : 0); }

// Cutloss by RSI: label "Cutloss RSI" + tombol toggle "On" / "Off".
void SetCutlossByRSI(int v)
  {
   gCutlossByRSI = (v != 0) ? 1 : 0;
   GlobalVariableSet(StateKey("clRSI"), (double)gCutlossByRSI);
   ObjectSetString (0, "DB_BtnCLR", OBJPROP_TEXT,    gCutlossByRSI ? "On" : "Off");
   ObjectSetInteger(0, "DB_BtnCLR", OBJPROP_BGCOLOR, gCutlossByRSI ? clrSeaGreen : clrGainsboro);
   ObjectSetInteger(0, "DB_BtnCLR", OBJPROP_COLOR,   gCutlossByRSI ? clrWhite     : clrGray);
   Print("🛑 Cutloss by RSI: ", (gCutlossByRSI ? "ON" : "OFF"));
  }
void ToggleCutlossByRSI() { SetCutlossByRSI(gCutlossByRSI == 0 ? 1 : 0); }

// MASTER: ubah nilai Start Layer yang DISIARKAN ke semua slave (lewat file bridge).
void AdjustBcastLayer(int delta)
  {
   gSlaveStartLayer += delta;
   if(gSlaveStartLayer < 0) gSlaveStartLayer = 0;
   GlobalVariableSet(StateKey("sLayer"), (double)gSlaveStartLayer);
   ObjectSetString(0, "DB_EditBSL", OBJPROP_TEXT, IntegerToString(gSlaveStartLayer));
   Print("📡 Broadcast Start Layer utk slave: ", gSlaveStartLayer);
  }

// MASTER: ubah ambang RSI yang DISIARKAN ke semua slave (langkah 5). 0 = gerbang RSI off.
void AdjustBcastRSI(int delta)
  {
   gBcastRSI += delta;
   if(gBcastRSI < 0)  gBcastRSI = 0;
   if(gBcastRSI > 100) gBcastRSI = 100;
   GlobalVariableSet(StateKey("bRSI"), (double)gBcastRSI);
   ObjectSetString(0, "DB_EditBRSI", OBJPROP_TEXT, IntegerToString(gBcastRSI));
   Print("📡 Broadcast RSI utk slave: ", gBcastRSI, " (0 = off).");
  }

//+------------------------------------------------------------------+
//| TOMBOL PANEL (klik)                                               |
//+------------------------------------------------------------------+
void OnChartEvent(const int id, const long &lparam, const double &dparam, const string &sparam)
  {
   // Mode MONITOR: tombol RESET per-slave -> langsung eksekusi (kirim perintah RESET ke slave).
   if(gCopyRole == Monitor)
     {
      // SPASI (chart harus fokus) = RESET/TUTUP SEMUA slave, sama seperti tombol "RESET SEMUA".
      if(id == CHARTEVENT_KEYDOWN && (int)lparam == 32)
        {
         for(int i = 0; i < gMonCount; i++) MonitorSendReset(gMonLogin[i]);
         Print("📤 MONITOR: SPASI -> kirim RESET ke SEMUA slave (", gMonCount, " akun).");
         ChartRedraw();
         return;
        }
      // RESET SEMUA SLAVE -> langsung kirim perintah RESET ke semua slave aktif.
      if(id == CHARTEVENT_OBJECT_CLICK && sparam == "MON_ResetAll")
        {
         for(int i = 0; i < gMonCount; i++) MonitorSendReset(gMonLogin[i]);
         Print("📤 MONITOR: kirim RESET ke SEMUA slave (", gMonCount, " akun).");
         ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         ChartRedraw();
         return;
        }
      if(id == CHARTEVENT_OBJECT_CLICK && StringFind(sparam, "MON_r") == 0 && StringFind(sparam, "_rst") > 0)
        {
         int us  = StringFind(sparam, "_rst");
         int idx = (int)StringToInteger(StringSubstr(sparam, 5, us - 5));   // "MON_r{idx}_rst"
         if(idx >= 0 && idx < gMonCount)
            MonitorSendReset(gMonLogin[idx]);   // langsung eksekusi (tanpa konfirmasi)
         ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         ChartRedraw();
        }
      return;
     }

   // Mode SLAVE: bar override (Target Siklus/Start Layer/RSI/Floating/Virtual/Jarak Lantai) BISA diedit;
   // tombol strategi master (Hold Marti/Tier3/Hold TP/space-close) tetap diblokir + popup info.
   if(gCopyRole == Slave)
     {
      if(id == CHARTEVENT_CHART_CHANGE) { UpdateCanvasPosition(); return; }
      if(id == CHARTEVENT_OBJECT_CLICK && sparam == "DB_BtnReset")
        { SlaveManualClose(); ObjectSetInteger(0,"DB_BtnReset",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
      if(id == CHARTEVENT_OBJECT_CLICK && sparam == "DB_BtnMasterHdr" && MultiMasterOn())
        { gMasterDropOpen = !gMasterDropOpen; ObjectSetInteger(0,"DB_BtnMasterHdr",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
      if(id == CHARTEVENT_OBJECT_CLICK && StringFind(sparam, "DB_MasSel") == 0)
        { int sel = (int)StringToInteger(StringSubstr(sparam, 9)); SetMasterSlot(sel); gMasterDropOpen = false;
          ObjectSetInteger(0, sparam, OBJPROP_STATE, false); UpdateDashboard(); ChartRedraw(); return; }
      // BAR OVERRIDE SLAVE (muncul bila F7 != 0): semua boleh diedit langsung di panel.
      //   Target Siklus (cuan slave), Start Layer, RSI, Floating = milik slave sendiri.
      //   Virtual & Jarak Lantai = fitur master (tak berefek ke copy) tapi tetap bisa diisi bila dimunculkan.
      if(id == CHARTEVENT_OBJECT_CLICK)
        {
         if(sparam == "DB_BtnCycMinus")   { AdjustCycleTarget(-50.0); ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnCycPlus")    { AdjustCycleTarget(+50.0); ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnBSLMinus")   { AdjustSlaveStartOv(-1);   ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnBSLPlus")    { AdjustSlaveStartOv(+1);   ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnBRSIMinus")  { AdjustSlaveRSIOv(-5);     ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnBRSIPlus")   { AdjustSlaveRSIOv(+5);     ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnFloatMinus") { AdjustFloatingBar(-50.0); ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnFloatPlus")  { AdjustFloatingBar(+50.0); ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnVLMinus")    { AdjustVirtualLayer(-1);   ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnVLPlus")     { AdjustVirtualLayer(+1);   ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnFlrMinus")   { AdjustFloorArm(-50.0);    ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnFlrPlus")    { AdjustFloorArm(+50.0);    ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         if(sparam == "DB_BtnPV")         { TogglePriceValidate();    ObjectSetInteger(0,sparam,OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); return; }
         // Klik kotak edit mana pun dari bar -> biarkan fokus (jangan diblok popup).
         if(sparam == "DB_EditCycle" || sparam == "DB_EditBSL"  || sparam == "DB_EditBRSI" ||
            sparam == "DB_EditFloat" || sparam == "DB_EditVLayer" || sparam == "DB_EditFloor")
            return;
        }
      if(id == CHARTEVENT_OBJECT_ENDEDIT)
        {
         if(sparam == "DB_EditCycle")
           {
            double vcs = StringToDouble(ObjectGetString(0, "DB_EditCycle", OBJPROP_TEXT));
            if(vcs < 0.0) vcs = 0.0;
            gCycleTarget = vcs;
            GlobalVariableSet(StateKey("cycleTgt"), gCycleTarget);
            ObjectSetString(0, "DB_EditCycle", OBJPROP_TEXT, DoubleToString(gCycleTarget, 2));
            Print("🎯 Target Siklus Slave di-set: ", DoubleToString(gCycleTarget, 2), " (0 = off).");
            ChartRedraw(); return;
           }
         if(sparam == "DB_EditBSL")
           {
            int v = (int)StringToInteger(ObjectGetString(0, "DB_EditBSL", OBJPROP_TEXT)); if(v < 0) v = 0;
            gOvStartLayer = v; GlobalVariableSet(StateKey("ovSL"), (double)v);
            ObjectSetString(0, "DB_EditBSL", OBJPROP_TEXT, IntegerToString(v));
            Print("🛰️ Slave Start Layer (override) di-set: ", v, " (0 = ikut F7/siaran)."); ChartRedraw(); return;
           }
         if(sparam == "DB_EditBRSI")
           {
            int v = (int)StringToInteger(ObjectGetString(0, "DB_EditBRSI", OBJPROP_TEXT)); if(v < 0) v = 0; if(v > 100) v = 100;
            gOvRSI = v; GlobalVariableSet(StateKey("ovRSI"), (double)v);
            ObjectSetString(0, "DB_EditBRSI", OBJPROP_TEXT, IntegerToString(v));
            Print("🛰️ Slave RSI (override) di-set: ", v, " (0 = ikut F7/siaran)."); ChartRedraw(); return;
           }
         if(sparam == "DB_EditFloat")  { SetFloatingBarFromEdit(); ChartRedraw(); return; }
         if(sparam == "DB_EditVLayer")
           {
            int v = (int)StringToInteger(ObjectGetString(0, "DB_EditVLayer", OBJPROP_TEXT)); if(v < 0) v = 0;
            gVirtualEntryLayer = v; GlobalVariableSet(StateKey("vLayer"), (double)v);
            ObjectSetString(0, "DB_EditVLayer", OBJPROP_TEXT, IntegerToString(v)); ChartRedraw(); return;
           }
         if(sparam == "DB_EditFloor")
           {
            double v = StringToDouble(ObjectGetString(0, "DB_EditFloor", OBJPROP_TEXT)); if(v < 0.0) v = 0.0;
            gFloorArmPts = v; GlobalVariableSet(StateKey("flrArm"), v);
            ObjectSetString(0, "DB_EditFloor", OBJPROP_TEXT, DoubleToString(v, 0)); ChartRedraw(); return;
           }
        }
      // Sisanya (tombol strategi master) -> dinonaktifkan + popup info.
      if(id == CHARTEVENT_OBJECT_CLICK || id == CHARTEVENT_OBJECT_ENDEDIT ||
         (id == CHARTEVENT_KEYDOWN && (int)lparam == 32))
        {
         if(id == CHARTEVENT_OBJECT_CLICK) ObjectSetInteger(0, sparam, OBJPROP_STATE, false);
         ShowSlaveBlockedPopup();
         ChartRedraw();
        }
      return;
     }

   // Reposisi teks kanvas saat chart berubah (redraw/scale/scroll, termasuk setelah update F7).
   if(id == CHARTEVENT_CHART_CHANGE) { UpdateCanvasPosition(); return; }

   if(id == CHARTEVENT_OBJECT_ENDEDIT && sparam == "DB_EditCycle")
     {
      double v = StringToDouble(ObjectGetString(0, "DB_EditCycle", OBJPROP_TEXT));
      if(v < 0.0) v = 0.0;
      gCycleTarget = v;
      GlobalVariableSet(StateKey("cycleTgt"), gCycleTarget);
      ObjectSetString(0, "DB_EditCycle", OBJPROP_TEXT, DoubleToString(gCycleTarget, 2));
      Print("🎯 Target Profit Siklus di-set: ", DoubleToString(gCycleTarget, 2), " (0 = off).");
      ChartRedraw();
      return;
     }
   if(id == CHARTEVENT_OBJECT_ENDEDIT && sparam == "DB_EditFloor")
     {
      double vf = StringToDouble(ObjectGetString(0, "DB_EditFloor", OBJPROP_TEXT));
      if(vf < 0.0) vf = 0.0;
      gFloorArmPts = vf;
      GlobalVariableSet(StateKey("flrArm"), gFloorArmPts);
      ObjectSetString(0, "DB_EditFloor", OBJPROP_TEXT, DoubleToString(gFloorArmPts, 0));
      Print("🛡️ Jarak Aktif Lantai di-set: ", DoubleToString(gFloorArmPts, 0), " poin.");
      ChartRedraw();
      return;
     }
   if(id == CHARTEVENT_OBJECT_ENDEDIT && sparam == "DB_EditVLayer")
     {
      int v = (int)StringToInteger(ObjectGetString(0, "DB_EditVLayer", OBJPROP_TEXT));
      if(v < 0) v = 0;
      gVirtualEntryLayer = v;
      GlobalVariableSet(StateKey("vLayer"), (double)gVirtualEntryLayer);
      ObjectSetString(0, "DB_EditVLayer", OBJPROP_TEXT, IntegerToString(gVirtualEntryLayer));
      Print("🌒 Virtual Entry Layer di-set: ", gVirtualEntryLayer, " (0 = off).");
      ChartRedraw();
      return;
     }
   if(id == CHARTEVENT_OBJECT_ENDEDIT && sparam == "DB_EditBSL")
     {
      int vb = (int)StringToInteger(ObjectGetString(0, "DB_EditBSL", OBJPROP_TEXT));
      if(vb < 0) vb = 0;
      gSlaveStartLayer = vb;
      GlobalVariableSet(StateKey("sLayer"), (double)gSlaveStartLayer);
      ObjectSetString(0, "DB_EditBSL", OBJPROP_TEXT, IntegerToString(gSlaveStartLayer));
      Print("📡 Broadcast Start Layer utk slave: ", gSlaveStartLayer);
      ChartRedraw();
      return;
     }
   if(id == CHARTEVENT_OBJECT_ENDEDIT && sparam == "DB_EditBRSI")
     {
      int vr = (int)StringToInteger(ObjectGetString(0, "DB_EditBRSI", OBJPROP_TEXT));
      if(vr < 0) vr = 0; if(vr > 100) vr = 100;
      gBcastRSI = vr;
      GlobalVariableSet(StateKey("bRSI"), (double)gBcastRSI);
      ObjectSetString(0, "DB_EditBRSI", OBJPROP_TEXT, IntegerToString(gBcastRSI));
      Print("📡 Broadcast RSI utk slave: ", gBcastRSI, " (0 = off).");
      ChartRedraw();
      return;
     }
   if(id == CHARTEVENT_OBJECT_ENDEDIT && sparam == "DB_EditFloat")
     { SetFloatingBarFromEdit(); ChartRedraw(); return; }

   // Chart harus dalam fokus (klik chart dulu). Hati-hati: ini menutup SEMUA posisi.
   if(id == CHARTEVENT_KEYDOWN && (int)lparam == 32)
     {
      ManualReset();
      UpdateDashboard(); ChartRedraw();
      return;
     }

   if(id != CHARTEVENT_OBJECT_CLICK) return;

   // TOMBOL HOLD MARTI: toggle tahan penambahan layer averaging (basket berjalan). L1 baru tetap boleh.
   if(sparam == "DB_BtnHoldMarti")
     { ToggleHoldMarti(); ObjectSetInteger(0,"DB_BtnHoldMarti",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   // TOMBOL TIER 3: toggle paksa target ke Tier-3 (target tercepat). Auto-off saat basket tutup.
   else if(sparam == "DB_BtnTier3")
     { ToggleForceTier3(); ObjectSetInteger(0,"DB_BtnTier3",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnReset")
     {
      ManualReset();
      ObjectSetInteger(0, "DB_BtnReset", OBJPROP_STATE, false);
      UpdateDashboard(); ChartRedraw();
     }
   // TOMBOL HOLD TP: toggle tahan TP (posisi ditahan; exit lewat Target Siklus / penjaga lantai).
   else if(sparam == "DB_BtnHoldTP")
     { SetExitMode(gHoldTP ? 0 : 2); ObjectSetInteger(0,"DB_BtnHoldTP",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   // TOMBOL +/- Target Profit Siklus (langkah 25 $)
   else if(sparam == "DB_BtnCycMinus")
     { AdjustCycleTarget(-25.0); ObjectSetInteger(0,"DB_BtnCycMinus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnCycPlus")
     { AdjustCycleTarget(+25.0); ObjectSetInteger(0,"DB_BtnCycPlus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   // TOMBOL +/- Jarak Aktif Lantai (langkah 50 poin)
   else if(sparam == "DB_BtnFlrMinus")
     { AdjustFloorArm(-50.0); ObjectSetInteger(0,"DB_BtnFlrMinus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnFlrPlus")
     { AdjustFloorArm(+50.0); ObjectSetInteger(0,"DB_BtnFlrPlus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   // TOMBOL +/- Virtual Entry Layer (langkah 1)
   else if(sparam == "DB_BtnVLMinus")
     { AdjustVirtualLayer(-1); ObjectSetInteger(0,"DB_BtnVLMinus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnVLPlus")
     { AdjustVirtualLayer(+1); ObjectSetInteger(0,"DB_BtnVLPlus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnBSLMinus")
     { AdjustBcastLayer(-1); ObjectSetInteger(0,"DB_BtnBSLMinus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnBSLPlus")
     { AdjustBcastLayer(+1); ObjectSetInteger(0,"DB_BtnBSLPlus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnBRSIMinus")
     { AdjustBcastRSI(-5); ObjectSetInteger(0,"DB_BtnBRSIMinus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnBRSIPlus")
     { AdjustBcastRSI(+5); ObjectSetInteger(0,"DB_BtnBRSIPlus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   // TOMBOL +/- Floating broadcast (langkah 50 $)
   else if(sparam == "DB_BtnFloatMinus")
     { AdjustFloatingBar(-50.0); ObjectSetInteger(0,"DB_BtnFloatMinus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   else if(sparam == "DB_BtnFloatPlus")
     { AdjustFloatingBar(+50.0); ObjectSetInteger(0,"DB_BtnFloatPlus",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   // TOMBOL Validasi Harga ON/OFF — efektif hanya di slave.
   else if(sparam == "DB_BtnPV")
     { TogglePriceValidate(); ObjectSetInteger(0,"DB_BtnPV",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
   // TOMBOL Cutloss by RSI ON/OFF — fitur master/standar.
   else if(sparam == "DB_BtnCLR")
     { ToggleCutlossByRSI(); ObjectSetInteger(0,"DB_BtnCLR",OBJPROP_STATE,false); UpdateDashboard(); ChartRedraw(); }
  }

// Hold Marti: toggle tahan penambahan layer averaging pada basket yang SEDANG berjalan.
// Buka L1 siklus baru TETAP boleh. OFF -> averaging lanjut normal.
void ToggleHoldMarti()
  {
   gHoldMarti = !gHoldMarti;
   GlobalVariableSet(StateKey("holdMarti"), gHoldMarti ? 1.0 : 0.0);
   Print(gHoldMarti ? "⏸️ HOLD MARTI ON: averaging ditahan (tidak menambah layer)."
                    : "▶️ HOLD MARTI OFF: averaging lanjut normal.");
  }

// Tier 3: toggle paksa target ke Tier-3 (InpTPValue3 -> target tercepat) walau layer belum sampai.
// Auto-off begitu basket tutup (ditangani ClearState).
void ToggleForceTier3()
  {
   if(InpEntryMode == Grid)
     {
      gForceTier3 = false; GlobalVariableSet(StateKey("t3"), 0.0);
      Print("ℹ️ Mode GRID: Tier 3 tidak dipakai (basket wajib kejar target tier normal).");
      return;
     }
   gForceTier3 = !gForceTier3;
   GlobalVariableSet(StateKey("t3"), gForceTier3 ? 1.0 : 0.0);
   if(gForceTier3 && gHoldTP)        // EXCLUSIVE: Tier 3 ON -> matikan TP Hold
     { gHoldTP = false; GlobalVariableSet(StateKey("holdTP"), 0.0); Print("🔁 TP Hold dimatikan (exclusive dgn Tier 3)."); }
   Print(gForceTier3 ? "⚡ TIER 3 ON: target dipaksa ke Tier-3 (tutup lebih cepat)."
                     : "🎯 TIER 3 OFF: target kembali ke tiering normal.");
  }

// SetExitMode: pilih exit dari panel. ex: 0=TP Tier (normal), 2=TP Hold.
void SetExitMode(int ex)
  {
   if(ex == 2 && CountMyPositions() < 1)
     {
      Print("ℹ️ TP Hold: tidak ada posisi terbuka.");
      if(!MQLInfoInteger(MQL_TESTER))
         MessageBox("Tidak ada posisi terbuka.\nTombol TP Hold hanya aktif saat ada posisi.",
                    "EA Apocalypto - TP Hold", MB_OK | MB_ICONWARNING);
      return;
     }

   if(ex == 2)
     {
      gHoldTP = true;
      if(gForceTier3)                // EXCLUSIVE: TP Hold ON -> matikan Tier 3
        { gForceTier3 = false; GlobalVariableSet(StateKey("t3"), 0.0); Print("🔁 Tier 3 dimatikan (exclusive dgn TP Hold)."); }
      Print("🔒 EXIT: Hold TP ON (bypass TP tier - exit lewat Target Siklus / penjaga lantai).");
     }
   else
     {
      gHoldTP = false;
      Print("🎯 EXIT: TP Tier (exit berlapis normal - BEP tier / TP single).");
     }
   GlobalVariableSet(StateKey("holdTP"), gHoldTP ? 1.0 : 0.0);
  }

// SOP (candle berikutnya) bila ada kontraksi.
void ManualReset()
  {
   CloseAllPositions();
   ClearState();
   VirtualReset(false);                 // RESET juga menghapus siklus virtual (tanpa popup)
   gBEP = 0; gTarget = 0;
   DrawTPLine(0, false);
   Print("🔄 RESET manual: semua posisi ditutup. Siklus baru menyusul bila ada kontraksi.");
  }

// RESET di mode SLAVE: user menutup semua mirror MENDAHULUI master, lalu copy DITAHAN
// sampai master flat (siklus master sekarang selesai) -> otomatis lanjut copy siklus berikutnya.
void SlaveManualClose()
  {
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      copyTrade.PositionClose(t);
     }
   gSlaveManualClose = true;
   gCopyMirrored = 0;
   GlobalVariableSet(StateKey("sManual"), 1.0);
   Print("🧹 SLAVE RESET manual: semua mirror ditutup mendahului master. Copy ditahan sampai master flat.");
   if(!MQLInfoInteger(MQL_TESTER))
      Alert("EA Apocalypto (SLAVE): mirror ditutup mendahului master. Copy ditahan sampai master flat.");
  }

// ===== Slave multi-master: pilih file master (CT1..N) =====
// Warna khas tiap slot master (CT1..CT10) supaya mudah dibedakan di dropdown slave.
color MasterSlotColor(int slot)
  {
   switch(((slot - 1) % 10) + 1)
     {
      case 1:  return clrRoyalBlue;
      case 2:  return clrSeaGreen;
      case 3:  return clrChocolate;
      case 4:  return clrMediumVioletRed;
      case 5:  return clrDarkCyan;
      case 6:  return clrSienna;
      case 7:  return clrSlateBlue;
      case 8:  return clrDarkGoldenrod;
      case 9:  return clrCrimson;
      default: return clrDarkOliveGreen;
     }
  }

bool MultiMasterOn() { return (gCopyRole == Slave && !gSubSlave && StringLen(InpMasterFileBase) > 0); }   // SubSlave: file tunggal, tak bisa pindah master

string MasterSlotLabel() { return InpMasterFileBase + IntegerToString(gMasterSlot); }   // mis "CT1"

// Identitas master = nama file bridge tanpa ekstensi (mis "CT1.csv" -> "CT1").
string MasterIdName()
  {
   string nm = InpCopyFileName;
   int dot = StringFind(nm, ".");
   if(dot > 0) nm = StringSubstr(nm, 0, dot);
   return nm;
  }

// Tetapkan gCopyFile sesuai peran/slot. Slave multi-master -> base+slot+".csv".
void ApplyMasterSlotFile()
  {
   if(gCopyRole == Slave && StringLen(InpMasterFileBase) > 0)
      gCopyFile = InpMasterFileBase + IntegerToString(gMasterSlot) + ".csv";
   else
      gCopyFile = InpCopyFileName;
  }

// Pilih master langsung (dari dropdown). Tutup mirror lama dulu agar tidak bercampur,
// lalu langsung ikut master baru (bukan mode tahan).
void SetMasterSlot(int newSlot)
  {
   if(!MultiMasterOn()) return;
   if(newSlot < 1) newSlot = 1;
   if(newSlot > InpMasterSlotMax) newSlot = InpMasterSlotMax;
   if(newSlot == gMasterSlot) return;                // sudah aktif -> tidak ada perubahan

   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      copyTrade.PositionClose(t);
     }
   gCopyMirrored = 0;
   gSlaveWasMirroring = false;                       // supaya deteksi close-manual TIDAK terpicu
   gSlaveManualClose  = false; GlobalVariableDel(StateKey("sManual"));
   gSlaveArmed = false;

   SlaveDeleteStatusFiles();   // hapus status/command grup LAMA -> langsung lenyap dari monitor lama (tanpa jeda basi & tanpa orphan)
   gMasterSlot = newSlot;
   GlobalVariableSet(StateKey("mSlot"), (double)gMasterSlot);
   ApplyMasterSlotFile();
   gCopyStale = true;                                // paksa baca ulang file master baru
   Print("🔀 SLAVE pilih master -> ", gCopyFile);
  }

bool CycleTargetActive()
  {
   if(gCycleTarget <= 0.0) return false;
   return gHoldTP;
  }

void ManageCycleTarget()
  {
   if(!CycleTargetActive()) return;
   if(CountMyPositions() < 1) return;
   double pnl = MyFloatingPnL();
   if(pnl >= gCycleTarget)
     {
      Print("🎯 Target Siklus tercapai (floating ", DoubleToString(pnl, 2),
            " >= ", DoubleToString(gCycleTarget, 2), ") -> tutup semua posisi.");
      CloseAllPositions();
      ClearState();
      gBEP = 0; gTarget = 0; DrawTPLine(0, false);
     }
  }

// ================= PENJAGA LANTAI / PROFIT FLOOR (otomatis saat TP Hold) =================
// Tujuan: harga "terjebak di dalam profit" antara LANTAI (TP Tier) dan ATAP (Target Siklus $).
// Aktif OTOMATIS saat: TP HOLD + ada posisi real (MASTER; slave ikut lewat mirror close). Tanpa input.
//  - Lantai = level TP Tier basket REAL (BEP real ± jarak TP tier), dihitung live dari posisi real.
//  - ARM   : lantai baru aktif SETELAH harga MELEWATI TP Tier ke arah profit (biar basket yang
//            belum sampai TP Tier tidak ketutup di rugi).
//  - TUTUP : setelah ARM, bila harga balik menyentuh level TP Tier -> tutup semua (kunci cuan tier).
//  - Atap  : Target Siklus $ tetap jalan paralel (ManageCycleTarget); siapa duluan tercapai menang.
void TrailDisarm()
  {
   gTrailArmed  = false;
   gTrailRefLvl = 0.0;
   gTrailPeak   = 0.0;
   gTrailStop   = 0.0;
   gTrailDir    = 0;
  }

bool FloorFeatureActive()
  {
   if(gFloorArmPts <= 0.0)    return false;   // Jarak Lantai 0 -> penjaga lantai OFF
   if(!gHoldTP)               return false;   // hanya mode TP Hold
   if(CountMyPositions() < 1) return false;   // tak ada basket real -> tak ada yang dijaga
   return true;
  }

// Hitung level lantai = TP Tier basket real + arah basket. true bila valid.
bool FloorTierRef(int &dir, double &lvl)
  {
   int nPos = CountMyPositions();
   if(nPos < 1) return false;

   double netLots = 0.0, sumLE = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      double lot   = PositionGetDouble(POSITION_VOLUME);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double d     = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1.0 : -1.0;
      netLots += d * lot;
      sumLE   += d * lot * entry;
     }
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(MathAbs(netLots) < lotStep / 2.0) return false;

   double bep = sumLE / netLots;
   dir = (netLots > 0) ? 1 : -1;
   int tpPts = (nPos == 1) ? InpTPSingle : CurrentAvgTPPoints(nPos);   // 1 posisi -> TP single; >=2 -> TP tier
   if(tpPts <= 0) return false;
   double tpDist = (tpPts + InpSlippage) * gPt;
   lvl = (dir > 0) ? bep + tpDist : bep - tpDist;
   return true;
  }

void ManageProfitFloor()
  {
   if(!FloorFeatureActive())
     {
      if(gTrailArmed) TrailDisarm();               // keluar TP Hold / flat -> lepas penjaga
      gTrailRefLvl = 0.0; gTrailDir = 0;
      return;
     }

   int    dir;
   double tier;
   if(!FloorTierRef(dir, tier)) { gTrailRefLvl = 0.0; return; }
   gTrailDir    = dir;
   gTrailRefLvl = tier;                             // simpan utk gambar garis lantai

   double bid  = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask  = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double dist = gFloorArmPts * gPt;                // Jarak Lantai (poin -> harga): dipakai utk ARM & trailing

   if(!gTrailArmed)
     {
      // AKTIVASI: penjaga nyala setelah harga mencapai TP Tier + Jarak Lantai ke arah profit
      // (BUY: >= tier+jarak ; SELL: <= tier-jarak). Titik lantai/ARM tetap di TP Tier; jarak jg utk trailing.
      double armLvl = (dir > 0) ? tier + dist : tier - dist;
      bool passed = (dir > 0) ? (bid >= armLvl) : (ask <= armLvl);
      if(passed)
        {
         gTrailArmed = true;
         gTrailPeak  = (dir > 0) ? bid : ask;        // mulai lacak puncak/lembah dari titik aktivasi
         Print("🛡️ Penjaga lantai ARM: harga capai TP Tier + ", DoubleToString(gFloorArmPts, 0),
               " poin (lantai @ ", DoubleToString(tier, _Digits), ") -> trailing aktif.");
         SendNotification("Penjaga lantai aktif (mengunci cuan, minimal di TP Tier).");
        }
      return;                                       // belum capai aktivasi / baru ARM -> jangan tutup di tick ini
     }

   // PERAN 2 (trailing): stop = puncak - Jarak Lantai (BUY) / lembah + Jarak Lantai (SELL),
   // di-clamp minimal di TP Tier (tak pernah lewat lantai). Tutup semua saat harga balik ke stop.
   if(dir > 0)
     {
      if(bid > gTrailPeak) gTrailPeak = bid;
      double stop = gTrailPeak - dist;
      if(stop < tier) stop = tier;                  // clamp: minimal di TP Tier
      gTrailStop = stop;
      if(bid <= gTrailStop)
        {
         Print("🛡️ Stop trailing kena (BUY) @ ", DoubleToString(gTrailStop, _Digits), " -> tutup semua (cuan terkunci).");
         SendNotification("Stop trailing kena -> semua posisi ditutup (cuan terkunci).");
         CloseAllPositions();
         ClearState();
         gBEP = 0; gTarget = 0; DrawTPLine(0, false);
         if(gVAlive) VirtualReset(false);
        }
     }
   else
     {
      if(gTrailPeak <= 0.0 || ask < gTrailPeak) gTrailPeak = ask;
      double stop = gTrailPeak + dist;
      if(stop > tier) stop = tier;                  // clamp: minimal di TP Tier (SELL: tak lebih tinggi dari tier)
      gTrailStop = stop;
      if(ask >= gTrailStop)
        {
         Print("🛡️ Stop trailing kena (SELL) @ ", DoubleToString(gTrailStop, _Digits), " -> tutup semua (cuan terkunci).");
         SendNotification("Stop trailing kena -> semua posisi ditutup (cuan terkunci).");
         CloseAllPositions();
         ClearState();
         gBEP = 0; gTarget = 0; DrawTPLine(0, false);
         if(gVAlive) VirtualReset(false);
        }
     }
  }

// Helper garis HLINE: buat/pindah bila lvl>0, hapus bila lvl<=0.
void FloorHLine(string n, double lvl, color c, int style, int width, string text)
  {
   if(lvl <= 0.0)
     {
      if(ObjectFind(0, n) >= 0) ObjectDelete(0, n);
      return;
     }
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, lvl);
      ObjectSetInteger(0, n, OBJPROP_BACK, false);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
     }
   else
      ObjectMove(0, n, 0, 0, lvl);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_STYLE, style);
   ObjectSetInteger(0, n, OBJPROP_WIDTH, width);
   ObjectSetString (0, n, OBJPROP_TEXT, text);
  }

// Garis Penjaga Lantai saat TP Hold (hanya bila Jarak Lantai > 0):
//  - DB_TP_FLOOR (magenta) = lantai TP Tier (titik ARM/clamp - batas keras).
//  - SEBELUM ARM: DB_TP_ARM (abu titik) = titik aktivasi (TP Tier + Jarak Lantai) yg harus dicapai harga.
//  - SESUDAH ARM: DB_TP_TRAIL (biru) = stop trailing terkini (puncak - Jarak Lantai, min di TP Tier).
void DrawProfitFloorLine()
  {
   bool on = (FloorFeatureActive() && gTrailRefLvl > 0.0);
   double tier     = on ? gTrailRefLvl : 0.0;
   double armLvl   = (on && !gTrailArmed) ? ((gTrailDir > 0) ? tier + gFloorArmPts * gPt
                                                             : tier - gFloorArmPts * gPt) : 0.0;
   double trailLvl = (on && gTrailArmed) ? gTrailStop : 0.0;

   FloorHLine("DB_TP_FLOOR",  tier,     clrMagenta,    STYLE_DOT,  1, "Lantai TP Tier");
   FloorHLine("DB_TP_ARM",    armLvl,   clrGray,       STYLE_DOT,  1, "Aktif lantai jika harga capai sini");
   FloorHLine("DB_TP_TRAIL",  trailLvl, clrDodgerBlue, STYLE_DASH, 2, "Stop Trailing (Jarak Lantai)");
  }

// CUTLOSS ($): tutup SEMUA posisi bila floating basket <= -InpCutloss. Diatur di F7 (tanpa panel).
void ManageCutloss()
  {
   if(InpCutloss <= 0.0)      return;
   if(CountMyPositions() < 1) return;
   double pnl = MyFloatingPnL();
   if(pnl <= -InpCutloss)
     {
      Print("🛡️ CUTLOSS $ tercapai (floating ", DoubleToString(pnl, 2),
            " <= -", DoubleToString(InpCutloss, 2), ") -> tutup semua posisi.");
      CloseAllPositions();
      ClearState();
      gBEP = 0; gTarget = 0; DrawTPLine(0, false);
     }
  }




void ResetTogglesOnNewL1()
  {
   int nPos = CountMyPositions();

   // Deteksi SIKLUS BARU dari tiket FOUNDER (posisi tertua), bukan sekadar transisi flat.
   // Ini menangkap kasus tutup-buka di tick yang sama (founder berganti) yg dulu terlewat.
   ulong founder = 0; long oldestT = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long tm = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(founder == 0 || tm < oldestT) { oldestT = tm; founder = t; }
     }
   bool newCycle = (nPos >= 1 && founder != gCycleFounder);

   if(newCycle)
     {
      gCycleMinFloat = 0.0;                  // siklus baru -> reset floating minus terdalam
      if(gMasterL1RSI == 0.0)                // CADANGAN: hanya stamp bila belum ter-stamp saat open
        {                                    //   (mis. basket WARISAN/adopsi di restart yang tak lewat open L1).
         gMasterL1RSI = CurrentRSIValue();   //   Pada open L1 normal, stamp sudah diisi di momen open -> tak ditimpa.
         GlobalVariableSet(StateKey("mL1RSI"), gMasterL1RSI);
        }
     }
   if(nPos == 0 && gMasterL1RSI != 0.0)      // master flat -> tak ada basket -> kosongkan RSI L1
     {
      gMasterL1RSI = 0.0;
      GlobalVariableSet(StateKey("mL1RSI"), 0.0);
     }

   // Toggle per-basket (Hold TP, Hold Marti, Tier 3) di-reset OFF tiap siklus BARU maupun saat FLAT,
   // supaya siklus berikutnya mulai bersih. (Tier 3 = "auto-off tiap siklus" sesuai desain.)
   bool wentFlat = (gCycleFounder != 0 && nPos == 0);
   if(newCycle || wentFlat)
     {
      if(gHoldTP)     { gHoldTP = false;     GlobalVariableSet(StateKey("holdTP"), 0.0);    Print("ℹ️ Hold TP di-reset OFF (siklus baru)."); }
      if(gHoldMarti)  { gHoldMarti = false;  GlobalVariableSet(StateKey("holdMarti"), 0.0); Print("ℹ️ Hold Marti di-reset OFF (siklus baru)."); }
      if(gForceTier3) { gForceTier3 = false; GlobalVariableSet(StateKey("t3"), 0.0);        Print("ℹ️ Tier 3 di-reset OFF (siklus baru)."); }
      gRSIAnomaly = false;   // siklus baru / flat -> latch anomali RSI dibersihkan
      // Simpan max floating siklus yg baru selesai → dipakai saat kirim riwayat ke backend
      if(gCycleFounder != 0 && gCycleMinFloat < 0.0)
         GlobalVariableSet("ApoMF_" + IntegerToString(gCycleFounder), gCycleMinFloat);
     }

   gCycleFounder = (nPos >= 1) ? founder : 0;
   // Update floating MINUS terdalam selama siklus berjalan (tidak reset saat siklus selesai/flat).
   if(nPos >= 1)
     {
      double fl = MyFloatingPnL();
      if(fl < gCycleMinFloat) gCycleMinFloat = fl;
     }
   gPrevPosCount = nPos;
  }

// KODE 55 (Buy Limit lot 55, harga bebas): EA ISTIRAHAT. Aktif selama order penanda 55 masih ada.
bool IsBreakActive()
  {
   for(int i = OrdersTotal()-1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      if(OrderGetInteger(ORDER_TYPE) != ORDER_TYPE_BUY_LIMIT) continue;
      if(MathAbs(OrderGetDouble(ORDER_VOLUME_INITIAL) - 55.0) > 0.5) continue;
      return true;
     }
   return false;
  }

// KODE 44: order Buy Limit lot 44 = perintah SET-CONFIG slave (nilai = HARGA order). Kembalikan harga + tiket.
bool FindCode44(double &price, ulong &tk)
  {
   for(int i = OrdersTotal()-1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      if(OrderGetInteger(ORDER_TYPE) != ORDER_TYPE_BUY_LIMIT) continue;
      if(MathAbs(OrderGetDouble(ORDER_VOLUME_INITIAL) - 44.0) > 0.5) continue;
      price = OrderGetDouble(ORDER_PRICE_OPEN);
      tk    = t;
      return true;
     }
   return false;
  }

// Terapkan KODE 44 (Buy Limit lot 44): set Target Siklus & Floating Slave = HARGA order, lalu hapus ordernya.
// MANDIRI: bisa dipakai kapan saja (tidak wajib KODE 55 dulu). Return true bila ada order 44 yang dikonsumsi.
bool ApplyCode44()
  {
   if(gCopyRole != Slave) return false;
   double p44 = 0.0; ulong t44 = 0;
   if(!FindCode44(p44, t44)) return false;
   double val44 = NormalizeDouble(p44, 2);
   if(val44 < 0.0) val44 = 0.0;
   bool changed44 = (MathAbs(val44 - gCycleTarget) > 0.005) || (MathAbs(val44 - gSlaveFloatOverride) > 0.005);
   if(changed44)
     {
      gCycleTarget        = val44;                 // Target Siklus slave
      gSlaveFloatOverride = val44;                 // Floating - Slave ($) (gerbang)
      GlobalVariableSet(StateKey("cycleTgt"), gCycleTarget);
      GlobalVariableSet(StateKey("slvFloat"), gSlaveFloatOverride);
      ObjectSetString(0, "DB_EditCycle", OBJPROP_TEXT, DoubleToString(gCycleTarget, 2));
      ObjectSetString(0, "DB_EditFloat", OBJPROP_TEXT, DoubleToString(gSlaveFloatOverride, 2));   // KODE 44 hit Floating juga
      string m44 = StringFormat("KODE 44: setup slave diperbarui -> Target Siklus %.2f & Floating Slave %.2f.",
                                gCycleTarget, gSlaveFloatOverride);
      Print("⚙ ", m44);
      SendNotification(m44);
     }
   trade.OrderDelete(t44);                          // konsumsi KODE 44 (hapus ordernya)
   return true;
  }

// KODE 33: order Buy Limit lot 33 = perintah SET gerbang RSI slave (nilai = HARGA order). Kembalikan harga + tiket.
bool FindCode33(double &price, ulong &tk)
  {
   for(int i = OrdersTotal()-1; i >= 0; i--)
     {
      ulong t = OrderGetTicket(i);
      if(t == 0) continue;
      if(OrderGetString(ORDER_SYMBOL) != _Symbol) continue;
      if(OrderGetInteger(ORDER_TYPE) != ORDER_TYPE_BUY_LIMIT) continue;
      if(MathAbs(OrderGetDouble(ORDER_VOLUME_INITIAL) - 33.0) > 0.5) continue;
      price = OrderGetDouble(ORDER_PRICE_OPEN);
      tk    = t;
      return true;
     }
   return false;
  }

// Terapkan KODE 33 (Buy Limit lot 33): set gerbang RSI slave (gOvRSI) = HARGA order, lalu hapus ordernya.
// MANDIRI seperti KODE 44 (bisa dipakai kapan saja). Return true bila ada order 33 yang dikonsumsi.
bool ApplyCode33()
  {
   if(gCopyRole != Slave) return false;
   double p33 = 0.0; ulong t33 = 0;
   if(!FindCode33(p33, t33)) return false;
   int val33 = (int)MathRound(p33);
   if(val33 < 0)   val33 = 0;
   if(val33 > 100) val33 = 100;
   if(val33 != gOvRSI)
     {
      gOvRSI = val33;                               // override gerbang RSI slave (menang atas F7/siaran)
      GlobalVariableSet(StateKey("ovRSI"), (double)gOvRSI);
      ObjectSetString(0, "DB_EditBRSI", OBJPROP_TEXT, IntegerToString(gOvRSI));
      string m33 = StringFormat("KODE 33: gerbang RSI slave di-set -> %d (0 = ikut F7/siaran).", gOvRSI);
      Print("⚙ ", m33);
      SendNotification(m33);
     }
   trade.OrderDelete(t33);                          // konsumsi KODE 33 (hapus ordernya)
   return true;
  }

void OnTick()
  {
   MqlDateTime dtNow; TimeToStruct(TimeCurrent(), dtNow);

   if(dtNow.day != lastLicenseCheckDay)
     {
      if(!CheckCloudLicense(false)) return;
      lastLicenseCheckDay = dtNow.day;
     }

   // Kirim profit ke server. RETRY sampai sukses (tandai gLastProfitDay HANYA bila semua sukses; retry tiap 30 menit).
   // GANTI BULAN: hari trading pertama bulan baru -> FINALISASI bulan lalu (kirim utuh + tanda final), baru kirim bln berjalan.
   if(dtNow.day != gLastProfitDay)
     {
      if(TimeCurrent() - gLastProfitTry >= 1800)
        {
         gLastProfitTry = TimeCurrent();
         int  curMonthNum = dtNow.year*100 + dtNow.mon;
         bool okAll = true;

         if(gReportedMonthNum != 0 && gReportedMonthNum != curMonthNum)
           {
            // Bulan sudah berganti sejak laporan terakhir -> tutup/finalkan bulan lalu dulu (sekali, utuh).
            int py = gReportedMonthNum / 100;
            int pm = gReportedMonthNum % 100;
            if(SendProfitMonth(py, pm, true))
              { gReportedMonthNum = curMonthNum; GlobalVariableSet(StateKey("repM"), (double)gReportedMonthNum); }
            else
               okAll = false;
           }
         else if(gReportedMonthNum == 0)
           { gReportedMonthNum = curMonthNum; GlobalVariableSet(StateKey("repM"), (double)gReportedMonthNum); }

         // Kirim bulan BERJALAN (hanya setelah finalisasi bulan lalu sukses, agar urutannya benar).
         if(gReportedMonthNum == curMonthNum)
            if(!SendProfitMonth(dtNow.year, dtNow.mon, false)) okAll = false;

         if(okAll) gLastProfitDay = dtNow.day;
        }
     }

   // Riwayat transaksi AKUN UTAMA Apocalypto -> situs (hanya bila server lisensi memberi flag PUB).
   // Normal tiap 5 menit; saat masih ada sisa (backfill riwayat lama) tiap 20 detik, maks 30 deal per kali.
   ApoTick();

   // === MODE MONITOR: refresh cukup lewat OnTimer (per 300ms) -> hindari kedip di chart tick cepat ===
   if(gCopyRole == Monitor) return;

   // === COPY TRADE: SLAVE tidak menjalankan strategi, hanya mirror Master ===
   if(gCopyRole == Slave)
     {
      SlaveCheckCommand();
      SlaveSync();
      ManageSlaveRisk();                 // cutloss & target harian milik slave sendiri
      SlaveWriteStatus();
      // Catat floating MINUS terdalam siklus utk baris Profit Harian (slave: dari basket mirror sendiri).
      // Reset saat master flat (siklus baru); dipakai HANYA untuk tampilan, sama seperti di master.
      if(gMasterNP <= 0) gCycleMinFloat = 0.0;
      else { double mfDeep = SlaveMirrorFloating(); if(mfDeep < gCycleMinFloat) gCycleMinFloat = mfDeep; }
      UpdateRSICanvas();
      UpdateSlaveCanvasJL();
      UpdateCanvasPosition();
      UpdateDashboard();
      ChartRedraw();
      return;
     }

   datetime curBar = iTime(_Symbol, InpTimeframe, 0);
   bool isNewBar = (curBar != lastBarTime);
   if(isNewBar)
      lastBarTime = curBar;

   if(TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
     {
      if(IsBreakActive())
        {
         // KODE 55 -> EA ISTIRAHAT: tutup semua posisi, reset virtual, berhenti total.
         if(gVAlive) VirtualReset(false);
         if(CountMyPositions() > 0)
           {
            CloseAllPositions();
            ClearState();
            gBEP = 0; gTarget = 0; DrawTPLine(0, false);
            Print("😴 KODE 55 -> EA ISTIRAHAT: semua posisi ditutup. Hapus order penanda 55 utk lanjut.");
            SendNotification("KODE 55: EA istirahat, semua posisi ditutup.");
           }
        }
      else
        {
         // ADOPSI L1 manual (mobile/desktop) & HAPUS posisi susulan yang melanggar SOP.
         PoliceManualPositions();
         ResetTogglesOnNewL1();
         ManageCutlossByRSI();          // cutloss by RSI: tutup semua saat divergensi stamp RSI (bila aktif)
         AutoTier3ByRSI();              // auto nyalakan Tier 3 saat RSI stamp layer baru divergence
         ManageCutloss();
         ManageCycleTarget();
         ManageProfitFloor();           // Penjaga lantai: TP Tier jadi lantai profit saat TP Hold (otomatis)
         ManageAveragingExit();
         ReconcileOrphanLayer();
         ManageSingleExit();
         if(InpEntryMode != Grid) VirtualEngine(isNewBar);      // simulasi averaging + gerbang entry L1 real (tidak dipakai di mode Grid)
         RunEntryLogic(isNewBar);
        }
     }
   else
     {
      // Algo Trading OFF -> reset siklus virtual supaya tidak melanjutkan yang BASI saat dinyalakan lagi.
      if(gVAlive) VirtualReset(false);
     }

   if(isNewBar)
     {
      gCommPerLot = CommissionPerLot();
      UpdateSarRunStats();
     }
   DrawSingleTPLine();
   DrawCycleTargetLine();
   DrawVirtualTPLine();            // garis hitam putus-putus = TP virtual
   DrawProfitFloorLine();          // garis magenta titik-titik = titik aktivasi / lantai TP Tier saat TP Hold
   DrawGridTriggerLine();          // mode Grid: garis biru putus-putus = harga trigger (batas BUY/SELL)
   UpdateDashboard();
  }

//+------------------------------------------------------------------+
//| 2. STRATEGI: ENTRY SAR + AVERAGING                                |
//|   SOP:                                                            |
//|   1) ENTRY AWAL (saat flat) - ARAH dari BOLLINGER BANDS:          |
//|         - harga di BAWAH BB bawah (-offset) -> BUY                |
//|         - harga di ATAS  BB atas  (+offset) -> SELL               |
//|      Entry dievaluasi REAL-TIME (candle berjalan) setiap tick.    |
//|      Hanya dibuka di dalam Jam Trading & setelah siklus selesai.  |
//|   2) AVERAGING: saat basket FLOATING MINUS, di setiap PERGANTIAN  |
//|      CANDLE buka layer tambahan SEARAH basket. LOT layer dari     |
//|      LayerLot(): lot = InpLot x Multiplier^(layer-1) (martingale);|
//|      Multiplier <= 1 -> lot FLAT (semua layer = InpLot).          |
//|      SYARAT harga lebih menguntungkan dari entry layer terakhir:  |
//|        - BUY  -> harga sekarang LEBIH RENDAH dari layer terakhir  |
//|        - SELL -> harga sekarang LEBIH TINGGI dari layer terakhir  |
//|      Saat averaging dimulai, TP individual dihapus.               |
//|   3) EXIT BERLAPIS DINAMIS:                                       |
//|      - 1 layer (single) : TP broker InpTPSingle dari entry.       |
//|      - >= 2 layer       : target BEP + pts sesuai TIER aktif      |
//|        (tiap tier = "mulai Layer >= X -> BEP + Y pts").           |
//|        Target harga = BEP + tier + BUFFER (InpSlippage pts).      |
//|        Buffer tetap ini menyerap spread & slippage penutupan      |
//|        berlapis, dan GARIS di panel digambar di target yang       |
//|        sudah termasuk buffer -> = titik close SEBENARNYA.         |
//|        Guard: tidak pernah tutup saat floating minus / < komisi.  |
//|      Saat exit: posisi PROFIT ditutup dulu (lot besar->kecil),    |
//|      baru posisi RUGI (lot besar->kecil).                         |
//|   4) ENTRY digerakkan sinyal BB (close di luar band) + filter SAR.|
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| VIRTUAL ENGINE - simulasi SOP averaging sbg GERBANG entry L1 real |
//|  Aktif bila InpVirtualEntryLayer >= 1. Selalu jalan di semua mode. |
//|  Real L1 dibuka saat virtual capai layer N (InpVirtualEntryLayer)  |
//|  DAN real flat DAN mode-efektif = AVERAGING. Exit & kontraksi ikut  |
//|  input F7 yang sama dgn real. RESET menghapus siklus (tanpa popup). |
//+------------------------------------------------------------------+
bool VirtualActive() { return (gVirtualEntryLayer >= 1); }

// Strategi tunggal AVERAGING -> virtual selalu berhak menggerbang entry L1 real.
bool VirtualShouldGate() { return true; }

double VirtualWeightedEntry()
  {
   double sumLE = 0.0, sumL = 0.0;
   for(int i = 0; i < gVCount; i++) { sumLE += gVLot[i]*gVEntry[i]; sumL += gVLot[i]; }
   return (sumL > 0.0) ? sumLE / sumL : 0.0;
  }

// Harga TP virtual: L1 -> entry +/- TPSingle; L2+ -> BEP +/- (tier+buffer).
double VirtualTPPrice()
  {
   if(gVCount <= 0) return 0.0;
   if(gVCount == 1)
      return (gVDir > 0) ? gVEntry[0] + InpTPSingle*gPt : gVEntry[0] - InpTPSingle*gPt;
   int tpPts = CurrentAvgTPPoints(gVCount);
   if(tpPts <= 0) return 0.0;
   double bep = VirtualWeightedEntry();
   double tpDist = (tpPts + InpSlippage) * gPt;
   return (gVDir > 0) ? bep + tpDist : bep - tpDist;
  }

double VirtualFloating()          // proxy PnL harga (hanya TANDA yg dipakai)
  {
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double f = 0.0;
   for(int i = 0; i < gVCount; i++)
      f += (gVDir > 0) ? (bid - gVEntry[i]) * gVLot[i] : (gVEntry[i] - ask) * gVLot[i];
   return f;
  }

void VirtualReset(bool popup)
  {
   if(popup && gVAlive)
     {
      // Notifikasi NON-BLOCKING (tidak menahan OnTick spt MessageBox): log + push HP + Alert.
      Print("🌓 Siklus Virtual selesai, menunggu kontraksi baru.");
      SendNotification("Siklus Virtual selesai, menunggu kontraksi baru.");
      if(!MQLInfoInteger(MQL_TESTER))
         Alert("EA Apocalypto: Siklus Virtual selesai, menunggu kontraksi baru.");
     }
   gVAlive = false; gVCount = 0; gVDir = 0; gVLastBar = 0; gVTriggeredReal = false;
   ArrayResize(gVEntry, 0); ArrayResize(gVLot, 0);
   VirtualClearPersist();
  }

// ---- Persistensi virtual (tahan compile/re-attach/restart terminal) ----
void VirtualPersist()
  {
   GlobalVariableSet(StateKey("vAlive"),   gVAlive ? 1.0 : 0.0);
   GlobalVariableSet(StateKey("vDir"),     (double)gVDir);
   GlobalVariableSet(StateKey("vCount"),   (double)gVCount);
   GlobalVariableSet(StateKey("vLastBar"), (double)gVLastBar);
   GlobalVariableSet(StateKey("vTrig"),    gVTriggeredReal ? 1.0 : 0.0);
   for(int i = 0; i < gVCount; i++)
     {
      GlobalVariableSet(StateKey("vEnt"+IntegerToString(i)), gVEntry[i]);
      GlobalVariableSet(StateKey("vLot"+IntegerToString(i)), gVLot[i]);
     }
  }

void VirtualClearPersist()
  {
   GlobalVariableDel(StateKey("vAlive"));
   GlobalVariableDel(StateKey("vDir"));
   GlobalVariableDel(StateKey("vCount"));
   GlobalVariableDel(StateKey("vLastBar"));
   GlobalVariableDel(StateKey("vTrig"));
   GlobalVariablesDeleteAll(StateKey("vEnt"));
   GlobalVariablesDeleteAll(StateKey("vLot"));
  }

void VirtualRestore()   // dipanggil di OnInit: pulihkan siklus virtual bila ada
  {
   if(!VirtualActive()) return;            // virtual OFF -> tidak perlu pulihkan
   if(!GlobalVariableCheck(StateKey("vAlive"))) return;
   if(GlobalVariableGet(StateKey("vAlive")) == 0.0) return;
   int cnt = (int)GlobalVariableGet(StateKey("vCount"));
   if(cnt <= 0) return;
   gVDir           = (int)GlobalVariableGet(StateKey("vDir"));
   gVLastBar       = (datetime)(long)GlobalVariableGet(StateKey("vLastBar"));
   gVTriggeredReal = (GlobalVariableGet(StateKey("vTrig")) != 0.0);
   ArrayResize(gVEntry, cnt); ArrayResize(gVLot, cnt);
   for(int i = 0; i < cnt; i++)
     {
      gVEntry[i] = GlobalVariableGet(StateKey("vEnt"+IntegerToString(i)));
      gVLot[i]   = GlobalVariableGet(StateKey("vLot"+IntegerToString(i)));
     }
   gVCount = cnt;
   gVAlive = true;
   Print("🌒 Virtual dipulihkan: siklus ", (gVDir > 0 ? "BUY" : "SELL"), " ", cnt, " layer.");
  }

void VirtualAddLayer(double price, double lot)
  {
   int k = gVCount;
   ArrayResize(gVEntry, k+1); ArrayResize(gVLot, k+1);
   gVEntry[k] = price; gVLot[k] = lot;
   gVCount = k + 1;
   gVLastBar = iTime(_Symbol, InpTimeframe, 0);
   VirtualPersist();
  }

// Buka L1 real mengikuti virtual (arah = gVDir).
void VirtualTriggerRealL1(int dir)
  {
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) return;
   if(OutsideTradingHours()) return;
   if(DailyTargetReached()) return;
   gRealFromVirtual = true;                        // basket ini digerbang virtual -> boleh reset virtual saat selesai
   GlobalVariableSet(StateKey("realFromV"), 1.0);
   Print("🎯 VIRTUAL trigger L", gVirtualEntryLayer, " -> real L1 ",
         (dir > 0 ? "BUY" : "SELL"), " (ikut virtual), TP ", InpTPSingle, " pts");
   OpenPosition(dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, InpLot, PosComment(1), InpTPSingle);
   gMasterL1RSI = CurrentRSIValue(); GlobalVariableSet(StateKey("mL1RSI"), gMasterL1RSI);   // stamp RSI PERSIS saat L1 dibuka (gerbang RSI slave akurat sejak file pertama)
  }

// Buka L1 real ikut virtual bila: virtual sudah >= gate, mode-efektif AVERAGING, dan real FLAT.
// Bisa menembak KAPAN PUN real flat (mis. setelah basket trending tutup lalu pindah ke Averaging).
void VirtualTryTrigger()
  {
   if(gVCount < gVirtualEntryLayer) return;   // virtual belum capai layer gate
   if(!VirtualShouldGate())         return;   // mode-efektif belum averaging -> jangan lewat virtual
   if(CountMyPositions() != 0)      return;   // real belum flat -> tunggu
   VirtualTriggerRealL1(gVDir);
  }

void VirtualEngine(bool isNewBar)
  {
   // Basket real selesai (transisi ada posisi -> flat):
   //  - RESET virtual HANYA jika basket tadi DIGERBANG virtual. Basket yang dibuka manual/langsung
   //    TIDAK me-reset virtual -> layer virtual dipertahankan, bisa lanjut/menembak nanti.
   int realNow = CountMyPositions();
   if(gRealPrevCountV >= 1 && realNow == 0)
     {
      if(gVAlive && gRealFromVirtual) VirtualReset(false);
      gRealFromVirtual = false;
      GlobalVariableSet(StateKey("realFromV"), 0.0);
     }
   gRealPrevCountV = realNow;

   if(!VirtualActive()) { if(gVAlive) VirtualReset(false); return; }

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   // --- siklus belum jalan: cari kontraksi baru ---
   if(!gVAlive)
     {
      if(OutsideTradingHours()) return;
      int bb = BBSignalPts(InpBBOffset);
      if(bb == 0) return;
      gVAlive = true; gVDir = bb; gVTriggeredReal = false;
      double px = (bb > 0) ? ask : bid;
      VirtualAddLayer(px, LayerLot(1));
      string vmsg1 = "🌒 Virtual L1 " + (bb > 0 ? "BUY" : "SELL") + " @ " + DoubleToString(px, _Digits) +
                     " | TP " + DoubleToString(VirtualTPPrice(), _Digits);
      Print(vmsg1);
      SendNotification(vmsg1);
      VirtualTryTrigger();
      return;
     }

   // --- siklus jalan: cek EXIT (harga sentuh TP) ---
   // Real & Virtual SALING MENUTUP: siapa capai target duluan menutup keduanya.
   // Syarat: tutup basket real HANYA bila real dalam PROFIT.
   // TP HOLD aktif -> TP virtual & real DI-BYPASS (tidak menutup / tidak reset apa pun).
   double vtp = VirtualTPPrice();
   bool hit = (gVDir > 0) ? (bid >= vtp) : (ask <= vtp);
   if(vtp > 0.0 && hit && !gHoldTP)
     {
      // "Saling menutup" HANYA berlaku untuk basket real yang DIGERBANG virtual (averaging).
      if(CountMyPositions() > 0 && gRealFromVirtual)
        {
         if(MyFloatingPnL() > 0.0)        // Virtual capai TP & basket (virtual) PROFIT -> tutup real + reset.
           {
            CloseAllPositions();
            ClearState();
            gBEP = 0; gTarget = 0; DrawTPLine(0, false);
            Print("🌗 Virtual capai TP duluan (real profit) -> basket real (virtual) ikut ditutup.");
            SendNotification("Virtual capai TP -> basket real ditutup (profit).");
            VirtualReset(true);
           }
         // masih RUGI -> tunggu profit, jangan tutup & jangan reset.
         return;
        }
      // Real FLAT, atau basket real BUKAN dari virtual -> JANGAN sentuh posisi real.
      // Virtual menyelesaikan siklusnya sendiri -> reset (mulai guide baru).
      VirtualReset(true);
      return;
     }

   // Real FLAT & virtual sudah >= gate & mode-efektif averaging -> buka L1 real ikut virtual.
   // (Menangkap kasus: virtual sudah menumpuk saat trending, lalu real flat / pindah ke Averaging.)
   if(CountMyPositions() == 0) VirtualTryTrigger();

   // --- averaging virtual: candle baru, floating minus, harga lebih dalam. TIDAK dibatasi InpMaxLayer. ---
   if(!isNewBar) return;
   if(gVLastBar >= iTime(_Symbol, InpTimeframe, 0)) return;   // 1 layer per candle
   if(VirtualFloating() >= 0.0) return;
   double lastE = gVEntry[gVCount-1];
   double spread = ask - bid; if(spread < 0.0) spread = 0.0;
   double gap = spread + (InpAvgMinGapPts > 0 ? InpAvgMinGapPts : 0) * gPt;
   bool deeper = (gVDir > 0) ? (ask < lastE - gap) : (bid > lastE + gap);
   if(!deeper) return;
   double pxN = (gVDir > 0) ? ask : bid;
   VirtualAddLayer(pxN, LayerLot(gVCount + 1));
   string vmsgN = "🌘 Virtual L" + IntegerToString(gVCount) + " " + (gVDir > 0 ? "BUY" : "SELL") + " @ " +
                  DoubleToString(pxN, _Digits) + " | TP " + DoubleToString(VirtualTPPrice(), _Digits);
   Print(vmsgN);
   SendNotification(vmsgN);
   VirtualTryTrigger();
  }

void RunEntryLogic(bool isNewBar)
  {
   if(InpEntryMode == Grid) { RunGrid(isNewBar); return; }
   int nPos = CountMyPositions();

   if(nPos >= 1)
     {
      RunAveraging(isNewBar);
      return;
     }

   if(lastLot != 0.0 || lastEntry != 0.0) ClearState();

   if(DailyTargetReached()) return;
   if(OutsideTradingHours()) return;

   string src;
   int dir = EntryDirection(src);
   if(dir == 0) return;

   // Virtual ON -> L1 dibuka lewat GERBANG virtual (bukan entry langsung).
   if(VirtualActive()) return;

   Print("🎯 Siklus baru: L1 ", (dir > 0 ? "BUY" : "SELL"), " (", src, "), TP ", InpTPSingle, " pts");
   gRealFromVirtual = false; GlobalVariableSet(StateKey("realFromV"), 0.0);   // L1 langsung (bukan lewat virtual)
   OpenPosition(dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, InpLot, PosComment(1), InpTPSingle);
   gMasterL1RSI = CurrentRSIValue(); GlobalVariableSet(StateKey("mL1RSI"), gMasterL1RSI);   // stamp RSI PERSIS saat L1 dibuka (gerbang RSI slave akurat sejak file pertama)
  }

//+------------------------------------------------------------------+
//| MODE GRID                                                         |
//|  1) Harga keluar Bollinger sejauh Jarak Kontraksi -> titik         |
//|     kontraksi disimpan (grid terpicu, belum ada order).            |
//|  2) Tiap pergantian candle M1: harga market di BAWAH trigger ->    |
//|     SELL, di ATAS trigger -> BUY. Trigger TETAP sampai siklus      |
//|     selesai. SELL tak pernah di atas trigger & BUY tak di bawahnya. |
//|  3) Lot = Lot Awal x Multiplier^(layer-1), dibatasi Max Layer.     |
//|  4) Exit sama: L1 TP single, >=2 layer BEP basket + TP tier.       |
//+------------------------------------------------------------------+
void GridSave()
  {
   GlobalVariableSet(StateKey("gridArm"), gGridArmed ? 1.0 : 0.0);
   GlobalVariableSet(StateKey("gridRef"), gGridRef);
   GlobalVariableSet(StateKey("gridBar"), (double)gGridArmBar);
   GlobalVariableSet(StateKey("gridSide"), (double)gGridSide);
  }
void GridLoad()
  {
   if(GlobalVariableCheck(StateKey("gridArm"))) gGridArmed  = (GlobalVariableGet(StateKey("gridArm")) > 0.5);
   if(GlobalVariableCheck(StateKey("gridRef"))) gGridRef    = GlobalVariableGet(StateKey("gridRef"));
   if(GlobalVariableCheck(StateKey("gridBar"))) gGridArmBar = (datetime)GlobalVariableGet(StateKey("gridBar"));
   if(GlobalVariableCheck(StateKey("gridSide"))) gGridSide = (int)GlobalVariableGet(StateKey("gridSide"));
  }
void GridReset()
  {
   gGridArmed = false; gGridRef = 0.0; gGridArmBar = 0; gGridSide = 0;
   GlobalVariableDel(StateKey("gridArm")); GlobalVariableDel(StateKey("gridRef")); GlobalVariableDel(StateKey("gridBar")); GlobalVariableDel(StateKey("gridSide"));
  }

// Teks layer berikutnya mode Grid: "Next L3 0.04 (x2.0)" / "Max Layer".
string GridNextTxt(int nPos)
  {
   if(InpMaxLayer > 0 && nPos >= InpMaxLayer) return "Max Layer";
   string m = (MathAbs(InpAvgMult - MathRound(InpAvgMult)) < 1e-9) ? IntegerToString((int)MathRound(InpAvgMult)) : DoubleToString(InpAvgMult, 1);
   return "L" + IntegerToString(nPos + 1) + " " + DoubleToString(LayerLot(nPos + 1), 2) + " (x" + m + ")";
  }

// Sisi grid dari harga MARKET saat pergantian candle vs harga trigger:
//  BUY  hanya bila harga di ATAS trigger  (Bid > trigger -> eksekusi di Ask juga di atas)
//  SELL hanya bila harga di BAWAH trigger (Ask < trigger -> eksekusi di Bid juga di bawah)
//  Spread menyeberangi trigger -> 0 (tunda), supaya BUY tak pernah dibuka di bawah & SELL tak di atas trigger.
int GridSideNow()
  {
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID), ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   if(gGridRef <= 0.0 || bid <= 0.0 || ask <= 0.0) return 0;
   if(bid > gGridRef) return  1;
   if(ask < gGridRef) return -1;
   return 0;
  }
string GridPriceTxt(int dir)
  {
   double px = (dir > 0) ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   return (dir > 0 ? "harga " : "harga ") + DoubleToString(px, _Digits) + (dir > 0 ? " > " : " < ") + "trigger " + DoubleToString(gGridRef, _Digits);
  }

void RunGrid(bool isNewBar)
  {
   int nPos = CountMyPositions();
   datetime bar0 = iTime(_Symbol, InpTimeframe, 0);

   if(nPos == 0)
     {
      if(lastLot != 0.0 || lastEntry != 0.0) ClearState();
      if(DailyTargetReached() || OutsideTradingHours()) { if(gGridArmed) GridReset(); return; }

      if(!gGridArmed)
        {
         int s = BBSignalPts(InpBBOffset);
         if(s == 0) return;
         gGridArmed  = true;
         gGridRef    = SymbolInfoDouble(_Symbol, SYMBOL_BID);
         gGridArmBar = bar0;
         gGridSide   = s;
         GridSave();
         Print("🧲 GRID terpicu: kontraksi ", (s > 0 ? "BAWAH" : "ATAS"), " Bollinger (", InpBBOffset,
               " pts). Titik kontraksi ", DoubleToString(gGridRef, _Digits), " -> tunggu candle berikutnya.");
         return;
        }

      if(!isNewBar || bar0 == gGridArmBar) return;
      int dir = GridSideNow();
      if(dir == 0) { Print("ℹ️ GRID: harga masih di garis trigger ", DoubleToString(gGridRef, _Digits), " (spread menyeberang), tunggu candle berikutnya."); return; }

      Print("🎯 Siklus baru GRID: L1 ", (dir > 0 ? "BUY" : "SELL"), " (", GridPriceTxt(dir), "), TP ", InpTPSingle, " pts");
      gRealFromVirtual = false; GlobalVariableSet(StateKey("realFromV"), 0.0);
      if(!OpenPosition(dir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, InpLot, PosComment(1), InpTPSingle)) return;
      gMasterL1RSI = CurrentRSIValue(); GlobalVariableSet(StateKey("mL1RSI"), gMasterL1RSI);
      // harga pemicu TETAP jadi batas BUY/SELL utk layer berikutnya (tidak bergeser)
      return;
     }

   // ---- basket berjalan: layer grid berikutnya, 1x per candle ----
   if(gHoldMarti)
     {
      if(isNewBar) Print("⏸️ Hold Marti aktif: grid ditahan (tidak menambah layer).");
      return;
     }
   if(!isNewBar) return;
   if(NewestPositionTime() >= bar0) return;
   if(InpMaxLayer > 0 && nPos >= InpMaxLayer)
     { Print("ℹ️ GRID dilewati: Max Layer (", InpMaxLayer, ") tercapai."); return; }

   if(gGridRef <= 0.0)   // harga pemicu hilang (mis. state terhapus) -> pakai harga entry L1 (posisi tertua)
     {
      double l1 = 0.0; long ot = 0; bool got = false;
      for(int i = PositionsTotal()-1; i >= 0; i--)
        {
         ulong tk = PositionGetTicket(i);
         if(tk == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
         long tt = (long)PositionGetInteger(POSITION_TIME_MSC);
         if(!got || tt < ot) { got = true; ot = tt; l1 = PositionGetDouble(POSITION_PRICE_OPEN); }
        }
      if(!got) return;
      gGridRef = l1; GridSave();
     }
   int d = GridSideNow();
   if(d == 0) { Print("ℹ️ GRID: harga di garis trigger ", DoubleToString(gGridRef, _Digits), " (spread menyeberang) -> layer ditunda ke candle berikutnya."); return; }

   double nextLot = LayerLot(nPos + 1);
   Print("🧲 GRID L", nPos + 1, " ", (d > 0 ? "BUY" : "SELL"), " lot ", DoubleToString(nextLot, 2), " (", GridPriceTxt(d), ")");
   ClearPositionTPs();
   if(!OpenPosition(d > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, nextLot, PosComment(nPos + 1), 0)) return;

   double nBEP, nTgt;
   if(CurrentBasketBEPTarget(nBEP, nTgt))
     {
      string msg = "GRID BEP " + DoubleToString(nBEP, _Digits) +
                   " | Target " + (nTgt > 0.0 ? DoubleToString(nTgt, _Digits) : "MANUAL (net lot 0)");
      SendNotification(msg);
      Print("📲 ", msg);
     }
  }

int EntryDirection(string &src)
  {
   int bbA = BBSignalPts(InpBBOffset);
   if(bbA == 0) return 0;
   src = "BB+SAR Averaging";
   return bbA;
  }

// Sinyal breakout Bollinger dgn offset (pts) bebas: +1 = harga di BAWAH band bawah (-offset),
// -1 = harga di ATAS band atas (+offset), 0 = di dalam. Dipakai utk sinyal L1 (InpBBOffset).
int BBSignalPts(int offsetPts)
  {
   if(hBBN == INVALID_HANDLE) return 0;

   double up[], lo[];
   ArraySetAsSeries(up, true);
   ArraySetAsSeries(lo, true);
   if(CopyBuffer(hBBN, 1, 0, 1, up) < 1) return 0;
   if(CopyBuffer(hBBN, 2, 0, 1, lo) < 1) return 0;

   double off = (offsetPts > 0 ? offsetPts : 0) * gPt;
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);

   if(price < lo[0] - off) return  1;
   if(price > up[0] + off) return -1;
   return 0;
  }
int BBSignal() { return BBSignalPts(InpBBOffset); }

double LayerLotCalc(int layer, double baseLot, double mult)
  {
   if(layer < 1) layer = 1;
   double m = (mult > 0.0) ? mult : 1.0;
   return NormalizeLot(baseLot * MathPow(m, layer - 1));
  }
double LayerLot(int layer)        { return LayerLotCalc(layer, InpLot, InpAvgMult); }

bool DailyTargetReached()
  {
   if(InpDailyTarget <= 0.0) return false;
   return DailyRealizedProfit() >= InpDailyTarget;
  }

void RunAveraging(bool isNewBar)
  {
   if(gHoldMarti)                               // HOLD MARTI: tahan penambahan layer averaging (basket berjalan)
     {
      if(isNewBar) Print("⏸️ Hold Marti aktif: averaging ditahan (tidak menambah layer).");
      return;
     }
   if(!isNewBar) return;                        // averaging: 1 evaluasi per pergantian candle

   int nPos = CountMyPositions();

   if(NewestPositionTime() >= iTime(_Symbol, InpTimeframe, 0))
     {
      Print("ℹ️ Averaging dilewati: sudah ada layer yang dibuka di candle ini.");
      return;
     }

   if(InpMaxLayer > 0 && nPos >= InpMaxLayer)
     { Print("ℹ️ Averaging dilewati: Max Layer (", InpMaxLayer, ") tercapai."); return; }

   double floatPnL = MyFloatingPnL();
   if(floatPnL >= 0.0) return;                    // basket harus floating minus

   int cycDir = CycleDirection();
   if(cycDir == 0) { Print("⚠️ Averaging dilewati: arah basket tidak terdeteksi (net lot 0)."); return; }

   if(!SyncLastLayerToNewest())
     { Print("⚠️ Averaging dilewati: state layer tidak bisa direkonstruksi."); return; }

   // Harga layer baru harus LEBIH DALAM dari entry layer terakhir (jarak = spread).
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double spread = ask - bid; if(spread < 0.0) spread = 0.0;
   double gap = spread + (InpAvgMinGapPts > 0 ? InpAvgMinGapPts : 0) * gPt;
   bool layerValid = (cycDir > 0) ? (ask < lastEntry - gap) : (bid > lastEntry + gap);
   if(!layerValid)
     {
      Print("ℹ️ Averaging dilewati: harga belum cukup lebih rugi dari layer terakhir (",
            (cycDir > 0 ? "BUY butuh ask < " : "SELL butuh bid > "),
            DoubleToString((cycDir > 0 ? lastEntry - gap : lastEntry + gap), _Digits),
            ", harga sekarang ", DoubleToString(cycDir > 0 ? ask : bid, _Digits), ").");
      return;
     }

   double refEntry = lastEntry, refLot = lastLot;
   double nextLot = LayerLot(nPos + 1);
   Print("♻️ Candle baru & basket MINUS -> averaging L", nPos + 1, " ",
         (cycDir > 0 ? "BUY" : "SELL"), " lot ", DoubleToString(nextLot, 2),
         " (vs layer terakhir ", DoubleToString(lastEntry, _Digits), ")");
   ClearPositionTPs();
   if(!OpenPosition(cycDir > 0 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL, nextLot,
                    PosComment(nPos + 1), 0))
      return;
   if(!EnforceLayerFillSOP(cycDir, refEntry, refLot, nPos + 1)) return;

   double nBEP, nTgt;
   if(CurrentBasketBEPTarget(nBEP, nTgt))
     {
      string msg = "BEP " + DoubleToString(nBEP, _Digits) +
                   " | Target " + (nTgt > 0.0 ? DoubleToString(nTgt, _Digits) : "MANUAL");
      SendNotification(msg);
      Print("📲 ", msg);
     }
  }

int AvgTPPointsCalc(int layers, int l1, int v1, int l2, int v2, int l3, int v3)
  {
   int tp        = v1;
   int bestLayer = -1;

   int lyr[3] = {l1, l2, l3};
   int val[3] = {v1, v2, v3};

   for(int i = 0; i < 3; i++)
     {
      if(lyr[i] <= 0)         continue;
      if(layers < lyr[i])     continue;
      if(lyr[i] >  bestLayer) { bestLayer = lyr[i]; tp = val[i]; }
     }
   return tp;
  }
int CurrentAvgTPPoints(int layers)
  {
   // MODE GRID: Tier 3 tidak dipakai sama sekali (tombol/auto Tier 3 & tier ke-3 berdasar layer).
   // Basket wajib kejar target: >= Layer Tier-2 tetap pakai Target Tier-2.
   if(InpEntryMode == Grid)
      return AvgTPPointsCalc(layers, InpTPLayer1, InpTPValue1, InpTPLayer2, InpTPValue2, 0, 0);
   // TIER 3 dipaksa: target langsung ke nilai Tier-3 (target tercepat) walau layer belum sampai.
   if(gForceTier3 && InpTPValue3 > 0) return InpTPValue3;
   return AvgTPPointsCalc(layers, InpTPLayer1, InpTPValue1, InpTPLayer2, InpTPValue2, InpTPLayer3, InpTPValue3);
  }

bool CurrentBasketBEPTarget(double &bep, double &target)
  {
   int nPos = CountMyPositions();
   if(nPos < 2) return false;

   double netLots = 0.0, sumLE = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      double lot   = PositionGetDouble(POSITION_VOLUME);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double d     = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1.0 : -1.0;
      netLots += d * lot;
      sumLE   += d * lot * entry;
     }
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(MathAbs(netLots) < lotStep / 2.0) return false;

   bep = sumLE / netLots;
   int tpPts = CurrentAvgTPPoints(nPos);
   if(tpPts <= 0) { target = 0.0; return true; }
   double tpDist = (tpPts + InpSlippage) * gPt;
   target = (netLots > 0) ? bep + tpDist : bep - tpDist;
   return true;
  }

//+------------------------------------------------------------------+
//| 2b. EXIT BASKET AVERAGING: BEP + TP BERLAPIS (dicek tiap tick)    |
//+------------------------------------------------------------------+
void ManageAveragingExit()
  {
   if(gHoldTP)
     {
      gTarget = 0; DrawTPLine(0, false);
      double nL = 0.0, sLE = 0.0;
      for(int i = PositionsTotal()-1; i >= 0; i--)
        {
         ulong t = PositionGetTicket(i);
         if(t == 0) continue;
         if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
         double lt = PositionGetDouble(POSITION_VOLUME);
         double en = PositionGetDouble(POSITION_PRICE_OPEN);
         double d  = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1.0 : -1.0;
         nL += d * lt; sLE += d * lt * en;
        }
      gBEP = (MathAbs(nL) > 0.0000001) ? sLE / nL : 0.0;
      return;
     }
   int nPos = CountMyPositions();
   if(nPos < 2) { gBEP = 0; gTarget = 0; DrawTPLine(0, false); return; }

   double netLots = 0.0, sumLE = 0.0, grossLots = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      double lot   = PositionGetDouble(POSITION_VOLUME);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double d     = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1.0 : -1.0;
      netLots   += d * lot;
      sumLE     += d * lot * entry;
      grossLots += lot;
     }
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(MathAbs(netLots) < lotStep / 2.0) { gBEP = 0; gTarget = 0; DrawTPLine(0, false); return; }

   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);

   gBEP = sumLE / netLots;
   int tpPts = CurrentAvgTPPoints(nPos);

   if(tpPts <= 0)
     {
      gTarget = 0;
      DrawTPLine(0, false);
      return;
     }

   double tpDist = (tpPts + InpSlippage) * gPt;
   gTarget = (netLots > 0) ? gBEP + tpDist : gBEP - tpDist;
   DrawTPLine(gTarget, true);

   bool priceHit = (netLots > 0 && bid >= gTarget) || (netLots < 0 && ask <= gTarget);

   // Guard tambahan: jangan pernah tutup saat floating masih MINUS, dan floating harus
   double floatPnL = MyFloatingPnL();
   bool moneyOK = (floatPnL >= gCommPerLot * grossLots) && (floatPnL >= 0.0);

   if(priceHit && moneyOK)
     {
      Print("✅ Target BEP+", tpPts, "+buf pts (", nPos, " layer) @ ", DoubleToString(gTarget, _Digits),
            " | floating ", DoubleToString(floatPnL, 2), " -> tutup semua posisi.");
      CloseAllPositions();
      ClearState();
      gBEP = 0; gTarget = 0;
      DrawTPLine(0, false);
     }
  }

void DrawTPLine(double price, bool show)
  {
   string n = "DB_TP_LINE";
   if(!show || price <= 0)
     {
      if(ObjectFind(0, n) >= 0) ObjectDelete(0, n);
      return;
     }
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, price);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clrMagenta);
      ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, n, OBJPROP_BACK, false);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
     }
   else
      ObjectMove(0, n, 0, 0, price);
   ObjectSetString(0, n, OBJPROP_TEXT, "Target BEP+" + IntegerToString(CurrentAvgTPPoints(CountMyPositions())) + "+buf pts");
  }

void DrawSingleTPLine()
  {
   string n = "DB_TP_SINGLE";
   double tpLevel = 0.0;
   if(InpTPSingle > 0 && !gHoldTP && CountMyPositions() == 1)
     {
      for(int i = PositionsTotal()-1; i >= 0; i--)
        {
         ulong tk = PositionGetTicket(i);
         if(tk == 0) continue;
         if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
         string cmt = PositionGetString(POSITION_COMMENT);
         if(LayerFromComment(cmt) >= 2) break;
         long   ptype = PositionGetInteger(POSITION_TYPE);
         double entry = PositionGetDouble(POSITION_PRICE_OPEN);
         tpLevel = (ptype == POSITION_TYPE_BUY) ? entry + InpTPSingle * gPt
                                                : entry - InpTPSingle * gPt;
         break;
        }
     }
   if(tpLevel <= 0.0)
     {
      if(ObjectFind(0, n) >= 0) ObjectDelete(0, n);
      return;
     }
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, tpLevel);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clrMagenta);
      ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, n, OBJPROP_BACK, false);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
     }
   else
      ObjectMove(0, n, 0, 0, tpLevel);
   ObjectSetString(0, n, OBJPROP_TEXT, "TP Single");
  }

double CycleTargetPrice()
  {
   if(gCycleTarget <= 0.0 || CountMyPositions() < 1) return 0.0;
   double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSz  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   double K = (tickSz > 0.0) ? tickVal / tickSz : 0.0;

   double netSigned = 0.0, sumSignedEntry = 0.0, swap = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      double lots  = PositionGetDouble(POSITION_VOLUME);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double dir   = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1.0 : -1.0;
      netSigned      += dir * lots;
      sumSignedEntry += dir * lots * entry;
      swap           += PositionGetDouble(POSITION_SWAP);
     }
   if(K <= 0.0 || MathAbs(netSigned) <= 0.0000001) return 0.0;
   return ((gCycleTarget - swap) / K + sumSignedEntry) / netSigned;
  }

// Mode Grid: garis putus-putus di harga trigger selama grid terpicu / siklus berjalan.
void DrawGridTriggerLine()
  {
   string n = "DB_GRID_TRIG";
   bool show = (InpEntryMode == Grid && gGridRef > 0.0 && (gGridArmed || CountMyPositions() > 0));
   if(!show) { if(ObjectFind(0, n) >= 0) ObjectDelete(0, n); return; }
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, gGridRef);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clrDodgerBlue);
      ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, n, OBJPROP_BACK, false);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
     }
   else
      ObjectMove(0, n, 0, 0, gGridRef);
   ObjectSetString(0, n, OBJPROP_TEXT, "Trigger Grid " + DoubleToString(gGridRef, _Digits));
  }

void DrawCycleTargetLine()
  {
   string n = "DB_TP_CYCLE";
   double lvl = (CycleTargetActive() && CountMyPositions() >= 1) ? CycleTargetPrice() : 0.0;

   if(lvl <= 0.0)
     {
      if(ObjectFind(0, n) >= 0) ObjectDelete(0, n);
      return;
     }
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, lvl);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clrDarkOrange);
      ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, n, OBJPROP_BACK, false);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
     }
   else
      ObjectMove(0, n, 0, 0, lvl);
   ObjectSetString(0, n, OBJPROP_TEXT, "Target Siklus $" + DoubleToString(gCycleTarget, 2));
  }

// Garis HITAM putus-putus = harga TP virtual (pedoman), tampil saat siklus virtual jalan.
void DrawVirtualTPLine()
  {
   string n = "DB_TP_VIRTUAL";
   double lvl = (gVAlive) ? VirtualTPPrice() : 0.0;
   if(lvl <= 0.0)
     {
      if(ObjectFind(0, n) >= 0) ObjectDelete(0, n);
      return;
     }
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_HLINE, 0, 0, lvl);
      ObjectSetInteger(0, n, OBJPROP_COLOR, clrBlack);
      ObjectSetInteger(0, n, OBJPROP_STYLE, STYLE_DASH);
      ObjectSetInteger(0, n, OBJPROP_WIDTH, 1);
      ObjectSetInteger(0, n, OBJPROP_BACK, false);
      ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
     }
   else
      ObjectMove(0, n, 0, 0, lvl);
   ObjectSetString(0, n, OBJPROP_TEXT, "TP Virtual L" + IntegerToString(gVCount));
  }

void ManageSingleExit()
  {
   if(gHoldTP) return;
   if(InpTPSingle <= 0) return;
   if(CountMyPositions() != 1) return;

   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      string cmt = PositionGetString(POSITION_COMMENT);
      if(LayerFromComment(cmt) >= 2) return;

      long   ptype = PositionGetInteger(POSITION_TYPE);
      double entry = PositionGetDouble(POSITION_PRICE_OPEN);
      double tp    = (ptype == POSITION_TYPE_BUY) ? entry + InpTPSingle * gPt
                                                  : entry - InpTPSingle * gPt;
      double bid   = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask   = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      bool   hit   = (ptype == POSITION_TYPE_BUY) ? (bid >= tp) : (ask <= tp);
      if(hit)
        {
         Print("✅ TP single (virtual) @ ", DoubleToString(tp, _Digits), " tercapai -> tutup.");
         CloseAllPositions();
         ClearState();
         gBEP = 0; gTarget = 0; DrawTPLine(0, false);
        }
      return;
     }
  }

// Nilai RSI saat ini (untuk dicatat di comment posisi saat open). 0 bila handle gagal.
double CurrentRSIValue()
  {
   if(hRSI == INVALID_HANDLE) return 0.0;
   double r[];
   ArraySetAsSeries(r, true);
   if(CopyBuffer(hRSI, 0, 0, 1, r) < 1) return 0.0;
   return r[0];
  }

// Comment posisi: "Apo L<layer> RSI <nilai RSI saat open>". Contoh: "Apo L2 RSI 45.3".
// Nomor layer wajib ada (dipakai LayerFromComment utk averaging/TP).
string PosComment(int layer)
  {
   if(layer < 1) layer = 1;
   return "Apo " + IntegerToString(layer) + " " + DoubleToString(CurrentRSIValue(), 1);
  }

int LayerFromComment(string cmt)
  {
   string pre = "Apo ";
   if(StringFind(cmt, pre) != 0) return 0;
   return (int)StringToInteger(StringSubstr(cmt, StringLen(pre)));
  }

// Ambil nilai RSI dari comment "Apo <layer> <rsi>" (token ke-3). -1 bila tak valid.
double RSIFromComment(string cmt)
  {
   string parts[];
   int k = StringSplit(cmt, StringGetCharacter(" ", 0), parts);
   if(k < 3) return -1.0;
   if(parts[0] != "Apo") return -1.0;
   return StringToDouble(parts[2]);
  }

// AUTO TIER 3 berbasis RSI Stamp divergence. Edge: dievaluasi SEKALI tiap layer BARU.
//   BUY  -> stamp layer baru >= layer sebelumnya (naik/sama) -> nyalakan Tier 3.
//   SELL -> stamp layer baru <= layer sebelumnya (turun/sama) -> nyalakan Tier 3.
// User bebas matikan/nyalakan manual; layer baru berikutnya yang divergence akan auto-ON lagi.
void AutoTier3ByRSI()
  {
   if(InpEntryMode == Grid) return;   // logika divergensi RSI hanya utk Averaging (lihat ManageCutlossByRSI)
   int nPos = CountMyPositions();
   if(nPos <= 0) { gRsiT3LastLayer = 0; return; }   // flat -> reset penanda utk siklus baru
   if(nPos < 2)  return;                            // perlu >= 2 layer (L & L-1)

   // Cari 2 layer teratas + RSI stamp-nya dari comment.
   int    layL = 0, layPrev = 0;
   double rsiL = -1.0, rsiPrev = -1.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      int lay = LayerFromComment(cm);
      if(lay <= 0) continue;
      double rs = RSIFromComment(cm);
      if(rs < 0.0) continue;
      if(lay > layL)         { layPrev = layL; rsiPrev = rsiL; layL = lay; rsiL = rs; }
      else if(lay > layPrev) { layPrev = lay;  rsiPrev = rs; }
     }
   if(layL <= 1 || rsiL < 0.0 || rsiPrev < 0.0) return;   // belum ada pasangan L & L-1 valid

   if(layL <= gRsiT3LastLayer) return;   // layer ini sudah dievaluasi (edge) -> jangan ulangi
   gRsiT3LastLayer = layL;               // tandai layer baru ini sudah diproses

   int  dir = CycleDirection();          // +1 BUY / -1 SELL
   bool diverge = (dir >= 0) ? (rsiL >= rsiPrev) : (rsiL <= rsiPrev);
   if(diverge && !gForceTier3)
     {
      gForceTier3 = true;
      GlobalVariableSet(StateKey("t3"), 1.0);
      if(gHoldTP)                     // EXCLUSIVE: Tier 3 auto-ON -> matikan TP Hold
        { gHoldTP = false; GlobalVariableSet(StateKey("holdTP"), 0.0); Print("🔁 TP Hold dimatikan (exclusive dgn Tier 3 otomatis)."); }
      Print("⚡ AUTO Tier 3: RSI stamp L", layL, " (", DoubleToString(rsiL, 1),
            ") vs L", layPrev, " (", DoubleToString(rsiPrev, 1), ") divergence -> Tier 3 ON.");
      SendNotification("Auto Tier 3 aktif (RSI stamp divergence).");
     }
  }

// CUTLOSS BY RSI: bila aktif, begitu muncul anomali/divergensi stamp RSI (RSI bergerak melawan
//  arah posisi antar-layer) -> TUTUP SEMUA posisi. Deteksi sama dgn AutoTier3ByRSI (stamp L vs L-1),
//  edge 1x per layer baru. Fitur strategi master/standar (butuh RSI stamp layer).
void ManageCutlossByRSI()
  {
   if(gCutlossByRSI == 0) return;
   // MODE GRID: layer searah tren -> RSI wajar ikut bergerak searah posisi; logika divergensi averaging
   // akan salah membaca & menutup basket. Cutloss RSI tidak berlaku di mode Grid.
   if(InpEntryMode == Grid) return;
   int nPos = CountMyPositions();
   if(nPos <= 0) { gRsiCLLastLayer = 0; return; }   // flat -> reset penanda utk siklus baru
   if(nPos < 2)  return;                            // perlu >= 2 layer (L & L-1)

   int    layL = 0, layPrev = 0;
   double rsiL = -1.0, rsiPrev = -1.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      int lay = LayerFromComment(cm);
      if(lay <= 0) continue;
      double rs = RSIFromComment(cm);
      if(rs < 0.0) continue;
      if(lay > layL)         { layPrev = layL; rsiPrev = rsiL; layL = lay; rsiL = rs; }
      else if(lay > layPrev) { layPrev = lay;  rsiPrev = rs; }
     }
   if(layL <= 1 || rsiL < 0.0 || rsiPrev < 0.0) return;   // belum ada pasangan L & L-1 valid
   if(layL <= gRsiCLLastLayer) return;   // layer ini sudah dievaluasi (edge) -> jangan ulangi
   gRsiCLLastLayer = layL;

   int  dir = CycleDirection();          // +1 BUY / -1 SELL
   bool diverge = (dir >= 0) ? (rsiL >= rsiPrev) : (rsiL <= rsiPrev);   // RSI lawan arah posisi
   if(diverge)
     {
      double pnl = MyFloatingPnL();
      Print("🛑 CUTLOSS BY RSI: divergensi stamp RSI L", layL, " (", DoubleToString(rsiL, 1),
            ") vs L", layPrev, " (", DoubleToString(rsiPrev, 1), "), floating ",
            DoubleToString(pnl, 2), " -> tutup SEMUA posisi.");
      SendNotification("Cutloss by RSI: divergensi RSI -> semua posisi ditutup (floating " + DoubleToString(pnl, 2) + ").");
      if(gVAlive) VirtualReset(false);
      CloseAllPositions();
      ClearState();
      gBEP = 0; gTarget = 0; DrawTPLine(0, false);
     }
  }

bool OpenPosition(ENUM_ORDER_TYPE type, double lot, string comment, int tpPts)
  {
   lot = NormalizeLot(lot);
   bool ok = (type == ORDER_TYPE_BUY) ? trade.Buy(lot, _Symbol, 0.0, 0.0, 0.0, comment)
                                      : trade.Sell(lot, _Symbol, 0.0, 0.0, 0.0, comment);

   uint   rc   = trade.ResultRetcode();
   double fill = trade.ResultPrice();

   bool success = ok || rc == TRADE_RETCODE_DONE || rc == TRADE_RETCODE_DONE_PARTIAL
                     || rc == TRADE_RETCODE_PLACED;

   if(!success)
     {
      ulong tk = FindPositionTicketByComment(comment);
      if(tk > 0 && PositionSelectByTicket(tk))
        {
         success = true;
         fill    = PositionGetDouble(POSITION_PRICE_OPEN);
        }
     }

   if(success)
     {
      if(fill <= 0.0)
        {
         ulong tk = FindPositionTicketByComment(comment);
         if(tk > 0 && PositionSelectByTicket(tk)) fill = PositionGetDouble(POSITION_PRICE_OPEN);
        }
      lastLot = lot;
      if(fill > 0.0) lastEntry = fill;
      GlobalVariableSet(StateKey("lastLot"),   lastLot);
      GlobalVariableSet(StateKey("lastEntry"), lastEntry);
      if(!ok)
         Print("ℹ️ OpenPosition: retcode ", rc, " (ambigu) tapi posisi TERKONFIRMASI terbuka @ ",
               DoubleToString(lastEntry, _Digits), " -> dianggap SUKSES.");
      return true;
     }

   Print("❌ Gagal open ", (type == ORDER_TYPE_BUY ? "BUY" : "SELL"), " lot ", DoubleToString(lot, 2),
         " err=", rc, " (", trade.ResultRetcodeDescription(), ")");
   return false;
  }

ulong FindPositionTicketByComment(string cmt)
  {
   ulong    best  = 0;
   datetime bestT = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong tk = PositionGetTicket(i);
      if(tk == 0) continue;
      if(PositionGetString(POSITION_SYMBOL)  != _Symbol) continue;
      if(PositionGetString(POSITION_COMMENT) != cmt)     continue;
      datetime t = (datetime)PositionGetInteger(POSITION_TIME);
      if(t >= bestT) { bestT = t; best = tk; }
     }
   return best;
  }

// VERIFIKASI SOP HARGA layer averaging SETELAH fill: harga fill (lastEntry = trade.ResultPrice)
bool EnforceLayerFillSOP(int cycDir, double refEntry, double refLot, int newLayerNo)
  {
   if(refEntry <= 0.0) return true;
   double fill  = lastEntry;
   bool   worse = (cycDir > 0) ? (fill < refEntry) : (fill > refEntry);
   if(worse) return true;

   Print("⚠️ Layer L", newLayerNo, " fill ", DoubleToString(fill, _Digits),
         " TIDAK lebih rugi dari layer terakhir ", DoubleToString(refEntry, _Digits),
         " (spread/slippage) -> DIPERTAHANKAN (no-cut).");
   return true;
  }

//+------------------------------------------------------------------+
//| 3. UTILITAS POSISI & STATE                                        |
//+------------------------------------------------------------------+
double NormalizeLot(double lot)
  {
   double minLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(lotStep > 0) lot = MathRound(lot / lotStep) * lotStep;
   lot = MathMax(minLot, MathMin(maxLot, lot));
   return lot;
  }

int CountMyPositions()
  {
   int total = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) == _Symbol) total++;
     }
   return total;
  }

int CycleDirection()
  {
   double netLots = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      double d = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1.0 : -1.0;
      netLots += d * PositionGetDouble(POSITION_VOLUME);
     }
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(netLots >  lotStep / 2.0) return 1;
   if(netLots < -lotStep / 2.0) return -1;
   return 0;
  }

bool NewestPosition(double &lotOut, double &entryOut)
  {
   long bestTime = 0;
   bool found = false;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long t = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(!found || t > bestTime)
        {
         bestTime = t;
         lotOut   = PositionGetDouble(POSITION_VOLUME);
         entryOut = PositionGetDouble(POSITION_PRICE_OPEN);
         found = true;
        }
     }
   return found;
  }

// PENTING kalau user menutup sebagian layer terdalam (mis. L4 & L5 sudah profit lalu ditutup):
bool SyncLastLayerToNewest()
  {
   double l, e;
   if(!NewestPosition(l, e)) return false;
   lastLot   = l;
   lastEntry = e;
   GlobalVariableSet(StateKey("lastLot"),   lastLot);
   GlobalVariableSet(StateKey("lastEntry"), lastEntry);
   return true;
  }

datetime NewestPositionTime()
  {
   datetime best = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      datetime t = (datetime)PositionGetInteger(POSITION_TIME);
      if(t > best) best = t;
     }
   return best;
  }

void ClearPositionTPs()
  {
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetDouble(POSITION_TP) != 0.0 || PositionGetDouble(POSITION_SL) != 0.0)
         trade.PositionModify(ticket, 0.0, 0.0);
     }
  }

double MyFloatingPnL()
  {
   double f = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      f += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
     }
   return f;
  }

void CloseAllPositions()
  {
   const int MAX_CLOSE_TRY = 5;

   for(int attempt = 1; attempt <= MAX_CLOSE_TRY; attempt++)
     {
      ulong  tickets[];
      double vols[];
      double pnls[];
      int    n = 0;

      for(int i = PositionsTotal()-1; i >= 0; i--)
        {
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0) continue;
         if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

         ArrayResize(tickets, n+1);
         ArrayResize(vols, n+1);
         ArrayResize(pnls, n+1);
         tickets[n] = ticket;
         vols[n]    = PositionGetDouble(POSITION_VOLUME);
         pnls[n]    = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
         n++;
        }

      if(n == 0) return;

      for(int a = 0; a < n-1; a++)
         for(int b = a+1; b < n; b++)
           {
            bool aProfit = (pnls[a] >= 0.0);
            bool bProfit = (pnls[b] >= 0.0);
            bool swap = false;
            if(bProfit && !aProfit)                          swap = true;
            else if(bProfit == aProfit && vols[b] > vols[a]) swap = true;
            if(swap)
              {
               double tv = vols[a]; vols[a] = vols[b]; vols[b] = tv;
               double tp = pnls[a]; pnls[a] = pnls[b]; pnls[b] = tp;
               ulong  tt = tickets[a]; tickets[a] = tickets[b]; tickets[b] = tt;
              }
           }

      for(int i = 0; i < n; i++)
         trade.PositionClose(tickets[i]);
     }

   int left = CountMyPositions();
   if(left > 0)
      Print("⚠ CloseAllPositions: masih ada ", left, " posisi belum tertutup setelah ",
            MAX_CLOSE_TRY, "x percobaan. Akan dicoba lagi tick berikutnya.");
  }

void ReconcileOrphanLayer()
  {
   if(CountMyPositions() != 1) return;

   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagic) continue;

      string cmt = PositionGetString(POSITION_COMMENT);
      bool isAvgLayer = (LayerFromComment(cmt) >= 2);
      bool noTP       = (PositionGetDouble(POSITION_TP) == 0.0);
      if(!(isAvgLayer && noTP)) return;

      double pnl = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
      if(trade.PositionClose(t))
        {
         Print("🧹 Layer averaging YATIM (", cmt, ", PnL ", DoubleToString(pnl,2),
               ") ditutup segera -> akun flat.");
         SendNotification("Layer averaging yatim ditutup (PnL " + DoubleToString(pnl,2) + ").");
         ClearState();
         gBEP = 0; gTarget = 0; DrawTPLine(0, false);
        }
      else
         Print("⚠ Gagal tutup layer yatim tiket=", t, " err=", trade.ResultRetcode(),
               " (", trade.ResultRetcodeDescription(), ")");
      return;
     }
  }

// ---- Daftar adopsi (gAdopted[]): tiket posisi manual magic-0 yang jadi anggota basket ----
bool IsAdopted(ulong t)
  {
   for(int i = 0; i < ArraySize(gAdopted); i++)
      if(gAdopted[i] == t) return true;
   return false;
  }
void AddAdopted(ulong t)
  {
   if(IsAdopted(t)) return;
   int n = ArraySize(gAdopted);
   ArrayResize(gAdopted, n + 1);
   gAdopted[n] = t;
  }
void ClearAdopted() { ArrayResize(gAdopted, 0); }

// Buang dari daftar adopsi tiket yang posisinya SUDAH TIDAK ADA (ditutup/ter-TP).
void PruneAdopted()
  {
   for(int i = ArraySize(gAdopted) - 1; i >= 0; i--)
     {
      if(!PositionSelectByTicket(gAdopted[i]))
        {
         int last = ArraySize(gAdopted) - 1;
         gAdopted[i] = gAdopted[last];
         ArrayResize(gAdopted, last);
        }
     }
  }

// Snapshot basket SAH (posisi milik EA magic InpMagic + yang sudah diadopsi):
int BasketRef(double &refEntry, double &refLot, int &dir)
  {
   int    cnt = 0;
   long   newestT = -1;
   double netLots = 0.0;
   refEntry = 0.0; refLot = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      bool valid = (PositionGetInteger(POSITION_MAGIC) == InpMagic) || IsAdopted(t);
      if(!valid) continue;
      cnt++;
      double v = PositionGetDouble(POSITION_VOLUME);
      double d = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1.0 : -1.0;
      netLots += d * v;
      long tm = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(tm > newestT)
        { newestT = tm; refEntry = PositionGetDouble(POSITION_PRICE_OPEN); refLot = v; }
     }
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   dir = (netLots >  step/2.0) ? 1 : (netLots < -step/2.0) ? -1 : 0;
   return cnt;
  }

//+------------------------------------------------------------------+
//| ADOPSI ENTRY MANUAL (SESUAI SOP) & PENGHAPUS ORDER TAK-SESUAI     |
//|  Order manual (mobile/desktop, magic 0) di simbol ini DIADOPSI    |
//|  jadi anggota basket bila LOLOS SOP:                              |
//|   - L1 (basket masih kosong): lot HARUS = lot dasar LayerLot(1).  |
//|   - Layer L2+ : arah HARUS sama dgn basket, harga entry HARUS     |
//|     lebih dalam (lebih rugi) dari layer terakhir, DAN lot HARUS   |
//|     = LayerLot(n+1) (martingale). Jika salah satu gagal -> HAPUS. |
//|  Order market MT5 tak bisa "ditolak" (sudah open) -> hanya bisa   |
//|  dihapus (spread hangus). EA (magic 300680) selalu SAH.           |
//|  Diproses TERTUA dulu supaya rantai L1->L2->... tervalidasi urut. |
//+------------------------------------------------------------------+
// REKONSTRUKSI (tick pertama setelah start/recompile/pindah VPS): EA mewarisi basket yang
// SUDAH berjalan. Semua posisi manual (magic 0) yang SEARAH basket diadopsi kembali apa adanya
// (cek ARAH saja, tanpa uji lot/jarak) - berlaku utk L1, tengah, MAUPUN layer terakhir adopsi.
// Yang berlawanan arah (asing) dihapus. Arah basket = arah posisi TERTUA (founder L1).
void ReconstructAdoptedBasket()
  {
   int  dir = 0; long oldestT = 0; bool found = false;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      long tm = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(!found || tm < oldestT)
        { found=true; oldestT=tm; dir=(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1; }
     }
   if(!found) return;

   int adopted = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagic) continue;   // milik EA -> sudah sah
      int    pdir = (PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY)?1:-1;
      double lot  = PositionGetDouble(POSITION_VOLUME);
      if(pdir == dir)
        {
         AddAdopted(t);
         trade.PositionModify(t, 0.0, 0.0);
         Print("🤝 Rekonstruksi: posisi manual ", (pdir>0?"BUY":"SELL"), " lot ", DoubleToString(lot,2),
               " diadopsi kembali (warisan basket).");
         adopted++;
        }
      else if(trade.PositionClose(t))
         Print("🚫 Rekonstruksi: posisi manual lawan arah lot ", DoubleToString(lot,2), " dihapus.");
     }
   if(adopted > 0)
      SendNotification("EA start: " + IntegerToString(adopted) + " posisi manual diadopsi kembali (rekonstruksi basket).");
  }

void PoliceManualPositions()
  {
   PruneAdopted();
   int nPos = CountMyPositions();
   if(nPos == 0) { gPoliceFirstRun = false; ClearAdopted(); return; }

   // Tick pertama setelah start: WARISI basket berjalan (adopsi semua magic-0 searah).
   if(gPoliceFirstRun)
     {
      gPoliceFirstRun = false;
      ReconstructAdoptedBasket();
      if(CountMyPositions() > 0) SyncLastLayerToNewest();
      return;
     }

   // Kumpulkan KANDIDAT: posisi magic-0 di simbol ini yang BELUM diadopsi (order manual "baru").
   ulong  cand[];
   long   candT[];
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) == InpMagic) continue;
      if(IsAdopted(t)) continue;
      int k = ArraySize(cand);
      ArrayResize(cand, k+1); ArrayResize(candT, k+1);
      cand[k]  = t;
      candT[k] = (long)PositionGetInteger(POSITION_TIME_MSC);
     }
   for(int a = 0; a < ArraySize(cand); a++)
      for(int b = a+1; b < ArraySize(cand); b++)
         if(candT[b] < candT[a])
           { long tt=candT[a]; candT[a]=candT[b]; candT[b]=tt;
             ulong uu=cand[a]; cand[a]=cand[b]; cand[b]=uu; }

   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double eps  = (step > 0.0) ? step/2.0 : 1e-8;

   for(int i = 0; i < ArraySize(cand); i++)
     {
      ulong t = cand[i];
      if(!PositionSelectByTicket(t)) continue;
      double cLot   = PositionGetDouble(POSITION_VOLUME);
      double cEntry = PositionGetDouble(POSITION_PRICE_OPEN);
      long   cType  = PositionGetInteger(POSITION_TYPE);
      int    cDir   = (cType == POSITION_TYPE_BUY) ? 1 : -1;

      double refEntry, refLot; int bDir;
      int n = BasketRef(refEntry, refLot, bDir);

      double expLot = LayerLot(n + 1);
      string reason = "";

      if(n == 0)
        {
         if(MathAbs(cLot - expLot) > eps)
            reason = "lot L1 " + DoubleToString(cLot,2) + " != lot dasar " + DoubleToString(expLot,2);
        }
      else
        {
         // Adopsi layer manual berlaku di SEMUA mode (termasuk Trending). Validasi: arah + lebih dalam + lot.
         if(cDir != bDir)
            reason = "arah beda dgn basket (" + (bDir>0?"BUY":"SELL") + ")";
         else
           {
            bool deeper = (bDir > 0) ? (cEntry < refEntry) : (cEntry > refEntry);
            if(!deeper)
               reason = "harga entry belum lebih dalam dari layer terakhir (" + DoubleToString(refEntry,_Digits) + ")";
            else if(MathAbs(cLot - expLot) > eps)
               reason = "lot " + DoubleToString(cLot,2) + " != SOP LayerLot(" + IntegerToString(n+1) + ")=" + DoubleToString(expLot,2);
           }
        }

      if(reason == "")
        {
         AddAdopted(t);
         trade.PositionModify(t, 0.0, 0.0);
         string ok = "Order manual " + (cDir>0?"BUY":"SELL") + " lot " + DoubleToString(cLot,2) +
                     " diADOPSI sebagai L" + IntegerToString(n+1) + " (lolos SOP).";
         SendNotification(ok);
         Print("🤝 ", ok, " tiket=", t);
        }
      else
        {
         if(trade.PositionClose(t))
           {
            string msg = "Order manual " + (cDir>0?"BUY":"SELL") + " lot " + DoubleToString(cLot,2) +
                         " DIHAPUS - tidak sesuai SOP: " + reason + ".";
            SendNotification(msg);
            Print("🚫 ", msg, " tiket=", t);
           }
         else
            Print("⚠ Gagal hapus order manual tiket=", t,
                  " err=", trade.ResultRetcode(), " (", trade.ResultRetcodeDescription(), ")");
        }
     }

   if(CountMyPositions() > 0) SyncLastLayerToNewest();
  }

string StateKey(string field)
  {
   return "APO_" + _Symbol + "_" + IntegerToString(InpMagic) + "_" + field;
  }

void ClearState()
  {
   GlobalVariableDel(StateKey("lastLot"));
   GlobalVariableDel(StateKey("lastEntry"));
   lastLot = 0.0;
   lastEntry = 0.0;
   ClearAdopted();
   TrailDisarm();                 // basket flat/tutup -> lepas penjaga lantai (re-ARM utk siklus berikutnya)
   if(gForceTier3)                // TIER 3 auto-off begitu basket tutup (per siklus)
     { gForceTier3 = false; GlobalVariableSet(StateKey("t3"), 0.0); }
   gRsiT3LastLayer = 0;           // reset penanda auto-Tier3 utk siklus berikutnya
   gRsiCLLastLayer = 0;           // reset penanda cutloss-by-RSI utk siklus berikutnya
   GridReset();                   // mode Grid: siklus selesai -> tunggu titik kontraksi baru
  }

//+------------------------------------------------------------------+
//| 4. INDIKATOR PARABOLIC SAR (ENTRY - HARDCODE)                     |
//+------------------------------------------------------------------+

int SarDirection()
  {
   if(hSAR == INVALID_HANDLE) return 0;
   double buf[];
   ArraySetAsSeries(buf, true);
   if(CopyBuffer(hSAR, 0, 0, 1, buf) < 1) return 0;

   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(buf[0] < price) return 1;
   if(buf[0] > price) return -1;
   return 0;
  }

//+------------------------------------------------------------------+
//| STATISTIK TITIK SAR HARIAN (per rangkaian searah, flip-ke-flip)   |
//|  - 1 rangkaian = titik SAR berturut-turut di SATU sisi harga.     |
//|  - Rangkaian dicatat saat FLIP terjadi; rangkaian yang masih      |
//|    BERJALAN tidak ikut dihitung. Rangkaian pertama hari ini bisa  |
//|    terpotong jam 00:00 (mulai dari kemarin).                      |
//|  - Dihitung dari bar TERTUTUP di timeframe entry, di-refresh      |
//|    setiap pergantian candle.                                      |
//+------------------------------------------------------------------+
void UpdateSarRunStats()
  {
   gSarRunMin = 0; gSarRunMax = 0; gSarRunCount = 0; gSarRunAvg = 0.0;
   if(hSAR == INVALID_HANDLE) return;

   datetime dayStart = StartOfDay();
   int total = Bars(_Symbol, InpTimeframe, dayStart, TimeCurrent());
   if(total < 2) return;

   double   sar[], cls[];
   datetime tm[];
   ArraySetAsSeries(sar, true);
   ArraySetAsSeries(cls, true);
   ArraySetAsSeries(tm,  true);
   if(CopyBuffer(hSAR, 0, 1, total, sar) < 2)                 return;
   if(CopyClose(_Symbol, InpTimeframe, 1, total, cls) < 2)    return;
   if(CopyTime(_Symbol,  InpTimeframe, 1, total, tm)  < 2)    return;
   int n = MathMin(MathMin(ArraySize(sar), ArraySize(cls)), ArraySize(tm));

   int prevSide = 0, runLen = 0, sum = 0;
   for(int i = n - 1; i >= 0; i--)
     {
      if(tm[i] < dayStart) continue;
      int side = (sar[i] < cls[i]) ? 1 : ((sar[i] > cls[i]) ? -1 : prevSide);
      if(side == 0) continue;
      if(prevSide != 0 && side != prevSide)
        {
         if(gSarRunCount == 0) { gSarRunMin = runLen; gSarRunMax = runLen; }
         else
           {
            if(runLen < gSarRunMin) gSarRunMin = runLen;
            if(runLen > gSarRunMax) gSarRunMax = runLen;
           }
         sum += runLen;
         gSarRunCount++;
         runLen = 1;
        }
      else
         runLen++;
      prevSide = side;
     }
   if(gSarRunCount > 0) gSarRunAvg = (double)sum / gSarRunCount;
  }

int CurrentSarRunCount(int &sideOut)
  {
   sideOut = SarDirection();
   if(sideOut == 0 || hSAR == INVALID_HANDLE) return 0;

   int cnt   = 1;
   int shift = 1;
   const int CHUNK   = 500;
   const int MAXSCAN = 20000;

   while(shift <= MAXSCAN)
     {
      double sar[], cl[];
      ArraySetAsSeries(sar, true);
      ArraySetAsSeries(cl,  true);
      int n = CopyBuffer(hSAR, 0, shift, CHUNK, sar);
      int m = CopyClose(_Symbol, InpTimeframe, shift, CHUNK, cl);
      if(n <= 0 || m <= 0) break;
      if(m < n) n = m;

      for(int i = 0; i < n; i++)
        {
         int side = (sar[i] < cl[i]) ? 1 : ((sar[i] > cl[i]) ? -1 : 0);
         if(side != sideOut) return cnt;
         cnt++;
        }
      if(n < CHUNK) break;
      shift += n;
     }
   return cnt;
  }

//+------------------------------------------------------------------+
//| 5. JAM TRADING & INFO PANEL                                       |
//+------------------------------------------------------------------+
datetime StartOfDay()
  {
   MqlDateTime t; TimeToStruct(TimeCurrent(), t);
   t.hour = 0; t.min = 0; t.sec = 0;
   return StructToTime(t);
  }

void ParseTradingHours()
  {
   string p[];
   if(StringSplit(InpStartTime, StringGetCharacter(":", 0), p) >= 2)
     { startHour = (int)StringToInteger(p[0]); startMin = (int)StringToInteger(p[1]); }
   if(startHour < 0 || startHour > 23) startHour = 0;
   if(startMin  < 0 || startMin  > 59) startMin  = 0;

   if(StringSplit(InpEndTime, StringGetCharacter(":", 0), p) >= 2)
     { endHour = (int)StringToInteger(p[0]); endMin = (int)StringToInteger(p[1]); }
   if(endHour < 0 || endHour > 23) endHour = 23;
   if(endMin  < 0 || endMin  > 59) endMin  = 59;
  }

bool OutsideTradingHours()
  {
   MqlDateTime t; TimeToStruct(TimeCurrent(), t);
   int now = t.hour * 60 + t.min;
   int st  = startHour * 60 + startMin;
   int en  = endHour   * 60 + endMin;
   if(st == en) return false;
   if(st < en)  return !(now >= st && now <= en);
   return !(now >= st || now <= en);
  }

double CommissionPerLot()
  {
   if(!HistorySelect(TimeCurrent() - 30*86400, TimeCurrent() + 1)) return 0.0;
   double comm = 0.0, vol = 0.0;
   int deals = HistoryDealsTotal();
   int cnt = 0;
   for(int i = deals - 1; i >= 0 && cnt < 300; i--)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      long dtype = HistoryDealGetInteger(d, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;
      if(HistoryDealGetString(d, DEAL_SYMBOL) != _Symbol) continue;
      double v = HistoryDealGetDouble(d, DEAL_VOLUME);
      if(v <= 0.0) continue;
      comm += MathAbs(HistoryDealGetDouble(d, DEAL_COMMISSION));
      vol  += v;
      cnt++;
     }
   if(vol <= 0.0) return 0.0;
   return comm / vol;
  }

double DailyRealizedProfit()
  {
   if(!HistorySelect(StartOfDay(), TimeCurrent() + 1)) return 0.0;
   double sum = 0.0;
   int deals = HistoryDealsTotal();
   for(int i = 0; i < deals; i++)
     {
      ulong d = HistoryDealGetTicket(i);
      if(d == 0) continue;
      // BONUS dsb. WAJIB dikecualikan supaya TOP-UP/WITHDRAWAL TIDAK dihitung sebagai profit.
      long dtype = HistoryDealGetInteger(d, DEAL_TYPE);
      if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;
      if(HistoryDealGetString(d, DEAL_SYMBOL) != _Symbol) continue;
      if(HistoryDealGetInteger(d, DEAL_ENTRY)  != DEAL_ENTRY_OUT) continue;
      sum += HistoryDealGetDouble(d, DEAL_PROFIT)
           + HistoryDealGetDouble(d, DEAL_SWAP)
           + HistoryDealGetDouble(d, DEAL_COMMISSION);
     }
   return sum;
  }

//+------------------------------------------------------------------+
//| 5b. COPY TRADE LOKAL (v2.0)                                       |
//|   Master menulis snapshot posisi (simbol chart) ke file di folder |
//|   COMMON MT5; Slave membaca & mereplikasi (open/close/sinkron).    |
//|   Antar-terminal/akun di 1 PC/VPS berbagi folder COMMON, sehingga  |
//|   tidak butuh DLL / socket. Multi-slave: semua Slave baca file yg  |
//|   sama. Pemetaan posisi: comment mirror = "APO#<tiket master>".    |
//+------------------------------------------------------------------+
void OnTimer()
  {
   ApoTick();                    // riwayat transaksi tetap terkirim walau pasar sepi / tanpa tick
   if(gCopyRole == Master)
      MasterWriteFile();
   else if(gCopyRole == Slave)
     {
      SlaveCheckCommand();
      SlaveSync();
      SlaveWriteStatus();
      RelayWriteFile();          // relay: publikasikan posisi mirror ke sub-slave (bila Relay File diisi)
      UpdateDashboard();
      ChartRedraw();
     }
   else if(gCopyRole == Monitor)
     {
      MonitorScan();
      MonitorRender();
      ChartRedraw();
     }
  }

void OnTrade()
  {
   // Master: begitu ada perubahan posisi (open/close/partial), tulis ulang file
   // supaya Slave bereaksi instan (tidak menunggu tick timer berikutnya).
   if(gCopyRole == Master)
      MasterWriteFile();
   // Slave: perbarui status (profit) begitu ada perubahan posisi -> monitor cepat update.
   else if(gCopyRole == Slave)
     {
      SlaveWriteStatus();
      RelayWriteFile();          // relay: sub-slave bereaksi instan saat posisi slave berubah
     }
  }

// --- popup info saat tombol panel ditekan di mode SLAVE ---
void ShowSlaveBlockedPopup()
  {
   Print("ℹ️ Mode SLAVE: seluruh tombol panel dinonaktifkan (copy dari Master).");
   if(TimeLocal() - gSlavePopupLast < 2) return;    // throttle: maksimal 1 popup / 2 detik
   gSlavePopupLast = TimeLocal();
   if(!MQLInfoInteger(MQL_TESTER))
      MessageBox("Anda dalam mode SLAVE.\nSeluruh tombol panel dinonaktifkan.\n\n"
                 "Slave hanya mengikuti posisi Master (copy trade).",
                 "EA Apocalypto - Copy Slave", MB_OK | MB_ICONINFORMATION);
  }

// --- helper: ambil tiket master dari comment mirror "APO#<ticket>" ---
ulong ParseMasterTicket(string cmt)
  {
   int p = StringFind(cmt, "APO#");
   if(p < 0) return 0;
   return (ulong)StringToInteger(StringSubstr(cmt, p + 4));
  }

// --- helper: petakan simbol Master -> simbol Slave (buang suffix master, tambah suffix slave) ---
string MapMasterSymbolToSlave(string masterSym)
  {
   string base = masterSym;
   int ml = StringLen(InpMasterSuffix);
   if(ml > 0 && StringLen(base) > ml &&
      StringSubstr(base, StringLen(base) - ml) == InpMasterSuffix)
      base = StringSubstr(base, 0, StringLen(base) - ml);
   return base + InpSlaveSuffix;
  }

// --- helper: hitung lot Slave sesuai mode ---
double ScaleCopyLot(double masterVol, double masterBal)
  {
   double v;
   switch(InpCopyLotMode)
     {
      case LOT_MULTIPLIER:
         v = masterVol * (InpCopyLotValue > 0.0 ? InpCopyLotValue : 1.0);
         break;
      case LOT_FIXED:
         v = (InpCopyLotValue > 0.0 ? InpCopyLotValue : masterVol);
         break;
      case LOT_BALANCE_RATIO:
        {
         double sb = AccountInfoDouble(ACCOUNT_BALANCE);
         double r  = (masterBal > 0.0) ? sb / masterBal : 1.0;
         v = masterVol * r;
        }
         break;
      default: // LOT_SAME
         v = masterVol;
         break;
     }
   return NormalizeLot(v);
  }

//+------------------------------------------------------------------+
//| MASTER: tulis snapshot posisi (simbol chart) ke file COMMON       |
//|  Format:                                                          |
//|   H;login;balance;equity;hbLocal;jumlahPos;symbol                 |
//|   P;ticket;symbol;type;vol;open;sl;tp;magic;comment               |
//|  Ditulis atomik (tmp -> move) agar Slave tak membaca file separuh.|
//+------------------------------------------------------------------+
// INTI penulis file broadcast (dipakai Master & Relay-Slave).
//  outFile = nama file tujuan (COMMON). relay=true -> dipublikasikan oleh SLAVE untuk sub-slave:
//  gerbang (Start Layer/Floating-/RSI/RSI-L1) DIKOSONGKAN (0) supaya sub-slave meniru PENUH;
//  posisi yg ditulis = posisi akun ini (di simbol chart) dgn TIKET akun ini -> sub-slave memetakan
//  via tiket P-line (bukan comment), jadi tidak bentrok dgn comment "APO#<tiket master asli>".
void PublishPositionsFile(string outFile, bool relay)
  {
   if(StringLen(outFile) < 1) return;

   string tmp = outFile + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE)
     {
      Print("⚠ COPY(", (relay?"Relay":"Master"), "): gagal buka file tmp '", tmp, "' err=", GetLastError());
      return;
     }

   int cnt = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      cnt++;
     }

   long   login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   double bal   = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq    = AccountInfoDouble(ACCOUNT_EQUITY);
   long   hb    = (long)TimeLocal();

   double mFloat = MyFloatingPnL();           // floating ($) -> disiarkan utk gerbang floating hilir
   int    mBreak = IsBreakActive() ? 1 : 0;   // KODE 55? -> monitor tampil "Off"
   double mRSI   = CurrentRSIValue();         // RSI akun ini -> disiarkan utk gerbang RSI hilir
   // Relay: kosongkan gerbang supaya sub-slave meniru PENUH (sub-slave tetap bisa set gerbang sendiri di F7).
   int    hStart = relay ? 0   : gSlaveStartLayer;
   double hFMin  = relay ? 0.0 : gBcastFloatMinus;
   int    hBRSI  = relay ? 0   : gBcastRSI;
   double hL1RSI = relay ? 0.0 : gMasterL1RSI;
   FileWriteString(h, StringFormat("H;%I64d;%.2f;%.2f;%I64d;%d;%s;%d;%.2f;%.2f;%.2f;%d;%.1f;%d;%.1f\n",
                                   login, bal, eq, hb, cnt, _Symbol, hStart,
                                   mFloat, hFMin, InpCutloss, mBreak, mRSI, hBRSI, hL1RSI));

   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;

      long   type = PositionGetInteger(POSITION_TYPE);   // 0=BUY 1=SELL
      double vol  = PositionGetDouble(POSITION_VOLUME);
      double op   = PositionGetDouble(POSITION_PRICE_OPEN);
      double sl   = PositionGetDouble(POSITION_SL);
      double tp   = PositionGetDouble(POSITION_TP);
      long   mg   = PositionGetInteger(POSITION_MAGIC);
      string cm   = PositionGetString(POSITION_COMMENT);
      StringReplace(cm, ";", ",");   // lindungi pemisah CSV

      FileWriteString(h, StringFormat("P;%I64u;%s;%d;%.2f;%.*f;%.*f;%.*f;%I64d;%s\n",
                                      t, PositionGetString(POSITION_SYMBOL), (int)type, vol,
                                      _Digits, op, _Digits, sl, _Digits, tp, mg, cm));
     }
   FileClose(h);

   // Pindahkan atomik ke nama final (timpa yang lama).
   if(!FileMove(tmp, FILE_COMMON, outFile, FILE_COMMON | FILE_REWRITE))
      Print("⚠ COPY(", (relay?"Relay":"Master"), "): gagal FileMove tmp->final err=", GetLastError());
  }

void MasterWriteFile()
  {
   if(gCopyRole != Master) return;
   PublishPositionsFile(gCopyFile, false);
  }

// Relay: SLAVE mem-publikasikan posisi mirror-nya ke InpRelayFile agar bisa diikuti sub-slave.
//  Hanya aktif bila role Slave, InpRelayFile diisi, dan BERBEDA dari file master yg dibaca (anti-loop).
void RelayWriteFile()
  {
   if(gCopyRole != Slave) return;
   if(gSubSlave) return;                 // sub-slave adalah ujung rantai -> tidak me-relay lagi
   if(StringLen(InpRelayFile) < 1) return;
   if(InpRelayFile == gCopyFile)
     {
      static bool warned = false;
      if(!warned) { Print("⚠ RELAY: 'Relay File' sama dengan file master yg dibaca ('", gCopyFile, "') -> relay dilewati (anti-loop)."); warned = true; }
      return;
     }
   PublishPositionsFile(InpRelayFile, true);
  }

//+------------------------------------------------------------------+
//| SLAVE: baca file Master lalu open/close/sinkron posisi mirror     |
//+------------------------------------------------------------------+
void SlaveSync()
  {
   if(gCopyRole != Slave) return;
   if(gCopyFile == "") return;

   // KODE 44 MANDIRI: cek tiap tick, berlaku kapan saja (tidak wajib KODE 55 dulu).
   // Drop Buy Limit lot 44 -> Target Siklus & Floating Slave langsung di-set, ordernya dihapus.
   ApplyCode44();
   // KODE 33 MANDIRI: Drop Buy Limit lot 33 -> gerbang RSI slave (gOvRSI) di-set, ordernya dihapus.
   ApplyCode33();

   // KODE 55 di SLAVE: order Buy Limit lot 55 -> Slave berhenti menyalin & tutup semua mirror.
   // Master TIDAK terpengaruh (ini hanya lokal di Slave).
   if(IsBreakActive())
     {
      gSlaveBreak = true;
      for(int i = PositionsTotal()-1; i >= 0; i--)
        {
         ulong t = PositionGetTicket(i);
         if(t == 0) continue;
         if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
         if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
         copyTrade.PositionClose(t);
        }
      gCopyMirrored = 0;
      gSlaveWasMirroring = false;   // penutupan oleh KODE 55 = disengaja EA, bukan manual user
      gSlaveArmed = false;          // TUTUP gerbang: saat KODE 55 dilepas, gate WAJIB terbuka ulang
                                    // sesuai Start Layer terbaru (cegah copy padahal layer dinaikkan).
      // KODE 55 = STOP eksplisit. Lepas juga tahanan close-manual lama supaya tidak nyangkut
      // ke siklus master berikutnya (mis. master flat saat KODE 55 masih aktif). Saat KODE 55
      // dilepas, gerbang Start Layer yang menentukan kapan slave boleh copy lagi.
      if(gSlaveManualClose){ gSlaveManualClose = false; GlobalVariableDel(StateKey("sManual")); }
      return;
     }
   gSlaveBreak = false;

   int h = FileOpen(gCopyFile, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON |
                    FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) { gCopyStale = true; return; }   // file belum ada / sedang dimove

   double mBal = 0.0; long hb = 0;
   ulong  mtk[];  long mtype[];  double mvol[], mopen[], msl[], mtp[];  string msym[];
   int    np = 0;

   ushort SEP = StringGetCharacter(";", 0);

   while(!FileIsEnding(h))
     {
      string line = FileReadString(h);
      if(StringLen(line) < 3) continue;
      string f[];
      int k = StringSplit(line, SEP, f);
      if(k <= 0) continue;

      if(f[0] == "H" && k >= 6)
        {
         mBal   = StringToDouble(f[2]);
         hb     = (long)StringToInteger(f[4]);
         if(k >= 8)  gSlaveStartLayer = (int)StringToInteger(f[7]);   // WAJIB ikut Start Layer siaran master
         if(k >= 9)  gMasterFloat     = StringToDouble(f[8]);         // floating EA master ($) utk gerbang floating
         if(k >= 10) gMasterFloatMinus = StringToDouble(f[9]);        // ambang floating- siaran master (dipakai bila slave tak set lokal)
         if(k >= 13) gMasterRSI       = StringToDouble(f[12]);        // RSI master (nilai) utk gerbang RSI slave (mirror pertama)
         if(k >= 14) gBcastRSI        = (int)StringToInteger(f[13]);  // ambang RSI yang DISIARKAN master (dipakai bila slave tak set lokal)
         if(k >= 15) gMasterEntryRSI  = StringToDouble(f[14]);        // RSI master SAAT L1 dibuka -> gerbang kelayakan RSI slave
        }
      else if(f[0] == "P" && k >= 10)
        {
         string msymbol = f[2];
         if(MapMasterSymbolToSlave(msymbol) != _Symbol) continue;  // hanya simbol chart Slave ini
         int n = np;
         ArrayResize(mtk, n+1);  ArrayResize(mtype, n+1); ArrayResize(mvol, n+1);
         ArrayResize(mopen, n+1);ArrayResize(msl, n+1);   ArrayResize(mtp, n+1);
         ArrayResize(msym, n+1);
         mtk[n]   = (ulong)StringToInteger(f[1]);
         msym[n]  = msymbol;
         mtype[n] = (long)StringToInteger(f[3]);
         mvol[n]  = StringToDouble(f[4]);
         mopen[n] = StringToDouble(f[5]);
         msl[n]   = StringToDouble(f[6]);
         mtp[n]   = StringToDouble(f[7]);
         np++;
        }
     }
   FileClose(h);
   gMasterNP = np;                                  // simpan jumlah posisi master (untuk garis kanvas slave)
   // Agregat basket master (untuk garis harga pemicu copy di chart slave).
   gMasterLotSum = 0.0; gMasterEntryLotSum = 0.0; gMasterDir = 0;
   for(int i = 0; i < np; i++)
     {
      gMasterLotSum      += mvol[i];
      gMasterEntryLotSum += mopen[i] * mvol[i];
     }
   if(np > 0) gMasterDir = (int)mtype[0];           // averaging = satu arah; pakai arah posisi pertama

   // Freeze bila file Master basi (Master offline) -> jangan buka/tutup apa pun.
   gCopyStale = (InpCopyStaleSec > 0 && (TimeLocal() - hb) > InpCopyStaleSec);
   gCopyLastHbLocal = hb;
   if(gCopyStale) return;

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED)) return;

   // Kumpulkan posisi mirror milik Slave (magic slave) + tiket master dari comment.
   ulong  stk[]; ulong smaster[]; double svol[];
   int ns = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      int n = ns;
      ArrayResize(stk, n+1); ArrayResize(smaster, n+1); ArrayResize(svol, n+1);
      stk[n]     = t;
      smaster[n] = ParseMasterTicket(PositionGetString(POSITION_COMMENT));
      svol[n]    = PositionGetDouble(POSITION_VOLUME);
      ns++;
     }
   gCopyMirrored = ns;

   // --- TARGET SIKLUS SLAVE (opsional): slave punya target cuan sendiri ---
   //   gCycleTarget (Target Siklus di panel/input slave) > 0: bila floating mirror slave mencapai
   //   target, slave TUTUP mirror duluan lalu tahan sampai master flat (master TETAP jalan).
   //   = 0: ikut master (mirror hanya ditutup saat master close). Master close duluan tetap diikuti.
   if(gCopyRole == Slave && gCycleTarget > 0.0 && ns > 0 && np > 0 && !gSlaveManualClose)
     {
      double mf = SlaveMirrorFloating();
      if(mf >= gCycleTarget)
        {
         Print("🎯 SLAVE Target Siklus tercapai (floating mirror ", DoubleToString(mf,2),
               " >= ", DoubleToString(gCycleTarget,2), ") -> tutup mirror duluan, master tetap jalan.");
         if(!MQLInfoInteger(MQL_TESTER)) SendNotification("Slave: Target Siklus tercapai -> mirror ditutup (master tetap jalan).");
         SlaveManualClose();   // tutup semua mirror + tahan copy sampai master flat (siklus master berikutnya lanjut)
         return;
        }
     }

   // Founder basket dari MIRROR slave = tiket master TERKECIL yang di-mirror (identitas basket yg sedang disalin).
   ulong mirrorFounder = 0;
   for(int i = 0; i < ns; i++)
      if(smaster[i] != 0 && (mirrorFounder == 0 || smaster[i] < mirrorFounder)) mirrorFounder = smaster[i];
   // Founder basket master di FILE saat ini = tiket master TERKECIL (L1 basket berjalan).
   ulong fileFounder = 0;
   for(int i = 0; i < np; i++)
      if(mtk[i] != 0 && (fileFounder == 0 || mtk[i] < fileFounder)) fileFounder = mtk[i];

   // Reset penanda "sedang mirror" saat master flat (siklus baru).
   if(np <= 0) { gSlaveWasMirroring = false; gSlaveMFounder = 0; }

   // ROLLOVER: mirror slave sudah habis TAPI master di file adalah basket BARU (founder beda dari yang
   // tadi di-mirror). Ini terjadi bila master close (mis. cutloss) lalu langsung buka L1 baru sebelum
   // slave sempat melihat master flat. BUKAN close manual -> jangan tahan; anggap siklus baru & lanjut copy.
   if(gSlaveWasMirroring && ns == 0 && np > 0 && gSlaveMFounder != 0 && fileFounder != gSlaveMFounder)
     {
      gSlaveWasMirroring = false;
      gSlaveArmed        = false;         // re-evaluasi gerbang start-layer utk basket baru
      gSlaveMFounder     = 0;
      Print("🔄 SLAVE: master ganti basket (founder ", fileFounder, ") -> siklus baru, copy dilanjut (bukan close manual).");
     }
   // Deteksi CLOSE MANUAL eksternal (mis. dari MT5 mobile / terminal): SEMUA mirror hilang padahal
   // master MASIH memegang basket yang SAMA -> perlakukan sama seperti RESET slave (tahan sampai master flat).
   else if(!gSlaveManualClose && gSlaveWasMirroring && ns == 0 && np > 0)
     {
      gSlaveManualClose = true;
      GlobalVariableSet(StateKey("sManual"), 1.0);
      Print("🧹 SLAVE: mirror ditutup manual (mis. dari HP) saat master masih terbuka -> copy ditahan sampai master flat.");
      return;
     }
   if(ns > 0) { gSlaveWasMirroring = true; gSlaveMFounder = mirrorFounder; }   // sedang mirror basket master ini

   // CLOSE: mirror yang tiket master-nya sudah tidak ada di file.
   for(int i = 0; i < ns; i++)
     {
      bool stillThere = false;
      for(int j = 0; j < np; j++)
         if(mtk[j] == smaster[i]) { stillThere = true; break; }
      if(!stillThere || smaster[i] == 0)
        {
         if(copyTrade.PositionClose(stk[i]))
            Print("📥 COPY: tutup mirror tiket ", stk[i],
                  " (master ", smaster[i], " sudah closed).");
        }
     }

   // --- Gerbang mulai copy: slave baru BUKA mirror bila SEMUA syarat gerbang terpenuhi (per-siklus). ---
   //     Menutup mirror & sinkron volume TETAP jalan (di atas), hanya pembukaan baru yang digerbang.
   //     Dua gerbang (keduanya WAJIB/AND bila diaktifkan):
   //       (1) Start Layer  : master sudah >= N layer.
   //       (2) Floating-    : floating EA master sudah <= -X ($).
   //     Nilai 0 = gerbang itu nonaktif (dianggap terpenuhi). Gerbang MENGUNCI (latch) begitu terbuka,
   //     dan RE-ARM (tertutup lagi) hanya saat master flat -> tidak menutup di tengah basket.
   // Nilai EFEKTIF (2 konfirmasi): slave set lokal (>0) menang; else ikut siaran master.
   ComputeSlaveGate();
   if(gSubSlave)
      gSlaveArmed = (np > 0);                                  // SUB-SLAVE: tanpa gerbang -> ikut penuh selama master punya posisi
   else if(np <= 0)
      gSlaveArmed = false;                                     // master flat -> re-arm utk siklus berikutnya
   else
     {
      bool layerOk = (gEffStartLayer  <= 0)  || (np >= gEffStartLayer);
      bool floatOk = (gEffFloatMinus  <= 0.0) || (gMasterFloat <= -gEffFloatMinus);
      bool gateOk  = (layerOk && floatOk);
      // SELAMA belum ada mirror (ns==0): ikuti kondisi gerbang LIVE -> boleh terbuka DAN boleh BATAL lagi
      //   bila syarat tak lagi terpenuhi (mis. user ganti gerbang jadi lebih ketat). Mencegah latch basi.
      // SETELAH mirror pertama terbuka (ns>0): kunci (latch) supaya tak menutup di tengah basket.
      if(ns > 0)
        { if(gateOk) gSlaveArmed = true; }
      else
         gSlaveArmed = gateOk;
     }

   // RESET manual slave: setelah user menutup mendahului master, JANGAN buka mirror lagi
   // sampai master flat. Begitu master flat -> lepas tahanan, copy siklus berikutnya normal.
   if(gSlaveManualClose)
     {
      if(np <= 0) { gSlaveManualClose = false; GlobalVariableDel(StateKey("sManual")); }
      else        return;   // master masih pegang posisi -> stop, mirror tetap kosong
     }

   // GERBANG RSI (dari RSI MASTER) — hanya untuk MIRROR PERTAMA basket (belum ada mirror = ns==0).
   // Setelah mirror pertama terbuka, layer berikutnya ikut master (SOP), tidak dicek RSI lagi.
   // X = gEffRSI (milik slave InpRSI, else siaran master gBcastRSI; 0 = off).
   // DUA syarat (keduanya WAJIB) untuk mirror pertama:
   //   (1) KELAYAKAN  : level RSI slave harus LEBIH dalam dari RSI master saat L1 dibuka (gMasterEntryRSI).
   //                    BUY  -> X < RSI_L1_master ;  SELL -> (100 - X) > RSI_L1_master.
   //                    Jadi dari beberapa slave, hanya yang ambangnya melewati titik entry master yang boleh copy.
   //   (2) TRIGGER    : RSI master SAAT INI sudah mencapai level slave.
   //                    BUY  -> RSI master <= X ;  SELL -> RSI master >= 100 - X.
   // Bila gMasterEntryRSI belum tersedia (0 / master versi lama), syarat kelayakan dilewati (anggap layak).
   bool blockByRSI = false;
   if(gEffRSI > 0 && ns == 0 && np > 0 && !gSubSlave)
     {
      int    mdir   = (int)mtype[0];                          // arah basket master (averaging = satu arah)
      double level  = (mdir == 0) ? (double)gEffRSI : 100.0 - (double)gEffRSI;   // level RSI efektif slave
      bool   trigger  = (mdir == 0) ? (gMasterRSI <= level) : (gMasterRSI >= level);
      bool   eligible = true;
      if(gMasterEntryRSI > 0.0)
         eligible = (mdir == 0) ? (level < gMasterEntryRSI) : (level > gMasterEntryRSI);
      blockByRSI = !(eligible && trigger);                    // belum layak / belum ekstrem -> tunda mirror pertama
     }

   // GERBANG TARGET HARIAN SLAVE: bila profit harian slave sudah capai Target Harian ($),
   // berhenti buka mirror BARU hari ini. Mirror yang sudah ada tetap dikelola & ditutup
   // mengikuti master / Target Siklus Slave.
   bool blockByDaily = (!gSubSlave && DailyTargetReached());

   // GERBANG JAM TRADING SLAVE: di luar jam trading slave, JANGAN buka mirror PERTAMA (basket baru).
   // Bila basket sudah terlanjur di-copy (ns>0), biarkan ikut master sampai SELESAI (tidak dipotong).
   bool blockByHours = (!gSubSlave && OutsideTradingHours() && ns == 0);

   // OPEN / SINKRON: untuk tiap posisi master pastikan ada mirror-nya.
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   if(step <= 0.0) step = 0.01;

   for(int j = 0; j < np; j++)
     {
      int found = -1;
      for(int i = 0; i < ns; i++)
         if(smaster[i] == mtk[j]) { found = i; break; }

      double tgtLot = ScaleCopyLot(mvol[j], mBal);
      int    dir    = (int)mtype[j];              // 0=BUY 1=SELL

      if(found < 0)
        {
         if(!gSlaveArmed) continue;      // gerbang belum terbuka (master < N layer) -> jangan buka mirror
         if(blockByRSI)   continue;      // gerbang RSI: mirror pertama menunggu RSI master ekstrem
         if(blockByDaily) continue;      // target harian slave tercapai -> stop buka mirror baru
         if(blockByHours) continue;      // di luar jam trading slave -> tunda buka mirror pertama
         if(tgtLot <= 0.0) continue;
         // VALIDASI "MAKIN MINUS" (layer ke-2 dst): buka mirror layer baru HANYA bila harga pasar slave
         // sudah LEBIH ADVERSE dari entry mirror lot-terbesar (layer terdalam). Harga membaik -> tunda.
         // Melindungi dari menambah layer saat harga sudah memantul (efek latensi). Mirror pertama (ns==0) dilewati.
         // Aktif hanya bila gPriceValidate ON (toggle panel / F7 InpPriceValidate).
         if(ns > 0 && gPriceValidate != 0)
           {
            double refPx; int refDir;
            if(SlaveDeepestMirror(refPx, refDir))
              {
               double nowPx = (dir == 0) ? SymbolInfoDouble(_Symbol, SYMBOL_ASK)
                                         : SymbolInfoDouble(_Symbol, SYMBOL_BID);
               bool adverse = (dir == 0) ? (nowPx < refPx) : (nowPx > refPx);
               if(!adverse) continue;   // harga belum makin minus dari layer terdalam -> tunda copy layer ini
              }
           }
         string cm = "APO#" + IntegerToString((long)mtk[j]);
         double sl = 0.0;   // SL/TP tidak disalin (exit mengikuti penutupan Master)
         double tp = 0.0;
         bool ok = (dir == 0) ? copyTrade.Buy (tgtLot, _Symbol, 0.0, sl, tp, cm)
                              : copyTrade.Sell(tgtLot, _Symbol, 0.0, sl, tp, cm);
         if(ok)
            Print("📤 COPY: buka mirror ", (dir == 0 ? "BUY" : "SELL"), " ",
                  DoubleToString(tgtLot, 2), " (master ", mtk[j], ").");
         else
            Print("⚠ COPY: gagal buka mirror master ", mtk[j],
                  " err=", copyTrade.ResultRetcode(), " (", copyTrade.ResultRetcodeDescription(), ")");
        }
      else
        {
         // Sinkron volume: bila mirror KELEBIHAN, partial-close turunkan ke target.
         double cur = svol[found];
         if(cur - tgtLot >= step && tgtLot > 0.0)
            copyTrade.PositionClosePartial(stk[found], NormalizeLot(cur - tgtLot));
        }
     }
  }

//+------------------------------------------------------------------+
//| 5b. CHANNEL BALIK SLAVE + MODE MONITOR                            |
//+------------------------------------------------------------------+
// Nama dasar grup (file master tanpa ".csv"), mis. "CT1.csv" -> "CT1".
string CopyBaseName()
  {
   string b = gCopyFile;
   int p = StringFind(b, ".csv");
   if(p >= 0) b = StringSubstr(b, 0, p);
   return b;
  }

// Floating ($) posisi mirror milik Slave (magic slave saja) di simbol chart ini.
double SlaveMirrorFloating()
  {
   double f = 0.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      f += PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);
     }
   return f;
  }

// Jumlah posisi mirror milik Slave (magic slave) di simbol chart ini.
int SlaveMirrorCount()
  {
   int n = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      n++;
     }
   return n;
  }

// Harga entry mirror slave dgn LOT TERBESAR (= layer terdalam); patokan validasi "makin minus".
// Bila lot seri, ambil entry PALING ADVERSE (BUY: terendah, SELL: tertinggi). Return false bila belum ada mirror.
bool SlaveDeepestMirror(double &refPrice, int &dir)
  {
   double maxLot = -1.0; refPrice = 0.0; dir = -1;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      double lot = PositionGetDouble(POSITION_VOLUME);
      double op  = PositionGetDouble(POSITION_PRICE_OPEN);
      int    pt  = (int)PositionGetInteger(POSITION_TYPE);   // 0=BUY 1=SELL
      bool win = false;
      if(lot > maxLot + 1e-8) win = true;                    // lot lebih besar -> menang
      else if(MathAbs(lot - maxLot) <= 1e-8 && dir >= 0)     // lot seri -> ambil yg paling dalam
         win = (dir == 0) ? (op < refPrice) : (op > refPrice);
      if(win) { maxLot = lot; refPrice = op; dir = pt; }
     }
   return (dir >= 0 && refPrice > 0.0);
  }

// Tutup SEMUA posisi mirror milik Slave (magic slave) di simbol chart ini.
void CloseAllSlaveMirrors()
  {
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      copyTrade.PositionClose(t);
     }
  }

// RISIKO SLAVE SENDIRI (setup milik slave, independen dari master):
//  - CUTLOSS ($)       : floating mirror slave <= -InpCutloss  -> tutup semua mirror.
//  - TARGET HARIAN ($) : profit realisasi slave hari ini >= InpDailyTarget -> tutup mirror.
// Keduanya menahan copy (gSlaveManualClose) sampai master flat, supaya tidak langsung re-copy
// di basket master yang sama (anti open-close berulang).
void ManageSlaveRisk()
  {
   if(gCopyRole != Slave) return;
   if(SlaveMirrorCount() < 1) return;

   // CUTLOSS slave (floating mirror sendiri)
   if(InpCutloss > 0.0)
     {
      double fl = SlaveMirrorFloating();
      if(fl <= -InpCutloss)
        {
         Print("🛡️ CUTLOSS Slave tercapai (floating ", DoubleToString(fl, 2),
               " <= -", DoubleToString(InpCutloss, 2), ") -> tutup semua mirror, tahan copy sampai master flat.");
         CloseAllSlaveMirrors();
         gSlaveManualClose = true;
         GlobalVariableSet(StateKey("sManual"), 1.0);
         return;
        }
     }

   // TARGET HARIAN slave (profit realisasi slave sendiri)
   if(InpDailyTarget > 0.0 && DailyTargetReached())
     {
      Print("🎯 Target Harian Slave tercapai (realisasi ", DoubleToString(DailyRealizedProfit(), 2),
            " >= ", DoubleToString(InpDailyTarget, 2), ") -> tutup mirror & stop copy hari ini.");
      CloseAllSlaveMirrors();
      gSlaveManualClose = true;
      GlobalVariableSet(StateKey("sManual"), 1.0);
     }
  }

// Hitung gerbang EFEKTIF slave (start layer & floating-) dari siaran master + override lokal.
// Dipakai di gate SlaveSync DAN saat kirim status, supaya nilai yang dilaporkan selalu sinkron
// walau SlaveSync sempat keluar lebih awal (Algo off, tahan manual, dll).
void ComputeSlaveGate()
  {
   // Urutan menang: override panel (gOv*/gSlaveFloatOverride) -> F7 (InpX) -> siaran master.
   gEffFloatMinus = (gSlaveFloatOverride > 0.0) ? gSlaveFloatOverride
                  : ((InpFloating != 0.0) ? MathAbs(InpFloating) : gMasterFloatMinus);
   if(gSlaveStartLayer >= 55) gEffStartLayer = gSlaveStartLayer;                                  // 55-STOP master selalu menang
   else gEffStartLayer = (gOvStartLayer > 0) ? gOvStartLayer
                       : ((InpStartLayer > 0) ? InpStartLayer : gSlaveStartLayer);
   gEffRSI = (gOvRSI > 0) ? gOvRSI
           : ((InpRSI > 0) ? InpRSI : gBcastRSI);                                                 // RSI: override panel -> F7 -> siaran master
  }

// SLAVE hapus file status & command grup SAAT INI (dipanggil sebelum pindah grup) -> langsung
// hilang dari monitor grup lama, tanpa nunggu basi & tanpa file sisa.
void SlaveDeleteStatusFiles()
  {
   if(gCopyFile == "") return;
   long   login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   string b  = CopyBaseName();
   string fs = b + ".slv" + IntegerToString(login) + ".csv";
   string fc = b + ".cmd" + IntegerToString(login) + ".csv";
   if(FileIsExist(fs, FILE_COMMON)) FileDelete(fs, FILE_COMMON);
   if(FileIsExist(fc, FILE_COMMON)) FileDelete(fc, FILE_COMMON);
  }

// SLAVE menulis file status kecil ke folder Common: login;bal;eq;floating;harian;heartbeat
// Master/Monitor dgn grup sama membacanya utk menjumlahkan profit slave. (Hanya 1 VPS/Common.)
void SlaveWriteStatus()
  {
   if(gCopyRole != Slave) return;
   if(gCopyFile == "") return;

   long   login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   string fn    = CopyBaseName() + ".slv" + IntegerToString(login) + ".csv";
   string tmp   = fn + ".tmp";

   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE) return;

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   double fl  = SlaveMirrorFloating();
   double dl  = DailyRealizedProfit();
   long   hb  = (long)TimeLocal();
   string nm  = InpSlaveName;
   StringReplace(nm, ";", ",");   // lindungi pemisah CSV

   ComputeSlaveGate();            // pastikan gerbang efektif selalu sinkron dgn siaran master saat dilaporkan
   // Sertakan gerbang EFEKTIF slave ini (start layer, floating-, RSI) supaya monitor tampil per-slave.
   FileWriteString(h, StringFormat("%I64d;%.2f;%.2f;%.2f;%.2f;%I64d;%s;%d;%.2f;%d;%s;%d\n",
                                   login, bal, eq, fl, dl, hb, nm, gEffStartLayer, gEffFloatMinus,
                                   gSlaveBreak ? 1 : 0, APO_BUILD, gEffRSI));
   FileClose(h);
   FileMove(tmp, FILE_COMMON, fn, FILE_COMMON | FILE_REWRITE);
  }

// SLAVE: cek file perintah dari monitor (CopyBase.cmd<login>.csv). Jalankan sekali lalu hapus.
void SlaveCheckCommand()
  {
   if(gCopyRole != Slave) return;
   if(gCopyFile == "") return;

   long   login = (long)AccountInfoInteger(ACCOUNT_LOGIN);
   string fn = CopyBaseName() + ".cmd" + IntegerToString(login) + ".csv";
   if(!FileIsExist(fn, FILE_COMMON)) return;

   int h = FileOpen(fn, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON |
                    FILE_SHARE_READ | FILE_SHARE_WRITE);
   string cmd = "";
   if(h != INVALID_HANDLE) { cmd = FileReadString(h); FileClose(h); }
   FileDelete(fn, FILE_COMMON);           // konsumsi perintah -> jalankan sekali saja
   StringTrimLeft(cmd); StringTrimRight(cmd);

   if(cmd == "RESET")
     {
      Print("📩 SLAVE: menerima perintah RESET dari monitor.");
      SlaveManualClose();
     }
  }

// MONITOR: tulis perintah RESET utk slave tertentu (dibaca slave via SlaveCheckCommand).
void MonitorSendReset(long login)
  {
   string fn  = CopyBaseName() + ".cmd" + IntegerToString(login) + ".csv";
   string tmp = fn + ".tmp";
   int h = FileOpen(tmp, FILE_WRITE | FILE_TXT | FILE_ANSI | FILE_COMMON);
   if(h == INVALID_HANDLE) return;
   FileWriteString(h, "RESET\n");
   FileClose(h);
   FileMove(tmp, FILE_COMMON, fn, FILE_COMMON | FILE_REWRITE);
   Print("📤 MONITOR: kirim RESET ke slave ", login);
  }

// Buat tombol bila belum ada, lalu set teks/warna/posisi (dipakai berulang tiap refresh).
void MonSetButton(string n, string t, int x, int y, int w, int h, color bg, color txt)
  {
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
      ObjectSetInteger(0, n, OBJPROP_CORNER, CORNER_LEFT_UPPER);
      ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
      ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
      ObjectSetString (0, n, OBJPROP_FONT, "Consolas");
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 10);
     }
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetString (0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, txt);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
  }

// MONITOR: siapkan kanvas polos (candle/grid disembunyikan, latar navy) + header statis.
void MonitorInit()
  {
   ChartSetInteger(0, CHART_SHOW_GRID,         false);
   ChartSetInteger(0, CHART_SHOW_OHLC,         false);
   ChartSetInteger(0, CHART_SHOW_BID_LINE,     false);
   ChartSetInteger(0, CHART_SHOW_ASK_LINE,     false);
   ChartSetInteger(0, CHART_SHOW_LAST_LINE,    false);
   ChartSetInteger(0, CHART_SHOW_PERIOD_SEP,   false);
   ChartSetInteger(0, CHART_SHOW_VOLUMES,      false);
   ChartSetInteger(0, CHART_SHOW_TRADE_LEVELS, false);
   ChartSetInteger(0, CHART_MODE,              CHART_LINE);
   ChartSetInteger(0, CHART_COLOR_BACKGROUND,  clrWhite);       // latar putih
   ChartSetInteger(0, CHART_COLOR_FOREGROUND,  clrBlack);
   ChartSetInteger(0, CHART_COLOR_CHART_LINE,  clrWhite);       // garis harga menyatu ke latar (tak terlihat)
   ChartSetInteger(0, CHART_COLOR_GRID,        clrWhite);

   CreateLabel("MON_Title", "APOCALYPTO - MONITOR SLAVE", 20, 18, 12, clrDarkGoldenrod, "Trebuchet MS", ANCHOR_LEFT_UPPER);
  }

// Buat label bila belum ada, lalu set teks/warna/posisi (dipakai berulang tiap refresh).
void MonSetLabel(string n, string t, int x, int y, int s, color c, string f)
  {
   if(ObjectFind(0, n) < 0)
     {
      ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
      ObjectSetString (0, n, OBJPROP_FONT, f);
      ObjectSetInteger(0, n, OBJPROP_FONTSIZE, s);
      ObjectSetInteger(0, n, OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
     }
   ObjectSetString (0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
  }

// MONITOR: pindai file status slave grup ini secara MERGE (update per-login), bukan rebuild dari nol.
// ANTI-KEDIP: baris slave hanya dibuang bila heartbeat-nya benar-benar basi (offline), BUKAN karena
// gagal baca sesaat saat file sedang ditulis ulang slave.
void MonitorScan()
  {
   long   now  = (long)TimeLocal();
   int    staleSec = (InpCopyStaleSec > 0 ? InpCopyStaleSec : 30);
   string mask = CopyBaseName() + ".slv*.csv";
   string fname = "";

   long sh = FileFindFirst(mask, fname, FILE_COMMON);
   if(sh != INVALID_HANDLE)
     {
      do
        {
         int h = FileOpen(fname, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON |
                          FILE_SHARE_READ | FILE_SHARE_WRITE);
         if(h == INVALID_HANDLE) continue;              // gagal baca sesaat -> pertahankan entri lama
         string line = FileReadString(h);
         FileClose(h);
         if(StringLen(line) < 5) continue;

         string f[];
         int k = StringSplit(line, StringGetCharacter(";", 0), f);
         if(k < 6) continue;
         long hb = (long)StringToInteger(f[5]);
         if(now - hb > staleSec) continue;              // basi -> jangan tambahkan (dibuang di bawah bila sudah ada)

         long login = (long)StringToInteger(f[0]);
         int  idx = -1;
         for(int i = 0; i < gMonCount; i++) if(gMonLogin[i] == login) { idx = i; break; }
         if(idx < 0)                                    // slave baru -> tambah slot
           {
            idx = gMonCount;
            ArrayResize(gMonLogin, idx+1); ArrayResize(gMonFloat, idx+1); ArrayResize(gMonDaily, idx+1);
            ArrayResize(gMonEquity, idx+1); ArrayResize(gMonName, idx+1); ArrayResize(gMonGateL, idx+1);
            ArrayResize(gMonGateF, idx+1); ArrayResize(gMonGateR, idx+1); ArrayResize(gMonBreak, idx+1); ArrayResize(gMonBuild, idx+1);
            ArrayResize(gMonHb, idx+1);
            gMonLogin[idx] = login;
            gMonCount++;
           }
         gMonEquity[idx] = StringToDouble(f[2]);
         gMonFloat[idx]  = StringToDouble(f[3]);
         gMonDaily[idx]  = StringToDouble(f[4]);
         gMonHb[idx]     = hb;
         gMonName[idx]   = (k >= 7 ? f[6] : "");
         gMonGateL[idx]  = (k >= 8 ? (int)StringToInteger(f[7]) : -1);
         gMonGateF[idx]  = (k >= 9 ? StringToDouble(f[8])       : 0.0);
         gMonBreak[idx]  = (k >= 10 ? (int)StringToInteger(f[9]) : 0);
         gMonBuild[idx]  = (k >= 11 ? f[10] : "?");
         gMonGateR[idx]  = (k >= 12 ? (int)StringToInteger(f[11]) : 0);
        }
      while(FileFindNext(sh, fname));
      FileFindClose(sh);
     }

   // Buang entri yang heartbeat-nya sudah basi (slave benar-benar offline / pindah grup).
   for(int i = gMonCount - 1; i >= 0; i--)
     {
      if(now - gMonHb[i] <= staleSec) continue;
      for(int j = i; j < gMonCount - 1; j++)
        {
         gMonLogin[j]=gMonLogin[j+1];   gMonFloat[j]=gMonFloat[j+1];   gMonDaily[j]=gMonDaily[j+1];
         gMonEquity[j]=gMonEquity[j+1]; gMonName[j]=gMonName[j+1];     gMonGateL[j]=gMonGateL[j+1];
         gMonGateF[j]=gMonGateF[j+1];   gMonGateR[j]=gMonGateR[j+1];   gMonBreak[j]=gMonBreak[j+1];   gMonBuild[j]=gMonBuild[j+1];
         gMonHb[j]=gMonHb[j+1];
        }
      gMonCount--;
      ArrayResize(gMonLogin, gMonCount); ArrayResize(gMonFloat, gMonCount); ArrayResize(gMonDaily, gMonCount);
      ArrayResize(gMonEquity, gMonCount); ArrayResize(gMonName, gMonCount); ArrayResize(gMonGateL, gMonCount);
      ArrayResize(gMonGateF, gMonCount); ArrayResize(gMonGateR, gMonCount); ArrayResize(gMonBreak, gMonCount); ArrayResize(gMonBuild, gMonCount);
      ArrayResize(gMonHb, gMonCount);
     }

   MonitorSort();   // urutkan berdasarkan Nama supaya tampil rapi (Slave 1, Slave 2, ...)
  }

// Kunci urut "natural": rangkaian angka dipad 6 digit agar 1,2,...,10 urut benar (bukan 1,10,2).
string NatKey(string s)
  {
   string out = "", num = "";
   int n = StringLen(s);
   for(int i = 0; i < n; i++)
     {
      ushort c = StringGetCharacter(s, i);
      if(c >= '0' && c <= '9') num += ShortToString(c);
      else
        {
         if(StringLen(num) > 0) { while(StringLen(num) < 6) num = "0" + num; out += num; num = ""; }
         out += ShortToString(c);
        }
     }
   if(StringLen(num) > 0) { while(StringLen(num) < 6) num = "0" + num; out += num; }
   return out;
  }

// MONITOR: urutkan semua data slave berdasarkan Nama (A->Z; nama kosong pakai login sbg pembanding).
void MonitorSort()
  {
   for(int a = 0; a < gMonCount - 1; a++)
      for(int b = 0; b < gMonCount - 1 - a; b++)
        {
         string na = (StringLen(gMonName[b])   > 0) ? gMonName[b]   : IntegerToString(gMonLogin[b]);
         string nb = (StringLen(gMonName[b+1]) > 0) ? gMonName[b+1] : IntegerToString(gMonLogin[b+1]);
         if(StringCompare(NatKey(na), NatKey(nb)) > 0)
           {
            long   tl  = gMonLogin[b];  gMonLogin[b]  = gMonLogin[b+1];  gMonLogin[b+1]  = tl;
            double tf  = gMonFloat[b];  gMonFloat[b]  = gMonFloat[b+1];  gMonFloat[b+1]  = tf;
            double td  = gMonDaily[b];  gMonDaily[b]  = gMonDaily[b+1];  gMonDaily[b+1]  = td;
            double te  = gMonEquity[b]; gMonEquity[b] = gMonEquity[b+1]; gMonEquity[b+1] = te;
            string ts  = gMonName[b];   gMonName[b]   = gMonName[b+1];   gMonName[b+1]   = ts;
            int    tg  = gMonGateL[b];  gMonGateL[b]  = gMonGateL[b+1];  gMonGateL[b+1]  = tg;
            double tgf = gMonGateF[b];  gMonGateF[b]  = gMonGateF[b+1];  gMonGateF[b+1]  = tgf;
            int    tgr = gMonGateR[b];  gMonGateR[b]  = gMonGateR[b+1];  gMonGateR[b+1]  = tgr;
            int    tbk = gMonBreak[b];  gMonBreak[b]  = gMonBreak[b+1];  gMonBreak[b+1]  = tbk;
            string tbd = gMonBuild[b];  gMonBuild[b]  = gMonBuild[b+1];  gMonBuild[b+1]  = tbd;
            long   thb = gMonHb[b];     gMonHb[b]     = gMonHb[b+1];     gMonHb[b+1]     = thb;
           }
        }
  }

// MONITOR: baca ringkasan MASTER dari file snapshot (header) grup ini.
void MonitorReadMaster()
  {
   if(gCopyFile == "") { gMonMOnline = false; return; }

   // ANTI-KEDIP: bila baca gagal sesaat (file master sedang ditulis ulang), PERTAHANKAN nilai terakhir
   // -> jangan blank ke Offline/"-". Offline hanya bila heartbeat benar-benar basi.
   int h = FileOpen(gCopyFile, FILE_READ | FILE_TXT | FILE_ANSI | FILE_COMMON |
                    FILE_SHARE_READ | FILE_SHARE_WRITE);
   if(h == INVALID_HANDLE) return;
   string line = FileReadString(h);
   FileClose(h);
   if(StringLen(line) < 3) return;

   string f[];
   int k = StringSplit(line, StringGetCharacter(";", 0), f);
   if(k < 6 || f[0] != "H") return;

   long hb = (long)StringToInteger(f[4]);
   int  staleSec = (InpCopyStaleSec > 0 ? InpCopyStaleSec : 30);
   gMonMOnline = ((long)TimeLocal() - hb <= staleSec);   // offline hanya bila heartbeat basi

   gMonMLayer  = (int)StringToInteger(f[5]);
   if(k >= 8)  gMonMStartL = (int)StringToInteger(f[7]);
   if(k >= 9)  gMonMFloat  = StringToDouble(f[8]);
   if(k >= 10) gMonMFMinus = StringToDouble(f[9]);
   if(k >= 11) gMonMCut    = StringToDouble(f[10]);
   if(k >= 12) gMonMBreak  = (int)StringToInteger(f[11]);
   if(k >= 13) gMonMRSInow = StringToDouble(f[12]);         // RSI master SAAT INI (live)
   if(k >= 14) gMonMRSI    = (int)StringToInteger(f[13]);   // ambang RSI yang disiarkan master
  }

// MONITOR: gambar tabel per-slave + baris TOTAL di kanvas polos.
void MonitorRender()
  {
   int colName = 20, colLogin = 150, colGate = 290, colFloat = 490, colDaily = 600, colEquity = 710, colBtn = 830;
   int yTop = 158;
   int hCh  = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   // Tinggi baris & font MENYESUAIKAN jumlah slave + tinggi chart -> berapa pun slave muat 1 layar.
   int nSlaveRows = (gMonCount < 1) ? 1 : gMonCount;
   int availRows = hCh - (yTop + 26) - 64;        // ruang utk header + baris TOTAL
   int rowH = (availRows > 0) ? (availRows / nSlaveRows) : 24;
   if(rowH > 24) rowH = 24;
   if(rowH < 11) rowH = 11;                        // lantai: bila slave sangat banyak, baris dipadatkan
   int fRow = (rowH >= 22) ? 11 : (rowH >= 18 ? 10 : (rowH >= 15 ? 9 : (rowH >= 12 ? 8 : 7)));
   int btnH = rowH - 3; if(btnH > 18) btnH = 18; if(btnH < 11) btnH = 11;
   int labX = 20, valX = 170;   // blok judul master: label kiri, nilai kanan

   // --- Blok judul MASTER (Group, Status, Entry, Floating, Gate, Cutloss) ---
   MonitorReadMaster();

   MonSetLabel("MON_MGroupL",  "Master Group",   labX, 40, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_MGroupV",  ": " + CopyBaseName(), valX, 40, 11, clrBlack, "Consolas");

   string statTxt; color statCol;
   if(!gMonMOnline)          { statTxt = ": Offline";        statCol = clrGray; }
   else if(gMonMBreak == 1)  { statTxt = ": Off (KODE 55)";  statCol = clrChocolate; }
   else                      { statTxt = ": Online";         statCol = clrGreen; }
   MonSetLabel("MON_MStatL",   "Master Status",  labX, 56, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_MStatV",   statTxt, valX, 56, 9, statCol, "Consolas");

   MonSetLabel("MON_MFloatL",  "Master Floating",labX, 72, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_MFloatV",  gMonMOnline ? (": " + DoubleToString(gMonMFloat, 2)) : ": -",
               valX, 72, 9, (gMonMOnline && gMonMFloat < 0) ? clrRed : (gMonMOnline ? clrGreen : clrGray), "Consolas");

   string mgate = "";
   if(gMonMStartL >= 55)    mgate = "STOP";
   else
     {
      if(gMonMStartL > 0)   mgate += (mgate == "" ? "" : " / ") + "L" + IntegerToString(gMonMStartL);
      if(gMonMFMinus > 0.0) mgate += (mgate == "" ? "" : " / ") + "F$" + DoubleToString(gMonMFMinus, 0);
      if(gMonMRSI > 0)      mgate += (mgate == "" ? "" : " / ") + "R" + IntegerToString(gMonMRSI);
     }
   if(mgate == "")          mgate = "L1";
   MonSetLabel("MON_MGateL",   "Master Gate",    labX, 88, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_MGateV",   gMonMOnline ? (": " + mgate) : ": -", valX, 88, 11, clrBlack, "Consolas");

   MonSetLabel("MON_MCutL",    "Master Cutloss", labX, 104, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_MCutV",    (gMonMCut > 0.0) ? (": " + DoubleToString(gMonMCut, 2)) : ": No Cutloss",
               valX, 104, 11, clrBlack, "Consolas");

   // Tombol RESET MASTER (di bawah Master Cutloss): tutup semua posisi di SEMUA slave (langsung eksekusi).
   MonSetButton("MON_ResetAll", "RESET ALL SLAVE", labX, 126, 165, 24, clrFireBrick, clrWhite);

   MonSetLabel("MON_HN", "NAMA",     colName,   yTop, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_H0", "LOGIN",    colLogin,  yTop, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_HG", "GATE (gerbang|master)", colGate, yTop, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_H1", "FLOATING", colFloat,  yTop, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_H2", "HARIAN",   colDaily,  yTop, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_H3", "EQUITY",   colEquity, yTop, 11, clrDarkGoldenrod, "Consolas");

   double tFloat = 0, tDaily = 0, tEquity = 0;
   int nShow = gMonCount;                          // tampilkan SEMUA slave (auto-fit via rowH/font)
   int y = yTop + rowH + 4;
   for(int i = 0; i < nShow; i++)
     {
      string si = IntegerToString(i);
      color cf = (gMonFloat[i] >= 0) ? clrGreen : clrRed;
      color cd = (gMonDaily[i] >= 0) ? clrTeal  : clrRed;
      string nm = (StringLen(gMonName[i]) > 0) ? gMonName[i] : "-";
      // Teks gerbang efektif slave ini
      string gt; color cg = clrBlack;
      if(gMonBreak[i] == 1) { gt = "Off"; cg = clrGray; } // slave sedang KODE 55 (istirahat)
      else if(gMonGateL[i] < 0) gt = "-";                  // slave versi lama (tak kirim gerbang)
      else
        {
         string pg = "";
         if(gMonGateL[i] >= 55)     { pg = "STOP"; cg = clrRed; }
         else
           {
            // Format "GERBANG | LIVE MASTER" tiap gerbang AKTIF, gabung dgn " / ".
            //   Layer : L<gate>|L<layer master sekarang>  -> saat sama (mis. L5|L5) slave siap open.
            //   Float : F$<gate>|<floating master sekarang ($)>
            //   RSI   : R<gate>|<RSI master sekarang>
            if(gMonGateL[i] > 0)    pg += (pg == "" ? "" : " / ") + "L"  + IntegerToString(gMonGateL[i]) + "|L" + IntegerToString(gMonMLayer);
            if(gMonGateF[i] > 0.0)  pg += (pg == "" ? "" : " / ") + "F$" + DoubleToString(gMonGateF[i], 0) + "|" + DoubleToString(gMonMFloat, 0);
            if(gMonGateR[i] > 0)    pg += (pg == "" ? "" : " / ") + "R"  + IntegerToString(gMonGateR[i]) + "|" + DoubleToString(gMonMRSInow, 0);
           }
         if(pg == "") pg = "L1";                           // tanpa gerbang -> copy dari L1
         gt = pg;
        }
      MonSetLabel("MON_r"+si+"_n", nm,                             colName,   y, fRow, clrBlack, "Consolas");
      MonSetLabel("MON_r"+si+"_0", IntegerToString(gMonLogin[i]),   colLogin,  y, fRow, clrBlack, "Consolas");
      MonSetLabel("MON_r"+si+"_g", gt,                             colGate,   y, fRow, cg,       "Consolas");
      MonSetLabel("MON_r"+si+"_1", DoubleToString(gMonFloat[i],2),  colFloat,  y, fRow, cf,       "Consolas");
      MonSetLabel("MON_r"+si+"_2", DoubleToString(gMonDaily[i],2),  colDaily,  y, fRow, cd,       "Consolas");
      MonSetLabel("MON_r"+si+"_3", DoubleToString(gMonEquity[i],2), colEquity, y, fRow, clrBlack, "Consolas");
      MonSetButton("MON_r"+si+"_rst", "RESET", colBtn, y-2, 74, btnH, clrDimGray, clrWhite);
      tFloat += gMonFloat[i]; tDaily += gMonDaily[i]; tEquity += gMonEquity[i];
      y += rowH;
     }

   // Hapus baris sisa bila jumlah slave berkurang dibanding refresh sebelumnya.
   for(int i = nShow; i < gMonRowsDrawn; i++)
     {
      string si = IntegerToString(i);
      ObjectDelete(0, "MON_r"+si+"_n"); ObjectDelete(0, "MON_r"+si+"_g");
      ObjectDelete(0, "MON_r"+si+"_0"); ObjectDelete(0, "MON_r"+si+"_1");
      ObjectDelete(0, "MON_r"+si+"_2"); ObjectDelete(0, "MON_r"+si+"_3");
      ObjectDelete(0, "MON_r"+si+"_rst");
     }
   gMonRowsDrawn = nShow;

   y += 8;
   color ctf = (tFloat >= 0) ? clrGreen : clrRed;
   color ctd = (tDaily >= 0) ? clrTeal  : clrRed;
   MonSetLabel("MON_T0", "TOTAL (" + IntegerToString(gMonCount) + " slave)", colName, y, 11, clrDarkGoldenrod, "Consolas");
   MonSetLabel("MON_T1", DoubleToString(tFloat,2),  colFloat,  y, 11, ctf,     "Consolas");
   MonSetLabel("MON_T2", DoubleToString(tDaily,2),  colDaily,  y, 11, ctd,     "Consolas");
   MonSetLabel("MON_T3", DoubleToString(tEquity,2), colEquity, y, 11, clrDarkGoldenrod, "Consolas");

   if(gMonCount == 0)
      MonSetLabel("MON_empty", "Belum ada slave aktif terdeteksi (grup " + CopyBaseName() + ").",
                  colName, y + rowH + 6, 11, clrGray, "Consolas");
   else
      ObjectDelete(0, "MON_empty");
  }

//+------------------------------------------------------------------+
//| 6. FUNGSI PANEL DASHBOARD                                         |
//+------------------------------------------------------------------+
void CreateDashboard()
  {
   ObjectCreate(0, "DB_Panel", OBJ_RECTANGLE_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_Panel", OBJPROP_XDISTANCE, 20);
   ObjectSetInteger(0, "DB_Panel", OBJPROP_YDISTANCE, 20);
   ObjectSetInteger(0, "DB_Panel", OBJPROP_XSIZE, 280);
   ObjectSetInteger(0, "DB_Panel", OBJPROP_YSIZE, 388);
   ObjectSetInteger(0, "DB_Panel", OBJPROP_BGCOLOR, clrWhiteSmoke);
   ObjectSetInteger(0, "DB_Panel", OBJPROP_COLOR, clrSilver);

   CreateLabel("DB_Bismillah", "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ", 170, 25, 18, clrDarkGoldenrod, "Arial", ANCHOR_UPPER);
   CreateLabel("DB_Title", "APOCALYPTO", 170, 65, 9, clrBlack, "Trebuchet MS", ANCHOR_UPPER);
   CreateLabel("DB_Line", "-------------------------------------------", 170, 80, 10, clrGray, "Arial", ANCHOR_UPPER);

   string lbl[4] = {"Lisensi Akun","Masa Expired","Jam Server","Jam Trading"};
   for(int i=0;i<4;i++)
     {
      int y = 100 + i*20;
      CreateLabel("DB_Info_L"+IntegerToString(i), lbl[i], 30, y, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
      CreateLabel("DB_Info_C"+IntegerToString(i), ":",    150, y, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
      CreateLabel("DB_Val"+IntegerToString(i),    "-",    160, y, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
     }

   CreateLabel("DB_Info_LCyc", "Target Siklus", 30, 188, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnCycMinus", "-", 156, 185, 20, 20, clrDimGray, clrWhite);
   CreateEdit ("DB_EditCycle", DoubleToString(gCycleTarget, 2), 182, 186, 74, 18);
   CreateButton("DB_BtnCycPlus",  "+", 260, 185, 20, 20, clrTeal,    clrWhite);

   CreateLabel("DB_Info_LVL", "Virtual Layer", 30, 210, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnVLMinus", "-", 156, 207, 20, 20, clrDimGray, clrWhite);
   CreateEdit ("DB_EditVLayer", IntegerToString(gVirtualEntryLayer), 182, 208, 74, 18);
   CreateButton("DB_BtnVLPlus",  "+", 260, 207, 20, 20, clrTeal,    clrWhite);

   // Baris Jarak Aktif Lantai (poin) - hanya MASTER. Seberapa jauh harga harus lewat TP Tier utk meng-ARM lantai.
   CreateLabel("DB_Info_LFlr", "Jarak Lantai", 30, 232, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnFlrMinus", "-", 156, 229, 20, 20, clrDimGray, clrWhite);
   CreateEdit ("DB_EditFloor", DoubleToString(gFloorArmPts, 0), 182, 230, 74, 18);
   CreateButton("DB_BtnFlrPlus",  "+", 260, 229, 20, 20, clrTeal,    clrWhite);

   // Baris "RSI" - master: broadcast ke slave; slave: override panel. Tersembunyi awalnya (LayoutPanel atur).
   CreateLabel ("DB_Info_LBRSI", "RSI", 30, 254, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnBRSIMinus", "-", 156, 252, 20, 20, clrDimGray, clrWhite);
   CreateEdit  ("DB_EditBRSI", IntegerToString(gBcastRSI), 182, 253, 74, 18);
   CreateButton("DB_BtnBRSIPlus",  "+", 260, 252, 20, 20, clrTeal,    clrWhite);
   ObjectSetInteger(0, "DB_Info_LBRSI",   OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnBRSIMinus", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_EditBRSI",     OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnBRSIPlus",  OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);

   // Baris "Start Layer" - master: broadcast; slave: override panel. Tersembunyi awalnya (LayoutPanel atur).
   CreateLabel ("DB_Info_LBSL", "Start Layer", 30, 276, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnBSLMinus", "-", 156, 274, 20, 20, clrDimGray, clrWhite);
   CreateEdit  ("DB_EditBSL", IntegerToString(gSlaveStartLayer), 182, 275, 74, 18);
   CreateButton("DB_BtnBSLPlus",  "+", 260, 274, 20, 20, clrTeal,    clrWhite);
   ObjectSetInteger(0, "DB_Info_LBSL",   OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnBSLMinus", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_EditBSL",     OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnBSLPlus",  OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);

   // Baris "Floating ($)" - master: broadcast; slave: override gerbang floating. Tersembunyi awalnya.
   CreateLabel ("DB_Info_LFloat", "Floating ($)", 30, 298, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnFloatMinus", "-", 156, 296, 20, 20, clrDimGray, clrWhite);
   CreateEdit  ("DB_EditFloat", DoubleToString(gBcastFloatMinus, 2), 182, 297, 74, 18);
   CreateButton("DB_BtnFloatPlus",  "+", 260, 296, 20, 20, clrTeal,    clrWhite);
   ObjectSetInteger(0, "DB_Info_LFloat",   OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnFloatMinus", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_EditFloat",     OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnFloatPlus",  OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);

   // Baris "Validasi CT" (slave) - label + tombol toggle Active/Non Active. Tersembunyi awalnya (LayoutPanel atur).
   CreateLabel ("DB_Info_LPV", "Validasi CT", 30, 320, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnPV", "Non Active", 156, 318, 124, 20, clrGainsboro, clrGray);
   ObjectSetInteger(0, "DB_Info_LPV", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnPV",    OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);

   // Baris "CL By RSI" (master) - label + tombol toggle On/Off (sejajar bar lain). Tersembunyi awalnya (LayoutPanel atur).
   CreateLabel ("DB_Info_LCLR", "Cutloss RSI", 30, 320, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnCLR", "Off", 156, 318, 124, 20, clrGainsboro, clrGray);
   ObjectSetInteger(0, "DB_Info_LCLR", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnCLR",    OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);

   // Baris pemilih master (slave multi-master) - dibuat tersembunyi, muncul hanya saat mode slave multi-master.
   CreateLabel ("DB_Info_LMas", "Master File", 30, 276, 9, clrBlack, "Courier New", ANCHOR_LEFT_UPPER);
   CreateButton("DB_BtnMasterHdr", "CT1  v", 140, 274, 140, 20, clrDarkSlateGray, clrWhite);
   ObjectSetInteger(0, "DB_Info_LMas",    OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);

   CreateLabel("DB_Line2", "-------------------------------------------", 170, 302, 10, clrGray, "Arial", ANCHOR_UPPER);
   CreateLabel("DB_Status", "[ STANDBY ]", 170, 314, 10, clrDarkCyan, "Arial", ANCHOR_UPPER);

   // Panel 2x2: [Hold Marti | Tier 3] baris atas, [Hold TP | RESET] baris bawah.
   CreateButton("DB_BtnHoldMarti", "Hold Marti", 30, 338, 125, 26, clrGainsboro, clrGray);
   CreateButton("DB_BtnTier3",     "Tier 3",    160, 338, 125, 26, clrGainsboro, clrGray);
   CreateButton("DB_BtnHoldTP",    "Hold TP",    30, 368, 125, 26, clrGainsboro, clrGray);
   CreateButton("DB_BtnReset",     "RESET",     160, 368, 125, 26, clrDimGray,   clrWhite);

   // Opsi dropdown pilih master (slave multi-master) - LIST vertikal ke bawah. Tersembunyi awalnya.
   int msMax  = (InpMasterSlotMax < 1 ? 1 : (InpMasterSlotMax > 10 ? 10 : InpMasterSlotMax));
   for(int k = 1; k <= msMax; k++)
     {
      CreateButton("DB_MasSel"+IntegerToString(k), "CT"+IntegerToString(k),
                   140, 296 + (k-1)*22, 140, 20, MasterSlotColor(k), clrWhite);
      ObjectSetInteger(0, "DB_MasSel"+IntegerToString(k), OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
     }

   // Objek kanvas dibuat untuk SEMUA mode (slave menampilkan RSI + Jarak & Lot).
     {
   // === Info KANVAS (di luar panel): gaya panel  =  "LABEL : nilai" (titik dua sejajar via padding) ===
   ObjectCreate (0, "DB_RSIVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_YDISTANCE, 45);
   ObjectSetString (0, "DB_RSIVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_RSIVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_RSIVal", OBJPROP_TEXT, "-");
   ObjectCreate (0, "DB_SARVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_YDISTANCE, 66);
   ObjectSetString (0, "DB_SARVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_SARVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_SARVal", OBJPROP_TEXT, "-");
   ObjectCreate (0, "DB_ModeVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_YDISTANCE, 87);
   ObjectSetString (0, "DB_ModeVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_ModeVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_ModeVal", OBJPROP_TEXT, "-");
   ObjectCreate (0, "DB_BEPVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_YDISTANCE, 108);
   ObjectSetString (0, "DB_BEPVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_BEPVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_BEPVal", OBJPROP_TEXT, "-");
   ObjectCreate (0, "DB_VirVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_YDISTANCE, 129);
   ObjectSetString (0, "DB_VirVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_VirVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_VirVal", OBJPROP_TEXT, "-");
   ObjectCreate (0, "DB_JLVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_YDISTANCE, 150);
   ObjectSetString (0, "DB_JLVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_JLVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_JLVal", OBJPROP_TEXT, "-");
   ObjectCreate (0, "DB_PnLVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_YDISTANCE, 171);
   ObjectSetString (0, "DB_PnLVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_PnLVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_PnLVal", OBJPROP_TEXT, "-");
   ObjectCreate (0, "DB_DailyVal", OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_CORNER, CORNER_RIGHT_UPPER);
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_ANCHOR, ANCHOR_LEFT_UPPER);
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_XDISTANCE, 340);
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_YDISTANCE, 192);
   ObjectSetString (0, "DB_DailyVal", OBJPROP_FONT, "Lucida Console");
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_FONTSIZE, 10);
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, "DB_DailyVal", OBJPROP_HIDDEN, true);
   ObjectSetString (0, "DB_DailyVal", OBJPROP_TEXT, "-");
     }
  }

void CreateButton(string n, string t, int x, int y, int w, int h, color bg, color txt)
  {
   ObjectCreate(0, n, OBJ_BUTTON, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString(0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, bg);
   ObjectSetInteger(0, n, OBJPROP_COLOR, txt);
   ObjectSetString(0, n, OBJPROP_FONT, "Trebuchet MS");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, n, OBJPROP_STATE, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
  }

void CreateEdit(string n, string t, int x, int y, int w, int h)
  {
   ObjectCreate(0, n, OBJ_EDIT, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetInteger(0, n, OBJPROP_XSIZE, w);
   ObjectSetInteger(0, n, OBJPROP_YSIZE, h);
   ObjectSetString (0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_BGCOLOR, clrWhite);
   ObjectSetInteger(0, n, OBJPROP_COLOR, clrBlack);
   ObjectSetInteger(0, n, OBJPROP_BORDER_COLOR, clrSilver);
   ObjectSetString (0, n, OBJPROP_FONT, "Courier New");
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, 9);
   ObjectSetInteger(0, n, OBJPROP_ALIGN, ALIGN_LEFT);
   ObjectSetInteger(0, n, OBJPROP_READONLY, false);
   ObjectSetInteger(0, n, OBJPROP_SELECTABLE, false);
   ObjectSetInteger(0, n, OBJPROP_HIDDEN, true);
   ObjectSetInteger(0, n, OBJPROP_ZORDER, 10);
  }

// ================= LAYOUT PANEL ADAPTIF =================
// Bar override (label + tombol -/+ + kotak edit) muncul HANYA bila input F7-nya != 0.
// Bar yang tampil + garis status + tombol MERAPAT ke atas (tanpa celah). Master & Slave.
// Nilai aslinya tetap bisa di-override user lewat panel. Dipanggil tiap tick (di akhir UpdateDashboard).
void LayoutPanel()
  {
   if(gCopyRole == Monitor) return;
   const int BY0 = 185, STEP = 22;
   bool isSlave  = (gCopyRole == Slave);

   // Sembunyikan dulu SEMUA objek bar override; yang aktif ditampilkan ulang di bawah.
   string hideAll[28] = {
      "DB_Info_LCyc","DB_BtnCycMinus","DB_EditCycle","DB_BtnCycPlus",
      "DB_Info_LVL","DB_BtnVLMinus","DB_EditVLayer","DB_BtnVLPlus",
      "DB_Info_LFlr","DB_BtnFlrMinus","DB_EditFloor","DB_BtnFlrPlus",
      "DB_Info_LBRSI","DB_BtnBRSIMinus","DB_EditBRSI","DB_BtnBRSIPlus",
      "DB_Info_LBSL","DB_BtnBSLMinus","DB_EditBSL","DB_BtnBSLPlus",
      "DB_Info_LFloat","DB_BtnFloatMinus","DB_EditFloat","DB_BtnFloatPlus" };
   for(int i=0;i<24;i++) ObjectSetInteger(0, hideAll[i], OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_Info_LPV", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);   // baris Validasi CT - disembunyikan dulu
   ObjectSetInteger(0, "DB_BtnPV",    OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);
   ObjectSetInteger(0, "DB_Info_LCLR", OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);  // baris CL By RSI - disembunyikan dulu
   ObjectSetInteger(0, "DB_BtnCLR",   OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);

   // Susun daftar bar AKTIF (input F7 != 0) — berlaku utk MASTER & SLAVE (peran menentukan arti nilainya).
   string L[7], Mn[7], Ed[7], Pl[7];
   int nb = 0;
   if(InpCycleTarget != 0.0)
     { L[nb]="DB_Info_LCyc"; Mn[nb]="DB_BtnCycMinus"; Ed[nb]="DB_EditCycle"; Pl[nb]="DB_BtnCycPlus"; nb++; }
   if(InpStartLayer != 0)
     { L[nb]="DB_Info_LBSL"; Mn[nb]="DB_BtnBSLMinus"; Ed[nb]="DB_EditBSL"; Pl[nb]="DB_BtnBSLPlus"; nb++; }
   if(InpFloating != 0.0)
     { L[nb]="DB_Info_LFloat"; Mn[nb]="DB_BtnFloatMinus"; Ed[nb]="DB_EditFloat"; Pl[nb]="DB_BtnFloatPlus"; nb++; }
   if(InpRSI != 0)
     { L[nb]="DB_Info_LBRSI"; Mn[nb]="DB_BtnBRSIMinus"; Ed[nb]="DB_EditBRSI"; Pl[nb]="DB_BtnBRSIPlus"; nb++; }
   if(InpVirtualEntryLayer != 0)
     { L[nb]="DB_Info_LVL"; Mn[nb]="DB_BtnVLMinus"; Ed[nb]="DB_EditVLayer"; Pl[nb]="DB_BtnVLPlus"; nb++; }
   if(InpFloorArmPts != 0)
     { L[nb]="DB_Info_LFlr"; Mn[nb]="DB_BtnFlrMinus"; Ed[nb]="DB_EditFloor"; Pl[nb]="DB_BtnFlrPlus"; nb++; }

   // Tempatkan bar aktif merapat dari BY0.
   for(int i=0;i<nb;i++)
     {
      int BY = BY0 + i*STEP;
      ObjectSetInteger(0, L[i],  OBJPROP_XDISTANCE, 30);  ObjectSetInteger(0, L[i],  OBJPROP_YDISTANCE, BY+3);
      ObjectSetInteger(0, Mn[i], OBJPROP_XDISTANCE, 156); ObjectSetInteger(0, Mn[i], OBJPROP_YDISTANCE, BY);
      ObjectSetInteger(0, Ed[i], OBJPROP_XDISTANCE, 182); ObjectSetInteger(0, Ed[i], OBJPROP_YDISTANCE, BY+1);
      ObjectSetInteger(0, Pl[i], OBJPROP_XDISTANCE, 260); ObjectSetInteger(0, Pl[i], OBJPROP_YDISTANCE, BY);
      ObjectSetInteger(0, L[i],  OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      ObjectSetInteger(0, Mn[i], OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      ObjectSetInteger(0, Ed[i], OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      ObjectSetInteger(0, Pl[i], OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
     }
   int rows = nb;

   // Baris "Validasi CT" (label + tombol toggle) -> slot sendiri (muncul bila F7 InpPriceValidate != 0).
   if(InpPriceValidate != 0)
     {
      int BY = BY0 + rows*STEP;
      ObjectSetInteger(0, "DB_Info_LPV", OBJPROP_XDISTANCE, 30);  ObjectSetInteger(0, "DB_Info_LPV", OBJPROP_YDISTANCE, BY+3);
      ObjectSetInteger(0, "DB_BtnPV",    OBJPROP_XDISTANCE, 156); ObjectSetInteger(0, "DB_BtnPV",    OBJPROP_YDISTANCE, BY);
      ObjectSetInteger(0, "DB_Info_LPV", OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      ObjectSetInteger(0, "DB_BtnPV",    OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      rows++;
     }

   // Baris "CL By RSI" (master) -> tombol toggle sendiri (muncul bila F7 InpCutlossByRSI != 0).
   if(InpCutlossByRSI != 0 && gCopyRole == Master)
     {
      int BY = BY0 + rows*STEP;
      ObjectSetInteger(0, "DB_Info_LCLR", OBJPROP_XDISTANCE, 30);  ObjectSetInteger(0, "DB_Info_LCLR", OBJPROP_YDISTANCE, BY+3);
      ObjectSetInteger(0, "DB_BtnCLR",    OBJPROP_XDISTANCE, 156); ObjectSetInteger(0, "DB_BtnCLR",    OBJPROP_YDISTANCE, BY);
      ObjectSetInteger(0, "DB_Info_LCLR", OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      ObjectSetInteger(0, "DB_BtnCLR",    OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      rows++;
     }

   // Baris "Master File" (slave multi-master) -> slot tambahan setelah bar.
   bool showMas = (isSlave && MultiMasterOn());
   if(showMas)
     {
      int BY = BY0 + rows*STEP;
      ObjectSetInteger(0, "DB_Info_LMas",    OBJPROP_XDISTANCE, 30);  ObjectSetInteger(0, "DB_Info_LMas",    OBJPROP_YDISTANCE, BY+3);
      ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_XDISTANCE, 140); ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_YDISTANCE, BY);
      ObjectSetInteger(0, "DB_Info_LMas",    OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);
      int msMax = (InpMasterSlotMax < 1 ? 1 : (InpMasterSlotMax > 10 ? 10 : InpMasterSlotMax));
      for(int k=1;k<=msMax;k++)
         ObjectSetInteger(0, "DB_MasSel"+IntegerToString(k), OBJPROP_YDISTANCE, BY + k*STEP);
      rows++;
     }

   // Garis status + tombol merapat di bawah baris terakhir (beri ruang bila dropdown terbuka).
   int afterY = BY0 + rows*STEP;
   int dropExtra = 0;
   if(showMas && gMasterDropOpen)
     {
      int msMax2 = (InpMasterSlotMax < 1 ? 1 : (InpMasterSlotMax > 10 ? 10 : InpMasterSlotMax));
      dropExtra = msMax2*STEP;
     }
   int lineY   = afterY + dropExtra + 4;
   int statusY = lineY + 12;
   int btnY1   = statusY + 24;
   int btnY2   = btnY1 + 30;
   ObjectSetInteger(0, "DB_Line2",        OBJPROP_YDISTANCE, lineY);
   ObjectSetInteger(0, "DB_Status",       OBJPROP_YDISTANCE, statusY);
   ObjectSetInteger(0, "DB_BtnHoldMarti", OBJPROP_YDISTANCE, btnY1);
   ObjectSetInteger(0, "DB_BtnTier3",     OBJPROP_YDISTANCE, btnY1);
   ObjectSetInteger(0, "DB_BtnHoldTP",    OBJPROP_YDISTANCE, btnY2);
   ObjectSetInteger(0, "DB_BtnReset",     OBJPROP_YDISTANCE, btnY2);

   // Tinggi panel menyesuaikan jumlah baris.
   int panelH = (btnY2 + 26 + 14) - 20;   // 20 = YDISTANCE panel
   if(panelH < 300) panelH = 300;
   ObjectSetInteger(0, "DB_Panel", OBJPROP_YSIZE, panelH);
  }

void UpdateDashboard()
  {
   int nPos = CountMyPositions();

   UpdateRSICanvas();
   UpdateCanvasPosition();

   ObjectSetString(0, "DB_Val0", OBJPROP_TEXT, cloudAccount);
   ObjectSetString(0, "DB_Val1", OBJPROP_TEXT, cloudExpDate);
   ObjectSetString(0, "DB_Val2", OBJPROP_TEXT, TimeToString(TimeCurrent(), TIME_MINUTES|TIME_SECONDS));

   string jam = StringFormat("%02d:%02d-%02d:%02d", startHour, startMin, endHour, endMin);
   ObjectSetString(0, "DB_Val3", OBJPROP_TEXT, jam);
   ObjectSetInteger(0, "DB_Val3", OBJPROP_COLOR, OutsideTradingHours() ? clrGray : clrBlue);

   string modeTxt = (InpEntryMode == Grid) ? (gGridArmed && CountMyPositions() == 0 ? "Grid • Terpicu" : "Grid") : "Averaging";
   if(gHoldMarti)  modeTxt += " • HoldMarti";
   if(gForceTier3) modeTxt += " • Tier3";
   if(gHoldTP)     modeTxt += " • Hold";
   SetCanvasRow("DB_ModeVal", "Mode", modeTxt,
                (gHoldMarti || gForceTier3 || gHoldTP) ? clrChocolate : clrBlue);

   // Baris "Profit Harian" (di Info KANVAS kanan): profit / target | floating minus terdalam siklus
   double profitHarian = DailyRealizedProfit();
   string phTxt = DoubleToString(profitHarian,2);
   if(InpDailyTarget > 0.0) phTxt += " / " + DoubleToString(InpDailyTarget,2);
   phTxt += "  |  " + DoubleToString(gCycleMinFloat, 2);
   SetCanvasRow("DB_DailyVal", "Profit Harian", phTxt, (profitHarian >= 0) ? clrBlue : clrRed);

   double dispBEP = gBEP;
   if(dispBEP <= 0.0 && CountMyPositions() >= 1)
     {
      double l, e;
      if(NewestPosition(l, e)) dispBEP = e;
     }
   if(dispBEP > 0.0)
     {
      double tgtPx = 0.0;
      double cyc   = (CycleTargetActive()) ? CycleTargetPrice() : 0.0;
      if(cyc > 0.0)
         tgtPx = cyc;
      else if(!gHoldTP)
        {
         if(nPos == 1 && InpTPSingle > 0)
           {
            int d = CycleDirection();
            tgtPx = (d >= 0) ? dispBEP + InpTPSingle * gPt
                             : dispBEP - InpTPSingle * gPt;
           }
         else if(gTarget > 0.0)
            tgtPx = gTarget;
        }
      if(tgtPx <= 0.0) tgtPx = dispBEP;
      SetCanvasRow("DB_BEPVal", "BEP | Target",
                   DoubleToString(dispBEP,_Digits) + " | " + DoubleToString(tgtPx, _Digits), clrBlack);
     }
   else
      SetCanvasRow("DB_BEPVal", "BEP | Target", "-", clrGray);

   int npCyc = CountMyPositions();
   if(npCyc >= 1)
     {
      double l1e = 0.0, totLot = 0.0; long oldT = 0; bool got = false;
      for(int p = PositionsTotal()-1; p >= 0; p--)
        {
         ulong tk = PositionGetTicket(p);
         if(tk == 0) continue;
         if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
         totLot += PositionGetDouble(POSITION_VOLUME);
         long tt = (long)PositionGetInteger(POSITION_TIME_MSC);
         if(!got || tt < oldT) { got = true; oldT = tt; l1e = PositionGetDouble(POSITION_PRICE_OPEN); }
        }
      int    cdir = CycleDirection();
      double bidC = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double askC = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double distP = (l1e > 0.0 && cdir != 0)
                     ? ((cdir > 0) ? (l1e - bidC) / gPt : (askC - l1e) / gPt)
                     : 0.0;
      if(InpEntryMode == Grid)
        {
         // Lot efektif = selisih BUY - SELL (lot yg saling lock tidak dihitung) + arah posisi bersih.
         double nb = 0.0, ns = 0.0;
         for(int q = PositionsTotal()-1; q >= 0; q--)
           {
            ulong tq = PositionGetTicket(q);
            if(tq == 0 || PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
            if(PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) nb += PositionGetDouble(POSITION_VOLUME);
            else                                                        ns += PositionGetDouble(POSITION_VOLUME);
           }
         double net = nb - ns;
         string eff = (MathAbs(net) < 0.000001) ? "0.00 (LOCK)" : DoubleToString(MathAbs(net), 2) + (net > 0 ? " BUY" : " SELL");
         SetCanvasRow("DB_JLVal", "Lot Efektif", eff, (net > 0.000001) ? clrGreen : (net < -0.000001) ? clrRed : clrGray);
        }
      else
        {
         string jl = IntegerToString((int)MathRound(MathAbs(distP))) + " pts | " + DoubleToString(totLot, 2) + " lot";
         SetCanvasRow("DB_JLVal", "Jarak & Lot", jl, clrBlue);
        }
     }
   else if(InpEntryMode == Grid)
     {
      SetCanvasRow("DB_JLVal", "Lot Efektif", "-", clrGray);
     }
   else
     {
      SetCanvasRow("DB_JLVal", "Jarak & Lot", "-", clrGray);
     }


   // INFO baris "Virtual" (judul permanen): siklus jalan -> "L{n} | {harga TP}";
   // aktif tapi idle -> "Standby"; virtual OFF (input=0) -> "-".
   if(InpEntryMode == Grid)
     {
      // MODE GRID: baris ini menampilkan TRIGGER kontraksi (patokan arah L1). Setelah L1 open, trigger diabaikan.
      int gn = CountMyPositions();
      if(gn == 0 && !gGridArmed)
         SetCanvasRow("DB_VirVal", "Trigger", "Menunggu kontraksi", clrGray);
      else
         SetCanvasRow("DB_VirVal", "Trigger", DoubleToString(gGridRef, _Digits), gn == 0 ? clrDarkOrange : clrBlue);
     }
   else if(VirtualActive() && gVAlive)
     {
      SetCanvasRow("DB_VirVal", "Virtual",
                   "L" + IntegerToString(gVCount) + " | " + DoubleToString(gVEntry[gVCount-1], _Digits) +
                   " | TP " + DoubleToString(VirtualTPPrice(), _Digits),
                   (gVDir > 0) ? clrGreen : clrRed);   // BUY hijau, SELL merah
     }
   else if(VirtualActive())
     {
      SetCanvasRow("DB_VirVal", "Virtual", "Standby", clrGray);
     }
   else
     {
      ObjectSetString(0, "DB_VirVal", OBJPROP_TEXT, " ");  // virtual OFF -> teks spasi (hindari placeholder "Label")
     }

   // INFO baris "Profit Siklus": floating profit basket yang SEDANG open.
   // Flat (tak ada posisi) -> baris ini disembunyikan oleh UpdateCanvasPosition.
   if(nPos >= 1)
     {
      double pnlOpen = MyFloatingPnL();
      SetCanvasRow("DB_PnLVal", "Profit Siklus", DoubleToString(pnlOpen, 2),
                   (pnlOpen >= 0) ? clrBlue : clrRed);
     }
   else
      SetCanvasRow("DB_PnLVal", "Profit Siklus", "-", clrGray);

   // TOMBOL HOLD MARTI: aktif -> oranye; nonaktif -> abu.
   ObjectSetInteger(0, "DB_BtnHoldMarti", OBJPROP_BGCOLOR, gHoldMarti ? clrDarkOrange : clrGainsboro);
   ObjectSetInteger(0, "DB_BtnHoldMarti", OBJPROP_COLOR,   gHoldMarti ? clrWhite      : clrGray);
   // TOMBOL TIER 3: aktif -> ungu; nonaktif -> abu.
   ObjectSetInteger(0, "DB_BtnTier3", OBJPROP_BGCOLOR, gForceTier3 ? clrPurple : clrGainsboro);
   ObjectSetInteger(0, "DB_BtnTier3", OBJPROP_COLOR,   gForceTier3 ? clrWhite  : clrGray);
   // TOMBOL HOLD TP: aktif -> emas; nonaktif -> abu.
   ObjectSetInteger(0, "DB_BtnHoldTP", OBJPROP_BGCOLOR, gHoldTP ? clrGoldenrod : clrGainsboro);
   ObjectSetInteger(0, "DB_BtnHoldTP", OBJPROP_COLOR,   gHoldTP ? clrWhite     : clrGray);

   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED))
      ObjectSetString(0, "DB_Status", OBJPROP_TEXT, "[ ALGO TRADING OFF ]");
   else if(IsBreakActive())
      ObjectSetString(0, "DB_Status", OBJPROP_TEXT, "[ EA ISTIRAHAT - Hapus Order 55 ]");
   else if(gHoldTP && nPos >= 1)
      ObjectSetString(0, "DB_Status", OBJPROP_TEXT,
                      CycleTargetActive() ? "[ Target Profit Hold ]" : "[ Hold - Manual (user handle) ]");
   else if(DailyTargetReached() && nPos == 0)
      ObjectSetString(0, "DB_Status", OBJPROP_TEXT, "[ Daily Profit Achieved ]");
   else if(nPos >= 1)
     {
      int stPts = (nPos == 1) ? InpTPSingle : CurrentAvgTPPoints(nPos);
      ObjectSetString(0, "DB_Status", OBJPROP_TEXT, "[ L"+IntegerToString(nPos)+" - BEP+"+IntegerToString(stPts)+" ]");
     }
   else
      ObjectSetString(0, "DB_Status", OBJPROP_TEXT, "[ STANDBY ]");

   // === COPY TRADE v2.0: tandai peran & status mirror di panel ===
   {
      string dbTitle = "APOCALYPTO";
      if(gCopyRole == Master)     dbTitle += " • MASTER " + MasterIdName();
      else if(gCopyRole == Slave) dbTitle += gSubSlave ? " • SUB-SLAVE" : (StringLen(InpRelayFile) > 0 ? " • SLAVE+RELAY" : " • SLAVE");
      ObjectSetString(0, "DB_Title", OBJPROP_TEXT, dbTitle);
      // Visibilitas semua bar override (Cyc/Start Layer/Floating/RSI/Virtual/Jarak Lantai) diatur
      // sepenuhnya oleh LayoutPanel() berdasar F7 (!=0), berlaku utk MASTER maupun SLAVE.
      if(gCopyRole == Slave)
        {
         bool waitGate = ((gEffStartLayer > 0 || gEffFloatMinus > 0.0) && !gSlaveArmed && gCopyMirrored == 0);
         bool outHours = (OutsideTradingHours() && gCopyMirrored == 0);   // luar jam & belum ada mirror -> tunda buka
         string cs = gSlaveBreak ? "[ COPY SLAVE - KODE 55 (istirahat) ]"
                    : gCopyStale ? "[ COPY SLAVE - MASTER OFFLINE ]"
                    : DailyTargetReached() ? "[ COPY SLAVE - Target Harian tercapai ]"
                    : outHours   ? "[ COPY SLAVE - Di luar Jam Trading ]"
                    : waitGate   ? "[ COPY SLAVE - Waiting Gate Master ]"
                                 : "[ COPY SLAVE - " + IntegerToString(gCopyMirrored) + " mirror ]";
         ObjectSetString (0, "DB_Status", OBJPROP_TEXT, cs);
         ObjectSetInteger(0, "DB_Status", OBJPROP_COLOR, gSlaveBreak ? clrChocolate : (gCopyStale ? clrRed : clrDarkCyan));
         SetCanvasRow("DB_ModeVal", "Mode", "COPY SLAVE", clrTeal);
         DrawCopyTriggerLine();                          // garis harga pemicu copy (floating master -> ambang Floating Slave)

         // Mode SLAVE: tombol STRATEGI (Hold Marti/Tier3/Hold TP) non-aktif (abu-abu).
         string dbtn[] = {"DB_BtnHoldMarti","DB_BtnTier3","DB_BtnHoldTP"};
         for(int bi = 0; bi < ArraySize(dbtn); bi++)
           {
            ObjectSetInteger(0, dbtn[bi], OBJPROP_BGCOLOR, clrGainsboro);
            ObjectSetInteger(0, dbtn[bi], OBJPROP_COLOR,   clrSilver);
            ObjectSetInteger(0, dbtn[bi], OBJPROP_STATE,   false);
           }
         // SEMUA bar override milik slave BISA DIEDIT & terlihat aktif (yang muncul diatur LayoutPanel by F7).
         string sed[] = {"DB_EditCycle","DB_EditBSL","DB_EditBRSI","DB_EditFloat","DB_EditVLayer","DB_EditFloor"};
         for(int si = 0; si < ArraySize(sed); si++)
           {
            ObjectSetInteger(0, sed[si], OBJPROP_READONLY, false);
            ObjectSetInteger(0, sed[si], OBJPROP_COLOR,    clrBlack);
            ObjectSetInteger(0, sed[si], OBJPROP_BGCOLOR,  clrWhite);
           }
         string sbm[] = {"DB_BtnCycMinus","DB_BtnBSLMinus","DB_BtnBRSIMinus","DB_BtnFloatMinus","DB_BtnVLMinus","DB_BtnFlrMinus"};
         string sbp[] = {"DB_BtnCycPlus","DB_BtnBSLPlus","DB_BtnBRSIPlus","DB_BtnFloatPlus","DB_BtnVLPlus","DB_BtnFlrPlus"};
         for(int ci = 0; ci < ArraySize(sbm); ci++)
           {
            ObjectSetInteger(0, sbm[ci], OBJPROP_BGCOLOR, clrDimGray); ObjectSetInteger(0, sbm[ci], OBJPROP_COLOR, clrWhite);
            ObjectSetInteger(0, sbp[ci], OBJPROP_BGCOLOR, clrTeal);    ObjectSetInteger(0, sbp[ci], OBJPROP_COLOR, clrWhite);
           }
         // Catatan: teks kotak TIDAK ditimpa tiap refresh (agar tidak mengganggu saat user mengetik).
         // Sinkron teks hanya saat nilainya benar-benar berubah (tombol +/-, ENDEDIT, atau KODE 44).
         // RESET tetap aktif di slave (untuk eksekusi mendahului master).
         ObjectSetInteger(0, "DB_BtnReset", OBJPROP_BGCOLOR, clrDimGray);
         ObjectSetInteger(0, "DB_BtnReset", OBJPROP_COLOR,   clrWhite);
         // Multi-master: baris "Master File" di bawah Copy Start L jadi dropdown pemilih.
         bool mm = MultiMasterOn();
         ObjectSetInteger(0, "DB_Info_LMas",    OBJPROP_TIMEFRAMES, mm ? OBJ_ALL_PERIODS : OBJ_NO_PERIODS);
         ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_TIMEFRAMES, mm ? OBJ_ALL_PERIODS : OBJ_NO_PERIODS);
         if(mm)
           {
            ObjectSetString (0, "DB_BtnMasterHdr", OBJPROP_TEXT,
                             MasterSlotLabel() + (gMasterDropOpen ? "  ^" : "  v"));
            ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_BGCOLOR, MasterSlotColor(gMasterSlot));  // header ikut warna CT aktif
            ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_COLOR,   clrWhite);
            ObjectSetInteger(0, "DB_BtnMasterHdr", OBJPROP_STATE,   false);
            int msMax2 = (InpMasterSlotMax < 1 ? 1 : (InpMasterSlotMax > 10 ? 10 : InpMasterSlotMax));
            for(int k = 1; k <= msMax2; k++)
              {
               string bn = "DB_MasSel" + IntegerToString(k);
               ObjectSetInteger(0, bn, OBJPROP_TIMEFRAMES, gMasterDropOpen ? OBJ_ALL_PERIODS : OBJ_NO_PERIODS);
               bool act = (k == gMasterSlot);
               ObjectSetInteger(0, bn, OBJPROP_BGCOLOR, MasterSlotColor(k));   // warna khas tiap CT
               ObjectSetInteger(0, bn, OBJPROP_COLOR,   clrWhite);             // teks putih (kontras di semua warna)
               ObjectSetString (0, bn, OBJPROP_TEXT,    (act ? "> CT" : "CT") + IntegerToString(k) + (act ? " <" : "")); // aktif ditandai
               ObjectSetInteger(0, bn, OBJPROP_STATE,   false);
              }
           }
        }
     }

   // Tampilan tombol Validasi CT (Active/Non Active) selalu disinkronkan dgn state (visibilitas diatur LayoutPanel).
   ObjectSetString (0, "DB_BtnPV", OBJPROP_TEXT,    gPriceValidate ? "Active" : "Non Active");
   ObjectSetInteger(0, "DB_BtnPV", OBJPROP_BGCOLOR, gPriceValidate ? clrSeaGreen : clrGainsboro);
   ObjectSetInteger(0, "DB_BtnPV", OBJPROP_COLOR,   gPriceValidate ? clrWhite    : clrGray);

   // Tampilan tombol CL By RSI (On/Off) selalu disinkronkan dgn state (visibilitas diatur LayoutPanel).
   ObjectSetString (0, "DB_BtnCLR", OBJPROP_TEXT,    gCutlossByRSI ? "On" : "Off");
   ObjectSetInteger(0, "DB_BtnCLR", OBJPROP_BGCOLOR, gCutlossByRSI ? clrSeaGreen  : clrGainsboro);
   ObjectSetInteger(0, "DB_BtnCLR", OBJPROP_COLOR,   gCutlossByRSI ? clrWhite      : clrGray);

   LayoutPanel();   // bar override tampil sesuai F7 (!=0) + rapatkan status & tombol
   ChartRedraw();
  }

// Tulis nilai RSI di kanvas chart (di luar panel). Warna: merah>=70, hijau<=30, hitam netral.
// Padkan label ke lebar tetap (font monospace) supaya titik dua sejajar seperti panel.
string PadRight(string t, int width)
  {
   string r = t;
   while(StringLen(r) < width) r += " ";
   return r;
  }

// Set satu baris kanvas gaya panel: "LABEL(pad) : nilai".
void SetCanvasRow(string name, string lab, string val, color col)
  {
   ObjectSetString (0, name, OBJPROP_TEXT, PadRight(lab, 14) + ": " + val);
   ObjectSetInteger(0, name, OBJPROP_COLOR, col);
  }

// GARIS HARGA PEMICU COPY (hanya SLAVE):
//   Tarik 1 garis horizontal di harga di mana floating basket MASTER menyentuh ambang Floating Slave
//   (= −gEffFloatMinus $). Saat harga menyentuh garis ini -> gerbang floating terbuka -> slave MULAI COPY.
//   Dihitung dari posisi master (harga rata-rata + total lot) yang dibaca slave dari file; dinamis
//   seiring master menambah layer. Garis dihapus bila: master flat, sudah masuk gerbang (sudah copy),
//   master offline, istirahat (55), atau ambang Floating Slave = 0.
void DrawCopyTriggerLine()
  {
   // Syarat tampil garis: slave, master punya posisi, belum masuk gerbang, data valid, ambang > 0,
   // dan Target Harian BELUM tercapai (kalau tercapai -> slave tak akan copy baru -> garis disembunyikan;
   // begitu Target Harian dinaikkan sehingga belum tercapai lagi, garis otomatis aktif kembali).
   double thr = gEffFloatMinus;
   if(gCopyRole != Slave || gMasterNP <= 0 || gSlaveArmed || gCopyStale || gSlaveBreak ||
      thr <= 0.0 || gMasterLotSum <= 0.0 || DailyTargetReached())
     { FloorHLine("DB_CopyTrig", 0.0, clrOrange, STYLE_DASHDOT, 2, ""); return; }   // lvl 0 -> hapus garis

   double tickVal = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSz  = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
   if(tickSz <= 0.0 || tickVal <= 0.0)
     { FloorHLine("DB_CopyTrig", 0.0, clrOrange, STYLE_DASHDOT, 2, ""); return; }

   double K    = tickVal / tickSz;                 // $ per 1.0 unit harga per 1.0 lot
   double L    = gMasterLotSum;                     // total lot master
   double E    = gMasterEntryLotSum;                // Σ(harga_buka * lot)
   int    sign = (gMasterDir == 0) ? +1 : -1;       // 0=BUY (+1), 1=SELL (-1)
   // Floating master F(P) = sign*K*(P*L − E). Set F = −thr -> P = (E − thr/(sign*K)) / L.
   double P = (E - thr / (sign * K)) / L;
   if(P <= 0.0) { FloorHLine("DB_CopyTrig", 0.0, clrOrange, STYLE_DASHDOT, 2, ""); return; }
   P = NormalizeDouble(P, _Digits);

   string txt = "Pemicu COPY (floating master -" + DoubleToString(thr, 0) + "$)";
   FloorHLine("DB_CopyTrig", P, clrOrange, STYLE_DASHDOT, 2, txt);
  }

// Posisi dinamis blok teks kanvas: harga di ATAS layar -> teks ke BAWAH; harga di BAWAH -> teks ke ATAS.
void UpdateCanvasPosition()
  {
   double pmin = ChartGetDouble(0, CHART_PRICE_MIN, 0);
   double pmax = ChartGetDouble(0, CHART_PRICE_MAX, 0);
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   if(pmax > pmin && price > 0.0)
     {
      double rel = (price - pmin) / (pmax - pmin);   // 0=bawah, 1=atas
      if(rel > 0.60)      gCanvasBottom = true;       // harga di atas  -> teks ke bawah
      else if(rel < 0.40) gCanvasBottom = false;      // harga di bawah -> teks ke atas
     }
   // Baris yang tampil: baris SAR sudah dihapus; Virtual hanya bila dipakai.
   string nm[8] = {"DB_RSIVal","DB_SARVal","DB_ModeVal","DB_BEPVal","DB_VirVal","DB_JLVal","DB_PnLVal","DB_DailyVal"};
   bool   vis[8];
   if(gCopyRole == Slave)
     {
      vis[0]=true;                                   // mode SLAVE: RSI + Jarak & Lot
      vis[1]=false; vis[2]=false; vis[3]=false; vis[4]=false; vis[5]=true;
     }
   else
     {
      vis[0]=true;
      vis[1]=false;                                  // baris SAR dihapus (gerbang titik SAR sudah tidak ada)
      vis[2]=true;
      vis[3]=true;
      vis[4]=VirtualActive() || (InpEntryMode == Grid);   // mode Grid: baris ini = Trigger
      vis[5]=true;
     }
   vis[6]=true;     // "Profit Siklus" judul selalu tampil (nilai "-" saat flat, spt Jarak & Lot)
   vis[7]=true;     // "Profit Harian" selalu tampil di kanvas (master & slave)
   int cnt=0, mask=0;
   for(int i=0;i<8;i++) if(vis[i]) { cnt++; mask |= (1<<i); }
   int h = (int)ChartGetInteger(0, CHART_HEIGHT_IN_PIXELS, 0);
   int baseY = gCanvasBottom ? (h - cnt*21 - 24) : 45;
   if(baseY < 20) baseY = 20;
   int sig = baseY*1000 + mask;
   if(sig == gCanvasBaseY) return;                    // posisi & set-tampil tak berubah
   gCanvasBaseY = sig;
   int k=0;
   for(int i=0;i<8;i++)
     {
      if(vis[i])
        {
         ObjectSetInteger(0, nm[i], OBJPROP_TIMEFRAMES, OBJ_ALL_PERIODS);   // tampilkan
         ObjectSetInteger(0, nm[i], OBJPROP_YDISTANCE, baseY + k*21);
         k++;
        }
      else
         ObjectSetInteger(0, nm[i], OBJPROP_TIMEFRAMES, OBJ_NO_PERIODS);    // sembunyikan total
     }
  }

void UpdateRSICanvas()
  {
   // --- Baris SAR di kanvas dihapus (gerbang titik SAR sudah tidak ada) ---
   ObjectSetString(0, "DB_SARVal", OBJPROP_TEXT, " ");

   // --- RSI di kanvas (master & slave) ---
   //  Format: RSI(14) : <RSI sekarang> | <RSI layer terakhir> | <panah>
   //  Panah bandingkan RSI layer terakhir (L) vs layer sebelumnya (L-1):
   //    BUY  -> L<L-1: turun (hijau) ; L>L-1: naik (merah).   SELL -> kebalikannya.
   if(hRSI == INVALID_HANDLE) return;
   double r[];
   ArraySetAsSeries(r, true);
   if(CopyBuffer(hRSI, 0, 0, 1, r) < 1) return;
   double v = r[0];

   // Cari RSI 2 layer teratas dari comment posisi EA ("Apo <layer> <rsi>").
   int    layL = 0, layPrev = 0;
   double rsiL = -1.0, rsiPrev = -1.0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      string cm = PositionGetString(POSITION_COMMENT);
      int lay = LayerFromComment(cm);
      if(lay <= 0) continue;
      double rs = RSIFromComment(cm);
      if(rs < 0.0) continue;
      if(lay > layL)          { layPrev = layL; rsiPrev = rsiL; layL = lay; rsiL = rs; }
      else if(lay > layPrev)  { layPrev = lay;  rsiPrev = rs; }
     }

   string cur = StringFormat("%.2f", v);
   color  cRsiZone = (v >= 70.0) ? clrRed : (v <= 30.0) ? clrGreen : clrBlack;
   string val;
   color  c;
   if(rsiL < 0.0)                          // tak ada layer ber-comment (flat / hanya mirror-slave / adopsi)
     {
      gRSIAnomaly = false;                  // tak ada basket -> bersihkan latch
      val = cur + " | - | -";
      c   = cRsiZone;
     }
   else if(rsiPrev < 0.0)                  // baru 1 layer -> belum ada pembanding
     {
      val = cur + " | " + StringFormat("%.2f", rsiL) + " | -";
      c   = gRSIAnomaly ? clrRed : cRsiZone;
     }
   else
     {
      int  dir = CycleDirection();          // +1 BUY / -1 SELL
      string arrow;
      if(MathAbs(rsiL - rsiPrev) < 0.05)    // nyaris sama -> netral
        { arrow = "■"; c = gRSIAnomaly ? clrRed : clrGray; }
      else
        {
         bool rose      = (rsiL > rsiPrev);                 // arah RSI SEBENARNYA (naik/turun)
         arrow = rose ? "▲" : "▼";                // ▲ naik, ▼ turun (tebal, ikut warna)
         bool favorable = (dir >= 0) ? !rose : rose;        // BUY untung bila RSI turun; SELL untung bila RSI naik
         if(!favorable) gRSIAnomaly = true;                 // LATCH: anomali terdeteksi -> kunci merah s/d flat/siklus baru
         c = gRSIAnomaly ? clrRed : clrGreen;               // sekali anomali, tetap merah walau RSI kembali searah
        }
      val = cur + " | " + StringFormat("%.2f", rsiL) + " | " + arrow;
     }
   SetCanvasRow("DB_RSIVal", "RSI(" + IntegerToString(InpRSIPeriod) + ")", val, c);
  }

// Kanvas SLAVE: baris "Jarak & Lot" dari basket mirror slave (jarak L1 mirror -> harga, + total lot).
void UpdateSlaveCanvasJL()
  {
   double totLot = 0.0, oldE = 0.0; long oldT = 0; bool got = false; int dir = 0;
   for(int i = PositionsTotal()-1; i >= 0; i--)
     {
      ulong t = PositionGetTicket(i);
      if(t == 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpSlaveMagic) continue;
      totLot += PositionGetDouble(POSITION_VOLUME);
      long tt = (long)PositionGetInteger(POSITION_TIME_MSC);
      if(!got || tt < oldT)
        {
         got = true; oldT = tt;
         oldE = PositionGetDouble(POSITION_PRICE_OPEN);
         dir  = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? 1 : -1;
        }
     }
   if(got && totLot > 0.0)
     {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double distP = (dir > 0) ? (oldE - bid) / gPt : (ask - oldE) / gPt;
      SetCanvasRow("DB_JLVal", "Jarak & Lot",
                   IntegerToString((int)MathRound(MathAbs(distP))) + " pts | " +
                   DoubleToString(totLot, 2) + " lot", clrBlue);
     }
   else
      SetCanvasRow("DB_JLVal", "Jarak & Lot", "-", clrGray);
  }

void CreateLabel(string n, string t, int x, int y, int s, color c, string f, ENUM_ANCHOR_POINT a)
  {
   ObjectCreate(0, n, OBJ_LABEL, 0, 0, 0);
   ObjectSetInteger(0, n, OBJPROP_XDISTANCE, x);
   ObjectSetInteger(0, n, OBJPROP_YDISTANCE, y);
   ObjectSetString(0, n, OBJPROP_TEXT, t);
   ObjectSetInteger(0, n, OBJPROP_COLOR, c);
   ObjectSetString(0, n, OBJPROP_FONT, f);
   ObjectSetInteger(0, n, OBJPROP_FONTSIZE, s);
   ObjectSetInteger(0, n, OBJPROP_ANCHOR, a);
  }
//+------------------------------------------------------------------+