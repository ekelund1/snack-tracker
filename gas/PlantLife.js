// Plant-Life: a shared watering board for the houseplants. Routed from
// SnackTracker.js, which checks the token and holds the lock for writes.
//
// GET  ?action=plants&token=…       today's date and every plant on the board
// POST {action:'plant', …}          adds a plant, or edits its details
// POST {action:'remove_plant', id}  takes a plant off the board
// POST {action:'water', id, profile} records today's watering
// POST {action:'unwater', id}        undoes today's watering
//
// When a plant is due is worked out by the frontend (web/plant.js), which
// knows each plant's last watering and intervals.

const AMOUNTS = ['light', 'moderate', 'soak'];
const MAX_INTERVAL_DAYS = 90;
const MAX_NOTES_LENGTH = 500;

function readPlants_(ss, settings, now) {
  const plants = readRecords_(sheet_(ss, SHEETS.plants), SHEETS.plants)
    .filter((record) => record.removed !== true)
    .map(plantFromRecord_);
  return { today: stockholmDate_(now), plants };
}

// Text cells can come back as numbers (a name like '12'), so they are read as strings.
function plantFromRecord_(record) {
  return {
    id: String(record.id),
    name: String(record.name),
    emoji: String(record.emoji),
    amount: record.amount,
    summer_days: Number(record.summer_days),
    winter_days: Number(record.winter_days),
    last_watered: String(record.last_watered),
    last_watered_by: String(record.last_watered_by),
    previous_watered: String(record.previous_watered),
    // Rows from before the notes column have none.
    notes: String(record.notes ?? ''),
  };
}

// The client makes the id, so sending the same new plant twice adds it once.
// Editing a plant keeps its watering history, and its notes when the edit
// leaves them out.
function savePlant_(body, deps) {
  if (!isValidPlant_(body)) return { ok: false, error: 'invalid_plant' };

  const sheet = sheet_(deps.ss, SHEETS.plants);
  const saved = findRecord_(sheet, body.id);
  const details = {
    id: body.id,
    name: body.name.trim(),
    emoji: body.emoji,
    amount: body.amount,
    summer_days: body.summer_days,
    winter_days: body.winter_days,
  };
  if (body.notes !== undefined) details.notes = body.notes.trim();
  const record = Object.assign(
    { last_watered: '', last_watered_by: '', previous_watered: '', removed: false, notes: '' },
    saved,
    details,
  );
  writeRecord_(sheet, SHEETS.plants, saved, record);
  return { ok: true };
}

function isValidPlant_(body) {
  const isText = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.length <= max;
  const isInterval = (value) => Number.isInteger(value) && value >= 1 && value <= MAX_INTERVAL_DAYS;
  return (
    isText(body.id, 1, 64) &&
    isText(body.name, 1, 40) &&
    isText(body.emoji, 0, 16) &&
    // A leading '=' would make the sheet run the text as a formula.
    !/^=/.test(body.name) &&
    !/^=/.test(body.emoji) &&
    (body.notes === undefined || (isText(body.notes, 0, MAX_NOTES_LENGTH) && !/^=/.test(body.notes))) &&
    AMOUNTS.includes(body.amount) &&
    isInterval(body.summer_days) &&
    isInterval(body.winter_days)
  );
}

function removePlant_(body, deps) {
  const sheet = sheet_(deps.ss, SHEETS.plants);
  const saved = findPlant_(sheet, body.id);
  if (!saved) return { ok: false, error: 'unknown_plant' };
  writeRecord_(sheet, SHEETS.plants, saved, Object.assign({}, saved, { removed: true }));
  return { ok: true };
}

// A plant already watered today stays as it is, so both phones tapping the
// same plant count as one watering, by whoever was first.
function waterPlant_(body, deps, settings) {
  if (!settings.profiles.includes(body.profile)) return { ok: false, error: 'invalid_profile' };
  const sheet = sheet_(deps.ss, SHEETS.plants);
  const saved = findPlant_(sheet, body.id);
  if (!saved) return { ok: false, error: 'unknown_plant' };

  const today = stockholmDate_(deps.now);
  if (saved.last_watered === today) return { ok: true };
  writeRecord_(
    sheet,
    SHEETS.plants,
    saved,
    Object.assign({}, saved, { last_watered: today, last_watered_by: body.profile, previous_watered: saved.last_watered }),
  );
  return { ok: true };
}

// Only today's watering can be undone; it brings back the one before.
function unwaterPlant_(body, deps) {
  const sheet = sheet_(deps.ss, SHEETS.plants);
  const saved = findPlant_(sheet, body.id);
  if (!saved) return { ok: false, error: 'unknown_plant' };

  if (saved.last_watered !== stockholmDate_(deps.now)) return { ok: true };
  writeRecord_(
    sheet,
    SHEETS.plants,
    saved,
    Object.assign({}, saved, { last_watered: saved.previous_watered, last_watered_by: '', previous_watered: '' }),
  );
  return { ok: true };
}

// The plant's row, removed or not.
function findRecord_(sheet, id) {
  return readRecords_(sheet, SHEETS.plants).find((record) => String(record.id) === id);
}

// The plant's row if it is still on the board.
function findPlant_(sheet, id) {
  const record = findRecord_(sheet, id);
  return record && record.removed !== true ? record : undefined;
}
