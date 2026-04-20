const portalConfigs = {
    admin: {
        allowedRoles: ['admin', 'teacher', 'coordinator', 'press'],
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
            { href: 'dashboard.html', title: 'Abrir painel operacional', text: 'Gerencie comitês, respostas pendentes e distribuição de países.' },
            { href: 'blog.html', title: 'Gerenciar blog', text: 'Acompanhe a área de comunicados e a visibilidade dos conteúdos publicados.' },
            { href: 'create-post.html', title: 'Criar comunicado', text: 'Acesse a área reservada para publicar avisos e conteúdos oficiais.' },
            { href: 'profile.html', title: 'Ver meu perfil', text: 'Consulte seus dados e sua função dentro da MaxOnu 2026.' }
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
            { href: 'dashboard.html', title: 'Abrir painel da coordenação', text: 'Use o painel para consultar inscritos, responder perguntas e ajustar países.' },
            { href: 'delegacoes.html', title: 'Ver delegações públicas', text: 'Acompanhe a experiência pública disponível no site para validar comunicações.' },
            { href: 'guias.html', title: 'Consultar guias', text: 'Revise materiais e referências que apoiam a operação e a orientação das equipes.' },
            { href: 'profile.html', title: 'Ver meu perfil', text: 'Confira rapidamente sua identificação, comitê e dados vinculados.' }
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
            { href: 'dashboard.html', title: 'Abrir painel dos orientadores', text: 'Consulte alunos, países e perguntas pendentes ligadas à preparação.' },
            { href: 'delegacoes.html', title: 'Acompanhar delegações', text: 'Veja a área pública das delegações e mantenha o alinhamento com seus alunos.' },
            { href: 'perguntas-comuns.html', title: 'Monitorar dúvidas públicas', text: 'Acompanhe as perguntas comuns que impactam a preparação dos participantes.' },
            { href: 'profile.html', title: 'Ver meu perfil', text: 'Consulte seus dados pessoais, função e referências da sua área.' }
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
            { href: 'blog.html', title: 'Acompanhar blog', text: 'Veja a área de comunicados e mantenha a comunicação centralizada.' },
            { href: 'create-post.html', title: 'Criar publicação', text: 'Acesse a área reservada para montar novos comunicados e atualizações.' },
            { href: 'imprensa.html', title: 'Página pública da imprensa', text: 'Revise a apresentação pública da equipe e sua presença institucional.' },
            { href: 'instagram.html', title: 'Canal do Instagram', text: 'Use a página do canal para alinhar a navegação e a presença social oficial.' }
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
    if (!token) {
        window.location.href = '/login.html';
        return null;
    }

    const context = await window.MaxOnuSession?.getAuthContext?.();
    if (!context?.user) {
        window.location.href = '/login.html';
        return null;
    }

    return context.user;
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
    const emailOptionalCheckbox = document.getElementById('emailOptional');

    if (!form || !emailInput) return;

    // Set email as required by default
    emailInput.setAttribute('required', '');

    // Handle email optional checkbox
    if (emailOptionalCheckbox) {
        emailOptionalCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                emailInput.removeAttribute('required');
                emailInput.value = '';
                emailInput.style.opacity = '0.6';
            } else {
                emailInput.setAttribute('required', '');
                emailInput.style.opacity = '1';
            }
        });
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!message) return;

        const fullName = document.getElementById('newUserFullName')?.value.trim();
        const email = document.getElementById('newUserEmail')?.value.trim();
        const password = document.getElementById('newUserPassword')?.value;
        const role = document.getElementById('newUserRole')?.value;
        const emailIsOptional = emailOptionalCheckbox?.checked;

        if (!fullName || (!email && !emailIsOptional) || !password || !role) {
            message.style.display = 'block';
            message.textContent = 'Preencha todos os campos obrigatórios para criar um usuário.';
            message.className = 'form-message is-error';
            return;
        }

        try {
            const response = await fetch('/api/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({ fullName, email: email || null, password, role })
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Não foi possível criar o usuário.');
            }

            form.reset();
            if (emailOptionalCheckbox) {
                emailOptionalCheckbox.checked = false;
            }
            emailInput.setAttribute('required', '');
            emailInput.style.opacity = '1';
            message.style.display = 'block';
            message.textContent = `Usuário ${data.user.fullName} criado com sucesso!`;
            message.className = 'form-message is-success';
        } catch (error) {
            message.style.display = 'block';
            message.textContent = error.message || 'Erro ao criar usuário.';
            message.className = 'form-message is-error';
        }
    });
}

async function initRolePortal() {
    const portalRole = document.body.dataset.portalRole;
    const config = portalConfigs[portalRole];

    if (!config) {
        return;
    }

    try {
        const user = await fetchCurrentUser();
        if (!user) {
            return;
        }

        if (!config.allowedRoles.includes(user.role)) {
            if (user.role === 'candidate') {
                window.location.href = '/profile.html';
            } else if (user.role === 'admin') {
                window.location.href = '/admin.html';
            } else if (user.role === 'coordinator') {
                window.location.href = '/coordenacao.html';
            } else if (user.role === 'teacher') {
                window.location.href = '/orientadores.html';
            } else if (user.role === 'press') {
                window.location.href = '/imprensa-dashboard.html';
            } else {
                window.location.href = '/profile.html';
            }
            return;
        }

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
        console.error('Erro ao carregar portal:', error);
        document.getElementById('portalLead').textContent = 'Nao foi possivel carregar este portal agora.';
    }
}

document.addEventListener('DOMContentLoaded', initRolePortal);
