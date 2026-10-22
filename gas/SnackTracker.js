// JSON API over the spreadsheet. Every request carries the shared token.
//
// GET  ?action=state&token=…   this week's days, points, past weeks, account total
// POST {action:'day', …}        upserts one profile's full day state
// POST {action:'transferred', …} marks a week's payout as transferred
//
// Writes arrive as text/plain (the frontend can't send JSON without a CORS
// preflight, which Apps Script doesn't answer), so the body is parsed here.

const GOALS = ['no_sweets', 'activity', 'workout'];

function doGet(e) {
  return respond_(() => handleGet_(e.parameter || {}, defaultDeps_()));
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'bad_json' });
  }
  return respond_(() => handlePost_(body, defaultDeps_()));
}

// Entry point for the Monday-morning trigger that init installs.
function finalizeWeeks() {
  finalizeEndedWeeks_(defaultDeps_());
}

function defaultDeps_() {
  return { ss: SpreadsheetApp.getActive(), lock: LockService.getScriptLock(), now: new Date() };
}

// Turns any unexpected error into a JSON reply instead of Apps Script's HTML error page.
function respond_(handle) {
  try {
    return json_(handle());
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error', message: String(err.message || err) });
  }
}

function json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function handleGet_(params, deps) {
  const settings = readSettings_(deps.ss);
  if (!isAuthorized_(params.token, settings)) return { ok: false, error: 'unauthorized' };
  if (params.action !== 'state') return { ok: false, error: 'unknown_action' };
  return Object.assign({ ok: true }, readState_(deps.ss, settings, deps.now));
}

function handlePost_(body, deps) {
  const settings = readSettings_(deps.ss);
  if (!isAuthorized_(body.token, settings)) return { ok: false, error: 'unauthorized' };

  const actions = { day: saveDay_, transferred: markTransferred_ };
  const action = actions[body.action || 'day'];
  if (!action) return { ok: false, error: 'unknown_action' };

  // One write at a time, so simultaneous taps from both phones can't
  // overwrite each other's rows.
  if (!deps.lock.tryLock(10000)) return { ok: false, error: 'busy' };
  try {
    return action(body, deps, settings);
  } finally {
    deps.lock.releaseLock();
  }
}

function isAuthorized_(token, settings) {
  return settings.token !== '' && token === settings.token;
}

// Saves the full state of one profile's day. Retries, duplicates and writes
// arriving out of order are safe: a write only lands if its
// client_updated_at is newer than the saved one.
function saveDay_(body, deps, settings) {
  if (!isValidDay_(body, settings)) return { ok: false, error: 'invalid_day' };
  if (body.date > stockholmDate_(deps.now)) return { ok: false, error: 'future_date' };
  if (isWeekFinalized_(deps.ss, mondayOf_(body.date))) return { ok: false, error: 'week_locked' };

  const sheet = sheet_(deps.ss, SHEETS.daily);
  const saved = readRecords_(sheet, SHEETS.daily).find(
    (record) => record.date === body.date && record.profile === body.profile,
  );
  if (saved && Number(saved.updated_at) >= body.client_updated_at) return { ok: true, saved: false };

  const record = {
    date: body.date,
    profile: body.profile,
    no_sweets: body.no_sweets,
    activity: body.activity,
    workout: body.workout,
    updated_at: body.client_updated_at,
  };
  writeRecord_(sheet, SHEETS.daily, saved, record);
  return { ok: true, saved: true };
}

function isValidDay_(body, settings) {
  return (
    settings.profiles.includes(body.profile) &&
    isDate_(body.date) &&
    GOALS.every((goal) => typeof body[goal] === 'boolean') &&
    Number.isFinite(body.client_updated_at)
  );
}

// Marks or unmarks a week as transferred for every profile. Works on the
// current week too, since money is transferred on Sunday before the week is
// finalized; finalizing keeps the mark.
function markTransferred_(body, deps, settings) {
  const weekStart = body.week_start;
  if (!isDate_(weekStart) || mondayOf_(weekStart) !== weekStart) return { ok: false, error: 'invalid_week' };
  if (weekStart > mondayOf_(stockholmDate_(deps.now))) return { ok: false, error: 'invalid_week' };
  if (typeof body.transferred !== 'boolean') return { ok: false, error: 'invalid_week' };

  const sheet = sheet_(deps.ss, SHEETS.weeks);
  const records = readRecords_(sheet, SHEETS.weeks);
  settings.profiles.forEach((profile) => {
    const saved = records.find((record) => record.week_start === weekStart && record.profile === profile);
    const record = saved
      ? Object.assign({}, saved, { transferred: body.transferred })
      : { week_start: weekStart, profile, points: '', target_hit: '', payout: '', transferred: body.transferred };
    writeRecord_(sheet, SHEETS.weeks, saved, record);
  });
  return { ok: true };
}

