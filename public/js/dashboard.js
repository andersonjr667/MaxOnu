let currentUser = null;

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
        loadPendingQuestions();
        loadCommitteeUsers();
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
        cards.push({ title: 'Permissão', text: 'Consultar, distribuir países e exportar listas.', accent: 'blue-accent' });
        exportActions.hidden = false;
        assignmentPanel.hidden = false;
    }

    summary.innerHTML = cards.map((card) => `
        <article class="feature-card ${card.accent}">
            <h3>${card.title}</h3>
            <p>${card.text}</p>
        </article>
    `).join('');
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

async function handleAssignment(event) {
    event.preventDefault();

    const submitButton = event.target.querySelector('button[type="submit"]');
    const userId = document.getElementById('userId').value.trim();
    const committee = Number(document.getElementById('userCommittee').value);
    const country = document.getElementById('userCountry').value.trim();

    setButtonLoading(submitButton, true, 'Salvando...');

    try {
        const response = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ committee, country })
        });

        const { ok, data } = await parseJsonResponse(response);
        if (!ok) {
            throw new Error(data.error || 'Erro ao salvar distribuicao');
        }

        alert('Distribuicao atualizada com sucesso.');
        event.target.reset();
        loadCommitteeUsers();
    } catch (error) {
        console.error(error);
        alert(error.message || 'Erro ao salvar distribuicao.');
    } finally {
        setButtonLoading(submitButton, false, '');
    }
}

function initDashboard() {
    document.getElementById('loadCommitteeBtn')?.addEventListener('click', loadCommitteeUsers);
    document.getElementById('exportCsvBtn')?.addEventListener('click', () => exportCommittee('csv'));
    document.getElementById('exportXlsxBtn')?.addEventListener('click', () => exportCommittee('xlsx'));
    document.getElementById('assignmentForm')?.addEventListener('submit', handleAssignment);

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
