/* =========================================================================
   DASHBOARD.JS — logika dashboard panitia
   Bergantung pada common.js (dimuat lebih dulu di dashboard.html) untuk:
   API_URL, SEKOLAH, TAHUN_AJARAN, apiGet, apiPost, esc, fallbackAvatar,
   toast, downloadCsvTemplate, downloadXlsxTemplate, parseCsvLines,
   parseXlsxFile.
   ========================================================================= */

const TALLY_POLL_MS = 5000;

const state = {
  screen: apiConfigured() ? 'login' : 'setup',
  tab: 'kandidat',
  admin:null,
  loginError:'',
  submitting:false,
  netError:'',
  diagResult:null, diagRunning:false,
  candidates:[],
  voters:[], voterStats:{totalSiswa:0,totalGuru:0,total:0},
  voterSearch:'', voterRoleFilter:'ALL', voterKelasFilter:'ALL', voterStatusFilter:'ALL',
  voterCount:0, tally:null, published:false,
  editingCandidate:null,
  photoBase64:null, photoType:null, photoName:null,
  deleteTarget:null,
  editingVoter:null, deleteVoterTarget:null,
  importOpen:false, importMode:'file', importText:'', importResult:null, importFileName:'',
  formError:'',
  pollHandle:null,
  countdown:null,
  showReveal:false
};

const app = document.getElementById('app');

/* ============ render utama ============ */
function render(){
  document.body.classList.toggle('on-login', state.screen === 'login' || state.screen === 'setup');

  if(state.screen === 'setup'){ app.innerHTML = screenSetup(); return; }
  if(state.screen === 'login'){ app.innerHTML = screenLogin(); return; }

  app.innerHTML = `
    <div class="app-shell">
      ${topbar()}
      <div class="tabs">
        <button class="tab-btn ${state.tab==='kandidat'?'active':''}" data-action="tab" data-tab="kandidat">Kelola Kandidat</button>
        <button class="tab-btn ${state.tab==='pemilih'?'active':''}" data-action="tab" data-tab="pemilih">Kelola Pemilih</button>
        <button class="tab-btn ${state.tab==='pantau'?'active':''}" data-action="tab" data-tab="pantau">Pantau Suara</button>
      </div>
      <div class="main">
        ${state.netError ? '<div class="net-error">'+esc(state.netError)+'</div>' : ''}
        ${state.tab === 'kandidat' ? tabKandidat() : state.tab === 'pemilih' ? tabPemilih() : tabPantau()}
      </div>
    </div>`;

  if(state.editingCandidate !== null) app.innerHTML += modalCandidateForm(state.editingCandidate);
  if(state.deleteTarget) app.innerHTML += modalConfirmDelete(state.deleteTarget);
  if(state.editingVoter !== null) app.innerHTML += modalVoterForm(state.editingVoter);
  if(state.deleteVoterTarget) app.innerHTML += modalConfirmDeleteVoter(state.deleteVoterTarget);
  if(state.importOpen) app.innerHTML += modalImport();
  if(state.countdown !== null) app.innerHTML += screenCountdown();
  if(state.showReveal) app.innerHTML += screenReveal();
}

function topbar(){
  return `
  <div class="topbar dark">
    <div class="brand">
      <div class="brand-mark"><img src="assets/img/logo-smp2sragi.png" alt="Logo SMP 2 Sragi"></div>
      <div class="brand-text">
        <p class="school">${esc(SEKOLAH)} · ${esc(TAHUN_AJARAN)}</p>
        <p class="title">Dashboard Panitia Pilketos</p>
      </div>
    </div>
    <div class="who">
      <span>${esc(state.admin.nama)}</span>
      <button class="logout-btn" data-action="logout">Keluar</button>
    </div>
  </div>`;
}

function screenSetup(){
  return `<div class="login-shell"><div class="admin-card">
    <h1>Belum dikonfigurasi</h1>
    <p class="sub">Isi <code>API_URL</code> di bagian atas <code>assets/js/common.js</code> dengan URL Web App Google Apps Script kamu.</p>
  </div></div>`;
}

function screenLogin(){
  return `
  <div class="login-shell">
    <div class="admin-card">
      <div class="eyebrow"><img src="assets/img/logo-smp2sragi.png" alt="Logo SMP 2 Sragi"></div>
      <h1>Dashboard Panitia</h1>
      <p class="sub">Khusus panitia pemilihan ketua OSIS. Kelola pemilih, kandidat &amp; pantau jalannya suara.</p>
      ${state.loginError ? '<div class="form-error">'+esc(state.loginError)+'</div>' : ''}
      <div class="field">
        <label for="in-user">Username</label>
        <input id="in-user" autocomplete="username" placeholder="username panitia">
      </div>
      <div class="field">
        <label for="in-pass">Password</label>
        <input id="in-pass" type="password" autocomplete="current-password" placeholder="••••••••">
      </div>
      <button class="submit-btn" data-action="login" ${state.submitting?'disabled':''}>${state.submitting?'Memeriksa…':'Masuk Dashboard'}</button>
      <button class="diag-link" data-action="run-diag">${state.diagRunning?'Menguji koneksi…':'Tombol/login tidak berfungsi? Tes koneksi ke server'}</button>
      ${state.diagResult ? '<div class="diag-box '+(state.diagResult.ok?'ok':'err')+'">'+esc(state.diagResult.message)+'</div>' : ''}
    </div>
  </div>`;
}

/**
 * Tes koneksi API_URL secara langsung, untuk membedakan "tombol tidak
 * berfungsi karena bug" vs "backend belum ter-deploy dengan benar" — sebab
 * paling umum kalau dashboard terasa tidak merespons sama sekali.
 * Menguji GET dan POST terpisah karena keduanya bisa gagal dengan sebab
 * berbeda (contoh nyata: GET berhasil tapi POST membalas "Aksi tidak
 * dikenal: undefined" — biasanya berarti API_URL di common.js sudah usang,
 * menunjuk ke deployment lama yang berbeda dari deployment aktif kamu).
 */
