# Devlog — 06 October 2026
## Patient Portal Upgrade

**Day type:** Frontend  
**Focus area:** Consultation chat, booking flow, and profile

---

### What shipped

#### 1. Consultation workspace (`Dashboard.jsx`)

The AI triage chat gained real voice input, text-to-speech replies, and route drawing between the patient and recommended doctors.

- **VoiceInputModal** — `SpeechRecognition` with live interim transcript, language switcher (Hindi, Tamil, Telugu and more), and a clear unsupported-browser message.
- **Read-aloud** — `speechSynthesis` speaks the AI's reply, with a play/stop toggle that cancels cleanly on unmount.
- **Route preview** — draws a GeoJSON line from patient to doctor and fetches distance / ETA from OSRM.

---

#### 2. Booking and history

Booking now groups slots by morning / afternoon / evening and validates symptoms before submit. `AppointmentHistory.jsx` gained status filters, search, date range, and a two-step cancel confirmation that surfaces the server's error message.

---

#### 3. Settings (`Profile/Settings.jsx`)

Appointment email preferences persist via `/api/patient/settings`, and password reset moved to a 6-digit emailed code instead of a long URL token.

---

### Files touched

- `frontend/src/features/patient/Dashboard.jsx`
- `frontend/src/features/patient/components/VoiceInputModal.jsx`
- `frontend/src/features/patient/Profile/AppointmentHistory.jsx`
- `frontend/src/features/patient/Profile/Settings.jsx`

---

### Notes / follow-up

- Voice input depends on Chrome / Edge; Firefox users see the fallback message.
- Appointment history loads all rows client-side — needs pagination past a few hundred records.