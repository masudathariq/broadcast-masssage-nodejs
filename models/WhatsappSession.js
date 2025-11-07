// models/WhatsappSession.js
const mongoose = require('mongoose');

const whatsappSessionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionName: String, // contoh: user-1-nomor-1
  connected: { type: Boolean, default: false },       // status apakah sesi terhubung
  connectedAt: { type: Date },                        // waktu sesi berhasil terhubung
});

module.exports = mongoose.model('WhatsappSession', whatsappSessionSchema);
