const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    answer: {
        type: String,
        default: 'Sem Resposta ainda!'
    },
    answered: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Question', questionSchema);
