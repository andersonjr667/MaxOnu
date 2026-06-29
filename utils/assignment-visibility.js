const SiteSettings = require('../models/SiteSettings');

async function getSiteSettings() {
  let settings = await SiteSettings.findOne({ singletonKey: 'main' });
  if (!settings) {
    settings = await SiteSettings.create({ singletonKey: 'main' });
  }
  return settings;
}

function canViewAssignments(user) {
  return user?.role === 'admin';
}

async function areCommitteeAssignmentsReleased() {
  const settings = await getSiteSettings();
  return Boolean(settings.publicCommitteeReleased || settings.publicDelegationsReleased);
}

async function areCountryAssignmentsReleased() {
  const settings = await getSiteSettings();
  return Boolean(settings.publicDelegationsReleased);
}

async function areAssignmentsReleased() {
  return areCountryAssignmentsReleased();
}

function stripAssignmentFields(user) {
  if (!user) return user;

  const plainUser = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  plainUser.committee = null;
  plainUser.committeeName = '';
  plainUser.country = '';
  return plainUser;
}

async function sanitizeAssignmentVisibility(payload, viewer) {
  if (canViewAssignments(viewer) || await areCountryAssignmentsReleased()) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(stripAssignmentFields);
  }

  return stripAssignmentFields(payload);
}

module.exports = {
  areAssignmentsReleased,
  areCommitteeAssignmentsReleased,
  areCountryAssignmentsReleased,
  canViewAssignments,
  getSiteSettings,
  sanitizeAssignmentVisibility,
  stripAssignmentFields
};
