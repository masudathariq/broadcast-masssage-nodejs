const User = require('../models/User');

// Tampilkan dashboard admin + status user
exports.dashboard = async (req, res) => {
  try {
    const users = await User.find();
    const now = new Date();

    const userWithStatus = users.map(user => {
      const isOnline = user.lastSeen && (now - user.lastSeen) < 2 * 60 * 1000; // 2 menit
      return {
        _id: user._id,
        nama: user.nama,
        email: user.email,
        role: user.role,
        online: isOnline,
        lastSeen: user.lastSeen,
      };
    });

    res.render('admin/dashboard', {
      nama: req.session.nama,
      users: userWithStatus
    });

  } catch (err) {
    console.error('Gagal menampilkan dashboard admin:', err);
    res.status(500).send('Terjadi kesalahan.');
  }
};
