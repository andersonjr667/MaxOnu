const mongoose = require('mongoose');

const dpoSubmissionSchema = new mongoose.Schema({
    committee: {
        type: Number,
        min: 1,
        max: 7,
        required: true
    },
    delegationKey: {
        type: String,
        required: true
    },
    country: {
        type: String,
        required: true,
        trim: true
    },
    memberIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    submittedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fileUrl: {
        type: String,
        required: true
    },
    fileName: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

dpoSubmissionSchema.index({ committee: 1, delegationKey: 1 }, { unique: true });

dpoSubmissionSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('DpoSubmission', dpoSubmissionSchema);
