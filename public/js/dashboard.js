let currentUser = null;

const COUNTRY_SUGGESTIONS = [
    'África do Sul', 'Alemanha', 'Angola', 'Arábia Saudita', 'Argentina', 'Austrália', 'Áustria', 'Bélgica',
    'Bolívia', 'Brasil', 'Canadá', 'Chile', 'China', 'Colômbia', 'Coreia do Sul', 'Costa Rica', 'Cuba',
    'Dinamarca', 'Egito', 'Emirados Árabes Unidos', 'Equador', 'Espanha', 'Estados Unidos', 'Etiópia',
    'Filipinas', 'Finlândia', 'França', 'Gana', 'Grécia', 'Guatemala', 'Holanda', 'Hungria', 'Índia',
    'Indonésia', 'Irã', 'Iraque', 'Irlanda', 'Israel', 'Itália', 'Japão', 'Líbano', 'México', 'Moçambique',
    'Nigéria', 'Noruega', 'Nova Zelândia', 'Paquistão', 'Panamá', 'Paraguai', 'Peru', 'Polônia', 'Portugal',
    'Qatar', 'Quênia', 'Reino Unido', 'República Dominicana', 'Romênia', 'Rússia', 'Senegal', 'Singapura',
    'Suécia', 'Suíça', 'Tailândia', 'Turquia', 'Ucrânia', 'Uruguai', 'Venezuela', 'Vietnã'
];

function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

function roleLabel(role) {
    const roleLabels = {
        candidate: 'Delegado(a)',
        teacher: 'Professor orientador',
        coordinator: 'Coordenador',
        admin: 'Administrador',
        press: 'Imprensa'
    };

    return roleLabels[role] || 'Usuário';
}

function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;

    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
    }
}

async function parseJsonResponse(response) {
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
}

async function fetchRevealStatus() {
    const response = await fetch('/api/reveal-status');
    const { ok, data } = await parseJsonResponse(response);
    if (!ok) {
        return { revealed: false };
    }
    return data;
}

async function fetchRegistrationStatus() {
    const response = await fetch('/api/settings/registration-status');
    const { ok, data } = await parseJsonResponse(response);
    if (!ok) {
        throw new Error(data.error || 'Erro ao consultar o status das inscrições.');
    }
    return data;
}

function ensureCountryDatalist() {
    let datalist = document.getElementById('countrySuggestions');
    if (datalist) {
        return datalist;
    }

    datalist = document.createElement('datalist');
    datalist.id = 'countrySuggestions';
    datalist.innerHTML = COUNTRY_SUGGESTIONS.map((country) => `<option value="${country}"></option>`).join('');
    document.body.appendChild(datalist);
    return datalist;
}

async function checkAdmin() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login.html';
        return;
    }

    try {
        const context = await window.MaxOnuSession?.getAuthContext?.();
        currentUser = context?.user;
        if (!currentUser) {
            window.location.href = '/login.html';
            return;
        }
        if (currentUser.role !== 'admin' && currentUser.role !== 'coordinator' && currentUser.role !== 'teacher' && currentUser.role !== 'press') {
            window.location.href = '/profile.html';
            return;
        }

        setupDashboard(currentUser);
        loadRegistrationControl();
        loadPendingQuestions();
        const revealStatus = await fetchRevealStatus();
        if (revealStatus.revealed) {
            loadCommitteeUsers();
            loadDelegationManager();
        } else {
            lockCommitteeToolsUntilReveal();
        }
    } catch (error) {
        console.error(error);
        window.location.href = '/login.html';
    }
}

