# Devlog — 22 August 2026
## Location Feature: Profile Edit & Dashboard Switcher

**Day type:** Frontend  
**Focus area:** Patient location management — end-to-end

---

### What shipped

#### 1. Patient Profile — Edit Mode (`PersonalInfo.jsx`)

The profile page finally has a real edit mode instead of static read-only text.

- **City dropdown** — 7 major Indian cities selectable via a `<select>` element.
- **Free-text area / address field** — lets patients enter their full street address or neighbourhood alongside the city.
- **Instant feedback** — on save, `updateUserSession()` (from `AuthContext`) is called to patch the in-memory session so the UI reflects the new values immediately, without a full page reload.

No more round-trip reloads just to confirm a city change went through.

---

#### 2. Dashboard Location Switcher

The biggest UI piece this week. Sits at the top of the chat interface and lets patients declare their location context before starting an AI consultation. Three modes:

| Mode | How it works |
|------|-------------|
| **Home** | Reads `city` / `address` straight from the saved profile |
| **Live GPS** | Calls `navigator.geolocation.getCurrentPosition()` for real-time browser coordinates |
| **Typed** | Inline text input — any city or neighbourhood the patient wants to search around |

Whichever mode is active, the resolved coordinates are injected into every `/process` request payload so the backend's doctor-ranking logic always has the right origin point to sort by distance.

---

### Why this matters

Doctor recommendations are distance-ranked, so a wrong or missing location meant patients were getting results sorted from the wrong city. This closes that gap entirely — the location is always explicit, always fresh, and always flows through to the AI.

---

### Files touched

- `frontend/src/pages/PersonalInfo.jsx` — edit mode, city dropdown, address field, `updateUserSession()` call
- `frontend/src/context/AuthContext.jsx` — `updateUserSession()` helper
- `frontend/src/pages/Dashboard.jsx` — location switcher component, GPS handler, `/process` payload injection

---

### Notes / follow-up

- City list is currently hardcoded to 7 cities; consider pulling from a config or API later.
- GPS mode should show a loading spinner while the Geolocation API is resolving — tracked for next sprint.
- Error handling for GPS permission denied needs a user-facing message.
