/* =========================================================================
   INDEX.JS — logika halaman pemilih (guru & siswa)
   Bergantung pada common.js (dimuat lebih dulu di index.html) untuk:
   API_URL, SEKOLAH, TAHUN_AJARAN, apiGet, apiPost, esc, fallbackAvatar,
   sleep, toast.
   ========================================================================= */

const MONITOR_POLL_MS = 6000;

/* ============ app state ============ */
const state = {
  screen: apiConfigured() ? 'login' : 'setup',
  user:null,
  candidates:[],
  openMisiNomor:null,
  confirmCandidate:null,
  submitting:false,
  loginError:'',
  netError:'',
  voterCount:0,
  totalPemilih:0,
  published:false,
  tally:null,
  revealDone:false,
  countdownVal:null,
  pollHandle:null
};

const app = document.getElementById('app');

function render(){
  document.body.classList.toggle('on-hero', state.screen === 'login' || state.screen === 'setup');
  document.body.classList.toggle('on-app', !(state.screen === 'login' || state.screen === 'setup'));

  let html = '';
  let stageClass = 'stage';
  if(state.screen === 'setup') html = screenSetup();
  else if(state.screen === 'login') html = screenLogin();
  else if(state.screen === 'vote'){ html = screenVote(); stageClass += ' top'; }
  else if(state.screen === 'thanks') html = screenThanks();
  else if(state.screen === 'monitor') html = state.published ? screenResult() : screenMonitor();

  if(state.screen === 'setup' || state.screen === 'login'){
    app.innerHTML = '<div class="shell"><div class="'+stageClass+'">'+html+'</div></div>';
  } else {
    app.innerHTML =
      '<div class="shell">'+topbar()+'<div class="'+stageClass+'">'+
      (state.netError ? '<div class="net-error">'+esc(state.netError)+'</div>' : '') +
      html+'</div></div>';
  }
  if(state.confirmCandidate){ app.innerHTML += modalConfirm(state.confirmCandidate); }
  if(state.countdownVal !== null){ app.innerHTML += screenCountdown(); }
}

function screenCountdown(){
  const v = state.countdownVal;
  return `
  <div class="countdown-screen">
    <div class="countdown-label">Mengungkap Ketua OSIS Terpilih</div>
    <div class="countdown-num">${v > 0 ? v : '✦'}</div>
    <div class="countdown-sub">${v > 0 ? 'Bersiap…' : 'Mengumumkan hasil…'}</div>
  </div>`;
}

async function runCountdownThenReveal(){
  for(const v of [3,2,1,0]){
    state.countdownVal = v;
    render();
    await sleep(v === 0 ? 700 : 800);
  }
  state.countdownVal = null;
  state.revealDone = true;
  render();
}

function topbar(){
  if(!state.user) return '';
  return `
  <div class="topbar light">
    <div class="brand">
      <div class="brand-mark">P</div>
      <div class="brand-text">
        <p class="school">${esc(SEKOLAH)} · ${esc(TAHUN_AJARAN)}</p>
        <p class="title">Pemilihan Ketua OSIS</p>
      </div>
    </div>
    <div class="who">
      <span><span class="role-pill">${esc(state.user.role||'Siswa')}</span><span class="name">${esc(state.user.nama)}</span></span>
      <button class="logout-btn" data-action="logout">Keluar</button>
    </div>
  </div>`;
}

/* ============ screen: setup ============ */
function screenSetup(){
  return `
  <div class="setup-box">
    <h2>Belum dikonfigurasi</h2>
    <p>Isi <code>API_URL</code> di bagian atas <code>assets/js/common.js</code> dengan URL Web App Google Apps Script kamu, lalu deploy ulang.</p>
    <ol>
      <li>Buka Apps Script project backend kamu.</li>
      <li>Deploy → New deployment → Web app.</li>
      <li>Salin URL yang dihasilkan ke variabel <code>API_URL</code> di <code>assets/js/common.js</code>.</li>
    </ol>
  </div>`;
}

