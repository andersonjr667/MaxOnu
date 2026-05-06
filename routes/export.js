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
  const normalized = String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!normalized) {
    return '';
  }

  if (
    normalized.includes('ensino medio') ||
    normalized.includes('medio') ||
    normalized.includes('serie') ||
    /\bem\b/.test(normalized)
  ) {
    return 'em';
  }

  if (
    normalized.includes('8o') ||
    normalized.includes('8 ano') ||
    normalized.includes('8ano') ||
    normalized.includes('9o') ||
    normalized.includes('9 ano') ||
    normalized.includes('9ano') ||
    normalized.includes('8 e 9') ||
    normalized.includes('8/9')
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
  const unit      = String(req.query.unit      || 'all');
  const committee = String(req.query.committee || 'all').toLowerCase();
  const status    = String(req.query.status    || 'all').toLowerCase();
  const colsRaw   = String(req.query.cols      || '');
  const cols      = colsRaw ? colsRaw.split(',').map((c) => c.trim()).filter(Boolean) : null;

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
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    const groups = buildDelegationGroups(candidates);

    const filtered = groups.filter((group) => {
      const members = Array.isArray(group.members) ? group.members : [];
      const classGroup = members[0]?.classGroup || '';

      // filtro segmento
      if (segment !== 'all') {
        const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
        const seg = getDelegationSegment(group, sourceUser?.registration || {});
        if (seg !== segment) return false;
      }

      // filtro unidade
      if (unit !== 'all') {
        const unitPart = classGroup.split(' - ')[0]?.trim() || '';
        if (unitPart !== unit) return false;
      }

      // filtro comitê
      if (committee === 'unassigned') {
        const c = Number(group.committee);
        if (c >= 1 && c <= 7) return false;
      } else if (committee !== 'all') {
        if (Number(group.committee) !== Number(committee)) return false;
      }

      // filtro status
      const committeeNum = Number(group.committee);
      const isAssigned = committeeNum >= 1 && committeeNum <= 7;
      if (status === 'assigned'   && !isAssigned) return false;
      if (status === 'unassigned' &&  isAssigned) return false;

      return true;
    });

    const rows = filtered.map((group) => {
      const sourceUser = candidates.find((c) => group.memberIds.includes(String(c._id)));
      const registration = sourceUser?.registration || {};
      const members = Array.isArray(group.members) ? group.members : [];
      const delegate1 = members[0] || {};
      const delegate2 = members[1] || {};
      const committeeNum = Number(group.committee);
      return {
        delegationKey:  group.key,
        delegado1:      delegate1.fullName || delegate1.username || '',
        turmaDelegado1: delegate1.classGroup || '',
        delegado2:      delegate2.fullName || delegate2.username || '',
        turmaDelegado2: delegate2.classGroup || '',
        primeiraOpcao:  COMMITTEE_NAMES[registration.firstChoice]  || registration.firstChoice  || '',
        segundaOpcao:   COMMITTEE_NAMES[registration.secondChoice] || registration.secondChoice || '',
        terceiraOpcao:  COMMITTEE_NAMES[registration.thirdChoice]  || registration.thirdChoice  || '',
        comiteFinal:    COMMITTEE_NAMES[committeeNum] || (committeeNum ? String(committeeNum) : 'Não definido'),
        pais:           group.country || '',
        enviadoEm:      registration.submittedAt ? new Date(registration.submittedAt).toISOString() : ''
      };
    });

    const workbook  = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Personalizado');
    worksheet.columns = selectedCols;
    worksheet.addRows(rows.map((row) => {
      const out = {};
      selectedCols.forEach(({ key }) => { out[key] = row[key] ?? ''; });
      return out;
    }));
    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: 'frozen', ySplit: 1 }];

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="export-personalizado.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
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
          const classGroup = members[0]?.classGroup || '';
          const unitPart = classGroup.split(' - ')[0]?.trim() || '';
          if (unit === 'Outras') return unitPart !== 'Sta Ines' && unitPart !== 'Palmares';
          return unitPart === unit;
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
  try {
    const candidates = await User.find({
      role: 'candidate',
      'registration.submittedAt': { $ne: null },
      $or: [{ committee: null }, { committee: { $exists: false } }]
    })
      .select('-password')
      .populate('delegationMembers', 'fullName username email classGroup committee country registration')
      .sort({ 'registration.submittedAt': 1, fullName: 1 });

    const groups = buildDelegationGroups(candidates).filter(
      (g) => !g.committee || (Number(g.committee) < 1 || Number(g.committee) > 7)
    );

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

module.exports = router;
