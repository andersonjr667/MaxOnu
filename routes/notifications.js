const express = require('express');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const { addSseClient, removeSseClient, emitToUser } = require('../utils/notification-center');

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
