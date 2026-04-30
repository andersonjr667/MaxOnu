let currentUser = null;
let registrationsCache = [];

const COMMITTEE_LABELS = {
    1: 'Conselho de Direitos Humanos (CDH - 2026)',
    2: 'Assembleia Geral das Nações Unidas (AGNU)',
    3: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global',
6: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    7: 'ONU Mulheres (CSW/2026)'
};

const ALLOWED_ROLES = new Set(['admin', 'coordinator', 'teacher']);

function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
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

    return {
        unit: normalized.slice(0, separatorIndex).trim() || 'Não informada',
        grade: normalized.slice(separatorIndex + 3).trim() || 'Não informada'
    };
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

function roleLabel(role) {
    const roleLabels = {
        teacher: 'Professor orientador',
        coordinator: 'Coordenador',
        admin: 'Administrador'
    };
    return roleLabels[role] || 'Usuário';
}

function getCommitteeLabel(value) {
    const number = Number(value);
    return COMMITTEE_LABELS[number] || 'Não definido';
}

function parseJsonResponse(response) {
    return response.json()
        .catch(() => ({}))
        .then((data) => ({ ok: response.ok, data }));
}

function setButtonLoading(button, isLoading, loadingText) {
    if (!button) {
        return;
    }

    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
        return;
    }

    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
}

function updateTimestamp() {
    const node = document.getElementById('advancedUpdatedAt');
    if (!node) {
        return;
    }

    const now = new Date();
    node.textContent = `Última atualização: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}.`;
}

function buildCommitteeSelectOptions(selectedCommittee) {
    return ['<option value="">Não definido</option>']
        .concat(
            Array.from({ length: 7 }, (_, index) => {
                const value = index + 1;
                const selected = Number(selectedCommittee) === value ? ' selected' : '';
                return `<option value="${value}"${selected}>${getCommitteeLabel(value)}</option>`;
            })
        )
        .join('');
}

function getDelegationMembers(delegation) {
    return Array.isArray(delegation?.members) ? delegation.members : [];
}

function getDelegationName(delegation) {
    if (delegation?.memberNames) {
        return delegation.memberNames;
    }

    const names = getDelegationMembers(delegation)
        .map((member) => member.fullName || member.username || 'Participante')
        .filter(Boolean);

    return names.join(' e ') || 'Delegação';
}

function getChoiceMatchLabel(delegation) {
    const currentCommittee = Number(delegation?.committee);
    const registration = delegation?.registration || {};
    if (!currentCommittee) {
        return 'Sem comitê final';
    }

    if (currentCommittee === Number(registration.firstChoice)) {
        return 'Aderente à 1ª opção';
    }

    if (currentCommittee === Number(registration.secondChoice)) {
        return 'Aderente à 2ª opção';
    }

    if (currentCommittee === Number(registration.thirdChoice)) {
        return 'Aderente à 3ª opção';
    }

    return 'Fora das 3 opções';
}

function getChoiceMatchTone(delegation) {
    const label = getChoiceMatchLabel(delegation);
    if (label.includes('1ª')) {
        return 'is-good';
    }
    if (label.includes('2ª') || label.includes('3ª')) {
        return 'is-warn';
    }
    return 'is-neutral';
}

function setupPageHeader(user) {
    const lead = document.getElementById('advancedLead');
    const roleBadge = document.getElementById('advancedRoleBadge');
    if (lead) {
        lead.textContent = `${roleLabel(user.role)} autenticado. Esta visão avançada aprofunda o controle de inscrições e a alocação final por delegação.`;
    }
    if (roleBadge) {
        roleBadge.textContent = roleLabel(user.role);
        roleBadge.dataset.role = user.role || 'user';
    }
}

