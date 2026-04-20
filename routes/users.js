const express = require('express');
const { body, validationResult, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleAuth');
const User = require('../models/User');

const router = express.Router();

async function generateUniqueUsername(fullName) {
  const baseUsername = fullName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'usuario';

  let username = baseUsername;
  let counter = 1;

  while (await User.exists({ username })) {
    username = `${baseUsername}_${counter++}`;
  }

  return username;
}

// GET /api/users - List users
router.get('/', authMiddleware, requireRole(['admin', 'coordinator', 'teacher', 'press']), [
  query('role').optional().isIn(['candidate', 'teacher', 'coordinator', 'admin', 'press']),
  query('committee').optional().isInt()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { role, committee } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (committee) filter.committee = Number(committee);
    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/users/committee/:num
router.get('/committee/:num', authMiddleware, requireRole(['admin', 'coordinator', 'teacher', 'press']), async (req, res) => {
  try {
    const committee = Number(req.params.num);
    if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
      return res.status(400).json({ error: 'Comitê inválido.' });
    }

    const filter = { committee };
    if (req.user.role === 'teacher') {
      filter.role = 'candidate';
    }

    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/users/:id
router.get('/:id', authMiddleware, requireRole(['admin', 'coordinator', 'teacher', 'press']), async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    res.json(user || {});
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/users - Create user as admin
router.post('/', authMiddleware, requireRole(['admin']), [
  body('fullName').trim().notEmpty().withMessage('Nome completo é obrigatório'),
  body('email').optional({ checkFalsy: true }).isEmail().withMessage('Email inválido').normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Senha deve ter ao menos 6 caracteres'),
  body('role').isIn(['teacher', 'coordinator', 'press']).withMessage('Permissão inválida')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const { fullName, email, password, role } = req.body;
    
    // Verificar se email já existe apenas se foi fornecido
    if (email && email.trim() !== '') {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Email já cadastrado. Use outro email.' });
      }
    }

    const username = await generateUniqueUsername(fullName);
    const newUser = new User({ 
      username, 
      fullName, 
      email: (email && email.trim().length > 0) ? email.trim() : null, 
      password, 
      role 
    });
    await newUser.save();

    res.status(201).json({
      user: {
        _id: newUser._id,
        username: newUser.username,
        fullName: newUser.fullName,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/users/:id - Update user
router.put('/:id', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), [
  body('committee').optional().isInt(),
  body('country').optional().isLength({ min: 1 }),
  body('role').optional().isIn(['candidate', 'teacher', 'coordinator', 'admin', 'press'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const updates = {
      ...(req.body.committee !== undefined ? { committee: Number(req.body.committee) } : {}),
      ...(req.body.country !== undefined ? { country: req.body.country.trim() } : {})
    };

    if (req.user.role === 'admin' && req.body.role !== undefined) {
      updates.role = req.body.role;
    }

    const updated = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    res.json(updated);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
