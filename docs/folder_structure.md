# Project Folder Structure

This section outlines the directory and file structure of the Medical Consultation Assistant. This structure promotes a clear separation of concerns between the backend API, the frontend user interface, and the storage of medical documentation.

```text
medical-consultation-assistant/
│
├── backend/                        # FastAPI Backend Application
│   ├── main.py                     # Entry point for the FastAPI application
│   ├── database.py                 # Database connection and session management
│   ├── models.py                   # SQLAlchemy ORM models (Users, Appointments, Documents)
│   ├── schemas.py                  # Pydantic models for request/response validation
│   ├── auth_utils.py               # JWT authentication and password hashing logic
│   ├── seed.py                     # Script to populate initial database data
│   ├── requirements.txt            # Python dependencies for the backend
│   │
│   ├── routers/                    # API Endpoints (Organized by feature)
│   │   ├── users.py                # Routes for user registration and profiles
│   │   ├── appointments.py         # Routes for booking and managing appointments
│   │   └── documents.py            # Routes for uploading and retrieving documents
│   │
│   └── storage/                    # Local storage for uploaded documentation (if not using cloud)
│       └── patients/               # Organized by patient ID
│           ├── patient_1/
│           │   ├── prescriptions/
│           │   └── lab_reports/
│           └── patient_2/
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
├── docs/                           # Project Documentation
│   ├── database_schema.md          # ER diagrams and database tables
│   └── folder_structure.md         # Overview of the project directory structure
│
├── .gitignore                      # Specifies intentionally untracked files to ignore
├── .vscode/                        # Visual Studio Code workspace settings
└── README.md                       # Project overview, setup, and run instructions
```

## Description of Key Directories

1. **`backend/`**: Contains the complete server-side logic written in Python. It is responsible for handling database transactions, enforcing business logic, and serving RESTful APIs.
2. **`frontend/`**: The client-side application that the patients and doctors interact with. It contains all the visual components, pages, and logic to consume the backend APIs.
3. **`data/`**: General purpose data directory for the application.
4. **`docs/`**: A dedicated folder for maintaining system documentation, API references, and database schemas (like the ones included in this report).
