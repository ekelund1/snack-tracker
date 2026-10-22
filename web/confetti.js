// Small canvas confetti. Hand-written instead of a library, so the app loads
// no third-party script and keeps working offline.

const COLORS = ['#ff7a1a', '#ffa04d', '#ffd23f', '#ff2e88', '#2ef2ff', '#b6ff3b'];

let canvas = null;
let ctx = null;
let particles = [];
let frame = null;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement('canvas');
  canvas.className = 'confetti';
  document.body.append(canvas);
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

// Sharp on high-density screens: draw in device pixels, think in CSS pixels.
function resize() {
  const ratio = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * ratio;
  canvas.height = window.innerHeight * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function addParticle(x, y, angle, speed, { gravity = 0.3, decay = 0.012 } = {}) {
  particles.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity,
    decay,
    life: 1,
    size: 6 + Math.random() * 6,
    rotation: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.4,
    wobble: Math.random() * Math.PI * 2,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() < 0.3,
  });
  if (!frame) frame = requestAnimationFrame(tick);
}

// Pieces flying out from a point, upwards by default.
export function burst(x, y, { count = 40, power = 10, spread = Math.PI * 1.2, angle = -Math.PI / 2 } = {}) {
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    addParticle(x, y, angle + (Math.random() - 0.5) * spread, power * (0.4 + Math.random() * 0.8));
  }
}

// Pieces fluttering down over the whole screen.
export function shower(count = 150) {
  ensureCanvas();
  for (let i = 0; i < count; i++) {
    const x = Math.random() * window.innerWidth;
    const y = -20 - Math.random() * window.innerHeight * 0.6;
    addParticle(x, y, Math.PI / 2 + (Math.random() - 0.5) * 0.6, 2 + Math.random() * 3, {
      gravity: 0.06,
      decay: 0.004,
    });
  }
}

function tick() {
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  particles = particles.filter((p) => p.life > 0 && p.y < window.innerHeight + 30);

  for (const p of particles) {
    p.vy += p.gravity;
    p.vx *= 0.98;
    p.vy *= 0.98;
    p.wobble += 0.1;
    p.x += p.vx + Math.sin(p.wobble) * 0.6;
    p.y += p.vy;
    p.rotation += p.spin;
    p.life -= p.decay;

    ctx.save();
    ctx.globalAlpha = Math.min(1, p.life * 3);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    if (p.round) {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    }
    ctx.restore();
  }

  frame = particles.length > 0 ? requestAnimationFrame(tick) : null;
}
