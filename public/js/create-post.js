async function parseJson(response) {
    return response.json().catch(() => ({}));
}

async function initCreatePostPage() {
    const message = document.getElementById('postAccessMessage');
    const feedback = document.getElementById('createPostFeedback');
    const form = document.getElementById('createPostForm');
    const badge = document.getElementById('createPostRoleBadge');
    const kicker = document.getElementById('createPostRoleKicker');
    const heading = document.getElementById('createPostHeading');
    const token = window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    const allowedRoles = new Set(['admin', 'teacher', 'coordinator', 'press']);

    if (!token) {
        window.location.href = '/login';
        return;
    }

    try {
        const context = await window.MaxOnuSession?.getAuthContext?.();
        const user = context?.user;
        if (!user) {
            throw new Error('Sem permissão');
        }
        if (!allowedRoles.has(user.role)) {
            window.location.href = '/blog';
            return;
        }

        const roleMessages = {
            admin: {
                message: 'A administração pode usar esta área para publicar comunicados e atualizações oficiais da MaxOnu 2026.',
                badge: 'Admin',
                kicker: 'Publicação administrativa',
                heading: 'Novo comunicado oficial'
            },
            teacher: {
                message: 'Professores orientadores podem preparar avisos, orientações e materiais de apoio para os participantes.',
                badge: 'Orientação',
                kicker: 'Publicação de orientação',
                heading: 'Novo aviso para participantes'
            },
            coordinator: {
                message: 'A coordenação pode centralizar comunicados operacionais, avisos de comitê e publicações estratégicas.',
                badge: 'Coordenação',
                kicker: 'Publicação operacional',
                heading: 'Novo post da coordenação'
            },
            press: {
                message: 'A equipe de imprensa pode usar esta área para preparar comunicados, notas e chamadas públicas da MaxOnu 2026.',
                badge: 'Imprensa',
                kicker: 'Publicação editorial',
                heading: 'Nova publicação da imprensa'
            }
        };

        const roleConfig = roleMessages[user.role] || roleMessages.admin;
        message.textContent = roleConfig.message;
        if (badge) badge.textContent = roleConfig.badge;
        if (kicker) kicker.textContent = roleConfig.kicker;
        if (heading) heading.textContent = roleConfig.heading;
        feedback.textContent = 'Preencha o formulário e publique quando estiver pronto.';
        form.hidden = false;
    } catch (error) {
        window.location.href = '/blog';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initCreatePostPage();

    const imageInput = document.getElementById('postImage');
    const imagePreview = document.getElementById('postImagePreview');

    imageInput?.addEventListener('change', () => {
        const file = imageInput.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = () => {
                imagePreview.src = reader.result;
                imagePreview.hidden = false;
            };
            reader.readAsDataURL(file);
        } else {
            imagePreview.hidden = true;
            imagePreview.src = '';
        }
    });

    document.getElementById('createPostForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();

            const token = window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
        const feedback = document.getElementById('createPostFeedback');
        const submitButton = event.target.querySelector('button[type="submit"]');

        submitButton.disabled = true;
        feedback.textContent = 'Publicando post...';

        try {
            const formData = new FormData();
            formData.append('title', document.getElementById('postTitle').value.trim());
            formData.append('excerpt', document.getElementById('postExcerpt').value.trim());
            formData.append('content', document.getElementById('postContent').value.trim());

            if (imageInput?.files?.[0]) {
                formData.append('image', imageInput.files[0]);
            }

            const response = await fetch('/api/posts', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            const data = await parseJson(response);
            if (!response.ok) {
                const message = Array.isArray(data.error) ? data.error[0]?.msg : data.error;
                throw new Error(message || 'Não foi possível publicar o post.');
            }

            feedback.textContent = 'Post publicado com sucesso. Redirecionando para o blog...';
            event.target.reset();
            imagePreview.hidden = true;
            imagePreview.src = '';

            setTimeout(() => {
                window.location.href = '/blog';
            }, 900);
        } catch (error) {
            feedback.textContent = error.message || 'Erro ao publicar post.';
        } finally {
            submitButton.disabled = false;
        }
    });
});
