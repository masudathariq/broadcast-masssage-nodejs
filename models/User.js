const mongoose = require('mongoose');

// Skema data untuk user
const userSchema = new mongoose.Schema({
  nama: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true // default user aktif saat dibuat
  },
  lastSeen: { 
    type: Date, 
    default: null 
  }, // 🆕 waktu terakhir 
  lastLogin: { 
    type: Date }, // ⬅️ Tambahkan ini
  currentSession: {
    type: String,
    default: null
  },

}, {
  timestamps: true // otomatis menambahkan createdAt & updatedAt
});


// Ekspor model
module.exports = mongoose.model('User', userSchema);
