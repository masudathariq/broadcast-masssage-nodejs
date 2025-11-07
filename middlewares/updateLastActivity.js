const User = require('../models/User');

module.exports = async (req, res, next) => {
  if (req.session.userId) {
    await User.findByIdAndUpdate(req.session.userId, { lastLogin: new Date() });
  }
  next();
};
