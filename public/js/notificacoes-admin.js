const ALLOWED_ROLES = new Set(['admin', 'coordinator', 'teacher', 'press']);
const ROLE_LABELS = { admin: 'Administrador', coordinator: 'Coordenador', teacher: 'Professor orientador', press: 'Imprensa' };

const TARGET_LABELS = {
    all:        'Todos os alunos serão notificados',
    segment:    'Alunos do segmento selecionado',
    unit:       'Alunos da unidade selecionada',
    classGroup: 'Alunos das turmas selecionadas',
    committee:  'Alunos do comitê selecionado'
};

let currentTarget = 'all';

function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

// ── Público-alvo ─────────────────────────────────────────────────────────────

function initTargetCards() {
    document.querySelectorAll('.notif-target-card').forEach((card) => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.notif-target-card').forEach((c) => c.classList.remove('is-active'));
            card.classList.add('is-active');
            currentTarget = card.dataset.target;
            updateFilterVisibility();
            updateRecipientsBar();
            validateForm();
        });
    });
}

function updateFilterVisibility() {
    const filters = {
        segment:    'notifFilterSegment',
        unit:       'notifFilterUnit',
        classGroup: 'notifFilterClassGroup',
        committee:  'notifFilterCommittee'
    };
    Object.entries(filters).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.hidden = currentTarget !== key;
    });
}

function updateRecipientsBar() {
    const label = document.getElementById('notifRecipientsLabel');
    if (!label) return;

    if (currentTarget === 'segment') {
        const seg = document.querySelector('input[name="segment"]:checked')?.value;
        const map = { all: 'Todos os segmentos (EM e 8º/9º)', em: 'Ensino Médio', fundamental: '8º e 9º ano' };
        label.textContent = map[seg] || TARGET_LABELS.segment;
        return;
    }
    if (currentTarget === 'unit') {
        const unit = document.querySelector('input[name="unit"]:checked')?.value;
        const map = { all: 'Todas as unidades (Sta Inês e Palmares)', 'Sta Ines': 'Unidade Sta Inês', Palmares: 'Unidade Palmares' };
        label.textContent = map[unit] || TARGET_LABELS.unit;
        return;
    }
    if (currentTarget === 'classGroup') {
        const allChecked = document.getElementById('notifClassGroupAll')?.checked;
        if (allChecked) { label.textContent = 'Todas as turmas'; return; }
        const selected = Array.from(document.querySelectorAll('input[name="classGroup"]:checked')).map((cb) => cb.value);
        label.textContent = selected.length ? `Turmas: ${selected.join(', ')}` : 'Nenhuma turma selecionada';
        return;
    }
    if (currentTarget === 'committee') {
        const val = document.getElementById('notifCommittee')?.value;
        const opt = document.querySelector(`#notifCommittee option[value="${val}"]`);
        label.textContent = val === 'unassigned' ? 'Alunos sem comitê final definido' : `Comitê: ${opt?.textContent || val}`;
        return;
    }
    label.textContent = TARGET_LABELS[currentTarget] || 'Destinatários selecionados';
}

// ── Checkboxes de turma ───────────────────────────────────────────────────────

function initClassGroupCheckboxes() {
    const allBox   = document.getElementById('notifClassGroupAll');
    const checks   = document.querySelectorAll('input[name="classGroup"]');

    allBox?.addEventListener('change', () => {
        checks.forEach((cb) => { cb.checked = allBox.checked; cb.disabled = allBox.checked; });
        updateRecipientsBar();
        validateForm();
    });

    checks.forEach((cb) => {
        cb.addEventListener('change', () => {
            const anyUnchecked = Array.from(checks).some((c) => !c.checked);
            if (allBox) allBox.checked = !anyUnchecked;
            updateRecipientsBar();
            validateForm();
        });
    });

    // Estado inicial: tudo marcado e desabilitado (pois "Todas" está ativo)
    checks.forEach((cb) => { cb.disabled = true; });
}

// ── Campos de texto ───────────────────────────────────────────────────────────

function initTextFields() {
    const titleInput   = document.getElementById('notifTitle');
    const messageInput = document.getElementById('notifMessage');
    const titleCount   = document.getElementById('notifTitleCount');
    const messageCount = document.getElementById('notifMessageCount');

    titleInput?.addEventListener('input', () => { updateCharCount(titleInput, titleCount, 80); updatePreview(); validateForm(); });
    messageInput?.addEventListener('input', () => { updateCharCount(messageInput, messageCount, 500); updatePreview(); validateForm(); });
}

