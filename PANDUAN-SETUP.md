# Panduan Setup — Pilketos (revamp)

## Struktur file (dipisah lebih rapi lagi)

```
index.html            ← halaman pemilih (guru & siswa)
dashboard.html        ← halaman panitia
Code.gs               ← backend, ditempel di Apps Script pada Spreadsheet kamu
UploadFoto.html       ← dialog sidebar upload foto (opsional, di Apps Script)
assets/
  css/
    common.css        ← warna, tombol, badge, modal, tabel — dipakai kedua halaman
    index.css         ← khusus tampilan halaman pemilih
    dashboard.css     ← khusus tampilan dashboard panitia
  js/
    common.js         ← konfigurasi API_URL + fungsi API + toast + template impor
    index.js          ← logika halaman pemilih
    dashboard.js       ← logika dashboard panitia
```

`common.js` sekarang jadi **satu-satunya tempat** untuk mengisi `API_URL`,
`SEKOLAH`, dan `TAHUN_AJARAN` — sebelumnya harus diisi dua kali (di
`index.js` dan `dashboard.js`), sekarang cukup sekali karena kedua halaman
memuat `common.js` lebih dulu.

**Penting saat hosting:** folder `assets/` harus ikut diupload persis
strukturnya (jangan diratakan ke satu folder). `index.html` dan
`dashboard.html` memanggilnya lewat path relatif `assets/css/...` dan
`assets/js/...`.

## Apa yang berubah di revamp ini

- **Desain dirombak total**, dari tampilan kartu SaaS generik (kartu bulat
  seragam + gradasi + bayangan abu-abu di mana-mana) menjadi nuansa
  "buku registrasi/surat suara resmi": kertas hangat, font judul serif
  (Fraunces), cap nomor kandidat berbentuk stempel bulat, garis rambut
  alih-alih bayangan tebal di tabel, dan pembatas bergaya sobekan kupon di
  formulir login.
- **Notifikasi pakai toast** (muncul sebentar di bawah layar) untuk aksi
  simpan/hapus/impor, menggantikan banner hijau/merah yang menumpuk di
  atas halaman.
- **Jaring pengaman error JS:** kalau ada error tak terduga di dalam
  browser, sekarang muncul sebagai toast merah — supaya "tombol yang
  seolah tidak merespons" langsung kelihatan penyebabnya, bukan diam saja.
- **Tombol "Tes koneksi ke server"** di halaman login dashboard. Kalau
  merasa tombol/login tidak berfungsi, klik ini dulu — sistem akan bilang
  persis apakah masalahnya di internet kamu, di URL API yang salah, atau
  di pengaturan akses deployment Apps Script.
- **Diagnosis error jaringan lebih jelas:** kalau server Google Apps
  Script membalas halaman login Google (bukan data), sistem sekarang
  langsung menyebut penyebab paling umum: deployment belum di-set
  "Anyone" (Siapa saja), bukan cuma pesan generik "gagal terhubung".
- **Template impor massal sekarang tersedia dua format:**
  - **CSV** (seperti sebelumnya), dan
  - **Excel (.xlsx)** — dibuat langsung di browser, cocok untuk panitia
    yang lebih terbiasa isi data di Excel daripada CSV.

  Alurnya: buka tab **Kelola Pemilih → Impor Massal → unduh salah satu
  template → isi semua baris di Excel/Google Sheets/Notepad → simpan →
  seret filenya ke kotak upload (atau klik untuk memilih) → **Impor
  Sekarang**. Tidak perlu mengetik ulang satu-satu di form.

## 1. Setup backend (Apps Script)

`Code.gs` di revamp ini **tidak berubah** dari versi sebelumnya — logikanya
sudah benar dan teruji, jadi tidak perlu ditempel ulang kalau kamu sudah
pakai versi sebelumnya. Kalau setup dari nol:

