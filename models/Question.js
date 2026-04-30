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
    askerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    answererId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Question', questionSchema);
