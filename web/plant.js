// One plant's watering rules: when it is due, how much it gets, and watering
// or undoing it. No DOM or storage here, so it can be tested in Node.
//
// A plant waters every summer_days in summer and every winter_days in winter.
// Dates are Stockholm calendar dates as 'YYYY-MM-DD'.

export const AMOUNTS = {
  light: 'Lite',
  moderate: 'Måttligt',
  soak: 'Genomvattna',
};

// Starting points for a new plant, for common houseplants in a southern
// Swedish home. A guideline to keep plants alive, not a care manual.
export const PRESETS = [
  { key: 'leafy', label: 'Grön bladväxt (monstera, fikus, pothos)', amount: 'moderate', summer_days: 7, winter_days: 12 },
  { key: 'thirsty', label: 'Törstig (ormbunke, calathea, fredskalla)', amount: 'moderate', summer_days: 4, winter_days: 7 },
  { key: 'hardy', label: 'Tålig (zamioculcas, svärmorstunga)', amount: 'moderate', summer_days: 14, winter_days: 28 },
  { key: 'succulent', label: 'Suckulent eller kaktus', amount: 'soak', summer_days: 14, winter_days: 30 },
  { key: 'orchid', label: 'Orkidé', amount: 'soak', summer_days: 7, winter_days: 10 },
  { key: 'small', label: 'Liten kruka eller örter', amount: 'light', summer_days: 3, winter_days: 6 },
];

// April to September is summer: more light and warmth, so plants drink more.
// October to March is winter: little light and dry radiator air, but slow
// growth, so plants drink less.
export function seasonOf(date) {
  const month = Number(date.slice(5, 7));
  return month >= 4 && month <= 9 ? 'summer' : 'winter';
}

function intervalOn(plant, date) {
  return seasonOf(date) === 'summer' ? plant.summer_days : plant.winter_days;
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
}

// 'due' can be watered now, 'watered' was watered today, 'waiting' is not due
// yet. days_left counts the days until the next watering, by today's season.
export function plantStatus(plant, today) {
  if (!plant.last_watered) return { state: 'due', days_left: 0 };
  const daysLeft = intervalOn(plant, today) - daysBetween(plant.last_watered, today);
  if (plant.last_watered === today) return { state: 'watered', days_left: daysLeft };
  if (daysLeft <= 0) return { state: 'due', days_left: 0 };
  return { state: 'waiting', days_left: daysLeft };
}

export function statusLabel(plant, status) {
  if (status.state === 'due') return AMOUNTS[plant.amount];
  if (status.state === 'watered') return `Vattnad idag av ${plant.last_watered_by}`;
  if (status.days_left === 1) return 'Vattna i morgon';
  return `Vattna om ${status.days_left} dagar`;
}

// Watering a plant already watered today changes nothing, so two phones
// tapping the same plant count as one watering.
export function waterPlant(plant, today, profile) {
  if (plant.last_watered === today) return plant;
  return { ...plant, last_watered: today, last_watered_by: profile, previous_watered: plant.last_watered };
}

// Undoes today's watering by bringing back the one before. Only today's
// watering can be undone.
export function unwaterPlant(plant, today) {
  if (plant.last_watered !== today) return plant;
  return { ...plant, last_watered: plant.previous_watered, last_watered_by: '', previous_watered: '' };
}

const STATE_RANK = { due: 0, waiting: 1, watered: 2 };

// Due plants first, then the ones due soonest, then those watered today.
export function boardOrder(plants, today) {
  const ranked = plants.map((plant) => ({ plant, status: plantStatus(plant, today) }));
  ranked.sort(
    (a, b) =>
      STATE_RANK[a.status.state] - STATE_RANK[b.status.state] ||
      a.status.days_left - b.status.days_left ||
      a.plant.name.localeCompare(b.plant.name, 'sv'),
  );
  return ranked.map((entry) => entry.plant);
}
