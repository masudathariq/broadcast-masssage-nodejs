const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://localhost:27017/nama_database_anda', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB berhasil terhubung');
  } catch (err) {
    console.error('❌ Gagal terhubung ke MongoDB:', err.message);
    process.exit(1); // keluar dari proses jika gagal koneksi
  }
};

module.exports = connectDB;
