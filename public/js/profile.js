function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

const COMMITTEE_LABELS = {
    1: 'Conselho de Direitos Humanos (CDH - 2026)',
    2: 'Assembleia Geral das Nações Unidas (AGNU)',
    3: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global',
    6: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    7: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)'
};
const PROFILE_IMAGE_EDITOR_SIZE = 240;
const PROFILE_IMAGE_LIVE_PREVIEW_SIZE = 180;
const PROFILE_IMAGE_OUTPUT_SIZE = 1080;
let profileImageEditorState = null;
let profileImageCardDelegatedCloseBound = false;
let profileImageCardLastClosedAt = 0;
let profileImageCardEscapeBound = false;

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

function getErrorMessage(data, fallback) {
    if (Array.isArray(data?.error)) {
        return data.error[0]?.msg || fallback;
    }

    return data?.error || fallback;
}

function getRoleLabel(role) {
    return getRoleLabelForUser({ role });
}

function getRoleLabelForUser(user) {
    if (user?.role === 'candidate') {
        if (user.gender === 'feminino') {
            return 'Delegada';
        }

        if (user.gender === 'masculino') {
            return 'Delegado';
        }

        return 'Delegado(a)';
    }

    const roleLabels = {
        teacher: 'Professor orientador',
        coordinator: 'Coordenador',
        admin: 'Administrador',
        press: 'Imprensa'
    };

    return roleLabels[user?.role] || 'Usuário';
}

function getRoleAreaLabel(user) {
    if (user?.role === 'candidate') {
        if (user.gender === 'feminino') {
            return 'Área da Delegada';
        }

        if (user.gender === 'masculino') {
            return 'Área do Delegado';
        }
    }

    const labels = {
        teacher: 'Área do Orientador',
        coordinator: 'Área da Coordenação',
        admin: 'Área Administrativa',
        press: 'Área da Imprensa'
    };

    return labels[user?.role] || 'Área do Usuário';
}

function getRoleLead(user) {
    const leads = {
        candidate: 'Acompanhe sua inscrição, organize sua delegação e confirme sua composição.',
        teacher: 'Consulte seu acesso de orientação, acompanhe participantes e publique avisos quando necessário.',
        coordinator: 'Gerencie sua visão operacional, acompanhe equipes e concentre ações estratégicas da edição.',
        admin: 'Administre acessos, conteúdo e visão geral da plataforma a partir do seu perfil.',
        press: 'Organize sua cobertura, acompanhe o blog oficial e publique novos conteúdos da imprensa.'
    };

    return leads[user?.role] || 'Gerencie suas informações e atalhos da plataforma.';
}

function getGenderLabel(gender) {
    const labels = {
        masculino: 'Masculino',
        feminino: 'Feminino',
        'nao-binario': 'Não binário',
        outro: 'Outro',
        'prefiro-nao-informar': 'Prefiro não informar'
    };

    return labels[gender] || 'Não informado';
}

function createInfoCard(title, value, options = {}) {
    const { emptyText = 'Não informado', accent = '' } = options;

    return `
        <article class="feature-card ${accent}">
            <h3>${title}</h3>
            <p>${value || emptyText}</p>
        </article>
    `;
}

function getProfileInitials(user) {
    const source = String(user?.fullName || user?.username || '?').trim();
    const tokens = source.split(/\s+/).filter(Boolean).slice(0, 2);
    if (!tokens.length) {
        return '?';
    }

    return tokens.map((token) => token.charAt(0).toUpperCase()).join('');
}

function getDefaultProfileImage(user) {
    if (user?.gender === 'feminino') {
        return '/images/profile_female.png';
    }

    return '/images/profile_male.png';
}

function normalizeProfileImageUrl(url) {
    if (!url || typeof url !== 'string') {
        return '';
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
        return '';
    }

    if (/^(https?:)?\/\//i.test(trimmedUrl) || trimmedUrl.startsWith('/') || trimmedUrl.startsWith('data:') || trimmedUrl.startsWith('blob:')) {
        return trimmedUrl;
    }

    return `/${trimmedUrl.replace(/^\.?\//, '')}`;
}

