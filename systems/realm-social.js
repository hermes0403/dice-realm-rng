/** Composition facade for the global announcement and realm poll systems. */
import { createGlobalAnnouncements } from './global-announcements.js?v=20261118-shark-weather-announcement';
import { createRealmPolls } from './realm-polls.js';

export function createRealmSocialSystem(dependencies) {
  const announcements = createGlobalAnnouncements(dependencies);
  const polls = createRealmPolls(dependencies);
  return { ...announcements, ...polls };
}