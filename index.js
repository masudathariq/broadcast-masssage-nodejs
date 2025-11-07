// 1. IMPORT MODULE
const express = require('express'); // Framework utama untuk server web Node.js
const session = require('express-session'); // Untuk menyimpan data session pengguna
const path = require('path'); // Untuk manipulasi dan gabung path (lokasi file)
require('./wabot/client'); // Jalankan atau inisialisasi client WhatsApp

// 2. IMPORT FILE KONFIGURASI & ROUTES
const connectDB = require('./config/db'); // File untuk koneksi ke database MongoDB
const userRoutes = require('./routes/userRoutes'); // Routing utama aplikasi
const updateLastActivity = require('./middlewares/updateLastActivity'); // Middleware untuk mencatat aktivitas terakhir
const User = require('./models/User'); // Model user (digunakan untuk update lastSeen)

// 3. INISIALISASI APP
const app = express(); // Buat objek Express untuk menjalankan server

// 4. KONEKSI DATABASE
connectDB(); // Panggil fungsi untuk connect ke database MongoDB

// 5. KONFIGURASI SESSION
app.use(session({
  secret: 'rahasia', // Kunci rahasia untuk session (sebaiknya disimpan di .env di production)
  resave: false, // Jangan simpan ulang session jika tidak ada perubahan
  saveUninitialized: false // Jangan simpan session kosong
}));

// 6. MIDDLEWARE TAMBAHAN
app.use(express.urlencoded({ extended: true })); // Untuk parsing form (x-www-form-urlencoded)
app.use(express.json()); // Untuk parsing data JSON

// 7. UPDATE TERAKHIR AKTIFITAS (middleware kamu sendiri)
app.use(updateLastActivity); // Menjalankan middleware yang Anda buat sendiri

// 8. UPDATE WAKTU ONLINE TERAKHIR
app.use(async (req, res, next) => {
  if (req.session && req.session.userId) { // Cek apakah user sedang login
    try {
      await User.findByIdAndUpdate(req.session.userId, { lastSeen: new Date() }); // Update lastSeen
    } catch (err) {
      console.error('Gagal update lastSeen:', err.message); // Tampilkan error jika gagal
    }
  }
  next(); // Lanjut ke proses selanjutnya
});

// 9. SETUP VIEW ENGINE
app.set('view engine', 'ejs'); // Gunakan EJS sebagai template engine
app.set('views', path.join(__dirname, 'view')); // Set lokasi folder view (harus "view" bukan "views")

// 10. GLOBALLY PASS SESSION DATA KE EJS
app.use((req, res, next) => {
  res.locals.userId = req.session.userId || null; // Kirim userId ke semua view EJS
  res.locals.nama = req.session.nama || null; // Kirim nama ke semua view EJS
  res.locals.role = req.session.role || null; // Kirim role ke semua view EJS
  next();
});

// 11. ROUTES
app.use(userRoutes); // Gunakan semua route dari file routes/userRoutes.js

// 12. HALAMAN UTAMA
app.get('/', (req, res) => {
  res.send('✅ Server Node.js berjalan dengan baik'); // Tampilkan teks jika akses ke root URL
});

// 13. JALANKAN SERVER
const PORT = process.env.PORT || 5000; // Ambil port dari .env, jika tidak ada gunakan 5000
app.listen(PORT, () => {
  console.log(`✅ Server aktif di http://localhost:${PORT}`); // Tampilkan info bahwa server berjalan
});
