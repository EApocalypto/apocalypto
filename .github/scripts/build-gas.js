// Menyisipkan nilai rahasia (dari secret GAS_SECRETS) ke _gas/Code.js lalu menaruhnya
// menggantikan file utama (yang berisi "function doGet(") di project hasil clasp pull.
// Gagal (exit 1) bila ada placeholder __GAS_..__ yang belum terisi -> backend lisensi EA tidak rusak.
const fs = require('fs'), path = require('path');
const [src, dir] = process.argv.slice(2);
let secrets;
try { secrets = JSON.parse(process.env.GAS_SECRETS || ''); }
catch (e) { console.error('::error::Secret GAS_SECRETS kosong atau bukan JSON yang valid'); process.exit(1); }

let code = fs.readFileSync(src, 'utf8');
code = code.replace(/__GAS_([A-Z_]+)__/g, (m, k) => {
  if (!(k in secrets) || String(secrets[k]) === '') { console.error('::error::Nilai rahasia ' + k + ' tidak ada di GAS_SECRETS'); process.exit(1); }
  return String(secrets[k]).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
});
if (/__GAS_[A-Z_]+__/.test(code)) { console.error('::error::Masih ada placeholder yang belum terisi'); process.exit(1); }

const files = fs.readdirSync(dir).filter(f => /\.(js|gs)$/.test(f));
const main = files.find(f => /function\s+doGet\s*\(/.test(fs.readFileSync(path.join(dir, f), 'utf8')));
const target = main || 'Code.js';
const oldLines = main ? fs.readFileSync(path.join(dir, main), 'utf8').split('\n').length : 0;
fs.writeFileSync(path.join(dir, target), code);
console.log('Jumlah baris kode lama: ' + oldLines + ' -> baru: ' + code.split('\n').length);
console.log('Kode utama ditulis ke: ' + target + (main ? ' (menggantikan file lama)' : ' (file baru)'));
console.log('File lain yang dibiarkan: ' + (files.filter(f => f !== target).join(', ') || '-'));
