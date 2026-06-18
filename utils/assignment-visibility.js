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

async function areAssignmentsReleased() {
  const settings = await getSiteSettings();
  return Boolean(settings.publicDelegationsReleased);
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
  if (canViewAssignments(viewer) || await areAssignmentsReleased()) {
    return payload;
  }

  if (Array.isArray(payload)) {
    return payload.map(stripAssignmentFields);
  }

  return stripAssignmentFields(payload);
}

module.exports = {
  areAssignmentsReleased,
  canViewAssignments,
  getSiteSettings,
  sanitizeAssignmentVisibility,
  stripAssignmentFields
};
