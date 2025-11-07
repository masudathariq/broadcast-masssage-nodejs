const User = require('../models/User');

module.exports = async function cekSessionAktif(req, res, next) {
  try {
    // Cek apakah user sudah login (ada session)
    if (!req.session || !req.session.userId) {
      return res.redirect('/login');
    }

    // Cari user di database berdasarkan session userId
    const user = await User.findById(req.session.userId);

    // Jika user tidak ditemukan atau session tidak cocok, logout dan redirect
    if (!user || user.currentSession !== req.session.sessionId) {
      req.session.destroy(() => {
        return res.redirect('/login?expired=true'); // Tambahkan pesan expired
      });
    } else {
      // Jika valid, lanjut ke middleware berikutnya
      next();
    }
  } catch (error) {
    console.error('Terjadi kesalahan saat validasi session:', error);
    res.redirect('/login');
  }
};
