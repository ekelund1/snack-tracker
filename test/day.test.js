import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyDay, milestonesFor, mondayOf, stockholmDate, toggleGoal, weekPoints } from '../web/day.js';

test('given 23:55 on a winter Sunday in Stockholm, when reading the date, then it is still Sunday', () => {
  // 2026-10-25 is the day summer time ends, so Stockholm is UTC+1 by the evening.
  assert.equal(stockholmDate(new Date('2026-10-25T22:55:00Z')), '2026-10-25');
  assert.equal(stockholmDate(new Date('2026-10-25T23:05:00Z')), '2026-10-26');
});

test('given 23:55 on a summer Sunday in Stockholm, when reading the date, then it is still Sunday', () => {
  assert.equal(stockholmDate(new Date('2026-06-14T21:55:00Z')), '2026-06-14');
  assert.equal(stockholmDate(new Date('2026-06-14T22:05:00Z')), '2026-06-15');
});

test('given an empty day, when toggling a goal, then only that goal is done and the change time is stamped', () => {
  const now = new Date('2026-10-20T08:00:00Z');

  const day = toggleGoal(emptyDay('J', '2026-10-20'), 'workout', now);

  assert.deepEqual(day, {
    profile: 'J',
    date: '2026-10-20',
    no_sweets: false,
    activity: false,
    workout: true,
    client_updated_at: now.getTime(),
  });
});

test('given a done goal, when toggling it again, then it is undone', () => {
  const done = toggleGoal(emptyDay('R', '2026-10-20'), 'no_sweets', new Date());

  assert.equal(toggleGoal(done, 'no_sweets', new Date()).no_sweets, false);
});

test('given a day, when toggling a goal, then the original day is unchanged', () => {
  const original = emptyDay('J', '2026-10-20');

  toggleGoal(original, 'activity', new Date());

  assert.equal(original.activity, false);
});

test('given an unknown goal, when toggling it, then it throws', () => {
  assert.throws(() => toggleGoal(emptyDay('J', '2026-10-20'), 'sleep', new Date()));
});

test('given any day of a week, when finding its Monday, then it is that week’s Monday', () => {
  assert.equal(mondayOf('2026-10-25'), '2026-10-19');
  assert.equal(mondayOf('2026-10-26'), '2026-10-26');
  assert.equal(mondayOf('2026-11-01'), '2026-10-26');
});

test('given days for both profiles across weeks, when counting a profile’s week points, then only that profile’s goals that week count', () => {
  const perfect = { no_sweets: true, activity: true, workout: true };
  const days = [
    { ...emptyDay('J', '2026-10-18'), ...perfect }, // last week
    { ...emptyDay('J', '2026-10-19'), ...perfect },
    { ...emptyDay('J', '2026-10-20'), no_sweets: true },
    { ...emptyDay('R', '2026-10-20'), ...perfect },
  ];

  assert.equal(weekPoints(days, 'J', '2026-10-19'), 4);
  assert.equal(weekPoints(days, 'R', '2026-10-19'), 3);
});

test('given two goals done, when the third is tapped, then it is a perfect day', () => {
  const before = { ...emptyDay('J', '2026-10-21'), no_sweets: true, activity: true };
  const after = { ...before, workout: true };

  assert.deepEqual(milestonesFor(before, after, 5, 6, 15), [
    { type: 'perfect_day', key: 'perfect_day|J|2026-10-21' },
  ]);
});

test('given points one below the target, when a tap reaches it, then the weekly target is reached for that week', () => {
  const before = emptyDay('J', '2026-10-21');
  const after = { ...before, workout: true };

  assert.deepEqual(milestonesFor(before, after, 14, 15, 15), [
    { type: 'target', key: 'target|J|2026-10-19' },
  ]);
});

test('given the target already passed, when another goal is tapped, then nothing new is reached', () => {
  const before = emptyDay('J', '2026-10-21');
  const after = { ...before, activity: true };

  assert.deepEqual(milestonesFor(before, after, 15, 16, 15), []);
});

test('given a perfect day, when a goal is undone, then nothing is reached', () => {
  const before = { ...emptyDay('J', '2026-10-21'), no_sweets: true, activity: true, workout: true };
  const after = { ...before, workout: false };

  assert.deepEqual(milestonesFor(before, after, 15, 14, 15), []);
});