function setupDashboard(user) {
    const lead = document.getElementById('dashboardLead');
    const summary = document.getElementById('dashboardSummary');
    const exportActions = document.getElementById('exportActions');
    const assignmentPanel = document.getElementById('assignmentPanel');
    const registrationControlPanel = document.getElementById('registrationControlPanel');
    const roleBadge = document.getElementById('dashboardRoleBadge');

    lead.textContent = `${roleLabel(user.role)} autenticado. Este painel reúne perguntas pendentes, consulta por comitê e as permissões operacionais da edição 2026.`;
    roleBadge.textContent = roleLabel(user.role);
    roleBadge.dataset.role = user.role || 'user';

    const cards = [
        { title: 'Acesso atual', text: roleLabel(user.role), accent: 'blue-accent' },
        { title: 'Comitê vinculado', text: user.committee ?? 'Sem vínculo definido', accent: '' },
        { title: 'País visível', text: user.country || 'Ainda não definido', accent: '' }
    ];

    if (user.role === 'teacher') {
        cards.push({ title: 'Permissão', text: 'Consultar alunos e países por comitê.', accent: '' });
    } else if (user.role === 'press') {
        cards.push({ title: 'Permissão', text: 'Responder perguntas comuns e acompanhar a comunicação pública.', accent: 'blue-accent' });
    } else {
        cards.push({ title: 'Permissão', text: 'Consultar, distribuir países por delegação e controlar a liberação pública.', accent: 'blue-accent' });
        exportActions.hidden = false;
        assignmentPanel.hidden = false;
        registrationControlPanel.hidden = false;
    }

    summary.innerHTML = cards.map((card) => `
        <article class="feature-card ${card.accent}">
            <h3>${card.title}</h3>
            <p>${card.text}</p>
        </article>
    `).join('');
}

function lockCommitteeToolsUntilReveal() {
    const committeeFilter = document.getElementById('committeeFilter');
    const assignmentCommitteeFilter = document.getElementById('assignmentCommitteeFilter');
    const loadButton = document.getElementById('loadCommitteeBtn');
    const loadDelegationsButton = document.getElementById('loadDelegationsBtn');
    const exportActions = document.getElementById('exportActions');
    const committeeUsers = document.getElementById('committeeUsers');
    const delegationManager = document.getElementById('delegationManager');
    const releaseStatus = document.getElementById('delegationReleaseStatus');
    const releaseButton = document.getElementById('toggleDelegationReleaseBtn');

    committeeFilter?.setAttribute('disabled', 'disabled');
    assignmentCommitteeFilter?.setAttribute('disabled', 'disabled');
    loadButton?.setAttribute('disabled', 'disabled');
    loadDelegationsButton?.setAttribute('disabled', 'disabled');
    releaseButton?.setAttribute('disabled', 'disabled');
    if (exportActions) {
        exportActions.hidden = true;
    }
    if (committeeUsers) {
        committeeUsers.innerHTML = '<p class="dashboard-empty">As informações relacionadas aos comitês permanecem em sigilo até o fim da contagem regressiva.</p>';
    }
    if (delegationManager) {
        delegationManager.innerHTML = '<p class="dashboard-empty">A distribuição por delegação será liberada apenas após o término oficial da contagem regressiva.</p>';
    }
    if (releaseStatus) {
        releaseStatus.textContent = 'O controle de delegações e países permanece bloqueado até a abertura oficial dos comitês.';
    }
}

