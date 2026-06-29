(function () {
  'use strict';

  const COMMITTEES = [
    { id: 1, label: 'CDH 2026 - O Paradoxo da Hiperconectividade' },
    { id: 2, label: 'AGNU - Guerra, Multipolaridade e Disputas Territoriais' },
    { id: 3, label: 'ACNUR - Mobilidade humana e crises humanitárias' },
    { id: 4, label: 'Bioética e Genética Humana' },
    { id: 5, label: 'Nova Ordem Global - Recursos Estratégicos e Capitalismo' },
    { id: 6, label: 'UNHRC - Identidade, memória e poder' },
    { id: 7, label: 'ONU Mulheres (CSW/2026) - Violência contra Mulheres' }
  ];

  const SEGMENTS = [
    { id: '8e9', label: '8º e 9º' },
    { id: 'em', label: 'EM' }
  ];

  const state = {
    view: 'committees',
    committeeId: null,
    committeeLabel: '',
    segment: '8e9',
    delegations: [],
    countryCatalog: [],
    originalCountries: {},
    dirtyCountries: {},
    searchTerms: {},
    loading: false,
    message: {
      text: 'Escolha um comitê para começar.',
      type: 'info'
    }
  };

  const root = document.getElementById('main-content') || document.body;

  let flagsCatalogPromise = null;

  function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
  }

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

  function delegationKey(delegation) {
    return String(delegation._id || '');
  }

  function attrValue(value) {
    return String(value || '').replace(/"/g, '\\"');
  }

  function committeeById(id) {
    return COMMITTEES.find((committee) => committee.id === Number(id)) || null;
  }

  function segmentLabel(id) {
    return SEGMENTS.find((segment) => segment.id === id)?.label || id;
  }

  function getFlagLabelFromFile(fileName) {
    const stem = String(fileName || '').replace(/\.[^.]+$/, '');
    return stem
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .map((word) => {
        const lower = word.toLowerCase();
        const smallWords = ['de', 'da', 'do', 'dos', 'das', 'e', 'em'];
        if (smallWords.includes(lower)) return lower;
        return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
      })
      .join(' ');
  }

  function flagSearchKey(option) {
    return normalizeText([option.label, option.fileName].filter(Boolean).join(' '));
  }

  function pickFlagForLabel(label) {
    const normalized = normalizeText(label);
    if (!normalized) return null;

    return state.countryCatalog.find((item) => {
      const fileStem = String(item.fileName || '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const candidates = normalizeText([item.label, fileStem, item.fileName].join(' '));
      return candidates === normalized || candidates.includes(normalized) || normalized.includes(candidates);
    }) || null;
  }

  function scoreFlagMatch(option, query) {
    if (!query) return 0;
    const key = flagSearchKey(option);
    if (key === query) return 100;
    if (key.startsWith(query)) return 80;
    if (key.includes(query)) return 50;
    return -1;
  }

  function getMatches(query) {
    const normalized = normalizeText(query);
    const source = state.countryCatalog.slice();

    if (!normalized) {
      return source.slice(0, 8);
    }

    return source
      .map((option) => ({ option, score: scoreFlagMatch(option, normalized) }))
      .filter((item) => item.score >= 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.option.label.localeCompare(b.option.label, 'pt-BR');
      })
      .map((item) => item.option)
      .slice(0, 12);
  }

  function setMessage(text, type = 'info') {
    state.message = { text, type };
    const notice = document.querySelector('[data-gp-notice]');
    if (notice) {
      notice.textContent = text;
      notice.dataset.type = type;
    }
  }

  function setLoading(loading) {
    state.loading = loading;
    const btn = document.querySelector('[data-action="load-delegations"]');
    if (btn) {
      btn.disabled = loading || !state.committeeId;
      btn.textContent = loading ? 'Carregando...' : 'Carregar delegações';
    }
  }

  async function checkAdminAccess() {
    const token = getToken();
    if (!token) {
      window.location.href = '/login';
      return false;
    }

    try {
      const res = await fetch('/api/check-admin', {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || (data?.isAdmin !== true && data?.role !== 'admin')) {
        window.location.href = '/';
        return false;
      }

      return true;
    } catch (_) {
      window.location.href = '/';
      return false;
    }
  }

  async function fetchFlagsCatalog() {
    if (!flagsCatalogPromise) {
      flagsCatalogPromise = fetch('/api/flags-catalog')
        .then((res) => res.json())
        .then((data) => Array.isArray(data.flags) ? data.flags : [])
        .catch(() => []);
    }

    return flagsCatalogPromise;
  }

  async function fetchDelegationsForAdmin(committeeId, segment) {
    const token = getToken();
    const res = await fetch(`/api/delegation/admin/committee/${committeeId}?segment=${encodeURIComponent(segment)}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data.error || 'Erro ao carregar delegações.');
    }

    return data;
  }

  async function saveCountryForDelegation(delegationId, country) {
    const token = getToken();
    const res = await fetch(`/api/delegation/admin/${encodeURIComponent(delegationId)}/country`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ country })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Não foi possível salvar o país da delegação.');
    }

    return data;
  }

  function buildStylesOnce() {
    if (document.getElementById('gp-styles')) return;

    const style = document.createElement('style');
    style.id = 'gp-styles';
    style.textContent = `
      .gp-app {
        display: grid;
        gap: 1.25rem;
        padding-bottom: 2rem;
      }

      .gp-hero {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1.3fr auto;
        align-items: start;
        padding: 1.5rem;
        border-radius: 24px;
        background: linear-gradient(135deg, rgba(10, 31, 48, 0.98), rgba(24, 69, 94, 0.92));
        color: #f5fbff;
        box-shadow: 0 24px 70px rgba(6, 15, 24, 0.22);
      }

      .gp-hero h1 {
        margin: 0.45rem 0 0.55rem;
        font-size: clamp(2rem, 3.5vw, 3.6rem);
        line-height: 1.02;
      }

      .gp-hero p {
        margin: 0;
        max-width: 62ch;
        color: rgba(240, 248, 255, 0.82);
      }

      .gp-kicker {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(255, 255, 255, 0.7);
      }

      .gp-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 96px;
        padding: 0.9rem 1.2rem;
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.14);
        font-weight: 900;
        letter-spacing: 0.05em;
      }

      .gp-panel {
        padding: 1.25rem;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(63, 87, 96, 0.09);
        box-shadow: 0 18px 60px rgba(17, 28, 36, 0.08);
      }

      [data-theme="dark"] .gp-hero {
        background:
          radial-gradient(circle at top left, rgba(64, 132, 174, 0.32), transparent 34%),
          linear-gradient(145deg, rgba(7, 16, 26, 0.98), rgba(11, 26, 40, 0.96));
        box-shadow: 0 28px 80px rgba(0, 0, 0, 0.42);
        border: 1px solid rgba(120, 171, 204, 0.12);
      }

      [data-theme="dark"] .gp-panel {
        background:
          radial-gradient(circle at top right, rgba(74, 159, 212, 0.09), transparent 34%),
          linear-gradient(180deg, rgba(13, 21, 30, 0.96), rgba(9, 15, 23, 0.94));
        border-color: rgba(115, 152, 179, 0.14);
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.34);
      }

      [data-theme="dark"] .gp-committee-card,
      [data-theme="dark"] .gp-delegation-card {
        background:
          radial-gradient(circle at top left, rgba(74, 159, 212, 0.12), transparent 34%),
          linear-gradient(180deg, rgba(17, 25, 34, 0.96), rgba(12, 18, 27, 0.98));
        border-color: rgba(124, 166, 196, 0.14);
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
      }

      [data-theme="dark"] .gp-committee-card:hover,
      [data-theme="dark"] .gp-delegation-card:hover {
        border-color: rgba(121, 185, 224, 0.35);
        box-shadow: 0 22px 50px rgba(0, 0, 0, 0.34);
      }

      [data-theme="dark"] .gp-committee-card h3,
      [data-theme="dark"] .gp-section-title h2,
      [data-theme="dark"] .gp-country-preview strong,
      [data-theme="dark"] .gp-delegation-id,
      [data-theme="dark"] .gp-stat strong {
        color: #f3f8ff;
      }

      [data-theme="dark"] .gp-committee-card p,
      [data-theme="dark"] .gp-section-title p,
      [data-theme="dark"] .gp-country-preview span,
      [data-theme="dark"] .gp-stat span,
      [data-theme="dark"] .gp-committee-mini span,
      [data-theme="dark"] .gp-delegation-id {
        color: rgba(217, 228, 236, 0.72);
      }

      [data-theme="dark"] .gp-segment-btn,
      [data-theme="dark"] .gp-search-area input,
      [data-theme="dark"] .gp-country-preview,
      [data-theme="dark"] .gp-stat,
      [data-theme="dark"] .gp-result {
        background: rgba(12, 18, 27, 0.9);
        border-color: rgba(124, 166, 196, 0.16);
        color: #eef6ff;
      }

      [data-theme="dark"] .gp-search-area input::placeholder {
        color: rgba(217, 228, 236, 0.48);
      }

      [data-theme="dark"] .gp-empty,
      [data-theme="dark"] .gp-notice {
        background: rgba(18, 27, 38, 0.94);
        border-color: rgba(124, 166, 196, 0.16);
        color: #eaf2fb;
      }

      [data-theme="dark"] .gp-notice[data-type="error"] {
        background: rgba(92, 31, 39, 0.35);
        border-color: rgba(209, 73, 91, 0.3);
        color: #ffd5dd;
      }

      [data-theme="dark"] .gp-notice[data-type="success"] {
        background: rgba(14, 68, 41, 0.42);
        border-color: rgba(45, 170, 95, 0.26);
        color: #dff8e8;
      }

      [data-theme="dark"] .gp-committee-id {
        background: rgba(74, 159, 212, 0.18);
        color: #daf1ff;
      }

      [data-theme="dark"] .gp-result small,
      [data-theme="dark"] .gp-result span {
        color: rgba(217, 228, 236, 0.72);
      }

      .gp-section-title {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        margin-bottom: 1rem;
      }

      .gp-section-title h2 {
        margin: 0.15rem 0 0;
        font-size: 1.35rem;
      }

      .gp-section-title p {
        margin: 0.25rem 0 0;
        color: var(--dash-muted, #63707c);
      }

      .gp-committee-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
      }

      .gp-committee-card {
        position: relative;
        aspect-ratio: 1 / 1;
        border-radius: 24px;
        border: 1px solid rgba(24, 69, 94, 0.12);
        background:
          radial-gradient(circle at top left, rgba(74, 159, 212, 0.18), transparent 36%),
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(242, 247, 251, 0.95));
        padding: 1rem;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        cursor: pointer;
        text-align: left;
        transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
      }

      .gp-committee-card:hover {
        transform: translateY(-3px);
        border-color: rgba(74, 159, 212, 0.35);
        box-shadow: 0 18px 35px rgba(17, 28, 36, 0.14);
      }

      .gp-committee-id {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 52px;
        height: 52px;
        border-radius: 16px;
        background: rgba(74, 159, 212, 0.12);
        color: #164b63;
        font-weight: 900;
        font-size: 1.2rem;
      }

      .gp-committee-card h3 {
        margin: 0.8rem 0 0.45rem;
        font-size: 1.05rem;
        line-height: 1.18;
        color: var(--dash-ink, #102131);
      }

      .gp-committee-card p {
        margin: 0;
        color: var(--dash-muted, #64717f);
        font-size: 0.93rem;
      }

      .gp-committee-arrow {
        display: inline-flex;
        align-items: center;
        justify-content: space-between;
        margin-top: 1rem;
        color: #114056;
        font-weight: 800;
      }

      .gp-toolbar {
        display: grid;
        gap: 1rem;
        grid-template-columns: 1.1fr auto auto;
        align-items: end;
      }

      .gp-toolbar .form-group {
        margin: 0;
      }

      .gp-committeecard-mini {
        display: grid;
        gap: 0.3rem;
        align-self: stretch;
        padding: 1rem;
        border-radius: 20px;
        background: linear-gradient(180deg, rgba(9, 31, 48, 0.96), rgba(22, 69, 95, 0.94));
        color: #fff;
        min-width: 240px;
      }

      .gp-committeecard-mini strong {
        font-size: 1.1rem;
      }

      .gp-segment-toggle {
        display: inline-flex;
        gap: 0.55rem;
        flex-wrap: wrap;
      }

      .gp-segment-btn {
        border: 1px solid rgba(18, 64, 86, 0.16);
        background: rgba(255, 255, 255, 0.96);
        color: var(--dash-ink, #102131);
        border-radius: 999px;
        padding: 0.8rem 1rem;
        font-weight: 800;
        cursor: pointer;
      }

      .gp-segment-btn.is-active {
        background: linear-gradient(135deg, #0f3a52, #1f6b8e);
        color: #fff;
        border-color: transparent;
      }

      .gp-stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 1rem;
      }

      .gp-stat {
        padding: 1rem 1.1rem;
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(242, 247, 251, 0.96));
        border: 1px solid rgba(63, 87, 96, 0.08);
      }

      .gp-stat strong {
        display: block;
        font-size: 1.7rem;
        line-height: 1;
        color: var(--dash-ink, #102131);
      }

      .gp-stat span {
        color: var(--dash-muted, #63707c);
        font-size: 0.9rem;
      }

      .gp-notice {
        margin-top: 1rem;
        padding: 0.9rem 1rem;
        border-radius: 14px;
        background: rgba(15, 58, 82, 0.06);
        border: 1px solid rgba(15, 58, 82, 0.12);
        color: var(--dash-ink, #102131);
        font-weight: 600;
      }

      .gp-notice[data-type="error"] {
        background: rgba(209, 73, 91, 0.08);
        border-color: rgba(209, 73, 91, 0.18);
        color: #a53746;
      }

      .gp-notice[data-type="success"] {
        background: rgba(34, 197, 94, 0.1);
        border-color: rgba(34, 197, 94, 0.22);
        color: #18713d;
      }

      .gp-action-row {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        justify-content: space-between;
        margin-top: 1rem;
      }

      .gp-action-row .view-button,
      .gp-action-row .notification-btn {
        min-height: 48px;
      }

      .gp-delegation-grid {
        display: grid;
        gap: 1rem;
      }

      .gp-delegation-card {
        padding: 1rem;
        border-radius: 22px;
        border: 1px solid rgba(63, 87, 96, 0.1);
        background:
          radial-gradient(circle at top right, rgba(74, 159, 212, 0.08), transparent 34%),
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,250,253,0.96));
        box-shadow: 0 14px 38px rgba(18, 31, 44, 0.06);
      }

      .gp-delegation-top {
        display: grid;
        gap: 1rem;
        grid-template-columns: 96px minmax(0, 1fr) minmax(240px, 320px);
        align-items: start;
      }

      .gp-delegation-index {
        width: 84px;
        height: 84px;
        border-radius: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, rgba(15, 58, 82, 0.98), rgba(28, 95, 124, 0.92));
        color: #fff;
        font-size: 1.6rem;
        font-weight: 900;
      }

      .gp-delegation-id {
        font-size: 0.82rem;
        font-weight: 800;
        color: var(--dash-muted, #63707c);
        letter-spacing: 0.05em;
        text-transform: uppercase;
      }

      .gp-member-list {
        display: flex;
        flex-wrap: wrap;
        gap: 0.45rem;
        margin-top: 0.65rem;
      }

      .gp-member-pill {
        padding: 0.35rem 0.55rem;
        border-radius: 999px;
        background: rgba(74, 159, 212, 0.08);
        border: 1px solid rgba(74, 159, 212, 0.18);
        font-size: 0.85rem;
        font-weight: 700;
      }

      .gp-country-preview {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        justify-content: flex-start;
        padding: 0.8rem 0.85rem;
        border-radius: 18px;
        border: 1px solid rgba(63, 87, 96, 0.1);
        background: rgba(255,255,255,0.78);
      }

      .gp-country-preview img {
        width: 54px;
        height: 34px;
        object-fit: cover;
        border-radius: 8px;
        border: 1px solid rgba(0,0,0,0.08);
      }

      .gp-country-preview strong {
        display: block;
        font-size: 1rem;
      }

      .gp-country-preview span {
        display: block;
        color: var(--dash-muted, #63707c);
        font-size: 0.83rem;
      }

      .gp-search-area {
        margin-top: 1rem;
        display: grid;
        gap: 0.65rem;
      }

      .gp-search-area input {
        width: 100%;
        min-height: 48px;
        padding: 0.85rem 0.95rem;
        border-radius: 14px;
        border: 1.5px solid rgba(63, 87, 96, 0.18);
        background: rgba(255,255,255,0.96);
      }

      .gp-results {
        display: grid;
        gap: 0.55rem;
      }

      .gp-result {
        width: 100%;
        display: grid;
        grid-template-columns: 46px 1fr auto;
        gap: 0.8rem;
        align-items: center;
        padding: 0.7rem 0.8rem;
        border-radius: 16px;
        border: 1px solid rgba(63, 87, 96, 0.1);
        background: rgba(255,255,255,0.92);
        cursor: pointer;
        text-align: left;
      }

      .gp-result:hover {
        border-color: rgba(74, 159, 212, 0.35);
        box-shadow: 0 10px 24px rgba(17, 28, 36, 0.09);
      }

      .gp-result img {
        width: 46px;
        height: 30px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid rgba(0,0,0,0.08);
      }

      .gp-result strong {
        display: block;
        font-size: 0.96rem;
      }

      .gp-result small {
        display: block;
        color: var(--dash-muted, #63707c);
      }

      .gp-result span {
        padding: 0.38rem 0.7rem;
        border-radius: 999px;
        background: rgba(15, 58, 82, 0.08);
        color: #114056;
        font-size: 0.8rem;
        font-weight: 800;
      }

      .gp-empty {
        padding: 1.2rem;
        border-radius: 18px;
        border: 1px dashed rgba(63, 87, 96, 0.18);
        color: var(--dash-muted, #63707c);
        background: rgba(255,255,255,0.6);
      }

      .gp-backbar {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .gp-committee-mini {
        padding: 0.9rem 1rem;
        border-radius: 18px;
        background: rgba(15, 58, 82, 0.07);
        border: 1px solid rgba(15, 58, 82, 0.1);
      }

      .gp-committee-mini strong {
        display: block;
        font-size: 1rem;
      }

      .gp-committee-mini span {
        color: var(--dash-muted, #63707c);
        font-size: 0.86rem;
      }

      @media (max-width: 920px) {
        .gp-hero,
        .gp-toolbar,
        .gp-delegation-top {
          grid-template-columns: 1fr;
        }

        .gp-committee-card {
          aspect-ratio: auto;
          min-height: 220px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function renderBase(content) {
    root.innerHTML = `
      <div class="gp-app">
        ${content}
      </div>
    `;
  }

  function renderCommitteesView() {
    return `
      <section class="gp-hero">
        <div>
          <span class="gp-kicker">Administração</span>
          <h1>Gerenciar países por comitê</h1>
          <p>Escolha um comitê primeiro. Em seguida, selecione o segmento e ajuste a representação de cada delegação usando a busca com imagens.</p>
        </div>
        <div class="gp-badge">Admin</div>
      </section>

      <section class="gp-panel">
        <div class="gp-section-title">
          <div>
            <span class="gp-kicker">Comitês</span>
            <h2>Comece por um comitê</h2>
            <p>Os cards abaixo funcionam como atalhos grandes para começar a edição.</p>
          </div>
        </div>

        <div class="gp-committee-grid">
          ${COMMITTEES.map((committee) => `
            <button type="button" class="gp-committee-card" data-action="choose-committee" data-committee-id="${committee.id}">
              <div class="gp-committee-id">${committee.id}</div>
              <div>
                <h3>${escapeHtml(committee.label)}</h3>
                <p>Abra para escolher 8º/9º ou EM e carregar as delegações deste comitê.</p>
              </div>
              <div class="gp-committee-arrow">
                <span>Abrir</span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>
                </svg>
              </div>
            </button>
          `).join('')}
        </div>

        <div class="gp-notice" data-gp-notice data-type="${state.message.type}">${escapeHtml(state.message.text)}</div>
      </section>
    `;
  }

  function renderSegmentView() {
    const committee = committeeById(state.committeeId);

    return `
      <section class="gp-hero">
        <div>
          <span class="gp-kicker">Comitê selecionado</span>
          <h1>${escapeHtml(committee?.label || 'Comitê')}</h1>
          <p>Agora escolha o segmento da escola. Depois disso a página carrega as delegações e libera a busca de países, blocos e representações com imagem.</p>
        </div>
        <div class="gp-badge">${state.committeeId || '-'}</div>
      </section>

      <section class="gp-panel">
        <div class="gp-backbar">
          <button type="button" class="notification-btn notification-btn-secondary" data-action="back-to-committees">Voltar aos comitês</button>
          <div class="gp-committee-mini">
            <strong>${escapeHtml(committee?.label || '')}</strong>
            <span>Selecione 8º/9º ou EM para continuar</span>
          </div>
        </div>

        <div class="gp-section-title">
          <div>
            <span class="gp-kicker">Segmento</span>
            <h2>Escolha 8º/9º ou EM</h2>
            <p>Ao clicar em um dos botões, a busca já começa automaticamente.</p>
          </div>
        </div>

        <div class="gp-segment-toggle">
          ${SEGMENTS.map((segment) => `
            <button
              type="button"
              class="gp-segment-btn ${state.segment === segment.id ? 'is-active' : ''}"
              data-action="choose-segment"
              data-segment-id="${segment.id}"
            >${escapeHtml(segment.label)}</button>
          `).join('')}
        </div>

        <div class="gp-notice" data-gp-notice data-type="${state.message.type}">${escapeHtml(state.message.text)}</div>
      </section>
    `;
  }

  function renderDelegationCard(delegation, index) {
    const delegationId = delegationKey(delegation);
    const currentCountry = String(delegation.country || '').trim();
    const currentFlag = currentCountry ? pickFlagForLabel(currentCountry) : null;
    const query = state.searchTerms[delegationId] || '';
    const results = query ? getMatches(query) : [];

    return `
      <article class="gp-delegation-card" data-delegation-card data-delegation-id="${delegationId}">
        <div class="gp-delegation-top">
          <div class="gp-delegation-index">${index + 1}</div>

          <div>
            <div class="gp-delegation-id">Delegação #${escapeHtml(delegationId.slice(-6))}</div>
            <div class="gp-member-list">
              ${(delegation.members || []).map((member) => `
                <span class="gp-member-pill" title="${escapeHtml(member.fullName || member.username || '')}">
                  ${escapeHtml(member.fullName || member.username || '—')}
                </span>
              `).join('')}
            </div>
          </div>

          <div class="gp-country-preview" data-preview-area>
            ${currentFlag ? `<img src="${escapeHtml(currentFlag.url)}" alt="${escapeHtml(currentCountry)}">` : `<div style="width:54px;height:34px;border-radius:8px;background:rgba(0,0,0,0.04);border:1px dashed rgba(0,0,0,0.16);"></div>`}
            <div>
              <strong data-preview-label>${escapeHtml(currentCountry || 'Sem país definido')}</strong>
              <span>${currentCountry ? 'Clique no resultado para trocar' : 'Pesquise e selecione uma representação'}</span>
            </div>
          </div>
        </div>

        <div class="gp-search-area">
          <label>
            <strong>Pesquisar país, bloco ou representação</strong>
            <input
              type="search"
              data-action="country-search"
              data-delegation-id="${delegationId}"
              value="${escapeHtml(query)}"
              placeholder="Ex.: Brasil, União Europeia, Mercosul..."
              autocomplete="off"
            >
          </label>

          <div class="gp-results" data-results-for="${delegationId}">
            ${renderResultsMarkup(delegationId, results)}
          </div>
        </div>
      </article>
    `;
  }

  function renderResultsMarkup(delegationId, options) {
    if (!options.length) {
      return `<div class="gp-empty">Digite para buscar uma representação. As opções vêm dos arquivos de <code>paises/flags</code>.</div>`;
    }

    return options.map((option) => `
      <button
        type="button"
        class="gp-result"
        data-action="select-country"
        data-delegation-id="${delegationId}"
        data-country="${escapeHtml(option.label)}"
        title="${escapeHtml(option.fileName)}"
      >
        <img src="${escapeHtml(option.url)}" alt="${escapeHtml(option.label)}" onerror="this.style.display='none'">
        <div>
          <strong>${escapeHtml(option.label)}</strong>
          <small>${escapeHtml(option.fileName)}</small>
        </div>
        <span>Escolher</span>
      </button>
    `).join('');
  }

  function renderDelegationsView() {
    const committee = committeeById(state.committeeId);
    const statsTotal = state.delegations.length;
    const statsWithCountry = state.delegations.filter((delegation) => String(delegation.country || '').trim()).length;

    return `
      <section class="gp-hero">
        <div>
          <span class="gp-kicker">Edição ativa</span>
          <h1>${escapeHtml(committee?.label || 'Comitê')}</h1>
          <p>Você pode pesquisar qualquer representação da pasta de bandeiras e aplicar em cada delegação. Os resultados já mostram imagem e nome.</p>
        </div>
        <div class="gp-badge">${escapeHtml(segmentLabel(state.segment))}</div>
      </section>

      <section class="gp-panel">
        <div class="gp-backbar">
          <button type="button" class="notification-btn notification-btn-secondary" data-action="back-to-segment">Voltar ao segmento</button>
          <div class="gp-committee-mini">
            <strong>${escapeHtml(committee?.label || '')}</strong>
            <span>Segmento ${escapeHtml(segmentLabel(state.segment))}</span>
          </div>
        </div>

        <div class="gp-stats">
          <div class="gp-stat">
            <strong>${statsTotal}</strong>
            <span>Delegações</span>
          </div>
          <div class="gp-stat">
            <strong>${statsWithCountry}</strong>
            <span>Com representação definida</span>
          </div>
          <div class="gp-stat">
            <strong>${state.countryCatalog.length}</strong>
            <span>Opções na pasta de bandeiras</span>
          </div>
        </div>

        <div class="gp-notice" data-gp-notice data-type="${state.message.type}">${escapeHtml(state.message.text)}</div>

        <div class="gp-action-row">
          <button type="button" class="notification-btn notification-btn-secondary" data-action="reset-changes">Descartar alterações</button>
          <button type="button" class="notification-btn notification-btn-primary" data-action="save-changes">Salvar países</button>
        </div>
      </section>

      <section class="gp-panel">
        <div class="gp-section-title">
          <div>
            <span class="gp-kicker">Delegações</span>
            <h2>Busque e aplique a representação</h2>
            <p>A imagem aparece nos resultados e no cartão da delegação escolhida.</p>
          </div>
        </div>

        <div class="gp-delegation-grid">
          ${state.delegations.map((delegation, index) => renderDelegationCard(delegation, index)).join('')}
        </div>
      </section>
    `;
  }

  function render() {
    buildStylesOnce();

    if (state.view === 'committees') {
      renderBase(renderCommitteesView());
    } else if (state.view === 'segment') {
      renderBase(renderSegmentView());
    } else {
      renderBase(renderDelegationsView());
    }
  }

  function setCurrentCommittee(committeeId) {
    const committee = committeeById(committeeId);
    state.committeeId = committee?.id || null;
    state.committeeLabel = committee?.label || '';
    state.view = 'segment';
    state.delegations = [];
    state.originalCountries = {};
    state.dirtyCountries = {};
    state.searchTerms = {};
    setMessage('Escolha 8º/9º ou EM para carregar as delegações.', 'info');
    render();
  }

  async function loadDelegations() {
    if (!state.committeeId) return;

    setLoading(true);
    setMessage('Carregando delegações e catálogo de bandeiras...', 'info');

    try {
      const [catalog, data] = await Promise.all([
        fetchFlagsCatalog(),
        fetchDelegationsForAdmin(state.committeeId, state.segment)
      ]);

      state.countryCatalog = catalog.map((item) => ({
        fileName: item.fileName,
        label: item.label || getFlagLabelFromFile(item.fileName),
        url: item.url || `/paises/flags/${encodeURIComponent(item.fileName)}`
      })).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));

      state.delegations = Array.isArray(data.delegations) ? data.delegations : [];
      state.originalCountries = {};
      state.dirtyCountries = {};
      state.searchTerms = {};

      for (const delegation of state.delegations) {
        state.originalCountries[delegationKey(delegation)] = String(delegation.country || '').trim();
      }

      if (!state.delegations.length) {
        setMessage('Nenhuma delegação encontrada para esse comitê/segmento.', 'info');
      } else {
        setMessage('Digite para buscar a representação certa em cada delegação.', 'success');
      }

      state.view = 'delegations';
      render();
    } catch (error) {
      state.view = 'segment';
      setMessage(error.message || 'Não foi possível carregar as delegações.', 'error');
      render();
    } finally {
      setLoading(false);
    }
  }

  function updateCardPreview(card, label) {
    const previewLabel = card.querySelector('[data-preview-label]');
    const previewArea = card.querySelector('[data-preview-area]');
    const option = pickFlagForLabel(label);

    if (previewLabel) {
      previewLabel.textContent = label || 'Sem país definido';
    }

    if (!previewArea) return;

    const image = previewArea.querySelector('img');
    if (option) {
      if (image) {
        image.src = option.url;
        image.alt = option.label;
        image.style.display = '';
      } else {
        const img = document.createElement('img');
        img.src = option.url;
        img.alt = option.label;
        previewArea.prepend(img);
      }
    } else if (image) {
      image.remove();
    }
  }

  function refreshSearchResults(delegationId) {
    const selectorId = attrValue(delegationId);
    const input = root.querySelector(`[data-action="country-search"][data-delegation-id="${selectorId}"]`);
    const results = root.querySelector(`[data-results-for="${selectorId}"]`);
    if (!results || !input) return;

    const query = input.value || '';
    state.searchTerms[delegationId] = query;
    const matches = getMatches(query);
    results.innerHTML = renderResultsMarkup(delegationId, matches);
  }

  function syncAllVisibleCards() {
    state.delegations.forEach((delegation) => {
      const delegationId = delegationKey(delegation);
      refreshSearchResults(delegationId);
      const card = root.querySelector(`[data-delegation-card][data-delegation-id="${attrValue(delegationId)}"]`);
      if (card) {
        const country = state.dirtyCountries[delegationId] ?? state.originalCountries[delegationId] ?? '';
        updateCardPreview(card, country);
      }
    });
  }

  function resetChanges() {
    state.dirtyCountries = {};
    state.searchTerms = {};

    state.delegations.forEach((delegation) => {
      const delegationId = delegationKey(delegation);
      const selectorId = attrValue(delegationId);
      const card = root.querySelector(`[data-delegation-card][data-delegation-id="${selectorId}"]`);
      const input = root.querySelector(`[data-action="country-search"][data-delegation-id="${selectorId}"]`);

      if (input) {
        input.value = state.originalCountries[delegationId] || '';
      }
      if (card) {
        updateCardPreview(card, state.originalCountries[delegationId] || '');
      }
      refreshSearchResults(delegationId);
    });

    setMessage('Alterações descartadas.', 'info');
  }

  async function saveChanges() {
    const entries = Object.entries(state.dirtyCountries)
      .filter(([, value]) => value !== undefined)
      .map(([delegationId, country]) => ({ delegationId, country }));

    if (!entries.length) {
      setMessage('Nenhuma alteração para salvar.', 'info');
      return;
    }

    setLoading(true);
    setMessage('Salvando países...', 'info');

    try {
      for (const entry of entries) {
        await saveCountryForDelegation(entry.delegationId, entry.country || '');
      }

      await loadDelegations();
      setMessage('Países salvos com sucesso.', 'success');
    } catch (error) {
      setMessage(error.message || 'Não foi possível salvar.', 'error');
      if (window.MaxOnuNotify?.error) {
        window.MaxOnuNotify.error(error.message || 'Não foi possível salvar.');
      } else {
        alert(error.message || 'Não foi possível salvar.');
      }
    } finally {
      setLoading(false);
    }
  }

  function wireEvents() {
    root.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;

      const action = button.dataset.action;

      if (action === 'choose-committee') {
        const committeeId = Number(button.dataset.committeeId);
        setCurrentCommittee(committeeId);
        return;
      }

      if (action === 'back-to-committees') {
        state.view = 'committees';
        state.committeeId = null;
        state.committeeLabel = '';
        state.segment = '8e9';
        state.delegations = [];
        state.countryCatalog = [];
        state.originalCountries = {};
        state.dirtyCountries = {};
        state.searchTerms = {};
        setMessage('Escolha um comitê para começar.', 'info');
        render();
        return;
      }

      if (action === 'back-to-segment') {
        state.view = 'segment';
        state.delegations = [];
        state.originalCountries = {};
        state.dirtyCountries = {};
        state.searchTerms = {};
        setMessage('Escolha 8º/9º ou EM para carregar novamente.', 'info');
        render();
        return;
      }

      if (action === 'choose-segment') {
        state.segment = button.dataset.segmentId || '8e9';
        await loadDelegations();
        return;
      }

      if (action === 'select-country') {
        const delegationId = button.dataset.delegationId;
        const country = button.dataset.country || '';
        const selectorId = attrValue(delegationId);
        const card = root.querySelector(`[data-delegation-card][data-delegation-id="${selectorId}"]`);
        const original = state.originalCountries[delegationId] || '';

        if (country === original) {
          delete state.dirtyCountries[delegationId];
        } else {
          state.dirtyCountries[delegationId] = country;
        }
        state.searchTerms[delegationId] = country;

        if (card) {
          const input = card.querySelector('[data-action="country-search"]');
          if (input) input.value = country;
          updateCardPreview(card, country);
        }

        refreshSearchResults(delegationId);
        setMessage(`Selecionado: ${country}`, 'success');
        return;
      }

      if (action === 'reset-changes') {
        resetChanges();
        return;
      }

      if (action === 'save-changes') {
        await saveChanges();
      }
    });

    root.addEventListener('input', (event) => {
      const input = event.target.closest('[data-action="country-search"]');
      if (!input) return;

      const delegationId = input.dataset.delegationId;
      state.searchTerms[delegationId] = input.value;
      refreshSearchResults(delegationId);
    });
  }

  async function init() {
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) return;

    buildStylesOnce();
    wireEvents();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
