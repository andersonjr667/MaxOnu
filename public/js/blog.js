const BLOG_MANAGER_ROLES = new Set(['admin', 'teacher', 'coordinator', 'press']);

const state = {
    user: null,
    posts: [],
    activeMenuPostId: null,
    editorPostId: null,
    pendingConfirm: null
};

const dom = {
    postsContainer: null,
    adminActions: null,
    createPostButton: null,
    imageViewer: null,
    imageViewerImg: null,
    editorModal: null,
    editorForm: null,
    editorTitle: null,
    editorExcerpt: null,
    editorContent: null,
    confirmModal: null,
    confirmTitle: null,
    confirmMessage: null,
    confirmActionButton: null,
    toastRoot: null
};

function parseJson(response) {
    return response.json().catch(() => ({}));
}

function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token') || '';
}

function canManagePosts(user = state.user) {
    return Boolean(user && BLOG_MANAGER_ROLES.has(user.role));
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) {
        return 'Data indisponível';
    }

    return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
}

function getRoleLabel(role) {
    const labels = {
        admin: 'Administração',
        teacher: 'Orientação',
        coordinator: 'Coordenação',
        press: 'Imprensa'
    };

    return labels[role] || 'Equipe MaxOnu';
}

function linkifyText(value) {
    const escaped = escapeHtml(value);
    const urlRegex = /(https?:\/\/[^\s<]+)/gi;
    return escaped.replace(urlRegex, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
}

function formatText(value) {
    return linkifyText(value).replace(/\n/g, '<br>');
}

function getPostById(postId) {
    return state.posts.find((post) => String(post._id) === String(postId));
}

function getPostPermalink(postId) {
    return `${window.location.origin}/blog#post-${postId}`;
}

function copyToClipboard(text) {
    if (!text) {
        return Promise.resolve();
    }

    if (navigator.clipboard?.writeText) {
        return navigator.clipboard.writeText(text);
    }

    const fallbackInput = document.createElement('textarea');
    fallbackInput.value = text;
    fallbackInput.setAttribute('readonly', 'readonly');
    fallbackInput.style.position = 'fixed';
    fallbackInput.style.left = '-9999px';
    document.body.appendChild(fallbackInput);
    fallbackInput.select();
    document.execCommand('copy');
    document.body.removeChild(fallbackInput);
    return Promise.resolve();
}

function showToast(message, type = 'info') {
    if (!dom.toastRoot) {
        return;
    }

    const toast = document.createElement('div');
    toast.className = `blog-toast blog-toast-${type}`;
    toast.textContent = message;
    dom.toastRoot.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add('is-visible');
    });

    setTimeout(() => {
        toast.classList.remove('is-visible');
        setTimeout(() => {
            toast.remove();
        }, 220);
    }, 2600);
}

function buildPostActions(post) {
    if (!canManagePosts()) {
        return '';
    }

    return `
        <div class="blog-post-actions">
            <button type="button" class="blog-post-actions-trigger" data-post-action="toggle-menu" aria-label="Abrir menu do post" aria-expanded="false">&#8942;</button>
            <div class="blog-post-actions-menu" data-post-menu hidden>
                ${post.imageUrl ? '<button type="button" class="blog-post-actions-item" data-post-action="open-image">Abrir imagem</button>' : ''}
                <button type="button" class="blog-post-actions-item" data-post-action="copy-link">Copiar link do post</button>
                <button type="button" class="blog-post-actions-item" data-post-action="copy-content">Copiar texto do post</button>
                <button type="button" class="blog-post-actions-item" data-post-action="edit">Editar post</button>
                <button type="button" class="blog-post-actions-item is-danger" data-post-action="delete">Excluir post</button>
            </div>
        </div>
    `;
}