/* ============ screen: login (guru & siswa) ============ */
function screenLogin(){
  return `
  <div class="login-wrap">
    <div class="login-intro">
      <div class="eyebrow-seal">P</div>
      <h1>Pemilihan Ketua OSIS ${esc(TAHUN_AJARAN)}</h1>
      <p>${esc(SEKOLAH)} — masuk dengan akun guru atau siswa kamu untuk memberikan suara. Satu orang, satu suara.</p>
      <div class="login-badges">
        <span class="login-badge">🔒 Satu akun satu suara</span>
        <span class="login-badge">⚡ Hasil real-time</span>
      </div>
    </div>
    <div class="ballot-card">
      ${state.loginError ? '<div class="form-error">'+esc(state.loginError)+'</div>' : ''}
      <div class="field">
        <label for="in-id">Username (NISN / NIP)</label>
        <input id="in-id" inputmode="numeric" autocomplete="username" placeholder="Contoh: 0051234567">
      </div>
      <div class="stub-perforation"></div>
      <div class="field">
        <label for="in-pass">Password</label>
        <input id="in-pass" type="password" inputmode="numeric" autocomplete="current-password" placeholder="Password kamu = NISN/NIP kamu">
        <p class="hint">Password default adalah ID (NISN/NIP) kamu sendiri.</p>
      </div>
      <button class="submit-btn" data-action="login" ${state.submitting?'disabled':''}>${state.submitting?'Memeriksa…':'Masuk'}</button>
    </div>
  </div>`;
}

/* ============ screen: vote ============ */
function candidateAvatarImg(c){
  return `<img src="${esc(c.foto) || fallbackAvatar(c.nama)}" data-fallback="${esc(encodeURIComponent(c.nama))}" alt="Foto ${esc(c.nama)}">`;
}

function screenVote(){
  const cards = state.candidates.map(c => {
    const open = state.openMisiNomor === c.nomor;
    return `
    <div class="candidate-card">
      <div class="candidate-nomor-stamp stamp">${esc(c.nomor)}</div>
      <div class="candidate-avatar-wrap">
        <div class="avatar-circle candidate-avatar">${candidateAvatarImg(c)}</div>
      </div>
      <div class="candidate-body">
        <h3>${esc(c.nama)}</h3>
        <p class="kelas">${esc(c.kelas)}</p>
        <button class="misi-toggle" data-action="toggle-misi" data-nomor="${esc(c.nomor)}">${open?'Sembunyikan visi & misi':'Lihat visi & misi'}</button>
        ${open ? `
        <div class="misi-panel">
          <p class="visi">"${esc(c.visi)}"</p>
          <ul>${(c.misi||[]).map(m=>'<li>'+esc(m)+'</li>').join('')}</ul>
        </div>` : ''}
        <button class="pilih-btn" data-action="ask-vote" data-nomor="${esc(c.nomor)}">Pilih Kandidat Ini</button>
      </div>
    </div>`;
  }).join('');

  return `
  <div class="vote-head">
    <h2>Pilih Ketua OSIS</h2>
    <p>Tap "Pilih Kandidat Ini" pada kandidat pilihanmu. Kamu akan diminta konfirmasi sebelum suara dikirim.</p>
  </div>
  <div class="candidate-grid">${cards}</div>`;
}

function modalConfirm(c){
  return `
  <div class="modal-overlay" data-action="close-modal">
    <div class="modal-box">
      <h3>Konfirmasi pilihan</h3>
      <p>Kamu memilih Nomor ${esc(c.nomor)} — <strong>${esc(c.nama)}</strong>. Pilihan tidak bisa diubah setelah dikirim. Lanjutkan?</p>
      <div class="modal-actions">
        <button class="cancel" data-action="close-modal">Batal</button>
        <button class="confirm danger" data-action="confirm-vote" ${state.submitting?'disabled':''}>${state.submitting?'Mengirim…':'Ya, kirim suara'}</button>
      </div>
    </div>
  </div>`;
}

