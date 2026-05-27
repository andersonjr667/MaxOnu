#!/usr/bin/env node

const mongoose = require('mongoose');
const path = require('path');
const ExcelJS = require('exceljs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');

const COMMITTEES = {
    1: 'AGNU (Assembleia Geral)',
    2: 'CSNU (Conselho de Segurança)',
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

async function generateExcel() {
    try {
        console.log('🔌 Conectando ao banco de dados...');
        
        const dbUri = process.env.MONGODB_URI || process.env.DB_URI;
        if (!dbUri) {
            throw new Error('MONGODB_URI ou DB_URI não configurado no .env');
        }

        await mongoose.connect(dbUri);
        console.log('✅ Conectado ao banco de dados\n');

        const users = await User.find({
            role: 'candidate',
            'registration.submittedAt': { $ne: null }
        }).lean();

        console.log(`📊 Total de usuários com registros: ${users.length}`);

        // Processar dados
        const ranking = {};
        const classGroupStats = {};
        let totalChoices = 0;

        users.forEach(user => {
            const segment = getEducationSegment(user.classGroup);
            const classGroup = user.classGroup || 'Não informado';

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

            // Contar choices
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

        // Criar workbook Excel
        const workbook = new ExcelJS.Workbook();

        // ===== SHEET 1: RESUMO GERAL =====
        const summarySheet = workbook.addWorksheet('Resumo Geral', { pageSetup: { paperSize: 9, orientation: 'portrait' } });
        
        summarySheet.columns = [
            { header: 'Segmento', key: 'segment', width: 25 },
            { header: 'Total de Usuários', key: 'users', width: 18 },
            { header: 'Total de Escolhas', key: 'choices', width: 18 }
        ];

        Object.keys(ranking).sort().forEach(segment => {
            const segmentData = ranking[segment];
            const userCount = Math.round(segmentData.total / 3);
            summarySheet.addRow({
                segment,
                users: userCount,
                choices: segmentData.total
            });
        });

        summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };

        // ===== SHEET 2-3: RANKING POR SEGMENTO =====
        Object.keys(ranking).sort().forEach(segment => {
            const segmentData = ranking[segment];
            const sheetName = segment === 'Ensino Médio' ? 'EM' : segment === 'Fundamental (8º/9º)' ? 'Fundamental' : 'Outro';
            const sheet = workbook.addWorksheet(sheetName, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

            sheet.columns = [
                { header: 'Posição', key: 'position', width: 12 },
                { header: 'Comitê', key: 'committee', width: 35 },
                { header: '1ª Opção', key: 'first', width: 12 },
                { header: '2ª Opção', key: 'second', width: 12 },
                { header: '3ª Opção', key: 'third', width: 12 },
                { header: 'Total de Votos', key: 'total', width: 15 },
                { header: 'Percentual', key: 'percentage', width: 12 }
            ];

            const sortedCommittees = Object.keys(segmentData.committees)
                .sort((a, b) => {
                    const votesA = segmentData.committees[a].totalVotes;
                    const votesB = segmentData.committees[b].totalVotes;
                    return votesB - votesA;
                })
                .map(id => parseInt(id));

            let position = 1;
            sortedCommittees.forEach(committeId => {
                const committee = segmentData.committees[committeId];
                const percentage = segmentData.total > 0 
                    ? ((committee.totalVotes / segmentData.total) * 100).toFixed(1)
                    : 0;

                sheet.addRow({
                    position,
                    committee: committee.name,
                    first: committee.firstChoice,
                    second: committee.secondChoice,
                    third: committee.thirdChoice,
                    total: committee.totalVotes,
                    percentage: `${percentage}%`
                });

                position++;
            });

            // Formatação
            sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
            sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
            sheet.getRow(1).alignment = { horizontal: 'center', vertical: 'center' };

            // Formatação de dados
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    row.alignment = { horizontal: 'center', vertical: 'center' };
                    row.getCell('committee').alignment = { horizontal: 'left', vertical: 'center' };
                    
                    // Cores alternadas
                    if (rowNumber % 2 === 0) {
                        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                    }

                    // Destaque top 3
                    if (rowNumber <= 3) {
                        if (rowNumber === 2) {
                            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
                            row.font = { bold: true };
                        } else if (rowNumber === 3) {
                            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0C0C0' } };
                        } else if (rowNumber === 4) {
                            row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };
                        }
                    }
                }
            });
        });

        // ===== SHEET 4-5: DETALHAMENTO POR TURMA =====
        Object.keys(classGroupStats).sort().forEach(segment => {
            const segmentClasses = classGroupStats[segment];
            const sheetName = `Classes - ${segment === 'Ensino Médio' ? 'EM' : 'Fundamental'}`;
            const sheet = workbook.addWorksheet(sheetName, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

            let currentRow = 1;

            Object.keys(segmentClasses).sort().forEach(classGroup => {
                const classData = segmentClasses[classGroup];

                // Cabeçalho da turma
                const headerCell = sheet.getCell(currentRow, 1);
                headerCell.value = classGroup;
                headerCell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
                headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
                sheet.mergeCells(`A${currentRow}:D${currentRow}`);
                
                currentRow++;

                // Cabeçalhos das colunas
                sheet.getCell(currentRow, 1).value = 'Comitê';
                sheet.getCell(currentRow, 2).value = '1ª Opção';
                sheet.getCell(currentRow, 3).value = '2ª Opção';
                sheet.getCell(currentRow, 4).value = 'Total';

                const headerRow = sheet.getRow(currentRow);
                headerRow.font = { bold: true };
                headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
                headerRow.alignment = { horizontal: 'center', vertical: 'center' };

                currentRow++;

                // Dados
                const sortedCommittees = Object.keys(classData.committees)
                    .sort((a, b) => {
                        const votesA = classData.committees[a].totalVotes;
                        const votesB = classData.committees[b].totalVotes;
                        return votesB - votesA;
                    });

                sortedCommittees.forEach(committeId => {
                    const committee = classData.committees[committeId];
                    if (committee.totalVotes > 0) {
                        sheet.getCell(currentRow, 1).value = COMMITTEES[committeId];
                        sheet.getCell(currentRow, 2).value = committee.firstChoice;
                        sheet.getCell(currentRow, 3).value = committee.secondChoice;
                        sheet.getCell(currentRow, 4).value = committee.totalVotes;

                        const dataRow = sheet.getRow(currentRow);
                        dataRow.alignment = { horizontal: 'center', vertical: 'center' };
                        dataRow.getCell(1).alignment = { horizontal: 'left', vertical: 'center' };

                        if (currentRow % 2 === 0) {
                            dataRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                        }

                        currentRow++;
                    }
                });

                currentRow += 1; // Espaço entre turmas
            });

            // Dimensões de coluna
            sheet.columns = [
                { width: 35 },
                { width: 12 },
                { width: 12 },
                { width: 12 }
            ];
        });

        // Salvar arquivo
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filePath = path.join(__dirname, `committee-ranking-${timestamp}.xlsx`);

        await workbook.xlsx.writeFile(filePath);

        console.log(`\n✅ Arquivo Excel gerado com sucesso!`);
        console.log(`📁 Salvo em: ${filePath}`);
        console.log(`\n📊 Conteúdo do arquivo:`);
        console.log(`   - Resumo Geral`);
        console.log(`   - Ranking Ensino Médio`);
        console.log(`   - Ranking Fundamental`);
        console.log(`   - Turmas Ensino Médio (detalhado)`);
        console.log(`   - Turmas Fundamental (detalhado)`);

    } catch (error) {
        console.error('❌ Erro ao gerar Excel:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
    }
}

generateExcel();
