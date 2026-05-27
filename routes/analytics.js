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

// GET /api/analytics/committee-ranking — ranking de comitês por opção
router.get('/committee-ranking', authMiddleware, roleAuth(['admin', 'coordinator']), async (req, res) => {
    try {
        const COMMITTEES = {
            1: 'AGNU (Assembleia Geral)',
            2: 'CSNU (Conselho de Segurança)',
            3: 'OEA (Organização dos Estados Americanos)',
            4: 'Comitê 1',
            5: 'Comitê 2',
            6: 'Comitê 3',
            7: 'Comitê 4'
        };

        function normalizeText(value = '') {
            return String(value || '')
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'));
        }

        function getEducationSegment(classGroup = '') {
            const normalized = normalizeText(classGroup);
            const original = String(classGroup || '').toLowerCase();

            // Detectar 8º/9º - com ou sem º/ª
            if (
                normalized.includes('8o') ||
                normalized.includes('8 ano') ||
                normalized.includes('8ano') ||
                normalized.includes('9o') ||
                normalized.includes('9 ano') ||
                normalized.includes('9ano') ||
                normalized.includes('8 e 9') ||
                normalized.includes('8/9') ||
                original.includes('8º') ||
                original.includes('8ª') ||
                original.includes('9º') ||
                original.includes('9ª') ||
                /\b8\s*ano\b/i.test(normalized) ||
                /\b9\s*ano\b/i.test(normalized) ||
                /\b8\s*ano\b/i.test(original) ||
                /\b9\s*ano\b/i.test(original)
            ) {
                return 'em';
            }

            // Detectar Ensino Médio - com ou sem º/ª
            if (
                normalized.includes('ensino medio') ||
                normalized.includes('medio') ||
                /\bem\b/.test(normalized) ||
                /[123]\s*a?\s*serie/i.test(normalized) ||
                (/[123]\s*serie/i.test(normalized)) ||
                (/\b[123]\s*ano\b/i.test(normalized) && !normalized.includes('8o') && !normalized.includes('9o')) ||
                /\b1º\s*série\b/i.test(original) ||
                /\b2º\s*série\b/i.test(original) ||
                /\b3º\s*série\b/i.test(original) ||
                /\b1ª\s*série\b/i.test(original) ||
                /\b2ª\s*série\b/i.test(original) ||
                /\b3ª\s*série\b/i.test(original)
            ) {
                return 'fundamental';
            }

            return 'outro';
        }

        // Buscar usuários com registros
        const users = await User.find({
            role: 'candidate',
            'registration.submittedAt': { $ne: null }
        }).lean();

        const ranking = {};
        const classGroupStats = {};

        // Inicializar estruturas
        ['em', 'fundamental', 'outro'].forEach(segment => {
            ranking[segment] = {
                total: 0,
                totalChoices: 0,
                committees: {}
            };
            classGroupStats[segment] = {};
            for (let i = 1; i <= 7; i++) {
                ranking[segment].committees[i] = {
                    name: COMMITTEES[i],
                    firstChoice: 0,
                    secondChoice: 0,
                    thirdChoice: 0,
                    totalVotes: 0
                };
            }
        });

        // Processar dados
        users.forEach(user => {
            const segment = getEducationSegment(user.classGroup);
            const classGroup = user.classGroup || 'Não informado';

            if (!classGroupStats[segment][classGroup]) {
                classGroupStats[segment][classGroup] = {
                    total: 0,
                    committees: {}
                };
                for (let i = 1; i <= 7; i++) {
                    classGroupStats[segment][classGroup].committees[i] = 0;
                }
            }

            // Contar choices
            [
                { choice: user.registration?.firstChoice, type: 'firstChoice' },
                { choice: user.registration?.secondChoice, type: 'secondChoice' },
                { choice: user.registration?.thirdChoice, type: 'thirdChoice' }
            ].forEach(({ choice, type }) => {
                if (choice) {
                    ranking[segment].committees[choice][type]++;
                    ranking[segment].committees[choice].totalVotes++;
                    ranking[segment].totalChoices++;
                    ranking[segment].total++;
                    
                    classGroupStats[segment][classGroup].committees[choice]++;
                    classGroupStats[segment][classGroup].total++;
                }
            });
        });

        // Adicionar detalhes de turmas
        Object.keys(ranking).forEach(segment => {
            ranking[segment].classGroups = classGroupStats[segment];
        });

        res.json(ranking);
    } catch (error) {
        console.error('Erro ao buscar ranking:', error);
        res.status(500).json({ error: 'Erro ao buscar ranking de comitês.' });
    }
});

module.exports = router;
