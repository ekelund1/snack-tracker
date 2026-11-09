// Calls callback when the element is held for `delay` ms without moving, and
// swallows the click that follows the release, so a hold is never also a tap.
// A right click, or the context menu Android opens on a long press, counts as
// a long press too and shows no menu.
//
// Timers are passed in, so tests can move time themselves.
const MOVE_TOLERANCE_PX = 10;

export function onLongPress(element, callback, { delay = 500, timers = globalThis } = {}) {
  let timer = null;
  let start = null;
  // True from a long press until the next press starts.
  let pressed = false;

  const cancel = () => {
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
  };

  const fire = () => {
    cancel();
    pressed = true;
    callback();
  };

  element.addEventListener('pointerdown', (event) => {
    pressed = false;
    cancel();
    if (event.button !== 0) return;
    start = { x: event.clientX, y: event.clientY };
    timer = timers.setTimeout(fire, delay);
  });

  element.addEventListener('pointermove', (event) => {
    if (timer !== null && Math.hypot(event.clientX - start.x, event.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach((type) => element.addEventListener(type, cancel));

  element.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!pressed) fire();
  });

  element.addEventListener(
    'click',
    (event) => {
      if (!pressed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    { capture: true },
  );
}
