/**
 * reactions.js — Sistema de Reações
 * Uso: window.MaxOnuReactions.attachReactions(containerEl, targetType, targetId)
 */

const EMOJIS       = ['👍', '❤️', '😂', '😮', '🎉'];
const EMOJI_LABELS = { '👍': 'Curtir', '❤️': 'Amei', '😂': 'Haha', '😮': 'Uau', '🎉': 'Parabéns' };

/* ── Auth ─────────────────────────────────────────── */
function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token') || '';
}
function isLoggedIn() {
    const t = getToken();
    return Boolean(t && t !== 'null' && t !== 'undefined' && t.trim());
}

/* ── API ──────────────────────────────────────────── */
async function fetchReactions(type, id) {
    try {
        const r = await fetch(`/api/reactions?targetType=${type}&targetId=${encodeURIComponent(id)}`);
        return r.ok ? r.json() : { counts: {} };
    } catch { return { counts: {} }; }
}

async function fetchMyReactions(type, id) {
    if (!isLoggedIn()) return { emojis: [] };
    try {
        const r = await fetch(`/api/reactions/mine?targetType=${type}&targetId=${encodeURIComponent(id)}`, {
            headers: { Authorization: `Bearer ${getToken()}` }
        });
        return r.ok ? r.json() : { emojis: [] };
    } catch { return { emojis: [] }; }
}

async function toggleReaction(type, id, emoji) {
    const r = await fetch('/api/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ targetType: type, targetId: id, emoji })
    });
    if (!r.ok) throw new Error();
    return r.json();
}

/* ── HTML builders ────────────────────────────────── */
function chipHTML(emoji, count, active) {
    return `<button type="button"
        class="rxn-chip${active ? ' is-active' : ''}"
        data-emoji="${emoji}"
        aria-pressed="${active}"
        aria-label="${EMOJI_LABELS[emoji]}: ${count}">
        <span class="rxn-chip-emoji emoji-styled emoji-in-chip" aria-hidden="true">${emoji}</span>
        <span class="rxn-chip-count">${count}</span>
    </button>`;
}

function buildBar(counts, mine, type, id) {
    const active = EMOJIS.filter(e => counts[e]);
    const chips  = active.map(e => chipHTML(e, counts[e], mine.includes(e))).join('');

    const pickerBtns = EMOJIS.map(e => `
        <button type="button"
            class="rxn-picker-btn${mine.includes(e) ? ' is-active' : ''}"
            data-emoji="${e}"
            aria-label="${EMOJI_LABELS[e]}"
            aria-pressed="${mine.includes(e)}">
            <span class="rxn-picker-emoji emoji-styled emoji-interactive" aria-hidden="true">${e}</span>
            <span class="rxn-picker-label">${EMOJI_LABELS[e]}</span>
        </button>`).join('');

    return `<div class="rxn-bar" data-target-type="${type}" data-target-id="${id}" role="group" aria-label="Reações">
        <div class="rxn-chips" aria-live="polite">${chips}</div>
        <div class="rxn-add-wrap">
            <button type="button" class="rxn-add-btn"
                aria-label="Adicionar reação"
                aria-expanded="false"
                aria-haspopup="true"
                title="${isLoggedIn() ? 'Adicionar reação' : 'Faça login para reagir'}">
                <svg class="rxn-add-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                    <circle cx="10" cy="10" r="8.5" stroke="currentColor" stroke-width="1.4"/>
                    <path d="M7 10.5c.4.9 1.3 1.5 3 1.5s2.6-.6 3-1.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
                    <circle cx="7.5" cy="8" r="0.9" fill="currentColor"/>
                    <circle cx="12.5" cy="8" r="0.9" fill="currentColor"/>
                    <path d="M10 2v1M10 17v1M2 10h1M17 10h1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".4"/>
                </svg>
                <span class="rxn-add-plus" aria-hidden="true">+</span>
            </button>
            <div class="rxn-picker" role="listbox" aria-label="Escolha uma reação" hidden>
                ${pickerBtns}
            </div>
        </div>
    </div>`;
}

