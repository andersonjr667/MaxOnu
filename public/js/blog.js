async function parseBlogJson(response) {
    return response.json().catch(() => ({}));
}

function formatBlogDate(dateString) {
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

function renderPosts(posts) {
    const container = document.querySelector('.blog-posts');
    if (!container) {
        return;
    }

    if (!posts.length) {
        container.innerHTML = '<p class="dashboard-empty">Nenhum post publicado ainda.</p>';
        return;
    }

    container.innerHTML = posts.map((post) => `
        <article class="blog-post-card">
            <div class="blog-post-meta">
                <span class="dashboard-chip">${getRoleLabel(post.authorRole)}</span>
                <span>${formatBlogDate(post.createdAt)}</span>
            </div>
            <h2>${post.title}</h2>
            ${post.imageUrl ? `<img src="${post.imageUrl}" alt="Imagem do post" class="blog-post-image">` : ''}
            <p class="blog-post-excerpt">${post.excerpt || ''}</p>
            <div class="blog-post-content">${String(post.content || '').replace(/\n/g, '<br>')}</div>
            <p class="blog-post-author">Publicado por ${post.authorName}</p>
        </article>
    `).join('');
}

async function initBlogPage() {
    const createPostBtn = document.getElementById('createPostBtn');
    const adminActions = document.getElementById('admin-actions');
    const allowedRoles = new Set(['admin', 'teacher', 'coordinator', 'press']);

    if (createPostBtn) {
        createPostBtn.addEventListener('click', () => {
            window.location.href = 'create-post.html';
        });
    }

    try {
        const postsResponse = await fetch('/api/posts');
        const postsData = await parseBlogJson(postsResponse);
        renderPosts(Array.isArray(postsData) ? postsData : []);
    } catch (error) {
        console.error('Erro ao carregar posts do blog:', error);
        renderPosts([]);
    }

    const token = window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    if (!token) {
        return;
    }

    try {
        const context = await window.MaxOnuSession?.getAuthContext?.();
        if (!context?.user) {
            return;
        }

        const user = context.user;
        if (allowedRoles.has(user.role)) {
            adminActions.style.display = 'block';
        }
    } catch (error) {
        console.error('Erro ao verificar permissões do blog:', error);
    }
}

document.addEventListener('DOMContentLoaded', initBlogPage);
