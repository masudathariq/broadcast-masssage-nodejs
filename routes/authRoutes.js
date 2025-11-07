const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const User = require('../models/User');

// GET: Tampilkan form login
router.get('/login', (req, res) => {
  res.render('login', { error: null });
});

// POST: Proses login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) return res.render('login', { error: 'Email tidak ditemukan' });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.render('login', { error: 'Password salah' });

  // ❗ Cek apakah user sudah login di perangkat lain
  if (user.currentSession) {
    return res.render('login', { error: 'Akun ini sedang login di perangkat lain.' });
  }

  // ✅ Buat session ID unik
  const sessionId = crypto.randomBytes(16).toString('hex');

  // Simpan ke session dan DB
  req.session.userId = user._id;
  req.session.nama = user.nama;
  req.session.role = user.role;
  req.session.sessionId = sessionId;

  user.currentSession = sessionId;
  user.lastLogin = new Date();
  await user.save();

  // Arahkan berdasarkan role
  return res.redirect(user.role === 'admin' ? '/admin/users' : '/dashboard');
});

// GET: Logout
router.get('/logout', async (req, res) => {
  if (req.session.userId) {
    const user = await User.findById(req.session.userId);
    if (user) {
      user.currentSession = null; // hapus sesi login
      await user.save();
    }
  }

  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
