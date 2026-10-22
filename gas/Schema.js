// Sheet layout shared by init and the API.
const SHEETS = {
  daily: {
    name: 'Snack_Daily',
    headers: ['date', 'profile', 'no_sweets', 'activity', 'workout', 'updated_at'],
  },
  weeks: {
    name: 'Snack_Weeks',
    headers: ['week_start', 'profile', 'points', 'target_hit', 'payout', 'transferred'],
  },
  settings: {
    name: 'Snack_Settings',
    headers: ['key', 'value'],
  },
};

// Written by init when missing; existing values are never overwritten.
const DEFAULT_SETTINGS = [
  ['profiles', 'J,R'],
  ['weekly_target', 15],
  ['payout_per_person', 100],
  ['currency', 'kr'],
];

const TIME_ZONE = 'Europe/Stockholm';
