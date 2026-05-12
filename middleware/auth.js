const jwt = require('jsonwebtoken');
const User = require('../models/User');

function getTokenFromRequest(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && typeof authHeader === 'string') {
    const match = authHeader.match(/^\s*Bearer\s+(.+?)\s*$/i);
    if (match?.[1]) return match[1];
  }
  return null;
}

module.exports = async (req, res, next) => {
  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Token missing' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');

    // payload mínimo esperado: { id, role, username, fullName }
    if (!decoded || !decoded.id) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    // confirma status atual do usuário (reduz problema de token antigo de conta banida/expulsa)
    const user = await User.findById(decoded.id).select('role accountStatus username fullName');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Não bloqueamos aqui por `accountStatus`.
    // Apenas garante que o token é válido e injeta `req.user`.


    req.user = {
      id: user._id.toString(),
      role: user.role,
      username: user.username,
      fullName: user.fullName
    };


    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};


