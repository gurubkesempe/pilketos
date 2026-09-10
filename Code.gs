/**
 * BACKEND PEMILIHAN KETUA OSIS
 * Tempel kode ini di Extensions > Apps Script pada Google Spreadsheet kamu.
 *
 * ==== SHEET DIBUAT OTOMATIS ====
 * Setelah kode ini ter-deploy, buka ulang spreadsheet (refresh browser) →
 * menu "Pemilihan OSIS" → "🛠 Setup Sheet Otomatis" → sistem membuatkan
 * sheet-sheet berikut lengkap dengan header (kalau sudah ada, dilewati):
 *
 * Sheet "Kandidat":
 *   Nomor | Nama | Kelas | Foto | Visi | Misi1 | Misi2 | Misi3
 *   Kolom Foto otomatis terisi lewat upload foto di dashboard.html.
 *
 * Sheet "Pemilih" — daftar guru & siswa yang berhak memilih:
 *   ID | Nama | Role   (Role = "Siswa" atau "Guru")
 *   ID = NISN untuk siswa, NIP/ID unik untuk guru. Bisa diisi manual di
 *   spreadsheet ATAU lewat tab "Kelola Pemilih" di dashboard.html
 *   (satu-satu maupun impor massal).
 *
 * Sheet "Suara" (terisi otomatis oleh sistem — jangan diisi manual):
 *   ID | Nomor | Waktu
 *
 * Sheet "Admin" — akun panitia untuk login ke dashboard.html:
 *   Username | Password | Nama   (isi manual, boleh lebih dari satu baris/akun)
 *
 * ==== LOGIN PEMILIH (index.html) ====
 * Username = ID (NISN/NIP), Password = ID juga. Server tetap memvalidasi
 * ID itu benar-benar ada di tab "Pemilih". Berlaku sama untuk guru & siswa.
 *
 * ==== LOGIN PANITIA (dashboard.html) ====
 * Username + Password bebas, diisi manual di sheet "Admin".
 *
 * ==== STATUS HASIL AKHIR ====
 * Disimpan sebagai Script Property RESULT_PUBLISHED ("true"/"false").
 * dashboard.html menulisnya lewat action publishResult, index.html
 * membacanya lewat action getResultStatus untuk tahu kapan boleh
 * menampilkan pemenang ke pemilih.
 *
 * ==== CARA DEPLOY ====
 *  1. Deploy > New deployment > pilih tipe "Web app"
 *  2. Execute as: Me | Who has access: Anyone
 *  3. Deploy, izinkan akses saat diminta
 *  4. Salin URL yang muncul, tempel ke variabel API_URL di index.html
 *     DAN di dashboard.html (dua file, satu URL yang sama)
 * Kalau nanti ubah kode ini, harus "Manage deployments > New version > Deploy"
 * supaya perubahan ikut ter-publish (sekadar Save saja tidak cukup).
 */

const SHEET_KANDIDAT = 'Kandidat';
const SHEET_PEMILIH = 'Pemilih';
const SHEET_SUARA = 'Suara';
const SHEET_ADMIN = 'Admin';
const FOTO_FOLDER_NAME = 'Foto Kandidat OSIS';

const KANDIDAT_HEADER = ['Nomor', 'Nama', 'Kelas', 'Foto', 'Visi', 'Misi1', 'Misi2', 'Misi3'];
const PEMILIH_HEADER = ['ID', 'Nama', 'Role'];
const SUARA_HEADER = ['ID', 'Nomor', 'Waktu'];
const ADMIN_HEADER = ['Username', 'Password', 'Nama'];

const ID_REGEX = /^[0-9]{4,20}$/;

/* ============================================================
   MENU & SETUP OTOMATIS — muncul saat spreadsheet dibuka
   ============================================================ */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Pemilihan OSIS')
    .addItem('🛠 Setup Sheet Otomatis', 'setupSheetsWithUi')
    .addItem('📷 Upload Foto Kandidat', 'showUploadFotoDialog')
    .addToUi();
}

