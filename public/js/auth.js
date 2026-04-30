function initAuth() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const loginBox = document.querySelector('.login-box');
    const registerBox = document.querySelector('.register-box');
    const messageContainer = document.getElementById('messageContainer');
    const tabButtons = document.querySelectorAll('[data-auth-tab]');

    if (!loginForm || !registerForm || !loginBox || !registerBox || !messageContainer) {
        return;
    }

    // ── Inline field errors ──────────────────────────────────────────────────
    function setFieldError(inputEl, message) {
        if (!inputEl) return;
        const group = inputEl.closest('.form-group, .auth-checkbox-group');
        if (!group) return;

        clearFieldError(inputEl);
        inputEl.classList.add('field-has-error');

        const hint = document.createElement('span');
        hint.className = 'field-error-hint';
        hint.textContent = message;
        group.appendChild(hint);

        inputEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        inputEl.focus();
    }

    function clearFieldError(inputEl) {
        if (!inputEl) return;
        inputEl.classList.remove('field-has-error');
        const group = inputEl.closest('.form-group, .auth-checkbox-group');
        group?.querySelector('.field-error-hint')?.remove();
    }

    function clearAllFieldErrors(form) {
        form.querySelectorAll('.field-has-error').forEach((el) => el.classList.remove('field-has-error'));
        form.querySelectorAll('.field-error-hint').forEach((el) => el.remove());
    }

    // ── Global message (success only, or fallback) ───────────────────────────
    function displayMessage(message, isError = false) {
        if (isError) {
            // For generic errors with no specific field, show inline at the submit button
            return;
        }
        messageContainer.hidden = false;
        messageContainer.className = 'login-message is-success';
        messageContainer.textContent = message;
    }

    function displayGenericError(form, message) {
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!submitBtn) return;

        form.querySelector('.auth-generic-error')?.remove();
        const el = document.createElement('p');
        el.className = 'auth-generic-error';
        el.textContent = message;
        submitBtn.insertAdjacentElement('beforebegin', el);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function clearGenericError(form) {
        form.querySelector('.auth-generic-error')?.remove();
    }

    function clearMessage() {
        messageContainer.hidden = true;
        messageContainer.textContent = '';
        messageContainer.className = 'login-message';
    }

    function parseValidationError(errorPayload) {
        if (Array.isArray(errorPayload)) {
            return errorPayload[0]?.msg || 'Dados inválidos.';
        }

        if (typeof errorPayload === 'string') {
            return errorPayload;
        }

        return 'Erro inesperado.';
    }

    async function parseApiResponse(response) {
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('application/json')) {
            return response.json();
        }

        const text = await response.text();
        return {
            error: text.startsWith('<!DOCTYPE') ? 'Resposta invalida do servidor.' : text || 'Erro inesperado no servidor.'
        };
    }

    function checkLoginStatus() {
        const token = window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
        const currentPath = window.location.pathname;
        const isTokenValido = token && token !== 'null' && token !== 'undefined' && token.trim() !== '';

        if (!isTokenValido) {
            if (window.MaxOnuSession?.clearAuth) {
                window.MaxOnuSession.clearAuth();
            } else {
                localStorage.removeItem('token');
                localStorage.removeItem('isAdmin');
                localStorage.removeItem('role');
            }
        }

        if (['/dashboard', '/dashboard.html', '/dashboard-inscricoes', '/dashboard-inscricoes.html', '/admin', '/admin.html', '/coordenacao', '/coordenacao.html', '/orientadores', '/orientadores.html', '/imprensa-dashboard', '/imprensa-dashboard.html', '/inscricao', '/inscricao.html', '/profile', '/profile.html'].includes(currentPath) && !isTokenValido) {
            window.location.href = '/login';
        }
    }

    function getRoleRedirect(role) {
        if (role === 'admin') return '/admin';
        if (role === 'coordinator') return '/coordenacao';
        if (role === 'teacher') return '/orientadores';
        if (role === 'press') return '/imprensa-dashboard';
        return '/profile';
    }

    function getSafeNextPath() {
        const next = new URLSearchParams(window.location.search).get('next');
        if (!next || !next.startsWith('/') || next.startsWith('//')) {
            return '';
        }
        return next;
    }

    function setButtonLoading(button, isLoading, loadingText) {
        if (!button) return;

        if (isLoading) {
            button.dataset.originalText = button.textContent;
            button.textContent = loadingText;
            button.disabled = true;
        } else {
            button.textContent = button.dataset.originalText || button.textContent;
            button.disabled = false;
        }
    }

    function switchTab(tabName) {
        const showLogin = tabName === 'login';
        loginBox.hidden = !showLogin;
        registerBox.hidden = showLogin;
        clearMessage();

        tabButtons.forEach((button) => {
            const isActive = button.dataset.authTab === tabName;
            button.classList.toggle('is-active', isActive);
            button.setAttribute('aria-selected', isActive ? 'true' : 'false');
        });
    }

    function togglePassword(targetId, trigger) {
        const input = document.getElementById(targetId);
        if (!input) return;

        const isPassword = input.type === 'password';
        input.type = isPassword ? 'text' : 'password';
        trigger.textContent = isPassword ? 'Ocultar' : 'Mostrar';
    }

    tabButtons.forEach((button) => {
        button.addEventListener('click', () => switchTab(button.dataset.authTab));
    });

    document.querySelectorAll('[data-password-target]').forEach((button) => {
        button.addEventListener('click', () => togglePassword(button.dataset.passwordTarget, button));
    });

    const urlHash = window.location.hash;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlHash === '#register' || urlParams.get('register') === '1') {
        switchTab('register');
    } else {
        switchTab('login');
    }

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage();

        const submitButton = loginForm.querySelector('button[type="submit"]');
        const emailInput = document.getElementById('loginEmail');
        const passwordInput = document.getElementById('password');
        const email = emailInput?.value.trim() || '';
        const password = passwordInput?.value || '';

        clearAllFieldErrors(loginForm);
        clearGenericError(loginForm);

        // Validações inline antes de enviar
        if (!email) {
            setFieldError(emailInput, 'Informe seu email ou usuário.');
            return;
        }
        if (!password) {
            setFieldError(passwordInput, 'Informe sua senha.');
            return;
        }

        setButtonLoading(submitButton, true, 'Entrando...');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await parseApiResponse(response);
            if (!response.ok) {
                const msg = parseValidationError(data.error) || 'Erro ao fazer login.';
                // Tenta mapear o erro para o campo certo
                const msgLower = msg.toLowerCase();
                if (msgLower.includes('senha') || msgLower.includes('password')) {
                    setFieldError(passwordInput, msg);
                } else if (msgLower.includes('usuário') || msgLower.includes('email') || msgLower.includes('usuario') || msgLower.includes('encontrado') || msgLower.includes('não existe')) {
                    setFieldError(emailInput, msg);
                } else {
                    displayGenericError(loginForm, msg);
                }
                return;
            }

            if (data.twoFactorRequired) {
                sessionStorage.setItem('2fa_user_id', data.userId);
                sessionStorage.setItem('2fa_method', data.twoFactorMethod || 'totp');
                sessionStorage.setItem('2fa_masked_email', data.maskedEmail || '');
                displayMessage('Verificação de dois fatores necessária...');
                setTimeout(() => { window.location.href = '/verify-2fa-login'; }, 500);
                return;
            }

            localStorage.setItem('token', data.token);
            localStorage.setItem('isAdmin', data.isAdmin);
            localStorage.setItem('role', data.role || 'candidate');
            if (window.MaxOnuSession?.refreshAuthContext) {
                window.MaxOnuSession.refreshAuthContext().catch(() => {});
            }
            displayMessage('Login realizado com sucesso!');

            if (data.token) {
                setTimeout(() => {
                    const nextPath = getSafeNextPath();
                    window.location.href = nextPath || getRoleRedirect(data.role || 'candidate');
                }, 700);
            }
        } catch (error) {
            console.error('Erro no login:', error);
            displayGenericError(loginForm, error.message || 'Erro ao fazer login.');
        } finally {
            setButtonLoading(submitButton, false, 'Entrar na MaxOnu');
        }
    });

    registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage();

        const submitButton = registerForm.querySelector('button[type="submit"]');
        const fullNameInput = document.getElementById('newFullName');
        const emailInput = document.getElementById('registerEmail');
        const usernameInput = document.getElementById('registerUsername');
        const genderInput = document.getElementById('registerGender');
        const unidadeInput = document.getElementById('unidade');
        const turmaInput = document.getElementById('turma');
        const passwordInput = document.getElementById('newPassword');
        const acceptTermsInput = document.getElementById('acceptTerms');
        const fullName = fullNameInput?.value.trim() || '';
        const email = emailInput?.value.trim() || '';
        const username = usernameInput?.value.trim() || '';
        const gender = genderInput?.value || '';
        const unidade = unidadeInput?.value || '';
        const turma = turmaInput?.value || '';
        const password = passwordInput?.value || '';

        clearAllFieldErrors(registerForm);
        clearGenericError(registerForm);

        // Validações inline antes de enviar
        if (!fullName) {
            setFieldError(fullNameInput, 'Informe seu nome completo.');
            return;
        }
        if (!email) {
            setFieldError(emailInput, 'Informe seu email.');
            return;
        }
        if (!username) {
            setFieldError(usernameInput, 'Informe um nome de usuário.');
            return;
        }
        if (username.includes('@')) {
            setFieldError(usernameInput, 'O usuário não pode conter @. Use apenas letras, números e pontos.');
            return;
        }
        if (/\s/.test(username)) {
            setFieldError(usernameInput, 'O usuário não pode ter espaços.');
            return;
        }
        if (!gender) {
            setFieldError(genderInput, 'Selecione o gênero.');
            return;
        }
        if (!unidade) {
            setFieldError(unidadeInput, 'Selecione a unidade.');
            return;
        }
        if (!turma) {
            setFieldError(turmaInput, 'Selecione a turma.');
            return;
        }
        if (!password) {
            setFieldError(passwordInput, 'Informe uma senha.');
            return;
        }
        if (password.length < 6) {
            setFieldError(passwordInput, 'A senha precisa ter no mínimo 6 caracteres.');
            return;
        }
        if (!acceptTermsInput?.checked) {
            setFieldError(acceptTermsInput, 'Você precisa aceitar os termos de uso.');
            return;
        }

        const classGroup = `${unidade} - ${turma}`;
        setButtonLoading(submitButton, true, 'Criando conta...');

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fullName, username, email, classGroup, password, gender, acceptTerms: true })
            });

            const data = await parseApiResponse(response);
            if (!response.ok) {
                const msg = parseValidationError(data.error) || 'Erro ao registrar.';
                const msgLower = msg.toLowerCase();
                if (msgLower.includes('email') || msgLower.includes('e-mail')) {
                    setFieldError(emailInput, msg);
                } else if (msgLower.includes('usuário') || msgLower.includes('usuario') || msgLower.includes('username')) {
                    setFieldError(usernameInput, msg);
                } else if (msgLower.includes('senha') || msgLower.includes('password')) {
                    setFieldError(passwordInput, msg);
                } else if (msgLower.includes('nome')) {
                    setFieldError(fullNameInput, msg);
                } else {
                    displayGenericError(registerForm, msg);
                }
                return;
            }

            displayMessage(`Cadastro realizado com sucesso! Seu usuário é @${data.username || username}. Faça login para continuar.`);
            registerForm.reset();
            setTimeout(() => switchTab('login'), 800);
        } catch (error) {
            console.error('Erro no registro:', error);
            displayGenericError(registerForm, error.message || 'Erro ao registrar.');
        } finally {
            setButtonLoading(submitButton, false, 'Criar minha conta');
        }
    });

    checkLoginStatus();

    // Limpa erro inline ao começar a editar o campo
    [loginForm, registerForm].forEach((form) => {
        form.querySelectorAll('input, select').forEach((input) => {
            input.addEventListener('input', () => clearFieldError(input));
            input.addEventListener('change', () => clearFieldError(input));
        });
    });
}

document.addEventListener('DOMContentLoaded', initAuth);
