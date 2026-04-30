// Script for managing FAQ questions on imprensa/admin page

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

async function parseJsonResponse(response) {
    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, data };
}

function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.disabled = true;
        if (loadingText) {
            button.innerHTML = loadingText;
        }
    } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
    }
}

async function checkAuth() {
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

        // Allow admin and press roles
        if (currentUser.role !== 'admin' && currentUser.role !== 'press') {
            alert('Acesso restrito para admin e imprensa.');
            window.location.href = '/profile.html';
            return;
        }

        setupPage(currentUser);
        loadPendingQuestions();
        loadAnsweredQuestions();
    } catch (error) {
        console.error(error);
        window.location.href = '/login.html';
    }
}

function setupPage(user) {
    const lead = document.getElementById('pageLead');
    const summary = document.getElementById('userSummary');
    const roleBadge = document.getElementById('userRoleBadge');

    lead.textContent = `${roleLabel(user.role)} autenticado. Gerencie as perguntas frequentes (FAQ) respondendo dúvidas dos participantes.`;
    roleBadge.textContent = roleLabel(user.role);
    roleBadge.dataset.role = user.role || 'user';

    const cards = [
        { title: 'Perfil', text: roleLabel(user.role), accent: 'blue-accent' },
        { title: 'Usuário', text: user.fullName || user.username, accent: '' },
        { title: 'Permissão', text: 'Gerenciar FAQ', accent: 'blue-accent' }
    ];

    summary.innerHTML = cards.map((card) => `
        <article class="feature-card ${card.accent}">
            <h3>${card.title}</h3>
            <p>${card.text}</p>
        </article>
    `).join('');
}

