import { test } from 'node:test';
import assert from 'node:assert/strict';
import { onLongPress } from '../web/longpress.js';

// An element that runs its listeners like a browser does at the target:
// capture listeners first, and stopImmediatePropagation skips the rest.
function fakeElement() {
  const listeners = [];
  return {
    addEventListener(type, listener, options = {}) {
      listeners.push({ type, listener, capture: options === true || Boolean(options.capture) });
    },
    dispatch(type, fields = {}) {
      let stopped = false;
      const event = {
        type,
        button: 0,
        clientX: 0,
        clientY: 0,
        defaultPrevented: false,
        preventDefault() {
          this.defaultPrevented = true;
        },
        stopImmediatePropagation() {
          stopped = true;
        },
        ...fields,
      };
      const ordered = [...listeners.filter((l) => l.capture), ...listeners.filter((l) => !l.capture)];
      for (const { type: listenerType, listener } of ordered) {
        if (stopped) break;
        if (listenerType === type) listener(event);
      }
      return event;
    },
  };
}

// Timers that only move when the test says so.
function fakeTimers() {
  let now = 0;
  let pending = [];
  return {
    setTimeout(callback, delay) {
      const timer = { callback, at: now + delay };
      pending.push(timer);
      return timer;
    },
    clearTimeout(timer) {
      pending = pending.filter((candidate) => candidate !== timer);
    },
    advance(ms) {
      now += ms;
      const due = pending.filter((timer) => timer.at <= now);
      pending = pending.filter((timer) => timer.at > now);
      due.forEach((timer) => timer.callback());
    },
  };
}

// A card with a tap handler and a long-press handler, counting each.
function card() {
  const element = fakeElement();
  const timers = fakeTimers();
  const counts = { taps: 0, longPresses: 0 };
  onLongPress(element, () => (counts.longPresses += 1), { delay: 500, timers });
  element.addEventListener('click', () => (counts.taps += 1));
  return { element, timers, counts };
}

test('given a finger held still for the delay, when released, then it is a long press and not a tap', () => {
  const { element, timers, counts } = card();

  element.dispatch('pointerdown');
  timers.advance(500);
  element.dispatch('pointerup');
  element.dispatch('click');

  assert.deepEqual(counts, { taps: 0, longPresses: 1 });
});

test('given a quick tap, when released before the delay, then it is a tap only', () => {
  const { element, timers, counts } = card();

  element.dispatch('pointerdown');
  timers.advance(200);
  element.dispatch('pointerup');
  element.dispatch('click');
  timers.advance(500);

  assert.deepEqual(counts, { taps: 1, longPresses: 0 });
});

test('given a finger that starts scrolling, when it moves past the threshold, then no long press happens', () => {
  const { element, timers, counts } = card();

  element.dispatch('pointerdown', { clientX: 100, clientY: 100 });
  element.dispatch('pointermove', { clientX: 100, clientY: 130 });
  timers.advance(500);

  assert.equal(counts.longPresses, 0);
});

test('given a long press that also opens the context menu, when both fire, then the details open once and no menu shows', () => {
  const { element, timers, counts } = card();

  element.dispatch('pointerdown');
  timers.advance(500);
  const menu = element.dispatch('contextmenu');

  assert.equal(counts.longPresses, 1);
  assert.equal(menu.defaultPrevented, true);
});

test('given a mouse, when right-clicking and then tapping, then the right click is a long press and the tap still counts', () => {
  const { element, counts } = card();

  element.dispatch('pointerdown', { button: 2 });
  element.dispatch('pointerup', { button: 2 });
  element.dispatch('contextmenu');
  element.dispatch('pointerdown');
  element.dispatch('pointerup');
  element.dispatch('click');

  assert.deepEqual(counts, { taps: 1, longPresses: 1 });
});
