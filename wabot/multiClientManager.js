const { Client, LocalAuth } = require('whatsapp-web.js');


const fs = require('fs');
const path = require('path');

// Objek untuk menyimpan semua sesi WhatsApp client
const clients = {};
const qrCodes = {};

//import model
const WhatsappSession = require('../models/WhatsappSession');

// Fungsi untuk memulai client baru
const startClient = async (sessionName) => {
  if (clients[sessionName]) {
    console.log(`[${sessionName}] ⚠️ Sudah aktif`);
    return;
  }

  console.log(`[${sessionName}] 🔄 Memulai session...`);

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: sessionName }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-gpu'
      ]
    }
  });

  // Simpan client
  clients[sessionName] = client;

  // Saat QR diterima
  client.on('qr', (qr) => {
    console.log(`[${sessionName}] 📲 QR code diterima`);
    qrCodes[sessionName] = qr;
  });

  // Saat client siap
  client.on('ready', async () => {
  console.log(`[${sessionName}] ✅ Client siap`);

  // Hapus QR karena sudah terautentikasi
  delete qrCodes[sessionName];

  // ✅ Update status "connected" dan "connectedAt" ke database
  await WhatsappSession.updateOne(
    { sessionName },
    {
      connected: true,
      connectedAt: new Date()
    }
  );
});

  // Saat client berhasil terhubung
  client.on('authenticated', () => {
    console.log(`[${sessionName}] 🔐 Terautentikasi`);
  });

  // Saat client gagal autentikasi
  client.on('auth_failure', (msg) => {
    console.error(`[${sessionName}] ❌ Gagal autentikasi: ${msg}`);
    delete clients[sessionName];
    delete qrCodes[sessionName];
  });

  // Saat client disconnect
  client.on('disconnected', (reason) => {
    console.log(`[${sessionName}] 🔌 Terputus: ${reason}`);
    client.destroy();
    delete clients[sessionName];
    delete qrCodes[sessionName];
  });

  // Mulai client
  try {
    await client.initialize();
  } catch (err) {
    console.error(`[${sessionName}] ❌ Error saat inisialisasi:`, err.message);
  }
};

// Fungsi untuk mengambil QR code (jika ada)
const getQr = (sessionName) => {
  return qrCodes[sessionName] || null;
};

// Fungsi untuk mengecek apakah client sudah siap (authenticated)
const isClientReady = (sessionName) => {
  const client = clients[sessionName];
  return client && client.info && client.info.wid && client.info.wid._serialized;
};

// Fungsi untuk menghentikan dan menghapus session
const stopClient = async (sessionName) => {
  const client = clients[sessionName];
  if (client) {
    await client.destroy();
    delete clients[sessionName];
    delete qrCodes[sessionName];

    // Hapus folder auth jika perlu
    const authPath = path.join(__dirname, `../.wwebjs_auth/session-${sessionName}`);
    if (fs.existsSync(authPath)) {
      fs.rmSync(authPath, { recursive: true, force: true });
      console.log(`[${sessionName}] 🧹 Folder auth dihapus`);
    }
  }
};

// Export agar bisa dipakai di routes
module.exports = {
  clients,
  startClient,
  getQr,
  isClientReady,
  stopClient
};
