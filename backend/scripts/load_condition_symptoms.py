"""One-off loader: import reference_conditions.csv into `condition_symptoms`.

Purely additive — creates one new sibling table and touches nothing else.
Safe to re-run: rows are upserted on (disease, symptom) so an updated CSV
just refreshes the same rows instead of duplicating them.

Run once:  python load_condition_symptoms.py
Optional:   python load_condition_symptoms.py path\\to\\file.csv
"""
import csv
import os
import re
import sqlite3
import sys

DB = "medical_app.db"

# Default location of the reference dataset. Override by passing a path.
DEFAULT_CSV = r"C:\Users\12vin\OneDrive\Desktop\MAJOR\reports\reference_conditions.csv"

# Phrases longer than this are disease descriptions that got split on a comma,
# not symptoms. The dataset has 8 of these, e.g.
#   "which is small sac of fluid that cushions joints"
# They would otherwise pollute the symptom vocabulary with meaningless fragments.
MAX_SYMPTOM_LEN = 45


def is_real_symptom(phrase: str) -> bool:
    """True when `phrase` reads like a symptom rather than a clause."""
    if not phrase:
        return False
    if len(phrase) > MAX_SYMPTOM_LEN:
        return False
    # Descriptions start with relative pronouns or contain clause markers.
    if re.match(r"^(which|that|who|whom|whose)\b", phrase, re.IGNORECASE):
        return False
    if " that " in phrase or " which " in phrase:
        return False
    return True


def main() -> None:
    csv_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_CSV
    if not os.path.exists(csv_path):
        print(f"CSV not found: {csv_path}")
        sys.exit(1)

    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    before_tables = {
        r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS condition_symptoms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            disease TEXT NOT NULL,
            symptom TEXT NOT NULL,
            specialist TEXT NOT NULL,
            risk_level TEXT,
            created_at DATETIME,
            CONSTRAINT uq_condition_symptom UNIQUE (disease, symptom)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_condition_symptoms_symptom "
        "ON condition_symptoms (symptom)"
    )
    # A unique index (rather than a table constraint) so the loader also works
    # against a table that already exists without one. Safe here because the
    # data has no (disease, symptom) duplicates.
    cur.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_condition_symptom "
        "ON condition_symptoms (disease, symptom)"
    )
    conn.commit()

    after_tables = {
        r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    print("Tables added:", sorted(after_tables - before_tables) or "(none — already present)")

    # Read and clean the CSV.
    with open(csv_path, encoding="utf-8-sig", newline="") as fh:
        rows = list(csv.DictReader(fh))

    seen = set()
    inserted = 0
    skipped_fragments = 0
    skipped_blank = 0

    for row in rows:
        # Normalise disease to lowercase so the (disease, symptom) unique key
        # matches regardless of the CSV's casing.
        disease = (row.get("disease") or "").strip().lower()
        specialist = (row.get("specialist") or "").strip()
        risk = (row.get("risk_level") or "").strip() or None
        if not disease or not specialist:
            skipped_blank += 1
            continue

        for raw in (row.get("symptoms") or "").split(","):
            symptom = raw.strip().lower()
            if not symptom:
                skipped_blank += 1
                continue
            if not is_real_symptom(symptom):
                skipped_fragments += 1
                continue

            key = (disease.lower(), symptom)
            if key in seen:
                continue
            seen.add(key)

            # Upsert — idempotent on (disease, symptom).
            cur.execute(
                """
                INSERT OR IGNORE INTO condition_symptoms
                    (disease, symptom, specialist, risk_level)
                VALUES (?, ?, ?, ?)
                """,
                (disease, symptom, specialist, risk),
            )
            inserted += 1

    conn.commit()

    print(f"CSV rows read        : {len(rows)}")
    print(f"Upserted rows        : {inserted}")
    print(f"Skipped (blank)      : {skipped_blank}")
    print(f"Skipped (fragments)  : {skipped_fragments}")

    n = cur.execute("SELECT COUNT(*) FROM condition_symptoms").fetchone()[0]
    print(f"Table total          : {n}")

    print("\nDistinct symptoms    :", cur.execute(
        "SELECT COUNT(DISTINCT symptom) FROM condition_symptoms").fetchone()[0])
    print("Distinct diseases   :", cur.execute(
        "SELECT COUNT(DISTINCT disease) FROM condition_symptoms").fetchone()[0])
    print("Specialists         :")
    for spec, cnt in cur.execute(
        "SELECT specialist, COUNT(*) FROM condition_symptoms GROUP BY specialist ORDER BY 2 DESC"
    ).fetchall():
        print(f"   {cnt:>3}  {spec}")

    # Confirm no pre-existing table lost rows.
    print("\nRow counts for pre-existing tables:")
    for t in sorted(before_tables):
        if t == "sqlite_sequence":
            continue
        cnt = cur.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
        print(f"  {t}: {cnt} rows")

    conn.close()

    # This loader deletes and reinserts hundreds of rows, which leaves free
    # pages behind. Reclaim them now rather than accumulating them.
    from maintenance import run_maintenance
    run_maintenance()

    print("\nDONE.")


if __name__ == "__main__":
    main()
