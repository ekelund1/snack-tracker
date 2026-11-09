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
  // New columns go last: init appends them to an existing tab.
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
      'notes',
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

// Our houseplants, added by init when their id is missing, and their notes
// filled in when empty. Estimates for a flat in southern Sweden; edit them in
// the app, not here.
const DEFAULT_PLANTS = [
  {
    id: 'svarmorstunga',
    name: 'Svärmorstunga',
    emoji: '🪴',
    amount: 'moderate',
    summer_days: 14,
    winter_days: 30,
    notes:
      'Tål torka men inte väta: låt jorden torka helt mellan vattningarna, hellre en vecka för sent än för tidigt. ' +
      'Inget vatten i bladrosetten. Ljust till halvskugga, inte på elementet. ' +
      'Mjuka eller gula blad vid basen: för mycket vatten. Tunna, skrynkliga blad: för torr.',
  },
  {
    id: 'orkide',
    name: 'Orkidé',
    emoji: '🌸',
    amount: 'soak',
    summer_days: 7,
    winter_days: 10,
    notes:
      'Fjärilsorkidé. Titta på rötterna: silvergrå betyder vattna, gröna betyder vänta. ' +
      'Inget vatten i bladvecket, då ruttnar den. Ljust men ingen stark middagssol, gärna öster- eller västerfönster. ' +
      'Slappa, skrynkliga blad: för torr. Bruna, mjuka rötter: för blöt. ' +
      'Svalare nätter på hösten, ungefär 5 grader, ger nya blomstänglar.',
  },
];

const TIME_ZONE = 'Europe/Stockholm';
