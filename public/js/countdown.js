// countdown.js
function padZero(value) {
    return value < 10 ? '0' + value : value;
}

document.addEventListener('DOMContentLoaded', function() {
    const countdownElement = document.getElementById('countdown');
    const heroCtaGroup = document.getElementById('heroCtaGroup');
    const countdownMessage = document.querySelector('.countdown-message');
    const eventStartDateElement = document.getElementById('eventStartDate');
    let interval;
    let targetDate = null;

    function getRegistrationLink() {
        const token = localStorage.getItem('token');
        const validToken = token && token !== 'null' && token !== 'undefined' && token.trim() !== '';
        return validToken ? '/inscricao' : '/login?next=/inscricao';
    }

    function renderRegistrationCta() {
        if (!heroCtaGroup) {
            return;
        }

        heroCtaGroup.innerHTML = `
            <a href="${getRegistrationLink()}" class="auth-btn auth-btn-primary hero-auth-btn">Faça sua inscrição</a>
        `;
    }

    function renderEventDateLabel(timestamp) {
        if (!eventStartDateElement || !Number.isFinite(timestamp)) {
            return;
        }

        const formatted = new Intl.DateTimeFormat('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Sao_Paulo'
        }).format(new Date(timestamp));

        eventStartDateElement.textContent = `Data de Início: ${formatted}`;
    }

    function updateCountdown() {
        if (!countdownElement || !targetDate) {
            return;
        }

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

    async function loadCountdownConfig() {
        const fallbackTimestamp = new Date('2026-05-04T00:00:00-03:00').getTime();

        try {
            const response = await fetch('/api/reveal-status');
            const data = await response.json();
            const configuredDate = new Date(data.revealDate).getTime();
            targetDate = Number.isNaN(configuredDate) ? fallbackTimestamp : configuredDate;
        } catch (error) {
            targetDate = fallbackTimestamp;
        }

        renderEventDateLabel(targetDate);
        interval = setInterval(updateCountdown, 1000);
        updateCountdown();
    }

    loadCountdownConfig();
});
