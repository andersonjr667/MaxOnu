require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

const ROOT_DIR = path.join(__dirname, '..');
const COUNTRIES_DIR = path.join(ROOT_DIR, 'paises');
const OUTPUT_ASSIGNMENTS = path.join(ROOT_DIR, 'pending-country-assignments.json');
const OUTPUT_PAIRS = path.join(ROOT_DIR, 'pending-delegation-pairs.json');
const OUTPUT_ERRORS = path.join(ROOT_DIR, 'assignment-errors.json');
const OUTPUT_SUMMARY = path.join(ROOT_DIR, 'assignment-summary.json');
const COUNTRY_FOLDERS = ['8e9', 'EM'];

function normalizeValue(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeClassGroup(value) {
  return normalizeValue(value)
    .replace(/\b([1-9])o\s*ano\b/g, '$1 ano')
    .replace(/\b([1-3])a\s*serie\b/g, '$1 serie')
    .replace(/\b([1-3])o\s*serie\b/g, '$1 serie');
}

function getClassInfo(value = '') {
  const normalized = normalizeClassGroup(value);
  const unit = normalized.includes('palmares')
    ? 'palmares'
    : normalized.includes('sta ines') || normalized.includes('sta inês')
      ? 'sta ines'
      : '';
  const gradeMatch = normalized.match(/\b([89])\s*ano\b/) || normalized.match(/\b([123])\s*serie\b/);
  const grade = gradeMatch ? Number(gradeMatch[1]) : null;
  const segment = grade === 8 || grade === 9
    ? '8e9'
    : grade === 1 || grade === 2 || grade === 3
      ? 'EM'
      : '';

  return {
    normalized,
    unit,
    grade,
    segment
  };
}

function isClassGroupCompatible(expected, actual) {
  const expectedClass = normalizeClassGroup(expected);
  const actualClass = normalizeClassGroup(actual);

  if (!expectedClass || !actualClass) {
    return false;
  }

  return (
    expectedClass === actualClass ||
    actualClass.startsWith(`${expectedClass} `) ||
    expectedClass.startsWith(`${actualClass} `)
  );
}

function isSameUnitAndSegment(expected, actual, fileSegment) {
  const expectedInfo = getClassInfo(expected);
  const actualInfo = getClassInfo(actual);

  return Boolean(
    expectedInfo.unit &&
    actualInfo.unit &&
    expectedInfo.unit === actualInfo.unit &&
    actualInfo.segment === fileSegment
  );
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

function splitMemberNames(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];

  const commaParts = raw.split(/\s*,\s*/).map((part) => part.trim()).filter(Boolean);
  if (commaParts.length > 1) {
    return commaParts;
  }

  const andParts = raw.split(/\s+e\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ])/).map((part) => part.trim()).filter(Boolean);
  if (andParts.length === 2 && andParts.every((part) => part.split(/\s+/).length >= 2)) {
    return andParts;
  }

  return [raw];
}

function getCommitteeFromMeta(meta = []) {
  const rawName = String(Array.isArray(meta) ? meta[0] || '' : '').trim();
  const committee = rawName.replace(/^comit[eê]\s*\d+\s*:\s*/i, '').trim();
  const numberMatch = rawName.match(/comit[eê]\s*(\d+)/i);

  return {
    committee,
    committeeNumber: numberMatch ? Number(numberMatch[1]) : null,
    rawName
  };
}

function createUserIndex(users) {
  const byName = new Map();

  users.forEach((user) => {
    const nameKey = normalizeValue(user.fullName);
    if (!nameKey) return;

    if (!byName.has(nameKey)) {
      byName.set(nameKey, []);
    }
    byName.get(nameKey).push(user);
  });

  return byName;
}

function findUser({ byName, fullName, classGroup, segment }) {
  const nameKey = normalizeValue(fullName);
  const matches = byName.get(nameKey) || [];
  const classMatches = matches.filter((user) => isClassGroupCompatible(classGroup, user.classGroup));
  const unitSegmentMatches = matches.filter((user) => isSameUnitAndSegment(classGroup, user.classGroup, segment));

  if (!matches.length) {
    return {
      user: null,
      type: 'user_not_found',
      candidates: []
    };
  }

  if (classMatches.length === 1) {
    return {
      user: classMatches[0],
      type: 'matched',
      matchStrategy: 'class_group',
      candidates: classMatches
    };
  }

  if (classMatches.length > 1) {
    return {
      user: null,
      type: 'ambiguous_user_match',
      matchStrategy: 'class_group',
      candidates: classMatches
    };
  }

  if (unitSegmentMatches.length === 1) {
    return {
      user: unitSegmentMatches[0],
      type: 'matched',
      matchStrategy: 'unit_segment_fallback',
      candidates: unitSegmentMatches
    };
  }

  if (unitSegmentMatches.length > 1) {
    return {
      user: null,
      type: 'ambiguous_user_match',
      matchStrategy: 'unit_segment_fallback',
      candidates: unitSegmentMatches
    };
  }

  return {
    user: null,
    type: 'class_group_mismatch',
    candidates: matches
  };
}

