"""One-off loader: seed the `regional_symptom_keywords` table.

Moves the regional-language symptom vocabulary out of the hardcoded
_REGIONAL_SYMPTOM_KEYWORDS dict in nlp_processor.py and into the database,
so the offline fallback vocabulary lives alongside the rest of the medical
data. Idempotent — safe to re-run.

Run once:  python seed_regional_symptoms.py
"""
import sqlite3

DB = "medical_app.db"

# language -> [(regional_term, english_canonical), ...]
# Preserved verbatim from the former _REGIONAL_SYMPTOM_KEYWORDS dict.
REGIONAL_KEYWORDS = {
    "hi": [
        ("सिरदर्द", "headache"), ("सिर दर्द", "headache"), ("सिरदर्दी", "headache"),
        ("माइग्रेन", "migraine"),
        ("चक्कर", "dizziness"), ("चक्कर आना", "dizziness"), ("मौन", "dizziness"),
        ("सीने में दर्द", "chest pain"), ("छाती में दर्द", "chest pain"),
        ("सीने में तकलीफ", "chest pain"), ("छाती में तकलीफ", "chest pain"),
        ("धड़कन", "palpitations"), ("धड़कना", "palpitations"),
        ("दिल धड़कना", "palpitations"), ("दिल की धड़कन", "palpitations"),
        ("साँस लेने में तकलीफ", "shortness of breath"),
        ("सांस लेने में तकलीफ", "shortness of breath"),
        ("साँस फूलना", "shortness of breath"), ("सांस फूलना", "shortness of breath"),
        ("बुखार", "fever"), ("ज्वर", "fever"), ("बुखार आना", "fever"),
        ("थकान", "fatigue"), ("कमजोरी", "weakness"), ("थका हुआ", "fatigue"),
        ("उल्टी", "vomiting"), ("उल्टी आना", "vomiting"), ("जमना", "vomiting"),
        ("खाँसी", "cough"), ("खांसी", "cough"), ("खाँसी आना", "cough"),
        ("घरघराहट", "wheezing"), ("सांस घरघराना", "wheezing"),
        ("पेट दर्द", "stomach pain"), ("पेट में दर्द", "stomach pain"),
        ("पेट दर्द होना", "stomach pain"), ("पेट खराब", "stomach pain"),
        ("दस्त", "diarrhea"), ("लूज मोशन", "diarrhea"),
        ("कब्ज", "constipation"), ("कब्ज़", "constipation"),
        ("गैस", "bloating"), ("पेट फूलना", "bloating"),
        ("सीने में जलन", "acid reflux"), ("अम्लता", "acid reflux"),
        ("सीबन", "acne"),
        ("खुजली", "itching"), ("खुजली होना", "itching"),
        ("चकत्ते", "skin rash"), ("दाने", "rash"), ("लाल चकत्ते", "skin rash"),
        ("सूजन", "swelling"), ("सूजा", "swelling"),
        ("कमर दर्द", "back pain"), ("कमर का दर्द", "back pain"),
        ("पीठ दर्द", "back pain"), ("पीठ में दर्द", "back pain"),
        ("हाथ में दर्द", "joint pain"), ("पैर में दर्द", "joint pain"),
        ("जोड़ों में दर्द", "joint pain"), ("जोड़ दर्द", "joint pain"),
        ("गर्दन दर्द", "neck pain"), ("गर्दन में दर्द", "neck pain"),
        ("हड्डी टूटना", "fracture"), ("हड्डी टूटी", "fracture"),
        ("मधुमेह", "diabetes"), ("डायबिटीज़", "diabetes"), ("डायबिटीज", "diabetes"),
        ("रक्तचाप", "hypertension"), ("ब्लड प्रेशर", "hypertension"),
        ("थायरॉइड", "thyroid"), ("गले की ग्रंथि", "thyroid"),
        ("अनिद्रा", "insomnia"), ("नींद नहीं आना", "insomnia"),
        ("चिंता", "anxiety"), ("तनाव", "stress"),
        ("बाल झड़ना", "hair loss"),
    ],
    "ta": [
        ("தலைவலி", "headache"), ("தலை வலி", "headache"),
        ("மைகிரேன்", "migraine"),
        ("மயக்கம்", "dizziness"), ("தலைச் சுறுகல்", "dizziness"),
        ("மார்புக்கு வலி", "chest pain"), ("நெஞ்சு வலி", "chest pain"),
        ("மார்பு வலி", "chest pain"),
        ("இதயத்துடிப்பு", "palpitations"), ("இதயம் துடிக்க", "palpitations"),
        ("மூச்சுத்திண்டல்", "shortness of breath"),
        ("மூச்சு மூடுதல்", "shortness of breath"),
        ("காய்ச்சல்", "fever"), ("மேறி", "fever"), ("காய்ச்சல் வந்தது", "fever"),
        ("இருமல்", "cough"), ("இருமல் வந்தது", "cough"),
        ("வயிற்றுப்போது", "stomach pain"), ("வயிறு வலி", "stomach pain"),
        ("இரைப்பை வலி", "stomach pain"),
        ("வாந்தி", "vomiting"), ("வாந்தி வருகிறது", "vomiting"),
        ("புரட்டி", "diarrhea"), ("மலச்சுரப்பி", "diarrhea"),
        ("மலவாங்கு", "constipation"), ("மலவாங்கல்", "constipation"),
        ("வயிறு உப்புடல்", "bloating"), ("வயிறுப்போக்கு", "bloating"),
        ("தோல் அரிப்பு", "skin rash"), ("தோல் சொறி", "itching"),
        ("குருதி இல்லாமை", "anemia"),
        ("தசை வலி", "joint pain"), ("மூட்டு வலி", "joint pain"),
        ("முதுகு வலி", "back pain"), ("கால் வலி", "joint pain"),
        ("உயர் இரத்த அழுத்தம்", "hypertension"),
        ("சர்க்கரை நோய்", "diabetes"),
        ("மன அமைதி", "insomnia"), ("தூக்கம் வராது", "insomnia"),
    ],
    "te": [
        ("తలనొప్పు", "headache"), ("తల వొప్పు", "headache"),
        ("మైగ్రేన్", "migraine"),
        ("మైందిగేమింగ్", "dizziness"),
        ("బుగ్గులో నొప్పు", "chest pain"), ("గుండె నొప్పు", "chest pain"),
        ("ఎదురు నొప్పు", "chest pain"),
        ("గుండె గడగడ", "palpitations"),
        ("ఊపిరి తీసుకోవడం", "shortness of breath"),
        ("ఊపిరి ఆపుకోవడం", "shortness of breath"),
        ("జ్వరం", "fever"), ("జ్వర", "fever"),
        ("దగ్గు", "cough"), ("కఫ్", "cough"),
        ("కడుపు నొప్పు", "stomach pain"), ("పేట నొప్పు", "stomach pain"),
        ("విరేచనాలు", "vomiting"), ("వాంతులు", "vomiting"),
        ("మలంపెట్టు", "constipation"),
        ("చేకిత్రియం", "diarrhea"),
        ("గుంట్లు", "bloating"),
        ("చర్మ ర్యాష్", "skin rash"), ("తొలి", "itching"),
        ("కాళ్ల దొప్పులు", "joint pain"), ("మోసల పొప్పులు", "joint pain"),
        ("నెప్పెముక", "back pain"),
        ("అధిక రక్తపు", "hypertension"), ("మధుమేహం", "diabetes"),
        ("నిద్ర రావియేవు", "insomnia"),
    ],
    "kn": [
        ("ತಲವೆನೋಟು", "headache"), ("ತಲವೆ ನೋವು", "headache"),
        ("ಮೈಗ್ರೇನ್", "migraine"),
        ("ತಲೆತಿರುಗುಳು", "dizziness"),
        ("ಎದೆಯಲ್ಲಿ ನೋವು", "chest pain"), ("ಎದೆ ನೋವು", "chest pain"),
        ("ಹೃದಯದ ಗುಲಕ", "palpitations"),
        ("ಉಸಿರೆಕೊಳ್ಳಲು", "shortness of breath"),
        ("ಉಸಿರ ಕೊಳ್ಳಲು", "shortness of breath"),
        ("ಜ್ವರ", "fever"), ("ಜ್ವರ ಬಂದಿದೆ", "fever"),
        ("ಕಫ್ಫು", "cough"), ("ಇರುಗುಳು", "cough"),
        ("ಹೊಟ್ಟು ನೋವು", "stomach pain"), ("ಬಯಲು ನೋವು", "stomach pain"),
        ("ವಮನೆ", "vomiting"),
        ("ಮಲಶಂಕು", "diarrhea"), ("ಕಂಪಕ", "constipation"),
        ("ಗಾಳಿ", "bloating"),
        ("ಚರ್ಮ ಚಿತ್ತು", "skin rash"), ("ಕಿಚ್ಚು", "itching"),
        ("ತೊಡೆ ನೋವು", "joint pain"), ("ಬಾಳ ನೋವು", "back pain"),
        ("ಅಧಿಕ ರಕ್ತದಾವ", "hypertension"), ("ಮಧುಮೇಹ", "diabetes"),
        ("ನಿದ್ದೆ ಬರುವುದಿಲ್ಲ", "insomnia"),
    ],
    # Malayalam
    "ml": [
        ("തലവേദന", "headache"), ("തല വേദന", "headache"),
        ("മൈഗ്രെയിൻ", "migraine"),
        ("തലകറക്കം", "dizziness"),
        ("നെഞ്ചുവേദന", "chest pain"), ("നെഞ്ചിൽ വേദന", "chest pain"),
        ("ഹൃദയസ്പന്ദനം", "palpitations"),
        ("ശ്വാസംമുട്ടൽ", "shortness of breath"),
        ("ശ്വാസംവിടാൻപ്രയാസം", "shortness of breath"),
        ("പനി", "fever"), ("ജവർ", "fever"),
        ("ചുമ", "cough"), ("ചുമവരുന്നു", "cough"),
        ("വയറുവേദന", "stomach pain"), ("വയറിൽവേദന", "stomach pain"),
        ("ഛർദ്ദി", "vomiting"), ("ഛർദ്ദിവരുന്നു", "vomiting"),
        ("വയറിളക്കം", "diarrhea"), ("മലബന്ധം", "constipation"),
        ("വയറുവീർപ്പം", "bloating"),
        ("ചർമ്മത്തില്പ്പുള്ളി", "skin rash"), ("ചർമ്മത്തില്കിട്ടൽ", "itching"),
        ("സന്ധിവേദന", "joint pain"), ("പൃഷ്ഠംവേദന", "back pain"),
        ("രക്തസമ്മർദ്ദം", "hypertension"), ("പ്രമേഹം", "diabetes"),
        ("ഉറക്കമില്ലായ്മ", "insomnia"),
    ],
    # Marathi
    "mr": [
        ("डोकेदुखी", "headache"), ("डोके दुखणे", "headache"),
        ("मायग्रेन", "migraine"),
        ("चक्कर", "dizziness"), ("चक्कर येणे", "dizziness"),
        ("छातीत दुखणे", "chest pain"), ("छातीचा दुखणे", "chest pain"),
        ("हृदयाची धडधड", "palpitations"),
        ("श्वास घ्यायला त्रास", "shortness of breath"),
        ("श्वास घेणे अवघड", "shortness of breath"),
        ("ताप", "fever"), ("ताप येणे", "fever"),
        ("खोकला", "cough"), ("खोकला येणे", "cough"),
        ("पोटदुखी", "stomach pain"), ("पोट दुखणे", "stomach pain"),
        ("उलटी", "vomiting"), ("उलटी होणे", "vomiting"),
        ("अतिसार", "diarrhea"), ("कब्जियत", "constipation"),
        ("पोट फुगणे", "bloating"),
        ("त्वचेवर गज", "skin rash"), ("खुजली", "itching"),
        ("सांधेदुखी", "joint pain"), ("कंबर दुखणे", "back pain"),
        ("रक्तदाब", "hypertension"), ("मधुमेह", "diabetes"),
        ("झोप न येणे", "insomnia"),
    ],
    # Bengali
    "bn": [
        ("মাথাব্যথা", "headache"), ("মাথা ব্যথা", "headache"),
        ("মাইগ্রেন", "migraine"),
        ("মাথাঝুলানি", "dizziness"), ("ঝিমঝিম", "dizziness"),
        ("বুকে ব্যথা", "chest pain"), ("বুকের ব্যথা", "chest pain"),
        ("হৃদপিণ্ডের স্পন্দন", "palpitations"),
        ("শ্বাসকষ্ট", "shortness of breath"),
        ("শ্বাস নিতে অসুবিধা", "shortness of breath"),
        ("জ্বর", "fever"), ("জ্বর আসা", "fever"),
        ("কাশি", "cough"), ("কাশি আসা", "cough"),
        ("পেটে ব্যথা", "stomach pain"), ("পেট ব্যথা", "stomach pain"),
        ("বমি", "vomiting"), ("বমি করা", "vomiting"),
        ("ডায়রিয়া", "diarrhea"), ("কব্জ", "constipation"),
        ("পেট ফুলানো", "bloating"),
        ("চামড়ায় ফুসকুড়ি", "skin rash"), ("চুলকানি", "itching"),
        ("জোড়ে ব্যথা", "joint pain"), ("পিঠে ব্যথা", "back pain"),
        ("রক্তচাপ", "hypertension"), ("ডায়াবেটিস", "diabetes"),
        ("ঘুম না আসা", "insomnia"),
    ],
    # Gujarati
    "gu": [
        ("માથું દુખવું", "headache"), ("માથાનો દુખાવો", "headache"),
        ("માઇગ્રેન", "migraine"),
        ("ચક્કર", "dizziness"), ("ચક્કર આવવું", "dizziness"),
        ("છાતીમાં દુખાવો", "chest pain"), ("છાતી દુખાવો", "chest pain"),
        ("ધબધબાટ", "palpitations"),
        ("શ્વાસ લેવામાં તકલીફ", "shortness of breath"),
        ("શ્વાસ લેવો મુશ્કેલ", "shortness of breath"),
        ("તાવ", "fever"), ("તાવ આવવો", "fever"),
        ("ખાંસી", "cough"), ("ખાંસી આવવી", "cough"),
        ("પેટમાં દુખાવો", "stomach pain"), ("પેટ દુખાવો", "stomach pain"),
        ("ઉલ્ટી", "vomiting"), ("ઉલ્ટી થવી", "vomiting"),
        ("ઝાડા", "diarrhea"), ("કબજિયાત", "constipation"),
        ("પેટ ફુલાવું", "bloating"),
        ("ત્વચા પર રેશ", "skin rash"), ("ખાજ", "itching"),
        ("સાંધા દુખાવા", "joint pain"), ("કમર દુખાવો", "back pain"),
        ("રક્તદાબ", "hypertension"), ("મધુમેહ", "diabetes"),
        ("ઊંઘ ન આવવી", "insomnia"),
    ],
    # Punjabi
    "pa": [
        ("ਸਿਰ ਦਰਦ", "headache"), ("ਸਿਰ ਦੁੱਖਣਾ", "headache"),
        ("ਮਾਈਗਰੇਨ", "migraine"),
        ("ਚੱਕਰ", "dizziness"), ("ਚੱਕਰ ਆਉਣਾ", "dizziness"),
        ("ਛਾਤੀ ਵਿੱਚ ਦਰਦ", "chest pain"), ("ਛਾਤੀ ਦਰਦ", "chest pain"),
        ("ਦਿਲ ਦੀ ਧੜਕਣ", "palpitations"),
        ("ਸਾਹ ਲੈਣ ਵਿੱਚ ਮੁਸ਼ਕਲ", "shortness of breath"),
        ("ਸਾਹ ਲੈਣਾ ਔਖਾ", "shortness of breath"),
        ("ਬੁਖਾਰ", "fever"), ("ਬੁਖਾਰ ਆਉਣਾ", "fever"),
        ("ਖਾਂਸੀ", "cough"), ("ਖਾਂਸੀ ਆਉਣੀ", "cough"),
        ("ਪੇਟ ਦਰਦ", "stomach pain"), ("ਪੇਟ ਦੁੱਖਣਾ", "stomach pain"),
        ("ਉਲਟੀ", "vomiting"), ("ਉਲਟੀ ਹੋਣਾ", "vomiting"),
        ("ਦਸਤ", "diarrhea"), ("ਕਬਜ਼", "constipation"),
        ("ਪੇਟ ਫੁੱਲਣਾ", "bloating"),
        ("ਚਮੜੀ ਤੇ ਰੇਲੇ", "skin rash"), ("ਖੁਜਲੀ", "itching"),
        ("ਜੋੜਾਂ ਦਰਦ", "joint pain"), ("ਕਮਰ ਦਰਦ", "back pain"),
        ("ਰਕਤ ਦਬਾਅ", "hypertension"), ("ਸ਼ੂਗਰ", "diabetes"),
        ("ਨੀਂਦ ਨਾ ਆਉਣਾ", "insomnia"),
    ],
}


