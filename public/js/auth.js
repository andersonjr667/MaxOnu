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

    function displayMessage(message, isError = false) {
        messageContainer.style.display = 'block';
        messageContainer.className = `login-message ${isError ? 'is-error' : 'is-success'}`;
        messageContainer.textContent = message;
    }

    function clearMessage() {
        messageContainer.style.display = 'none';
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

        if (['/dashboard.html', '/admin.html', '/coordenacao.html', '/orientadores.html', '/imprensa-dashboard.html', '/inscricao.html'].includes(currentPath) && !isTokenValido) {
            window.location.href = '/login.html';
        }
    }

    function getRoleRedirect(role) {
        if (role === 'admin') return '/admin.html';
        if (role === 'coordinator') return '/coordenacao.html';
        if (role === 'teacher') return '/orientadores.html';
        if (role === 'press') return '/imprensa-dashboard.html';
        return '/profile.html';
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
        loginBox.style.display = showLogin ? 'block' : 'none';
        registerBox.style.display = showLogin ? 'none' : 'block';
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

        setButtonLoading(submitButton, true, 'Entrando...');

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });

            const data = await parseApiResponse(response);
            if (!response.ok) {
                throw new Error(parseValidationError(data.error) || 'Erro ao fazer login.');
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
            displayMessage(error.message || 'Erro ao fazer login.', true);
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
        const unidadeInput = document.getElementById('unidade');
        const turmaInput = document.getElementById('turma');
        const passwordInput = document.getElementById('newPassword');
        const fullName = fullNameInput?.value.trim() || '';
        const email = emailInput?.value.trim() || '';
        const unidade = unidadeInput?.value || '';
        const turma = turmaInput?.value || '';
        const password = passwordInput?.value || '';

        if (!unidade || !turma) {
            displayMessage('Selecione a unidade e a turma para concluir o cadastro.', true);
            return;
        }

        const classGroup = `${unidade} - ${turma}`;
        setButtonLoading(submitButton, true, 'Criando conta...');

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ fullName, email, classGroup, password })
            });

            const data = await parseApiResponse(response);
            if (!response.ok) {
                throw new Error(parseValidationError(data.error) || 'Erro ao registrar.');
            }

            displayMessage('Cadastro realizado com sucesso! Faça login para continuar.');
            registerForm.reset();
            setTimeout(() => switchTab('login'), 800);
        } catch (error) {
            console.error('Erro no registro:', error);
            displayMessage(error.message || 'Erro ao registrar.', true);
        } finally {
            setButtonLoading(submitButton, false, 'Criar minha conta');
        }
    });

    checkLoginStatus();
}

document.addEventListener('DOMContentLoaded', initAuth);
