function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

const COMMITTEE_DETAILS = {
    1: {
        sigla: 'CDH',
        name: 'CDH 2026 — O Paradoxo da Hiperconectividade: Regulamentação da Vigilância Massiva, Ética da Inteligência Artificial e Proteção da Democracia na Era do Big Data',
        theme: 'O Paradoxo da Hiperconectividade: Regulamentação da Vigilância Massiva, Ética da Inteligência Artificial e Proteção da Democracia na Era do Big Data'
    },
    2: {
        sigla: 'AGNU',
        name: 'AGNU — Guerra, Multipolaridade e Disputas Territoriais: Desafios à Soberania, Segurança Global e Justiça Internacional no Século XXI',
        theme: 'Guerra, Multipolaridade e Disputas Territoriais: Desafios à Soberania, Segurança Global e Justiça Internacional no Século XXI'
    },
    3: {
        sigla: 'ACNUR',
        name: 'ACNUR — Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias',
        theme: 'Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias'
    },
    4: {
        sigla: 'Bioética',
        name: 'Bioética e Genética Humana — Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e os direitos das futuras gerações',
        theme: 'Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e os direitos das futuras gerações'
    },
    5: {
        sigla: 'Nova Ordem',
        name: 'Nova Ordem Global — A Nova Ordem Global em Disputa: Recursos Estratégicos, Poder e os Limites do Capitalismo no Século XXI',
        theme: 'A Nova Ordem Global em Disputa: Recursos Estratégicos, Poder e os Limites do Capitalismo no Século XXI'
    },
    6: {
        sigla: 'UNHRC',
        name: 'UNHRC — Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado',
        theme: 'Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado'
    },
    7: {
        sigla: 'ONU Mulheres',
        name: 'ONU Mulheres (CSW/2026) — Vozes, Leis e Limites: O Desafio de Enfrentar a Violência contra Mulheres',
        theme: 'Vozes, Leis e Limites: O Desafio de Enfrentar a Violência contra Mulheres'
    }
};

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

/* ── Combo customizado ─────────────────────────────── */
function buildCombo(comboEl, hiddenSelect, allCombos) {
    const list = comboEl.querySelector('.reg-combo-list');
    const valueEl = comboEl.querySelector('.reg-combo-value');

    // Popula a lista e o select oculto
    function populate(blockedValues = new Set()) {
        const currentVal = hiddenSelect.value;

        list.innerHTML = '';
        hiddenSelect.innerHTML = '<option value="">Selecione</option>';

        Object.entries(COMMITTEE_DETAILS).forEach(([id, detail]) => {
            // Select oculto
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = detail.name;
            if (id === currentVal) opt.selected = true;
            hiddenSelect.appendChild(opt);

            // Item visual
            const li = document.createElement('li');
            li.className = 'reg-combo-option';
            li.setAttribute('role', 'option');
            li.dataset.value = id;

            if (blockedValues.has(id)) li.classList.add('is-disabled');
            if (id === currentVal) li.classList.add('is-selected');

            li.innerHTML = `
                <span class="reg-combo-option-sigla">${detail.sigla}</span>
                <span class="reg-combo-option-text">${detail.theme}</span>
            `;

            li.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (li.classList.contains('is-disabled')) return;
                selectOption(id, detail.sigla);
            });

            list.appendChild(li);
        });
    }

    function selectOption(value, sigla) {
        hiddenSelect.value = value;
        valueEl.textContent = sigla;
        valueEl.classList.remove('is-placeholder');
        close();
        hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function open() {
        // Fecha todos os outros
        allCombos.forEach(other => {
            if (other !== comboEl) closeCombo(other);
        });
        comboEl.setAttribute('aria-expanded', 'true');
    }

    function close() {
        comboEl.setAttribute('aria-expanded', 'false');
    }

    comboEl.addEventListener('click', () => {
        const isOpen = comboEl.getAttribute('aria-expanded') === 'true';
        isOpen ? close() : open();
    });

    comboEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
        if (e.key === 'Escape') close();
    });

    // Fecha ao clicar fora
    document.addEventListener('click', (e) => {
        if (!comboEl.contains(e.target)) close();
    });

    // Expõe métodos para sincronização
    comboEl._populate = populate;
    comboEl._getValue = () => hiddenSelect.value;
    comboEl._setValue = (val) => {
        hiddenSelect.value = val;
        const detail = COMMITTEE_DETAILS[val];
        if (detail) {
            valueEl.textContent = detail.sigla;
            valueEl.classList.remove('is-placeholder');
        }
    };

    // Estado inicial
    valueEl.classList.add('is-placeholder');
    populate();
}

function closeCombo(comboEl) {
    comboEl.setAttribute('aria-expanded', 'false');
}

function syncAllCombos(combos, hiddenSelects) {
    const blocked = [0, 1, 2].map(i => hiddenSelects[i].value).filter(Boolean);

    combos.forEach((combo, i) => {
        const myVal = hiddenSelects[i].value;
        const othersBlocked = new Set(
            [0, 1, 2].filter(j => j !== i).map(j => hiddenSelects[j].value).filter(Boolean)
        );
        combo._populate(othersBlocked);
    });
}

