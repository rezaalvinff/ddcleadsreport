# DIPO Lead Handover

Aplikasi web internal untuk mencatat prospek HOT Mitsubishi DIPO **sekali input**, lalu otomatis:

1. menyimpan prospek ke **Supabase** (sumber kebenaran),
2. menentukan **wilayah pelaporan** dari domisili (database lokasi deterministik, Gemini hanya sebagai cadangan),
3. memperbarui spreadsheet **DIPO LEAD REPORT** di Google Sheets (satu tab per bulan, dibuat otomatis),
4. menyiapkan pesan **handover WhatsApp** untuk dikirim **manual** oleh Anda.

Prospek yang disubmit **ditumpuk dulu** sepanjang hari. Spreadsheet baru diperbarui ketika Anda menekan **Kirim sekarang** di Dashboard.

Aplikasi ini tidak terhubung ke Qiscus dan tidak memakai otomasi WhatsApp tidak resmi (tanpa Baileys, whatsapp-web.js, WAHA, Evolution API, browser automation, dsb.). Nomor WhatsApp Business Anda tidak pernah disambungkan ke layanan apa pun.

## Teknologi

Next.js 16 (App Router, server actions) · TypeScript · Tailwind CSS 4 · Supabase PostgreSQL + Auth · Google Sheets API (service account) · Gemini API (REST) · Vercel · Vitest.

## Halaman

| Halaman | Fungsi |
| --- | --- |
| Dashboard | Tombol **Kirim sekarang** + jumlah prospek yang menunggu dikirim. Total prospek per bulan/tahun, per source (META/GOOGLE/TIKTOK), per wilayah, disubmit hari ini, entri terbaru. Semua dari Supabase. |
| Tambah Prospek | Form input + klasifikasi wilayah otomatis + rekomendasi grup + pratinjau + cek nomor duplikat. Tombol *Submit Prospek*, *Submit & Prepare Handover*, *Reset Form*. |
| Data Prospek | Cari nama/nomor, filter bulan/tanggal laporan/wilayah/dealer/source/status sinkron, edit, hapus (dengan konfirmasi), sinkron ulang, paginasi. |
| Riwayat Handover | Status per grup: belum dikirim / pesan disalin / WhatsApp dibuka / ditandai terkirim (konfirmasi manual Anda). |
| Master Cabang | Kelola dealer dan grup WhatsApp (nama, dealer, wilayah, link undangan resmi, aktif/nonaktif). |
| Laporan Bulanan | Status kirim per tab, pratinjau isi tab dari database, kirim ulang per bulan / semua yang tertunda, tautan ke Google Sheets. |
| Pengaturan | Status konfigurasi, tes koneksi Google Sheets, cek model Gemini, daftar lokasi yang dipelajari (bisa dihapus). |

## Aturan bisnis penting

**Tanggal laporan.** `report_date = tanggal prospek manual` bila diisi, selain itu `tanggal submit (Asia/Jakarta)`. Nilai ini dihitung oleh trigger database (`leads_before_write`) sehingga konsisten di semua jalur. `created_at` tidak pernah berubah saat edit. Tanggal follow up hanya mengisi kolom FOLLOW UP. Entri terlambat (mis. prospek 31 Oktober yang diinput 16 November) masuk ke tab **October 2026**.

**Wilayah pelaporan** (5, tidak bisa diubah): JABODETABEK (DKI Jakarta, Bogor, Depok, Bekasi), JAWA BARAT (Jabar lainnya), BANTEN (termasuk Tangerang & Tangerang Selatan), JAWA TIMUR, SUMATERA & KALIMANTAN.

Urutan klasifikasi:
1. Database lokasi bawaan (`src/lib/location/data.ts`): seluruh 514 kota/kabupaten di 38 provinsi + alias ibu kota kabupaten/kecamatan umum (mis. *Muara Bungo → Kabupaten Bungo, Jambi*).
2. Lokasi yang sudah dipelajari (tabel `region_mappings`: hasil Gemini atau konfirmasi manual sebelumnya).
3. Gemini — **hanya teks domisili** yang dikirim. Gemini mengembalikan JSON terstruktur (kota, provinsi, wilayah, tingkat keyakinan); wilayahnya dicocokkan ulang dengan aturan provinsi aplikasi. Hasil yang tidak yakin/tidak konsisten **tidak** dipakai otomatis.
4. Konfirmasi manual. Lokasi ambigu (mis. *Banjar* = Kota Banjar, Jabar **atau** Kabupaten Banjar, Kalsel), di luar 5 wilayah (mis. *Semarang*), atau tidak dikenal selalu meminta konfirmasi; tidak ada wilayah yang ditebak.