function renderPosts() {
    if (!dom.postsContainer) {
        return;
    }

    if (!state.posts.length) {
        dom.postsContainer.innerHTML = '<p class="dashboard-empty">Ainda não há publicações disponíveis no blog. Novos comunicados serão apresentados aqui assim que forem oficialmente divulgados.</p>';
        return;
    }

    dom.postsContainer.innerHTML = state.posts.map((post) => `
        <article id="post-${escapeHtml(post._id || '')}" class="blog-post-card" data-post-id="${escapeHtml(post._id || '')}">
            ${buildPostActions(post)}
            <div class="blog-post-layout ${post.imageUrl ? 'has-image' : 'no-image'}">
                ${post.imageUrl ? `
                <div class="blog-post-media">
                    <img src="${post.imageUrl}" alt="Imagem do post" class="blog-post-image" data-post-action="open-image" role="button" tabindex="0">
                </div>
                ` : ''}
                <div class="blog-post-body">
                    <div class="blog-post-meta">
                        <span class="dashboard-chip">${getRoleLabel(post.authorRole)}</span>
                        <span>${formatDate(post.createdAt)}</span>
                    </div>
                    <h2>${escapeHtml(post.title || '')}</h2>
                    <p class="blog-post-excerpt">${formatText(post.excerpt || '')}</p>
                    <div class="blog-post-content">${formatText(post.content || '')}</div>
                    <p class="blog-post-author">Publicado por ${escapeHtml(post.authorName || 'Equipe MaxOnu')}</p>
                    <div class="post-reactions-slot" data-post-id="${escapeHtml(post._id || '')}"></div>
                </div>
            </div>
        </article>
    `).join('');

    if (state.activeMenuPostId) {
        openPostMenu(state.activeMenuPostId);
    }

    if (window.MaxOnuReactions) {
        document.querySelectorAll('.post-reactions-slot').forEach(slot => {
            if (slot.dataset.reactionsAttached) return;
            slot.dataset.reactionsAttached = '1';
            const id = slot.dataset.postId;
            if (id) window.MaxOnuReactions.attachReactions(slot, 'post', id);
        });
    }
}

function openPostMenu(postId) {
    closeAllPostMenus();
    const targetCard = dom.postsContainer?.querySelector(`[data-post-id="${postId}"]`);
    if (!targetCard) {
        state.activeMenuPostId = null;
        return;
    }

    const menu = targetCard.querySelector('[data-post-menu]');
    const trigger = targetCard.querySelector('.blog-post-actions-trigger');
    if (!menu || !trigger) {
        return;
    }

    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    targetCard.classList.add('is-menu-open');
    state.activeMenuPostId = postId;
}

function closeAllPostMenus() {
    if (!dom.postsContainer) {
        return;
    }

    dom.postsContainer.querySelectorAll('.blog-post-card.is-menu-open').forEach((card) => {
        card.classList.remove('is-menu-open');
    });

    dom.postsContainer.querySelectorAll('[data-post-menu]').forEach((menu) => {
        menu.hidden = true;
    });

    dom.postsContainer.querySelectorAll('.blog-post-actions-trigger').forEach((trigger) => {
        trigger.setAttribute('aria-expanded', 'false');
    });

    state.activeMenuPostId = null;
}

function syncOverlayBodyLock() {
    const hasOpenOverlay = Boolean(
        (dom.imageViewer && !dom.imageViewer.hidden) ||
        (dom.editorModal && !dom.editorModal.hidden) ||
        (dom.confirmModal && !dom.confirmModal.hidden)
    );

    document.body.classList.toggle('is-blog-modal-open', hasOpenOverlay);
}

function openImageViewer(imageUrl, altText = 'Imagem do post') {
    if (!dom.imageViewer || !dom.imageViewerImg || !imageUrl) {
        return;
    }

    dom.imageViewerImg.src = imageUrl;
    dom.imageViewerImg.alt = altText;
    dom.imageViewer.hidden = false;
    document.body.classList.add('is-image-viewer-open');
    syncOverlayBodyLock();
}

function closeImageViewer() {
    if (!dom.imageViewer || !dom.imageViewerImg) {
        return;
    }

    dom.imageViewer.hidden = true;
    dom.imageViewerImg.src = '';
    dom.imageViewerImg.alt = '';
    document.body.classList.remove('is-image-viewer-open');
    syncOverlayBodyLock();
}

function openEditor(post) {
    if (!dom.editorModal || !dom.editorForm || !post) {
        return;
    }

    state.editorPostId = String(post._id);
    dom.editorTitle.value = post.title || '';
    dom.editorExcerpt.value = post.excerpt || '';
    dom.editorContent.value = post.content || '';

    dom.editorModal.hidden = false;
    syncOverlayBodyLock();
    dom.editorTitle.focus();
}

function closeEditor() {
    if (!dom.editorModal || !dom.editorForm) {
        return;
    }

    dom.editorModal.hidden = true;
    state.editorPostId = null;
    syncOverlayBodyLock();
}