def main() -> None:
    conn = sqlite3.connect(DB)
    cur = conn.cursor()

    before_tables = {
        r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }

    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS regional_symptom_keywords (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            language TEXT NOT NULL,
            regional_term TEXT NOT NULL,
            english_canonical TEXT NOT NULL,
            created_at DATETIME,
            CONSTRAINT uq_regional_symptom UNIQUE (language, regional_term)
        )
        """
    )
    cur.execute(
        "CREATE INDEX IF NOT EXISTS ix_regional_symptom_keywords_language "
        "ON regional_symptom_keywords (language)"
    )
    conn.commit()

    after_tables = {
        r[0] for r in cur.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    }
    print("Tables added:", sorted(after_tables - before_tables) or "(none — already present)")

    inserted = 0
    for lang, pairs in REGIONAL_KEYWORDS.items():
        for term, canonical in pairs:
            cur.execute(
                """
                INSERT OR IGNORE INTO regional_symptom_keywords
                    (language, regional_term, english_canonical)
                VALUES (?, ?, ?)
                """,
                (lang, term, canonical),
            )
            inserted += 1

    conn.commit()

    n = cur.execute("SELECT COUNT(*) FROM regional_symptom_keywords").fetchone()[0]
    print(f"Upserted rows : {inserted}")
    print(f"Table total   : {n}")
    print()
    print("By language:")
    for lang, cnt in cur.execute(
        "SELECT language, COUNT(*) FROM regional_symptom_keywords GROUP BY language ORDER BY 1"
    ).fetchall():
        print(f"   {cnt:>3}  {lang}")

    conn.close()
    print("\nDONE.")


if __name__ == "__main__":
    main()
