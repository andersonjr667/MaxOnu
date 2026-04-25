const SiteSettings = require('../models/SiteSettings');

const DEFAULT_COUNTDOWN_DATE = '2026-05-04T00:00:00-03:00';
const configuredRevealDate = new Date(process.env.COUNTDOWN_DATE || DEFAULT_COUNTDOWN_DATE);
const COMMITTEE_REVEAL_DATE = Number.isNaN(configuredRevealDate.getTime())
    ? new Date(DEFAULT_COUNTDOWN_DATE)
    : configuredRevealDate;

async function getSiteSettings() {
    let settings = await SiteSettings.findOne({ singletonKey: 'main' });
    if (!settings) {
        settings = await SiteSettings.create({ singletonKey: 'main' });
    }
    return settings;
}

function hasCommitteeRevealPassed() {
    return Date.now() >= COMMITTEE_REVEAL_DATE.getTime();
}

async function getRegistrationState() {
    const settings = await getSiteSettings();
    const revealPassed = hasCommitteeRevealPassed();

    return {
        revealPassed,
        registrationManuallyClosed: Boolean(settings.registrationManuallyClosed),
        registrationOpen: revealPassed && !settings.registrationManuallyClosed
    };
}

async function isRegistrationOpen() {
    const { registrationOpen } = await getRegistrationState();
    return registrationOpen;
}

module.exports = {
    COMMITTEE_REVEAL_DATE,
    hasCommitteeRevealPassed,
    getRegistrationState,
    isRegistrationOpen
};
