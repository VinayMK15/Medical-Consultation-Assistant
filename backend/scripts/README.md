# Data scripts

Loaders, seeders and cleanup utilities. **These are not migrations.**

Schema changes go through Alembic:

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head
```

Anything in this folder that alters table structure is a bug — it would leave
`alembic upgrade head` and the real database disagreeing, which is exactly the
state this project was in before the migration history was squashed to a single
baseline.

## What belongs here

| Script | Purpose |
|---|---|
| `backup_db.py` | Consistent snapshot via SQLite's Online Backup API. |
| `maintenance.py` | WAL checkpoint and incremental vacuum. Imported by the bulk loaders. |
| `load_condition_symptoms.py` | Import `reference_conditions.csv` into `condition_symptoms`. Upserts on `(disease, symptom)`, so re-running is safe. |
| `seed_regional_symptoms.py` | Populate `regional_symptom_keywords` with the offline fallback vocabulary. |
| `seed_symptom_aliases.py` | Populate `symptom_aliases` — alternative phrasings mapped to canonical symptoms. |
| `seed_demo_appointments.py` | Demo appointment data for local development. |
| `clear_seeded_appointments.py` | Remove seeded demo appointments. |
| `clear_patient_appointments.py` | Remove one patient's appointment history. Takes a hardcoded email — edit before use. |
| `clean_learned_symptoms.py` | Drop NLP-learned symptom mappings, keeping the curated ones. |
| `strip_seed_marker.py` | Strip demo markers left by the seeder. |

## Running them

Most scripts assume the current working directory is `backend/`, since they open
`medical_app.db` by relative path:

```bash
cd backend
python scripts/load_condition_symptoms.py
```

`load_condition_symptoms.py` accepts an explicit CSV path as its first argument
if the dataset lives outside the repo.

## Backups

```bash
python scripts/backup_db.py                        # timestamped snapshot
python scripts/backup_db.py --retention 7          # keep the last 7
python scripts/backup_db.py path/to/snapshot.db    # explicit destination
```

Each snapshot is verified with `integrity_check` and `foreign_key_check` before
the script reports success. A backup that cannot be opened is worse than none,
because it looks like one.

## Maintenance

```bash
python scripts/maintenance.py --status   # report, change nothing
python scripts/maintenance.py            # checkpoint + reclaim everything
python scripts/maintenance.py --pages 50 # reclaim at most 50 pages
```

Run after bulk loads and deletes, which scatter free pages through the file.
`--pages N` is the bounded form for a running server, where you would rather
spread the work than hold a lock for the whole freelist.

`incremental_vacuum` requires `auto_vacuum=INCREMENTAL`, which only takes
effect after a one-time full `VACUUM` on the file. `--status` reports which
mode is active.

## Why not just copy the file

Several of the data scripts still call `shutil.copy` to snapshot the database
before they run. That is safe only because they execute offline against a local
dev file.

It is **not** safe for a live database. In WAL mode, committed transactions may
still be sitting in the `-wal` sidecar, so a copy of the `.db` alone can be
missing recent writes entirely — and the copy can catch a torn page if a writer
is mid-checkpoint. `backup_db.py` uses `sqlite3.Connection.backup()` instead,
which takes the snapshot through the database's own page cache and so is
complete and consistent regardless of what else is connected.

Two things to know if you replace a `shutil.copy` yourself:

- `sqlite3.Connection.backup()` needs an autocommit connection on the
  destination (`sqlite3.connect(path, isolation_level=None)`). An open
  transaction there makes the call fail.
- Backups are timestamped rather than overwritten, so a failed run cannot
  destroy the last good snapshot.