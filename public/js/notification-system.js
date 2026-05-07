/**
 * Sistema de Notificações MaxOnu
 * Substitui alert() e confirm() por cards elegantes
 */

(function() {
    'use strict';

    const MaxOnuNotify = {
        overlay: null,
        currentResolve: null,

        init() {
            if (this.overlay) return;
            
            this.overlay = document.createElement('div');
            this.overlay.className = 'notification-overlay';
            this.overlay.addEventListener('click', (e) => {
                if (e.target === this.overlay) {
                    this.close(false);
                }
            });
            document.body.appendChild(this.overlay);
        },

        show(options) {
            this.init();
            
            const {
                type = 'info',
                title = 'Aviso',
                message = '',
                confirmText = 'OK',
                cancelText = 'Cancelar',
                showCancel = false,
                onConfirm = null,
                onCancel = null
            } = options;

            return new Promise((resolve) => {
                this.currentResolve = resolve;

                const card = document.createElement('div');
                card.className = 'notification-card';

                const logoPath = '/images/logo-maxonu.png';
                
                card.innerHTML = `
                    <div class="notification-header">
                        <div class="notification-icon ${type}">
                            <img src="${logoPath}" alt="MaxOnu">
                        </div>
                        <div class="notification-content">
                            <h3 class="notification-title">${title}</h3>
                            <p class="notification-message">${message}</p>
                        </div>
                    </div>
                    <div class="notification-actions">
                        ${showCancel ? `<button class="notification-btn notification-btn-secondary" data-action="cancel">${cancelText}</button>` : ''}
                        <button class="notification-btn ${type === 'error' || type === 'confirm' ? 'notification-btn-danger' : 'notification-btn-primary'}" data-action="confirm">${confirmText}</button>
                    </div>
                `;

                this.overlay.innerHTML = '';
                this.overlay.appendChild(card);

                const confirmBtn = card.querySelector('[data-action="confirm"]');
                const cancelBtn = card.querySelector('[data-action="cancel"]');

                confirmBtn?.addEventListener('click', () => {
                    if (onConfirm) onConfirm();
                    this.close(true);
                });

                cancelBtn?.addEventListener('click', () => {
                    if (onCancel) onCancel();
                    this.close(false);
                });

                setTimeout(() => {
                    this.overlay.classList.add('is-open');
                }, 10);
            });
        },

        close(result) {
            this.overlay.classList.remove('is-open');
            setTimeout(() => {
                if (this.currentResolve) {
                    this.currentResolve(result);
                    this.currentResolve = null;
                }
            }, 300);
        },

        alert(message, title = 'Aviso') {
            return this.show({
                type: 'info',
                title,
                message,
                confirmText: 'OK',
                showCancel: false
            });
        },

        success(message, title = 'Sucesso') {
            return this.show({
                type: 'success',
                title,
                message,
                confirmText: 'OK',
                showCancel: false
            });
        },

        error(message, title = 'Erro') {
            return this.show({
                type: 'error',
                title,
                message,
                confirmText: 'OK',
                showCancel: false
            });
        },

        warning(message, title = 'Atenção') {
            return this.show({
                type: 'warning',
                title,
                message,
                confirmText: 'OK',
                showCancel: false
            });
        },

        confirm(message, title = 'Confirmar') {
            return this.show({
                type: 'confirm',
                title,
                message,
                confirmText: 'Confirmar',
                cancelText: 'Cancelar',
                showCancel: true
            });
        }
    };

    // Expor globalmente
    window.MaxOnuNotify = MaxOnuNotify;

    // Substituir alert e confirm nativos (opcional)
    window.alert = (message) => MaxOnuNotify.alert(String(message));
    window.confirm = (message) => MaxOnuNotify.confirm(String(message));
})();
