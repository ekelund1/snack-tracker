// Sets up the spreadsheet for the tracker. Run once from the Apps Script editor.
// Safe to re-run: it only adds what is missing and never overwrites values.
function init() {
  const ss = SpreadsheetApp.getActive();
  ss.setSpreadsheetTimeZone(TIME_ZONE);
  Object.values(SHEETS).forEach((spec) => ensureSheet_(ss, spec));

  // Plain text, so 'YYYY-MM-DD' stays a string instead of becoming a Date
  // that Apps Script reads back shifted by time zone.
  ss.getSheetByName(SHEETS.daily.name).getRange('A:A').setNumberFormat('@');
  ss.getSheetByName(SHEETS.weeks.name).getRange('A:A').setNumberFormat('@');

  ensureSettings_(ss.getSheetByName(SHEETS.settings.name));
  ensureWeeklyTrigger_();
  console.log('Init done. The token is in ' + SHEETS.settings.name + '.');
}

// Finalizes ended weeks every Monday between 03:00 and 04:00 (the project's
// time zone is Stockholm), late enough that Sunday's last taps count.
function ensureWeeklyTrigger_() {
  const exists = ScriptApp.getProjectTriggers().some((trigger) => trigger.getHandlerFunction() === 'finalizeWeeks');
  if (!exists) {
    ScriptApp.newTrigger('finalizeWeeks').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(3).create();
  }
}

// Creates the tab with its header row, or checks that an existing tab's
// headers match, so the API never writes into misaligned columns.
function ensureSheet_(ss, spec) {
  const sheet = ss.getSheetByName(spec.name) || ss.insertSheet(spec.name);
  const headerRange = sheet.getRange(1, 1, 1, spec.headers.length);

  if (sheet.getLastRow() === 0) {
    headerRange.setValues([spec.headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return;
  }

  const existing = headerRange.getValues()[0];
  if (existing.join() !== spec.headers.join()) {
    throw new Error(spec.name + ' has unexpected headers: ' + existing.join(', '));
  }
}

// Appends missing default settings, and a generated token if there is none.
function ensureSettings_(sheet) {
  // Plain text, so a hex token like '12e4...' isn't parsed as a number.
  sheet.getRange('B:B').setNumberFormat('@');

  const lastRow = sheet.getLastRow();
  const keys = lastRow > 1
    ? sheet.getRange(2, 1, lastRow - 1, 1).getValues().map((row) => row[0])
    : [];

  const missing = DEFAULT_SETTINGS.filter(([key]) => !keys.includes(key));
  if (!keys.includes('token')) {
    missing.push(['token', Utilities.getUuid().replace(/-/g, '')]);
  }

  if (missing.length > 0) {
    sheet.getRange(lastRow + 1, 1, missing.length, 2).setValues(missing);
  }
}
