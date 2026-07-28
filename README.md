# API WhatsApp Express

REST API pengiriman WhatsApp bergaya Fonnte yang dibuat dengan Node.js, Express, dan `whatsapp-web.js`.

> Proyek ini memakai WhatsApp Web, bukan API resmi Meta. Perubahan pada WhatsApp Web dapat memengaruhi layanan dan penggunaan otomatisasi dapat berisiko terhadap akun. Gunakan nomor khusus dan patuhi ketentuan WhatsApp.

## Fitur

- Login WhatsApp melalui QR dan penyimpanan sesi lokal
- Status perangkat, connect, dan logout
- Autentikasi token melalui header `Authorization`, `token`, atau `x-api-key`
- Kirim teks, media dari URL, atau file base64
- Auto-reply command seperti `/start`, dengan respons statis atau webhook dinamis
- Penyimpanan konfigurasi command secara persisten
- Normalisasi nomor lokal Indonesia secara otomatis
- Endpoint ringkas `POST /send` seperti pola integrasi Fonnte

## Instalasi

Persyaratan: Node.js 18 atau lebih baru dan pnpm.

```bash
pnpm install
cp .env.example .env
```

Ubah `API_TOKEN` di `.env`, lalu sesuaikan konfigurasi lain bila diperlukan:

```env
PORT=3000
API_TOKEN=ganti-dengan-token-rahasia-yang-panjang
AUTO_CONNECT=true
DEFAULT_COUNTRY_CODE=62
```

Jalankan API:

```bash
pnpm start
```

Jalankan test:

```bash
pnpm test
```

Contoh request dalam dokumentasi ini menggunakan port default `3000`. Jika
`PORT` di `.env` diubah, misalnya menjadi `3564`, gunakan port tersebut pada
semua URL request.

### Menjalankan dengan PM2

Pada server yang sudah memiliki unit `pm2-api-whatsapp.service`, kelola PM2
melalui systemd:

```bash
systemctl status pm2-api-whatsapp.service
systemctl restart pm2-api-whatsapp.service
journalctl -u pm2-api-whatsapp.service -f
```

Aktifkan autostart setelah reboot bila belum aktif:

```bash
systemctl enable pm2-api-whatsapp.service
```

Jangan menjalankan `pm2`, `./scripts/pm2-start.sh`, atau daemon PM2 lain secara
manual pada server yang sudah dikelola systemd. Lebih dari satu daemon dapat
menjalankan aplikasi dan Chromium ganda, menggunakan port yang sama, atau
mengunci folder sesi WhatsApp yang sama.

Pada server ARM/Debian, Chromium bawaan Puppeteer mungkin tidak cocok dengan
arsitektur server. Pasang Chromium sistem dan isi executable-nya di `.env`:

```env
CHROME_EXECUTABLE_PATH=/usr/bin/chromium
```

Lokasi lain, seperti `/usr/bin/google-chrome`, juga dapat digunakan sesuai
instalasi server.

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

Contoh respons berhasil:

```json
{
  "status": true,
  "message": "Pesan berhasil dikirim",
  "data": {
    "id": null,
    "target": "6281234567890",
    "timestamp": null,
    "type": "chat"
  }
}
```

`id` dan `timestamp` dapat bernilai `null` ketika WhatsApp Web berhasil
mengirim pesan tetapi tidak mengembalikan metadata pesan. Kondisi tersebut
tetap dianggap berhasil.

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

## Command dan auto-reply

Pesan masuk yang diawali `/` akan diperiksa sebagai command. Command `/start`
tersedia secara default dan langsung membalas ketika WhatsApp sudah terhubung.
Daftar command dapat dilihat melalui:

```bash
curl http://localhost:3000/api/commands \
  -H "Authorization: Bearer TOKEN_ANDA"
```

### Balasan teks statis

Buat atau perbarui command dengan `POST /api/commands`. Tanda `/` pada nama
command boleh disertakan atau dihilangkan.

