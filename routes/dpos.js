const express = require('express');
const multer = require('multer');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const DpoSubmission = require('../models/DpoSubmission');
const SiteSettings = require('../models/SiteSettings');
const { hasCommitteeRevealPassed } = require('../utils/event-config');
const { buildDelegationKeyFromUser } = require('../utils/delegation-groups');
const { hasCloudinaryConfig, uploadBuffer } = require('../utils/cloudinary');

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 8 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = new Set([
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp'
        ]);

        if (allowedMimeTypes.has(file.mimetype)) {
            return cb(null, true);
        }

        cb(new Error('Envie um PDF, JPG, PNG ou WEBP.'));
    }
});

function uploadDpo(req, res, next) {
    upload.single('file')(req, res, (error) => {
        if (error) {
            return res.status(400).json({ error: error.message });
        }
        next();
    });
}

async function getSettings() {
    let settings = await SiteSettings.findOne({ singletonKey: 'main' });
    if (!settings) {
        settings = await SiteSettings.create({ singletonKey: 'main' });
    }
    return settings;
}

router.get('/committee/:committee', async (req, res) => {
    try {
        const committee = Number(req.params.committee);
        if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
            return res.status(400).json({ error: 'Comitê inválido.' });
        }

        const settings = await getSettings();
        if (!hasCommitteeRevealPassed() || !settings.publicDelegationsReleased) {
            return res.json({ released: false, submissions: [] });
        }

        const submissions = await DpoSubmission.find({ committee }).sort({ updatedAt: -1 });
        res.json({
            released: true,
            submissions: submissions.map((item) => ({
                id: String(item._id),
                committee: item.committee,
                country: item.country,
                fileUrl: item.fileUrl,
                fileName: item.fileName,
                mimeType: item.mimeType,
                updatedAt: item.updatedAt
            }))
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/committee/:committee', authMiddleware, uploadDpo, async (req, res) => {
    try {
        const committee = Number(req.params.committee);
        if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
            return res.status(400).json({ error: 'Comitê inválido.' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'Envie um arquivo para registrar o DPO.' });
        }

        if (!hasCloudinaryConfig) {
            return res.status(500).json({ error: 'Upload de arquivo indisponível: Cloudinary não configurado.' });
        }

        if (!hasCommitteeRevealPassed()) {
            return res.status(403).json({ error: 'Os DPOs serão recebidos após a liberação oficial dos comitês.' });
        }

        const settings = await getSettings();
        if (!settings.publicDelegationsReleased) {
            return res.status(403).json({ error: 'A submissão de DPOs será liberada após a divulgação pública das delegações e países.' });
        }

        if (!settings.dpoSubmissionsReleased) {
            return res.status(403).json({ error: 'O envio de DPOs ainda não foi liberado pelo professor orientador ou pela administração.' });
        }

        const user = await User.findById(req.user.id).populate('delegationMembers', '_id');
        if (!user || user.role !== 'candidate') {
            return res.status(403).json({ error: 'Somente delegados podem enviar DPOs.' });
        }

        if (user.committee !== committee) {
            return res.status(403).json({ error: 'Seu acesso de DPO está vinculado ao comitê atribuído à sua delegação.' });
        }

        if (!user.country) {
            return res.status(400).json({ error: 'Seu país ainda não foi atribuído à delegação.' });
        }

        const delegationKey = buildDelegationKeyFromUser(user);
        const memberIds = [String(user._id), ...(user.delegationMembers || []).map((member) => String(member._id || member))];

        const uploadedFile = await uploadBuffer(req.file.buffer, {
            folder: 'maxonu/dpos',
            public_id: `committee-${committee}-dpo-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
            resource_type: 'auto'
        });

        const submission = await DpoSubmission.findOneAndUpdate(
            { committee, delegationKey },
            {
                committee,
                delegationKey,
                memberIds,
                country: user.country,
                submittedBy: user._id,
                fileUrl: uploadedFile?.secure_url || uploadedFile?.url || '',
                fileName: req.file.originalname,
                mimeType: req.file.mimetype,
                updatedAt: new Date()
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        res.status(201).json({
            message: 'DPO enviado com sucesso.',
            submission: {
                id: String(submission._id),
                committee: submission.committee,
                country: submission.country,
                fileUrl: submission.fileUrl,
                fileName: submission.fileName,
                mimeType: submission.mimeType,
                updatedAt: submission.updatedAt
            }
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
