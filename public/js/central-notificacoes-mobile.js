(function () {
  'use strict';

  // (version variable is injected by server; this loader only needs window.__APP_VERSION)


  const MOBILE_MAX_WIDTH = 640;
  const OVERLAY_ID = 'notificationsMobileOverlay';
  const PANEL_ID = 'notificationsMobilePanel';
  const LIST_WRAPPER_ID = 'notificationsMobileListWrapper';

  let realtimeSource = null;

  function isMobile() {
    return window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH}px)`).matches;
  }

  function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
  }

  const parseJson = async (response) => response.json().catch(() => ({}));

  function getStoredAuthContext() {
    try {
      const role = localStorage.getItem('role') || 'candidate';
      const token = getToken();
      if (!token) return null;
      return { user: { role }, delegationStatus: null };
    } catch {
      return null;
    }
  }

  function ensureOverlayDom() {
    let overlay = document.getElementById(OVERLAY_ID);
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.className = 'notifications-mobile-overlay';

    overlay.innerHTML = `
      <div id="${PANEL_ID}" class="notifications-mobile-panel" role="dialog" aria-modal="true" aria-label="Central de notificações">
        <header class="notifications-mobile-header">
          <div class="notifications-mobile-header-top">
            <div>
              <div class="notifications-mobile-title">Central de notificações</div>
              <div class="notifications-mobile-subtitle" id="notificationsMobileSubtitle">Carregando...</div>
            </div>
            <button class="notifications-mobile-close" id="notificationsMobileClose" type="button" aria-label="Fechar">×</button>
          </div>
        </header>

        <section class="notifications-mobile-actions">
          <button type="button" class="btn-secondary" id="notificationsMobileMarkReadAll" disabled>Marcar todas como lidas</button>
          <button type="button" class="btn-primary" id="notificationsMobileClose2">Fechar</button>
        </section>

        <div class="notifications-mobile-list-wrapper" id="${LIST_WRAPPER_ID}">
          <div class="notifications-mobile-loading">Carregando...</div>
        </div>

        <div class="notifications-mobile-footer-spacer"></div>
      </div>
    `;

    document.body.appendChild(overlay);

    // close handlers
    overlay.querySelector('#notificationsMobileClose')?.addEventListener('click', closeOverlay);
    overlay.querySelector('#notificationsMobileClose2')?.addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeOverlay();
    });

    return overlay;
  }

  function openOverlay() {
    if (!isMobile()) return;

    const overlay = ensureOverlayDom();
    overlay.classList.add('is-open');

    // impedir scroll do body
    document.body.style.overflow = 'hidden';

    // init load
    if (!overlay.dataset.initialized) {
      overlay.dataset.initialized = 'true';
      init();
    } else {
      // recarrega rápido
      loadNotifications().catch(() => {});
    }
  }

  function closeOverlay() {
    const overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) return;

    overlay.classList.remove('is-open');
    document.body.style.overflow = '';

    // Close SSE to save resources (optional). We'll just close; next open will reopen.
    if (realtimeSource) {
      try { realtimeSource.close(); } catch {}
      realtimeSource = null;
    }
  }

  function setSubtitle(text) {
    const el = document.getElementById('notificationsMobileSubtitle');
    if (el) el.textContent = text;
  }

  function formatRelativeTime(dateStr) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Agora mesmo';
    if (mins < 60) return `${mins} min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7) return `${days}d atrás`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text ?? '');
    return div.innerHTML;
  }

  let notificationsCache = [];

  async function loadNotifications() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return [];
    }

    setSubtitle('Carregando...');

    const res = await fetch('/api/notifications', {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
      throw new Error('Erro ao carregar notificações.');
    }

    const data = await parseJson(res);
    notificationsCache = data.notifications || [];

    const unreadCount = notificationsCache.filter((n) => !n.readAt).length;
    setSubtitle(`${unreadCount} não lida${unreadCount === 1 ? '' : 's'}`);

    renderList();
    return notificationsCache;
  }

  function renderList() {
    const wrapper = document.getElementById(LIST_WRAPPER_ID);
    if (!wrapper) return;

    if (!notificationsCache.length) {
      wrapper.innerHTML = `
        <div class="notifications-mobile-empty">
          <div style="font-size:1.8rem;margin-bottom:0.5rem;">📭</div>
          Nenhuma notificação no momento.
        </div>
      `;
      const btn = document.getElementById('notificationsMobileMarkReadAll');
      if (btn) btn.disabled = true;
      return;
    }

    const unreadCount = notificationsCache.filter((n) => !n.readAt).length;
    const btn = document.getElementById('notificationsMobileMarkReadAll');
    if (btn) btn.disabled = unreadCount === 0;

    wrapper.innerHTML = `
      <div class="notifications-mobile-list">
        ${notificationsCache
          .map((n) => {
            const isUnread = !n.readAt;
            return `
              <article class="notifications-mobile-item ${isUnread ? 'is-unread' : ''}" data-notif-id="${escapeHtml(n.id)}">
                <strong>${escapeHtml(n.title || 'Notificação')}</strong>
                <p>${escapeHtml(n.message || '')}</p>
                <div class="meta">
                  <span class="time">${escapeHtml(formatRelativeTime(n.createdAt))}</span>
                  <span>${isUnread ? 'Não lida' : 'Lida'}</span>
                </div>
                <div class="actions">
                  <button type="button" class="btn-secondary" data-action="mark-read" ${isUnread ? '' : 'disabled'}>Marcar lida</button>
                </div>
              </article>
            `;
          })
          .join('')}
      </div>
    `;

    // event delegation
    wrapper.querySelectorAll('button[data-action="mark-read"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('[data-notif-id]');
        const id = card?.dataset?.notifId;
        if (!id) return;

        const token = getToken();
        if (!token) return;

        btn.disabled = true;
        const old = btn.textContent;
        btn.textContent = '...';

        try {
          const patch = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!patch.ok) throw new Error('Erro ao marcar lida.');

          // update cache locally
          await loadNotifications();
        } catch (e) {
          // keep simple: just reload attempt
          await loadNotifications().catch(() => {});
        } finally {
          btn.textContent = old;
        }
      });
    });

    document.getElementById('notificationsMobileMarkReadAll')?.addEventListener('click', markReadAll, { once: true });
  }

  async function markReadAll() {
    const token = getToken();
    if (!token) return;

    const btn = document.getElementById('notificationsMobileMarkReadAll');
    if (btn) btn.disabled = true;

    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Erro ao marcar todas.');

      await loadNotifications();
    } finally {
      // disabled state updated in renderList
    }
  }

  function openSse() {
    const token = getToken();
    if (!token || realtimeSource) return;

    const source = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
    realtimeSource = source;

    source.addEventListener('notification', async (event) => {
      try {
        // Reload to reflect unread/readAt ordering
        await loadNotifications();
      } catch {}
    });

    source.onerror = () => {
      try { source.close(); } catch {}
      realtimeSource = null;
    };
  }

  async function init() {
    await loadNotifications().catch(() => {
      const wrapper = document.getElementById(LIST_WRAPPER_ID);
      if (wrapper) wrapper.innerHTML = '<div class="notifications-mobile-empty">Erro ao carregar.</div>';
    });
    openSse();
  }

  // Expose API for includes.js
  window.MaxOnuCentralNotificacoesMobile = {
    openOverlay
  };

  // Load CSS dynamically (so page doesn't need to include it)
  function ensureCss() {
    if (document.getElementById('notificacoes-mobile-css')) return;
    const link = document.createElement('link');
    link.id = 'notificacoes-mobile-css';
    link.rel = 'stylesheet';
    const v = window.__APP_VERSION || '';
    link.href = v ? `/css/notificacoes-mobile.css?v=${encodeURIComponent(v)}` : '/css/notificacoes-mobile.css';
    document.head.appendChild(link);
  }

  ensureCss();
})();

