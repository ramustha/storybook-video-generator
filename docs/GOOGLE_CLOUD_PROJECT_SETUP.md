# Google Cloud Project Setup Guide (Multi-Project Quota Pool) 🌐

Panduan langkah demi langkah untuk membuat Google Cloud Project baru dan menambahkannya ke dalam pool rotasi kuota otomatis YouTube Data API v3.

Setiap project Google Cloud yang ditambahkan akan memberikan tambahan **+10.000 unit kuota/hari** (~6 upload video Full HD/hari).

---

## 📋 Ringkasan Alur (Hanya ~60 Detik)

```
1. Buat Project Baru di GCP ➔ 2. Enable YouTube Data API v3 ➔ 3. Set OAuth Consent Screen ➔ 4. Daftarkan Test User (atkcollection110@gmail.com) ➔ 5. Buat OAuth Client ID (Desktop) & Download JSON ➔ 6. Jalankan 'npm run project:add'
```

---

## Langkah Demi Langkah:

### Langkah 1: Buat Project Baru di Google Cloud
1. Buka tautan langsung: 👉 [Google Cloud - Create Project](https://console.cloud.google.com/projectcreate)
2. Masukkan **Project name** (contoh: `storybook-uploader-3` atau nama yang diinginkan).
3. Klik **Create** dan tunggu beberapa detik hingga project selesai dibuat.
4. Pastikan project yang baru dibuat telah terpilih pada dropdown project di bar navigasi atas.

---

### Langkah 2: Aktifkan YouTube Data API v3
1. Buka tautan langsung: 👉 [Enable YouTube Data API v3](https://console.cloud.google.com/apis/library/youtube.googleapis.com)
2. Pastikan project yang benar terpilih di bagian atas.
3. Klik tombol **Enable** (Aktifkan).

---

### Langkah 3: Konfigurasi OAuth Consent Screen
1. Buka tautan langsung: 👉 [OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent)
2. Pada pilihan **User Type**, pilih **External**, lalu klik **Create**.
3. Isi informasi aplikasi:
   - **App name**: `Storybook Uploader`
   - **User support email**: Pilih email Anda (`atkcollection110@gmail.com`).
   - **Developer contact information**: Isi dengan `atkcollection110@gmail.com`.
4. Klik **Save and Continue**.
5. Pada halaman **Scopes**, lewati saja (klik **Save and Continue**).

---

### Langkah 4: Daftarkan Test User (PENTING!) ⚠️
Karena status aplikasi berada dalam mode *Testing*, Google **wajib** mendaftarkan email akun pengelola YouTube ke daftar Test User:

1. Pada bagian **Test users**, klik **+ ADD USERS**.
2. Masukkan alamat email akun YouTube Anda:
   ```
   atkcollection110@gmail.com
   ```
3. Klik **Add**, lalu klik **Save and Continue**.
4. Di halaman *Summary*, scroll ke bawah dan klik **Back to Dashboard**.

> 💡 **Penting:** Jika email `atkcollection110@gmail.com` tidak didaftarkan di Test Users, Google akan menolak login dengan error `access_denied: user has not completed verification`.

---

### Langkah 5: Buat OAuth 2.0 Client ID (Desktop App)
1. Buka tautan langsung: 👉 [Create OAuth Client ID](https://console.cloud.google.com/apis/credentials/oauthclient)
2. Pada dropdown **Application type**, pilih **Desktop app**.
3. **Name**: `Storybook Desktop Client` (atau biarkan default).
4. Klik tombol **Create**.
5. Pop-up *OAuth client created* akan muncul. Klik tombol **DOWNLOAD JSON**.
6. File JSON akan tersimpan di folder Downloads Anda (biasanya bernama `client_secret_xxxx.json`).

---

### Langkah 6: Daftarkan Project ke Pool Rotasi
Jalankan perintah berikut di terminal (ganti nama project dan path file JSON sesuai lokasi download Anda):

```bash
npm run project:add project-3 ~/Downloads/client_secret_*.json
```

1. Browser akan terbuka otomatis mengarah ke halaman izin Google.
2. Pilih akun `atkcollection110@gmail.com` (pengelola channel **`@ZaynAdyanRamadhan`**).
3. Klik **Continue / Lanjutkan** untuk memberikan izin akses YouTube.
4. Server lokal akan menangkap callback, menyimpan token ke `config/projects/project-3/token.json`, dan memverifikasi koneksi channel.

---

### Langkah 7: Verifikasi Status Pool
Cek kapasitas pool kapan saja dengan:
```bash
npm run project:list
```

Output:
```
========================================================
🌐 YouTube Google Cloud Multi-Project Quota Pool
========================================================
• Total Configured Projects: 3
• Available (Active Quota):  3
• Current Active Project:    DEFAULT
• Daily Quota Reset:         In Xh Xm (approx 15:00 WIB)

Projects in pool:
👉 • default   [AVAILABLE - 10,000 units]
   • project-2 [AVAILABLE - 10,000 units]
   • project-3 [AVAILABLE - 10,000 units]

📊 Total Pool Capacity:
   30,000 API units/day (~18 Full HD video uploads/day)
========================================================
```
Semua project di dalam pool akan dirotasi secara otomatis jika salah satu project kehabisan kuota (`quotaExceeded`), dan akan di-reset otomatis setiap hari pada pukul **15:00 WIB (00:00 Pacific Time)**.
