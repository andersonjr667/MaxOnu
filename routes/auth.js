const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { hasCommitteeRevealPassed } = require('../utils/event-config');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');
const { hasCloudinaryConfig, uploadImageBuffer, destroyAsset } = require('../utils/cloudinary');

const router = express.Router();
const profileImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|jpg|png|gif|webp)$/.test(file.mimetype)) {
      return cb(null, true);
    }

    cb(new Error('Tipo de arquivo inválido. Envie JPEG, PNG, GIF ou WEBP.'));
  }
});

function uploadProfileImage(req, res, next) {
  profileImageUpload.single('avatar')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    next();
  });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^[._-]+|[._-]+$)/g, '');
}

function hasEmailTransportConfig() {
  return Boolean(
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASSWORD &&
    !String(process.env.EMAIL_USER).includes('seu-email') &&
    !String(process.env.EMAIL_PASSWORD).includes('sua-senha')
  );
}

async function sendPasswordResetEmail({ to, fullName, resetLink }) {
  if (!hasEmailTransportConfig()) {
    return false;
  }

  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASSWORD
    }
  });

  await transporter.sendMail({
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: 'Recuperacao de senha - MaxOnu 2026',
    text: [
      `Ola, ${fullName || 'participante'}!`,
      '',
      'Recebemos um pedido para redefinir sua senha da MaxOnu 2026.',
      `Use este link para continuar: ${resetLink}`,
      '',
      'O link expira em 1 hora. Se voce nao solicitou a alteracao, ignore esta mensagem.'
    ].join('\n')
  });

  return true;
}

async function syncPartnerLabelsByUserIds(userIds) {
  if (!Array.isArray(userIds) || !userIds.length) {
    return;
  }

  const users = await User.find({ _id: { $in: userIds } }).select('_id delegationMembers');
  await Promise.all(users.map(async (currentUser) => {
    const memberNames = await User.find({ _id: { $in: currentUser.delegationMembers || [] } }).select('username');
    const partner = memberNames.map((member) => member.username).join(', ');
    await User.updateOne({ _id: currentUser._id }, { $set: { partner } });
  }));
}

