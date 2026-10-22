import { emptyDay } from './day.js';

const KEYS = {
  token: 'snack.token',
  profile: 'snack.profile',
  days: 'snack.days',
  settings: 'snack.settings',
  milestones: 'snack.milestones',
};

// Used until the first successful read from the server.
const DEFAULT_SETTINGS = { profiles: ['J', 'R'], weekly_target: 15 };

// Keeps setup and day states in localStorage. Storage can be missing or throw
// (private mode, blocked site data), so values are also held in memory and the
// app keeps working for the session.
export function createStore(storage) {
  const memory = new Map();

  function read(key) {
    if (memory.has(key)) return memory.get(key);
    try {
      return storage.getItem(key);
    } catch {
      return null;
    }
  }

  function write(key, value) {
    memory.set(key, value);
    try {
      if (value === null) storage.removeItem(key);
      else storage.setItem(key, value);
    } catch {
      // Kept in memory only.
    }
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(read(key)) || fallback;
    } catch {
      return fallback;
    }
  }

  // All days in one object, keyed 'profile|date'.
  const readDays = () => readJson(KEYS.days, {});
  const writeDays = (days) => write(KEYS.days, JSON.stringify(days));
  const dayKey = (day) => `${day.profile}|${day.date}`;

  return {
    getToken: () => read(KEYS.token),
    getProfile: () => read(KEYS.profile),

    saveSetup(token, profile) {
      write(KEYS.token, token);
      write(KEYS.profile, profile);
    },

    clearProfile() {
      write(KEYS.profile, null);
    },

    clearToken() {
      write(KEYS.token, null);
    },

    getSettings: () => readJson(KEYS.settings, DEFAULT_SETTINGS),

    saveSettings(settings) {
      write(KEYS.settings, JSON.stringify(settings));
    },

    getDay(profile, date) {
      return readDays()[`${profile}|${date}`] || emptyDay(profile, date);
    },

    allDays: () => Object.values(readDays()),

    saveDay(day) {
      const days = readDays();
      days[dayKey(day)] = day;
      writeDays(days);
    },

    // Takes days from the server, keeping whichever version of each day
    // changed last, so taps the server hasn't seen yet aren't lost.
    mergeDays(serverDays) {
      const days = readDays();
      serverDays.forEach((day) => {
        const local = days[dayKey(day)];
        if (!local || day.client_updated_at > local.client_updated_at) days[dayKey(day)] = day;
      });
      writeDays(days);
    },

    // True the first time a milestone key is claimed, false after that, so a
    // celebration never repeats on reload.
    claimMilestone(key) {
      const claimed = readJson(KEYS.milestones, []);
      if (claimed.includes(key)) return false;
      write(KEYS.milestones, JSON.stringify([...claimed, key]));
      return true;
    },
  };
}
