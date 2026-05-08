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

                const iconSvg = this.getIconSvg(type);
                
                card.innerHTML = `
                    <div class="notification-header">
                        <div class="notification-icon ${type}">
                            ${iconSvg}
                        </div>
                        <div class="notification-content">
                            <h3 class="notification-title">${title}</h3>
                            <p class="notification-message">${message}</p>
                        </div>
                    </div>
                    <div class="notification-actions">
                        ${showCancel ? `<button class="notification-btn notification-btn-secondary" data-action="cancel"><span>${cancelText}</span></button>` : ''}
                        <button class="notification-btn ${type === 'error' || type === 'confirm' ? 'notification-btn-danger' : 'notification-btn-primary'}" data-action="confirm">
                            ${this.getButtonIcon(type)}
                            <span>${confirmText}</span>
                        </button>
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

        getIconSvg(type) {
            const icons = {
                success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>',
                error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
                warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
                info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
                confirm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
            };
            return icons[type] || icons.info;
        },

        getButtonIcon(type) {
            if (type === 'success') {
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>';
            }
            if (type === 'error' || type === 'confirm') {
                return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>';
            }
            return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 6 9 17 4 12"/></svg>';
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
