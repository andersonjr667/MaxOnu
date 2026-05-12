/* MaxOnu Header Component (isolado, mobile-first, idempotente)
   Requisitos atendidos:
   - overlay + fechamento por clique fora
   - fechamento por links e ESC
   - sticky/premium via scroll inteligente (requestAnimationFrame)
   - sem IDs/classes antigos
*/

(() => {
  const SEL = {
    root: '[data-mx-header]',
    navList: '[data-mx-nav-list]',
    authSlot: '[data-mx-auth]',
    menuToggle: '[data-mx-menu-toggle]',
    menuBackdrop: '[data-mx-menu-backdrop]',
    mobileLinks: '#navLinks',
    drawerAuth: '[data-mx-drawer-auth]',
    overlay: '[data-mx-overlay]',
    drawer: '[data-mx-drawer]',
    drawerList: '[data-mx-drawer-list]',
    notifRoot: '[data-mx-notif-root]',
    notifToggle: '[data-mx-notif-toggle]',
    notifPanel: '[data-mx-notif-panel]',
    notifList: '[data-mx-notif-list]',
    notifBadge: '[data-mx-notif-badge]',
    notifMarkAll: '[data-mx-notif-markall]',
    notifClose: '[data-mx-notif-close]',
    notifOverlay: '[data-mx-notif-overlay]',
  };

  const MX = {
    mxReadyKey: 'mxHeaderBound_v1',
    /** Deve coincidir com o breakpoint em `header.css` (nav desktop vs menu móvel). */
    MOBILE_MAX_WIDTH: 1024,
  };

  const isMobile = () => window.innerWidth <= MX.MOBILE_MAX_WIDTH;

  function normalizePathname(pathname) {
    let p = String(pathname || '/').split('?')[0];
    if (p.endsWith('.html')) p = p.slice(0, -5) || '/';
    if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
    return p || '/';
  }

  function isActivePath(currentPath, linkPath) {
    if (linkPath === '/' || linkPath === '') return currentPath === '/' || currentPath === '';
    if (currentPath === linkPath) return true;
    return currentPath.startsWith(`${linkPath}/`);
  }

  function applyActiveNavAnchors(anchors, currentPath) {
    anchors.forEach((a) => {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      try {
        const u = new URL(href, window.location.origin);
        const linkPath = normalizePathname(u.pathname);
        const active = isActivePath(currentPath, linkPath);
        a.classList.toggle('is-active', active);
        if (active) a.setAttribute('aria-current', 'page');
        else a.removeAttribute('aria-current');
      } catch {
        /* ignore */
      }
    });
  }

  class HeaderState {
    constructor() {
      this.open = false;
      this.lastY = window.scrollY || 0;
      this.ticking = false;
      this.lastFocus = null;
      this.focusables = [];
      this.abort = new AbortController();
      this.ro = null;
    }
  }

  class HeaderView {
    constructor(root) {
      this.root = root;
      this.navList = root.querySelector(SEL.navList);
      this.authSlot = root.querySelector(SEL.authSlot);
      this.menuToggle = root.querySelector(SEL.menuToggle);
      this.mobileLinks = root.querySelector(SEL.mobileLinks);
      this.menuBackdrop = root.querySelector(SEL.menuBackdrop);

      // mantemos referências antigas apenas para compatibilidade (não usamos na lógica B)
      this.overlay = root.querySelector(SEL.overlay);
      this.drawer = root.querySelector(SEL.drawer);
      this.drawerList = root.querySelector(SEL.drawerList);
      this.drawerAuth = root.querySelector(SEL.drawerAuth);
    }

    valid() {
      return !!(this.root && this.navList && this.authSlot && this.menuToggle && this.mobileLinks);
    }

    setOpen(open) {
      this.root.dataset.menuOpen = open ? 'true' : 'false';
      this.menuToggle.setAttribute('aria-expanded', String(open));
      this.menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');

      this.mobileLinks.classList.toggle('active', open);

      if (this.menuBackdrop) {
        this.menuBackdrop.toggleAttribute('hidden', !open);
        this.menuBackdrop.setAttribute('aria-hidden', String(!open));
      }

      document.documentElement.dataset.mxHeaderMenu = open ? 'open' : 'closed';
      document.body.style.overflow = open ? 'hidden' : '';
    }

    setScrollState({ compact, hidden }) {
      this.root.classList.toggle('is-compact', compact);
      this.root.classList.toggle('is-hidden', hidden);
    }

    syncHeight() {
      const h = this.root.offsetHeight;
      document.documentElement.style.setProperty('--mx-header-height', `${h}px`);
    }

    renderAuth(html) {
      if (this.authSlot) this.authSlot.innerHTML = html;
      // nem todas as páginas/headers possuem drawer (data-mx-drawer-auth)
      if (this.drawerAuth) this.drawerAuth.innerHTML = html;
    }


    renderDrawerLinks(html) {
      // legado (drawer não participa do modo B)
      if (this.drawerList) this.drawerList.innerHTML = html;
    }

    renderMobileLinks(html) {
      this.mobileLinks.innerHTML = html;
    }
  }

  class HeaderRedirect {
    static portalForRole(role) {
      switch (role) {
        case 'admin':
          return '/admin';
        case 'coordinator':
          return '/coordenacao';
        case 'teacher':
          return '/orientadores';
        case 'press':
          return '/imprensa-dashboard';
        default:
          return '/profile';
      }
    }

    static canSeeAnalytics(role) {
      // Apenas admin/coordinator/press (teacher não deve ver analytics)
      return role === 'admin' || role === 'coordinator' || role === 'press';
    }
  }

  class HeaderService {
    static sessionRole() {
      return localStorage.getItem('role') || '';
    }

    static token() {
      return localStorage.getItem('token') || '';
    }

    static async newsletterEnabled() {
      try {
        const res = await fetch('/api/features');
        if (!res.ok) return false;
        const data = await res.json();
        return Boolean(data.newsletter);
      } catch {
        return false;
      }
    }

    static logout() {
      if (window.MaxOnuSession?.clearAuth) {
        window.MaxOnuSession.clearAuth();
      } else {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('userId');
        localStorage.removeItem('isAdmin');
      }
      window.location.href = '/login';
    }
  }

  class HeaderController {
    constructor(root) {
      this.state = new HeaderState();
      this.view = new HeaderView(root);
      this.notif = null;
    }

    async init() {
      if (!this.view.valid()) return;

      this.renderAuth();
      this.applyAccess();
      await this.applyFeatures();
      this.renderMobileLinks();
      this.markActiveNav();

      this.view.syncHeight();
      this.notif = new HeaderNotifications(this.view.root, this.state.abort.signal, () => this.close());
      this.notif.init();
      this.bind();
    }

    markActiveNav() {
      const currentPath = normalizePathname(window.location.pathname);
      const desktop = Array.from(this.view.navList.querySelectorAll('.mx-header__nav-link'));
      applyActiveNavAnchors(desktop, currentPath);
      const mobile = Array.from(this.view.mobileLinks.querySelectorAll('a[href]'));
      applyActiveNavAnchors(mobile, currentPath);
    }

    bind() {
      const { abort } = this.state;

      this.view.menuToggle.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isMobile()) return;
        if (this.notif) this.notif.closePanel();
        this.toggle();
      }, { signal: abort.signal });

      if (this.view.menuBackdrop) {
        this.view.menuBackdrop.addEventListener('click', () => this.close(), { signal: abort.signal });
      }

      // Fechar ao clicar em link do dropdown
      this.view.mobileLinks.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (a) this.close();
      }, { signal: abort.signal });

      // Clique fora do header (idempotente, um listener global)
      document.addEventListener('pointerdown', (e) => {
        if (!this.state.open) return;
        const target = e.target;
        if (!(target instanceof Element)) return;
        if (this.view.root.contains(target)) return;
        this.close();
      }, { capture: true, passive: true, signal: abort.signal });

      // Fechar painel de notificações ao clicar no overlay
      if (this.notif) {
        const overlay = this.view.root.querySelector('[data-mx-notif-overlay]');
        if (overlay) {
          overlay.addEventListener('click', () => {
            this.notif?.closePanel();
          }, { signal: abort.signal });
        }
      }

      // ESC fecha menu e painel de notificações
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (this.notif?.open) {
          this.notif?.closePanel();
        } else {
          this.close();
        }
      }, { signal: abort.signal });

      // Scroll inteligente
      window.addEventListener('scroll', () => this.onScroll(), { passive: true, signal: abort.signal });

      // Resize
      window.addEventListener('resize', () => this.onResize(), { passive: true, signal: abort.signal });

      // Recalcular altura
      if (typeof ResizeObserver !== 'undefined') {
        this.state.ro = new ResizeObserver(() => this.view.syncHeight());
        this.state.ro.observe(this.view.root);
      }
    }

    toggle() {
      this.state.open ? this.close() : this.openMenu();
    }

    openMenu() {
      if (!isMobile()) return;
      if (this.state.open) return;
      if (this.notif) this.notif.closePanel();
      this.state.open = true;
      this.state.lastFocus = document.activeElement;

      this.view.setOpen(true);
      this.state.focusables = this.getFocusable();
      this.state.focusables[0]?.focus?.();

      // garante scroll behavior premium ao abrir
      this.view.setScrollState({ compact: false, hidden: false });
    }

    close() {
      if (!this.state.open) return;
      this.state.open = false;
      this.view.setOpen(false);
      this.state.lastFocus?.focus?.();
    }

    getFocusable() {
      return Array.from(this.view.mobileLinks.querySelectorAll('a,button,[tabindex]:not([tabindex="-1"])'));
    }

    onResize() {
      this.view.syncHeight();
      if (!isMobile()) this.close();
    }

    onScroll() {
      if (this.state.ticking) return;
      this.state.ticking = true;

      requestAnimationFrame(() => {
        const y = window.scrollY || 0;
        const delta = y - this.state.lastY;

        // UX premium:
        // - compacto quando passando de um limiar
        // - ocultar levemente quando scroll rápido para baixo e não está com menu aberto
        const compact = y > 60;
        const hide = !this.state.open && y > 140 && delta > 8;
        const reveal = delta < -6 || y < 40;

        this.view.setScrollState({ compact, hidden: reveal ? false : hide });
        this.state.lastY = y;
        this.state.ticking = false;
      });
    }

    renderAuth() {
      const token = HeaderService.token();
      const role = HeaderService.sessionRole();

      if (!token) {
        this.view.renderAuth([
          '<a class="mx-header__auth-btn mx-header__auth-btn--soft" href="/login">Entrar</a>',
          '<a class="mx-header__auth-btn mx-header__auth-btn--strong" href="/login#register">Cadastrar</a>',
        ].join(''));
        return;
      }

      const portal = HeaderRedirect.portalForRole(role);
      this.view.renderAuth([
        `<a class="mx-header__auth-btn mx-header__auth-btn--soft" href="${portal}">Meu portal</a>`,
        '<button class="mx-header__auth-btn mx-header__auth-btn--strong" type="button" data-mx-logout>Sair</button>',
      ].join(''));

      this.view.root.querySelectorAll('[data-mx-logout]').forEach((btn) => {
        btn.addEventListener('click', () => HeaderService.logout(), { signal: this.state.abort.signal });
      });
    }

    applyAccess() {
      const role = HeaderService.sessionRole();
      const analyticsLi = this.view.root.querySelector('.mx-header__nav-item--admin');
      if (analyticsLi) analyticsLi.hidden = !HeaderRedirect.canSeeAnalytics(role);

      // idempotente: drawer links são reconstruídos do próprio HTML
    }

    async applyFeatures() {
      const newsEnabled = await HeaderService.newsletterEnabled();
      const newsLi = this.view.root.querySelector('.mx-header__nav-item--newsletter');
      if (newsLi) newsLi.hidden = !newsEnabled;
    }

    renderMobileLinks() {
      // Replica links do UL desktop em formato esperado pelo CSS (#navLinks)
      const desktopLinks = Array.from(this.view.navList.querySelectorAll('a'));

      const itemsHtml = desktopLinks
        .map(
          (a) =>
            `<li><a class="nav-link" href="${a.getAttribute('href') || '#'}">${(a.textContent || '').trim()}</a></li>`,
        )
        .join('');

      // Auth mobile (se quiser espelhar, reaproveitamos o que já existe no desktop via renderAuth)
      // No modo atual, authSlot (desktop) já injeta HTML com botões/links.
      // Para manter simples: mostramos Entrar/Cadastrar ou Meu portal/Sair diretamente no dropdown.
      const token = HeaderService.token();
      const role = HeaderService.sessionRole();

      const authHtml = (() => {
        if (!token) {
          return `
            <li class="mobile-auth-link mobile-auth-enter">
              <a class="nav-link mobile-auth-enter" href="/login">Entrar</a>
            </li>
            <li class="mobile-auth-link mobile-auth-register">
              <a class="nav-link mobile-auth-register" href="/login#register">Cadastrar</a>
            </li>
          `;
        }

        const portal = HeaderRedirect.portalForRole(role);
        return `
          <li class="mobile-auth-link mobile-auth-profile">
            <a class="nav-link mobile-auth-profile" href="${portal}">Meu portal</a>
          </li>
          <li class="mobile-auth-link mobile-auth-logout">
            <button class="nav-link mobile-auth-logout" type="button" data-mx-logout> Sair </button>
          </li>
        `;
      })();

      this.view.renderMobileLinks(`${itemsHtml}${authHtml}`);

      // eventos do logout (botão no dropdown)
      this.view.root.querySelectorAll('[data-mx-logout]').forEach((btn) => {
        btn.addEventListener('click', () => HeaderService.logout(), { signal: this.state.abort.signal });
      });
    }
  }

  class HeaderNotifications {
    /**
     * @param {HTMLElement} root
     * @param {AbortSignal} signal
     * @param {() => void} closeMobileMenu
     */
    constructor(root, signal, closeMobileMenu) {
      this.root = root;
      this.signal = signal;
      this.closeMobileMenu = closeMobileMenu;
      this.open = false;
      this.es = null;
      this.slot = root.querySelector(SEL.notifRoot);
      this.toggle = root.querySelector(SEL.notifToggle);
      this.panel = root.querySelector(SEL.notifPanel);
      this.list = root.querySelector(SEL.notifList);
      this.badge = root.querySelector(SEL.notifBadge);
      this.markAll = root.querySelector(SEL.notifMarkAll);
      this.closeBtn = root.querySelector(SEL.notifClose);
      this.overlay = root.querySelector(SEL.notifOverlay);
    }

    valid() {
      return !!(this.slot && this.toggle && this.panel && this.list && this.badge);
    }

    init() {
      if (!this.valid()) return;

      this.toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closeMobileMenu();
        this.togglePanel();
      }, { signal: this.signal });

      this.closeBtn?.addEventListener('click', () => this.closePanel(), { signal: this.signal });
      this.markAll?.addEventListener('click', () => this.markAllRead(), { signal: this.signal });

      // Fechar ao clicar no overlay
      if (this.overlay) {
        this.overlay.addEventListener('click', () => this.closePanel(), { signal: this.signal });
      }

      document.addEventListener('pointerdown', (e) => {
        if (!this.open) return;
        const t = e.target;
        if (!(t instanceof Element)) return;
        if (this.slot.contains(t)) return;
        this.closePanel();
      }, { capture: true, signal: this.signal });

      this.list.addEventListener('click', (e) => {
        const card = e.target.closest('[data-mx-notif-id]');
        if (!card) return;
        const id = card.getAttribute('data-mx-notif-id');
        if (id) {
          // Feedback visual imediato
          card.style.opacity = '0.5';
          card.style.transform = 'scale(0.98)';
          this.markRead(id);
        }
      }, { signal: this.signal });

      this.refresh();
      this.connectStream();
    }

    authHeaders() {
      const token = HeaderService.token();
      if (!token) return null;
      return { Authorization: `Bearer ${token}` };
    }

    setBadge(count) {
      const n = Math.min(99, Math.max(0, Number(count) || 0));
      if (!this.badge) return;
      if (n <= 0) {
        this.badge.hidden = true;
        this.badge.textContent = '0';
        return;
      }
      this.badge.hidden = false;
      this.badge.textContent = n > 9 ? String(n) : String(n);
    }

    setPanelOpen(open) {
      this.open = open;
      this.toggle.setAttribute('aria-expanded', String(open));
      this.panel.hidden = !open;
      this.panel.classList.toggle('is-open', open);
      this.slot.classList.toggle('is-open', open);
      
      // Gerenciar overlay
      if (this.overlay) {
        if (open) {
          this.overlay.removeAttribute('hidden');
          this.overlay.setAttribute('aria-hidden', 'false');
          this.overlay.classList.add('is-open');
        } else {
          this.overlay.setAttribute('hidden', '');
          this.overlay.setAttribute('aria-hidden', 'true');
          this.overlay.classList.remove('is-open');
        }
      }
      
      // Bloquear scroll do body quando painel está aberto
      if (open) {
        document.body.style.overflow = 'hidden';
        document.body.classList.add('mx-header-lock');
      } else {
        document.body.style.overflow = '';
        document.body.classList.remove('mx-header-lock');
      }
    }

    togglePanel() {
      this.setPanelOpen(!this.open);
      if (this.open) this.refresh();
    }

    closePanel() {
      if (!this.open) return;
      this.setPanelOpen(false);
      document.body.style.overflow = '';
      document.body.classList.remove('mx-header-lock');
    }

    async refresh() {
      const headers = this.authHeaders();
      if (!headers) {
        this.setBadge(0);
        this.list.innerHTML = `
          <div class="mx-header__notif-empty">
            <p>Faça login para ver avisos e convites na sua conta.</p>
            <a class="mx-header__notif-cta" href="/login">Entrar</a>
          </div>`;
        this.markAll?.setAttribute('hidden', '');
        return;
      }
      this.markAll?.removeAttribute('hidden');

      try {
        const res = await fetch('/api/notifications', { headers });
        if (res.status === 401) {
          this.setBadge(0);
          this.list.innerHTML = `<div class="mx-header__notif-empty"><p>Sessão expirada. <a class="mx-header__notif-cta" href="/login">Entrar de novo</a></p></div>`;
          return;
        }
        if (!res.ok) throw new Error('fetch');
        const data = await res.json();
        const items = data.notifications || [];
        this.setBadge(data.unreadCount ?? 0);
        this.renderList(items);
      } catch {
        this.list.innerHTML = `<div class="mx-header__notif-empty"><p>Não foi possível carregar agora.</p></div>`;
      }
    }

    formatTime(iso) {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      } catch {
        return '';
      }
    }

    escapeHtml(s) {
      return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    renderList(items) {
      if (!items.length) {
        this.list.innerHTML = `<div class="mx-header__notif-empty"><p>Nenhuma notificação por aqui.</p><p style="font-size: 2rem; margin: 0.5rem 0;">🔔</p></div>`;
        return;
      }
      this.list.innerHTML = items
        .map((n) => {
          const unread = !n.readAt;
          const title = this.escapeHtml(n.title);
          const message = this.escapeHtml(n.message);
          const time = this.escapeHtml(this.formatTime(n.createdAt));
          return `
            <article class="mx-header__notif-card${unread ? ' is-unread' : ''}" data-mx-notif-id="${this.escapeHtml(n.id)}" role="button" tabindex="0" aria-label="${unread ? 'Notificação não lida' : 'Notificação lida'}: ${title}">
              <div class="mx-header__notif-card-head">
                ${unread ? '<span class="mx-header__notif-dot" aria-hidden="true" title="Novo"></span>' : '<span style="width: 8px; height: 8px; flex-shrink: 0; opacity: 0;"></span>'}
                <strong class="mx-header__notif-card-title">${title}${unread ? '<span style="font-size: 0.7em; vertical-align: super; margin-left: 0.25em; color: #ef4444; font-weight: 600;">NEW</span>' : ''}</strong>
              </div>
              <p class="mx-header__notif-msg">${message}</p>
              <time class="mx-header__notif-time">${time}</time>
            </article>`;
        })
        .join('');
    }

    async markRead(id) {
      const headers = this.authHeaders();
      if (!headers) return;
      try {
        const res = await fetch(`/api/notifications/${encodeURIComponent(id)}/read`, {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        await this.refresh();
      } catch {
        /* ignore */
      }
    }

    async markAllRead() {
      const headers = this.authHeaders();
      if (!headers) return;
      try {
        const res = await fetch('/api/notifications/read-all', {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json' },
        });
        if (!res.ok) return;
        await this.refresh();
      } catch {
        /* ignore */
      }
    }

    connectStream() {
      const token = HeaderService.token();
      if (!token) return;
      try {
        if (this.es) this.es.close();
        this.es = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
        const bump = () => {
          if (this.open) {
            this.refresh();
          } else {
            // Quando o painel está fechado, apenas atualiza o badge
            this.refreshBadgeOnly();
          }
        };
        this.es.addEventListener('notification', bump);
        this.es.addEventListener('new-notification', bump);
        this.es.addEventListener('notification-read', bump);
        this.es.addEventListener('notification-read-all', bump);
        this.es.addEventListener('error', () => {
          try {
            this.es?.close();
          } catch {
            /* ignore */
          }
          this.es = null;
          // Reconectar após 15 segundos se ainda houver token
          window.setTimeout(() => {
            if (HeaderService.token()) this.connectStream();
          }, 15000);
        });
      } catch (err) {
        console.warn('SSE não disponível:', err);
      }
    }

    async refreshBadgeOnly() {
      const headers = this.authHeaders();
      if (!headers) {
        this.setBadge(0);
        return;
      }
      try {
        const res = await fetch('/api/notifications', { headers });
        if (!res.ok) {
          this.setBadge(0);
          return;
        }
        const data = await res.json();
        const count = data.unreadCount ?? 0;
        this.setBadge(count);
      } catch (err) {
        console.warn('Erro ao atualizar badge:', err);
        this.setBadge(0);
      }
    }
  }

  const boot = () => {
    const root = document.querySelector(SEL.root);
    if (!root) return;

    // idempotente por root (evita bind duplo)
    if (root.dataset.mxHeaderBound === 'true') return;
    root.dataset.mxHeaderBound = 'true';

    const controller = new HeaderController(root);
    controller.init();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();