async function runDiagnostic(){
  state.diagRunning = true; state.diagResult = null; render();

  let getOk = false, getMsg = '';
  try{
    const res = await apiGet({action:'ping'});
    getOk = !!res.ok;
    if(!getOk) getMsg = 'Server merespons tapi format tidak dikenali.';
  }catch(err){ getMsg = err.message || 'Gagal terhubung.'; }

  let postOk = false, postMsg = '';
  try{
    const res = await apiPost({action:'ping'});
    postOk = !!res.ok;
    if(!postOk) postMsg = res.error || 'Server merespons tapi tidak pakai format yang diharapkan.';
  }catch(err){ postMsg = err.message || 'Gagal terhubung.'; }

  if(getOk && postOk){
    state.diagResult = { ok:true, message: 'Terhubung ke server dengan baik (GET & POST). Kalau tombol lain masih terasa tidak berfungsi, coba muat ulang halaman ini.' };
  } else if(getOk && !postOk){
    state.diagResult = { ok:false, message: 'GET ke server berhasil, tapi POST gagal (' + postMsg + '). Ini biasanya berarti: (1) API_URL di common.js menunjuk ke deployment LAMA yang sudah tidak dipakai — periksa Deploy > Manage deployments, pastikan URL-nya sama persis dengan yang di common.js; atau (2) Code.gs belum di-deploy ulang sebagai versi baru setelah diubah (Manage deployments > pensil > New version > Deploy, bukan cuma Save).' };
  } else if(!getOk && postOk){
    state.diagResult = { ok:false, message: 'POST berhasil tapi GET gagal (' + getMsg + '). Coba muat ulang halaman, atau periksa API_URL di common.js.' };
  } else {
    state.diagResult = { ok:false, message: getMsg || 'Gagal terhubung ke server.' };
  }
  state.diagRunning = false; render();
}

/* ============ tab: kelola kandidat ============ */
function tabKandidat(){
  const rows = state.candidates
    .slice()
    .sort((a,b)=> Number(a.nomor)-Number(b.nomor))
    .map(c => `
    <tr>
      <td><span class="cand-nomor">${esc(c.nomor)}</span></td>
      <td><div class="avatar-circle cand-thumb"><img src="${esc(c.foto)||fallbackAvatar(c.nama)}" data-fallback="${esc(encodeURIComponent(c.nama))}" alt=""></div></td>
      <td><strong>${esc(c.nama)}</strong></td>
      <td>${esc(c.kelas)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-outline" data-action="edit-candidate" data-nomor="${esc(c.nomor)}">Edit</button>
          <button class="btn btn-danger" data-action="ask-delete" data-nomor="${esc(c.nomor)}">Hapus</button>
        </div>
      </td>
    </tr>`).join('');

  return `
  <div class="section-head">
    <div>
      <h2>Kelola Kandidat</h2>
      <p>${state.candidates.length} kandidat terdaftar</p>
    </div>
    <button class="btn btn-primary" data-action="add-candidate">+ Tambah Kandidat</button>
  </div>
  ${state.candidates.length === 0 ? '<div class="empty-note">Belum ada kandidat. Klik "Tambah Kandidat" untuk mulai.</div>' : `
  <div class="table-scroll">
  <table class="data-table">
    <thead><tr><th>No.</th><th>Foto</th><th>Nama</th><th>Kelas</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </div>`}`;
}

function modalCandidateForm(c){
  const isNew = !c.nomor;
  const misiText = Array.isArray(c.misi) ? c.misi.join('\n') : (c.misi||'');
  const previewSrc = state.photoBase64 ? ('data:'+state.photoType+';base64,'+state.photoBase64) : (c.foto || '');
  return `
  <div class="modal-overlay" data-action="close-candidate-modal">
    <div class="modal-box">
      <h3>${isNew ? 'Tambah Kandidat' : 'Edit Kandidat'}</h3>
      <div class="photo-row">
        <div class="avatar-circle photo-preview"><img src="${esc(previewSrc)||fallbackAvatar(c.nama||'?')}" alt=""></div>
        <div>
          <label class="file-btn-label">📷 Pilih foto<input type="file" id="cf-foto" accept="image/*"></label>
          <p class="field-note">JPG/PNG, maks 5 MB. Kosongkan jika tidak ganti foto.</p>
        </div>
      </div>
      <div class="grid2">
        <div class="field">
          <label for="cf-nomor">Nomor urut</label>
          <input id="cf-nomor" inputmode="numeric" value="${esc(c.nomor||'')}" ${isNew?'':'disabled'} placeholder="1">
        </div>
        <div class="field">
          <label for="cf-kelas">Kelas</label>
          <input id="cf-kelas" value="${esc(c.kelas||'')}" placeholder="Contoh: IX A">
        </div>
      </div>
      <div class="field">
        <label for="cf-nama">Nama lengkap</label>
        <input id="cf-nama" value="${esc(c.nama||'')}" placeholder="Nama kandidat">
      </div>
      <div class="field">
        <label for="cf-visi">Visi</label>
        <input id="cf-visi" value="${esc(c.visi||'')}" placeholder="Satu kalimat visi">
      </div>
      <div class="field">
        <label for="cf-misi">Misi (satu baris = satu poin)</label>
        <textarea id="cf-misi" rows="4" placeholder="Misi 1&#10;Misi 2&#10;Misi 3">${esc(misiText)}</textarea>
      </div>
      ${state.formError ? '<div class="form-error">'+esc(state.formError)+'</div>' : ''}
      <div class="modal-actions">
        <button class="cancel" data-action="close-candidate-modal">Batal</button>
        <button class="confirm" data-action="save-candidate" ${state.submitting?'disabled':''}>${state.submitting?'Menyimpan…':'Simpan'}</button>
      </div>
    </div>
  </div>`;
}

function modalConfirmDelete(c){
  return `
  <div class="modal-overlay" data-action="close-delete-modal">
    <div class="modal-box confirm-box">
      <h3>Hapus kandidat?</h3>
      <p style="font-size:14px;color:var(--ink-soft);line-height:1.6;margin:0 0 20px;">Nomor ${esc(c.nomor)} — <strong>${esc(c.nama)}</strong> akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.</p>
      <div class="modal-actions">
        <button class="cancel" data-action="close-delete-modal">Batal</button>
        <button class="confirm danger" data-action="confirm-delete" ${state.submitting?'disabled':''}>${state.submitting?'Menghapus…':'Ya, hapus'}</button>
      </div>
    </div>
  </div>`;
}

/* ============ tab: kelola pemilih (guru & siswa) ============ */
function filteredVoters(){
  const q = state.voterSearch.trim().toLowerCase();
  return state.voters.filter(v => {
    if(state.voterRoleFilter !== 'ALL' && v.role !== state.voterRoleFilter) return false;
    if(state.voterKelasFilter !== 'ALL' && (v.kelas||'') !== state.voterKelasFilter) return false;
    if(state.voterStatusFilter === 'VOTED' && !v.sudahMemilih) return false;
    if(state.voterStatusFilter === 'NOT_VOTED' && v.sudahMemilih) return false;
    if(!q) return true;
    return String(v.id).toLowerCase().includes(q) || String(v.nama).toLowerCase().includes(q) || String(v.kelas||'').toLowerCase().includes(q);
  });
}

/** Daftar kelas unik dari data pemilih (buat isi dropdown filter Kelas),
 * diurutkan alami supaya "7A, 7B, 8A, 9C" dst bukan urutan abjad string. */
