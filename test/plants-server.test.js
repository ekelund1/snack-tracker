import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TOKEN, fakeLock, fakeSpreadsheet, loadGas } from './gas-fakes.js';

// Monday 9 Nov 2026, 10:00 in Stockholm.
const TODAY = new Date('2026-11-09T09:00:00Z');
// Tuesday 10 Nov 2026, 10:00 in Stockholm.
const TOMORROW = new Date('2026-11-10T09:00:00Z');

// Objects from the VM have another realm's prototypes; compare them as JSON,
// which is also what goes over the wire.
const plain = (value) => JSON.parse(JSON.stringify(value));

function newApi() {
  const gas = loadGas();
  const ss = fakeSpreadsheet(gas);
  return {
    ss,
    post: (body, { now = TODAY, lock = fakeLock() } = {}) => plain(gas.handlePost_({ token: TOKEN, ...body }, { ss, lock, now })),
    get: (params, { now = TODAY } = {}) => plain(gas.handleGet_({ token: TOKEN, ...params }, { ss, lock: fakeLock(), now })),
    plants: ({ now = TODAY } = {}) => plain(gas.handleGet_({ action: 'plants', token: TOKEN }, { ss, lock: fakeLock(), now })).plants,
  };
}

function plantWrite(overrides = {}) {
  return {
    action: 'plant',
    id: 'p1',
    name: 'Monstera',
    emoji: '🪴',
    amount: 'moderate',
    summer_days: 7,
    winter_days: 12,
    ...overrides,
  };
}

const NEVER_WATERED = { last_watered: '', last_watered_by: '', previous_watered: '' };

// Token

test('given a wrong token, when reading plants, then the request is rejected', () => {
  const api = newApi();

  assert.deepEqual(api.get({ action: 'plants', token: 'guess' }), { ok: false, error: 'unauthorized' });
});

test('given a wrong token, when adding a plant, then it is rejected and nothing is saved', () => {
  const api = newApi();

  assert.deepEqual(api.post(plantWrite({ token: 'guess' })), { ok: false, error: 'unauthorized' });
  assert.equal(api.ss.plants().length, 0);
});

// Adding, editing and removing plants

test('given no plants, when reading plants, then the board is empty and today is Stockholm’s date', () => {
  const api = newApi();

  assert.deepEqual(api.get({ action: 'plants' }), { ok: true, today: '2026-11-09', plants: [] });
});

test('given a new plant, when it is added, then it is on the board and never watered', () => {
  const api = newApi();

  assert.deepEqual(api.post(plantWrite()), { ok: true });

  const { action, ...fields } = plantWrite();
  assert.deepEqual(api.plants(), [{ ...fields, ...NEVER_WATERED }]);
});

test('given the same new plant sent twice, when added, then there is one plant', () => {
  const api = newApi();

  api.post(plantWrite());
  api.post(plantWrite());

  assert.equal(api.plants().length, 1);
});

test('given a watered plant, when it is edited, then the new details are saved and the watering is kept', () => {
  const api = newApi();
  api.post(plantWrite());
  api.post({ action: 'water', id: 'p1', profile: 'R' });

  api.post(plantWrite({ name: 'Stora monsteran', amount: 'soak', winter_days: 14 }));

  const [saved] = api.plants();
  assert.equal(saved.name, 'Stora monsteran');
  assert.equal(saved.amount, 'soak');
  assert.equal(saved.winter_days, 14);
  assert.equal(saved.last_watered, '2026-11-09');
  assert.equal(saved.last_watered_by, 'R');
});

test('given plant writes that are not valid plants, when sent, then each is rejected and nothing is saved', () => {
  const api = newApi();
  const invalid = [
    { name: '' },
    { name: 'x'.repeat(41) },
    { amount: 'flood' },
    { summer_days: 0 },
    { winter_days: 2.5 },
    { winter_days: '7' },
    { id: '' },
    { name: '=IMPORTXML("x")' },
  ];

  invalid.forEach((overrides) => {
    assert.deepEqual(api.post(plantWrite(overrides)), { ok: false, error: 'invalid_plant' }, JSON.stringify(overrides));
  });
  assert.equal(api.ss.plants().length, 0);
});

