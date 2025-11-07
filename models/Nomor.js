const mongoose = require('mongoose');

const NomorSchema = new mongoose.Schema({
  nama: String,
  nomor: String,
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // Tambahkan ini
});

module.exports = mongoose.model('Nomor', NomorSchema);
