function initAuth() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    const loginBox = document.querySelector('.login-box');
    const registerBox = document.querySelector('.register-box');
    const messageContainer = document.getElementById('messageContainer');

    if (!loginForm || !registerForm || !showRegister || !showLogin || !loginBox || !registerBox || !messageContainer) {
        return;
    }

    function displayMessage(message, isError = false) {
        messageContainer.style.display = 'block';
        messageContainer.textContent = message;
        messageContainer.style.color = isError ? '#9f2f3e' : '#0d3b66';
        messageContainer.style.border = `1px solid ${isError ? 'rgba(209, 73, 91, 0.24)' : 'rgba(13, 59, 102, 0.14)'}`;
    }

    function checkLoginStatus() {
        const token = localStorage.getItem('token');
        const currentPath = window.location.pathname;
        const isTokenValido = token && token !== 'null' && token !== 'undefined' && token.trim() !== '';

        // Limpa tokens inválidos do localStorage
        if (token === 'null' || token === 'undefined' || token === '' || token === null) {
            localStorage.removeItem('token');
            localStorage.removeItem('isAdmin');
        }

        // Só faz redirecionamento automático se estiver no dashboard.html e não houver token válido
        if (currentPath === '/dashboard.html') {
            if (!isTokenValido) {
                window.location.href = '/login.html';
            }
        }
    }

    showRegister.addEventListener('click', (e) => {
        e.preventDefault();
        loginBox.style.display = 'none';
        registerBox.style.display = 'block';
        messageContainer.style.display = 'none';
    });

    showLogin.addEventListener('click', (e) => {
        e.preventDefault();
        registerBox.style.display = 'none';
        loginBox.style.display = 'block';
        messageContainer.style.display = 'none';
    });

    // Support linking directly to the register form via hash or query param
    const urlHash = window.location.hash;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlHash === '#register' || urlParams.get('register') === '1') {
        loginBox.style.display = 'none';
        registerBox.style.display = 'block';
    }

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();
            if (response.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('isAdmin', data.isAdmin);
                localStorage.setItem('role', data.role || 'candidate');
                displayMessage('Login realizado com sucesso!');
                if (data.token) {
                    setTimeout(() => {
                        // Redirect based on role
                        const role = data.role || 'candidate';
                        if (role === 'admin') {
                            window.location.href = '/dashboard.html';
                        } else if (role === 'coordinator' || role === 'teacher') {
                            window.location.href = '/dashboard.html';
                        } else {
                            window.location.href = '/profile.html';
                        }
                    }, 800);
                }
            } else {
                displayMessage(data.error || 'Erro ao fazer login', true);
            }
        } catch (error) {
            console.error('Erro no login:', error);
            displayMessage('Erro ao fazer login', true);
        }
    });

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('newUsername').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('newPassword').value;

        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, email, password })
            });

            const data = await response.json();
            if (response.ok) {
                displayMessage('Registro realizado com sucesso!');
                setTimeout(() => {
                    registerBox.style.display = 'none';
                    loginBox.style.display = 'block';
                }, 1000);
            } else {
                displayMessage(data.error || 'Erro ao registrar', true);
            }
        } catch (error) {
            console.error('Erro no registro:', error);
            displayMessage('Erro ao registrar', true);
        }
    });

    checkLoginStatus(); // Check login status on page load
}

document.addEventListener('DOMContentLoaded', initAuth);
