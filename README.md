# Site Survey

Aplikasi PWA untuk survei lokasi konstruksi: buat proyek, unggah denah (gambar/PDF), tandai temuan di denah, lampirkan foto, dan kelola punch list.

## Arsitektur

| Bagian | Teknologi |
| --- | --- |
| Frontend | React 19 + Vite + Tailwind CSS 4 (PWA, bisa dipasang di HP) |
| Login | Akun email & password di Google Sheets, lewat Google Apps Script |
| Database | **Google Sheets**, lewat Google Apps Script (`apps-script/Code.gs`) |
| Penyimpanan foto & denah | **Google Drive**, lewat Google Apps Script |
| Laporan | **Export Excel (.xlsx)**, dibuat oleh Google Apps Script |

Firebase (Auth & Firestore) dan Cloudinary **tidak dipakai lagi**.

Setiap perubahan temuan (pin) dan foto langsung tampil di layar, lalu dikirim ke Apps Script di latar belakang. Saat offline, perubahan disimpan di perangkat (IndexedDB) dan dikirim otomatis begitu online lagi.

## Setup Google Apps Script

1. Buat **Google Spreadsheet** baru (misalnya "Site Survey DB").
2. Buka **Extensions → Apps Script**.
3. Ganti isi `Code.gs` dengan isi file [`apps-script/Code.gs`](apps-script/Code.gs).
4. Klik ⚙️ **Project Settings**, centang **Show "appsscript.json" manifest file in editor**, lalu ganti isi `appsscript.json` dengan [`apps-script/appsscript.json`](apps-script/appsscript.json).
5. Di editor, pilih fungsi `setup`, lalu klik **Run**. Berikan izin yang diminta (Sheets, Drive, external request).
   Fungsi ini membuat sheet `users`, `sessions`, `projects`, `plans`, `pins`, `categories` serta folder **Site Survey** di Google Drive.
6. Klik **Deploy → New deployment** → tipe **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
7. Salin **Web app URL** (`https://script.google.com/macros/s/.../exec`).

> Setiap kali `Code.gs` diubah, buat versi baru: **Deploy → Manage deployments → Edit → Version: New version**. URL-nya tetap sama.

**Admin:** user pertama yang mendaftar otomatis menjadi admin. Email admin lain bisa ditambahkan di `ADMIN_EMAILS` pada `Code.gs`, atau dari menu **Admin → Users** di aplikasi.

**Login & keamanan:** password disimpan dalam bentuk hash (salt + HMAC-SHA256 berulang), tidak pernah dalam teks asli. Setiap login menghasilkan token sesi (berlaku 30 hari) yang disimpan dalam bentuk hash di sheet `sessions`. Login dikunci 10 menit setelah 10 kali gagal. Admin bisa **Reset Password** dan **menonaktifkan** user dari menu **Admin → Users**.

> Akun lama di Firebase Authentication tidak ikut pindah. Semua user perlu **Daftar** ulang sekali di aplikasi.

## Menjalankan aplikasi

```bash
cp .env.example .env        # isi VITE_APPS_SCRIPT_URL dengan Web app URL dari langkah 7
npm install
npm run dev
```

Build produksi: `npm run build` (hasilnya ada di folder `dist/`).

### Deploy ke Vercel

1. Import repo ini di Vercel (framework terdeteksi otomatis sebagai Vite).
2. **Settings → Environment Variables**: tambahkan `VITE_APPS_SCRIPT_URL`.
3. Deploy. File `vercel.json` sudah mengatur routing SPA.

Environment variable lama `CLOUDINARY_*` bisa dihapus dari Vercel.

## Data di Google Sheets

| Sheet | Isi |
| --- | --- |
| `users` | email, role (`admin`/`member`), status nonaktif, hash password |
| `sessions` | sesi login aktif (hash token) |
| `projects` | nama proyek, pembuat, anggota |
| `plans` | denah per proyek + ID file Google Drive |
| `pins` | temuan: posisi, status, kategori, catatan, foto (ID file Drive) |
| `categories` | kategori temuan + warna |

## Export Excel

Tombol **⬇ Excel** tersedia di:
- **Halaman denah proyek**: semua temuan dalam proyek.
- **Punch List**: temuan pada satu denah.
- **Admin → Projects**: per proyek.
- **Admin → Storage**: semua data.

File `.xlsx` berisi sheet **Punch List** (detail temuan + link foto Google Drive) dan **Ringkasan** (jumlah temuan per status untuk setiap denah).
