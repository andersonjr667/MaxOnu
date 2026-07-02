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
    searchTerm: '',
    sortBy: 'country',
    viewMode: 'grid',
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

  function getFilteredDelegations() {
    const query = normalizeText(state.searchTerm);
    if (!query) return state.delegations;

    return state.delegations.filter((delegation) => {
      const haystack = [
        delegation.country,
        delegation._id,
        ...(delegation.members || []).map((member) => [member.fullName, member.username, member.classGroup].join(' '))
      ].join(' ');
      return normalizeText(haystack).includes(query);
    });
  }

  function getDelegationName(delegation) {
    const member = (delegation.members || []).find((item) => String(item.fullName || item.username || '').trim());
    return String(member?.fullName || member?.username || delegation.country || 'Delegação').trim();
  }

  function getSortedDelegations() {
    const filtered = getFilteredDelegations();
    const sorted = [...filtered];

    sorted.sort((left, right) => {
      if (state.sortBy === 'name') {
        const leftName = getDelegationName(left).toLowerCase();
        const rightName = getDelegationName(right).toLowerCase();
        return leftName.localeCompare(rightName, 'pt-BR');
      }

      const leftCountry = String(left.country || '').trim().toLowerCase();
      const rightCountry = String(right.country || '').trim().toLowerCase();
      if (!leftCountry && !rightCountry) return 0;
      if (!leftCountry) return 1;
      if (!rightCountry) return -1;
      return leftCountry.localeCompare(rightCountry, 'pt-BR');
    });

    return sorted;
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
    const cardClass = `gp-delegation-card${state.viewMode === 'list' ? ' gp-delegation-card--list' : ''}${flagUrl ? ' is-highlighted' : ''}`;

    return `
      <article class="${cardClass}">
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
          <div class="gp-country-preview${flagUrl ? ' gp-country-preview--has-flag' : ''}">
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
            <div class="gp-guide-grid">
              <div class="gp-guide-card">
                <strong>Como usar</strong>
                <p>1. Selecione um comitê. 2. Escolha 8º/9º ou EM. 3. Veja as delegações e os países atribuídos.</p>
              </div>
              <div class="gp-guide-card gp-guide-card--soft">
                <strong>Dica</strong>
                <p>Na tela seguinte, você pode buscar por nome, país, turma ou código da delegação.</p>
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
            ${getFilteredDelegations().length ? getFilteredDelegations().map((delegation, index) => renderDelegationCard(delegation, index)).join('') : '<div class="gp-empty">Nenhuma delegação encontrada para esse filtro. Tente limpar a busca ou usar outro termo.</div>'}
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
      :root {
        --gp-surface: rgba(255, 255, 255, 0.95);
        --gp-border: rgba(13, 59, 102, 0.12);
        --gp-shadow: 0 24px 60px rgba(8, 31, 56, 0.14);
      }

      .gp-app {
        display:grid;
        gap:1.15rem;
        padding-bottom:2rem;
      }

      .gp-hero {
        position:relative;
        overflow:hidden;
        display:grid;
        gap:1rem;
        grid-template-columns:minmax(0, 1.3fr) auto;
        align-items:start;
        padding:1.6rem;
        border-radius:30px;
        border:1px solid rgba(255, 255, 255, 0.28);
        background:
          radial-gradient(circle at top left, rgba(255, 209, 102, 0.24), transparent 32%),
          linear-gradient(135deg, rgba(8, 31, 56, 0.96) 0%, rgba(13, 59, 102, 0.95) 48%, rgba(31, 111, 168, 0.94) 100%);
        color:#f7fbff;
        box-shadow:0 26px 80px rgba(8, 31, 56, 0.22);
        isolation:isolate;
      }
      .gp-hero::before,
      .gp-hero::after {
        content:"";
        position:absolute;
        border-radius:999px;
        pointer-events:none;
        filter:blur(2px);
      }
      .gp-hero::before {
        width:240px;
        height:240px;
        top:-90px;
        right:-40px;
        background:rgba(255, 209, 102, 0.16);
      }
      .gp-hero::after {
        width:180px;
        height:180px;
        bottom:-80px;
        left:-40px;
        background:rgba(255, 140, 66, 0.16);
      }
      .gp-hero > * { position:relative; z-index:1; }
      .gp-hero h1 { margin:0.45rem 0 0.55rem; font-size:clamp(1.9rem,3.2vw,3.1rem); line-height:1.02; letter-spacing:-0.03em; }
      .gp-hero p { margin:0; max-width:66ch; color:rgba(242,248,255,0.82); }
      .gp-kicker {
        display:inline-flex; align-items:center; gap:0.45rem;
        font-size:0.78rem; font-weight:800; letter-spacing:0.16em; text-transform:uppercase;
        color:rgba(255,255,255,0.8);
      }
      .gp-badge {
        display:inline-flex; align-items:center; justify-content:center; min-width:108px; padding:0.95rem 1.1rem;
        border-radius:999px; background:rgba(255,255,255,0.12); border:1px solid rgba(255,255,255,0.16);
        font-weight:900; letter-spacing:0.08em; backdrop-filter:blur(12px);
      }

      .gp-panel {
        position:relative;
        padding:1.25rem; border-radius:24px; background:linear-gradient(145deg, rgba(255,255,255,0.95), rgba(246,250,253,0.9));
        border:1px solid var(--gp-border); box-shadow:var(--gp-shadow); backdrop-filter:blur(18px);
      }
      .gp-panel::before {
        content:"";
        position:absolute;
        inset:0;
        border-radius:inherit;
        background:linear-gradient(90deg, rgba(255,140,66,0.04), transparent 35%, rgba(31,111,168,0.04));
        pointer-events:none;
      }
      .gp-panel > * { position:relative; z-index:1; }
      .gp-section-title { display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap; margin-bottom:1rem; }
      .gp-section-title h2 { margin:0.15rem 0 0; font-size:1.32rem; color:var(--azul-principal, #0d3b66); }
      .gp-section-title p { margin:0.25rem 0 0; color:var(--texto-suave, #5f748c); }
      .gp-guide-grid { display:grid; gap:0.9rem; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); margin-bottom:1rem; }
      .gp-guide-card {
        padding:0.95rem 1rem; border-radius:18px; background:linear-gradient(135deg, rgba(13,59,102,0.07), rgba(31,111,168,0.06));
        border:1px solid rgba(13,59,102,0.1);
      }
      .gp-guide-card strong { display:block; margin-bottom:0.35rem; color:var(--azul-principal, #0d3b66); }
      .gp-guide-card p { margin:0; color:var(--texto-suave, #5f748c); font-size:0.93rem; }
      .gp-guide-card--soft { background:linear-gradient(135deg, rgba(255,255,255,0.96), rgba(247,250,252,0.95)); }
      .gp-committee-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:1rem; }
      .gp-committee-card {
        position:relative; aspect-ratio:1 / 1; border-radius:24px; border:1px solid rgba(13,59,102,0.1);
        background:linear-gradient(145deg, rgba(255,255,255,0.97), rgba(243,248,252,0.94)); padding:1rem; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer; text-align:left;
        transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease; box-shadow:0 14px 34px rgba(8,31,56,0.08);
      }
      .gp-committee-card:hover:not(:disabled) { transform:translateY(-4px); border-color:rgba(31,111,168,0.28); box-shadow:0 22px 44px rgba(8,31,56,0.12); }
      .gp-committee-card:disabled { cursor:not-allowed; opacity:0.84; }
      .gp-committee-id {
        display:inline-flex; align-items:center; justify-content:center; width:54px; height:54px; border-radius:16px;
        background:linear-gradient(135deg, rgba(13,59,102,0.14), rgba(31,111,168,0.18)); color:var(--azul-principal, #0d3b66); font-weight:900; font-size:1.15rem;
      }
      .gp-committee-card h3 { margin:0.8rem 0 0.45rem; font-size:1.05rem; line-height:1.2; color:var(--azul-principal, #0d3b66); }
      .gp-committee-card p { margin:0; color:var(--texto-suave, #5f748c); font-size:0.93rem; }
      .gp-committee-arrow { display:inline-flex; align-items:center; justify-content:space-between; margin-top:1rem; color:var(--azul-secundario, #1f6fa8); font-weight:800; }
      .gp-backbar { display:flex; gap:0.75rem; flex-wrap:wrap; align-items:center; justify-content:space-between; margin-bottom:1rem; }
      .gp-committee-mini { padding:0.9rem 1rem; border-radius:16px; background:rgba(13,59,102,0.06); border:1px solid rgba(13,59,102,0.1); }
      .gp-committee-mini strong { display:block; font-size:1rem; color:var(--azul-principal, #0d3b66); }
      .gp-committee-mini span { color:var(--texto-suave, #5f748c); font-size:0.86rem; }
      .gp-segment-toggle { display:inline-flex; gap:0.55rem; flex-wrap:wrap; }
      .gp-segment-btn {
        border:1px solid rgba(13,59,102,0.16); background:rgba(255,255,255,0.96); color:var(--azul-principal, #0d3b66);
        border-radius:999px; padding:0.8rem 1rem; font-weight:800; cursor:pointer; transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease;
      }
      .gp-segment-btn:hover { transform:translateY(-1px); }
      .gp-segment-btn.is-active { background:linear-gradient(135deg, var(--azul-principal, #0d3b66), var(--azul-secundario, #1f6fa8)); color:#fff; border-color:transparent; box-shadow:0 14px 28px rgba(13,59,102,0.2); }
      .gp-toolbar { display:flex; gap:0.8rem; flex-wrap:wrap; align-items:flex-end; margin-bottom:1rem; }
      .gp-search-field { display:grid; gap:0.35rem; flex:1 1 280px; }
      .gp-search-field span, .gp-select-field span { font-size:0.8rem; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; color:var(--texto-suave, #5f748c); }
      .gp-search-field input, .gp-select-field select {
        width:100%; border:1px solid rgba(13,59,102,0.12); border-radius:999px; padding:0.8rem 1rem; font:inherit; color:var(--texto, #17324d);
        background:rgba(255,255,255,0.96); box-shadow:inset 0 1px 0 rgba(255,255,255,0.7);
      }
      .gp-toolbar-actions { display:flex; gap:0.7rem; flex-wrap:wrap; align-items:flex-end; }
      .gp-select-field { display:grid; gap:0.35rem; min-width:160px; }
      .gp-view-toggle { display:inline-flex; gap:0.35rem; padding:0.3rem; border-radius:999px; background:rgba(13,59,102,0.06); }
      .gp-view-btn { border:none; border-radius:999px; padding:0.7rem 0.9rem; font-weight:800; cursor:pointer; color:var(--azul-principal, #0d3b66); background:transparent; transition: all 160ms ease; }
      .gp-view-btn.is-active { color:#fff; background:linear-gradient(135deg, var(--azul-principal, #0d3b66), var(--azul-secundario, #1f6fa8)); }
      .gp-clear-btn { border:none; border-radius:999px; padding:0.8rem 1rem; font-weight:800; cursor:pointer; color:#fff; background:linear-gradient(135deg, var(--azul-principal, #0d3b66), var(--azul-secundario, #1f6fa8)); }
      .gp-stats { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:1rem; margin-bottom:1rem; }
      .gp-stat { padding:1rem 1.1rem; border-radius:18px; background:linear-gradient(145deg, rgba(255,255,255,0.96), rgba(242,247,251,0.92)); border:1px solid rgba(13,59,102,0.08); box-shadow:0 10px 24px rgba(8,31,56,0.05); }
      .gp-stat strong { display:block; font-size:1.6rem; line-height:1; color:var(--azul-principal, #0d3b66); }
      .gp-stat span { color:var(--texto-suave, #5f748c); font-size:0.9rem; }
      .gp-notice { margin-top:1rem; padding:0.95rem 1rem; border-radius:14px; background:linear-gradient(135deg, rgba(13,59,102,0.06), rgba(255,140,66,0.06)); border:1px solid rgba(13,59,102,0.1); color:var(--texto, #17324d); font-weight:700; }
      .gp-delegation-grid { display:grid; gap:1rem; }
      .gp-delegation-grid--list { gap:0.8rem; }
      .gp-delegation-card { padding:1rem; border-radius:22px; border:1px solid rgba(13,59,102,0.1); background:linear-gradient(145deg, rgba(255,255,255,0.97), rgba(244,248,252,0.94)); box-shadow:0 16px 40px rgba(8,31,56,0.07); transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease, background 180ms ease; animation: gpFadeInUp 360ms ease both; }
      .gp-delegation-card:hover { transform:translateY(-4px); box-shadow:0 22px 50px rgba(8,31,56,0.12); }
      .gp-delegation-card.is-highlighted { border-color:rgba(31,111,168,0.3); background:linear-gradient(145deg, rgba(255,255,255,0.98), rgba(237,247,253,0.96)); box-shadow:0 24px 54px rgba(13,59,102,0.13); }
      .gp-delegation-card--list .gp-delegation-top { grid-template-columns:72px minmax(0,1fr) minmax(220px,280px); }
      .gp-delegation-top { display:grid; gap:1rem; grid-template-columns:96px minmax(0,1fr) minmax(240px,320px); align-items:start; }
      .gp-delegation-index { width:84px; height:84px; border-radius:24px; display:flex; align-items:center; justify-content:center; background:linear-gradient(135deg, var(--azul-principal, #0d3b66), var(--azul-secundario, #1f6fa8)); color:#fff; font-size:1.55rem; font-weight:900; box-shadow:0 14px 26px rgba(13,59,102,0.16); }
      .gp-delegation-id { font-size:0.82rem; font-weight:800; color:var(--texto-suave, #5f748c); letter-spacing:0.05em; text-transform:uppercase; }
      .gp-member-list { display:flex; flex-wrap:wrap; gap:0.45rem; margin-top:0.65rem; }
      .gp-member-pill { padding:0.35rem 0.55rem; border-radius:999px; background:rgba(31,111,168,0.08); border:1px solid rgba(31,111,168,0.16); font-size:0.85rem; font-weight:700; color:var(--azul-principal, #0d3b66); }
      .gp-country-preview { display:flex; align-items:center; gap:0.75rem; justify-content:flex-start; padding:0.8rem 0.85rem; border-radius:18px; border:1px solid rgba(13,59,102,0.1); background:rgba(255,255,255,0.78); transition: border-color 180ms ease, background 180ms ease, transform 180ms ease; }
      .gp-country-preview--has-flag { border-color:rgba(31,111,168,0.24); background:linear-gradient(135deg, rgba(31,111,168,0.1), rgba(255,255,255,0.94)); transform:translateY(-1px); }
      .gp-country-preview img { width:54px; height:34px; object-fit:cover; border-radius:8px; border:1px solid rgba(0,0,0,0.08); }
      .gp-country-preview strong { display:block; font-size:1rem; color:var(--azul-principal, #0d3b66); }
      .gp-country-preview span { display:block; color:var(--texto-suave, #5f748c); font-size:0.83rem; }
      .gp-empty { padding:1.2rem; border-radius:18px; border:1px dashed rgba(13,59,102,0.2); color:var(--texto-suave, #5f748c); background:rgba(255,255,255,0.58); }

      [data-theme="dark"] .gp-hero { background:radial-gradient(circle at top left, rgba(255,209,102,0.18), transparent 34%), linear-gradient(145deg, rgba(5,16,28,0.98), rgba(10,27,44,0.96)); border-color:rgba(255,255,255,0.08); }
      [data-theme="dark"] .gp-panel { background:linear-gradient(145deg, rgba(12,20,31,0.96), rgba(9,15,23,0.94)); border-color:rgba(255,255,255,0.08); box-shadow:0 24px 70px rgba(0,0,0,0.32); }
      [data-theme="dark"] .gp-committee-card, [data-theme="dark"] .gp-delegation-card { background:linear-gradient(145deg, rgba(15,24,34,0.96), rgba(9,15,23,0.95)); border-color:rgba(255,255,255,0.08); box-shadow:0 18px 44px rgba(0,0,0,0.27); color:#eef6ff; }
      [data-theme="dark"] .gp-committee-card h3, [data-theme="dark"] .gp-section-title h2, [data-theme="dark"] .gp-country-preview strong, [data-theme="dark"] .gp-delegation-id, [data-theme="dark"] .gp-stat strong { color:#f3f8ff; }
      [data-theme="dark"] .gp-committee-card p, [data-theme="dark"] .gp-section-title p, [data-theme="dark"] .gp-country-preview span, [data-theme="dark"] .gp-stat span, [data-theme="dark"] .gp-committee-mini span { color:rgba(217,228,236,0.74); }
      [data-theme="dark"] .gp-segment-btn, [data-theme="dark"] .gp-country-preview, [data-theme="dark"] .gp-stat, [data-theme="dark"] .gp-empty, [data-theme="dark"] .gp-notice, [data-theme="dark"] .gp-search-field input, [data-theme="dark"] .gp-guide-card { background:rgba(10,17,26,0.9); border-color:rgba(255,255,255,0.08); color:#eef6ff; }
      [data-theme="dark"] .gp-segment-btn.is-active { background:linear-gradient(135deg, #1f6b8e, #2a90b8); }
      [data-theme="dark"] .gp-committee-id { background:rgba(31,111,168,0.16); color:#daf1ff; }
      [data-theme="dark"] .gp-committee-card:hover:not(:disabled), [data-theme="dark"] .gp-delegation-card:hover { border-color:rgba(121,185,224,0.32); box-shadow:0 22px 50px rgba(0,0,0,0.33); }

      @keyframes gpFadeInUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }

      @media (max-width: 920px) {
        .gp-hero, .gp-delegation-top { grid-template-columns:1fr; }
        .gp-committee-card { aspect-ratio:auto; min-height:220px; }
        .gp-toolbar-actions { width:100%; }
      }

      @media (max-width: 640px) {
        .gp-panel { padding:1rem; }
        .gp-hero { padding:1.1rem; }
        .gp-toolbar { flex-direction:column; align-items:stretch; }
        .gp-toolbar-actions, .gp-view-toggle { width:100%; }
        .gp-view-btn { flex:1; }
        .gp-clear-btn { width:100%; }
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

          <div class="gp-toolbar">
            <label class="gp-search-field">
              <span>Buscar</span>
              <input type="text" value="${escapeHtml(state.searchTerm)}" placeholder="Nome, país, turma ou código" data-action="search-delegations" autocomplete="off">
            </label>
            <div class="gp-toolbar-actions">
              <label class="gp-select-field">
                <span>Ordenar por</span>
                <select data-action="change-sort">
                  <option value="country" ${state.sortBy === 'country' ? 'selected' : ''}>País</option>
                  <option value="name" ${state.sortBy === 'name' ? 'selected' : ''}>Nome</option>
                </select>
              </label>
              <div class="gp-view-toggle" role="group" aria-label="Modo de visualização">
                <button type="button" class="gp-view-btn ${state.viewMode === 'grid' ? 'is-active' : ''}" data-action="change-view-mode" data-view-mode="grid">Grade</button>
                <button type="button" class="gp-view-btn ${state.viewMode === 'list' ? 'is-active' : ''}" data-action="change-view-mode" data-view-mode="list">Lista</button>
              </div>
            </div>
            <button type="button" class="gp-clear-btn" data-action="clear-search">Limpar</button>
          </div>

          <div class="gp-stats">
            <div class="gp-stat"><strong>${getSortedDelegations().length}</strong><span>Delegações exibidas</span></div>
            <div class="gp-stat"><strong>${getSortedDelegations().filter((item) => String(item.country || '').trim()).length}</strong><span>Países atribuídos</span></div>
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
            ${getFilteredDelegations().length ? getFilteredDelegations().map((delegation, index) => renderDelegationCard(delegation, index)).join('') : '<div class="gp-empty">Nenhuma delegação encontrada para esse filtro. Tente limpar a busca ou usar outro termo.</div>'}
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
    state.searchTerm = '';
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
      if (action === 'clear-search') {
        state.searchTerm = '';
        render();
      }
      if (action === 'change-view-mode') {
        state.viewMode = target.dataset.viewMode === 'list' ? 'list' : 'grid';
        render();
      }
    });

    root.addEventListener('change', (event) => {
      const select = event.target.closest('[data-action="change-sort"]');
      if (!select) return;
      state.sortBy = select.value === 'name' ? 'name' : 'country';
      render();
    });

    root.addEventListener('input', (event) => {
      const input = event.target.closest('[data-action="search-delegations"]');
      if (!input) return;
      state.searchTerm = input.value;
      render();
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