function readState_(ss, settings, now) {
  const today = stockholmDate_(now);
  const weekStart = mondayOf_(today);
  const days = readRecords_(sheet_(ss, SHEETS.daily), SHEETS.daily)
    .filter((record) => mondayOf_(record.date) === weekStart)
    .map((record) => ({
      profile: record.profile,
      date: record.date,
      no_sweets: record.no_sweets === true,
      activity: record.activity === true,
      workout: record.workout === true,
      client_updated_at: Number(record.updated_at),
    }));

  const weekRecords = readRecords_(sheet_(ss, SHEETS.weeks), SHEETS.weeks);
  const weeks = weekRecords
    .filter(isFinalized_)
    .map((record) => ({
      week_start: record.week_start,
      profile: record.profile,
      points: Number(record.points),
      target_hit: record.target_hit === true,
      payout: Number(record.payout),
      transferred: record.transferred === true,
    }))
    .sort((a, b) => b.week_start.localeCompare(a.week_start) || a.profile.localeCompare(b.profile));

  const weekPoints = {};
  let currentPayout = 0;
  settings.profiles.forEach((profile) => {
    const summary = summarizeWeek_(days, profile, weekStart, settings);
    weekPoints[profile] = summary.points;
    currentPayout += summary.payout;
  });

  const currentTransferred = weekRecords.some((record) => record.week_start === weekStart && record.transferred === true);
  // The snack account holds what has been transferred, including this week
  // once it's marked.
  const accountTotal =
    weeks.filter((week) => week.transferred).reduce((sum, week) => sum + week.payout, 0) +
    (currentTransferred ? currentPayout : 0);

  return {
    today,
    week_start: weekStart,
    settings: {
      profiles: settings.profiles,
      weekly_target: settings.weekly_target,
      payout_per_person: settings.payout_per_person,
      currency: settings.currency,
    },
    days,
    week_points: weekPoints,
    current_transferred: currentTransferred,
    weeks,
    account_total: accountTotal,
  };
}

// Saves points, target and payout for every week that has ended and isn't
// finalized yet, from the first logged week on. Weeks without taps get zero
// points. Runs early Monday so Sunday's late taps count.
function finalizeEndedWeeks_(deps) {
  if (!deps.lock.tryLock(30000)) throw new Error('Could not get the lock to finalize weeks');
  try {
    const settings = readSettings_(deps.ss);
    const days = readRecords_(sheet_(deps.ss, SHEETS.daily), SHEETS.daily);
    if (days.length === 0) return;

    const sheet = sheet_(deps.ss, SHEETS.weeks);
    const records = readRecords_(sheet, SHEETS.weeks);
    const currentWeek = mondayOf_(stockholmDate_(deps.now));
    const firstWeek = days.map((day) => mondayOf_(day.date)).sort()[0];

    for (let week = firstWeek; week < currentWeek; week = addDays_(week, 7)) {
      settings.profiles.forEach((profile) => {
        const saved = records.find((record) => record.week_start === week && record.profile === profile);
        if (saved && isFinalized_(saved)) return;

        const summary = summarizeWeek_(days, profile, week, settings);
        const record = {
          week_start: week,
          profile,
          points: summary.points,
          target_hit: summary.target_hit,
          payout: summary.payout,
          transferred: saved ? saved.transferred === true : false,
        };
        writeRecord_(sheet, SHEETS.weeks, saved, record);
      });
    }
  } finally {
    deps.lock.releaseLock();
  }
}

function summarizeWeek_(days, profile, weekStart, settings) {
  const points = days
    .filter((day) => day.profile === profile && mondayOf_(day.date) === weekStart)
    .reduce((sum, day) => sum + GOALS.filter((goal) => day[goal] === true).length, 0);
  const targetHit = points >= settings.weekly_target;
  return { points, target_hit: targetHit, payout: targetHit ? settings.payout_per_person : 0 };
}

// A week row is finalized once the trigger has filled in its points; a row
// with only a transferred mark is not.
function isFinalized_(record) {
  return record.points !== '' && record.points !== null;
}

function isWeekFinalized_(ss, weekStart) {
  return readRecords_(sheet_(ss, SHEETS.weeks), SHEETS.weeks).some(
    (record) => record.week_start === weekStart && isFinalized_(record),
  );
}

function readSettings_(ss) {
  const values = {};
  readRecords_(sheet_(ss, SHEETS.settings), SHEETS.settings).forEach((record) => {
    values[record.key] = record.value;
  });
  return {
    profiles: String(values.profiles || '')
      .split(',')
      .map((profile) => profile.trim())
      .filter(Boolean),
    weekly_target: Number(values.weekly_target),
    payout_per_person: Number(values.payout_per_person),
    currency: String(values.currency || ''),
    token: String(values.token || ''),
  };
}

// Sheet access

function sheet_(ss, spec) {
  const sheet = ss.getSheetByName(spec.name);
  if (!sheet) throw new Error('Missing tab ' + spec.name + '. Run init first.');
  return sheet;
}

// Reads a tab as objects keyed by header, each with its sheet row number.
// Dates typed into a cell by hand come back as Date objects; they are turned
// into 'YYYY-MM-DD' like the rest.
function readRecords_(sheet, spec) {
  return sheet
    .getDataRange()
    .getValues()
    .slice(1)
    .map((values, index) => {
      const record = { row: index + 2 };
      spec.headers.forEach((header, column) => {
        const value = values[column];
        record[header] = value instanceof Date ? stockholmDate_(value) : value;
      });
      return record;
    });
}

// Overwrites the saved record's row, or appends a new row when there is none.
function writeRecord_(sheet, spec, saved, record) {
  const values = spec.headers.map((header) => record[header]);
  if (saved) sheet.getRange(saved.row, 1, 1, values.length).setValues([values]);
  else sheet.appendRow(values);
}

// Dates

function stockholmDate_(date) {
  return Utilities.formatDate(date, TIME_ZONE, 'yyyy-MM-dd');
}

function isDate_(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value + 'T00:00:00Z'));
}

// Monday of the week containing a 'YYYY-MM-DD' date. Calendar arithmetic in
// UTC, so no time zone or DST change can shift it.
function mondayOf_(date) {
  const day = new Date(date + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function addDays_(date, count) {
  const day = new Date(date + 'T00:00:00Z');
  day.setUTCDate(day.getUTCDate() + count);
  return day.toISOString().slice(0, 10);
}
