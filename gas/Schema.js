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
  // One row per plant. Removed plants keep their row, marked removed.
  plants: {
    name: 'Plant_Plants',
    headers: [
      'id',
      'name',
      'emoji',
      'amount',
      'summer_days',
      'winter_days',
      'last_watered',
      'last_watered_by',
      'previous_watered',
      'removed',
    ],
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
