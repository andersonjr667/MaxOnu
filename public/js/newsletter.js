(function () {
    'use strict';

    // Check if newsletter is enabled
    async function checkNewsletterEnabled() {
        try {
            const res = await fetch('/api/newsletter/status');
            const data = await res.json();
            if (!data.enabled) {
                window.location.href = '/';
                return false;
            }
            return true;
        } catch (err) {
            console.error('Newsletter status check error:', err);
            window.location.href = '/';
            return false;
        }
    }

    function getToken() {
        return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    }

    function showFeedback(el, message, type) {
        el.textContent = message;
        el.className = `newsletter-feedback is-${type}`;
        el.hidden = false;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideFeedback(el) {
        el.hidden = true;
    }

    function setLoading(btn, loading) {
        if (loading) {
            btn.dataset.orig = btn.textContent;
            btn.textContent = 'Aguarde...';
            btn.disabled = true;
            btn.style.opacity = '0.7';
        } else {
            btn.textContent = btn.dataset.orig || btn.textContent;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    function validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }

    // Initialize page
    async function init() {
        const isEnabled = await checkNewsletterEnabled();
        if (!isEnabled) return;

        // Handle unsubscribe via URL param
        const params = new URLSearchParams(location.search);
        if (params.get('action') === 'unsubscribe' && params.get('email')) {
            const emailInput = document.getElementById('unsubEmail');
            if (emailInput) {
                emailInput.value = decodeURIComponent(params.get('email'));
                setTimeout(() => {
                    document.getElementById('unsubscribeCard')?.scrollIntoView({ behavior: 'smooth' });
                }, 300);
            }
        }

        setupForms();
        initAdminPanel();
    }

    function setupForms() {
        // Subscribe form
        const subscribeForm = document.getElementById('subscribeForm');
        subscribeForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('subscribeBtn');
            const msgEl = document.getElementById('subscribeMessage');
            const email = document.getElementById('subEmail').value.trim();
            const name = document.getElementById('subName').value.trim();
            const consent = document.getElementById('subConsent').checked;

            hideFeedback(msgEl);

            if (!email) {
                showFeedback(msgEl, 'Por favor, insira seu email.', 'error');
                return;
            }

            if (!validateEmail(email)) {
                showFeedback(msgEl, 'Por favor, insira um email válido.', 'error');
                return;
            }

            if (!consent) {
                showFeedback(msgEl, 'Você precisa aceitar os termos para se inscrever.', 'error');
                return;
            }

            setLoading(btn, true);
            try {
                const res = await fetch('/api/newsletter/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, name })
                });
                const data = await res.json();
                if (res.ok) {
                    showFeedback(msgEl, data.message || 'Inscrição realizada com sucesso!', 'success');
                    subscribeForm.reset();
                } else {
                    showFeedback(msgEl, data.error || 'Erro ao processar inscrição.', 'error');
                }
            } catch (err) {
                console.error('Subscribe error:', err);
                showFeedback(msgEl, 'Erro de conexão. Tente novamente.', 'error');
            } finally {
                setLoading(btn, false);
            }
        });

        // Unsubscribe form
        const unsubscribeForm = document.getElementById('unsubscribeForm');
        unsubscribeForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('unsubscribeBtn');
            const msgEl = document.getElementById('unsubscribeMessage');
            const email = document.getElementById('unsubEmail').value.trim();

            hideFeedback(msgEl);

            if (!email) {
                showFeedback(msgEl, 'Por favor, insira seu email.', 'error');
                return;
            }

            if (!validateEmail(email)) {
                showFeedback(msgEl, 'Por favor, insira um email válido.', 'error');
                return;
            }

            setLoading(btn, true);
            try {
                const res = await fetch('/api/newsletter/unsubscribe', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                const data = await res.json();
                showFeedback(msgEl, data.message || data.error, res.ok ? 'success' : 'error');
                if (res.ok) unsubscribeForm.reset();
            } catch (err) {
                console.error('Unsubscribe error:', err);
                showFeedback(msgEl, 'Erro de conexão. Tente novamente.', 'error');
            } finally {
                setLoading(btn, false);
            }
        });

        // Send newsletter form
        const sendForm = document.getElementById('sendNewsletterForm');
        sendForm?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('sendNewsletterBtn');
            const msgEl = document.getElementById('sendMessage');
            const token = getToken();
            const subject = document.getElementById('sendSubject').value.trim();
            const title = document.getElementById('sendTitle').value.trim();
            const content = document.getElementById('sendContent').value.trim();

            hideFeedback(msgEl);

            if (!subject || !title || !content) {
                showFeedback(msgEl, 'Preencha todos os campos obrigatórios.', 'error');
                return;
            }

            if (!token) {
                showFeedback(msgEl, 'Você precisa estar autenticado.', 'error');
                return;
            }

            if (!confirm('Tem certeza que deseja enviar este email para todos os inscritos?')) {
                return;
            }

            setLoading(btn, true);
            try {
                const res = await fetch('/api/newsletter/send', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        Authorization: `Bearer ${token}` 
                    },
                    body: JSON.stringify({ subject, title, content })
                });
                const data = await res.json();
                showFeedback(msgEl, data.message || data.error, res.ok ? 'success' : 'error');
                if (res.ok) sendForm.reset();
            } catch (err) {
                console.error('Send newsletter error:', err);
                showFeedback(msgEl, 'Erro de conexão.', 'error');
            } finally {
                setLoading(btn, false);
            }
        });
    }

    // Admin panel
    async function initAdminPanel() {
        const token = getToken();
        if (!token) return;

        try {
            const res = await fetch('/api/check-admin', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.isAdmin) return;

            const panel = document.getElementById('newsletterAdminPanel');
            if (panel) panel.hidden = false;

            // Load subscriber count
            const subRes = await fetch('/api/newsletter/subscribers?active=true', {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (subRes.ok) {
                const subData = await subRes.json();
                const el = document.getElementById('statTotal');
                if (el) el.textContent = subData.total || 0;
            }
        } catch (err) {
            console.error('Admin panel init error:', err);
        }
    }

    // Initialize on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
