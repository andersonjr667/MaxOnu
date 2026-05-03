const express = require('express');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/auth');
const User = require('../models/User');
const SiteSettings = require('../models/SiteSettings');
const { getRegistrationState, isRegistrationOpen, hasCommitteeRevealPassed, COMMITTEE_REVEAL_DATE } = require('../utils/event-config');
const { buildDelegationGroups } = require('../utils/delegation-groups');
const { addUserNotification } = require('../utils/notification-center');

const router = express.Router();

function sameId(a, b) {
    return String(a) === String(b);
}

function normalizeText(value = '') {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function getEducationSegment(classGroup = '') {
    const normalized = normalizeText(classGroup);

    if (
        normalized.includes('8o') ||
        normalized.includes('8 ano') ||
        normalized.includes('9o') ||
        normalized.includes('9 ano') ||
        normalized.includes('8 e 9') ||
        normalized.includes('8/9')
    ) {
        return 'fundamental';
    }

    if (
        normalized.includes('ensino medio') ||
        normalized.includes('medio') ||
        /\bem\b/.test(normalized) ||
        /\b[123]\s*serie\b/.test(normalized)
    ) {
        return 'em';
    }

    return '';
}

function getExpectedTeamSize() {
    return 2;
}

function validateDelegationPairByClassGroup(userA, userB) {
    const segmentA = getEducationSegment(userA?.classGroup);
    const segmentB = getEducationSegment(userB?.classGroup);

    if (!segmentA || !segmentB) {
        return {
            valid: false,
            message: 'Nao foi possivel identificar a turma de um dos participantes para validar a formacao da delegacao.'
        };
    }

    if (segmentA !== segmentB) {
        return {
            valid: false,
            message: 'Nao e permitido misturar participantes do 8/9 com Ensino Medio na mesma delegacao.'
        };
    }

    return { valid: true };
}

function getUniqueMemberIds(user) {
    const seen = new Set();
    (user.delegationMembers || []).forEach((member) => {
        const id = String(member?._id || member);
        if (id) {
            seen.add(id);
        }
    });
    return Array.from(seen);
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

        const fromUserId = invitation.fromUser?._id || invitation.fromUser;
        return mongoose.Types.ObjectId.isValid(String(fromUserId));
    });
}

