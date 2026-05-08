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
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[ºª]/g, (match) => (match === 'º' ? 'o' : 'a'));
}

function getEducationSegment(classGroup = '') {
    const normalized = normalizeText(classGroup);

    if (
        normalized.includes('8o') ||
        normalized.includes('8 ano') ||
        normalized.includes('8ano') ||
        normalized.includes('9o') ||
        normalized.includes('9 ano') ||
        normalized.includes('9ano') ||
        normalized.includes('8 e 9') ||
        normalized.includes('8/9') ||
        /\b8\s*ano\b/i.test(normalized) ||
        /\b9\s*ano\b/i.test(normalized)
    ) {
        return 'fundamental';
    }

    if (
        normalized.includes('ensino medio') ||
        normalized.includes('medio') ||
        /\bem\b/.test(normalized) ||
        /[123]\s*a?\s*serie/i.test(normalized) ||
        (/[123]\s*serie/i.test(normalized)) ||
        (/\b[123]\s*ano\b/i.test(normalized) && !normalized.includes('8o') && !normalized.includes('9o')) // Frequentemente usado para Ensino Médio
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

// Admin routes
const roleAuth = require('../middleware/roleAuth');

// POST /api/delegation/admin/create - Create delegation directly (admin, press, or coordinator)
router.post('/admin/create', authMiddleware, roleAuth(['admin', 'press', 'coordinator']), [
    body('members').isArray({ min: 2, max: 3 }).withMessage('Delegação deve ter 2 ou 3 integrantes'),
    body('teamSize').isIn([2, 3]).withMessage('Tamanho deve ser 2 ou 3')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
        const { members, teamSize } = req.body;
        const admin = await User.findById(req.user.id);

        if (!admin) {
            return res.status(404).json({ error: 'Admin não encontrado.' });
        }

        // Validate members count matches teamSize
        if (members.length !== teamSize) {
            return res.status(400).json({ error: `Número de integrantes (${members.length}) não corresponde ao tamanho da delegação (${teamSize}).` });
        }

        // Normalize usernames
        const normalizedMembers = members.map(m => m.trim().toLowerCase());

        // Check for duplicates
        if (new Set(normalizedMembers).size !== normalizedMembers.length) {
            return res.status(400).json({ error: 'Os integrantes devem ser diferentes.' });
        }

        // Find all users
        const users = await User.find({ username: { $in: normalizedMembers } });

        if (users.length !== normalizedMembers.length) {
            const foundUsernames = users.map(u => u.username);
            const notFound = normalizedMembers.filter(m => !foundUsernames.includes(m));
            return res.status(404).json({ error: `Usuários não encontrados: ${notFound.join(', ')}` });
        }

        // Validate all are candidates
        const nonCandidates = users.filter(u => u.role !== 'candidate');
        if (nonCandidates.length > 0) {
            return res.status(400).json({ error: `Apenas delegados podem fazer parte de delegações: ${nonCandidates.map(u => u.username).join(', ')}` });
        }

        // Check if any user is already in a delegation
        const alreadyInDelegation = users.filter(u => (u.delegationMembers || []).length > 0);
        if (alreadyInDelegation.length > 0) {
            return res.status(400).json({ error: `Usuários já estão em delegações: ${alreadyInDelegation.map(u => u.username).join(', ')}` });
        }

        // Validate class group compatibility
        if (users.length >= 2) {
            const pairValidation = validateDelegationPairByClassGroup(users[0], users[1]);
            if (!pairValidation.valid) {
                return res.status(400).json({ error: pairValidation.message });
            }
        }

        // Sync registrations - use first user's registration or create new
        const baseRegistration = users[0].registration?.submittedAt ? users[0].registration : {
            firstChoice: users[0].registration?.firstChoice || null,
            secondChoice: users[0].registration?.secondChoice || null,
            thirdChoice: users[0].registration?.thirdChoice || null,
            teamSize,
            submittedAt: new Date()
        };

        // Create delegation links
        for (const user of users) {
            const otherMembers = users.filter(u => !sameId(u._id, user._id));
            user.delegationMembers = otherMembers.map(m => m._id);
            user.registration = {
                ...baseRegistration,
                teamSize
            };
            await user.save();
        }

        // Sync partner labels
        await syncPartnerLabels(users);

        // Send notifications to all members
        const adminName = admin.fullName || admin.username;
        const memberNames = users.map(u => u.fullName || u.username).join(', ');

        for (const user of users) {
            const otherMembers = users.filter(u => !sameId(u._id, user._id));
            const otherNames = otherMembers.map(m => m.fullName || m.username).join(' e ');
            
            await addUserNotification(user._id, {
                type: 'delegation-created-by-admin',
                title: 'Delegação criada',
                message: `${adminName} te colocou na delegação junto com ${otherNames}.`,
                payload: {
                    adminId: String(admin._id),
                    adminName,
                    members: otherMembers.map(m => ({
                        id: String(m._id),
                        username: m.username,
                        fullName: m.fullName
                    }))
                }
            });
        }

        res.json({
            message: `Delegação criada com sucesso com ${teamSize} integrantes.`,
            delegation: {
                teamSize,
                members: users.map(u => ({
                    id: String(u._id),
                    username: u.username,
                    fullName: u.fullName,
                    classGroup: u.classGroup
                }))
            }
        });
    } catch (error) {
        console.error('Admin create delegation error:', error);
        res.status(400).json({ error: error.message });
    }
});

// GET /api/delegation/admin/list - List all delegations (admin, press, or coordinator)
router.get('/admin/list', authMiddleware, roleAuth(['admin', 'press', 'coordinator']), async (req, res) => {
    try {
        // Get all candidates (with or without delegations)
        const users = await User.find({ role: 'candidate' })
            .populate('delegationMembers', 'fullName username classGroup gender profileImageUrl committee country')
            .select('fullName username classGroup delegationMembers registration committee country createdAt gender profileImageUrl')
            .sort({ createdAt: -1 });

        // Build unique delegations
        const delegationMap = new Map();
        const processedUsers = new Set();

        for (const user of users) {
            if (processedUsers.has(String(user._id))) continue;

            const memberIds = [String(user._id), ...getUniqueMemberIds(user)].sort();
            const delegationKey = memberIds.join('-');

            if (!delegationMap.has(delegationKey)) {
                const allMembers = await User.find({ _id: { $in: memberIds } })
                    .select('fullName username classGroup gender profileImageUrl committee country');

                // Get committee from any member that has it
                const committeeValue = allMembers.find(m => m.committee)?.committee || user.committee || null;
                const countryValue = allMembers.find(m => m.country)?.country || user.country || null;

                delegationMap.set(delegationKey, {
                    _id: delegationKey,
                    teamSize: memberIds.length,
                    committee: committeeValue,
                    country: countryValue,
                    members: allMembers.map(m => ({
                        id: String(m._id),
                        username: m.username,
                        fullName: m.fullName,
                        classGroup: m.classGroup,
                        gender: m.gender,
                        profileImageUrl: m.profileImageUrl
                    })),
                    createdAt: user.createdAt,
                    createdBy: {
                        username: 'Sistema',
                        fullName: 'Sistema'
                    }
                });

                memberIds.forEach(id => processedUsers.add(id));
            }
        }

        const delegations = Array.from(delegationMap.values());

        res.json({
            total: delegations.length,
            delegations
        });
    } catch (error) {
        console.error('Admin list delegations error:', error);
        res.status(400).json({ error: error.message });
    }
});

// DELETE /api/delegation/admin/:delegationId - Dissolve delegation (admin, press, or coordinator)
router.delete('/admin/:delegationId', authMiddleware, roleAuth(['admin', 'press', 'coordinator']), async (req, res) => {
    try {
        const { delegationId } = req.params;
        const admin = await User.findById(req.user.id);

        if (!admin) {
            return res.status(404).json({ error: 'Admin não encontrado.' });
        }

        // DelegationId is a composite key of member IDs
        const memberIds = delegationId.split('-');

        if (memberIds.length < 2) {
            return res.status(400).json({ error: 'ID de delegação inválido.' });
        }

        // Find all members
        const users = await User.find({ _id: { $in: memberIds } });

        if (users.length === 0) {
            return res.status(404).json({ error: 'Delegação não encontrada.' });
        }

        // Clear delegation members for all users
        for (const user of users) {
            user.delegationMembers = [];
            await user.save();
        }

        // Sync partner labels
        await syncPartnerLabels(users);

        // Send notifications
        const adminName = admin.fullName || admin.username;
        for (const user of users) {
            await addUserNotification(user._id, {
                type: 'delegation-dissolved-by-admin',
                title: 'Delegação dissolvida',
                message: `${adminName} dissolveu sua delegação.`,
                payload: {
                    adminId: String(admin._id),
                    adminName
                }
            });
        }

        res.json({
            message: 'Delegação dissolvida com sucesso.',
            affectedUsers: users.length
        });
    } catch (error) {
        console.error('Admin delete delegation error:', error);
        res.status(400).json({ error: error.message });
    }
});

// PUT /api/delegation/admin/:delegationId - Update delegation (admin, press, or coordinator)
router.put('/admin/:delegationId', authMiddleware, roleAuth(['admin', 'press', 'coordinator']), [
    body('members').isArray({ min: 2, max: 3 }).withMessage('Delegação deve ter 2 ou 3 integrantes'),
    body('teamSize').isIn([2, 3]).withMessage('Tamanho deve ser 2 ou 3'),
    body('committee').optional().isInt({ min: 1, max: 7 }).withMessage('Comitê inválido')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
    }

    try {
        const { delegationId } = req.params;
        const { members, teamSize, committee } = req.body;
        const admin = await User.findById(req.user.id);

        if (!admin) {
            return res.status(404).json({ error: 'Admin não encontrado.' });
        }

        // Validate members count matches teamSize
        if (members.length !== teamSize) {
            return res.status(400).json({ error: `Número de integrantes (${members.length}) não corresponde ao tamanho da delegação (${teamSize}).` });
        }

        // DelegationId is a composite key of member IDs
        const oldMemberIds = delegationId.split('-');

        if (oldMemberIds.length < 1) {
            return res.status(400).json({ error: 'ID de delegação inválido.' });
        }

        // Allow completing individual delegations (1 member -> 2 or 3)
        // Block editing complete delegations to become individual
        if (oldMemberIds.length > 1 && teamSize < oldMemberIds.length) {
            return res.status(400).json({ error: 'Não é possível reduzir o tamanho de uma delegação existente.' });
        }

        // Normalize new usernames
        const normalizedMembers = members.map(m => m.trim().toLowerCase());

        // Check for duplicates
        if (new Set(normalizedMembers).size !== normalizedMembers.length) {
            return res.status(400).json({ error: 'Os integrantes devem ser diferentes.' });
        }

        // Find new users
        const newUsers = await User.find({ username: { $in: normalizedMembers } });

        if (newUsers.length !== normalizedMembers.length) {
            const foundUsernames = newUsers.map(u => u.username);
            const notFound = normalizedMembers.filter(m => !foundUsernames.includes(m));
            return res.status(404).json({ error: `Usuários não encontrados: ${notFound.join(', ')}` });
        }

        // Validate all are candidates
        const nonCandidates = newUsers.filter(u => u.role !== 'candidate');
        if (nonCandidates.length > 0) {
            return res.status(400).json({ error: `Apenas delegados podem fazer parte de delegações: ${nonCandidates.map(u => u.username).join(', ')}` });
        }

        // Check if any NEW user (not in old delegation) is already in another delegation
        const newUserIds = newUsers.map(u => String(u._id));
        const usersNotInOldDelegation = newUsers.filter(u => !oldMemberIds.includes(String(u._id)));
        const alreadyInDelegation = usersNotInOldDelegation.filter(u => (u.delegationMembers || []).length > 0);
        
        if (alreadyInDelegation.length > 0) {
            return res.status(400).json({ error: `Usuários já estão em outras delegações: ${alreadyInDelegation.map(u => u.username).join(', ')}` });
        }

        // Validate class group compatibility
        if (newUsers.length >= 2) {
            const pairValidation = validateDelegationPairByClassGroup(newUsers[0], newUsers[1]);
            if (!pairValidation.valid) {
                return res.status(400).json({ error: pairValidation.message });
            }
        }

        // Find old users
        const oldUsers = await User.find({ _id: { $in: oldMemberIds } });

        // Clear old delegation for users who are being removed
        const removedUsers = oldUsers.filter(oldUser => !newUserIds.includes(String(oldUser._id)));
        for (const user of removedUsers) {
            user.delegationMembers = [];
            await user.save();
        }

        // Create new delegation links
        for (const user of newUsers) {
            const otherMembers = newUsers.filter(u => !sameId(u._id, user._id));
            user.delegationMembers = otherMembers.map(m => m._id);
            
            if (committee) {
                user.committee = parseInt(committee);
                if (!user.registration) {
                    user.registration = {};
                }
                user.registration.firstChoice = parseInt(committee);
                user.registration.teamSize = teamSize;
                user.registration.submittedAt = user.registration.submittedAt || new Date();
            }
            
            await user.save();
        }

        // Sync partner labels
        await syncPartnerLabels([...removedUsers, ...newUsers]);

        // Send notifications
        const adminName = admin.fullName || admin.username;
        
        // Notify removed users
        for (const user of removedUsers) {
            await addUserNotification(user._id, {
                type: 'delegation-removed-by-admin',
                title: 'Removido da delegação',
                message: `${adminName} removeu você da delegação.`,
                payload: {
                    adminId: String(admin._id),
                    adminName
                }
            });
        }
        
        // Notify all new delegation members
        for (const user of newUsers) {
            const otherMembers = newUsers.filter(u => !sameId(u._id, user._id));
            const otherNames = otherMembers.map(m => m.fullName || m.username).join(' e ');
            
            await addUserNotification(user._id, {
                type: 'delegation-updated-by-admin',
                title: 'Delegação atualizada',
                message: `${adminName} atualizou sua delegação. Você está agora com ${otherNames}.`,
                payload: {
                    adminId: String(admin._id),
                    adminName,
                    members: otherMembers.map(m => ({
                        id: String(m._id),
                        username: m.username,
                        fullName: m.fullName
                    }))
                }
            });
        }

        res.json({
            message: 'Delegação atualizada com sucesso.',
            delegation: {
                teamSize,
                members: newUsers.map(u => ({
                    id: String(u._id),
                    username: u.username,
                    fullName: u.fullName,
                    classGroup: u.classGroup
                }))
            }
        });
    } catch (error) {
        console.error('Admin update delegation error:', error);
        res.status(400).json({ error: error.message });
    }
});

module.exports = router;
