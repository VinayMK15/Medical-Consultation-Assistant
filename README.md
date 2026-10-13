# MedAssist — Medical Consultation Assistant

## Overview

MedAssist is a symptom-based specialist routing platform that helps patients find the right medical specialist near them. Users describe their symptoms in natural language, and the system uses NLP to match them with relevant doctors based on their location and specialty.

**Who it's for:** Patients seeking specialist care, doctors managing their practice, and administrators overseeing platform operations.

**The problem it solves:** Patients often don't know which specialist to visit for their symptoms. MedAssist bridges this gap by intelligently routing users to the right care.

---

## Features

- **Symptom-Based Specialist Routing** — NLP-powered analysis of user symptoms to recommend relevant medical specialties
- **Interactive Map** — Leaflet-powered map showing nearby doctors with route visualization
- **Role-Based Portals** — Separate dashboards for Patients, Doctors, and Administrators
- **Appointment Booking** — Real-time slot selection with conflict prevention
- **Multi-Language Support** — Language detection and translation capabilities
- **Accessibility** — WCAG compliant with ARIA labels, keyboard navigation, and reduced motion support
- **Responsive Design** — Mobile-first layout that works across all devices

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, Tailwind CSS 4, React Router v7 |
| Backend | FastAPI, SQLAlchemy ORM, SQLite |
| Maps | Leaflet + OpenStreetMap |
| Auth | JWT + bcrypt |
| HTTP Client | Axios |

---

## Project Structure

```
medical-consultation-assistant/
├── backend/                    # FastAPI Python backend
│   ├── main.py                 # API entrypoint, NLP routing, doctor search
│   ├── database.py             # SQLAlchemy engine/session
│   ├── models.py               # ORM models (User, Doctor, Admin, etc.)
│   ├── schemas.py              # Pydantic schemas
│   ├── auth_utils.py           # JWT authentication
│   ├── limiter.py              # Rate limiting (SlowAPI)
│   ├── routers/                # API route modules
│   │   ├── auth.py             # /api/auth/*
│   │   ├── doctor.py           # /api/doctor/*
│   │   ├── patient.py          # /api/patient/*
│   │   ├── appointments.py     # /api/appointments/*
│   │   └── admin.py            # /api/admin/*
│   ├── services/               # Business logic
│   │   ├── nlp_processor.py    # Medical NLP extraction
│   │   ├── geo.py              # Geocoding/coordinates
│   │   ├── email_service.py    # Email notifications
│   │   └── translator_logic.py # Language detection/translation
│   ├── migrations/             # Alembic DB migrations (single baseline)
│   ├── scripts/                # Loaders, seeders, backup, maintenance
│   ├── tests/                  # pytest suite
│   ├── pyproject.toml          # ruff + mypy configuration
│   ├── requirements.txt        # Runtime dependencies
│   ├── requirements-dev.txt    # Test and lint tooling
│   └── seed.py                 # Sample data seeder
├── frontend/                   # React SPA
│   ├── public/                 # Static assets (favicon, hero image, sitemap, robots)
│   └── src/
│       ├── main.jsx            # React entry point
│       ├── App.jsx             # Router + route definitions
│       ├── index.css           # Tailwind + custom theme
│       ├── shared/             # Shared components/utils
│       │   ├── components/     # UI components (AppShell, AuthShell, Footer, etc.)
│       │   ├── context/        # AuthContext (React Context)
│       │   ├── hooks/          # useSessionTimeout
│       │   ├── utils/          # api.js, datetime, calendar, consultation
│       │   └── constants/      # cities, specializations
│       └── features/           # Feature modules
│           ├── auth/           # Login, Signup, DoctorLogin, etc.
│           ├── patient/        # Dashboard, Profile
│           ├── doctor/         # DoctorDashboard, tabs
│           ├── admin/          # AdminDashboard, management
│           ├── contact/        # Contact page with FAQ
│           └── error/          # ServerError page
├── docs/                       # Documentation
├── data/                       # Data files
├── .github/workflows/ci.yml    # CI: lint, types, tests, build
├── .pre-commit-config.yaml     # Local pre-commit hooks
└── README.md                   # This file
```

