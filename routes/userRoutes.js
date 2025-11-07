// Import library yang dibutuhkan
const express = require('express'); 
const router = express.Router();
const bcrypt = require('bcrypt'); // Untuk enkripsi dan verifikasi password
const multer = require('multer'); // Untuk upload file
const xlsx = require('xlsx'); // Untuk membaca file Excel
const QRCode = require('qrcode'); // Untuk generate QR Code
const fs = require('fs-extra'); // Untuk manipulasi file dan folder
const path = require('path'); // Untuk manipulasi path file
const crypto = require('crypto'); // Untuk generate random session ID
const { MessageMedia } = require('whatsapp-web.js'); // Untuk kirim media melalui WhatsApp

// Fungsi delay, digunakan untuk memberi jeda saat pengiriman pesan
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Import model
const User = require('../models/User');
const Nomor = require('../models/Nomor');
const WhatsappSession = require('../models/WhatsappSession');

// Import controller dan fungsi client WhatsApp
const userController = require('../controllers/userController');
const adminController = require('../controllers/adminController');
const { clients, startClient, getQr, isClientReady } = require('../wabot/multiClientManager');

// Middleware untuk cek apakah session aktif
const cekSessionAktif = require('../middlewares/cekSessionAktif');

// ========== LOGIN & LOGOUT ==========

// Halaman login
router.get('/login', (req, res) => {
  const error = req.query.expired ? '⚠️ Akun Anda telah login di perangkat lain.' : null;
  res.render('login', { error });
});

// Proses login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  // Cek email
  if (!user) return res.render('login', { error: 'Email tidak ditemukan' });
  // Cek apakah akun aktif
  if (!user.isActive) return res.render('login', { error: 'Akun Anda telah dinonaktifkan' });

  // Bandingkan password yang dimasukkan dengan hash di database
  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.render('login', { error: 'Password salah' });

  // Buat session ID baru
  const sessionId = crypto.randomBytes(16).toString('hex');

  // Simpan data ke session
  req.session.userId = user._id;
  req.session.nama = user.nama;
  req.session.role = user.role;
  req.session.sessionId = sessionId;

  // Simpan waktu login terakhir dan session ke database
  user.lastLogin = new Date();
  user.currentSession = sessionId;
  await user.save();

  // Redirect ke dashboard berdasarkan role
  return res.redirect(user.role === 'admin' ? '/admin/dashboard' : '/dashboard');
});

// Proses logout
router.get('/logout', async (req, res) => {
  if (req.session.userId) {
    const user = await User.findById(req.session.userId);
    if (user) {
      user.currentSession = null;
      await user.save();
    }
  }

  // Hapus session
  req.session.destroy(() => res.redirect('/login'));
});

// ========== ADMIN ==========

// Middleware untuk cek role admin
const isAdmin = (req, res, next) => {
  if (req.session.role !== 'admin') return res.redirect('/login');
  next();
};

// Route untuk halaman admin
router.get('/admin/dashboard', isAdmin, adminController.dashboard);
router.get('/admin/users', isAdmin, userController.index);
router.get('/admin/users/create', isAdmin, userController.create);
router.post('/admin/users', isAdmin, userController.store);
router.get('/admin/users/:id/edit', isAdmin, userController.edit);
router.post('/admin/users/:id/update', isAdmin, userController.update);
router.post('/admin/users/:id/delete', isAdmin, userController.destroy);

// Aktif/nonaktifkan user
router.post('/admin/users/:id/toggle-aktif', isAdmin, async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).send('User tidak ditemukan');
  user.isActive = !user.isActive;
  await user.save();
  res.redirect('/admin/users');
});

// ========== DASHBOARD ==========

// Halaman dashboard untuk user biasa
router.get('/dashboard', cekSessionAktif, (req, res) => {
  res.render('user/dashboard', {
    nama: req.session.nama
  });
});

// ========== WHATSAPP SESSION ==========

