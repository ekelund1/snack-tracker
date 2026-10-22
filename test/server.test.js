import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN, fakeLock, fakeSpreadsheet, loadGas } from './gas-fakes.js';

// Tuesday 20 Oct 2026, 10:00 in Stockholm. The week started Monday 19 Oct.
const TUESDAY = new Date('2026-10-20T08:00:00Z');
// Monday 19 Oct 2026, 03:00 in Stockholm, when the weekly trigger runs.
const MONDAY_MORNING = new Date('2026-10-19T01:00:00Z');

// Objects from the VM have another realm's prototypes; compare them as JSON,
// which is also what goes over the wire.
const plain = (value) => JSON.parse(JSON.stringify(value));

function newApi() {
  const gas = loadGas();
  const ss = fakeSpreadsheet(gas);
  return {
    gas,
    ss,
    post: (body, { now = TUESDAY, lock = fakeLock() } = {}) => plain(gas.handlePost_(body, { ss, lock, now })),
    get: (params, { now = TUESDAY } = {}) => plain(gas.handleGet_(params, { ss, lock: fakeLock(), now })),
    finalize: (now) => gas.finalizeEndedWeeks_({ ss, lock: fakeLock(), now }),
  };
}

function dayWrite(overrides = {}) {
  return {
    token: TOKEN,
    action: 'day',
    profile: 'J',
    date: '2026-10-20',
    no_sweets: false,
    activity: false,
    workout: false,
    client_updated_at: 1000,
    ...overrides,
  };
}

const PERFECT = { no_sweets: true, activity: true, workout: true };

function stateRequest(overrides = {}) {
  return { action: 'state', token: TOKEN, ...overrides };
}

// J logs five perfect days (15 points) and R one day with two goals in the
// week of 12–18 Oct.
function seedLastWeek(api) {
  ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16'].forEach((date) => {
    api.post(dayWrite({ date, ...PERFECT }), { now: MONDAY_MORNING });
  });
  api.post(dayWrite({ profile: 'R', date: '2026-10-18', no_sweets: true, activity: true }), { now: MONDAY_MORNING });
}

// Token

test('given no token, when reading state, then the request is rejected', () => {
  const api = newApi();

  assert.deepEqual(api.get({ action: 'state' }), { ok: false, error: 'unauthorized' });
});

test('given a wrong token, when writing a day, then it is rejected and nothing is saved', () => {
  const api = newApi();

  const result = api.post(dayWrite({ token: 'guess' }));

  assert.deepEqual(result, { ok: false, error: 'unauthorized' });
  assert.equal(api.ss.daily().length, 0);
});

// Writing days

test('given a new day, when it is written, then one row is saved and read back as state', () => {
  const api = newApi();

  const result = api.post(dayWrite({ workout: true, client_updated_at: 5000 }));

  assert.deepEqual(result, { ok: true, saved: true });
  assert.deepEqual(api.ss.daily(), [['2026-10-20', 'J', false, false, true, 5000]]);
  assert.deepEqual(api.get(stateRequest()).days, [
    { profile: 'J', date: '2026-10-20', no_sweets: false, activity: false, workout: true, client_updated_at: 5000 },
  ]);
});

test('given a saved day, when a newer write arrives, then the row is replaced', () => {
  const api = newApi();
  api.post(dayWrite({ workout: true, client_updated_at: 1000 }));

  api.post(dayWrite({ workout: true, no_sweets: true, client_updated_at: 2000 }));

  assert.deepEqual(api.ss.daily(), [['2026-10-20', 'J', true, false, true, 2000]]);
});

test('given a saved day, when an older write arrives late, then the sheet keeps the newer state', () => {
  const api = newApi();
  api.post(dayWrite({ activity: true, client_updated_at: 2000 }));

  const result = api.post(dayWrite({ activity: false, client_updated_at: 1000 }));

  assert.deepEqual(result, { ok: true, saved: false });
  assert.deepEqual(api.ss.daily(), [['2026-10-20', 'J', false, true, false, 2000]]);
});

test('given a saved day, when the same write is sent again, then there is still one unchanged row', () => {
  const api = newApi();
  const write = dayWrite({ no_sweets: true, client_updated_at: 3000 });
  api.post(write);

  api.post(write);

  assert.deepEqual(api.ss.daily(), [['2026-10-20', 'J', true, false, false, 3000]]);
});

