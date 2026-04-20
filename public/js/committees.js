const COMMITTEES_CACHE_KEY = 'maxonu_committees_cache_v1';
const REVEAL_STATUS_CACHE_KEY = 'maxonu_reveal_status_cache_v1';

function readCache(key, ttl) {
    try {
        const raw = sessionStorage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw);
        if (Date.now() - parsed.timestamp > ttl) {
            sessionStorage.removeItem(key);
            return null;
        }

        return parsed.data;
    } catch (error) {
        return null;
    }
}

function writeCache(key, data) {
    try {
        sessionStorage.setItem(key, JSON.stringify({
            timestamp: Date.now(),
            data
        }));
    } catch (error) {
        // Ignore cache write failures.
    }
}

function buildLockedCards() {
    return Array.from({ length: 7 }, (_, index) => {
        const committeeNumber = index + 1;
        const lockedTitle = committeeNumber === 7 ? 'Em definição' : 'Sigilo diplomático';
        const lockedText = committeeNumber === 7
            ? 'O sétimo comitê segue reservado e será divulgado apenas no momento oficial.'
            : 'Os detalhes deste comitê serão revelados somente quando a contagem regressiva terminar.';

        return `
            <div class="committee-card committee-card-detailed committee-card-locked">
                <span class="committee-number">Comitê ${committeeNumber}</span>
                <h3>${lockedTitle}</h3>
                <p>${lockedText}</p>
            </div>
        `;
    }).join('');
}

function buildHomeCards(committees) {
    return committees.map((committee) => `
        <div class="committee-card committee-card-detailed ${committee.id === 7 ? 'committee-card-placeholder' : ''}">
            <span class="committee-number">Comitê ${committee.id}</span>
            <h3>${committee.shortTitle}</h3>
            <p>${committee.title || 'Tema em definição. Este espaço permanece aberto para a formulação final do comitê.'}</p>
        </div>
    `).join('');
}

function buildSoonDelegationCards() {
    return Array.from({ length: 7 }, (_, index) => `
        <div class="committee-card committee-card-detailed">
            <span class="committee-number">Comitê ${index + 1}</span>
            <h3>Em breve</h3>
            <p>As delegações desta página serão lançadas depois, em uma divulgação própria.</p>
            <button class="view-button" disabled>Em breve</button>
        </div>
    `).join('');
}

async function fetchCommittees() {
    const cached = readCache(COMMITTEES_CACHE_KEY, 5 * 60 * 1000);
    if (cached) {
        return cached;
    }

    const response = await fetch('/api/committees');
    if (!response.ok) {
        throw new Error('Committees are still locked');
    }

    const data = await response.json();
    writeCache(COMMITTEES_CACHE_KEY, data);
    return data;
}

async function fetchRevealStatus() {
    const cached = readCache(REVEAL_STATUS_CACHE_KEY, 60 * 1000);
    if (cached) {
        return cached;
    }

    const response = await fetch('/api/reveal-status');
    const data = await response.json();
    writeCache(REVEAL_STATUS_CACHE_KEY, data);
    return data;
}

async function initHomeCommittees() {
    const grid = document.getElementById('committeesGrid');
    const message = document.getElementById('committeesMessage');
    if (!grid || !message) return;

    try {
        const data = await fetchCommittees();
        grid.innerHTML = buildHomeCards(data.committees);
        message.textContent = 'Os comitês da MaxOnu 2026 foram revelados.';
    } catch (error) {
        grid.innerHTML = buildLockedCards();
        message.textContent = 'Os comitês da edição 2026 seguem sob sigilo e serão revelados automaticamente quando a contagem regressiva chegar ao fim.';
    }
}

async function initDelegationsPage() {
    const grid = document.getElementById('delegationsGrid');
    const message = document.getElementById('delegationsMessage');
    if (!grid || !message) return;

    try {
        const data = await fetchRevealStatus();

        grid.innerHTML = buildSoonDelegationCards();
        message.textContent = data.revealed
            ? 'Em breve. As delegações serão lançadas depois, em uma publicação separada.'
            : 'Nenhuma página pública desta seção revela temas antes do fim da contagem. Quando ela terminar, esta página continuará como "Em breve" até o lançamento oficial.';
    } catch (error) {
        grid.innerHTML = buildSoonDelegationCards();
        message.textContent = 'Em breve. As delegações serão lançadas depois, em uma publicação separada.';
    }
}

window.MaxOnuCommittees = {
    initHomeCommittees,
    initDelegationsPage
};

document.addEventListener('DOMContentLoaded', () => {
    initHomeCommittees();
    initDelegationsPage();
});
