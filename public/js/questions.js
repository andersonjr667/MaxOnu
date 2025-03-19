function openQuestionModal() {
    document.getElementById('questionModal').classList.add('active');
}

function closeQuestionModal() {
    document.getElementById('questionModal').classList.remove('active');
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
                    throw new Error('Erro ao enviar pergunta');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Erro ao enviar pergunta. Tente novamente.');
            }
        });
    }

    loadQuestions();
}

function answerQuestion(id) {
    const answer = document.getElementById(`answer-${id}`).value;
    const questions = JSON.parse(localStorage.getItem('questions')) || [];
    const questionIndex = questions.findIndex(q => q.id === id);
    
    if (questionIndex !== -1) {
        questions[questionIndex].answer = answer;
        questions[questionIndex].answered = true;
        localStorage.setItem('questions', JSON.stringify(questions));
        alert('Resposta enviada com sucesso!');
        location.reload();
    }
}

document.addEventListener('DOMContentLoaded', initQuestions);
