function sameId(a, b) {
    return String(a) === String(b);
}

function getDelegationMemberIds(user) {
    const ownId = String(user._id || user.id);
    const memberIds = (user.delegationMembers || []).map((member) => String(member._id || member));
    return Array.from(new Set([ownId, ...memberIds])).sort();
}

function buildDelegationKeyFromUser(user) {
    return getDelegationMemberIds(user).join(':');
}

function buildDelegationGroups(users) {
    const groups = new Map();

    for (const user of users) {
        const memberIds = getDelegationMemberIds(user);
        const key = memberIds.join(':');

        if (groups.has(key)) {
            continue;
        }

        const relatedUsers = users
            .filter((candidate) => memberIds.includes(String(candidate._id || candidate.id)))
            .sort((a, b) => String(a.fullName || a.username).localeCompare(String(b.fullName || b.username), 'pt-BR'));

        groups.set(key, {
            key,
            committee: user.committee ?? null,
            country: user.country || '',
            memberIds,
            teamSize: user.registration?.teamSize || relatedUsers.length || 1,
            members: relatedUsers.map((member) => ({
                id: String(member._id || member.id),
                username: member.username || '',
                fullName: member.fullName || member.username || 'Participante',
                email: member.email || '',
                classGroup: member.classGroup || '',
                committee: member.committee ?? null,
                country: member.country || ''
            }))
        });
    }

    return Array.from(groups.values()).sort((a, b) => a.members[0].fullName.localeCompare(b.members[0].fullName, 'pt-BR'));
}

module.exports = {
    sameId,
    buildDelegationKeyFromUser,
    buildDelegationGroups
};
