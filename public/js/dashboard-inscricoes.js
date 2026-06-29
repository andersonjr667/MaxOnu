// Utility Functions
const COMMITTEE_LABELS = {
    1: 'CDH 2026 — O Paradoxo da Hiperconectividade: Regulamentação da Vigilância Massiva, Ética da Inteligência Artificial e Proteção da Democracia na Era do Big Data',
    2: 'AGNU — Guerra, Multipolaridade e Disputas Territoriais: Desafios à Soberania, Segurança Global e Justiça Internacional no Século XXI',
    3: 'ACNUR — Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias',
    4: 'Bioética e Genética Humana — Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e os direitos das futuras gerações',
    5: 'Nova Ordem Global — A Nova Ordem Global em Disputa: Recursos Estratégicos, Poder e os Limites do Capitalismo no Século XXI',
    6: 'UNHRC — Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado',
    7: 'ONU Mulheres (CSW/2026) — Vozes, Leis e Limites: O Desafio de Enfrentar a Violência contra Mulheres'
};

const ALLOWED_ROLES = new Set(['admin', 'coordinator', 'teacher']);

let currentUser = null;
let registrationsCache = [];
let exportModalReturnFocus = null;
let isDetailedOverviewVisible = true;

const QUICK_EXPORT_ENDPOINTS = {
    all: { url: '/api/export/results', filename: 'todos-inscritos.xlsx' },
    delegations: { url: '/api/export/results/delegations', filename: 'delegacoes-comites.xlsx' },
    'segment-em': { url: '/api/export/results/segment?segment=em', filename: 'inscritos-ensino-medio.xlsx' },
    'segment-89': { url: '/api/export/results/segment?segment=fundamental', filename: 'inscritos-89.xlsx' },
    'by-unit': { url: '/api/export/results/by-unit', filename: 'delegacoes-por-unidade.xlsx' },
    'committee-1': { url: '/api/export/results/by-committee/1', filename: 'comite-1.xlsx' },
    'committee-2': { url: '/api/export/results/by-committee/2', filename: 'comite-2.xlsx' },
    'committee-3': { url: '/api/export/results/by-committee/3', filename: 'comite-3.xlsx' },
    'committee-4': { url: '/api/export/results/by-committee/4', filename: 'comite-4.xlsx' },
    'committee-5': { url: '/api/export/results/by-committee/5', filename: 'comite-5.xlsx' },
    'committee-6': { url: '/api/export/results/by-committee/6', filename: 'comite-6.xlsx' },
    'committee-7': { url: '/api/export/results/by-committee/7', filename: 'comite-7.xlsx' }
};

