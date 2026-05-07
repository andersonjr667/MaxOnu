(function () {
    'use strict';

    const COMMITTEE_NAMES = {
        1: 'CDH 2026', 2: 'AGNU', 3: 'ACNUR',
        4: 'Bioética', 5: 'Nova Ordem', 6: 'UNHRC', 7: 'ONU Mulheres'
    };

    const CHART_COLORS = [
        '#ff8c42', '#1f6fa8', '#ffd166', '#d1495b', '#06d6a0', '#118ab2', '#073b4c'
    ];

    function getToken() {
        return window.MaxOnuSession?.getToken?.() || localStorage.getItem('token');
    }

    function authHeaders() {
        return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` };
    }

    function isDark() {
        return document.documentElement.getAttribute('data-theme') === 'dark';
    }

    function chartDefaults() {
        const dark = isDark();
        return {
            gridColor: dark ? 'rgba(255,255,255,0.08)' : 'rgba(7,40,68,0.08)',
            tickColor: dark ? '#8fa3b8' : '#5f748c',
            tooltipBg: dark ? 'rgba(10,16,28,0.96)' : 'rgba(7,40,68,0.92)',
            tooltipText: '#ffffff',
            fontFamily: "'Manrope', sans-serif"
        };
    }

    function fillDates(data, days) {
        const map = {};
        for (const d of data) map[d._id] = d.count;
        const result = [];
        for (let i = days - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            // Formatar como DD/MM (padrão brasileiro)
            const [year, month, day] = key.split('-');
            const label = `${day}/${month}`;
            result.push({ label, value: map[key] || 0, date: d });
        }
        return result;
    }

    function buildLineChart(canvasId, labels, values, color, label) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return null;
        const { gridColor, tickColor, tooltipBg, tooltipText, fontFamily } = chartDefaults();

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    borderColor: color,
                    backgroundColor: color + '18',
                    borderWidth: 2.8,
                    pointRadius: 4,
                    pointHoverRadius: 7,
                    pointBackgroundColor: color,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    fill: true,
                    tension: 0.42,
                    segment: { borderDash: [] }
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: tooltipBg,
                        titleColor: tooltipText,
                        bodyColor: tooltipText,
                        padding: 12,
                        cornerRadius: 10,
                        titleFont: { size: 13, weight: 'bold', family: fontFamily },
                        bodyFont: { size: 12, family: fontFamily },
                        displayColors: false,
                        callbacks: {
                            title: function(context) {
                                // Formatar data no tooltip
                                return `${context[0].label}`;
                            },
                            label: function(context) {
                                // Formatar valor com separador brasileiro
                                const valor = context.parsed.y;
                                const formatted = valor.toLocaleString('pt-BR');
                                return formatted + ' ' + label.toLowerCase();
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { 
                            color: tickColor, 
                            maxTicksLimit: 8, 
                            font: { size: 11, family: fontFamily, weight: '500' },
                            padding: 8
                        }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor, drawBorder: false },
                        ticks: { 
                            color: tickColor, 
                            precision: 0, 
                            font: { size: 11, family: fontFamily, weight: '500' },
                            padding: 8,
                            // Formatar valores do eixo Y com padrão brasileiro
                            callback: function(value) {
                                return value.toLocaleString('pt-BR');
                            }
                        }
                    }
                }
            }
        });
    }

    function buildPieChart(canvasId, labels, values) {
        const ctx = document.getElementById(canvasId)?.getContext('2d');
        if (!ctx) return null;
        const { tooltipBg, tooltipText, fontFamily } = chartDefaults();

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: CHART_COLORS.slice(0, values.length),
                    borderWidth: 2.5,
                    borderColor: isDark() ? '#0f1a2e' : '#ffffff',
                    hoverOffset: 10,
                    hoverBorderWidth: 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: isDark() ? '#8fa3b8' : '#5f748c',
                            font: { size: 12, family: fontFamily, weight: '600' },
                            padding: 14,
                            boxWidth: 14,
                            boxHeight: 14,
                            useBorderRadius: true,
                            borderRadius: 3,
                            generateLabels: function(chart) {
                                const data = chart.data;
                                return data.labels.map((label, i) => ({
                                    text: label,
                                    fillStyle: data.datasets[0].backgroundColor[i],
                                    hidden: false,
                                    index: i
                                }));
                            }
                        }
                    },
                    tooltip: {
                        backgroundColor: tooltipBg,
                        titleColor: tooltipText,
                        bodyColor: tooltipText,
                        padding: 12,
                        cornerRadius: 10,
                        titleFont: { size: 13, weight: 'bold', family: fontFamily },
                        bodyFont: { size: 12, family: fontFamily },
                        callbacks: {
                            label: function(context) {
                                // Formatar valor com padrão brasileiro
                                const valor = context.parsed;
                                const formatted = valor.toLocaleString('pt-BR');
                                return ' ' + formatted + ' inscrições';
                            }
                        }
                    }
                }
            }
        });
    }

    let charts = {};

    function destroyChart(key) {
        if (charts[key]) { charts[key].destroy(); delete charts[key]; }
    }

    async function loadKPIs() {
        try {
            const res = await fetch('/api/analytics/overview', { headers: authHeaders() });
            if (!res.ok) {
                console.error('Erro ao carregar KPIs:', res.status);
                return;
            }
            const d = await res.json();
            document.getElementById('kpiUsers').textContent = (d.totalUsers ?? 0).toLocaleString('pt-BR');
            document.getElementById('kpiRegistered').textContent = (d.registeredUsers ?? 0).toLocaleString('pt-BR');
            document.getElementById('kpiAssigned').textContent = (d.assignedUsers ?? 0).toLocaleString('pt-BR');
            document.getElementById('kpiNewsletter').textContent = (d.totalNewsletter ?? 0).toLocaleString('pt-BR');
            document.getElementById('kpiPosts').textContent = (d.totalPosts ?? 0).toLocaleString('pt-BR');
            document.getElementById('kpiComments').textContent = (d.totalComments ?? 0).toLocaleString('pt-BR');
            document.querySelectorAll('.analytics-kpi-skeleton').forEach(el => el.classList.remove('analytics-kpi-skeleton'));
        } catch (err) {
            console.error('Erro ao carregar KPIs:', err);
        }
    }

    async function loadUsersChart(days) {
        try {
            const res = await fetch(`/api/analytics/users-over-time?days=${days}`, { headers: authHeaders() });
            if (!res.ok) return;
            const { data } = await res.json();
            const filled = fillDates(data, days);
            destroyChart('users');
            charts.users = buildLineChart('usersChart', filled.map(d => d.label), filled.map(d => d.value), '#1f6fa8', 'Cadastros');
        } catch (err) {
            console.error('Erro ao carregar gráfico de usuários:', err);
        }
    }

    async function loadRegistrationsChart(days) {
        try {
            const res = await fetch(`/api/analytics/registrations-over-time?days=${days}`, { headers: authHeaders() });
            if (!res.ok) return;
            const { data } = await res.json();
            const filled = fillDates(data, days);
            destroyChart('registrations');
            charts.registrations = buildLineChart('registrationsChart', filled.map(d => d.label), filled.map(d => d.value), '#ff8c42', 'Inscrições');
        } catch (err) {
            console.error('Erro ao carregar gráfico de inscrições:', err);
        }
    }

    async function loadCommitteeChart() {
        try {
            const res = await fetch('/api/analytics/committee-distribution', { headers: authHeaders() });
            if (!res.ok) return;
            const { data } = await res.json();
            if (!data.length) return;
            destroyChart('committee');
            charts.committee = buildPieChart(
                'committeeChart',
                data.map(d => COMMITTEE_NAMES[d._id] || `Comitê ${d._id}`),
                data.map(d => d.count)
            );
        } catch (err) {
            console.error('Erro ao carregar gráfico de comitês:', err);
        }
    }

    async function loadNewsletterChart(days) {
        try {
            const res = await fetch(`/api/analytics/newsletter-over-time?days=${days}`, { headers: authHeaders() });
            if (!res.ok) return;
            const { data } = await res.json();
            const filled = fillDates(data, days);
            destroyChart('newsletter');
            charts.newsletter = buildLineChart('newsletterChart', filled.map(d => d.label), filled.map(d => d.value), '#06d6a0', 'Inscrições');
        } catch (err) {
            console.error('Erro ao carregar gráfico de newsletter:', err);
        }
    }

    function setupPeriodButtons() {
        document.querySelectorAll('.analytics-period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const days = Number(btn.dataset.days);
                const chartType = btn.dataset.chart;

                // Update active state within same group
                const group = btn.closest('.analytics-period-selector');
                group?.querySelectorAll('.analytics-period-btn').forEach(b => b.classList.remove('is-active'));
                btn.classList.add('is-active');

                if (chartType === 'reg') loadRegistrationsChart(days);
                else if (chartType === 'nl') loadNewsletterChart(days);
                else loadUsersChart(days);
            });
        });
    }

    async function init() {
        const token = getToken();
        if (!token) {
            window.location.href = '/login';
            return;
        }

        // Check access - admin or coordinator
        try {
            const res = await fetch('/api/check-admin', { headers: authHeaders() });
            if (!res.ok) {
                window.location.href = '/dashboard';
                return;
            }
            const data = await res.json();
            if (!data.isAdmin && !data.isCoordinator) {
                window.location.href = '/dashboard';
                return;
            }
            const badge = document.getElementById('analyticsRoleBadge');
            if (badge) { 
                badge.textContent = data.isAdmin ? 'Administrador' : 'Coordenador'; 
                badge.dataset.role = data.isAdmin ? 'admin' : 'coordinator'; 
            }
        } catch (err) {
            console.error('Erro ao verificar permissões:', err);
            window.location.href = '/login';
            return;
        }

        setupPeriodButtons();

        // Load all data in parallel
        await Promise.all([
            loadKPIs(),
            loadUsersChart(7),
            loadRegistrationsChart(7),
            loadCommitteeChart(),
            loadNewsletterChart(7)
        ]);

        const updEl = document.getElementById('analyticsUpdated');
        if (updEl) {
            const now = new Date();
            updEl.textContent = `Atualizado em ${now.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
        }
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