function userHasDelegationMember(user, memberId) {
  return (user.delegationMembers || []).some((id) => String(id) === String(memberId));
}

async function listCommitteeFiles() {
  const files = [];

  for (const folder of COUNTRY_FOLDERS) {
    const folderPath = path.join(COUNTRIES_DIR, folder);
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((entry) => {
        files.push({
          segment: folder,
          absolutePath: path.join(folderPath, entry.name),
          relativePath: path.join('paises', folder, entry.name)
        });
      });
  }

  return files;
}

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI nao configurado.');
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('[paises:prepare] MongoDB conectado para leitura de usuarios.');

  const users = await User.find({})
    .select('_id fullName classGroup role delegationMembers')
    .lean();
  const byName = createUserIndex(users);

  const assignments = [];
  const pairs = [];
  const errors = [];
  const summary = {
    processedFiles: 0,
    processedRows: 0,
    usersMatched: 0,
    usersNotFound: 0,
    emptyDelegations: 0,
    pairRows: 0,
    pairsVerified: 0,
    pairMismatches: 0,
    pairIncomplete: 0,
    pairInvalidMemberCount: 0,
    pairsToCreate: 0,
    errors: 0
  };
  const seenAssignments = new Map();

  const files = await listCommitteeFiles();
  for (const file of files) {
    summary.processedFiles += 1;
    console.log(`[paises:prepare] Processando ${file.relativePath}`);

    const parsed = JSON.parse(await fs.readFile(file.absolutePath, 'utf8'));
    const { committee, committeeNumber, rawName } = getCommitteeFromMeta(parsed.meta);
    const rows = Array.isArray(parsed.rows) ? parsed.rows : [];

    if (!committee || !Number.isInteger(committeeNumber)) {
      errors.push({
        type: 'invalid_committee_meta',
        file: file.relativePath,
        meta: rawName
      });
      summary.errors += 1;
    }

    rows.forEach((row, index) => {
      summary.processedRows += 1;

      const classGroup = row.Turma;
      const country = row['Delegações'];
      if (isBlank(row['Membro 1']) || isBlank(classGroup)) {
        summary.emptyDelegations += 1;
        errors.push({
          type: 'empty_delegation',
          file: file.relativePath,
          rowIndex: index + 1,
          classGroup: classGroup || '',
          country: country || '',
          committee
        });
        return;
      }

      const matchedMembers = [];
      const expectedMembers = ['Membro 1', 'Membro 2'].flatMap((memberField) => (
        splitMemberNames(row[memberField]).map((fullName, nameIndex) => ({
          field: memberField,
          nameIndex: nameIndex + 1,
          fullName
        }))
      ));

      expectedMembers.forEach((expectedMember) => {
        const fullName = expectedMember.fullName;

        const result = findUser({ byName, fullName, classGroup, segment: file.segment });
        if (!result.user) {
          errors.push({
            type: result.type,
            fullName: String(fullName).trim(),
            classGroup: String(classGroup || '').trim(),
            file: file.relativePath,
            rowIndex: index + 1,
            candidates: result.candidates.map((candidate) => ({
              userId: String(candidate._id),
              fullName: candidate.fullName,
              classGroup: candidate.classGroup
            })),
            matchStrategy: result.matchStrategy || ''
          });
          summary.usersNotFound += 1;
          summary.errors += 1;
          return;
        }

        matchedMembers.push({
          field: expectedMember.field,
          nameIndex: expectedMember.nameIndex,
          user: result.user,
          requestedName: String(fullName).trim(),
          matchStrategy: result.matchStrategy
        });

        const userId = String(result.user._id);
        const assignment = {
          userId,
          fullName: result.user.fullName,
          classGroup: result.user.classGroup,
          committee,
          committeeNumber,
          country: String(country || '').trim(),
          releaseStatus: 'pending',
          sourceFile: file.relativePath,
          sourceRow: index + 1,
          matchStrategy: result.matchStrategy
        };
        const existing = seenAssignments.get(userId);

        if (existing && (existing.committee !== assignment.committee || existing.country !== assignment.country)) {
          errors.push({
            type: 'duplicate_conflicting_assignment',
            userId,
            fullName: result.user.fullName,
            classGroup: result.user.classGroup,
            previous: existing,
            next: assignment
          });
          summary.errors += 1;
          return;
        }

        if (!existing) {
          seenAssignments.set(userId, assignment);
          assignments.push(assignment);
          summary.usersMatched += 1;
        }
      });

      if (expectedMembers.length >= 2) {
        summary.pairRows += 1;

        if (expectedMembers.length !== 2) {
          summary.pairInvalidMemberCount += 1;
          errors.push({
            type: 'pair_member_count_invalid',
            file: file.relativePath,
            rowIndex: index + 1,
            classGroup: String(classGroup || '').trim(),
            country: String(country || '').trim(),
            committee,
            expectedCount: 2,
            foundCount: expectedMembers.length,
            expectedMembers: expectedMembers.map((member) => ({
              field: member.field,
              nameIndex: member.nameIndex,
              fullName: member.fullName
            })),
            matchedMembers: matchedMembers.map((member) => ({
              field: member.field,
              nameIndex: member.nameIndex,
              userId: String(member.user._id),
              fullName: member.user.fullName,
              classGroup: member.user.classGroup
            }))
          });
          return;
        }

        if (matchedMembers.length !== 2) {
          summary.pairIncomplete += 1;
          errors.push({
            type: 'pair_incomplete',
            file: file.relativePath,
            rowIndex: index + 1,
            classGroup: String(classGroup || '').trim(),
            country: String(country || '').trim(),
            committee,
            expectedMembers: expectedMembers.map((member) => ({
              field: member.field,
              nameIndex: member.nameIndex,
              fullName: member.fullName
            })),
            matchedMembers: matchedMembers.map((member) => ({
              field: member.field,
              nameIndex: member.nameIndex,
              userId: String(member.user._id),
              fullName: member.user.fullName,
              classGroup: member.user.classGroup
            }))
          });
          return;
        }

        const [first, second] = matchedMembers;
        const firstUserId = String(first.user._id);
        const secondUserId = String(second.user._id);

        if (firstUserId === secondUserId) {
          summary.pairMismatches += 1;
          errors.push({
            type: 'pair_duplicate_user',
            file: file.relativePath,
            rowIndex: index + 1,
            classGroup: String(classGroup || '').trim(),
            country: String(country || '').trim(),
            committee,
            userId: firstUserId,
            fullName: first.user.fullName
          });
          return;
        }

        const firstLinksSecond = userHasDelegationMember(first.user, secondUserId);
        const secondLinksFirst = userHasDelegationMember(second.user, firstUserId);

        // Criar par se A->B OU B->A estiver faltando.
        const needsLink = !firstLinksSecond || !secondLinksFirst;
        if (needsLink) {
          summary.pairMismatches += 1;
          summary.pairsToCreate += 1;
          pairs.push({
            status: 'needs_link',
            releaseStatus: 'pending',
            sourceFile: file.relativePath,
            sourceRow: index + 1,
            classGroup: String(classGroup || '').trim(),
            committee,
            committeeNumber,
            country: String(country || '').trim(),
            members: [
              {
                userId: firstUserId,
                fullName: first.user.fullName,
                classGroup: first.user.classGroup,
                requestedName: first.requestedName,
                matchStrategy: first.matchStrategy
              },
              {
                userId: secondUserId,
                fullName: second.user.fullName,
                classGroup: second.user.classGroup,
                requestedName: second.requestedName,
                matchStrategy: second.matchStrategy
              }
            ]
          });
          errors.push({
            type: 'pair_not_linked_in_site',
            file: file.relativePath,
            rowIndex: index + 1,
            classGroup: String(classGroup || '').trim(),
            country: String(country || '').trim(),
            committee,
            firstMember: {
              userId: firstUserId,
              fullName: first.user.fullName,
              classGroup: first.user.classGroup,
              hasSecondInDelegationMembers: firstLinksSecond
            },
            secondMember: {
              userId: secondUserId,
              fullName: second.user.fullName,
              classGroup: second.user.classGroup,
              hasFirstInDelegationMembers: secondLinksFirst
            }
          });
          return;
        }


        pairs.push({
          status: 'linked',
          releaseStatus: 'pending',
          sourceFile: file.relativePath,
          sourceRow: index + 1,
          classGroup: String(classGroup || '').trim(),
          committee,
          committeeNumber,
          country: String(country || '').trim(),
          members: [
            {
              userId: firstUserId,
              fullName: first.user.fullName,
              classGroup: first.user.classGroup,
              requestedName: first.requestedName,
              matchStrategy: first.matchStrategy
            },
            {
              userId: secondUserId,
              fullName: second.user.fullName,
              classGroup: second.user.classGroup,
              requestedName: second.requestedName,
              matchStrategy: second.matchStrategy
            }
          ]
        });
        summary.pairsVerified += 1;
      }
    });
  }

  summary.errors = errors.length;

  await fs.writeFile(OUTPUT_ASSIGNMENTS, `${JSON.stringify(assignments, null, 2)}\n`);
  await fs.writeFile(OUTPUT_PAIRS, `${JSON.stringify(pairs, null, 2)}\n`);
  await fs.writeFile(OUTPUT_ERRORS, `${JSON.stringify(errors, null, 2)}\n`);
  await fs.writeFile(OUTPUT_SUMMARY, `${JSON.stringify(summary, null, 2)}\n`);

  console.log('[paises:prepare] Arquivos gerados:');
  console.log(`- ${path.relative(ROOT_DIR, OUTPUT_ASSIGNMENTS)}`);
  console.log(`- ${path.relative(ROOT_DIR, OUTPUT_PAIRS)}`);
  console.log(`- ${path.relative(ROOT_DIR, OUTPUT_ERRORS)}`);
  console.log(`- ${path.relative(ROOT_DIR, OUTPUT_SUMMARY)}`);
  console.log(`[paises:prepare] Resumo: ${JSON.stringify(summary)}`);
}

main()
  .catch((error) => {
    console.error('[paises:prepare] Falha:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
