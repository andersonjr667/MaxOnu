#!/usr/bin/env node

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');

const COMMITTEES = {
    1: 'AGNU (Assembleia Geral das Nações Unidas)',
    2: 'CSNU (Conselho de Segurança das Nações Unidas)',
    3: 'OEA (Organização dos Estados Americanos)',
    4: 'Comitê 1',
    5: 'Comitê 2',
    6: 'Comitê 3',
    7: 'Comitê 4'
};

function normalizeText(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'));
}

function getEducationSegment(classGroup = '') {
    const normalized = normalizeText(classGroup);
    const original = String(classGroup || '').toLowerCase();

    // Detectar 8º/9º - com ou sem º/ª
    if (
        normalized.includes('8o') ||
        normalized.includes('8 ano') ||
        normalized.includes('8ano') ||
        normalized.includes('9o') ||
        normalized.includes('9 ano') ||
        normalized.includes('9ano') ||
        normalized.includes('8 e 9') ||
        normalized.includes('8/9') ||
        original.includes('8º') ||
        original.includes('8ª') ||
        original.includes('9º') ||
        original.includes('9ª') ||
        /\b8\s*ano\b/i.test(normalized) ||
        /\b9\s*ano\b/i.test(normalized) ||
        /\b8\s*ano\b/i.test(original) ||
        /\b9\s*ano\b/i.test(original)
    ) {
        return 'Fundamental (8º/9º)';
    }

    // Detectar Ensino Médio - com ou sem º/ª
    if (
        normalized.includes('ensino medio') ||
        normalized.includes('medio') ||
        /\bem\b/.test(normalized) ||
        /[123]\s*a?\s*serie/i.test(normalized) ||
        (/[123]\s*serie/i.test(normalized)) ||
        (/\b[123]\s*ano\b/i.test(normalized) && !normalized.includes('8o') && !normalized.includes('9o')) ||
        /\b1º\s*série\b/i.test(original) ||
        /\b2º\s*série\b/i.test(original) ||
        /\b3º\s*série\b/i.test(original) ||
        /\b1ª\s*série\b/i.test(original) ||
        /\b2ª\s*série\b/i.test(original) ||
        /\b3ª\s*série\b/i.test(original)
    ) {
        return 'Ensino Médio';
    }

    return 'Outro';
}