---

## Setup Instructions

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm or yarn

### Backend Setup

```bash
cd backend
pip install -r requirements.txt
```

Copy `backend/.env.example` to `backend/.env` and fill in the values. `SECRET_KEY`
is required — the backend refuses to start without it, so a placeholder or a
missing value is an error rather than a warning:

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

Then create the schema and start the server:

```bash
alembic upgrade head
python main.py
```

The API will be available at `http://localhost:8000`.

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

### Production Build

```bash
cd frontend
npm run build
npm run preview
```

---

## Development

### Tests

```bash
cd backend
pytest                                    # 199 tests, ~35s
pytest --cov=. --cov-report=term-missing  # with coverage
```

Each test runs against a throwaway SQLite file in a temp directory — the dev
database is never touched. `conftest.py` sets `DATABASE_URL` before anything
imports the engine, which is what makes that work.

### Linting and types

```bash
cd backend
ruff check .     # lint
ruff check --fix .   # lint and autofix
mypy             # type check
```

Both are configured in `backend/pyproject.toml`.

### All checks at once

```bash
cd backend
python scripts/ci_check.py
```

Runs ruff, mypy and pytest in the order CI does.

### Pre-commit

```bash
pip install pre-commit
pre-commit install
```

Runs the same lint checks plus whitespace, encoding and merge-conflict guards on
every commit.

### Migrations

```bash
cd backend
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

Data loaders and seeders live in `backend/scripts/` and are not migrations —
see `backend/scripts/README.md`.

### Database maintenance

```bash
cd backend
python scripts/backup_db.py            # consistent snapshot via the backup API
python scripts/maintenance.py          # WAL checkpoint + incremental vacuum
python scripts/maintenance.py --status # report settings, change nothing
```

### CI

`.github/workflows/ci.yml` runs ruff, mypy, a migration check against an empty
database, and the test suite on every push. The frontend job runs lint and build.

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Patient registration |
| POST | `/api/auth/login` | Patient login |
| POST | `/api/auth/doctor/signup` | Doctor registration |
| POST | `/api/auth/doctor/login` | Doctor login |
| GET | `/api/doctor/search` | Search doctors by specialty/location |
| GET | `/api/patient/appointments` | Get patient appointments |
| POST | `/api/appointments/book` | Book an appointment |
| GET | `/api/admin/doctors` | List all doctors (admin) |
| GET | `/api/admin/patients` | List all patients (admin) |

---

## Roles & Access

| Role | Access |
|---|---|
| Patient | Dashboard, symptom chat, map, booking, profile |
| Doctor | Doctor dashboard, schedule management, patient queue, prescriptions |
| Admin | Verification queue, doctor/patient management, platform stats |

---

## Security

- JWT token-based authentication with expiry
- Bcrypt password hashing
- Rate limiting via SlowAPI
- CORS with restricted origins
- Protected routes (frontend + backend)
- Session timeout (30 min inactivity)
- SQL injection prevention via SQLAlchemy ORM
- Double-booking prevention (partial unique index, excluding cancelled slots)
- Fail-fast on a missing or placeholder `SECRET_KEY` — the backend will not start
- Stateless JWTs keyed on account id, revocable via a `token_version` counter
- bcrypt password hashing with an explicit work factor

See `docs/database_schema.md` for the schema, token claims and revocation model.

---

## SEO & Performance

- Dynamic page titles and meta descriptions via `react-helmet-async`
- Semantic HTML with proper heading hierarchy
- Lazy loading for heavy components via `React.lazy()`
- Error boundary for graceful error handling
- Custom 404 and 500 error pages
- Sitemap.xml and robots.txt for search engine discovery
- Optimized images (WebP format, SVG icons)
- Tailwind CSS purges unused styles in production

---

## Accessibility

- WCAG AA compliant color contrast
- ARIA labels on all interactive elements
- Keyboard navigation support (Tab, Enter, Escape)
- Focus management and visible focus rings
- `prefers-reduced-motion` media query support
- Semantic HTML elements (`header`, `nav`, `main`, `aside`, `section`)
- Form labels associated with inputs
- Error messages announced to screen readers

---

## License

MIT
