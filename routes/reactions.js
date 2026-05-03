const express = require('express');
const authMiddleware = require('../middleware/auth');
const Reaction = require('../models/Reaction');

const router = express.Router();
const ALLOWED_EMOJIS = new Set(['👍', '❤️', '😂', '🤔', '🎉', '😮']);
const ALLOWED_TYPES  = new Set(['post', 'question']);

// GET /api/reactions?targetType=post&targetId=xxx
router.get('/', async (req, res) => {
    const { targetType, targetId } = req.query;
    if (!ALLOWED_TYPES.has(targetType) || !targetId) {
        return res.status(400).json({ error: 'Invalid params' });
    }

    try {
        const reactions = await Reaction.find({ targetType, targetId });
        const counts = {};
        for (const r of reactions) {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        }
        res.json({ counts });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/reactions/mine?targetType=post&targetId=xxx  (auth required)
router.get('/mine', authMiddleware, async (req, res) => {
    const { targetType, targetId } = req.query;
    if (!ALLOWED_TYPES.has(targetType) || !targetId) {
        return res.status(400).json({ error: 'Invalid params' });
    }

    try {
        const mine = await Reaction.find({ targetType, targetId, userId: req.user.id }).select('emoji');
        res.json({ emojis: mine.map(r => r.emoji) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/reactions  { targetType, targetId, emoji }  — toggle
router.post('/', authMiddleware, async (req, res) => {
    const { targetType, targetId, emoji } = req.body;
    if (!ALLOWED_TYPES.has(targetType) || !targetId || !ALLOWED_EMOJIS.has(emoji)) {
        return res.status(400).json({ error: 'Invalid params' });
    }

    try {
        const filter = { targetType, targetId, userId: req.user.id, emoji };
        const existing = await Reaction.findOne(filter);

        if (existing) {
            await Reaction.deleteOne({ _id: existing._id });
        } else {
            await Reaction.create(filter);
        }

        const reactions = await Reaction.find({ targetType, targetId });
        const counts = {};
        for (const r of reactions) {
            counts[r.emoji] = (counts[r.emoji] || 0) + 1;
        }

        const mine = await Reaction.find({ targetType, targetId, userId: req.user.id }).select('emoji');
        res.json({ counts, myEmojis: mine.map(r => r.emoji), added: !existing });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