async function generateRanking() {
    try {
        console.log('🔌 Conectando ao banco de dados...');
        
        const dbUri = process.env.MONGODB_URI || process.env.DB_URI;
        if (!dbUri) {
            throw new Error('MONGODB_URI ou DB_URI não configurado no .env');
        }

        await mongoose.connect(dbUri);
        console.log('✅ Conectado ao banco de dados\n');

        // Buscar todos os usuários candidatos com registros
        const users = await User.find({
            role: 'candidate',
            'registration.submittedAt': { $ne: null }
        }).lean();

        console.log(`📊 Total de usuários com registros: ${users.length}\n`);

        // Estrutura para armazenar o ranking
        const ranking = {};
        const classGroupStats = {};
        let totalChoices = 0;

        // Processar dados
        users.forEach(user => {
            const segment = getEducationSegment(user.classGroup);
            const classGroup = user.classGroup || 'Não informado';

            // Inicializar estrutura se necessário
            if (!ranking[segment]) {
                ranking[segment] = {
                    total: 0,
                    committees: {}
                };
                for (let i = 1; i <= 7; i++) {
                    ranking[segment].committees[i] = {
                        name: COMMITTEES[i],
                        firstChoice: 0,
                        secondChoice: 0,
                        thirdChoice: 0,
                        totalVotes: 0
                    };
                }
            }

            if (!classGroupStats[segment]) {
                classGroupStats[segment] = {};
            }
            if (!classGroupStats[segment][classGroup]) {
                classGroupStats[segment][classGroup] = {
                    total: 0,
                    committees: {}
                };
                for (let i = 1; i <= 7; i++) {
                    classGroupStats[segment][classGroup].committees[i] = {
                        name: COMMITTEES[i],
                        firstChoice: 0,
                        secondChoice: 0,
                        thirdChoice: 0,
                        totalVotes: 0
                    };
                }
            }

            // Contar first choice
            if (user.registration?.firstChoice) {
                const committee = user.registration.firstChoice;
                ranking[segment].committees[committee].firstChoice++;
                ranking[segment].committees[committee].totalVotes++;
                ranking[segment].total++;
                classGroupStats[segment][classGroup].committees[committee].firstChoice++;
                classGroupStats[segment][classGroup].committees[committee].totalVotes++;
                classGroupStats[segment][classGroup].total++;
                totalChoices++;
            }

            // Contar second choice
            if (user.registration?.secondChoice) {
                const committee = user.registration.secondChoice;
                ranking[segment].committees[committee].secondChoice++;
                ranking[segment].committees[committee].totalVotes++;
                ranking[segment].total++;
                classGroupStats[segment][classGroup].committees[committee].secondChoice++;
                classGroupStats[segment][classGroup].committees[committee].totalVotes++;
                classGroupStats[segment][classGroup].total++;
                totalChoices++;
            }

            // Contar third choice
            if (user.registration?.thirdChoice) {
                const committee = user.registration.thirdChoice;
                ranking[segment].committees[committee].thirdChoice++;
                ranking[segment].committees[committee].totalVotes++;
                ranking[segment].total++;
                classGroupStats[segment][classGroup].committees[committee].thirdChoice++;
                classGroupStats[segment][classGroup].committees[committee].totalVotes++;
                classGroupStats[segment][classGroup].total++;
                totalChoices++;
            }
        });

        // Exibir ranking por segmento
        console.log('═'.repeat(100));
        console.log('RANKING GERAL DE COMITÊS POR OPÇÃO - TODAS AS TURMAS');
        console.log('═'.repeat(100));
        console.log(`Total de escolhas registradas: ${totalChoices}\n`);

        Object.keys(ranking).sort().forEach(segment => {
            const segmentData = ranking[segment];
            console.log(`\n📚 ${segment.toUpperCase()}`);
            console.log('─'.repeat(100));

            // Ordenar comitês por total de votos
            const sortedCommittees = Object.keys(segmentData.committees)
                .sort((a, b) => {
                    const votesA = segmentData.committees[a].totalVotes;
                    const votesB = segmentData.committees[b].totalVotes;
                    return votesB - votesA;
                })
                .map(id => parseInt(id));

            console.log(`\nTotal de registros: ${segmentData.total / 3} usuários (${segmentData.total} escolhas)\n`);

            let position = 1;
            sortedCommittees.forEach(committeId => {
                const committee = segmentData.committees[committeId];
                const percentage = segmentData.total > 0 
                    ? ((committee.totalVotes / segmentData.total) * 100).toFixed(1)
                    : 0;

                console.log(`${position}º Lugar: ${committee.name}`);
                console.log(`   1ª Opção: ${committee.firstChoice} votos`);
                console.log(`   2ª Opção: ${committee.secondChoice} votos`);
                console.log(`   3ª Opção: ${committee.thirdChoice} votos`);
                console.log(`   Total: ${committee.totalVotes} votos (${percentage}%)`);
                console.log('');

                position++;
            });
        });

        // Exibir detalhes por turma
        console.log('\n\n');
        console.log('═'.repeat(100));
        console.log('RANKING DETALHADO POR TURMA');
        console.log('═'.repeat(100));

        Object.keys(classGroupStats).sort().forEach(segment => {
            const segmentClasses = classGroupStats[segment];
            console.log(`\n\n📚 ${segment.toUpperCase()}\n`);

            Object.keys(segmentClasses).sort().forEach(classGroup => {
                const classData = segmentClasses[classGroup];
                console.log(`\n   🏫 ${classGroup}`);
                console.log(`   Total de registros: ${classData.total / 3} usuários`);
                console.log(`   ─`.repeat(50));

                const sortedCommittees = Object.keys(classData.committees)
                    .sort((a, b) => {
                        const votesA = classData.committees[a].totalVotes;
                        const votesB = classData.committees[b].totalVotes;
                        return votesB - votesA;
                    })
                    .map(id => parseInt(id));

                sortedCommittees.forEach((committeId, index) => {
                    const committee = classData.committees[committeId];
                    if (committee.totalVotes > 0) {
                        const percentage = classData.total > 0 
                            ? ((committee.totalVotes / classData.total) * 100).toFixed(1)
                            : 0;

                        console.log(`   ${index + 1}. ${committee.name}: ${committee.totalVotes} votos (${percentage}%)`);
                    }
                });
            });
        });

        console.log('\n\n');
        console.log('═'.repeat(100));
        console.log('✅ Relatório gerado com sucesso!');
        console.log('═'.repeat(100));

    } catch (error) {
        console.error('❌ Erro ao gerar ranking:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
    }
}

generateRanking();
