// countdown.js
function padZero(value) {
    return value < 10 ? '0' + value : value;
}

document.addEventListener('DOMContentLoaded', function() {
    const countdownElement = document.getElementById('countdown');
    const heroCtaGroup = document.getElementById('heroCtaGroup');
    const countdownMessage = document.querySelector('.countdown-message');
    const targetDate = new Date('2026-05-04T00:00:00').getTime(); // Início da MaxOnu 2026: 04/05/2026

    function getRegistrationLink() {
        const token = localStorage.getItem('token');
        const validToken = token && token !== 'null' && token !== 'undefined' && token.trim() !== '';
        return validToken ? 'inscricao.html' : 'login.html?next=/inscricao.html';
    }

    function renderRegistrationCta() {
        if (!heroCtaGroup) {
            return;
        }

        heroCtaGroup.innerHTML = `
            <a href="${getRegistrationLink()}" class="auth-btn auth-btn-primary hero-auth-btn">Faça sua inscrição</a>
        `;
    }

    function updateCountdown() {
        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            clearInterval(interval);
            renderRegistrationCta();
            if (countdownMessage) {
                countdownMessage.textContent = 'A contagem terminou. Faça sua inscrição para começar a montar sua delegação.';
            }
            countdownElement.innerHTML = `
                <div class="time-unit">
                    <div class="time-value">00</div>
                    <div class="time-label">dias</div>
                </div>
                <div class="time-unit">
                    <div class="time-value">00</div>
                    <div class="time-label">horas</div>
                </div>
                <div class="time-unit">
                    <div class="time-value">00</div>
                    <div class="time-label">minutos</div>
                </div>
                <div class="time-unit">
                    <div class="time-value">00</div>
                    <div class="time-label">segundos</div>
                </div>
            `;
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

    const interval = setInterval(updateCountdown, 1000);
    updateCountdown();
});