/* ── Carregamento da página ────────────────────────── */
async function loadRegistrationPage() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login?next=/inscricao';
        return;
    }

    const [userContext, statusResponse] = await Promise.all([
        window.MaxOnuSession?.getAuthContext?.() || fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then((r) => r.ok ? parseJson(r) : null),
        fetch('/api/delegation/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
    ]);

    const user = userContext?.user || userContext;
    if (!user) { window.location.href = '/login?next=/inscricao'; return; }
    if (user.role !== 'candidate') { window.location.href = '/profile'; return; }

    const status = await parseJson(statusResponse);
    const form = document.getElementById('registrationForm');
    const feedback = document.getElementById('registrationFeedback');
    const lead = document.getElementById('registrationLead');

    document.getElementById('registrationClassGroup').value = user.classGroup || '';

    const hiddenSelects = [
        document.getElementById('firstChoice'),
        document.getElementById('secondChoice'),
        document.getElementById('thirdChoice')
    ];

    const comboEls = [
        document.getElementById('combo-firstChoice'),
        document.getElementById('combo-secondChoice'),
        document.getElementById('combo-thirdChoice')
    ];

    if (!status.registrationOpen) {
        const waitingReveal = !status.revealPassed;
        lead.textContent = waitingReveal
            ? 'As inscrições serão liberadas assim que a contagem regressiva terminar.'
            : 'As inscrições foram fechadas temporariamente pela coordenação.';
        feedback.textContent = waitingReveal
            ? 'Ainda não é possível enviar o formulário.'
            : 'O formulário está fechado no momento.';

        comboEls.forEach(combo => {
            if (!combo) return;
            combo.querySelector('.reg-combo-value').textContent = waitingReveal
                ? 'Sigilo até a abertura' : 'Inscrições encerradas';
            combo.style.pointerEvents = 'none';
            combo.style.opacity = '0.55';
        });
        form.querySelectorAll('input, select, button').forEach(f => f.disabled = true);
        return;
    }

    // Inicializa os combos
    comboEls.forEach((combo, i) => {
        buildCombo(combo, hiddenSelects[i], comboEls);
    });

    // Sincroniza bloqueios ao mudar seleção
    hiddenSelects.forEach((sel) => {
        sel.addEventListener('change', () => syncAllCombos(comboEls, hiddenSelects));
    });

    lead.textContent = status.registration?.submittedAt
        ? 'Sua inscrição já foi enviada. Você pode ajustar as escolhas se precisar.'
        : 'Preencha as três preferências de comitê e envie a inscrição.';

    if (status.registration?.submittedAt) {
        comboEls[0]._setValue(String(status.registration.firstChoice));
        comboEls[1]._setValue(String(status.registration.secondChoice));
        comboEls[2]._setValue(String(status.registration.thirdChoice));
        document.getElementById('teamSize').value = '2';
        syncAllCombos(comboEls, hiddenSelects);
        feedback.textContent = 'Altere os campos e envie novamente se quiser atualizar suas preferências.';
    }
}

/* ── DOMContentLoaded ──────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    const safeLoad = () => loadRegistrationPage().catch((err) => {
        console.error(err);
        const fb = document.getElementById('registrationFeedback');
        if (fb) fb.textContent = 'Erro ao carregar a página de inscrição.';
    });

    safeLoad();
    document.addEventListener('delegation-updated', safeLoad);

    document.getElementById('registrationForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const button = event.target.querySelector('button[type="submit"]');
        const feedback = document.getElementById('registrationFeedback');
        button.disabled = true;
        feedback.textContent = 'Enviando inscrição...';

        try {
            const payload = {
                firstChoice: Number(document.getElementById('firstChoice').value),
                secondChoice: Number(document.getElementById('secondChoice').value),
                thirdChoice: Number(document.getElementById('thirdChoice').value),
                teamSize: 2
            };

            const choices = [payload.firstChoice, payload.secondChoice, payload.thirdChoice];
            if (choices.some((v) => !v) || new Set(choices).size < 3) {
                feedback.textContent = 'Selecione três comitês diferentes.';
                button.disabled = false;
                return;
            }

            const response = await fetch('/api/delegation/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(payload)
            });

            const data = await parseJson(response);
            if (!response.ok) throw new Error(data.error || 'Não foi possível concluir sua inscrição.');

            feedback.textContent = data.message || 'Inscrição enviada com sucesso.';
            document.dispatchEvent(new CustomEvent('delegation-updated'));

            const inviteUsername = document.getElementById('regInviteUsername')?.value?.trim()?.toLowerCase();
            if (inviteUsername) {
                try {
                    const inviteResponse = await fetch('/api/delegation/invite', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getToken()}`
                        },
                        body: JSON.stringify({ username: inviteUsername })
                    });
                    const inviteData = await parseJson(inviteResponse);
                    const inviteFeedback = document.getElementById('regInviteFeedback');
                    if (inviteFeedback) {
                        inviteFeedback.textContent = inviteResponse.ok
                            ? (inviteData.message || 'Convite enviado com sucesso.')
                            : (inviteData.error || 'Inscrição enviada, mas não foi possível enviar o convite.');
                    }
                } catch (_) {
                    const inviteFeedback = document.getElementById('regInviteFeedback');
                    if (inviteFeedback) inviteFeedback.textContent = 'Inscrição enviada, mas erro ao enviar convite.';
                }
                setTimeout(() => { window.location.href = '/profile'; }, 1400);
            } else {
                setTimeout(() => { window.location.href = '/profile'; }, 900);
            }
        } catch (error) {
            feedback.textContent = error.message || 'Erro ao enviar inscrição.';
        } finally {
            button.disabled = false;
        }
    });
});