function addProfileImageVersion(url, version) {
    if (!url || !version) {
        return url;
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${encodeURIComponent(String(version))}`;
}

function getProfileImageUrl(user) {
    const customImage = normalizeProfileImageUrl(user?.profileImageUrl);
    return customImage || getDefaultProfileImage(user);
}

function bindProfileImageFallback() {
    const image = document.getElementById('profilePhotoPreview');
    if (!image) {
        return;
    }

    const fallbackSrc = image.dataset.fallbackSrc;
    if (!fallbackSrc) {
        return;
    }

    image.addEventListener('error', () => {
        if (image.dataset.fallbackApplied === 'true') {
            return;
        }
        image.dataset.fallbackApplied = 'true';
        image.src = fallbackSrc;
    }, { once: true });
}

function createEditableCard(title, field, value, options = {}) {
    const {
        type = 'text',
        placeholder = 'Digite um valor',
        emptyText = 'Não informado'
    } = options;

    return `
        <article class="feature-card editable-card">
            <h3>${title}</h3>
            <div class="editable-content">
                <p class="display-text">${value || emptyText}</p>
                <input type="${type}" class="edit-input" value="${value || ''}" style="display: none;" placeholder="${placeholder}">
                <div class="edit-actions" style="display: none;">
                    <button class="save-btn view-button small">Salvar</button>
                    <button class="cancel-btn view-button small secondary">Cancelar</button>
                </div>
                <button class="edit-btn" data-field="${field}" data-empty-text="${emptyText}">Editar</button>
            </div>
        </article>
    `;
}

function getCommitteeLabel(value) {
    return value ? (COMMITTEE_LABELS[value] || `Comitê ${value}`) : 'Ainda não definido';
}

function createStatusCard(message, tone = 'info') {
    if (!message) {
        return '';
    }

    return `
        <div class="profile-status-card ${tone === 'success' ? 'is-success' : tone === 'error' ? 'is-error' : 'is-info'}" role="status">
            <strong>${tone === 'success' ? 'Convite enviado' : tone === 'error' ? 'Atenção' : 'Aviso'}</strong>
            <p>${message}</p>
        </div>
    `;
}

function getQuickActions(user, delegationStatus) {
    const actions = [];

    if (user.role === 'candidate') {
        actions.push({
            title: 'Minha inscrição',
            description: delegationStatus?.registrationOpen
                ? 'Preencha ou edite suas preferências de comitê.'
                : 'Acompanhe o status da abertura das inscrições.',
            href: '/inscricao',
            label: 'Abrir inscrição'
        });
        actions.push({
            title: 'Blog oficial',
            description: 'Confira comunicados e atualizações publicadas pela equipe.',
            href: '/blog',
            label: 'Ver blog'
        });
        actions.push({
            title: 'Segurança da conta',
            description: 'Ative a autenticação de dois fatores para proteger seu acesso.',
            href: '/two-factor-auth',
            label: 'Configurar 2FA'
        });
    }

    if (user.role === 'teacher') {
        actions.push(
            {
                title: 'Portal dos orientadores',
                description: 'Consulte turmas, comitês e participantes acompanhados.',
                href: '/orientadores',
                label: 'Abrir portal'
            },
            {
                title: 'Painel operacional',
                description: 'Acompanhe distribuição, países e inscrições.',
                href: '/dashboard',
                label: 'Abrir painel'
            },
            {
                title: 'Criar post',
                description: 'Publique orientações e avisos para os participantes.',
                href: '/create-post',
                label: 'Novo post'
            }
        );
    }

    if (user.role === 'coordinator') {
        actions.push(
            {
                title: 'Coordenação',
                description: 'Acesse o hub principal de gestão e distribuição.',
                href: '/coordenacao',
                label: 'Abrir portal'
            },
            {
                title: 'Painel operacional',
                description: 'Gerencie participantes, países, inscrições e publicações.',
                href: '/dashboard',
                label: 'Abrir painel'
            },
            {
                title: 'Criar post',
                description: 'Centralize comunicados operacionais e avisos gerais.',
                href: '/create-post',
                label: 'Novo post'
            }
        );
    }

    if (user.role === 'admin') {
        actions.push(
            {
                title: 'Administração',
                description: 'Gerencie acessos, conteúdo, exportações e usuários.',
                href: '/admin',
                label: 'Abrir portal'
            },
            {
                title: 'Painel operacional',
                description: 'Visualize a operação ampla da edição 2026.',
                href: '/dashboard',
                label: 'Abrir painel'
            },
            {
                title: 'Criar post',
                description: 'Publique notas oficiais da organização.',
                href: '/create-post',
                label: 'Novo post'
            }
        );
    }

    if (user.role === 'press') {
        actions.push(
            {
                title: 'Painel da imprensa',
                description: 'Organize a cobertura, produção de conteúdo e chamadas públicas.',
                href: '/imprensa-dashboard',
                label: 'Abrir painel'
            },
            {
                title: 'Blog',
                description: 'Acompanhe as publicações ativas e o histórico recente.',
                href: '/blog',
                label: 'Ver blog'
            },
            {
                title: 'Criar post',
                description: 'Produza novas publicações e comunicados.',
                href: '/create-post',
                label: 'Novo post'
            }
        );
    }

    return actions;
}

function renderQuickActions(user, delegationStatus, twoFactorStatus) {
    const actions = getQuickActions(user, delegationStatus);

    return `
        <article class="dashboard-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Conta</span>
                <h2>Ações rápidas</h2>
                <p>Atalhos principais para o seu papel dentro da plataforma.</p>
            </div>
            <div class="role-preview-grid">
                ${actions.map((action) => `
                    <div class="role-preview-card">
                        <h3>${action.title}</h3>
                        <p>${action.description}</p>
                        <a href="${action.href}" class="view-button">${action.label}</a>
                    </div>
                `).join('')}
                <div class="role-preview-card">
                    <h3>Autenticação em duas etapas</h3>
                    <p>${twoFactorStatus?.twoFactorEnabled ? 'Sua conta já está protegida com 2FA.' : 'Ative o 2FA para adicionar uma camada extra de segurança.'}</p>
                    <a href="/two-factor-auth" class="view-button">${twoFactorStatus?.twoFactorEnabled ? 'Gerenciar 2FA' : 'Ativar 2FA'}</a>
                </div>
            </div>
        </article>
    `;
}

function renderAccountHighlights(user, twoFactorStatus) {
    const cards = [
        createInfoCard('Função', getRoleLabelForUser(user), { accent: 'blue-accent' }),
        createInfoCard('Área principal', getRoleAreaLabel(user)),
        createInfoCard('Usuário', `@${user.username}`),
        createInfoCard('Segurança', twoFactorStatus?.twoFactorEnabled ? '2FA ativo' : '2FA desativado')
    ];

    if (user.role !== 'candidate') {
        cards.push(createInfoCard('Publicações', 'Pode criar posts no blog institucional'));
    }

    return `
        <article class="dashboard-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Visão da conta</span>
                <h2>Seu acesso na plataforma</h2>
                <p>Resumo rápido das regras e permissões do seu perfil.</p>
            </div>
            <div class="dashboard-summary-grid profile-summary-grid">
                ${cards.join('')}
            </div>
        </article>
    `;
}

function formatCommitteeChoices(registration, revealPassed) {
    if (!registration?.submittedAt) {
        return '<p>Inscrição ainda não enviada.</p>';
    }

    if (!revealPassed) {
        return '<p>Suas preferências de comitê seguem em sigilo até o fim da contagem regressiva.</p>';
    }

    return `
        <p><strong>1ª opção:</strong> ${getCommitteeLabel(registration.firstChoice)}</p>
        <p><strong>2ª opção:</strong> ${getCommitteeLabel(registration.secondChoice)}</p>
        <p><strong>3ª opção:</strong> ${getCommitteeLabel(registration.thirdChoice)}</p>
    `;
}

function bindEditableProfileFields() {
    document.querySelectorAll('.editable-card').forEach((card) => {
        const editBtn = card.querySelector('.edit-btn');
        const displayText = card.querySelector('.display-text');
        const editInput = card.querySelector('.edit-input');
        const editActions = card.querySelector('.edit-actions');
        const saveBtn = card.querySelector('.save-btn');
        const cancelBtn = card.querySelector('.cancel-btn');
        const field = editBtn.dataset.field;
        const emptyText = editBtn.dataset.emptyText || 'Não informado';

        editBtn.addEventListener('click', () => {
            displayText.style.display = 'none';
            editInput.style.display = 'block';
            editActions.style.display = 'flex';
            editBtn.style.display = 'none';
            editInput.focus();
        });

        cancelBtn.addEventListener('click', () => {
            editInput.value = displayText.textContent === emptyText ? '' : displayText.textContent;
            displayText.style.display = 'block';
            editInput.style.display = 'none';
            editActions.style.display = 'none';
            editBtn.style.display = 'inline-block';
        });

        saveBtn.addEventListener('click', async () => {
            const newValue = editInput.value.trim();
            if (!newValue) {
                alert('Campo não pode estar vazio.');
                return;
            }

            try {
                const response = await fetch('/api/me', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${getToken()}`
                    },
                    body: JSON.stringify({ [field]: newValue })
                });

                const data = await parseJson(response);
                if (!response.ok) {
                    throw new Error(getErrorMessage(data, 'Erro ao atualizar informação.'));
                }

                await loadProfile();
            } catch (error) {
                alert(error.message || 'Erro ao atualizar informação.');
            }
        });
    });
}