function screenThanks(){
  return `
  <div class="thanks-box">
    <div class="stamp-check">✓</div>
    <h2>Suaramu sudah tercatat</h2>
    <p>Terima kasih sudah berpartisipasi, ${esc(state.user.nama)}. Hasil akhir akan diumumkan panitia di halaman ini begitu proses pemilihan selesai.</p>
    <button class="ghost-btn" data-action="goto-monitor">Lihat Pemantauan</button>
  </div>`;
}

/* ============ screen: monitor (partisipasi, sebelum hasil diumumkan) ============ */
function screenMonitor(){
  const total = state.totalPemilih || 0;
  const count = state.voterCount || 0;
  const pct = total > 0 ? Math.min(1, count/total) : 0;
  const r = 90, circ = 2*Math.PI*r;
  const offset = circ * (1-pct);

  const strip = state.candidates.map(c => `
    <div class="strip-item">
      <div class="avatar-circle">${candidateAvatarImg(c)}</div>
      <div class="n">No. ${esc(c.nomor)}</div>
    </div>`).join('');

  return `
  <div class="monitor-wrap">
    <div class="monitor-panel">
      <div class="ring-wrap">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle class="ring-track" cx="100" cy="100" r="${r}" stroke-width="10"/>
          <circle class="ring-fill" cx="100" cy="100" r="${r}" stroke-width="10" stroke-dasharray="${circ}" stroke-dashoffset="${offset}"/>
        </svg>
        <div class="ring-center">
          <div class="count">${count}</div>
          <div class="of">dari ${total} pemilih</div>
        </div>
      </div>
      <h2><span class="live-dot"></span>Pemantauan Partisipasi</h2>
      <p class="sub">Jumlah suara yang sudah masuk (guru &amp; siswa), diperbarui otomatis dari server.</p>
      <p class="strip-label">Kandidat yang bertarung</p>
      <div class="candidate-strip">${strip}</div>
      <p class="monitor-note">Hasil akhir akan otomatis tampil di halaman ini begitu panitia mengumumkannya.</p>
    </div>
  </div>`;
}

/* ============ screen: result (setelah admin publish & countdown selesai) ============ */
function screenResult(){
  const tally = state.tally || {};
  const ranked = state.candidates
    .map(c => ({...c, votes: tally[c.nomor] || 0}))
    .sort((a,b)=> b.votes - a.votes);
  const winner = ranked[0];
  const maxVotes = winner ? Math.max(1, winner.votes) : 1;

  if(!winner){
    return `<div class="result-wrap"><div class="result-hero"><p style="color:#fff;margin:0;">Belum ada suara masuk.</p></div></div>`;
  }

  return `
  <div class="result-wrap">
    <div class="result-hero">
      <div class="winner-halo">
        <div class="halo-rays"></div>
        <div class="winner-photo">${candidateAvatarImg(winner)}</div>
      </div>
      <p class="tag">TERPILIH SEBAGAI KETUA OSIS</p>
      <h1>${esc(winner.nama)}</h1>
      <p class="kelas">${esc(winner.kelas)} · Nomor Urut ${esc(winner.nomor)}</p>
    </div>
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
  </div>`;
}

/* ============ actions ============ */
async function handleLogin(){
  state.loginError = '';
  const id = document.getElementById('in-id').value.trim();
  const pass = document.getElementById('in-pass').value.trim();
  if(!id || !pass){ state.loginError = 'Isi username dan password terlebih dahulu.'; render(); return; }
  state.submitting = true; render();
  try{
    const res = await apiPost({action:'loginPemilih', id, password: pass});
    if(!res.ok){ state.loginError = res.error || 'Login gagal.'; state.submitting=false; render(); return; }
    state.user = {id, nama: res.nama, role: res.role || 'Siswa'};
    await afterLogin();
  }catch(err){
    state.loginError = err.message || 'Gagal terhubung ke server. Coba lagi.'; state.submitting=false; render();
  }
}

