import { burst, shower } from './confetti.js';

// Visual and haptic feedback for taps and milestones.

// Android only. iOS has no vibration API, so this does nothing there.
function vibrate(pattern) {
  if (navigator.vibrate) navigator.vibrate(pattern);
}

function centerOf(element) {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

const SPRING = 'cubic-bezier(0.3, 1.6, 0.5, 1)';

const POP = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.15) rotate(-4deg)', offset: 0.35 },
  { transform: 'scale(0.95) rotate(3deg)', offset: 0.65 },
  { transform: 'scale(1)' },
];

const JUMP = [
  { transform: 'translateY(0) rotate(0) scale(1)' },
  { transform: 'translateY(-24px) rotate(-15deg) scale(1.35)', offset: 0.4 },
  { transform: 'translateY(0) rotate(10deg) scale(0.95)', offset: 0.75 },
  { transform: 'translateY(0) rotate(0) scale(1)' },
];

const SHAKE = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-8px)' },
  { transform: 'translateX(8px)' },
  { transform: 'translateX(-5px)' },
  { transform: 'translateX(5px)' },
  { transform: 'translateX(0)' },
];

const BIG_JUMP = [
  { transform: 'translateY(0) scale(1)' },
  { transform: 'translateY(-30px) scale(1.08) rotate(-3deg)', offset: 0.3 },
  { transform: 'translateY(0) scale(0.97)', offset: 0.55 },
  { transform: 'translateY(-14px) scale(1.04) rotate(2deg)', offset: 0.75 },
  { transform: 'translateY(0) scale(1)' },
];

// Feedback on every goal tap: a springy pop, a jumping icon, a ripple, a
// floating +1 and a confetti burst when done; a small shake when undone.
export function celebrateTap(button, done) {
  vibrate(done ? 25 : 10);

  if (!done) {
    button.animate(SHAKE, { duration: 350, easing: 'ease-out' });
    return;
  }

  button.animate(POP, { duration: 500, easing: SPRING });
  button.querySelector('.goal-icon').animate(JUMP, { duration: 650, easing: 'ease-out' });
  ripple(button);
  floatText(button, '+1');
  const { x, y } = centerOf(button);
  burst(x, y, { count: 36 });
}

// All three goals done today.
export function celebratePerfectDay(buttons) {
  vibrate([25, 50, 25, 50, 25]);
  banner('Perfekt dag! ⭐');

  buttons.forEach((button, index) => {
    setTimeout(() => {
      button.animate(POP, { duration: 500, easing: SPRING });
      const { x, y } = centerOf(button);
      burst(x, y, { count: 50, power: 13, spread: Math.PI * 2 });
    }, 150 + index * 120);
  });
}

// The weekly target reached: the biggest party.
export function celebrateTarget(row) {
  vibrate([40, 60, 40, 60, 40, 60, 150]);
  banner('Veckomålet klart! 🎉');

  shower(220);
  const { x, y } = centerOf(row);
  burst(x, y, { count: 80, power: 15, spread: Math.PI * 2 });
  row.animate(BIG_JUMP, { duration: 900, easing: 'ease-out' });
}

// A quick grow-and-settle, for a number that just changed.
export function pop(element) {
  element.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.45)' }, { transform: 'scale(1)' }],
    { duration: 400, easing: SPRING },
  );
}

function ripple(button) {
  const ring = document.createElement('span');
  ring.className = 'ripple';
  button.append(ring);
  ring
    .animate(
      [
        { transform: 'scale(1)', opacity: 0.8 },
        { transform: 'scale(1.35)', opacity: 0 },
      ],
      { duration: 600, easing: 'ease-out' },
    )
    .finished.then(() => ring.remove());
}

function floatText(button, text) {
  const label = document.createElement('span');
  label.className = 'float-text';
  label.textContent = text;
  button.append(label);
  label
    .animate(
      [
        { transform: 'translate(-50%, 0) scale(0.6)', opacity: 0 },
        { transform: 'translate(-50%, -30px) scale(1.3)', opacity: 1, offset: 0.25 },
        { transform: 'translate(-50%, -90px) scale(1)', opacity: 0 },
      ],
      { duration: 900, easing: 'ease-out' },
    )
    .finished.then(() => label.remove());
}

// Banners queue up, so a perfect day and the weekly target on the same tap
// show one after the other.
let bannerQueue = Promise.resolve();

function banner(text) {
  bannerQueue = bannerQueue.then(() => showBanner(text));
}

async function showBanner(text) {
  const element = document.createElement('div');
  element.className = 'banner';
  element.textContent = text;
  document.body.append(element);

  await element.animate(
    [
      { transform: 'scale(0) rotate(-12deg)', opacity: 0 },
      { transform: 'scale(1.15) rotate(3deg)', opacity: 1, offset: 0.6 },
      { transform: 'scale(1) rotate(0)', opacity: 1 },
    ],
    { duration: 500, easing: SPRING },
  ).finished;
  await new Promise((resolve) => setTimeout(resolve, 1600));
  await element.animate([{ opacity: 1 }, { transform: 'scale(0.8)', opacity: 0 }], { duration: 300 }).finished;
  element.remove();
}
