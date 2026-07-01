/**
 * MaxOnu 2026 — Header premium (menus, tema, notificações, perfil)
 * Sem dependências externas. Espera window.MaxOnuSession (session.js).
 */
(function () {
  'use strict';

  const THEME_KEY = 'maxonu_theme';
  const NOTIFICATION_RETRY_MS = 8000;
  const NAV_DRAWER_BREAKPOINT = 1080;

  /** @type {EventSource | null} */
  let notificationStream = null;
  let notificationStreamToken = '';
  let notificationStreamRetry = null;
  let loadUserBarRequestId = 0;

  function headerRoot() {
    return document.getElementById('mxPremiumHeader');
  }

  /** @returns {string} */
  function readToken() {
    const t = window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    if (!t || t === 'null' || t === 'undefined') return '';
    return String(t).trim();
  }

  function stopNotificationStream() {
    if (notificationStreamRetry) {
      clearTimeout(notificationStreamRetry);
      notificationStreamRetry = null;
    }
    if (notificationStream) {
      try {
        notificationStream.close();
      } catch (_) {
        /* ignore */
      }
    }
    notificationStream = null;
    notificationStreamToken = '';
  }

  function syncNotificationState(token) {
    const nextToken = String(token || '').trim();
    if (!nextToken) {
      stopNotificationStream();
      return;
    }

    if (notificationStream && notificationStreamToken === nextToken) {
      return;
    }

    stopNotificationStream();
    notificationStreamToken = nextToken;

    if (typeof window.EventSource !== 'function') {
      return;
    }

    const streamUrl = `/api/notifications/stream?token=${encodeURIComponent(nextToken)}`;
    const stream = new window.EventSource(streamUrl);
    notificationStream = stream;

    const refreshBadge = () => {
      const activeToken = readToken();
      if (!activeToken) return;
      refreshNotificationsUI(activeToken).catch(() => {});
    };

    ['connected', 'notification', 'new-notification', 'notification-read', 'notification-read-all'].forEach((eventName) => {
      stream.addEventListener(eventName, refreshBadge);
    });

    stream.onerror = () => {
      if (notificationStream !== stream) return;

      try {
        stream.close();
      } catch (_) {
        /* ignore */
      }

      notificationStream = null;
      if (readToken() === nextToken) {
        if (notificationStreamRetry) {
          clearTimeout(notificationStreamRetry);
          notificationStreamRetry = null;
        }
        notificationStreamRetry = window.setTimeout(() => {
          if (readToken() === nextToken) {
            syncNotificationState(nextToken);
          }
        }, NOTIFICATION_RETRY_MS);
      }
    };
  }

  function resetUserBar() {
    const nameEl = document.getElementById('mxHeadUserName');
    const panelNameEl = document.getElementById('mxHeadPanelUserName');
    const panelRoleEl = document.getElementById('mxHeadPanelUserRole');
    const avatarEl = document.getElementById('mxHeadAvatar');
    const panelAvatarEl = document.getElementById('mxHeadPanelAvatar');
    const drawerAccountTitle = document.getElementById('mxHeadDrawerAccountTitle');

    if (nameEl) nameEl.textContent = 'Conta';
    if (panelNameEl) panelNameEl.textContent = 'Sua conta';
    if (panelRoleEl) {
      panelRoleEl.textContent = 'Candidato';
      panelRoleEl.dataset.userRole = 'candidate';
    }
    if (avatarEl) {
      avatarEl.src = '/images/profile_male.png';
      avatarEl.alt = 'Avatar do usuário';
    }
    if (panelAvatarEl) {
      panelAvatarEl.src = '/images/profile_male.png';
      panelAvatarEl.alt = 'Avatar do usuário';
    }
    if (drawerAccountTitle) {
      drawerAccountTitle.textContent = 'Acesso';
    }
    clearUsefulLinks();
  }

  function normalizePath(pathname) {
    let p = pathname || '/';
    if (p.endsWith('/index.html')) p = '/';
    else if (p.endsWith('.html')) p = p.replace(/\.html$/, '');
    if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
    return p;
  }

  function currentPath() {
    return normalizePath(window.location.pathname);
  }

  function normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const t = url.trim();
    if (!t) return '';
    if (/^(https?:)?\/\//i.test(t) || t.startsWith('/') || t.startsWith('data:') || t.startsWith('blob:'))
      return t;
    return `/${t.replace(/^\.?\//, '')}`;
  }

  function defaultAvatar(user) {
    if (user?.gender === 'feminino') return '/images/profile_female.png';
    return '/images/profile_male.png';
  }

  function avatarForUser(user) {
    const custom = normalizeImageUrl(user?.profileImageUrl);
    return custom || defaultAvatar(user);
  }

  function displayName(user) {
    return (user?.fullName || user?.username || 'Conta').trim();
  }

  const USEFUL_LINKS_BY_ROLE = {
    admin: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/admin', label: 'Painel admin' },
      { href: '/admin-delegations', label: 'Delegações admin' },
      { href: '/gerenciar-paises', label: 'País por comitê' },
      { href: '/verificacao-usuarios', label: 'Verificação de usuários' },
      { href: '/analytics', label: 'Analytics' },
      { href: '/notificacoes-admin', label: 'Notificações' }
    ],
    coordinator: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/coordenacao', label: 'Coordenação' },
      { href: '/dashboard-inscricoes', label: 'Inscrições' },
      { href: '/delegacoes', label: 'Delegações' },
      { href: '/dpos', label: 'DPOs' },
      { href: '/analytics', label: 'Analytics' }
    ],
    teacher: [
      { href: '/dashboard', label: 'Dashboard' },
      { href: '/orientadores', label: 'Orientadores' },
      { href: '/delegacoes', label: 'Delegações' },
      { href: '/dpos', label: 'DPOs' },
      { href: '/perguntas-comuns', label: 'Perguntas comuns' }
    ],
    press: [
      { href: '/imprensa-dashboard', label: 'Dashboard' },
      { href: '/imprensa', label: 'Portal' },
      { href: '/blog', label: 'Blog' },
      { href: '/create-post', label: 'Nova publicação' },
      { href: '/analytics', label: 'Analytics' }
    ],
    candidate: [
      { href: '/inscricao', label: 'Inscrição' },
      { href: '/delegacoes', label: 'Delegações' },
      { href: '/dpos', label: 'DPOs' },
      { href: '/perguntas-comuns', label: 'Perguntas comuns' },
      { href: '/regras', label: 'Regras' }
    ]
  };

  function getUsefulLinks(role) {
    return USEFUL_LINKS_BY_ROLE[role] || USEFUL_LINKS_BY_ROLE.candidate;
  }

  function createUsefulLinkNode(link) {
    const a = document.createElement('a');
    a.className = 'mx-head-menu__item mx-head-useful__item';
    a.href = link.href;
    a.setAttribute('data-mx-nav-link', '');
    a.setAttribute('role', 'menuitem');
    const label = document.createElement('span');
    label.textContent = link.label;
    a.appendChild(label);
    return a;
  }

  function clearUsefulLinks() {
    const desktopWrap = document.getElementById('mxHeadUsefulMenu');
    const desktopList = document.getElementById('mxHeadUsefulLinks');
    const drawerWrap = document.getElementById('mxHeadUsefulMenuDrawer');
    const drawerList = document.getElementById('mxHeadUsefulLinksDrawer');
    if (desktopList) desktopList.innerHTML = '';
    if (drawerList) drawerList.innerHTML = '';
    if (desktopWrap) desktopWrap.hidden = true;
    if (drawerWrap) drawerWrap.hidden = true;
  }

  function renderUsefulLinks(role) {
    const links = getUsefulLinks(role);
    const desktopWrap = document.getElementById('mxHeadUsefulMenu');
    const desktopList = document.getElementById('mxHeadUsefulLinks');
    const drawerWrap = document.getElementById('mxHeadUsefulMenuDrawer');
    const drawerList = document.getElementById('mxHeadUsefulLinksDrawer');

    const renderInto = (wrap, list) => {
      if (!wrap || !list) return;
      list.innerHTML = '';
      if (!links.length) {
        wrap.hidden = true;
        return;
      }

      const fragment = document.createDocumentFragment();
      links.forEach((link) => {
        fragment.appendChild(createUsefulLinkNode(link));
      });
      list.appendChild(fragment);
      wrap.hidden = false;
    };

    renderInto(desktopWrap, desktopList);
    renderInto(drawerWrap, drawerList);
  }

  function setAuthVisibility(isAuthenticated) {
    try {
      document.documentElement.dataset.authState = isAuthenticated ? 'authenticated' : 'guest';
    } catch (_) {
      /* ignore */
    }

    const guestNodes = [
      document.getElementById('mxHeadGuest'),
      document.getElementById('mxHeadGuestDrawer')
    ].filter(Boolean);

    const profileNodes = [
      document.getElementById('mxHeadProfile'),
      document.getElementById('mxHeadProfileDrawer')
    ].filter(Boolean);

    guestNodes.forEach((node) => {
      node.hidden = isAuthenticated;
    });

    profileNodes.forEach((node) => {
      node.hidden = !isAuthenticated;
    });
  }

  function applyTheme(theme) {
    const next = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (_) {
      /* ignore */
    }
    document.dispatchEvent(new CustomEvent('maxonu:theme-changed', { detail: { theme: next } }));
    const btn = document.getElementById('mxHeadThemeBtn');
    if (btn) btn.setAttribute('aria-label', next === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro');
  }

  function readStoredTheme() {
    try {
      return localStorage.getItem(THEME_KEY);
    } catch (_) {
      return null;
    }
  }

  function initThemeFromStorage() {
    const saved = readStoredTheme();
    if (saved === 'dark' || saved === 'light') {
      applyTheme(saved);
      return;
    }
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      applyTheme('dark');
    } else {
      applyTheme('light');
    }
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    applyTheme(cur === 'dark' ? 'light' : 'dark');
  }

  function bindThemeStorageSync() {
    window.addEventListener('storage', (e) => {
      if (e.key !== THEME_KEY || e.newValue == null) return;
      if (e.newValue === 'dark' || e.newValue === 'light') {
        applyTheme(e.newValue);
      }
    });
  }

  function setActiveNavLinks() {
    const path = currentPath();
    const links = document.querySelectorAll('[data-mx-nav-link]');
    links.forEach((el) => {
      const href = el.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      let active = false;
      try {
        const u = new URL(href, window.location.origin);
        const target = normalizePath(u.pathname);
        const linkHash = (u.hash || '').replace(/^#/, '');
        const pageHash = (window.location.hash || '').replace(/^#/, '');
        const pathMatches = path === target || (target !== '/' && path.startsWith(target + '/'));

        if (pathMatches) {
          if (linkHash) {
            active = pageHash === linkHash;
          } else if (target === '/profile') {
            active = true;
          } else {
            active = !pageHash;
          }
        }
      } catch {
        return;
      }

      el.classList.toggle('is-active', active);
      if (active) {
        el.setAttribute('aria-current', 'page');
      } else {
        el.removeAttribute('aria-current');
      }
    });
  }

  function closeAllDropdowns(root) {
    if (!root) return;
    root.querySelectorAll('.mx-head-notif.is-open, .mx-head-profile.is-open').forEach((wrap) => {
      wrap.classList.remove('is-open');
      const panel = wrap.querySelector('.mx-head-panel');
      if (panel) panel.setAttribute('aria-hidden', 'true');
    });
    const notifBtn = document.getElementById('mxHeadNotifBtn');
    const profileBtn = document.getElementById('mxHeadProfileBtn');
    if (notifBtn) notifBtn.setAttribute('aria-expanded', 'false');
    if (profileBtn) profileBtn.setAttribute('aria-expanded', 'false');
  }

  function openDropdown(wrap, panelId, trigger) {
    const panel = document.getElementById(panelId);
    if (!panel) return;
    wrap.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
  }

  /** @type {HTMLElement | null} */
  let drawerReturnFocusEl = null;

  function setMenuOpen(root, open) {
    const btn = document.getElementById('mxHeadMenuBtn');
    const drawer = document.getElementById('mxHeadDrawer');
    const scrim = document.getElementById('mxHeadScrim');
    const closeBtn = document.getElementById('mxHeadDrawerClose');
    const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;

    if (open) {
      closeAllDropdowns(root);
      drawerReturnFocusEl = /** @type {HTMLElement} */ (document.activeElement);
    }

    root.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('mx-head-drawer-open', open);
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Fechar menu de navegação' : 'Abrir menu de navegação');
    }
    if (drawer) {
      if (open) {
        drawer.removeAttribute('hidden');
      } else {
        drawer.setAttribute('hidden', '');
      }
    }
    if (scrim) {
      if (open) scrim.removeAttribute('hidden');
      else scrim.setAttribute('hidden', '');
    }
    document.documentElement.classList.toggle('mx-head-drawer-open', open);

    if (open) {
      requestAnimationFrame(() => {
        if (!isTouchDevice) {
          closeBtn?.focus({ preventScroll: true });
        }
      });
    } else {
      requestAnimationFrame(() => {
        const ret = drawerReturnFocusEl;
        drawerReturnFocusEl = null;
        if (ret && typeof ret.focus === 'function' && document.contains(ret)) {
          ret.focus({ preventScroll: true });
        } else if (!isTouchDevice) {
          btn?.focus({ preventScroll: true });
        }
      });
    }
  }

  function shouldIgnoreOutsideClick(target) {
    if (!(target instanceof Element)) return false;
    if (target.closest('input, textarea, select, [contenteditable="true"], [data-mx-ignore-outside-click]')) {
      return true;
    }

    const active = document.activeElement;
    return Boolean(active && active instanceof Element && active.closest('input, textarea, select, [contenteditable="true"], [data-mx-ignore-outside-click]'));
  }

  function bindOutsideClose(root) {
    const ignoreIfEditable = (e) => {
      const t = /** @type {Node} */ (e.target);
      if (t instanceof Element && shouldIgnoreOutsideClick(t)) {
        e.stopPropagation();
        return true;
      }
      return false;
    };

    document.addEventListener('pointerdown', (e) => {
      if (ignoreIfEditable(e)) return;
    }, { passive: true });

    document.addEventListener('touchstart', (e) => {
      if (ignoreIfEditable(e)) return;
    }, { passive: true });

    document.addEventListener('click', (e) => {
      const t = /** @type {Node} */ (e.target);
      if (ignoreIfEditable(e)) return;
      if (!root.contains(t)) {
        closeAllDropdowns(root);
        setMenuOpen(root, false);
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeAllDropdowns(root);
        setMenuOpen(root, false);
      }
    });
  }

  function bindScroll(root) {
    let ticking = false;
    window.addEventListener(
      'scroll',
      () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          root.classList.toggle('is-scrolled', window.scrollY > 10);
          ticking = false;
        });
      },
      { passive: true }
    );
    root.classList.toggle('is-scrolled', window.scrollY > 10);
  }

  /** Fecha o drawer em ecrãs grandes (evita estado preso ao rodar o dispositivo). */
  function bindViewportCloseDrawer(root) {
    const mq = window.matchMedia(`(min-width: ${NAV_DRAWER_BREAKPOINT + 1}px)`);
    const onMq = () => {
      if (mq.matches && root.classList.contains('is-menu-open')) {
        closeAllDropdowns(root);
        setMenuOpen(root, false);
      }
    };
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onMq);
    } else {
      mq.addListener(onMq);
    }
  }

  async function fetchNotifications(token) {
    try {
      const res = await fetch('/api/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) return null;
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function formatNotifTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
      })}`;
    } catch {
      return '';
    }
  }

  function setNotifLoading(isLoading) {
    const list = document.getElementById('mxHeadNotifList');
    const empty = document.getElementById('mxHeadNotifEmpty');
    if (list) list.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (empty && isLoading) {
      empty.hidden = false;
      empty.textContent = 'Carregando…';
    }
  }

  async function refreshNotificationsUI(token) {
    const badge = document.getElementById('mxHeadNotifBadge');
    const list = document.getElementById('mxHeadNotifList');
    const empty = document.getElementById('mxHeadNotifEmpty');
    const markAll = document.getElementById('mxHeadNotifMarkAll');
    if (!badge || !list) return;

    if (!token) {
      badge.hidden = true;
      badge.textContent = '0';
      badge.dataset.count = '0';
      list.innerHTML = '';
      list.removeAttribute('aria-busy');
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Entre na sua conta para ver notificações.';
      }
      if (markAll) markAll.hidden = true;
      return;
    }

    setNotifLoading(true);
    const data = await fetchNotifications(token);
    list.removeAttribute('aria-busy');

    if (!data) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Não foi possível carregar notificações.';
      }
      if (markAll) markAll.hidden = true;
      return;
    }

    const unread = Number(data.unreadCount) || 0;
    const items = Array.isArray(data.notifications) ? data.notifications : [];

    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 99 ? '99+' : String(unread);
      badge.dataset.count = String(unread);
    } else {
      badge.hidden = true;
      badge.textContent = '0';
      badge.dataset.count = '0';
    }

    if (markAll) {
      markAll.hidden = unread === 0;
      markAll.disabled = false;
      markAll.removeAttribute('aria-busy');
    }

    if (!items.length) {
      list.innerHTML = '';
      if (empty) {
        empty.hidden = false;
        empty.textContent = 'Nenhuma notificação por aqui.';
      }
      return;
    }

    if (empty) empty.hidden = true;
    list.innerHTML = '';

    items.slice(0, 12).forEach((n) => {
      const unreadItem = !n.readAt;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `mx-head-notif__item${unreadItem ? ' is-unread' : ''}`;
      row.dataset.id = n.id;
      row.innerHTML = `
        <span class="mx-head-notif__dot" aria-hidden="true"></span>
        <span class="mx-head-notif__content">
          <p class="mx-head-notif__title"></p>
          <p class="mx-head-notif__msg"></p>
          <div class="mx-head-notif__time"></div>
        </span>
      `;
      const titleEl = row.querySelector('.mx-head-notif__title');
      const msgEl = row.querySelector('.mx-head-notif__msg');
      const timeEl = row.querySelector('.mx-head-notif__time');
      if (titleEl) titleEl.textContent = n.title || 'Aviso';
      if (msgEl) msgEl.textContent = n.message || '';
      if (timeEl) timeEl.textContent = formatNotifTime(n.createdAt);
      list.appendChild(row);
    });
  }

  async function markNotificationRead(token, id) {
    try {
      await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* ignore */
    }
  }

  async function markAllRead(token) {
    try {
      await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      /* ignore */
    }
  }

  function bindAvatarFallback(avatarEl, user) {
    if (!avatarEl) return;
    const fallback = defaultAvatar(user);
    avatarEl.onerror = function () {
      this.onerror = null;
      if (this.src.indexOf(fallback) === -1) this.src = fallback;
    };
  }

  async function loadUserBar() {
    const requestId = ++loadUserBarRequestId;
    const guest = document.getElementById('mxHeadGuest');
    const profile = document.getElementById('mxHeadProfile');
    const nameEl = document.getElementById('mxHeadUserName');
    const panelNameEl = document.getElementById('mxHeadPanelUserName');
    const panelRoleEl = document.getElementById('mxHeadPanelUserRole');
    const avatarEl = document.getElementById('mxHeadAvatar');
    const panelAvatarEl = document.getElementById('mxHeadPanelAvatar');
    const drawerAccountTitle = document.getElementById('mxHeadDrawerAccountTitle');
    const roleLabels = {
      admin: 'Administrador',
      coordinator: 'Coordenador',
      teacher: 'Professor orientador',
      press: 'Imprensa',
      candidate: 'Candidato'
    };

    if (!guest || !profile) {
      return;
    }

    // Always start from the guest state until authentication is confirmed.
    resetUserBar();
    setAuthVisibility(false);

    const token = readToken();
    if (!token) {
      if (drawerAccountTitle) drawerAccountTitle.textContent = 'Acesso';
      stopNotificationStream();
      refreshNotificationsUI('').catch(() => {});
      return;
    }

    let ctx = await window.MaxOnuSession?.getAuthContext?.({ forceRefresh: false });
    if (requestId !== loadUserBarRequestId) return;

    let user = ctx?.user;
    if (!user) {
      ctx = await window.MaxOnuSession?.getAuthContext?.({ forceRefresh: true });
      if (requestId !== loadUserBarRequestId) return;
      user = ctx?.user;
    }

    const latestToken = readToken();
    if (requestId !== loadUserBarRequestId) return;

    if (!latestToken || !user) {
      setAuthVisibility(false);
      if (drawerAccountTitle) drawerAccountTitle.textContent = 'Acesso';
      stopNotificationStream();
      refreshNotificationsUI('').catch(() => {});
      return;
    }

    setAuthVisibility(true);
    if (drawerAccountTitle) {
      drawerAccountTitle.textContent = 'Sua conta';
    }

    if (nameEl) nameEl.textContent = displayName(user);
    if (panelNameEl) panelNameEl.textContent = displayName(user);
    if (panelRoleEl) {
      panelRoleEl.textContent = roleLabels[user.role] || 'Usuário';
      panelRoleEl.dataset.userRole = user.role || 'candidate';
    }
    if (avatarEl) {
      avatarEl.src = avatarForUser(user);
      avatarEl.alt = user ? `Avatar de ${displayName(user)}` : 'Avatar';
      bindAvatarFallback(avatarEl, user);
    }
    if (panelAvatarEl) {
      panelAvatarEl.src = avatarForUser(user);
      panelAvatarEl.alt = user ? `Avatar de ${displayName(user)}` : 'Avatar';
      bindAvatarFallback(panelAvatarEl, user);
    }

    renderUsefulLinks(user.role);
    syncNotificationState(latestToken);
    refreshNotificationsUI(latestToken).catch(() => {});
  }

  function wireNotifications(tokenGetter) {
    const wrap = document.querySelector('[data-mx-head-notif]');
    const btn = document.getElementById('mxHeadNotifBtn');
    const list = document.getElementById('mxHeadNotifList');
    const markAll = document.getElementById('mxHeadNotifMarkAll');
    const root = headerRoot();
    if (!wrap || !btn || !root) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const token = tokenGetter();
      const wasOpen = wrap.classList.contains('is-open');
      closeAllDropdowns(root);
      if (!wasOpen) {
        openDropdown(wrap, 'mxHeadNotifPanel', btn);
        if (token) refreshNotificationsUI(token);
        else refreshNotificationsUI('');
      }
    });

    if (markAll) {
      markAll.addEventListener('click', async (e) => {
        e.stopPropagation();
        const token = tokenGetter();
        if (!token || markAll.disabled) return;
        markAll.disabled = true;
        markAll.setAttribute('aria-busy', 'true');
        try {
          await markAllRead(token);
          await refreshNotificationsUI(token);
        } finally {
          markAll.disabled = false;
          markAll.removeAttribute('aria-busy');
        }
      });
    }

    if (list) {
      list.addEventListener('click', async (e) => {
        const item = e.target.closest('.mx-head-notif__item');
        if (!item) return;
        e.stopPropagation();
        const id = item.dataset.id;
        const token = tokenGetter();
        if (token && id) {
          await markNotificationRead(token, id);
          await refreshNotificationsUI(token);
        }
      });
    }
  }

  function wireProfile(tokenGetter, root) {
    const wrap = document.getElementById('mxHeadProfile');
    const btn = document.getElementById('mxHeadProfileBtn');
    const logout = document.getElementById('mxHeadLogoutBtn');
    const logoutDrawer = document.getElementById('mxHeadLogoutBtnDrawer');
    if (!wrap || !btn) return;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = wrap.classList.contains('is-open');
      closeAllDropdowns(root);
      if (!wasOpen) openDropdown(wrap, 'mxHeadProfilePanel', btn);
    });

    if (logout) {
      logout.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns(root);
        window.MaxOnuSession?.clearAuth?.();
        window.location.href = '/';
      });
    }

    if (logoutDrawer) {
      logoutDrawer.addEventListener('click', (e) => {
        e.stopPropagation();
        closeAllDropdowns(root);
        window.MaxOnuSession?.clearAuth?.();
        window.location.href = '/';
      });
    }
  }

  function wireDrawer(root) {
    const btn = document.getElementById('mxHeadMenuBtn');
    const closeBtn = document.getElementById('mxHeadDrawerClose');
    const scrim = document.getElementById('mxHeadScrim');
    const closeMenu = () => {
      closeAllDropdowns(root);
      setMenuOpen(root, false);
    };

    if (btn) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = !root.classList.contains('is-menu-open');
        setMenuOpen(root, open);
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
      });
    }
    if (scrim) {
      scrim.addEventListener('click', () => {
        closeMenu();
      });
    }

    root.querySelectorAll('.mx-premium-header__drawer-link').forEach((a) => {
      a.addEventListener('click', () => {
        closeMenu();
      });
    });

    root.querySelectorAll('#mxHeadLogoutBtnDrawer, .mx-premium-header__drawer .mx-head-menu__item--danger').forEach((btnEl) => {
      btnEl.addEventListener('click', () => {
        closeMenu();
      });
    });
  }

  function wireTheme(root) {
    const btn = document.getElementById('mxHeadThemeBtn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeAllDropdowns(root);
      toggleTheme();
    });
  }

  function init() {
    const root = headerRoot();
    if (!root || root.dataset.mxHeadInit === '1') return;
    root.dataset.mxHeadInit = '1';

    initThemeFromStorage();
    bindThemeStorageSync();
    setActiveNavLinks();

    const tokenGetter = () => readToken();

    wireTheme(root);
    wireDrawer(root);
    wireNotifications(tokenGetter);
    wireProfile(tokenGetter, root);
    bindOutsideClose(root);
    bindScroll(root);
    bindViewportCloseDrawer(root);

    const syncUserBar = () => {
      loadUserBar().catch(() => {});
    };

    syncUserBar();

    // Listener para mudanças de autenticação via event
    document.addEventListener('maxonu:auth-changed', syncUserBar);
    document.addEventListener('auth-context-updated', syncUserBar);

    // Listener para mudanças no localStorage (caso o token seja alterado)
    window.addEventListener('storage', (e) => {
      if (e.key === 'token' || e.key === 'isAdmin' || e.key === 'role') {
        syncUserBar();
      }
    });

    // Recarregar o user bar quando o header for injetado (para garantir que está sincronizado)
    document.addEventListener('maxonu:header-ready', syncUserBar);

    // Listener adicional para quando o header é injetado dinamicamente
    document.addEventListener('maxonu:header-injected', syncUserBar);

    window.addEventListener('hashchange', () => {
      setActiveNavLinks();
    });

    root.addEventListener('click', (e) => {
      const link = e.target.closest('a[data-mx-nav-link]');
      if (link) closeAllDropdowns(root);
    });

    // Cleanup defensivo: fechar drawer quando a página fica invisível (abas/janelas)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && root.classList.contains('is-menu-open')) {
        closeAllDropdowns(root);
        setMenuOpen(root, false);
      }
    });

    // Cleanup defensivo: fechar drawer ao rotacionar o dispositivo
    window.addEventListener('orientationchange', () => {
      if (root.classList.contains('is-menu-open')) {
        closeAllDropdowns(root);
        setMenuOpen(root, false);
      }
    });

    // Cleanup defensivo: remover classes presas ao carregar a página
    window.addEventListener('load', () => {
      if (document.body.classList.contains('mx-head-drawer-open') && !root.classList.contains('is-menu-open')) {
        document.body.classList.remove('mx-head-drawer-open');
        document.documentElement.classList.remove('mx-head-drawer-open');
      }
    });

    // Cleanup defensivo: resetar estado ao sair da página
    window.addEventListener('beforeunload', () => {
      if (root.classList.contains('is-menu-open')) {
        closeAllDropdowns(root);
        setMenuOpen(root, false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
