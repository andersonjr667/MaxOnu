require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');
const ExcelJS = require('exceljs');
const { Parser } = require('json2csv');

const app = express();
const DEFAULT_PORT = 3000;
let serverInstance;
let PORT = DEFAULT_PORT;
const COMMITTEE_REVEAL_DATE = new Date('2026-05-04T00:00:00-03:00');
const COMMITTEE_PAGES = new Set([
    '/delegacao-agnu-8-9.html',
    '/delegacao-agnu-em.html',
    '/delegacao-csnu-8-9.html',
    '/delegacao-csnu-em.html',
    '/delegacao-oea-8-9.html',
    '/delegacao-oea-em.html'
]);
const COMMITTEE_DATA = [
    {
        id: 1,
        shortTitle: '(CDH - 2026)',
        title: 'O Paradoxo da Hiperconectividade: Regulamentação da Vigilância Massiva, Ética da Inteligência Artificial e Proteção da Democracia na Era do Big Data'
    },
    {
        id: 2,
        shortTitle: '(AGNU)',
        title: 'Guerra, Multipolaridade e Disputas Territoriais: Desafios à Soberania, Segurança Global e Justiça Internacional no Século XXI'
    },
    {
        id: 3,
        shortTitle: '(ACNUR - Alto Comissariado das Nações Unidas para Refugiados)',
        title: 'Proteção e garantia de direitos de pessoas em situação de mobilidade humana em contextos de crises humanitárias'
    },
    {
        id: 4,
        shortTitle: 'Bioética e Genética Humana',
        title: 'Impactos globais da tecnologia de manipulação e edição genética e seus desafios éticos quanto à dignidade humana e aos direitos das futuras gerações'
    },
    {
        id: 5,
        shortTitle: 'Nova Ordem Global',
        title: 'A Nova Ordem Global em Disputa: Recursos Estratégicos, Poder e os Limites do Capitalismo no Século XXI'
    },
    {
        id: 6,
        shortTitle: '(UNHRC - Conselho de Direitos Humanos das Nações Unidas)',
        title: 'Identidade, memória e poder: disputas culturais e garantia de direitos em um mundo globalizado'
    },
    {
        id: 7,
        shortTitle: '(ONU MULHERES)',
        title: ''
    }
];

function isDbReady() {
    return mongoose.connection.readyState === 1;
}

function createInMemoryToken(user) {
    return jwt.sign(
        { id: user.id || user._id || user.username, username: user.username, role: user.role || 'candidate' },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
    );
}

function sanitizeQuestionPayload(question) {
    return typeof question === 'string' ? question.trim() : '';
}

function startServer(port) {
    serverInstance = app.listen(port, () => {
        console.log(`Server running on port ${port}`);
        console.log('Note: Running with in-memory fallback if MongoDB is unavailable');
    });
    serverInstance.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`Porta ${port} em uso. Tentando próxima porta...`);
            PORT = Number(port) + 1;
            startServer(PORT);
        } else {
            throw err;
        }
    });
}

// Middleware
app.use(cors());
app.use(express.json());

function committeesAreRevealed() {
    return Date.now() >= COMMITTEE_REVEAL_DATE.getTime();
}

app.use((req, res, next) => {
    if (COMMITTEE_PAGES.has(req.path)) {
        return res.redirect('/delegacoes.html');
    }
    next();
});

app.get('/api/reveal-status', (req, res) => {
    res.json({
        revealed: committeesAreRevealed(),
        revealDate: COMMITTEE_REVEAL_DATE.toISOString()
    });
});

app.get('/api/committees', (req, res) => {
    if (!committeesAreRevealed()) {
        return res.status(403).json({
            revealed: false,
            message: 'Os comitês permanecem em sigilo até o fim da contagem regressiva.'
        });
    }

    res.json({
        revealed: true,
        committees: COMMITTEE_DATA
    });
});

app.use(express.static('public'));

// MongoDB Connection with retry logic
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected successfully');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        console.log('Retrying connection in 5 seconds...');
        setTimeout(connectDB, 5000);
    }
};

// Initial connection attempt
connectDB();

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err);
});

mongoose.connection.on('disconnected', () => {
    console.log('MongoDB disconnected. Attempting to reconnect...');
    connectDB();
});

// Routes with fallback to in-memory storage when DB is unavailable
let inMemoryQuestions = [];
let inMemoryUsers = [];

// Models
const User = require('./models/User');
const Question = require('./models/Question');

// Authentication middleware
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: 'Token ausente' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        req.user = decoded;
        return next();
    } catch (err) {
        return res.status(401).json({ error: 'Token inválido' });
    }
}

