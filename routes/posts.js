const express = require('express');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Post = require('../models/Post');
const User = require('../models/User');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const router = express.Router();
const POST_MANAGER_ROLES = new Set(['admin', 'teacher', 'coordinator', 'press']);

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'public', 'images', 'posts');
    fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `${Date.now()}-${file.fieldname}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  }
});

const upload = multer({
  storage: imageStorage,
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

function uploadImage(req, res, next) {
  upload.single('image')(req, res, (error) => {
    if (error) {
      return res.status(400).json({ error: error.message });
    }
    next();
  });
}

function ensurePostManager(req, res, next) {
  if (!req.user || !POST_MANAGER_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
}

router.get('/', async (req, res) => {
  try {
    const posts = await Post.find({ published: true }).sort({ createdAt: -1 });
    res.json(posts);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.post('/', authMiddleware, ensurePostManager, uploadImage, [
  body('title').trim().notEmpty().withMessage('Title required'),
  body('content').trim().isLength({ min: 10 }).withMessage('Content min 10 chars'),
  body('excerpt').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const user = await User.findById(req.user.id).select('username role');
    if (!user || !POST_MANAGER_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const title = req.body.title.trim();
    const content = req.body.content.trim();
    const excerpt = (req.body.excerpt || '').trim() || content.slice(0, 170);
    const imageUrl = req.file ? `/images/posts/${req.file.filename}` : '';

    const post = new Post({
      title,
      excerpt,
      content,
      imageUrl,
      authorName: user.username,
      authorRole: user.role
    });

    await post.save();
    res.status(201).json(post);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
