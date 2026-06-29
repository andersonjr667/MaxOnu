(function () {
  'use strict';

  const COMMITTEE_PLACEHOLDERS = Array.from({ length: 7 }, (_, index) => ({
    id: index + 1,
    displayName: `Comitê ${index + 1}`,
    shortTitle: `Comitê ${index + 1}`
  }));

  const SEGMENTS = [
    { id: '8e9', label: '8º e 9º' },
    { id: 'em', label: 'EM' }
  ];

  const state = {
    view: 'committees',
    committeeId: null,
    committeeLabel: '',
    segment: '8e9',
    revealStatus: { revealed: false, revealDate: null },
    committees: COMMITTEE_PLACEHOLDERS,
    delegations: [],
    flags: [],
    message: 'Escolha um comitê para visualizar as delegações.',
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

  function getFlagFileName(country) {
    const normalized = normalizeText(country);
    if (!normalized) return '';

    const directMap = {
      'africa do sul': 'Africa_do_Sul.png',
      alemanha: 'Alemanha.png',
      angola: 'Angola.png',
      argentina: 'Argentina.png',
      australia: 'Australia.png',
      austria: 'Austria.png',
      bolivia: 'Bolivia.png',
      brasil: 'Brasil.png',
      canada: 'Canada.png',
      chile: 'Chile.png',
      china: 'China.png',
      colombia: 'Colombia.png',
      'coreia do sul': 'Coreia_do_Sul.png',
      cuba: 'Cuba.png',
      espanha: 'Espanha.png',
      'estados unidos': 'Estados_Unidos.png',
      franca: 'Franca.png',
      grecia: 'Grecia.png',
      india: 'India.png',
      indonesia: 'Indonesia.png',
      ira: 'Ira.png',
      iraque: 'Iraque.png',
      irlanda: 'Irlanda.png',
      israel: 'Israel.png',
      italia: 'Italia.png',
      japao: 'Japao.png',
      libano: 'Libano.png',
      mexico: 'Mexico.png',
      nigeria: 'Nigeria.png',
      'nova zelandia': 'Nova_Zelandia.png',
      paises_baixos: 'Paises_Baixos.png',
      'reino unido': 'Reino_Unido.png',
      russia: 'Russia.png',
      singapura: 'Singapura.png',
      suecia: 'Suecia.png',
      suica: 'Suica.png',
      turquia: 'Turquia.png',
      uruguai: 'Uruguai.png',
      venezuela: 'Venezuela.png',
      vietna: 'Vietna.png',
      palestina: 'palestina.png'
    };

    if (directMap[normalized]) return directMap[normalized];

    const exact = state.flags.find((flag) => normalizeText(flag.label) === normalized || normalizeText(flag.fileName) === normalized);
    if (exact) return exact.fileName;

    const partial = state.flags.find((flag) => {
      const key = normalizeText(`${flag.label} ${flag.fileName}`);
      return key.includes(normalized) || normalized.includes(key);
    });

    return partial ? partial.fileName : '';
  }

  function getFlagUrl(country) {
    const fileName = getFlagFileName(country);
    return fileName ? `/paises/flags/${encodeURIComponent(fileName)}` : '';
  }

  async function fetchRevealStatus() {
    const response = await fetch('/api/reveal-status');
    return response.json().catch(() => ({ revealed: false }));
  }

  async function fetchCommitteeCatalog() {
    const response = await fetch('/api/committees');
    if (!response.ok) {
      return COMMITTEE_PLACEHOLDERS;
    }

    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.committees) && data.committees.length ? data.committees : COMMITTEE_PLACEHOLDERS;
  }

  async function fetchFlagsCatalog() {
    try {
      const response = await fetch('/api/flags-catalog');
      if (!response.ok) return [];
      const data = await response.json().catch(() => ({}));
      return Array.isArray(data.flags) ? data.flags : [];
    } catch (_) {
      return [];
    }
  }

  async function fetchDelegations() {
    const response = await fetch(`/api/delegation/public/committee/${state.committeeId}?segment=${encodeURIComponent(state.segment)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível carregar as delegações.');
    }
    return data;
  }

  function setMessage(text) {
    state.message = text;
    const message = document.getElementById('delegationsMessage');
    if (message) message.textContent = text;
  }

  function setLoading(loading) {
    state.loading = loading;
    const btn = document.querySelector('[data-action="load-delegations"]');
    if (btn) {
      btn.disabled = loading;
      btn.textContent = loading ? 'Carregando...' : 'Carregar delegações';
    }
  }

  function committeeLabel(committee) {
    return committee?.displayName || committee?.shortTitle || `Comitê ${committee?.id || ''}`;
  }

  function segmentLabel(segment) {
    return SEGMENTS.find((item) => item.id === segment)?.label || segment;
  }

  function renderCommitteeCards() {
    const cards = state.revealStatus.revealed ? state.committees : COMMITTEE_PLACEHOLDERS;
    const allowOpen = state.revealStatus.revealed;
    return cards.map((committee) => `
      <button
        type="button"
        class="gp-committee-card"
        data-action="choose-committee"
        data-committee-id="${committee.id}"
        ${allowOpen ? '' : 'disabled aria-disabled="true"'}
      >
        <div class="gp-committee-id">${committee.id}</div>
        <div>
          <h3>${escapeHtml(committeeLabel(committee))}</h3>
          <p>${allowOpen ? 'Abra para escolher o segmento e ver as delegações públicas.' : 'Os comitês seguem em sigilo até a abertura oficial.'}</p>
        </div>
        <div class="gp-committee-arrow">
          <span>${allowOpen ? 'Abrir' : 'Sigilo'}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14"></path>
            <path d="M13 5l7 7-7 7"></path>
          </svg>
        </div>
      </button>
    `).join('');
  }

  function renderDelegationCard(delegation, index) {
    const country = String(delegation.country || '').trim();
    const flagUrl = country ? getFlagUrl(country) : '';

    return `
      <article class="gp-delegation-card">
        <div class="gp-delegation-top">
          <div class="gp-delegation-index">${index + 1}</div>
          <div>
            <div class="gp-delegation-id">Delegação #${String(delegation._id || '').slice(-6)}</div>
            <div class="gp-member-list">
              ${(delegation.members || []).map((member) => `
                <span class="gp-member-pill" title="${escapeHtml(member.fullName || member.username || '')}">
                  ${escapeHtml(member.fullName || member.username || '—')}
                </span>
              `).join('')}
            </div>
          </div>
          <div class="gp-country-preview">
            ${flagUrl ? `<img src="${escapeHtml(flagUrl)}" alt="${escapeHtml(country)}" onerror="this.style.display='none'">` : '<div style="width:54px;height:34px;border-radius:8px;background:rgba(0,0,0,0.04);border:1px dashed rgba(0,0,0,0.15);"></div>'}
            <div>
              <strong>${escapeHtml(country || 'País não liberado')}</strong>
              <span>${escapeHtml(country ? 'Representação pública' : 'Aguardando liberação')}</span>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderView() {
    const committee = state.committeeId ? state.committees.find((item) => Number(item.id) === Number(state.committeeId)) : null;
    const committeeName = committeeLabel(committee);

    if (state.view === 'committees') {
      root.innerHTML = `
        <div class="gp-app">
          <section class="gp-hero">
            <div>
              <span class="gp-kicker">Delegações</span>
              <h1>Consultar delegações públicas</h1>
              <p>Abra um comitê, escolha o segmento e veja as delegações com seus países e representantes.</p>
            </div>
            <div class="gp-badge">Público</div>
          </section>

          <section class="gp-panel">
            <div class="gp-section-title">
              <div>
                <span class="gp-kicker">Comitês</span>
                <h2>Escolha um comitê</h2>
                <p>${state.revealStatus.revealed ? 'Os cartões abaixo estão liberados para navegação pública.' : 'A navegação fica disponível após a abertura oficial dos comitês.'}</p>
              </div>
            </div>
            <div class="gp-committee-grid">
              ${renderCommitteeCards()}
            </div>
          </section>
        </div>
      `;
      return;
    }

    if (state.view === 'segment') {
      root.innerHTML = `
        <div class="gp-app">
          <section class="gp-hero">
            <div>
              <span class="gp-kicker">Comitê selecionado</span>
              <h1>${escapeHtml(committeeName)}</h1>
              <p>Agora escolha 8º/9º ou EM. A lista pública será carregada em seguida.</p>
            </div>
            <div class="gp-badge">${escapeHtml(String(state.committeeId || '-'))}</div>
          </section>

          <section class="gp-panel">
            <div class="gp-backbar">
              <button type="button" class="notification-btn notification-btn-secondary" data-action="back-to-committees">Voltar aos comitês</button>
              <div class="gp-committee-mini">
                <strong>${escapeHtml(committeeName)}</strong>
                <span>Escolha um segmento para continuar</span>
              </div>
            </div>
            <div class="gp-section-title">
              <div>
                <span class="gp-kicker">Segmento</span>
                <h2>8º/9º ou EM</h2>
                <p>O resultado público depende da liberação oficial dos países da edição.</p>
              </div>
            </div>
            <div class="gp-segment-toggle">
              ${SEGMENTS.map((item) => `
                <button type="button" class="gp-segment-btn ${state.segment === item.id ? 'is-active' : ''}" data-action="choose-segment" data-segment-id="${item.id}">${escapeHtml(item.label)}</button>
              `).join('')}
            </div>
          </section>
        </div>
      `;
      return;
    }

    root.innerHTML = `
      <div class="gp-app">
        <section class="gp-hero">
          <div>
            <span class="gp-kicker">Comitê ativo</span>
            <h1>${escapeHtml(committeeName)}</h1>
            <p>As delegações abaixo aparecem no formato público, com país, bandeira e integrantes.</p>
          </div>
          <div class="gp-badge">${escapeHtml(segmentLabel(state.segment))}</div>
        </section>

        <section class="gp-panel">
          <div class="gp-backbar">
            <button type="button" class="notification-btn notification-btn-secondary" data-action="back-to-segment">Voltar ao segmento</button>
            <div class="gp-committee-mini">
              <strong>${escapeHtml(committeeName)}</strong>
              <span>Segmento ${escapeHtml(segmentLabel(state.segment))}</span>
            </div>
          </div>

          <div class="gp-stats">
            <div class="gp-stat"><strong>${state.delegations.length}</strong><span>Delegações exibidas</span></div>
            <div class="gp-stat"><strong>${state.delegations.filter((item) => String(item.country || '').trim()).length}</strong><span>Com país definido</span></div>
            <div class="gp-stat"><strong>${segmentLabel(state.segment)}</strong><span>Segmento ativo</span></div>
          </div>

          <div class="gp-notice" data-gp-notice data-type="info">${escapeHtml(state.message)}</div>
        </section>

        <section class="gp-panel">
          <div class="gp-section-title">
            <div>
              <span class="gp-kicker">Lista</span>
              <h2>Delegações e países</h2>
              <p>Os países são mostrados de acordo com a liberação pública.</p>
            </div>
          </div>

          <div class="gp-delegation-grid">
            ${state.delegations.length ? state.delegations.map((delegation, index) => renderDelegationCard(delegation, index)).join('') : '<div class="gp-empty">Nenhuma delegação encontrada para esse comitê e segmento.</div>'}
          </div>
        </section>
      </div>
    `;
  }

  function injectStyles() {
    if (document.getElementById('delegacoes-public-v2-style')) return;

    const style = document.createElement('style');
    style.id = 'delegacoes-public-v2-style';
    style.textContent = `
      .gp-app { display:grid; gap:1.25rem; padding-bottom:2rem; }
      .gp-hero {
        display:grid;
        gap:1rem;
        grid-template-columns: 1.3fr auto;
        align-items:start;
        padding:1.5rem;
        border-radius:24px;
        background: linear-gradient(135deg, rgba(9, 27, 42, 0.98), rgba(18, 67, 92, 0.92));
        color:#f5fbff;
        box-shadow:0 24px 70px rgba(6, 15, 24, 0.22);
      }
      .gp-hero h1 { margin:0.45rem 0 0.55rem; font-size:clamp(2rem,3.5vw,3.6rem); line-height:1.02; }
      .gp-hero p { margin:0; max-width:68ch; color:rgba(240,248,255,0.82); }
      .gp-kicker {
        display:inline-flex; align-items:center; gap:0.45rem;
        font-size:0.78rem; font-weight:800; letter-spacing:0.14em; text-transform:uppercase;
        color:rgba(255,255,255,0.7);
      }
      .gp-badge {
        display:inline-flex; align-items:center; justify-content:center; min-width:96px; padding:0.9rem 1.2rem;
        border-radius:18px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.14);
        font-weight:900; letter-spacing:0.05em;
      }
      .gp-panel {
        padding:1.25rem; border-radius:22px; background:rgba(255,255,255,0.94);
        border:1px solid rgba(63,87,96,0.09); box-shadow:0 18px 60px rgba(17,28,36,0.08);
      }
      .gp-section-title { display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; }
      .gp-section-title h2 { margin:0.15rem 0 0; font-size:1.35rem; }
      .gp-section-title p { margin:0.25rem 0 0; color:var(--dash-muted, #63707c); }
      .gp-committee-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; }
      .gp-committee-card {
        position:relative; aspect-ratio:1 / 1; border-radius:24px; border:1px solid rgba(24,69,94,0.12);
        background: radial-gradient(circle at top left, rgba(74,159,212,0.18), transparent 36%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,251,0.95));
        padding:1rem; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; text-align:left;
        transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
      }
      .gp-committee-card:hover:not(:disabled) { transform:translateY(-3px); border-color:rgba(74,159,212,0.35); box-shadow:0 18px 35px rgba(17,28,36,0.14); }
      .gp-committee-card:disabled { cursor:not-allowed; opacity:0.82; }
      .gp-committee-id {
        display:inline-flex; align-items:center; justify-content:center; width:52px; height:52px; border-radius:16px;
        background:rgba(74,159,212,0.12); color:#164b63; font-weight:900; font-size:1.2rem;
      }
      .gp-committee-card h3 { margin:0.8rem 0 0.45rem; font-size:1.05rem; line-height:1.18; color:var(--dash-ink, #102131); }
      .gp-committee-card p { margin:0; color:var(--dash-muted, #64717f); font-size:0.93rem; }
      .gp-committee-arrow { display:inline-flex; align-items:center; justify-content:space-between; margin-top:1rem; color:#114056; font-weight:800; }
      .gp-backbar { display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-bottom:1rem; }
      .gp-committee-mini { padding:0.9rem 1rem; border-radius:18px; background:rgba(15, 58, 82, 0.07); border:1px solid rgba(15,58,82,0.1); }
      .gp-committee-mini strong { display:block; font-size:1rem; }
      .gp-committee-mini span { color:var(--dash-muted, #63707c); font-size:0.86rem; }
      .gp-segment-toggle { display:inline-flex; gap:0.55rem; flex-wrap:wrap; }
      .gp-segment-btn {
        border:1px solid rgba(18,64,86,0.16); background:rgba(255,255,255,0.96); color:var(--dash-ink, #102131);
        border-radius:999px; padding:0.8rem 1rem; font-weight:800; cursor:pointer;
      }
      .gp-segment-btn.is-active { background:linear-gradient(135deg, #0f3a52, #1f6b8e); color:#fff; border-color:transparent; }
      .gp-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin-bottom:1rem; }
      .gp-stat {
        padding:1rem 1.1rem; border-radius:18px; background:linear-gradient(180deg, rgba(255,255,255,0.98), rgba(242,247,251,0.96));
        border:1px solid rgba(63,87,96,0.08);
      }
      .gp-stat strong { display:block; font-size:1.7rem; line-height:1; color:var(--dash-ink, #102131); }
      .gp-stat span { color:var(--dash-muted, #63707c); font-size:0.9rem; }
      .gp-notice {
        margin-top:1rem; padding:0.9rem 1rem; border-radius:14px; background:rgba(15,58,82,0.06);
        border:1px solid rgba(15,58,82,0.12); color:var(--dash-ink, #102131); font-weight:600;
      }
      .gp-delegation-grid { display:grid; gap:1rem; }
      .gp-delegation-card {
        padding:1rem; border-radius:22px; border:1px solid rgba(63,87,96,0.1);
        background: radial-gradient(circle at top right, rgba(74,159,212,0.08), transparent 34%), linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,250,253,0.96));
        box-shadow:0 14px 38px rgba(18,31,44,0.06);
      }
      .gp-delegation-top {
        display:grid; gap:1rem; grid-template-columns:96px minmax(0,1fr) minmax(240px,320px); align-items:start;
      }
      .gp-delegation-index {
        width:84px; height:84px; border-radius:24px; display:flex; align-items:center; justify-content:center;
        background:linear-gradient(135deg, rgba(15,58,82,0.98), rgba(28,95,124,0.92)); color:#fff; font-size:1.6rem; font-weight:900;
      }
      .gp-delegation-id { font-size:0.82rem; font-weight:800; color:var(--dash-muted, #63707c); letter-spacing:0.05em; text-transform:uppercase; }
      .gp-member-list { display:flex; flex-wrap:wrap; gap:0.45rem; margin-top:0.65rem; }
      .gp-member-pill {
        padding:0.35rem 0.55rem; border-radius:999px; background:rgba(74,159,212,0.08); border:1px solid rgba(74,159,212,0.18);
        font-size:0.85rem; font-weight:700;
      }
      .gp-country-preview {
        display:flex; align-items:center; gap:0.75rem; justify-content:flex-start;
        padding:0.8rem 0.85rem; border-radius:18px; border:1px solid rgba(63,87,96,0.1); background:rgba(255,255,255,0.78);
      }
      .gp-country-preview img { width:54px; height:34px; object-fit:cover; border-radius:8px; border:1px solid rgba(0,0,0,0.08); }
      .gp-country-preview strong { display:block; font-size:1rem; }
      .gp-country-preview span { display:block; color:var(--dash-muted, #63707c); font-size:0.83rem; }
      .gp-empty {
        padding:1.2rem; border-radius:18px; border:1px dashed rgba(63,87,96,0.18); color:var(--dash-muted, #63707c);
        background:rgba(255,255,255,0.6);
      }

      [data-theme="dark"] .gp-hero {
        background: radial-gradient(circle at top left, rgba(64,132,174,0.3), transparent 34%), linear-gradient(145deg, rgba(7,16,26,0.98), rgba(11,26,40,0.96));
        box-shadow:0 28px 80px rgba(0,0,0,0.42); border:1px solid rgba(120,171,204,0.12);
      }
      [data-theme="dark"] .gp-panel {
        background: radial-gradient(circle at top right, rgba(74,159,212,0.09), transparent 34%), linear-gradient(180deg, rgba(13,21,30,0.96), rgba(9,15,23,0.94));
        border-color:rgba(115,152,179,0.14); box-shadow:0 24px 70px rgba(0,0,0,0.34);
      }
      [data-theme="dark"] .gp-committee-card, [data-theme="dark"] .gp-delegation-card {
        background: radial-gradient(circle at top left, rgba(74,159,212,0.12), transparent 34%), linear-gradient(180deg, rgba(17,25,34,0.96), rgba(12,18,27,0.98));
        border-color:rgba(124,166,196,0.14); box-shadow:0 18px 44px rgba(0,0,0,0.28); color:#eef6ff;
      }
      [data-theme="dark"] .gp-committee-card h3, [data-theme="dark"] .gp-section-title h2, [data-theme="dark"] .gp-country-preview strong, [data-theme="dark"] .gp-delegation-id, [data-theme="dark"] .gp-stat strong {
        color:#f3f8ff;
      }
      [data-theme="dark"] .gp-committee-card p, [data-theme="dark"] .gp-section-title p, [data-theme="dark"] .gp-country-preview span, [data-theme="dark"] .gp-stat span, [data-theme="dark"] .gp-committee-mini span {
        color:rgba(217,228,236,0.72);
      }
      [data-theme="dark"] .gp-segment-btn, [data-theme="dark"] .gp-country-preview, [data-theme="dark"] .gp-stat, [data-theme="dark"] .gp-empty, [data-theme="dark"] .gp-notice {
        background:rgba(12,18,27,0.9); border-color:rgba(124,166,196,0.16); color:#eef6ff;
      }
      [data-theme="dark"] .gp-segment-btn.is-active { background:linear-gradient(135deg, #1f6b8e, #2a90b8); }
      [data-theme="dark"] .gp-committee-id { background:rgba(74,159,212,0.18); color:#daf1ff; }
      [data-theme="dark"] .gp-committee-card:hover:not(:disabled), [data-theme="dark"] .gp-delegation-card:hover {
        border-color:rgba(121,185,224,0.35); box-shadow:0 22px 50px rgba(0,0,0,0.34);
      }

      @media (max-width: 920px) {
        .gp-hero, .gp-delegation-top { grid-template-columns:1fr; }
        .gp-committee-card { aspect-ratio:auto; min-height:220px; }
      }
    `;
    document.head.appendChild(style);
  }

  function renderLockedState() {
    root.innerHTML = `
      <div class="gp-app">
        <section class="gp-hero">
          <div>
            <span class="gp-kicker">Delegações</span>
            <h1>Consultar delegações públicas</h1>
            <p>Os comitês ainda estão sob sigilo. Assim que a divulgação for liberada, os cartões ficarão ativos.</p>
          </div>
          <div class="gp-badge">Sigilo</div>
        </section>
        <section class="gp-panel">
          <div class="gp-section-title">
            <div>
              <span class="gp-kicker">Comitês</span>
              <h2>Bloqueado até a divulgação</h2>
              <p>Os cartões abaixo são uma prévia da navegação pública.</p>
            </div>
          </div>
          <div class="gp-committee-grid">
            ${renderCommitteeCards()}
          </div>
        </section>
      </div>
    `;
  }

  function renderSegmentChooser() {
    const committee = state.committees.find((item) => Number(item.id) === Number(state.committeeId));
    root.innerHTML = `
      <div class="gp-app">
        <section class="gp-hero">
          <div>
            <span class="gp-kicker">Comitê selecionado</span>
            <h1>${escapeHtml(committeeLabel(committee))}</h1>
            <p>Escolha o segmento para ver a lista pública das delegações.</p>
          </div>
          <div class="gp-badge">${escapeHtml(String(state.committeeId || '-'))}</div>
        </section>
        <section class="gp-panel">
          <div class="gp-backbar">
            <button type="button" class="notification-btn notification-btn-secondary" data-action="back-to-committees">Voltar aos comitês</button>
            <div class="gp-committee-mini">
              <strong>${escapeHtml(committeeLabel(committee))}</strong>
              <span>Escolha um segmento</span>
            </div>
          </div>
          <div class="gp-section-title">
            <div>
              <span class="gp-kicker">Segmento</span>
              <h2>8º e 9º ou EM</h2>
              <p>A consulta seguirá a liberação pública do comitê.</p>
            </div>
          </div>
          <div class="gp-segment-toggle">
            ${SEGMENTS.map((segment) => `
              <button type="button" class="gp-segment-btn ${state.segment === segment.id ? 'is-active' : ''}" data-action="choose-segment" data-segment-id="${segment.id}">${escapeHtml(segment.label)}</button>
            `).join('')}
          </div>
        </section>
      </div>
    `;
  }

  function renderDelegationsView() {
    const committee = state.committees.find((item) => Number(item.id) === Number(state.committeeId));
    root.innerHTML = `
      <div class="gp-app">
        <section class="gp-hero">
          <div>
            <span class="gp-kicker">Comitê ativo</span>
            <h1>${escapeHtml(committeeLabel(committee))}</h1>
            <p>Veja as delegações e seus países correspondentes no segmento selecionado.</p>
          </div>
          <div class="gp-badge">${escapeHtml(segmentLabel(state.segment))}</div>
        </section>

        <section class="gp-panel">
          <div class="gp-backbar">
            <button type="button" class="notification-btn notification-btn-secondary" data-action="back-to-segment">Voltar ao segmento</button>
            <div class="gp-committee-mini">
              <strong>${escapeHtml(committeeLabel(committee))}</strong>
              <span>Segmento ${escapeHtml(segmentLabel(state.segment))}</span>
            </div>
          </div>

          <div class="gp-stats">
            <div class="gp-stat"><strong>${state.delegations.length}</strong><span>Delegações exibidas</span></div>
            <div class="gp-stat"><strong>${state.delegations.filter((item) => String(item.country || '').trim()).length}</strong><span>Países atribuídos</span></div>
            <div class="gp-stat"><strong>${segmentLabel(state.segment)}</strong><span>Segmento ativo</span></div>
          </div>

          <div class="gp-notice" data-gp-notice>${escapeHtml(state.message)}</div>
        </section>

        <section class="gp-panel">
          <div class="gp-section-title">
            <div>
              <span class="gp-kicker">Lista</span>
              <h2>Delegações e países</h2>
              <p>Os países são mostrados apenas quando a organização libera a visualização pública.</p>
            </div>
          </div>
          <div class="gp-delegation-grid">
            ${state.delegations.length ? state.delegations.map((delegation, index) => renderDelegationCard(delegation, index)).join('') : '<div class="gp-empty">Nenhuma delegação encontrada para este comitê e segmento.</div>'}
          </div>
        </section>
      </div>
    `;
  }

  function render() {
    injectStyles();
    if (!state.revealStatus.revealed) {
      renderLockedState();
      const notice = document.getElementById('delegationsMessage');
      if (notice) notice.textContent = 'Os comitês ainda estão sob sigilo.';
      return;
    }
    if (state.view === 'committees') {
      renderLockedState();
      const cards = root.querySelector('.gp-committee-grid');
      if (cards) cards.innerHTML = renderCommitteeCards();
      const heroTitle = root.querySelector('.gp-hero h1');
      if (heroTitle) heroTitle.textContent = 'Consultar delegações públicas';
      const heroDesc = root.querySelector('.gp-hero p');
      if (heroDesc) heroDesc.textContent = 'Abra um comitê, escolha o segmento e veja as delegações com seus países e representantes.';
      const badge = root.querySelector('.gp-badge');
      if (badge) badge.textContent = 'Público';
      return;
    }
    if (state.view === 'segment') {
      renderSegmentChooser();
      return;
    }
    renderDelegationsView();
  }

  async function loadCommittees() {
    state.revealStatus = await fetchRevealStatus();
    state.committees = await fetchCommitteeCatalog();
    state.flags = await fetchFlagsCatalog();
  }

  async function loadDelegations() {
    setLoading(true);
    try {
      const data = await fetchDelegations();
      if (!data.released) {
        state.delegations = [];
        state.message = 'As delegações ainda não foram liberadas para visualização pública.';
      } else {
        state.delegations = Array.isArray(data.delegations) ? data.delegations : [];
        state.message = state.delegations.length
          ? `Mostrando ${state.delegations.length} delegação(ões) no segmento ${segmentLabel(state.segment)}.`
          : 'Nenhuma delegação encontrada para este comitê e segmento.';
      }
      state.view = 'delegations';
      render();
    } catch (error) {
      state.message = error.message || 'Não foi possível carregar as delegações.';
      state.view = 'segment';
      render();
    } finally {
      setLoading(false);
    }
  }

  function wireEvents() {
    root.addEventListener('click', async (event) => {
      const target = event.target.closest('[data-action]');
      if (!target) return;

      const action = target.dataset.action;
      if (action === 'choose-committee') {
        if (!state.revealStatus.revealed) return;
        state.committeeId = Number(target.dataset.committeeId);
        state.view = 'segment';
        state.segment = '8e9';
        render();
        return;
      }
      if (action === 'choose-segment') {
        state.segment = target.dataset.segmentId || '8e9';
        await loadDelegations();
        return;
      }
      if (action === 'back-to-committees') {
        state.view = 'committees';
        state.committeeId = null;
        state.segment = '8e9';
        state.delegations = [];
        render();
        return;
      }
      if (action === 'back-to-segment') {
        state.view = 'segment';
        state.delegations = [];
        render();
      }
    });
  }

  async function init() {
    wireEvents();
    await loadCommittees();
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