function renderRegistrationControl(status) {
    const toggleButton = document.getElementById('advancedToggleRegistrationBtn');
    const statusNode = document.getElementById('advancedRegistrationStatus');
    const detailsGrid = document.getElementById('registrationStatusMeta');
    if (!toggleButton || !statusNode || !detailsGrid) {
        return;
    }

    toggleButton.dataset.closed = String(Boolean(status.registrationManuallyClosed));
    toggleButton.textContent = status.registrationManuallyClosed ? 'Reabrir inscrições' : 'Fechar inscrições';
    toggleButton.className = status.registrationManuallyClosed ? 'view-button' : 'delete-button';

    if (status.registrationOpen) {
        statusNode.textContent = 'As inscrições estão abertas no momento.';
    } else if (status.revealPassed) {
        statusNode.textContent = 'As inscrições estão fechadas manualmente neste momento.';
    } else {
        statusNode.textContent = 'A abertura oficial ainda não ocorreu. O fechamento manual já pode ser pré-configurado.';
    }

    const details = [
        { title: 'Abertura oficial', value: status.revealPassed ? 'Concluída' : 'Ainda não liberada' },
        { title: 'Controle manual', value: status.registrationManuallyClosed ? 'Fechado manualmente' : 'Sem fechamento manual' },
        { title: 'Formulário agora', value: status.registrationOpen ? 'Aberto' : 'Fechado' },
        { title: 'Ação recomendada', value: status.registrationOpen ? 'Manter monitoramento' : 'Validar janela e reabrir se necessário' }
    ];

    detailsGrid.innerHTML = details.map((item) => `
        <article class="feature-card registration-status-item">
            <h3>${item.title}</h3>
            <p>${item.value}</p>
        </article>
    `).join('');
}

function calculateGlobalMetrics(registrations) {
    const total = registrations.length;
    const assigned = registrations.filter((item) => Number(item.committee) >= 1 && Number(item.committee) <= 7).length;
    const unassigned = total - assigned;
    const first = registrations.filter((item) => getChoiceMatchLabel(item).includes('1ª')).length;
    const secondOrThird = registrations.filter((item) => {
        const label = getChoiceMatchLabel(item);
        return label.includes('2ª') || label.includes('3ª');
    }).length;

    return { total, assigned, unassigned, first, secondOrThird };
}

function renderGlobalSummary(registrations) {
    const summary = document.getElementById('advancedSummary');
    if (!summary) {
        return;
    }

    const metrics = calculateGlobalMetrics(registrations);
    const cards = [
        { title: 'Delegações totais', text: String(metrics.total), accent: 'blue-accent' },
        { title: 'Comitê final definido', text: String(metrics.assigned), accent: '' },
        { title: 'Sem comitê final', text: String(metrics.unassigned), accent: '' },
        { title: 'Aderência à 1ª opção', text: String(metrics.first), accent: 'blue-accent' },
        { title: 'Aderência à 2ª/3ª', text: String(metrics.secondOrThird), accent: '' }
    ];

    summary.innerHTML = cards.map((card) => `
        <article class="feature-card ${card.accent}">
            <h3>${card.title}</h3>
            <p>${card.text}</p>
        </article>
    `).join('');
}

function renderFilteredSummary(filtered) {
    const summary = document.getElementById('advancedFilteredSummary');
    if (!summary) {
        return;
    }

    const metrics = calculateGlobalMetrics(filtered);
    const cards = [
        { title: 'Resultado filtrado', text: `${metrics.total} delegações` },
        { title: 'Comitê definido (filtro)', text: String(metrics.assigned) },
        { title: 'Pendentes no filtro', text: String(metrics.unassigned) },
        { title: 'Aderência à 1ª no filtro', text: String(metrics.first) }
    ];

    summary.innerHTML = cards.map((card) => `
        <article class="feature-card">
            <h3>${card.title}</h3>
            <p>${card.text}</p>
        </article>
    `).join('');
}

function renderCommitteeDemand(registrations) {
    const container = document.getElementById('advancedCommitteeDemand');
    if (!container) {
        return;
    }

    const counters = Array.from({ length: 7 }, (_, index) => ({
        committee: index + 1,
        first: 0,
        second: 0,
        third: 0,
        assigned: 0
    }));

    registrations.forEach((delegation) => {
        const registration = delegation.registration || {};
        const assigned = Number(delegation.committee);
        counters.forEach((row) => {
            if (Number(registration.firstChoice) === row.committee) row.first += 1;
            if (Number(registration.secondChoice) === row.committee) row.second += 1;
            if (Number(registration.thirdChoice) === row.committee) row.third += 1;
            if (assigned === row.committee) row.assigned += 1;
        });
    });

    container.innerHTML = counters.map((row) => `
        <article class="feature-card advanced-demand-card">
            <h3>${getCommitteeLabel(row.committee)}</h3>
            <p><strong>1ª opção:</strong> ${row.first}</p>
            <p><strong>2ª opção:</strong> ${row.second}</p>
            <p><strong>3ª opção:</strong> ${row.third}</p>
            <p><strong>Alocados:</strong> ${row.assigned}</p>
        </article>
    `).join('');
}