function bindPasswordForm() {
    const form = document.getElementById('passwordChangeForm');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const feedback = document.getElementById('passwordFeedback');
        const button = form.querySelector('button[type="submit"]');
        const currentPassword = document.getElementById('currentPassword')?.value || '';
        const newPassword = document.getElementById('newPassword')?.value || '';
        const confirmNewPassword = document.getElementById('confirmNewPassword')?.value || '';

        if (newPassword.length < 6) {
            feedback.textContent = 'A nova senha precisa ter ao menos 6 caracteres.';
            return;
        }

        if (newPassword !== confirmNewPassword) {
            feedback.textContent = 'A confirmação da nova senha não confere.';
            return;
        }

        button.disabled = true;
        feedback.textContent = 'Atualizando senha...';

        try {
            const response = await fetch('/api/me/password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await parseJson(response);
            if (!response.ok) {
                const message = Array.isArray(data.error) ? data.error[0]?.msg : data.error;
                throw new Error(message || 'Não foi possível atualizar a senha.');
            }

            feedback.textContent = data.message || 'Senha atualizada com sucesso.';
            form.reset();
        } catch (error) {
            feedback.textContent = error.message || 'Erro ao atualizar a senha.';
        } finally {
            button.disabled = false;
        }
    });
}

function renderProfileSummary(user, twoFactorStatus) {
    const hasUploadedImage = Boolean(normalizeProfileImageUrl(user?.profileImageUrl));
    const imageUrl = getProfileImageUrl(user);
    const fallbackUrl = getDefaultProfileImage(user);
    const versionedImageUrl = addProfileImageVersion(imageUrl, user?.profileImagePublicId);
    const imageAlt = user?.fullName ? `Foto de perfil de ${user.fullName}` : 'Foto de perfil';
    const cards = [
        createEditableCard('Nome completo', 'fullName', user.fullName, { placeholder: 'Digite seu nome completo' }),
        createInfoCard('Usuário de acesso', user.username ? `@${user.username}` : '', { emptyText: 'Usuário não encontrado' }),
        createEditableCard('Email', 'email', user.email, { type: 'email', placeholder: 'Digite seu email' }),
        createInfoCard('Turma', user.classGroup, { emptyText: 'Não informada' }),
        createInfoCard('Função', getRoleLabelForUser(user), { accent: 'blue-accent' }),
        createInfoCard('2FA', twoFactorStatus?.twoFactorEnabled ? 'Ativado' : 'Desativado')
    ];

    return `
        <article class="dashboard-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Perfil</span>
                <h2>Dados da conta</h2>
                <p>Edite seus dados básicos e acompanhe as informações principais do seu acesso.</p>
            </div>
            <div class="profile-account-layout">
                <div class="profile-photo-account-shell">
                    <button type="button" class="profile-photo-shell profile-photo-trigger" id="profilePhotoTrigger" aria-label="Alterar foto de perfil">
                        <img src="${versionedImageUrl}" alt="${imageAlt}" class="profile-photo-preview" id="profilePhotoPreview" data-fallback-src="${fallbackUrl}" loading="eager" decoding="async">
                        <span class="profile-photo-camera-badge" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" focusable="false">
                                <path d="M8 7l1-2h6l1 2h2a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2z" stroke="currentColor" stroke-width="1.8"></path>
                                <circle cx="12" cy="12.5" r="3" stroke="currentColor" stroke-width="1.8"></circle>
                            </svg>
                        </span>
                    </button>
                    <p class="profile-photo-tip">${hasUploadedImage ? 'Foto personalizada.' : 'Você está usando a foto padrão.'} Clique na moldura para abrir o ajuste da imagem.</p>
                </div>
                <div class="dashboard-summary-grid profile-summary-grid">
                    ${cards.join('')}
                </div>
            </div>
            <div class="profile-image-card-overlay" id="profileImageCardOverlay" hidden>
                <div class="profile-image-card" role="dialog" aria-modal="true" aria-labelledby="profileImageCardTitle">
                    <div class="profile-image-card-header">
                        <h3 id="profileImageCardTitle">Ajustar foto</h3>
                        <button type="button" class="profile-image-card-close" id="closeProfileImageCardButton" aria-label="Fechar ajuste de foto">Fechar</button>
                    </div>
                    <form id="profileImageForm" class="dashboard-form profile-image-form">
                        <div class="form-group">
                            <span class="profile-upload-label">Upload da imagem</span>
                            <input type="file" id="profileImageInput" class="profile-file-input" accept="image/*,.heic,.heif" required>
                            <button type="button" id="profilePhotoSelectButton" class="profile-upload-button">Selecionar imagem</button>
                            <span class="profile-file-name" id="profileImageFileName">Nenhum arquivo selecionado</span>
                        </div>
                        <div class="profile-image-editor" id="profileImageEditor" hidden>
                            <div class="profile-image-editor-frame" id="profileImageEditorFrame">
                                <img id="profileImageEditorPreview" alt="Prévia da imagem">
                            </div>
                            <div class="profile-image-editor-controls">
                                <label for="profileImageZoomRange">Zoom</label>
                                <input type="range" id="profileImageZoomRange" min="1" max="4" step="0.01" value="1">
                            </div>
                        </div>
                        <div class="profile-image-actions">
                            <button type="submit" class="view-button profile-action-primary">Salvar foto</button>
                        </div>
                        <p class="register-note registration-feedback" id="profileImageFeedback">Ajuste e envie em 1080x1080. Formatos aceitos: JPG, PNG, GIF ou WEBP (até 5MB).</p>
                    </form>
                </div>
            </div>
        </article>
    `;
}

