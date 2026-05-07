(function () {
    'use strict';

    const ROLE_LABELS = { admin: 'Admin', coordinator: 'Coord.', teacher: 'Prof.', press: 'Imprensa' };
    const MOD_ROLES = new Set(['admin', 'coordinator', 'teacher']);

    function getToken() {
        return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    }

    function getCurrentUser() {
        try {
            const token = getToken();
            if (!token) return null;
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload;
        } catch { return null; }
    }

    function authHeaders() {
        return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
    }

    function timeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'agora';
        if (m < 60) return `${m}min`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}h`;
        const d = Math.floor(h / 24);
        return `${d}d`;
    }

    function avatarSrc(url, role) {
        if (url) return url;
        return role === 'feminino' ? '/images/profile_female.png' : '/images/profile_male.png';
    }

    function buildCommentCard(comment, user, depth = 0) {
        const isMod = user && MOD_ROLES.has(user.role);
        const isAuthor = user && String(user.id) === String(comment.authorId);
        const roleLabel = ROLE_LABELS[comment.authorRole] || '';

        const card = document.createElement('div');
        card.className = 'comment-item';
        card.dataset.id = comment._id;

        card.innerHTML = `
            <div class="comment-card">
                <img class="comment-avatar" src="${avatarSrc(comment.authorProfileImageUrl)}" alt="${comment.authorName}" loading="lazy">
                <div class="comment-body">
                    <div class="comment-header">
                        <span class="comment-author">${comment.authorName}</span>
                        ${roleLabel ? `<span class="comment-role-badge" data-role="${comment.authorRole}">${roleLabel}</span>` : ''}
                        <span class="comment-time">${timeAgo(comment.createdAt)}</span>
                    </div>
                    <p class="comment-content">${comment.content.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</p>
                    <div class="comment-actions">
                        ${user && depth < 2 ? `<button class="comment-action-btn reply-btn" data-id="${comment._id}">↩ Responder</button>` : ''}
                        ${(isAuthor || isMod) ? `<button class="comment-action-btn is-danger delete-btn" data-id="${comment._id}">Remover</button>` : ''}
                        ${user && !isAuthor ? `<button class="comment-action-btn report-btn" data-id="${comment._id}">Denunciar</button>` : ''}
                    </div>
                </div>
            </div>
        `;

        // Replies
        if (comment.replies?.length) {
            const repliesEl = document.createElement('div');
            repliesEl.className = 'comment-replies';
            for (const reply of comment.replies) {
                repliesEl.appendChild(buildCommentCard(reply, user, depth + 1));
            }
            card.appendChild(repliesEl);
        }

        return card;
    }

    function buildReplyForm(parentId, onSubmit, onCancel) {
        const wrap = document.createElement('div');
        wrap.className = 'comment-reply-form-wrap';
        wrap.innerHTML = `
            <form class="comment-form">
                <textarea class="comment-textarea" placeholder="Escreva sua resposta..." rows="3" maxlength="1000"></textarea>
                <div class="comment-form-actions">
                    <button type="button" class="comment-cancel-btn">Cancelar</button>
                    <button type="submit" class="view-button comment-submit-btn">Responder</button>
                </div>
            </form>
        `;
        wrap.querySelector('form').addEventListener('submit', (e) => {
            e.preventDefault();
            const content = wrap.querySelector('textarea').value.trim();
            if (content) onSubmit(content, parentId);
        });
        wrap.querySelector('.comment-cancel-btn').addEventListener('click', onCancel);
        return wrap;
    }

    async function loadComments(postId, container, user) {
        container.innerHTML = '<p class="comments-empty">Carregando comentários...</p>';
        try {
            const res = await fetch(`/api/comments/${postId}`);
            const data = await res.json();

            const titleEl = container.closest('.comments-section')?.querySelector('.comments-count-badge');
            if (titleEl) titleEl.textContent = data.total || 0;

            if (!data.comments?.length) {
                container.innerHTML = '<p class="comments-empty">Seja o primeiro a comentar!</p>';
                return;
            }

            container.innerHTML = '';
            const list = document.createElement('div');
            list.className = 'comments-list';

            for (const comment of data.comments) {
                const card = buildCommentCard(comment, user);
                list.appendChild(card);
            }

            container.appendChild(list);
            attachCommentActions(postId, container, user);
        } catch {
            container.innerHTML = '<p class="comments-empty">Erro ao carregar comentários.</p>';
        }
    }

    function attachCommentActions(postId, container, user) {
        // Reply buttons
        container.querySelectorAll('.reply-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const parentId = btn.dataset.id;
                const existing = container.querySelector(`.comment-reply-form-wrap[data-parent="${parentId}"]`);
                if (existing) { existing.remove(); return; }

                // Remove other open reply forms
                container.querySelectorAll('.comment-reply-form-wrap').forEach(el => el.remove());

                const commentItem = container.querySelector(`.comment-item[data-id="${parentId}"]`);
                if (!commentItem) return;

                const form = buildReplyForm(
                    parentId,
                    async (content, pid) => {
                        await submitComment(postId, content, pid, container, user);
                    },
                    () => form.remove()
                );
                form.dataset.parent = parentId;
                commentItem.appendChild(form);
                form.querySelector('textarea').focus();
            });
        });

        // Delete buttons
        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Remover este comentário?')) return;
                try {
                    const res = await fetch(`/api/comments/${btn.dataset.id}`, {
                        method: 'DELETE',
                        headers: authHeaders()
                    });
                    if (res.ok) loadComments(postId, container, user);
                } catch {}
            });
        });

        // Report buttons
        container.querySelectorAll('.report-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Denunciar este comentário?')) return;
                try {
                    const res = await fetch(`/api/comments/${btn.dataset.id}/report`, {
                        method: 'POST',
                        headers: authHeaders()
                    });
                    const data = await res.json();
                    alert(data.message || data.error);
                } catch {}
            });
        });
    }

    async function submitComment(postId, content, parentId, container, user) {
        try {
            const res = await fetch(`/api/comments/${postId}`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ content, parentId: parentId || undefined })
            });
            if (res.ok) {
                loadComments(postId, container, user);
            } else {
                const data = await res.json();
                alert(data.error || 'Erro ao comentar.');
            }
        } catch {
            alert('Erro de conexão.');
        }
    }

    // Public API
    window.CommentsSystem = {
        init(postId, mountEl) {
            if (!postId || !mountEl) return;

            const user = getCurrentUser();

            // Build section
            mountEl.innerHTML = `
                <div class="comments-section">
                    <h3 class="comments-section-title">
                        Comentários <span class="comments-count-badge">0</span>
                    </h3>
                    <div class="comment-form-wrap">
                        ${user
                            ? `<form class="comment-form" id="mainCommentForm-${postId}">
                                <textarea class="comment-textarea" placeholder="Escreva um comentário..." rows="3" maxlength="1000"></textarea>
                                <div class="comment-form-actions">
                                    <button type="submit" class="view-button comment-submit-btn">Comentar</button>
                                </div>
                               </form>`
                            : `<p class="comment-login-prompt">
                                <a href="/login">Entre</a> ou <a href="/login">cadastre-se</a> para comentar.
                               </p>`
                        }
                    </div>
                    <div class="comments-list-container"></div>
                </div>
            `;

            const listContainer = mountEl.querySelector('.comments-list-container');
            loadComments(postId, listContainer, user);

            // Main form submit
            const mainForm = mountEl.querySelector(`#mainCommentForm-${postId}`);
            mainForm?.addEventListener('submit', async (e) => {
                e.preventDefault();
                const textarea = mainForm.querySelector('textarea');
                const content = textarea.value.trim();
                if (!content) return;
                const btn = mainForm.querySelector('button[type="submit"]');
                btn.disabled = true;
                await submitComment(postId, content, null, listContainer, user);
                textarea.value = '';
                btn.disabled = false;
            });
        }
    };
})();
