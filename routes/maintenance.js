const express = require('express');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleAuth');
const SiteSettings = require('../models/SiteSettings');

const router = express.Router();

async function getSettings() {
    let settings = await SiteSettings.findOne({ singletonKey: 'main' });
    if (!settings) {
        settings = await SiteSettings.create({ singletonKey: 'main' });
    }
    return settings;
}

// GET /api/admin/maintenance/status — check if maintenance mode is enabled
router.get('/status', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const settings = await getSettings();
        res.json({ maintenanceEnabled: Boolean(settings.maintenanceEnabled) });
    } catch {
        res.status(500).json({ error: 'Erro ao verificar status de manutenção.' });
    }
});

// POST /api/admin/maintenance/enable — enable maintenance mode
router.post('/enable', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const settings = await getSettings();
        settings.maintenanceEnabled = true;
        await settings.save();
        res.json({ maintenanceEnabled: true, message: 'Modo de manutenção ativado.' });
    } catch {
        res.status(500).json({ error: 'Erro ao ativar modo de manutenção.' });
    }
});

// POST /api/admin/maintenance/disable — disable maintenance mode
router.post('/disable', authMiddleware, requireRole(['admin']), async (req, res) => {
    try {
        const settings = await getSettings();
        settings.maintenanceEnabled = false;
        await settings.save();
        res.json({ maintenanceEnabled: false, message: 'Modo de manutenção desativado.' });
    } catch {
        res.status(500).json({ error: 'Erro ao desativar modo de manutenção.' });
    }
});

module.exports = router;