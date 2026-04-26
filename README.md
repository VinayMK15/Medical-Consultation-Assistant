# Medical Consultation Assistant (MedAssist)

MedAssist is an AI-powered medical routing platform. It uses natural language processing to understand a patient's symptoms and location (in multiple languages), and matches them with verified doctors nearby.

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

## 🛠️ Key Features Built
- **Multi-language Support:** Automatically detects the user's language (Hindi, Tamil, French, etc.), translates to English for NLP processing, and translates the reply back to the native language.
- **Robust NLP:** Uses a local Llama3 model to extract symptoms and city/area. Includes a regex/dictionary fallback mechanism for when the AI is offline.
- **Modular Dashboard:** Interactive map, clean chat UI with independent scrolling, and a dedicated user profile section.
- **Role-Based Access Control:** Strict separation of Patient, Doctor, and Admin portals using JWT authentication.