function setupSheetsWithUi() {
  var result = setupSheets();
  SpreadsheetApp.getUi().alert(
    'Setup selesai',
    'Sheet siap dipakai:\n' + result.join('\n') +
    '\n\nSheet yang sudah ada sebelumnya tidak diubah/ditimpa.' +
    '\n\nJangan lupa isi sheet "Admin" (Username | Password | Nama) supaya' +
    ' panitia bisa login ke dashboard.html. Data pemilih (guru & siswa) bisa' +
    ' diisi lewat tab "Kelola Pemilih" di dashboard, atau langsung di sheet "Pemilih".',
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

/**
 * Membuat sheet (Kandidat, Pemilih, Suara, Admin) beserta header kalau belum
 * ada. Aman dipanggil berkali-kali — sheet yang sudah ada tidak akan ditimpa.
 */
function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = [];

  log.push(ensureSheet(ss, SHEET_KANDIDAT, KANDIDAT_HEADER));
  log.push(ensureSheet(ss, SHEET_PEMILIH, PEMILIH_HEADER, true));
  log.push(ensureSheet(ss, SHEET_SUARA, SUARA_HEADER, true));
  log.push(ensureSheet(ss, SHEET_ADMIN, ADMIN_HEADER));

  // Migrasi otomatis: kalau masih ada sheet lama "Siswa" dan "Pemilih" baru
  // masih kosong, salin isinya ke "Pemilih" dengan Role default "Siswa".
  var lamaSiswa = ss.getSheetByName('Siswa');
  var pemilihSheet = ss.getSheetByName(SHEET_PEMILIH);
  if (lamaSiswa && pemilihSheet && pemilihSheet.getLastRow() <= 1 && lamaSiswa.getLastRow() > 1) {
    var data = lamaSiswa.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === '' || data[i][0] === null) continue;
      rows.push([String(data[i][0]), data[i][1] || '', 'Siswa']);
    }
    if (rows.length) {
      pemilihSheet.getRange(2, 1, rows.length, 3).setValues(rows);
      log.push('Migrasi: ' + rows.length + ' data dari sheet "Siswa" lama disalin ke "Pemilih".');
    }
  }

  // Hapus sheet default "Sheet1" kalau masih kosong dan belum dipakai
  var def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 4 && def.getLastRow() === 0) {
    ss.deleteSheet(def);
  }
  return log;
}

function ensureSheet(ss, name, header, firstColAsText) {
  var sheet = ss.getSheetByName(name);
  var created = false;
  if (!sheet) {
    sheet = ss.insertSheet(name);
    created = true;
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, header.length).setValues([header]);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold').setBackground('#182642').setFontColor('#FFFFFF');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, header.length);
  }
  // Format kolom pertama (ID) sebagai teks polos supaya angka 0 di depan tidak hilang
  if (firstColAsText) {
    sheet.getRange(2, 1, Math.max(sheet.getMaxRows() - 1, 999), 1).setNumberFormat('@');
  }
  return (created ? 'Dibuat: ' : 'Sudah ada, dilewati: ') + name;
}

/* ============================================================
   ROUTER
   ============================================================ */
function doGet(e) {
  var action = e.parameter.action;
  var out;
  try {
    if (action === 'getCandidates') out = getCandidates();
    else if (action === 'checkVoted') out = checkVoted(e.parameter.id || e.parameter.nisn);
    else if (action === 'getVoterCount') out = getVoterCount();
    else if (action === 'getVoterStats') out = getVoterStats();
    else if (action === 'getVoters') out = getVoters();
    else if (action === 'getTally') out = getTally();
    else if (action === 'getResultStatus') out = getResultStatus();
    else out = { error: 'Aksi tidak dikenal: ' + action };
  } catch (err) {
    out = { error: String(err) };
  }
  return jsonOutput(out);
}

