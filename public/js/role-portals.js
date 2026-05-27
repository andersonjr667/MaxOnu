const portalConfigs = {
    admin: {
        allowedRoles: ['admin'],
        title: 'Portal Administrativo',
        lead: 'Gerencie usuários, permissões e configurações da plataforma.',

        summary(user) {
            return [
                {
                    title: 'Usuário',
                    text: user.fullName || user.username || 'Administrador'
                },
                {
                    title: 'Permissões',
                    text: 'Acesso total ao sistema administrativo.'
                },
                {
                    title: 'Função',
                    text: 'Administrador principal da plataforma.'
                }
            ];
        },

        actions: [
            {
                title: 'Painel Operacional',
                text: 'Abrir painel operacional.',
                href: '/dashboard'
            },
            {
                title: 'Gerência de Delegações',
                text: 'Gerencia comitês, respostas pendentes e distribuição de países.',
                href: '/admin-delegations'
            },
            {
                title: 'Verificar Usuários',
                text: 'Consulta lista de alunos e dados cadastrados.',
                href: '/verificacao-usuarios'
            },
            {
                title: 'Enviar Notificações',
                text: 'Enviar notificações para usuários.',
                href: '/notificacoes-admin'
            },
            {
                title: 'Gerenciar Blog',
                text: 'Gerenciar artigos do blog.',
                href: '/blog'
            },
            {
                title: 'Criar Comunicado',
                text: 'Criar novo comunicado.',
                href: '/create-post'
            },
            {
                title: 'Gerenciar FAQ',
                text: 'Gerenciar perguntas frequentes.',
                href: '/imprensa-faq'
            },
            {
                title: 'Meu Perfil',
                text: 'Ver meu perfil.',
                href: '/profile'
            }
        ]
    },

    coordinator: {
        allowedRoles: ['coordinator', 'admin'],
        title: 'Portal da Coordenação',
        lead: 'Área responsável pela coordenação geral.',

        summary(user) {
            return [
                {
                    title: 'Usuário',
                    text: user.fullName || user.username
                },
                {
                    title: 'Permissões',
                    text: 'Gerenciamento de delegados e eventos.'
                },
                {
                    title: 'Função',
                    text: 'Coordenação.'
                }
            ];
        },

        actions: [
            {
                title: 'Coordenação',
                text: 'Gerenciar atividades.',
                href: '/coordenacao'
            }
        ]
    },

    teacher: {
        allowedRoles: ['teacher', 'admin'],
        title: 'Portal dos Orientadores',
        lead: 'Área destinada aos professores orientadores.',

        summary(user) {
            return [
                {
                    title: 'Usuário',
                    text: user.fullName || user.username
                },
                {
                    title: 'Permissões',
                    text: 'Acompanhamento de alunos.'
                },
                {
                    title: 'Função',
                    text: 'Professor orientador.'
                }
            ];
        },

        actions: [
            {
                title: 'Orientadores',
                text: 'Acompanhar delegados.',
                href: '/orientadores'
            }
        ]
    },

    press: {
        allowedRoles: ['press', 'admin'],
        title: 'Portal da Imprensa',
        lead: 'Área da equipe de imprensa e comunicação.',

        summary(user) {
            return [
                {
                    title: 'Usuário',
                    text: user.fullName || user.username
                },
                {
                    title: 'Permissões',
                    text: 'Produção de conteúdo e comunicação.'
                },
                {
                    title: 'Função',
                    text: 'Equipe de imprensa.'
                }
            ];
        },

        actions: [
            {
                title: 'Imprensa',
                text: 'Gerenciar comunicação.',
                href: '/imprensa-dashboard'
            }
        ]
    },

    candidate: {
        allowedRoles: [
            'candidate',
            'admin',
            'teacher',
            'coordinator',
            'press'
        ],

        title: 'Portal do Participante',
        lead: 'Área do participante da plataforma.',

        summary(user) {
            return [
                {
                    title: 'Usuário',
                    text: user.fullName || user.username
                },
                {
                    title: 'Permissões',
                    text: 'Acesso ao perfil e inscrição.'
                },
                {
                    title: 'Função',
                    text: 'Participante.'
                }
            ];
        },

        actions: [
            {
                title: 'Meu Perfil',
                text: 'Visualizar perfil.',
                href: '/profile'
            },
            {
                title: 'Inscrição',
                text: 'Gerenciar inscrição.',
                href: '/inscricao'
            }
        ]
    }
};