function distinctKelasList(){
  const set = new Set();
  state.voters.forEach(v => { if(v.kelas) set.add(v.kelas); });
  return Array.from(set).sort((a,b) => a.localeCompare(b, 'id', {numeric:true, sensitivity:'base'}));
}

function hasActiveVoterFilter(){
  return state.voterSearch.trim() !== '' || state.voterRoleFilter !== 'ALL' || state.voterKelasFilter !== 'ALL' || state.voterStatusFilter !== 'ALL';
}

function voterRowsHtml(list){
  if(list.length === 0){
    return `<tr><td colspan="6"><div class="empty-note" style="border:none;">Tidak ada pemilih yang cocok dengan pencarian/filter.</div></td></tr>`;
  }
  return list.map(v => `
    <tr>
      <td>${esc(v.id)}</td>
      <td><strong>${esc(v.nama)}</strong></td>
      <td>${v.kelas ? esc(v.kelas) : '<span style="color:var(--ink-soft);">—</span>'}</td>
      <td><span class="badge ${v.role==='Guru'?'badge-guru':'badge-siswa'}">${esc(v.role)}</span></td>
      <td><span class="badge ${v.sudahMemilih?'badge-voted':'badge-notvoted'}">${v.sudahMemilih?'Sudah memilih':'Belum memilih'}</span></td>
      <td>
        <div class="row-actions">
          <button class="btn btn-outline" data-action="edit-voter" data-id="${esc(v.id)}">Edit</button>
          <button class="btn btn-danger" data-action="ask-delete-voter" data-id="${esc(v.id)}">Hapus</button>
        </div>
      </td>
    </tr>`).join('');
}

/** Update tabel pemilih + ringkasan jumlah + tombol reset SAJA (tanpa
 * render ulang seluruh halaman) supaya fokus di kotak pencarian tidak
 * hilang tiap kali user mengetik. */
function updateVoterTableOnly(){
  const list = filteredVoters();
  const tbody = document.getElementById('voter-tbody');
  if(tbody) tbody.innerHTML = voterRowsHtml(list);

  const summary = document.getElementById('voter-filter-summary');
  if(summary) summary.textContent = `Menampilkan ${list.length} dari ${state.voterStats.total} pemilih.`;

  const resetBtn = document.getElementById('voter-reset-btn');
  if(resetBtn){
    resetBtn.outerHTML = hasActiveVoterFilter()
      ? '<button class="btn btn-outline" data-action="reset-voter-filter" id="voter-reset-btn">✕ Reset filter</button>'
      : '<span id="voter-reset-btn"></span>';
  }
}

function tabPemilih(){
  const filtered = filteredVoters();
  const kelasOptions = distinctKelasList();
  const isActive = (f) => f ? 'is-active' : '';
  return `
  <div class="section-head">
    <div>
      <h2>Kelola Pemilih</h2>
      <p>${state.voterStats.total} pemilih terdaftar — ${state.voterStats.totalSiswa} siswa, ${state.voterStats.totalGuru} guru</p>
    </div>
    <div class="head-actions">
      <button class="btn btn-outline" data-action="print-voter-cards" title="Mencetak sesuai hasil pencarian/filter yang sedang aktif">🖨 Cetak Kartu</button>
      <button class="btn btn-outline" data-action="open-import">⇪ Impor Massal</button>
      <button class="btn btn-primary" data-action="add-voter">+ Tambah Pemilih</button>
    </div>
  </div>
  <div class="stat-row">
    <button class="mini-stat ${isActive(state.voterRoleFilter==='ALL' && state.voterKelasFilter==='ALL' && state.voterStatusFilter==='ALL')}" data-action="quick-filter" data-role="ALL" data-status="ALL" title="Tampilkan semua pemilih">
      <div class="n">${state.voterStats.total}</div><div class="l">Total pemilih</div>
    </button>
    <button class="mini-stat ${isActive(state.voterRoleFilter==='Siswa')}" data-action="quick-filter" data-role="Siswa" title="Tampilkan siswa saja">
      <div class="n">${state.voterStats.totalSiswa}</div><div class="l">Siswa</div>
    </button>
    <button class="mini-stat ${isActive(state.voterRoleFilter==='Guru')}" data-action="quick-filter" data-role="Guru" title="Tampilkan guru saja">
      <div class="n">${state.voterStats.totalGuru}</div><div class="l">Guru</div>
    </button>
    <button class="mini-stat good ${isActive(state.voterStatusFilter==='VOTED')}" data-action="quick-filter" data-status="VOTED" title="Tampilkan yang sudah memberikan suara">
      <div class="n">${state.voterCount}</div><div class="l">Sudah memilih</div>
    </button>
  </div>
  <div class="toolbar">
    <input type="search" id="voter-search" placeholder="Cari ID, nama, atau kelas…" value="${esc(state.voterSearch)}">
    <select id="voter-kelas-filter">
      <option value="ALL" ${state.voterKelasFilter==='ALL'?'selected':''}>Semua Kelas</option>
      ${kelasOptions.map(k => `<option value="${esc(k)}" ${state.voterKelasFilter===k?'selected':''}>${esc(k)}</option>`).join('')}
    </select>
    <select id="voter-role-filter">
      <option value="ALL" ${state.voterRoleFilter==='ALL'?'selected':''}>Semua Role</option>
      <option value="Siswa" ${state.voterRoleFilter==='Siswa'?'selected':''}>Siswa</option>
      <option value="Guru" ${state.voterRoleFilter==='Guru'?'selected':''}>Guru</option>
    </select>
    <select id="voter-status-filter">
      <option value="ALL" ${state.voterStatusFilter==='ALL'?'selected':''}>Semua Status</option>
      <option value="VOTED" ${state.voterStatusFilter==='VOTED'?'selected':''}>Sudah memilih</option>
      <option value="NOT_VOTED" ${state.voterStatusFilter==='NOT_VOTED'?'selected':''}>Belum memilih</option>
    </select>
    ${hasActiveVoterFilter() ? '<button class="btn btn-outline" data-action="reset-voter-filter" id="voter-reset-btn">✕ Reset filter</button>' : '<span id="voter-reset-btn"></span>'}
  </div>
  <p class="filter-summary" id="voter-filter-summary">Menampilkan ${filtered.length} dari ${state.voterStats.total} pemilih.</p>
  <div class="table-scroll">
  <table class="data-table">
    <thead><tr><th>ID (NISN/NIP)</th><th>Nama</th><th>Kelas</th><th>Role</th><th>Status</th><th></th></tr></thead>
    <tbody id="voter-tbody">${voterRowsHtml(filtered)}</tbody>
  </table>
  </div>`;
}

