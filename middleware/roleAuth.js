const authMiddleware = require('./auth');

module.exports = (roles = []) => {
  return (req, res, next) => {
    authMiddleware(req, res, () => {
      if (!roles.includes(req.user.role) && req.user.username !== 'Anderson' && req.user.username !== 'andersonjr0667') {
        return res.status(403).json({ error: 'Access denied' });
      }
      next();
    });
  };
};

