"""One-off loader: seed the `symptom_aliases` table.

Patients describe the same complaint many ways. "blood pressure" and
"hypertension" are the same problem, but only one of them is a stored
symptom. Without aliases, the other phrasing matches nothing and the
patient is routed to a General Physician.

Idempotent — safe to re-run.

Run once:  python seed_symptom_aliases.py
"""
import sqlite3

DB = "medical_app.db"

# alias -> canonical. Only phrasings that are NOT already stored symptoms
# need to be here; the loader dedupes against the existing vocabulary.
ALIASES = [
    # The four lost when the hardcoded keyword list was removed.
    ("blood pressure", "hypertension"),
    ("muscle pain", "joint pain"),
    ("body pain", "joint pain"),
    ("breathing problem", "shortness of breath"),
    # Common real-world phrasings worth covering regardless.
    ("heart pain", "chest pain"),
    ("chest pain", "chest pain"),
    ("abdominal pain", "stomach pain"),
    ("backache", "back pain"),
    ("neckpain", "neck pain"),
    ("stiff neck", "neck pain"),
    ("neck ache", "neck pain"),
    ("shoulder ache", "shoulder pain"),
    ("hormonal", "hormonal imbalance"),
    ("difficulty breathing", "shortness of breath"),
    ("neck stiffness", "neck pain"),
]


def main() -> None:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    before_tables = {
        r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS symptom_aliases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            alias TEXT NOT NULL UNIQUE,
            canonical TEXT NOT NULL,
            created_at DATETIME
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_symptom_aliases_alias ON symptom_aliases (alias)"
    )
    conn.commit()

    after_tables = {
        r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    print("Tables added:", sorted(after_tables - before_tables) or "(none — already present)")

    inserted = 0
    for alias, canonical in ALIASES:
        cur.execute(
            "INSERT OR IGNORE INTO symptom_aliases (alias, canonical) VALUES (?, ?)",
            (alias, canonical),
        )
        inserted += 1

    conn.commit()

    n = cur.execute("SELECT COUNT(*) FROM symptom_aliases").fetchone()[0]
    print(f"Upserted rows : {inserted}")
    print(f"Table total   : {n}")
    print()
    print("Aliases:")
    for alias, canonical in cur.execute(
        "SELECT alias, canonical FROM symptom_aliases ORDER BY canonical, alias"
    ).fetchall():
        print(f"   {alias:<24} -> {canonical}")

    conn.close()
    print("\nDONE.")


if __name__ == "__main__":
    main()