// Lihat semua session WhatsApp milik user
router.get('/user/nomor-wa', cekSessionAktif, async (req, res) => {
  const sessions = await WhatsappSession.find({ userId: req.session.userId });

  // Update status setiap sesi dengan mengecek langsung ke client
  const updatedSessions = await Promise.all(sessions.map(async (session) => {
    const client = clients[session.sessionName];
    let connected = false;
    let connectedAt = null;

    if (client && client.info && client.info.wid && client.info.wid._serialized) {
      connected = true;
      const sessionInDb = await WhatsappSession.findOne({ sessionName: session.sessionName });
      connectedAt = sessionInDb?.connectedAt || null;
    }

    return {
      ...session.toObject(),
      connected,
      connectedAt
    };
  }));

  res.render('user/nomor-wa', { sessions: updatedSessions });
});

router.get('/user/nomor-wa/status-realtime/:sessionName', cekSessionAktif, async (req, res) => {
  const { sessionName } = req.params;
  const client = clients[sessionName];

  if (!client) {
    return res.json({ connected: false });
  }

  if (client.info && client.info.wid && client.info.wid._serialized) {
    return res.json({
      connected: true,
      connectedAt: new Date()
    });
  }

  return res.json({ connected: false });
});


// Tambah session baru
router.get('/user/nomor-wa/tambah', cekSessionAktif, async (req, res) => {
  const sessionName = `user-${req.session.userId}-${Date.now()}`;
  await WhatsappSession.create({ userId: req.session.userId, sessionName });
  startClient(sessionName);
  res.redirect(`/user/nomor-wa/scan/${sessionName}`);
});

// Scan QR untuk menghubungkan session - VERSI PERBAIKAN
router.get('/user/nomor-wa/scan/:sessionName', cekSessionAktif, async (req, res) => {
  const { sessionName } = req.params;

  try {
    // Mulai client jika belum ada
    await startClient(sessionName);
    
    const client = clients[sessionName];
    if (!client) {
      return res.render('user/scan-multi', {
        sessionName,
        qrImage: null,
        isConnected: false,
        error: 'Client tidak ditemukan'
      });
    }

    // Cek apakah sudah authenticated
    const isAuthenticated = client.info && 
                           client.info.wid && 
                           client.info.wid._serialized;

    if (isAuthenticated) {
      return res.render('user/scan-multi', {
        sessionName,
        qrImage: null,
        isConnected: true,
        phoneNumber: client.info.wid.user
      });
    }

    // Jika belum authenticated, render halaman dan tunggu QR via JavaScript
    res.render('user/scan-multi', {
      sessionName,
      qrImage: null,
      isConnected: false,
      waitingForQr: true
    });

  } catch (error) {
    console.error('Error in scan route:', error);
    res.render('user/scan-multi', {
      sessionName,
      qrImage: null,
      isConnected: false,
      error: 'Terjadi kesalahan saat memulai session'
    });
  }
});

// ENDPOINT BARU: Mendapatkan QR code via AJAX
router.get('/user/nomor-wa/qr/:sessionName', cekSessionAktif, async (req, res) => {
  const { sessionName } = req.params;
  const client = clients[sessionName];

  if (!client) {
    return res.status(404).json({ error: 'Client tidak ditemukan' });
  }

  // ✅ CEK APAKAH SUDAH TERHUBUNG
  if (client.info && client.info.wid && client.info.wid._serialized) {
    return res.json({ 
      status: 'authenticated',
      phoneNumber: client.info.wid.user
    });
  }

  // ✅ CEK CACHE QR
  const cachedQr = getQr(sessionName);
  if (cachedQr) {
    try {
      const qrImage = await QRCode.toDataURL(cachedQr);
      return res.json({ 
        status: 'qr_ready',
        qrImage
      });
    } catch (err) {
      return res.status(500).json({ error: 'Gagal generate QR dari cache' });
    }
  }

  // 🕒 TUNGGU QR KALAU BELUM ADA
  let sent = false;

  client.once('qr', async (qr) => {
    if (sent) return;
    sent = true;
    try {
      const qrImage = await QRCode.toDataURL(qr);
      res.json({ status: 'qr_ready', qrImage });
    } catch (error) {
      res.status(500).json({ error: 'Gagal generate QR' });
    }
  });

  client.once('ready', () => {
    if (sent) return;
    sent = true;
    res.json({ status: 'authenticated', phoneNumber: client.info.wid.user });
  });

  setTimeout(() => {
    if (!sent) {
      sent = true;
      res.status(408).json({ error: 'Timeout menunggu QR' });
    }
  }, 20000);
});


