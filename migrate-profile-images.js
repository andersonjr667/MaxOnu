/**
 * Migration Script: Set default profile images for users without custom photos
 * 
 * This script updates all users who don't have a profileImageUrl to have the default
 * profile image based on their gender:
 * - feminine: /images/profile_female.png
 * - others: /images/profile_male.png
 * 
 * Usage: node migrate-profile-images.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/maxonu';

const userSchema = new mongoose.Schema({
    username: String,
    fullName: String,
    email: String,
    password: String,
    gender: {
        type: String,
        enum: ['masculino', 'feminino', 'nao-binario', 'outro', 'prefiro-nao-informar'],
        default: 'prefiro-nao-informar'
    },
    profileImageUrl: {
        type: String,
        default: ''
    },
    profileImagePublicId: {
        type: String,
        default: ''
    }
}, { _id: true, timestamps: true });

const User = mongoose.model('User', userSchema);

async function migrateProfileImages() {
    console.log('🔄 Starting profile image migration...\n');

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        // Find users without a custom profile image OR with a wrong default image
        const allUsers = await User.find({});

        console.log(`📋 Found ${allUsers.length} total users\n`);

        let updatedCount = 0;
        let skippedCount = 0;

        for (const user of allUsers) {
            const correctImage = user.gender === 'feminino'
                ? '/images/profile_female.png'
                : '/images/profile_male.png';

            const isCustomPhoto = user.profileImageUrl &&
                user.profileImageUrl !== '/images/profile_male.png' &&
                user.profileImageUrl !== '/images/profile_female.png';

            if (isCustomPhoto) {
                skippedCount++;
                console.log(`   — Skipped @${user.username} (custom photo)`);
                continue;
            }

            if (user.profileImageUrl === correctImage) {
                skippedCount++;
                console.log(`   — Skipped @${user.username} (already correct)`);
                continue;
            }

            await User.updateOne(
                { _id: user._id },
                { $set: { profileImageUrl: correctImage, profileImagePublicId: '' } }
            );

            updatedCount++;
            console.log(`   ✓ Updated @${user.username} (${user.gender || 'sem gênero'}) → ${correctImage}`);
        }

        console.log(`\n✅ Migration complete!`);
        console.log(`   - Users updated: ${updatedCount}`);
        console.log(`   - Users skipped: ${skippedCount}`);

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\n🔌 Disconnected from MongoDB');
        process.exit(0);
    }
}

migrateProfileImages();
