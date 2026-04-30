const COMMITTEES_CACHE_KEY = 'maxonu_committees_cache_v1';
const REVEAL_STATUS_CACHE_KEY = 'maxonu_reveal_status_cache_v1';
const COMMITTEE_CATALOG = [
    { id: 1, displayName: 'Conselho de Direitos Humanos (CDH - 2026)', shortTitle: 'CDH - 2026', title: 'O Paradoxo da Hiperconectividade: Regulamentação da Vigilância Massiva, Ética da Inteligência Artificial e Proteção da Democracia na Era do Big Data' },
    { id: 2, displayName: 'Assembleia Geral das Nações Unidas (AGNU)', shortTitle: 'AGNU', title: 'Guerra, Multipolaridade e Disputas Territoriais: Desafios à Soberania, Segurança Global e Justiça Internacional no Século XXI' },
    { id: 3, displayName: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)', shortTitle: 'ACNUR', title: 'Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias' },
    { id: 4, displayName: 'Bioética e Genética Humana', shortTitle: 'Bioética e Genética Humana', title: 'Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e aos direitos das futuras gerações' },
    { id: 5, displayName: 'Nova Ordem Global', shortTitle: 'Nova Ordem Global', title: 'A Nova Ordem Global em Disputa: Recursos Estratégicos, Poder e os Limites do Capitalismo no Século XXI' },
{ id: 6, displayName: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)', shortTitle: 'UNHRC', title: 'Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado' },
    { id: 7, displayName: 'ONU Mulheres (CSW/2026)', shortTitle: 'CSW/2026', title: 'Vozes, Leis e Limites: O Desafio de Enfrentar a Violência contra Mulheres' }
];

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

const LOCK_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;

function buildLockedCards() {
    return COMMITTEE_CATALOG.map((committee) => {
        const lockedTitle = 'Sigilo diplomático';
        const lockedText = 'As informações deste comitê serão reveladas somente quando a contagem regressiva terminar.';

        return `
            <div class="committee-card committee-card-detailed committee-card-locked">
                <span class="committee-number">Comitê ${committee.id}</span>
                <div class="committee-lock-icon">${LOCK_SVG}</div>
                <h3>${lockedTitle}</h3>
                <p>${lockedText}</p>
            </div>
        `;
    }).join('');
}

function buildHomeCards(committees) {
    return committees.map((committee) => `
        <div class="committee-card committee-card-detailed ${committee.id === 7 ? 'committee-card-placeholder' : ''}">
            <span class="committee-number">${committee.displayName || committee.shortTitle}</span>
            <h3>${committee.displayName || committee.shortTitle}</h3>
            <p>${committee.title || 'Tema em definição. Este espaço permanece aberto para a formulação final do comitê.'}</p>
        </div>
    `).join('');
}

function buildSoonDelegationCards() {
    return COMMITTEE_CATALOG.map((committee) => `
        <div class="committee-card committee-card-detailed">
            <span class="committee-number">${committee.displayName}</span>
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
        const reveal = await fetchRevealStatus();
        if (!reveal?.revealed) {
            sessionStorage.removeItem(COMMITTEES_CACHE_KEY);
            grid.innerHTML = buildLockedCards();
            message.textContent = 'Os comitês da edição 2026 seguem sob sigilo e serão revelados automaticamente quando a contagem regressiva chegar ao fim.';
            return;
        }

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
