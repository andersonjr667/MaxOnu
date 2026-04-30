const QUESTIONS_CACHE_KEY = 'maxonu_questions_cache_v1';
const QUESTIONS_CACHE_TTL = 60 * 1000;

function getToken() {
    return localStorage.getItem('token') || '';
}

function isAuthenticated() {
    const token = getToken();
    return token && token !== 'null' && token !== 'undefined' && token.trim() !== '';
}

function ensureQuestionMark(questionText) {
    if (!questionText || questionText.trim() === '') {
        return questionText;
    }
    const trimmed = questionText.trim();
    if (!trimmed.endsWith('?')) {
        return trimmed + '?';
    }
    return trimmed;
}

function openQuestionModal() {
    if (!isAuthenticated()) {
        const nextUrl = encodeURIComponent(window.location.pathname);
        window.location.href = `/login.html?next=${nextUrl}`;
        return;
    }
    const modal = document.getElementById('questionModal');
    if (modal) {
        modal.classList.add('active');
    }
}

function closeQuestionModal() {
    const modal = document.getElementById('questionModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

function isAdmin() {
    const token = localStorage.getItem('token');
    if (!token) return false;
    if (token === 'dummy-token') return true;

    try {
        const role = localStorage.getItem('role');
        if (['admin', 'teacher', 'coordinator', 'press'].includes(role)) return true;

        const payload = JSON.parse(atob(token.split('.')[1]));
        return payload.username === 'andersonjr0667' || ['admin', 'teacher', 'coordinator', 'press'].includes(payload.role);
    } catch (error) {
        return false;
    }
}

function readQuestionsCache() {
    try {
        const raw = sessionStorage.getItem(QUESTIONS_CACHE_KEY);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp > QUESTIONS_CACHE_TTL) {
            sessionStorage.removeItem(QUESTIONS_CACHE_KEY);
            return null;
        }

        return Array.isArray(parsed.data) ? parsed.data : null;
    } catch (error) {
        return null;
    }
}

function writeQuestionsCache(questions) {
    try {
        sessionStorage.setItem(QUESTIONS_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: questions
        }));
    } catch (error) {
        // Ignore session storage failures to avoid breaking the page.
    }
}

function clearQuestionsCache() {
    try {
        sessionStorage.removeItem(QUESTIONS_CACHE_KEY);
    } catch (error) {
        // Ignore session storage failures to avoid breaking the page.
    }
}

function renderQuestions(questions) {
    const questionsList = document.getElementById('questionsList');
    if (!questionsList) return;

    questionsList.innerHTML = questions.map((q) => {
        // Helper for user display
        const renderUserInfo = (user, type) => {
            if (!user) {
                return type === 'asker' ? '<span class="anonymous-user">Anônimo</span>' : '<span class="admin-user">Equipe MaxOnu</span>';
            }
            const defaultImg = '/images/default-avatar.png';
            const imgSrc = user.profileImageUrl || defaultImg;
            const roleLabel = user.role === 'admin' || user.role === 'press' || user.role === 'coordinator' ? 'Admin/Imprensa' : 'Delegado(a)';
            if (type === 'asker') {
                return `
                    <div class="question-asker-info">
                        <img src="${imgSrc}" alt="${user.fullName || user.username}" class="user-avatar" loading="lazy">
                        <div class="user-details">
                            <span class="username">@${user.username}</span>
                            <span class="user-class">${user.classGroup || 'Turma não informada'}</span>
                            ${user.committee ? `<span class="user-committee">Comitê ${user.committee}</span>` : ''}
                        </div>
                    </div>
                `;
            } else {
                return `
                    <div class="question-answerer-info">
                        <img src="${imgSrc}" alt="${user.fullName || user.username}" class="user-avatar" loading="lazy">
                        <span class="answerer-name">@${user.username} (${roleLabel})</span>
                    </div>
                `;
            }
        };

        return `
            <article class="question-card dashboard-question-card" data-id="${q._id || ''}">
                <div class="question-card-header">
                    <span class="dashboard-chip green-chip">${q.answered ? 'Respondida' : 'Pendente'}</span>
                    <span class="question-date">${new Date(q.createdAt).toLocaleDateString('pt-BR')}</span>
                </div>
                <div class="question-asker-section">
                    ${renderUserInfo(q.askerId, 'asker')}
                    <div class="question-text">
                        <h3>${q.question || ''}</h3>
                    </div>
                </div>
                ${q.answer ? `
                    <div class="question-answer-section">
                        ${renderUserInfo(q.answererId, 'answerer')}
                        <div class="question-answer-content">
                            <p>${q.answer}</p>
                        </div>
                    </div>
                ` : ''}
                ${isAdmin() && q._id ? `
                    <div class="dashboard-question-actions">
                        <button type="button" data-question-action="edit">Editar</button>
                        <button type="button" data-question-action="delete">Excluir</button>
                    </div>
                ` : ''}
            </article>
        `;
    }).join('');
}