test('given both profiles, when they write the same date, then each gets its own row', () => {
  const api = newApi();

  api.post(dayWrite({ profile: 'J', activity: true }));
  api.post(dayWrite({ profile: 'R', workout: true }));

  assert.deepEqual(api.ss.daily(), [
    ['2026-10-20', 'J', false, true, false, 1000],
    ['2026-10-20', 'R', false, false, true, 1000],
  ]);
});

test('given a write that is not a valid day, when it is sent, then it is rejected and nothing is saved', () => {
  const api = newApi();

  assert.equal(api.post(dayWrite({ profile: 'X' })).error, 'invalid_day');
  assert.equal(api.post(dayWrite({ date: '20/10/2026' })).error, 'invalid_day');
  assert.equal(api.post(dayWrite({ workout: 'yes' })).error, 'invalid_day');
  assert.equal(api.post(dayWrite({ client_updated_at: undefined })).error, 'invalid_day');
  assert.equal(api.ss.daily().length, 0);
});

test('given a date after today in Stockholm, when it is written, then it is rejected', () => {
  const api = newApi();

  assert.deepEqual(api.post(dayWrite({ date: '2026-10-21' })), { ok: false, error: 'future_date' });
  assert.equal(api.ss.daily().length, 0);
});

test('given another write holding the lock, when a day is written, then it is rejected as busy and nothing is saved', () => {
  const api = newApi();

  const result = api.post(dayWrite(), { lock: fakeLock({ available: false }) });

  assert.deepEqual(result, { ok: false, error: 'busy' });
  assert.equal(api.ss.daily().length, 0);
});

// Reading state

test('given days in last and this week, when reading state, then it returns this week with points per profile', () => {
  const api = newApi();
  api.post(dayWrite({ date: '2026-10-18', ...PERFECT }));
  api.post(dayWrite({ date: '2026-10-19', ...PERFECT }));
  api.post(dayWrite({ date: '2026-10-20', no_sweets: true }));

  const state = api.get(stateRequest());

  assert.equal(state.ok, true);
  assert.equal(state.today, '2026-10-20');
  assert.equal(state.week_start, '2026-10-19');
  assert.deepEqual(state.days.map((day) => day.date), ['2026-10-19', '2026-10-20']);
  assert.deepEqual(state.week_points, { J: 4, R: 0 });
  assert.deepEqual(state.settings, { profiles: ['J', 'R'], weekly_target: 15, payout_per_person: 100, currency: 'kr' });
});

test('given a tap on Sunday, when reading state at 23:55 and then just after midnight, then the week rolls over at midnight', () => {
  const api = newApi();
  const sunday2355 = new Date('2026-10-25T22:55:00Z');
  const monday0005 = new Date('2026-10-25T23:05:00Z');
  api.post(dayWrite({ date: '2026-10-25', workout: true }), { now: sunday2355 });

  const beforeMidnight = api.get(stateRequest(), { now: sunday2355 });
  const afterMidnight = api.get(stateRequest(), { now: monday0005 });

  assert.equal(beforeMidnight.week_start, '2026-10-19');
  assert.deepEqual(beforeMidnight.week_points, { J: 1, R: 0 });
  assert.equal(afterMidnight.week_start, '2026-10-26');
  assert.deepEqual(afterMidnight.days, []);
});

test('given an unknown action, when reading, then it is rejected', () => {
  const api = newApi();

  assert.deepEqual(api.get(stateRequest({ action: 'everything' })), { ok: false, error: 'unknown_action' });
});

// Finalizing weeks

test('given last week’s days, when the Monday trigger runs, then each profile’s points, target and payout are saved', () => {
  const api = newApi();
  seedLastWeek(api);

  api.finalize(MONDAY_MORNING);

  assert.deepEqual(api.ss.weeks(), [
    ['2026-10-12', 'J', 15, true, 100, false],
    ['2026-10-12', 'R', 2, false, 0, false],
  ]);
});

test('given a finalized week, when the trigger runs again, then nothing changes', () => {
  const api = newApi();
  seedLastWeek(api);
  api.finalize(MONDAY_MORNING);

  api.finalize(TUESDAY);

  assert.equal(api.ss.weeks().length, 2);
});

test('given days only in this week, when the trigger runs, then this week is not finalized', () => {
  const api = newApi();
  api.post(dayWrite({ date: '2026-10-19', ...PERFECT }));

  api.finalize(TUESDAY);

  assert.deepEqual(api.ss.weeks(), []);
});