async function loadPendingQuestions() {
    const questionsList = document.getElementById('pendingQuestions');
    questionsList.innerHTML = '<p class="dashboard-empty">Carregando perguntas pendentes...</p>';

    try {
        const response = await fetch('/api/questions/pending', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao carregar perguntas pendentes.');
        }

        if (!data.length) {
            questionsList.innerHTML = '<p class="dashboard-empty">Nao ha perguntas pendentes.</p>';
            return;
        }

        questionsList.innerHTML = data.map((question) => `
            <div class="question-card dashboard-question-card" data-id="${question._id}">
                <span class="dashboard-chip">Pergunta pendente</span>
                <h3>${question.question}</h3>
                <textarea id="answer-${question._id}" placeholder="Digite sua resposta aqui..."></textarea>
                <div class="dashboard-question-actions">
                    <button type="button" class="view-button" data-dashboard-question-action="answer">Responder</button>
                    <button type="button" class="delete-button" data-dashboard-question-action="delete">Excluir</button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Erro ao carregar perguntas pendentes:', error);
        questionsList.innerHTML = '<p class="dashboard-empty">Erro ao carregar perguntas pendentes.</p>';
    }
}

async function submitAnswer(id, button) {
    const answer = document.getElementById(`answer-${id}`)?.value.trim();
    if (!answer) {
        alert('Digite uma resposta antes de enviar.');
        return;
    }

    setButtonLoading(button, true, 'Enviando...');

    try {
        const response = await fetch(`/api/questions/${id}/answer`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ answer })
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao enviar resposta.');
        }

        alert('Resposta enviada com sucesso!');
        loadPendingQuestions();
    } catch (error) {
        console.error('Erro ao enviar resposta:', error);
        alert(error.message || 'Erro ao enviar resposta.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function deleteQuestion(id, button) {
    setButtonLoading(button, true, 'Excluindo...');

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${getToken()}`
            }
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao excluir pergunta.');
        }

        alert('Pergunta excluida com sucesso!');
        loadPendingQuestions();
    } catch (error) {
        console.error('Erro ao excluir pergunta:', error);
        alert(error.message || 'Erro ao excluir pergunta.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

function renderCommitteeUsers(users) {
    const container = document.getElementById('committeeUsers');

    if (!users.length) {
        container.innerHTML = '<p class="dashboard-empty">Nenhum participante encontrado neste comite.</p>';
        return;
    }

    container.innerHTML = users.map((user) => `
        <article class="committee-user-card">
            <div class="dashboard-user-card-top">
                <h3>${user.fullName || user.username}</h3>
                <span class="dashboard-chip">${roleLabel(user.role || 'candidate')}</span>
            </div>
            <p><strong>ID:</strong> ${user._id || user.id || 'nao informado'}</p>
            <p><strong>Email:</strong> ${user.email || '-'}</p>
            <p><strong>Pais:</strong> ${user.country || 'Nao definido'}</p>
            <p><strong>Comite:</strong> ${user.committee ?? 'Nao definido'}</p>
            <p><strong>Dupla:</strong> ${user.partner || 'Nao definida'}</p>
        </article>
    `).join('');
}

function renderDelegationManager(delegations, isPublicReleased) {
    const container = document.getElementById('delegationManager');
    const releaseStatus = document.getElementById('delegationReleaseStatus');
    const toggleButton = document.getElementById('toggleDelegationReleaseBtn');

    if (!container || !releaseStatus || !toggleButton) {
        return;
    }

    ensureCountryDatalist();

    toggleButton.textContent = isPublicReleased
        ? 'Ocultar visualização pública'
        : 'Liberar visualização pública';
    toggleButton.dataset.released = String(isPublicReleased);

    releaseStatus.textContent = isPublicReleased
        ? 'As delegações com país atribuído já estão liberadas para visualização pública.'
        : 'Os países atribuídos permanecem salvos internamente e só serão exibidos ao público quando você clicar em liberar.';

    if (!delegations.length) {
        container.innerHTML = '<p class="dashboard-empty">Nenhuma delegação encontrada neste comitê.</p>';
        return;
    }

    container.innerHTML = delegations.map((delegation, index) => `
        <article class="dashboard-panel delegation-manager-card" data-delegation-key="${delegation.key}">
            <button type="button" class="delegation-toggle-btn" data-delegation-toggle="${delegation.key}">
                <div>
                    <span class="dashboard-chip">Delegação ${index + 1}</span>
                    <h3>${delegation.country || 'País ainda não atribuído'}</h3>
                </div>
                <span class="dashboard-chip">${delegation.members.length} / ${delegation.teamSize}</span>
            </button>
            <div class="delegation-manager-body" hidden>
            <div class="teammate-list delegation-member-list">
                ${delegation.members.map((member) => `
                    <div class="teammate-card">
                        <strong>${member.fullName}</strong>
                        <span class="registration-muted">${member.classGroup || 'Turma não informada'}</span>
                    </div>
                `).join('')}
            </div>
            <div class="dashboard-form delegation-country-form">
                <div class="form-group">
                    <label for="country-${index}">Pesquisar país</label>
                    <input
                        type="text"
                        id="country-${index}"
                        class="delegation-country-input"
                        list="countrySuggestions"
                        value="${delegation.country || ''}"
                        placeholder="Digite ou selecione um país"
                    >
                </div>
                <button type="button" class="view-button delegation-assign-btn" data-delegation-key="${delegation.key}">
                    Definir país
                </button>
            </div>
            </div>
        </article>
    `).join('');
}

async function loadCommitteeUsers() {
    const committee = document.getElementById('committeeFilter').value;
    const token = getToken();
    const endpoint = currentUser && currentUser.role === 'teacher'
        ? `/api/users/committee/${committee}`
        : `/api/users?committee=${committee}`;
    const loadButton = document.getElementById('loadCommitteeBtn');
    const container = document.getElementById('committeeUsers');

    setButtonLoading(loadButton, true, 'Carregando...');
    container.innerHTML = '<p class="dashboard-empty">Buscando participantes deste comite...</p>';

    try {
        const response = await fetch(endpoint, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao carregar participantes.');
        }

        renderCommitteeUsers(Array.isArray(data) ? data : []);
    } catch (error) {
        console.error('Erro ao carregar usuários do comitê:', error);
        container.innerHTML = '<p class="dashboard-empty">Erro ao carregar participantes.</p>';
    } finally {
        setButtonLoading(loadButton, false, '');
    }
}

async function loadDelegationManager() {
    const container = document.getElementById('delegationManager');
    const releaseStatus = document.getElementById('delegationReleaseStatus');

    if (!container || !releaseStatus) {
        return;
    }

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'coordinator')) {
        container.innerHTML = '<p class="dashboard-empty">A gestão de países por delegação está disponível apenas para administração e coordenação.</p>';
        releaseStatus.textContent = 'Visualização interna disponível somente para perfis com permissão de distribuição.';
        return;
    }

    const committee = document.getElementById('assignmentCommitteeFilter')?.value || document.getElementById('committeeFilter').value;
    container.innerHTML = '<p class="dashboard-empty">Carregando delegações deste comitê...</p>';
    releaseStatus.textContent = 'Consultando o status atual de liberação e as delegações cadastradas...';

    try {
        const response = await fetch(`/api/users/committee/${committee}/delegations`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao carregar delegações.');
        }

        renderDelegationManager(Array.isArray(data.delegations) ? data.delegations : [], Boolean(data.publicDelegationsReleased));
    } catch (error) {
        console.error('Erro ao carregar delegações do comitê:', error);
        container.innerHTML = '<p class="dashboard-empty">Erro ao carregar as delegações deste comitê.</p>';
        releaseStatus.textContent = error.message || 'Não foi possível obter o status de liberação.';
    }
}

