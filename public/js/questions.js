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

function initQuestions() {
    const questionForm = document.getElementById('questionForm');
    const questionsList = document.getElementById('questionsList');

    function loadQuestions() {
        fetch('/api/questions')
            .then(response => response.json())
            .then(questions => {
                if (questionsList) {
                    questionsList.innerHTML = questions.map(q => `
                        <div class="question-card">
                            <h3>${q.question}</h3>
                            <p>${q.answer}</p>
                        </div>
                    `).join('');
                }
            })
            .catch(error => console.error('Error loading questions:', error));
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
