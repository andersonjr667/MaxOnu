require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

const ROOT_DIR = path.join(__dirname, '..');
const PATCH_FILE = path.join(ROOT_DIR, 'resolution-patch.json');
const ASSIGNMENTS_FILE = path.join(ROOT_DIR, 'pending-country-assignments.json');
const OUTPUT_APPLIED = path.join(ROOT_DIR, 'resolution-applied.json');

async function applyPatch(patch) {
  console.log(`[apply] Aplicando patch com ${patch.length} operações de pares...`);

  const results = [];
  for (const item of patch) {
    const { operations, firstUserId, secondUserId, committee, country, classGroup } = item;
    
    try {
      for (const op of operations) {
        const { updateOne } = op;
        const result = await User.updateOne(
          updateOne.filter,
          updateOne.update
        );
        
        results.push({
          status: 'success',
          operation: 'addToSet_delegationMembers',
          userId: updateOne.filter._id,
          matched: result.matchedCount,
          modified: result.modifiedCount,
          committee,
          country
        });
      }
    } catch (error) {
      results.push({
        status: 'error',
        operation: 'addToSet_delegationMembers',
        userId: operations[0].updateOne.filter._id,
        error: error.message,
        committee,
        country
      });
    }
  }

  return results;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI nao configurado.');
  }

  try {
    const [patchData, assignmentsData] = await Promise.all([
      fs.readFile(PATCH_FILE, 'utf8').then(d => JSON.parse(d)),
      fs.readFile(ASSIGNMENTS_FILE, 'utf8').then(d => JSON.parse(d))
    ]);

    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[apply] MongoDB conectado.');

    // Aplicar patch de pares
    const patchResults = await applyPatch(patchData);

    // Compilar relatório
    const report = {
      timestamp: new Date().toISOString(),
      operationsTotal: patchResults.length,
      operationsSuccess: patchResults.filter(r => r.status === 'success').length,
      operationsError: patchResults.filter(r => r.status === 'error').length,
      assignmentsToPush: assignmentsData.length,
      details: {
        pairOperations: patchResults
      },
      summary: {
        successRate: `${((patchResults.filter(r => r.status === 'success').length / patchResults.length) * 100).toFixed(2)}%`
      }
    };

    // Salvar relatório
    await fs.writeFile(OUTPUT_APPLIED, JSON.stringify(report, null, 2) + '\n');

    console.log('\n[apply] ✓ Resolução aplicada!');
    console.log(`[apply] Operações: ${report.operationsSuccess} sucesso, ${report.operationsError} erro`);
    console.log(`[apply] Relatório: ${path.relative(ROOT_DIR, OUTPUT_APPLIED)}`);

    if (report.operationsError === 0) {
      console.log('[apply] ✓ Todas as operações foram executadas com sucesso!');
      console.log(`[apply] Próximo passo: Execute 'npm run paises' para aplicar atribuições de países`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('[apply] Erro:', error.message);
    process.exit(1);
  }
}

main();
