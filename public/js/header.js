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
    mobileLinks: '#navLinks',
    drawerAuth: '[data-mx-drawer-auth]',
    overlay: '[data-mx-overlay]',
    drawer: '[data-mx-drawer]',
    drawerList: '[data-mx-drawer-list]',
  };

  const MX = {
    mxReadyKey: 'mxHeaderBound_v1',
    /** Deve coincidir com o breakpoint em `header.css` (nav desktop vs menu móvel). */
    MOBILE_MAX_WIDTH: 1024,
  };

  const isMobile = () => window.innerWidth <= MX.MOBILE_MAX_WIDTH;

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
    }

    async init() {
      if (!this.view.valid()) return;

      this.renderAuth();
      this.applyAccess();
      await this.applyFeatures();
      this.renderMobileLinks();

      this.view.syncHeight();
      this.bind();
    }

    bind() {
      const { abort } = this.state;

      this.view.menuToggle.addEventListener('click', (e) => {
        e.preventDefault();
        if (!isMobile()) return;
        this.toggle();
      }, { signal: abort.signal });

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

      // ESC fecha e mantém acessibilidade
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
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

  const boot = () => {
    const root = document.querySelector(SEL.root);
    if (!root) return;

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

