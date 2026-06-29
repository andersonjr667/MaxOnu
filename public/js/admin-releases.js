(function () {
  'use strict';

  const state = {
    user: null,
    registration: null,
    publicRelease: null,
    committeeRelease: null,
    loading: false
  };

  function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
  }

  function setButtonLoading(button, loading, loadingText) {
    if (!button) return;

    if (loading) {
      button.dataset.orig = button.textContent;
      button.textContent = loadingText || 'Aguarde...';
      button.disabled = true;
    } else {
      button.textContent = button.dataset.orig || button.textContent;
      button.disabled = false;
    }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function apiFetch(url, options = {}) {
    const token = getToken();
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  }

  function showError(message) {
    const box = document.getElementById('releaseErrorBox');
    const lead = document.getElementById('releaseErrorLead');
    if (!box || !lead) return;
    lead.textContent = message || 'Erro desconhecido.';
    box.hidden = false;
  }

  function hideError() {
    const box = document.getElementById('releaseErrorBox');
    if (box) box.hidden = true;
  }

  function setStatus(cardId, text, tone = 'neutral') {
    const card = document.getElementById(cardId);
    if (!card) return;

    const status = card.querySelector('[data-status]');
    if (status) status.textContent = text;
    card.dataset.tone = tone;
  }

  function setCardState(cardId, active) {
    const card = document.getElementById(cardId);
    if (!card) return;
    card.dataset.active = active ? 'true' : 'false';
  }

  function updateUi() {
    const regBtn = document.getElementById('releaseInscriptionsBtn');
    const comBtn = document.getElementById('releaseCommitteesBtn');
    const countryBtn = document.getElementById('releaseCountriesBtn');

    if (state.registration) {
      const open = Boolean(state.registration.registrationOpen);
      regBtn.textContent = open ? 'Fechar inscrições' : 'Abrir inscrições';
      setStatus(
        'releaseInscriptionsCard',
        open
          ? 'As inscrições estão abertas no momento.'
          : state.registration.revealPassed
            ? 'As inscrições estão fechadas manualmente.'
            : 'As inscrições ainda não abriram oficialmente.',
        open ? 'success' : 'neutral'
      );
      setCardState('releaseInscriptionsCard', open);
    }

    if (state.committeeRelease) {
      const publicCommittees = Boolean(state.committeeRelease.publicCommitteeReleased);
      const publicCountries = Boolean(state.committeeRelease.publicDelegationsReleased);
      comBtn.textContent = publicCommittees ? 'Ocultar comitês' : 'Liberar comitês';
      countryBtn.textContent = publicCountries ? 'Ocultar países' : 'Liberar países';

      setStatus(
        'releaseCommitteesCard',
        publicCommittees
          ? 'Os comitês estão visíveis ao público.'
          : 'Os comitês ainda permanecem ocultos.',
        publicCommittees ? 'success' : 'neutral'
      );

      setStatus(
        'releaseCountriesCard',
        publicCountries
          ? 'Os países já estão visíveis ao público.'
          : 'Os países ainda estão ocultos.',
        publicCountries ? 'success' : 'neutral'
      );

      setCardState('releaseCommitteesCard', publicCommittees);
      setCardState('releaseCountriesCard', publicCountries);
    }
  }

  async function refreshStatuses() {
    hideError();

    try {
      const [registrationRes, publicRes, committeeRes] = await Promise.all([
        apiFetch('/api/settings/registration-status'),
        apiFetch('/api/settings/public-release'),
        apiFetch('/api/settings/committee-release')
      ]);

      if (!registrationRes.response.ok) throw new Error(registrationRes.data.error || 'Erro ao carregar inscrições.');
      if (!publicRes.response.ok) throw new Error(publicRes.data.error || 'Erro ao carregar liberação de países.');
      if (!committeeRes.response.ok) throw new Error(committeeRes.data.error || 'Erro ao carregar liberação de comitês.');

      state.registration = registrationRes.data;
      state.publicRelease = publicRes.data;
      state.committeeRelease = committeeRes.data;

      updateUi();
    } catch (error) {
      showError(error.message || 'Não foi possível carregar os estados de liberação.');
      if (window.MaxOnuNotify?.error) {
        window.MaxOnuNotify.error(error.message || 'Não foi possível carregar os estados de liberação.');
      }
    }
  }

  async function toggleRegistration() {
    const button = document.getElementById('releaseInscriptionsBtn');
    if (!state.registration) return;

    const nextValue = !Boolean(state.registration.registrationManuallyClosed);
    setButtonLoading(button, true, nextValue ? 'Fechando...' : 'Abrindo...');

    try {
      const { response, data } = await apiFetch('/api/settings/registration-status', {
        method: 'PUT',
        body: JSON.stringify({ registrationManuallyClosed: nextValue })
      });

      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar inscrições.');
      state.registration = data;
      updateUi();
      if (window.MaxOnuNotify?.success) {
        window.MaxOnuNotify.success(data.message || 'Inscrições atualizadas.');
      }
    } catch (error) {
      showError(error.message || 'Erro ao atualizar inscrições.');
      if (window.MaxOnuNotify?.error) {
        window.MaxOnuNotify.error(error.message || 'Erro ao atualizar inscrições.');
      }
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function toggleCommittees() {
    const button = document.getElementById('releaseCommitteesBtn');
    if (!state.committeeRelease) return;

    const nextValue = !Boolean(state.committeeRelease.publicCommitteeReleased);
    setButtonLoading(button, true, nextValue ? 'Liberando...' : 'Ocultando...');

    try {
      const { response, data } = await apiFetch('/api/settings/committee-release', {
        method: 'PUT',
        body: JSON.stringify({ publicCommitteeReleased: nextValue })
      });

      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar comitês.');
      state.committeeRelease = data;
      updateUi();
      if (window.MaxOnuNotify?.success) {
        window.MaxOnuNotify.success(data.message || 'Comitês atualizados.');
      }
    } catch (error) {
      showError(error.message || 'Erro ao atualizar comitês.');
      if (window.MaxOnuNotify?.error) {
        window.MaxOnuNotify.error(error.message || 'Erro ao atualizar comitês.');
      }
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function toggleCountries() {
    const button = document.getElementById('releaseCountriesBtn');
    if (!state.publicRelease) return;

    const nextValue = !Boolean(state.publicRelease.publicDelegationsReleased);
    setButtonLoading(button, true, nextValue ? 'Liberando...' : 'Ocultando...');

    try {
      const { response, data } = await apiFetch('/api/settings/public-release', {
        method: 'PUT',
        body: JSON.stringify({ publicDelegationsReleased: nextValue })
      });

      if (!response.ok) throw new Error(data.error || 'Erro ao atualizar países.');
      state.publicRelease = data;
      if (state.committeeRelease) {
        state.committeeRelease.publicDelegationsReleased = data.publicDelegationsReleased;
      }
      updateUi();
      if (window.MaxOnuNotify?.success) {
        window.MaxOnuNotify.success(data.message || 'Países atualizados.');
      }
    } catch (error) {
      showError(error.message || 'Erro ao atualizar países.');
      if (window.MaxOnuNotify?.error) {
        window.MaxOnuNotify.error(error.message || 'Erro ao atualizar países.');
      }
    } finally {
      setButtonLoading(button, false);
    }
  }

  async function checkAccess() {
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
      if (!res.ok || (data?.role !== 'admin' && data?.isAdmin !== true)) {
        window.location.href = '/';
        return false;
      }

      return true;
    } catch (_) {
      window.location.href = '/';
      return false;
    }
  }

  function injectStyles() {
    if (document.getElementById('admin-releases-style')) return;

    const style = document.createElement('style');
    style.id = 'admin-releases-style';
    style.textContent = `
      #adminReleasesPanel {
        margin-top: 1.5rem;
        border: 1px solid rgba(74, 159, 212, 0.12);
        overflow: hidden;
      }

      .admin-release-shell {
        display: grid;
        gap: 1rem;
      }

      .admin-release-intro {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
        padding: 1rem 1.1rem;
        border-radius: 20px;
        background: linear-gradient(135deg, rgba(15, 58, 82, 0.07), rgba(74, 159, 212, 0.06));
        border: 1px solid rgba(74, 159, 212, 0.12);
      }

      .admin-release-kicker {
        display: inline-flex;
        align-items: center;
        padding: 0.28rem 0.6rem;
        border-radius: 999px;
        background: rgba(74, 159, 212, 0.12);
        color: #124056;
        font-size: 0.78rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 0.55rem;
      }

      .admin-release-intro h3 {
        margin: 0 0 0.35rem 0;
        font-size: 1.3rem;
      }

      .admin-release-intro p {
        margin: 0;
        color: var(--dash-muted);
        max-width: 68ch;
      }

      .admin-release-chip-row {
        display: flex;
        gap: 0.5rem;
        flex-wrap: wrap;
        align-items: flex-start;
      }

      .admin-release-chip {
        padding: 0.45rem 0.75rem;
        border-radius: 999px;
        background: rgba(255,255,255,0.9);
        border: 1px solid rgba(74, 159, 212, 0.16);
        color: var(--dash-ink);
        font-size: 0.82rem;
        font-weight: 700;
      }

      .admin-release-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
        gap: 1rem;
      }

      .admin-release-card {
        padding: 1rem;
        border-radius: 22px;
        background:
          radial-gradient(circle at top right, rgba(74, 159, 212, 0.08), transparent 32%),
          linear-gradient(180deg, rgba(255,255,255,0.98), rgba(246,250,253,0.96));
        border: 1px solid rgba(63, 87, 96, 0.09);
        box-shadow: 0 14px 40px rgba(17, 28, 36, 0.07);
        display: grid;
        gap: 1rem;
        min-height: 190px;
      }

      .admin-release-card[data-active="true"] {
        border-color: rgba(34, 197, 94, 0.22);
        box-shadow: 0 16px 36px rgba(34, 197, 94, 0.08);
      }

      .admin-release-card-top {
        display: flex;
        justify-content: space-between;
        gap: 1rem;
        align-items: flex-start;
      }

      .admin-release-tag {
        display: inline-flex;
        align-items: center;
        padding: 0.24rem 0.55rem;
        border-radius: 999px;
        background: rgba(15, 58, 82, 0.08);
        color: #114056;
        font-size: 0.74rem;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        margin-bottom: 0.55rem;
      }

      .admin-release-card h3 {
        margin: 0 0 0.4rem;
        font-size: 1.15rem;
      }

      .admin-release-card p {
        margin: 0;
        color: var(--dash-muted);
      }

      .admin-release-icon {
        width: 52px;
        height: 52px;
        border-radius: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(74, 159, 212, 0.1);
        color: #124056;
        flex: 0 0 auto;
      }

      .admin-release-icon svg {
        width: 25px;
        height: 25px;
      }

      .admin-release-icon-teal {
        background: rgba(20, 184, 166, 0.12);
        color: #0f6f68;
      }

      .admin-release-icon-green {
        background: rgba(34, 197, 94, 0.12);
        color: #18713d;
      }

      .admin-release-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: auto;
      }

      #releaseErrorBox {
        margin-top: 0.25rem;
      }

      [data-theme="dark"] #adminReleasesPanel {
        border-color: rgba(120, 171, 204, 0.14);
      }

      [data-theme="dark"] .admin-release-intro {
        background: linear-gradient(135deg, rgba(14, 26, 38, 0.96), rgba(15, 41, 59, 0.9));
        border-color: rgba(120, 171, 204, 0.12);
      }

      [data-theme="dark"] .admin-release-kicker,
      [data-theme="dark"] .admin-release-tag {
        background: rgba(74, 159, 212, 0.14);
        color: #e2f4ff;
      }

      [data-theme="dark"] .admin-release-chip {
        background: rgba(11, 18, 28, 0.88);
        color: #edf6ff;
        border-color: rgba(120, 171, 204, 0.14);
      }

      [data-theme="dark"] .admin-release-card {
        background:
          radial-gradient(circle at top right, rgba(74, 159, 212, 0.12), transparent 34%),
          linear-gradient(180deg, rgba(15, 23, 34, 0.98), rgba(10, 16, 24, 0.96));
        border-color: rgba(120, 171, 204, 0.14);
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
      }

      [data-theme="dark"] .admin-release-card h3,
      [data-theme="dark"] .admin-release-intro h3 {
        color: #f1f7ff;
      }

      [data-theme="dark"] .admin-release-card p,
      [data-theme="dark"] .admin-release-intro p {
        color: rgba(221, 232, 241, 0.78);
      }

      [data-theme="dark"] .admin-release-icon {
        background: rgba(74, 159, 212, 0.12);
        color: #dff3ff;
      }

      [data-theme="dark"] .admin-release-icon-teal {
        background: rgba(20, 184, 166, 0.14);
        color: #b8fbf1;
      }

      [data-theme="dark"] .admin-release-icon-green {
        background: rgba(34, 197, 94, 0.14);
        color: #d4ffe4;
      }

      [data-theme="dark"] .admin-release-card[data-active="true"] {
        border-color: rgba(45, 170, 95, 0.28);
      }
    `;

    document.head.appendChild(style);
  }

  function bindEvents() {
    document.getElementById('releaseInscriptionsBtn')?.addEventListener('click', toggleRegistration);
    document.getElementById('releaseCommitteesBtn')?.addEventListener('click', toggleCommittees);
    document.getElementById('releaseCountriesBtn')?.addEventListener('click', toggleCountries);
  }

  async function init() {
    injectStyles();

    const allowed = await checkAccess();
    if (!allowed) return;

    bindEvents();
    await refreshStatuses();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
