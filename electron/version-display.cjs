'use strict';

/**
 * Electron Builder requires SemVer package metadata, while Sloom Studio's
 * internal desktop builds use the compact human-facing suffix 0.9.12d.
 */
function formatInternalBuildVersion(version) {
  const value = typeof version === 'string' ? version.trim() : '';
  return value.replace(/-([a-z])$/i, '$1');
}

module.exports = { formatInternalBuildVersion };
