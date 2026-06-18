const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const { addSseClient, removeSseClient, emitToUser } = require('../utils/notification-center');
const { areAssignmentsReleased, canViewAssignments } = require('../utils/assignment-visibility');

const router = express.Router();

function normalizeNotification(item) {
    return {
        id: String(item._id),
        type: item.type,
        title: item.title,
        message: item.message,
        payload: item.payload || {},
        readAt: item.readAt || null,
        createdAt: item.createdAt
    };
}

router.get('/', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('notifications');
        if (!user) {
            return res.status(404).json({ error: 'Usuario nao encontrado.' });
        }

        const notifications = (user.notifications || [])
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .map(normalizeNotification);

        const unreadCount = notifications.filter((item) => !item.readAt).length;
        res.json({ notifications, unreadCount });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/history', authMiddleware, async (req, res) => {
    const ALLOWED = new Set(['admin', 'coordinator', 'teacher', 'press']);
    if (!ALLOWED.has(req.user?.role)) {
        return res.status(403).json({ error: 'Sem permissão.' });
    }

    try {
        const users = await User.find({ 'notifications.type': 'admin-broadcast' })
            .select('notifications')
            .lean();

        const allBroadcasts = [];
        const seen = new Set();

        users.forEach((user) => {
            (user.notifications || []).forEach((notif) => {
                if (notif.type === 'admin-broadcast') {
                    const key = `${notif.title}-${notif.createdAt}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        allBroadcasts.push(normalizeNotification(notif));
                    }
                }
            });
        });

        allBroadcasts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        res.json({ notifications: allBroadcasts.slice(0, 20) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/:id/read', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('notifications');
        if (!user) {
            return res.status(404).json({ error: 'Usuario nao encontrado.' });
        }

        const target = user.notifications.id(req.params.id);
        if (!target) {
            return res.status(404).json({ error: 'Notificacao nao encontrada.' });
        }

        if (!target.readAt) {
            target.readAt = new Date();
            await user.save();
        }

        emitToUser(req.user.id, 'notification-read', { id: String(target._id), readAt: target.readAt });
        res.json({ success: true, notification: normalizeNotification(target) });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// POST /api/notifications/send — envia notificação para alunos com filtros
router.post('/send', authMiddleware, async (req, res) => {
    const ALLOWED = new Set(['admin', 'coordinator', 'teacher', 'press']);
    if (!ALLOWED.has(req.user?.role)) {
        return res.status(403).json({ error: 'Sem permissão para enviar notificações.' });
    }

    const { title, message, target, committee, unit, classGroup } = req.body;

    if (!title?.trim() || !message?.trim()) {
        return res.status(400).json({ error: 'Título e mensagem são obrigatórios.' });
    }

    if (!target) {
        return res.status(400).json({ error: 'Defina o público-alvo.' });
    }

    try {
        const filter = { role: 'candidate' };

        if (target === 'committee') {
            if (!canViewAssignments(req.user) && !await areAssignmentsReleased()) {
                return res.status(403).json({ error: 'As atribuicoes permanecem em sigilo ate a liberacao oficial.' });
            }

            const committeeVal = String(committee || '');
            if (committeeVal === 'unassigned') {
                filter.$or = [{ committee: null }, { committee: { $exists: false } }];
            } else if (committeeVal) {
                filter.committee = Number(committeeVal);
            }
        } else if (target === 'unit' && unit) {
            filter.classGroup = { $regex: new RegExp(`^${unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') };
        } else if (target === 'allUnits') {
            filter.classGroup = { $regex: /^(Sta Ines|Palmares)/i };
        } else if (target === 'classGroup') {
            // classGroups é um array de turmas selecionadas; classGroup é turma única (legado)
            const { classGroups } = req.body;
            if (Array.isArray(classGroups) && classGroups.length) {
                filter.classGroup = { $in: classGroups.map((cg) => new RegExp(cg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')) };
            } else if (classGroup) {
                filter.classGroup = { $regex: new RegExp(classGroup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') };
            }
        } else if (target === 'noCommittee') {
            if (!canViewAssignments(req.user) && !await areAssignmentsReleased()) {
                return res.status(403).json({ error: 'As atribuicoes permanecem em sigilo ate a liberacao oficial.' });
            }

            filter.$or = [{ committee: null }, { committee: { $exists: false } }];
        } else if (target === 'segment') {
            const seg = String(req.body.segment || '').toLowerCase();
            if (seg === 'em') {
                filter.classGroup = { $regex: /serie/i };
            } else if (seg === 'fundamental') {
                filter.classGroup = { $regex: /ano/i };
            }
            // seg === 'all' → sem filtro adicional
        }
        // target === 'all' ou unit/allUnits sem valor → sem filtro adicional

        const recipients = await User.find(filter).select('_id');
        if (!recipients.length) {
            return res.status(404).json({ error: 'Nenhum aluno encontrado para o público-alvo selecionado.' });
        }

        const notification = {
            type: 'admin-broadcast',
            title: title.trim(),
            message: message.trim(),
            payload: { sentBy: req.user.username || req.user.id },
            createdAt: new Date()
        };

        await User.updateMany(
            { _id: { $in: recipients.map((r) => r._id) } },
            { $push: { notifications: { $each: [notification], $position: 0 } } }
        );

        // Emitir SSE em tempo real para quem estiver online
        const { emitToUser } = require('../utils/notification-center');
        recipients.forEach((r) => emitToUser(String(r._id), 'new-notification', notification));

        res.json({ success: true, sent: recipients.length });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.patch('/read-all', authMiddleware, async (req, res) => {
    try {
        await User.updateOne(
            { _id: req.user.id },
            { $set: { 'notifications.$[item].readAt': new Date() } },
            { arrayFilters: [{ 'item.readAt': null }] }
        );

        emitToUser(req.user.id, 'notification-read-all', { readAt: new Date() });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.delete('/broadcast/:title/:timestamp', authMiddleware, async (req, res) => {
    const ALLOWED = new Set(['admin', 'coordinator', 'teacher', 'press']);
    if (!ALLOWED.has(req.user?.role)) {
        return res.status(403).json({ error: 'Sem permissão.' });
    }

    try {
        const { title, timestamp } = req.params;
        const targetDate = new Date(parseInt(timestamp));

        const result = await User.updateMany(
            { 'notifications.type': 'admin-broadcast' },
            { $pull: { notifications: { type: 'admin-broadcast', title, createdAt: targetDate } } }
        );

        res.json({ success: true, deletedFrom: result.modifiedCount });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/stream', async (req, res) => {
    const token = String(req.query.token || '');
    if (!token) {
        return res.status(401).json({ error: 'Token missing' });
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
    }

    const userId = decoded.id;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    addSseClient(userId, res);
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const keepAlive = setInterval(() => {
        try {
            res.write(`event: ping\ndata: {}\n\n`);
        } catch (error) {
            clearInterval(keepAlive);
        }
    }, 25000);

    req.on('close', () => {
        clearInterval(keepAlive);
        removeSseClient(userId, res);
    });
});

module.exports = router;
