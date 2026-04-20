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

function buildDelegationCards(committees) {
    return committees.map((committee) => `
        <div class="committee-card committee-card-detailed">
            <span class="committee-number">Comitê ${committee.id}</span>
            <h3>${committee.shortTitle}</h3>
            <p>${committee.title || 'Tema em definição. O conteúdo detalhado desta delegação será publicado em seguida.'}</p>
            <button class="view-button" disabled>Detalhes da delegação em breve</button>
        </div>
    `).join('');
}

async function fetchCommittees() {
    const response = await fetch('/api/committees');
    if (!response.ok) {
        throw new Error('Committees are still locked');
    }
    return response.json();
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
        const data = await fetchCommittees();
        grid.innerHTML = buildDelegationCards(data.committees);
        message.textContent = 'As delegações foram liberadas após o fim da contagem regressiva.';
    } catch (error) {
        grid.innerHTML = buildLockedCards();
        message.textContent = 'Nenhuma página pública desta seção revela temas antes do fim da contagem. Quando chegar a hora, os cards abaixo serão liberados automaticamente.';
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