function renderRegistrationControl(status) {
    const statusLabel = document.getElementById('registrationStatus');
    const toggleButton = document.getElementById('toggleRegistrationBtn');

    if (!statusLabel || !toggleButton) {
        return;
    }

    if (!status.revealPassed) {
        toggleButton.disabled = true;
        toggleButton.textContent = 'Fechar inscrições';
        statusLabel.textContent = 'As inscrições ainda não abriram oficialmente. O controle manual ficará disponível após a data de abertura.';
        return;
    }

    toggleButton.disabled = false;
    toggleButton.dataset.closed = String(status.registrationManuallyClosed);
    toggleButton.textContent = status.registrationManuallyClosed ? 'Reabrir inscrições' : 'Fechar inscrições';
    toggleButton.className = status.registrationManuallyClosed ? 'view-button' : 'delete-button';
    statusLabel.textContent = status.registrationOpen
        ? 'As inscrições estão abertas no momento.'
        : 'As inscrições estão fechadas manualmente pelo painel.';
}

async function loadRegistrationControl() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'coordinator')) {
        return;
    }

    try {
        const status = await fetchRegistrationStatus();
        renderRegistrationControl(status);
    } catch (error) {
        const statusLabel = document.getElementById('registrationStatus');
        if (statusLabel) {
            statusLabel.textContent = error.message || 'Não foi possível consultar o status das inscrições.';
        }
    }
}

