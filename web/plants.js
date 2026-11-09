import { createApi } from './api.js';
import { pop } from './celebrate.js';
import { API_URL } from './config.js';
import { burst } from './confetti.js';
import { stockholmDate } from './day.js';
import { onLongPress } from './longpress.js';
import {
  AMOUNTS,
  AMOUNT_GUIDE,
  PRESETS,
  boardOrder,
  dayLabel,
  everyDays,
  nextWatering,
  plantStatus,
  seasonOf,
  statusLabel,
  unwaterPlant,
  waterPlant,
} from './plant.js';
import { createStore } from './store.js';

// Plant-Life: the shared watering board. Token and profile come from the
// snack page's setup, kept in the same localStorage.

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

const profileLabel = document.getElementById('profile');
const seasonLabel = document.getElementById('season');
const board = document.getElementById('board');
const emptyNote = document.getElementById('empty');
const boardHint = document.getElementById('board-hint');
const amountGuide = document.getElementById('amount-guide');
const details = {
  dialog: document.getElementById('details-dialog'),
  title: document.getElementById('details-title'),
  status: document.getElementById('details-status'),
  amount: document.getElementById('details-amount'),
  amountGuide: document.getElementById('details-amount-guide'),
  schedule: document.getElementById('details-schedule'),
  last: document.getElementById('details-last'),
  next: document.getElementById('details-next'),
  notesLabel: document.getElementById('details-notes-label'),
  notes: document.getElementById('details-notes'),
  edit: document.getElementById('details-edit'),
  close: document.getElementById('details-close'),
};
const addButton = document.getElementById('add-plant');
const dialog = document.getElementById('plant-dialog');
const form = document.getElementById('plant-form');
const formTitle = document.getElementById('plant-form-title');
const removeButton = document.getElementById('remove-plant');
const cancelButton = document.getElementById('cancel-plant');

const DROPS = { light: '💧', moderate: '💧💧', soak: '💧💧💧' };
const WATER_COLORS = ['#19e6c1', '#6fffe0', '#2ef2ff', '#3dff8c', '#b6ff3b'];
const DEFAULT_EMOJI = '🪴';

const today = () => stockholmDate(new Date());

// The plant being edited in the dialog, or null for a new one.
let editing = null;

function render() {
  const date = today();
  seasonLabel.textContent =
    seasonOf(date) === 'summer' ? '☀️ Sommar: växterna dricker mer' : '❄️ Vinter: vattna mer sällan';

  const plants = boardOrder(store.getPlants(), date);
  board.replaceChildren(...plants.map((plant) => createCard(plant, plantStatus(plant, date))));
  emptyNote.hidden = plants.length > 0;
  boardHint.hidden = plants.length === 0;
}

// Due plants can be tapped to water them. The others are disabled; one
// watered today can still be undone. Holding any card opens its details.
// Disabled is aria-disabled, not the disabled attribute, because a disabled
// button gets no touch events and so couldn't be held.
function createCard(plant, status) {
  const item = document.createElement('li');
  item.className = 'plant';
  item.dataset.state = status.state;
  item.dataset.id = plant.id;

  const water = document.createElement('button');
  water.type = 'button';
  water.className = 'plant-water';
  water.setAttribute('aria-disabled', String(status.state !== 'due'));
  water.append(
    span('plant-emoji', plant.emoji || DEFAULT_EMOJI),
    span('plant-name', plant.name),
    span('plant-status', status.state === 'due' ? `${DROPS[plant.amount]} ${statusLabel(plant, status)}` : statusLabel(plant, status)),
  );
  onLongPress(water, () => openDetails(plant));
  water.addEventListener('click', () => {
    if (status.state === 'due') onWater(plant);
  });

  const edit = document.createElement('button');
  edit.type = 'button';
  edit.className = 'plant-edit';
  edit.textContent = '✎';
  edit.setAttribute('aria-label', `Ändra ${plant.name}`);
  edit.addEventListener('click', () => openDialog(plant));

  item.append(water, edit);

  if (status.state === 'watered') {
    const undo = document.createElement('button');
    undo.type = 'button';
    undo.className = 'plant-undo';
    undo.textContent = 'Ångra';
    undo.addEventListener('click', () => onUnwater(plant));
    item.append(undo);
  }
  return item;
}

function span(className, text) {
  const element = document.createElement('span');
  element.className = className;
  element.textContent = text;
  return element;
}

// Changes the local board at once, then sends the change. The board is
// reloaded from the server once the change has landed.
let pendingWrites = 0;
let localChanges = 0;

async function change(plants, action, fields) {
  localChanges += 1;
  store.savePlants(plants);
  render();

  pendingWrites += 1;
  const sent = await api.sendPlant(store.getToken(), action, fields);
  pendingWrites -= 1;
  if (sent) refresh();
}

function replacePlant(updated) {
  return store.getPlants().map((plant) => (plant.id === updated.id ? updated : plant));
}

function onWater(plant) {
  const watered = waterPlant(plant, today(), store.getProfile());
  change(replacePlant(watered), 'water', { id: plant.id, profile: store.getProfile() });
  celebrateWatering(plant.id);
}

function onUnwater(plant) {
  change(replacePlant(unwaterPlant(plant, today())), 'unwater', { id: plant.id });
}