/* =========================
   HELPERS
========================= */

function getToken() {
    const token = localStorage.getItem('token');

    if (
        !token ||
        token === 'null' ||
        token === 'undefined' ||
        token.trim() === ''
    ) {
        return null;
    }

    return token;
}

function clearSession() {
    if (window.MaxOnuSession?.clearAuth) {
        window.MaxOnuSession.clearAuth();
        return;
    }
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('userId');
    localStorage.removeItem('isAdmin');
}

function redirectToLogin() {
    clearSession();

    const currentPath = window.location.pathname;

    if (
        currentPath !== '/login' &&
        currentPath !== '/login.html'
    ) {
        window.location.href = '/login';
    }
}

function redirectToPortal(role) {
    const redirectMap = {
        candidate: '/profile',
        admin: '/admin',
        coordinator: '/coordenacao',
        teacher: '/orientadores',
        press: '/imprensa-dashboard'
    };

    const target = redirectMap[role] || '/profile';

    if (
        window.location.pathname !== target &&
        window.location.pathname !== `${target}.html`
    ) {
        window.location.href = target;
    }
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/* =========================
   API
========================= */

async function apiFetch(url, options = {}) {
    try {
        const token = getToken();

        console.log('[DEBUG] Token disponível:', !!token);

        if (!token) {
            console.error('[AUTH] Token ausente');
            redirectToLogin();
            return null;
        }

        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
                ...(options.headers || {})
            }
        });

        console.log('[DEBUG] Status resposta API:', response.status);

        if (response.status === 401) {
            console.error('[AUTH] Token expirado');
            redirectToLogin();
            return null;
        }

        return response;

    } catch (error) {
        console.error('[API] Erro:', error);
        return null;
    }
}

/* =========================
   USER
========================= */

async function fetchCurrentUser() {
    try {
        console.log('[DEBUG] Iniciando fetchCurrentUser');

        const response = await apiFetch('/api/me');

        if (!response) {
            console.error('[AUTH] Response nulo');
            return null;
        }

        const data = await response.json();

        console.log('[DEBUG] Dados recebidos /api/me:', data);

        if (!response.ok) {
            console.error('[AUTH] /api/me falhou');
            return null;
        }

        const user = data.user || data;

        console.log('[DEBUG] Usuário final:', user);

        if (!user || typeof user !== 'object') {
            console.error('[AUTH] Contexto inválido:', user);
            return null;
        }

        if (!user.role) {
            console.error('[AUTH] Role indefinida:', user);
            return null;
        }

        localStorage.setItem('role', user.role);

        if (user.id) {
            localStorage.setItem('userId', user.id);
        }

        return user;

    } catch (error) {
        console.error('[AUTH] Erro ao buscar usuário:', error);
        return null;
    }
}

/* =========================
   RENDER
========================= */

function renderPortalSummary(user, config) {
    const summary = document.getElementById('portalSummary');

    if (!summary) return;

    summary.innerHTML = config.summary(user).map((item) => `
        <article class="feature-card ${item.title === 'Permissões' ? 'blue-accent' : ''}">
            <h3>${escapeHtml(item.title)}</h3>
            <p>${escapeHtml(item.text)}</p>
        </article>
    `).join('');
}

function renderPortalActions(config) {
    const actions = document.getElementById('portalActions');

    if (!actions) return;

    actions.innerHTML = config.actions.map((action) => `
        <a href="${escapeHtml(action.href)}" class="portal-action-card">
            <h3>${escapeHtml(action.title)}</h3>
            <p>${escapeHtml(action.text)}</p>
            <span class="portal-action-link">
                Abrir área
            </span>
        </a>
    `).join('');
}

function getRoleLabel(role) {
    const labels = {
        admin: 'Administrador',
        coordinator: 'Coordenação',
        teacher: 'Professor orientador',
        press: 'Imprensa',
        candidate: 'Participante'
    };

    return labels[role] || 'Usuário';
}

/* =========================
   ADMIN CREATE USER
========================= */

