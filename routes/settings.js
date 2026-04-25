const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleAuth');
const SiteSettings = require('../models/SiteSettings');
const { getRegistrationState } = require('../utils/event-config');

const router = express.Router();

async function getSettings() {
    let settings = await SiteSettings.findOne({ singletonKey: 'main' });
    if (!settings) {
        settings = await SiteSettings.create({ singletonKey: 'main' });
    }
    return settings;
}

router.get('/public-release', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json({
            publicDelegationsReleased: settings.publicDelegationsReleased,
            updatedAt: settings.updatedAt
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/registration-status', async (req, res) => {
    try {
        const registrationState = await getRegistrationState();
        const settings = await getSettings();

        res.json({
            registrationOpen: registrationState.registrationOpen,
            registrationManuallyClosed: registrationState.registrationManuallyClosed,
            revealPassed: registrationState.revealPassed,
            updatedAt: settings.updatedAt
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/public-release', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
    try {
        const settings = await getSettings();
        settings.publicDelegationsReleased = Boolean(req.body.publicDelegationsReleased);
        await settings.save();

        res.json({
            message: settings.publicDelegationsReleased
                ? 'As delegações foram liberadas para visualização pública.'
                : 'A visualização pública das delegações foi desativada.',
            publicDelegationsReleased: settings.publicDelegationsReleased,
            updatedAt: settings.updatedAt
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.put('/registration-status', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
    try {
        const settings = await getSettings();
        settings.registrationManuallyClosed = Boolean(req.body.registrationManuallyClosed);
        await settings.save();

        const registrationState = await getRegistrationState();

        res.json({
            message: settings.registrationManuallyClosed
                ? 'As inscrições foram fechadas manualmente.'
                : 'As inscrições foram reabertas.',
            registrationOpen: registrationState.registrationOpen,
            registrationManuallyClosed: registrationState.registrationManuallyClosed,
            revealPassed: registrationState.revealPassed,
            updatedAt: settings.updatedAt
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