function doPost(e) {
  var out;
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'loginPemilih') out = loginPemilih(body.id || body.nisn, body.password);
    else if (body.action === 'adminLogin') out = adminLogin(body.username, body.password);
    else if (body.action === 'vote') out = castVote(body.id || body.nisn, body.nomor);
    else if (body.action === 'saveCandidate') out = saveCandidate(body);
    else if (body.action === 'deleteCandidate') out = deleteCandidate(body.nomor);
    else if (body.action === 'saveVoter') out = saveVoter(body);
    else if (body.action === 'deleteVoter') out = deleteVoter(body.id);
    else if (body.action === 'importVoters') out = importVoters(body.list);
    else if (body.action === 'publishResult') out = publishResult(body.published);
    else out = { error: 'Aksi tidak dikenal: ' + body.action };
  } catch (err) {
    out = { error: String(err) };
  }
  return jsonOutput(out);
}

function jsonOutput(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('Sheet "' + name + '" tidak ditemukan. Jalankan menu "Setup Sheet Otomatis" dulu.');
  return sheet;
}

/* ---------- Pemilih (guru & siswa) ---------- */
function findPemilihById(id) {
  var sheet = getSheet(SHEET_PEMILIH);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      return { id: String(data[i][0]), nama: data[i][1], role: data[i][2] || 'Siswa' };
    }
  }
  return null;
}

function findPemilihRowIndex(sheet, id) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
  }
  return -1;
}

/** Dipanggil dari dashboard.html tab "Kelola Pemilih". */
function getVoters() {
  var pemilihSheet = getSheet(SHEET_PEMILIH);
  var pemilihData = pemilihSheet.getDataRange().getValues();
  var suaraSheet = getSheet(SHEET_SUARA);
  var suaraData = suaraSheet.getDataRange().getValues();
  var votedSet = {};
  for (var i = 1; i < suaraData.length; i++) {
    if (suaraData[i][0] !== '' && suaraData[i][0] !== null) votedSet[String(suaraData[i][0])] = true;
  }
  var out = [];
  for (var j = 1; j < pemilihData.length; j++) {
    if (pemilihData[j][0] === '' || pemilihData[j][0] === null) continue;
    var id = String(pemilihData[j][0]);
    out.push({
      id: id,
      nama: pemilihData[j][1],
      role: pemilihData[j][2] || 'Siswa',
      sudahMemilih: !!votedSet[id]
    });
  }
  return out;
}

/**
 * Tambah/ubah satu pemilih. Dicocokkan lewat ID (kalau sudah ada, di-update).
 * body: {id, nama, role}
 */
function saveVoter(body) {
  var id = String(body.id || '').trim();
  var nama = String(body.nama || '').trim();
  var role = (body.role === 'Guru') ? 'Guru' : 'Siswa';
  if (!id || !nama) return { ok: false, error: 'ID dan nama wajib diisi.' };
  if (!ID_REGEX.test(id)) return { ok: false, error: 'ID harus berupa angka (4-20 digit), contoh NISN/NIP.' };

  var sheet = getSheet(SHEET_PEMILIH);
  var rowIndex = findPemilihRowIndex(sheet, id);
  if (rowIndex === -1) {
    sheet.appendRow([id, nama, role]);
  } else {
    sheet.getRange(rowIndex, 1, 1, 3).setValues([[id, nama, role]]);
  }
  return { ok: true };
}

function deleteVoter(id) {
  if (!id) return { ok: false, error: 'ID wajib diisi.' };
  var sheet = getSheet(SHEET_PEMILIH);
  var rowIndex = findPemilihRowIndex(sheet, id);
  if (rowIndex === -1) return { ok: false, error: 'Pemilih dengan ID tersebut tidak ditemukan.' };
  sheet.deleteRow(rowIndex);
  return { ok: true };
}

/**
 * Impor massal pemilih. list: [{id, nama, role}, ...]
 * ID yang sudah ada akan di-update (upsert), bukan dobel.
 */