// POST /api/register
router.post('/register', [
  body('fullName').trim().notEmpty().withMessage('Nome completo obrigatório'),
  body('username')
    .trim()
    .notEmpty().withMessage('Usuário obrigatório')
    .isLength({ min: 3, max: 24 }).withMessage('Usuário deve ter entre 3 e 24 caracteres')
    .matches(/^[a-zA-Z0-9._-]+$/).withMessage('Usuário deve conter apenas letras, números, ponto, hífen ou underscore'),
  body('email').isEmail().withMessage('Email inválido'),
  body('password').isLength({ min: 6 }).withMessage('Senha precisa ter ao menos 6 caracteres'),
  body('classGroup').trim().notEmpty().withMessage('Turma obrigatória'),
  body('gender')
    .isIn(['masculino', 'feminino', 'nao-binario', 'outro', 'prefiro-nao-informar'])
    .withMessage('Gênero inválido'),
  body('acceptTerms').custom((value) => {
    if (value !== true) {
      throw new Error('Você precisa aceitar os termos de uso.');
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { fullName, username, email, password, classGroup, gender } = req.body;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUsername = normalizeUsername(username);

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado. Use outro email ou faça login.' });
    }

    if (!normalizedUsername || normalizedUsername.length < 3) {
      return res.status(400).json({ error: 'Escolha um usuário válido com ao menos 3 caracteres.' });
    }

    const existingUsername = await User.findOne({ username: normalizedUsername });
    if (existingUsername) {
      return res.status(400).json({ error: 'Este usuário já está em uso. Escolha outro.' });
    }

    const user = new User({
      username: normalizedUsername,
      fullName: fullName.trim(),
      email: normalizedEmail,
      password,
      classGroup: classGroup.trim(),
      gender,
      termsAccepted: true,
      termsAcceptedAt: new Date()
    });

    await user.save();
    res.status(201).json({
      message: 'Cadastro realizado com sucesso',
      username: user.username
    });
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

    // Se 2FA está ativado, não gerar token JWT
    if (user.twoFactorEnabled) {
      return res.json({ 
        userId: user._id,
        twoFactorRequired: true,
        message: '2FA obrigatório'
      });
    }

    const token = user.generateToken();
    res.json({ token, isAdmin: user.role === 'admin', role: user.role, twoFactorRequired: false });
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

    if (!hasCommitteeRevealPassed()) {
      user.committee = null;
      if (user.registration) {
        user.registration.firstChoice = null;
        user.registration.secondChoice = null;
        user.registration.thirdChoice = null;
      }
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
  body('country').optional().trim().isLength({ min: 1 }).withMessage('País inválido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { fullName, email, country } = req.body;
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

    if (country !== undefined) {
      updates.country = country.trim();
    }

    const updatedUser = await User.findByIdAndUpdate(req.user.id, updates, { new: true }).select('-password');
    res.json(updatedUser);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/me/password - Change own password
router.put('/me/password', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Senha atual obrigatória'),
  body('newPassword').isLength({ min: 6 }).withMessage('A nova senha precisa ter ao menos 6 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const passwordMatches = await user.comparePassword(currentPassword);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'A nova senha precisa ser diferente da senha atual' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: 'Senha atualizada com sucesso.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/me/avatar', authMiddleware, uploadProfileImage, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Envie uma imagem para atualizar sua foto de perfil.' });
    }

    if (!hasCloudinaryConfig) {
      return res.status(500).json({ error: 'Upload de imagem indisponível: Cloudinary não configurado.' });
    }

    const user = await User.findById(req.user.id).select('profileImagePublicId');
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    const uploadedImage = await uploadImageBuffer(req.file.buffer, {
      folder: 'maxonu/avatars',
      public_id: `avatar-${req.user.id}-${Date.now()}`,
      transformation: [
        { width: 640, height: 640, crop: 'limit' },
        { quality: 'auto', fetch_format: 'auto' }
      ]
    });

    if (user.profileImagePublicId) {
      await destroyAsset(user.profileImagePublicId, { resource_type: 'image' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        profileImageUrl: uploadedImage?.secure_url || '',
        profileImagePublicId: uploadedImage?.public_id || ''
      },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Foto de perfil atualizada com sucesso.',
      user: updatedUser
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/me/avatar', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('profileImagePublicId');
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado.' });
    }

    if (user.profileImagePublicId) {
      await destroyAsset(user.profileImagePublicId, { resource_type: 'image' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      {
        profileImageUrl: '',
        profileImagePublicId: ''
      },
      { new: true }
    ).select('-password');

    res.json({
      message: 'Foto de perfil removida com sucesso.',
      user: updatedUser
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/me - Delete own account
router.delete('/me', authMiddleware, [
  body('currentPassword').notEmpty().withMessage('Senha atual obrigatória')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { currentPassword } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const passwordMatches = await user.comparePassword(currentPassword);
    if (!passwordMatches) {
      return res.status(401).json({ error: 'Senha atual incorreta' });
    }

    const relatedUserIds = (user.delegationMembers || []).map((memberId) => String(memberId));

    await User.updateMany(
      { delegationMembers: user._id },
      { $pull: { delegationMembers: user._id } }
    );

    await User.updateMany(
      { 'invitations.fromUser': user._id },
      {
        $set: {
          'invitations.$[inv].status': 'rejected',
          'invitations.$[inv].respondedAt': new Date()
        }
      },
      {
        arrayFilters: [{ 'inv.fromUser': user._id, 'inv.status': 'pending' }]
      }
    );

    await User.deleteOne({ _id: user._id });
    await syncPartnerLabelsByUserIds(relatedUserIds);

    res.json({ message: 'Conta excluída com sucesso.' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/sync-admin - Sincronizar usuário admin padrão
router.post('/sync-admin', async (req, res) => {
  try {
    const DEFAULT_ADMIN = {
      username: 'Anderson',
      fullName: 'Anderson (Admin)',
      password: '152070an',
      email: 'alsj1520@gmail.com',
      role: 'admin',
      classGroup: 'Administracao'
    };

    const existingUser = await User.findOne({
      $or: [
        { username: DEFAULT_ADMIN.username },
        { email: DEFAULT_ADMIN.email }
      ]
    });

    if (!existingUser) {
      const adminUser = new User(DEFAULT_ADMIN);
      await adminUser.save();
      return res.json({ 
        message: 'Admin user criado com sucesso',
        user: {
          username: adminUser.username,
          email: adminUser.email,
          role: adminUser.role
        }
      });
    }

    let hasChanges = false;

    if (existingUser.username !== DEFAULT_ADMIN.username) {
      existingUser.username = DEFAULT_ADMIN.username;
      hasChanges = true;
    }

    if (existingUser.email !== DEFAULT_ADMIN.email) {
      existingUser.email = DEFAULT_ADMIN.email;
      hasChanges = true;
    }

    if (existingUser.role !== DEFAULT_ADMIN.role) {
      existingUser.role = DEFAULT_ADMIN.role;
      hasChanges = true;
    }

    if (!existingUser.fullName || existingUser.fullName.trim() === '') {
      existingUser.fullName = DEFAULT_ADMIN.fullName;
      hasChanges = true;
    }

    const passwordMatches = await existingUser.comparePassword(DEFAULT_ADMIN.password);
    if (!passwordMatches) {
      existingUser.password = DEFAULT_ADMIN.password;
      hasChanges = true;
    }

    if (hasChanges) {
      await existingUser.save();
      return res.json({ 
        message: 'Admin user sincronizado com sucesso',
        changes: true,
        user: {
          username: existingUser.username,
          email: existingUser.email,
          role: existingUser.role
        }
      });
    }

    res.json({ 
      message: 'Admin user já está sincronizado',
      changes: false,
      user: {
        username: existingUser.username,
        email: existingUser.email,
        role: existingUser.role
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// ==================== FORGOT PASSWORD ====================

// POST /api/forgot-password
router.post('/forgot-password', [
  body('email').isEmail().withMessage('Email inválido')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { email } = req.body;
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Don't reveal if email exists for security reasons
      return res.json({ message: 'Se o email existe em nosso banco, você receberá instruções para resetar a senha' });
    }

    const resetToken = user.generatePasswordResetToken();
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${encodeURIComponent(resetToken)}`;
    const emailSent = await sendPasswordResetEmail({
      to: user.email,
      fullName: user.fullName,
      resetLink
    });

    res.json({ 
      message: emailSent
        ? 'Instruções enviadas para seu email'
        : 'Pedido recebido. Como o email ainda não está configurado, use o link de teste exibido abaixo.',
      // Remover em produção - apenas para teste
      resetToken: process.env.NODE_ENV !== 'production' ? resetToken : undefined,
      resetLink: process.env.NODE_ENV !== 'production' ? resetLink : undefined
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/reset-password
router.post('/reset-password', [
  body('token').notEmpty().withMessage('Token obrigatório'),
  body('newPassword').isLength({ min: 6 }).withMessage('Senha precisa ter ao menos 6 caracteres')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { token, newPassword } = req.body;

    // Verificar se o token é válido decodificando o JWT
    const decoded = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'your-secret-key');
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(400).json({ error: 'Usuário não encontrado' });
    }

    if (!user.verifyPasswordResetToken(token)) {
      return res.status(400).json({ error: 'Token de reset inválido ou expirado' });
    }

    user.password = newPassword;
    user.clearPasswordResetToken();
    await user.save();

    res.json({ message: 'Senha resetada com sucesso. Faça login com sua nova senha.' });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(400).json({ error: 'Token de reset expirou' });
    }
    res.status(400).json({ error: error.message });
  }
});

// ==================== TWO-FACTOR AUTHENTICATION ====================

// POST /api/setup-2fa - Inicia o setup de 2FA
router.post('/setup-2fa', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Gerar novo secret
    const secret = speakeasy.generateSecret({
      name: `MaxOnu2026 (${user.email})`,
      issuer: process.env.TWOFACTOR_ISSUER || 'MaxOnu2026',
      length: 32
    });

    // Gerar QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    // Gerar backup codes
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      backupCodes.push({
        code: crypto.randomBytes(4).toString('hex').toUpperCase(),
        used: false
      });
    }

    // Salvar temporariamente (não ativado ainda)
    user.twoFactorSecret = secret.base32;
    user.twoFactorBackupCodes = backupCodes;
    user.twoFactorVerified = false;
    await user.save();

    res.json({
      qrCode,
      secret: secret.base32,
      backupCodes: backupCodes.map(b => b.code),
      message: 'Escanear QR code com seu authenticator'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/verify-2fa-setup - Verifica e ativa 2FA
router.post('/verify-2fa-setup', authMiddleware, [
  body('token').isNumeric().isLength({ min: 6, max: 6 }).withMessage('Token 2FA deve ter 6 dígitos')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { token } = req.body;
    const user = await User.findById(req.user.id);

    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'Setup 2FA não iniciado' });
    }

    // Verificar o código TOTP
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token,
      window: parseInt(process.env.TWOFACTOR_WINDOW) || 2
    });

    if (!verified) {
      return res.status(400).json({ error: 'Código 2FA inválido' });
    }

    // Ativar 2FA
    user.twoFactorEnabled = true;
    user.twoFactorVerified = true;
    await user.save();

    res.json({ 
      message: '2FA ativado com sucesso',
      twoFactorEnabled: true
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/disable-2fa - Desativa 2FA
router.post('/disable-2fa', authMiddleware, [
  body('password').notEmpty().withMessage('Senha obrigatória para desativar 2FA')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { password } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Verificar senha
    const passwordMatch = await user.comparePassword(password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Senha incorreta' });
    }

    // Desativar 2FA
    user.twoFactorEnabled = false;
    user.twoFactorVerified = false;
    user.twoFactorSecret = null;
    user.twoFactorBackupCodes = [];
    await user.save();

    res.json({ 
      message: '2FA desativado com sucesso',
      twoFactorEnabled: false
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/verify-2fa-login - Verifica código 2FA no login
router.post('/verify-2fa-login', [
  body('userId').notEmpty().withMessage('userId obrigatório'),
  body('token').notEmpty().withMessage('Código 2FA obrigatório')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const { userId, token } = req.body;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.twoFactorEnabled || !user.twoFactorSecret) {
      return res.status(400).json({ error: '2FA não está ativado' });
    }

    // Tentar código TOTP
    const totpVerified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token,
      window: parseInt(process.env.TWOFACTOR_WINDOW) || 2
    });

    if (totpVerified) {
      const jwtToken = user.generateToken();
      return res.json({ 
        token: jwtToken,
        isAdmin: user.role === 'admin',
        role: user.role,
        message: '2FA verificado com sucesso'
      });
    }

    // Tentar backup code
    const backupCodeIndex = user.twoFactorBackupCodes.findIndex(
      b => b.code === token.toUpperCase() && !b.used
    );

    if (backupCodeIndex !== -1) {
      user.twoFactorBackupCodes[backupCodeIndex].used = true;
      await user.save();

      const jwtToken = user.generateToken();
      return res.json({ 
        token: jwtToken,
        isAdmin: user.role === 'admin',
        role: user.role,
        message: 'Backup code usado com sucesso'
      });
    }

    res.status(401).json({ error: 'Código 2FA inválido' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/2fa-status - Verificar status de 2FA
router.get('/2fa-status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('twoFactorEnabled twoFactorVerified');
    res.json({ 
      twoFactorEnabled: user?.twoFactorEnabled || false,
      twoFactorVerified: user?.twoFactorVerified || false,
      message: user?.twoFactorEnabled ? '2FA está ativado' : '2FA não está ativado'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
