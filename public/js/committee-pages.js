const COMMITTEE_PLACEHOLDERS = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    displayName: `Comitê ${index + 1}`
}));

const GUIDE_FILES = {
    1: '',
    2: '',
    3: '',
    4: '',
    5: '',
    6: '',
    7: ''
};

async function parseCommitteeJson(response) {
    return response.json().catch(() => ({}));
}

async function fetchRevealStatus() {
    const response = await fetch('/api/reveal-status');
    return parseCommitteeJson(response);
}

async function fetchCommitteeCatalog() {
    const response = await fetch('/api/committees');
    if (!response.ok) {
        throw new Error('locked');
    }

    const data = await parseCommitteeJson(response);
    return Array.isArray(data.committees) ? data.committees : [];
}

async function getCommitteeMeta(committeeId) {
    try {
        const revealed = await fetchRevealStatus();
        if (!revealed.revealed) {
            return { revealed: false, meta: COMMITTEE_PLACEHOLDERS.find((item) => item.id === Number(committeeId)) };
        }

        const committees = await fetchCommitteeCatalog();
        const meta = committees.find((item) => item.id === Number(committeeId));
        return {
            revealed: true,
            meta: meta || COMMITTEE_PLACEHOLDERS.find((item) => item.id === Number(committeeId))
        };
    } catch (error) {
        return { revealed: false, meta: COMMITTEE_PLACEHOLDERS.find((item) => item.id === Number(committeeId)) };
    }
}

async function renderCommitteeHubCards(kind) {
    const grid = document.getElementById(`${kind}Grid`);
    const message = document.getElementById(`${kind}Message`);
    if (!grid || !message) {
        return;
    }

    let revealed = false;
    let committees = COMMITTEE_PLACEHOLDERS;

    try {
        const revealStatus = await fetchRevealStatus();
        revealed = Boolean(revealStatus.revealed);
        if (revealed) {
            committees = await fetchCommitteeCatalog();
        }
    } catch (error) {
        revealed = false;
    }

    if (!revealed) {
        message.textContent = 'As informações dos comitês permanecem sob sigilo e só serão disponibilizadas após o término oficial da contagem regressiva.';
        grid.innerHTML = COMMITTEE_PLACEHOLDERS.map((committee) => `
            <article class="committee-card committee-card-detailed committee-card-locked">
                <span class="committee-number">Comitê ${committee.id}</span>
                <h3>Sigilo diplomático</h3>
                <p>Esta página permanece reservada até a abertura oficial dos comitês.</p>
            </article>
        `).join('');
        return;
    }

    const messages = {
        delegations: 'As páginas por comitê exibem o nome completo de cada órgão e sua sigla, conforme a divulgação oficial da MaxOnu 2026.',
        guides: 'Os guias de estudo estão organizados por comitê e identificados com o nome completo do órgão, acompanhado da sigla quando aplicável.',
        dpos: 'Os envios de DPO seguem a organização oficial dos comitês e respeitam a identificação completa de cada órgão.'
    };

    message.textContent = messages[kind] || '';
    grid.innerHTML = committees.map((committee) => {
        const href = kind === 'delegations'
            ? `delegacoes-comite-${committee.id}.html`
            : kind === 'guides'
                ? `guias-comite-${committee.id}.html`
                : `dpos-comite-${committee.id}.html`;

        return `
            <article class="committee-card committee-card-detailed committee-navigation-card">
                <span class="committee-number">Comitê ${committee.id}</span>
                <h3>${committee.displayName || committee.shortTitle || `Comitê ${committee.id}`}</h3>
                <p>${kind === 'guides'
                    ? 'Acesse a página específica para consultar a situação do guia de estudo e baixar o PDF quando estiver disponível.'
                    : kind === 'dpos'
                        ? 'Acesse a página específica para acompanhar os envios do DPO e, quando autorizado, realizar a submissão da sua delegação.'
                        : 'Acesse a página específica para acompanhar a delegação pública do comitê após a liberação oficial.'}</p>
                <a href="${href}" class="view-button">Abrir página</a>
            </article>
        `;
    }).join('');
}

async function updateCommitteePageHeader(kind, committeeId) {
    const { revealed, meta } = await getCommitteeMeta(committeeId);
    const title = document.getElementById('committeePageTitle');
    const lead = document.getElementById('committeePageLead');
    const badge = document.getElementById('committeePageBadge');

    if (title) {
        title.textContent = revealed
            ? (meta.displayName || meta.shortTitle || `Comitê ${committeeId}`)
            : `Comitê ${committeeId}`;
    }

    if (badge) {
        badge.textContent = kind === 'guides'
            ? 'Guia'
            : kind === 'dpo'
                ? 'DPO'
                : 'Delegação';
    }

    if (lead) {
        lead.textContent = !revealed
            ? 'Os dados deste comitê permanecem em sigilo até o encerramento da contagem regressiva.'
            : kind === 'guides'
                ? 'Os guias de estudo ajudam a estruturar a pesquisa, qualificar a leitura do tema e preparar intervenções mais consistentes ao longo do comitê.'
                : kind === 'dpo'
                    ? 'O Documento de Posicionamento Oficial registra a postura diplomática da delegação e deve ser enviado somente após a definição pública dos países.'
                    : 'Esta página reúne a composição pública das delegações do comitê, respeitando o calendário oficial de liberação definido pela organização.';
    }

    return revealed;
}

