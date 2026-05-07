const fs = require('fs');
const path = require('path');

let APP_VERSION = Date.now().toString();

// Load version
try {
  const versionData = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'version.json'), 'utf8'));
  APP_VERSION = versionData.version || APP_VERSION;
} catch (error) {
  // Use timestamp as fallback
}

function injectVersionMiddleware(publicDir) {
  return (req, res, next) => {
    // Only process HTML files
    if (!req.path.endsWith('.html') && req.path !== '/') {
      return next();
    }

    const originalSend = res.send;
    res.send = function(data) {
      if (typeof data === 'string' && data.includes('</head>')) {
        // Inject version as query parameter in CSS and JS files
        data = data.replace(
          /href="\/css\/([^"?]+\.css)(\?[^"]*)?"/g,
          `href="/css/$1?v=${APP_VERSION}"`
        );
        data = data.replace(
          /src="\/js\/([^"?]+\.js)(\?[^"]*)?"/g,
          `src="/js/$1?v=${APP_VERSION}"`
        );
      }
      originalSend.call(this, data);
    };
    next();
  };
}

module.exports = { injectVersionMiddleware, APP_VERSION };
