let currentUser = null;
const COMMITTEE_LABELS = {
    1: 'Conselho de Direitos Humanos (CDH - 2026)',
    2: 'Assembleia Geral das Nações Unidas (AGNU)',
    3: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global',
    6: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    7: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)'
};

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

function getCommitteeLabel(value) {
    const number = Number(value);
    return COMMITTEE_LABELS[number] || 'Não informado';
}

function parseClassGroup(classGroup = '') {
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
}

function getEducationSegmentFromText(value = '') {
    const normalized = String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    if (!normalized) {
        return '';
    }

    if (
        normalized.includes('ensino medio') ||
        normalized.includes('medio') ||
        /\bem\b/.test(normalized)
    ) {
        return 'em';
    }

    if (
        normalized.includes('8o') ||
        normalized.includes('8 ano') ||
        normalized.includes('9o') ||
        normalized.includes('9 ano') ||
        normalized.includes('8 e 9') ||
        normalized.includes('8/9')
    ) {
        return 'fundamental';
    }

    return '';
}

function getDelegationEducationSegment(delegation) {
    const candidates = [
        delegation?.registration?.classGroup,
        ...(Array.isArray(delegation?.members) ? delegation.members.map((member) => member.classGroup) : [])
    ];

    for (const value of candidates) {
        const segment = getEducationSegmentFromText(value);
        if (segment) {
            return segment;
        }
    }

    return '';
}

function computeFirstChoiceRankingBySegment(delegations) {
    const buckets = {
        em: new Map(),
        fundamental: new Map()
    };

    delegations.forEach((delegation) => {
        const segment = getDelegationEducationSegment(delegation);
        if (!segment || !buckets[segment]) {
            return;
        }

        const firstChoice = Number(delegation?.registration?.firstChoice);
        if (!Number.isInteger(firstChoice) || firstChoice < 1 || firstChoice > 7) {
            return;
        }

        buckets[segment].set(firstChoice, (buckets[segment].get(firstChoice) || 0) + 1);
    });

    const sortRanking = (map) => Array.from({ length: 7 }, (_, index) => ({
        committee: index + 1,
        count: map.get(index + 1) || 0
    }))
        .sort((a, b) => b.count - a.count || a.committee - b.committee)
        .slice(0, 7);

    return {
        em: sortRanking(buckets.em),
        fundamental: sortRanking(buckets.fundamental)
    };
}