function modalVoterForm(v){
  const isNew = !v.id;
  return `
  <div class="modal-overlay" data-action="close-voter-modal">
    <div class="modal-box">
      <h3>${isNew ? 'Tambah Pemilih' : 'Edit Pemilih'}</h3>
      <div class="grid2">
        <div class="field">
          <label for="vf-id">ID (NISN/NIP)</label>
          <input id="vf-id" inputmode="numeric" value="${esc(v.id||'')}" ${isNew?'':'disabled'} placeholder="Contoh: 0051234567">
        </div>
        <div class="field">
          <label for="vf-role">Role</label>
          <select id="vf-role">
            <option value="Siswa" ${((v.role||'Siswa')==='Siswa')?'selected':''}>Siswa</option>
            <option value="Guru" ${v.role==='Guru'?'selected':''}>Guru</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="vf-nama">Nama lengkap</label>
        <input id="vf-nama" value="${esc(v.nama||'')}" placeholder="Nama pemilih">
      </div>
      <div class="field">
        <label for="vf-kelas">Kelas</label>
        <input id="vf-kelas" value="${esc(v.kelas||'')}" placeholder="Contoh: IX A">
      </div>
      <p class="field-note">Kelas khusus untuk data siswa (wajib diisi kalau role Siswa) — boleh dikosongkan untuk Guru. Password login pemilih otomatis sama dengan ID-nya sendiri.</p>
      ${state.formError ? '<div class="form-error">'+esc(state.formError)+'</div>' : ''}
      <div class="modal-actions">
        <button class="cancel" data-action="close-voter-modal">Batal</button>
        <button class="confirm" data-action="save-voter" ${state.submitting?'disabled':''}>${state.submitting?'Menyimpan…':'Simpan'}</button>
      </div>
    </div>
  </div>`;
}

function modalConfirmDeleteVoter(v){
  return `
  <div class="modal-overlay" data-action="close-delete-voter-modal">
    <div class="modal-box confirm-box">
      <h3>Hapus pemilih?</h3>
      <p style="font-size:14px;color:var(--ink-soft);line-height:1.6;margin:0 0 20px;">${esc(v.nama)} (ID ${esc(v.id)}) akan dihapus dari daftar pemilih. Tindakan ini tidak bisa dibatalkan.</p>
      <div class="modal-actions">
        <button class="cancel" data-action="close-delete-voter-modal">Batal</button>
        <button class="confirm danger" data-action="confirm-delete-voter" ${state.submitting?'disabled':''}>${state.submitting?'Menghapus…':'Ya, hapus'}</button>
      </div>
    </div>
  </div>`;
}

function modalImport(){
  return `
  <div class="modal-overlay" data-action="close-import-modal">
    <div class="modal-box import-box">
      <h3>Impor Pemilih Massal</h3>
      <div class="import-tabs">
        <button class="import-tab-btn ${state.importMode==='file'?'active':''}" data-action="import-mode" data-mode="file">Upload File</button>
        <button class="import-tab-btn ${state.importMode==='paste'?'active':''}" data-action="import-mode" data-mode="paste">Tempel Manual</button>
      </div>

      ${state.importMode === 'file' ? `
      <div class="import-drop" id="import-drop">
        <p>${state.importFileName ? '📄 '+esc(state.importFileName)+' siap diimpor' : 'Seret file .csv/.xlsx ke sini, atau klik untuk pilih file'}</p>
        <label class="file-btn-label">Pilih File<input type="file" id="import-file" accept=".csv,.xlsx,.xls,text/csv"></label>
      </div>
      <div class="template-links">
        <a class="template-link" href="#" data-action="download-template-csv">⬇ Template CSV kosong</a>
        <a class="template-link" href="#" data-action="download-template-xlsx">⬇ Template Excel (.xlsx) kosong</a>
      </div>
      <p class="field-note" style="margin-top:10px;">Format kolom: <code>ID, Nama, Kelas, Role</code> (Kelas wajib untuk Siswa, boleh dikosongkan untuk Guru; Role boleh dikosongkan, default Siswa). Isi template, simpan, lalu upload lagi di sini — tidak perlu diketik ulang satu-satu. Baris pertama boleh header, otomatis dilewati.</p>
      ` : `
      <p style="font-size:13.5px;color:var(--ink-soft);line-height:1.6;margin:0 0 14px;">
        Satu baris = satu pemilih, format: <code>ID,Nama,Kelas,Role</code>. Bisa langsung tempel dari kolom spreadsheet.
      </p>
      <textarea id="import-text" placeholder="0051234567,Ahmad Fauzi,IX A,Siswa&#10;198501012010011001,Budi Santoso,,Guru">${esc(state.importText)}</textarea>
      `}

      ${state.formError ? '<div class="form-error" style="margin-top:14px;">'+esc(state.formError)+'</div>' : ''}
      ${state.importResult ? '<p class="import-result">✓ Ditambah: '+state.importResult.added+' · Diperbarui: '+state.importResult.updated+' · Dilewati (tidak valid): '+state.importResult.skipped+'</p>' : ''}
      <div class="modal-actions">
        <button class="cancel" data-action="close-import-modal">Tutup</button>
        <button class="confirm" data-action="run-import" ${state.submitting?'disabled':''}>${state.submitting?'Mengimpor…':'Impor Sekarang'}</button>
      </div>
    </div>
  </div>`;
}

