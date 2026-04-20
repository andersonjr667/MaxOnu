const COMMITTEE_REVEAL_DATE = new Date('2026-05-04T00:00:00-03:00');

function isRegistrationOpen() {
    return Date.now() >= COMMITTEE_REVEAL_DATE.getTime();
}

module.exports = {
    COMMITTEE_REVEAL_DATE,
    isRegistrationOpen
};
