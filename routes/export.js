const express = require('express');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleAuth');
const User = require('../models/User');
const { buildDelegationGroups } = require('../utils/delegation-groups');
const { hasCommitteeRevealPassed } = require('../utils/event-config');

const router = express.Router();

function canBypassRevealLock(user) {
  return user?.role === 'admin' || user?.role === 'coordinator' || user?.role === 'teacher';
}

function normalizeCommitteeNumber(value) {
  const committee = Number(value);
  return Number.isInteger(committee) ? committee : NaN;
}

function normalizeGradePart(value = '') {
  // Remove tudo que não é letra ou número, converte para minúsculas
  // Isso permite comparar "8º ano A", "8anoA", "8o ano a" de forma consistente
  const cleaned = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')  // Remove diacríticos
    .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'))  // º→o, ª→a
    .replace(/[^\w]/g, '');  // Remove tudo que não é word character (a-z, 0-9, _)
  return cleaned;
}

function normalizeClassGroupForComparison(classGroup = '') {
  // Normaliza um classGroup (ex: "Sta Inês - 8º ano A") para comparação com valores de turma normalizados
  const normalized = String(classGroup || '').trim();
  if (!normalized) return '';
  
  const parts = normalized.split(' - ');
  const gradePart = (parts[1] || parts[0] || '').trim();
  
  return normalizeGradePart(gradePart);
}

function buildRows(users) {
  return users.map((user) => ({
    id: String(user._id),
    username: user.username || '',
    fullName: user.fullName || '',
    email: user.email || '',
    role: user.role || 'candidate',
    classGroup: user.classGroup || '',
    committee: user.committee ?? '',
    country: user.country || '',
    partner: user.partner || '',
    createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : ''
  }));
}

function buildResultRows(users) {
  return users.map((user) => ({
    id: String(user._id),
    username: user.username || '',
    fullName: user.fullName || '',
    email: user.email || '',
    classGroup: user.classGroup || '',
    firstChoice: user.registration?.firstChoice ?? '',
    secondChoice: user.registration?.secondChoice ?? '',
    thirdChoice: user.registration?.thirdChoice ?? '',
    finalCommittee: user.committee ?? '',
    teamSize: user.registration?.teamSize || '',
    country: user.country || '',
    partner: user.partner || '',
    submittedAt: user.registration?.submittedAt ? new Date(user.registration.submittedAt).toISOString() : ''
  }));
}

function getEducationSegmentFromText(value = '') {
  const original = String(value || '').toLowerCase();
  const normalized = original
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'))
    .replace(/\s+/g, ' ')  // Normaliza espaços múltiplos para um único espaço
    .trim();

  if (!normalized) {
    return '';
  }

  // Detectar Ensino Médio - com ou sem º/ª, com ou sem espaços
  if (
    normalized.includes('ensino medio') ||
    normalized.includes('ensino medio') ||
    normalized.replace(/\s/g, '').includes('ensinomedio') ||
    normalized.includes('serie') ||
    /\bem\b/.test(normalized) ||
    /[123]\s*a?\s*serie/i.test(normalized) ||
    /[123]a*serie/i.test(normalized.replace(/\s/g, '')) ||
    (/\b[123]\s*ano\b/i.test(normalized) && !normalized.includes('8o') && !normalized.includes('9o')) ||
    /\b1\s*serie\b/i.test(normalized.replace(/\s/g, ' ')) ||
    /\b2\s*serie\b/i.test(normalized.replace(/\s/g, ' ')) ||
    /\b3\s*serie\b/i.test(normalized.replace(/\s/g, ' ')) ||
    original.includes('1º') ||
    original.includes('2º') ||
    original.includes('3º') ||
    original.includes('1ª') ||
    original.includes('2ª') ||
    original.includes('3ª')
  ) {
    return 'em';
  }

  // Detectar 8º/9º - com ou sem º/ª, com ou sem espaços
  const noSpaces = normalized.replace(/\s/g, '');
  if (
    normalized.includes('8o') ||
    normalized.includes('8 ano') ||
    noSpaces.includes('8ano') ||
    normalized.includes('9o') ||
    normalized.includes('9 ano') ||
    noSpaces.includes('9ano') ||
    normalized.includes('8 e 9') ||
    normalized.includes('8/9') ||
    noSpaces.includes('8e9') ||
    original.includes('8º') ||
    original.includes('8ª') ||
    original.includes('9º') ||
    original.includes('9ª') ||
    /\b8\s*ano\b/i.test(normalized) ||
    /\b9\s*ano\b/i.test(normalized)
  ) {
    return 'fundamental';
  }

  return '';
}

function getDelegationSegment(group, registration) {
  const candidates = [
    registration?.classGroup,
    ...(Array.isArray(group?.members) ? group.members.map((member) => member.classGroup) : [])
  ];

  for (const value of candidates) {
    const segment = getEducationSegmentFromText(value);
    if (segment) {
      return segment;
    }
  }

  return '';
}

