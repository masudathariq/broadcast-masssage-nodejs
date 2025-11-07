const User = require('../models/User');
const Session = require('../models/WhatsappSession');
const Nomor = require('../models/Nomor'); // Tambahan
const bcrypt = require('bcrypt');
const XLSX = require('xlsx'); // Tambahan untuk baca Excel

// ======================
// CRUD User
// ======================

// Tampilkan semua user
exports.index = async (req, res) => {
  const users = await User.find();
  res.render('admin/userIndex', { users });
};

// Form tambah user
exports.create = (req, res) => {
  res.render('admin/userCreate');
};

// Simpan user baru
exports.store = async (req, res) => {
  const hashedPassword = await bcrypt.hash(req.body.password, 10);
  await User.create({
    nama: req.body.nama,
    email: req.body.email,
    password: hashedPassword,
    role: req.body.role
  });
  res.redirect('/admin/users');
};

// Form edit user
exports.edit = async (req, res) => {
  const user = await User.findById(req.params.id);
  res.render('admin/userEdit', { user });
};

// Update user
exports.update = async (req, res) => {
  const user = await User.findById(req.params.id);
  user.nama = req.body.nama;
  user.email = req.body.email;
  user.role = req.body.role;
  if (req.body.password) {
    user.password = await bcrypt.hash(req.body.password, 10);
  }
  await user.save();
  res.redirect('/admin/users');
};

// Hapus user
exports.destroy = async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.redirect('/admin/users');
};

// ======================
// Halaman Daftar Nomor WhatsApp (Session)
// ======================

// Fungsi untuk cek status koneksi WhatsApp dari sesi
async function checkIfStillConnected(sessionName) {
  const client = global.whatsappClients?.[sessionName];
  if (!client) return false;

  const state = await client.getState().catch(() => 'DISCONNECTED');
  return state === 'CONNECTED';
}

// Tampilkan semua sesi WhatsApp
exports.sessionIndex = async (req, res) => {
  let sessions = await Session.find();

  // Update status koneksi untuk setiap sesi
  for (let session of sessions) {
    session.connected = await checkIfStillConnected(session.sessionName);
  }

  res.render('admin/userWhatsAppSessions', { sessions });
};

// ======================
// Upload Nomor WhatsApp dari Excel
// ======================

exports.uploadNomor = async (req, res) => {
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);

    // Jika ingin hapus semua sebelum simpan:
    // await Nomor.deleteMany({});

    let successCount = 0;
    for (const row of data) {
      if (!row.nomor) continue; // skip kalau tidak ada nomor

      const exists = await Nomor.findOne({ nomor: row.nomor });
      if (!exists) {
        await Nomor.create({
          nama: row.nama || '',
          nomor: row.nomor
        });
        successCount++;
      }
    }

    res.redirect('/user/nomor'); // ganti ke halaman list nomor
  } catch (error) {
    console.error('Gagal upload Excel:', error);
    res.status(500).send('Terjadi kesalahan saat mengupload data.');
  }
};
