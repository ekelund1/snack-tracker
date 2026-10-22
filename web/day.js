// One profile's day: which goals are done, and when it last changed.
// No DOM or storage here, so it can be tested in Node.

export const GOALS = ['activity', 'workout', 'no_sweets'];

const STOCKHOLM_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// The calendar date in Stockholm as 'YYYY-MM-DD', whatever the phone's time zone.
export function stockholmDate(now) {
  const part = (type) => STOCKHOLM_PARTS.formatToParts(now).find((p) => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function emptyDay(profile, date) {
  return { profile, date, no_sweets: false, activity: false, workout: false, client_updated_at: 0 };
}

// Flips one goal and stamps the change time, so the server can drop older writes.
export function toggleGoal(day, goal, now) {
  if (!GOALS.includes(goal)) throw new Error(`Unknown goal: ${goal}`);
  return { ...day, [goal]: !day[goal], client_updated_at: now.getTime() };
}

// Monday of the week containing a 'YYYY-MM-DD' date. Calendar arithmetic in
// UTC, so no time zone or DST change can shift it.
export function mondayOf(date) {
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

function addDays(date, count) {
  const day = new Date(`${date}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + count);
  return day.toISOString().slice(0, 10);
}

// One point per done goal, for one profile's days in the week starting weekStart.
export function weekPoints(days, profile, weekStart) {
  return days
    .filter((day) => day.profile === profile && mondayOf(day.date) === weekStart)
    .reduce((sum, day) => sum + GOALS.filter((goal) => day[goal]).length, 0);
}

// The celebrations a tap earns: a perfect day when the last goal of the day
// gets done, and the weekly target when the week's points cross it. Each has a
// key, so it can be celebrated once only.
export function milestonesFor(beforeDay, afterDay, beforePoints, afterPoints, target) {
  const allDone = (day) => GOALS.every((goal) => day[goal]);
  const reached = [];
  if (!allDone(beforeDay) && allDone(afterDay)) {
    reached.push({ type: 'perfect_day', key: `perfect_day|${afterDay.profile}|${afterDay.date}` });
  }
  if (beforePoints < target && afterPoints >= target) {
    reached.push({ type: 'target', key: `target|${afterDay.profile}|${mondayOf(afterDay.date)}` });
  }
  return reached;
}