// ===== TOKEN & AUTH =====
function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getToken()}`
    };
}

// ===== PARSING & NORMALIZATION =====
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

function normalizeTextForSegmentDetection(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'))
        .replace(/\s+/g, ' ')
        .trim();
}

function getEducationSegmentFromText(value = '') {
    const original = String(value || '').toLowerCase();
    const normalized = normalizeTextForSegmentDetection(value);
    const noSpaces = normalized.replace(/\s/g, '');

    // Detectar Ensino Médio
    if (
        normalized.includes('ensino medio') ||
        noSpaces.includes('ensinomedio') ||
        normalized.includes('medio') ||
        /\bem\b/.test(normalized) ||
        original.includes('1º') ||
        original.includes('2º') ||
        original.includes('3º') ||
        original.includes('1ª') ||
        original.includes('2ª') ||
        original.includes('3ª')
    ) {
        return 'em';
    }

    // Detectar Fundamental (8º-9º)
    if (
        normalized.includes('8o') ||
        normalized.includes('8 ano') ||
        noSpaces.includes('8ano') ||
        normalized.includes('9o') ||
        normalized.includes('9 ano') ||
        noSpaces.includes('9ano') ||
        normalized.includes('8 e 9') ||
        normalized.includes('8/9') ||
        original.includes('8º') ||
        original.includes('8ª') ||
        original.includes('9º') ||
        original.includes('9ª')
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

function getCommitteeLabel(value) {
    const number = Number(value);
    return COMMITTEE_LABELS[number] || 'Não definido';
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

function roleLabel(role) {
    const labels = {
        teacher: 'Professor orientador',
        coordinator: 'Coordenador',
        admin: 'Administrador'
    };
    return labels[role] || 'Usuário';
}

// ===== HTTP UTILITIES =====
async function parseJsonResponse(response) {
    try {
        const data = await response.json();
        return { ok: response.ok, data };
    } catch {
        return { ok: response.ok, data: {} };
    }
}

async function fetchWithAuth(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: getAuthHeaders()
    });

    return parseJsonResponse(response);
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

// ===== DOWNLOAD HELPER =====
function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function sanitizeFilename(filename) {
    return filename
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9\-._]/g, '-')
        .replace(/\-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase();
}

function normalizeGradePart(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'))
        .replace(/[^\w]/g, '');
}

function normalizeClassGroupForComparison(classGroup = '') {
    const normalized = String(classGroup || '').trim();
    if (!normalized) return '';

    const parts = normalized.split(' - ');
    const gradePart = (parts[1] || parts[0] || '').trim();

    return normalizeGradePart(gradePart);
}

function getDelegationClassGroups(delegation) {
    const values = new Set();

    if (delegation?.registration?.classGroup) {
        values.add(String(delegation.registration.classGroup));
    }

    if (delegation?.classGroup) {
        values.add(String(delegation.classGroup));
    }

    getDelegationMembers(delegation).forEach((member) => {
        if (member?.classGroup) {
            values.add(String(member.classGroup));
        }
    });

    return Array.from(values);
}

function getDelegationUnits(delegation) {
    return getDelegationClassGroups(delegation)
        .map((classGroup) => String(classGroup || '').split(' - ')[0]?.trim() || '')
        .filter(Boolean);
}

function getCustomExportColumnValues() {
    return Array.from(document.querySelectorAll('input[name="customExportColumn"]:checked')).map((cb) => cb.value);
}

function getCustomExportTurmaValues() {
    const allTurmas = document.getElementById('customExportTurmaAll')?.checked;

    if (allTurmas) {
        return ['all'];
    }

    return Array.from(document.querySelectorAll('input[name="customExportTurma"]:checked:not(#customExportTurmaAll)')).map((cb) => cb.value);
}

function getCustomExportFilters() {
    return {
        committee: document.getElementById('customExportCommittee')?.value || 'all',
        unit: document.getElementById('customExportUnit')?.value || 'all',
        preference: document.getElementById('customExportPreference')?.value || 'final',
        status: document.getElementById('customExportStatus')?.value || 'all',
        turmas: getCustomExportTurmaValues(),
        columns: getCustomExportColumnValues()
    };
}

function getDelegationCommitteeForPreference(delegation, preference) {
    if (preference === 'first') return Number(delegation?.registration?.firstChoice);
    if (preference === 'second') return Number(delegation?.registration?.secondChoice);
    if (preference === 'third') return Number(delegation?.registration?.thirdChoice);
    return Number(delegation?.committee);
}

function matchesCustomExportCommittee(delegation, committee, preference) {
    const assignedCommittee = Number(delegation?.committee);
    const preferredCommittee = getDelegationCommitteeForPreference(delegation, preference);

    if (committee === 'unassigned') {
        return !(assignedCommittee >= 1 && assignedCommittee <= 7);
    }

    if (committee !== 'all') {
        if (preference === 'final') {
            return assignedCommittee === Number(committee);
        }

        return preferredCommittee === Number(committee);
    }

    return true;
}

function matchesCustomExportUnit(delegation, unit) {
    if (unit === 'all') return true;
    return getDelegationUnits(delegation).includes(unit);
}

function matchesCustomExportStatus(delegation, status) {
    const assignedCommittee = Number(delegation?.committee);
    const isAssigned = assignedCommittee >= 1 && assignedCommittee <= 7;

    if (status === 'assigned') return isAssigned;
    if (status === 'unassigned') return !isAssigned;
    return true;
}

function matchesCustomExportTurmas(delegation, turmas) {
    if (!Array.isArray(turmas) || !turmas.length || (turmas.length === 1 && turmas[0] === 'all')) {
        return true;
    }

    const dataTurmas = getDelegationClassGroups(delegation)
        .map((classGroup) => normalizeClassGroupForComparison(classGroup))
        .filter(Boolean);

    const selectedTurmas = turmas
        .map((turma) => normalizeGradePart(turma))
        .filter(Boolean);

    return selectedTurmas.some((selectedTurma) =>
        dataTurmas.some((classGroup) =>
            classGroup === selectedTurma ||
            classGroup.includes(selectedTurma) ||
            selectedTurma.includes(classGroup)
        )
    );
}

function getCustomExportPreviewRows(filters = getCustomExportFilters()) {
    return registrationsCache.filter((delegation) => {
        if (!matchesCustomExportCommittee(delegation, filters.committee, filters.preference)) return false;
        if (!matchesCustomExportUnit(delegation, filters.unit)) return false;
        if (!matchesCustomExportStatus(delegation, filters.status)) return false;
        if (!matchesCustomExportTurmas(delegation, filters.turmas)) return false;
        return true;
    });
}

function getCustomExportTurmaLabel() {
    const allTurmas = document.getElementById('customExportTurmaAll')?.checked;
    if (allTurmas) return 'Todas as turmas';

    const labels = Array.from(document.querySelectorAll('input[name="customExportTurma"]:checked:not(#customExportTurmaAll)'))
        .map((cb) => cb.nextElementSibling?.textContent?.trim() || cb.value)
        .filter(Boolean);

    return labels.length ? labels.join(', ') : 'Nenhuma turma';
}

function buildCustomExportFilename(filters = getCustomExportFilters(), rowCount = 0) {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const parts = ['export-personalizado'];

    if (filters.committee && filters.committee !== 'all') {
        parts.push(`comite-${filters.committee === 'unassigned' ? 'sem' : filters.committee}`);
    }

    if (filters.unit && filters.unit !== 'all') {
        parts.push(filters.unit);
    }

    if (filters.status && filters.status !== 'all') {
        parts.push(filters.status === 'assigned' ? 'alocados' : 'sem-comite');
    }

    if (filters.preference && filters.preference !== 'final') {
        parts.push(`pref-${filters.preference}`);
    }

    if (Array.isArray(filters.turmas) && !(filters.turmas.length === 1 && filters.turmas[0] === 'all')) {
        parts.push(`turmas-${filters.turmas.length}`);
    }

    if (Number.isFinite(rowCount) && rowCount >= 0) {
        parts.push(`${rowCount}-registros`);
    }

    parts.push(dateStamp);

    return `${sanitizeFilename(parts.join('-'))}.xlsx`;
}

function updateCustomExportPreview() {
    const previewRows = getCustomExportPreviewRows();
    const filters = getCustomExportFilters();

    const previewCount = document.getElementById('customExportPreviewCount');
    const previewCols = document.getElementById('customExportPreviewCols');
    const previewTurmas = document.getElementById('customExportPreviewTurmas');
    const previewPreference = document.getElementById('customExportPreviewPreference');
    const previewFilename = document.getElementById('customExportPreviewFilename');

    if (previewCount) {
        previewCount.textContent = String(previewRows.length);
    }

    if (previewCols) {
        previewCols.textContent = String(filters.columns.length);
    }

    if (previewTurmas) {
        previewTurmas.textContent = getCustomExportTurmaLabel();
    }

    if (previewPreference) {
        const labels = {
            final: 'Comitê final',
            first: '1ª opção',
            second: '2ª opção',
            third: '3ª opção'
        };
        previewPreference.textContent = labels[filters.preference] || 'Comitê final';
    }

    if (previewFilename) {
        previewFilename.textContent = buildCustomExportFilename(filters, previewRows.length);
    }
}

// ===== VERIFICATION & ACCESS =====
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

        return true;
    } catch (error) {
        console.error('Erro ao verificar acesso:', error);
        window.location.href = '/login';
        return false;
    }
}

// ===== RENDERING DATA =====
function updateTimestamp() {
    const node = document.getElementById('advancedUpdatedAt');
    if (!node) return;

    const now = new Date();
    node.textContent = `Última atualização: ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR')}.`;
}

