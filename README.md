# API WhatsApp Express

REST API pengiriman WhatsApp bergaya Fonnte yang dibuat dengan Node.js, Express, dan `whatsapp-web.js`.

> Proyek ini memakai WhatsApp Web, bukan API resmi Meta. Perubahan pada WhatsApp Web dapat memengaruhi layanan dan penggunaan otomatisasi dapat berisiko terhadap akun. Gunakan nomor khusus dan patuhi ketentuan WhatsApp.

## Fitur

- Login WhatsApp melalui QR dan penyimpanan sesi lokal
- Status perangkat, connect, dan logout
- Autentikasi token melalui header `Authorization`, `token`, atau `x-api-key`
- Kirim teks, media dari URL, atau file base64
- Normalisasi nomor lokal Indonesia secara otomatis
- Endpoint ringkas `POST /send` seperti pola integrasi Fonnte

## Instalasi

Persyaratan: Node.js 18 atau lebih baru.

```bash
npm install
cp .env.example .env
```

Ubah `API_TOKEN` di `.env`, lalu jalankan:

```bash
npm start
```

Jika Chromium bawaan tidak dapat berjalan pada server, pasang Chrome/Chromium dan isi `CHROME_EXECUTABLE_PATH` di `.env`.

### Menjalankan dengan Docker

Setelah membuat `.env`, jalankan:

```bash
docker compose up --build -d
docker compose logs -f whatsapp-api
```

Sesi WhatsApp disimpan pada volume `whatsapp-session`, sehingga login tetap tersedia setelah container dibuat ulang.

## Menghubungkan perangkat

Saat `AUTO_CONNECT=true`, proses koneksi dimulai ketika server hidup. Bisa juga dimulai manual:

```bash
curl -X POST http://localhost:3000/device/connect \
  -H "Authorization: Bearer TOKEN_ANDA"
```

Ambil QR dalam format data URL:

```bash
curl http://localhost:3000/device/qr \
  -H "Authorization: Bearer TOKEN_ANDA"
```

Nilai `qr` dapat langsung dipasang sebagai atribut `src` pada elemen `<img>`. Pindai melalui WhatsApp > Perangkat tertaut > Tautkan perangkat.

QR juga bisa dibuka langsung sebagai gambar melalui `GET /device/qr/image` dengan header token yang sama.

Cek status sampai `device.ready` bernilai `true`:

```bash
curl http://localhost:3000/device/status \
  -H "Authorization: Bearer TOKEN_ANDA"
```

## Mengirim pesan

Semua contoh berikut menerima `Authorization: Bearer TOKEN_ANDA`. Agar mirip Fonnte, header `token: TOKEN_ANDA` juga didukung.

### Teks

```bash
curl -X POST http://localhost:3000/send \
  -H "Authorization: Bearer TOKEN_ANDA" \
  -H "Content-Type: application/json" \
  -d '{"target":"081234567890","message":"Halo dari API"}'
```

Endpoint alternatifnya adalah `POST /api/messages/send`.

### Media dari URL

```bash
curl -X POST http://localhost:3000/send \
  -H "token: TOKEN_ANDA" \
  -H "Content-Type: application/json" \
  -d '{
    "target":"081234567890",
    "message":"Ini caption gambar",
    "url":"https://example.com/image.jpg"
  }'
```

### File base64

```json
{
  "target": "081234567890",
  "message": "Dokumen Anda",
  "file": "JVBERi0xLjQK...",
  "mimetype": "application/pdf",
  "filename": "invoice.pdf",
  "asDocument": true
}
```

Ukuran body request dibatasi 25 MB. Untuk file besar, gunakan URL atau sesuaikan limit pada `src/app.js` dengan mempertimbangkan kapasitas server.

## Endpoint

| Method | Endpoint | Keterangan |
| --- | --- | --- |
| GET | `/health` | Health check tanpa token |
| POST | `/device/connect` | Memulai WhatsApp client |
| GET | `/device/qr` | Mengambil QR login |
| GET | `/device/qr/image` | Mengambil QR sebagai gambar PNG |
| GET | `/device/status` | Melihat status koneksi |
| POST | `/device/logout` | Logout dan menghapus login aktif |
| POST | `/send` | Mengirim teks atau media |
| POST | `/api/messages/send` | Alias endpoint kirim pesan |

## Deployment

Folder `.wwebjs_auth` menyimpan sesi login. Jadikan folder ini volume persisten saat memakai Docker atau platform cloud. Jalankan satu instance aplikasi untuk satu `CLIENT_ID`; beberapa proses yang memakai folder sesi yang sama dapat merusak sesi atau gagal membuka Chromium.

Untuk produksi, tempatkan API di balik HTTPS/reverse proxy, batasi akses jaringan, gunakan token acak yang panjang, dan jangan mengekspos endpoint QR ke publik tanpa autentikasi.
