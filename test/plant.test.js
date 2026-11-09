import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boardOrder, plantStatus, seasonOf, statusLabel, unwaterPlant, waterPlant } from '../web/plant.js';

function plant(overrides = {}) {
  return {
    id: 'p1',
    name: 'Monstera',
    emoji: '🪴',
    amount: 'moderate',
    summer_days: 7,
    winter_days: 12,
    last_watered: '',
    last_watered_by: '',
    previous_watered: '',
    ...overrides,
  };
}

// Seasons

test('given dates through the year, when asking the season, then April to September is summer and the rest winter', () => {
  assert.equal(seasonOf('2026-03-31'), 'winter');
  assert.equal(seasonOf('2026-04-01'), 'summer');
  assert.equal(seasonOf('2026-09-30'), 'summer');
  assert.equal(seasonOf('2026-10-01'), 'winter');
  assert.equal(seasonOf('2026-01-15'), 'winter');
});

// Status

test('given a plant never watered, when checking it, then it is due', () => {
  assert.deepEqual(plantStatus(plant(), '2026-11-09'), { state: 'due', days_left: 0 });
});

test('given a plant watered today, when checking it, then it is watered', () => {
  assert.deepEqual(plantStatus(plant({ last_watered: '2026-11-09' }), '2026-11-09'), { state: 'watered', days_left: 12 });
});

test('given a winter plant watered 9 of 12 days ago, when checking it, then it waits 3 more days', () => {
  assert.deepEqual(plantStatus(plant({ last_watered: '2026-10-31' }), '2026-11-09'), { state: 'waiting', days_left: 3 });
});

test('given a plant watered exactly one interval ago, when checking it, then it is due', () => {
  assert.equal(plantStatus(plant({ last_watered: '2026-10-28' }), '2026-11-09').state, 'due');
});

test('given a plant watered 8 days ago, when checking it in summer and in winter, then the season sets the interval', () => {
  assert.equal(plantStatus(plant({ last_watered: '2026-06-01' }), '2026-06-09').state, 'due');
  assert.deepEqual(plantStatus(plant({ last_watered: '2026-12-01' }), '2026-12-09'), { state: 'waiting', days_left: 4 });
});

// Labels

test('given each status, when labelling it, then due says how much, waiting says when, watered says who', () => {
  assert.equal(statusLabel(plant({ amount: 'soak' }), { state: 'due', days_left: 0 }), 'Genomvattna');
  assert.equal(statusLabel(plant(), { state: 'waiting', days_left: 1 }), 'Vattna i morgon');
  assert.equal(statusLabel(plant(), { state: 'waiting', days_left: 4 }), 'Vattna om 4 dagar');
  assert.equal(statusLabel(plant({ last_watered_by: 'R' }), { state: 'watered', days_left: 12 }), 'Vattnad idag av R');
});

// Watering and undo

test('given a plant watered last week, when J waters it today, then today is the last watering and last week the previous', () => {
  const watered = waterPlant(plant({ last_watered: '2026-11-02', last_watered_by: 'R' }), '2026-11-09', 'J');

  assert.equal(watered.last_watered, '2026-11-09');
  assert.equal(watered.last_watered_by, 'J');
  assert.equal(watered.previous_watered, '2026-11-02');
});

test('given a plant R watered today, when J waters it too, then it stays R’s watering', () => {
  const byR = plant({ last_watered: '2026-11-09', last_watered_by: 'R', previous_watered: '2026-11-02' });

  assert.deepEqual(waterPlant(byR, '2026-11-09', 'J'), byR);
});

test('given a plant watered today, when the watering is undone, then the previous watering is back', () => {
  const before = plant({ last_watered: '2026-11-02', last_watered_by: 'R' });
  const undone = unwaterPlant(waterPlant(before, '2026-11-09', 'J'), '2026-11-09');

  assert.equal(undone.last_watered, '2026-11-02');
  assert.equal(plantStatus(undone, '2026-11-09').state, 'waiting');
});

test('given a plant watered yesterday, when undoing today, then nothing changes', () => {
  const yesterday = plant({ last_watered: '2026-11-08', last_watered_by: 'J', previous_watered: '2026-11-01' });

  assert.deepEqual(unwaterPlant(yesterday, '2026-11-09'), yesterday);
});

// Board order

test('given due, waiting and watered plants, when ordering the board, then due come first, then soonest due, then by name', () => {
  const plants = [
    plant({ id: 'watered', name: 'A', last_watered: '2026-11-09' }),
    plant({ id: 'later', name: 'B', last_watered: '2026-11-05' }),
    plant({ id: 'due-b', name: 'Dracena', last_watered: '' }),
    plant({ id: 'soon', name: 'C', last_watered: '2026-10-30' }),
    plant({ id: 'due-a', name: 'Aloe', last_watered: '2026-10-01' }),
  ];

  assert.deepEqual(
    boardOrder(plants, '2026-11-09').map((p) => p.id),
    ['due-a', 'due-b', 'soon', 'later', 'watered'],
  );
});