function setupPageHeader(user) {
    const lead = document.getElementById('advancedLead');
    const roleBadge = document.getElementById('advancedRoleBadge');

    if (lead) {
        lead.textContent = `${roleLabel(user.role)} autenticado. Controle aprofundado de inscrições, alocações por delegação e exportações customizadas.`;
    }

    if (roleBadge) {
        roleBadge.textContent = roleLabel(user.role);
        roleBadge.dataset.role = user.role || 'user';
    }
}

function buildCommitteeSelectOptions(selectedCommittee) {
    return ['<option value="">Não definido</option>']
        .concat(
            Array.from({ length: 7 }, (_, i) => {
                const value = i + 1;
                const selected = Number(selectedCommittee) === value ? ' selected' : '';
                return `<option value="${value}"${selected}>${getCommitteeLabel(value)}</option>`;
            })
        )
        .join('');
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
    if (label.includes('1ª')) return 'is-good';
    if (label.includes('2ª') || label.includes('3ª')) return 'is-warn';
    return 'is-neutral';
}

function renderRegistrationControl(status) {
    const toggleButton = document.getElementById('advancedToggleRegistrationBtn');
    const statusNode = document.getElementById('advancedRegistrationStatus');
    const detailsGrid = document.getElementById('registrationStatusMeta');

    if (!toggleButton || !statusNode || !detailsGrid) return;

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

    detailsGrid.innerHTML = details
        .map((item) => `<article class="feature-card registration-status-item"><h3>${item.title}</h3><p>${item.value}</p></article>`)
        .join('');
}

