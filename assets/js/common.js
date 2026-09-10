/* =========================================================================
   COMMON.JS
   Dipakai bersama oleh index.js (pemilih) dan dashboard.js (panitia).
   Berisi: konfigurasi, klien API (dengan diagnosis error yang jelas),
   helper umum, toast notifikasi, dan generator template impor massal
   (CSV & Excel/.xlsx).
   ========================================================================= */

/* ============ KONFIGURASI — wajib diisi sebelum di-deploy ============ */
const API_URL = "https://script.google.com/macros/s/AKfycbyMBuVMGAgNKvaWrppnAwoB4Br9mUrIa4uG3_jRg6lANHWsK1ZaA-w0J_PfahXF59Pv/exec";
const SEKOLAH = "SMP 2 Sragi";
const TAHUN_AJARAN = "2026/2027";

function apiConfigured(){ return API_URL && API_URL.indexOf('TEMPEL_URL') === -1; }

/**
 * Diagnosis kenapa panggilan API gagal, supaya panitia tidak cuma melihat
 * "tombol tidak berfungsi" tanpa tahu sebabnya. Penyebab paling umum:
 * deployment Apps Script belum di-set "Anyone" (Siapa saja), atau lupa
 * membuat versi deployment baru setelah mengubah kode.
 */
function diagnoseBadResponse(text){
  const t = (text || '').toLowerCase();
  if(t.indexOf('accounts.google.com') !== -1 || t.indexOf('serviceloginauth') !== -1){
    return 'Server meminta login Google — deployment Apps Script belum di-set akses "Anyone" (Siapa saja). Buka Deploy > Manage deployments, ubah "Who has access" jadi Anyone, lalu buat versi baru.';
  }
  if(t.indexOf('<html') !== -1){
    return 'Server membalas halaman HTML, bukan data. Kemungkinan URL API salah atau deployment belum aktif. Cek ulang API_URL dan deployment-nya.';
  }
  return 'Server membalas format yang tidak dikenali. Cek kembali API_URL dan pastikan deployment sudah versi terbaru.';
}

async function apiGet(params){
  let res;
  try{
    const qs = new URLSearchParams(params).toString();
    res = await fetch(API_URL + '?' + qs);
  }catch(err){
    throw new Error('Tidak bisa menghubungi server. Cek koneksi internet kamu.');
  }
  const text = await res.text();
  if(!res.ok) throw new Error('Server merespons error (' + res.status + ').');
  try{ return JSON.parse(text); }
  catch(err){ throw new Error(diagnoseBadResponse(text)); }
}

async function apiPost(payload){
  let res;
  try{
    res = await fetch(API_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body: JSON.stringify(payload)
    });
  }catch(err){
    throw new Error('Tidak bisa menghubungi server. Cek koneksi internet kamu.');
  }
  const text = await res.text();
  if(!res.ok) throw new Error('Server merespons error (' + res.status + ').');
  try{ return JSON.parse(text); }
  catch(err){ throw new Error(diagnoseBadResponse(text)); }
}

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fallbackAvatar(nama){ return 'https://api.dicebear.com/7.x/initials/svg?seed='+encodeURIComponent(nama||'?')+'&backgroundType=gradientLinear'; }

/* ============ toast notifikasi (pengganti banner statis) ============ */
function ensureToastWrap(){
  let wrap = document.getElementById('toast-wrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'toast-wrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}
function toast(message, kind){
  const wrap = ensureToastWrap();
  const el = document.createElement('div');
  el.className = 'toast ' + (kind === 'err' ? 'err' : 'ok');
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .25s'; setTimeout(() => el.remove(), 260); }, 3600);
}

/* ============ jaring pengaman: JS error tak terduga tetap terlihat ============
   Ini menangani kelas bug "tombol seolah tidak berfungsi": kalau ada error
   JS yang sebelumnya diam-diam gagal, sekarang muncul sebagai toast supaya
   panitia tahu ada yang salah, bukan diam tanpa penjelasan. */
window.addEventListener('error', (e) => {
  if(e && e.message) toast('Terjadi kesalahan: ' + e.message, 'err');
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e && e.reason && e.reason.message) ? e.reason.message : 'Permintaan ke server gagal.';
  toast(msg, 'err');
});

/* ============ template impor massal pemilih (CSV & Excel) ============ */
const TEMPLATE_ROWS = [
  ['ID', 'Nama', 'Role'],
  ['0051234567', 'Ahmad Fauzi', 'Siswa'],
  ['0051234568', 'Siti Nur Aini', 'Siswa'],
  ['198501012010011001', 'Budi Santoso', 'Guru']
];

function downloadCsvTemplate(){
  const csv = TEMPLATE_ROWS.map(r => r.join(',')).join('\n') + '\n';
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  triggerDownload(blob, 'template-pemilih.csv');
}

/** Template Excel (.xlsx) dibuat langsung di browser (tanpa server) memakai
 * SheetJS, supaya panitia yang lebih terbiasa pakai Excel daripada CSV
 * tinggal isi lalu upload lagi lewat tab "Kelola Pemilih". */
function downloadXlsxTemplate(){
  if(typeof XLSX === 'undefined'){
    toast('Gagal memuat pustaka Excel. Coba unduh template CSV saja.', 'err');
    return;
  }
  const ws = XLSX.utils.aoa_to_sheet(TEMPLATE_ROWS);
  ws['!cols'] = [{wch:20},{wch:26},{wch:10}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Pemilih');
  XLSX.writeFile(wb, 'template-pemilih.xlsx');
}

function triggerDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function parseCsvLines(text){
  const lines = text.split('\n').map(l=>l.trim()).filter(Boolean);
  if(lines.length && /^id\s*[,\t]/i.test(lines[0])) lines.shift(); // buang baris header kalau ada
  return lines.map(line => {
    const parts = line.split(/\t|,/).map(s=>s.trim());
    return { id: parts[0]||'', nama: parts[1]||'', role: parts[2]||'Siswa' };
  });
}

/** Baca file .xlsx/.xls jadi baris {id, nama, role} langsung di browser. */
function parseXlsxFile(file){
  return new Promise((resolve, reject) => {
    if(typeof XLSX === 'undefined'){ reject(new Error('Pustaka Excel belum termuat.')); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const wb = XLSX.read(reader.result, {type:'array'});
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:''});
        const list = rows
          .filter(r => r.length && String(r[0]).trim() !== '' && !/^id$/i.test(String(r[0]).trim()))
          .map(r => ({ id:String(r[0]||'').trim(), nama:String(r[1]||'').trim(), role:String(r[2]||'Siswa').trim() }));
        resolve(list);
      }catch(err){ reject(new Error('Gagal membaca file Excel. Pastikan formatnya sesuai template.')); }
    };
    reader.onerror = () => reject(new Error('Gagal membaca file.'));
    reader.readAsArrayBuffer(file);
  });
}
