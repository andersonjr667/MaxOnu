const mongoose = require('mongoose');

const newsletterSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    name: {
        type: String,
        default: '',
        trim: true
    },
    active: {
        type: Boolean,
        default: true
    },
    confirmedAt: {
        type: Date,
        default: null
    },
    unsubscribedAt: {
        type: Date,
        default: null
    },
    source: {
        type: String,
        enum: ['website', 'admin', 'registration'],
        default: 'website'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Newsletter', newsletterSchema);