// ENDPOINT STATUS - DIPERBAIKI
router.get('/user/nomor-wa/status/:sessionName', cekSessionAktif, async (req, res) => {
  const { sessionName } = req.params;
  const client = clients[sessionName];
  
  if (!client) {
    return res.json({ 
      status: 'not_found',
      isConnected: false 
    });
  }

  try {
    // Cek apakah page tertutup
    if (client.pupPage && client.pupPage._closed) {
      return res.json({ 
        status: 'closed',
        isConnected: false 
      });
    }

    // Cek apakah authenticated
    if (client.info && client.info.wid && client.info.wid._serialized) {
      return res.json({ 
        status: 'authenticated',
        isConnected: true,
        phoneNumber: client.info.wid.user
      });
    }

    // Cek state WhatsApp
    let state = null;
if (client.getState && client.pupPage && !client.pupPage._closed) {
  try {
    state = await client.getState();
  } catch (e) {
    state = 'error';
  }
}

    
    return res.json({ 
      status: state || 'initializing',
      isConnected: false,
      state: state
    });

  } catch (error) {
    return res.json({ 
      status: 'error',
      isConnected: false,
      error: error.message
    });
  }
});

// TAMBAHAN: Route untuk restart session yang bermasalah
router.post('/user/nomor-wa/restart/:sessionName', cekSessionAktif, async (req, res) => {
  const { sessionName } = req.params;
  
  try {
    // Hapus client lama
    if (clients[sessionName]) {
      await clients[sessionName].destroy();
      delete clients[sessionName];
    }

    // Mulai client baru
    await startClient(sessionName);
    
    res.json({ success: true, message: 'Session restarted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to restart session' });
  }
});



// Hapus session WhatsApp
router.post('/user/nomor-wa/hapus/:id', cekSessionAktif, async (req, res) => {
  const session = await WhatsappSession.findById(req.params.id);
  if (!session) return res.send('❌ Session tidak ditemukan.');
  const sessionName = session.sessionName;

  // Hapus client dari memori
  if (clients[sessionName]) {
    await clients[sessionName].destroy();
    delete clients[sessionName];
  }

  // Hapus file auth dari server
  const authPath = path.join(__dirname, `../.wwebjs_auth/${sessionName}`);
  if (fs.existsSync(authPath)) await fs.remove(authPath);

  // Hapus dari database
  await WhatsappSession.findByIdAndDelete(req.params.id);
  res.redirect('/user/nomor-wa');
});

// ========== UPLOAD EXCEL ==========

// Konfigurasi multer untuk upload file
const upload = multer({ dest: 'uploads/' });

// Halaman upload file
router.get('/user/upload', cekSessionAktif, (req, res) => {
  res.render('user/upload');
});

// Proses upload dan parsing file Excel
router.post('/user/upload', cekSessionAktif, upload.single('file_excel'), async (req, res) => {
  const file = req.file;
  if (!file) return res.send('❌ File tidak ditemukan.');

  const workbook = xlsx.readFile(file.path);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  // Simpan setiap baris ke database
  for (const row of data) {
    await Nomor.create({
      nama: row.Nama,
      nomor: String(row.Nomor),
      userId: req.session.userId
    });
  }

  res.redirect('/user/nomor');
});

// ========== CRUD NOMOR ==========

// Tampilkan data nomor user
router.get('/user/nomor', cekSessionAktif, async (req, res) => {
  const cari = req.query.cari || '';
  const regex = new RegExp(cari, 'i');
  const data = await Nomor.find({
    userId: req.session.userId,
    $or: [{ nama: regex }, { nomor: regex }]
  });
  res.render('user/nomor', { data, cari });
});

// Hapus satu nomor
router.post('/user/nomor/:id/delete', cekSessionAktif, async (req, res) => {
  await Nomor.deleteOne({ _id: req.params.id, userId: req.session.userId });
  res.redirect('/user/nomor');
});

