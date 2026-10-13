"""One-off cleanup: remove junk NLP-learned rows from symptom_mappings.

During earlier testing the auto-learn path persisted several rows that were
not real symptoms — transliterated Hindi, raw Devanagari, a bare word, and an
echoed sentence. Each was tagged General Physician because a brand-new
symptom matches no keyword, so the default was stored as if it were a real
mapping. `sir dard` is actively harmful: it is a substring match waiting to
misroute a Hindi headache patient to a GP instead of a Neurologist.

Run once:  python clean_learned_symptoms.py
"""
import re
import sqlite3

DB = "medical_app.db"

# Transliterated Hindi that survived earlier testing. Latin script and short
# enough to pass the heuristics above, but not real symptom names.
#   "sir dard"      = "सिरदर्द" (headache) — actively harmful: a Hindi
#                     patient saying "Sir Dard" substring-matches this row
#                     and gets a GP instead of a Neurologist.
#   "bahut takalif" = "बहुत तकलीफ" (a lot of pain)
KNOWN_JUNK = {"sir dard", "bahut takalif"}


def is_clean_symptom(symptom: str) -> bool:
    """True when `symptom` reads like a genuine single symptom."""
    if not symptom:
        return False
    s = symptom.strip()
    # Non-Latin script — transliterated or native text, not a symptom name.
    if any(ord(ch) > 0x0900 for ch in s):
        return False
    # Too short to be meaningful ("pain", "ache").
    if len(s) < 5:
        return False
    # Too long — an echoed sentence rather than a symptom. Real symptom
    # phrases in the dataset top out around 40 characters.
    if len(s) > 40:
        return False
    # Too many words — a sentence, not a symptom phrase.
    if len(s.split()) > 6:
        return False
    # Sentence markers indicate echoed input.
    if re.search(r"\b(the|with|because|when|while)\b", s, re.IGNORECASE):
        return False
    return True


def main() -> None:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    rows = cur.execute(
        "SELECT id, symptom, specialist, added_by FROM symptom_mappings "
        "WHERE added_by = 'NLP' OR is_custom = 1"
    ).fetchall()

    print(f"Custom/NLP rows found: {len(rows)}")
    print()

    remove_ids = []
    for row_id, symptom, specialist, added_by in rows:
        clean = is_clean_symptom(symptom) and symptom.strip().lower() not in KNOWN_JUNK
        action = "KEEP" if clean else "REMOVE"
        print(f"  [{action}] id={row_id:<3} {symptom[:52]!r:<54} -> {specialist}")
        if not clean:
            remove_ids.append(row_id)

    print()
    print(f"Rows to remove: {len(remove_ids)}")

    if remove_ids:
        cur.executemany(
            "DELETE FROM symptom_mappings WHERE id = ?",
            [(i,) for i in remove_ids],
        )
        conn.commit()
        print("Removed.")

    remaining = cur.execute("SELECT COUNT(*) FROM symptom_mappings").fetchone()[0]
    print(f"Table total after cleanup: {remaining}")

    conn.close()
    print("\nDONE.")


if __name__ == "__main__":
    main()
