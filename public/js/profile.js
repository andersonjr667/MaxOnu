function getProfileRoleDetails(user) {
    const role = user.role || 'candidate';

    const descriptions = {
        teacher: `
            <div class="role-preview-grid">
                <div class="role-preview-card">
                    <h3>Portal dos orientadores</h3>
                    <p>Use sua área exclusiva para consultar comitês, acompanhar delegações e orientar os participantes.</p>
                    <a href="/orientadores" class="view-button">Abrir portal</a>
                </div>
                <div class="role-preview-card">
                    <h3>Painel operacional</h3>
                    <p>Seu painel permite consultar os alunos alocados em cada comitê e seus respectivos países.</p>
                    <a href="/dashboard" class="view-button">Abrir painel</a>
                </div>
            </div>
        `,
        coordinator: `
            <div class="role-preview-grid">
                <div class="role-preview-card">
                    <h3>Portal da coordenação</h3>
                    <p>Acesse um hub com atalhos para distribuição, consulta ampla e operação dos comitês.</p>
                    <a href="/coordenacao" class="view-button">Abrir portal</a>
                </div>
                <div class="role-preview-card">
                    <h3>Painel operacional</h3>
                    <p>Coordenação pode visualizar alunos, ajustar países e organizar os comitês da edição 2026.</p>
                    <a href="/dashboard" class="view-button">Abrir painel</a>
                </div>
            </div>
        `,
        admin: `
            <div class="role-preview-grid">
                <div class="role-preview-card">
                    <h3>Portal administrativo</h3>
                    <p>Administradores possuem acesso ao hub completo de operação, conteúdo e gestão de acessos.</p>
                    <a href="/admin" class="view-button">Abrir portal</a>
                </div>
                <div class="role-preview-card">
                    <h3>Painel operacional</h3>
                    <p>Centralize perguntas, comitês, exportações e distribuição de países em um único painel.</p>
                    <a href="/dashboard" class="view-button">Abrir painel</a>
                </div>
            </div>
        `,
        press: `
            <div class="role-preview-grid">
                <div class="role-preview-card">
                    <h3>Portal da imprensa</h3>
                    <p>Central de comunicação com atalhos para blog, cobertura pública e organização de conteúdo.</p>
                    <a href="/imprensa-dashboard" class="view-button">Abrir portal</a>
                </div>
                <div class="role-preview-card">
                    <h3>Publicações</h3>
                    <p>A equipe de imprensa pode acompanhar o blog e a área de criação de conteúdo oficial.</p>
                    <a href="/blog" class="view-button">Abrir blog</a>
                </div>
            </div>
        `
    };

    return descriptions[role] || '';
}

function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

function formatCommitteeChoices(registration) {
    if (!registration?.submittedAt) {
        return 'Inscrição ainda não enviada.';
    }

    return `
        <p><strong>1ª opção:</strong> Comitê ${registration.firstChoice}</p>
        <p><strong>2ª opção:</strong> Comitê ${registration.secondChoice}</p>
        <p><strong>3ª opção:</strong> Comitê ${registration.thirdChoice}</p>
    `;
}

function getRoleLabel(role) {
    const roleLabels = {
        candidate: 'Delegado(a)',
        teacher: 'Professor orientador',
        coordinator: 'Coordenador',
        admin: 'Administrador',
        press: 'Imprensa'
    };

    return roleLabels[role] || 'Usuário';
}

function createEditableCard(title, field, value, options = {}) {
    const {
        type = 'text',
        placeholder = 'Digite um valor',
        emptyText = 'Não informado'
    } = options;

    return `
        <article class="feature-card editable-card">
            <h3>${title}</h3>
            <div class="editable-content">
                <p class="display-text">${value || emptyText}</p>
                <input type="${type}" class="edit-input" value="${value || ''}" style="display: none;" placeholder="${placeholder}">
                <div class="edit-actions" style="display: none;">
                    <button class="save-btn view-button small">Salvar</button>
                    <button class="cancel-btn view-button small secondary">Cancelar</button>
                </div>
                <button class="edit-btn" data-field="${field}" data-empty-text="${emptyText}">Editar</button>
            </div>
        </article>
    `;
}