function renderAdminUserCreator() {
    const createPanel = document.getElementById('adminUserCreatePanel');

    if (!createPanel) return;

    const form = document.getElementById('createUserForm');
    const message = document.getElementById('createUserMessage');

    if (!form || !message) return;

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const submitButton = form.querySelector('button[type="submit"]');

        const fullName =
            document.getElementById('newUserFullName')?.value?.trim();

        const username =
            document.getElementById('newUserUsername')?.value?.trim();

        const email =
            document.getElementById('newUserEmail')?.value?.trim();

        const password =
            document.getElementById('newUserPassword')?.value;

        const confirmPassword =
            document.getElementById('confirmPassword')?.value;

        const role =
            document.getElementById('newUserRole')?.value;

        const gender =
            document.getElementById('newUserGender')?.value;

        const termsAccepted =
            document.getElementById('newUserTerms')?.checked;

        if (!fullName) {
            message.hidden = false;
            message.className = 'form-message is-error';
            message.textContent = 'Nome obrigatório.';
            return;
        }

        if (!password || password.length < 6) {
            message.hidden = false;
            message.className = 'form-message is-error';
            message.textContent = 'Senha mínima: 6 caracteres.';
            return;
        }

        if (password !== confirmPassword) {
            message.hidden = false;
            message.className = 'form-message is-error';
            message.textContent = 'As senhas não coincidem.';
            return;
        }

        try {
            submitButton.disabled = true;

            const response = await apiFetch('/api/users', {
                method: 'POST',
                body: JSON.stringify({
                    fullName,
                    username,
                    email,
                    password,
                    role,
                    gender,
                    termsAccepted: Boolean(termsAccepted)
                })
            });

            if (!response) {
                throw new Error('Falha na requisição.');
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(
                    Array.isArray(data.error)
                        ? data.error[0]?.msg
                        : data.error || 'Erro ao criar usuário.'
                );
            }

            form.reset();

            message.hidden = false;
            message.className = 'form-message is-success';

            message.textContent =
                `Usuário ${data.user?.fullName || fullName} criado com sucesso.`;

        } catch (error) {
            console.error('[CREATE USER]', error);

            message.hidden = false;
            message.className = 'form-message is-error';

            message.textContent =
                error.message || 'Erro ao criar usuário.';
        } finally {
            submitButton.disabled = false;
        }
    });
}

/* =========================
   INIT
========================= */

async function initRolePortal() {
    try {
        const portalRole = document.body.dataset.portalRole;

        console.log('[DEBUG] Portal Role esperado:', portalRole);

        const config = portalConfigs[portalRole];

        console.log('[DEBUG] Config encontrado:', !!config);

        if (!config) {
            console.error(
                '[PORTAL] Configuração não encontrada:',
                portalRole
            );

            redirectToPortal('candidate');
            return;
        }

        const user = await fetchCurrentUser();

        console.log('[DEBUG] Usuário obtido:', user);

        if (!user) {
            console.error(
                '[AUTH] Usuário não encontrado. Abortando inicialização.'
            );
            redirectToLogin();
            return;
        }

        console.log('[DEBUG] User role:', user.role);

        if (!config.allowedRoles.includes(user.role)) {
            console.warn(
                '[AUTH] Usuário sem permissão:',
                user.role
            );

            redirectToPortal(user.role);
            return;
        }

        const titleEl =
            document.getElementById('portalTitle');

        const leadEl =
            document.getElementById('portalLead');

        const badgeEl =
            document.getElementById('portalBadge');

        if (titleEl) {
            titleEl.textContent = config.title;
        }

        if (leadEl) {
            leadEl.textContent =
                `${config.lead} ${getRoleLabel(user.role)} autenticado como ${user.fullName || user.username}.`;
        }

        if (badgeEl) {
            badgeEl.textContent = getRoleLabel(user.role);
            badgeEl.dataset.role = user.role;
        }

        renderPortalSummary(user, config);
        renderPortalActions(config);

        if (user.role === 'admin') {
            renderAdminUserCreator();
        }

        console.log('[PORTAL] Inicializado com sucesso');

    } catch (error) {
        console.error('[PORTAL] Erro fatal:', error);
        redirectToLogin();
    }
}

document.addEventListener('DOMContentLoaded', initRolePortal);