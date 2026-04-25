function getToken() {
    return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
}

const COMMITTEE_LABELS = {
    1: 'Conselho de Direitos Humanos (CDH - 2026)',
    2: 'Assembleia Geral das Nações Unidas (AGNU)',
    3: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global',
    6: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    7: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)'
};

async function parseJson(response) {
    return response.json().catch(() => ({}));
}

function buildCommitteeOptions() {
    return ['<option value="">Selecione</option>']
        .concat(Array.from({ length: 7 }, (_, index) => `<option value="${index + 1}">${COMMITTEE_LABELS[index + 1]}</option>`))
        .join('');
}

async function loadRegistrationPage() {
    const token = getToken();
    if (!token) {
        window.location.href = '/login?next=/inscricao';
        return;
    }

    const [userContext, statusResponse] = await Promise.all([
        window.MaxOnuSession?.getAuthContext?.() || fetch('/api/me', {
            headers: { 'Authorization': `Bearer ${token}` }
        }).then((response) => response.ok ? parseJson(response) : null),
        fetch('/api/delegation/status', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
    ]);

    const user = userContext?.user || userContext;
    if (!user) {
        window.location.href = '/login?next=/inscricao';
        return;
    }
    if (user.role !== 'candidate') {
        window.location.href = '/profile';
        return;
    }

    const status = await parseJson(statusResponse);
    const form = document.getElementById('registrationForm');
    const feedback = document.getElementById('registrationFeedback');
    const lead = document.getElementById('registrationLead');

    document.getElementById('registrationClassGroup').value = user.classGroup || '';

    if (!status.registrationOpen) {
        const waitingReveal = !status.revealPassed;
        lead.textContent = waitingReveal
            ? 'As inscrições serão liberadas assim que a contagem regressiva terminar.'
            : 'As inscrições foram fechadas temporariamente pela coordenação.';
        feedback.textContent = waitingReveal
            ? 'Ainda não é possível enviar o formulário.'
            : 'O formulário está fechado no momento.';
        const lockedLabel = waitingReveal ? 'Sigilo até a abertura' : 'Inscrições encerradas';
        document.getElementById('firstChoice').innerHTML = `<option value="">${lockedLabel}</option>`;
        document.getElementById('secondChoice').innerHTML = `<option value="">${lockedLabel}</option>`;
        document.getElementById('thirdChoice').innerHTML = `<option value="">${lockedLabel}</option>`;
        form.querySelectorAll('input, select, button').forEach((field) => {
            field.disabled = true;
        });
        return;
    }

    document.getElementById('firstChoice').innerHTML = buildCommitteeOptions();
    document.getElementById('secondChoice').innerHTML = buildCommitteeOptions();
    document.getElementById('thirdChoice').innerHTML = buildCommitteeOptions();

    lead.textContent = status.registration?.submittedAt
        ? 'Sua inscrição já foi enviada. Você pode ajustar as escolhas se precisar.'
        : 'Preencha as três preferências de comitê e envie a inscrição.';

    if (status.registration?.submittedAt) {
        document.getElementById('firstChoice').value = status.registration.firstChoice;
        document.getElementById('secondChoice').value = status.registration.secondChoice;
        document.getElementById('thirdChoice').value = status.registration.thirdChoice;
        document.getElementById('teamSize').value = '2';
        feedback.textContent = 'Altere os campos e envie novamente se quiser atualizar suas preferências.';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const safeLoadRegistrationPage = () => loadRegistrationPage().catch((error) => {
        console.error(error);
        document.getElementById('registrationFeedback').textContent = 'Erro ao carregar a página de inscrição.';
    });

    safeLoadRegistrationPage();
    document.addEventListener('delegation-updated', safeLoadRegistrationPage);

    document.getElementById('registrationForm')?.addEventListener('submit', async (event) => {
        event.preventDefault();

        const button = event.target.querySelector('button[type="submit"]');
        const feedback = document.getElementById('registrationFeedback');
        button.disabled = true;
        feedback.textContent = 'Enviando inscrição...';

        try {
            const payload = {
                firstChoice: Number(document.getElementById('firstChoice').value),
                secondChoice: Number(document.getElementById('secondChoice').value),
                thirdChoice: Number(document.getElementById('thirdChoice').value),
                teamSize: 2
            };

            const response = await fetch('/api/delegation/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getToken()}`
                },
                body: JSON.stringify(payload)
            });

            const data = await parseJson(response);
            if (!response.ok) {
                throw new Error(data.error || 'Não foi possível concluir sua inscrição.');
            }

            feedback.textContent = data.message || 'Inscrição enviada com sucesso.';
            document.dispatchEvent(new CustomEvent('delegation-updated'));
            setTimeout(() => {
                window.location.href = '/profile';
            }, 900);
        } catch (error) {
            feedback.textContent = error.message || 'Erro ao enviar inscrição.';
        } finally {
            button.disabled = false;
        }
    });
});
