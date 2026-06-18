require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

const ROOT_DIR = path.join(__dirname, '..');
const ERRORS_FILE = path.join(ROOT_DIR, 'assignment-errors.json');
const PAIRS_FILE = path.join(ROOT_DIR, 'pending-delegation-pairs.json');
const ASSIGNMENTS_FILE = path.join(ROOT_DIR, 'pending-country-assignments.json');
const OUTPUT_RESOLUTION = path.join(ROOT_DIR, 'resolution-report.json');
const OUTPUT_PATCH = path.join(ROOT_DIR, 'resolution-patch.json');
const OUTPUT_MANUAL = path.join(ROOT_DIR, 'manual-review-required.json');

async function resolveAmbiguousMatches(errors, byName) {
  const ambiguous = errors.filter(e => e.type === 'ambiguous_user_match');
  const resolved = [];
  const stillAmbiguous = [];

  console.log(`[resolve] Processando ${ambiguous.length} matches ambíguos...`);

  for (const error of ambiguous) {
    const { fullName, classGroup, candidates, matchStrategy } = error;
    
    if (matchStrategy === 'class_group') {
      // Se a estratégia foi class_group e ainda ambíguo, escolher por ID (determinístico)
      const chosen = candidates.sort((a, b) => String(a.userId).localeCompare(String(b.userId)))[0];
      resolved.push({
        type: 'ambiguous_resolved_by_id',
        fullName,
        classGroup,
        candidates: candidates.length,
        chosen: chosen.userId,
        strategy: 'sort_by_id'
      });
    } else {
      // matchStrategy === 'unit_segment_fallback'
      // Se ainda ambíguo mesmo com fallback, marcar para revisão manual
      stillAmbiguous.push({
        type: 'ambiguous_unresolvable',
        fullName,
        classGroup,
        candidates: candidates.map(c => ({
          userId: c.userId,
          fullName: c.fullName,
          classGroup: c.classGroup
        })),
        strategy: matchStrategy
      });
    }
  }

  return { resolved, stillAmbiguous };
}

async function analyzeEmptyDelegations(errors) {
  const empty = errors.filter(e => e.type === 'empty_delegation');
  console.log(`[resolve] Analisando ${empty.length} delegações vazias...`);
  
  // Agrupar por arquivo
  const byFile = {};
  empty.forEach(e => {
    if (!byFile[e.file]) byFile[e.file] = [];
    byFile[e.file].push(e);
  });

  return {
    type: 'empty_delegations_analysis',
    summary: {
      totalEmpty: empty.length,
      filesAffected: Object.keys(byFile).length
    },
    byFile,
    recommendation: 'Revisar manualmente os arquivos listados e verificar se há dados faltantes'
  };
}

async function analyzeUsersNotFound(errors) {
  const notFound = errors.filter(e => e.type === 'user_not_found');
  console.log(`[resolve] Analisando ${notFound.length} usuários não encontrados...`);
  
  return {
    type: 'users_not_found_analysis',
    summary: {
      totalNotFound: notFound.length,
      uniqueNames: new Set(notFound.map(e => e.fullName)).size,
      uniqueClassGroups: new Set(notFound.map(e => e.classGroup)).size
    },
    samples: notFound.slice(0, 10).map(e => ({
      fullName: e.fullName,
      classGroup: e.classGroup,
      file: e.file,
      rowIndex: e.rowIndex,
      candidates: e.candidates.length > 0 ? `${e.candidates.length} similar names` : 'no candidates'
    }))
  };
}

