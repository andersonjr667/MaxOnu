const COMMITTEE_LABELS = {
    1: 'Conselho de Direitos Humanos (CDH - 2026)',
    2: 'Assembleia Geral das Nações Unidas (AGNU)',
    3: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global',
    6: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    7: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)'
};

const ALLOWED_ROLES = new Set(['admin', 'coordinator', 'teacher']);
let allCandidates = [];
let expandedUserId = null;
let currentOperator = null;

function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

function getAuthHeaders() {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getToken()}`
    };
}

function roleLabel(role) {
    if (role === 'admin') return 'Administrador';
    if (role === 'coordinator') return 'Coordenação';
    if (role === 'teacher') return 'Professor orientador';
    if (role === 'candidate') return 'Aluno';
    return 'Usuário';
}

function accountStatusLabel(status) {
    if (status === 'banned') return 'Banido';
    if (status === 'expelled') return 'Expulso';
    return 'Ativo';
}

function getProfileImageUrls(user = {}) {
    const fallback = user.gender === 'feminino'
        ? '/images/profile_female.png'
        : '/images/profile_male.png';

    return {
        src: user.profileImageUrl || fallback,
        fallback
    };
}

function formatDate(value) {
    if (!value) return 'Não informado';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Não informado';
    return date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function getCommitteeLabel(value) {
    const num = Number(value);
    return COMMITTEE_LABELS[num] || 'Não definido';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseJsonResponse(response) {
    return response.json().catch(() => ({}));
}

function getVerificationId(user) {
    return user?._id || user?.id || '';
}

function parseClassGroup(classGroup = '') {
    const normalized = String(classGroup || '').trim();
    if (!normalized) {
        return {
            college: '',
            room: ''
        };
    }

    const separatorIndex = normalized.indexOf(' - ');
    if (separatorIndex === -1) {
        return {
            college: normalized,
            room: normalized
        };
    }

    return {
        college: normalized.slice(0, separatorIndex).trim(),
        room: normalized.slice(separatorIndex + 3).trim()
    };
}

function parseDateOnly(value) {
    if (!value) return null;
    const parsed = new Date(`${value}T00:00:00`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getUserCreatedAtDate(user) {
    const parsed = new Date(user.createdAt);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isWithinDateRange(user, fromValue, toValue) {
    if (!fromValue && !toValue) {
        return true;
    }

    const createdAt = getUserCreatedAtDate(user);
    if (!createdAt) {
        return false;
    }

    const fromDate = parseDateOnly(fromValue);
    if (fromDate && createdAt < fromDate) {
        return false;
    }

    const toDate = parseDateOnly(toValue);
    if (toDate) {
        const endOfDay = new Date(toDate);
        endOfDay.setHours(23, 59, 59, 999);
        if (createdAt > endOfDay) {
            return false;
        }
    }

    return true;
}

function matchesFilter(user, queryText, committeeFilter, collegeFilter, classGroupFilter, createdFrom, createdTo) {
    const classInfo = parseClassGroup(user.classGroup);
    const haystack = [
        user.fullName,
        user.username,
        user.email,
        user.classGroup,
        user.country,
        classInfo.college,
        classInfo.room
    ].join(' ').toLowerCase();

    const textOk = !queryText || haystack.includes(queryText);
    if (!textOk) {
        return false;
    }

    if (collegeFilter !== 'all' && classInfo.college !== collegeFilter) {
        return false;
    }

    if (classGroupFilter !== 'all' && user.classGroup !== classGroupFilter) {
        return false;
    }

    if (!isWithinDateRange(user, createdFrom, createdTo)) {
        return false;
    }

    if (committeeFilter === 'all') {
        return true;
    }

    if (committeeFilter === 'none') {
        return !Number.isInteger(Number(user.committee));
    }

    return Number(user.committee) === Number(committeeFilter);
}

function sortUsers(users, sortBy) {
    const list = [...users];

    list.sort((a, b) => {
        const nameA = String(a.fullName || a.username || '').toLowerCase();
        const nameB = String(b.fullName || b.username || '').toLowerCase();
        const classA = String(a.classGroup || '').toLowerCase();
        const classB = String(b.classGroup || '').toLowerCase();
        const committeeA = Number.isInteger(Number(a.committee)) ? Number(a.committee) : 999;
        const committeeB = Number.isInteger(Number(b.committee)) ? Number(b.committee) : 999;
        const createdA = getUserCreatedAtDate(a)?.getTime() || 0;
        const createdB = getUserCreatedAtDate(b)?.getTime() || 0;

        if (sortBy === 'created_asc') return createdA - createdB || nameA.localeCompare(nameB);
        if (sortBy === 'name_asc') return nameA.localeCompare(nameB);
        if (sortBy === 'name_desc') return nameB.localeCompare(nameA);
        if (sortBy === 'class_asc') return classA.localeCompare(classB) || nameA.localeCompare(nameB);
        if (sortBy === 'committee_asc') return committeeA - committeeB || nameA.localeCompare(nameB);

        return createdB - createdA || nameA.localeCompare(nameB);
    });

    return list;
}

function populateDynamicFilters(users) {
    const collegeSelect = document.getElementById('userCollegeFilter');
    const classGroupSelect = document.getElementById('userClassGroupFilter');
    if (!collegeSelect || !classGroupSelect) {
        return;
    }

    const selectedCollege = collegeSelect.value || 'all';
    const selectedClassGroup = classGroupSelect.value || 'all';

    const colleges = Array.from(new Set(users
        .map((user) => parseClassGroup(user.classGroup).college)
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    collegeSelect.innerHTML = [
        '<option value="all">Todos</option>',
        ...colleges.map((college) => `<option value="${escapeHtml(college)}">${escapeHtml(college)}</option>`)
    ].join('');

    if (selectedCollege !== 'all' && colleges.includes(selectedCollege)) {
        collegeSelect.value = selectedCollege;
    }

    const effectiveCollege = collegeSelect.value || 'all';
    const classGroups = Array.from(new Set(users
        .filter((user) => effectiveCollege === 'all' || parseClassGroup(user.classGroup).college === effectiveCollege)
        .map((user) => String(user.classGroup || '').trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));

    classGroupSelect.innerHTML = [
        '<option value="all">Todas</option>',
        ...classGroups.map((group) => `<option value="${escapeHtml(group)}">${escapeHtml(group)}</option>`)
    ].join('');

    if (selectedClassGroup !== 'all' && classGroups.includes(selectedClassGroup)) {
        classGroupSelect.value = selectedClassGroup;
    }
}

function createDetailRow(label, value) {
    return `<p><strong>${label}:</strong> ${escapeHtml(value || 'Não informado')}</p>`;
}

function buildExpandedDetails(user) {
    const registration = user.registration || {};
    const invitations = Array.isArray(user.invitations) ? user.invitations : [];
    const delegationMembers = Array.isArray(user.delegationMembers) ? user.delegationMembers : [];
    const backupCodes = Array.isArray(user.twoFactorBackupCodes) ? user.twoFactorBackupCodes : [];
    const usedBackupCodes = backupCodes.filter((item) => item?.used).length;

    return `
        <div class="user-verification-details">
            <div class="user-verification-grid">
                <section>
                    <h4>Dados da conta</h4>
                    ${createDetailRow('ID', getVerificationId(user) || 'Não informado')}
                    ${createDetailRow('Nome completo', user.fullName || 'Não informado')}
                    ${createDetailRow('Usuário', user.username || 'Não informado')}
                    ${createDetailRow('Email', user.email || 'Não informado')}
                    ${createDetailRow('Perfil', roleLabel(user.role))}
                    ${createDetailRow('Data de criação', formatDate(user.createdAt))}
                    ${createDetailRow('Turma', user.classGroup || 'Não informado')}
                    ${createDetailRow('Gênero', user.gender || 'Não informado')}
                </section>

                <section>
                    <h4>Dados de participação</h4>
                    ${createDetailRow('Comitê atribuído', getCommitteeLabel(user.committee))}
                    ${createDetailRow('País atribuído', user.country || 'Não definido')}
                    ${createDetailRow('Parceiro informado', user.partner || 'Não definido')}
                    ${createDetailRow('Integrantes na delegação', String(delegationMembers.length))}
                    ${createDetailRow('1ª opção de comitê', getCommitteeLabel(registration.firstChoice))}
                    ${createDetailRow('2ª opção de comitê', getCommitteeLabel(registration.secondChoice))}
                    ${createDetailRow('3ª opção de comitê', getCommitteeLabel(registration.thirdChoice))}
                    ${createDetailRow('Tamanho da equipe', registration.teamSize ? String(registration.teamSize) : 'Não informado')}
                    ${createDetailRow('Inscrição enviada em', formatDate(registration.submittedAt))}
                </section>

                <section>
                    <h4>Segurança e estado</h4>
                    ${createDetailRow('Termos aceitos', user.termsAccepted ? 'Sim' : 'Não')}
                    ${createDetailRow('Termos aceitos em', formatDate(user.termsAcceptedAt))}
                    ${createDetailRow('2FA ativado', user.twoFactorEnabled ? 'Sim' : 'Não')}
                    ${createDetailRow('2FA verificado', user.twoFactorVerified ? 'Sim' : 'Não')}
                    ${createDetailRow('Códigos backup usados', `${usedBackupCodes}/${backupCodes.length}`)}
                    ${createDetailRow('Convites de delegação', String(invitations.length))}
                    ${createDetailRow('Status da conta', accountStatusLabel(user.accountStatus))}
                    ${createDetailRow('Motivo do status', user.accountStatusReason || 'Não informado')}
                    ${createDetailRow('Status atualizado em', formatDate(user.accountStatusUpdatedAt))}
                    ${createDetailRow('Token de reset ativo', user.resetPasswordToken ? 'Sim' : 'Não')}
                    ${createDetailRow('Reset expira em', formatDate(user.resetPasswordExpires))}
                    ${createDetailRow('É dado de teste', user.isTestData ? 'Sim' : 'Não')}
                </section>
            </div>
            <div class="user-verification-actions">
                <button type="button" class="delete-button" data-action="ban-user" data-user-id="${escapeHtml(getVerificationId(user))}">
                    Banir usuário
                </button>
                <button type="button" class="delete-button" data-action="expel-user" data-user-id="${escapeHtml(getVerificationId(user))}">
                    Expulsar usuário
                </button>
                <button type="button" class="view-button" data-action="reactivate-user" data-user-id="${escapeHtml(getVerificationId(user))}">
                    Reativar usuário
                </button>
                <button type="button" class="delete-button" data-action="delete-user" data-user-id="${escapeHtml(getVerificationId(user))}">
                    Excluir usuário
                </button>
            </div>
        </div>
    `;
}

function bindAvatarFallbacks(root = document) {
    root.querySelectorAll('img[data-fallback-src]').forEach((image) => {
        image.addEventListener('error', () => {
            const fallback = image.dataset.fallbackSrc;
            if (!fallback || image.src === fallback) {
                return;
            }
            image.src = fallback;
        }, { once: true });
    });
}

function renderUsers() {
    const list = document.getElementById('userVerificationList');
    const meta = document.getElementById('userVerificationMeta');
    const queryText = document.getElementById('userSearchInput')?.value.trim().toLowerCase() || '';
    const committeeFilter = document.getElementById('userCommitteeFilter')?.value || 'all';
    const collegeFilter = document.getElementById('userCollegeFilter')?.value || 'all';
    const classGroupFilter = document.getElementById('userClassGroupFilter')?.value || 'all';
    const createdFrom = document.getElementById('userCreatedFrom')?.value || '';
    const createdTo = document.getElementById('userCreatedTo')?.value || '';
    const sortBy = document.getElementById('userSortBy')?.value || 'created_desc';

    if (!list || !meta) {
        return;
    }

    const filtered = allCandidates.filter((user) => matchesFilter(
        user,
        queryText,
        committeeFilter,
        collegeFilter,
        classGroupFilter,
        createdFrom,
        createdTo
    ));
    const ordered = sortUsers(filtered, sortBy);
    meta.textContent = `${ordered.length} aluno(s) encontrado(s). Clique no nome para ver os dados completos.`;

    if (!ordered.length) {
        list.innerHTML = '<p class="dashboard-empty">Nenhum aluno encontrado para o filtro atual.</p>';
        return;
    }

    list.innerHTML = ordered.map((user) => {
        const userId = getVerificationId(user);
        const isExpanded = expandedUserId === userId;
        const avatar = getProfileImageUrls(user);

        return `
            <article class="committee-user-card user-verification-card" data-user-id="${escapeHtml(userId)}">
                <button type="button" class="user-verification-toggle" data-action="toggle-user" data-user-id="${escapeHtml(userId)}">
                    <img
                        src="${escapeHtml(avatar.src)}"
                        alt="Foto de perfil de ${escapeHtml(user.fullName || user.username || 'Aluno')}"
                        class="user-verification-avatar"
                        data-fallback-src="${escapeHtml(avatar.fallback)}"
                    >
                    <div>
                        <h3>${escapeHtml(user.fullName || user.username || 'Aluno')}</h3>
                        <p>${escapeHtml(user.email || 'Email não informado')}</p>
                    </div>
                    <span class="dashboard-chip">${isExpanded ? 'Ocultar dados' : 'Ver dados completos'}</span>
                </button>
                <p><strong>Usuário:</strong> ${escapeHtml(user.username || 'Não informado')}</p>
                <p><strong>Turma:</strong> ${escapeHtml(user.classGroup || 'Não informado')}</p>
                <p><strong>Comitê:</strong> ${escapeHtml(getCommitteeLabel(user.committee))}</p>
                <p><strong>País:</strong> ${escapeHtml(user.country || 'Não definido')}</p>
                <p><strong>Status:</strong> ${escapeHtml(accountStatusLabel(user.accountStatus))}</p>
                ${isExpanded ? buildExpandedDetails(user) : ''}
            </article>
        `;
    }).join('');

    bindAvatarFallbacks(list);
}

async function fetchUserDetails(userId) {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        headers: {
            Authorization: `Bearer ${getToken()}`
        }
    });
    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar os detalhes do aluno.');
    }
    return data;
}

async function loadCandidates() {
    const list = document.getElementById('userVerificationList');
    const button = document.getElementById('reloadUsersBtn');

    if (button) {
        button.disabled = true;
        button.textContent = 'Atualizando...';
    }

    if (list) {
        list.innerHTML = '<p class="dashboard-empty">Carregando alunos...</p>';
    }

    try {
        const response = await fetch('/api/users?role=candidate', {
            headers: {
                Authorization: `Bearer ${getToken()}`
            }
        });
        const data = await parseJsonResponse(response);
        if (!response.ok) {
            throw new Error(Array.isArray(data.error) ? data.error[0]?.msg : data.error);
        }

        allCandidates = Array.isArray(data) ? data : [];
        populateDynamicFilters(allCandidates);
        renderUsers();
    } catch (error) {
        if (list) {
            list.innerHTML = `<p class="dashboard-empty">${escapeHtml(error.message || 'Erro ao carregar alunos.')}</p>`;
        }
    } finally {
        if (button) {
            button.disabled = false;
            button.textContent = 'Atualizar lista';
        }
    }
}

async function updateUserStatus(userId, nextStatus, actionLabel) {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({
            status: nextStatus,
            reason: `Alterado via verificação de usuários por ${currentOperator?.fullName || currentOperator?.username || 'equipe'}`
        })
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(data.error || `Não foi possível ${actionLabel}.`);
    }

    return data;
}

async function deleteUser(userId) {
    const response = await fetch(`/api/users/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${getToken()}`
        }
    });

    const data = await parseJsonResponse(response);
    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível excluir o usuário.');
    }

    return data;
}

async function validateAccess() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login';
        return null;
    }

    const context = await window.MaxOnuSession?.getAuthContext?.({ forceRefresh: true });
    const user = context?.user;
    if (!user) {
        window.location.href = '/login';
        return null;
    }

    if (!ALLOWED_ROLES.has(user.role)) {
        if (user.role === 'admin') {
            window.location.href = '/admin';
        } else if (user.role === 'coordinator') {
            window.location.href = '/coordenacao';
        } else if (user.role === 'teacher') {
            window.location.href = '/orientadores';
        } else {
            window.location.href = '/profile';
        }
        return null;
    }

    const badge = document.getElementById('userVerificationBadge');
    if (badge) {
        badge.textContent = roleLabel(user.role);
        badge.dataset.role = user.role;
    }

    currentOperator = user;
    return user;
}

function bindEvents() {
    document.getElementById('reloadUsersBtn')?.addEventListener('click', loadCandidates);
    document.getElementById('userSearchInput')?.addEventListener('input', renderUsers);
    document.getElementById('userCommitteeFilter')?.addEventListener('change', renderUsers);
    document.getElementById('userCollegeFilter')?.addEventListener('change', () => {
        populateDynamicFilters(allCandidates);
        renderUsers();
    });
    document.getElementById('userClassGroupFilter')?.addEventListener('change', renderUsers);
    document.getElementById('userCreatedFrom')?.addEventListener('change', renderUsers);
    document.getElementById('userCreatedTo')?.addEventListener('change', renderUsers);
    document.getElementById('userSortBy')?.addEventListener('change', renderUsers);
    document.getElementById('clearUserFiltersBtn')?.addEventListener('click', () => {
        const ids = [
            'userSearchInput',
            'userCreatedFrom',
            'userCreatedTo'
        ];
        ids.forEach((id) => {
            const input = document.getElementById(id);
            if (input) input.value = '';
        });

        const selects = [
            ['userCollegeFilter', 'all'],
            ['userClassGroupFilter', 'all'],
            ['userCommitteeFilter', 'all'],
            ['userSortBy', 'created_desc']
        ];
        selects.forEach(([id, value]) => {
            const select = document.getElementById(id);
            if (select) select.value = value;
        });

        populateDynamicFilters(allCandidates);
        renderUsers();
    });

    document.getElementById('userVerificationList')?.addEventListener('click', async (event) => {
        const toggle = event.target.closest('[data-action="toggle-user"]');
        if (toggle) {
            const userId = toggle.dataset.userId;
            if (!userId) {
                return;
            }

            const clickedSameUser = expandedUserId === userId;
            expandedUserId = clickedSameUser ? null : userId;
            renderUsers();

            if (!clickedSameUser) {
                try {
                    const fullDetails = await fetchUserDetails(userId);
                    allCandidates = allCandidates.map((item) => {
                        const id = getVerificationId(item);
                        return id === userId ? { ...item, ...fullDetails } : item;
                    });
                    renderUsers();
                } catch (error) {
                    const list = document.getElementById('userVerificationList');
                    if (list) {
                        list.insertAdjacentHTML(
                            'afterbegin',
                            `<p class="dashboard-empty">${escapeHtml(error.message || 'Erro ao carregar detalhes do aluno.')}</p>`
                        );
                    }
                }
            }
            return;
        }

        const actionButton = event.target.closest('[data-action="ban-user"], [data-action="expel-user"], [data-action="reactivate-user"], [data-action="delete-user"]');
        if (!actionButton) {
            return;
        }

        const userId = actionButton.dataset.userId;
        if (!userId) {
            return;
        }

        const action = actionButton.dataset.action;
        const confirmationText = action === 'ban-user'
            ? 'Confirmar banimento deste usuário?'
            : action === 'expel-user'
                ? 'Confirmar expulsão deste usuário? Essa ação remove vínculos de delegação.'
                : action === 'reactivate-user'
                    ? 'Confirmar reativação deste usuário?'
                    : 'Confirmar exclusão permanente deste usuário?';

        if (!window.confirm(confirmationText)) {
            return;
        }

        const originalText = actionButton.textContent;
        actionButton.disabled = true;
        actionButton.textContent = 'Processando...';

        try {
            if (action === 'ban-user') {
                await updateUserStatus(userId, 'banned', 'banir usuário');
            } else if (action === 'expel-user') {
                await updateUserStatus(userId, 'expelled', 'expulsar usuário');
            } else if (action === 'reactivate-user') {
                await updateUserStatus(userId, 'active', 'reativar usuário');
            } else {
                await deleteUser(userId);
                if (expandedUserId === userId) {
                    expandedUserId = null;
                }
            }

            await loadCandidates();
            window.alert('Ação executada com sucesso.');
        } catch (error) {
            window.alert(error.message || 'Não foi possível concluir a ação.');
        } finally {
            actionButton.disabled = false;
            actionButton.textContent = originalText;
        }
    });
}

async function initUserVerificationPage() {
    try {
        const user = await validateAccess();
        if (!user) {
            return;
        }

        bindEvents();
        await loadCandidates();
    } catch (error) {
        const list = document.getElementById('userVerificationList');
        if (list) {
            list.innerHTML = '<p class="dashboard-empty">Não foi possível carregar a página de verificação agora.</p>';
        }
    }
}

document.addEventListener('DOMContentLoaded', initUserVerificationPage);