async function afterLogin(){
  state.submitting = true; render();
  try{
    const [cand, voted, voterCount, voterStats, status] = await Promise.all([
      apiGet({action:'getCandidates'}),
      apiGet({action:'checkVoted', id: state.user.id}),
      apiGet({action:'getVoterCount'}),
      apiGet({action:'getVoterStats'}),
      apiGet({action:'getResultStatus'})
    ]);
    state.candidates = Array.isArray(cand) ? cand : [];
    state.voterCount = voterCount.count || 0;
    state.totalPemilih = voterStats.total || 0;
    state.submitting = false;
    state.screen = voted.voted ? 'monitor' : 'vote';

    if(status.published){
      state.tally = status.tally || {};
      if(state.screen === 'monitor'){
        render();
        await runCountdownThenReveal();
      }
      state.published = true;
    }
  }catch(err){
    state.netError = err.message || 'Gagal memuat data kandidat.'; state.submitting=false;
  }
  render();
  startPolling();
}

async function refreshMonitor(){
  try{
    const [voterCount, voterStats, status] = await Promise.all([
      apiGet({action:'getVoterCount'}),
      apiGet({action:'getVoterStats'}),
      apiGet({action:'getResultStatus'})
    ]);
    state.voterCount = voterCount.count || 0;
    state.totalPemilih = voterStats.total || 0;
    const justPublished = status.published && !state.published;
    if(status.published){ state.tally = status.tally || {}; }
    state.published = !!status.published;

    if(justPublished && !state.revealDone && state.screen === 'monitor'){
      await runCountdownThenReveal();
      return;
    }
  }catch(err){ /* diamkan, biarkan angka lama tampil */ }
  render();
}

function startPolling(){
  if(state.pollHandle) clearInterval(state.pollHandle);
  state.pollHandle = setInterval(() => {
    if(state.screen === 'monitor' && state.countdownVal === null) refreshMonitor();
  }, MONITOR_POLL_MS);
}

async function submitVote(){
  const c = state.confirmCandidate;
  if(!c) return;
  state.submitting = true; render();
  try{
    const res = await apiPost({action:'vote', id: state.user.id, nomor: c.nomor});
    state.submitting = false;
    state.confirmCandidate = null;
    if(res.ok){
      state.screen = 'thanks';
    } else if(res.alreadyVoted){
      state.screen = 'monitor';
      await refreshMonitor();
      return;
    } else {
      state.netError = res.error || 'Gagal mengirim suara.';
    }
  }catch(err){
    state.submitting = false; state.confirmCandidate = null;
    state.netError = err.message || 'Gagal terhubung ke server. Coba lagi.';
  }
  render();
}

/* ============ event delegation ============ */
app.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if(!t) return;
  const action = t.dataset.action;

  if(action === 'login'){ handleLogin(); }
  else if(action === 'logout'){
    if(state.pollHandle) clearInterval(state.pollHandle);
    Object.assign(state, {screen:'login', user:null, candidates:[], loginError:'', netError:'', confirmCandidate:null, tally:null, published:false, revealDone:false, countdownVal:null, pollHandle:null});
    render();
  }
  else if(action === 'toggle-misi'){
    const n = t.dataset.nomor;
    state.openMisiNomor = state.openMisiNomor === n ? null : (state.candidates.find(c=>String(c.nomor)===String(n))||{}).nomor;
    render();
  }
  else if(action === 'ask-vote'){
    const n = t.dataset.nomor;
    state.confirmCandidate = state.candidates.find(c=>String(c.nomor)===String(n));
    render();
  }
  else if(action === 'close-modal'){ state.confirmCandidate = null; render(); }
  else if(action === 'confirm-vote'){ submitVote(); }
  else if(action === 'goto-monitor'){ state.screen='monitor'; refreshMonitor(); }
});

document.addEventListener('error', (e) => {
  const img = e.target;
  if(img.tagName === 'IMG' && img.dataset.fallback && !img.dataset.fallbackApplied){
    img.dataset.fallbackApplied = '1';
    img.src = 'https://api.dicebear.com/7.x/initials/svg?seed=' + img.dataset.fallback + '&backgroundType=gradientLinear';
  }
}, true);

render();