async function exportCommittee(format) {
    const committee = document.getElementById('committeeFilter').value;
    const button = format === 'csv' ? document.getElementById('exportCsvBtn') : document.getElementById('exportXlsxBtn');

    setButtonLoading(button, true, format === 'csv' ? 'Baixando CSV...' : 'Baixando XLSX...');

    try {
        const response = await fetch(`/api/export/committee/${committee}?format=${format}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Nao foi possivel exportar a lista deste comite.');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `comite-${committee}.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao exportar arquivo.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function assignCountryToDelegation(button) {
    const delegationKey = button.dataset.delegationKey;
    const card = button.closest('.delegation-manager-card');
    const input = card?.querySelector('.delegation-country-input');
    const country = input?.value.trim();

    if (!delegationKey || !country) {
        alert('Selecione ou digite um país antes de salvar.');
        return;
    }

    setButtonLoading(button, true, 'Salvando...');

    try {
        const response = await fetch(`/api/users/delegations/${delegationKey}/country`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ country })
        });

        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao salvar país da delegação.');
        }

        await loadDelegationManager();
        loadCommitteeUsers();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao salvar país da delegação.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function toggleDelegationRelease() {
    const button = document.getElementById('toggleDelegationReleaseBtn');
    const currentlyReleased = button?.dataset.released === 'true';

    setButtonLoading(button, true, currentlyReleased ? 'Ocultando...' : 'Liberando...');

    try {
        const response = await fetch('/api/settings/public-release', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ publicDelegationsReleased: !currentlyReleased })
        });

        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao atualizar a liberação pública.');
        }

        setButtonLoading(button, false, '');
        await loadDelegationManager();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao atualizar a liberação pública.');
        setButtonLoading(button, false, '');
    }
}

async function toggleRegistrationStatus() {
    const button = document.getElementById('toggleRegistrationBtn');
    const currentlyClosed = button?.dataset.closed === 'true';

    setButtonLoading(button, true, currentlyClosed ? 'Reabrindo...' : 'Fechando...');

    try {
        const response = await fetch('/api/settings/registration-status', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ registrationManuallyClosed: !currentlyClosed })
        });

        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao atualizar o status das inscrições.');
        }

        setButtonLoading(button, false, '');
        renderRegistrationControl(data);
    } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao atualizar o status das inscrições.');
        setButtonLoading(button, false, '');
    }
}

function initDashboard() {
    document.getElementById('loadCommitteeBtn')?.addEventListener('click', () => {
        loadCommitteeUsers();
    });
    document.getElementById('committeeFilter')?.addEventListener('change', () => {
        loadCommitteeUsers();
    });
    document.getElementById('loadDelegationsBtn')?.addEventListener('click', loadDelegationManager);
    document.getElementById('assignmentCommitteeFilter')?.addEventListener('change', loadDelegationManager);
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => exportCommittee('csv'));
    document.getElementById('exportXlsxBtn')?.addEventListener('click', () => exportCommittee('xlsx'));
    document.getElementById('toggleDelegationReleaseBtn')?.addEventListener('click', toggleDelegationRelease);
    document.getElementById('toggleRegistrationBtn')?.addEventListener('click', toggleRegistrationStatus);

    document.getElementById('delegationManager')?.addEventListener('click', (event) => {
        const toggleButton = event.target.closest('.delegation-toggle-btn');
        if (toggleButton) {
            const card = toggleButton.closest('.delegation-manager-card');
            const body = card?.querySelector('.delegation-manager-body');
            if (body) {
                body.hidden = !body.hidden;
            }
            return;
        }

        const actionButton = event.target.closest('.delegation-assign-btn');
        if (!actionButton) {
            return;
        }

        assignCountryToDelegation(actionButton);
    });

    document.getElementById('pendingQuestions')?.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-dashboard-question-action]');
        if (!actionButton) {
            return;
        }

        const questionCard = actionButton.closest('.question-card');
        const id = questionCard?.dataset.id;
        if (!id) {
            return;
        }

        if (actionButton.dataset.dashboardQuestionAction === 'answer') {
            submitAnswer(id, actionButton);
        } else if (actionButton.dataset.dashboardQuestionAction === 'delete') {
            deleteQuestion(id, actionButton);
        }
    });

    checkAdmin();
}

document.addEventListener('DOMContentLoaded', initDashboard);