function renderSecurityPanel(twoFactorStatus) {
    return `
        <article class="dashboard-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Segurança</span>
                <h2>Redefinir senha</h2>
                <p>Use sua senha atual para cadastrar uma nova senha de acesso sem sair da página de perfil.</p>
            </div>
            <div class="registration-overview profile-security-overview">
                ${createInfoCard('Senha', 'Você pode alterar sua senha aqui mesmo.')}
                ${createInfoCard('2FA', twoFactorStatus?.twoFactorEnabled ? 'Ativado' : 'Desativado', { accent: 'blue-accent' })}
            </div>
            <form id="passwordChangeForm" class="dashboard-form profile-password-form">
                <div class="form-group">
                    <label for="currentPassword">Senha atual</label>
                    <input type="password" id="currentPassword" placeholder="Digite sua senha atual" required>
                </div>
                <div class="form-group">
                    <label for="newPassword">Nova senha</label>
                    <input type="password" id="newPassword" placeholder="Digite a nova senha" minlength="6" required>
                </div>
                <div class="form-group">
                    <label for="confirmNewPassword">Confirmar nova senha</label>
                    <input type="password" id="confirmNewPassword" placeholder="Repita a nova senha" minlength="6" required>
                </div>
                <button type="submit" class="view-button">Atualizar senha</button>
            </form>
            <p class="register-note registration-feedback" id="passwordFeedback">Sua conta pode ser protegida ainda mais com a autenticação em duas etapas.</p>

            <div class="profile-danger-zone">
                <h3>Excluir conta</h3>
                <p>Essa ação é permanente e removerá seu acesso da plataforma.</p>
                <button type="button" id="openDeleteAccountCardButton" class="delete-button profile-delete-button">Excluir conta</button>
                <form id="deleteAccountForm" class="dashboard-form profile-delete-form is-hidden">
                    <div class="profile-delete-card">
                        <div class="form-group profile-delete-check">
                            <label>
                                <input type="checkbox" id="deleteAccountConfirmCheck">
                                Confirmo a exclusão da conta
                            </label>
                        </div>
                        <div class="form-group">
                            <label for="deleteAccountPassword">Confirme sua senha</label>
                            <input type="password" id="deleteAccountPassword" placeholder="Digite sua senha atual" required>
                        </div>
                        <div class="profile-delete-actions">
                            <button type="button" id="cancelDeleteAccountButton" class="view-button secondary">Cancelar</button>
                            <button type="submit" id="confirmDeleteAccountButton" class="delete-button profile-delete-button" disabled>Confirmar exclusão</button>
                        </div>
                    </div>
                </form>
                <p class="register-note registration-feedback" id="deleteAccountFeedback">Ao excluir sua conta, você perderá acesso imediato ao sistema.</p>
            </div>
        </article>
    `;
}

function bindDeleteAccountForm() {
    const form = document.getElementById('deleteAccountForm');
    const openButton = document.getElementById('openDeleteAccountCardButton');
    const cancelButton = document.getElementById('cancelDeleteAccountButton');
    const confirmCheck = document.getElementById('deleteAccountConfirmCheck');
    const confirmButton = document.getElementById('confirmDeleteAccountButton');
    const passwordInput = document.getElementById('deleteAccountPassword');
    if (!form) {
        return;
    }

    const closeCard = () => {
        form.classList.add('is-hidden');
        if (confirmCheck) {
            confirmCheck.checked = false;
        }
        if (confirmButton) {
            confirmButton.disabled = true;
        }
        if (passwordInput) {
            passwordInput.value = '';
        }
    };

    openButton?.addEventListener('click', () => {
        form.classList.remove('is-hidden');
        passwordInput?.focus();
    });

    cancelButton?.addEventListener('click', closeCard);

    confirmCheck?.addEventListener('change', () => {
        if (confirmButton) {
            confirmButton.disabled = !confirmCheck.checked;
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const feedback = document.getElementById('deleteAccountFeedback');
        const button = form.querySelector('button[type="submit"]');
        const currentPassword = document.getElementById('deleteAccountPassword')?.value || '';
        if (!confirmCheck?.checked) {
            feedback.textContent = 'Marque a confirmação para continuar.';
            return;
        }

        button.disabled = true;
        feedback.textContent = 'Excluindo conta...';

        try {
            const response = await fetch('/api/me', {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ currentPassword })
            });

            const data = await parseJson(response);
            if (!response.ok) {
                const message = Array.isArray(data.error) ? data.error[0]?.msg : data.error;
                throw new Error(message || 'Não foi possível excluir a conta.');
            }

            if (window.MaxOnuSession?.clearAuth) {
                window.MaxOnuSession.clearAuth();
            } else {
                localStorage.removeItem('token');
                localStorage.removeItem('isAdmin');
                localStorage.removeItem('role');
            }

            window.location.href = '/login';
        } catch (error) {
            feedback.textContent = error.message || 'Erro ao excluir a conta.';
        } finally {
            button.disabled = false;
        }
    });
}

function destroyProfileImageEditorState() {
    if (profileImageEditorState?.objectUrl) {
        URL.revokeObjectURL(profileImageEditorState.objectUrl);
    }
    profileImageEditorState = null;
}