// Hapus semua nomor user
router.post('/user/nomor/hapus-semua', cekSessionAktif, async (req, res) => {
  await Nomor.deleteMany({ userId: req.session.userId });
  res.redirect('/user/nomor');
});

// Hapus nomor berdasarkan pencarian
router.post('/user/nomor/hapus-filter', cekSessionAktif, async (req, res) => {
  const cari = req.body.cari || '';
  const regex = new RegExp(cari, 'i');
  await Nomor.deleteMany({
    userId: req.session.userId,
    $or: [{ nama: regex }, { nomor: regex }]
  });
  res.redirect('/user/nomor');
});

// ========== KIRIM PESAN ==========

// Objek global untuk menyimpan status progress pengiriman
let progress = {
  total: 0,
  sukses: 0,
  gagal: 0,
  status: 'idle',
  error: null
};

// Halaman form kirim pesan
router.get('/user/kirim', cekSessionAktif, async (req, res) => {
  const nomor = await Nomor.find({ userId: req.session.userId });
  const sessions = await WhatsappSession.find({ userId: req.session.userId });
  res.render('user/kirim', { nomor, sessions });
});

// Proses kirim pesan
router.post('/user/kirim', cekSessionAktif, upload.single('gambar'), async (req, res) => {
  const { pesan, session } = req.body;
  const file = req.file;
  const nomor = await Nomor.find({ userId: req.session.userId });

  // Inisialisasi progress
  progress.total = nomor.length;
  progress.sukses = 0;
  progress.gagal = 0;
  progress.status = 'berjalan';
  progress.error = null;

  res.redirect('/user/progress-view');

  // Proses pengiriman dimulai setelah 500ms
  setTimeout(async () => {
    let selectedClients = [];

    // Ambil client sesuai session yang dipilih
    if (session && clients[session]) {
      selectedClients = [clients[session]];
    } else {
      const sessions = await WhatsappSession.find({ userId: req.session.userId });
      selectedClients = sessions.map(s => clients[s.sessionName]).filter(c => c && c.info && c.info.wid);
    }

    // Jika tidak ada client aktif
    if (selectedClients.length === 0) {
      progress.status = 'selesai';
      progress.error = '❌ Tidak ada sesi WhatsApp aktif.';
      return;
    }

    // Kirim pesan satu per satu
    for (let i = 0; i < nomor.length; i++) {
      const item = nomor[i];
      const number = item.nomor;

      // Validasi nomor
      if (!number || !number.match(/^62\d{9,15}$/)) {
        progress.gagal++;
        continue;
      }

      const waId = number + '@c.us';
      const client = selectedClients[i % selectedClients.length];

      try {
        // Cek apakah nomor terdaftar di WhatsApp
        const isRegistered = await client.isRegisteredUser(waId);
        if (!isRegistered) {
          progress.gagal++;
          continue;
        }

        // Kirim dengan media (gambar) jika ada
        if (file) {
          const filePath = path.resolve(file.path);
          const fileData = fs.readFileSync(filePath).toString('base64');
          const media = new MessageMedia(file.mimetype, fileData, file.originalname);
          const personalCaption = (pesan || '').replace(/{nama}/gi, item.nama || '');
          await client.sendMessage(waId, media, { caption: personalCaption });
        } else {
          // Kirim pesan teks
          const personalMessage = pesan.replace(/{nama}/gi, item.nama || '');
          await client.sendMessage(waId, personalMessage);
        }

        progress.sukses++;
      } catch (err) {
        progress.gagal++;
      }

      // Delay antar pesan
      await delay(9000);
      if ((i + 1) % 100 === 0) await delay(300000); // Delay tambahan setiap 100 pesan
    }

    // Selesai
    progress.status = 'selesai';
  }, 500);
});

// ========== PROGRESS ==========

// Halaman tampilan progress
router.get('/user/progress-view', cekSessionAktif, (req, res) => {
  res.render('user/progress');
});

// Endpoint untuk melihat status progress dalam format JSON
router.get('/user/progress', cekSessionAktif, (req, res) => {
  res.json(progress);
});

// Export router agar bisa digunakan di file utama
module.exports = router;
