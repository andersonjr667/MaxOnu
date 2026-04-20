const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const registrationSchema = new mongoose.Schema({
    firstChoice: {
        type: Number,
        min: 1,
        max: 7,
        default: null
    },
    secondChoice: {
        type: Number,
        min: 1,
        max: 7,
        default: null
    },
    thirdChoice: {
        type: Number,
        min: 1,
        max: 7,
        default: null
    },
    teamSize: {
        type: Number,
        enum: [2, 3],
        default: 2
    },
    submittedAt: {
        type: Date,
        default: null
    }
}, { _id: false });

const invitationSchema = new mongoose.Schema({
    type: {
        type: String,
        default: 'delegation-invite'
    },
    fromUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    fromUsername: {
        type: String,
        required: true
    },
    teamSize: {
        type: Number,
        enum: [2, 3],
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'rejected'],
        default: 'pending'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    respondedAt: {
        type: Date,
        default: null
    }
});

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        unique: true
    },
    fullName: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: true
    }
});

userSchema.add({
    role: {
        type: String,
        enum: ['candidate', 'teacher', 'coordinator', 'admin', 'press'],
        default: 'candidate'
    },
    committee: {
        type: Number,
        default: null
    },
    country: {
        type: String,
        default: ''
    },
    partner: {
        type: String,
        default: ''
    },
    classGroup: {
        type: String,
        default: ''
    },
    registration: {
        type: registrationSchema,
        default: () => ({})
    },
    delegationMembers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    invitations: {
        type: [invitationSchema],
        default: []
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

userSchema.pre('save', async function(next) {
    if (this.isModified('password')) {
        this.password = await bcrypt.hash(this.password, 8);
    }
    next();
});

userSchema.methods.comparePassword = async function(password) {
    return bcrypt.compare(password, this.password);
};

userSchema.methods.generateToken = function() {
    return jwt.sign(
        { id: this._id, username: this.username, fullName: this.fullName, role: this.role },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '24h' }
    );
};

module.exports = mongoose.model('User', userSchema);
