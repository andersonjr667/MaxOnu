/**
 * Script to verify users from database and test class group normalization
 * Usage: node verify-users-classgroup.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

// Import normalization functions
const delegationsPath = './routes/delegations.js';
const content = require('fs').readFileSync(delegationsPath, 'utf8');

function normalizeText(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'));
}

function getEducationSegment(classGroup = '') {
    const normalized = normalizeText(classGroup);

    if (
        normalized.includes('8o') ||
        normalized.includes('8 ano') ||
        normalized.includes('8ano') ||
        normalized.includes('9o') ||
        normalized.includes('9 ano') ||
        normalized.includes('9ano') ||
        normalized.includes('8 e 9') ||
        normalized.includes('8/9') ||
        /\b8\s*ano\b/i.test(normalized) ||
        /\b9\s*ano\b/i.test(normalized)
    ) {
        return 'fundamental';
    }

    if (
        normalized.includes('ensino medio') ||
        normalized.includes('medio') ||
        /\bem\b/.test(normalized) ||
        /[123]\s*a?\s*serie/i.test(normalized) ||
        (/[123]\s*serie/i.test(normalized)) ||
        (/\b[123]\s*ano\b/i.test(normalized) && !normalized.includes('8o') && !normalized.includes('9o'))
    ) {
        return 'em';
    }

    return '';
}

async function verifyUsersClassGroup() {
    try {
        console.log('🔌 Conectando ao MongoDB...\n');
        
        const MONGODB_URI = process.env.MONGODB_URI;
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI não configurado no .env');
        }

        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado ao MongoDB!\n');

        // Buscar users com classGroup definido
        console.log('📚 Buscando users do banco de dados...\n');
        const users = await User.find({
            role: 'candidate',
            classGroup: { $exists: true, $ne: '' }
        }).select('username fullName email classGroup role').limit(20);

        if (users.length === 0) {
            console.log('⚠️  Nenhum usuário candidate encontrado com classGroup.');
            console.log('\nTentando buscar qualquer user com classGroup...\n');
            
            const anyUsers = await User.find({
                classGroup: { $exists: true, $ne: '' }
            }).select('username fullName email classGroup role').limit(20);

            if (anyUsers.length === 0) {
                console.log('❌ Nenhum usuário encontrado com classGroup definido.');
                await mongoose.disconnect();
                return;
            }

            console.log(`✅ Encontrados ${anyUsers.length} usuários:\n`);
            displayUsers(anyUsers);
        } else {
            console.log(`✅ Encontrados ${users.length} candidates:\n`);
            displayUsers(users);
        }

        await mongoose.disconnect();
        console.log('\n✅ Desconectado do MongoDB.');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

function displayUsers(users) {
    console.log('┌─────────────────────┬─────────────────────────────────────┬──────────────────────────────────────┬────────────────┬────────────────────────┐');
    console.log('│ Username            │ Nome                                │ ClassGroup                           │ Segmento       │ Validação              │');
    console.log('├─────────────────────┼─────────────────────────────────────┼──────────────────────────────────────┼────────────────┼────────────────────────┤');

    users.forEach((user) => {
        const classGroup = user.classGroup || 'N/A';
        const segment = getEducationSegment(classGroup);
        const normalized = normalizeText(classGroup);
        
        // Validação: se deve ter um segment válido
        const isValid = segment !== '' ? '✓ VÁLIDO' : '✗ INVÁLIDO';
        const segmentDisplay = segment ? segment.toUpperCase() : 'NÃO DETECTADO';

        const username = (user.username || '').substring(0, 19).padEnd(19);
        const name = (user.fullName || '').substring(0, 35).padEnd(35);
        const classGroupStr = classGroup.substring(0, 36).padEnd(36);
        const segmentStr = segmentDisplay.padEnd(14);
        const validationStr = isValid.padEnd(22);

        console.log(`│ ${username} │ ${name} │ ${classGroupStr} │ ${segmentStr} │ ${validationStr} │`);
        console.log(`│                     │                                     │ (normalizado: ${normalized.substring(0, 30).padEnd(30)}) │                │                        │`);
    });

    console.log('└─────────────────────┴─────────────────────────────────────┴──────────────────────────────────────┴────────────────┴────────────────────────┘');

    // Estatísticas
    const validCount = users.filter(u => getEducationSegment(u.classGroup) !== '').length;
    const invalidCount = users.length - validCount;

    console.log('\n📊 ESTATÍSTICAS:');
    console.log(`   Total de usuários: ${users.length}`);
    console.log(`   ✓ Turmas válidas: ${validCount} (${((validCount/users.length)*100).toFixed(1)}%)`);
    console.log(`   ✗ Turmas inválidas: ${invalidCount} (${((invalidCount/users.length)*100).toFixed(1)}%)`);

    // Agrupamento por segmento
    const bySegment = {
        fundamental: users.filter(u => getEducationSegment(u.classGroup) === 'fundamental').length,
        em: users.filter(u => getEducationSegment(u.classGroup) === 'em').length,
        invalid: users.filter(u => getEducationSegment(u.classGroup) === '').length
    };

    console.log('\n📍 DISTRIBUIÇÃO POR SEGMENTO:');
    console.log(`   8º/9º ano (Fundamental): ${bySegment.fundamental} usuários`);
    console.log(`   Ensino Médio (EM): ${bySegment.em} usuários`);
    console.log(`   Não detectado: ${bySegment.invalid} usuários`);

    // Exemplos de turmas
    const uniqueClassGroups = [...new Set(users.map(u => u.classGroup))];
    console.log('\n📋 TURMAS ENCONTRADAS:');
    uniqueClassGroups.forEach((cg, idx) => {
        const segment = getEducationSegment(cg);
        const normalized = normalizeText(cg);
        console.log(`   ${idx + 1}. "${cg}"`);
        console.log(`      └─ Normalizado: "${normalized}"`);
        console.log(`      └─ Segmento: ${segment || 'NÃO DETECTADO'}`);
    });
}

// Run
verifyUsersClassGroup();