function getDelegationCount(user) {
    return getUniqueMemberIds(user).length + 1;
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

function buildDelegationSummary(user, options = {}) {
    const { revealPassed = true } = options;
    const uniqueMembers = [];
    const seenMembers = new Set();
    (user.delegationMembers || []).forEach((member) => {
        const id = String(member?._id || member);
        if (!id || seenMembers.has(id)) {
            return;
        }

        seenMembers.add(id);
        uniqueMembers.push(member);
    });

    return {
        classGroup: user.classGroup || '',
        registration: {
            firstChoice: revealPassed ? (user.registration?.firstChoice ?? null) : null,
            secondChoice: revealPassed ? (user.registration?.secondChoice ?? null) : null,
            thirdChoice: revealPassed ? (user.registration?.thirdChoice ?? null) : null,
            teamSize: getExpectedTeamSize(),
            submittedAt: user.registration?.submittedAt || null
        },
        delegation: {
            memberIds: uniqueMembers.map((member) => String(member._id || member)),
            members: uniqueMembers.map((member) => ({
                id: String(member._id || member),
                fullName: member.fullName || '',
                username: member.username || '',
                classGroup: member.classGroup || ''
            })),
            currentSize: getDelegationCount(user),
            remainingSlots: Math.max(getExpectedTeamSize() - getDelegationCount(user), 0)
        },
notifications: (user.invitations || []).map((invitation) => ({
            id: String(invitation._id),
            type: invitation.type,
            fromUser: String(invitation.fromUser?._id || invitation.fromUser),
            fromUsername: invitation.fromUsername,
            fromFullName: invitation.fromUser?.fullName || '',
            fromClassGroup: invitation.fromUser?.classGroup || '',
            fromProfileImageUrl: invitation.fromProfileImageUrl || invitation.fromUser?.profileImageUrl || '',
            fromGender: invitation.fromGender || invitation.fromUser?.gender || 'prefiro-nao-informar',
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
        .populate('delegationMembers', 'fullName username classGroup gender')
        .populate('invitations.fromUser', 'username fullName classGroup registration delegationMembers');
}

async function syncPartnerLabels(users) {
    await Promise.all(users.map(async (user) => {
        const userId = user._id || user;
        const delegationMembers = user.delegationMembers || [];
        const memberNames = await User.find({ _id: { $in: delegationMembers } }).select('username');
        const partnerValue = memberNames.map((member) => member.username).join(', ');
        await User.updateOne(
            { _id: userId },
            { $set: { partner: partnerValue } }
        );
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
            ...buildDelegationSummary(user, { revealPassed: registrationState.revealPassed }),
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
            dpoSubmissionsReleased: settings.dpoSubmissionsReleased,
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
    body('teamSize').optional().isIn([2])
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

        const { firstChoice, secondChoice, thirdChoice } = req.body;
        const choices = [Number(firstChoice), Number(secondChoice), Number(thirdChoice)];
        if (new Set(choices).size !== 3) {
            return res.status(400).json({ error: 'Escolha tres comites diferentes para a inscricao.' });
        }

        user.registration = {
            firstChoice: choices[0],
            secondChoice: choices[1],
            thirdChoice: choices[2],
            teamSize: getExpectedTeamSize(),
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

        if (inviter.role !== 'candidate') {
            return res.status(403).json({ error: 'A formacao de delegacao esta disponivel apenas para delegados.' });
        }

        if (!hasRegistration(inviter)) {
            return res.status(400).json({ error: 'Envie sua inscricao antes de convidar outros integrantes para a delegacao.' });
        }

        if (getDelegationCount(inviter) >= getExpectedTeamSize()) {
            return res.status(400).json({ error: 'Sua delegacao ja esta completa.' });
        }

        const targetUsername = req.body.username.trim().toLowerCase();
        const invited = await User.findOne({ username: targetUsername });

        if (!invited) {
            return res.status(404).json({ error: 'Participante nao encontrado.' });
        }

        if (invited.role !== 'candidate') {
            return res.status(400).json({ error: 'Somente delegados podem participar de uma delegacao.' });
        }

        if (sameId(invited._id, inviter._id)) {
            return res.status(400).json({ error: 'Voce nao pode convidar a si mesmo.' });
        }

        if ((invited.delegationMembers || []).length > 0) {
            return res.status(400).json({ error: 'Esse participante ja faz parte de uma delegacao.' });
        }

        const pairValidation = validateDelegationPairByClassGroup(inviter, invited);
        if (!pairValidation.valid) {
            return res.status(400).json({ error: pairValidation.message });
        }

        const inviterChoices = normalizeChoices(inviter);
        const invitedChoices = normalizeChoices(invited);
        const invitedHasRegistration = hasRegistration(invited);
        const samePreferences = inviterChoices.join(',') === invitedChoices.join(',');

        if (invitedHasRegistration && !samePreferences) {
            return res.status(400).json({ error: 'Os dois participantes precisam ter a mesma ordem de comites para formar a delegacao.' });
        }

        const alreadyPending = getPendingNotifications(invited).some((invitation) => sameId(invitation.fromUser, inviter._id));
        if (alreadyPending) {
            return res.status(400).json({ error: 'Ja existe um convite pendente enviado para este participante.' });
        }

invited.invitations.push({
            fromUser: inviter._id,
            fromUsername: inviter.username,
            fromProfileImageUrl: inviter.profileImageUrl || '',
            fromGender: inviter.gender || 'prefiro-nao-informar',
            teamSize: getExpectedTeamSize()
        });

        await invited.save();
        await addUserNotification(invited._id, {
            type: 'delegation-invite-received',
            title: 'Novo convite de delegação',
            message: `${inviter.fullName || inviter.username} enviou um convite para sua delegação.`,
            payload: {
                fromUserId: String(inviter._id),
                fromUsername: inviter.username
            }
        });
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

        if (recipient.role !== 'candidate') {
            return res.status(403).json({ error: 'A formacao de delegacao esta disponivel apenas para delegados.' });
        }

        const invitation = recipient.invitations.id(req.params.id);
        if (!invitation || invitation.status !== 'pending') {
            return res.status(404).json({ error: 'Convite pendente nao encontrado.' });
        }

        if (req.body.action === 'reject') {
            invitation.status = 'rejected';
            invitation.respondedAt = new Date();
            await recipient.save();

            await addUserNotification(invitation.fromUser, {
                type: 'delegation-invite-rejected',
                title: 'Convite recusado',
                message: `${recipient.fullName || recipient.username} recusou seu convite de delegação.`,
                payload: {
                    responderId: String(recipient._id),
                    responderUsername: recipient.username
                }
            });

            const refreshedRejected = await loadCurrentUser(recipient._id);
            return res.json({
                message: 'Convite recusado.',
                ...buildDelegationSummary(refreshedRejected)
            });
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

        if (getDelegationCount(inviter) >= getExpectedTeamSize()) {
            return res.status(400).json({ error: 'A delegacao do remetente ja foi completada.' });
        }

        const pairValidation = validateDelegationPairByClassGroup(inviter, recipient);
        if (!pairValidation.valid) {
            return res.status(400).json({ error: pairValidation.message });
        }

        const inviterChoices = normalizeChoices(inviter);
        const recipientHasRegistration = hasRegistration(recipient);
        const recipientChoices = normalizeChoices(recipient);
        if (recipientHasRegistration && recipientChoices.join(',') !== inviterChoices.join(',')) {
            return res.status(400).json({ error: 'As preferencias de comite nao coincidem mais.' });
        }

        if (!recipientHasRegistration) {
            recipient.registration = {
                firstChoice: inviter.registration?.firstChoice || null,
                secondChoice: inviter.registration?.secondChoice || null,
                thirdChoice: inviter.registration?.thirdChoice || null,
                teamSize: getExpectedTeamSize(),
                submittedAt: inviter.registration?.submittedAt || new Date()
            };
        } else {
            recipient.registration.teamSize = getExpectedTeamSize();
        }

        inviter.registration.teamSize = getExpectedTeamSize();

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

            if (
                !sameId(member._id, inviter._id) &&
                !sameId(member._id, recipient._id) &&
                !(member.delegationMembers || []).some((memberId) => sameId(memberId, recipient._id))
            ) {
                member.delegationMembers.push(recipient._id);
                await member.save();
            }
        }

        await inviter.save();
        await recipient.save();

        await addUserNotification(inviter._id, {
            type: 'delegation-invite-accepted',
            title: 'Convite aceito',
            message: `${recipient.fullName || recipient.username} aceitou seu convite de delegação.`,
            payload: {
                responderId: String(recipient._id),
                responderUsername: recipient.username
            }
        });

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

router.post('/leave', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'Usuario nao encontrado.' });
        }

        if (user.role !== 'candidate') {
            return res.status(403).json({ error: 'A formacao de delegacao esta disponivel apenas para delegados.' });
        }

        const memberIds = getUniqueMemberIds(user);
        if (!memberIds.length) {
            return res.status(400).json({ error: 'Voce nao faz parte de nenhuma delegacao no momento.' });
        }

        await Promise.all(memberIds.map((memberId) => (
            User.updateOne(
                { _id: memberId },
                { $pull: { delegationMembers: user._id } }
            )
        )));

        await User.updateOne(
            { _id: user._id },
            { $set: { delegationMembers: [] } }
        );

        const affectedUsers = await User.find({
            _id: { $in: [user._id, ...memberIds] }
        });
        await syncPartnerLabels(affectedUsers);

        const refreshed = await loadCurrentUser(user._id);
        res.json({
            message: 'Voce saiu da delegacao com sucesso.',
            ...buildDelegationSummary(refreshed)
        });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