```bash
curl -X POST http://localhost:3000/api/commands \
  -H "Authorization: Bearer TOKEN_ANDA" \
  -H "Content-Type: application/json" \
  -d '{
    "command":"/help",
    "response":"Command tersedia: /start, /help, /status",
    "description":"Menampilkan bantuan",
    "enabled":true
  }'
```

Setelah itu, pesan WhatsApp `/help` akan otomatis mendapat balasan dari nilai
`response`. Konfigurasi disimpan pada `.data/commands.json`, atau lokasi yang
ditentukan melalui `COMMANDS_FILE`, sehingga tidak hilang saat server restart.

Command dapat diperbarui atau dihapus melalui:

```bash
curl -X PUT http://localhost:3000/api/commands/help \
  -H "Authorization: Bearer TOKEN_ANDA" \
  -H "Content-Type: application/json" \
  -d '{"response":"Menu bantuan terbaru"}'

curl -X DELETE http://localhost:3000/api/commands/help \
  -H "Authorization: Bearer TOKEN_ANDA"
```

### Balasan dinamis dari aplikasi lain

Isi `webhookUrl` agar command diteruskan ke backend lain. `response` bersifat
opsional dan dipakai sebagai fallback jika webhook gagal.

```bash
curl -X POST http://localhost:3000/api/commands \
  -H "Authorization: Bearer TOKEN_ANDA" \
  -H "Content-Type: application/json" \
  -d '{
    "command":"/status",
    "webhookUrl":"https://app-anda.example/webhooks/whatsapp-command",
    "response":"Status sedang tidak dapat diperiksa. Coba lagi nanti."
  }'
```

Ketika pengguna mengirim `/status INV-123`, API mengirim request berikut ke
webhook:

```json
{
  "event": "whatsapp.command",
  "command": "/status",
  "args": ["INV-123"],
  "argsText": "INV-123",
  "text": "/status INV-123",
  "from": "6281234567890@c.us",
  "chatId": "6281234567890@c.us",
  "messageId": "...",
  "timestamp": 1234567890
}
```

Webhook harus merespons HTTP 2xx dengan JSON. Isi `reply` akan otomatis dikirim
kembali ke chat WhatsApp. Nilai `null` atau respons kosong berarti command
ditangani tanpa mengirim balasan.

```json
{
  "reply": "Status invoice INV-123: lunas"
}
```

Untuk mengamankan webhook, isi `COMMAND_WEBHOOK_SECRET`. Secret dikirim melalui
header `Authorization: Bearer ...` dan `x-command-secret`. Batas waktu webhook
dapat diatur melalui `COMMAND_WEBHOOK_TIMEOUT_MS`.

Jika API ini dipakai langsung sebagai modul Node.js, handler JavaScript juga
dapat didaftarkan untuk respons dinamis tanpa webhook:

```js
const { whatsapp } = require('./src/whatsapp/client');

whatsapp.registerCommand('/hello', async ({ argsText, from }) => {
  return `Halo ${argsText || from}!`;
});
```

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
| GET | `/api/commands` | Melihat seluruh command |
| GET | `/api/commands/:command` | Melihat satu command |
| POST | `/api/commands` | Membuat atau memperbarui command |
| PUT | `/api/commands/:command` | Memperbarui command |
| DELETE | `/api/commands/:command` | Menghapus command |

## Deployment

Folder `.wwebjs_auth` menyimpan sesi login. Jadikan folder ini volume persisten saat memakai Docker atau platform cloud. Jalankan satu instance aplikasi untuk satu `CLIENT_ID`; beberapa proses yang memakai folder sesi yang sama dapat merusak sesi, gagal membuka Chromium dengan pesan `The browser is already running`, atau berebut port aplikasi.

Untuk produksi, tempatkan API di balik HTTPS/reverse proxy, batasi akses jaringan, gunakan token acak yang panjang, dan jangan mengekspos endpoint QR ke publik tanpa autentikasi.
