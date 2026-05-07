(function () {
    'use strict';

    function getToken() {
        return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    }

    function showFeedback(el, message, type) {
        el.textContent = message;
        el.className = `newsletter-feedback is-${type}`;
        el.hidden = false;
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideFeedback(el) {
        el.hidden = true;
    }

    function setLoading(btn, loading) {
        if (loading) {
            btn.dataset.orig = btn.textContent;
            btn.textContent = 'Aguarde...';
            btn.disabled = true;
        } else {
            btn.textContent = btn.dataset.orig || btn.textContent;
            btn.disabled = false;
        }
    }

    function getDefaultAvatar(gender) {
        return gender === 'feminino' ? '/images/profile_female.png' : '/images/profile_male.png';
    }

    function getCommitteeLabel(value) {
        const committees = {
            '1': 'CDH 2026 — O Paradoxo da Hiperconectividade',
            '2': 'AGNU — Guerra, Multipolaridade e Disputas Territoriais',
            '3': 'ACNUR — Mobilidade humana e crises humanitárias',
            '4': 'Bioética e Genética Humana',
            '5': 'Nova Ordem Global — Recursos Estratégicos e Capitalismo',
            '6': 'UNHRC — Identidade, memória e poder',
            '7': 'ONU Mulheres (CSW/2026) — Violência contra Mulheres'
        };
        return committees[String(value)] || 'Não definido';
    }

    async function checkAdminAccess() {
        const token = getToken();
        if (!token) {
            window.location.href = '/login';
            return false;
        }

        try {
            const res = await fetch('/api/user/profile', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            
            if (!data.isAdmin && !data.isPress) {
                window.location.href = '/';
                return false;
            }
            
            return true;
        } catch (error) {
            window.location.href = '/';
            return false;
        }
    }

    function setupSizeSelector() {
        const sizeOptions = document.querySelectorAll('.size-option');
        const member3Group = document.getElementById('member3Group');
        const member3Input = document.getElementById('member3');

        sizeOptions.forEach(option => {
            option.addEventListener('click', () => {
                sizeOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                const radio = option.querySelector('input[type="radio"]');
                radio.checked = true;
                
                if (radio.value === '3') {
                    member3Group.style.display = 'block';
                    member3Input.required = true;
                } else {
                    member3Group.style.display = 'none';
                    member3Input.required = false;
                    member3Input.value = '';
                }
            });
        });
    }

    async function createDelegation(members, teamSize, committee) {
        const token = getToken();
        const res = await fetch('/api/delegation/admin/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ members, teamSize, committee })
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Erro ao criar delegação');
        }

        return data;
    }

    async function loadDelegations() {
        const token = getToken();
        const container = document.getElementById('delegationsList');

        try {
            const res = await fetch('/api/delegation/admin/list', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Erro ao carregar delegações');
            }

            const data = await res.json();
            const delegations = data.delegations || [];

            // Update stats
            updateStats(delegations);

            if (delegations.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">📋</div>
                        <p><strong>Nenhuma delegação criada ainda</strong></p>
                        <p>Use o formulário acima para criar a primeira delegação.</p>
                    </div>
                `;
                return;
            }

            renderDelegations(delegations);
            setupSearchAndFilter(delegations);

        } catch (error) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <p><strong>Erro ao carregar delegações</strong></p>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    function updateStats(delegations) {
        const totalDelegations = delegations.length;
        const totalMembers = delegations.reduce((sum, d) => sum + (d.members?.length || 0), 0);
        const totalDuplas = delegations.filter(d => d.teamSize === 2).length;
        const totalTrios = delegations.filter(d => d.teamSize === 3).length;

        document.getElementById('totalDelegations').textContent = totalDelegations;
        document.getElementById('totalMembers').textContent = totalMembers;
        document.getElementById('totalDuplas').textContent = totalDuplas;
        document.getElementById('totalTrios').textContent = totalTrios;
    }

    function renderDelegations(delegations, container = document.getElementById('delegationsList')) {
        container.innerHTML = delegations.map(delegation => {
            const members = delegation.members || [];
            const createdBy = delegation.createdBy || {};
            
            return `
                <div class="delegation-item" data-delegation-id="${delegation._id}" data-team-size="${delegation.teamSize}">
                    <div class="delegation-header">
                        <div class="delegation-id">Delegação #${delegation._id.slice(-6)}</div>
                        <div class="delegation-size-badge">
                            ${delegation.teamSize} ${delegation.teamSize === 2 ? 'integrantes' : 'integrantes'}
                        </div>
                    </div>
                    
                    <div class="delegation-members">
                        ${members.map(member => `
                            <div class="member-item">
                                <img src="${member.profileImageUrl || getDefaultAvatar(member.gender)}" 
                                     alt="${member.fullName}" 
                                     class="member-avatar"
                                     onerror="this.src='${getDefaultAvatar(member.gender)}'">
                                <div class="member-info">
                                    <div class="member-name">${member.fullName || member.username}</div>
                                    <div class="member-username">@${member.username} • ${member.classGroup || 'Turma não informada'}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                    
                    ${delegation.committee ? `
                        <div style="margin-top: 1rem; padding: 0.75rem; border-radius: 12px; background: rgba(74, 159, 212, 0.1); border: 1px solid rgba(74, 159, 212, 0.2);">
                            <strong style="color: var(--dash-ink); font-size: 0.85rem;">Comitê:</strong>
                            <p style="margin: 0.25rem 0 0; color: var(--dash-ink); font-size: 0.9rem;">${getCommitteeLabel(delegation.committee)}</p>
                        </div>
                    ` : ''}
                    
                    <div class="delegation-meta">
                        Criada por <strong>${createdBy.fullName || createdBy.username || 'Admin'}</strong> em ${new Date(delegation.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                    
                    <div class="delegation-actions">
                        <button type="button" class="action-btn action-btn-danger" data-action="delete" data-delegation-id="${delegation._id}">
                            🗑️ Dissolver delegação
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind delete buttons
        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const delegationId = btn.dataset.delegationId;
                if (!await MaxOnuNotify.confirm('Tem certeza que deseja dissolver esta delegação? Os integrantes serão notificados e poderão formar novas delegações.', 'Confirmar dissolução')) {
                    return;
                }

                setLoading(btn, true);
                try {
                    await deleteDelegation(delegationId);
                    await loadDelegations();
                } catch (error) {
                    MaxOnuNotify.error(error.message);
                } finally {
                    setLoading(btn, false);
                }
            });
        });
    }

    function setupSearchAndFilter(delegations) {
        const searchInput = document.getElementById('searchInput');
        const filterSize = document.getElementById('filterSize');
        const container = document.getElementById('delegationsList');

        function applyFilters() {
            const searchTerm = searchInput.value.toLowerCase().trim();
            const sizeFilter = filterSize.value;

            let filtered = delegations;

            // Filter by size
            if (sizeFilter !== 'all') {
                filtered = filtered.filter(d => d.teamSize === parseInt(sizeFilter));
            }

            // Filter by search term
            if (searchTerm) {
                filtered = filtered.filter(d => {
                    const members = d.members || [];
                    return members.some(m => 
                        (m.fullName || '').toLowerCase().includes(searchTerm) ||
                        (m.username || '').toLowerCase().includes(searchTerm) ||
                        (m.classGroup || '').toLowerCase().includes(searchTerm)
                    );
                });
            }

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <p><strong>Nenhuma delegação encontrada</strong></p>
                        <p>Tente ajustar os filtros de busca.</p>
                    </div>
                `;
            } else {
                renderDelegations(filtered, container);
            }
        }

        searchInput.addEventListener('input', applyFilters);
        filterSize.addEventListener('change', applyFilters);
    }

    async function deleteDelegation(delegationId) {
        const token = getToken();
        const res = await fetch(`/api/delegation/admin/${delegationId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Erro ao dissolver delegação');
        }

        return data;
    }

    async function init() {
        const hasAccess = await checkAdminAccess();
        if (!hasAccess) return;

        setupSizeSelector();
        await loadDelegations();

        // Form submission
        const form = document.getElementById('createDelegationForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const feedback = document.getElementById('createFeedback');
            const btn = document.getElementById('createBtn');
            
            const teamSize = parseInt(document.querySelector('input[name="teamSize"]:checked').value);
            const member1 = document.getElementById('member1').value.trim().toLowerCase();
            const member2 = document.getElementById('member2').value.trim().toLowerCase();
            const member3 = document.getElementById('member3').value.trim().toLowerCase();
            const committee = document.getElementById('committeeSelect').value;

            hideFeedback(feedback);

            // Validations
            if (!member1 || !member2) {
                showFeedback(feedback, 'Preencha pelo menos 2 integrantes.', 'error');
                return;
            }

            if (!committee) {
                showFeedback(feedback, 'Selecione um comitê.', 'error');
                return;
            }

            if (teamSize === 3 && !member3) {
                showFeedback(feedback, 'Para trio, preencha o 3º integrante.', 'error');
                return;
            }

            const members = teamSize === 3 ? [member1, member2, member3] : [member1, member2];

            // Check duplicates
            const uniqueMembers = new Set(members);
            if (uniqueMembers.size !== members.length) {
                showFeedback(feedback, 'Os integrantes devem ser diferentes.', 'error');
                return;
            }

            setLoading(btn, true);

            try {
                const result = await createDelegation(members, teamSize, committee);
                showFeedback(feedback, result.message || '✓ Delegação criada com sucesso!', 'success');
                form.reset();
                
                // Reset to dupla
                document.querySelector('input[name="teamSize"][value="2"]').checked = true;
                document.querySelectorAll('.size-option').forEach(opt => opt.classList.remove('active'));
                document.querySelector('.size-option').classList.add('active');
                document.getElementById('member3Group').style.display = 'none';
                document.getElementById('member3').required = false;
                document.getElementById('committeeSelect').value = '';

                // Reload list
                await loadDelegations();
            } catch (error) {
                showFeedback(feedback, error.message, 'error');
            } finally {
                setLoading(btn, false);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
