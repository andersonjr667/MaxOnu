#!/usr/bin/env node

const mongoose = require('mongoose');
const path = require('path');
const ExcelJS = require('exceljs');
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
        return 'fundamental';
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
        return 'em';
    }

    return '';
}

async function generateExcel() {
    try {
        console.log('🔌 Conectando ao banco de dados...');
        
        const dbUri = process.env.MONGODB_URI || process.env.DB_URI;
        if (!dbUri) {
            throw new Error('MONGODB_URI ou DB_URI não configurado no .env');
        }

        await mongoose.connect(dbUri);
        console.log('✅ Conectado\n');

        const users = await User.find({
            role: 'candidate',
            'registration.submittedAt': { $ne: null }
        }).lean();

        // Estrutura para armazenar dados
        const geral = {};
        const porSegmento = {
            em: {},
            fundamental: {}
        };

        // Inicializar
        for (let i = 1; i <= 7; i++) {
            geral[i] = { name: COMMITTEES[i], op1: 0, op2: 0, op3: 0, total: 0 };
            porSegmento.em[i] = { name: COMMITTEES[i], op1: 0, op2: 0, op3: 0, total: 0 };
            porSegmento.fundamental[i] = { name: COMMITTEES[i], op1: 0, op2: 0, op3: 0, total: 0 };
        }

        // Processar dados
        users.forEach(user => {
            const segment = getEducationSegment(user.classGroup);

            if (user.registration?.firstChoice) {
                const c = user.registration.firstChoice;
                geral[c].op1++;
                geral[c].total++;
                if (segment === 'em') {
                    porSegmento.em[c].op1++;
                    porSegmento.em[c].total++;
                } else if (segment === 'fundamental') {
                    porSegmento.fundamental[c].op1++;
                    porSegmento.fundamental[c].total++;
                }
            }

            if (user.registration?.secondChoice) {
                const c = user.registration.secondChoice;
                geral[c].op2++;
                geral[c].total++;
                if (segment === 'em') {
                    porSegmento.em[c].op2++;
                    porSegmento.em[c].total++;
                } else if (segment === 'fundamental') {
                    porSegmento.fundamental[c].op2++;
                    porSegmento.fundamental[c].total++;
                }
            }

            if (user.registration?.thirdChoice) {
                const c = user.registration.thirdChoice;
                geral[c].op3++;
                geral[c].total++;
                if (segment === 'em') {
                    porSegmento.em[c].op3++;
                    porSegmento.em[c].total++;
                } else if (segment === 'fundamental') {
                    porSegmento.fundamental[c].op3++;
                    porSegmento.fundamental[c].total++;
                }
            }
        });

        // Criar workbook
        const workbook = new ExcelJS.Workbook();

        // Função para criar sheet
        function criarSheet(dados, titulo) {
            const sheet = workbook.addWorksheet(titulo);
            
            sheet.columns = [
                { header: 'Posição', key: 'pos', width: 12 },
                { header: 'Comitê', key: 'name', width: 20 },
                { header: 'Opção 1', key: 'op1', width: 12 },
                { header: 'Opção 2', key: 'op2', width: 12 },
                { header: 'Opção 3', key: 'op3', width: 12 },
                { header: 'Total', key: 'total', width: 12 }
            ];

            const sorted = Object.keys(dados)
                .map(id => ({ ...dados[id] }))
                .sort((a, b) => b.total - a.total);

            sorted.forEach((item, i) => {
                sheet.addRow({
                    pos: i + 1,
                    name: item.name,
                    op1: item.op1,
                    op2: item.op2,
                    op3: item.op3,
                    total: item.total
                });
            });

            // Formatação header
            const headerRow = sheet.getRow(1);
            headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF667EEA' } };
            headerRow.alignment = { horizontal: 'center', vertical: 'center' };

            // Formatação dados
            sheet.eachRow((row, rowNumber) => {
                if (rowNumber > 1) {
                    row.alignment = { horizontal: 'center', vertical: 'center' };
                    row.getCell('name').alignment = { horizontal: 'left' };
                    
                    if (rowNumber % 2 === 0) {
                        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
                    }

                    // Top 3 destacado
                    if (rowNumber === 2) {
                        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD700' } };
                        row.font = { bold: true };
                    } else if (rowNumber === 3) {
                        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC0C0C0' } };
                    } else if (rowNumber === 4) {
                        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCD7F32' } };
                    }
                }
            });
        }

        // Criar sheets
        criarSheet(geral, 'Geral');
        criarSheet(porSegmento.em, 'Ensino Médio');
        criarSheet(porSegmento.fundamental, 'Fundamental');

        // Salvar
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filePath = path.join(__dirname, `ranking-simples-${timestamp}.xlsx`);

        await workbook.xlsx.writeFile(filePath);

        console.log(`✅ Excel gerado!`);
        console.log(`📁 ${filePath}`);
        console.log(`\n📊 Abas: Geral | Ensino Médio | Fundamental`);

    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
    }
}

generateExcel();
