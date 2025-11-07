const { Client, LocalAuth } = require('whatsapp-web.js');

// Status koneksi & QR Code
let qrCodeData = null;
let isClientReady = false;

// Inisialisasi client WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true } // nonaktifkan browser (tidak terbuka secara visual)
});

// Event: QR muncul
client.on('qr', (qr) => {
  qrCodeData = qr;
  isClientReady = false;
  console.log('🔄 QR Code tersedia. Silakan scan dengan WhatsApp Anda.');
});

// Event: Koneksi berhasil
client.on('ready', () => {
  isClientReady = true;
  qrCodeData = null;
  console.log('✅ WhatsApp siap digunakan!');
});

// Event: Terputus
client.on('disconnected', (reason) => {
  isClientReady = false;
  console.log(`🔌 WhatsApp terputus: ${reason}`);
});

// Mulai client
client.initialize();

// Ekspor fungsi dan status
module.exports = {
  client,
  getQrCode: () => qrCodeData,
  isReady: () => isClientReady
};
