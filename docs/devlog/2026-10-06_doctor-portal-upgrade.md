# Devlog — 06 October 2026
## Doctor Portal Upgrade

**Day type:** Frontend  
**Focus area:** Doctor dashboard, queue workflow, and schedule manager

---

### What shipped

#### 1. Queue workspace (`DoctorDashboard.jsx`)

The dashboard is now a clinical workspace rather than a flat appointment list.

- **Searchable queue** — filter by patient name or reported symptoms; narrow by all / waiting / done.
- **Tabbed patient panel** — symptoms, prescription, and notes in one drawer instead of page hops.
- **Unread tracking** — a `viewedIds` set marks cards as seen so nothing slips past unnoticed.
- **Completion flow** — closing a consultation PATCHes the prescription notes back and advances queue state.
- Dedicated loading, empty, and API-error screens replace the previous blank panel.

---

#### 2. Schedule manager hardening (`ScheduleManager.jsx`)

Slot previews now read the doctor's real `slot_duration_minutes` instead of assuming 30, so a 15 or 45-minute doctor sees an accurate preview.

Before saving a shortened shift, the component diffs existing appointments against the new window, lists every booking that would be orphaned, and requires explicit confirmation.

---

### Files touched

- `frontend/src/features/doctor/DoctorDashboard.jsx` — queue filters, search, patient panel tabs, completion
- `frontend/src/features/doctor/QueueCard.jsx` — viewed / unread card state
- `frontend/src/features/doctor/components/ScheduleManager.jsx` — real slot duration, orphan-booking guard

---

### Notes / follow-up

- Prescription notes autosave is still manual; a debounced draft save would protect against accidental tab closes.
- Queue refresh is a manual pull — consider polling or a websocket push while a consultation is open.