async function initDelegationCommitteePage(committeeId) {
    const revealed = await updateCommitteePageHeader('delegation', committeeId);
    const container = document.getElementById('committeePageContent');
    if (!container) {
        return;
    }

    if (!revealed) {
        container.innerHTML = '<div class="dashboard-empty committee-page-empty">As informações deste comitê seguem em sigilo até o término da contagem regressiva.</div>';
        return;
    }

    container.innerHTML = '<p class="dashboard-empty">Carregando delegações deste comitê...</p>';

    try {
        const response = await fetch(`/api/delegation/public/committee/${committeeId}`);
        const data = await parseCommitteeJson(response);

        if (!data.released) {
            container.innerHTML = `
                <div class="dashboard-empty committee-page-empty">
                    As delegações deste comitê ainda não foram liberadas para visualização pública. Assim que a organização concluir essa etapa, a composição oficial aparecerá aqui.
                </div>
            `;
            return;
        }

        if (!data.delegations?.length) {
            container.innerHTML = `
                <div class="dashboard-empty committee-page-empty">
                    Não há delegações publicadas para este comitê no momento.
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="committee-page-grid">
                ${data.delegations.map((delegation, index) => `
                    <article class="dashboard-panel committee-page-card">
                        <span class="dashboard-chip">Delegação ${index + 1}</span>
                        <h3>${delegation.country}</h3>
                        <div class="teammate-list">
                            ${delegation.members.map((member) => `
                                <div class="teammate-card">
                                    <strong>${member.fullName}</strong>
                                    <span class="registration-muted">${member.classGroup || 'Turma não informada'}</span>
                                </div>
                            `).join('')}
                        </div>
                    </article>
                `).join('')}
            </div>
        `;
    } catch (error) {
        container.innerHTML = '<p class="dashboard-empty">Não foi possível carregar as delegações deste comitê.</p>';
    }
}

async function initGuideCommitteePage(committeeId) {
    const revealed = await updateCommitteePageHeader('guides', committeeId);
    const container = document.getElementById('committeePageContent');
    if (!container) {
        return;
    }

    if (!revealed) {
        container.innerHTML = '<div class="dashboard-empty committee-page-empty">Os materiais deste comitê permanecem sob sigilo até o término da contagem regressiva.</div>';
        return;
    }

    const pdfUrl = GUIDE_FILES[committeeId] || '';

    container.innerHTML = `
        <article class="dashboard-panel committee-page-card">
            <h3>Importância do guia de estudo</h3>
            <p>O guia de estudo organiza referências, delimita o eixo temático do comitê e orienta a preparação individual e coletiva da delegação. Ele é uma ferramenta essencial para aprofundar o repertório e qualificar a participação no debate.</p>
            ${pdfUrl ? `
                <a href="${pdfUrl}" class="view-button" target="_blank" rel="noopener noreferrer">Baixar guia em PDF</a>
            ` : `
                <div class="dashboard-empty committee-page-empty">
                    O guia de estudo deste comitê ainda não está disponível. Solicita-se que os participantes aguardem a publicação oficial pela equipe de imprensa.
                </div>
            `}
        </article>
    `;
}

function getCurrentCandidate(context) {
    return context?.user?.role === 'candidate' ? context.user : null;
}

async function initDpoCommitteePage(committeeId) {
    const revealed = await updateCommitteePageHeader('dpo', committeeId);
    const container = document.getElementById('committeePageContent');
    if (!container) {
        return;
    }

    if (!revealed) {
        container.innerHTML = '<div class="dashboard-empty committee-page-empty">As referências deste comitê permanecem em sigilo até o término da contagem regressiva.</div>';
        return;
    }

    container.innerHTML = '<p class="dashboard-empty">Carregando informações de envio do DPO...</p>';

    try {
        const [statusResponse, submissionsResponse] = await Promise.all([
            fetch('/api/delegation/public-status'),
            fetch(`/api/dpos/committee/${committeeId}`)
        ]);
        const statusData = await parseCommitteeJson(statusResponse);
        const submissionsData = await parseCommitteeJson(submissionsResponse);

        let context = null;
        try {
            context = await window.MaxOnuSession?.getAuthContext?.();
        } catch (error) {
            context = null;
        }

        const candidate = getCurrentCandidate(context);
        const canSubmit = Boolean(
            candidate &&
            statusData.registrationOpen &&
            statusData.publicDelegationsReleased &&
            candidate.committee === Number(committeeId) &&
            candidate.country
        );

        container.innerHTML = `
            <div class="committee-page-stack">
                <article class="dashboard-panel committee-page-card">
                    <h3>Orientação de envio</h3>
                    <p>O DPO deve refletir a posição oficial do país representado, com clareza argumentativa e aderência ao tema do comitê. Antes do envio, recomenda-se revisar o texto, confirmar o país atribuído à delegação e conferir se o arquivo final está legível.</p>
                    <p><a href="Documents/DPO - Informações.pdf" target="_blank" rel="noopener noreferrer" class="view-button">Consultar orientações gerais do DPO</a></p>
                </article>
                <article class="dashboard-panel committee-page-card">
                    <h3>Envio da delegação</h3>
                    ${canSubmit ? `
                        <form id="dpoUploadForm" class="dashboard-form dpo-upload-form">
                            <div class="form-group">
                                <label for="dpoFile">Arquivo do DPO</label>
                                <input type="file" id="dpoFile" accept=".pdf,image/png,image/jpeg,image/webp" required>
                            </div>
                            <button type="submit" class="view-button">Enviar DPO</button>
                        </form>
                        <p class="register-note registration-feedback" id="dpoUploadFeedback">Seu envio ficará vinculado à delegação do país ${candidate.country}.</p>
                    ` : `
                        <div class="dashboard-empty committee-page-empty">
                            O envio do DPO nesta página será liberado somente após o término da contagem, a definição dos comitês e a divulgação oficial dos países das delegações.
                        </div>
                    `}
                </article>
                <article class="dashboard-panel committee-page-card">
                    <h3>Envios registrados</h3>
                    ${submissionsData.released && submissionsData.submissions?.length ? `
                        <div class="committee-page-grid">
                            ${submissionsData.submissions.map((submission) => `
                                <div class="teammate-card">
                                    <strong>${submission.country}</strong>
                                    <span class="registration-muted">${new Date(submission.updatedAt).toLocaleDateString('pt-BR')}</span>
                                    <a href="${submission.fileUrl}" target="_blank" rel="noopener noreferrer" class="view-button">Abrir arquivo</a>
                                </div>
                            `).join('')}
                        </div>
                    ` : `
                        <div class="dashboard-empty committee-page-empty">
                            Ainda não há DPOs disponíveis para este comitê.
                        </div>
                    `}
                </article>
            </div>
        `;

        const uploadForm = document.getElementById('dpoUploadForm');
        uploadForm?.addEventListener('submit', async (event) => {
            event.preventDefault();

            const fileInput = document.getElementById('dpoFile');
            const feedback = document.getElementById('dpoUploadFeedback');
            const submitButton = uploadForm.querySelector('button[type="submit"]');
            const file = fileInput?.files?.[0];

            if (!file) {
                feedback.textContent = 'Selecione um arquivo antes de enviar.';
                return;
            }

            submitButton.disabled = true;
            feedback.textContent = 'Enviando DPO...';

            try {
                const formData = new FormData();
                formData.append('file', file);

                const response = await fetch(`/api/dpos/committee/${committeeId}`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${window.MaxOnuSession?.getToken?.() || localStorage.getItem('token')}`
                    },
                    body: formData
                });
                const data = await parseCommitteeJson(response);
                if (!response.ok) {
                    throw new Error(data.error || 'Não foi possível enviar o DPO.');
                }

                feedback.textContent = data.message || 'DPO enviado com sucesso.';
                uploadForm.reset();
                await initDpoCommitteePage(committeeId);
            } catch (error) {
                feedback.textContent = error.message || 'Erro ao enviar o DPO.';
            } finally {
                submitButton.disabled = false;
            }
        });
    } catch (error) {
        container.innerHTML = '<p class="dashboard-empty">Não foi possível carregar as informações deste comitê.</p>';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const body = document.body;
    const hubType = body.dataset.committeeHub;
    const pageType = body.dataset.committeePage;
    const committeeId = Number(body.dataset.committeeId);

    if (hubType === 'delegations') {
        renderCommitteeHubCards('delegations');
    } else if (hubType === 'guides') {
        renderCommitteeHubCards('guides');
    } else if (hubType === 'dpos') {
        renderCommitteeHubCards('dpos');
    }

    if (pageType === 'delegation' && committeeId) {
        initDelegationCommitteePage(committeeId);
    } else if (pageType === 'guide' && committeeId) {
        initGuideCommitteePage(committeeId);
    } else if (pageType === 'dpo' && committeeId) {
        initDpoCommitteePage(committeeId);
    }
});
