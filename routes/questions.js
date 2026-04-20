const express = require('express');
const { body, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/auth');
const Question = require('../models/Question');

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
    const questions = await Question.find({ answered: true }).sort({ createdAt: -1 });
    res.json(questions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// GET /api/questions/pending
router.get('/pending', authMiddleware, ensureQuestionManager, async (req, res) => {
  try {
    const questions = await Question.find({ answered: false }).sort({ createdAt: -1 });
    res.json(questions);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST /api/questions
router.post('/', [
  body('question').trim().notEmpty().withMessage('Question cannot be empty')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array() });
  }

  try {
    const question = new Question({ question: req.body.question.trim() });
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
      { answer: req.body.answer, answered: true },
      { new: true }
    );
    if (!question) return res.status(404).json({ error: 'Question not found' });
    res.json(question);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT /api/questions/:id
router.put('/:id', authMiddleware, ensureQuestionManager, async (req, res) => {
  try {
    const updates = {};
    if (req.body.question) updates.question = req.body.question.trim();
    if (req.body.answer !== undefined) updates.answer = req.body.answer;
    updates.answered = !!updates.answer;

    const question = await Question.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!question) return res.status(404).json({ error: 'Question not found' });
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