function computeFirstChoiceRankingBySegment(registrations) {
    const groups = {
        em: new Map(),
        fundamental: new Map()
    };

    registrations.forEach((delegation) => {
        const segment = getDelegationEducationSegment(delegation);
        if (!segment || !groups[segment]) {
            return;
        }

        const firstChoice = Number(delegation?.registration?.firstChoice);
        if (!Number.isInteger(firstChoice) || firstChoice < 1 || firstChoice > 7) {
            return;
        }

        groups[segment].set(firstChoice, (groups[segment].get(firstChoice) || 0) + 1);
    });

    const toRanking = (map) => Array.from({ length: 7 }, (_, index) => ({
        committee: index + 1,
        count: map.get(index + 1) || 0
    }))
        .sort((a, b) => b.count - a.count || a.committee - b.committee)
        .slice(0, 7);

    return {
        em: toRanking(groups.em),
        fundamental: toRanking(groups.fundamental)
    };
}

function renderSegmentRankingCard(title, ranking, emptyMessage) {
    const countFrequency = ranking.reduce((acc, item) => {
        const key = String(item.count);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return `
        <article class="feature-card advanced-segment-card">
            <h3>${title}</h3>
            <ol class="advanced-segment-list">
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
                        <span>${item.count} escolha(s) como 1ª opção</span>
                        </div>
                        ${tied ? '<span class="ranking-tie-badge">Empate</span>' : ''}
                    </li>
                `;
                }).join('')}
            </ol>
        </article>
    `;
}

function renderSegmentRanking(registrations) {
    const container = document.getElementById('advancedSegmentRanking');
    if (!container) {
        return;
    }

    const ranking = computeFirstChoiceRankingBySegment(registrations);
    container.innerHTML = [
        renderSegmentRankingCard(
            'Ranking EM (mais escolhidos)',
            ranking.em,
            'Sem dados de 1ª opção para delegações do Ensino Médio no filtro atual.'
        ),
        renderSegmentRankingCard(
            'Ranking 8º/9º ano (mais escolhidos)',
            ranking.fundamental,
            'Sem dados de 1ª opção para delegações de 8º e 9º ano no filtro atual.'
        )
    ].join('');
}

function applyFilters(registrations) {
    const preference = document.getElementById('advancedPreferenceFilter')?.value || 'all';
    const committeeTarget = document.getElementById('advancedCommitteeTarget')?.value || 'all';
    const assignmentStatus = document.getElementById('advancedAssignmentStatus')?.value || 'all';
    const teamSizeFilter = document.getElementById('advancedTeamSizeFilter')?.value || 'all';
    const search = String(document.getElementById('advancedSearchFilter')?.value || '').trim().toLowerCase();

    return registrations.filter((delegation) => {
        const registration = delegation.registration || {};
        const assignedCommittee = Number(delegation.committee);
        const assigned = assignedCommittee >= 1 && assignedCommittee <= 7;
        const teamSize = Number(registration.teamSize || delegation.teamSize || getDelegationMembers(delegation).length || 0);

        if (assignmentStatus === 'assigned' && !assigned) {
            return false;
        }
        if (assignmentStatus === 'unassigned' && assigned) {
            return false;
        }
        if (teamSizeFilter !== 'all' && teamSize !== Number(teamSizeFilter)) {
            return false;
        }

        if (preference === 'unassigned' && assigned) {
            return false;
        }

        if (preference !== 'all' && preference !== 'unassigned') {
            const choiceValue = Number(registration[`${preference}Choice`]);
            if (!Number.isInteger(choiceValue) || choiceValue < 1 || choiceValue > 7) {
                return false;
            }

            if (committeeTarget !== 'all' && choiceValue !== Number(committeeTarget)) {
                return false;
            }
        }

        if (!search) {
            return true;
        }

        const haystack = [
            getDelegationName(delegation),
            delegation?.key,
            registration?.classGroup,
            ...getDelegationMembers(delegation).map((member) => [
                member.fullName,
                member.username,
                member.classGroup
            ].join(' '))
        ].join(' ').toLowerCase();

        return haystack.includes(search);
    });
}

function renderDelegationList(registrations) {
    const list = document.getElementById('advancedAssignmentList');
    if (!list) {
        return;
    }

    if (!registrations.length) {
        list.innerHTML = '<p class="dashboard-empty">Nenhuma delegação encontrada para o conjunto de filtros atual.</p>';
        return;
    }

    list.innerHTML = registrations.map((delegation) => {
        const registration = delegation.registration || {};
        const members = getDelegationMembers(delegation);
        const matchLabel = getChoiceMatchLabel(delegation);
        const matchTone = getChoiceMatchTone(delegation);

        return `
            <article class="committee-user-card advanced-assignment-card" data-delegation-key="${delegation.key}">
                <div class="dashboard-user-card-top">
                    <h3>${getDelegationName(delegation)}</h3>
                    <span class="dashboard-chip">${members.length} / ${registration.teamSize || delegation.teamSize || members.length || 2}</span>
                </div>

                <div class="assignment-meta-grid">
                    <p><strong>Delegação:</strong> ${delegation.key || 'não informada'}</p>
                    <p><strong>Comitê final:</strong> ${getCommitteeLabel(delegation.committee)}</p>
                    <p><strong>1ª opção:</strong> ${getCommitteeLabel(registration.firstChoice)}</p>
                    <p><strong>2ª opção:</strong> ${getCommitteeLabel(registration.secondChoice)}</p>
                    <p><strong>3ª opção:</strong> ${getCommitteeLabel(registration.thirdChoice)}</p>
                    <p><strong>Status:</strong> <span class="assignment-badge ${matchTone}">${matchLabel}</span></p>
                </div>

                <div class="teammate-list delegation-member-list">
                    ${members.map((member) => {
                        const classInfo = parseClassGroup(member.classGroup);
                        return `
                            <div class="teammate-card">
                                <strong>${member.fullName || member.username || 'Participante'}</strong>
                                <span class="registration-muted">@${member.username || 'sem-usuario'}</span>
                                <span class="registration-muted">Unidade: ${classInfo.unit} | Série: ${classInfo.grade}</span>
                            </div>
                        `;
                    }).join('') || '<p class="dashboard-empty">Sem integrantes carregados nesta delegação.</p>'}
                </div>

                <div class="dashboard-inline-form advanced-assign-form">
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

