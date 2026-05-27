document.addEventListener('DOMContentLoaded', () => {
  const THEME_KEY = 'maxonu_theme';

  const safeGetTheme = () => {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (_) {
      return null;
    }
  };

  const safeSetTheme = (theme) => {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {
      /* ignore */
    }
  };

  const emitThemeChange = (theme) => {
    document.dispatchEvent(new CustomEvent('maxonu:theme-changed', { detail: { theme } }));
  };

  const applyTheme = (theme, persist = true) => {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    if (persist) safeSetTheme(next);
    emitThemeChange(next);
  };

  const savedTheme = safeGetTheme();
  if (savedTheme) {
    applyTheme(savedTheme, false);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  } else {
    applyTheme('light', false);
  }

  const loadInclude = async (src) => {
    const paths = [('/' + src).replace(/\\/g, '/'), src];

    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (!response.ok) continue;

        const html = await response.text();
        const includeNode = document.querySelector(`include[src="${src}"]`);
        if (!includeNode) return true;

        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        const fragment = document.createDocumentFragment();

        while (wrapper.firstChild) {
          fragment.appendChild(wrapper.firstChild);
        }

        fragment.querySelectorAll('script').forEach((script) => {
          // CSP compliance: do not recreate inline scripts (would violate script-src 'self').
          // Only allow external scripts via `src`.
          if (!script.src) {
            script.remove();
            return;
          }

          const executableScript = document.createElement('script');
          Array.from(script.attributes).forEach((attribute) => {
            executableScript.setAttribute(attribute.name, attribute.value);
          });
          // Do not copy inline textContent.
          script.replaceWith(executableScript);
        });

        includeNode.replaceWith(fragment);
        return true;
      } catch (_) {
        // try next path
      }
    }

    console.error(`Failed to load include: ${src}`);
    return false;
  };

  /**
   * Injeta o header global (link no <head>, markup + scripts no início do <body>).
   * Evita repetir `<include src="header.html">` em dezenas de páginas.
   */
  const injectPremiumHeader = async () => {
    if (document.querySelector('[data-mx-header]')) return true;

    const paths = ['/header.html', 'header.html'];
    for (const p of paths) {
      try {
        const response = await fetch(p);
        if (!response.ok) continue;
        const html = await response.text();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;

        const scripts = [];
        const bodyNodes = [];
        while (wrapper.firstChild) {
          const node = wrapper.firstChild;
          if (node.nodeName === 'LINK' && node.rel === 'stylesheet') {
            const href = node.getAttribute('href');
            if (href && !document.querySelector(`link[href="${href}"]`)) {
              document.head.appendChild(node);
            } else {
              wrapper.removeChild(node);
            }
            continue;
          }
          if (node.nodeName === 'SCRIPT' && node.src) {
            scripts.push(node.getAttribute('src'));
            wrapper.removeChild(node);
            continue;
          }
          if (node.nodeName === 'SCRIPT') {
            wrapper.removeChild(node);
            continue;
          }
          bodyNodes.push(node);
          wrapper.removeChild(node);
        }

        if (bodyNodes.length) {
          const fragment = document.createDocumentFragment();
          bodyNodes.forEach((node) => fragment.appendChild(node));
          document.body.insertBefore(fragment, document.body.firstChild);
        }

        scripts.forEach((src) => {
          if (!src || document.querySelector(`script[src="${src}"]`)) return;
          const s = document.createElement('script');
          s.src = src;
          document.body.appendChild(s);
        });

        // Disparar evento após injetar o header
        setTimeout(() => {
          document.dispatchEvent(new CustomEvent('maxonu:header-injected'));
        }, 100);

        return true;
      } catch (_) {
        /* try next path */
      }
    }

    console.error('Failed to inject header.html');
    return false;
  };

  // Prevent duplicated footer when a page also contains it inline.
  // If the include tags were already removed/replaced, this is a no-op.
  const alreadyIncluded = (src) => document.querySelector(`script[data-mx-include-marker="${src}"]`);
  const markIncluded = (src) => {
    // marker node so we can detect subsequent runs
    const marker = document.createElement('script');
    marker.type = 'application/json';
    marker.dataset.mxIncludeMarker = src;
    marker.textContent = '{}';
    document.documentElement.appendChild(marker);
  };

  const loadIncludeOnce = async (src) => {
    if (alreadyIncluded(src)) return true;
    const ok = await loadInclude(src);
    if (ok) markIncluded(src);
    return ok;
  };

  Promise.all([injectPremiumHeader(), loadIncludeOnce('footer.html')]).then(() => {
    document.dispatchEvent(new CustomEvent('maxonu:header-ready'));
  });
});