async function analyzePairsToCreate(errors) {
  const notLinked = errors.filter(e => e.type === 'pair_not_linked_in_site');
  console.log(`[resolve] Analisando ${notLinked.length} pares para criar...`);
  
  const patch = [];
  
  for (const error of notLinked) {
    const { firstMember, secondMember } = error;
    
    // Criar operações para vincular os usuários
    patch.push({
      type: 'create_delegation_link',
      action: 'push_to_delegationMembers',
      firstUserId: firstMember.userId,
      secondUserId: secondMember.userId,
      committee: error.committee,
      country: error.country,
      classGroup: error.classGroup,
      operations: [
        {
          updateOne: {
            filter: { _id: firstMember.userId },
            update: { $addToSet: { delegationMembers: secondMember.userId } }
          }
        },
        {
          updateOne: {
            filter: { _id: secondMember.userId },
            update: { $addToSet: { delegationMembers: firstMember.userId } }
          }
        }
      ]
    });
  }

  return {
    type: 'pairs_to_create',
    summary: {
      totalPairs: notLinked.length,
      operations: patch.length * 2 // 2 operações por par
    },
    patch
  };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI nao configurado.');
  }

  try {
    const [errorsData, pairsData, assignmentsData] = await Promise.all([
      fs.readFile(ERRORS_FILE, 'utf8').then(d => JSON.parse(d)),
      fs.readFile(PAIRS_FILE, 'utf8').then(d => JSON.parse(d)),
      fs.readFile(ASSIGNMENTS_FILE, 'utf8').then(d => JSON.parse(d))
    ]);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[resolve] MongoDB conectado.');

    // Análises
    const ambiguousAnalysis = await resolveAmbiguousMatches(errorsData, null);
    const emptyAnalysis = await analyzeEmptyDelegations(errorsData);
    const usersNotFoundAnalysis = await analyzeUsersNotFound(errorsData);
    const pairsAnalysis = await analyzePairsToCreate(errorsData);

    // Compilar relatório
    const report = {
      timestamp: new Date().toISOString(),
      totalErrors: errorsData.length,
      totalAssignments: assignmentsData.length,
      totalPairs: pairsData.length,
      resolutions: {
        ambiguousMatches: ambiguousAnalysis,
        emptyDelegations: emptyAnalysis,
        usersNotFound: usersNotFoundAnalysis,
        pairsToCreate: pairsAnalysis
      },
      recommendations: [
        `1. PARES NÃO VINCULADOS (${pairsAnalysis.patch.length}): Executar patch com operações MongoDB`,
        `2. DELEGAÇÕES VAZIAS (${emptyAnalysis.summary.totalEmpty}): Revisar manualmente ${emptyAnalysis.summary.filesAffected} arquivo(s)`,
        `3. USUÁRIOS NÃO ENCONTRADOS (${usersNotFoundAnalysis.summary.totalNotFound}): Verificar base de dados`,
        `4. MATCHES AMBÍGUOS: ${ambiguousAnalysis.resolved.length} resolvidos, ${ambiguousAnalysis.stillAmbiguous.length} precisam revisão`
      ]
    };

    // Salvar arquivos
    await Promise.all([
      fs.writeFile(OUTPUT_RESOLUTION, JSON.stringify(report, null, 2) + '\n'),
      fs.writeFile(OUTPUT_PATCH, JSON.stringify(pairsAnalysis.patch, null, 2) + '\n'),
      fs.writeFile(OUTPUT_MANUAL, JSON.stringify({
        ambiguousMatches: ambiguousAnalysis.stillAmbiguous,
        emptyDelegations: emptyAnalysis
      }, null, 2) + '\n')
    ]);

    console.log('\n[resolve] ✓ Análise concluída!');
    console.log('[resolve] Arquivos gerados:');
    console.log(`  - ${path.relative(ROOT_DIR, OUTPUT_RESOLUTION)}`);
    console.log(`  - ${path.relative(ROOT_DIR, OUTPUT_PATCH)}`);
    console.log(`  - ${path.relative(ROOT_DIR, OUTPUT_MANUAL)}`);
    console.log('\n[resolve] Recomendações:');
    report.recommendations.forEach(r => console.log(`  ${r}`));

    await mongoose.disconnect();
  } catch (error) {
    console.error('[resolve] Erro:', error.message);
    process.exit(1);
  }
}

main();
