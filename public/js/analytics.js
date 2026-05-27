(function () {
    'use strict';

    const COMMITTEE_NAMES = {
        1: 'CDH 2026', 2: 'AGNU', 3: 'ACNUR',
        4: 'Bioética', 5: 'Nova Ordem', 6: 'UNHRC', 7: 'ONU Mulheres'
    };

    const CHART_COLORS = [
        '#ff8c42', '#1f6fa8', '#ffd166', '#d1495b', '#06d6a0', '#118ab2', '#073b4c'
    ];

    const chartPeriods = {
        users: 7,
        registrations: 7,
        newsletter: 7,
        engagement: 7,
        comparison: 30
    };

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

    function rerenderChartsForTheme() {
        if (!document.getElementById('kpiGrid')) return;

        loadUsersChart(chartPeriods.users);
        loadRegistrationsChart(chartPeriods.registrations);
        loadCommitteeChart();
        loadNewsletterChart(chartPeriods.newsletter);
        loadClassChart();
        loadEngagementChart(chartPeriods.engagement);
        loadComparisonChart(chartPeriods.comparison);
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
            document.getElementById('kpiConversion').textContent = (d.conversionRate ?? 0) + '%';
            document.getElementById('kpiAvgComments').textContent = (d.avgCommentsPerPost ?? 0);
            document.getElementById('kpiWeekUsers').textContent = (d.lastWeekUsers ?? 0).toLocaleString('pt-BR');
            
            // Update summary bar
            const completionRate = d.assignedUsers > 0 ? ((d.assignedUsers / d.registeredUsers) * 100).toFixed(1) : 0;
            document.getElementById('summaryCompletion').textContent = completionRate + '%';
            
            const growthRate = d.totalUsers > 0 ? ((d.lastWeekUsers / d.totalUsers) * 100).toFixed(1) : 0;
            const growthEl = document.getElementById('summaryGrowth');
            growthEl.textContent = '+' + growthRate + '%';
            growthEl.classList.add(parseFloat(growthRate) > 5 ? 'positive' : 'neutral');
            
            const engagementScore = d.totalPosts > 0 ? ((d.totalComments / d.totalPosts) * 10).toFixed(1) : 0;
            document.getElementById('summaryEngagement').textContent = engagementScore + '/10';
            
            const now = new Date();
            document.getElementById('summaryLastUpdate').textContent = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
            
            document.querySelectorAll('.analytics-kpi-skeleton').forEach(el => el.classList.remove('analytics-kpi-skeleton'));
            
            // Generate insights
            generateInsights(d);
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

    async function loadClassChart() {
        try {
            const res = await fetch('/api/analytics/class-distribution', { headers: authHeaders() });
            if (!res.ok) return;
            const { data } = await res.json();
            if (!data.length) return;
            
            const ctx = document.getElementById('classChart')?.getContext('2d');
            if (!ctx) return;
            const { gridColor, tickColor, tooltipBg, tooltipText, fontFamily } = chartDefaults();

            destroyChart('class');
            charts.class = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: data.map(d => d._id || 'Não definido'),
                    datasets: [{
                        label: 'Candidatos',
                        data: data.map(d => d.count),
                        backgroundColor: CHART_COLORS.map(c => c + '88'),
                        borderColor: CHART_COLORS,
                        borderWidth: 2,
                        borderRadius: 8,
                        borderSkipped: false
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
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
                            callbacks: {
                                label: function(context) {
                                    return ' ' + context.parsed.y.toLocaleString('pt-BR') + ' candidatos';
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false },
                            ticks: { color: tickColor, font: { size: 11, family: fontFamily, weight: '500' } }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: gridColor, drawBorder: false },
                            ticks: { 
                                color: tickColor, 
                                precision: 0,
                                font: { size: 11, family: fontFamily, weight: '500' },
                                callback: function(value) {
                                    return value.toLocaleString('pt-BR');
                                }
                            }
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Erro ao carregar gráfico de turmas:', err);
        }
    }

    async function loadEngagementChart(days) {
        try {
            const res = await fetch(`/api/analytics/engagement-over-time?days=${days}`, { headers: authHeaders() });
            if (!res.ok) return;
            const { posts, comments } = await res.json();
            
            const filledPosts = fillDates(posts, days);
            const filledComments = fillDates(comments, days);
            
            const ctx = document.getElementById('engagementChart')?.getContext('2d');
            if (!ctx) return;
            const { gridColor, tickColor, tooltipBg, tooltipText, fontFamily } = chartDefaults();

            destroyChart('engagement');
            charts.engagement = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: filledPosts.map(d => d.label),
                    datasets: [
                        {
                            label: 'Posts',
                            data: filledPosts.map(d => d.value),
                            borderColor: '#d1495b',
                            backgroundColor: '#d1495b18',
                            borderWidth: 2.8,
                            pointRadius: 4,
                            pointHoverRadius: 7,
                            pointBackgroundColor: '#d1495b',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            fill: true,
                            tension: 0.42
                        },
                        {
                            label: 'Comentários',
                            data: filledComments.map(d => d.value),
                            borderColor: '#118ab2',
                            backgroundColor: '#118ab218',
                            borderWidth: 2.8,
                            pointRadius: 4,
                            pointHoverRadius: 7,
                            pointBackgroundColor: '#118ab2',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2,
                            fill: true,
                            tension: 0.42
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                color: tickColor,
                                font: { size: 11, family: fontFamily, weight: '600' },
                                padding: 12,
                                boxWidth: 12,
                                boxHeight: 12,
                                useBorderRadius: true,
                                borderRadius: 3
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
                                    return ' ' + context.dataset.label + ': ' + context.parsed.y.toLocaleString('pt-BR');
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
                                callback: function(value) {
                                    return value.toLocaleString('pt-BR');
                                }
                            }
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Erro ao carregar gráfico de engajamento:', err);
        }
    }

    async function loadComparisonChart(days) {
        try {
            const [usersRes, regsRes] = await Promise.all([
                fetch(`/api/analytics/users-over-time?days=${days}`, { headers: authHeaders() }),
                fetch(`/api/analytics/registrations-over-time?days=${days}`, { headers: authHeaders() })
            ]);
            
            if (!usersRes.ok || !regsRes.ok) return;
            
            const usersData = await usersRes.json();
            const regsData = await regsRes.json();
            
            const filledUsers = fillDates(usersData.data, days);
            const filledRegs = fillDates(regsData.data, days);
            
            const ctx = document.getElementById('comparisonChart')?.getContext('2d');
            if (!ctx) return;
            const { gridColor, tickColor, tooltipBg, tooltipText, fontFamily } = chartDefaults();

            destroyChart('comparison');
            charts.comparison = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: filledUsers.map(d => d.label),
                    datasets: [
                        {
                            label: 'Cadastros',
                            data: filledUsers.map(d => d.value),
                            borderColor: '#1f6fa8',
                            backgroundColor: '#1f6fa818',
                            borderWidth: 3,
                            pointRadius: 5,
                            pointHoverRadius: 8,
                            pointBackgroundColor: '#1f6fa8',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2.5,
                            fill: true,
                            tension: 0.4
                        },
                        {
                            label: 'Inscrições',
                            data: filledRegs.map(d => d.value),
                            borderColor: '#ff8c42',
                            backgroundColor: '#ff8c4218',
                            borderWidth: 3,
                            pointRadius: 5,
                            pointHoverRadius: 8,
                            pointBackgroundColor: '#ff8c42',
                            pointBorderColor: '#ffffff',
                            pointBorderWidth: 2.5,
                            fill: true,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            align: 'end',
                            labels: {
                                color: tickColor,
                                font: { size: 12, family: fontFamily, weight: '600' },
                                padding: 16,
                                boxWidth: 14,
                                boxHeight: 14,
                                useBorderRadius: true,
                                borderRadius: 4
                            }
                        },
                        tooltip: {
                            backgroundColor: tooltipBg,
                            titleColor: tooltipText,
                            bodyColor: tooltipText,
                            padding: 14,
                            cornerRadius: 12,
                            titleFont: { size: 14, weight: 'bold', family: fontFamily },
                            bodyFont: { size: 13, family: fontFamily },
                            callbacks: {
                                label: function(context) {
                                    return ' ' + context.dataset.label + ': ' + context.parsed.y.toLocaleString('pt-BR');
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: gridColor, drawBorder: false },
                            ticks: { 
                                color: tickColor, 
                                maxTicksLimit: 12,
                                font: { size: 11, family: fontFamily, weight: '500' },
                                padding: 10
                            }
                        },
                        y: {
                            beginAtZero: true,
                            grid: { color: gridColor, drawBorder: false },
                            ticks: { 
                                color: tickColor, 
                                precision: 0,
                                font: { size: 11, family: fontFamily, weight: '500' },
                                padding: 10,
                                callback: function(value) {
                                    return value.toLocaleString('pt-BR');
                                }
                            }
                        }
                    }
                }
            });
        } catch (err) {
            console.error('Erro ao carregar gráfico comparativo:', err);
        }
    }

    function generateInsights(data) {
        const strongEl = document.getElementById('insightStrong');
        const warningEl = document.getElementById('insightWarning');
        const recommendationEl = document.getElementById('insightRecommendation');
        
        // Strong point
        if (parseFloat(data.conversionRate) > 70) {
            strongEl.textContent = `Excelente taxa de conversão de ${data.conversionRate}%! A maioria dos candidatos completa a inscrição.`;
        } else if (data.avgCommentsPerPost > 5) {
            strongEl.textContent = `Alto engajamento com média de ${data.avgCommentsPerPost} comentários por post!`;
        } else {
            strongEl.textContent = `${data.totalUsers} candidatos cadastrados demonstram forte interesse no evento.`;
        }
        
        // Warning
        if (parseFloat(data.conversionRate) < 50) {
            warningEl.textContent = `Taxa de conversão de ${data.conversionRate}% está abaixo do ideal. Considere simplificar o processo.`;
        } else if (data.lastWeekUsers < 5) {
            warningEl.textContent = `Apenas ${data.lastWeekUsers} novos cadastros na última semana. Intensifique a divulgação.`;
        } else if (data.avgCommentsPerPost < 2) {
            warningEl.textContent = `Engajamento baixo nos posts. Crie conteúdo mais interativo.`;
        } else {
            warningEl.textContent = `Continue monitorando as métricas para identificar oportunidades de melhoria.`;
        }
        
        // Recommendation
        if (data.totalNewsletter < data.totalUsers * 0.3) {
            recommendationEl.textContent = `Apenas ${((data.totalNewsletter / data.totalUsers) * 100).toFixed(0)}% dos candidatos estão na newsletter. Promova mais a inscrição!`;
        } else if (data.assignedUsers < data.registeredUsers) {
            const pending = data.registeredUsers - data.assignedUsers;
            recommendationEl.textContent = `${pending} inscrições aguardam atribuição de comitê. Priorize essa tarefa.`;
        } else {
            recommendationEl.textContent = `Mantenha a frequência de posts para sustentar o engajamento atual.`;
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

                if (chartType === 'reg') {
                    chartPeriods.registrations = days;
                    loadRegistrationsChart(days);
                } else if (chartType === 'nl') {
                    chartPeriods.newsletter = days;
                    loadNewsletterChart(days);
                } else if (chartType === 'eng') {
                    chartPeriods.engagement = days;
                    loadEngagementChart(days);
                } else if (chartType === 'comp') {
                    chartPeriods.comparison = days;
                    loadComparisonChart(days);
                } else {
                    chartPeriods.users = days;
                    loadUsersChart(days);
                }
            });
        });
    }

    function setupExportButton() {
        const exportBtn = document.getElementById('exportBtn');
        if (!exportBtn) return;
        
        exportBtn.addEventListener('click', async () => {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⏳</span> Exportando...';
            
            try {
                const res = await fetch('/api/analytics/overview', { headers: authHeaders() });
                const data = await res.json();
                
                const report = `RELATÓRIO DE ANALYTICS - MAXONU 2026\n` +
                    `Gerado em: ${new Date().toLocaleString('pt-BR')}\n\n` +
                    `=== MÉTRICAS GERAIS ===\n` +
                    `Total de Candidatos: ${data.totalUsers}\n` +
                    `Inscrições Enviadas: ${data.registeredUsers}\n` +
                    `Comitês Atribuídos: ${data.assignedUsers}\n` +
                    `Newsletter: ${data.totalNewsletter}\n` +
                    `Posts: ${data.totalPosts}\n` +
                    `Comentários: ${data.totalComments}\n\n` +
                    `=== INDICADORES ===\n` +
                    `Taxa de Conversão: ${data.conversionRate}%\n` +
                    `Média Comentários/Post: ${data.avgCommentsPerPost}\n` +
                    `Novos Usuários (7d): ${data.lastWeekUsers}\n`;
                
                const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `analytics-maxonu-${new Date().toISOString().slice(0,10)}.txt`;
                a.click();
                URL.revokeObjectURL(url);
                
                exportBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar';
            } catch (err) {
                console.error('Erro ao exportar:', err);
                exportBtn.innerHTML = '❌ Erro';
            } finally {
                exportBtn.disabled = false;
                setTimeout(() => {
                    exportBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Exportar';
                }, 2000);
            }
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
        setupExportButton();

        document.addEventListener('maxonu:theme-changed', () => {
            rerenderChartsForTheme();
        });

        // Load all data in parallel
        await Promise.all([
            loadKPIs(),
            loadUsersChart(7),
            loadRegistrationsChart(7),
            loadCommitteeChart(),
            loadNewsletterChart(7),
            loadClassChart(),
            loadEngagementChart(7),
            loadComparisonChart(30)
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
