import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDay, toggleGoal } from '../web/day.js';
import { createStore } from '../web/store.js';

// Stands in for localStorage.
function fakeStorage() {
  const items = new Map();
  return {
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
  };
}

// Stands in for localStorage when site data is blocked.
function brokenStorage() {
  const fail = () => {
    throw new Error('SecurityError');
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

test('given nothing stored, when reading a day, then it is an empty day for that profile and date', () => {
  const store = createStore(fakeStorage());

  assert.deepEqual(store.getDay('J', '2026-10-20'), emptyDay('J', '2026-10-20'));
});

test('given a saved day, when the app reloads, then the day is still there', () => {
  const storage = fakeStorage();
  const day = toggleGoal(emptyDay('J', '2026-10-20'), 'activity', new Date());
  createStore(storage).saveDay(day);

  assert.deepEqual(createStore(storage).getDay('J', '2026-10-20'), day);
});

test('given a saved day for J, when reading R on the same date, then R is unaffected', () => {
  const store = createStore(fakeStorage());
  store.saveDay(toggleGoal(emptyDay('J', '2026-10-20'), 'activity', new Date()));

  assert.deepEqual(store.getDay('R', '2026-10-20'), emptyDay('R', '2026-10-20'));
});

test('given a completed setup, when the app reloads, then token and profile are remembered', () => {
  const storage = fakeStorage();
  createStore(storage).saveSetup('abc123', 'R');

  const store = createStore(storage);

  assert.equal(store.getToken(), 'abc123');
  assert.equal(store.getProfile(), 'R');
});

test('given a completed setup, when switching profile, then the profile is cleared but the token kept', () => {
  const storage = fakeStorage();
  createStore(storage).saveSetup('abc123', 'J');

  createStore(storage).clearProfile();

  const store = createStore(storage);
  assert.equal(store.getProfile(), null);
  assert.equal(store.getToken(), 'abc123');
});

test('given blocked storage, when using the store, then it keeps working for the session', () => {
  const store = createStore(brokenStorage());
  const day = toggleGoal(emptyDay('J', '2026-10-20'), 'workout', new Date());

  store.saveSetup('abc123', 'J');
  store.saveDay(day);

  assert.equal(store.getProfile(), 'J');
  assert.deepEqual(store.getDay('J', '2026-10-20'), day);
});

test('given no storage at all, when using the store, then it keeps working for the session', () => {
  const store = createStore(null);

  store.saveSetup('abc123', 'R');

  assert.equal(store.getToken(), 'abc123');
});

test('given a local day newer than the server’s, when merging server days, then the local day wins', () => {
  const store = createStore(fakeStorage());
  const local = { ...emptyDay('J', '2026-10-20'), workout: true, client_updated_at: 2000 };
  store.saveDay(local);

  store.mergeDays([{ ...emptyDay('J', '2026-10-20'), client_updated_at: 1000 }]);

  assert.deepEqual(store.getDay('J', '2026-10-20'), local);
});

test('given a server day newer than the local one, when merging, then the server day replaces it', () => {
  const store = createStore(fakeStorage());
  store.saveDay({ ...emptyDay('J', '2026-10-20'), client_updated_at: 1000 });
  const server = { ...emptyDay('J', '2026-10-20'), activity: true, client_updated_at: 2000 };

  store.mergeDays([server]);

  assert.deepEqual(store.getDay('J', '2026-10-20'), server);
});

test('given the other profile’s days from the server, when merging, then they are all available', () => {
  const store = createStore(fakeStorage());
  const days = [
    { ...emptyDay('R', '2026-10-19'), no_sweets: true, client_updated_at: 1000 },
    { ...emptyDay('R', '2026-10-20'), workout: true, client_updated_at: 1000 },
  ];

  store.mergeDays(days);

  assert.deepEqual(store.allDays(), days);
});

test('given no saved settings, when reading them, then the defaults are returned', () => {
  const store = createStore(fakeStorage());

  assert.deepEqual(store.getSettings(), { profiles: ['J', 'R'], weekly_target: 15 });
});

test('given settings from the server, when the app reloads, then they are remembered', () => {
  const storage = fakeStorage();
  createStore(storage).saveSettings({ profiles: ['J', 'R'], weekly_target: 12 });

  assert.equal(createStore(storage).getSettings().weekly_target, 12);
});

test('given a rejected token, when clearing it, then the token is gone but the profile kept', () => {
  const storage = fakeStorage();
  createStore(storage).saveSetup('wrong', 'R');

  createStore(storage).clearToken();

  const store = createStore(storage);
  assert.equal(store.getToken(), null);
  assert.equal(store.getProfile(), 'R');
});

test('given a milestone not celebrated yet, when claiming it, then it is claimed once only, even after a reload', () => {
  const storage = fakeStorage();

  const first = createStore(storage).claimMilestone('target|J|2026-10-19');
  const again = createStore(storage).claimMilestone('target|J|2026-10-19');
  const other = createStore(storage).claimMilestone('target|R|2026-10-19');

  assert.equal(first, true);
  assert.equal(again, false);
  assert.equal(other, true);
});
