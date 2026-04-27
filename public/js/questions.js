const QUESTIONS_CACHE_KEY = 'maxonu_questions_cache_v1';
const QUESTIONS_CACHE_TTL = 60 * 1000;

function openQuestionModal() {
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

    questionsList.innerHTML = questions.map((q) => `
        <div class="question-card" data-id="${q._id || ''}">
            <h3>${q.question || ''}</h3>
            <p>${q.answer || ''}</p>
            ${isAdmin() && q._id ? `
                <button type="button" data-question-action="edit">Editar</button>
                <button type="button" data-question-action="delete">Excluir</button>
            ` : ''}
        </div>
    `).join('');
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
            const question = document.getElementById('question').value;

            try {
                const response = await fetch('/api/questions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
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
