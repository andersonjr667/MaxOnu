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
        if (!heroCtaGroup) return;
        var t = localStorage.getItem('token');
        var logado = t && t !== 'null' && t !== 'undefined' && t.trim() !== '';
        if (logado) return;
        heroCtaGroup.hidden = false;
        heroCtaGroup.innerHTML = `
            <a href="${getRegistrationLink()}" class="auth-btn auth-btn-primary hero-auth-btn">Faça sua inscrição</a>
        `;
    }

    function showRegistrationBanner() {
        // Oculta cronômetro, mensagem e data
        if (countdownElement) countdownElement.style.display = 'none';
        if (countdownMessage) countdownMessage.style.display = 'none';
        if (eventStartDateElement) eventStartDateElement.style.display = 'none';

        // Insere banner de CTA no lugar
        const container = countdownElement?.parentElement;
        if (!container) return;

        const banner = document.createElement('div');
        banner.className = 'registration-cta-banner';
        banner.innerHTML = `
            <div class="registration-cta-pulse"></div>
            <div class="registration-cta-inner">
                <span class="registration-cta-kicker">✦ Inscrições abertas</span>
                <h2 class="registration-cta-title">Faça sua inscrição na MaxOnu 2026</h2>
                <p class="registration-cta-desc">Monte sua delegação, escolha seu comitê e represente seu país nos debates.</p>
                <a href="${getRegistrationLink()}" class="registration-cta-btn">
                    Inscrever-se agora
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </a>
            </div>
        `;

        container.insertBefore(banner, countdownElement);
    }

    function renderEventDateLabel(timestamp) {
        if (!eventStartDateElement || !Number.isFinite(timestamp)) return;

        const datePart = new Intl.DateTimeFormat('pt-BR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            timeZone: 'America/Sao_Paulo'
        }).format(new Date(timestamp));

        const timePart = new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'America/Sao_Paulo'
        }).format(new Date(timestamp));

        eventStartDateElement.textContent = `Data de Início: ${datePart} às ${timePart}`;
    }

    function updateCountdown() {
        if (!countdownElement || !targetDate) return;

        const now = new Date().getTime();
        const distance = targetDate - now;

        if (distance < 0) {
            clearInterval(interval);
            renderRegistrationCta();
            showRegistrationBanner();
            return;
        }

        const days    = Math.floor(distance / (1000 * 60 * 60 * 24));
        const hours   = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
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

    async function fetchRevealStatus(timeoutMs = 5000) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch('/api/reveal-status', { signal: controller.signal });
            if (!response.ok) return null;
            return await response.json();
        } catch (error) {
            return null;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function loadCountdownConfig() {
        const fallbackTimestamp = new Date('2026-05-04T00:00:00-03:00').getTime();
        targetDate = fallbackTimestamp;
        renderEventDateLabel(targetDate);
        interval = setInterval(updateCountdown, 1000);
        updateCountdown();

        const data = await fetchRevealStatus();
        if (data?.revealDate) {
            const configuredDate = new Date(data.revealDate).getTime();
            targetDate = Number.isNaN(configuredDate) ? fallbackTimestamp : configuredDate;
            renderEventDateLabel(targetDate);
        }
    }

    loadCountdownConfig();
});