function clampProfileImageEditorPosition(state) {
    const visibleWidth = state.naturalWidth * state.scale;
    const visibleHeight = state.naturalHeight * state.scale;
    const minX = Math.min(0, PROFILE_IMAGE_EDITOR_SIZE - visibleWidth);
    const minY = Math.min(0, PROFILE_IMAGE_EDITOR_SIZE - visibleHeight);
    state.x = Math.min(0, Math.max(minX, state.x));
    state.y = Math.min(0, Math.max(minY, state.y));
}

function getProfileImageEditorSourceRect(state) {
    const sourceSize = PROFILE_IMAGE_EDITOR_SIZE / state.scale;
    const sourceX = (-state.x) / state.scale;
    const sourceY = (-state.y) / state.scale;
    return { sourceSize, sourceX, sourceY };
}

function renderProfileImageLivePreview(state) {
    if (!state?.livePreviewImage || !state?.image) {
        return;
    }

    if (!state.previewCanvas) {
        state.previewCanvas = document.createElement('canvas');
    }

    state.previewCanvas.width = PROFILE_IMAGE_LIVE_PREVIEW_SIZE;
    state.previewCanvas.height = PROFILE_IMAGE_LIVE_PREVIEW_SIZE;

    const context = state.previewCanvas.getContext('2d');
    if (!context) {
        return;
    }

    const { sourceSize, sourceX, sourceY } = getProfileImageEditorSourceRect(state);
    context.clearRect(0, 0, PROFILE_IMAGE_LIVE_PREVIEW_SIZE, PROFILE_IMAGE_LIVE_PREVIEW_SIZE);
    context.drawImage(
        state.image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        PROFILE_IMAGE_LIVE_PREVIEW_SIZE,
        PROFILE_IMAGE_LIVE_PREVIEW_SIZE
    );
    state.livePreviewImage.src = state.previewCanvas.toDataURL('image/png');
}

function applyProfileImageEditorTransform(state) {
    if (!state?.previewImage) {
        return;
    }

    state.previewImage.style.width = `${state.naturalWidth * state.scale}px`;
    state.previewImage.style.height = `${state.naturalHeight * state.scale}px`;
    state.previewImage.style.left = `${state.x}px`;
    state.previewImage.style.top = `${state.y}px`;
    renderProfileImageLivePreview(state);
}

function syncProfileImageZoomRange(state) {
    if (!state?.zoomRange) {
        return;
    }

    const min = Number(state.minScale.toFixed(6));
    const max = Number(state.maxScale.toFixed(6));
    const nextScale = Number.isFinite(state.scale) ? state.scale : min;
    const safeScale = Math.min(max, Math.max(min, nextScale));

    state.minScale = min;
    state.maxScale = max;
    state.scale = safeScale;

    state.zoomRange.min = String(min);
    state.zoomRange.max = String(max);
    state.zoomRange.step = 'any';
    state.zoomRange.value = String(safeScale);
}

function setProfileImageEditorScale(state, nextScale, anchorX = PROFILE_IMAGE_EDITOR_SIZE / 2, anchorY = PROFILE_IMAGE_EDITOR_SIZE / 2) {
    const previousScale = state.scale;
    const normalizedX = (anchorX - state.x) / previousScale;
    const normalizedY = (anchorY - state.y) / previousScale;

    state.scale = Math.max(state.minScale, Math.min(state.maxScale, nextScale));
    state.x = anchorX - (normalizedX * state.scale);
    state.y = anchorY - (normalizedY * state.scale);
    clampProfileImageEditorPosition(state);
    applyProfileImageEditorTransform(state);
    syncProfileImageZoomRange(state);
}

async function initializeProfileImageEditor(file, elements) {
    const { editorPanel, previewImage, zoomRange, livePreviewImage } = elements;
    destroyProfileImageEditorState();

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = reject;
        image.src = objectUrl;
    });

    const minScale = Math.max(PROFILE_IMAGE_EDITOR_SIZE / image.naturalWidth, PROFILE_IMAGE_EDITOR_SIZE / image.naturalHeight);
    const maxScale = Math.max(minScale * 4, minScale + 0.4);
    const initialWidth = image.naturalWidth * minScale;
    const initialHeight = image.naturalHeight * minScale;

    profileImageEditorState = {
        objectUrl,
        image,
        previewImage,
        zoomRange,
        livePreviewImage,
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        minScale,
        maxScale,
        scale: minScale,
        x: (PROFILE_IMAGE_EDITOR_SIZE - initialWidth) / 2,
        y: (PROFILE_IMAGE_EDITOR_SIZE - initialHeight) / 2
    };

    previewImage.src = objectUrl;
    previewImage.draggable = false;
    clampProfileImageEditorPosition(profileImageEditorState);
    applyProfileImageEditorTransform(profileImageEditorState);
    syncProfileImageZoomRange(profileImageEditorState);
    editorPanel.hidden = false;
}

async function buildProfileImageBlobFromEditor() {
    if (!profileImageEditorState?.image) {
        return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = PROFILE_IMAGE_OUTPUT_SIZE;
    canvas.height = PROFILE_IMAGE_OUTPUT_SIZE;

    const context = canvas.getContext('2d');
    const { sourceSize, sourceX, sourceY } = getProfileImageEditorSourceRect(profileImageEditorState);

    context.drawImage(
        profileImageEditorState.image,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        PROFILE_IMAGE_OUTPUT_SIZE,
        PROFILE_IMAGE_OUTPUT_SIZE
    );

    return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png');
    });
}

