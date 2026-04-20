const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeFullNameToUsername(fullName) {
  const normalized = fullName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .toLowerCase();

  return normalized || 'user';
}

async function generateUniqueUsername(fullName) {
  const base = normalizeFullNameToUsername(fullName);
  let username = base;
  let suffix = 0;

  while (await User.exists({ username })) {
    suffix += 1;
    username = `${base}-${suffix}`;
  }

  return username;
}

// POST /api/register
router.post('/register', [
  body('fullName').trim().notEmpty().withMessage('Nome completo obrigatório'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha precisa ter ao menos 6 caracteres'),
  body('classGroup').trim().notEmpty().withMessage('Turma obrigatória')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { fullName, email, password, classGroup } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado. Use outro email ou faça login.' });
    }

    const username = await generateUniqueUsername(fullName);
    const user = new User({
      username,
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      classGroup: classGroup.trim()
    });

    await user.save();
    res.status(201).json({ message: 'Cadastro realizado com sucesso' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/login
router.post('/login', [
  body('email').trim().notEmpty().withMessage('Email obrigatório'),
  body('password').notEmpty().withMessage('Senha obrigatória')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { email, password } = req.body;
    const loginValue = email.trim().toLowerCase();

    const user = await User.findOne({
      $or: [
        { email: loginValue },
        { username: new RegExp(`^${escapeRegex(loginValue)}$`, 'i') }
      ]
    });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = user.generateToken();
    res.json({ token, isAdmin: user.role === 'admin', role: user.role });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/me
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/check-admin
router.get('/check-admin', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('role');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ isAdmin: user.role === 'admin', role: user.role });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/me - Update own profile
router.put('/me', authMiddleware, [
  body('fullName').optional().trim().isLength({ min: 1 }).withMessage('Nome completo é obrigatório'),
  body('email').optional().isEmail().withMessage('Email inválido'),
  body('classGroup').optional().trim().isLength({ min: 1 }).withMessage('Turma inválida'),
  body('country').optional().trim().isLength({ min: 1 }).withMessage('País inválido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { fullName, email, classGroup, country } = req.body;
    const updates = {};

    if (fullName !== undefined) {
      updates.fullName = fullName.trim();
    }

    if (email !== undefined) {
      const normalizedEmail = email.trim().toLowerCase();
      const existing = await User.findOne({ email: normalizedEmail, _id: { $ne: req.user.id } });
      if (existing) {
        return res.status(400).json({ error: 'Email já cadastrado por outro usuário.' });
      }
      updates.email = normalizedEmail;
    }

    if (classGroup !== undefined) {
      updates.classGroup = classGroup.trim();
    }

    if (country !== undefined) {
      updates.country = country.trim();
    }

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
