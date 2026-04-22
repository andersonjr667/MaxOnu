const mongoose = require('mongoose');

const siteSettingsSchema = new mongoose.Schema({
    singletonKey: {
        type: String,
        unique: true,
        default: 'main'
    },
    publicDelegationsReleased: {
        type: Boolean,
        default: false
    },
    registrationManuallyClosed: {
        type: Boolean,
        default: false
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

siteSettingsSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('SiteSettings', siteSettingsSchema);