function renderPendingQuestions(questions) {
    const container = document.getElementById('pendingQuestionsList');
    
    if (!questions.length) {
        container.innerHTML = '<p class="dashboard-empty">Nenhuma pergunta pendente no momento.</p>';
        return;
    }

    // Helper to get asker info display
    function getAskerInfo(asker) {
        if (!asker) return '<span class="material-symbols-rounded">person</span><span>Anônimo</span>';
        const name = asker.fullName || asker.username || 'Usuário';
        const committee = asker.committee ? ' (Comitê ' + asker.committee + ')' : '';
        const classGroup = asker.classGroup ? ' - ' + asker.classGroup : '';
        
        var profileHtml = '';
        if (asker.profileImageUrl) {
            profileHtml = '<img src="' + asker.profileImageUrl + '" alt="' + name + '" class="user-avatar" onerror="this.style.display=\'none\'">';
        }
        
        return profileHtml + '<span>' + name + committee + classGroup + '</span>';
    }

    var html = '';
    for (var i = 0; i < questions.length; i++) {
        var q = questions[i];
        var askerInfoHtml = getAskerInfo(q.askerId);
        html += '<article class="question-card dashboard-question-card" data-id="' + q._id + '">' +
            '<div class="question-card-header">' +
                '<span class="dashboard-chip">Pendente</span>' +
                '<span class="question-date">' + new Date(q.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</span>' +
            '</div>' +
            '<div class="question-asker-info">' +
                askerInfoHtml +
            '</div>' +
            '<h3 class="question-text">' + q.question + '</h3>' +
            '<div class="question-response-form">' +
                '<label for="answer-' + q._id + '">Resposta:</label>' +
                '<textarea id="answer-' + q._id + '" placeholder="Digite sua resposta aqui..." rows="4"></textarea>' +
            '</div>' +
            '<div class="dashboard-question-actions">' +
                '<button type="button" class="view-button" data-action="answer" data-id="' + q._id + '">' +
                    '<span class="material-symbols-rounded">send</span>' +
                    'Responder' +
                '</button>' +
                '<button type="button" class="delete-button" data-action="delete" data-id="' + q._id + '">' +
                    '<span class="material-symbols-rounded">delete</span>' +
                    'Excluir' +
                '</button>' +
            '</div>' +
        '</article>';
    }
    container.innerHTML = html;
}

function renderAnsweredQuestions(questions) {
    const container = document.getElementById('answeredQuestionsList');
    
    if (!questions.length) {
        container.innerHTML = '<p class="dashboard-empty">Nenhuma pergunta respondida ainda.</p>';
        return;
    }

    container.innerHTML = questions.map((q) => `
        <article class="question-card dashboard-question-card" data-id="${q._id}">
            <div class="question-card-header">
                <span class="dashboard-chip green-chip">Respondida</span>
                <span class="question-date">${new Date(q.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
            </div>
            <h3 class="question-text">${q.question}</h3>
            <div class="question-answer-display">
                <strong>Resposta:</strong>
                <p>${q.answer}</p>
            </div>
            <div class="dashboard-question-actions">
                <button type="button" class="view-button" data-action="edit" data-id="${q._id}" data-question="${q.question}" data-answer="${q.answer}">
                    <span class="material-symbols-rounded">edit</span>
                    Editar
                </button>
                <button type="button" class="delete-button" data-action="delete" data-id="${q._id}">
                    <span class="material-symbols-rounded">delete</span>
                    Excluir
                </button>
            </div>
        </article>
    `).join('');
}

async function loadPendingQuestions() {
    const container = document.getElementById('pendingQuestionsList');
    container.innerHTML = '<p class="dashboard-empty">Carregando perguntas pendentes...</p>';

    try {
        const response = await fetch('/api/questions/pending', {
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao carregar perguntas pendentes.');
        }

        renderPendingQuestions(Array.isArray(data) ? data : []);
    } catch (error) {
        console.error('Erro ao carregar perguntas pendentes:', error);
        container.innerHTML = '<p class="dashboard-empty">Erro ao carregar perguntas pendentes.</p>';
    }
}

async function loadAnsweredQuestions() {
    const container = document.getElementById('answeredQuestionsList');
    container.innerHTML = '<p class="dashboard-empty">Carregando perguntas respondidas...</p>';

    try {
        const response = await fetch('/api/questions');
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao carregar perguntas respondidas.');
        }

        renderAnsweredQuestions(Array.isArray(data) ? data : []);
    } catch (error) {
        console.error('Erro ao carregar perguntas respondidas:', error);
        container.innerHTML = '<p class="dashboard-empty">Erro ao carregar perguntas respondidas.</p>';
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
        loadAnsweredQuestions();
    } catch (error) {
        console.error('Erro ao enviar resposta:', error);
        alert(error.message || 'Erro ao enviar resposta.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

async function deleteQuestion(id, button) {
    if (!confirm('Tem certeza que deseja excluir esta pergunta? Esta ação não pode ser desfeita.')) {
        return;
    }

    setButtonLoading(button, true, 'Excluindo...');

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao excluir pergunta.');
        }

        alert('Pergunta excluída com sucesso!');
        loadPendingQuestions();
        loadAnsweredQuestions();
    } catch (error) {
        console.error('Erro ao excluir pergunta:', error);
        alert(error.message || 'Erro ao excluir pergunta.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

function editAnsweredQuestion(id, button) {
    const card = button.closest('.question-card');
    const currentQuestion = button.dataset.question;
    const currentAnswer = button.dataset.answer;

    card.innerHTML = `
        <div class="question-card-header">
            <span class="dashboard-chip">Editando</span>
        </div>
        <div class="question-edit-form">
            <label for="edit-question-${id}">Pergunta:</label>
            <textarea id="edit-question-${id}" rows="2">${currentQuestion}</textarea>
            <label for="edit-answer-${id}">Resposta:</label>
            <textarea id="edit-answer-${id}" rows="4">${currentAnswer}</textarea>
        </div>
        <div class="dashboard-question-actions">
            <button type="button" class="view-button" data-action="save" data-id="${id}">
                <span class="material-symbols-rounded">save</span>
                Salvar
            </button>
            <button type="button" class="delete-button" data-action="cancel" data-id="${id}">
                <span class="material-symbols-rounded">cancel</span>
                Cancelar
            </button>
        </div>
    `;
}

async function saveEditedQuestion(id, button) {
    const question = document.getElementById(`edit-question-${id}`)?.value.trim();
    const answer = document.getElementById(`edit-answer-${id}`)?.value.trim();

    if (!question || !answer) {
        alert('Preencha a pergunta e a resposta antes de salvar.');
        return;
    }

    setButtonLoading(button, true, 'Salvando...');

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'PUT',
            headers: getAuthHeaders(),
            body: JSON.stringify({ question, answer })
        });
        const { ok, data } = await parseJsonResponse(response);

        if (!ok) {
            throw new Error(data.error || 'Erro ao salvar alterações.');
        }

        alert('Alterações salvas com sucesso!');
        loadAnsweredQuestions();
        loadPendingQuestions();
    } catch (error) {
        console.error('Erro ao salvar:', error);
        alert(error.message || 'Erro ao salvar alterações.');
    } finally {
        setButtonLoading(button, false, '');
    }
}

function cancelEdit(id, button) {
    loadAnsweredQuestions();
}

function initPage() {
    // Refresh buttons
    document.getElementById('refreshQuestionsBtn')?.addEventListener('click', () => {
        loadPendingQuestions();
    });
    document.getElementById('refreshAnsweredBtn')?.addEventListener('click', () => {
        loadAnsweredQuestions();
    });

    // Pending questions actions
    document.getElementById('pendingQuestionsList')?.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) return;

        const id = actionButton.dataset.id;
        if (!id) return;

        if (actionButton.dataset.action === 'answer') {
            submitAnswer(id, actionButton);
        } else if (actionButton.dataset.action === 'delete') {
            deleteQuestion(id, actionButton);
        }
    });

    // Answered questions actions
    document.getElementById('answeredQuestionsList')?.addEventListener('click', (event) => {
        const actionButton = event.target.closest('[data-action]');
        if (!actionButton) return;

        const id = actionButton.dataset.id;
        if (!id) return;

        if (actionButton.dataset.action === 'edit') {
            editAnsweredQuestion(id, actionButton);
        } else if (actionButton.dataset.action === 'delete') {
            deleteQuestion(id, actionButton);
        } else if (actionButton.dataset.action === 'save') {
            saveEditedQuestion(id, actionButton);
        } else if (actionButton.dataset.action === 'cancel') {
            cancelEdit(id, actionButton);
        }
    });

    // Initialize
    checkAuth();
}

document.addEventListener('DOMContentLoaded', initPage);