function bindEditableProfileFields() {
    document.querySelectorAll('.editable-card').forEach((card) => {
        const editBtn = card.querySelector('.edit-btn');
        const displayText = card.querySelector('.display-text');
        const editInput = card.querySelector('.edit-input');
        const editActions = card.querySelector('.edit-actions');
        const saveBtn = card.querySelector('.save-btn');
        const cancelBtn = card.querySelector('.cancel-btn');
        const field = editBtn.dataset.field;
        const emptyText = editBtn.dataset.emptyText || 'Não informado';

        editBtn.addEventListener('click', () => {
            displayText.style.display = 'none';
            editInput.style.display = 'block';
            editActions.style.display = 'flex';
            editBtn.style.display = 'none';
            editInput.focus();
        });

        cancelBtn.addEventListener('click', () => {
            editInput.value = displayText.textContent === emptyText ? '' : displayText.textContent;
            displayText.style.display = 'block';
            editInput.style.display = 'none';
            editActions.style.display = 'none';
            editBtn.style.display = 'inline-block';
        });

        saveBtn.addEventListener('click', async () => {
            const newValue = editInput.value.trim();
            if (!newValue) {
                alert('Campo não pode estar vazio');
                return;
            }

            try {
                const response = await fetch('/api/me', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({ [field]: newValue })
                });

                const data = await parseJson(response);
                if (!response.ok) {
                    throw new Error(data.error || 'Erro ao atualizar');
                }
                alert('Informação atualizada com sucesso!');
                await loadProfile();
            } catch (error) {
                alert('Erro ao atualizar: ' + error.message);
            }
        });
    });
}

function renderCandidatePanels(user, delegationStatus) {
    const registrationPanel = document.getElementById('registrationPanel');
    const delegationPanel = document.getElementById('delegationPanel');
    const registration = delegationStatus?.registration;
    const delegation = delegationStatus?.delegation;
    const teammates = delegation?.members || [];
    const pendingNotifications = delegationStatus?.notifications?.filter((item) => item.status === 'pending') || [];

    registrationPanel.innerHTML = `
        <article class="dashboard-panel candidate-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Inscrição</span>
                <h2>Inscrição realizada</h2>
                <p>${registration?.submittedAt ? 'Sua inscrição já está registrada. Agora você pode acompanhar a formação da delegação e convidar os demais integrantes.' : 'Quando a abertura estiver liberada, faça sua inscrição com as três opções de comitê.'}</p>
            </div>
            <div class="registration-overview">
                ${createEditableCard('Turma', 'classGroup', user.classGroup, { placeholder: 'Digite sua turma', emptyText: 'Não informada' })}
                ${createEditableCard('País', 'country', user.country, { placeholder: 'Digite seu país', emptyText: 'Não designado' })}
                <div class="feature-card">
                    <h3>Formato</h3>
                    <p>${registration?.teamSize === 3 ? '3 integrantes' : '2 integrantes'}</p>
                </div>
                <div class="feature-card">
                    <h3>Status</h3>
                    <p>${registration?.submittedAt ? 'Inscrição enviada' : delegationStatus?.registrationOpen ? 'Aguardando envio' : 'Aguardando abertura'}</p>
                </div>
            </div>
            <div class="content-box registration-choice-box">
                <h3>Preferências de comitê</h3>
                <div class="committee-choice-list">
                    ${formatCommitteeChoices(registration)}
                </div>
            </div>
            <div class="dashboard-question-actions">
                <a href="/inscricao" class="view-button">${registration?.submittedAt ? 'Editar inscrição' : 'Fazer inscrição'}</a>
            </div>
        </article>
    `;

    delegationPanel.innerHTML = `
        <article class="dashboard-panel candidate-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Delegação</span>
                <h2>Organize sua delegação</h2>
                <p>Convide os colegas pelo usuário cadastrado. Eles receberão o convite no painel de notificações do header.</p>
            </div>
            <div class="registration-overview">
                <div class="feature-card blue-accent">
                    <h3>Tamanho definido</h3>
                    <p>${registration?.teamSize === 3 ? '3 integrantes' : '2 integrantes'}</p>
                </div>
                <div class="feature-card">
                    <h3>Integrantes atuais</h3>
                    <p>${delegation?.currentSize || 1} de ${registration?.teamSize || 2}</p>
                </div>
                <div class="feature-card">
                    <h3>Convites pendentes</h3>
                    <p>${pendingNotifications.length}</p>
                </div>
            </div>
            <div class="content-box registration-choice-box">
                <h3>Integrantes confirmados</h3>
                ${teammates.length ? `<div class="teammate-list">${teammates.map((member) => `
                    <div class="teammate-card">
                        <strong>${member.fullName || member.username}</strong>
                        <span class="registration-muted">${member.classGroup || 'Turma não informada'}</span>
                    </div>
                `).join('')}</div>` : '<div class="dashboard-empty">Nenhum integrante confirmado ainda.</div>'}
            </div>
            <form id="inviteForm" class="dashboard-form invite-form-shell" ${registration?.submittedAt ? '' : 'hidden'}>
                <div class="form-group">
                    <label for="inviteUsername">Usuário do colega</label>
                    <input type="text" id="inviteUsername" placeholder="Digite o usuário do participante" required>
                </div>
                <button type="submit" class="view-button" ${!registration?.submittedAt || (delegation?.remainingSlots || 0) === 0 ? 'disabled' : ''}>Enviar convite</button>
            </form>
            <p class="register-note registration-feedback" id="inviteFeedback">${!registration?.submittedAt ? 'Envie sua inscrição primeiro para liberar os convites.' : (delegation?.remainingSlots || 0) === 0 ? 'Sua delegação já está completa.' : 'Os convites serão aceitos ou recusados diretamente pelo header.'}</p>
        </article>
    `;
}

