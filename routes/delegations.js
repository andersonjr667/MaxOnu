const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { getRegistrationState, isRegistrationOpen, hasCommitteeRevealPassed, COMMITTEE_REVEAL_DATE } = require('../utils/event-config');
const { buildDelegationGroups } = require('../utils/delegation-groups');

const router = express.Router();

function sameId(a, b) {
    return String(a) === String(b);
}

async function getSettings() {
    let settings = await SiteSettings.findOne({ singletonKey: 'main' });
    if (!settings) {
        settings = await SiteSettings.create({ singletonKey: 'main' });
    }
    return settings;
}

function cleanPendingInvitations(user) {
    user.invitations = (user.invitations || []).filter((invitation) => {
        if (invitation.status !== 'pending') {
            return true;
        }

        return mongoose.Types.ObjectId.isValid(String(invitation.fromUser));
    });
}

function getDelegationCount(user) {
    return (user.delegationMembers || []).length + 1;
}

function hasRegistration(user) {
    return Boolean(user?.registration?.submittedAt);
}

function normalizeChoices(user) {
    return [
        user.registration?.firstChoice,
        user.registration?.secondChoice,
        user.registration?.thirdChoice
    ].filter(Boolean);
}

function getPendingNotifications(user) {
    return (user.invitations || []).filter((invitation) => invitation.status === 'pending');
}

function buildDelegationSummary(user) {
    return {
        classGroup: user.classGroup || '',
        registration: {
            firstChoice: user.registration?.firstChoice ?? null,
            secondChoice: user.registration?.secondChoice ?? null,
            thirdChoice: user.registration?.thirdChoice ?? null,
            teamSize: user.registration?.teamSize || 2,
            submittedAt: user.registration?.submittedAt || null
        },
        delegation: {
            memberIds: (user.delegationMembers || []).map((member) => String(member._id || member)),
            members: (user.delegationMembers || []).map((member) => ({
                id: String(member._id || member),
                username: member.username || '',
                classGroup: member.classGroup || ''
            })),
            currentSize: getDelegationCount(user),
            remainingSlots: Math.max((user.registration?.teamSize || 2) - getDelegationCount(user), 0)
        },
        notifications: (user.invitations || []).map((invitation) => ({
            id: String(invitation._id),
            type: invitation.type,
            fromUser: String(invitation.fromUser?._id || invitation.fromUser),
            fromUsername: invitation.fromUsername,
            teamSize: invitation.teamSize,
            status: invitation.status,
            createdAt: invitation.createdAt,
            respondedAt: invitation.respondedAt
        })),
        revealDate: COMMITTEE_REVEAL_DATE.toISOString()
    };
}

async function loadCurrentUser(userId) {
    return User.findById(userId)
        .populate('delegationMembers', 'username classGroup')
        .populate('invitations.fromUser', 'username classGroup registration delegationMembers');
}

async function syncPartnerLabels(users) {
    await Promise.all(users.map(async (user) => {
        const memberNames = await User.find({ _id: { $in: user.delegationMembers || [] } }).select('username');
        user.partner = memberNames.map((member) => member.username).join(', ');
        await user.save();
    }));
}

