const SiteSettings = require('../models/SiteSettings');

const settingsCache = {
  timestamp: 0,
  settings: null
};

async function getSettings() {
    const now = Date.now();
    if (!settingsCache.settings || now - settingsCache.timestamp > 5000) {
        settingsCache.settings = await SiteSettings.findOne({ singletonKey: 'main' });
        settingsCache.timestamp = now;
    }
    return settingsCache.settings;
}

// Maintenance middleware - blocks all non-admin access when maintenance mode is enabled
async function maintenanceMiddleware(req, res, next) {
    const settings = await getSettings();
    
    // If maintenance is not enabled, allow request
    if (!settings?.maintenanceEnabled) {
        return next();
    }
    
    // Allow API routes to pass through (let them handle auth themselves)
    if (req.path.startsWith('/api')) {
        return next();
    }
    
    // Allow admin routes through
    if (req.path.startsWith('/admin')) {
        return next();
    }
    
    // Allow login page
    if (req.path === '/login' || req.path === '/verify-2fa-login') {
        return next();
    }
    
    // For all other routes, show maintenance page
    res.status(503).sendFile(require('path').join(__dirname, '..', 'public', 'maintenance.html'));
}

module.exports = { maintenanceMiddleware };