/* ============ tab: pantau suara ============ */
function tabPantau(){
  const total = state.voterStats.total || 0;
  const count = state.voterCount || 0;
  const pct = total > 0 ? Math.min(1, count/total) : 0;
  const r = 78, circ = 2*Math.PI*r;
  const offset = circ * (1-pct);

  const tally = state.tally || {};
  const ranked = state.candidates
    .map(c => ({...c, votes: tally[c.nomor]||0}))
    .sort((a,b)=> b.votes - a.votes);
  const maxVotes = ranked[0] ? Math.max(1, ranked[0].votes) : 1;

  const tallyRows = ranked.map((c,i) => `
    <div class="tally-row ${i===0 && c.votes>0 ?'lead':''}">
      <div class="tn">${i+1}</div>
      <div class="tname">${esc(c.nama)}</div>
      <div class="tally-track"><div class="tally-fill" style="width:${(c.votes/maxVotes*100).toFixed(0)}%"></div></div>
      <div class="tv">${c.votes} suara</div>
    </div>`).join('');

  return `
  <div class="section-head">
    <div>
      <h2>Pantau Suara</h2>
      <p>Diperbarui otomatis tiap ${Math.round(TALLY_POLL_MS/1000)} detik</p>
    </div>
    <button class="btn btn-outline" data-action="refresh-pantau">↻ Segarkan sekarang</button>
  </div>
  <div class="monitor-grid">
    <div class="stat-card">
      <div class="ring-wrap">
        <svg width="170" height="170" viewBox="0 0 170 170">
          <circle class="ring-track" cx="85" cy="85" r="${r}" stroke-width="9" transform="rotate(-90 85 85)"/>
          <circle class="ring-fill" cx="85" cy="85" r="${r}" stroke-width="9" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" transform="rotate(-90 85 85)"/>
        </svg>
        <div class="ring-center">
          <div class="count">${count}</div>
          <div class="of">dari ${total} pemilih</div>
        </div>
      </div>
      <h3><span class="live-dot"></span>Partisipasi</h3>
      <p class="sub">${(pct*100).toFixed(0)}% pemilih sudah memilih</p>
      <div class="role-split">
        <span>Siswa: <b>${state.voterStats.totalSiswa}</b></span>
        <span>Guru: <b>${state.voterStats.totalGuru}</b></span>
      </div>
    </div>
    <div class="tally-card">
      <h3>Perolehan Suara Live</h3>
      <p class="sub">Data ini hanya terlihat oleh panitia sampai hasil diumumkan.</p>
      ${ranked.length ? tallyRows : '<p style="font-size:13.5px;color:var(--ink-soft);">Belum ada kandidat.</p>'}
      <div class="publish-box">
        ${state.published
          ? `<span class="badge badge-published">✓ Hasil sudah diumumkan</span>
             <div class="btn-row">
               <button class="btn btn-primary" data-action="replay-reveal">Tampilkan Hasil Akhir</button>
               <button class="btn btn-outline" data-action="unpublish">Batalkan pengumuman</button>
             </div>`
          : `<span class="txt">Kalau proses pemilihan sudah selesai, umumkan hasil final. Layar ini akan menampilkan countdown lalu mengungkap pemenang.</span>
             <button class="btn btn-accent" data-action="start-publish" ${state.submitting?'disabled':''}>Hitung Suara Akhir &amp; Umumkan</button>`
        }
      </div>
    </div>
  </div>`;
}

function screenCountdown(){
  const v = state.countdown;
  return `
  <div class="countdown-screen">
    <div class="countdown-label">Mengungkap Ketua OSIS Terpilih</div>
    <div class="countdown-num">${v > 0 ? v : '<img src="assets/img/esperogi-logo.png" alt="Esperogi Level Up!" class="countdown-logo">'}</div>
    <div class="countdown-sub">${v > 0 ? 'Bersiap…' : 'Mengumumkan hasil…'}</div>
  </div>`;
}

function confettiPieces(){
  const colors = ['#E8D6A6','#A2803C','#A81F30','#FCF9F0','#2E6B4E'];
  let out = '';
  for(let i=0;i<24;i++){
    const left = (Math.random()*100).toFixed(1);
    const delay = (Math.random()*1.2).toFixed(2);
    const dur = (2.4 + Math.random()*1.8).toFixed(2);
    const color = colors[i % colors.length];
    out += `<div class="confetti" style="left:${left}%;background:${color};animation-delay:${delay}s;animation-duration:${dur}s;"></div>`;
  }
  return out;
}