function bindProfileImageForm() {
    const form = document.getElementById('profileImageForm');
    if (!form) {
        return;
    }

    const feedback = document.getElementById('profileImageFeedback');
    const input = document.getElementById('profileImageInput');
    const photoTrigger = document.getElementById('profilePhotoTrigger');
    const imageCardOverlay = document.getElementById('profileImageCardOverlay');
    const closeCardButton = document.getElementById('closeProfileImageCardButton');
    const fileNameLabel = document.getElementById('profileImageFileName');
    const editorPanel = document.getElementById('profileImageEditor');
    const editorFrame = document.getElementById('profileImageEditorFrame');
    const previewImage = document.getElementById('profileImageEditorPreview');
    const zoomRange = document.getElementById('profileImageZoomRange');
    const selectButton = document.getElementById('profilePhotoSelectButton');

    const openFilePicker = () => {
        input?.click();
    };

    const closeImageCard = () => {
        if (imageCardOverlay) {
            imageCardOverlay.classList.remove('is-open');
            imageCardOverlay.hidden = true;
        }
        profileImageCardLastClosedAt = Date.now();
        document.body.classList.remove('profile-image-card-open');
    };

    const openImageCard = () => {
        if (!imageCardOverlay) {
            return;
        }
        if (!imageCardOverlay.hidden || imageCardOverlay.classList.contains('is-open')) {
            return;
        }
        if (Date.now() - profileImageCardLastClosedAt < 250) {
            return;
        }
        imageCardOverlay.hidden = false;
        imageCardOverlay.classList.add('is-open');
        document.body.classList.add('profile-image-card-open');
    };

    photoTrigger?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openImageCard();
    });
    selectButton?.addEventListener('click', openFilePicker);
    closeCardButton?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeImageCard();
    });

    // Fallback via delegacao de clique para manter o fechamento funcional
    // mesmo quando o card e re-renderizado.
    if (!profileImageCardDelegatedCloseBound) {
        document.addEventListener('click', (event) => {
            const closeButton = event.target.closest('#closeProfileImageCardButton');
            if (!closeButton) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();
            const overlay = document.getElementById('profileImageCardOverlay');
            if (overlay) {
                overlay.classList.remove('is-open');
                overlay.hidden = true;
            }
            profileImageCardLastClosedAt = Date.now();
            document.body.classList.remove('profile-image-card-open');
        });
        profileImageCardDelegatedCloseBound = true;
    }

    imageCardOverlay?.addEventListener('click', (event) => {
        if (event.target === imageCardOverlay) {
            event.preventDefault();
            event.stopPropagation();
            closeImageCard();
        }
    });

    if (!profileImageCardEscapeBound) {
        document.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape') {
                return;
            }

            const overlay = document.getElementById('profileImageCardOverlay');
            if (!overlay || overlay.hidden) {
                return;
            }

            event.preventDefault();
            overlay.classList.remove('is-open');
            overlay.hidden = true;
            profileImageCardLastClosedAt = Date.now();
            document.body.classList.remove('profile-image-card-open');
        });
        profileImageCardEscapeBound = true;
    }

    // Garante estado inicial fechado apos qualquer re-render.
    if (imageCardOverlay) {
        imageCardOverlay.classList.remove('is-open');
        imageCardOverlay.hidden = true;
    }

    const hideEditor = () => {
        if (editorPanel) {
            editorPanel.hidden = true;
        }
        if (previewImage) {
            previewImage.removeAttribute('src');
        }
        if (zoomRange) {
            zoomRange.value = '1';
        }
        destroyProfileImageEditorState();
    };

    let isDragging = false;
    let lastPointerX = 0;
    let lastPointerY = 0;

    editorFrame?.addEventListener('pointerdown', (event) => {
        if (!profileImageEditorState) {
            return;
        }

        isDragging = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        editorFrame.setPointerCapture(event.pointerId);
        editorFrame.classList.add('is-dragging');
    });

    editorFrame?.addEventListener('pointermove', (event) => {
        if (!isDragging || !profileImageEditorState) {
            return;
        }

        const deltaX = event.clientX - lastPointerX;
        const deltaY = event.clientY - lastPointerY;
        profileImageEditorState.x += deltaX;
        profileImageEditorState.y += deltaY;
        clampProfileImageEditorPosition(profileImageEditorState);
        applyProfileImageEditorTransform(profileImageEditorState);
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
    });

    const finishDragging = () => {
        isDragging = false;
        editorFrame?.classList.remove('is-dragging');
    };

    editorFrame?.addEventListener('pointerup', finishDragging);
    editorFrame?.addEventListener('pointercancel', finishDragging);

    editorFrame?.addEventListener('wheel', (event) => {
        if (!profileImageEditorState) {
            return;
        }

        event.preventDefault();
        const delta = event.deltaY > 0 ? -0.08 : 0.08;
        const rect = editorFrame.getBoundingClientRect();
        const anchorX = event.clientX - rect.left;
        const anchorY = event.clientY - rect.top;
        setProfileImageEditorScale(profileImageEditorState, profileImageEditorState.scale + delta, anchorX, anchorY);
    }, { passive: false });

    zoomRange?.addEventListener('input', (event) => {
        if (!profileImageEditorState) {
            return;
        }

        const nextScale = Number(event.target.value);
        setProfileImageEditorScale(profileImageEditorState, nextScale);
    });

    input?.addEventListener('change', async () => {
        const selectedFile = input.files?.[0];
        if (fileNameLabel) {
            fileNameLabel.textContent = selectedFile ? selectedFile.name : 'Nenhum arquivo selecionado';
        }

        if (!selectedFile) {
            hideEditor();
            return;
        }

        try {
            await initializeProfileImageEditor(selectedFile, {
                editorPanel,
                previewImage,
                zoomRange
            });
            if (feedback) {
                feedback.textContent = 'Ajuste a foto na moldura, depois clique em Salvar.';
            }
        } catch (error) {
            hideEditor();
            if (feedback) {
                feedback.textContent = 'Não foi possível abrir o editor da imagem selecionada.';
            }
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const file = input?.files?.[0];
        if (!file) {
            if (feedback) {
                feedback.textContent = 'Selecione uma imagem antes de salvar.';
            }
            return;
        }

        const submitButton = form.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        if (feedback) {
            feedback.textContent = 'Enviando foto...';
        }

        try {
            const adjustedBlob = await buildProfileImageBlobFromEditor();
            const formData = new FormData();
            if (adjustedBlob) {
                formData.append('avatar', adjustedBlob, `${Date.now()}-avatar.png`);
            } else {
                formData.append('avatar', file);
            }

            const response = await fetch('/api/me/avatar', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                },
                body: formData
            });

            const data = await parseJson(response);
            if (!response.ok) {
                throw new Error(getErrorMessage(data, 'Não foi possível atualizar a foto de perfil.'));
            }

            if (window.MaxOnuSession?.refreshAuthContext) {
                await window.MaxOnuSession.refreshAuthContext();
            }
            document.dispatchEvent(new CustomEvent('auth-context-updated'));
            if (feedback) {
                feedback.textContent = data?.message || 'Foto de perfil atualizada com sucesso.';
            }
            if (fileNameLabel) {
                fileNameLabel.textContent = 'Nenhum arquivo selecionado';
            }
            hideEditor();
            if (input) {
                input.value = '';
            }
            closeImageCard();
            await loadProfile();
        } catch (error) {
            if (feedback) {
                feedback.textContent = error.message || 'Erro ao atualizar foto de perfil.';
            }
        } finally {
            submitButton.disabled = false;
        }
    });
}