function celebrateWatering(id) {
  if (navigator.vibrate) navigator.vibrate(25);
  const card = board.querySelector(`[data-id="${CSS.escape(id)}"]`);
  if (!card) return;
  pop(card);
  const rect = card.getBoundingClientRect();
  burst(rect.left + rect.width / 2, rect.top + rect.height / 2, { count: 30, colors: WATER_COLORS });
}

// Reloads the board. A reply that started before a local change, or arrives
// while one is still being sent, is older than the screen and is dropped.
async function refresh() {
  const changesBefore = localChanges;
  let reply;
  try {
    reply = await api.fetchPlants(store.getToken());
  } catch {
    return; // Offline: keep showing the last board.
  }

  if (reply.error === 'unauthorized') {
    store.clearToken();
    location.replace('index.html');
    return;
  }
  if (!reply.ok || pendingWrites > 0 || changesBefore !== localChanges) return;

  store.savePlants(reply.plants);
  render();
}

// Details

// Everything about one plant: how much and how to water it, how often, when
// it was and will be watered, and its notes.
function openDetails(plant) {
  if (navigator.vibrate) navigator.vibrate(15);
  const date = today();
  const status = plantStatus(plant, date);

  details.title.textContent = `${plant.emoji || DEFAULT_EMOJI} ${plant.name}`;
  details.status.textContent = status.state === 'due' ? 'Dags att vattna' : statusLabel(plant, status);
  details.amount.textContent = `${DROPS[plant.amount]} ${AMOUNTS[plant.amount]}`;
  details.amountGuide.textContent = AMOUNT_GUIDE[plant.amount];
  const now = (season) => (seasonOf(date) === season ? ' (nu)' : '');
  details.schedule.textContent =
    `☀️ Sommar: ${everyDays(plant.summer_days)}${now('summer')} · ` +
    `❄️ Vinter: ${everyDays(plant.winter_days)}${now('winter')}`;
  details.last.textContent = plant.last_watered
    ? `${dayLabel(plant.last_watered, date)}${plant.last_watered_by ? ` av ${plant.last_watered_by}` : ''}`
    : 'Aldrig';
  details.next.textContent = dayLabel(nextWatering(plant, date), date);
  details.notes.textContent = plant.notes || '';
  details.notes.hidden = !plant.notes;
  details.notesLabel.hidden = !plant.notes;

  details.edit.onclick = () => {
    details.dialog.close();
    openDialog(plant);
  };
  details.dialog.showModal();
}

details.close.addEventListener('click', () => details.dialog.close());

// Adding and editing

function showAmountGuide() {
  amountGuide.textContent = AMOUNT_GUIDE[form.elements.amount.value] || '';
}

function fillPresets() {
  const choose = new Option('Välj typ för förslag…', '');
  form.elements.preset.replaceChildren(choose, ...PRESETS.map((preset) => new Option(preset.label, preset.key)));
}

function applyPreset(key) {
  const preset = PRESETS.find((candidate) => candidate.key === key);
  if (!preset) return;
  form.elements.amount.value = preset.amount;
  form.elements.summer_days.value = preset.summer_days;
  form.elements.winter_days.value = preset.winter_days;
}

function openDialog(plant) {
  editing = plant;
  form.reset();
  formTitle.textContent = plant ? 'Ändra växt' : 'Ny växt';
  removeButton.hidden = !plant;

  if (plant) {
    form.elements.emoji.value = plant.emoji;
    form.elements.name.value = plant.name;
    form.elements.amount.value = plant.amount;
    form.elements.summer_days.value = plant.summer_days;
    form.elements.winter_days.value = plant.winter_days;
    form.elements.notes.value = plant.notes || '';
  } else {
    form.elements.emoji.value = DEFAULT_EMOJI;
    form.elements.preset.value = PRESETS[0].key;
    applyPreset(PRESETS[0].key);
  }
  showAmountGuide();
  dialog.showModal();
}

function savePlantFromForm() {
  const fields = {
    id: editing ? editing.id : crypto.randomUUID(),
    name: form.elements.name.value.trim(),
    emoji: form.elements.emoji.value.trim() || DEFAULT_EMOJI,
    amount: form.elements.amount.value,
    summer_days: Number(form.elements.summer_days.value),
    winter_days: Number(form.elements.winter_days.value),
    notes: form.elements.notes.value.trim(),
  };
  const plants = editing
    ? replacePlant({ ...editing, ...fields })
    : [...store.getPlants(), { ...fields, last_watered: '', last_watered_by: '', previous_watered: '' }];
  change(plants, 'plant', fields);
}

addButton.addEventListener('click', () => openDialog(null));
cancelButton.addEventListener('click', () => dialog.close());
form.elements.preset.addEventListener('change', (event) => {
  applyPreset(event.target.value);
  showAmountGuide();
});
form.querySelectorAll('[name="amount"]').forEach((radio) => radio.addEventListener('change', showAmountGuide));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  savePlantFromForm();
  dialog.close();
});

removeButton.addEventListener('click', () => {
  if (!editing || !confirm(`Ta bort ${editing.name}?`)) return;
  const id = editing.id;
  change(
    store.getPlants().filter((plant) => plant.id !== id),
    'remove_plant',
    { id },
  );
  dialog.close();
});

// Reopening the app shows the other phone's latest waterings, and moves on
// to the new day if it was left open past midnight.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  render();
  refresh();
});

if (!store.getToken() || !store.getProfile()) {
  // Setup (code and profile) happens on the snack page.
  location.replace('index.html');
} else {
  profileLabel.textContent = store.getProfile();
  fillPresets();
  render();
  refresh();
}
