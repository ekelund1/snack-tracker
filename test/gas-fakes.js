// Loads the Apps Script files into a Node VM with in-memory stand-ins for the
// Google services they use, so the API can be tested at its request boundary.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const GAS_FILES = ['Schema.js', 'SnackTracker.js'];

const STOCKHOLM_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Stockholm',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const fakeUtilities = {
  formatDate(date, timeZone, pattern) {
    if (timeZone !== 'Europe/Stockholm' || pattern !== 'yyyy-MM-dd') {
      throw new Error(`Fake formatDate does not support ${timeZone} ${pattern}`);
    }
    const part = (type) => STOCKHOLM_PARTS.formatToParts(date).find((p) => p.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  },
};

const fakeContentService = {
  MimeType: { JSON: 'application/json' },
  createTextOutput(content) {
    return {
      mimeType: null,
      setMimeType(type) {
        this.mimeType = type;
        return this;
      },
      getContent: () => content,
    };
  },
};

export function loadGas(globals = {}) {
  const context = vm.createContext({
    console,
    Utilities: fakeUtilities,
    ContentService: fakeContentService,
    ...globals,
  });
  for (const file of GAS_FILES) {
    const source = readFileSync(new URL(`../gas/${file}`, import.meta.url), 'utf8');
    vm.runInContext(source, context, { filename: file });
  }
  return context;
}

// A sheet holding rows of values, header first, with the slice of the
// Sheet API the scripts use.
function fakeSheet(rows) {
  return {
    rows,
    getDataRange: () => ({ getValues: () => rows.map((row) => [...row]) }),
    getRange: (row, column, numRows, numColumns) => ({
      setValues(values) {
        if (values.length !== numRows || values[0].length !== numColumns) {
          throw new Error('setValues size does not match the range');
        }
        values.forEach((rowValues, r) => {
          const target = rows[row - 1 + r] || (rows[row - 1 + r] = []);
          rowValues.forEach((value, c) => {
            target[column - 1 + c] = value;
          });
        });
      },
    }),
    appendRow: (values) => rows.push([...values]),
  };
}

export const TOKEN = 'secret-token';

// A spreadsheet laid out the way init leaves it, with settings filled in.
export function fakeSpreadsheet(gas) {
  const SHEETS = vm.runInContext('SHEETS', gas);
  const tabs = {
    [SHEETS.daily.name]: fakeSheet([SHEETS.daily.headers]),
    [SHEETS.weeks.name]: fakeSheet([SHEETS.weeks.headers]),
    [SHEETS.settings.name]: fakeSheet([
      SHEETS.settings.headers,
      ['profiles', 'J,R'],
      ['weekly_target', 15],
      ['payout_per_person', 100],
      ['currency', 'kr'],
      ['token', TOKEN],
    ]),
  };
  return {
    getSheetByName: (name) => tabs[name] || null,
    daily: () => tabs[SHEETS.daily.name].rows.slice(1),
    weeks: () => tabs[SHEETS.weeks.name].rows.slice(1),
  };
}

export function fakeLock({ available = true } = {}) {
  return { tryLock: () => available, releaseLock: () => {} };
}
