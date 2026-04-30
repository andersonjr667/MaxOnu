const portalConfigs = {
    admin: {
        allowedRoles: ['admin'],
        title: 'Portal Administrativo',
        badge: 'Administrador',
        lead: 'Controle completo sobre consultas, distribuição de países, acompanhamento operacional e comunicação oficial.',
        summary: (user) => [
            { title: 'Função ativa', text: 'Administrador' },
            { title: 'Comitê vinculado', text: user.committee ?? 'Acesso global' },
            { title: 'País visível', text: user.country || 'Sem restrição operacional' },
            { title: 'Permissões', text: 'Gestão total, consultas, exportações e conteúdo.' }
        ],
        actions: [
            { href: '/dashboard', title: 'Abrir painel operacional', text: 'Gerencie comitês, respostas pendentes e distribuição de países.' },
            { href: '/verificacao-usuarios', title: 'Verificar usuários', text: 'Consulte a lista de alunos e expanda cada nome para ver todos os dados cadastrados.' },
            { href: '/blog', title: 'Gerenciar blog', text: 'Acompanhe a área de comunicados e a visibilidade dos conteúdos publicados.' },
{ href: '/create-post', title: 'Criar comunicado', text: 'Acesse a área reservada para publicar avisos e conteúdos oficiais.' },
            { href: '/imprensa-faq', title: 'Gerenciar FAQ', text: 'Responda e gerencie as perguntas frequentes enviadas pelos participantes no site.' },
            { href: '/profile', title: 'Ver meu perfil', text: 'Consulte seus dados e sua função dentro da MaxOnu 2026.' }
        ]
    },
    coordinator: {
        allowedRoles: ['coordinator', 'admin', 'teacher', 'press'],
        title: 'Portal da Coordenação',
        badge: 'Coordenação',
        lead: 'Espaço para acompanhar comitês, distribuir países e manter o evento organizado com visão ampla da operação.',
        summary: (user) => [
            { title: 'Função ativa', text: 'Coordenação' },
            { title: 'Comitê vinculado', text: user.committee ?? 'Acompanhamento geral' },
            { title: 'País visível', text: user.country || 'Conforme a operação' },
            { title: 'Permissões', text: 'Consulta ampla, distribuição e apoio operacional.' }
        ],
        actions: [
            { href: '/dashboard', title: 'Abrir painel da coordenação', text: 'Use o painel para consultar inscritos, responder perguntas e ajustar países.' },
            { href: '/verificacao-usuarios', title: 'Verificar usuários', text: 'Confira os alunos cadastrados e abra os detalhes completos de cada participante.' },
            { href: '/delegacoes', title: 'Ver delegações públicas', text: 'Acompanhe a experiência pública disponível no site para validar comunicações.' },
            { href: '/guias', title: 'Consultar guias', text: 'Revise materiais e referências que apoiam a operação e a orientação das equipes.' },
            { href: '/profile', title: 'Ver meu perfil', text: 'Confira rapidamente sua identificação, comitê e dados vinculados.' }
        ]
    },
    teacher: {
        allowedRoles: ['teacher', 'admin', 'coordinator', 'press'],
        title: 'Portal dos Professores Orientadores',
        badge: 'Orientação',
        lead: 'Área pensada para professores orientadores consultarem comitês, países atribuídos e materiais de acompanhamento.',
        summary: (user) => [
            { title: 'Função ativa', text: 'Professor orientador' },
            { title: 'Comitê vinculado', text: user.committee ?? 'Sem vínculo definido' },
            { title: 'País visível', text: user.country || 'Ainda não definido' },
            { title: 'Permissões', text: 'Consulta de comitês e acompanhamento das delegações.' }
        ],
        actions: [
            { href: '/dashboard', title: 'Abrir painel dos orientadores', text: 'Consulte alunos, países e perguntas pendentes ligadas à preparação.' },
            { href: '/verificacao-usuarios', title: 'Verificar usuários', text: 'Abra os dados completos dos alunos para acompanhar cadastro, turma e inscrição.' },
            { href: '/delegacoes', title: 'Acompanhar delegações', text: 'Veja a área pública das delegações e mantenha o alinhamento com seus alunos.' },
            { href: '/faq', title: 'Monitorar dúvidas públicas', text: 'Acompanhe as perguntas comuns que impactam a preparação dos participantes.' },
            { href: '/profile', title: 'Ver meu perfil', text: 'Consulte seus dados pessoais, função e referências da sua área.' }
        ]
    },
    press: {
        allowedRoles: ['press', 'admin', 'teacher', 'coordinator'],
        title: 'Portal da Imprensa',
        badge: 'Imprensa',
        lead: 'Hub de comunicação para cobertura, divulgação oficial, blog e presença digital da equipe de imprensa.',
        summary: (user) => [
            { title: 'Função ativa', text: 'Equipe de imprensa' },
            { title: 'Canal principal', text: 'Blog e páginas públicas da MaxOnu' },
            { title: 'Comitê vinculado', text: user.committee ?? 'Cobertura geral' },
            { title: 'Permissões', text: 'Comunicação, cobertura e organização de conteúdo.' }
],
        actions: [
            { href: '/blog', title: 'Acompanhar blog', text: 'Veja a área de comunicados e mantenha a comunicação centralizada.' },
            { href: '/create-post', title: 'Criar publicação', text: 'Acesse a área reservada para montar novos comunicados e atualizações.' },
            { href: '/imprensa-faq', title: 'Gerenciar FAQ', text: 'Responda e gerencie as perguntas frequentes enviadas pelos participantes no site.' },
            { href: '/imprensa', title: 'Página pública da imprensa', text: 'Revise a apresentação pública da equipe e sua presença institucional.' },
            { href: 'https://www.instagram.com/maxonu26', title: 'Canal do Instagram', text: 'Acesse o perfil oficial da MaxOnu 2026 no Instagram.' }
        ]
    }
};

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