function calculateGlobalMetrics(registrations) {
    const total = registrations.length;
    const assigned = registrations.filter((item) => {
        const committee = Number(item.committee);
        return committee >= 1 && committee <= 7;
    }).length;
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
    if (!summary) return;

    const metrics = calculateGlobalMetrics(registrations);
    const cards = [
        { title: 'Delegações totais', text: String(metrics.total), accent: 'blue-accent' },
        { title: 'Comitê final definido', text: String(metrics.assigned), accent: '' },
        { title: 'Sem comitê final', text: String(metrics.unassigned), accent: '' },
        { title: 'Aderência à 1ª opção', text: String(metrics.first), accent: 'blue-accent' },
        { title: 'Aderência à 2ª/3ª', text: String(metrics.secondOrThird), accent: '' }
    ];

    summary.innerHTML = cards
        .map((card) => `<article class="feature-card ${card.accent}"><h3>${card.title}</h3><p>${card.text}</p></article>`)
        .join('');
}

function renderFilteredSummary(filtered) {
    const summary = document.getElementById('advancedFilteredSummary');
    if (!summary) return;

    const metrics = calculateGlobalMetrics(filtered);
    const cards = [
        { title: 'Resultado filtrado', text: `${metrics.total} delegações` },
        { title: 'Comitê definido (filtro)', text: String(metrics.assigned) },
        { title: 'Pendentes no filtro', text: String(metrics.unassigned) },
        { title: 'Aderência à 1ª no filtro', text: String(metrics.first) }
    ];

    summary.innerHTML = cards
        .map((card) => `<article class="feature-card"><h3>${card.title}</h3><p>${card.text}</p></article>`)
        .join('');
}