Server memvalidasi ulang klasifikasi saat menyimpan (tanpa memanggil Gemini), sehingga status klasifikasi tidak bisa dipalsukan dari browser.

**Duplikat.** Setiap form punya `submission_id` unik (idempoten: klik ganda/kirim ulang tidak membuat dua prospek). Nomor telepon yang sudah ada memunculkan peringatan; Anda bisa memilih *Tetap simpan*.

**WhatsApp.** Pesan mengikuti template yang ditentukan. Tombol *Buka link grup* hanya muncul untuk link undangan resmi `https://chat.whatsapp.com/…`; tanpa link, aplikasi membuka WhatsApp Web dan Anda memilih grup manual. Aplikasi tidak pernah menyatakan pesan terkirim kecuali Anda menekan *Saya sudah mengirim*.

## Pengiriman ke Google Sheets

Alurnya **batch**: submit menumpuk, satu tombol mengirim semuanya.

- Prospek **selalu disimpan ke Supabase lebih dulu**, lalu masuk antrean. Submit terasa cepat karena tidak menunggu Google.
- Dashboard menampilkan jumlah yang menunggu beserta tab tujuannya. Tombol **Kirim sekarang** mengirim seluruh antrean, termasuk perubahan dari edit dan penghapusan.
- Tiap tab bulan dibangun ulang penuh dari database dalam **satu `batchUpdate` atomik**: ringkasan harian (NO, HARI/TANGGAL, SALES → GOOGLE/META/TIKTOK, TOTAL dengan rumus `SUM`, baris TOTAL hijau muda) lalu lima tabel wilayah (NO | NAMA | NOMOR TLP | LOCATION | DEALER | UNIT | FOLLOW UP | SOURCE, header biru muda, border, urut tanggal laporan). Karena itu tidak mungkin ada baris ganda; edit, pindah bulan, dan hapus selalu tercermin, dan format template selalu dipasang ulang.
- Tab bulan yang belum ada dibuat otomatis (judul seperti `November 2026`, urut kronologis); tab yang sudah ada tidak pernah diduplikasi.
- Pengiriman per bulan dilindungi **lock di database** + nomor revisi, sehingga pengiriman bersamaan tidak saling menimpa dengan data basi. Status per prospek ada di `spreadsheet_sync_logs` (pending / success / failed, `retry_count`, error).
- Status *Tersinkron* hanya diberikan setelah Google Sheets mengonfirmasi penulisan. Bila gagal, antrean tetap utuh dan tinggal ditekan lagi.
- Pengiriman juga bisa dipicu per bulan atau per prospek dari Laporan Bulanan dan Data Prospek.
- **Cadangan opsional:** bila `CRON_SECRET` diisi, Vercel Cron mengirim antrean yang tersisa sekali sehari (01:00 WIB) supaya tidak ada yang tertinggal kalau Anda lupa menekan tombol. Tanpa `CRON_SECRET`, pengiriman sepenuhnya manual.
- Tab bulanan **dihasilkan oleh aplikasi**. Perubahan manual di dalam tab bulanan akan tertimpa pada pengiriman berikutnya; ubah datanya lewat aplikasi. Tab lain (mis. catatan Anda) tidak disentuh.

## Database (Supabase)

Migrasi: `supabase/migrations/20261116000000_initial_schema.sql`.

| Tabel | Isi |
| --- | --- |
| `leads` | Prospek. `report_date` dikelola trigger; `created_at` immutable; `submission_id` unik (idempoten). |
| `dealers` | Master dealer/cabang (nama unik, kota, provinsi, wilayah, aktif). |
| `whatsapp_groups` | Grup tujuan (dealer, wilayah, link undangan resmi tervalidasi, aktif). |
| `region_mappings` | Lokasi yang dipelajari (Gemini/manual) sebagai cache. |
| `spreadsheet_sync_logs` | Status sinkron per prospek (`sync_status`, `error_message`, `retry_count`, `synced_at`). |
| `sheet_months` | Status per tab bulan (revisi, `sheet_id`, error terakhir, lock). |
| `lead_handovers` | Grup tujuan per prospek + waktu disalin / dibuka / ditandai terkirim. |