async function loadQuestions(forceRefresh = false) {
    const cachedQuestions = !forceRefresh ? readQuestionsCache() : null;
    if (cachedQuestions) {
        renderQuestions(cachedQuestions);
        return;
    }

    try {
        const response = await fetch('/api/questions');
        const questions = await response.json();
        renderQuestions(questions);
        writeQuestionsCache(questions);
    } catch (error) {
        console.error('Erro ao carregar perguntas:', error);
    }
}

function editQuestion(id) {
    const questionCard = document.querySelector(`.question-card[data-id="${id}"]`);
    if (!questionCard) return;

    const questionText = questionCard.querySelector('h3')?.innerText || '';
    const answerText = questionCard.querySelector('p')?.innerText || '';
    questionCard.dataset.originalQuestion = questionText;
    questionCard.dataset.originalAnswer = answerText;

    questionCard.innerHTML = `
        <textarea id="edit-question-${id}">${questionText}</textarea>
        <textarea id="edit-answer-${id}">${answerText}</textarea>
        <button type="button" data-question-action="save">Salvar</button>
        <button type="button" data-question-action="cancel">Cancelar</button>
    `;
}

async function saveQuestion(id) {
    const question = document.getElementById(`edit-question-${id}`)?.value || '';
    const answer = document.getElementById(`edit-answer-${id}`)?.value || '';

    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({ question, answer })
        });

        if (!response.ok) {
            throw new Error('Erro ao atualizar pergunta');
        }

        alert('Pergunta atualizada com sucesso!');
        clearQuestionsCache();
        loadQuestions(true);
    } catch (error) {
        console.error('Erro ao atualizar pergunta:', error);
    }
}

function cancelEdit(id) {
    const questionCard = document.querySelector(`.question-card[data-id="${id}"]`);
    if (!questionCard) return;
    const questionText = questionCard.dataset.originalQuestion || '';
    const answerText = questionCard.dataset.originalAnswer || '';

    questionCard.innerHTML = `
        <h3>${questionText}</h3>
        <p>${answerText}</p>
        ${isAdmin() ? `
            <button type="button" data-question-action="edit">Editar</button>
            <button type="button" data-question-action="delete">Excluir</button>
        ` : ''}
    `;
}

async function deleteQuestion(id) {
    try {
        const response = await fetch(`/api/questions/${id}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            }
        });

        if (!response.ok) {
            throw new Error('Erro ao excluir pergunta');
        }

        alert('Pergunta excluída com sucesso!');
        clearQuestionsCache();
        loadQuestions(true);
    } catch (error) {
        console.error('Erro ao excluir pergunta:', error);
    }
}

function initQuestions() {
    const questionForm = document.getElementById('questionForm');
    const openModalButton = document.getElementById('openQuestionModalBtn');
    const closeModalButton = document.getElementById('closeQuestionModalBtn');
    const questionsList = document.getElementById('questionsList');

    if (openModalButton) {
        openModalButton.addEventListener('click', openQuestionModal);
    }

    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeQuestionModal);
    }

    if (questionsList) {
        questionsList.addEventListener('click', (event) => {
            const actionButton = event.target.closest('[data-question-action]');
            if (!actionButton) {
                return;
            }

            const questionCard = actionButton.closest('.question-card');
            const id = questionCard?.dataset.id;
            if (!id) {
                return;
            }

            const action = actionButton.dataset.questionAction;
            if (action === 'edit') {
                editQuestion(id);
            } else if (action === 'delete') {
                deleteQuestion(id);
            } else if (action === 'save') {
                saveQuestion(id);
            } else if (action === 'cancel') {
                cancelEdit(id);
            }
        });
    }

if (questionForm) {
        questionForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rawQuestion = document.getElementById('question').value;
            const question = ensureQuestionMark(rawQuestion);

            try {
                const token = getToken();
                const headers = {
                    'Content-Type': 'application/json'
                };
                if (token) {
                    headers['Authorization'] = `Bearer ${token}`;
                }
                const response = await fetch('/api/questions', {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ question })
                });

                if (response.ok) {
                    alert('Pergunta enviada com sucesso! Aguarde a resposta.');
                    questionForm.reset();
                    closeQuestionModal();
                    clearQuestionsCache();
                    loadQuestions(true);
                } else {
                    const data = await response.json().catch(() => ({}));
                    throw new Error(data.error || 'Erro ao enviar pergunta');
                }
            } catch (error) {
                console.error('Error:', error);
                alert(error.message || 'Erro ao enviar pergunta. Tente novamente.');
            }
        });
    }

    loadQuestions();
}

document.addEventListener('DOMContentLoaded', initQuestions);