test('given a gap week with no taps, when the trigger runs, then the gap week is finalized with zero points', () => {
  const api = newApi();
  api.post(dayWrite({ date: '2026-10-05', workout: true }));
  api.post(dayWrite({ date: '2026-10-19', workout: true }));

  api.finalize(TUESDAY);

  assert.deepEqual(
    api.ss.weeks().map(([weekStart, profile, points]) => [weekStart, profile, points]),
    [
      ['2026-10-05', 'J', 1],
      ['2026-10-05', 'R', 0],
      ['2026-10-12', 'J', 0],
      ['2026-10-12', 'R', 0],
    ],
  );
});

test('given last week is not finalized yet, when a late Sunday write arrives on Monday, then it is saved', () => {
  const api = newApi();
  const monday0030 = new Date('2026-10-18T22:30:00Z');

  const result = api.post(dayWrite({ date: '2026-10-18', workout: true }), { now: monday0030 });

  assert.deepEqual(result, { ok: true, saved: true });
});

test('given last week is finalized, when a write for it arrives, then it is rejected as locked', () => {
  const api = newApi();
  seedLastWeek(api);
  api.finalize(MONDAY_MORNING);

  const result = api.post(dayWrite({ date: '2026-10-18', client_updated_at: 9999 }));

  assert.deepEqual(result, { ok: false, error: 'week_locked' });
});

// Transferred

test('given a finalized week, when it is marked transferred, then both profiles are marked and the account total counts the payout', () => {
  const api = newApi();
  seedLastWeek(api);
  api.finalize(MONDAY_MORNING);

  const result = api.post({ token: TOKEN, action: 'transferred', week_start: '2026-10-12', transferred: true });

  assert.deepEqual(result, { ok: true });
  const state = api.get(stateRequest());
  assert.deepEqual(state.weeks, [
    { week_start: '2026-10-12', profile: 'J', points: 15, target_hit: true, payout: 100, transferred: true },
    { week_start: '2026-10-12', profile: 'R', points: 2, target_hit: false, payout: 0, transferred: true },
  ]);
  assert.equal(state.account_total, 100);
});

test('given a week that is not transferred, when reading state, then its payout is not in the account total', () => {
  const api = newApi();
  seedLastWeek(api);
  api.finalize(MONDAY_MORNING);

  assert.equal(api.get(stateRequest()).account_total, 0);
});

test('given this week is marked transferred on Sunday, when the trigger finalizes it, then it stays transferred', () => {
  const api = newApi();
  const sunday = new Date('2026-10-18T18:00:00Z');
  seedLastWeek(api);
  api.post({ token: TOKEN, action: 'transferred', week_start: '2026-10-12', transferred: true }, { now: sunday });

  const sundayState = api.get(stateRequest(), { now: sunday });
  api.finalize(MONDAY_MORNING);

  assert.equal(sundayState.current_transferred, true);
  assert.equal(sundayState.account_total, 100);
  assert.deepEqual(api.ss.weeks(), [
    ['2026-10-12', 'J', 15, true, 100, true],
    ['2026-10-12', 'R', 2, false, 0, true],
  ]);
});

test('given a week start that is not a Monday, when marking it transferred, then it is rejected', () => {
  const api = newApi();

  const result = api.post({ token: TOKEN, action: 'transferred', week_start: '2026-10-13', transferred: true });

  assert.deepEqual(result, { ok: false, error: 'invalid_week' });
  assert.deepEqual(api.ss.weeks(), []);
});

// HTTP entry points

test('given a text/plain JSON body, when it is posted to the web app, then the day is saved and the reply is JSON', () => {
  const gas = loadGas();
  const ss = fakeSpreadsheet(gas);
  gas.SpreadsheetApp = { getActive: () => ss };
  gas.LockService = { getScriptLock: () => fakeLock() };

  const output = gas.doPost({ postData: { contents: JSON.stringify(dayWrite({ date: '2000-01-03' })) } });

  assert.equal(output.mimeType, 'application/json');
  assert.deepEqual(JSON.parse(output.getContent()), { ok: true, saved: true });
  assert.equal(ss.daily().length, 1);
});

test('given a body that is not JSON, when it is posted to the web app, then the reply is an error', () => {
  const gas = loadGas();

  const output = gas.doPost({ postData: { contents: 'not json' } });

  assert.deepEqual(JSON.parse(output.getContent()), { ok: false, error: 'bad_json' });
});

test('given a state request, when it is sent to the web app, then the reply is the state as JSON', () => {
  const gas = loadGas();
  const ss = fakeSpreadsheet(gas);
  gas.SpreadsheetApp = { getActive: () => ss };
  gas.LockService = { getScriptLock: () => fakeLock() };

  const output = gas.doGet({ parameter: stateRequest() });

  assert.equal(JSON.parse(output.getContent()).ok, true);
});
