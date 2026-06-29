(function () {
  'use strict';

  const COMMITTEE_PLACEHOLDERS = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    displayName: `Comitê ${index + 1}`,
    shortTitle: `Comitê ${index + 1}`
  }));

  const state = {
    user: null,
    authReady: false,
    publicStatus: null,
    committees: COMMITTEE_PLACEHOLDERS,
    activeCommitteeId: null,
    submissions: [],
    message: 'Carregando DPOs...',
    file: null,
    loading: false
  };

  const root = document.getElementById('main-content') || document.body;

  function normalizeText(value = '') {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
  }

  function setLoading(loading) {
    state.loading = loading;
    const btn = document.getElementById('dpoSubmitBtn');
    if (btn) {
      btn.disabled = loading || !canSubmit();
      btn.textContent = loading ? 'Enviando...' : 'Enviar DPO';
    }
  }

  function setMessage(text, type = 'info') {
    state.message = text;
    const el = document.getElementById('dpoMessage');
    if (el) {
      el.textContent = text;
      el.dataset.type = type;
    }
  }

  function committeeLabel(committee) {
    return committee?.displayName || committee?.shortTitle || `Comitê ${committee?.id || ''}`;
  }

  function getFlagFileName(country) {
    const normalized = normalizeText(country);
    const map = {
      brasil: 'Brasil.png',
      alemanha: 'Alemanha.png',
      argentina: 'Argentina.png',
      australia: 'Australia.png',
      canada: 'Canada.png',
      chile: 'Chile.png',
      china: 'China.png',
      cuba: 'Cuba.png',
      espanha: 'Espanha.png',
      franca: 'Franca.png',
      india: 'India.png',
      israel: 'Israel.png',
      italia: 'Italia.png',
      japao: 'Japao.png',
      mexico: 'Mexico.png',
      noruega: 'Noruega.png',
      'nova zelandia': 'Nova_Zelandia.png',
      'paises baixos': 'Paises_Baixos.png',
      'reino unido': 'Reino_Unido.png',
      russia: 'Russia.png',
      singapura: 'Singapura.png',
      suica: 'Suica.png',
      suecia: 'Suecia.png',
      turquia: 'Turquia.png',
      uruguai: 'Uruguai.png',
      venezuela: 'Venezuela.png',
      vietnam: 'Vietna.png',
      palestina: 'palestina.png',
      'estados unidos': 'Estados_Unidos.png'
    };

    return map[normalized] || '';
  }

  function getFlagUrl(country) {
    const fileName = getFlagFileName(country);
    return fileName ? `/paises/flags/${encodeURIComponent(fileName)}` : '';
  }

  async function apiJson(url, options = {}) {
    const headers = {
      Authorization: `Bearer ${getToken()}`,
      ...(options.headers || {})
    };

    if (!(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, {
      ...options,
      headers
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  async function fetchPublicStatus() {
    const response = await fetch('/api/delegation/public-status');
    return response.json().catch(() => ({}));
  }

  async function fetchCommittees() {
    const response = await fetch('/api/committees');
    if (!response.ok) return COMMITTEE_PLACEHOLDERS;
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.committees) && data.committees.length ? data.committees : COMMITTEE_PLACEHOLDERS;
  }

  async function fetchSubmissions(committeeId) {
    if (!committeeId) return [];
    const response = await fetch(`/api/dpos/committee/${committeeId}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.released) return [];
    return Array.isArray(data.submissions) ? data.submissions : [];
  }

  async function resolveUser() {
    if (!getToken()) {
      state.user = null;
      state.authReady = true;
      return;
    }

    try {
      const context = await window.MaxOnuSession?.getAuthContext?.();
      state.user = context?.user || null;
    } catch (_) {
      state.user = null;
    } finally {
      state.authReady = true;
    }
  }

  function canSubmit() {
    return Boolean(
      state.user &&
      state.user.role === 'candidate' &&
      state.publicStatus &&
      state.publicStatus.registrationOpen &&
      state.publicStatus.publicDelegationsReleased &&
      state.publicStatus.dpoSubmissionsReleased &&
      state.user.committee &&
      state.user.country &&
      Number(state.user.committee) === Number(state.activeCommitteeId)
    );
  }

  function renderCommitteeHub() {
    return state.committees.map((committee) => {
      const active = Number(state.activeCommitteeId) === Number(committee.id);
      return `
        <button type="button" class="dpo-committee-card ${active ? 'is-active' : ''}" data-action="select-committee" data-committee-id="${committee.id}">
          <div class="dpo-committee-id">${committee.id}</div>
          <div>
            <h3>${escapeHtml(committeeLabel(committee))}</h3>
            <p>${state.publicStatus?.publicDelegationsReleased ? 'Ver envios e acompanhar o comitê.' : 'O envio ficará disponível após a liberação pública.'}</p>
          </div>
          <div class="dpo-committee-arrow">
            <span>${active ? 'Selecionado' : 'Abrir'}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14"></path>
              <path d="M13 5l7 7-7 7"></path>
            </svg>
          </div>
        </button>
      `;
    }).join('');
  }

  function renderSubmissionList() {
    if (!state.activeCommitteeId) {
      return '<div class="dpo-empty">Selecione um comitê para ver os envios registrados.</div>';
    }

    if (!state.submissions.length) {
      return '<div class="dpo-empty">Ainda não há DPOs registrados para este comitê.</div>';
    }

    return state.submissions.map((item) => {
      const flagUrl = getFlagUrl(item.country);
      return `
        <article class="dpo-submission-card">
          <div class="dpo-submission-head">
            <div class="dpo-submission-country">
              ${flagUrl ? `<img src="${escapeHtml(flagUrl)}" alt="${escapeHtml(item.country)}" onerror="this.style.display='none'">` : '<div class="dpo-fallback-flag"></div>'}
              <div>
                <strong>${escapeHtml(item.country || 'Sem país')}</strong>
                <span>${escapeHtml(new Date(item.updatedAt).toLocaleDateString('pt-BR'))}</span>
              </div>
            </div>
            <a href="${escapeHtml(item.fileUrl)}" target="_blank" rel="noopener noreferrer" class="view-button">Abrir arquivo</a>
          </div>
          <div class="dpo-submission-meta">
            <span>${escapeHtml(item.fileName || 'Arquivo enviado')}</span>
            <span>${escapeHtml(item.mimeType || '')}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderUploadPanel() {
    const user = state.user || {};
    const committee = state.committees.find((item) => Number(item.id) === Number(user.committee));
    const ready = canSubmit();

    const currentUploadCard = ready ? `
      <form id="dpoUploadForm" class="dpo-upload-form">
        <div class="form-group">
          <label for="dpoFile">Arquivo do DPO</label>
          <input type="file" id="dpoFile" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required>
          <small class="form-help-text">Envie apenas PDF, PNG ou JPG da sua delegação.</small>
        </div>
        <button type="submit" id="dpoSubmitBtn" class="view-button view-button-primary">Enviar DPO</button>
      </form>
      <p class="dpo-note">O arquivo ficará vinculado ao país ${escapeHtml(user.country)} do comitê ${escapeHtml(committeeLabel(committee))}.</p>
    ` : `
      <div class="dpo-empty">
        ${!user
          ? 'Faça login para enviar o DPO da sua delegação.'
          : user.role !== 'candidate'
            ? 'Somente delegados podem enviar DPOs.'
            : !user.committee || !user.country
              ? 'Seu acesso ainda não está completo. É necessário ter comitê e país definidos.'
              : !state.publicStatus?.publicDelegationsReleased
                ? 'Os países ainda não foram liberados publicamente.'
                : !state.publicStatus?.dpoSubmissionsReleased
                  ? 'O envio de DPO ainda não foi liberado.'
                  : 'Seu comitê atual não corresponde ao comitê exibido.'}
      </div>
    `;

    return `
      <section class="dpo-panel">
        <div class="dpo-panel-heading">
          <div>
            <span class="dpo-kicker">Sua delegação</span>
            <h2>${user?.fullName || user?.username ? `Olá, ${escapeHtml(user.fullName || user.username)}` : 'Área de envio'}</h2>
            <p>${ready ? 'Envie o DPO da sua própria delegação usando o arquivo aprovado.' : 'Aqui você verá o envio habilitado quando seu acesso estiver completo.'}</p>
          </div>
          <div class="dpo-status-chip ${ready ? 'is-ready' : ''}">${ready ? 'Pronto para enviar' : 'Aguardando acesso'}</div>
        </div>
        <div class="dpo-delegation-card">
          <div class="dpo-delegation-top">
            <div class="dpo-delegation-index">${user?.committee || '-'}</div>
            <div>
              <div class="dpo-delegation-id">Delegação vinculada</div>
              <div class="dpo-member-list">
                <span class="dpo-member-pill">${escapeHtml(committeeLabel(committee))}</span>
                <span class="dpo-member-pill">${escapeHtml(user?.country || 'País não definido')}</span>
              </div>
            </div>
            <div class="dpo-country-preview">
              ${user?.country ? `<img src="${escapeHtml(getFlagUrl(user.country))}" alt="${escapeHtml(user.country)}" onerror="this.style.display='none'">` : '<div class="dpo-fallback-flag"></div>'}
              <div>
                <strong>${escapeHtml(user?.country || 'País não definido')}</strong>
                <span>${escapeHtml(user?.committee ? `Comitê ${user.committee}` : 'Comitê não definido')}</span>
              </div>
            </div>
          </div>
          ${currentUploadCard}
        </div>
      </section>
    `;
  }

  function renderHero() {
    return `
      <section class="dpo-hero">
        <div>
          <span class="dpo-kicker">DPOs</span>
          <h1>Envio oficial da delegação</h1>
          <p>O documento de posicionamento oficial pode ser enviado em PDF, PNG ou JPG pela delegação autorizada.</p>
        </div>
        <div class="dpo-badge">Documento oficial</div>
      </section>
    `;
  }

  function renderPage() {
    injectStyles();
    root.innerHTML = `
      <div class="dpo-app">
        ${renderHero()}
        ${renderUploadPanel()}
        <section class="dpo-panel">
          <div class="dpo-panel-heading">
            <div>
              <span class="dpo-kicker">Comitês</span>
              <h2>Selecione um comitê para acompanhar os envios</h2>
              <p>Ao clicar em um cartão, a lista de DPOs daquele comitê aparece abaixo.</p>
            </div>
          </div>
          <div class="dpo-committee-grid">
            ${renderCommitteeHub()}
          </div>
        </section>
        <section class="dpo-panel">
          <div class="dpo-panel-heading">
            <div>
              <span class="dpo-kicker">Envios</span>
              <h2>${state.activeCommitteeId ? `Comitê ${state.activeCommitteeId}` : 'Envios registrados'}</h2>
              <p id="dpoMessage">${escapeHtml(state.message)}</p>
            </div>
          </div>
          <div class="dpo-submission-grid">
            ${renderSubmissionList()}
          </div>
        </section>
      </div>
    `;
    bindUploadForm();
  }

  function bindUploadForm() {
    const form = document.getElementById('dpoUploadForm');
    const fileInput = document.getElementById('dpoFile');
    if (!form || !fileInput) return;

    fileInput.addEventListener('change', () => {
      state.file = fileInput.files?.[0] || null;
      setMessage(state.file ? `Arquivo selecionado: ${state.file.name}` : state.message);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const file = fileInput.files?.[0];
      if (!file) {
        setMessage('Selecione um arquivo antes de enviar.', 'error');
        return;
      }

      if (!['application/pdf', 'image/png', 'image/jpeg'].includes(file.type)) {
        setMessage('Envie apenas PDF, PNG ou JPG.', 'error');
        return;
      }

      setLoading(true);
      setMessage('Enviando DPO...', 'info');

      try {
        const formData = new FormData();
        formData.append('file', file);

        const { response, data } = await apiJson(`/api/dpos/committee/${state.user.committee}`, {
          method: 'POST',
          body: formData,
          headers: {}
        });

        if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o DPO.');
        setMessage(data.message || 'DPO enviado com sucesso.', 'success');
        form.reset();
        state.file = null;
        state.submissions = await fetchSubmissions(state.activeCommitteeId || state.user.committee);
        renderPage();
      } catch (error) {
        setMessage(error.message || 'Erro ao enviar o DPO.', 'error');
      } finally {
        setLoading(false);
      }
    });
  }

  function injectStyles() {
    if (document.getElementById('dpo-public-v2-style')) return;
    const style = document.createElement('style');
    style.id = 'dpo-public-v2-style';
    style.textContent = `
      .dpo-app { display:grid; gap:1.25rem; padding-bottom:2rem; }
      .dpo-hero {
        display:grid; gap:1rem; grid-template-columns:1.3fr auto; align-items:start;
        padding:1.5rem; border-radius:24px;
        background:linear-gradient(135deg, rgba(8, 25, 39, 0.98), rgba(18, 67, 92, 0.92));
        color:#f5fbff; box-shadow:0 24px 70px rgba(6,15,24,0.22);
      }
      .dpo-hero h1 { margin:0.45rem 0 0.55rem; font-size:clamp(2rem,3.5vw,3.6rem); line-height:1.02; }
      .dpo-hero p { margin:0; max-width:68ch; color:rgba(240,248,255,0.82); }
      .dpo-kicker { display:inline-flex; align-items:center; gap:0.45rem; font-size:0.78rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase; color:rgba(255,255,255,0.7); }
      .dpo-badge { display:inline-flex; align-items:center; justify-content:center; min-width:96px; padding:0.9rem 1.2rem; border-radius:18px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14); font-weight:900; letter-spacing:0.05em; }
      .dpo-panel {
        padding:1.25rem; border-radius:22px; background:rgba(255,255,255,0.94);
        border:1px solid rgba(63,87,96,0.09); box-shadow:0 18px 60px rgba(17,28,36,0.08);
      }
      .dpo-panel-heading { display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; }
      .dpo-panel-heading h2 { margin:0.15rem 0 0; font-size:1.35rem; }
      .dpo-panel-heading p { margin:0.25rem 0 0; color:var(--dash-muted, #63707c); }
      .dpo-status-chip {
        display:inline-flex; align-items:center; justify-content:center; padding:0.65rem 0.9rem; border-radius:999px;
        background:rgba(209,73,91,0.08); color:#a53746; font-weight:800; white-space:nowrap;
      }
      .dpo-status-chip.is-ready { background:rgba(34,197,94,0.1); color:#18713d; }
      .dpo-delegation-card {
        display:grid; gap:1rem; padding:1rem; border-radius:22px;
        background:radial-gradient(circle at top right, rgba(74,159,212,0.08), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,250,253,0.96));
        border:1px solid rgba(63,87,96,0.1); box-shadow:0 14px 38px rgba(18,31,44,0.06);
      }
      .dpo-delegation-top {
        display:grid; gap:1rem; grid-template-columns:96px minmax(0,1fr) minmax(240px,320px); align-items:start;
      }
      .dpo-delegation-index {
        width:84px; height:84px; border-radius:24px; display:flex; align-items:center; justify-content:center;
        background:linear-gradient(135deg, rgba(15,58,82,0.98), rgba(28,95,124,0.92)); color:#fff; font-size:1.6rem; font-weight:900;
      }
      .dpo-delegation-id { font-size:0.82rem; font-weight:800; color:var(--dash-muted, #63707c); letter-spacing:0.05em; text-transform:uppercase; }
      .dpo-member-list { display:flex; flex-wrap:wrap; gap:0.45rem; margin-top:0.65rem; }
      .dpo-member-pill {
        padding:0.35rem 0.55rem; border-radius:999px; background:rgba(74,159,212,0.08); border:1px solid rgba(74,159,212,0.18);
        font-size:0.85rem; font-weight:700;
      }
      .dpo-country-preview {
        display:flex; align-items:center; gap:0.75rem; padding:0.8rem 0.85rem; border-radius:18px;
        border:1px solid rgba(63,87,96,0.1); background:rgba(255,255,255,0.78);
      }
      .dpo-country-preview img { width:54px; height:34px; object-fit:cover; border-radius:8px; border:1px solid rgba(0,0,0,0.08); }
      .dpo-country-preview strong { display:block; font-size:1rem; }
      .dpo-country-preview span { display:block; color:var(--dash-muted, #63707c); font-size:0.83rem; }
      .dpo-upload-form { display:grid; gap:0.85rem; }
      .dpo-note { margin:0; padding:0.85rem 1rem; border-radius:16px; background:rgba(15,58,82,0.06); border:1px solid rgba(15,58,82,0.12); color:var(--dash-ink, #102131); font-weight:600; }
      .dpo-committee-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; }
      .dpo-committee-card {
        position:relative; aspect-ratio:1 / 1; border-radius:24px; border:1px solid rgba(24,69,94,0.12);
        background: radial-gradient(circle at top left, rgba(74,159,212,0.18), transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,251,0.95));
        padding:1rem; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; text-align:left;
        transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
      }
      .dpo-committee-card:hover { transform:translateY(-3px); border-color:rgba(74,159,212,0.35); box-shadow:0 18px 35px rgba(17,28,36,0.14); }
      .dpo-committee-card.is-active { border-color:rgba(34,197,94,0.22); box-shadow:0 18px 35px rgba(34,197,94,0.08); }
      .dpo-committee-id {
        display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:16px;
        background:rgba(74,159,212,0.12); color:#164b63; font-weight:900; font-size:1.2rem;
      }
      .dpo-committee-card h3 { margin:0.8rem 0 0.45rem; font-size:1.05rem; line-height:1.18; color:var(--dash-ink, #102131); }
      .dpo-committee-card p { margin:0; color:var(--dash-muted, #64717f); font-size:0.93rem; }
      .dpo-committee-arrow { display:inline-flex; align-items:center; justify-content:space-between; margin-top:1rem; color:#114056; font-weight:800; }
      .dpo-submission-grid { display:grid; gap:0.85rem; }
      .dpo-submission-card {
        padding:1rem; border-radius:20px; border:1px solid rgba(63,87,96,0.1);
        background:linear-gradient(180deg, rgba(255,255,255,0.96), rgba(246,250,253,0.96));
      }
      .dpo-submission-head { display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap; }
      .dpo-submission-country { display:flex; align-items:center; gap:0.8rem; }
      .dpo-submission-country img { width:52px; height:34px; object-fit:cover; border-radius:8px; border:1px solid rgba(0,0,0,0.08); }
      .dpo-submission-country strong { display:block; }
      .dpo-submission-country span { color:var(--dash-muted, #63707c); font-size:0.85rem; }
      .dpo-submission-meta { display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-top:0.75rem; color:var(--dash-muted, #63707c); font-size:0.88rem; }
      .dpo-empty {
        padding:1.2rem; border-radius:18px; border:1px dashed rgba(63,87,96,0.18); color:var(--dash-muted, #63707c); background:rgba(255,255,255,0.6);
      }
      .dpo-fallback-flag { width:54px; height:34px; border-radius:8px; background:rgba(0,0,0,0.05); border:1px dashed rgba(0,0,0,0.16); }

      [data-theme="dark"] .dpo-hero {
        background: radial-gradient(circle at top left, rgba(64,132,174,0.3), transparent 34%), linear-gradient(145deg, rgba(7,16,26,0.98), rgba(11,26,40,0.96));
        box-shadow:0 28px 80px rgba(0,0,0,0.42); border:1px solid rgba(120,171,204,0.12);
      }
      [data-theme="dark"] .dpo-panel {
        background: radial-gradient(circle at top right, rgba(74,159,212,0.09), transparent 34%), linear-gradient(180deg, rgba(13,21,30,0.96), rgba(9,15,23,0.94));
        border-color:rgba(115,152,179,0.14); box-shadow:0 24px 70px rgba(0,0,0,0.34);
      }
      [data-theme="dark"] .dpo-delegation-card, [data-theme="dark"] .dpo-submission-card, [data-theme="dark"] .dpo-committee-card {
        background: radial-gradient(circle at top left, rgba(74,159,212,0.12), transparent 34%), linear-gradient(180deg, rgba(17,25,34,0.96), rgba(12,18,27,0.98));
        border-color:rgba(124,166,196,0.14); box-shadow:0 18px 44px rgba(0,0,0,0.28); color:#eef6ff;
      }
      [data-theme="dark"] .dpo-committee-card h3, [data-theme="dark"] .dpo-panel-heading h2, [data-theme="dark"] .dpo-country-preview strong, [data-theme="dark"] .dpo-submission-country strong {
        color:#f3f8ff;
      }
      [data-theme="dark"] .dpo-committee-card p, [data-theme="dark"] .dpo-panel-heading p, [data-theme="dark"] .dpo-country-preview span, [data-theme="dark"] .dpo-submission-country span, [data-theme="dark"] .dpo-submission-meta {
        color:rgba(217,228,236,0.72);
      }
      [data-theme="dark"] .dpo-empty, [data-theme="dark"] .dpo-country-preview, [data-theme="dark"] .dpo-note {
        background:rgba(12,18,27,0.9); border-color:rgba(124,166,196,0.16); color:#eef6ff;
      }
      [data-theme="dark"] .dpo-status-chip { background:rgba(92,31,39,0.35); color:#ffd5dd; }
      [data-theme="dark"] .dpo-status-chip.is-ready { background:rgba(14,68,41,0.42); color:#dff8e8; }
      [data-theme="dark"] .dpo-committee-id { background:rgba(74,159,212,0.18); color:#daf1ff; }
      [data-theme="dark"] .dpo-committee-card:hover { border-color:rgba(121,185,224,0.35); box-shadow:0 22px 50px rgba(0,0,0,0.34); }

      @media (max-width: 920px) {
        .dpo-hero, .dpo-delegation-top { grid-template-columns:1fr; }
        .dpo-committee-card { aspect-ratio:auto; min-height:220px; }
      }
    `;
    document.head.appendChild(style);
  }

  function render() {
    injectStyles();
    root.innerHTML = `
      <div class="dpo-app">
        ${renderHero()}
        ${renderUploadPanel()}
        <section class="dpo-panel">
          <div class="dpo-panel-heading">
            <div>
              <span class="dpo-kicker">Comitês públicos</span>
              <h2>Selecione um comitê para acompanhar os envios</h2>
              <p>Você também pode navegar entre os comitês para ver os arquivos já enviados.</p>
            </div>
          </div>
          <div class="dpo-committee-grid">${renderCommitteeHub()}</div>
        </section>
        <section class="dpo-panel">
          <div class="dpo-panel-heading">
            <div>
              <span class="dpo-kicker">Envios</span>
              <h2>${state.activeCommitteeId ? `Comitê ${state.activeCommitteeId}` : 'Envios registrados'}</h2>
              <p id="dpoMessage">${escapeHtml(state.message)}</p>
            </div>
          </div>
          <div class="dpo-submission-grid">${renderSubmissionList()}</div>
        </section>
      </div>
    `;
    bindEvents();
  }

  function renderHero() {
    return `
      <section class="dpo-hero">
        <div>
          <span class="dpo-kicker">DPOs</span>
          <h1>Documento de posicionamento oficial</h1>
          <p>Quando o acesso da sua delegação estiver liberado, você poderá enviar PDF, PNG ou JPG diretamente nesta página.</p>
        </div>
        <div class="dpo-badge">Envio oficial</div>
      </section>
    `;
  }

  function renderSubmissionList() {
    if (!state.activeCommitteeId) {
      return '<div class="dpo-empty">Selecione um comitê para ver os envios.</div>';
    }

    if (!state.submissions.length) {
      return '<div class="dpo-empty">Ainda não há DPOs enviados para este comitê.</div>';
    }

    return state.submissions.map((submission) => {
      const flagUrl = getFlagUrl(submission.country);
      return `
        <article class="dpo-submission-card">
          <div class="dpo-submission-head">
            <div class="dpo-submission-country">
              ${flagUrl ? `<img src="${escapeHtml(flagUrl)}" alt="${escapeHtml(submission.country)}" onerror="this.style.display='none'">` : '<div class="dpo-fallback-flag"></div>'}
              <div>
                <strong>${escapeHtml(submission.country || 'Sem país')}</strong>
                <span>${escapeHtml(new Date(submission.updatedAt).toLocaleDateString('pt-BR'))}</span>
              </div>
            </div>
            <a href="${escapeHtml(submission.fileUrl)}" target="_blank" rel="noopener noreferrer" class="view-button">Abrir arquivo</a>
          </div>
          <div class="dpo-submission-meta">
            <span>${escapeHtml(submission.fileName || 'Arquivo enviado')}</span>
            <span>${escapeHtml(submission.mimeType || '')}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderCommitteeHub() {
    return state.committees.map((committee) => {
      const active = Number(state.activeCommitteeId) === Number(committee.id);
      return `
        <button type="button" class="dpo-committee-card ${active ? 'is-active' : ''}" data-action="select-committee" data-committee-id="${committee.id}">
          <div class="dpo-committee-id">${committee.id}</div>
          <div>
            <h3>${escapeHtml(committeeLabel(committee))}</h3>
            <p>${state.publicStatus?.publicDelegationsReleased ? 'Abrir envios e acompanhar os arquivos do comitê.' : 'A navegação pública ficará visível após a liberação.'}</p>
          </div>
          <div class="dpo-committee-arrow">
            <span>${active ? 'Selecionado' : 'Abrir'}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14"></path>
              <path d="M13 5l7 7-7 7"></path>
            </svg>
          </div>
        </button>
      `;
    }).join('');
  }

  function renderUploadPanel() {
    const user = state.user || {};
    const committee = state.committees.find((item) => Number(item.id) === Number(user.committee));
    const ready = canSubmit();

    return `
      <section class="dpo-panel">
        <div class="dpo-panel-heading">
          <div>
            <span class="dpo-kicker">Sua delegação</span>
            <h2>${user?.fullName || user?.username ? `Olá, ${escapeHtml(user.fullName || user.username)}` : 'Área de envio'}</h2>
            <p>${ready ? 'Seu acesso está pronto para enviar o DPO da delegação.' : 'O formulário será liberado quando seu acesso estiver completo.'}</p>
          </div>
          <div class="dpo-status-chip ${ready ? 'is-ready' : ''}">${ready ? 'Pronto para envio' : 'Aguardando acesso'}</div>
        </div>

        <div class="dpo-delegation-card">
          <div class="dpo-delegation-top">
            <div class="dpo-delegation-index">${user?.committee || '-'}</div>
            <div>
              <div class="dpo-delegation-id">Delegação vinculada</div>
              <div class="dpo-member-list">
                <span class="dpo-member-pill">${escapeHtml(committeeLabel(committee))}</span>
                <span class="dpo-member-pill">${escapeHtml(user?.country || 'País não definido')}</span>
              </div>
            </div>
            <div class="dpo-country-preview">
              ${user?.country ? `<img src="${escapeHtml(getFlagUrl(user.country))}" alt="${escapeHtml(user.country)}" onerror="this.style.display='none'">` : '<div class="dpo-fallback-flag"></div>'}
              <div>
                <strong>${escapeHtml(user?.country || 'País não definido')}</strong>
                <span>${escapeHtml(user?.committee ? `Comitê ${user.committee}` : 'Comitê não definido')}</span>
              </div>
            </div>
          </div>

          ${
            ready ? `
              <form id="dpoUploadForm" class="dpo-upload-form">
                <div class="form-group">
                  <label for="dpoFile">Arquivo do DPO</label>
                  <input type="file" id="dpoFile" accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg" required>
                  <small class="form-help-text">Envie apenas PDF, PNG ou JPG.</small>
                </div>
                <button type="submit" id="dpoSubmitBtn" class="view-button view-button-primary">Enviar DPO</button>
              </form>
              <p class="dpo-note">O envio ficará vinculado ao país ${escapeHtml(user.country)} da sua delegação.</p>
            `
              : `
                <div class="dpo-empty">
                  ${!user
                    ? 'Faça login para enviar o DPO da sua delegação.'
                    : user.role !== 'candidate'
                      ? 'Somente delegados podem enviar DPOs.'
                      : !user.committee || !user.country
                        ? 'Seu acesso ainda não está completo.'
                        : !state.publicStatus?.publicDelegationsReleased
                          ? 'Os países ainda não foram liberados publicamente.'
                          : !state.publicStatus?.dpoSubmissionsReleased
                            ? 'O envio de DPO ainda não foi liberado.'
                            : 'Seu comitê atual não corresponde ao comitê exibido.'}
                </div>
              `
          }
        </div>
      </section>
    `;
  }

  function bindEvents() {
    root.querySelectorAll('[data-action="select-committee"]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.activeCommitteeId = Number(button.dataset.committeeId);
        state.submissions = await fetchSubmissions(state.activeCommitteeId);
        render();
      });
    });
  }

  async function init() {
    await resolveUser();
    state.publicStatus = await fetchPublicStatus();
    state.committees = await fetchCommittees();
    state.activeCommitteeId = state.user?.role === 'candidate' && state.user.committee ? Number(state.user.committee) : 1;
    state.submissions = await fetchSubmissions(state.activeCommitteeId);
    state.message = state.submissions.length
      ? `Mostrando ${state.submissions.length} arquivo(s) do comitê selecionado.`
      : 'Nenhum DPO registrado ainda.';
    render();

    if (!state.user) {
      setMessage('Faça login para enviar o DPO da sua delegação.', 'info');
    } else if (canSubmit()) {
      setMessage(`Seu envio ficará vinculado à delegação do país ${state.user.country}.`, 'success');
    } else {
      setMessage('O envio será liberado quando o acesso da delegação estiver completo.', 'info');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