function updateCharCount(input, counter, max) {
    if (!input || !counter) return;
    const len = input.value.length;
    counter.textContent = `${len} / ${max}`;
    counter.classList.toggle('is-near-limit', len >= max * 0.85);
    counter.classList.toggle('is-at-limit', len >= max);
}

// ── Pré-visualização ──────────────────────────────────────────────────────────

function updatePreview() {
    const title   = document.getElementById('notifTitle')?.value.trim();
    const message = document.getElementById('notifMessage')?.value.trim();
    const empty   = document.getElementById('notifPreviewEmpty');
    const card    = document.getElementById('notifPreviewCard');
    const pTitle  = document.getElementById('notifPreviewTitle');
    const pMsg    = document.getElementById('notifPreviewMessage');

    const hasContent = title || message;
    if (empty)  empty.hidden = !!hasContent;
    if (card)   card.hidden  = !hasContent;
    if (pTitle) pTitle.textContent = title   || '(sem título)';
    if (pMsg)   pMsg.textContent   = message || '(sem mensagem)';
}

// ── Validação ─────────────────────────────────────────────────────────────────

function validateForm() {
    const title   = document.getElementById('notifTitle')?.value.trim();
    const message = document.getElementById('notifMessage')?.value.trim();
    const btn     = document.getElementById('notifSubmitBtn');
    const hint    = document.getElementById('notifSendHint');

    // Para turmas, exige ao menos uma selecionada
    let targetOk = true;
    if (currentTarget === 'classGroup') {
        const allBox = document.getElementById('notifClassGroupAll');
        const anyChecked = allBox?.checked || Array.from(document.querySelectorAll('input[name="classGroup"]:checked')).length > 0;
        targetOk = anyChecked;
    }

    const ready = Boolean(title && message && targetOk);
    if (btn) btn.disabled = !ready;

    if (hint) {
        if (!title && !message)    hint.textContent = 'Preencha todos os campos para habilitar o envio.';
        else if (!title)           hint.textContent = 'Adicione um título para continuar.';
        else if (!message)         hint.textContent = 'Escreva a mensagem para continuar.';
        else if (!targetOk)        hint.textContent = 'Selecione ao menos uma turma.';
        else                       hint.textContent = 'Tudo pronto. Revise a pré-visualização e envie.';
        hint.classList.toggle('is-ready', ready);
    }
}

// ── Montar payload de filtro ──────────────────────────────────────────────────

function getFilterValue() {
    if (currentTarget === 'segment') {
        const seg = document.querySelector('input[name="segment"]:checked')?.value;
        return seg === 'all' ? {} : { segment: seg };
    }
    if (currentTarget === 'unit') {
        const unit = document.querySelector('input[name="unit"]:checked')?.value;
        return unit === 'all' ? {} : { unit };
    }
    if (currentTarget === 'classGroup') {
        const allBox = document.getElementById('notifClassGroupAll');
        if (allBox?.checked) return {};
        const selected = Array.from(document.querySelectorAll('input[name="classGroup"]:checked')).map((cb) => cb.value);
        return { classGroups: selected };
    }
    if (currentTarget === 'committee') {
        return { committee: document.getElementById('notifCommittee')?.value };
    }
    return {};
}

// ── Envio ─────────────────────────────────────────────────────────────────────

function showFeedback(message, type = 'success') {
    const el = document.getElementById('notifFeedback');
    if (!el) return;
    el.hidden = false;
    el.className = `notif-feedback notif-feedback--${type}`;
    el.innerHTML = `<span>${type === 'success' ? '✓' : '✕'}</span> ${message}`;
    if (type === 'success') setTimeout(() => { el.hidden = true; }, 6000);
}

