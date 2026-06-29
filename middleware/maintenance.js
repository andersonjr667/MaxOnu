const SiteSettings = require('../models/SiteSettings');

async function getSettings() {
    return await SiteSettings.findOne({ singletonKey: 'main' });
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