/* ── DOM updates ──────────────────────────────────── */
function refreshChips(bar, counts, mine) {
    const active = EMOJIS.filter(e => counts[e]);
    bar.querySelector('.rxn-chips').innerHTML = active.map(e => chipHTML(e, counts[e], mine.includes(e))).join('');

    bar.querySelectorAll('.rxn-picker-btn').forEach(btn => {
        const on = mine.includes(btn.dataset.emoji);
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on);
    });
}

function popChip(bar, emoji) {
    const chip = bar.querySelector(`.rxn-chip[data-emoji="${emoji}"]`);
    if (!chip) return;
    chip.classList.remove('did-pop');
    void chip.offsetWidth;
    chip.classList.add('did-pop');
}

/* ── Picker positioning ───────────────────────────── */
function positionPicker(bar) {
    const picker = bar.querySelector('.rxn-picker');
    const wrap   = bar.querySelector('.rxn-add-wrap');
    if (!picker || !wrap) return;
    picker.classList.remove('opens-up', 'opens-right');
    const { bottom, left } = wrap.getBoundingClientRect();
    if (window.innerHeight - bottom < 80)  picker.classList.add('opens-up');
    if (window.innerWidth  - left   < 300) picker.classList.add('opens-right');
}

function openPicker(bar) {
    positionPicker(bar);
    const picker = bar.querySelector('.rxn-picker');
    const btn    = bar.querySelector('.rxn-add-btn');
    picker.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    btn.classList.add('is-open');
}

function closePicker(bar) {
    const picker = bar.querySelector('.rxn-picker');
    const btn    = bar.querySelector('.rxn-add-btn');
    if (!picker) return;
    picker.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    btn.classList.remove('is-open');
}

function closeAll(except = null) {
    document.querySelectorAll('.rxn-bar').forEach(b => { if (b !== except) closePicker(b); });
}

/* ── Interaction ──────────────────────────────────── */
async function react(bar, emoji) {
    if (!isLoggedIn()) {
        window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname)}`;
        return;
    }
    const { targetType: type, targetId: id } = bar.dataset;

    // Optimistic loading state
    const chip = bar.querySelector(`.rxn-chip[data-emoji="${emoji}"]`);
    if (chip) chip.classList.add('is-loading');

    closePicker(bar);

    try {
        const data = await toggleReaction(type, id, emoji);
        refreshChips(bar, data.counts, data.myEmojis);
        popChip(bar, emoji);
    } catch { /* silent */ } finally {
        const c = bar.querySelector(`.rxn-chip[data-emoji="${emoji}"]`);
        if (c) c.classList.remove('is-loading');
    }
}

function bindBar(bar) {
    bar.querySelector('.rxn-add-btn').addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = !bar.querySelector('.rxn-picker').hidden;
        isOpen ? closePicker(bar) : (closeAll(bar), openPicker(bar));
    });

    bar.addEventListener('click', e => {
        const btn = e.target.closest('[data-emoji]');
        if (!btn) return;
        e.stopPropagation();
        react(bar, btn.dataset.emoji);
    });

    bar.addEventListener('keydown', e => {
        if (e.key === 'Escape') closePicker(bar);
    });
}

/* ── Global listeners ─────────────────────────────── */
document.addEventListener('click',  e => { if (!e.target.closest('.rxn-bar')) closeAll(); }, { passive: true });
document.addEventListener('scroll', () => closeAll(), { passive: true, capture: true });

/* ── Public API ───────────────────────────────────── */
async function attachReactions(container, type, id) {
    if (!container || !id) return;
    container.innerHTML = '<div class="rxn-skeleton"></div>';

    const [{ counts }, { emojis: mine }] = await Promise.all([
        fetchReactions(type, id),
        fetchMyReactions(type, id)
    ]);

    container.innerHTML = buildBar(counts, mine, type, id);
    bindBar(container.querySelector('.rxn-bar'));
}

window.MaxOnuReactions = { attachReactions };