function importVoters(list) {
  if (!Array.isArray(list) || list.length === 0) return { ok: false, error: 'Tidak ada data untuk diimpor.' };
  var sheet = getSheet(SHEET_PEMILIH);
  var data = sheet.getDataRange().getValues();
  var indexById = {};
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] !== '' && data[i][0] !== null) indexById[String(data[i][0])] = i + 1;
  }

  var added = 0, updated = 0, skipped = 0;
  var toAppend = [];
  list.forEach(function (item) {
    var id = String(item.id || '').trim();
    var nama = String(item.nama || '').trim();
    var role = (String(item.role || 'Siswa').trim().toLowerCase() === 'guru') ? 'Guru' : 'Siswa';
    if (!id || !nama || !ID_REGEX.test(id)) { skipped++; return; }
    if (indexById[id]) {
      sheet.getRange(indexById[id], 1, 1, 3).setValues([[id, nama, role]]);
      updated++;
    } else {
      toAppend.push([id, nama, role]);
      indexById[id] = -1; // cegah duplikat dalam batch yang sama
      added++;
    }
  });
  if (toAppend.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, toAppend.length, 3).setValues(toAppend);
  }
  return { ok: true, added: added, updated: updated, skipped: skipped };
}

/* ---------- Login pemilih (guru & siswa) ---------- */
function loginPemilih(id, password) {
  if (!id || !password) return { ok: false, error: 'Username dan password wajib diisi.' };
  if (!ID_REGEX.test(String(id))) {
    return { ok: false, error: 'Format ID tidak valid.' };
  }
  if (String(password) !== String(id)) {
    return { ok: false, error: 'Password salah. Password kamu adalah ID (NISN/NIP) kamu sendiri.' };
  }
  var pemilih = findPemilihById(id);
  if (!pemilih) return { ok: false, error: 'ID tidak terdaftar sebagai pemilih. Hubungi panitia.' };
  return { ok: true, nama: pemilih.nama, role: pemilih.role };
}

/* ---------- Login admin (dashboard.html) ---------- */
function findAdminByUsername(username) {
  var sheet = getSheet(SHEET_ADMIN);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(username)) {
      return { username: String(data[i][0]), password: data[i][1], nama: data[i][2] };
    }
  }
  return null;
}

function adminLogin(username, password) {
  if (!username || !password) return { ok: false, error: 'Username dan password wajib diisi.' };
  var admin = findAdminByUsername(username);
  if (!admin) return { ok: false, error: 'Username tidak ditemukan.' };
  if (String(admin.password) !== String(password)) return { ok: false, error: 'Password salah.' };
  return { ok: true, nama: admin.nama || admin.username };
}

/* ---------- Kandidat ---------- */
function getCandidates() {
  var sheet = getSheet(SHEET_KANDIDAT);
  var data = sheet.getDataRange().getValues();
  var rows = data.slice(1); // lewati header
  return rows
    .filter(function (r) { return r[0] !== '' && r[0] !== null; })
    .map(function (r) {
      return {
        nomor: r[0],
        nama: r[1],
        kelas: r[2],
        foto: r[3],
        visi: r[4],
        misi: [r[5], r[6], r[7]].filter(function (m) { return m !== '' && m !== null; })
      };
    });
}

function findKandidatRowIndex(sheet, nomor) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(nomor)) return i + 1; // 1-based row number di sheet
  }
  return -1;
}

/**
 * Tambah kandidat baru atau update kandidat yang sudah ada (dicocokkan lewat
 * Nomor). Dipanggil dari dashboard.html (action: saveCandidate).
 * body: {nomor, nama, kelas, visi, misi:[...], foto?, fotoType?, fotoName?}
 */