async function fetchCurrentUser() {
    const token = window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    console.log('[DEBUG] Token disponível:', !!token);
    
    if (!token) {
        console.error('[AUTH] Nenhum token encontrado. Redirecionando para login.');
        window.location.href = '/login';
        return null;
    }

    try {
        const context = await window.MaxOnuSession?.getAuthContext?.();
        console.log('[DEBUG] Context obtido:', context);
        console.log('[DEBUG] User role:', context?.user?.role);
        
        if (!context?.user) {
            console.error('[AUTH] Contexto de usuário inválido. Context:', context);
            window.location.href = '/login';
            return null;
        }

        return context.user;
    } catch (error) {
        console.error('[AUTH] Erro ao obter contexto de usuário:', error);
        window.location.href = '/login';
        return null;
    }
}

function renderPortalSummary(user, config) {
    const summary = document.getElementById('portalSummary');
    summary.innerHTML = config.summary(user).map((item) => `
        <article class="feature-card ${item.title === 'Permissões' ? 'blue-accent' : ''}">
            <h3>${item.title}</h3>
            <p>${item.text}</p>
        </article>
    `).join('');
}

function renderPortalActions(config) {
    const actions = document.getElementById('portalActions');
    actions.innerHTML = config.actions.map((action) => `
        <a href="${action.href}" class="portal-action-card">
            <h3>${action.title}</h3>
            <p>${action.text}</p>
            <span class="portal-action-link">Abrir área</span>
        </a>
    `).join('');
}

function renderAdminUserCreator() {
    const createPanel = document.getElementById('adminUserCreatePanel');
    if (!createPanel) return;

    const message = document.getElementById('createUserMessage');
    const form = document.getElementById('createUserForm');
    const emailInput = document.getElementById('newUserEmail');
    const passwordInput = document.getElementById('newUserPassword');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitButton = form?.querySelector('button[type="submit"]');

    if (!form || !emailInput || !passwordInput || !confirmPasswordInput) return;

    // Validação em tempo real de senhas
    const validatePasswords = () => {
        if (passwordInput.value && confirmPasswordInput.value) {
            if (passwordInput.value !== confirmPasswordInput.value) {
                confirmPasswordInput.style.borderColor = '#d1495b';
                confirmPasswordInput.style.boxShadow = '0 0 0 4px rgba(209, 73, 91, 0.14)';
                return false;
            } else {
                confirmPasswordInput.style.borderColor = '';
                confirmPasswordInput.style.boxShadow = '';
                return true;
            }
        }
        return true;
    };

    passwordInput.addEventListener('input', validatePasswords);
    confirmPasswordInput.addEventListener('input', validatePasswords);

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!message) return;
        const originalText = submitButton?.textContent || '✓ Criar usuário';

        const fullName = document.getElementById('newUserFullName')?.value.trim();
        const email = document.getElementById('newUserEmail')?.value.trim();
        const password = document.getElementById('newUserPassword')?.value;
        const confirmPassword = document.getElementById('confirmPassword')?.value;
        const role = document.getElementById('newUserRole')?.value;

        // Validações
        if (!fullName) {
            message.hidden = false;
            message.textContent = '⚠ Nome completo é obrigatório.';
            message.className = 'form-message is-error';
            return;
        }

        if (!password || password.length < 6) {
            message.hidden = false;
            message.textContent = '⚠ Senha deve ter no mínimo 6 caracteres.';
            message.className = 'form-message is-error';
            return;
        }

        if (password !== confirmPassword) {
            message.hidden = false;
            message.textContent = '⚠ As senhas não correspondem. Verifique e tente novamente.';
            message.className = 'form-message is-error';
            confirmPasswordInput.focus();
            return;
        }

        if (!role) {
            message.hidden = false;
            message.textContent = '⚠ Selecione uma função para o usuário.';
            message.className = 'form-message is-error';
            return;
        }

        // Validar email apenas se fornecido
        if (email) {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                message.hidden = false;
                message.textContent = '⚠ Email inválido. Verifique o formato.';
                message.className = 'form-message is-error';
                return;
            }
        }

        try {
            if (submitButton) submitButton.disabled = true;
            if (submitButton) submitButton.textContent = '⏳ Criando...';

            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${window.MaxOnuSession?.getToken?.() || localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    fullName,
                    password,
                    role,
                    ...(email ? { email } : {})
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                console.error('[CREATE USER] Falha ao criar usuário:', {
                    status: response.status,
                    data,
                    payload: {
                        fullName,
                        role,
                        hasEmail: Boolean(email)
                    }
                });
                const errorMessage = Array.isArray(data.error)
                    ? data.error[0]?.msg
                    : data.error;
                throw new Error(errorMessage || 'Não foi possível criar o usuário.');
            }

            form.reset();
            confirmPasswordInput.style.borderColor = '';
            confirmPasswordInput.style.boxShadow = '';
            message.hidden = false;
            message.textContent = `✓ Usuário ${data.user.fullName} criado com sucesso! Ele pode fazer login agora.`;
            message.className = 'form-message is-success';
            
            // Limpar mensagem após 5 segundos
            setTimeout(() => {
                message.hidden = true;
            }, 5000);
        } catch (error) {
            message.hidden = false;
            message.textContent = `✕ ${error.message || 'Erro ao criar usuário.'}`;
            message.className = 'form-message is-error';
        } finally {
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = originalText || '✓ Criar usuário';
            }
        }
    });
}

