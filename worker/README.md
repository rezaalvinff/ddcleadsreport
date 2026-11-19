# Worker WhatsApp — DDC Leads Report

Mengirim pesan handover ke grup WhatsApp secara otomatis.

## Baca ini dulu

Worker ini memakai **Baileys**, pustaka tidak resmi yang menyamar sebagai WhatsApp Web.

- **Melanggar Ketentuan Layanan WhatsApp.** Nomor yang dipakai bisa diblokir permanen, beserta seluruh riwayat chat di dalamnya.
- **Bukan jaminan.** Baileys mengikuti protokol yang tidak didokumentasikan. Versi yang dipakai di sini (`6.7.24`) terakhir dirilis Juli 2026. Kalau WhatsApp mengubah protokolnya sejak itu, worker bisa gagal tersambung sama sekali dan tidak ada yang bisa dilakukan selain menunggu pustakanya diperbarui.
- **Pengiriman manual tetap ada.** Setiap kegagalan terlihat di halaman handover, dan pesannya selalu bisa disalin lalu dikirim sendiri.

Kalau nomor yang dipakai adalah nomor WhatsApp Business utama, pertimbangkan memakai nomor terpisah lebih dulu.

## Nomor mana yang dipakai

Worker memakai nomor mana pun yang memindai QR — WhatsApp biasa maupun Business, keduanya punya fitur Perangkat Tertaut. Tidak ada pengaturan nomor di kode.

Dua syarat yang harus dipenuhi nomor tersebut:

1. **Sudah menjadi anggota grup tujuan.** Worker hanya bisa mengirim ke grup yang nomornya ikut di dalamnya.
2. **Namanya jelas.** Orang cabang akan melihat pesan datang dari nomor ini, bukan dari nomor Anda yang biasa. Beri nama profil yang gamblang, misalnya "DDC Leads", supaya tidak dikira spam.

Kalau bisa memilih, pakai nomor yang **sudah lama aktif dipakai normal**. Nomor yang baru dibuat lalu langsung mengirim pesan berpola justru lebih cepat dicurigai.

**Ganti nomor** berarti menghapus sesi lama lalu memindai QR dengan nomor baru:

```bash
rm -rf worker/.wa-session
```

## Kenapa tidak bisa di Vercel

Koneksi WhatsApp harus tetap terbuka dan sesinya tersimpan di disk. Vercel menjalankan fungsi dalam hitungan detik lalu mematikannya, tanpa penyimpanan permanen, dan dari IP yang berganti-ganti. Worker ini **menarik** antrean dari aplikasi, jadi tidak butuh alamat publik maupun port terbuka — file yang sama berjalan di laptop maupun VPS.

## Yang dibutuhkan

- Node.js 20 atau lebih baru
- Komputer yang menyala selama Anda mau mengirim
- HP dengan WhatsApp untuk memindai QR sekali

## Menjalankan

**1. Pasang dependensi** (sekali saja):

```bash
npm --prefix worker install
```

**2. Isi `WA_WORKER_SECRET` di Vercel** dengan teks acak minimal 24 karakter, lalu **Redeploy**:

```bash
openssl rand -hex 32
```

**3. Jalankan worker** dengan secret yang sama:

```bash
APP_URL=https://alamat-aplikasi-anda.vercel.app WA_WORKER_SECRET=secret-yang-sama npm --prefix worker start
```

**4. Pindai QR** yang muncul di terminal: WhatsApp di HP → **Setelan → Perangkat tertaut → Tautkan perangkat**.

Setelah tersambung, worker menunggu antrean. Biarkan terminalnya terbuka.

## Memakainya

Di **Tambah Prospek**, centang **"Kirim otomatis ke grup terpilih"** lalu submit. Pesan masuk antrean, dan worker mengirimnya dalam beberapa detik.

Status per grup terlihat di halaman handover prospek tersebut:

| Status | Artinya |
| --- | --- |
| Menunggu worker | Antre. Kalau diam lama, worker-nya mati atau secret-nya tidak cocok. |
| Terkirim otomatis | Worker mengonfirmasi WhatsApp menerima pesannya. |
| Kirim otomatis gagal | Alasannya ditulis. Kirim manual dari halaman yang sama. |

**Nama grup harus sama persis.** Worker mencocokkan nama grup di Master Cabang dengan nama grup di WhatsApp. Kalau berbeda satu huruf pun, hasilnya gagal dengan keterangan *"Grup ... tidak ditemukan"*. Nomor yang dipakai juga harus sudah menjadi anggota grup tersebut.

## Pengaturan tambahan

| Variabel | Bawaan | Keterangan |
| --- | --- | --- |
| `APP_URL` | — | Alamat aplikasi di Vercel. Wajib. |
| `WA_WORKER_SECRET` | — | Harus sama dengan yang di Vercel. Wajib. |
| `WA_POLL_SECONDS` | `8` | Jeda antar pengecekan antrean. |
| `WA_BATCH` | `5` | Maksimal pesan per pengecekan. |
| `WA_GAP_SECONDS` | `4` | Jeda antar pesan. Jangan dikecilkan — kiriman beruntun lebih mudah terdeteksi. |

## Pindah ke VPS

Salin folder `worker/` ke VPS, jalankan `npm install`, lalu jalankan dengan env yang sama. Scan QR sekali lagi di sana.

Supaya tetap hidup setelah SSH ditutup, pakai `pm2` atau systemd:

```bash
npx pm2 start worker/send-whatsapp.mjs --name ddc-wa
```

## Kalau bermasalah

**Sesi dicabut / minta QR terus** — hapus folder sesi lalu scan ulang:

```bash
rm -rf worker/.wa-session
```

**Antrean tidak jalan** — cek log worker. `HTTP 401` berarti secret tidak cocok dengan yang di Vercel; `HTTP 503` berarti `WA_WORKER_SECRET` belum diisi di Vercel atau belum di-redeploy.

Folder `.wa-session/` berisi kredensial login WhatsApp Anda. Jangan di-commit dan jangan dibagikan; sudah masuk `.gitignore`.
