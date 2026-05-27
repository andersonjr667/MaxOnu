/**
 * Script to test delegation validation (pair validation for invites)
 * Simulates the invite process to ensure class group validation works correctly
 */

require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

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
        return 'fundamental';
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
        return 'em';
    }

    return '';
}

function validateDelegationPairByClassGroup(userA, userB) {
    const segmentA = getEducationSegment(userA?.classGroup);
    const segmentB = getEducationSegment(userB?.classGroup);

    if (!segmentA || !segmentB) {
        return {
            valid: false,
            message: 'Não foi possível identificar a turma de um dos participantes para validar a formação da delegação.',
            segmentA,
            segmentB
        };
    }

    if (segmentA !== segmentB) {
        return {
            valid: false,
            message: `Não é permitido misturar participantes de segmentos diferentes na mesma delegação. (${segmentA} ≠ ${segmentB})`,
            segmentA,
            segmentB
        };
    }

    return { valid: true, segmentA, segmentB };
}

async function testDelegationInvites() {
    try {
        console.log('🔌 Conectando ao MongoDB...\n');
        
        const MONGODB_URI = process.env.MONGODB_URI;
        if (!MONGODB_URI) {
            throw new Error('MONGODB_URI não configurado no .env');
        }

        await mongoose.connect(MONGODB_URI);
        console.log('✅ Conectado ao MongoDB!\n');

        // Buscar users com classGroup definido
        console.log('📚 Buscando users para teste de convite de delegação...\n');
        const users = await User.find({
            role: 'candidate',
            classGroup: { $exists: true, $ne: '' }
        }).select('username fullName email classGroup').limit(30);

        if (users.length < 2) {
            console.log('❌ Menos de 2 usuários encontrados. Não é possível testar pares.');
            await mongoose.disconnect();
            return;
        }

        // Teste 1: Convite entre usuários do mesmo segmento (deve funcionar)
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('TEST 1: CONVITE ENTRE USUÁRIOS DO MESMO SEGMENTO ✓');
        console.log('═══════════════════════════════════════════════════════════════\n');

        // Buscar dois do fundamental
        const fundamentalUsers = users.filter(u => getEducationSegment(u.classGroup) === 'fundamental');
        if (fundamentalUsers.length >= 2) {
            const user1 = fundamentalUsers[0];
            const user2 = fundamentalUsers[1];
            const result = validateDelegationPairByClassGroup(user1, user2);
            
            console.log(`👤 User 1: ${user1.fullName}`);
            console.log(`   └─ Turma: ${user1.classGroup}`);
            console.log(`   └─ Segmento: fundamental\n`);
            
            console.log(`👤 User 2: ${user2.fullName}`);
            console.log(`   └─ Turma: ${user2.classGroup}`);
            console.log(`   └─ Segmento: fundamental\n`);
            
            console.log(`📋 Resultado: ${result.valid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
            if (!result.valid) {
                console.log(`   Erro: ${result.message}`);
            } else {
                console.log(`   Mensagem: Delegação pode ser formada! ${result.segmentA} == ${result.segmentB}`);
            }
        } else {
            console.log('⚠️  Não há usuários suficientes do segmento fundamental para este teste.');
        }

        console.log('\n');

        // Teste 2: Convite entre usuários de segmentos diferentes (deve falhar)
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('TEST 2: CONVITE ENTRE USUÁRIOS DE SEGMENTOS DIFERENTES ✗');
        console.log('═══════════════════════════════════════════════════════════════\n');

        const fundamentalUser = users.find(u => getEducationSegment(u.classGroup) === 'fundamental');
        const emUser = users.find(u => getEducationSegment(u.classGroup) === 'em');

        if (fundamentalUser && emUser) {
            const result = validateDelegationPairByClassGroup(fundamentalUser, emUser);
            
            console.log(`👤 User 1: ${fundamentalUser.fullName}`);
            console.log(`   └─ Turma: ${fundamentalUser.classGroup}`);
            console.log(`   └─ Segmento: fundamental\n`);
            
            console.log(`👤 User 2: ${emUser.fullName}`);
            console.log(`   └─ Turma: ${emUser.classGroup}`);
            console.log(`   └─ Segmento: em\n`);
            
            console.log(`📋 Resultado: ${result.valid ? '✅ VÁLIDO' : '❌ INVÁLIDO (esperado)'}`);
            console.log(`   Erro: ${result.message}`);
        } else {
            console.log('⚠️  Não há usuários de ambos os segmentos para este teste.');
        }

        console.log('\n');

        // Teste 3: Teste com usuários do Ensino Médio
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('TEST 3: CONVITE ENTRE USUÁRIOS DO ENSINO MÉDIO ✓');
        console.log('═══════════════════════════════════════════════════════════════\n');

        const emUsers = users.filter(u => getEducationSegment(u.classGroup) === 'em');
        if (emUsers.length >= 2) {
            const emUser1 = emUsers[0];
            const emUser2 = emUsers[1];
            const result = validateDelegationPairByClassGroup(emUser1, emUser2);
            
            console.log(`👤 User 1: ${emUser1.fullName}`);
            console.log(`   └─ Turma: ${emUser1.classGroup}`);
            console.log(`   └─ Segmento: em\n`);
            
            console.log(`👤 User 2: ${emUser2.fullName}`);
            console.log(`   └─ Turma: ${emUser2.classGroup}`);
            console.log(`   └─ Segmento: em\n`);
            
            console.log(`📋 Resultado: ${result.valid ? '✅ VÁLIDO' : '❌ INVÁLIDO'}`);
            if (!result.valid) {
                console.log(`   Erro: ${result.message}`);
            } else {
                console.log(`   Mensagem: Delegação pode ser formada! ${result.segmentA} == ${result.segmentB}`);
            }
        } else if (emUsers.length === 1) {
            console.log('⚠️  Apenas 1 usuário do segmento EM encontrado.');
        } else {
            console.log('⚠️  Nenhum usuário do segmento EM encontrado.');
        }

        console.log('\n');

        // Teste 4: Resumo de validação de todos os users
        console.log('═══════════════════════════════════════════════════════════════');
        console.log('TEST 4: RESUMO DE VALIDAÇÃO');
        console.log('═══════════════════════════════════════════════════════════════\n');

        const validationResults = users.map(user => ({
            username: user.username,
            fullName: user.fullName,
            classGroup: user.classGroup,
            segment: getEducationSegment(user.classGroup),
            isValid: getEducationSegment(user.classGroup) !== ''
        }));

        const validCount = validationResults.filter(r => r.isValid).length;
        const invalidCount = validationResults.filter(r => !r.isValid).length;

        console.log(`Total de usuários verificados: ${validationResults.length}`);
        console.log(`✅ Com turma válida: ${validCount} (${((validCount/validationResults.length)*100).toFixed(1)}%)`);
        console.log(`❌ Sem turma válida: ${invalidCount} (${((invalidCount/validationResults.length)*100).toFixed(1)}%)\n`);

        if (invalidCount > 0) {
            console.log('📋 Usuários com turma inválida:');
            validationResults.filter(r => !r.isValid).forEach(r => {
                console.log(`   - ${r.fullName} (${r.classGroup})`);
            });
        } else {
            console.log('✅ TODOS os usuários têm turmas válidas! O convite funcionará corretamente.');
        }

        await mongoose.disconnect();
        console.log('\n✅ Desconectado do MongoDB.');

    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

// Run
testDelegationInvites();
