const API_URL = '/api';

function clearAuthAndRedirectToLogin() {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('isAdmin');
    sessionStorage.removeItem('2fa_user_id');
    sessionStorage.removeItem('2fa_method');
    sessionStorage.removeItem('2fa_masked_email');
    window.location.href = '/login';
}

function getRoleRedirect(role) {
    if (role === 'admin') return '/admin';
    if (role === 'coordinator') return '/coordenacao';
    if (role === 'teacher') return '/orientadores';
    if (role === 'press') return '/imprensa-dashboard';
    return '/profile';
}

function initVerifyTwoFactorPage() {
    const userId = sessionStorage.getItem('2fa_user_id');
    const twoFactorMethod = sessionStorage.getItem('2fa_method') || 'totp';
    const maskedEmail = sessionStorage.getItem('2fa_masked_email') || '';
    let resendCooldownSeconds = 0;
    let resendCooldownInterval = null;

    if (!userId) {
        window.location.href = '/login';
        return;
    }

    const messageContainer = document.getElementById('messageContainer');
    const verifyTabBar = document.getElementById('verifyTabBar');
    const verifyIntro = document.getElementById('verify2faIntro');
    const resendCodeWrap = document.getElementById('resendCodeWrap');
    const resendButton = document.getElementById('resend2faCodeButton');
    const resendCountdown = document.getElementById('resend2faCountdown');
    const emailForm = document.getElementById('email-form');
    const totpForm = document.getElementById('totp-form');
    const backupForm = document.getElementById('backup-form');
    const logoutButton = document.getElementById('logout2fa');

    function displayMessage(message, isError = false) {
        if (!messageContainer) {
            return;
        }
        messageContainer.hidden = false;
        messageContainer.className = `login-message ${isError ? 'is-error' : 'is-success'}`;
        messageContainer.textContent = message;
    }

    function clearMessage() {
        if (!messageContainer) {
            return;
        }
        messageContainer.hidden = true;
        messageContainer.className = 'login-message';
        messageContainer.textContent = '';
    }

    function clearResendCooldownInterval() {
        if (resendCooldownInterval) {
            clearInterval(resendCooldownInterval);
            resendCooldownInterval = null;
        }
    }

    function startResendCooldown(seconds = 30) {
        if (!resendButton || !resendCountdown) {
            return;
        }

        clearResendCooldownInterval();
        resendCooldownSeconds = seconds;
        resendButton.disabled = true;
        resendCountdown.textContent = ` (${resendCooldownSeconds}s)`;

        resendCooldownInterval = setInterval(() => {
            resendCooldownSeconds -= 1;
            if (resendCooldownSeconds <= 0) {
                clearResendCooldownInterval();
                resendButton.disabled = false;
                resendCountdown.textContent = '';
                return;
            }
            resendCountdown.textContent = ` (${resendCooldownSeconds}s)`;
        }, 1000);
    }

    async function resendEmailCode() {
        if (!resendButton || resendButton.disabled) {
            return;
        }

        resendButton.disabled = true;
        try {
            const response = await fetch(`${API_URL}/resend-2fa-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(Array.isArray(data.error) ? data.error[0]?.msg : data.error);
            }

            displayMessage(data.message || 'Novo código enviado para seu email.');
            startResendCooldown(30);
        } catch (error) {
            displayMessage(error.message || 'Não foi possível reenviar o código agora.', true);
            resendButton.disabled = false;
        }
    }

    function switchTab(tabName) {
        document.querySelectorAll('[data-verify-panel]').forEach((panel) => {
            panel.hidden = panel.dataset.verifyPanel !== tabName;
        });
        document.querySelectorAll('[data-verify-tab]').forEach((button) => {
            button.classList.toggle('is-active', button.dataset.verifyTab === tabName);
        });
        clearMessage();
    }

    async function submitVerification(tokenValue, successMessage) {
        try {
            const response = await fetch(`${API_URL}/verify-2fa-login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId, token: tokenValue })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(Array.isArray(data.error) ? data.error[0]?.msg : data.error);
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('role', data.role || 'candidate');
            localStorage.setItem('isAdmin', data.isAdmin ? 'true' : 'false');
            sessionStorage.removeItem('2fa_user_id');
            sessionStorage.removeItem('2fa_method');
            sessionStorage.removeItem('2fa_masked_email');

            displayMessage(successMessage);
            setTimeout(() => {
                window.location.href = getRoleRedirect(data.role || 'candidate');
            }, 900);
        } catch (error) {
            displayMessage(error.message || 'Código inválido.', true);
        }
    }

    document.querySelectorAll('[data-verify-tab]').forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.verifyTab));
    });

    if (twoFactorMethod === 'email') {
        if (verifyTabBar) verifyTabBar.hidden = true;
        if (resendCodeWrap) resendCodeWrap.hidden = false;
        if (verifyIntro) {
            verifyIntro.textContent = maskedEmail
                ? `Digite o código de 6 dígitos enviado para ${maskedEmail}.`
                : 'Digite o código de 6 dígitos enviado para seu email.';
        }
        switchTab('email');
        startResendCooldown(20);
    } else {
        switchTab('totp');
    }

    resendButton?.addEventListener('click', async () => {
        await resendEmailCode();
    });

    emailForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const code = document.getElementById('email-code')?.value.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            displayMessage('O código do email deve ter 6 dígitos.', true);
            return;
        }
        await submitVerification(code, 'Código verificado com sucesso.');
    });

    totpForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const code = document.getElementById('totp-code')?.value.trim() || '';
        if (!/^\d{6}$/.test(code)) {
            displayMessage('O código do autenticador deve ter 6 dígitos.', true);
            return;
        }
        await submitVerification(code, '2FA verificado com sucesso.');
    });

    backupForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const code = document.getElementById('backup-code')?.value.trim().toUpperCase() || '';
        if (!code) {
            displayMessage('Digite um código de backup válido.', true);
            return;
        }
        await submitVerification(code, 'Código de backup verificado com sucesso.');
    });

    logoutButton?.addEventListener('click', (event) => {
        event.preventDefault();
        clearAuthAndRedirectToLogin();
    });
}

document.addEventListener('DOMContentLoaded', initVerifyTwoFactorPage);