async function initRolePortal() {
    const portalRole = document.body.dataset.portalRole;
    const config = portalConfigs[portalRole];

    console.log('[DEBUG] Portal Role esperado:', portalRole);
    console.log('[DEBUG] Config encontrado:', !!config);

    if (!config) {
        console.error('[AUTH] Nenhuma configuração encontrada para o portal:', portalRole);
        return;
    }

    try {
        // Força refresh do contexto de autenticação para portais restritos
        const forceRefresh = portalRole === 'admin';
        const user = await (async () => {
            const token = window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
            console.log('[DEBUG] Token disponível:', !!token);
            
            if (!token) {
                console.error('[AUTH] Nenhum token encontrado. Redirecionando para login.');
                window.location.href = '/login';
                return null;
            }

            try {
                const context = await window.MaxOnuSession?.getAuthContext?.({ forceRefresh });
                console.log('[DEBUG] Context obtido:', context);
                console.log('[DEBUG] User role:', context?.user?.role);
                
                if (!context?.user) {
                    console.error('[AUTH] Contexto de usuário inválido. Context:', context);
                    window.location.href = '/login';
                    return null;
                }

                return context.user;
            } catch (error) {
                console.error('[AUTH] Erro ao obter contexto de usuário:', error);
                window.location.href = '/login';
                return null;
            }
        })();
        console.log('[DEBUG] Usuário obtido:', user);
        
        if (!user) {
            console.error('[AUTH] Usuário não encontrado. Abortando inicialização.');
            return;
        }

        console.log('[DEBUG] Role do usuário:', user.role);
        console.log('[DEBUG] Roles permitidas:', config.allowedRoles);
        console.log('[DEBUG] Usuário autorizado?', config.allowedRoles.includes(user.role));

        if (!config.allowedRoles.includes(user.role)) {
            console.warn('[AUTH] Usuário não autorizado. Role:', user.role, 'Roles permitidas:', config.allowedRoles);
            
            if (user.role === 'candidate') {
                window.location.href = '/profile';
            } else if (user.role === 'admin') {
                window.location.href = '/admin';
            } else if (user.role === 'coordinator') {
                window.location.href = '/coordenacao';
            } else if (user.role === 'teacher') {
                window.location.href = '/orientadores';
            } else if (user.role === 'press') {
                window.location.href = '/imprensa-dashboard';
            } else {
                window.location.href = '/profile';
            }
            return;
        }

        console.log('[AUTH] ✓ Usuário autorizado. Renderizando portal...');

        document.getElementById('portalTitle').textContent = config.title;
        document.getElementById('portalLead').textContent = `${config.lead} ${getRoleLabel(user.role)} autenticado como ${user.fullName || user.username}.`;

        const badge = document.getElementById('portalBadge');
        badge.textContent = getRoleLabel(user.role);
        badge.dataset.role = user.role;

        renderPortalSummary(user, config);
        renderPortalActions(config);
        if (user.role === 'admin') {
            renderAdminUserCreator();
        }
    } catch (error) {
        console.error('[AUTH] Erro ao carregar portal:', error);
        document.getElementById('portalLead').textContent = 'Nao foi possivel carregar este portal agora.';
    }
}

document.addEventListener('DOMContentLoaded', initRolePortal);
