---
status: in progress
updated: 2026-11-09
---

# Feature: Plant-Life

**Why:** J and R's houseplants die from too much or too little water. They need one shared board that says which plants to water today, and how much.

**What:**
- `plants.html`, reached from a "🌿 Plant-Life" button on the snack page. Cyan, green and black.
- A card per plant. A due plant can be tapped to water it and shows how much: Lite, Måttligt or Genomvattna. Others are disabled with "Vattna om x dagar".
- One board for both: a plant watered on one phone shows "Vattnad idag av R" on the other.
- Today's watering can be undone ("Ångra") until midnight, by either profile.
- Add, edit and remove plants: emoji, name, amount, and days between waterings in summer and winter.

**How:** Same architecture as the snack tracker: one `Plant_Plants` tab, routed through the existing Apps Script API (`gas/PlantLife.js`), same token, lock and profiles. Each plant row holds its last and previous watering. The frontend works out what is due (`web/plant.js`) and caches the board in localStorage.

**Decisions:**
- Two intervals per plant, summer (April–September) and winter (October–March), picked by today's date. A guideline for ordinary houseplants in southern Sweden, not a care manual (2026-11-09).
- Presets prefill a new plant (leafy, thirsty, hardy, succulent, orchid, small pot); every value stays editable (2026-11-09).
- Keep only the last and previous watering, not a log. Enough to undo today's, and no history is needed yet (2026-11-09).
- The server, not the phone, decides the date and applies water/unwater under the lock. Watering a plant already watered today is a no-op, so two phones tapping count once, by whoever was first (2026-11-09).
- Removing a plant marks its row `removed`; the row stays (2026-11-09).
- The client makes the plant id, so a retried "add" doesn't create a duplicate (2026-11-09).
- Setup (code, profile) stays on the snack page; the plant page sends you there if it's missing (2026-11-09).

**Don't:**
- No photos, no automatic plant identification. Jonathan will send photos to identify the plants by hand.
- No watering history, reminders or notifications.
- No offline queue: a watering made offline shows locally, then reverts on the next refresh if it never reached the server.

**Must stay true:**
- A plant watered today is disabled on both phones after a refresh.
- Undo only reaches today's watering, and restores the one before.
- Plant actions never change the snack tracker's state.

**Revisit when:** the plants are identified (set real intervals), a plant needs more than two seasons, or a history of waterings becomes useful.