function screenReveal(){
  const tally = state.tally || {};
  const ranked = state.candidates
    .map(c => ({...c, votes: tally[c.nomor]||0}))
    .sort((a,b)=> b.votes - a.votes);
  const winner = ranked[0];
  const maxVotes = winner ? Math.max(1, winner.votes) : 1;

  if(!winner){
    return `<div class="reveal-screen"><button class="reveal-close" data-action="close-reveal">Tutup</button><p style="color:#fff">Belum ada suara masuk.</p></div>`;
  }

  return `
  <div class="reveal-screen">
    ${confettiPieces()}
    <button class="reveal-close" data-action="close-reveal">Tutup</button>
    <div class="reveal-inner">
      <p class="reveal-eyebrow">Terpilih Sebagai Ketua OSIS</p>
      <div class="winner-halo">
        <div class="halo-rays"></div>
        <div class="winner-photo"><img src="${esc(winner.foto) || fallbackAvatar(winner.nama)}" data-fallback="${esc(encodeURIComponent(winner.nama))}" alt="${esc(winner.nama)}"></div>
      </div>
      <h1>${esc(winner.nama)}</h1>
      <p class="kelas">${esc(winner.kelas)} · Nomor Urut ${esc(winner.nomor)}</p>
      <div class="rank-panel">
        ${ranked.map((c,i)=>`
          <div class="rank-row ${i===0?'winner':''}">
            <div class="rn">${i+1}</div>
            <div class="rname">${esc(c.nama)}</div>
            <div class="rank-bar-track"><div class="rank-bar-fill" style="width:${(c.votes/maxVotes*100).toFixed(0)}%"></div></div>
            <div class="rv">${c.votes} suara</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>`;
}

/* ============ actions: login ============ */
async function handleLogin(){
  state.loginError = '';
  const username = document.getElementById('in-user').value.trim();
  const password = document.getElementById('in-pass').value.trim();
  if(!username || !password){ state.loginError = 'Isi username dan password.'; render(); return; }
  state.submitting = true; render();
  try{
    const res = await apiPost({action:'adminLogin', username, password});
    if(!res.ok){ state.loginError = res.error || 'Login gagal.'; state.submitting=false; render(); return; }
    state.admin = {username, nama: res.nama || username};
    state.submitting = false;
    state.screen = 'app';
    await loadAll();
    startPolling();
  }catch(err){
    state.loginError = err.message || 'Gagal terhubung ke server. Coba lagi.'; state.submitting=false; render();
  }
}

async function loadAll(){
  try{
    const [cand, voters, voterStats, voterCount, status] = await Promise.all([
      apiGet({action:'getCandidates'}),
      apiGet({action:'getVoters'}),
      apiGet({action:'getVoterStats'}),
      apiGet({action:'getVoterCount'}),
      apiGet({action:'getResultStatus'})
    ]);
    state.candidates = Array.isArray(cand) ? cand : [];
    state.voters = Array.isArray(voters) ? voters : [];
    state.voterStats = voterStats || {totalSiswa:0,totalGuru:0,total:0};
    state.voterCount = voterCount.count || 0;
    state.published = !!status.published;
    const t = await apiGet({action:'getTally'});
    state.tally = t.tally || {};
    state.netError = '';
  }catch(err){
    state.netError = err.message || 'Gagal memuat sebagian data dari server.';
  }
  render();
}

function startPolling(){
  if(state.pollHandle) clearInterval(state.pollHandle);
  state.pollHandle = setInterval(() => {
    if(state.screen === 'app' && state.tab === 'pantau' && state.countdown === null && !state.showReveal) loadAll();
  }, TALLY_POLL_MS);
}

/* ============ actions: kandidat CRUD ============ */
function openAddCandidate(){
  state.editingCandidate = {};
  state.photoBase64 = null; state.photoType = null; state.photoName = null;
  state.formError = '';
  render();
}
function openEditCandidate(nomor){
  const c = state.candidates.find(x => String(x.nomor) === String(nomor));
  if(!c) return;
  state.editingCandidate = {...c};
  state.photoBase64 = null; state.photoType = null; state.photoName = null;
  state.formError = '';
  render();
}
function closeCandidateModal(){ state.editingCandidate = null; render(); }

function readPhotoFile(file){
  return new Promise((resolve, reject) => {
    if(!file){ resolve(null); return; }
    if(!file.type.startsWith('image/')){ reject(new Error('File harus berupa gambar.')); return; }
    if(file.size > 5*1024*1024){ reject(new Error('Ukuran file maksimal 5 MB.')); return; }
    const reader = new FileReader();
    reader.onload = () => resolve({base64: reader.result.split(',')[1], type: file.type, name: file.name});
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(file);
  });
}

async function saveCandidate(){
  state.formError = '';
  const nomor = document.getElementById('cf-nomor').value.trim();
  const kelas = document.getElementById('cf-kelas').value.trim();
  const nama = document.getElementById('cf-nama').value.trim();
  const visi = document.getElementById('cf-visi').value.trim();
  const misi = document.getElementById('cf-misi').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!nomor || !kelas || !nama){ state.formError = 'Nomor, nama, dan kelas wajib diisi.'; render(); return; }

  state.submitting = true; render();
  try{
    const payload = {action:'saveCandidate', nomor, kelas, nama, visi, misi};
    // PENTING: jangan baca ulang document.getElementById('cf-foto').files di sini.
    // Foto sudah dibaca & disimpan ke state.photoBase64 saat file dipilih
    // (lihat listener 'change' untuk #cf-foto). Setiap kali modal di-render
    // ulang (mis. setelah memilih foto), seluruh HTML modal dibuat ulang
    // lewat innerHTML, sehingga elemen <input type="file"> yang lama
    // (yang menyimpan file terpilih) diganti dengan elemen baru yang
    // filesnya selalu kosong — file yang tadi dipilih user tidak bisa
    // "dipindahkan" ke input baru tsb oleh browser. Makanya harus pakai
    // state.photoBase64 yang sudah tersimpan, bukan file input-nya lagi.
    if(state.photoBase64){ payload.foto = state.photoBase64; payload.fotoType = state.photoType; payload.fotoName = state.photoName; }
    const res = await apiPost(payload);
    state.submitting = false;
    if(!res.ok){ state.formError = res.error || 'Gagal menyimpan kandidat.'; render(); return; }
    state.editingCandidate = null;
    toast('Kandidat berhasil disimpan.');
    await loadAll();
  }catch(err){
    state.submitting = false;
    state.formError = err.message || 'Gagal menyimpan kandidat.';
    render();
  }
}

function askDelete(nomor){
  const c = state.candidates.find(x => String(x.nomor) === String(nomor));
  if(!c) return;
  state.deleteTarget = c;
  render();
}
async function confirmDelete(){
  const c = state.deleteTarget;
  if(!c) return;
  state.submitting = true; render();
  try{
    const res = await apiPost({action:'deleteCandidate', nomor: c.nomor});
    state.submitting = false;
    state.deleteTarget = null;
    if(!res.ok){ toast(res.error || 'Gagal menghapus kandidat.', 'err'); render(); return; }
    toast('Kandidat dihapus.');
    await loadAll();
  }catch(err){
    state.submitting = false; state.deleteTarget = null;
    toast(err.message || 'Gagal terhubung ke server.', 'err'); render();
  }
}

/* ============ actions: pemilih CRUD ============ */
function openAddVoter(){ state.editingVoter = {}; state.formError = ''; render(); }
function openEditVoter(id){
  const v = state.voters.find(x => String(x.id) === String(id));
  if(!v) return;
  state.editingVoter = {...v};
  state.formError = '';
  render();
}
function closeVoterModal(){ state.editingVoter = null; render(); }

async function saveVoter(){
  state.formError = '';
  const id = document.getElementById('vf-id').value.trim();
  const nama = document.getElementById('vf-nama').value.trim();
  const role = document.getElementById('vf-role').value;
  const kelas = document.getElementById('vf-kelas').value.trim();
  if(!id || !nama){ state.formError = 'ID dan nama wajib diisi.'; render(); return; }
  if(role === 'Siswa' && !kelas){ state.formError = 'Kelas wajib diisi untuk pemilih dengan role Siswa.'; render(); return; }

  state.submitting = true; render();
  try{
    const res = await apiPost({action:'saveVoter', id, nama, kelas, role});
    state.submitting = false;
    if(!res.ok){ state.formError = res.error || 'Gagal menyimpan pemilih.'; render(); return; }
    state.editingVoter = null;
    toast('Data pemilih berhasil disimpan.');
    await loadAll();
  }catch(err){
    state.submitting = false;
    state.formError = err.message || 'Gagal menyimpan pemilih.';
    render();
  }
}

function askDeleteVoter(id){
  const v = state.voters.find(x => String(x.id) === String(id));
  if(!v) return;
  state.deleteVoterTarget = v;
  render();
}
async function confirmDeleteVoter(){
  const v = state.deleteVoterTarget;
  if(!v) return;
  state.submitting = true; render();
  try{
    const res = await apiPost({action:'deleteVoter', id: v.id});
    state.submitting = false;
    state.deleteVoterTarget = null;
    if(!res.ok){ toast(res.error || 'Gagal menghapus pemilih.', 'err'); render(); return; }
    toast('Pemilih dihapus.');
    await loadAll();
  }catch(err){
    state.submitting = false; state.deleteVoterTarget = null;
    toast(err.message || 'Gagal terhubung ke server.', 'err'); render();
  }
}

/**
 * Cetak kartu pemilih kecil (bukan satu halaman penuh per orang) — cocok
 * dibagikan ke tiap siswa/guru berisi username & password login mereka
 * (password selalu sama dengan ID/NISN/NIP-nya sendiri). Mencetak sesuai
 * list yang diberikan (biasanya hasil filter/pencarian yang sedang aktif),
 * supaya panitia bisa cetak per role atau per rentang ID kalau perlu.
 */
function printVoterCards(list){
  if(!list || !list.length){ toast('Tidak ada data pemilih untuk dicetak. Coba ubah pencarian/filter.', 'err'); return; }

  const win = window.open('', '_blank');
  if(!win){ toast('Popup diblokir browser. Izinkan popup untuk situs ini lalu coba lagi.', 'err'); return; }

  // Base absolute supaya logo tetap tampil walau dibuka di jendela baru (about:blank)
  const logoUrl = new URL('assets/img/logo-smp2sragi.png', window.location.href).href;

  const cardsHtml = list.map(v => `
    <div class="card">
      <div class="card-head">
        <img src="${logoUrl}" alt="" onerror="this.style.display='none'">
        <span class="card-school">${esc(SEKOLAH)}<br><b>Kartu Pemilih Pilketos</b></span>
        <span class="card-role role-${v.role==='Guru'?'guru':'siswa'}">${esc(v.role)}</span>
      </div>
      <div class="card-name">${esc(v.nama)}${v.kelas ? ' <span class="card-kelas">· '+esc(v.kelas)+'</span>' : ''}</div>
      <table class="card-cred">
        <tr><td>Username</td><td>${esc(v.id)}</td></tr>
        <tr><td>Password</td><td>${esc(v.id)}</td></tr>
      </table>
      <div class="card-foot">${esc(TAHUN_AJARAN)} · login di halaman pemilihan</div>
    </div>`).join('');

  const html = `<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8">
<title>Kartu Pemilih — ${esc(SEKOLAH)}</title>
<style>
  @page{ size:A4; margin:9mm; }
  *{ box-sizing:border-box; }
  body{ font-family:Arial,Helvetica,sans-serif; margin:0; background:#fff; color:#14151F; }
  .toolbar{ padding:16px; text-align:center; border-bottom:1px solid #e5e5e5; margin-bottom:14px; }
  .toolbar button{ padding:11px 24px; border:none; border-radius:999px; background:#14151F; color:#fff; font-size:14px; font-weight:700; cursor:pointer; }
  .toolbar p{ font-size:12.5px; color:#6B7280; margin:10px 0 0; }
  .grid{ display:grid; grid-template-columns:repeat(3, 1fr); gap:3mm; padding:0 4mm; }
  .card{
    border:1px dashed #A7A7B0; border-radius:2.2mm; padding:2.6mm 3.2mm;
    width:100%; height:30mm; display:flex; flex-direction:column; justify-content:space-between;
    break-inside:avoid; page-break-inside:avoid;
  }
  .card-head{ display:flex; align-items:center; gap:1.6mm; }
  .card-head img{ width:6mm; height:6mm; object-fit:contain; flex-shrink:0; }
  .card-school{ font-size:5.6pt; line-height:1.25; color:#6B7280; text-transform:uppercase; letter-spacing:.02em; flex:1; }
  .card-school b{ display:block; font-size:6.2pt; color:#14151F; text-transform:none; }
  .card-role{ font-size:5.6pt; font-weight:700; padding:1mm 2mm; border-radius:999px; flex-shrink:0; }
  .card-role.role-siswa{ background:#E3E9F5; color:#28407A; }
  .card-role.role-guru{ background:#F1E4C9; color:#8A6710; }
  .card-name{ font-size:9.5pt; font-weight:700; line-height:1.2; margin:1.4mm 0; }
  .card-kelas{ font-size:7pt; font-weight:500; color:#6B7280; }
  .card-cred{ border-collapse:collapse; width:100%; }
  .card-cred td{ font-size:8pt; padding:0.4mm 0; }
  .card-cred td:first-child{ color:#6B7280; width:19mm; }
  .card-cred td:last-child{ font-family:'Courier New',monospace; font-weight:700; letter-spacing:.02em; }
  .card-foot{ font-size:5.4pt; color:#9CA3AF; text-align:right; }
  @media print{ .toolbar{ display:none; } .grid{ padding:0; } }
</style>
</head><body>
  <div class="toolbar">
    <button onclick="window.print()">🖨 Cetak Sekarang</button>
    <p>${list.length} kartu pemilih siap dicetak — 3 kartu per baris, potong mengikuti garis putus-putus.</p>
  </div>
  <div class="grid">${cardsHtml}</div>
</body></html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
}

function openImport(){ state.importOpen = true; state.importMode='file'; state.importText=''; state.importFileName=''; state.importResult=null; state.formError=''; render(); }
function closeImport(){ state.importOpen = false; render(); }
function setImportMode(mode){ state.importMode = mode; state.formError=''; render(); }

function handleImportFile(file){
  if(!file) return;
  state.importFileName = file.name;
  const isXlsx = /\.xlsx?$/i.test(file.name);
  if(isXlsx){
    parseXlsxFile(file)
      .then(list => { state.importText = list.map(r => [r.id, r.nama, r.kelas||'', r.role].join(',')).join('\n'); render(); })
      .catch(err => { state.formError = err.message; render(); });
    return;
  }
  const reader = new FileReader();
  reader.onload = () => { state.importText = String(reader.result || ''); render(); };
  reader.onerror = () => { state.formError = 'Gagal membaca file CSV.'; render(); };
  reader.readAsText(file);
}

async function runImport(){
  state.formError = ''; state.importResult = null;
  let text = state.importText;
  if(state.importMode === 'paste'){
    const ta = document.getElementById('import-text');
    if(ta) text = ta.value;
  }
  const list = parseCsvLines(text || '');
  if(!list.length){ state.formError = 'Tidak ada data untuk diimpor. Upload file atau tempel datanya dulu.'; render(); return; }

  state.submitting = true; render();
  try{
    const res = await apiPost({action:'importVoters', list});
    state.submitting = false;
    if(!res.ok){ state.formError = res.error || 'Gagal mengimpor data.'; render(); return; }
    state.importResult = res;
    toast('Impor pemilih selesai.');
    await loadAll();
  }catch(err){
    state.submitting = false;
    state.formError = err.message || 'Gagal mengimpor data.';
    render();
  }
}

/* ============ actions: publish & reveal hasil ============ */
function startPublish(){
  state.countdown = 3;
  render();
  const tick = () => {
    state.countdown -= 1;
    render();
    if(state.countdown > 0){ setTimeout(tick, 800); }
    else { setTimeout(doPublish, 850); }
  };
  setTimeout(tick, 800);
}
async function doPublish(){
  try{
    const res = await apiPost({action:'publishResult', published:true});
    if(!res.ok){ toast(res.error || 'Gagal mengumumkan hasil.', 'err'); }
    else { toast('Hasil final sudah diumumkan.'); }
  }catch(err){
    toast(err.message || 'Gagal terhubung ke server.', 'err');
  }
  state.countdown = null;
  await loadAll();
  state.showReveal = true;
  render();
}
function replayReveal(){
  state.countdown = 3;
  render();
  const tick = () => {
    state.countdown -= 1;
    render();
    if(state.countdown > 0){ setTimeout(tick, 800); }
    else { setTimeout(() => { state.countdown = null; state.showReveal = true; render(); }, 850); }
  };
  setTimeout(tick, 800);
}
function closeReveal(){ state.showReveal = false; render(); }
async function unpublish(){
  state.submitting = true; render();
  try{
    const res = await apiPost({action:'publishResult', published:false});
    state.submitting = false;
    if(!res.ok){ toast(res.error || 'Gagal membatalkan pengumuman.', 'err'); render(); return; }
    toast('Pengumuman dibatalkan, pemilih kembali melihat pemantauan partisipasi.');
    state.showReveal = false;
    await loadAll();
  }catch(err){
    state.submitting = false;
    toast(err.message || 'Gagal terhubung ke server.', 'err'); render();
  }
}

/* ============ event delegation (klik) ============ */
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if(!t) return;
  // .modal-overlay punya data-action="close-*" untuk fitur "klik di luar
  // modal untuk menutup". Tapi karena overlay adalah PEMBUNGKUS seluruh
  // modal-box, closest() juga bisa "menemukan" data-action ini walau yang
  // benar-benar diklik ada di DALAM modal-box (input, judul, dsb), karena
  // elemen di dalam modal-box sendiri tidak punya data-action lalu
  // pencarian naik terus sampai ke overlay. Maka: action milik overlay
  // hanya dijalankan kalau elemen yang benar-benar diklik (e.target)
  // ADALAH overlay itu sendiri, bukan salah satu anaknya.
  if(t.classList.contains('modal-overlay') && e.target !== t) return;
  const action = t.dataset.action;
  if(action === 'download-template-csv' || action === 'download-template-xlsx' || action === 'import-mode') e.preventDefault();

  if(action === 'login'){ handleLogin(); }
  else if(action === 'run-diag'){ runDiagnostic(); }
  else if(action === 'logout'){
    if(state.pollHandle) clearInterval(state.pollHandle);
    Object.assign(state, {screen:'login', admin:null, loginError:'', candidates:[], voters:[], netError:'', editingCandidate:null, deleteTarget:null, editingVoter:null, deleteVoterTarget:null, importOpen:false, tally:null, published:false, showReveal:false, pollHandle:null});
    render();
  }
  else if(action === 'tab'){ state.tab = t.dataset.tab; state.netError=''; render(); }
  else if(action === 'add-candidate'){ openAddCandidate(); }
  else if(action === 'edit-candidate'){ openEditCandidate(t.dataset.nomor); }
  else if(action === 'close-candidate-modal'){ closeCandidateModal(); }
  else if(action === 'save-candidate'){ saveCandidate(); }
  else if(action === 'ask-delete'){ askDelete(t.dataset.nomor); }
  else if(action === 'close-delete-modal'){ state.deleteTarget = null; render(); }
  else if(action === 'confirm-delete'){ confirmDelete(); }
  else if(action === 'add-voter'){ openAddVoter(); }
  else if(action === 'edit-voter'){ openEditVoter(t.dataset.id); }
  else if(action === 'close-voter-modal'){ closeVoterModal(); }
  else if(action === 'save-voter'){ saveVoter(); }
  else if(action === 'ask-delete-voter'){ askDeleteVoter(t.dataset.id); }
  else if(action === 'close-delete-voter-modal'){ state.deleteVoterTarget = null; render(); }
  else if(action === 'confirm-delete-voter'){ confirmDeleteVoter(); }
  else if(action === 'print-voter-cards'){ printVoterCards(filteredVoters()); }
  else if(action === 'quick-filter'){
    // Klik salah satu kartu ringkasan (mis. "Sudah memilih") mereset filter
    // lain dulu supaya hasilnya tidak membingungkan (contoh: filter Kelas
    // lama nyangkut lalu bikin "Guru" kelihatan kosong).
    state.voterSearch = '';
    state.voterKelasFilter = 'ALL';
    state.voterRoleFilter = t.dataset.role || 'ALL';
    state.voterStatusFilter = t.dataset.status || 'ALL';
    render();
  }
  else if(action === 'reset-voter-filter'){
    state.voterSearch = ''; state.voterRoleFilter = 'ALL'; state.voterKelasFilter = 'ALL'; state.voterStatusFilter = 'ALL';
    render();
  }
  else if(action === 'open-import'){ openImport(); }
  else if(action === 'close-import-modal'){ closeImport(); }
  else if(action === 'import-mode'){ setImportMode(t.dataset.mode); }
  else if(action === 'download-template-csv'){ downloadCsvTemplate(); }
  else if(action === 'download-template-xlsx'){ downloadXlsxTemplate(); }
  else if(action === 'run-import'){ runImport(); }
  else if(action === 'refresh-pantau'){ loadAll(); }
  else if(action === 'start-publish'){ startPublish(); }
  else if(action === 'replay-reveal'){ replayReveal(); }
  else if(action === 'close-reveal'){ closeReveal(); }
  else if(action === 'unpublish'){ unpublish(); }
});

/* ============ event delegation (input / change) ============ */
app.addEventListener('input', (e) => {
  if(e.target.id === 'voter-search'){
    state.voterSearch = e.target.value;
    updateVoterTableOnly(); // partial update — input TIDAK ikut di-render ulang, fokus tetap terjaga
  }
});
app.addEventListener('change', (e) => {
  if(e.target.id === 'voter-role-filter'){
    state.voterRoleFilter = e.target.value;
    render();
  }
  else if(e.target.id === 'voter-kelas-filter'){
    state.voterKelasFilter = e.target.value;
    render();
  }
  else if(e.target.id === 'voter-status-filter'){
    state.voterStatusFilter = e.target.value;
    render();
  }
  else if(e.target.id === 'cf-foto'){
    const file = e.target.files && e.target.files[0];
    if(file){
      readPhotoFile(file).then(photo => {
        state.photoBase64 = photo.base64; state.photoType = photo.type; state.photoName = photo.name;
        render();
      }).catch(err => { state.formError = err.message; render(); });
    }
  }
  else if(e.target.id === 'import-file'){
    const file = e.target.files && e.target.files[0];
    handleImportFile(file);
  }
});

/* drag & drop file ke area impor */
app.addEventListener('dragover', (e) => {
  const drop = e.target.closest && e.target.closest('#import-drop');
  if(drop){ e.preventDefault(); drop.classList.add('drag'); }
});
app.addEventListener('dragleave', (e) => {
  const drop = e.target.closest && e.target.closest('#import-drop');
  if(drop){ drop.classList.remove('drag'); }
});
app.addEventListener('drop', (e) => {
  const drop = e.target.closest && e.target.closest('#import-drop');
  if(drop){
    e.preventDefault(); drop.classList.remove('drag');
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    if(file) handleImportFile(file);
  }
});

app.addEventListener('error', (e) => {
  const img = e.target;
  if(img.tagName === 'IMG' && img.dataset.fallback && !img.dataset.fallbackApplied){
    img.dataset.fallbackApplied = '1';
    img.src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + img.dataset.fallback + '&backgroundType=gradientLinear';
  }
}, true);

render();