function saveCandidate(body) {
  var nomor = body.nomor, nama = body.nama, kelas = body.kelas, visi = body.visi || '';
  var misi = Array.isArray(body.misi) ? body.misi : [];
  if (!nomor || !nama || !kelas) {
    return { ok: false, error: 'Nomor, nama, dan kelas wajib diisi.' };
  }

  var sheet = getSheet(SHEET_KANDIDAT);
  var rowIndex = findKandidatRowIndex(sheet, nomor);
  var isNew = rowIndex === -1;

  // Simpan foto dulu (kalau ada) supaya URL-nya bisa langsung ditulis bareng baris ini
  var fotoUrl = null;
  if (body.foto && body.fotoType) {
    var saved = saveFotoBlob(nomor, body.foto, body.fotoType, body.fotoName || ('kandidat-' + nomor));
    if (!saved.ok) return saved; // gagal simpan foto, batalkan
    fotoUrl = saved.url;
  }

  var misi1 = misi[0] || '', misi2 = misi[1] || '', misi3 = misi[2] || '';

  if (isNew) {
    var existingFoto = fotoUrl || '';
    sheet.appendRow([nomor, nama, kelas, existingFoto, visi, misi1, misi2, misi3]);
  } else {
    var currentFoto = sheet.getRange(rowIndex, 4).getValue();
    sheet.getRange(rowIndex, 1, 1, 8).setValues([[
      nomor, nama, kelas, fotoUrl || currentFoto, visi, misi1, misi2, misi3
    ]]);
  }
  return { ok: true };
}

/**
 * Hapus kandidat berdasarkan Nomor. Dipanggil dari dashboard.html
 * (action: deleteCandidate).
 */
function deleteCandidate(nomor) {
  if (!nomor) return { ok: false, error: 'Nomor kandidat wajib diisi.' };
  var sheet = getSheet(SHEET_KANDIDAT);
  var rowIndex = findKandidatRowIndex(sheet, nomor);
  if (rowIndex === -1) return { ok: false, error: 'Kandidat dengan nomor tersebut tidak ditemukan.' };
  sheet.deleteRow(rowIndex);
  return { ok: true };
}

/* ---------- Statistik pemilih & partisipasi ---------- */
function getVoterStats() {
  var sheet = getSheet(SHEET_PEMILIH);
  var data = sheet.getDataRange().getValues();
  var totalSiswa = 0, totalGuru = 0;
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === '' || data[i][0] === null) continue;
    if (String(data[i][2]).toLowerCase() === 'guru') totalGuru++;
    else totalSiswa++;
  }
  return { totalSiswa: totalSiswa, totalGuru: totalGuru, total: totalSiswa + totalGuru };
}

/* ---------- Suara ---------- */
function checkVoted(id) {
  var sheet = getSheet(SHEET_SUARA);
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return { voted: true };
  }
  return { voted: false };
}

function getVoterCount() {
  var sheet = getSheet(SHEET_SUARA);
  var lastRow = sheet.getLastRow();
  return { count: Math.max(0, lastRow - 1) };
}

function getTally() {
  var sheet = getSheet(SHEET_SUARA);
  var data = sheet.getDataRange().getValues();
  var tally = {};
  for (var i = 1; i < data.length; i++) {
    var nomor = data[i][1];
    if (nomor === '' || nomor === null) continue;
    tally[nomor] = (tally[nomor] || 0) + 1;
  }
  return { tally: tally };
}

function castVote(id, nomor) {
  if (!id || !nomor) return { ok: false, error: 'ID atau nomor kandidat kosong.' };

  // Validasi format ID di server (jangan cuma percaya validasi di browser,
  // karena API ini bisa dipanggil langsung tanpa lewat website)
  if (!ID_REGEX.test(String(id))) {
    return { ok: false, error: 'Format ID tidak valid.' };
  }

  // ID harus benar-benar terdaftar sebagai pemilih di tab Pemilih
  if (!findPemilihById(id)) {
    return { ok: false, error: 'ID tidak terdaftar sebagai pemilih.' };
  }

  // Validasi nomor kandidat benar-benar terdaftar di sheet Kandidat
  var validNomors = getCandidates().map(function (c) { return String(c.nomor); });
  if (validNomors.indexOf(String(nomor)) === -1) {
    return { ok: false, error: 'Nomor kandidat tidak valid.' };
  }

  // LockService mencegah dua pemilih yang submit di detik yang sama saling menimpa data
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet(SHEET_SUARA);
    var data = sheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(id)) {
        return { ok: false, alreadyVoted: true };
      }
    }
    sheet.appendRow([id, nomor, new Date()]);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Status hasil akhir (dipakai dashboard.html & index.html) ---------- */