1. Buka Google Spreadsheet kamu → **Extensions → Apps Script**.
2. Tempel isi `Code.gs`.
3. Tempel juga `UploadFoto.html` sebagai file HTML baru di project yang
   sama (opsional, dashboard sudah bisa upload foto sendiri).
4. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone** — ini penyebab paling sering kalau
     dashboard "terasa tidak merespons": kalau di-set selain "Anyone",
     browser pemilih/panitia akan diarahkan ke halaman login Google
     alih-alih menerima data, dan semua tombol yang bergantung pada data
     itu akan terlihat seperti tidak berfungsi.
5. Salin URL Web App yang muncul.
6. **Refresh spreadsheet-nya**, lalu klik menu **Pemilihan OSIS → 🛠 Setup
   Sheet Otomatis** untuk membuat sheet `Kandidat`, `Pemilih`, `Suara`,
   `Admin` kalau belum ada.
7. Isi sheet **Admin** (`Username | Password | Nama`) untuk akun panitia.

Kalau nanti mengubah `Code.gs` lagi, ingat **Manage deployments → New
version → Deploy** — sekadar menyimpan kode saja tidak cukup, perubahan
tidak akan ikut terpublish tanpa versi deployment baru.

## 2. Konfigurasi frontend

Di **`assets/js/common.js`**, cari baris di bagian paling atas:

```js
const API_URL = "https://script.google.com/macros/s/AKfycby.../exec";
```

Ganti dengan URL Web App dari langkah 1.5. Cukup diisi di satu file ini
saja, dipakai otomatis oleh `index.html` dan `dashboard.html`.

## 3. Hosting di GitHub Pages

- Upload seluruh isi folder ini (termasuk struktur folder `assets/`) ke
  repo GitHub Pages kamu, root atau subfolder — yang penting strukturnya
  tetap seperti di atas.
- `Code.gs` dan `UploadFoto.html` **tidak** ikut di-hosting di GitHub Pages
  — keduanya hanya untuk ditempel di Apps Script.

## 4. Alur pemakaian hari-H

1. Sebelum hari-H, panitia login ke `dashboard.html`:
   - **Kelola Pemilih**: buka Impor Massal, unduh template CSV atau
     Excel, isi untuk semua guru & siswa, upload kembali.
   - **Kelola Kandidat**: tambah kandidat + upload foto.
2. Guru/siswa buka `index.html`, login pakai NISN/NIP (password = ID
   sendiri), lalu memilih kandidat.
3. Panitia pantau progres di **Pantau Suara** (ring partisipasi,
   breakdown guru/siswa, perolehan suara live — hanya terlihat panitia).
4. Setelah selesai, klik **"Hitung Suara Akhir & Umumkan"** → countdown
   3‑2‑1 → reveal pemenang di dashboard. Pemilih yang sedang membuka
   halaman pemantauan otomatis melihat countdown yang sama dalam ≤ 6 detik.
5. Kalau perlu koreksi, klik **"Batalkan pengumuman"**.

## Kalau tombol masih terasa tidak berfungsi

1. Buka halaman login dashboard, klik **"Tombol/login tidak berfungsi?
   Tes koneksi ke server"** — baca pesannya, biasanya langsung menunjuk
   ke penyebabnya (URL salah, deployment belum "Anyone", dsb).
2. Buka DevTools browser (F12) → tab **Console** — toast merah yang
   muncul di layar juga tercatat di sini dengan detail lebih lengkap.
3. Pastikan kamu membuka file lewat **URL hosting (https://...github.io/...)**,
   bukan dengan membuka file HTML langsung dari komputer (`file://`) —
   permintaan ke Apps Script bisa diblokir browser kalau dibuka dari
   `file://`.

## Catatan keamanan

- Password admin (sheet `Admin`) dan password pemilih (= ID sendiri)
  tersimpan sebagai teks biasa — cukup untuk skala pemilihan OSIS
  sekolah, jangan pakai ulang password penting.
- Dashboard tetap butuh username+password valid di sheet `Admin`,
  divalidasi di server — bukan hanya di frontend.