function buildDelegationSegmentRows(candidates, segment) {
  const groups = buildDelegationGroups(candidates);

  return groups
    .map((group) => {
      const sourceUser = candidates.find((candidate) => group.memberIds.includes(String(candidate._id)));
      const registration = sourceUser?.registration || {};
      const segmentValue = getDelegationSegment(group, registration);

      if (segmentValue !== segment) {
        return null;
      }

      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};

      return {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcaoComite: registration.firstChoice ?? '',
        segundaOpcaoComite: registration.secondChoice ?? '',
        terceiraOpcaoComite: registration.thirdChoice ?? '',
        comiteFinal: group.committee ?? '',
        pais: group.country || '',
        enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
      };
    })
    .filter(Boolean);
}

router.get('/committee/:num', authMiddleware, requireRole(['admin', 'coordinator', 'teacher', 'press']), async (req, res) => {
  const committee = normalizeCommitteeNumber(req.params.num);
  const format = String(req.query.format || 'csv').toLowerCase();

  if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
    return res.status(400).json({ error: 'Comite invalido.' });
  }

  if (!['csv', 'xlsx'].includes(format)) {
    return res.status(400).json({ error: 'Formato invalido. Use csv ou xlsx.' });
  }

  if (!hasCommitteeRevealPassed() && !canBypassRevealLock(req.user)) {
    return res.status(403).json({ error: 'As exportações por comitê permanecem bloqueadas até o fim da contagem regressiva.' });
  }

  try {
    const filter = { committee };

    const users = await User.find(filter).select('-password').sort({ fullName: 1, username: 1 });
    const rows = buildRows(users);

    if (format === 'csv') {
      const parser = new Parser({
        fields: ['id', 'username', 'fullName', 'email', 'role', 'classGroup', 'committee', 'country', 'partner', 'createdAt']
      });
      const csv = parser.parse(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="comite-${committee}.csv"`);
      return res.send(csv);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Comite ${committee}`);
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Usuario', key: 'username', width: 24 },
      { header: 'Nome completo', key: 'fullName', width: 32 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Funcao', key: 'role', width: 18 },
      { header: 'Turma', key: 'classGroup', width: 22 },
      { header: 'Comite', key: 'committee', width: 12 },
      { header: 'Pais', key: 'country', width: 24 },
      { header: 'Delegacao', key: 'partner', width: 26 },
      { header: 'Criado em', key: 'createdAt', width: 28 }
    ];
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="comite-${committee}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/results', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();

  if (!['csv', 'xlsx'].includes(format)) {
    return res.status(400).json({ error: 'Formato invalido. Use csv ou xlsx.' });
  }

  try {
    const users = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .sort({ committee: 1, fullName: 1, username: 1 });

    const rows = buildResultRows(users);

    if (format === 'csv') {
      const parser = new Parser({
        fields: ['id', 'username', 'fullName', 'email', 'classGroup', 'firstChoice', 'secondChoice', 'thirdChoice', 'finalCommittee', 'teamSize', 'country', 'partner', 'submittedAt']
      });
      const csv = parser.parse(rows);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="resultados-inscricoes.csv"');
      return res.send(csv);
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Resultados');
    worksheet.columns = [
      { header: 'ID', key: 'id', width: 28 },
      { header: 'Usuario', key: 'username', width: 24 },
      { header: 'Nome completo', key: 'fullName', width: 32 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Turma', key: 'classGroup', width: 18 },
      { header: '1a opcao', key: 'firstChoice', width: 12 },
      { header: '2a opcao', key: 'secondChoice', width: 12 },
      { header: '3a opcao', key: 'thirdChoice', width: 12 },
      { header: 'Comite final', key: 'finalCommittee', width: 14 },
      { header: 'Tamanho da delegacao', key: 'teamSize', width: 20 },
      { header: 'Pais', key: 'country', width: 24 },
      { header: 'Integrantes', key: 'partner', width: 28 },
      { header: 'Enviado em', key: 'submittedAt', width: 28 }
    ];
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="resultados-inscricoes.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/custom
router.get('/results/custom', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const COMMITTEE_NAMES = {
    1: 'CDH 2026', 2: 'AGNU', 3: 'ACNUR', 4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global', 6: 'UNHRC', 7: 'ONU Mulheres (CSW/2026)'
  };

  const segment   = String(req.query.segment   || 'all').toLowerCase();
  const turmasRaw = String(req.query.turmas || 'all');
  const turmas = turmasRaw
    ? turmasRaw.split(',').map((t) => String(t).trim()).filter(Boolean)
    : ['all'];

  // gera variações normalizadas das turmas recebidas (para lidar com "º", espaços e formatos alternativos)
  const turmasNormalized = turmas
    .filter((t) => t !== 'all')
    .flatMap((t) => {
      const v = String(t || '').trim();
      if (!v) return [];

      const base = normalizeGradePart(v);
      if (!base) return [];

      const noSpaces = base.replace(/\s+/g, '');
      return Array.from(new Set([
        base,
        v.toLowerCase(),
        v.replace(/\s+/g, '').toLowerCase(),
        v.replace(/º/g, 'o').replace(/ª/g, 'a').toLowerCase(),
        noSpaces,
      ]));
    });


  const unit      = String(req.query.unit      || 'all');
  const committee = String(req.query.committee || 'all').toLowerCase();
  const preference = String(req.query.preference || 'final').toLowerCase();
  const status    = String(req.query.status    || 'all').toLowerCase();
  const colsRaw   = String(req.query.cols      || '');
  const cols      = colsRaw ? colsRaw.split(',').map((c) => c.trim()).filter(Boolean) : null;

  if (!['final', 'first', 'second', 'third'].includes(preference)) {
    return res.status(400).json({ error: 'Tipo de preferência inválido. Use final, first, second ou third.' });
  }

  const ALL_COLS = [
    { header: 'Delegação',        key: 'delegationKey',   width: 36 },
    { header: 'Delegado 1',       key: 'delegado1',       width: 30 },
    { header: 'Turma Delegado 1', key: 'turmaDelegado1',  width: 24 },
    { header: 'Delegado 2',       key: 'delegado2',       width: 30 },
    { header: 'Turma Delegado 2', key: 'turmaDelegado2',  width: 24 },
    { header: '1ª opção',         key: 'primeiraOpcao',  width: 40 },
    { header: '2ª opção',         key: 'segundaOpcao',   width: 40 },
    { header: '3ª opção',         key: 'terceiraOpcao',  width: 40 },
    { header: 'Comitê final',     key: 'comiteFinal',    width: 40 },
    { header: 'País',             key: 'pais',           width: 24 },
    { header: 'Enviado em',       key: 'enviadoEm',      width: 28 }
  ];

  const selectedCols = cols
    ? ALL_COLS.filter((c) => c.key === 'delegationKey' || cols.includes(c.key))
    : ALL_COLS;

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 })
      .lean();

    const groups = buildDelegationGroups(candidates);
    const candidateById = new Map(candidates.map((candidate) => [String(candidate._id), candidate]));

    const getCommitteeByPreference = (group, registration) => {
      if (preference === 'first') return Number(registration?.firstChoice);
      if (preference === 'second') return Number(registration?.secondChoice);
      if (preference === 'third') return Number(registration?.thirdChoice);
      return Number(group?.committee);
    };

    const passesCustomFilters = (group) => {
      const members = Array.isArray(group.members) ? group.members : [];

      const getAllClassGroupsForGroup = (grp) => {
        const out = new Set();

        // 1) membros da delegação
        if (Array.isArray(grp?.members)) {
          grp.members.forEach((m) => {
            if (m?.classGroup) out.add(String(m.classGroup));
          });
        }

        // 2) registro do owner (candidato) ligado ao memberIds
        const owner = grp.memberIds.map((id) => candidateById.get(String(id))).find(Boolean);
        if (owner?.classGroup) out.add(String(owner.classGroup));
        if (owner?.registration?.classGroup) out.add(String(owner.registration.classGroup));

        return Array.from(out);
      };

      const candidateClassGroups = getAllClassGroupsForGroup(group);

      // filtro segmento
      if (segment !== 'all') {
        const sourceUser = group.memberIds.map((id) => candidateById.get(String(id))).find(Boolean);
        const seg = getDelegationSegment(group, sourceUser?.registration || {});
        if (seg !== segment) return false;
      }

      // filtro unidade
      if (unit !== 'all') {
        // Usa as classGroups agregadas do group (membros/owner)
        // e extrai o “lado esquerdo” do padrão “Unidade - turma”.
        const unitPartsForGroup = Array.from(candidateClassGroups || [])
          .map((cg) => String(cg || '').split(' - ')[0]?.trim() || '')
          .filter(Boolean);

        if (!unitPartsForGroup.includes(unit)) return false;
      }


      // filtro comitê
      if (committee === 'unassigned') {
        const c = Number(group.committee);
        if (c >= 1 && c <= 7) return false;
      } else if (committee !== 'all') {
        const sourceUser = group.memberIds.map((id) => candidateById.get(String(id))).find(Boolean);
        const registration = sourceUser?.registration || {};
        const committeeByPreference = getCommitteeByPreference(group, registration);

        if (committeeByPreference !== Number(committee)) return false;
      }

      // filtro turmas — comparação robusta (tenta equivalências em várias formas)
      // Observação: se unit e committee estiverem filtrando corretamente, essa etapa deve
      // ficar o mais “permissiva” possível para evitar perder delegações.
      if (!(turmas.length === 1 && turmas[0] === 'all')) {

        // normaliza tanto o que veio do BD quanto o que veio do front
        const classGroupsNormalized = (candidateClassGroups || [])
          .map((cg) => normalizeClassGroupForComparison(cg))
          .filter(Boolean);

        // também pega variações “diretas” do front para reduzir mismatch
        const frontGradeParts = (turmas || [])
          .map((t) => normalizeGradePart(t))
          .filter(Boolean);

        // e usa também as variações pré-geradas
        const turmasNormSet = new Set(frontGradeParts);
        (turmasNormalized || []).forEach((x) => turmasNormSet.add(x));
        const turmasNormList = Array.from(turmasNormSet);


        // tenta match por igualdade direta já normalizada
        const matchAny = frontGradeParts.some((normalizedTurma) =>
          classGroupsNormalized.some((cgNorm) => cgNorm === normalizedTurma)
        );

        // fallback 1: procurar match com “startsWith/contains” em partes normalizadas
        const matchAnyFallback =
          !matchAny &&
          frontGradeParts.some((normalizedTurma) =>
            classGroupsNormalized.some((cgNorm) =>
              cgNorm === normalizedTurma || cgNorm.includes(normalizedTurma) || normalizedTurma.includes(cgNorm)
            )
          );

        if (!matchAny && !matchAnyFallback) return false;
      }


      // filtro status
      const committeeNum = Number(group.committee);
      const isAssigned = committeeNum >= 1 && committeeNum <= 7;
      if (status === 'assigned'   && !isAssigned) return false;
      if (status === 'unassigned' &&  isAssigned) return false;

      return true;
    };

    res.status(200);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="export-personalizado.xlsx"');
    res.setHeader('Cache-Control', 'no-store');

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      stream: res,
      useSharedStrings: true,
      useStyles: true
    });

    const worksheet = workbook.addWorksheet('Personalizado');
    worksheet.columns = selectedCols;
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    for (const group of groups) {
      if (!passesCustomFilters(group)) {
        continue;
      }

      const sourceUser = group.memberIds.map((id) => candidateById.get(String(id))).find(Boolean);
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      const committeeNum = Number(group.committee);
      const preferenceCommitteeNum = getCommitteeByPreference(group, registration);

      const row = {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao: COMMITTEE_NAMES[registration.firstChoice] || registration.firstChoice || '',
        segundaOpcao: COMMITTEE_NAMES[registration.secondChoice] || registration.secondChoice || '',
        terceiraOpcao: COMMITTEE_NAMES[registration.thirdChoice] || registration.thirdChoice || '',
        comiteFinal: COMMITTEE_NAMES[committeeNum] || (committeeNum ? String(committeeNum) : 'Não definido'),
        pais: group.country || '',
        enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : '',
        comitePreferencia: COMMITTEE_NAMES[preferenceCommitteeNum] || (preferenceCommitteeNum ? String(preferenceCommitteeNum) : 'Não definido')
      };

      const outputRow = {};
      selectedCols.forEach(({ key }) => {
        outputRow[key] = row[key] ?? '';
      });

      worksheet.addRow(outputRow).commit();
    }

    worksheet.commit();
    await workbook.commit();
  } catch (error) {
    console.error('Erro ao gerar export personalizado em streaming:', error);
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/by-committee/:num
router.get('/results/by-committee/:num', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const committee = normalizeCommitteeNumber(req.params.num);
  if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
    return res.status(400).json({ error: 'Comitê inválido.' });
  }

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null },
      committee
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ fullName: 1 });

    const groups = buildDelegationGroups(candidates);
    const rows = groups.map((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      return {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao: registration.firstChoice ?? '',
        segundaOpcao: registration.secondChoice ?? '',
        terceiraOpcao: registration.thirdChoice ?? '',
        comiteFinal: group.committee ?? '',
        pais: group.country || '',
        enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
      };
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Comite ${committee}`);
    worksheet.columns = [
      { header: 'Delegação', key: 'delegationKey', width: 36 },
      { header: 'Delegado 1', key: 'delegado1', width: 30 },
      { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
      { header: 'Delegado 2', key: 'delegado2', width: 30 },
      { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
      { header: '1ª opção', key: 'primeiraOpcao', width: 12 },
      { header: '2ª opção', key: 'segundaOpcao', width: 12 },
      { header: '3ª opção', key: 'terceiraOpcao', width: 12 },
      { header: 'Comitê final', key: 'comiteFinal', width: 14 },
      { header: 'País', key: 'pais', width: 24 },
      { header: 'Enviado em', key: 'enviadoEm', width: 28 }
    ];
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="delegacoes-comite-${committee}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/by-unit
router.get('/results/by-unit', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ fullName: 1 });

    const groups = buildDelegationGroups(candidates);
    const workbook = new ExcelJS.Workbook();
    const units = ['Sta Ines', 'Palmares', 'Outras'];

    const columns = [
      { header: 'Delegação', key: 'delegationKey', width: 36 },
      { header: 'Delegado 1', key: 'delegado1', width: 30 },
      { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
      { header: 'Delegado 2', key: 'delegado2', width: 30 },
      { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
      { header: '1ª opção', key: 'primeiraOpcao', width: 12 },
      { header: '2ª opção', key: 'segundaOpcao', width: 12 },
      { header: '3ª opção', key: 'terceiraOpcao', width: 12 },
      { header: 'Comitê final', key: 'comiteFinal', width: 14 },
      { header: 'País', key: 'pais', width: 24 },
      { header: 'Enviado em', key: 'enviadoEm', width: 28 }
    ];

    for (const unit of units) {
      const unitRows = groups
        .filter((group) => {
          const members = Array.isArray(group.members) ? group.members : [];
        const memberUnits = members
            .map((m) => {
              const classGroup = String(m?.classGroup || '');
              // Normaliza para remover variações "8º/8ª", acentos e espaços
              // para comparar com a unidade selecionada (ex.: "Sta Ines", "Palmares", etc.).
              // A unidade fica na parte esquerda do padrão "Unidade - Série".
              const unitPart = classGroup.split(' - ')[0]?.trim() || '';
              return normalizeClassGroupForComparison(unitPart);
            })
            .filter(Boolean);

          // Considera também o “owner” (candidato) ligado ao group (memberIds)
          const owner = candidates.find((c) => group.memberIds.includes(String(c._id)));
          const ownerUnit = String(owner?.classGroup || owner?.registration?.classGroup || '').split(' - ')[0]?.trim() || '';
          const allUnitsForGroup = Array.from(new Set([...memberUnits, ownerUnit].filter(Boolean)));

          if (unit === 'Outras') {
            return !allUnitsForGroup.includes('Sta Ines') && !allUnitsForGroup.includes('Palmares');
          }

          return allUnitsForGroup.includes(unit);
        })
        .map((group) => {
          const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
          const registration = sourceUser?.registration || {};
          const members = Array.isArray(group.members) ? group.members : [];
          const delegate1 = members[0] || {};
          const delegate2 = members[1] || {};
          return {
            delegationKey: group.key,
            delegado1: delegate1.fullName || delegate1.username || '',
            turmaDelegado1: delegate1.classGroup || '',
            delegado2: delegate2.fullName || delegate2.username || '',
            turmaDelegado2: delegate2.classGroup || '',
            primeiraOpcao: registration.firstChoice ?? '',
            segundaOpcao: registration.secondChoice ?? '',
            terceiraOpcao: registration.thirdChoice ?? '',
            comiteFinal: group.committee ?? '',
            pais: group.country || '',
            enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
          };
        });

      if (!unitRows.length) continue;
      const ws = workbook.addWorksheet(unit);
      ws.columns = columns;
      ws.addRows(unitRows);
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: 'frozen', ySplit: 1 }];
    }

    if (!workbook.worksheets.length) {
      workbook.addWorksheet('Vazio').addRow(['Nenhuma delegação encontrada.']);
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="delegacoes-por-unidade.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/unassigned
router.get('/results/unassigned', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const turmasRaw = String(req.query.turmas || 'all');
  const turmas = turmasRaw
    ? turmasRaw.split(',').map((t) => String(t).trim()).filter(Boolean)
    : ['all'];
  
  const unit = String(req.query.unit || 'all');

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null },
      $or: [{ committee: null }, { committee: { $exists: false } }]
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    let groups = buildDelegationGroups(candidates).filter(
      (g) => !g.committee || (Number(g.committee) < 1 || Number(g.committee) > 7)
    );

    // Aplicar filtro de unidade
    if (unit !== 'all') {
      groups = groups.filter((group) => {
        const members = Array.isArray(group.members) ? group.members : [];
        const classGroup = members[0]?.classGroup || '';
        const unitPart = classGroup.split(' - ')[0]?.trim() || '';
        return unitPart === unit;
      });
    }

    // Aplicar filtro de turmas
    if (!(turmas.length === 1 && turmas[0] === 'all')) {
      groups = groups.filter((group) => {
        const members = Array.isArray(group.members) ? group.members : [];
        const memberClassGroup = (members[0] || {}).classGroup || '';
        const normalizedDataTurma = normalizeClassGroupForComparison(memberClassGroup);
        const matchAny = turmas.some((t) => {
          const normalizedTurma = normalizeGradePart(t);
          return normalizedDataTurma === normalizedTurma;
        });
        return matchAny;
      });
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Sem Comite Final');
    worksheet.columns = [
      { header: 'Delegação', key: 'delegationKey', width: 36 },
      { header: 'Delegado 1', key: 'delegado1', width: 30 },
      { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
      { header: 'Delegado 2', key: 'delegado2', width: 30 },
      { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
      { header: '1ª opção', key: 'primeiraOpcao', width: 12 },
      { header: '2ª opção', key: 'segundaOpcao', width: 12 },
      { header: '3ª opção', key: 'terceiraOpcao', width: 12 },
      { header: 'Enviado em', key: 'enviadoEm', width: 28 }
    ];

    worksheet.addRows(groups.map((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      return {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao: registration.firstChoice ?? '',
        segundaOpcao: registration.secondChoice ?? '',
        terceiraOpcao: registration.thirdChoice ?? '',
        enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
      };
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="delegacoes-sem-comite.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/all-delegations
router.get('/results/all-delegations', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const COMMITTEE_NAMES = {
    1: 'CDH 2026', 2: 'AGNU', 3: 'ACNUR', 4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global', 6: 'UNHRC', 7: 'ONU Mulheres (CSW/2026)'
  };

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    const groups = buildDelegationGroups(candidates);
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Todas as Delegações');
    worksheet.columns = [
      { header: 'Delegação', key: 'delegationKey', width: 36 },
      { header: 'Delegado 1', key: 'delegado1', width: 30 },
      { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
      { header: 'Delegado 2', key: 'delegado2', width: 30 },
      { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
      { header: '1ª opção', key: 'primeiraOpcao', width: 40 },
      { header: '2ª opção', key: 'segundaOpcao', width: 40 },
      { header: '3ª opção', key: 'terceiraOpcao', width: 40 },
      { header: 'Comitê final', key: 'comiteFinal', width: 40 },
      { header: 'País', key: 'pais', width: 24 },
      { header: 'Enviado em', key: 'enviadoEm', width: 28 }
    ];

    worksheet.addRows(groups.map((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      const committeeNum = Number(group.committee);
      return {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao: COMMITTEE_NAMES[registration.firstChoice] || registration.firstChoice || '',
        segundaOpcao: COMMITTEE_NAMES[registration.secondChoice] || registration.secondChoice || '',
        terceiraOpcao: COMMITTEE_NAMES[registration.thirdChoice] || registration.thirdChoice || '',
        comiteFinal: COMMITTEE_NAMES[committeeNum] || (committeeNum ? String(committeeNum) : 'Não definido'),
        pais: group.country || '',
        enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
      };
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="todas-delegacoes.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/results/segment', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const format = String(req.query.format || 'xlsx').toLowerCase();
  const segment = String(req.query.segment || '').toLowerCase();

  if (format !== 'xlsx') {
    return res.status(400).json({ error: 'Formato inválido para exportação segmentada. Use xlsx.' });
  }

  if (!['em', 'fundamental'].includes(segment)) {
    return res.status(400).json({ error: 'Segmento inválido. Use "em" ou "fundamental".' });
  }

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    const rows = buildDelegationSegmentRows(candidates, segment);

    const workbook = new ExcelJS.Workbook();
    const worksheetName = segment === 'em' ? 'Resultados EM' : 'Resultados 8e9';
    const worksheet = workbook.addWorksheet(worksheetName);

    worksheet.columns = [
      { header: 'Delegação', key: 'delegationKey', width: 36 },
      { header: 'Delegado 1', key: 'delegado1', width: 30 },
      { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
      { header: 'Delegado 2', key: 'delegado2', width: 30 },
      { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
      { header: '1ª opção de comitê', key: 'primeiraOpcaoComite', width: 18 },
      { header: '2ª opção de comitê', key: 'segundaOpcaoComite', width: 18 },
      { header: '3ª opção de comitê', key: 'terceiraOpcaoComite', width: 18 },
      { header: 'Comitê final', key: 'comiteFinal', width: 14 },
      { header: 'País', key: 'pais', width: 24 },
      { header: 'Enviado em', key: 'enviadoEm', width: 28 }
    ];

    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    const fileName = segment === 'em'
      ? 'resultados-inscricoes-em.xlsx'
      : 'resultados-inscricoes-8e9.xlsx';

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/fundamental-committees-summary
// Exporta todos os inscritos do ensino fundamental agrupados por comitê com resumo de preferências
router.get('/results/fundamental-committees-summary', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const COMMITTEE_NAMES = {
    1: 'CDH 2026',
    2: 'AGNU',
    3: 'ACNUR',
    4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global',
    6: 'UNHRC',
    7: 'ONU Mulheres (CSW/2026)'
  };

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    const groups = buildDelegationGroups(candidates);
    
    // Filtra apenas delegações do ensino fundamental (8º-9º ano)
    const fundamentalGroups = groups.filter((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const segment = getDelegationSegment(group, registration);
      return segment === 'fundamental';
    });

    // Agrupa por comitê final
    const byCommittee = {};
    for (let i = 1; i <= 7; i++) {
      byCommittee[i] = [];
    }

    // Contadores de preferências globais
    const preferenceCounters = {
      first: {},
      second: {},
      third: {}
    };

    fundamentalGroups.forEach((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      const committeeNum = Number(group.committee);

      const row = {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao: COMMITTEE_NAMES[registration.firstChoice] || registration.firstChoice || '',
        segundaOpcao: COMMITTEE_NAMES[registration.secondChoice] || registration.secondChoice || '',
        terceiraOpcao: COMMITTEE_NAMES[registration.thirdChoice] || registration.thirdChoice || '',
        comiteFinal: COMMITTEE_NAMES[committeeNum] || (committeeNum ? String(committeeNum) : 'Não definido'),
        pais: group.country || ''
      };

      // Adiciona à lista do comitê final
      if (committeeNum >= 1 && committeeNum <= 7) {
        byCommittee[committeeNum].push(row);
      }

      // Conta preferências
      const first = Number(registration.firstChoice);
      const second = Number(registration.secondChoice);
      const third = Number(registration.thirdChoice);

      if (first >= 1 && first <= 7) {
        preferenceCounters.first[first] = (preferenceCounters.first[first] || 0) + 1;
      }
      if (second >= 1 && second <= 7) {
        preferenceCounters.second[second] = (preferenceCounters.second[second] || 0) + 1;
      }
      if (third >= 1 && third <= 7) {
        preferenceCounters.third[third] = (preferenceCounters.third[third] || 0) + 1;
      }
    });

    // Encontra top 3 de cada preferência
    const getTop3 = (counter) => {
      return Object.entries(counter)
        .map(([committee, count]) => ({ committee: Number(committee), count, name: COMMITTEE_NAMES[committee] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);
    };

    const topFirst = getTop3(preferenceCounters.first);
    const topSecond = getTop3(preferenceCounters.second);
    const topThird = getTop3(preferenceCounters.third);

    // Cria workbook
    const workbook = new ExcelJS.Workbook();

    // Sheet 1: Resumo de preferências
    const summarySheet = workbook.addWorksheet('Resumo Preferências');
    summarySheet.columns = [
      { header: 'Posição', key: 'position', width: 15 },
      { header: '1ª Opção (Comitê)', key: 'first_committee', width: 40 },
      { header: 'Quantidade', key: 'first_count', width: 15 },
      { header: '2ª Opção (Comitê)', key: 'second_committee', width: 40 },
      { header: 'Quantidade', key: 'second_count', width: 15 },
      { header: '3ª Opção (Comitê)', key: 'third_committee', width: 40 },
      { header: 'Quantidade', key: 'third_count', width: 15 }
    ];

    // Preenche o resumo
    for (let i = 0; i < 3; i++) {
      summarySheet.addRow({
        position: i + 1,
        first_committee: topFirst[i]?.name || '-',
        first_count: topFirst[i]?.count || '-',
        second_committee: topSecond[i]?.name || '-',
        second_count: topSecond[i]?.count || '-',
        third_committee: topThird[i]?.name || '-',
        third_count: topThird[i]?.count || '-'
      });
    }

    summarySheet.getRow(1).font = { bold: true, bg: 'CCCCCC' };
    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];

    // Sheet 2+: Delegações por comitê
    for (let i = 1; i <= 7; i++) {
      const delegations = byCommittee[i];
      if (delegations.length === 0) continue;

      const sheetName = `Comite ${i}`;
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = [
        { header: 'Delegação', key: 'delegationKey', width: 36 },
        { header: 'Delegado 1', key: 'delegado1', width: 30 },
        { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
        { header: 'Delegado 2', key: 'delegado2', width: 30 },
        { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
        { header: '1ª Opção', key: 'primeiraOpcao', width: 40 },
        { header: '2ª Opção', key: 'segundaOpcao', width: 40 },
        { header: '3ª Opção', key: 'terceiraOpcao', width: 40 },
        { header: 'Comitê Final', key: 'comiteFinal', width: 40 },
        { header: 'País', key: 'pais', width: 24 }
      ];

      sheet.addRows(delegations);
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="ensino-fundamental-por-comites.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/by-committee-flexible
// Permite escolher comitê (1-7, all, ou unassigned) com filtros de unidade e turma
router.get('/results/by-committee-flexible', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const COMMITTEE_NAMES = {
    1: 'CDH 2026', 2: 'AGNU', 3: 'ACNUR', 4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global', 6: 'UNHRC', 7: 'ONU Mulheres (CSW/2026)'
  };

  const committee = String(req.query.committee || 'all').toLowerCase();
  const unit = String(req.query.unit || 'all');
  const turmasRaw = String(req.query.turmas || 'all');
  const turmas = turmasRaw
    ? turmasRaw.split(',').map((t) => String(t).trim()).filter(Boolean)
    : ['all'];

  // Validar committee
  if (committee !== 'all' && committee !== 'unassigned' && !/^[1-7]$/.test(committee)) {
    return res.status(400).json({ error: 'Comitê inválido. Use "all", "unassigned" ou 1-7.' });
  }

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    let groups = buildDelegationGroups(candidates);

    // Aplicar filtro de comitê
    if (committee === 'unassigned') {
      groups = groups.filter((g) => !g.committee || (Number(g.committee) < 1 || Number(g.committee) > 7));
    } else if (committee !== 'all') {
      const committeeNum = Number(committee);
      groups = groups.filter((g) => Number(g.committee) === committeeNum);
    }

    // Aplicar filtro de unidade
    if (unit !== 'all') {
      groups = groups.filter((group) => {
        const members = Array.isArray(group.members) ? group.members : [];
        const classGroup = members[0]?.classGroup || '';
        const unitPart = classGroup.split(' - ')[0]?.trim() || '';
        return unitPart === unit;
      });
    }

    // Aplicar filtro de turmas
    if (!(turmas.length === 1 && turmas[0] === 'all')) {
      groups = groups.filter((group) => {
        const members = Array.isArray(group.members) ? group.members : [];
        const memberClassGroup = (members[0] || {}).classGroup || '';
        const normalizedDataTurma = normalizeClassGroupForComparison(memberClassGroup);
        const matchAny = turmas.some((t) => {
          const normalizedTurma = normalizeGradePart(t);
          return normalizedDataTurma === normalizedTurma;
        });
        return matchAny;
      });
    }

    const rows = groups.map((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      const committeeNum = Number(group.committee);
      
      return {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao: COMMITTEE_NAMES[registration.firstChoice] || registration.firstChoice || '',
        segundaOpcao: COMMITTEE_NAMES[registration.secondChoice] || registration.secondChoice || '',
        terceiraOpcao: COMMITTEE_NAMES[registration.thirdChoice] || registration.thirdChoice || '',
        comiteFinal: COMMITTEE_NAMES[committeeNum] || (committeeNum ? String(committeeNum) : 'Não definido'),
        pais: group.country || '',
        enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
      };
    });

    const worksheetName = committee === 'unassigned' ? 'Sem Comitê' : 
                          committee === 'all' ? 'Todos Comitês' : 
                          `Comitê ${committee}`;

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(worksheetName);
    worksheet.columns = [
      { header: 'Delegação', key: 'delegationKey', width: 36 },
      { header: 'Delegado 1', key: 'delegado1', width: 30 },
      { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
      { header: 'Delegado 2', key: 'delegado2', width: 30 },
      { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
      { header: '1ª opção', key: 'primeiraOpcao', width: 40 },
      { header: '2ª opção', key: 'segundaOpcao', width: 40 },
      { header: '3ª opção', key: 'terceiraOpcao', width: 40 },
      { header: 'Comitê final', key: 'comiteFinal', width: 40 },
      { header: 'País', key: 'pais', width: 24 },
      { header: 'Enviado em', key: 'enviadoEm', width: 28 }
    ];
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="resultados-comite-${committee}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/export/results/by-committee-preference
// Exporta delegações que têm um comitê específico como preferência (1ª, 2ª, 3ª opção ou final)
router.get('/results/by-committee-preference', authMiddleware, requireRole(['admin', 'coordinator', 'teacher']), async (req, res) => {
  const COMMITTEE_NAMES = {
    1: 'CDH 2026', 2: 'AGNU', 3: 'ACNUR', 4: 'Bioética e Genética Humana',
    5: 'Nova Ordem Global', 6: 'UNHRC', 7: 'ONU Mulheres (CSW/2026)'
  };

  const committee = String(req.query.committee || '1');
  const preferenceType = String(req.query.preference || 'final').toLowerCase();
  const unit = String(req.query.unit || 'all');
  const turmasRaw = String(req.query.turmas || 'all');
  const turmas = turmasRaw
    ? turmasRaw.split(',').map((t) => String(t).trim()).filter(Boolean)
    : ['all'];

  // Validar parâmetros
  if (!/^[1-7]$/.test(committee)) {
    return res.status(400).json({ error: 'Comitê inválido. Use 1-7.' });
  }

  if (!['first', 'second', 'third', 'final'].includes(preferenceType)) {
    return res.status(400).json({ error: 'Tipo de preferência inválido. Use first, second, third ou final.' });
  }

  const committeeNum = Number(committee);

  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null }
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    let groups = buildDelegationGroups(candidates);

    // Filtrar por preferência
    groups = groups.filter((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};

      if (preferenceType === 'final') {
        return Number(group.committee) === committeeNum;
      } else if (preferenceType === 'first') {
        return Number(registration.firstChoice) === committeeNum;
      } else if (preferenceType === 'second') {
        return Number(registration.secondChoice) === committeeNum;
      } else if (preferenceType === 'third') {
        return Number(registration.thirdChoice) === committeeNum;
      }
      return false;
    });

    // Filtrar por unidade se necessário
    if (unit !== 'all') {
      groups = groups.filter((group) => {
        const members = Array.isArray(group.members) ? group.members : [];
        const classGroup = members[0]?.classGroup || '';
        const unitPart = classGroup.split(' - ')[0]?.trim() || '';
        return unitPart === unit;
      });
    }

    // Filtrar por turmas se necessário
    if (!(turmas.length === 1 && turmas[0] === 'all')) {
      groups = groups.filter((group) => {
        const members = Array.isArray(group.members) ? group.members : [];
        const memberClassGroup = (members[0] || {}).classGroup || '';
        const normalizedDataTurma = normalizeClassGroupForComparison(memberClassGroup);
        const matchAny = turmas.some((t) => {
          const normalizedTurma = normalizeGradePart(t);
          return normalizedDataTurma === normalizedTurma;
        });
        return matchAny;
      });
    }

    const rows = groups.map((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      const committeeNumFinal = Number(group.committee);

      return {
        delegationKey: group.key,
        delegado1: delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2: delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao: COMMITTEE_NAMES[registration.firstChoice] || registration.firstChoice || '',
        segundaOpcao: COMMITTEE_NAMES[registration.secondChoice] || registration.secondChoice || '',
        terceiraOpcao: COMMITTEE_NAMES[registration.thirdChoice] || registration.thirdChoice || '',
        comiteFinal: COMMITTEE_NAMES[committeeNumFinal] || (committeeNumFinal ? String(committeeNumFinal) : 'Não definido'),
        pais: group.country || '',
        enviadoEm: registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
      };
    });

    const prefLabel = {
      'first': '1ª Opção',
      'second': '2ª Opção',
      'third': '3ª Opção',
      'final': 'Comitê Final'
    }[preferenceType] || 'Preferência';

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${COMMITTEE_NAMES[committeeNum]} - ${prefLabel}`);
    worksheet.columns = [
      { header: 'Delegação', key: 'delegationKey', width: 36 },
      { header: 'Delegado 1', key: 'delegado1', width: 30 },
      { header: 'Turma Delegado 1', key: 'turmaDelegado1', width: 24 },
      { header: 'Delegado 2', key: 'delegado2', width: 30 },
      { header: 'Turma Delegado 2', key: 'turmaDelegado2', width: 24 },
      { header: '1ª opção', key: 'primeiraOpcao', width: 40 },
      { header: '2ª opção', key: 'segundaOpcao', width: 40 },
      { header: '3ª opção', key: 'terceiraOpcao', width: 40 },
      { header: 'Comitê final', key: 'comiteFinal', width: 40 },
      { header: 'País', key: 'pais', width: 24 },
      { header: 'Enviado em', key: 'enviadoEm', width: 28 }
    ];
    worksheet.addRows(rows);
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="comite-${committee}-${preferenceType}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;
