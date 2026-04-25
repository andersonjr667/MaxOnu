document.addEventListener('DOMContentLoaded', function() {
    let headerContext = null;
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
            console.warn('[DEBUG] Nenhum token válido para buscar contexto fresco.');
            return null;
        }

        try {
            console.log('[DEBUG] Buscando contexto fresco do servidor (/api/me)...');
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
            console.log('[DEBUG] Usuário recebido do servidor:', user);
            console.log('[DEBUG] Role recebida:', user.role);
            localStorage.setItem('role', user.role || 'candidate');
            console.log('[DEBUG] Role armazenada em localStorage:', localStorage.getItem('role'));

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

        console.log('[DEBUG] getAuthContext chamado. forceRefresh:', forceRefresh);

        if (!forceRefresh) {
            const cached = readAuthContextCache();
            if (cached) {
                console.log('[DEBUG] ✓ Contexto obtido do cache (sessão)');
                return cached;
            }
        }

        if (!forceRefresh && authContextPromise) {
            console.log('[DEBUG] ✓ Contexto sendo carregado (promise em andamento)');
            return authContextPromise;
        }

        console.log('[DEBUG] → Buscando contexto fresco do servidor...');
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

    const renderNotifications = (context) => {
        const utilities = document.querySelector('[data-header-utilities]');
        if (!utilities) {
            return;
        }

        const pendingNotifications = context?.delegationStatus?.notifications?.filter((item) => item.status === 'pending') || [];
        if (!context || !pendingNotifications.length) {
            utilities.innerHTML = '';
            return;
        }

        utilities.innerHTML = `
            <div class="notification-root" data-notification-root>
                <button type="button" class="notification-toggle" data-notification-toggle aria-label="Abrir convites pendentes" aria-expanded="false">
                    <span class="notification-toggle-icon" aria-hidden="true">&#9993;</span>
                    <span class="notification-badge">${pendingNotifications.length}</span>
                </button>
                <div class="notification-panel" data-notification-panel>
                    <div class="notification-panel-header">
                        <strong>Convites pendentes</strong>
                        <span>${pendingNotifications.length}</span>
                    </div>
                    <div class="notification-list">
                        ${pendingNotifications.map((notification) => {
                            const inviterName = notification.fromFullName || notification.fromUsername;
                            const inviterClass = parseClassGroup(notification.fromClassGroup);
                            return `
                            <article class="notification-card" data-notification-id="${notification.id}">
                                <p>
                                    <strong>${inviterName}</strong> convidou você para integrar uma delegação com ${notification.teamSize} participantes.
                                    <br>Nome: ${inviterName}
                                    <br>Unidade: ${inviterClass.unit}
                                    <br>Série: ${inviterClass.grade}
                                </p>
                                <div class="notification-actions">
                                    <button type="button" class="view-button" data-notification-action="accept">Aceitar</button>
                                    <button type="button" class="delete-button" data-notification-action="reject">Recusar</button>
                                </div>
                            </article>
                        `;
                        }).join('')}
                    </div>
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

    const refreshHeader = async (navLinks) => {
        const immediateContext = getStoredAuthContext();
        if (immediateContext) {
            renderHeaderAuth(navLinks, immediateContext);
        } else {
            renderHeaderAuth(navLinks, null);
        }

        headerContext = await getAuthContext({ forceRefresh: true });
        renderNotifications(headerContext || immediateContext);
        renderHeaderAuth(navLinks, headerContext || immediateContext);
        setActiveLinks(navLinks);
    };

    const handleNotificationResponse = async (notificationId, action, trigger) => {
        const token = getValidToken();
        if (!token) {
            logout();
            return;
        }

        trigger.disabled = true;

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

            if (window.MaxOnuSession?.refreshAuthContext) {
                await window.MaxOnuSession.refreshAuthContext();
            }

            document.dispatchEvent(new CustomEvent('delegation-updated'));
            const navLinks = document.getElementById('navLinks');
            if (navLinks) {
                await refreshHeader(navLinks);
            }
        } catch (error) {
            alert(error.message || 'Erro ao atualizar convite.');
        } finally {
            trigger.disabled = false;
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
            if (!actionButton) {
                return;
            }

            const card = actionButton.closest('[data-notification-id]');
            if (!card) {
                return;
            }

            await handleNotificationResponse(
                card.dataset.notificationId,
                actionButton.dataset.notificationAction,
                actionButton
            );
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
