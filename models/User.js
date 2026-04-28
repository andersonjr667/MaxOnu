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
        unique: true,
        trim: true,
        lowercase: true
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
    },
    gender: {
        type: String,
        enum: ['masculino', 'feminino', 'nao-binario', 'outro', 'prefiro-nao-informar'],
        default: 'prefiro-nao-informar'
    },
    termsAccepted: {
        type: Boolean,
        default: false
    },
    termsAcceptedAt: {
        type: Date,
        default: null
    }
});

userSchema.add({
    accountStatus: {
        type: String,
        enum: ['active', 'banned', 'expelled'],
        default: 'active'
    },
    accountStatusReason: {
        type: String,
        default: ''
    },
    accountStatusUpdatedAt: {
        type: Date,
        default: null
    },
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
    },
    // Forgot Password
    resetPasswordToken: {
        type: String,
        default: null
    },
    resetPasswordCode: {
        type: String,
        default: null
    },
    resetPasswordExpires: {
        type: Date,
        default: null
    },
    // Two-Factor Authentication
    twoFactorEnabled: {
        type: Boolean,
        default: false
    },
    twoFactorMethod: {
        type: String,
        enum: ['totp', 'email', null],
        default: null
    },
    twoFactorSecret: {
        type: String,
        default: null
    },
    twoFactorBackupCodes: [{
        code: String,
        used: {
            type: Boolean,
            default: false
        }
    }],
    twoFactorVerified: {
        type: Boolean,
        default: false
    },
    twoFactorEmailCode: {
        type: String,
        default: null
    },
    twoFactorEmailCodeExpires: {
        type: Date,
        default: null
    },
    // Mark seeds with a field to identify test data
    isTestData: {
        type: Boolean,
        default: false
    },
    profileImageUrl: {
        type: String,
        default: ''
    },
    profileImagePublicId: {
        type: String,
        default: ''
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

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
    const token = jwt.sign(
        { id: this._id, email: this.email },
        process.env.JWT_SECRET || 'your-secret-key',
        { expiresIn: '1h' }
    );
    
    this.resetPasswordToken = token;
    this.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    
    return token;
};

userSchema.methods.generatePasswordResetCode = function() {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    this.resetPasswordCode = code;
    this.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    return code;
};

// Verify password reset token
userSchema.methods.verifyPasswordResetToken = function(token) {
    if (!this.resetPasswordToken || !this.resetPasswordExpires) {
        return false;
    }
    
    if (Date.now() > this.resetPasswordExpires.getTime()) {
        return false;
    }
    
    try {
        jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
        return this.resetPasswordToken === token;
    } catch (error) {
        return false;
    }
};

userSchema.methods.verifyPasswordResetCode = function(code) {
    if (!this.resetPasswordCode || !this.resetPasswordExpires) {
        return false;
    }

    if (Date.now() > this.resetPasswordExpires.getTime()) {
        return false;
    }

    return String(this.resetPasswordCode) === String(code || '').trim();
};

// Clear password reset token
userSchema.methods.clearPasswordResetToken = function() {
    this.resetPasswordToken = null;
    this.resetPasswordCode = null;
    this.resetPasswordExpires = null;
};

module.exports = mongoose.model('User', userSchema);