function openConfirmDialog({ title, message, confirmLabel = 'Confirmar', onConfirm }) {
    if (!dom.confirmModal || !dom.confirmTitle || !dom.confirmMessage || !dom.confirmActionButton) {
        return;
    }

    state.pendingConfirm = typeof onConfirm === 'function' ? onConfirm : null;
    dom.confirmTitle.textContent = title;
    dom.confirmMessage.textContent = message;
    dom.confirmActionButton.textContent = confirmLabel;
    dom.confirmModal.hidden = false;
    syncOverlayBodyLock();
}

function closeConfirmDialog() {
    if (!dom.confirmModal) {
        return;
    }

    dom.confirmModal.hidden = true;
    state.pendingConfirm = null;
    syncOverlayBodyLock();
}

async function fetchPosts() {
    const response = await fetch('/api/posts');
    const data = await parseJson(response);
    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível carregar as publicações.');
    }

    state.posts = Array.isArray(data) ? data : [];
}

async function fetchCurrentUser() {
    const token = getToken();
    if (!token) {
        state.user = null;
        return;
    }

    try {
        const context = await window.MaxOnuSession?.getAuthContext?.();
        state.user = context?.user || null;
    } catch (error) {
        state.user = null;
    }
}

async function updatePost(postId, payload) {
    const response = await fetch(`/api/posts/${postId}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(payload)
    });

    const data = await parseJson(response);
    if (!response.ok) {
        const message = Array.isArray(data.error) ? data.error[0]?.msg : data.error;
        throw new Error(message || 'Não foi possível editar o post.');
    }

    return data;
}

async function deletePost(postId) {
    const response = await fetch(`/api/posts/${postId}`, {
        method: 'DELETE',
        headers: {
            'Authorization': `Bearer ${getToken()}`
        }
    });

    const data = await parseJson(response);
    if (!response.ok) {
        throw new Error(data.error || 'Não foi possível excluir o post.');
    }
}

async function handleSaveEdit(event) {
    event.preventDefault();

    if (!state.editorPostId) {
        return;
    }

    const payload = {
        title: dom.editorTitle.value.trim(),
        excerpt: dom.editorExcerpt.value.trim(),
        content: dom.editorContent.value.trim()
    };

    if (!payload.title || payload.content.length < 10) {
        showToast('Título obrigatório e conteúdo com no mínimo 10 caracteres.', 'error');
        return;
    }

    try {
        const updated = await updatePost(state.editorPostId, payload);
        const targetIndex = state.posts.findIndex((post) => String(post._id) === String(state.editorPostId));
        if (targetIndex >= 0) {
            state.posts[targetIndex] = updated;
        } else {
            await fetchPosts();
        }
        closeEditor();
        renderPosts();
        showToast('Post atualizado com sucesso.', 'success');
    } catch (error) {
        showToast(error.message || 'Erro ao salvar o post.', 'error');
    }
}

async function handlePostAction(action, post) {
    if (!post) {
        return;
    }

    if (action === 'open-image') {
        closeAllPostMenus();
        openImageViewer(post.imageUrl, `Imagem do post: ${post.title || ''}`);
        return;
    }

    if (action === 'copy-link') {
        closeAllPostMenus();
        try {
            await copyToClipboard(getPostPermalink(post._id));
            showToast('Link do post copiado.', 'success');
        } catch (error) {
            showToast('Não foi possível copiar o link agora.', 'error');
        }
        return;
    }

    if (action === 'copy-content') {
        closeAllPostMenus();
        const payload = [post.title, post.excerpt, post.content].filter(Boolean).join('\n\n');
        try {
            await copyToClipboard(payload);
            showToast('Texto do post copiado.', 'success');
        } catch (error) {
            showToast('Não foi possível copiar o texto agora.', 'error');
        }
        return;
    }

    if (!canManagePosts()) {
        return;
    }

    if (action === 'edit') {
        closeAllPostMenus();
        openEditor(post);
        return;
    }

    if (action === 'delete') {
        closeAllPostMenus();
        openConfirmDialog({
            title: 'Excluir publicação',
            message: 'Tem certeza que deseja excluir este post? Essa ação não pode ser desfeita.',
            confirmLabel: 'Excluir',
            onConfirm: async () => {
                await deletePost(post._id);
                state.posts = state.posts.filter((item) => String(item._id) !== String(post._id));
                renderPosts();
                showToast('Post excluído com sucesso.', 'success');
            }
        });
    }
}

function bindGlobalEvents() {
    document.addEventListener('click', (event) => {
        if (!event.target.closest('.blog-post-actions')) {
            closeAllPostMenus();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') {
            return;
        }

        closeAllPostMenus();
        closeImageViewer();
        closeEditor();
        closeConfirmDialog();
    });
}

function bindPostEvents() {
    if (!dom.postsContainer) {
        return;
    }

    dom.postsContainer.addEventListener('keydown', (event) => {
        const image = event.target.closest('.blog-post-image');
        if (!image) {
            return;
        }

        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openImageViewer(image.getAttribute('src'), image.getAttribute('alt') || 'Imagem do post');
        }
    });

    dom.postsContainer.addEventListener('click', async (event) => {
        const actionButton = event.target.closest('[data-post-action]');
        if (!actionButton) {
            return;
        }

        const action = actionButton.dataset.postAction;
        const card = actionButton.closest('[data-post-id]');
        const postId = card?.dataset.postId;
        if (!postId) {
            return;
        }

        if (action === 'toggle-menu') {
            if (state.activeMenuPostId === postId) {
                closeAllPostMenus();
            } else {
                openPostMenu(postId);
            }
            return;
        }

        const post = getPostById(postId);
        await handlePostAction(action, post);
    });
}

function bindOverlayEvents() {
    if (dom.imageViewer) {
        dom.imageViewer.addEventListener('click', (event) => {
            if (event.target.closest('[data-image-viewer-action="close"]')) {
                closeImageViewer();
            }
        });
    }

    if (dom.editorForm) {
        dom.editorForm.addEventListener('submit', handleSaveEdit);
    }

    document.querySelectorAll('[data-editor-action="cancel"]').forEach((button) => {
        button.addEventListener('click', closeEditor);
    });

    if (dom.confirmModal) {
        dom.confirmModal.addEventListener('click', async (event) => {
            if (event.target.closest('[data-confirm-action="cancel"]')) {
                closeConfirmDialog();
                return;
            }

            if (!event.target.closest('[data-confirm-action="confirm"]')) {
                return;
            }

            const callback = state.pendingConfirm;
            closeConfirmDialog();

            if (!callback) {
                return;
            }

            try {
                await callback();
            } catch (error) {
                showToast(error.message || 'Ação não concluída.', 'error');
            }
        });
    }
}

function focusPostFromHash() {
    const hash = window.location.hash || '';
    if (!hash.startsWith('#post-')) {
        return;
    }

    const target = document.querySelector(hash);
    if (!target) {
        return;
    }

    target.classList.add('is-highlighted');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => {
        target.classList.remove('is-highlighted');
    }, 1800);
}

function cacheDom() {
    dom.postsContainer = document.querySelector('.blog-posts');
    dom.adminActions = document.getElementById('admin-actions');
    dom.createPostButton = document.getElementById('createPostBtn');
    dom.imageViewer = document.getElementById('blogImageViewer');
    dom.imageViewerImg = document.getElementById('blogImageViewerImage');
    dom.editorModal = document.getElementById('blogEditorModal');
    dom.editorForm = document.getElementById('blogEditorForm');
    dom.editorTitle = document.getElementById('blogEditorTitle');
    dom.editorExcerpt = document.getElementById('blogEditorExcerpt');
    dom.editorContent = document.getElementById('blogEditorContent');
    dom.confirmModal = document.getElementById('blogConfirmModal');
    dom.confirmTitle = document.getElementById('blogConfirmTitle');
    dom.confirmMessage = document.getElementById('blogConfirmMessage');
    dom.confirmActionButton = document.getElementById('blogConfirmAction');
    dom.toastRoot = document.getElementById('blogToastRoot');
}

async function initializePage() {
    cacheDom();
    bindGlobalEvents();
    bindPostEvents();
    bindOverlayEvents();

    if (dom.createPostButton) {
        dom.createPostButton.addEventListener('click', () => {
            window.location.href = '/create-post';
        });
    }

    await fetchCurrentUser();
    if (dom.adminActions) {
        dom.adminActions.hidden = !canManagePosts();
    }

    try {
        await fetchPosts();
        renderPosts();
        focusPostFromHash();
    } catch (error) {
        if (dom.postsContainer) {
            dom.postsContainer.innerHTML = '<p class="dashboard-empty">Não foi possível carregar o blog no momento. Tente novamente em instantes.</p>';
        }
        showToast(error.message || 'Falha ao carregar publicações.', 'error');
    }
}

document.addEventListener('DOMContentLoaded', initializePage);