async function handleSend() {
    const btn     = document.getElementById('notifSubmitBtn');
    const title   = document.getElementById('notifTitle')?.value.trim();
    const message = document.getElementById('notifMessage')?.value.trim();
    if (!title || !message) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<span class="notif-send-spinner"></span> Enviando...';

    try {
        const body = { title, message, target: currentTarget, ...getFilterValue() };
        const response = await fetch('/api/notifications/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify(body)
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Erro ao enviar notificação.');

        showFeedback(`Notificação enviada com sucesso para ${data.sent} aluno(s).`, 'success');
        document.getElementById('notifTitle').value = '';
        document.getElementById('notifMessage').value = '';
        document.getElementById('notifTitleCount').textContent = '0 / 80';
        document.getElementById('notifMessageCount').textContent = '0 / 500';
        updatePreview();
        validateForm();
        await loadHistory();
    } catch (error) {
        showFeedback(error.message || 'Erro ao enviar notificação.', 'error');
    } finally {
        btn.innerHTML = originalHTML;
        btn.disabled = false;
        validateForm();
    }
}

// ── Histórico ─────────────────────────────────────────────────────────────────

function formatRelativeTime(dateStr) {
    const diff  = Date.now() - new Date(dateStr).getTime();
    const mins  = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days  = Math.floor(diff / 86400000);
    if (mins < 1)   return 'Agora mesmo';
    if (mins < 60)  return `${mins} min atrás`;
    if (hours < 24) return `${hours}h atrás`;
    if (days < 7)   return `${days}d atrás`;
    return new Date(dateStr).toLocaleDateString('pt-BR');
}

async function deleteNotification(title, createdAt) {
    if (!await MaxOnuNotify.confirm('Tem certeza que deseja excluir esta notificação? Ela será removida de todos os alunos.', 'Confirmar exclusão')) return;

    try {
        const timestamp = new Date(createdAt).getTime();
        const response = await fetch(`/api/notifications/broadcast/${encodeURIComponent(title)}/${timestamp}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${getToken()}` }
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Erro ao excluir notificação.');

        showFeedback(`Notificação excluída de ${data.deletedFrom} aluno(s).`, 'success');
        await loadHistory();
    } catch (error) {
        showFeedback(error.message || 'Erro ao excluir notificação.', 'error');
    }
}

async function loadHistory() {
    const container = document.getElementById('notifHistory');
    if (!container) return;
    container.innerHTML = '<div class="notif-history-loading"><span>Carregando...</span></div>';
    try {
        const response = await fetch('/api/notifications/history', { headers: { 'Authorization': `Bearer ${getToken()}` } });
        const data = await response.json().catch(() => ({}));
        const broadcasts = data.notifications || [];
        if (!broadcasts.length) {
            container.innerHTML = '<div class="notif-history-empty"><span>📭</span><p>Nenhuma notificação enviada ainda.</p></div>';
            return;
        }
        container.innerHTML = broadcasts.map((n) => `
            <div class="notif-history-item">
                <div class="notif-history-item-header">
                    <strong>${escapeHtml(n.title)}</strong>
                    <span class="notif-history-time">${formatRelativeTime(n.createdAt)}</span>
                </div>
                <p>${escapeHtml(n.message)}</p>
                <div class="notif-history-footer">
                    ${n.payload?.sentBy ? `<span class="notif-history-sender">@${escapeHtml(n.payload.sentBy)}</span>` : ''}
                    <button class="notif-history-delete" data-title="${escapeHtml(n.title)}" data-created="${n.createdAt}" title="Excluir notificação">×</button>
                </div>
            </div>
        `).join('');

        // Event delegation para botões de excluir
        container.querySelectorAll('.notif-history-delete').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const title = btn.dataset.title;
                const createdAt = btn.dataset.created;
                await deleteNotification(title, createdAt);
            });
        });
    } catch {
        container.innerHTML = '<div class="notif-history-empty"><span>⚠️</span><p>Erro ao carregar histórico.</p></div>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Acesso ────────────────────────────────────────────────────────────────────

async function verifyAccess() {
    if (!getToken()) { window.location.href = '/login'; return false; }
    try {
        const context = await window.MaxOnuSession?.getAuthContext?.();
        const user = context?.user || null;
        if (!user || !ALLOWED_ROLES.has(user.role)) { window.location.href = '/profile'; return false; }
        const lead  = document.getElementById('notifLead');
        const badge = document.getElementById('notifRoleBadge');
        if (lead)  lead.textContent = `Olá, ${user.fullName?.split(' ')[0] || user.username}. Envie notificações diretamente para a caixa dos alunos.`;
        if (badge) { badge.textContent = ROLE_LABELS[user.role] || user.role; badge.dataset.role = user.role; }
        return true;
    } catch {
        window.location.href = '/login';
        return false;
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
    const allowed = await verifyAccess();
    if (!allowed) return;

    initTargetCards();
    initClassGroupCheckboxes();
    initTextFields();
    validateForm();

    document.getElementById('notifSubmitBtn')?.addEventListener('click', handleSend);
    document.getElementById('notifRefreshHistory')?.addEventListener('click', loadHistory);

    document.querySelectorAll('input[name="segment"], input[name="unit"]').forEach((r) => {
        r.addEventListener('change', () => { updateRecipientsBar(); validateForm(); });
    });
    document.getElementById('notifCommittee')?.addEventListener('change', () => { updateRecipientsBar(); validateForm(); });

    await loadHistory();
}

document.addEventListener('DOMContentLoaded', init);