function renderAllAdvancedData() {
    const filtered = applyFilters(registrationsCache);
    renderGlobalSummary(registrationsCache);
    renderFilteredSummary(filtered);
    renderCommitteeDemand(filtered);
    renderSegmentRanking(filtered);
    renderDelegationList(filtered);
    updateTimestamp();
}

async function loadRegistrations(options = {}) {
    const { forceFetch = false } = options;
    const loadBtn = document.getElementById('advancedLoadBtn');
    setButtonLoading(loadBtn, true, 'Aplicando...');

    try {
        if (forceFetch || !registrationsCache.length) {
            const response = await fetch('/api/users/registrations', {
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
            const { ok, data } = await parseJsonResponse(response);
            if (!ok) {
                throw new Error(data.error || 'Erro ao carregar delegações de inscrição.');
            }
            registrationsCache = Array.isArray(data) ? data : [];
        }

        renderAllAdvancedData();
    } catch (error) {
        const list = document.getElementById('advancedAssignmentList');
        if (list) {
            list.innerHTML = `<p class="dashboard-empty">${error.message || 'Erro ao carregar os dados.'}</p>`;
        }
    } finally {
        setButtonLoading(loadBtn, false, '');
    }
}

async function loadRegistrationControl() {
    const statusNode = document.getElementById('advancedRegistrationStatus');
    if (statusNode) {
        statusNode.textContent = 'Consultando status das inscrições...';
    }

    try {
        const response = await fetch('/api/settings/registration-status', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao consultar o status das inscrições.');
        }
        renderRegistrationControl(data);
    } catch (error) {
        if (statusNode) {
            statusNode.textContent = error.message || 'Não foi possível consultar o status das inscrições.';
        }
    }
}

async function toggleRegistrationStatus() {
    const button = document.getElementById('advancedToggleRegistrationBtn');
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
        renderRegistrationControl(data);
    } catch (error) {
        alert(error.message || 'Erro ao atualizar o status das inscrições.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function assignCommittee(assignButton) {
    const delegationKey = assignButton.dataset.delegationKey;
    const card = assignButton.closest('.advanced-assignment-card');
    const select = card?.querySelector('.manual-committee-select');
    const committeeValue = Number(select?.value);

    if (!delegationKey || !committeeValue) {
        alert('Selecione um comitê final antes de salvar.');
        return;
    }

    setButtonLoading(assignButton, true, 'Salvando...');

    try {
        const response = await fetch(`/api/users/delegations/${delegationKey}/committee`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ committee: committeeValue })
        });
        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao definir comitê da delegação.');
        }

        await loadRegistrations({ forceFetch: true });
    } catch (error) {
        alert(error.message || 'Erro ao definir comitê da delegação.');
    } finally {
        setButtonLoading(assignButton, false, '');
    }
}

