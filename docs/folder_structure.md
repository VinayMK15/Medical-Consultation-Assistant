# Project Folder Structure

This section outlines the directory and file structure of the Medical Consultation Assistant. This structure promotes a clear separation of concerns between the backend API, the frontend user interface, and the storage of medical documentation.

```text
medical-consultation-assistant/
│
├── backend/                        # FastAPI Backend Application
│   ├── main.py                     # Wiring: lifespan, middleware, router registration,
│   │                               # plus /process and /api/doctors
│   ├── database.py                 # Engine, SQLite pragmas, transaction helpers
│   ├── models.py                   # SQLAlchemy ORM models
│   ├── schemas.py                  # Pydantic models for request/response validation
│   ├── auth_utils.py               # JWT authentication and password hashing
│   ├── limiter.py                  # Rate limiting (SlowAPI)
│   ├── utils.py                    # Time-slot generation helpers
│   ├── seed.py                     # Sample data seeder
│   ├── pyproject.toml              # ruff and mypy configuration
│   ├── pytest.ini                  # pytest configuration
│   ├── requirements.txt            # Runtime dependencies
│   ├── requirements-dev.txt        # Test and lint tooling
│   │
│   ├── routers/                    # HTTP layer, one module per feature
│   │   ├── auth.py                 # Registration, login, password reset
│   │   ├── patient.py              # Patient profile and settings
│   │   ├── doctor.py               # Doctor queue, prescriptions, schedule
│   │   ├── appointments.py         # Slot availability, booking, cancellation
│   │   ├── contact.py              # Public contact form
│   │   ├── admin.py                # Admin: account listing, create/update/delete
│   │   ├── admin_doctors.py        # Admin: verification, schedule, calendar, stats
│   │   ├── admin_taxonomy.py       # Admin: symptom mappings, specializations
│   │   └── admin_common.py         # Shared admin helpers (email uniqueness)
│   │
│   ├── services/                   # Business logic, not HTTP-shaped
│   │   ├── vocabulary.py           # Vocabularies, and how they are loaded
│   │   ├── routing.py              # Symptom -> specialty: curated + IDF-weighted
│   │   ├── doctor_search.py        # Filter, rank, cap, deduplicate doctors
│   │   ├── nlp_processor.py        # Symptom extraction, regional matching
│   │   ├── translator_logic.py     # Language detection and translation
│   │   ├── geo.py                  # Geocoding and coordinate helpers
│   │   └── email_service.py        # Transactional email
│   │
│   ├── migrations/                 # Alembic migrations (versions/ holds the baseline)
│   │
│   ├── scripts/                    # Data loaders, seeders, backup, maintenance.
│   │   │                           # NOT migrations -- see scripts/README.md
│   │   ├── backup_db.py            # Consistent snapshot via the SQLite backup API
│   │   ├── maintenance.py          # WAL checkpoint and incremental vacuum
│   │   ├── ci_check.py             # Run ruff + mypy + pytest, as CI does
│   │   └── load_* / seed_* / clear_*   # Reference data and demo fixtures
│   │
│   └── tests/                      # pytest suite (see pytest.ini)
│       ├── conftest.py             # Fixtures: temp database, record factories
│       ├── test_auth.py            # Registration, login, role separation, reset
│       ├── test_auth_hardening.py  # Token subject, revocation, secret validation
│       ├── test_appointments.py    # Booking, double-booking, the write race
│       ├── test_pragmas.py         # SQLite configuration and transaction modes
│       ├── test_migrations.py      # Migrations match the models
│       ├── test_admin.py           # Verification queue, user management
│       ├── test_doctor.py          # Queue, prescriptions, schedule, vacation
│       ├── test_patient.py         # Profile and settings
│       ├── test_nlp.py             # Symptom routing, city normalisation, /process
│       ├── test_encoding.py        # Guards against text corruption (mojibake)
│       └── test_structure.py       # Import-time DB access, route paths, layout
│
├── frontend/                       # Frontend User Interface (e.g., React/Next.js)
│   ├── src/
│   │   ├── components/             # Reusable UI components (Buttons, Modals, Forms)
│   │   ├── pages/                  # Application views (Dashboard, Login, Appointments)
│   │   ├── services/               # API client functions to communicate with the backend
│   │   ├── assets/                 # Images, icons, and static files
│   │   ├── styles/                 # Global CSS and styling tokens
│   │   └── App.js                  # Main React component and routing setup
│   │
│   ├── package.json                # Node.js dependencies and scripts
│   └── public/                     # Publicly accessible static files (index.html)
│
├── data/                           # General data storage for the application
│
├── docs/                           # Project documentation
│   ├── database_schema.md          # Schema, indexes, auth model, runtime config
│   ├── folder_structure.md         # This file
│   └── devlog/                     # Dated notes on significant changes
│
├── .github/workflows/ci.yml        # CI: lint, types, migrations, tests, build
├── .pre-commit-config.yaml         # Pre-commit hooks
├── .gitignore                      # Untracked files to ignore
├── .vscode/                        # Editor workspace settings
└── README.md                       # Project overview, setup, and run instructions
```

## Description of Key Directories

1. **`backend/`**: Server-side logic. Database access, business rules, and the REST API.
2. **`backend/routers/`**: HTTP layer only — one module per feature. Route handlers validate, delegate, and shape the response.
3. **`backend/services/`**: Business logic that is not tied to HTTP: symptom extraction, symptom-to-specialty routing, doctor search, translation, geocoding, email.
4. **`backend/tests/`**: pytest suite. Every test runs against a throwaway database in a temp directory; the dev database is never touched.
5. **`backend/migrations/`**: Alembic. Schema changes go here and nowhere else.
6. **`backend/scripts/`**: Data loaders, seeders, backup and maintenance. Explicitly *not* migrations — see `backend/scripts/README.md`.
7. **`frontend/`**: The client-side React application.
8. **`data/`**: General-purpose data directory.
9. **`docs/`**: System documentation — schema, structure, and a devlog of significant changes.
