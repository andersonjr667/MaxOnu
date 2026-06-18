require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

const ROOT_DIR = path.join(__dirname, '..');
const INPUT_ASSIGNMENTS = path.join(ROOT_DIR, 'pending-country-assignments.json');
const INPUT_PAIRS = path.join(ROOT_DIR, 'pending-delegation-pairs.json');
const BACKUP_DIR = path.join(ROOT_DIR, 'paises', 'backups');
const LOG_DIR = path.join(ROOT_DIR, 'paises', 'logs');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function requireAssignmentFields(assignment) {
  const missing = ['userId', 'fullName', 'classGroup', 'committee', 'country']
    .filter((field) => !assignment[field]);

  if (missing.length) {
    throw new Error(`Atribuicao invalida para ${assignment.userId || 'usuario sem id'}: campos ausentes ${missing.join(', ')}`);
  }

  if (!Number.isInteger(Number(assignment.committeeNumber))) {
    throw new Error(`Atribuicao invalida para ${assignment.userId}: committeeNumber ausente ou invalido.`);
  }
}

function requirePairFields(pair) {
  if (!pair || !Array.isArray(pair.members) || pair.members.length !== 2) {
    throw new Error(`Dupla invalida em ${pair?.sourceFile || 'arquivo desconhecido'}:${pair?.sourceRow || '?'}.`);
  }

  pair.members.forEach((member, index) => {
    const missing = ['userId', 'fullName', 'classGroup'].filter((field) => !member[field]);
    if (missing.length) {
      throw new Error(`Membro ${index + 1} da dupla ${pair.sourceFile}:${pair.sourceRow} invalido: campos ausentes ${missing.join(', ')}`);
    }
  });
}

async function writeLog(logPath, lines) {
  await fs.writeFile(logPath, `${lines.join('\n')}\n`);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI nao configurado.');
  }

  const runId = timestamp();
  const logLines = [`[${new Date().toISOString()}] Inicio do lancamento de paises e comites.`];

  const rawAssignments = JSON.parse(await fs.readFile(INPUT_ASSIGNMENTS, 'utf8'));
  if (!Array.isArray(rawAssignments)) {
    throw new Error('pending-country-assignments.json deve conter um array.');
  }

  const assignmentsByUserId = new Map();
  rawAssignments.forEach((assignment) => {
    requireAssignmentFields(assignment);
    assignmentsByUserId.set(String(assignment.userId), assignment);
  });
  const assignments = Array.from(assignmentsByUserId.values());
  let rawPairs = [];
  try {
    rawPairs = JSON.parse(await fs.readFile(INPUT_PAIRS, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  if (!Array.isArray(rawPairs)) {
    throw new Error('pending-delegation-pairs.json deve conter um array.');
  }
  rawPairs.forEach(requirePairFields);
  const pairsToCreate = rawPairs.filter((pair) => pair.status === 'needs_link');

  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.mkdir(LOG_DIR, { recursive: true });

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[paises] MongoDB conectado. Preparando backup.');

  const userIds = Array.from(new Set([
    ...assignments.map((assignment) => assignment.userId),
    ...pairsToCreate.flatMap((pair) => pair.members.map((member) => member.userId))
  ]));
  const affectedUsers = await User.find({ _id: { $in: userIds } })
    .select('_id username fullName classGroup committee committeeName country partner delegationMembers registration updatedAt')
    .lean();

  const backupPath = path.join(BACKUP_DIR, `users-before-paises-${runId}.json`);
  const logPath = path.join(LOG_DIR, `paises-${runId}.log`);
  await fs.writeFile(backupPath, `${JSON.stringify(affectedUsers, null, 2)}\n`);
  logLines.push(`[${new Date().toISOString()}] Backup criado em ${path.relative(ROOT_DIR, backupPath)} com ${affectedUsers.length} usuarios.`);

  const affectedIds = new Set(affectedUsers.map((user) => String(user._id)));
  const summary = {
    requestedAssignments: assignments.length,
    requestedPairLinks: pairsToCreate.length,
    backupUsers: affectedUsers.length,
    linkedPairs: 0,
    failedPairLinks: 0,
    updatedUsers: 0,
    missingUsers: 0,
    failedUpdates: 0,
    backupFile: path.relative(ROOT_DIR, backupPath),
    logFile: path.relative(ROOT_DIR, logPath)
  };
  const userById = new Map(affectedUsers.map((user) => [String(user._id), user]));

  for (const pair of pairsToCreate) {
    const [first, second] = pair.members;
    const firstUser = userById.get(String(first.userId));
    const secondUser = userById.get(String(second.userId));

    if (!firstUser || !secondUser) {
      summary.failedPairLinks += 1;
      logLines.push(
        `[${new Date().toISOString()}] Dupla nao criada por usuario ausente: ` +
        `${pair.sourceFile}:${pair.sourceRow} | ${first.fullName} <-> ${second.fullName}`
      );
      continue;
    }

    try {
      await Promise.all([
        User.updateOne(
          { _id: first.userId },
          {
            $set: {
              delegationMembers: [second.userId],
              partner: secondUser.username || second.fullName,
              'registration.teamSize': 2
            }
          }
        ),
        User.updateOne(
          { _id: second.userId },
          {
            $set: {
              delegationMembers: [first.userId],
              partner: firstUser.username || first.fullName,
              'registration.teamSize': 2
            }
          }
        )
      ]);

      summary.linkedPairs += 1;
      logLines.push(
        `[${new Date().toISOString()}] Dupla criada/ajustada: ${pair.sourceFile}:${pair.sourceRow} | ` +
        `${first.fullName} (${first.classGroup}) <-> ${second.fullName} (${second.classGroup})`
      );
    } catch (error) {
      summary.failedPairLinks += 1;
      logLines.push(
        `[${new Date().toISOString()}] Erro ao criar dupla ${pair.sourceFile}:${pair.sourceRow} | ` +
        `${first.fullName} <-> ${second.fullName}: ${error.message}`
      );
    }
  }

  for (const assignment of assignments) {
    if (!affectedIds.has(String(assignment.userId))) {
      summary.missingUsers += 1;
      logLines.push(`[${new Date().toISOString()}] Usuario nao encontrado: ${assignment.userId} (${assignment.fullName}, ${assignment.classGroup}).`);
      continue;
    }

    try {
      const result = await User.updateOne(
        { _id: assignment.userId },
        {
          $set: {
            committee: Number(assignment.committeeNumber),
            committeeName: assignment.committee,
            country: assignment.country
          }
        }
      );

      if (result.matchedCount !== 1) {
        summary.missingUsers += 1;
        logLines.push(`[${new Date().toISOString()}] Usuario desapareceu durante update: ${assignment.userId}.`);
        continue;
      }

      summary.updatedUsers += result.modifiedCount === 1 ? 1 : 0;
      logLines.push(
        `[${new Date().toISOString()}] Atualizado ${assignment.userId} | ${assignment.fullName} | ${assignment.classGroup} | ` +
        `Comite ${assignment.committeeNumber} (${assignment.committee}) | ${assignment.country}`
      );
    } catch (error) {
      summary.failedUpdates += 1;
      logLines.push(`[${new Date().toISOString()}] Erro ao atualizar ${assignment.userId}: ${error.message}`);
    }
  }

  logLines.push(`[${new Date().toISOString()}] Resumo final: ${JSON.stringify(summary)}`);
  await writeLog(logPath, logLines);

  console.log('[paises] Lancamento concluido.');
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((error) => {
    console.error('[paises] Falha:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
