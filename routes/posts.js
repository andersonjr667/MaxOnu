const express = require('express');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Post = require('../models/Post');
const User = require('../models/User');
const multer = require('multer');
const { hasCloudinaryConfig, uploadImageBuffer } = require('../utils/cloudinary');

const router = express.Router();
const POST_MANAGER_ROLES = new Set(['admin', 'teacher', 'coordinator', 'press']);

const upload = multer({
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
    let imageUrl = '';

    if (req.file) {
      if (!hasCloudinaryConfig) {
        return res.status(500).json({ error: 'Upload de imagem indisponível: Cloudinary não configurado.' });
      }

      const uploadedImage = await uploadImageBuffer(req.file.buffer, {
        public_id: `post-${Date.now()}-${Math.round(Math.random() * 1e9)}`
      });

      imageUrl = uploadedImage?.secure_url || '';
    }

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

router.put('/:id', authMiddleware, ensurePostManager, [
  body('title').trim().notEmpty().withMessage('Title required'),
  body('content').trim().isLength({ min: 10 }).withMessage('Content min 10 chars'),
  body('excerpt').optional().trim()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const user = await User.findById(req.user.id).select('role');
    if (!user || !POST_MANAGER_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const title = req.body.title.trim();
    const content = req.body.content.trim();
    const excerpt = (req.body.excerpt || '').trim() || content.slice(0, 170);

    post.title = title;
    post.content = content;
    post.excerpt = excerpt;

    await post.save();
    res.json(post);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete('/:id', authMiddleware, ensurePostManager, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('role');
    if (!user || !POST_MANAGER_ROLES.has(user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deleted = await Post.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
