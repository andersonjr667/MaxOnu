const express = require('express');
const { body, validationResult, query } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleAuth');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { buildDelegationGroups } = require('../utils/delegation-groups');
const { hasCommitteeRevealPassed } = require('../utils/event-config');

const router = express.Router();

function canBypassRevealLock(user) {
  return user?.role === 'admin' || user?.role === 'coordinator' || user?.role === 'teacher';
}

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

async function getSettings() {
  let settings = await SiteSettings.findOne({ singletonKey: 'main' });
  if (!settings) {
    settings = await SiteSettings.create({ singletonKey: 'main' });
  }
  return settings;
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
    if (committee && !hasCommitteeRevealPassed() && !canBypassRevealLock(req.user)) {
      return res.status(403).json({ error: 'As informações de comitê permanecem em sigilo até o fim da contagem regressiva.' });
    }

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
    if (!hasCommitteeRevealPassed() && !canBypassRevealLock(req.user)) {
      return res.status(403).json({ error: 'As informações de comitê permanecem em sigilo até o fim da contagem regressiva.' });
    }

    const committee = Number(req.params.num);
    if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
      return res.status(400).json({ error: 'Comitê inválido.' });
    }

    const filter = { committee };

    const users = await User.find(filter).select('-password');
    res.json(users);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/committee/:num/delegations', authMiddleware, requireRole(['admin', 'coordinator', 'teacher', 'press']), async (req, res) => {
  try {
    if (!hasCommitteeRevealPassed() && !canBypassRevealLock(req.user)) {
      return res.status(403).json({ error: 'As informações de comitê permanecem em sigilo até o fim da contagem regressiva.' });
    }

    const committee = Number(req.params.num);
    if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
      return res.status(400).json({ error: 'Comitê inválido.' });
    }

    const users = await User.find({ role: 'candidate', committee })
      .populate('delegationMembers', 'fullName username email classGroup committee country registration');

    const groups = buildDelegationGroups(users);
    const settings = await getSettings();

    res.json({
      committee,
      publicDelegationsReleased: settings.publicDelegationsReleased,
      delegations: groups
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/registrations', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    const groups = buildDelegationGroups(candidates);
    const rows = groups.map((group) => {
      const sourceUser = candidates.find((candidate) => group.memberIds.includes(String(candidate._id)));
      const registration = sourceUser?.registration || {};
      const committeeValues = Array.from(new Set((group.members || [])
        .map((member) => Number(member.committee))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 7)));

      return {
        key: group.key,
        memberIds: group.memberIds,
        members: group.members,
        memberNames: group.members.map((member) => member.fullName).join(' e '),
        committee: committeeValues.length === 1 ? committeeValues[0] : null,
        country: group.country || '',
        teamSize: group.teamSize || registration.teamSize || group.members.length || 2,
        registration: {
          firstChoice: registration.firstChoice ?? null,
          secondChoice: registration.secondChoice ?? null,
          thirdChoice: registration.thirdChoice ?? null,
          teamSize: registration.teamSize || group.teamSize || 2,
          submittedAt: registration.submittedAt || null
        }
      };
    });

    res.json(rows);
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
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const normalizedFullName = typeof fullName === 'string' ? fullName.trim() : '';

    const username = await generateUniqueUsername(normalizedFullName);
    const effectiveEmail = normalizedEmail || username;

    // Verificar se email já existe usando email informado ou fallback pelo username
    if (effectiveEmail) {
      const existingUser = await User.findOne({ email: effectiveEmail });
      if (existingUser) {
        return res.status(400).json({ error: 'Email já cadastrado. Use outro email.' });
      }
    }

    const newUserPayload = { 
      username, 
      fullName: normalizedFullName,
      password, 
      role,
      email: effectiveEmail
    };

    const newUser = new User(newUserPayload);
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
    if (error?.code === 11000) {
      if (error.keyPattern?.email) {
        return res.status(400).json({ error: 'Email já cadastrado. Use outro email.' });
      }

      if (error.keyPattern?.username) {
        return res.status(400).json({ error: 'Não foi possível gerar um usuário único para este nome. Tente ajustar o nome completo.' });
      }

      return res.status(400).json({ error: 'Já existe um registro com esses dados.' });
    }

    if (error?.name === 'ValidationError') {
      const firstValidationError = Object.values(error.errors || {})[0];
      return res.status(400).json({ error: firstValidationError?.message || 'Dados inválidos para criar o usuário.' });
    }

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
    if (req.body.committee !== undefined && !hasCommitteeRevealPassed() && !canBypassRevealLock(req.user)) {
      return res.status(403).json({ error: 'A definição de comitês só pode acontecer após o encerramento da contagem regressiva.' });
    }

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

router.put('/delegations/:delegationKey/country', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), [
  body('country').trim().notEmpty().withMessage('Informe um país para a delegação.')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const delegationIds = String(req.params.delegationKey)
      .split(':')
      .filter(Boolean);

    if (!delegationIds.length) {
      return res.status(400).json({ error: 'Delegação inválida.' });
    }

    const country = req.body.country.trim();
    await User.updateMany(
      { _id: { $in: delegationIds } },
      { $set: { country } }
    );

    const updatedUsers = await User.find({ _id: { $in: delegationIds } }).select('-password');
    res.json({
      message: 'País atribuído com sucesso à delegação.',
      country,
      users: updatedUsers
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put('/delegations/:delegationKey/committee', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), [
  body('committee').isInt({ min: 1, max: 7 }).withMessage('Informe um comitê válido (1 a 7).')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const delegationIds = String(req.params.delegationKey)
      .split(':')
      .filter(Boolean);

    if (!delegationIds.length) {
      return res.status(400).json({ error: 'Delegação inválida.' });
    }

    const committee = Number(req.body.committee);
    await User.updateMany(
      { _id: { $in: delegationIds } },
      { $set: { committee } }
    );

    const updatedUsers = await User.find({ _id: { $in: delegationIds } }).select('-password');
    res.json({
      message: 'Comitê definido com sucesso para a delegação.',
      committee,
      users: updatedUsers
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
