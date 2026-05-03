const express = require('express');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Question = require('../models/Question');
const { addUserNotification } = require('../utils/notification-center');

const router = express.Router();
const MANAGER_ROLES = new Set(['admin', 'teacher', 'coordinator', 'press']);

function ensureQuestionManager(req, res, next) {
  if (!req.user || !MANAGER_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: 'Access denied' });
  }

  next();
}

// GET /api/questions - Public answered questions
router.get('/', async (req, res) => {
  try {
    const questions = await Question.find({ answered: true }).sort({ createdAt: -1 })
      .populate('askerId', 'profileImageUrl username fullName classGroup committee')
      .populate('answererId', 'profileImageUrl username fullName role');
    res.json(questions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/questions/pending
router.get('/pending', authMiddleware, ensureQuestionManager, async (req, res) => {
  try {
    const questions = await Question.find({ answered: false }).sort({ createdAt: -1 })
      .populate('askerId', 'profileImageUrl username fullName classGroup committee');
    res.json(questions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/questions
router.post('/', authMiddleware, [
  body('question').trim().notEmpty().withMessage('Question cannot be empty')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const questionData = {
      question: req.body.question.trim(),
      askerId: null
    };
    // If user is authenticated, associate their ID
    if (req.user && req.user.id) {
      questionData.askerId = req.user.id;
    }
    const question = new Question(questionData);
    await question.save();
    res.status(201).json(question);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/questions/:id/answer
router.put('/:id/answer', authMiddleware, ensureQuestionManager, [
  body('answer').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

try {
    const question = await Question.findByIdAndUpdate(
      req.params.id,
      { answer: req.body.answer, answered: true, answererId: req.user.id },
      { new: true }
    );
    if (!question) return res.status(404).json({ error: 'Question not found' });

    if (question.askerId) {
      await addUserNotification(question.askerId, {
        type: 'question-answered',
        title: 'Sua pergunta foi respondida',
        message: 'Uma pergunta enviada por você recebeu resposta.',
        payload: {
          questionId: String(question._id)
        }
      });
    }
    res.json(question);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/questions/:id
router.put('/:id', authMiddleware, ensureQuestionManager, async (req, res) => {
  try {
    const previous = await Question.findById(req.params.id).select('answered askerId');
    if (!previous) return res.status(404).json({ error: 'Question not found' });

    const updates = {};
    if (req.body.question) updates.question = req.body.question.trim();
    if (req.body.answer !== undefined) updates.answer = req.body.answer;
    updates.answered = !!updates.answer;

    const question = await Question.findByIdAndUpdate(req.params.id, updates, { new: true });

    if (!previous.answered && question.answered && previous.askerId) {
      await addUserNotification(previous.askerId, {
        type: 'question-answered',
        title: 'Sua pergunta foi respondida',
        message: 'Uma pergunta enviada por você recebeu resposta.',
        payload: {
          questionId: String(question._id)
        }
      });
    }

    res.json(question);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE /api/questions/:id
router.delete('/:id', authMiddleware, ensureQuestionManager, async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

module.exports = router;

