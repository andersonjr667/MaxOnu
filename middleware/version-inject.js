const fs = require('fs');
const path = require('path');

let APP_VERSION = Date.now().toString();
const versionInjectedCache = new Map();

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

    const cacheKey = req.path || '/';
    const originalSend = res.send.bind(res);
    res.send = function(data) {
      if (typeof data === 'string' && data.includes('</head>')) {
        if (versionInjectedCache.has(cacheKey)) {
          return originalSend(versionInjectedCache.get(cacheKey));
        }

        let injected = data.replace(
          /href="\/css\/([^"?]+\.css)(\?[^"]*)?"/g,
          `href="/css/$1?v=${APP_VERSION}"`
        );
        injected = injected.replace(
          /src="\/js\/([^"?]+\.js)(\?[^"]*)?"/g,
          `src="/js/$1?v=${APP_VERSION}"`
        );

        versionInjectedCache.set(cacheKey, injected);
        return originalSend(injected);
      }
      return originalSend(data);
    };
    next();
  };
}

module.exports = { injectVersionMiddleware, APP_VERSION };