function renderCandidatePanels(user, delegationStatus) {
    const registrationPanel = document.getElementById('registrationPanel');
    const delegationPanel = document.getElementById('delegationPanel');
    const registration = delegationStatus?.registration;
    const delegation = delegationStatus?.delegation;
    const teammates = delegation?.members || [];
    const pendingNotifications = delegationStatus?.notifications?.filter((item) => item.status === 'pending') || [];
    const registrationOpen = Boolean(delegationStatus?.registrationOpen);
    const revealPassed = Boolean(delegationStatus?.revealPassed);
    const registrationSubmitted = Boolean(registration?.submittedAt);
    const canManageDelegation = registrationOpen && registrationSubmitted;
    const hasDelegation = (delegation?.currentSize || 1) > 1;
    const waitingOfficialMessage = 'Ainda não disponível, esperando a abertura oficial da MaxOnu.';
    const confirmedMembers = [
        {
            fullName: user.fullName || user.username,
            username: user.username,
            classGroup: user.classGroup || '',
            isSelf: true
        },
        ...teammates.filter((member) => String(member.username || '').toLowerCase() !== String(user.username || '').toLowerCase())
    ];
    const inviteState = window.profileInviteState || null;
    const registrationBlockedMessage = revealPassed
        ? 'As inscrições estão temporariamente fechadas pela coordenação.'
        : 'O formulário será liberado automaticamente quando a contagem regressiva terminar.';
    const delegationBlockedMessage = revealPassed
        ? 'A formação da delegação está temporariamente indisponível.'
        : 'A organização da delegação será liberada quando a contagem regressiva terminar e sua inscrição for enviada.';

    registrationPanel.innerHTML = `
        <article class="dashboard-panel candidate-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Inscrição</span>
                <h2>${!revealPassed ? 'Ainda não disponível' : (registrationSubmitted ? 'Inscrição enviada' : 'Status da inscrição')}</h2>
                <p>${!revealPassed
                    ? waitingOfficialMessage
                    : (registrationSubmitted
                        ? 'Sua inscrição já está registrada e pronta para acompanhamento.'
                        : registrationOpen
                            ? 'O formulário está liberado para preenchimento.'
                            : registrationBlockedMessage)}</p>
            </div>
            <div class="registration-overview">
                ${createInfoCard('Turma', user.classGroup, { emptyText: 'Não informada' })}
                ${createInfoCard('País', user.country, { emptyText: 'Ainda não designado' })}
                ${createInfoCard('Formato da delegação', '2 integrantes')}
                ${createInfoCard('Status', !revealPassed ? 'Ainda não disponível' : (registrationSubmitted ? 'Inscrição enviada' : registrationOpen ? 'Formulário aberto' : 'Aguardando liberação'), { accent: 'blue-accent' })}
            </div>
            <div class="content-box registration-choice-box">
                <h3>Preferências de comitê</h3>
                <div class="committee-choice-list">
                    ${formatCommitteeChoices(registration, revealPassed)}
                </div>
            </div>
            <div class="dashboard-question-actions">
                <a href="/inscricao" class="view-button" ${!registrationOpen ? 'aria-disabled="true"' : ''}>${registrationSubmitted ? 'Editar inscrição' : 'Fazer inscrição'}</a>
            </div>
        </article>
    `;

    delegationPanel.innerHTML = `
        <article class="dashboard-panel candidate-panel">
            <div class="dashboard-section-heading">
                <span class="dashboard-section-kicker">Delegação</span>
                <h2>${!revealPassed ? 'Ainda não disponível' : 'Monte sua equipe'}</h2>
                <p>${!revealPassed
                    ? waitingOfficialMessage
                    : (canManageDelegation
                        ? 'Convide colegas pelo usuário cadastrado. Quando o convite for enviado, a outra pessoa poderá aceitar ou recusar rapidamente pelas notificações do topo do site.'
                        : delegationBlockedMessage)}</p>
            </div>
            <div class="registration-overview">
                ${createInfoCard('Tamanho definido', '2 integrantes')}
                ${createInfoCard('Integrantes atuais', `${delegation?.currentSize || 1} de ${registration?.teamSize || 2}`)}
                ${createInfoCard('Convites pendentes', String(pendingNotifications.length), { accent: 'blue-accent' })}
            </div>
            ${inviteState ? createStatusCard(inviteState.message, inviteState.tone) : ''}
            <div class="content-box registration-choice-box">
                <h3>Integrantes confirmados</h3>
                ${confirmedMembers.length ? `
                    <div class="teammate-list">
                        ${confirmedMembers.map((member) => `
                            <div class="teammate-card">
                                <strong>${member.fullName || member.username}</strong>
                                <span class="registration-muted">@${member.username}${member.isSelf ? ' • Você' : ''} • ${member.classGroup || 'Turma não informada'}</span>
                            </div>
                        `).join('')}
                    </div>
                ` : '<div class="dashboard-empty">Nenhum integrante confirmado ainda.</div>'}
            </div>
            <form id="inviteForm" class="dashboard-form invite-form-shell" ${canManageDelegation ? '' : 'hidden'}>
                <div class="form-group">
                    <label for="inviteUsername">Usuário do colega</label>
                    <input type="text" id="inviteUsername" placeholder="Digite o usuário do participante" required>
                </div>
                <button type="submit" class="view-button" ${(delegation?.remainingSlots || 0) === 0 ? 'disabled' : ''}>Enviar convite</button>
            </form>
            ${hasDelegation ? `
                <div class="dashboard-question-actions">
                    <button type="button" id="leaveDelegationButton" class="delete-button">Sair da delegação</button>
                </div>
            ` : ''}
            <p class="register-note registration-feedback" id="inviteFeedback">${!canManageDelegation
                ? (!revealPassed ? waitingOfficialMessage : 'Envie sua inscrição primeiro para liberar os convites.')
                : (delegation?.remainingSlots || 0) === 0
                    ? 'Sua delegação já está completa.'
                    : 'Depois de enviar, o convite fica visível nas notificações do topo para o outro participante responder.'}</p>
        </article>
    `;
}

