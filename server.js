require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection with retry logic
const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
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

// Modified routes with fallback
app.post('/api/register', async (req, res) => {
    try {
        const { username, email, password } = req.body;
        if (!username || !email || !password) {
            return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
        }
        if (mongoose.connection.readyState !== 1) {
            // If MongoDB is not connected, use in-memory storage
            if (inMemoryUsers.find(u => u.username === username)) {
                return res.status(400).json({ error: 'Usuário já existe' });
            }
            inMemoryUsers.push({ username, email, password });
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
        if (mongoose.connection.readyState !== 1) {
            // If MongoDB is not connected, use in-memory storage
            const user = inMemoryUsers.find(u => u.username === username && u.password === password);
            if (!user) {
                return res.status(401).json({ error: 'Credenciais inválidas' });
            }
            return res.json({ token: 'dummy-token', isAdmin: username === 'Anderson' });
        }
        const user = await User.findOne({ username });
        if (!user || !(await user.comparePassword(password))) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        const token = user.generateToken();
        res.json({ token, isAdmin: username === 'Anderson' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Modified questions routes with fallback
app.post('/api/questions', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            const question = { ...req.body, id: Date.now(), answered: false };
            inMemoryQuestions.push(question);
            return res.status(201).json(question);
        }
        const question = new Question(req.body);
        await question.save();
        res.status(201).json(question);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/questions', async (req, res) => {
    try {
        if (mongoose.connection.readyState !== 1) {
            return res.json(inMemoryQuestions.filter(q => q.answered));
        }
        const questions = await Question.find({ answered: true });
        res.json(questions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/questions/pending', async (req, res) => {
    try {
        const questions = await Question.find({ answered: false });
        res.json(questions);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/questions/:id/answer', async (req, res) => {
    try {
        const { id } = req.params;
        const { answer } = req.body;
        const question = await Question.findByIdAndUpdate(
            id,
            { answer, answered: true },
            { new: true }
        );
        res.json(question);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.put('/api/questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { question, answer } = req.body;
        const updatedQuestion = await Question.findByIdAndUpdate(
            id,
            { question, answer },
            { new: true }
        );
        res.json(updatedQuestion);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/questions/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await Question.findByIdAndDelete(id);
        res.json({ message: 'Pergunta excluída com sucesso' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// Check if user is admin
app.get('/api/check-admin', (req, res) => {
    const token = req.headers.authorization.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        res.json({ isAdmin: decoded.username === 'Anderson' });
    } catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
});

// Serve static files
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log('Note: Running with in-memory fallback if MongoDB is unavailable');
});
