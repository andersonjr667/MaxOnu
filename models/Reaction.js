const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
    targetType: { type: String, enum: ['post', 'question'], required: true },
    targetId:   { type: mongoose.Schema.Types.ObjectId, required: true },
    userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    emoji:      { type: String, required: true }
}, { timestamps: true });

reactionSchema.index({ targetType: 1, targetId: 1 });
reactionSchema.index({ targetType: 1, targetId: 1, userId: 1, emoji: 1 }, { unique: true });

module.exports = mongoose.model('Reaction', reactionSchema);
