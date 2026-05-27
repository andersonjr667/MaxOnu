#!/usr/bin/env node

const mongoose = require('mongoose');
const path = require('path');
const ExcelJS = require('exceljs');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const User = require('./models/User');

const COMMITTEES = {
    1: 'Conselho de Direitos Humanos (CDH - 2026)',
    2: 'Assembleia Geral das Nações Unidas (AGNU)',
    3: 'Alto Comissariado das Nações Unidas para Refugiados (ACNUR)',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global',
    6: 'Conselho de Direitos Humanos das Nações Unidas (UNHRC)',
    7: 'Organização das Nações Unidas para as Mulheres (ONU Mulheres)'
};

async function generateTeamsExcel() {
    try {
        console.log('🔌 Conectando ao banco de dados...');
        
        const dbUri = process.env.MONGODB_URI || process.env.DB_URI;
        if (!dbUri) {
            throw new Error('MONGODB_URI ou DB_URI não configurado no .env');
        }

        await mongoose.connect(dbUri);
        console.log('✅ Conectado ao banco de dados\n');

        // Buscar usuários que têm delegationMembers (líderes de delegações)
        const leaders = await User.find({
            role: 'candidate',
            delegationMembers: { $exists: true, $ne: [] }
        }).populate('delegationMembers');

        // Buscar usuários solo (com registro mas sem delegação)
        const soloUsers = await User.find({
            role: 'candidate',
            'registration.submittedAt': { $ne: null },
            delegationMembers: { $size: 0 }
        });

        console.log(`📊 Total de delegações encontradas: ${leaders.length}`);
        console.log(`👤 Total de delegações solo: ${soloUsers.length}\n`);

        // Criar workbook
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Duplas e Preferências');

        // Definir colunas
        worksheet.columns = [
            { header: 'Delegado 1', key: 'delegado1', width: 30 },
            { header: 'Turma Delegado 1', key: 'turma1', width: 20 },
            { header: 'Delegado 2', key: 'delegado2', width: 30 },
            { header: 'Turma Delegado 2', key: 'turma2', width: 20 },
            { header: 'Delegado 3', key: 'delegado3', width: 30 },
            { header: 'Turma Delegado 3', key: 'turma3', width: 20 },
            { header: '1ª Opção de Comitê', key: 'firstChoice', width: 50 },
            { header: '2ª Opção de Comitê', key: 'secondChoice', width: 50 },
            { header: '3ª Opção de Comitê', key: 'thirdChoice', width: 50 }
        ];

        // Formatar cabeçalho
        const headerRow = worksheet.getRow(1);
        headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
        headerRow.alignment = { horizontal: 'center', vertical: 'center' };

        // Processar dados
        let rowNum = 2;
        let totalTeams = 0;
        const processedTeams = new Set(); // Rastrear duplas já processadas

        for (const leader of leaders) {
            const members = leader.delegationMembers || [];
            
            if (members.length === 0) continue; // Pular se não tem membros
            
            // Criar um identificador único para a dupla (ordenado para evitar duplicatas)
            const leaderId = leader._id.toString();
            const memberId = members[0]._id.toString();
            const teamKey = [leaderId, memberId].sort().join('|');
            
            // Pular se essa dupla já foi processada
            if (processedTeams.has(teamKey)) continue;
            processedTeams.add(teamKey);
            
            // Pegar nome e turma de cada membro
            const delegado1Name = leader.fullName;
            const delegado1Class = leader.classGroup || '';
            
            let delegado2Name = '';
            let delegado2Class = '';
            
            let delegado3Name = '';
            let delegado3Class = '';
            
            if (members[0]) {
                delegado2Name = members[0].fullName || '';
                delegado2Class = members[0].classGroup || '';
            }
            
            if (members[1]) {
                delegado3Name = members[1].fullName || '';
                delegado3Class = members[1].classGroup || '';
            }

            // Pegar as opções de comitê do líder
            const firstChoice = leader.registration?.firstChoice 
                ? COMMITTEES[leader.registration.firstChoice] 
                : '';
            const secondChoice = leader.registration?.secondChoice 
                ? COMMITTEES[leader.registration.secondChoice] 
                : '';
            const thirdChoice = leader.registration?.thirdChoice 
                ? COMMITTEES[leader.registration.thirdChoice] 
                : '';

            // Adicionar linha para dupla/trio
            const row = worksheet.getRow(rowNum);
            row.values = {
                delegado1: delegado1Name,
                turma1: delegado1Class,
                delegado2: delegado2Name,
                turma2: delegado2Class,
                delegado3: delegado3Name,
                turma3: delegado3Class,
                firstChoice: firstChoice,
                secondChoice: secondChoice,
                thirdChoice: thirdChoice
            };

            // Formatar linha
            row.font = { size: 11 };
            row.alignment = { horizontal: 'left', vertical: 'center', wrapText: true };
            
            // Alternância de cores
            if (totalTeams % 2 === 0) {
                for (let col = 1; col <= 9; col++) {
                    row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
                }
            }

            rowNum++;
            totalTeams++;
        }

        // Adicionar linha em branco para separação
        rowNum++;

        // Adicionar seção de delegações solo
        let totalSolo = 0;
        for (const solo of soloUsers) {
            // Pegar as opções de comitê
            const firstChoice = solo.registration?.firstChoice 
                ? COMMITTEES[solo.registration.firstChoice] 
                : '';
            const secondChoice = solo.registration?.secondChoice 
                ? COMMITTEES[solo.registration.secondChoice] 
                : '';
            const thirdChoice = solo.registration?.thirdChoice 
                ? COMMITTEES[solo.registration.thirdChoice] 
                : '';

            // Adicionar linha para delegação solo
            const row = worksheet.getRow(rowNum);
            row.values = {
                delegado1: solo.fullName,
                turma1: solo.classGroup || '',
                delegado2: '[SOLO]',
                turma2: '',
                delegado3: '',
                turma3: '',
                firstChoice: firstChoice,
                secondChoice: secondChoice,
                thirdChoice: thirdChoice
            };

            // Formatar linha
            row.font = { size: 11 };
            row.alignment = { horizontal: 'left', vertical: 'center', wrapText: true };
            
            // Cor diferenciada para solo
            for (let col = 1; col <= 9; col++) {
                row.getCell(col).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFFE0' } }; // Amarelo claro
            }

            rowNum++;
            totalSolo++;
        }

        // Adicionar borderline em todas as células
        for (let row = 1; row <= rowNum - 1; row++) {
            for (let col = 1; col <= 9; col++) {
                const cell = worksheet.getCell(row, col);
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            }
        }

        // Salvar arquivo
        const filename = `duplas-comites-${new Date().getTime()}.xlsx`;
        const filepath = path.join(__dirname, filename);
        
        await workbook.xlsx.writeFile(filepath);
        
        console.log(`\n✅ Excel gerado com sucesso!`);
        console.log(`📁 Arquivo: ${filename}`);
        console.log(`📊 Total de duplas/trios: ${totalTeams}`);
        console.log(`👤 Total de delegações solo: ${totalSolo}`);
        console.log(`📈 Total geral: ${totalTeams + totalSolo}\n`);

        await mongoose.connection.close();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Erro ao gerar Excel:', error.message);
        if (error.message.includes('MONGODB_URI')) {
            console.log('\n💡 Certifique-se de que o arquivo .env está configurado com MONGODB_URI ou DB_URI');
        }
        process.exit(1);
    }
}

generateTeamsExcel();
