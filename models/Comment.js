const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    postId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Post',
        required: true,
        index: true
    },
    parentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Comment',
        default: null
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    authorName: {
        type: String,
        required: true
    },
    authorRole: {
        type: String,
        default: 'candidate'
    },
    authorProfileImageUrl: {
        type: String,
        default: ''
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 1000
    },
    status: {
        type: String,
        enum: ['active', 'removed', 'flagged'],
        default: 'active'
    },
    reports: {
        type: Number,
        default: 0
    },
    reportedBy: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    isTestData: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Comment', commentSchema);