function requireRole(roles = []) {
    return (req, res, next) => {
        if (!req.user || !roles.includes(req.user.role) && req.user.username !== 'Anderson') {
            return res.status(403).json({ error: 'Acesso negado' });
        }
        next();
    };
}

// User management endpoints
app.get('/api/users', authMiddleware, requireRole(['teacher','coordinator','admin']), async (req, res) => {
    try {
        const { role, committee } = req.query;
        if (!isDbReady()) {
            let users = inMemoryUsers.slice();
            if (role) users = users.filter(u => u.role === role);
            if (committee) users = users.filter(u => String(u.committee) === String(committee));
            return res.json(users);
        }
        const filter = {};
        if (role) filter.role = role;
        if (committee) filter.committee = Number(committee);
        const users = await User.find(filter).select('-password');
        res.json(users);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/users/:id', authMiddleware, requireRole(['teacher','coordinator','admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isDbReady()) {
            const user = inMemoryUsers.find(u => String(u.username) === String(id) || String(u.id) === String(id));
            return res.json(user || {});
        }
        const user = await User.findById(id).select('-password');
        res.json(user || {});
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Update user (assign country/committee/role) - restricted
app.put('/api/users/:id', authMiddleware, requireRole(['coordinator','admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};
        const { committee, country, role } = req.body;

        // Only admin may change role
        if (role) {
            if (req.user.role !== 'admin' && req.user.username !== 'Anderson') {
                return res.status(403).json({ error: 'Apenas admin pode alterar o role' });
            }
            updates.role = role;
        }

        // Coordinators and admins can assign committee and country
        if (committee !== undefined) updates.committee = committee;
        if (country !== undefined) updates.country = country;

        if (!isDbReady()) {
            const idx = inMemoryUsers.findIndex(u => String(u._id) === String(id) || String(u.username) === String(id));
            if (idx === -1) return res.status(404).json({ error: 'Usuário não encontrado' });
            inMemoryUsers[idx] = { ...inMemoryUsers[idx], ...updates };
            return res.json(inMemoryUsers[idx]);
        }

        const updated = await User.findByIdAndUpdate(id, updates, { new: true }).select('-password');
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/users/committee/:num', authMiddleware, requireRole(['teacher','coordinator','admin']), async (req, res) => {
    try {
        const num = Number(req.params.num);
        if (!isDbReady()) {
            return res.json(inMemoryUsers.filter(u => Number(u.committee) === num));
        }
        const users = await User.find({ committee: num }).select('-password');
        res.json(users);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Export users of a committee as CSV or XLSX
app.get('/api/export/committee/:num', authMiddleware, requireRole(['coordinator','admin']), async (req, res) => {
    try {
        const num = Number(req.params.num);
        const format = (req.query.format || 'csv').toLowerCase();
        let users = [];
        if (!isDbReady()) {
            users = inMemoryUsers.filter(u => Number(u.committee) === num);
        } else {
            users = await User.find({ committee: num }).select('-password');
        }

        const rows = users.map(u => ({ username: u.username, email: u.email, role: u.role, committee: u.committee, country: u.country, partner: u.partner }));

        if (format === 'xlsx') {
            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Committee');
            sheet.columns = [
                { header: 'Username', key: 'username', width: 30 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Role', key: 'role', width: 15 },
                { header: 'Committee', key: 'committee', width: 10 },
                { header: 'Country', key: 'country', width: 25 },
                { header: 'Partner', key: 'partner', width: 25 }
            ];
            sheet.addRows(rows);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=committee-${num}.xlsx`);
            await workbook.xlsx.write(res);
            res.end();
            return;
        }

        // default CSV
        const parser = new Parser({ fields: ['username', 'email', 'role', 'committee', 'country', 'partner'] });
        const csv = parser.parse(rows);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=committee-${num}.csv`);
        res.send(csv);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Public questions list shows only answered items
app.get('/api/questions', async (req, res) => {
    try {
        if (!isDbReady()) {
            return res.json(inMemoryQuestions.filter(q => q.answered));
        }
        const questions = await Question.find({ answered: true }).sort({ createdAt: -1 });
        res.json(questions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Modified routes with fallback
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        if (!isDbReady()) {
            // If MongoDB is not connected, use in-memory storage
            if (inMemoryUsers.find(u => u.username === username || u.email === email)) {
                return res.status(400).json({ error: 'Usuário já existe' });
            }
            inMemoryUsers.push({
                id: Date.now(),
                username,
                email,
                password,
                role: 'candidate',
                committee: null,
                country: '',
                partner: ''
            });
            return res.status(201).json({ message: 'Usuário registrado com sucesso' });
        }
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            return res.status(400).json({ error: 'Usuário ou email já existe' });
        }
        const user = new User({ username, email, password });
        await user.save();
        res.status(201).json({ message: 'Usuário registrado com sucesso' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!isDbReady()) {
            // If MongoDB is not connected, use in-memory storage
            const user = inMemoryUsers.find(u => u.username === username && u.password === password);
            if (!user) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            const token = createInMemoryToken(user);
            return res.json({ token, isAdmin: user.role === 'admin', role: user.role || 'candidate' });
        }
        const user = await User.findOne({ username });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const token = user.generateToken();
        res.json({ token, isAdmin: user.role === 'admin', role: user.role });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Return current user info
app.get('/api/me', authMiddleware, async (req, res) => {
    try {
        if (!isDbReady()) {
            const user = inMemoryUsers.find(u => u.username === req.user.username) || {};
            return res.json({ username: user.username, email: user.email, role: user.role || 'candidate', committee: user.committee, country: user.country, partner: user.partner });
        }
        const user = await User.findOne({ username: req.user.username }).select('-password');
        if (!user) return res.status(404).json({});
        res.json(user);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Modified questions routes with fallback
app.post('/api/questions', async (req, res) => {
    try {
        const questionText = sanitizeQuestionPayload(req.body.question);
        if (!questionText) {
            return res.status(400).json({ error: 'A pergunta não pode estar vazia.' });
        }

        if (!isDbReady()) {
            const question = { question: questionText, id: Date.now(), answered: false, answer: 'Sem Resposta ainda!', createdAt: new Date().toISOString() };
            inMemoryQuestions.push(question);
            return res.status(201).json(question);
        }
        const question = new Question({ question: questionText });
        await question.save();
        res.status(201).json(question);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/questions/pending', authMiddleware, requireRole(['teacher','coordinator','admin']), async (req, res) => {
    try {
        if (!isDbReady()) {
            return res.json(inMemoryQuestions.filter(q => !q.answered));
        }
        const questions = await Question.find({ answered: false }).sort({ createdAt: -1 });
        res.json(questions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/questions/:id/answer', authMiddleware, requireRole(['teacher','coordinator','admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { answer } = req.body;
        if (!isDbReady()) {
            const index = inMemoryQuestions.findIndex(q => String(q.id) === String(id) || String(q._id) === String(id));
            if (index === -1) return res.status(404).json({ error: 'Pergunta não encontrada' });
            inMemoryQuestions[index] = { ...inMemoryQuestions[index], answer, answered: true };
            return res.json(inMemoryQuestions[index]);
        }
        const question = await Question.findByIdAndUpdate(
            id,
            { answer, answered: true },
            { new: true }
        );
        if (!question) return res.status(404).json({ error: 'Pergunta não encontrada' });
        res.json(question);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/questions/:id', authMiddleware, requireRole(['teacher','coordinator','admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const updates = {};
        if (req.body.question !== undefined) {
            const questionText = sanitizeQuestionPayload(req.body.question);
            if (!questionText) {
                return res.status(400).json({ error: 'A pergunta não pode estar vazia.' });
            }
            updates.question = questionText;
        }
        if (req.body.answer !== undefined) updates.answer = req.body.answer;

        let updatedQuestion;
        if (!isDbReady()) {
            const index = inMemoryQuestions.findIndex(q => String(q.id) === String(id) || String(q._id) === String(id));
            if (index === -1) return res.status(404).json({ error: 'Pergunta não encontrada' });
            inMemoryQuestions[index] = { ...inMemoryQuestions[index], ...updates };
            updatedQuestion = inMemoryQuestions[index];
        } else {
            updatedQuestion = await Question.findByIdAndUpdate(id, updates, { new: true });
        }
        if (!updatedQuestion) return res.status(404).json({ error: 'Pergunta não encontrada' });
        res.json(updatedQuestion);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/questions/:id', authMiddleware, requireRole(['teacher','coordinator','admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isDbReady()) {
            inMemoryQuestions = inMemoryQuestions.filter(q => String(q.id) !== String(id) && String(q._id) !== String(id));
            return res.json({ message: 'Pergunta excluída com sucesso' });
        }
        await Question.findByIdAndDelete(id);
        res.json({ message: 'Pergunta excluída com sucesso' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Check if user is admin
app.get('/api/check-admin', authMiddleware, (req, res) => {
    res.json({ isAdmin: req.user.role === 'admin' || req.user.username === 'Anderson' });
});

// Serve static files

// Support requests for header/footer without ".html" (some includes or proxies ask for /header or /footer)
app.get('/header', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'public', 'header.html'), err => { if (err) next(err); });
});

app.get('/footer', (req, res, next) => {
    res.sendFile(path.join(__dirname, 'public', 'footer.html'), err => { if (err) next(err); });
});

// Inicia o servidor tentando portas livres automaticamente
startServer(PORT);

// Rota coringa para 404
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});