router.get('/status', authMiddleware, async (req, res) => {
    try {
        const user = await loadCurrentUser(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario nao encontrado.' });
        }

        cleanPendingInvitations(user);
        const settings = await getSettings();
        const registrationState = await getRegistrationState();
        res.json({
            ...buildDelegationSummary(user),
            registrationOpen: registrationState.registrationOpen,
            registrationManuallyClosed: registrationState.registrationManuallyClosed,
            revealPassed: registrationState.revealPassed,
            publicDelegationsReleased: settings.publicDelegationsReleased
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/public-status', async (req, res) => {
    try {
        const settings = await getSettings();
        res.json({
            registrationOpen: await isRegistrationOpen(),
            publicDelegationsReleased: settings.publicDelegationsReleased,
            revealDate: COMMITTEE_REVEAL_DATE.toISOString()
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.get('/public/committee/:committee', async (req, res) => {
    try {
        const committee = Number(req.params.committee);
        if (!Number.isInteger(committee) || committee < 1 || committee > 7) {
            return res.status(400).json({ error: 'Comitê inválido.' });
        }

        const settings = await getSettings();
        if (!hasCommitteeRevealPassed() || !settings.publicDelegationsReleased) {
            return res.json({
                released: false,
                committee,
                delegations: [],
                revealDate: COMMITTEE_REVEAL_DATE.toISOString()
            });
        }

        const users = await User.find({ role: 'candidate', committee })
            .populate('delegationMembers', 'fullName username classGroup committee country registration');
        const delegations = buildDelegationGroups(users)
            .filter((group) => group.country)
            .map((group) => ({
                key: group.key,
                committee: group.committee,
                country: group.country,
                teamSize: group.teamSize,
                members: group.members.map((member) => ({
                    fullName: member.fullName,
                    classGroup: member.classGroup
                }))
            }));

        res.json({
            released: true,
            committee,
            delegations,
            revealDate: COMMITTEE_REVEAL_DATE.toISOString()
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/register', authMiddleware, [
    body('firstChoice').isInt({ min: 1, max: 7 }),
    body('secondChoice').isInt({ min: 1, max: 7 }),
    body('thirdChoice').isInt({ min: 1, max: 7 }),
    body('teamSize').isIn([2, 3])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array() });
    }

    if (!(await isRegistrationOpen())) {
        return res.status(403).json({
            error: 'As inscricoes ainda nao foram liberadas.',
            revealDate: COMMITTEE_REVEAL_DATE.toISOString()
        });
    }

    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario nao encontrado.' });
        }

        if (user.role !== 'candidate') {
            return res.status(403).json({ error: 'A inscricao publica esta disponivel apenas para delegados.' });
        }

        const { firstChoice, secondChoice, thirdChoice, teamSize } = req.body;
        const choices = [Number(firstChoice), Number(secondChoice), Number(thirdChoice)];
        if (new Set(choices).size !== 3) {
            return res.status(400).json({ error: 'Escolha tres comites diferentes para a inscricao.' });
        }

        user.registration = {
            firstChoice: choices[0],
            secondChoice: choices[1],
            thirdChoice: choices[2],
            teamSize: Number(teamSize),
            submittedAt: new Date()
        };
        await user.save();

        const refreshed = await loadCurrentUser(user._id);
        const registrationState = await getRegistrationState();
        res.json({
            message: 'Inscricao enviada com sucesso.',
            ...buildDelegationSummary(refreshed),
            registrationOpen: registrationState.registrationOpen,
            registrationManuallyClosed: registrationState.registrationManuallyClosed,
            revealPassed: registrationState.revealPassed
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/invite', authMiddleware, [
    body('username').trim().notEmpty().withMessage('Informe o usuario que recebera o convite.')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array() });
    }

    try {
        const inviter = await User.findById(req.user.id);
        if (!inviter) {
            return res.status(404).json({ error: 'Usuario nao encontrado.' });
        }

        if (!hasRegistration(inviter)) {
            return res.status(400).json({ error: 'Envie sua inscricao antes de convidar outros integrantes para a delegacao.' });
        }

        if (getDelegationCount(inviter) >= (inviter.registration?.teamSize || 2)) {
            return res.status(400).json({ error: 'Sua delegacao ja esta completa.' });
        }

        const targetUsername = req.body.username.trim();
        const invited = await User.findOne({ username: targetUsername });

        if (!invited) {
            return res.status(404).json({ error: 'Participante nao encontrado.' });
        }

        if (sameId(invited._id, inviter._id)) {
            return res.status(400).json({ error: 'Voce nao pode convidar a si mesmo.' });
        }

        if (!hasRegistration(invited)) {
            return res.status(400).json({ error: 'Esse participante ainda nao concluiu a inscricao.' });
        }

        if ((invited.delegationMembers || []).length > 0) {
            return res.status(400).json({ error: 'Esse participante ja faz parte de uma delegacao.' });
        }

        const inviterChoices = normalizeChoices(inviter);
        const invitedChoices = normalizeChoices(invited);
        const samePreferences = inviterChoices.join(',') === invitedChoices.join(',');

        if (!samePreferences) {
            return res.status(400).json({ error: 'Os dois participantes precisam ter a mesma ordem de comites para formar a delegacao.' });
        }

        const alreadyPending = getPendingNotifications(invited).some((invitation) => sameId(invitation.fromUser, inviter._id));
        if (alreadyPending) {
            return res.status(400).json({ error: 'Ja existe um convite pendente enviado para este participante.' });
        }

        invited.invitations.push({
            fromUser: inviter._id,
            fromUsername: inviter.username,
            teamSize: inviter.registration?.teamSize || 2
        });

        await invited.save();
        res.json({ message: `Convite enviado para ${invited.username}.` });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

router.post('/notifications/:id/respond', authMiddleware, [
    body('action').isIn(['accept', 'reject'])
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array() });
    }

    try {
        const recipient = await User.findById(req.user.id);
        if (!recipient) {
            return res.status(404).json({ error: 'Usuario nao encontrado.' });
        }

        const invitation = recipient.invitations.id(req.params.id);
        if (!invitation || invitation.status !== 'pending') {
            return res.status(404).json({ error: 'Convite pendente nao encontrado.' });
        }

        if (req.body.action === 'reject') {
            invitation.status = 'rejected';
            invitation.respondedAt = new Date();
            await recipient.save();

            const refreshedRejected = await loadCurrentUser(recipient._id);
            return res.json({
                message: 'Convite recusado.',
                ...buildDelegationSummary(refreshedRejected)
            });
        }

        if (!hasRegistration(recipient)) {
            return res.status(400).json({ error: 'Conclua sua inscricao antes de aceitar um convite.' });
        }

        if ((recipient.delegationMembers || []).length > 0) {
            return res.status(400).json({ error: 'Voce ja esta vinculado a outra delegacao.' });
        }

        const inviter = await User.findById(invitation.fromUser);
        if (!inviter) {
            invitation.status = 'rejected';
            invitation.respondedAt = new Date();
            await recipient.save();
            return res.status(410).json({ error: 'O usuario que enviou o convite nao esta mais disponivel.' });
        }

        if (!hasRegistration(inviter)) {
            return res.status(400).json({ error: 'O convite nao pode mais ser aceito porque a inscricao do remetente nao esta valida.' });
        }

        if (getDelegationCount(inviter) >= (inviter.registration?.teamSize || 2)) {
            return res.status(400).json({ error: 'A delegacao do remetente ja foi completada.' });
        }

        const recipientChoices = normalizeChoices(recipient);
        const inviterChoices = normalizeChoices(inviter);
        if (recipientChoices.join(',') !== inviterChoices.join(',')) {
            return res.status(400).json({ error: 'As preferencias de comite nao coincidem mais.' });
        }

        invitation.status = 'accepted';
        invitation.respondedAt = new Date();
        recipient.invitations.forEach((currentInvitation) => {
            if (String(currentInvitation._id) !== String(invitation._id) && currentInvitation.status === 'pending') {
                currentInvitation.status = 'rejected';
                currentInvitation.respondedAt = new Date();
            }
        });

        if (!(inviter.delegationMembers || []).some((memberId) => sameId(memberId, recipient._id))) {
            inviter.delegationMembers.push(recipient._id);
        }

        if (!(recipient.delegationMembers || []).some((memberId) => sameId(memberId, inviter._id))) {
            recipient.delegationMembers.push(inviter._id);
        }

        const inviterMembers = await User.find({ _id: { $in: inviter.delegationMembers } });
        for (const member of inviterMembers) {
            if (!sameId(member._id, recipient._id) && !(recipient.delegationMembers || []).some((memberId) => sameId(memberId, member._id))) {
                recipient.delegationMembers.push(member._id);
            }

            if (!sameId(member._id, inviter._id) && !(member.delegationMembers || []).some((memberId) => sameId(memberId, recipient._id))) {
                member.delegationMembers.push(recipient._id);
                await member.save();
            }
        }

        await inviter.save();
        await recipient.save();

        const everyone = await User.find({
            _id: {
                $in: [inviter._id, recipient._id, ...inviter.delegationMembers]
            }
        });
        await syncPartnerLabels(everyone);

        const refreshedRecipient = await loadCurrentUser(recipient._id);
        res.json({
            message: 'Convite aceito com sucesso.',
            ...buildDelegationSummary(refreshedRecipient)
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
