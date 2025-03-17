function initAuth() {
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const showRegister = document.getElementById('showRegister');
    const showLogin = document.getElementById('showLogin');
    const loginBox = document.querySelector('.login-box');
    const registerBox = document.querySelector('.register-box');
    const messageContainer = document.getElementById('messageContainer');

    function displayMessage(message, isError = false) {
        messageContainer.style.display = 'block';
        messageContainer.textContent = message;
        messageContainer.style.color = isError ? 'red' : 'green';
    }

    function checkLoginStatus() {
        const token = localStorage.getItem('token');
        const currentPath = window.location.pathname;
        if (token && currentPath === '/login.html') {
            window.location.href = '/dashboard.html';
        } else if (!token && currentPath === '/dashboard.html') {
            window.location.href = '/login.html';
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
                displayMessage('Login realizado com sucesso!');
                setTimeout(() => {
                    window.location.href = '/dashboard.html'; // Redirect to dashboard
                }, 1000);
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