async function loadProfile() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const [userContext, delegationResponse] = await Promise.all([
            window.MaxOnuSession?.getAuthContext?.() || fetch('/api/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then((response) => response.ok ? parseJson(response) : null),
            fetch('/api/delegation/status', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        const user = userContext?.user || userContext;
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        const delegationStatus = delegationResponse.ok ? await parseJson(delegationResponse) : null;

        // Update hero badge and kicker based on role
        const heroBadge = document.querySelector('.dashboard-hero-badge');
        const heroKicker = document.querySelector('.dashboard-kicker');
        if (heroBadge) {
            const areaLabels = {
                candidate: 'Área do Delegado',
                teacher: 'Área do Orientador',
                coordinator: 'Área da Coordenação',
                admin: 'Área Administrativa',
                press: 'Área da Imprensa'
            };
            heroBadge.textContent = getRoleLabel(user.role);
            heroBadge.setAttribute('data-role', user.role || 'candidate');
            if (heroKicker) {
                heroKicker.textContent = areaLabels[user.role] || 'Área do Usuário';
            }
        }

        document.getElementById('profileInfo').innerHTML = `
            <div class="dashboard-summary-grid profile-summary-grid">
                <article class="feature-card blue-accent">
                    <h3>Usuário</h3>
                    <p>${user.fullName || user.username}</p>
                </article>
                ${createEditableCard('Nome completo', 'fullName', user.fullName, { placeholder: 'Digite seu nome completo' })}
                ${createEditableCard('Email', 'email', user.email, { type: 'email', placeholder: 'Digite seu email' })}
                ${createEditableCard('Turma', 'classGroup', user.classGroup, { placeholder: 'Digite sua turma', emptyText: 'Não informada' })}
                ${createEditableCard('País', 'country', user.country, { placeholder: 'Digite seu país', emptyText: 'Não designado' })}
                <article class="feature-card">
                    <h3>Função</h3>
                    <p>${getRoleLabel(user.role)}</p>
                </article>
            </div>
        `;

        bindEditableProfileFields();

        if (user.role === 'candidate' && delegationStatus) {
            renderCandidatePanels(user, delegationStatus);
            bindEditableProfileFields();
            return;
        }

        document.getElementById('registrationPanel').innerHTML = `
            <article class="content-box">
                <h2>Meu Perfil</h2>
                <div class="dashboard-summary-grid profile-summary-grid">
                    <article class="feature-card">
                        <h3>Comitê</h3>
                        <p>${user.committee !== null && user.committee !== undefined ? user.committee : 'Não designado'}</p>
                    </article>
                    <article class="feature-card">
                        <h3>Delegação</h3>
                        <p>${user.partner || 'Não definida'}</p>
                    </article>
                    ${createEditableCard('Turma', 'classGroup', user.classGroup, { placeholder: 'Digite sua turma', emptyText: 'Não informada' })}
                    ${createEditableCard('País', 'country', user.country, { placeholder: 'Digite seu país', emptyText: 'Não designado' })}
                </div>
            </article>
        `;
        bindEditableProfileFields();
        document.getElementById('delegationPanel').innerHTML = getProfileRoleDetails(user) || '<article class="content-box"><p>Sem recursos adicionais para este perfil.</p></article>';
    } catch (error) {
        console.error(error);
        document.getElementById('profileInfo').innerText = 'Erro ao carregar perfil.';
        document.getElementById('registrationPanel').innerText = 'Erro ao carregar sua área de inscrição.';
        document.getElementById('delegationPanel').innerText = 'Erro ao carregar sua delegação.';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadProfile();

    document.addEventListener('submit', async (event) => {
        if (event.target.id !== 'inviteForm') {
            return;
        }

        event.preventDefault();
        const button = event.target.querySelector('button');
        const username = document.getElementById('inviteUsername').value.trim();
        const feedback = document.getElementById('inviteFeedback');

        if (!username) {
            feedback.textContent = 'Digite o usuário do participante que deseja convidar.';
            return;
        }

        button.disabled = true;
        feedback.textContent = 'Enviando convite...';

        try {
            const response = await fetch('/api/delegation/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ username })
            });

            const data = await parseJson(response);
            if (!response.ok) {
                throw new Error(data.error || 'Não foi possível enviar o convite.');
            }

            feedback.textContent = data.message || 'Convite enviado com sucesso.';
            event.target.reset();
            document.dispatchEvent(new CustomEvent('delegation-updated'));
            await loadProfile();
        } catch (error) {
            feedback.textContent = error.message || 'Erro ao enviar convite.';
        } finally {
            button.disabled = false;
        }
    });

    document.addEventListener('delegation-updated', loadProfile);
});
