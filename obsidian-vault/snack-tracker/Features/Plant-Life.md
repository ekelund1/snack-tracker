---
status: in progress
updated: 2026-11-09
---

# Feature: Plant-Life

**Why:** J and R's houseplants die from too much or too little water. They need one shared board that says which plants to water today, and how much.

**What:**
- `plants.html`, reached from a "🌿 Plant-Life" button on the snack page. Cyan, green and black.
- A card per plant. A due plant can be tapped to water it and shows how much: Lite, Måttligt or Blötlägg. Others are disabled with "Vattna om x dagar".
- Holding any card, disabled or not, opens its details: how to give that amount, how often in each season, last and next watering, and notes.
- One board for both: a plant watered on one phone shows "Vattnad idag av R" on the other.
- Today's watering can be undone ("Ångra") until midnight, by either profile.
- Add, edit and remove plants: emoji, name, amount, days between waterings in summer and winter, and free-text notes.

**How:** Same architecture as the snack tracker: one `Plant_Plants` tab, routed through the existing Apps Script API (`gas/PlantLife.js`), same token, lock and profiles. Each plant row holds its last and previous watering. The frontend works out what is due (`web/plant.js`) and caches the board in localStorage.

**Decisions:**
- Two intervals per plant, summer (April–September) and winter (October–March), picked by today's date. A guideline for ordinary houseplants in southern Sweden, not a care manual (2026-11-09).
- Presets prefill a new plant (leafy, thirsty, hardy, succulent, orchid, small pot); every value stays editable (2026-11-09).
- Keep only the last and previous watering, not a log. Enough to undo today's, and no history is needed yet (2026-11-09).
- The server, not the phone, decides the date and applies water/unwater under the lock. Watering a plant already watered today is a no-op, so two phones tapping count once, by whoever was first (2026-11-09).
- Removing a plant marks its row `removed`; the row stays (2026-11-09).
- The client makes the plant id, so a retried "add" doesn't create a duplicate (2026-11-09).
- Setup (code, profile) stays on the snack page; the plant page sends you there if it's missing (2026-11-09).
- Our known plants are `DEFAULT_PLANTS` in `gas/Schema.js`, added by `init` under fixed ids when missing, like the default settings. A plant edited, watered or removed in the app is never reset. Estimates: svärmorstunga måttligt 14/30 days (rot is the risk, so winter is long), fjärilsorkidé blötlägg 7/10 days (check the roots: silvery means water). Init also fills in a default plant's notes when they are empty (2026-11-09).
- The three amounts are defined in `AMOUNT_GUIDE` (`web/plant.js`). Lite: a splash that only moistens the surface. Måttligt: water over all the soil until it starts draining, empty the outer pot after 15 minutes. Blötlägg: stand the inner pot in room-temperature water for 10–15 minutes, drain fully, then back in the outer pot. Not the shower or the tap. "Genomvattna" was renamed "Blötlägg", since it read as Måttligt (2026-11-09).
- Cards that can't be watered are `aria-disabled`, not `disabled`: a disabled button gets no touch events, so it couldn't be held (2026-11-09).
- `init` appends columns added to the end of a tab's spec (here `notes`) instead of refusing the tab, so a live sheet upgrades by re-running it. Columns are only ever added at the end (2026-11-09).

**Don't:**
- No photos, no automatic plant identification. Jonathan will send photos to identify the plants by hand.
- No watering history, reminders or notifications.
- No offline queue: a watering made offline shows locally, then reverts on the next refresh if it never reached the server.

**Must stay true:**
- A plant watered today is disabled on both phones after a refresh.
- Undo only reaches today's watering, and restores the one before.
- Plant actions never change the snack tracker's state.
- Holding a card never waters it.

**Revisit when:** the plants are identified (set real intervals), a plant needs more than two seasons, or a history of waterings becomes useful.
