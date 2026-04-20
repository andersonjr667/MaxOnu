const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    excerpt: {
        type: String,
        default: '',
        trim: true
    },
    content: {
        type: String,
        required: true,
        trim: true
    },
    authorName: {
        type: String,
        required: true,
        trim: true
    },
    authorRole: {
        type: String,
        enum: ['admin', 'teacher', 'coordinator', 'press'],
        required: true
    },
    imageUrl: {
        type: String,
        default: ''
    },
    published: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Post', postSchema);
