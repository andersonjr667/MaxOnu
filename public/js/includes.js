document.addEventListener('DOMContentLoaded', () => {
  const THEME_KEY = 'maxonu_theme';

  const applyTheme = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  };

  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) {
    applyTheme(savedTheme);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    applyTheme('dark');
  }

  document.addEventListener('click', (event) => {
    const toggle = event.target.closest('#themeToggle');
    if (!toggle) return;
    const current = document.documentElement.getAttribute('data-theme');
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

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

  // Prevent duplicated header/footer when a page also contains them inline.
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

  Promise.all([loadIncludeOnce('header.html'), loadIncludeOnce('footer.html')]);
});