test('given two plants, when one is removed, then only the other stays on the board', () => {
  const api = newApi();
  api.post(plantWrite({ id: 'p1' }));
  api.post(plantWrite({ id: 'p2', name: 'Aloe' }));

  assert.deepEqual(api.post({ action: 'remove_plant', id: 'p1' }), { ok: true });

  assert.deepEqual(api.plants().map((plant) => plant.id), ['p2']);
});

// Watering

test('given a plant, when J waters it, then everyone sees it watered today by J', () => {
  const api = newApi();
  api.post(plantWrite());

  assert.deepEqual(api.post({ action: 'water', id: 'p1', profile: 'J' }), { ok: true });

  const [watered] = api.plants();
  assert.equal(watered.last_watered, '2026-11-09');
  assert.equal(watered.last_watered_by, 'J');
});

test('given R watered a plant today, when J waters it too, then it stays R’s watering', () => {
  const api = newApi();
  api.post(plantWrite());
  api.post({ action: 'water', id: 'p1', profile: 'R' });

  api.post({ action: 'water', id: 'p1', profile: 'J' });

  assert.equal(api.plants()[0].last_watered_by, 'R');
});

test('given a plant watered yesterday and today, when today’s watering is undone, then yesterday’s is back', () => {
  const api = newApi();
  api.post(plantWrite());
  api.post({ action: 'water', id: 'p1', profile: 'R' });
  api.post({ action: 'water', id: 'p1', profile: 'J' }, { now: TOMORROW });

  assert.deepEqual(api.post({ action: 'unwater', id: 'p1' }, { now: TOMORROW }), { ok: true });

  assert.equal(api.plants({ now: TOMORROW })[0].last_watered, '2026-11-09');
});

test('given a plant watered yesterday, when undoing today, then the watering stands', () => {
  const api = newApi();
  api.post(plantWrite());
  api.post({ action: 'water', id: 'p1', profile: 'R' });

  api.post({ action: 'unwater', id: 'p1' }, { now: TOMORROW });

  assert.equal(api.plants({ now: TOMORROW })[0].last_watered, '2026-11-09');
});

test('given an unknown or removed plant, when watering it, then it is rejected', () => {
  const api = newApi();
  api.post(plantWrite());
  api.post({ action: 'remove_plant', id: 'p1' });

  assert.deepEqual(api.post({ action: 'water', id: 'p1', profile: 'J' }), { ok: false, error: 'unknown_plant' });
  assert.deepEqual(api.post({ action: 'water', id: 'nope', profile: 'J' }), { ok: false, error: 'unknown_plant' });
});

test('given an unknown profile, when watering, then it is rejected and nothing changes', () => {
  const api = newApi();
  api.post(plantWrite());

  assert.deepEqual(api.post({ action: 'water', id: 'p1', profile: 'X' }), { ok: false, error: 'invalid_profile' });
  assert.equal(api.plants()[0].last_watered, '');
});

test('given another write holding the lock, when watering, then it is rejected as busy', () => {
  const api = newApi();
  api.post(plantWrite());

  const result = api.post({ action: 'water', id: 'p1', profile: 'J' }, { lock: fakeLock({ available: false }) });

  assert.deepEqual(result, { ok: false, error: 'busy' });
  assert.equal(api.plants()[0].last_watered, '');
});

// The snack tracker is unaffected

test('given plants on the board, when reading snack state, then it still answers without plants', () => {
  const api = newApi();
  api.post(plantWrite());

  const state = api.get({ action: 'state' });

  assert.equal(state.ok, true);
  assert.equal(state.plants, undefined);
});