function renderCommitteeDemand(registrations) {
    const container = document.getElementById('advancedCommitteeDemand');
    if (!container) return;

    const counters = Array.from({ length: 7 }, (_, i) => ({
        committee: i + 1,
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

    container.innerHTML = counters
        .map((row) => `
            <article class="feature-card advanced-demand-card">
                <h3>${getCommitteeLabel(row.committee)}</h3>
                <p><strong>1ª opção:</strong> ${row.first}</p>
                <p><strong>2ª opção:</strong> ${row.second}</p>
                <p><strong>3ª opção:</strong> ${row.third}</p>
                <p><strong>Alocados:</strong> ${row.assigned}</p>
            </article>
        `)
        .join('');
}

function computeFirstChoiceRankingBySegment(registrations) {
    const groups = {
        em: new Map(),
        fundamental: new Map()
    };

    registrations.forEach((delegation) => {
        const segment = getDelegationEducationSegment(delegation);
        if (!segment || !groups[segment]) return;

        const firstChoice = Number(delegation?.registration?.firstChoice);
        if (!Number.isInteger(firstChoice) || firstChoice < 1 || firstChoice > 7) return;

        groups[segment].set(firstChoice, (groups[segment].get(firstChoice) || 0) + 1);
    });

    const toRanking = (map) => 
        Array.from({ length: 7 }, (_, i) => ({
            committee: i + 1,
            count: map.get(i + 1) || 0
        }))
            .sort((a, b) => b.count - a.count || a.committee - b.committee)
            .slice(0, 7);

    return {
        em: toRanking(groups.em),
        fundamental: toRanking(groups.fundamental)
    };
}

function renderSegmentRankingCard(title, ranking) {
    const countFrequency = ranking.reduce((acc, item) => {
        const key = String(item.count);
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    return `
        <article class="feature-card advanced-segment-card">
            <h3>${title}</h3>
            <ol class="advanced-segment-list">
                ${ranking
                    .map((item, index) => {
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
                    })
                    .join('')}
            </ol>
        </article>
    `;
}

function renderSegmentRanking(registrations) {
    const container = document.getElementById('advancedSegmentRanking');
    if (!container) return;

    const ranking = computeFirstChoiceRankingBySegment(registrations);
    container.innerHTML = [
        renderSegmentRankingCard('Ranking EM (mais escolhidos)', ranking.em),
        renderSegmentRankingCard('Ranking 8º/9º ano (mais escolhidos)', ranking.fundamental)
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

        if (assignmentStatus === 'assigned' && !assigned) return false;
        if (assignmentStatus === 'unassigned' && assigned) return false;
        if (teamSizeFilter !== 'all' && teamSize !== Number(teamSizeFilter)) return false;

        if (preference === 'unassigned' && assigned) return false;

        if (preference !== 'all' && preference !== 'unassigned') {
            const choiceValue = Number(registration[`${preference}Choice`]);
            if (!Number.isInteger(choiceValue) || choiceValue < 1 || choiceValue > 7) return false;

            if (committeeTarget !== 'all' && choiceValue !== Number(committeeTarget)) return false;
        }

        if (!search) return true;

        const haystack = [
            getDelegationName(delegation),
            delegation?.key,
            registration?.classGroup,
            ...getDelegationMembers(delegation).map((member) =>
                [member.fullName, member.username, member.classGroup].join(' ')
            )
        ]
            .join(' ')
            .toLowerCase();

        return haystack.includes(search);
    });
}

function renderDelegationList(registrations) {
    const list = document.getElementById('advancedAssignmentList');
    if (!list) return;

    if (!registrations.length) {
        list.innerHTML = '<p class="dashboard-empty">Nenhuma delegação encontrada para o conjunto de filtros atual.</p>';
        return;
    }

    list.innerHTML = registrations
        .map((delegation) => {
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
                        ${
                            members.length
                                ? members
                                      .map((member) => {
                                          const classInfo = parseClassGroup(member.classGroup);
                                          return `
                                            <div class="teammate-card">
                                                <strong>${member.fullName || member.username || 'Participante'}</strong>
                                                <span class="registration-muted">@${member.username || 'sem-usuario'}</span>
                                                <span class="registration-muted">Unidade: ${classInfo.unit} | Série: ${classInfo.grade}</span>
                                            </div>
                                        `;
                                      })
                                      .join('')
                                : '<p class="dashboard-empty">Sem integrantes carregados nesta delegação.</p>'
                        }
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
        })
        .join('');
}

function setDetailedOverviewVisibility(visible) {
    const container = document.getElementById('advancedDetailedOverviewSection');
    const toggleButton = document.getElementById('advancedToggleDetailedViewBtn');

    isDetailedOverviewVisible = visible;

    if (container) {
        container.style.display = visible ? '' : 'none';
    }

    if (toggleButton) {
        toggleButton.textContent = visible ? 'Ocultar painel filtrado' : 'Mostrar painel filtrado';
    }
}

function toggleDetailedOverview() {
    setDetailedOverviewVisibility(!isDetailedOverviewVisible);
}

function renderAllAdvancedData() {
    const filtered = applyFilters(registrationsCache);
    renderGlobalSummary(registrationsCache);
    renderFilteredSummary(filtered);
    renderCommitteeDemand(filtered);
    renderSegmentRanking(filtered);
    renderDelegationList(filtered);
    updateTimestamp();
    updateCustomExportPreview();
}

// ===== LOAD DATA =====
async function loadRegistrations(options = {}) {
    const { forceFetch = false } = options;
    const loadBtn = document.getElementById('advancedLoadBtn');
    setButtonLoading(loadBtn, true, 'Aplicando...');

    try {
        if (forceFetch || !registrationsCache.length) {
            const { ok, data } = await fetchWithAuth('/api/users/registrations');

            if (!ok) {
                throw new Error(data.error || 'Erro ao carregar delegações de inscrição.');
            }

            registrationsCache = Array.isArray(data) ? data : [];
        }

        renderAllAdvancedData();
        updateCustomExportPreview();
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
        const { ok, data } = await fetchWithAuth('/api/settings/registration-status');

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

// ===== ACTIONS =====
async function toggleRegistrationStatus() {
    const button = document.getElementById('advancedToggleRegistrationBtn');
    const currentlyClosed = button?.dataset.closed === 'true';

    setButtonLoading(button, true, currentlyClosed ? 'Reabrindo...' : 'Fechando...');

    try {
        const { ok, data } = await fetchWithAuth('/api/settings/registration-status', {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ registrationManuallyClosed: !currentlyClosed })
        });

        if (!ok) {
            throw new Error(data.error || 'Erro ao atualizar o status das inscrições.');
        }

        renderRegistrationControl(data);
    } catch (error) {
        if (window.MaxOnuNotify) {
            MaxOnuNotify.error(error.message || 'Erro ao atualizar o status das inscrições.');
        }
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function assignCommittee(button) {
    const delegationKey = button.dataset.delegationKey;
    const card = button.closest('.advanced-assignment-card');
    const select = card?.querySelector('.manual-committee-select');
    const committeeValue = Number(select?.value);

    if (!delegationKey || !committeeValue) {
        if (window.MaxOnuNotify) {
            MaxOnuNotify.warning('Selecione um comitê final antes de salvar.');
        }
        return;
    }

    setButtonLoading(button, true, 'Salvando...');

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
        if (window.MaxOnuNotify) {
            MaxOnuNotify.error(error.message || 'Erro ao definir comitê da delegação.');
        }
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
        if (node) node.value = value;
    });

    const search = document.getElementById('advancedSearchFilter');
    if (search) search.value = '';

    renderAllAdvancedData();
}

// ===== MODAL MANAGEMENT =====
function openExportModal() {
    const overlay = document.getElementById('exportModalOverlay');
    const closeBtn = document.getElementById('exportModalCloseBtn');

    if (!overlay) return;

    exportModalReturnFocus = /** @type {HTMLElement | null} */ (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    updateCustomExportPreview();

    requestAnimationFrame(() => {
        closeBtn?.focus({ preventScroll: true });
    });
}

function closeExportModal() {
    const overlay = document.getElementById('exportModalOverlay');

    if (!overlay) return;

    overlay.hidden = true;
    document.body.style.overflow = '';

    const returnFocus = exportModalReturnFocus;
    exportModalReturnFocus = null;

    if (returnFocus && typeof returnFocus.focus === 'function' && document.contains(returnFocus)) {
        requestAnimationFrame(() => returnFocus.focus({ preventScroll: true }));
    }
}

// ===== QUICK EXPORTS =====
async function downloadQuickExport(exportType, button) {
    const endpoint = QUICK_EXPORT_ENDPOINTS[exportType];

    if (!endpoint) {
        if (window.MaxOnuNotify) MaxOnuNotify.error('Tipo de export desconhecido.');
        return;
    }

    setButtonLoading(button, true, 'Baixando...');

    try {
        const response = await fetch(endpoint.url, { headers: getAuthHeaders() });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Erro ao exportar.');
        }

        const blob = await response.blob();
        triggerDownload(blob, endpoint.filename);
    } catch (error) {
        if (window.MaxOnuNotify) {
            MaxOnuNotify.error(error.message || 'Erro ao exportar.');
        }
    } finally {
        setButtonLoading(button, false, '');
    }
}

// ===== CUSTOM EXPORT =====
async function exportCustom() {
    const button = document.getElementById('advancedExportCustomBtn');
    const filters = getCustomExportFilters();
    const previewRows = getCustomExportPreviewRows(filters);

    if (!filters.columns.length) {
        if (window.MaxOnuNotify) MaxOnuNotify.warning('Selecione ao menos uma coluna.');
        return;
    }

    if (!filters.turmas.length) {
        if (window.MaxOnuNotify) MaxOnuNotify.warning('Selecione ao menos uma turma.');
        return;
    }

    setButtonLoading(button, true, 'Gerando...');

    try {
        const params = new URLSearchParams({
            turmas: filters.turmas.join(','),
            unit: filters.unit,
            committee: filters.committee,
            preference: filters.preference,
            status: filters.status,
            cols: filters.columns.join(',')
        });

        const response = await fetch(`/api/export/results/custom?${params.toString()}`, {
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Erro ao gerar export personalizado.');
        }

        const blob = await response.blob();
        const filename = buildCustomExportFilename(filters, previewRows.length);
        triggerDownload(blob, filename);
    } catch (error) {
        if (window.MaxOnuNotify) {
            MaxOnuNotify.error(error.message || 'Erro ao gerar export personalizado.');
        }
    } finally {
        setButtonLoading(button, false, '');
    }
}

// ===== MODAL TURMAS LOGIC =====
function initTurmasToggle() {
    const allCheckbox = document.getElementById('customExportTurmaAll');
    const specificCheckboxes = () =>
        Array.from(document.querySelectorAll('input[name="customExportTurma"]:not(#customExportTurmaAll)'));

    if (!allCheckbox) return;

    allCheckbox.addEventListener('change', () => {
        const locked = allCheckbox.checked;

        specificCheckboxes().forEach((cb) => {
            cb.checked = false;
            cb.disabled = locked;
        });

        updateCustomExportPreview();
    });

    specificCheckboxes().forEach((cb) => {
        cb.addEventListener('change', () => {
            if (cb.checked) {
                allCheckbox.checked = false;
                specificCheckboxes().forEach((item) => {
                    item.disabled = false;
                });
            }

            const anyChecked = specificCheckboxes().some((item) => item.checked);
            if (!anyChecked) {
                allCheckbox.checked = true;
                specificCheckboxes().forEach((item) => {
                    item.checked = false;
                    item.disabled = true;
                });
            }

            updateCustomExportPreview();
        });
    });

    specificCheckboxes().forEach((cb) => {
        cb.disabled = allCheckbox.checked;
    });
}

function initCustomExportFilterListeners() {
    const fields = ['customExportCommittee', 'customExportUnit', 'customExportStatus'];
    fields.push('customExportPreference');

    fields.forEach((fieldId) => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', updateCustomExportPreview);
        }
    });

    document.querySelectorAll('input[name="customExportColumn"]').forEach((cb) => {
        cb.addEventListener('change', updateCustomExportPreview);
    });
}

// ===== EVENT LISTENERS =====
function initEventListeners() {
    // Header buttons
    document.getElementById('advancedToggleRegistrationBtn')?.addEventListener('click', toggleRegistrationStatus);
    document.getElementById('advancedLoadBtn')?.addEventListener('click', () => loadRegistrations({ forceFetch: false }));
    document.getElementById('advancedRefreshBtn')?.addEventListener('click', () => loadRegistrations({ forceFetch: true }));
    document.getElementById('advancedResetBtn')?.addEventListener('click', resetFilters);
    document.getElementById('advancedToggleDetailedViewBtn')?.addEventListener('click', toggleDetailedOverview);

    // Modal
    document.getElementById('advancedOpenExportModalBtn')?.addEventListener('click', openExportModal);
    document.getElementById('exportModalCloseBtn')?.addEventListener('click', closeExportModal);

    document.getElementById('exportModalOverlay')?.addEventListener('click', (e) => {
        if (e.target.id === 'exportModalOverlay') {
            closeExportModal();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeExportModal();
        }
    });

    // Quick exports
    document.querySelectorAll('[data-export-type]').forEach((button) => {
        button.addEventListener('click', () => downloadQuickExport(button.dataset.exportType, button));
    });

    // Custom export
    document.getElementById('advancedExportCustomBtn')?.addEventListener('click', exportCustom);

    // Filters
    document.getElementById('advancedSearchFilter')?.addEventListener('input', () => renderAllAdvancedData());

    ['advancedPreferenceFilter', 'advancedCommitteeTarget', 'advancedAssignmentStatus', 'advancedTeamSizeFilter'].forEach(
        (id) => {
            document.getElementById(id)?.addEventListener('change', () => renderAllAdvancedData());
        }
    );

    // Delegation assignment
    document.getElementById('advancedAssignmentList')?.addEventListener('click', (event) => {
        const button = event.target.closest('.assign-committee-btn');
        if (button) assignCommittee(button);
    });

    document.getElementById('mxHeadLogoutBtnDrawer')?.addEventListener('click', () => {
        window.MaxOnuSession?.clearAuth?.();
        window.location.href = '/';
    });

    // Turmas & custom export modal
    initTurmasToggle();
    initCustomExportFilterListeners();
}

// ===== INITIALIZATION =====
async function initialize() {
    const allowed = await verifyAccess();
    if (!allowed) return;

    setupPageHeader(currentUser);
    initEventListeners();

    try {
        await Promise.all([loadRegistrationControl(), loadRegistrations({ forceFetch: true })]);
    } catch (error) {
        console.error('Erro ao inicializar dashboard:', error);
        if (window.MaxOnuNotify) {
            MaxOnuNotify.error('Erro ao carregar dados do dashboard.');
        }
    }
}

document.addEventListener('DOMContentLoaded', initialize);
