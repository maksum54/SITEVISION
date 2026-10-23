# Site Survey

Aplikasi PWA untuk survei lokasi konstruksi: buat proyek, unggah denah (gambar/PDF), tandai temuan di denah, lampirkan foto, dan kelola punch list.

## Arsitektur

| Bagian | Teknologi |
| --- | --- |
| Frontend | React 19 + Vite + Tailwind CSS 4 (PWA, bisa dipasang di HP) |
| Login | **Masuk dengan Google** (Google Identity Services), diverifikasi oleh Google Apps Script |
| Database | **Google Sheets**, lewat Google Apps Script (`apps-script/Code.gs`) |
| Penyimpanan foto & denah | **Google Drive**, lewat Google Apps Script |
| Laporan | **Export Excel (.xlsx)**, dibuat oleh Google Apps Script |

Firebase (Auth & Firestore) dan Cloudinary **tidak dipakai lagi**.

Setiap perubahan temuan (pin) dan foto langsung tampil di layar, lalu dikirim ke Apps Script di latar belakang. Saat offline, perubahan disimpan di perangkat (IndexedDB) dan dikirim otomatis begitu online lagi.

## 1. Buat OAuth Client ID (untuk "Masuk dengan Google")

1. Buka [Google Cloud Console](https://console.cloud.google.com) dan buat project baru (misalnya "Site Survey").
2. **APIs & Services → OAuth consent screen** (atau **Google Auth Platform → Branding**): pilih **External**, isi nama aplikasi & email Anda, simpan. Di bagian **Audience**, klik **Publish app** supaya semua akun Google bisa masuk. Scope yang dipakai hanya email & profil dasar, jadi tidak perlu verifikasi Google.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - *Application type*: **Web application**
   - *Authorized JavaScript origins*: domain aplikasi, misalnya `https://sitesurveyact.vercel.app`, dan `http://localhost:5173` untuk development
4. Salin **Client ID** (`xxxx.apps.googleusercontent.com`). *Client Secret* tidak diperlukan.

## 2. Setup Google Apps Script

1. Buat **Google Spreadsheet** baru (misalnya "Site Survey DB").
2. Buka **Extensions → Apps Script**.
3. Ganti isi `Code.gs` dengan isi file [`apps-script/Code.gs`](apps-script/Code.gs). `GOOGLE_CLIENT_ID` sudah terisi dengan Client ID project VISIONSITE; ganti kalau memakai Client ID lain.
4. Klik ⚙️ **Project Settings**, centang **Show "appsscript.json" manifest file in editor**, lalu ganti isi `appsscript.json` dengan [`apps-script/appsscript.json`](apps-script/appsscript.json).
5. Di editor, pilih fungsi `setup`, lalu klik **Run**. Berikan izin yang diminta (Sheets, Drive, external request).
   Fungsi ini membuat sheet `users`, `sessions`, `projects`, `plans`, `pins`, `categories` serta folder **Site Survey** di Google Drive.
6. Klik **Deploy → New deployment** → tipe **Web app**:
   - *Execute as*: **Me**
   - *Who has access*: **Anyone**
7. Salin **Web app URL** (`https://script.google.com/macros/s/.../exec`).

> Setiap kali `Code.gs` diubah, buat versi baru: **Deploy → Manage deployments → Edit → Version: New version**. URL-nya tetap sama.

**Admin:** user pertama yang login otomatis menjadi admin. Email admin lain bisa ditambahkan di `ADMIN_EMAILS` pada `Code.gs`, atau dari menu **Admin → Users** di aplikasi.

**Membatasi siapa yang boleh masuk:** isi `ALLOWED_DOMAINS` (misalnya `['perusahaan.co.id']`) atau `ALLOWED_EMAILS` di `Code.gs`. Kalau keduanya kosong, semua akun Google boleh masuk. Admin juga bisa **menonaktifkan** user dari **Admin → Users**.

**Keamanan:** tidak ada password yang disimpan. Token login dari Google diverifikasi oleh Apps Script ke server Google: Client ID harus cocok, email harus terverifikasi, dan token belum kedaluwarsa. Setelah itu Apps Script membuat token sesi (berlaku 30 hari) yang disimpan dalam bentuk hash di sheet `sessions`.

## Menjalankan aplikasi

```bash
cp .env.example .env        # isi VITE_APPS_SCRIPT_URL & VITE_GOOGLE_CLIENT_ID
npm install
npm run dev
```

Build produksi: `npm run build` (hasilnya ada di folder `dist/`).

### Deploy ke Vercel

1. Import repo ini di Vercel (framework terdeteksi otomatis sebagai Vite).
2. **Settings → Environment Variables**: tambahkan `VITE_APPS_SCRIPT_URL` dan `VITE_GOOGLE_CLIENT_ID`.
3. Deploy. File `vercel.json` sudah mengatur routing SPA.

Environment variable lama `CLOUDINARY_*`, `VITE_CLOUDINARY_*` dan `VITE_FIREBASE_*` bisa dihapus dari Vercel.

## Data di Google Sheets

| Sheet | Isi |
| --- | --- |
| `users` | email & nama akun Google, role (`admin`/`member`), status nonaktif |
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
