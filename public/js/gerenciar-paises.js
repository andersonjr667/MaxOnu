(function () {
  'use strict';

  function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
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

      if (!res.ok) {
        window.location.href = '/';
        return false;
      }

      const data = await res.json().catch(() => ({}));
      if (data?.isAdmin !== true && data?.role !== 'admin') {
        window.location.href = '/';
        return false;
      }

      return true;
    } catch (error) {
      window.location.href = '/';
      return false;
    }
  }

  function showFeedback(el, message, type = 'info') {
    el.textContent = message;
    el.className = `newsletter-feedback is-${type}`;
    el.hidden = false;
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideFeedback(el) {
    if (!el) return;
    el.hidden = true;
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn.dataset.orig = btn.textContent;
      btn.textContent = 'Aguarde...';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.orig || btn.textContent;
      btn.disabled = false;
    }
  }

  const COMMITTEES = {
    1: 'CDH 2026 - O Paradoxo da Hiperconectividade',
    2: 'AGNU - Guerra, Multipolaridade e Disputas Territoriais',
    3: 'ACNUR - Mobilidade humana e crises humanitárias',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global - Recursos Estratégicos e Capitalismo',
    6: 'UNHRC - Identidade, memória e poder',
    7: 'ONU Mulheres (CSW/2026) - Violência contra Mulheres'
  };

  const segmentButtons = () => Array.from(document.querySelectorAll('[data-segment]'));

  function getSelectedSegment() {
    const active = document.querySelector('[data-segment].is-active');
    return active?.dataset?.segment || '8e9';
  }

  function wireSegmentToggle() {
    const btns = segmentButtons();
    btns.forEach((btn) => {
      btn.addEventListener('click', () => {
        btns.forEach((b) => b.classList.remove('is-active'));
        btn.classList.add('is-active');
      });
    });
  }

  function delegationKey(delegation) {
    return String(delegation._id);
  }

  function renderDelegationRow(delegation, idx, countryOptions, state) {
    const key = delegationKey(delegation);
    const currentCountry = delegation.country || '';

    const select = document.createElement('select');
    select.className = 'country-select';
    select.dataset.delegationId = key;

    const options = Array.from(countryOptions);
    options.sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '— Sem país —';
    select.appendChild(emptyOpt);

    for (const c of options) {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (String(currentCountry) === String(c)) opt.selected = true;
      select.appendChild(opt);
    }

    // If current country isn't in set (new assignments), add it
    if (currentCountry && !countryOptions.includes(currentCountry)) {
      const opt = document.createElement('option');
      opt.value = currentCountry;
      opt.textContent = currentCountry;
      opt.selected = true;
      select.appendChild(opt);
    }

    select.addEventListener('change', () => {
      state.dirtyCountries[key] = select.value;
      // Mark row dirty
      const row = select.closest('[data-row-delegation-id]');
      if (!row) return;
      const original = state.originalCountries[key] || '';
      row.dataset.dirty = String(select.value !== original);
      const badge = row.querySelector('[data-dirty-badge]');
      if (badge) {
        badge.textContent = row.dataset.dirty === 'true' ? 'Alterado' : ' ';
        badge.style.visibility = row.dataset.dirty === 'true' ? 'visible' : 'hidden';
      }
    });

    const tr = document.createElement('div');
    tr.className = 'delegation-assign-row';
    tr.dataset.rowDelegationId = key;
    tr.dataset.dirty = 'false';

    const flagHtml = currentCountry
      ? `<div class="country-flag">` +
        `<img src="/paises/flags/${window.__getFlagFileName?.(currentCountry) || ''}" alt="Bandeira" onerror="this.style.display='none'"/>` +
        `</div>`
      : `<div class="country-flag country-flag-empty"></div>`;

    tr.innerHTML = `
      <div class="delegation-index">${idx + 1}</div>
      <div class="delegation-meta">
        <div class="delegation-id">#${String(delegation._id).slice(-6)}</div>
        <div class="delegation-members">
          ${(delegation.members || []).map(m => `
            <span class="member-pill" title="${m.fullName || ''}">${m.fullName || m.username || '—'}</span>
          `).join('')}
        </div>
      </div>
      <div class="country-cell">
        ${flagHtml}
        <div class="country-select-wrap">
          <select class="country-select" data-delegation-id="${key}"></select>
        </div>
      </div>
      <div class="dirty-badge-wrap">
        <span class="dirty-badge" data-dirty-badge style="visibility:hidden;">Alterado</span>
      </div>
    `;

    // Replace placeholder select with our populated one
    const holder = tr.querySelector('.country-select');
    if (holder) {
      holder.replaceWith(select);
    }

    return tr;
  }

  async function fetchDelegationsForAdmin(committeeId, segment) {
    // Para admin: usamos o mesmo endpoint público, mas ignoramos o campo `released`.
    // Isso permite lançar países mesmo antes de liberar publicação, assumindo que a API retorna delegações.
    const res = await fetch(`/api/delegation/admin/committee/${committeeId}?segment=${encodeURIComponent(segment)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Erro ao carregar delegações.');
    }
    // Não bloqueia por `data.released` aqui.
    return data;
  }


  async function fetchCountryCatalog(committeeId, segment) {
    const url = `/paises/${encodeURIComponent(segment)}/Comite_${encodeURIComponent(committeeId)}_${encodeURIComponent(segment)}.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) return [];

      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data.rows) ? data.rows : [];
      const countries = rows
        .map((row) => String(row['Delegações'] || row.Delegacoes || row.country || '').trim())
        .filter(Boolean);

      return Array.from(new Set(countries));
    } catch (error) {
      return [];
    }
  }

  async function saveCountries(payload) {
    const token = getToken();

      // Atualiza "country" no backend via PUT /api/delegation/admin/:delegationId/country

      // usando o campo country.

    const results = [];
    for (const d of payload.delegations) {
      const delegationId = d.delegationId;
      const country = d.country || '';

      const res = await fetch(`/api/delegation/admin/${encodeURIComponent(delegationId)}/country`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          // Mantém o mesmo tamanho e membros não são necessários aqui.
          // O backend atual exige members/teamSize, então faremos chamadas no modo "PATCH-like".
          // Se o backend rejeitar, teremos erro explícito.
          country
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Erro ao atualizar país da delegação ${String(delegationId).slice(-6)}.`);
      }

      results.push({ delegationId, country });
    }

    return { ok: true, updated: results.length };
  }



  function buildStylesOnce() {
    if (document.getElementById('gerenciar-paises-inline-style')) return;

    const style = document.createElement('style');
    style.id = 'gerenciar-paises-inline-style';
    style.textContent = `
      .delegation-public-list .dashboard-empty { margin-top: 0.5rem; }
      .delegations-table {
        width: 100%;
        display: grid;
        gap: 0.75rem;
      }
      .delegations-table-head {
        display: grid;
        grid-template-columns: 64px 1.2fr 1fr 120px;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background: rgba(74,159,212,0.06);
        border: 1px solid rgba(74,159,212,0.15);
        border-radius: 12px;
        font-weight: 700;
        color: var(--dash-ink);
      }
      .delegation-assign-row {
        display: grid;
        grid-template-columns: 64px 1.2fr 1fr 120px;
        gap: 0.75rem;
        padding: 0.75rem;
        border-radius: 12px;
        border: 1px solid var(--dash-line);
        background: rgba(255,255,255,0.8);
        align-items: center;
      }
      .delegation-assign-row[data-dirty="true"] { border-color: rgba(209,73,91,0.45); box-shadow: 0 0 0 3px rgba(209,73,91,0.08); }
      .delegation-index { font-weight: 900; color: var(--dash-ink); }
      .delegation-meta .delegation-id { font-weight: 800; margin-bottom: 0.25rem; }
      .delegation-members { display:flex; flex-wrap: wrap; gap:0.35rem; }
      .member-pill { font-size: 0.85rem; padding: 0.25rem 0.5rem; border-radius: 999px; background: rgba(74,159,212,0.08); border: 1px solid rgba(74,159,212,0.15); }
      .country-cell { display:flex; align-items:center; gap:0.75rem; }
      .country-flag { width:34px; height:22px; border-radius:4px; overflow:hidden; border:1px solid rgba(0,0,0,0.08); }
      .country-flag img { width:100%; height:100%; object-fit:cover; display:block; }
      .country-flag-empty { background: rgba(0,0,0,0.03); border-style:dashed; }
      .country-select-wrap select { width: 100%; padding: 0.6rem 0.7rem; border-radius: 12px; border: 1.5px solid var(--dash-line); background: rgba(255,255,255,0.95); }
      .dirty-badge-wrap { text-align:right; }
      .dirty-badge { font-weight: 800; color: #d1495b; }
    `;

    document.head.appendChild(style);

    // Provide flag name helper if not already
    window.__getFlagFileName = window.__getFlagFileName || function getFlagFileName(country) {
      if (!country) return '';
      // Keep it aligned with committee-pages.js (best-effort):
      const normalized = String(country)
        .normalize('NFD')
        .replace(/[\u0000-\u001f]/g, '')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^A-Za-z0-9 ]+/g, ' ')
        .trim();
      if (!normalized) return '';
      const words = normalized.split(/\s+/).filter(Boolean).map((w, i) => {
        const lower = w.toLowerCase();
        const smallWords = ['de', 'da', 'do', 'dos', 'das', 'e', 'em'];
        if (i > 0 && smallWords.includes(lower)) return lower;
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      });
      return `${words.join('_')}.png`;
    };
  }

  async function init() {
    const hasAccess = await checkAdminAccess();
    if (!hasAccess) return;

    buildStylesOnce();
    wireSegmentToggle();

    const committeeSelect = document.getElementById('committeeSelect');
    const loadBtn = document.getElementById('loadBtn');
    const saveBtn = document.getElementById('saveBtn');
    const resetBtn = document.getElementById('resetBtn');
    const container = document.getElementById('delegationsContainer');

    // state per screen
    const state = {
      committeeId: null,
      segment: '8e9',
      delegations: [],
      countryOptions: [],
      originalCountries: {},
      dirtyCountries: {}
    };

    const clearContainer = (msg) => {
      container.innerHTML = `<div class="dashboard-empty">${msg}</div>`;
    };

    loadBtn.addEventListener('click', async () => {
      const committeeId = committeeSelect.value ? Number(committeeSelect.value) : null;
      const segment = getSelectedSegment();

      if (!committeeId) {
        clearContainer('Selecione um comitê antes de carregar.');
        return;
      }

      setLoading(loadBtn, true);
      try {
        state.committeeId = committeeId;
        state.segment = segment;
        state.delegations = [];
        state.countryOptions = [];
        state.originalCountries = {};
        state.dirtyCountries = {};

        clearContainer('Carregando delegações...');

        const [data, countryCatalog] = await Promise.all([
          fetchDelegationsForAdmin(committeeId, segment),
          fetchCountryCatalog(committeeId, segment)
        ]);
        if (!data || !Array.isArray(data.delegations)) {
          clearContainer('Não foi possível carregar delegações para este comitê/segmento.');
          return;
        }


        const delegations = Array.isArray(data.delegations) ? data.delegations : [];
        state.delegations = delegations;
        state.countryOptions = Array.from(new Set([
          ...countryCatalog,
          ...delegations
            .map((d) => String(d.country || '').trim())
            .filter(Boolean)
        ]));

        for (const d of delegations) {
          const c = String(d.country || '').trim();
          state.originalCountries[delegationKey(d)] = c;
        }

        // Header stats
        const withCountry = delegations.filter(d => String(d.country || '').trim()).length;
        document.getElementById('statsTotal').textContent = String(delegations.length);
        document.getElementById('statsWithCountry').textContent = String(withCountry);

        if (!delegations.length) {
          clearContainer('Nenhuma delegação encontrada para este comitê/segmento.');
          return;
        }

        // Render list
        container.innerHTML = `
          <div class="delegations-table">
            <div class="delegations-table-head">
              <div>#</div>
              <div>Delegação</div>
              <div>País</div>
              <div></div>
            </div>
            <div id="delegationsRows" style="display:grid; gap:0.75rem;"></div>
          </div>
        `;

        const rowsWrap = document.getElementById('delegationsRows');
        rowsWrap.innerHTML = '';

        for (let i = 0; i < delegations.length; i++) {
          const d = delegations[i];
          const row = renderDelegationRow(d, i, state.countryOptions, state);
          rowsWrap.appendChild(row);
        }
      } catch (error) {
        clearContainer(`Erro: ${error.message}`);
      } finally {
        setLoading(loadBtn, false);
      }
    });

    resetBtn.addEventListener('click', () => {
      state.dirtyCountries = {};
      // Reset selects to original
      const selects = container.querySelectorAll('select.country-select');
      selects.forEach((sel) => {
        const id = sel.dataset.delegationId;
        const original = state.originalCountries[id] || '';
        sel.value = original;

        const row = sel.closest('[data-row-delegation-id]');
        if (!row) return;
        row.dataset.dirty = 'false';
        const badge = row.querySelector('[data-dirty-badge]');
        if (badge) {
          badge.textContent = ' ';
          badge.style.visibility = 'hidden';
        }
      });
    });

    saveBtn.addEventListener('click', async () => {
      if (!state.committeeId) {
        alert('Selecione um comitê e carregue as delegações antes de salvar.');
        return;
      }

      const entries = Object.entries(state.dirtyCountries)
        .filter(([, v]) => v !== undefined);

      if (!entries.length) {
        alert('Nenhuma alteração para salvar.');
        return;
      }

      const payload = {
        committee: state.committeeId,
        segment: state.segment,
        delegations: entries.map(([delegationId, country]) => ({
          delegationId,
          country: country || ''
        }))
      };

      setLoading(saveBtn, true);
      try {
        await saveCountries(payload);
        // Reload to reflect persisted state
        await loadBtn.click();
        state.dirtyCountries = {};
        window.MaxOnuNotify?.success?.('Países salvos com sucesso!');
      } catch (error) {
        window.MaxOnuNotify?.error?.(error.message);
        alert(error.message);
      } finally {
        setLoading(saveBtn, false);
      }
    });

    // initial: nothing
    clearContainer('Selecione um comitê e clique em “Carregar delegações”.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