function renderRankingColumn(title, ranking, emptyMessage) {
    const countFrequency = ranking.reduce((acc, item) => {
        const key = String(item.count);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return `
        <article class="feature-card segment-ranking-card">
            <h3>${title}</h3>
            <ol class="segment-ranking-list">
                ${ranking.map((item, index) => {
                    const position = index + 1;
                    const medalClass = position === 1
                        ? 'is-gold'
                        : position === 2
                            ? 'is-silver'
                            : position === 3
                                ? 'is-bronze'
                                : 'is-default';
                    const tied = item.count > 0 && (countFrequency[String(item.count)] || 0) > 1;

                    return `
                    <li class="${tied ? 'is-tied' : ''}">
                        <span class="ranking-position ${medalClass}">${position}º</span>
                        <div class="ranking-meta">
                        <strong>${getCommitteeLabel(item.committee)}</strong>
                        <span>${item.count} escolha(s) de 1ª opção</span>
                        </div>
                        ${tied ? '<span class="ranking-tie-badge">Empate</span>' : ''}
                    </li>
                `;
                }).join('')}
            </ol>
        </article>
    `;
}

function renderSegmentRanking(delegations) {
    const container = document.getElementById('registrationSegmentRanking');
    if (!container) {
        return;
    }

    const ranking = computeFirstChoiceRankingBySegment(delegations);
    container.innerHTML = [
        renderRankingColumn(
            'Ranking EM',
            ranking.em,
            'Sem inscrições com 1ª opção identificada para Ensino Médio.'
        ),
        renderRankingColumn(
            'Ranking 8º e 9º',
            ranking.fundamental,
            'Sem inscrições com 1ª opção identificada para 8º e 9º ano.'
        )
    ].join('');
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
        if (currentUser.role === 'admin' || currentUser.role === 'coordinator' || currentUser.role === 'teacher') {
            loadCommitteeUsers();
            loadDelegationManager();
            loadManualAssignments();
            return;
        }

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
    const manualAssignmentPanel = document.getElementById('manualAssignmentPanel');
    const roleBadge = document.getElementById('dashboardRoleBadge');

    lead.textContent = `${roleLabel(user.role)} autenticado. Este painel reúne perguntas pendentes, consulta por comitê e as permissões operacionais da edição 2026.`;
    roleBadge.textContent = roleLabel(user.role);
    roleBadge.dataset.role = user.role || 'user';

    const cards = [
        { title: 'Acesso atual', text: roleLabel(user.role), accent: 'blue-accent' },
        { title: 'Comitê vinculado', text: user.committee ?? 'Sem vínculo definido', accent: '' },
        { title: 'País visível', text: user.country || 'Ainda não definido', accent: '' }
    ];

    if (user.role === 'press') {
        cards.push({ title: 'Permissão', text: 'Responder perguntas comuns e acompanhar a comunicação pública.', accent: 'blue-accent' });
    } else {
        cards.push({ title: 'Permissão', text: 'Consultar, distribuir países por delegação e controlar a liberação pública.', accent: 'blue-accent' });
        exportActions.hidden = false;
        assignmentPanel.hidden = false;
        registrationControlPanel.hidden = false;
        manualAssignmentPanel.hidden = false;
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

    container.innerHTML = users.map((user) => {
        const classInfo = parseClassGroup(user.classGroup);
        return `
            <article class="committee-user-card">
                <div class="dashboard-user-card-top">
                    <h3>${user.fullName || user.username}</h3>
                    <span class="dashboard-chip">${roleLabel(user.role || 'candidate')}</span>
                </div>
                <p><strong>ID:</strong> ${user._id || user.id || 'nao informado'}</p>
                <p><strong>Email:</strong> ${user.email || '-'}</p>
                <p><strong>Turma:</strong> ${user.classGroup || 'Não informada'}</p>
                <p><strong>Unidade:</strong> ${classInfo.unit}</p>
                <p><strong>Série:</strong> ${classInfo.grade}</p>
                <p><strong>Pais:</strong> ${user.country || 'Nao definido'}</p>
                <p><strong>Comite:</strong> ${user.committee ?? 'Nao definido'}</p>
                <p><strong>Dupla:</strong> ${user.partner || 'Nao definida'}</p>
            </article>
        `;
    }).join('');
}

function renderDelegationManager(delegations, isPublicReleased, canAssignCountry) {
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
                ${delegation.members.map((member) => {
                    const classInfo = parseClassGroup(member.classGroup);
                    return `
                        <div class="teammate-card">
                            <strong>${member.fullName}</strong>
                            <span class="registration-muted">${member.classGroup || 'Turma não informada'}</span>
                            <span class="registration-muted">Unidade: ${classInfo.unit} | Série: ${classInfo.grade}</span>
                        </div>
                    `;
                }).join('')}
            </div>
            ${canAssignCountry ? `
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
            ` : `
                <p class="register-note registration-feedback">Somente coordenação/admin podem editar país da delegação. Como orientador, você pode liberar ou ocultar a visualização pública.</p>
            `}
            </div>
        </article>
    `).join('');
}

async function loadCommitteeUsers() {
    const committee = document.getElementById('committeeFilter').value;
    const token = getToken();
    const endpoint = `/api/users?committee=${committee}`;
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

    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'coordinator' && currentUser.role !== 'teacher')) {
        container.innerHTML = '<p class="dashboard-empty">A gestão de delegações está disponível apenas para administração, coordenação e orientação.</p>';
        releaseStatus.textContent = 'Visualização interna disponível somente para perfis com permissão operacional.';
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

        const canAssignCountry = currentUser.role === 'admin' || currentUser.role === 'coordinator' || currentUser.role === 'teacher';
        renderDelegationManager(
            Array.isArray(data.delegations) ? data.delegations : [],
            Boolean(data.publicDelegationsReleased),
            canAssignCountry
        );
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

    toggleButton.disabled = false;
    toggleButton.dataset.closed = String(status.registrationManuallyClosed);
    toggleButton.textContent = status.registrationManuallyClosed ? 'Reabrir inscrições' : 'Fechar inscrições';
    toggleButton.className = status.registrationManuallyClosed ? 'view-button' : 'delete-button';
    statusLabel.textContent = status.registrationOpen
        ? 'As inscrições estão abertas no momento.'
        : (status.revealPassed
            ? 'As inscrições estão fechadas manualmente pelo painel.'
            : 'As inscrições ainda não abriram oficialmente, mas o fechamento manual já pode ser configurado.');
}

async function loadRegistrationControl() {
    if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'coordinator' && currentUser.role !== 'teacher')) {
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

function buildCommitteeSelectOptions(selectedCommittee) {
    return ['<option value="">Não definido</option>']
        .concat(Array.from({ length: 7 }, (_, index) => {
            const value = index + 1;
            const selected = Number(selectedCommittee) === value ? ' selected' : '';
            return `<option value="${value}"${selected}>${getCommitteeLabel(value)}</option>`;
        }))
        .join('');
}

function renderManualAssignments(users) {
    const container = document.getElementById('manualAssignmentList');
    const filterType = document.getElementById('registrationPreferenceFilter')?.value || 'all';

    if (!container) {
        return;
    }

    const filteredUsers = users.filter((delegation) => {
        if (filterType === 'unassigned') {
            return !delegation.committee;
        }
        return true;
    });

    if (!filteredUsers.length) {
        container.innerHTML = '<p class="dashboard-empty">Nenhuma inscrição encontrada para o filtro selecionado.</p>';
        return;
    }

    container.innerHTML = filteredUsers.map((delegation) => {
        const registration = delegation.registration || {};
        const delegationNames = delegation.memberNames || (delegation.members || [])
            .map((member) => member.fullName || member.username || 'Participante')
            .join(' e ');
        const membersDetails = (delegation.members || []).map((member) => {
            const classInfo = parseClassGroup(member.classGroup);
            return `
                <div class="teammate-card">
                    <strong>${member.fullName || member.username || 'Participante'}</strong>
                    <span class="registration-muted">${member.classGroup || 'Turma não informada'}</span>
                    <span class="registration-muted">Unidade: ${classInfo.unit} | Série: ${classInfo.grade}</span>
                </div>
            `;
        }).join('');
        const highlightedChoice = filterType === 'first'
            ? registration.firstChoice
            : filterType === 'second'
                ? registration.secondChoice
                : filterType === 'third'
                    ? registration.thirdChoice
                    : null;

        return `
            <article class="committee-user-card" data-delegation-key="${delegation.key}">
                <div class="dashboard-user-card-top">
                    <h3>${delegationNames || 'Delegação'}</h3>
                    <span class="dashboard-chip">${(delegation.members || []).length} / ${registration.teamSize || delegation.teamSize || 2}</span>
                </div>
                <p><strong>1ª opção:</strong> ${getCommitteeLabel(registration.firstChoice)}</p>
                <p><strong>2ª opção:</strong> ${getCommitteeLabel(registration.secondChoice)}</p>
                <p><strong>3ª opção:</strong> ${getCommitteeLabel(registration.thirdChoice)}</p>
                ${highlightedChoice ? `<p><strong>Filtro atual:</strong> ${getCommitteeLabel(highlightedChoice)}</p>` : ''}
                <div class="teammate-list delegation-member-list">
                    ${membersDetails || '<p class="dashboard-empty">Sem integrantes carregados nesta delegação.</p>'}
                </div>
                <div class="dashboard-inline-form">
                    <label>Comitê final da delegação</label>
                    <select class="manual-committee-select">
                        ${buildCommitteeSelectOptions(delegation.committee)}
                    </select>
                    <button type="button" class="view-button assign-committee-btn" data-delegation-key="${delegation.key}">
                        Salvar comitê
                    </button>
                </div>
            </article>
        `;
    }).join('');
}

async function loadManualAssignments() {
    const container = document.getElementById('manualAssignmentList');
    const button = document.getElementById('loadRegistrationsBtn');
    const preferenceFilter = document.getElementById('registrationPreferenceFilter')?.value || 'all';
    const committeeTarget = document.getElementById('registrationCommitteeTarget')?.value || 'all';

    if (!container) {
        return;
    }

    setButtonLoading(button, true, 'Carregando...');
    container.innerHTML = '<p class="dashboard-empty">Carregando delegações e preferências...</p>';

    try {
        const response = await fetch('/api/users/registrations', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao carregar delegações.');
        }

        const users = Array.isArray(data) ? data : [];
        renderSegmentRanking(users);
        const filteredByPreference = users.filter((delegation) => {
            if (preferenceFilter === 'unassigned') {
                return !delegation.committee;
            }

            if (preferenceFilter === 'all') {
                return true;
            }

            const choiceValue = Number(delegation.registration?.[`${preferenceFilter}Choice`]);
            if (committeeTarget === 'all') {
                return Number.isInteger(choiceValue) && choiceValue >= 1 && choiceValue <= 7;
            }

            return choiceValue === Number(committeeTarget);
        });

        renderManualAssignments(filteredByPreference);
    } catch (error) {
        console.error(error);
        container.innerHTML = `<p class="dashboard-empty">${error.message || 'Erro ao carregar delegações.'}</p>`;
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function assignCommitteeToUser(button) {
    const delegationKey = button.dataset.delegationKey;
    const card = button.closest('.committee-user-card');
    const select = card?.querySelector('.manual-committee-select');
    const committeeValue = select?.value;

    if (!delegationKey || !committeeValue) {
        alert('Selecione um comitê final antes de salvar.');
        return;
    }

    setButtonLoading(button, true, 'Salvando...');

    try {
        const response = await fetch(`/api/users/delegations/${delegationKey}/committee`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ committee: Number(committeeValue) })
        });
        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao definir comitê da delegação.');
        }

        await Promise.all([loadManualAssignments(), loadCommitteeUsers(), loadDelegationManager()]);
    } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao definir comitê da delegação.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function exportResults(format) {
    const button = format === 'csv'
        ? document.getElementById('exportResultsCsvBtn')
        : document.getElementById('exportResultsXlsxBtn');

    setButtonLoading(button, true, format === 'csv' ? 'Baixando CSV...' : 'Baixando XLSX...');

    try {
        const response = await fetch(`/api/export/results?format=${format}`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            throw new Error('Não foi possível exportar os resultados.');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `resultados-inscricoes.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao exportar resultados.');
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
    document.getElementById('exportResultsCsvBtn')?.addEventListener('click', () => exportResults('csv'));
    document.getElementById('exportResultsXlsxBtn')?.addEventListener('click', () => exportResults('xlsx'));
    document.getElementById('toggleDelegationReleaseBtn')?.addEventListener('click', toggleDelegationRelease);
    document.getElementById('toggleRegistrationBtn')?.addEventListener('click', toggleRegistrationStatus);
    document.getElementById('loadRegistrationsBtn')?.addEventListener('click', loadManualAssignments);
    document.getElementById('registrationPreferenceFilter')?.addEventListener('change', loadManualAssignments);
    document.getElementById('registrationCommitteeTarget')?.addEventListener('change', loadManualAssignments);

    document.getElementById('manualAssignmentList')?.addEventListener('click', (event) => {
        const assignButton = event.target.closest('.assign-committee-btn');
        if (!assignButton) {
            return;
        }
        assignCommitteeToUser(assignButton);
    });

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
