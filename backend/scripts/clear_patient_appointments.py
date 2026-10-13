"""One-off cleanup: remove a patient's appointment history.

Removes every appointment row for emptyspotify12@gmail.com so the profile
pages can be reviewed against a clean slate. Backs up the database first
(bak7), matching the convention used by the other scripts in this folder.

Only rows owned by the target patient are touched; every other patient,
doctor, and table is left as-is. Verified by counts before and after.

Run once:  python clear_patient_appointments.py
"""
import shutil
import sqlite3

DB = 'medical_app.db'
TARGET_EMAIL = 'emptyspotify12@gmail.com'

print('Backing up to medical_app.db.bak7 ...')
shutil.copy(DB, DB + '.bak7')

conn = sqlite3.connect(DB)
cur = conn.cursor()

# The account must exist, or there is nothing to do and we should not
# silently report success.
user = cur.execute(
    'SELECT id FROM users WHERE email = ?', (TARGET_EMAIL,)
).fetchone()
if not user:
    print('No user with that email — nothing deleted.')
    conn.close()
    raise SystemExit(1)

uid = user[0]

before_total = cur.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]
others_before = cur.execute(
    'SELECT patient_id, COUNT(*) FROM appointments WHERE patient_id != ? GROUP BY patient_id',
    (uid,)
).fetchall()
target_before = cur.execute(
    'SELECT COUNT(*) FROM appointments WHERE patient_id = ?', (uid,)
).fetchone()[0]

print(f'Target user id: {uid}')
print(f'Appointments to delete: {target_before}')
print('Appointments held by other patients (must not change):', others_before)
print(f'Total rows before: {before_total}')

if target_before:
    cur.execute('DELETE FROM appointments WHERE patient_id = ?', (uid,))
conn.commit()

after_total = cur.execute('SELECT COUNT(*) FROM appointments').fetchone()[0]
others_after = cur.execute(
    'SELECT patient_id, COUNT(*) FROM appointments WHERE patient_id != ? GROUP BY patient_id',
    (uid,)
).fetchall()
target_after = cur.execute(
    'SELECT COUNT(*) FROM appointments WHERE patient_id = ?', (uid,)
).fetchone()[0]

print()
print(f'Appointments for {TARGET_EMAIL}: {target_before} -> {target_after}')
print(f'Total rows after: {after_total}')
print('Other patients after:', others_after)

assert target_after == 0, 'target rows remain'
assert others_after == others_before, 'another patient was affected'
assert after_total == before_total - target_before, 'unexpected total'

viol = cur.execute('PRAGMA foreign_key_check').fetchall()
print('FK violations:', viol if viol else '(none)')

# The account itself must still exist and still be able to sign in.
row = cur.execute('SELECT id, email, full_name FROM users WHERE id = ?', (uid,)).fetchone()
print('Account intact:', row)

conn.close()
print('DONE.')
