const API_URL = '/api';
let verifiedResetToken = '';

function setAlert(message, isError = false) {
    const container = document.getElementById('global-alert');
    if (!container) return;
    container.hidden = false;
    container.className = `login-message ${isError ? 'is-error' : 'is-success'}`;
    container.innerHTML = message;
}

function clearAlert() {
    const container = document.getElementById('global-alert');
    if (!container) return;
    container.hidden = true;
    container.className = 'login-message';
    container.innerHTML = '';
}

function setStep(stepNumber) {
    const request = document.getElementById('step-request');
    const code = document.getElementById('step-code');
    const reset = document.getElementById('step-reset');

    if (request) request.hidden = stepNumber !== 1;
    if (code) code.hidden = stepNumber !== 2;
    if (reset) reset.hidden = stepNumber !== 3;

    document.querySelectorAll('[data-step-indicator]').forEach((node) => {
        const isActive = Number(node.dataset.stepIndicator) === Number(stepNumber);
        node.classList.toggle('is-active', isActive);
    });
}

async function requestCode(email, showOnlyMessage = false) {
    const response = await fetch(`${API_URL}/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(Array.isArray(data.error) ? data.error[0]?.msg : data.error || 'Erro ao solicitar código.');
    }

    const baseMessage = data.message || 'Código enviado com sucesso.';
    const debugSnippet = data.resetCode
        ? `<br><br><strong>Modo teste:</strong><br><code>${data.resetCode}</code>`
        : '';
    setAlert(`${baseMessage}${debugSnippet}`);

    if (!showOnlyMessage) {
        const verificationEmail = document.getElementById('verification-email');
        if (verificationEmail) {
            verificationEmail.value = email;
        }
        setStep(2);
    }
}

function initForgotPasswordPage() {
    document.getElementById('request-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();

        const button = document.getElementById('request-btn');
        const email = document.getElementById('request-email')?.value.trim();
        if (!email) {
            setAlert('Informe seu email para continuar.', true);
            return;
        }

        if (button) {
            button.disabled = true;
            button.textContent = 'Enviando...';
        }

        try {
            await requestCode(email, false);
        } catch (error) {
            setAlert(error.message || 'Não foi possível enviar o código.', true);
        } finally {
            if (button) {
                button.disabled = false;
                button.textContent = 'Enviar código';
            }
        }
    });

    document.getElementById('resend-btn')?.addEventListener('click', async () => {
        clearAlert();
        const button = document.getElementById('resend-btn');
        const email = document.getElementById('verification-email')?.value.trim();

        if (!email) {
            setAlert('Informe o email para reenviar o código.', true);
            return;
        }

        button.disabled = true;
        button.textContent = 'Reenviando...';

        try {
            await requestCode(email, true);
        } catch (error) {
            setAlert(error.message || 'Não foi possível reenviar o código.', true);
        } finally {
            button.disabled = false;
            button.textContent = 'Reenviar código';
        }
    });

    document.getElementById('verify-code-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();

        const button = document.getElementById('verify-btn');
        const email = document.getElementById('verification-email')?.value.trim();
        const code = document.getElementById('verification-code')?.value.trim();

        if (!email || !code) {
            setAlert('Preencha email e código para validar.', true);
            return;
        }

        if (!/^\d{6}$/.test(code)) {
            setAlert('O código deve ter 6 dígitos numéricos.', true);
            return;
        }

        button.disabled = true;
        button.textContent = 'Validando...';

        try {
            const response = await fetch(`${API_URL}/verify-reset-code`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(Array.isArray(data.error) ? data.error[0]?.msg : data.error || 'Código inválido.');
            }

            verifiedResetToken = data.verificationToken || '';
            if (!verifiedResetToken) {
                throw new Error('Falha ao iniciar a etapa de nova senha.');
            }

            setStep(3);
            setAlert(data.message || 'Código validado com sucesso. Agora defina sua nova senha.');
        } catch (error) {
            setAlert(error.message || 'Não foi possível validar o código.', true);
        } finally {
            button.disabled = false;
            button.textContent = 'Validar código';
        }
    });

    document.getElementById('reset-form')?.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearAlert();

        const newPassword = document.getElementById('reset-password')?.value || '';
        const confirmPassword = document.getElementById('reset-confirm')?.value || '';
        const button = document.getElementById('reset-btn');

        if (!verifiedResetToken) {
            setAlert('Valide o código antes de criar a nova senha.', true);
            setStep(2);
            return;
        }

        if (newPassword.length < 6) {
            setAlert('A nova senha precisa ter pelo menos 6 caracteres.', true);
            return;
        }

        if (newPassword !== confirmPassword) {
            setAlert('As senhas não correspondem.', true);
            return;
        }

        button.disabled = true;
        button.textContent = 'Salvando...';

        try {
            const response = await fetch(`${API_URL}/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: verifiedResetToken, newPassword })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(Array.isArray(data.error) ? data.error[0]?.msg : data.error || 'Falha ao salvar nova senha.');
            }

            setAlert(`${data.message || 'Senha atualizada com sucesso.'}<br><br>Você já pode entrar normalmente em <a href="/login" class="text-link">/login</a>.`);
            event.target.reset();
            verifiedResetToken = '';
            setStep(1);
        } catch (error) {
            setAlert(error.message || 'Não foi possível redefinir a senha.', true);
        } finally {
            button.disabled = false;
            button.textContent = 'Salvar nova senha';
        }
    });

    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
        verifiedResetToken = tokenFromUrl;
        setStep(3);
        setAlert('Token de recuperação detectado. Defina sua nova senha abaixo.');
    } else {
        setStep(1);
    }
}

document.addEventListener('DOMContentLoaded', initForgotPasswordPage);