Keamanan: RLS aktif di semua tabel tanpa policy untuk `anon`/`authenticated`, dan semua hak akses tabel/fungsi dicabut dari kedua role tersebut. Anon key di browser tidak bisa membaca atau menulis data apa pun. Semua akses data dilakukan di server dengan service role setelah login diverifikasi (Supabase Auth + `ALLOWED_EMAILS`). Dealer/grup yang sudah dipakai tidak bisa dihapus (FK `restrict`); nonaktifkan saja.

## Setup

### 1. Supabase

1. Buat project di <https://supabase.com>.
2. Jalankan migrasi: buka **SQL Editor**, tempel isi `supabase/migrations/20261116000000_initial_schema.sql`, *Run*. (Atau dengan Supabase CLI: `supabase link --project-ref <ref>` lalu `supabase db push`.)
3. (Opsional, hemat waktu) Isi master cabang sekaligus: tempel isi `supabase/seed/001_master_cabang.sql` di SQL Editor lalu *Run*. Berisi 34 dealer dan 37 grup WhatsApp DDC, semuanya aktif. Aman dijalankan ulang.
4. **Authentication → Providers → Email**: aktif. **Authentication → Sign In / Providers**: matikan *Allow new users to sign up*.
5. **Authentication → Users → Add user**: buat akun Anda (email + password, centang *Auto Confirm User*).
6. **Project Settings → API**: salin Project URL, anon/publishable key, service_role/secret key.

### 2. Google Sheets

1. Buat spreadsheet baru di Google Drive Anda dengan judul **DIPO LEAD REPORT** (judul bisa juga diset dari Pengaturan).
2. Di <https://console.cloud.google.com>: buat/ pilih project → **APIs & Services → Enable APIs** → aktifkan **Google Sheets API**.
3. **IAM & Admin → Service Accounts → Create**. Setelah dibuat: **Keys → Add key → JSON** (unduh file).
4. Bagikan spreadsheet ke email service account (`…@….iam.gserviceaccount.com`) sebagai **Editor**.
5. Isi env: `GOOGLE_SHEETS_SPREADSHEET_ID` (bagian `<ID>` di URL `docs.google.com/spreadsheets/d/<ID>/edit`), `GOOGLE_SERVICE_ACCOUNT_EMAIL` (`client_email` di JSON), `GOOGLE_PRIVATE_KEY` (`private_key` di JSON, utuh termasuk baris BEGIN/END).

### 3. Gemini (opsional, cadangan klasifikasi)

1. Buat API key di <https://aistudio.google.com/apikey>.
2. Pilih model yang tersedia dan masuk free tier Anda — cek <https://ai.google.dev/gemini-api/docs/pricing> (daftar model & free tier berubah dari waktu ke waktu; mis. `gemini-2.5-flash-lite`).
3. Isi `GEMINI_API_KEY` dan `GEMINI_MODEL`, lalu buka **Pengaturan → Cek model Gemini** untuk memastikan model tersedia untuk key Anda.

Tanpa Gemini aplikasi tetap berjalan; domisili yang tidak ada di database lokasi wajib dikonfirmasi manual.

### 4. Environment variables

Salin `.env.example` ke `.env.local` (lokal) dan isi juga di Vercel:

| Variabel | Wajib | Keterangan |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ya | URL project Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ya | anon / publishable key (hanya untuk login) |
| `SUPABASE_SERVICE_ROLE_KEY` | ya | service_role / secret key — **server only** |
| `ALLOWED_EMAILS` | ya | email yang boleh login, dipisah koma |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | ya* | ID spreadsheet DIPO LEAD REPORT |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | ya* | email service account |
| `GOOGLE_PRIVATE_KEY` | ya* | private key service account — **server only** |
| `GEMINI_API_KEY` | opsional | **server only** |
| `GEMINI_MODEL` | opsional | nama model Gemini |
| `CRON_SECRET` | opsional | ≥ 16 karakter acak. Mengaktifkan pengiriman cadangan harian lewat Vercel Cron. Bila kosong, `/api/cron/sync` mati dan pengiriman sepenuhnya manual. |

