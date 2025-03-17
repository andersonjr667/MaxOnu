// countdown.js
function padZero(value) {
    return value < 10 ? '0' + value : value;
}

document.addEventListener('DOMContentLoaded', function() {
    const countdownElement = document.getElementById('countdown');
    const targetDate = new Date('2025-12-31T23:59:59').getTime(); // Defina a data e hora alvo

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            clearInterval(interval);
            revealCommittees();
            enableButtons();
            return;
        }

        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((distance % (1000 * 60)) / 1000);

        countdownElement.innerHTML = `
            <div class="time-unit">
                <div class="time-value">${padZero(days)}</div>
                <div class="time-label">dias</div>
            </div>
            <div class="time-unit">
                <div class="time-value">${padZero(hours)}</div>
                <div class="time-label">horas</div>
            </div>
            <div class="time-unit">
                <div class="time-value">${padZero(minutes)}</div>
                <div class="time-label">minutos</div>
            </div>
            <div class="time-unit">
                <div class="time-value">${padZero(seconds)}</div>
                <div class="time-label">segundos</div>
            </div>
        `;
    }

    function revealCommittees() {
        document.querySelector('.committees-message').innerText = 'Conheça os comitês da MaxOnu 2025';
        document.querySelectorAll('.committee-card.present').forEach(card => {
            card.classList.remove('present');
            card.innerHTML = `
                <div class="committee-photo" style="background-image: url('images/comite${card.dataset.index}.jpg')"></div>
                <h3>${card.dataset.title}</h3>
                <p>${card.dataset.description}</p>
                <button class="view-button" onclick="window.location.href='delegacao-${card.dataset.index}-8-9.html'">Ver 8º e 9º Ano</button>
                <button class="view-button" onclick="window.location.href='delegacao-${card.dataset.index}-em.html'">Ver Ensino Médio</button>
            `;
        });
    }

    function enableButtons() {
        document.querySelectorAll('.view-button').forEach(button => {
            button.disabled = false;
        });
    }

    const interval = setInterval(updateCountdown, 1000);
    updateCountdown();
});

document.addEventListener('DOMContentLoaded', () => {
    const committeesSection = document.getElementById('committees-section');
    if (committeesSection && !document.querySelector('.committees-message')) {
        const messageElement = document.createElement('div');
        messageElement.className = 'committees-message';
        messageElement.innerText = 'Em breve! Estamos preparando o melhor para os senhores e senhoras delegados(as)';
        committeesSection.insertBefore(messageElement, committeesSection.querySelector('.committees-grid'));
    }
});
