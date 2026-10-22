import { createApi } from './api.js';
import { celebratePerfectDay, celebrateTap, celebrateTarget, pop } from './celebrate.js';
import { API_URL } from './config.js';
import { milestonesFor, mondayOf, stockholmDate, toggleGoal, weekPoints } from './day.js';
import { createStore } from './store.js';

// Reading window.localStorage itself throws when site data is blocked.
function localStorageOrNull() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const store = createStore(localStorageOrNull());
const api = createApi((url, options) => fetch(url, options), API_URL);

const setupSection = document.getElementById('setup');
const setupForm = document.getElementById('setup-form');
const setupError = document.getElementById('setup-error');
const tokenField = document.getElementById('token-field');
const tokenInput = setupForm.elements.token;
const todaySection = document.getElementById('today');
const dateLabel = document.getElementById('date');
const switchButton = document.getElementById('switch-profile');
const goalButtons = document.querySelectorAll('[data-goal]');
const weekList = document.getElementById('week-points');

const DATE_LABEL = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

// The day on screen.
let day = null;

function showSetup(error = '') {
  const hasToken = Boolean(store.getToken());
  tokenField.hidden = hasToken;
  // A hidden required field would block the form from submitting.
  tokenInput.disabled = hasToken;
  setupError.textContent = error;
  setupError.hidden = !error;
  todaySection.hidden = true;
  setupSection.hidden = false;
}

// Renders today from local data right away, then refreshes from the server.
function showToday() {
  const profile = store.getProfile();
  const now = new Date();
  day = store.getDay(profile, stockholmDate(now));
  dateLabel.textContent = DATE_LABEL.format(now);
  switchButton.textContent = `${profile} · Byt`;
  setupSection.hidden = true;
  todaySection.hidden = false;
  render();
  refresh();
}

function render() {
  goalButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(day[button.dataset.goal]));
  });
  renderWeek();
}

// One row per profile, kept between renders so the bars animate as they grow.
let weekRows = new Map();

// Both profiles' points this week, out of the weekly target.
function renderWeek() {
  const { profiles, weekly_target: target } = store.getSettings();
  if (profiles.join() !== [...weekRows.keys()].join()) {
    weekRows = new Map(profiles.map((profile) => [profile, createWeekRow(profile)]));
    weekList.replaceChildren(...[...weekRows.values()].map((row) => row.item));
    // Applies the empty bars before the first widths are set, so they grow from zero.
    void weekList.offsetWidth;
  }

  const days = store.allDays();
  const weekStart = mondayOf(day.date);
  weekRows.forEach((row, profile) => updateWeekRow(row, weekPoints(days, profile, weekStart), target));
}

function createWeekRow(profile) {
  const item = document.createElement('li');
  const name = document.createElement('span');
  const bar = document.createElement('span');
  const fill = document.createElement('span');
  const score = document.createElement('span');
  name.className = 'week-name';
  name.textContent = profile;
  bar.className = 'bar';
  fill.style.width = '0%';
  score.className = 'week-score';
  bar.append(fill);
  item.append(name, bar, score);
  return { item, fill, score, points: null };
}

function updateWeekRow(row, points, target) {
  const changed = row.points !== null && row.points !== points;
  row.points = points;
  row.fill.style.width = `${Math.min(100, (points / target) * 100)}%`;
  row.score.textContent = `${points}/${target}`;
  // Stays bouncy and silly for as long as the target is met.
  row.item.classList.toggle('is-goal', points >= target);
  if (changed) pop(row.score);
}

// Fetches both profiles' week in the background. Taps not yet on the server
// are newer, so they survive the merge.
async function refresh() {
  const token = store.getToken();
  let state;
  try {
    state = await api.fetchState(token);
  } catch {
    return; // Offline: keep showing local data.
  }

  if (state.error === 'unauthorized') {
    store.clearToken();
    showSetup('Fel kod. Försök igen.');
    return;
  }
  if (!state.ok) return;

  store.mergeDays(state.days);
  store.saveSettings({ profiles: state.settings.profiles, weekly_target: state.settings.weekly_target });
  if (!todaySection.hidden) {
    day = store.getDay(day.profile, day.date);
    render();
  }
}

// Moves on to the new day if the app was left open past midnight.
function refreshIfNewDay() {
  if (!todaySection.hidden && day.date !== stockholmDate(new Date())) showToday();
}

setupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const token = store.getToken() || tokenInput.value.trim();
  if (!token) return;
  store.saveSetup(token, event.submitter.value);
  showToday();
});

switchButton.addEventListener('click', () => {
  store.clearProfile();
  showSetup();
});

goalButtons.forEach((button) => {
  button.addEventListener('click', () => {
    refreshIfNewDay();
    const goal = button.dataset.goal;
    const weekStart = mondayOf(day.date);
    const before = day;
    const pointsBefore = weekPoints(store.allDays(), day.profile, weekStart);

    day = toggleGoal(day, goal, new Date());
    store.saveDay(day);
    render();
    api.sendDay(store.getToken(), day);

    celebrateTap(button, day[goal]);
    const pointsAfter = weekPoints(store.allDays(), day.profile, weekStart);
    milestonesFor(before, day, pointsBefore, pointsAfter, store.getSettings().weekly_target)
      .filter((milestone) => store.claimMilestone(milestone.key))
      .forEach((milestone) => {
        if (milestone.type === 'perfect_day') celebratePerfectDay([...goalButtons]);
        else celebrateTarget(weekRows.get(day.profile).item);
      });
  });
});

// Reopening the app shows the other phone's latest taps.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || todaySection.hidden) return;
  refreshIfNewDay();
  refresh();
});

if (store.getToken() && store.getProfile()) showToday();
else showSetup();