\* Tanpa konfigurasi Google, prospek tetap tersimpan dan menunggu di antrean. Pengiriman akan menjelaskan variabel mana yang kurang, dan berhasil setelah konfigurasi lengkap.

### 5. Jalankan lokal

```bash
npm install
```

```bash
npm run dev
```

Buka <http://localhost:3000>, login dengan akun Supabase yang ada di `ALLOWED_EMAILS`, lalu isi **Master Cabang** (dealer & grup) sebelum menambah prospek — atau pakai file seed di langkah 1.

## Deploy (GitHub + Vercel)

1. Push repository ke GitHub.
2. Di <https://vercel.com/new> impor repository (framework terdeteksi: Next.js; build `next build`).
3. **Settings → Environment Variables**: isi semua variabel di atas untuk *Production* (dan *Preview* bila perlu). Untuk `GOOGLE_PRIVATE_KEY`, tempel nilai `private_key` apa adanya (format `\n` maupun baris baru didukung).
4. Deploy. Pastikan migrasi Supabase sudah dijalankan.
5. Cron (opsional): `vercel.json` menjadwalkan `/api/cron/sync` setiap hari pukul 18:00 UTC (01:00 WIB). Paket Vercel Hobby (gratis) mengizinkan cron sekali sehari, dengan ketepatan satu jam. Vercel otomatis mengirim `Authorization: Bearer $CRON_SECRET`. Lewati langkah ini bila ingin pengiriman sepenuhnya manual.
6. Setelah deploy: login → **Pengaturan → Tes koneksi Google Sheets** → **Cek model Gemini** → isi **Master Cabang** → tambah prospek uji → tekan **Kirim sekarang** di Dashboard dan cek tab bulan di spreadsheet.

## Pengujian

```bash
npm run typecheck
```

```bash
npm run lint
```

```bash
npm test
```

```bash
npm run build
```

Uji integrasi database (memerlukan server PostgreSQL lokal; membuat database sementara, menjalankan migrasi asli, lalu menghapusnya):

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/postgres" npm run test:integration
```

Cakupan:

- **Unit** (`tests/unit`): logika tanggal & zona waktu, normalisasi telepon, 9 kasus wajib klasifikasi + kasus ambigu/di luar wilayah/fallback Gemini, layout tab Sheets (ringkasan harian, total, warna, kolom, tabel kosong, urutan), validasi input, pesan & clipboard WhatsApp, tidak ada dependensi/URL WhatsApp tidak resmi, validasi env, semua server action memanggil `requireUser()` lebih dulu, modul rahasia tidak diimpor dari komponen klien, otorisasi cron.
- **Integrasi** (`tests/integration`, PostgreSQL asli + Google Sheets *test double*): trigger `report_date` & `created_at`, edit/hapus/pindah bulan, idempotensi `submission_id`, nomor duplikat, constraint, RLS & hak akses `anon`/`authenticated`, lock, pembuatan tab otomatis tanpa duplikat, ringkasan harian & total, pengelompokan wilayah, update tanpa duplikasi, hapus + hitung ulang, gagal → retry → sukses, 12 submit paralel, perubahan di tengah pengiriman, serta antrean batch (menumpuk lalu terkirim sekali tekan), dan file seed master cabang (jumlah, tautan dealer–grup, dan kecocokan kota dengan wilayah).

Yang **belum** diuji karena memerlukan kredensial Anda: panggilan nyata ke Google Sheets API, Gemini API, dan Supabase (PostgREST/Auth) yang ter-hosting. Lakukan langkah 6 di bagian Deploy sebagai uji penerimaan.

## Struktur

```
src/
  app/(app)/…            halaman yang memerlukan login + server actions
  app/login/             login Supabase Auth
  app/api/cron/sync/     pengiriman cadangan harian (CRON_SECRET)
  lib/location/          dataset lokasi, klasifikasi, Gemini, cache
  lib/sheets/            layout tab bulanan + gateway Google Sheets
  lib/sync/              mesin pengiriman (lock, revisi, retry)
  lib/leads/ handover/ master/ whatsapp/   logika bisnis
supabase/migrations/     skema database
supabase/seed/           data master cabang & grup WhatsApp (sekali jalan)
tests/                   unit & integrasi
```
