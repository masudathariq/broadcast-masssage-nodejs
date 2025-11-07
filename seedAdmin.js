const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User'); // sesuaikan path ini kalau nama file model kamu beda
const connectDB = require('./config/db');

connectDB();

async function buatAdmin() {
  const hashedPassword = await bcrypt.hash('admin123', 10); // password default

  const adminBaru = new User({
    nama: 'Admin Utama',
    email: 'admin@wa.com',
    password: hashedPassword,
    role: 'admin'
  });

  await adminBaru.save();
  console.log('✅ Admin berhasil dibuat');
  mongoose.connection.close();
}

buatAdmin();
