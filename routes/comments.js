const express = require('express');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Comment = require('../models/Comment');
const User = require('../models/User');

const router = express.Router();
const MODERATOR_ROLES = new Set(['admin', 'coordinator', 'teacher']);

// GET /api/comments/:postId
router.get('/:postId', async (req, res) => {
    try {
        const comments = await Comment.find({
            postId: req.params.postId,
            status: 'active'
        }).sort({ createdAt: 1 }).select('-reportedBy -isTestData -__v');

        // Build threaded structure
        const roots = [];
        const map = {};
        for (const c of comments) {
            map[c._id] = { ...c.toObject(), replies: [] };
        }
        for (const c of comments) {
            if (c.parentId && map[c.parentId]) {
                map[c.parentId].replies.push(map[c._id]);
            } else if (!c.parentId) {
                roots.push(map[c._id]);
            }
        }

        res.json({ comments: roots, total: comments.length });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar comentários.' });
    }
});

// POST /api/comments/:postId
router.post('/:postId', authMiddleware, [
    body('content').trim().isLength({ min: 1, max: 1000 }).withMessage('Comentário deve ter entre 1 e 1000 caracteres'),
    body('parentId').optional().isMongoId()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
        const user = await User.findById(req.user.id).select('fullName username role profileImageUrl accountStatus');
        if (!user || user.accountStatus !== 'active') {
            return res.status(403).json({ error: 'Conta inativa.' });
        }

        const comment = await Comment.create({
            postId: req.params.postId,
            parentId: req.body.parentId || null,
            authorId: user._id,
            authorName: user.fullName || user.username,
            authorRole: user.role,
            authorProfileImageUrl: user.profileImageUrl || '',
            content: req.body.content
        });

        res.status(201).json({ comment: { ...comment.toObject(), replies: [] } });
    } catch {
        res.status(500).json({ error: 'Erro ao criar comentário.' });
    }
});

// DELETE /api/comments/:id — author or moderator
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);
        if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });

        const isMod = MODERATOR_ROLES.has(req.user.role);
        const isAuthor = String(comment.authorId) === String(req.user.id);

        if (!isMod && !isAuthor) {
            return res.status(403).json({ error: 'Sem permissão.' });
        }

        comment.status = 'removed';
        await comment.save();
        res.json({ message: 'Comentário removido.' });
    } catch {
        res.status(500).json({ error: 'Erro ao remover comentário.' });
    }
});

// POST /api/comments/:id/report
router.post('/:id/report', authMiddleware, async (req, res) => {
    try {
        const comment = await Comment.findById(req.params.id);
        if (!comment || comment.status !== 'active') {
            return res.status(404).json({ error: 'Comentário não encontrado.' });
        }

        const alreadyReported = comment.reportedBy.some(id => String(id) === String(req.user.id));
        if (alreadyReported) {
            return res.status(409).json({ error: 'Você já denunciou este comentário.' });
        }

        comment.reportedBy.push(req.user.id);
        comment.reports += 1;
        if (comment.reports >= 3) comment.status = 'flagged';
        await comment.save();

        res.json({ message: 'Comentário denunciado.' });
    } catch {
        res.status(500).json({ error: 'Erro ao denunciar.' });
    }
});

// GET /api/comments/flagged/list — moderators only
router.get('/flagged/list', authMiddleware, async (req, res) => {
    if (!MODERATOR_ROLES.has(req.user.role)) {
        return res.status(403).json({ error: 'Sem permissão.' });
    }
    try {
        const flagged = await Comment.find({ status: 'flagged' }).sort({ reports: -1 }).select('-__v');
        res.json({ flagged, total: flagged.length });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar comentários denunciados.' });
    }
});

// PUT /api/comments/:id/restore — moderators only
router.put('/:id/restore', authMiddleware, async (req, res) => {
    if (!MODERATOR_ROLES.has(req.user.role)) {
        return res.status(403).json({ error: 'Sem permissão.' });
    }
    try {
        const comment = await Comment.findByIdAndUpdate(
            req.params.id,
            { status: 'active', reports: 0, reportedBy: [] },
            { new: true }
        );
        if (!comment) return res.status(404).json({ error: 'Comentário não encontrado.' });
        res.json({ comment });
    } catch {
        res.status(500).json({ error: 'Erro ao restaurar.' });
    }
});

module.exports = router;
