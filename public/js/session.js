/**
 * Sessão global (token + /api/me) para todas as páginas que carregam este script
 * antes de includes.js e demais bundles defer. Mantém cache curto e contrato
 * { user } esperado por blog.js, dashboard.js, committee-pages.js, etc.
 */
(function initMaxOnuSession() {
  if (window.MaxOnuSession) return;

  const LS = {
    token: 'token',
    role: 'role',
    userId: 'userId',
    isAdmin: 'isAdmin',
  };

  let cachedContext = null;
  let inflight = null;

  function readToken() {
    const t = localStorage.getItem(LS.token);
    if (!t || t === 'null' || t === 'undefined' || String(t).trim() === '') return '';
    return String(t).trim();
  }

  function getToken() {
    return readToken();
  }

  function clearAuth() {
    localStorage.removeItem(LS.token);
    localStorage.removeItem(LS.role);
    localStorage.removeItem(LS.userId);
    localStorage.removeItem(LS.isAdmin);
    cachedContext = null;
    inflight = null;
  }

  async function fetchMe() {
    const token = readToken();
    if (!token) return null;

    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.status === 401) {
      clearAuth();
      return null;
    }

    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') return null;

    const user = data.user && typeof data.user === 'object' ? data.user : data;
    if (!user || typeof user !== 'object' || !user.role) return null;

    try {
      localStorage.setItem(LS.role, user.role);
      if (user.id) localStorage.setItem(LS.userId, String(user.id));
      localStorage.setItem(LS.isAdmin, user.role === 'admin' ? 'true' : 'false');
    } catch (_) {
      /* ignore quota / private mode */
    }

    return { user };
  }

  async function getAuthContext(opts) {
    const forceRefresh = Boolean(opts && opts.forceRefresh);
    if (forceRefresh) {
      cachedContext = null;
      inflight = null;
    }
    if (cachedContext) return cachedContext;
    if (inflight) return inflight;

    inflight = (async () => {
      try {
        const ctx = await fetchMe();
        if (ctx) cachedContext = ctx;
        return ctx;
      } finally {
        inflight = null;
      }
    })();

    return inflight;
  }

  async function refreshAuthContext() {
    cachedContext = null;
    inflight = null;
    return getAuthContext({ forceRefresh: true });
  }

  window.MaxOnuSession = {
    getToken,
    getAuthContext,
    refreshAuthContext,
    clearAuth,
  };
})();
