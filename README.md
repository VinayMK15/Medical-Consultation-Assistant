# Medical Consultation Assistant (MedAssist)

MedAssist is a web-based medical consultation platform that simplifies the process of finding the right doctor by automating symptom analysis and specialist routing. Patients describe their symptoms in natural language through a conversational chat interface, which is processed by a three-tier AI pipeline using Ollama, Google Gemini and a regex fallback to extract medical intent. The system maps symptoms across sixteen specializations and recommends verified, proximity-ranked doctors on an interactive Leaflet map. Built on React, FastAPI and SQLite, the platform supports three isolated role-based portals for Patients, Doctors and Administrators, secured with JWT authentication. Doctors undergo admin verification before being listed, ensuring platform trust. Additional features include slot-based appointment booking, shift scheduling, vacation management and multilingual input support.

## 🚀 Getting Started

### 1. Backend (FastAPI + SQLite + Ollama)
The backend uses FastAPI, SQLAlchemy (SQLite), and a local Ollama Llama 3 model for NLP extraction.

1. Open a terminal and navigate to the `backend` folder.
2. Install dependencies (if you haven't):
   ```bash
   pip install -r ../requirements.txt
   ```
3. Start the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   *(The server will be running at `http://127.0.0.1:8000`)*

### 2. Frontend (React + Vite + Tailwind CSS)
The frontend uses React, Vite, and Tailwind CSS for a modern, responsive UI.

1. Open a new terminal and navigate to the `frontend` folder.
2. Install dependencies (if you haven't):
   ```bash
   npm install
   ```
3. Start the frontend development server:
   ```bash
   npm run dev
   ```
   *(The app will be running at `http://localhost:5173`)*

---

## 🔑 Sample Accounts

We have included a seed script to quickly populate the database with test accounts.

To create these accounts, run the following from the `backend` folder:
```bash
python seed.py
```

This will create the following sample accounts:

### 1. Patient Portal (`/login`)
- **Email:** `patient@medassist.com`
- **Password:** `patient123`
- **Features:** AI Chatbot symptom triage, Map-based doctor discovery, Profile settings, Appointment History.

### 2. Doctor Portal (`/doctor/login`)
- **Email:** `doctor@medassist.com`
- **Password:** `doctor123`
- **Features:** Manage incoming patient appointments, mark appointments as completed.

### 3. Admin Portal (`/admin/login`)
- **Email:** `admin@medassist.com`
- **Password:** `admin123`
- **Features:** Verify newly registered doctors so they appear in patient searches.

---

## Key Features

### 🤖 AI-Powered Symptom Analysis
- 3-tier NLP pipeline: Ollama (LLaMA3) → Google Gemini → Regex fallback
- Extracts symptoms, city and area from natural language input
- Auto-learns new symptoms and persists them across sessions
- Multilingual input with automatic language detection and translation

### 🗺️ Smart Doctor Discovery
- Symptom-to-specialization routing across 16 medical domains
- Haversine-based proximity sorting — nearest doctor always appears first
- Interactive Leaflet map with matched doctors highlighted as blue pins
- All available doctors shown as background grey pins on page load
- Three location modes — Live GPS, Saved Home Address, Typed in Chat

### 👥 Role-Based Access Control
- Three fully isolated portals — Patient, Doctor, Admin
- JWT authentication with protected routes on frontend and backend
- Session timeout management and rate limiting on all API endpoints
- Password reset via email with secure token validation

### 👨‍⚕️ Doctor Verification Workflow
- Doctors self-register and remain inactive until Admin approves
- Admin can approve or reject pending doctor registrations
- Only verified doctors are discoverable by patients
- Admin can create, update and delete any user account

### 📅 Appointment & Scheduling System
- Slot-based booking with 30-minute appointment windows
- Real-time available slot generation based on doctor shift hours
- Double-booking protection at both application and database level
- Appointment cancellation with email notification to both parties
- Doctor vacation and blockout date management
- Patient appointment history with status tracking

### 🏥 Doctor Dashboard
- Incoming appointment queue with patient symptom summaries
- Shift schedule management (start and end time configuration)
- Calendar view of upcoming bookings
- Vacation mode with date range blockouts
- Prescription notes on completed appointments

### ⚙️ Admin Control Panel
- Platform-wide stats — pending doctors, active doctors, total patients
- Approve or reject pending doctor registrations
- Full user management — create, edit and delete any account
- Filter users by role and verification status

### 🛡️ Security & Reliability
- Bcrypt password hashing
- JWT token-based authentication on every protected route
- Rate limiting via SlowAPI to prevent abuse
- Database-level unique constraint preventing race condition double bookings
- TTL-based session store with automatic expiry after 30 minutes
- Alembic database migrations for safe schema versioning
- Background email tasks for booking and cancellation notifications

### 🧱 Architecture
- React + Vite frontend with Tailwind CSS
- FastAPI Python backend with modular router structure
- SQLite database managed via SQLAlchemy ORM
- Alembic for database migrations
- Three-tier NLP: Ollama → Gemini → Regex
- Leaflet.js interactive maps with OpenStreetMap tiles
