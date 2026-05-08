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
            const res = await fetch('/api/check-admin', {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            if (!res.ok) {
                console.error('Erro ao verificar permissões:', res.status);
                window.location.href = '/';
                return false;
            }
            
            const data = await res.json();
            console.log('Dados de permissão:', data);

            // Aceita admin, press ou coordinator
            const hasAccess = 
                data?.role === 'admin' || 
                data?.role === 'press' || 
                data?.role === 'coordinator' ||
                data?.isAdmin === true ||
                data?.isPress === true;

            if (!hasAccess) {
                console.error('Acesso negado. Role:', data?.role);
                window.location.href = '/';
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('Erro na verificação de acesso:', error);
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
                        <div class="empty-state-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2"/>
                            </svg>
                        </div>
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
                    <div class="empty-state-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                        </svg>
                    </div>
                    <p><strong>Erro ao carregar delegações</strong></p>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }

    function updateCommitteeChart(byCommittee) {
        // Committee chart removed
    }

    function updateStats(delegations) {
        const totalDelegations = delegations.length;
        const totalMembers = delegations.reduce((sum, d) => sum + (d.members?.length || 0), 0);
        const totalIndividuais = delegations.filter(d => d.teamSize === 1).length;
        const totalDuplas = delegations.filter(d => d.teamSize === 2).length;
        const totalTrios = delegations.filter(d => d.teamSize === 3).length;
        
        // Calcular delegações por comitê
        const byCommittee = {};
        delegations.forEach(d => {
            if (d.committee) {
                byCommittee[d.committee] = (byCommittee[d.committee] || 0) + 1;
            }
        });
        
        // Calcular delegações com país definido
        const withCountry = delegations.filter(d => d.country).length;
        const withoutCountry = delegations.length - withCountry;
        
        // Calcular taxa de completude
        const completionRate = totalDelegations > 0 
            ? Math.round(((totalDuplas + totalTrios) / totalDelegations) * 100)
            : 0;

        document.getElementById('totalDelegations').textContent = totalDelegations;
        document.getElementById('totalMembers').textContent = totalMembers;
        document.getElementById('totalIndividuais').textContent = totalIndividuais;
        document.getElementById('totalDuplas').textContent = totalDuplas;
        document.getElementById('totalTrios').textContent = totalTrios;
        document.getElementById('completionRate').textContent = `${completionRate}%`;
        document.getElementById('withCountry').textContent = withCountry;
        document.getElementById('withoutCountry').textContent = withoutCountry;
    }

    function renderDelegations(delegations, container = document.getElementById('delegationsList')) {
        container.innerHTML = delegations.map(delegation => {
            const members = delegation.members || [];
            const createdBy = delegation.createdBy || {};
            const isIndividual = delegation.teamSize === 1;
            
            return `
                <div class="delegation-item" data-delegation-id="${delegation._id}" data-team-size="${delegation.teamSize}">
                    <div class="delegation-header">
                        <div class="delegation-id">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                ${isIndividual ? '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>' : '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'}
                            </svg>
                            ${isIndividual ? 'Delegado Individual' : 'Delegação'} #${delegation._id.slice(-6)}
                        </div>
                        <div class="delegation-size-badge" style="${isIndividual ? 'background: linear-gradient(135deg, rgba(255, 140, 66, 0.25) 0%, rgba(255, 140, 66, 0.15) 100%); border-color: rgba(255, 140, 66, 0.4);' : ''}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87m-4-12a4 4 0 0 1 0 7.75"/>
                            </svg>
                            ${delegation.teamSize} ${delegation.teamSize === 1 ? 'integrante' : 'integrantes'}
                        </div>
                    </div>
                    
                    ${isIndividual ? `
                        <div style="margin-bottom: 1rem; padding: 0.75rem; border-radius: 12px; background: rgba(255, 140, 66, 0.08); border: 1px solid rgba(255, 140, 66, 0.15);">
                            <p style="margin: 0; color: var(--dash-ink); font-size: 0.85rem; font-weight: 600;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 0.25rem;">
                                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                </svg>
                                Este delegado ainda não formou uma delegação completa.
                            </p>
                        </div>
                    ` : ''}
                    
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
                    
                    ${delegation.country ? `
                        <div style="margin-top: 1rem; padding: 0.75rem; border-radius: 12px; background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.2);">
                            <strong style="color: var(--dash-ink); font-size: 0.85rem;">País:</strong>
                            <p style="margin: 0.25rem 0 0; color: var(--dash-ink); font-size: 0.9rem;">${delegation.country}</p>
                        </div>
                    ` : ''}
                    
                    <div class="delegation-meta">
                        Criada por <strong>${createdBy.fullName || createdBy.username || 'Admin'}</strong> em ${new Date(delegation.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </div>
                    
                    <div class="delegation-actions">
                        ${isIndividual ? `
                            <button type="button" class="action-btn" data-action="complete" data-delegation-id="${delegation._id}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                                </svg>
                                Completar delegação
                            </button>
                        ` : `
                            <button type="button" class="action-btn" data-action="edit" data-delegation-id="${delegation._id}">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                                </svg>
                                Editar delegação
                            </button>
                        `}
                        <button type="button" class="action-btn action-btn-danger" data-action="delete" data-delegation-id="${delegation._id}">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            ${isIndividual ? 'Remover delegado' : 'Dissolver delegação'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        // Bind complete buttons (for individual delegations)
        container.querySelectorAll('[data-action="complete"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const delegationId = btn.dataset.delegationId;
                const delegation = delegations.find(d => d._id === delegationId);
                if (delegation && delegation.teamSize === 1) {
                    await openCompleteModal(delegation);
                } else {
                    window.MaxOnuNotify.error('Apenas delegações individuais podem ser completadas.');
                }
            });
        });

        // Bind edit buttons
        container.querySelectorAll('[data-action="edit"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const delegationId = btn.dataset.delegationId;
                const delegation = delegations.find(d => d._id === delegationId);
                if (delegation && delegation.teamSize > 1) {
                    await openEditModal(delegation);
                } else {
                    window.MaxOnuNotify.error('Delegações individuais não podem ser editadas. Use "Completar delegação".');
                }
            });
        });

        // Bind delete buttons
        container.querySelectorAll('[data-action="delete"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const delegationId = btn.dataset.delegationId;
                const delegation = delegations.find(d => d._id === delegationId);
                const isIndividual = delegation?.teamSize === 1;
                
                const confirmMessage = isIndividual
                    ? 'Tem certeza que deseja remover este delegado? Ele poderá formar novas delegações posteriormente.'
                    : 'Tem certeza que deseja dissolver esta delegação? Os integrantes serão notificados e poderão formar novas delegações.';
                
                const confirmTitle = isIndividual ? 'Confirmar remoção' : 'Confirmar dissolução';
                
                const confirmed = await window.MaxOnuNotify.confirm(
                    confirmMessage,
                    confirmTitle
                );
                
                if (!confirmed) return;

                setLoading(btn, true);
                try {
                    await deleteDelegation(delegationId);
                    const successMessage = isIndividual 
                        ? 'Delegado removido com sucesso!'
                        : 'Delegação dissolvida com sucesso!';
                    window.MaxOnuNotify.success(successMessage);
                    await loadDelegations();
                } catch (error) {
                    window.MaxOnuNotify.error(error.message);
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
                    ) || (d.country || '').toLowerCase().includes(searchTerm);
                });
            }

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                            </svg>
                        </div>
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

    async function updateDelegation(delegationId, updates) {
        const token = getToken();
        const res = await fetch(`/api/delegation/admin/${delegationId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify(updates)
        });

        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || 'Erro ao atualizar delegação');
        }

        return data;
    }

    function openCompleteModal(delegation) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'notification-overlay is-open';
            modal.style.zIndex = '10000';

            const members = delegation.members || [];
            const currentMember = members[0];

            modal.innerHTML = `
                <div class="notification-card delegation-modal-card" style="max-width: 700px; width: 92%; max-height: 90vh; overflow-y: auto;">
                    <div class="notification-header" style="border-bottom: 1px solid var(--dash-line); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h3 class="notification-title" style="margin: 0; font-size: 1.5rem;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 0.25rem;">
                                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Completar Delegação
                        </h3>
                        <p style="margin: 0.5rem 0 0; color: var(--dash-muted); font-size: 0.9rem;">Adicione mais integrantes para completar a delegação de <strong>${currentMember?.fullName || currentMember?.username}</strong>.</p>
                    </div>
                    <form id="completeDelegationForm" style="display: grid; gap: 0.875rem; padding: 0 4px;">
                        <div>
                            <label style="display: block; font-weight: 700; color: var(--dash-ink); margin-bottom: 0.625rem; font-size: 0.9rem;">
                                Tamanho final da delegação
                            </label>
                            <div class="delegation-size-selector" style="gap: 0.5rem;">
                                <label class="size-option active" style="padding: 0.875rem;">
                                    <input type="radio" name="completeTeamSize" value="2" checked>
                                    <span class="size-option-label" style="font-size: 0.875rem;">Dupla</span>
                                    <span class="size-option-desc" style="font-size: 0.75rem;">2 integrantes</span>
                                </label>
                                <label class="size-option" style="padding: 0.875rem;">
                                    <input type="radio" name="completeTeamSize" value="3">
                                    <span class="size-option-label" style="font-size: 0.875rem;">Trio</span>
                                    <span class="size-option-desc" style="font-size: 0.75rem;">3 integrantes</span>
                                </label>
                            </div>
                        </div>

                        <div class="member-input-group" style="background: rgba(74, 159, 212, 0.08); border-color: rgba(74, 159, 212, 0.2); padding: 0.875rem;">
                            <label style="font-size: 0.875rem;">Integrante atual</label>
                            <input type="text" value="${currentMember?.username || ''}" disabled style="background: rgba(255, 255, 255, 0.5); cursor: not-allowed; padding: 0.625rem 0.875rem; font-size: 0.9rem;">
                        </div>

                        <div class="member-input-group" style="padding: 0.875rem;">
                            <label for="completeMember2" style="font-size: 0.875rem;">Novo integrante 2 <span style="color: #d1495b;">*</span></label>
                            <input type="text" id="completeMember2" placeholder="Digite o usuário" required style="padding: 0.625rem 0.875rem; font-size: 0.9rem;">
                        </div>

                        <div class="member-input-group" id="completeMember3Group" style="display: none; padding: 0.875rem;">
                            <label for="completeMember3" style="font-size: 0.875rem;">Novo integrante 3</label>
                            <input type="text" id="completeMember3" placeholder="Digite o usuário" style="padding: 0.625rem 0.875rem; font-size: 0.9rem;">
                        </div>
                        
                        <div class="member-input-group" style="padding: 0.875rem;">
                            <label for="completeCommittee" style="font-size: 0.875rem;">Comitê</label>
                            <select id="completeCommittee" style="padding: 0.625rem 0.875rem; border-radius: 12px; border: 1.5px solid var(--dash-line); background: rgba(255, 255, 255, 0.95); font-size: 0.9rem; width: 100%; cursor: pointer;">
                                <option value="">Não alterar</option>
                                <option value="1" ${delegation.committee == 1 ? 'selected' : ''}>CDH 2026 — O Paradoxo da Hiperconectividade</option>
                                <option value="2" ${delegation.committee == 2 ? 'selected' : ''}>AGNU — Guerra, Multipolaridade e Disputas Territoriais</option>
                                <option value="3" ${delegation.committee == 3 ? 'selected' : ''}>ACNUR — Mobilidade humana e crises humanitárias</option>
                                <option value="4" ${delegation.committee == 4 ? 'selected' : ''}>Bioética e Genética Humana</option>
                                <option value="5" ${delegation.committee == 5 ? 'selected' : ''}>Nova Ordem Global — Recursos Estratégicos e Capitalismo</option>
                                <option value="6" ${delegation.committee == 6 ? 'selected' : ''}>UNHRC — Identidade, memória e poder</option>
                                <option value="7" ${delegation.committee == 7 ? 'selected' : ''}>ONU Mulheres (CSW/2026) — Violência contra Mulheres</option>
                            </select>
                        </div>

                        <div id="completeFeedback" class="newsletter-feedback" hidden></div>

                        <div class="notification-actions" style="margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--dash-line);">
                            <button type="button" class="notification-btn notification-btn-secondary" data-action="cancel" style="padding: 0.75rem 1.5rem;">Cancelar</button>
                            <button type="submit" class="notification-btn notification-btn-primary" style="padding: 0.75rem 1.5rem;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 0.25rem;">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Completar delegação
                            </button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            const form = modal.querySelector('#completeDelegationForm');
            const feedback = modal.querySelector('#completeFeedback');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const sizeOptions = modal.querySelectorAll('.size-option');
            const member3Group = modal.querySelector('#completeMember3Group');
            const member3Input = modal.querySelector('#completeMember3');

            // Setup size selector
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

            const closeModal = () => {
                modal.classList.remove('is-open');
                setTimeout(() => modal.remove(), 300);
                resolve(false);
            };

            cancelBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideFeedback(feedback);

                const submitBtn = form.querySelector('button[type="submit"]');
                const teamSize = parseInt(document.querySelector('input[name="completeTeamSize"]:checked').value);
                const member1 = currentMember.username.toLowerCase();
                const member2 = document.getElementById('completeMember2').value.trim().toLowerCase();
                const member3 = document.getElementById('completeMember3').value.trim().toLowerCase();
                const committee = document.getElementById('completeCommittee').value;

                // Validations
                if (!member2) {
                    showFeedback(feedback, 'Preencha o 2º integrante.', 'error');
                    return;
                }

                if (teamSize === 3 && !member3) {
                    showFeedback(feedback, 'Para trio, preencha o 3º integrante.', 'error');
                    return;
                }

                const newMembers = teamSize === 3 ? [member1, member2, member3] : [member1, member2];

                // Check duplicates
                const uniqueMembers = new Set(newMembers);
                if (uniqueMembers.size !== newMembers.length) {
                    showFeedback(feedback, 'Os integrantes devem ser diferentes.', 'error');
                    return;
                }

                setLoading(submitBtn, true);

                try {
                    const updateData = {
                        members: newMembers,
                        teamSize
                    };
                    
                    if (committee) {
                        updateData.committee = committee;
                    }
                    
                    await updateDelegation(delegation._id, updateData);
                    
                    window.MaxOnuNotify.success('Delegação completada com sucesso!');
                    await loadDelegations();
                    closeModal();
                    resolve(true);
                } catch (error) {
                    showFeedback(feedback, error.message, 'error');
                } finally {
                    setLoading(submitBtn, false);
                }
            });
        });
    }

    function openEditModal(delegation) {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'notification-overlay is-open';
            modal.style.zIndex = '10000';

            const members = delegation.members || [];
            const currentTeamSize = members.length;

            modal.innerHTML = `
                <div class="notification-card delegation-modal-card" style="max-width: 700px; width: 92%; max-height: 90vh; overflow-y: auto;">
                    <div class="notification-header" style="border-bottom: 1px solid var(--dash-line); padding-bottom: 1rem; margin-bottom: 1.5rem;">
                        <h3 class="notification-title" style="margin: 0; font-size: 1.5rem;">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 0.25rem;">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                            Editar Delegação
                        </h3>
                        <p style="margin: 0.5rem 0 0; color: var(--dash-muted); font-size: 0.9rem;">Modifique os integrantes ou o comitê da delegação.</p>
                    </div>
                    <form id="editDelegationForm" style="display: grid; gap: 0.875rem; padding: 0 4px;">
                        <div>
                            <label style="display: block; font-weight: 700; color: var(--dash-ink); margin-bottom: 0.625rem; font-size: 0.9rem;">
                                Tamanho da delegação
                            </label>
                            <div class="delegation-size-selector" style="gap: 0.5rem;">
                                <label class="size-option ${currentTeamSize === 2 ? 'active' : ''}" style="padding: 0.875rem;">
                                    <input type="radio" name="editTeamSize" value="2" ${currentTeamSize === 2 ? 'checked' : ''}>
                                    <span class="size-option-label" style="font-size: 0.875rem;">Dupla</span>
                                    <span class="size-option-desc" style="font-size: 0.75rem;">2 integrantes</span>
                                </label>
                                <label class="size-option ${currentTeamSize === 3 ? 'active' : ''}" style="padding: 0.875rem;">
                                    <input type="radio" name="editTeamSize" value="3" ${currentTeamSize === 3 ? 'checked' : ''}>
                                    <span class="size-option-label" style="font-size: 0.875rem;">Trio</span>
                                    <span class="size-option-desc" style="font-size: 0.75rem;">3 integrantes</span>
                                </label>
                            </div>
                        </div>

                        <div class="member-input-group" style="padding: 0.875rem;">
                            <label for="editMember1" style="font-size: 0.875rem;">Integrante 1 <span style="color: #d1495b;">*</span></label>
                            <input type="text" id="editMember1" value="${members[0]?.username || ''}" placeholder="Digite o usuário" required style="padding: 0.625rem 0.875rem; font-size: 0.9rem;">
                        </div>

                        <div class="member-input-group" style="padding: 0.875rem;">
                            <label for="editMember2" style="font-size: 0.875rem;">Integrante 2 <span style="color: #d1495b;">*</span></label>
                            <input type="text" id="editMember2" value="${members[1]?.username || ''}" placeholder="Digite o usuário" required style="padding: 0.625rem 0.875rem; font-size: 0.9rem;">
                        </div>

                        <div class="member-input-group" id="editMember3Group" style="${currentTeamSize === 3 ? '' : 'display: none;'} padding: 0.875rem;">
                            <label for="editMember3" style="font-size: 0.875rem;">Integrante 3</label>
                            <input type="text" id="editMember3" value="${members[2]?.username || ''}" placeholder="Digite o usuário" ${currentTeamSize === 3 ? 'required' : ''} style="padding: 0.625rem 0.875rem; font-size: 0.9rem;">
                        </div>
                        
                        <div class="member-input-group" style="padding: 0.875rem;">
                            <label for="editCommittee" style="font-size: 0.875rem;">Comitê</label>
                            <select id="editCommittee" style="padding: 0.625rem 0.875rem; border-radius: 12px; border: 1.5px solid var(--dash-line); background: rgba(255, 255, 255, 0.95); font-size: 0.9rem; width: 100%; cursor: pointer;">
                                <option value="">Não alterar</option>
                                <option value="1" ${delegation.committee == 1 ? 'selected' : ''}>CDH 2026 — O Paradoxo da Hiperconectividade</option>
                                <option value="2" ${delegation.committee == 2 ? 'selected' : ''}>AGNU — Guerra, Multipolaridade e Disputas Territoriais</option>
                                <option value="3" ${delegation.committee == 3 ? 'selected' : ''}>ACNUR — Mobilidade humana e crises humanitárias</option>
                                <option value="4" ${delegation.committee == 4 ? 'selected' : ''}>Bioética e Genética Humana</option>
                                <option value="5" ${delegation.committee == 5 ? 'selected' : ''}>Nova Ordem Global — Recursos Estratégicos e Capitalismo</option>
                                <option value="6" ${delegation.committee == 6 ? 'selected' : ''}>UNHRC — Identidade, memória e poder</option>
                                <option value="7" ${delegation.committee == 7 ? 'selected' : ''}>ONU Mulheres (CSW/2026) — Violência contra Mulheres</option>
                            </select>
                        </div>

                        <div id="editFeedback" class="newsletter-feedback" hidden></div>

                        <div class="notification-actions" style="margin-top: 0.5rem; padding-top: 1rem; border-top: 1px solid var(--dash-line);">
                            <button type="button" class="notification-btn notification-btn-secondary" data-action="cancel" style="padding: 0.75rem 1.5rem;">Cancelar</button>
                            <button type="submit" class="notification-btn notification-btn-primary" style="padding: 0.75rem 1.5rem;">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="display: inline-block; vertical-align: middle; margin-right: 0.25rem;">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                                Salvar alterações
                            </button>
                        </div>
                    </form>
                </div>
            `;

            document.body.appendChild(modal);

            const form = modal.querySelector('#editDelegationForm');
            const feedback = modal.querySelector('#editFeedback');
            const cancelBtn = modal.querySelector('[data-action="cancel"]');
            const sizeOptions = modal.querySelectorAll('.size-option');
            const member3Group = modal.querySelector('#editMember3Group');
            const member3Input = modal.querySelector('#editMember3');

            // Setup size selector
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

            const closeModal = () => {
                modal.classList.remove('is-open');
                setTimeout(() => modal.remove(), 300);
                resolve(false);
            };

            cancelBtn.addEventListener('click', closeModal);
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal();
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                hideFeedback(feedback);

                const submitBtn = form.querySelector('button[type="submit"]');
                const teamSize = parseInt(document.querySelector('input[name="editTeamSize"]:checked').value);
                const member1 = document.getElementById('editMember1').value.trim().toLowerCase();
                const member2 = document.getElementById('editMember2').value.trim().toLowerCase();
                const member3 = document.getElementById('editMember3').value.trim().toLowerCase();
                const committee = document.getElementById('editCommittee').value;

                // Validations
                if (!member1 || !member2) {
                    showFeedback(feedback, 'Preencha pelo menos 2 integrantes.', 'error');
                    return;
                }

                if (teamSize === 3 && !member3) {
                    showFeedback(feedback, 'Para trio, preencha o 3º integrante.', 'error');
                    return;
                }

                const newMembers = teamSize === 3 ? [member1, member2, member3] : [member1, member2];

                // Check duplicates
                const uniqueMembers = new Set(newMembers);
                if (uniqueMembers.size !== newMembers.length) {
                    showFeedback(feedback, 'Os integrantes devem ser diferentes.', 'error');
                    return;
                }

                setLoading(submitBtn, true);

                try {
                    const updateData = {
                        members: newMembers,
                        teamSize
                    };
                    
                    // Only include committee if it's not empty (not "Não alterar")
                    if (committee) {
                        updateData.committee = committee;
                    }
                    
                    await updateDelegation(delegation._id, updateData);
                    
                    window.MaxOnuNotify.success('Delegação atualizada com sucesso!');
                    await loadDelegations();
                    closeModal();
                    resolve(true);
                } catch (error) {
                    showFeedback(feedback, error.message, 'error');
                } finally {
                    setLoading(submitBtn, false);
                }
            });
        });
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