function getResultStatus() {
  var flag = PropertiesService.getScriptProperties().getProperty('RESULT_PUBLISHED');
  var published = flag === 'true';
  var out = { published: published };
  if (published) {
    out.tally = getTally().tally;
  }
  return out;
}

/**
 * Set/hapus status "hasil final sudah boleh dilihat pemilih".
 * Dipanggil dari dashboard.html (action: publishResult, {published: true|false}).
 */
function publishResult(published) {
  PropertiesService.getScriptProperties().setProperty('RESULT_PUBLISHED', published ? 'true' : 'false');
  return { ok: true, published: !!published };
}

/* ============================================================
   UPLOAD FOTO KANDIDAT
   ============================================================ */
function showUploadFotoDialog() {
  var html = HtmlService.createHtmlOutputFromFile('UploadFoto')
    .setWidth(420)
    .setHeight(480);
  SpreadsheetApp.getUi().showModalDialog(html, 'Upload Foto Kandidat');
}

/** Dipanggil dari dialog sidebar untuk mengisi dropdown pilihan kandidat. */
function getKandidatList() {
  return getCandidates().map(function (c) {
    return { nomor: c.nomor, nama: c.nama };
  });
}

function getOrCreateFotoFolder() {
  var it = DriveApp.getFoldersByName(FOTO_FOLDER_NAME);
  if (it.hasNext()) return it.next();
  return DriveApp.createFolder(FOTO_FOLDER_NAME);
}

/**
 * Simpan foto (base64) ke Google Drive, jadikan bisa diakses publik
 * (view-only), dan kembalikan URL-nya. TIDAK menulis ke sheet — pemanggil
 * yang menentukan mau ditulis ke baris mana.
 */
function saveFotoBlob(nomor, base64Data, mimeType, fileName) {
  if (!base64Data || !mimeType) return { ok: false, error: 'File foto tidak valid.' };
  if (mimeType.indexOf('image/') !== 0) return { ok: false, error: 'File harus berupa gambar.' };

  var safeName = 'kandidat-' + nomor + '-' + new Date().getTime();
  var bytes = Utilities.base64Decode(base64Data);
  var blob = Utilities.newBlob(bytes, mimeType, safeName);

  var folder = getOrCreateFotoFolder();
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var fileId = file.getId();
  var directUrl = 'https://lh3.googleusercontent.com/d/' + fileId;
  return { ok: true, url: directUrl };
}

/**
 * Dipanggil dari dialog sidebar UploadFoto.html (google.script.run).
 * @param {string|number} nomor  Nomor urut kandidat
 * @param {string} base64Data    Isi file dalam base64 (tanpa prefix data:...)
 * @param {string} mimeType      Tipe file, misal "image/jpeg"
 * @param {string} fileName      Nama file asli (untuk penamaan di Drive)
 */
function saveFotoKandidat(nomor, base64Data, mimeType, fileName) {
  if (!nomor) return { ok: false, error: 'Pilih kandidat terlebih dahulu.' };

  var sheet = getSheet(SHEET_KANDIDAT);
  var rowIndex = findKandidatRowIndex(sheet, nomor);
  if (rowIndex === -1) return { ok: false, error: 'Kandidat dengan nomor tersebut tidak ditemukan.' };

  var saved = saveFotoBlob(nomor, base64Data, mimeType, fileName);
  if (!saved.ok) return saved;

  sheet.getRange(rowIndex, 4).setValue(saved.url); // kolom D = Foto
  return { ok: true, url: saved.url };
}
