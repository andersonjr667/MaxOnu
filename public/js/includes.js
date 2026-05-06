document.addEventListener('DOMContentLoaded', function() {
    // ── Dark mode ──────────────────────────────────────────────────────────
    const THEME_KEY = 'maxonu_theme';

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(THEME_KEY, theme);
    }

    // Aplica o tema salvo (ou preferência do sistema) antes de qualquer render
    const savedTheme = localStorage.getItem(THEME_KEY);
    if (savedTheme) {
        applyTheme(savedTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        applyTheme('dark');
    }

    // Bind do botão após o header ser carregado
    document.addEventListener('click', function(e) {
        const btn = e.target.closest('#themeToggle');
        if (!btn) return;
        const current = document.documentElement.getAttribute('data-theme');
        applyTheme(current === 'dark' ? 'light' : 'dark');
    });
    // ── fim Dark mode ──────────────────────────────────────────────────────

    let headerContext = null;
    let realtimeSource = null;
    let notificationsCache = [];
    const AUTH_CONTEXT_CACHE_KEY = 'maxonu_auth_context_v1';
    const AUTH_CONTEXT_TTL = 60 * 1000;
    let authContextPromise = null;

    const clearStoredAuth = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('isAdmin');
        localStorage.removeItem('role');
        authContextPromise = null;
        try {
            sessionStorage.removeItem(AUTH_CONTEXT_CACHE_KEY);
        } catch (error) {
            // Ignore storage cleanup failures.
        }

        if (realtimeSource) {
            try {
                realtimeSource.close();
            } catch (error) {
                // Ignore close errors.
            }
            realtimeSource = null;
        }
    };

    const closeHamburgerMenu = (hamburgerMenu, navLinks) => {
        hamburgerMenu.classList.remove('active');
        navLinks.classList.remove('active');
        hamburgerMenu.setAttribute('aria-expanded', 'false');
    };

    const closeNotifications = () => {
        const utility = document.querySelector('[data-notification-root]');
        if (!utility) {
            return;
        }

        utility.classList.remove('is-open');
        const toggle = utility.querySelector('[data-notification-toggle]');
        if (toggle) {
            toggle.setAttribute('aria-expanded', 'false');
        }
    };

    const getValidToken = () => {
        const token = localStorage.getItem('token');

        if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
            clearStoredAuth();
            return '';
        }

        return token;
    };

    const getStoredRole = () => localStorage.getItem('role') || 'candidate';

    const getStoredAuthContext = () => {
        const token = getValidToken();
        if (!token) {
            return null;
        }

        return {
            user: {
                role: getStoredRole()
            },
            delegationStatus: null
        };
    };

    const getRoleDestination = (user, delegationStatus) => {
        if (user.role === 'admin') {
            return { href: '/admin', label: 'Meu portal' };
        }

        if (user.role === 'coordinator') {
            return { href: '/coordenacao', label: 'Meu portal' };
        }

        if (user.role === 'teacher') {
            return { href: '/orientadores', label: 'Meu portal' };
        }

        if (user.role === 'press') {
            return { href: '/imprensa-dashboard', label: 'Meu portal' };
        }

        if (delegationStatus?.registrationOpen && !delegationStatus?.registration?.submittedAt) {
            return { href: '/inscricao', label: 'Faça inscrição' };
        }

        return { href: '/profile', label: 'Minha inscrição' };
    };

    const getHeaderAvatarUrl = (user = {}) => {
        if (user?.profileImageUrl) {
            return user.profileImageUrl;
        }

        if (user?.gender === 'feminino') {
            return '/images/profile_female.png';
        }

        return '/images/profile_male.png';
    };

    const logout = () => {
        clearStoredAuth();
        window.location.href = '/login';
    };

    const parseJson = async (response) => response.json().catch(() => ({}));

    const bindImageFallbacks = (root = document) => {
        const images = root.querySelectorAll('img[data-fallback-src]');
        images.forEach((image) => {
            image.addEventListener('error', () => {
                const fallbackSrc = image.dataset.fallbackSrc;
                if (!fallbackSrc || image.src === fallbackSrc) {
                    return;
                }
                image.src = fallbackSrc;
            }, { once: true });
        });
    };

    const parseClassGroup = (classGroup = '') => {
        const normalized = String(classGroup || '').trim();
        if (!normalized) {
            return { unit: 'Não informada', grade: 'Não informada' };
        }

        const separatorIndex = normalized.indexOf(' - ');
        if (separatorIndex === -1) {
            return { unit: normalized, grade: 'Não informada' };
        }

        const unit = normalized.slice(0, separatorIndex).trim() || 'Não informada';
        const grade = normalized.slice(separatorIndex + 3).trim() || 'Não informada';
        return { unit, grade };
    };

    const readAuthContextCache = () => {
        try {
            const raw = sessionStorage.getItem(AUTH_CONTEXT_CACHE_KEY);
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (Date.now() - parsed.timestamp > AUTH_CONTEXT_TTL) {
                sessionStorage.removeItem(AUTH_CONTEXT_CACHE_KEY);
                return null;
            }

            return parsed.data || null;
        } catch (error) {
            return null;
        }
    };

    const writeAuthContextCache = (context) => {
        try {
            sessionStorage.setItem(AUTH_CONTEXT_CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                data: context
            }));
        } catch (error) {
            // Ignore cache write failures.
        }
    };

    const fetchFreshAuthContext = async () => {
        const token = getValidToken();
        if (!token) {
            return null;
        }

        try {
            const meResponse = await fetch('/api/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!meResponse.ok) {
                console.error('[AUTH] GET /api/me falhou com status:', meResponse.status);
                clearStoredAuth();
                return null;
            }

            const user = await parseJson(meResponse);
            localStorage.setItem('role', user.role || 'candidate');

            let delegationStatus = null;
            if (user.role === 'candidate') {
                const delegationResponse = await fetch('/api/delegation/status', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (delegationResponse.ok) {
                    delegationStatus = await parseJson(delegationResponse);
                }
            }

            const context = { user, delegationStatus };
            writeAuthContextCache(context);
            return context;
        } catch (error) {
            return getStoredAuthContext();
        }
    };

    const getAuthContext = async (options = {}) => {
        const { forceRefresh = false } = options;

        if (!forceRefresh) {
            const cached = readAuthContextCache();
            if (cached) {
                return cached;
            }
        }

        if (!forceRefresh && authContextPromise) {
            return authContextPromise;
        }

        authContextPromise = fetchFreshAuthContext()
            .finally(() => {
                authContextPromise = null;
            });

        return authContextPromise;
    };

    const setActiveLinks = (navLinks) => {
        const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
        navLinks.querySelectorAll('a').forEach((link) => {
            link.classList.remove('is-active');
            const href = (link.getAttribute('href') || '').split('#')[0].replace(/\/+$/, '') || '/';
            if (href === currentPath) {
                link.classList.add('is-active');
            }
        });
    };

    const showToast = (title, message, tone = 'info') => {
        let root = document.querySelector('[data-toast-root]');
        if (!root) {
            root = document.createElement('div');
            root.className = 'app-toast-root';
            root.setAttribute('data-toast-root', 'true');
            document.body.appendChild(root);
        }

        const toast = document.createElement('article');
        const icon = tone === 'success' ? '&#10003;' : (tone === 'error' ? '&#9888;' : '&#9432;');
        toast.className = `app-toast app-toast-${tone}`;
        toast.innerHTML = `
            <span class="app-toast-icon" aria-hidden="true">${icon}</span>
            <strong>${title}</strong>
            <p>${message}</p>
        `;
        root.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('is-leaving');
            setTimeout(() => toast.remove(), 220);
        }, 3600);
    };

    const setActionLoading = (button, isLoading) => {
        if (!button) return;
        button.disabled = isLoading;
        button.classList.toggle('is-loading', isLoading);
    };

    const mergeNotifications = (context, storedNotifications) => {
        const pendingInvites = context?.delegationStatus?.notifications?.filter((item) => item.status === 'pending') || [];
        const inviteCards = pendingInvites.map((notification) => ({
            id: `invite-${notification.id}`,
            invitationId: notification.id,
            type: 'delegation-invite-pending',
            title: 'Convite pendente',
            message: `${notification.fromFullName || notification.fromUsername} convidou você para delegação.`,
            createdAt: notification.createdAt,
            readAt: null,
            payload: notification
        }));

        const persisted = (storedNotifications || []).map((item) => ({ ...item, invitationId: null }));
        return [...inviteCards, ...persisted]
            .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    };

    const renderNotifications = (context, storedNotifications = []) => {
        const utilities = document.querySelector('[data-header-utilities]');
        const notifSlot = document.querySelector('[data-header-notifications]');
        const target = notifSlot || utilities;
        if (!target) {
            return;
        }

        const notifications = mergeNotifications(context, storedNotifications);
        const unreadCount = notifications.filter((item) => !item.readAt).length;
        const panelCount = unreadCount;
        const toggleLabel = unreadCount > 0
            ? `Abrir notificações: ${unreadCount} não lida${unreadCount > 1 ? 's' : ''}`
            : 'Abrir notificações';
        const badgeVisibilityAttr = unreadCount > 0 ? '' : ' hidden';

        const panelContent = notifications.length
            ? `
                <div class="notification-list">
                    ${notifications.map((item) => {
                        if (item.type === 'delegation-invite-pending' && item.payload) {
                            const inviterName = item.payload.fromFullName || item.payload.fromUsername;
                            const inviterClass = parseClassGroup(item.payload.fromClassGroup);
                            const inviterImageUrl = item.payload.fromProfileImageUrl
                                || (item.payload.fromGender === 'feminino' ? '/images/profile_female.png' : '/images/profile_male.png');
                            return `
                                <article class="notification-card" data-notification-id="${item.invitationId}">
                                    <div style="display: flex; gap: 0.75rem; align-items: flex-start;">
                                        <img src="${inviterImageUrl}" alt="Foto de ${inviterName}" class="notification-avatar" data-fallback-src="/images/profile_male.png">
                                        <div style="flex: 1; min-width: 0;">
                                            <p style="margin-bottom: 0.5rem;">
                                                <strong>${inviterName}</strong> convidou você para integrar uma delegação com ${item.payload.teamSize} participante${item.payload.teamSize !== 1 ? 's' : ''}.
                                            </p>
                                            <p style="font-size: 0.875rem; opacity: 0.85; margin-bottom: 0;">
                                                📍 <strong>${inviterClass.unit}</strong> • ${inviterClass.grade}
                                            </p>
                                        </div>
                                    </div>
                                    <div class="notification-actions">
                                        <button type="button" class="view-button" data-notification-action="accept">Aceitar</button>
                                        <button type="button" class="delete-button" data-notification-action="reject">Recusar</button>
                                    </div>
                                </article>
                            `;
                        }

                        return `
                            <article class="notification-card ${item.readAt ? '' : 'notification-card-unread'}" data-stored-notification-id="${item.id}">
                                <p>
                                    <strong>${item.title}</strong><br>
                                    ${item.message}
                                </p>
                                <div class="notification-actions">
                                    <button type="button" class="view-button" data-notification-read="${item.id}">Marcar lida</button>
                                </div>
                            </article>
                        `;
                    }).join('')}
                </div>
            `
            : `
                <div class="notification-list">
                    <article class="notification-card notification-card-empty">
                        <p>Nenhuma notificação no momento.</p>
                    </article>
                </div>
            `;

        target.innerHTML = `
            <div class="notification-root" data-notification-root>
                <button type="button" class="notification-toggle" data-notification-toggle aria-label="${toggleLabel}" aria-expanded="false">
                    <span class="notification-toggle-icon" aria-hidden="true">&#9993;</span>
                    <span class="notification-badge"${badgeVisibilityAttr}>${panelCount}</span>
                </button>
                <div class="notification-panel" data-notification-panel>
                    <div class="notification-panel-header">
                        <strong>Central de notificações</strong>
                        <span>${panelCount}</span>
                    </div>
                    ${panelContent}
                    ${notifications.length ? '<div class="notification-actions"><button type="button" class="view-button secondary" data-notification-read-all>Marcar todas como lidas</button></div>' : ''}
                </div>
            </div>
        `;
    };

    const renderHeaderAuth = (navLinks, context) => {
        const authButtons = document.querySelector('[data-auth-buttons]');
        const mobilePrimary = navLinks?.querySelector('[data-mobile-auth-slot="primary"]');
        const mobileSecondary = navLinks?.querySelector('[data-mobile-auth-slot="secondary"]');

        if (!authButtons || !mobilePrimary || !mobileSecondary) {
            return;
        }

        if (!context) {
            authButtons.innerHTML = `
                <a href="/login" class="auth-btn auth-btn-secondary">Entrar</a>
                <a href="/login#register" class="auth-btn auth-btn-primary">Cadastrar</a>
            `;

            mobilePrimary.innerHTML = '<a href="/login" class="nav-link mobile-auth-enter">Entrar</a>';
            mobileSecondary.innerHTML = '<a href="/login#register" class="nav-link mobile-auth-register">Cadastrar</a>';
            mobilePrimary.hidden = false;
            mobileSecondary.hidden = false;
            return;
        }

        const profileDestination = { href: '/profile', label: 'Meu perfil' };
        const avatarUrl = getHeaderAvatarUrl(context.user);
        const avatarFallbackUrl = context.user?.gender === 'feminino'
            ? '/images/profile_female.png'
            : '/images/profile_male.png';
        const avatarAlt = context.user?.fullName
            ? `Foto de perfil de ${context.user.fullName}`
            : 'Foto de perfil';

        authButtons.innerHTML = `
            <a href="${profileDestination.href}" class="auth-avatar-link" aria-label="${profileDestination.label}">
                <img src="${avatarUrl}" alt="${avatarAlt}" class="auth-avatar-image" data-fallback-src="${avatarFallbackUrl}">
            </a>
            <button type="button" class="auth-btn auth-btn-secondary auth-btn-logout" data-logout-trigger>Sair</button>
        `;

        mobilePrimary.innerHTML = `
            <a href="${profileDestination.href}" class="nav-link mobile-auth-register mobile-auth-profile">
                <img src="${avatarUrl}" alt="${avatarAlt}" class="mobile-auth-avatar" data-fallback-src="${avatarFallbackUrl}">
                <span>${profileDestination.label}</span>
            </a>
        `;
        mobileSecondary.innerHTML = '<button type="button" class="nav-link mobile-auth-enter mobile-auth-logout" data-logout-trigger>Sair</button>';
        mobilePrimary.hidden = false;
        mobileSecondary.hidden = false;

        document.querySelectorAll('[data-logout-trigger]').forEach((trigger) => {
            trigger.addEventListener('click', logout);
        });

        bindImageFallbacks(authButtons);
        bindImageFallbacks(mobilePrimary);
    };

    window.MaxOnuSession = {
        getToken: getValidToken,
        clearAuth: clearStoredAuth,
        getAuthContext,
        refreshAuthContext: () => getAuthContext({ forceRefresh: true })
    };

    const fetchStoredNotifications = async () => {
        const token = getValidToken();
        if (!token) {
            notificationsCache = [];
            return [];
        }

        try {
            const response = await fetch('/api/notifications', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                return notificationsCache;
            }
            const data = await parseJson(response);
            notificationsCache = data.notifications || [];
            return notificationsCache;
        } catch (error) {
            return notificationsCache;
        }
    };

    const openRealtimeNotifications = () => {
        const token = getValidToken();
        if (!token || realtimeSource) {
            return;
        }

        const source = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);
        realtimeSource = source;

        source.addEventListener('notification', async (event) => {
            try {
                const payload = JSON.parse(event.data || '{}');
                if (payload?.title) {
                    showToast(payload.title, payload.message || '', 'info');
                }
                await fetchStoredNotifications();
                const navLinks = document.getElementById('navLinks');
                if (navLinks) {
                    renderNotifications(headerContext || getStoredAuthContext(), notificationsCache);
                }
            } catch (error) {
                // ignore malformed realtime event
            }
        });

        source.onerror = () => {
            try {
                source.close();
            } catch (error) {
                // ignore close errors
            }
            realtimeSource = null;
            setTimeout(openRealtimeNotifications, 2500);
        };
    };

    const refreshHeader = async (navLinks) => {
        const immediateContext = getStoredAuthContext();
        if (immediateContext) {
            renderHeaderAuth(navLinks, immediateContext);
        } else {
            renderHeaderAuth(navLinks, null);
        }

        headerContext = await getAuthContext();
        await fetchStoredNotifications();
        renderNotifications(headerContext || immediateContext, notificationsCache);
        renderHeaderAuth(navLinks, headerContext || immediateContext);
        setActiveLinks(navLinks);
        openRealtimeNotifications();
    };

    const handleNotificationResponse = async (notificationId, action, trigger) => {
        const token = getValidToken();
        if (!token) {
            logout();
            return;
        }

        setActionLoading(trigger, true);

        try {
            const response = await fetch(`/api/delegation/notifications/${notificationId}/respond`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ action })
            });

            const data = await parseJson(response);
            if (!response.ok) {
                throw new Error(data.error || 'Nao foi possivel responder ao convite.');
            }

            showToast(
                action === 'accept' ? 'Convite aceito' : 'Convite recusado',
                data.message || 'Sua resposta foi registrada com sucesso.',
                'success'
            );

            if (window.MaxOnuSession?.refreshAuthContext) {
                await window.MaxOnuSession.refreshAuthContext();
            }

            document.dispatchEvent(new CustomEvent('delegation-updated'));
            const navLinks = document.getElementById('navLinks');
            if (navLinks) {
                await refreshHeader(navLinks);
            }

            // Close notification panel on mobile after successful action
            closeNotifications();
        } catch (error) {
            showToast('Erro na ação', error.message || 'Erro ao atualizar convite.', 'error');
        } finally {
            setActionLoading(trigger, false);
        }
    };

    const initHeader = async () => {
        const hamburgerMenu = document.getElementById('hamburgerMenu');
        const navLinks = document.getElementById('navLinks');

        if (!hamburgerMenu || !navLinks || hamburgerMenu.dataset.initialized === 'true') {
            return;
        }

        hamburgerMenu.dataset.initialized = 'true';
        await refreshHeader(navLinks);

        hamburgerMenu.addEventListener('click', function(event) {
            event.stopPropagation();
            const isOpen = hamburgerMenu.classList.toggle('active');
            navLinks.classList.toggle('active', isOpen);
            hamburgerMenu.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
        });

        navLinks.addEventListener('click', function(event) {
            event.stopPropagation();
        });

        document.addEventListener('click', function(event) {
            const utility = document.querySelector('[data-notification-root]');
            if (utility && utility.contains(event.target)) {
                return;
            }

            if (!hamburgerMenu.contains(event.target) && !navLinks.contains(event.target)) {
                closeHamburgerMenu(hamburgerMenu, navLinks);
            }
            closeNotifications();
        });

        document.addEventListener('keydown', function(event) {
            if (event.key === 'Escape') {
                closeHamburgerMenu(hamburgerMenu, navLinks);
                closeNotifications();
            }
        });

        window.addEventListener('resize', function() {
            if (window.innerWidth > 860) {
                closeHamburgerMenu(hamburgerMenu, navLinks);
            }
        });

        document.addEventListener('click', async function(event) {
            const toggle = event.target.closest('[data-notification-toggle]');
            if (toggle) {
                event.stopPropagation();
                const root = toggle.closest('[data-notification-root]');
                const isOpen = root.classList.toggle('is-open');
                toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
                return;
            }

            const actionButton = event.target.closest('[data-notification-action]');
            if (actionButton) {
                const card = actionButton.closest('[data-notification-id]');
                if (!card) {
                    return;
                }

                await handleNotificationResponse(
                    card.dataset.notificationId,
                    actionButton.dataset.notificationAction,
                    actionButton
                );
                return;
            }

            const readButton = event.target.closest('[data-notification-read]');
            if (readButton) {
                const token = getValidToken();
                if (!token) return;
                const id = readButton.getAttribute('data-notification-read');
                setActionLoading(readButton, true);
                await fetch(`/api/notifications/${id}/read`, {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                await fetchStoredNotifications();
                renderNotifications(headerContext || getStoredAuthContext(), notificationsCache);
                showToast('Notificação atualizada', 'Marcada como lida.', 'success');
                return;
            }

            const readAllButton = event.target.closest('[data-notification-read-all]');
            if (readAllButton) {
                const token = getValidToken();
                if (!token) return;
                setActionLoading(readAllButton, true);
                await fetch('/api/notifications/read-all', {
                    method: 'PATCH',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                await fetchStoredNotifications();
                renderNotifications(headerContext || getStoredAuthContext(), notificationsCache);
                showToast('Central atualizada', 'Todas as notificações foram marcadas como lidas.', 'success');
            }
        });

        navLinks.querySelectorAll('a').forEach((link) => {
            link.addEventListener('click', function() {
                closeHamburgerMenu(hamburgerMenu, navLinks);
            });
        });

        document.addEventListener('delegation-updated', async () => {
            await refreshHeader(navLinks);
        });

        document.addEventListener('auth-context-updated', async () => {
            await refreshHeader(navLinks);
        });
    };

    const loadInclude = async (src) => {
        const tries = [('/' + src).replace(/\\/g, '/'), src];

        for (const path of tries) {
            try {
                const res = await fetch(path);
                if (!res.ok) continue;

                const data = await res.text();
                const el = document.querySelector(`include[src="${src}"]`);

                if (el) {
                    const wrapper = document.createElement('div');
                    wrapper.innerHTML = data;
                    const fragment = document.createDocumentFragment();

                    while (wrapper.firstChild) {
                        fragment.appendChild(wrapper.firstChild);
                    }

                    el.replaceWith(fragment);
                }

                if (src === 'header.html') {
                    initHeader();
                }

                return true;
            } catch (err) {
                // continue to next try
            }
        }

        console.error(`Failed to load include: ${src} (tried absolute and relative paths)`);
        return false;
    };

    Promise.all([
        loadInclude('header.html'),
        loadInclude('footer.html')
    ]);
});