function renderRolePanels(user, delegationStatus, twoFactorStatus) {
    const registrationPanel = document.getElementById('registrationPanel');
    const delegationPanel = document.getElementById('delegationPanel');

    if (user.role === 'candidate' && delegationStatus) {
        renderCandidatePanels(user, delegationStatus);
        return;
    }

    registrationPanel.innerHTML = renderAccountHighlights(user, twoFactorStatus);

    delegationPanel.innerHTML = renderQuickActions(user, delegationStatus, twoFactorStatus);
}

async function loadProfile() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login';
        return;
    }

    destroyProfileImageEditorState();

    try {
        const [userContext, meResponse, delegationResponse, twoFactorResponse] = await Promise.all([
            window.MaxOnuSession?.getAuthContext?.(),
            fetch('/api/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('/api/delegation/status', {
                headers: { 'Authorization': `Bearer ${token}` }
            }),
            fetch('/api/2fa-status', {
                headers: { 'Authorization': `Bearer ${token}` }
            })
        ]);

        const cachedUser = userContext?.user || userContext;
        const freshUser = meResponse.ok ? await parseJson(meResponse) : null;
        let user = freshUser || cachedUser;

        if (!user) {
            window.location.href = '/login';
            return;
        }

        const delegationStatus = delegationResponse.ok ? await parseJson(delegationResponse) : null;
        const twoFactorStatus = twoFactorResponse.ok ? await parseJson(twoFactorResponse) : { twoFactorEnabled: false };

        const heroBadge = document.querySelector('.dashboard-hero-badge');
        const heroKicker = document.querySelector('.dashboard-kicker');
        if (heroBadge) {
            heroBadge.textContent = getRoleLabelForUser(user);
            heroBadge.setAttribute('data-role', user.role || 'candidate');
        }
        if (heroKicker) {
            heroKicker.textContent = getRoleAreaLabel(user);
        }
        const heroLead = document.querySelector('.dashboard-hero-copy p');
        if (heroLead) {
            heroLead.textContent = getRoleLead(user);
        }

        document.getElementById('profileInfo').innerHTML = renderProfileSummary(user, twoFactorStatus);
        document.getElementById('securityPanel').innerHTML = renderSecurityPanel(twoFactorStatus);

        renderRolePanels(user, delegationStatus, twoFactorStatus);
        bindEditableProfileFields();
        bindProfileImageFallback();
        bindProfileImageForm();
        bindPasswordForm();
        bindDeleteAccountForm();
    } catch (error) {
        console.error(error);
        document.getElementById('profileInfo').innerText = 'Erro ao carregar perfil.';
        document.getElementById('registrationPanel').innerText = 'Erro ao carregar sua área principal.';
        document.getElementById('delegationPanel').innerText = 'Erro ao carregar suas ações disponíveis.';
        document.getElementById('securityPanel').innerText = 'Erro ao carregar a área de segurança.';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadProfile();

    document.addEventListener('submit', async (event) => {
        if (event.target.id !== 'inviteForm') {
            return;
        }

        event.preventDefault();
        const button = event.target.querySelector('button');
        const username = document.getElementById('inviteUsername').value.trim().toLowerCase();
        const feedback = document.getElementById('inviteFeedback');

        if (!username) {
            feedback.textContent = 'Digite o usuário do participante que deseja convidar.';
            return;
        }

        button.disabled = true;
        feedback.textContent = 'Enviando convite...';

        try {
            const response = await fetch('/api/delegation/invite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify({ username })
            });

            const data = await parseJson(response);
            if (!response.ok) {
                throw new Error(getErrorMessage(data, 'Não foi possível enviar o convite.'));
            }

            window.profileInviteState = {
                tone: 'success',
                message: data.message || 'O convite foi enviado com sucesso e agora já pode ser respondido pela outra pessoa.'
            };
            feedback.textContent = 'Convite enviado. O outro participante verá isso nas notificações do topo.';
            event.target.reset();
            document.dispatchEvent(new CustomEvent('delegation-updated'));
            await loadProfile();
        } catch (error) {
            window.profileInviteState = {
                tone: 'error',
                message: error.message || 'Erro ao enviar convite.'
            };
            feedback.textContent = error.message || 'Erro ao enviar convite.';
            await loadProfile();
        } finally {
            button.disabled = false;
        }
    });

    document.addEventListener('click', async (event) => {
        const leaveButton = event.target.closest('#leaveDelegationButton');
        if (!leaveButton) {
            return;
        }

        const confirmed = window.confirm('Tem certeza que deseja sair da delegação?');
        if (!confirmed) {
            return;
        }

        const feedback = document.getElementById('inviteFeedback');
        leaveButton.disabled = true;
        if (feedback) {
            feedback.textContent = 'Saindo da delegação...';
        }

        try {
            const response = await fetch('/api/delegation/leave', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${getToken()}`
                }
            });

            const data = await parseJson(response);
            if (!response.ok) {
                throw new Error(getErrorMessage(data, 'Não foi possível sair da delegação.'));
            }

            window.profileInviteState = {
                tone: 'success',
                message: data.message || 'Você saiu da delegação com sucesso.'
            };
            document.dispatchEvent(new CustomEvent('delegation-updated'));
            await loadProfile();
        } catch (error) {
            window.profileInviteState = {
                tone: 'error',
                message: error.message || 'Erro ao sair da delegação.'
            };
            if (feedback) {
                feedback.textContent = error.message || 'Erro ao sair da delegação.';
            }
            await loadProfile();
        } finally {
            leaveButton.disabled = false;
        }
    });

    document.addEventListener('delegation-updated', loadProfile);
});