async function exportResults(format) {
    const button = format === 'csv'
        ? document.getElementById('advancedExportCsvBtn')
        : document.getElementById('advancedExportXlsxBtn');

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
        link.download = `resultados-inscricoes-aprofundado.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert(error.message || 'Erro ao exportar resultados.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function exportSegmentResults(segment) {
    const isEm = segment === 'em';
    const button = isEm
        ? document.getElementById('advancedExportEmXlsxBtn')
        : document.getElementById('advancedExport89XlsxBtn');

    setButtonLoading(button, true, isEm ? 'Baixando EM...' : 'Baixando 8º/9º...');

    try {
        const response = await fetch(`/api/export/results/segment?segment=${encodeURIComponent(segment)}&format=xlsx`, {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Não foi possível exportar os resultados por segmento.');
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = isEm ? 'resultados-inscricoes-em.xlsx' : 'resultados-inscricoes-8e9.xlsx';
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    } catch (error) {
        alert(error.message || 'Erro ao exportar resultados por segmento.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

function resetFilters() {
    const defaults = [
        ['advancedPreferenceFilter', 'all'],
        ['advancedCommitteeTarget', 'all'],
        ['advancedAssignmentStatus', 'all'],
        ['advancedTeamSizeFilter', 'all']
    ];

    defaults.forEach(([id, value]) => {
        const node = document.getElementById(id);
        if (node) {
            node.value = value;
        }
    });

    const search = document.getElementById('advancedSearchFilter');
    if (search) {
        search.value = '';
    }

    renderAllAdvancedData();
}

async function verifyAccess() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login';
        return false;
    }

    try {
        const context = await window.MaxOnuSession?.getAuthContext?.();
        currentUser = context?.user || null;
        if (!currentUser) {
            window.location.href = '/login';
            return false;
        }

        if (!ALLOWED_ROLES.has(currentUser.role)) {
            window.location.href = '/profile';
            return false;
        }

        setupPageHeader(currentUser);
        return true;
    } catch (error) {
        window.location.href = '/login';
        return false;
    }
}

function initPageEvents() {
    document.getElementById('advancedToggleRegistrationBtn')?.addEventListener('click', toggleRegistrationStatus);
    document.getElementById('advancedRefreshBtn')?.addEventListener('click', async () => {
        await Promise.all([
            loadRegistrationControl(),
            loadRegistrations({ forceFetch: true })
        ]);
    });
    document.getElementById('advancedLoadBtn')?.addEventListener('click', () => {
        loadRegistrations({ forceFetch: false });
    });
    document.getElementById('advancedResetBtn')?.addEventListener('click', resetFilters);
    document.getElementById('advancedExportCsvBtn')?.addEventListener('click', () => exportResults('csv'));
    document.getElementById('advancedExportXlsxBtn')?.addEventListener('click', () => exportResults('xlsx'));
    document.getElementById('advancedExportEmXlsxBtn')?.addEventListener('click', () => exportSegmentResults('em'));
    document.getElementById('advancedExport89XlsxBtn')?.addEventListener('click', () => exportSegmentResults('fundamental'));

    document.getElementById('advancedSearchFilter')?.addEventListener('input', () => {
        renderAllAdvancedData();
    });

    ['advancedPreferenceFilter', 'advancedCommitteeTarget', 'advancedAssignmentStatus', 'advancedTeamSizeFilter']
        .forEach((id) => {
            document.getElementById(id)?.addEventListener('change', () => renderAllAdvancedData());
        });

    document.getElementById('advancedAssignmentList')?.addEventListener('click', (event) => {
        const button = event.target.closest('.assign-committee-btn');
        if (!button) {
            return;
        }
        assignCommittee(button);
    });
}

async function initAdvancedDashboard() {
    const allowed = await verifyAccess();
    if (!allowed) {
        return;
    }

    initPageEvents();
    await Promise.all([
        loadRegistrationControl(),
        loadRegistrations({ forceFetch: true })
    ]);
}

document.addEventListener('DOMContentLoaded', initAdvancedDashboard);
