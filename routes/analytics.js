const express = require('express');
const authMiddleware = require('../middleware/auth');
const roleAuth = require('../middleware/roleAuth');
const User = require('../models/User');
const Post = require('../models/Post');
const Newsletter = require('../models/Newsletter');
const Comment = require('../models/Comment');

const router = express.Router();

// GET /api/analytics/overview — admin/coordinator only
router.get('/overview', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const [
            totalUsers,
            totalPosts,
            totalNewsletter,
            totalComments,
            registeredUsers,
            assignedUsers,
            lastWeekUsers,
            lastWeekRegistrations
        ] = await Promise.all([
            User.countDocuments({ role: 'candidate' }),
            Post.countDocuments({ published: true }),
            Newsletter.countDocuments({ active: true }),
            Comment.countDocuments({ status: 'active' }),
            User.countDocuments({ role: 'candidate', 'registration.submittedAt': { $ne: null } }),
            User.countDocuments({ role: 'candidate', committee: { $gte: 1, $lte: 7 } }),
            User.countDocuments({ role: 'candidate', createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
            User.countDocuments({ role: 'candidate', 'registration.submittedAt': { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } })
        ]);

        const conversionRate = totalUsers > 0 ? ((registeredUsers / totalUsers) * 100).toFixed(1) : 0;
        const avgCommentsPerPost = totalPosts > 0 ? (totalComments / totalPosts).toFixed(1) : 0;

        res.json({
            totalUsers,
            totalPosts,
            totalNewsletter,
            totalComments,
            registeredUsers,
            assignedUsers,
            conversionRate,
            avgCommentsPerPost,
            lastWeekUsers,
            lastWeekRegistrations
        });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar métricas.' });
    }
});

// GET /api/analytics/registrations-over-time — inscrições por dia (últimos 30 dias)
router.get('/registrations-over-time', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const days = Number(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);

        const data = await User.aggregate([
            {
                $match: {
                    role: 'candidate',
                    'registration.submittedAt': { $gte: since }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: { format: '%Y-%m-%d', date: '$registration.submittedAt' }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({ data });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

// GET /api/analytics/users-over-time — cadastros por dia (últimos 30 dias)
router.get('/users-over-time', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const days = Number(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);

        const data = await User.aggregate([
            { $match: { createdAt: { $gte: since }, role: 'candidate' } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({ data });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

// GET /api/analytics/committee-distribution — distribuição por comitê
router.get('/committee-distribution', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const data = await User.aggregate([
            { $match: { role: 'candidate', committee: { $gte: 1, $lte: 7 } } },
            { $group: { _id: '$committee', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({ data });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

// GET /api/analytics/newsletter-over-time — inscrições newsletter por dia
router.get('/newsletter-over-time', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const days = Number(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);

        const data = await Newsletter.aggregate([
            { $match: { createdAt: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({ data });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

// GET /api/analytics/class-distribution — distribuição por turma
router.get('/class-distribution', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const data = await User.aggregate([
            { $match: { role: 'candidate', 'registration.classGroup': { $exists: true, $ne: null } } },
            { $group: { _id: '$registration.classGroup', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({ data });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

// GET /api/analytics/engagement-over-time — posts e comentários por dia
router.get('/engagement-over-time', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const days = Number(req.query.days) || 30;
        const since = new Date();
        since.setDate(since.getDate() - days);

        const [posts, comments] = await Promise.all([
            Post.aggregate([
                { $match: { createdAt: { $gte: since }, published: true } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ]),
            Comment.aggregate([
                { $match: { createdAt: { $gte: since }, status: 'active' } },
                {
                    $group: {
                        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        res.json({ posts, comments });
    } catch {
        res.status(500).json({ error: 'Erro ao buscar dados.' });
    }
});

module.exports = router;
