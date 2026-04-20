const express = require('express');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');
const authMiddleware = require('../middleware/auth');
const requireRole = require('../middleware/roleAuth');
const User = require('../models/User');

const router = express.Router();

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

router.get('/committee/:num', authMiddleware, requireRole(['admin', 'coordinator', 'teacher', 'press']), async (req, res) => {
  const committee = normalizeCommitteeNumber(req.params.num);
  const format = String(req.query.format || 'csv').toLowerCase();

  if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
    return res.status(400).json({ error: 'Comite invalido.' });
  }

  if (!['csv', 'xlsx'].includes(format)) {
    return res.status(400).json({ error: 'Formato invalido. Use csv ou xlsx.' });
  }

  try {
    const filter = { committee };
    if (req.user.role === 'teacher') {
      filter.role = 'candidate';
    }

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

module.exports = router;
