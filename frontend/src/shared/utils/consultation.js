/**
 * Consultation & Prescription data model and helper utilities.
 * Handles parsing, serialization, and clinical calculation.
 */

/**
 * True when a value holds meaningful content — a non-empty string, or an
 * array or object containing one.
 *
 * Lived in `demoMode.js` until demo mode was removed, but it was never about
 * demo data: VitalsTab uses it for real vitals validation, and the confirm
 * dialogs use it to avoid discarding a doctor's own content. Moved here
 * alongside the other consultation helpers rather than deleted with the file.
 */
export function hasContent(value) {
  if (value == null) return false;

  if (typeof value === 'string') return value.trim().length > 0;

  if (Array.isArray(value)) {
    return value.some((item) => {
      if (item == null) return false;
      if (typeof item === 'object') return hasContent(item);
      return String(item).trim().length > 0;
    });
  }

  if (typeof value === 'object') {
    return Object.values(value).some((v) => hasContent(v));
  }

  return Boolean(value);
}

export const FREQUENCY_OPTIONS = [
  '0-0-1 (Night)',
  '1-0-0 (Morning)',
  '1-0-1 (Morning & Night)',
  '1-1-1 (Three times a day)',
  '0-1-0 (Afternoon)',
  '1-0-0-1 (Morning & Night)',
  'SOS (As Needed)',
  'Once Weekly',
];

/**
 * Medicine form, and the dosage options each form makes sense in.
 *
 * FORM and DOSAGE are separate inputs in the UI but NOT separate values in
 * storage: `dosage` stays a single string ("10 ml"), so the serialiser, the
 * parser and the printed report are all untouched by this split.
 *
 * `DOSAGE_OPTIONS` stays below and is still used by the serialiser and by
 * previously saved records.
 */
export const FORM_OPTIONS = [
  { value: 'tablet',   label: 'Tablet',   dosage: ['½ Tablet', '1 Tablet', '2 Tablets'] },
  { value: 'capsule',  label: 'Capsule',  dosage: ['1 Capsule', '2 Capsules'] },
  { value: 'syrup',    label: 'Syrup',    dosage: ['5 ml', '10 ml', '15 ml'] },
  { value: 'sachet',   label: 'Sachet',   dosage: ['1 Sachet'] },
  { value: 'inhaler',  label: 'Inhaler',  dosage: ['2 Puffs'] },
  { value: 'ointment', label: 'Ointment', dosage: ['Apply a thin layer'] },
  { value: 'drops',    label: 'Drops',    dosage: ['1 Drop', '2 Drops'] },
];

export const DOSAGE_OPTIONS = [
  '1 Tablet',
  '2 Tablets',
  '1 Capsule',
  '5 ml',
  '10 ml',
  '1 Sachet',
  '2 Puffs',
  '1 Drop',
];

export const DURATION_OPTIONS = [
  '3 Days',
  '5 Days',
  '7 Days',
  '10 Days',
  '14 Days',
  '30 Days',
  '1 Month',
  '2 Months',
  'Ongoing',
];

export const INSTRUCTION_OPTIONS = [
  'After dinner',
  'With water after breakfast',
  'Empty stomach 30 mins before food',
  'After meals',
  'Before meals',
  'At bedtime',
  'As needed for pain / fever',
  'With a glass of warm water',
];

export const SPECIALTY_DIAGNOSES = {
  Cardiologist: [
    'Atypical Angina / Exertional Chest Discomfort',
    'Essential Hypertension',
    'Stable Angina Pectoris',
    'Sinus Tachycardia',
    'Hyperlipidemia',
    'Palpitations - Under Evaluation',
  ],
  Neurologist: [
    'Migraine without Aura',
    'Tension-Type Headache',
    'Cervical Radiculopathy',
    'Benign Paroxysmal Positional Vertigo',
    'Peripheral Neuropathy',
  ],
  Pulmonologist: [
    'Acute Bronchitis',
    'Bronchial Asthma Exacerbation',
    'Upper Respiratory Tract Infection',
    'Allergic Rhinitis',
    'COPD Mild Flare',
  ],
  'General Physician': [
    'Acute Viral Illness',
    'Upper Respiratory Infection',
    'Gastroenteritis',
    'General Physical Fatigue & Dehydration',
    'Vitamin D / B12 Deficiency',
  ],
  'Internal Medicine': [
    'Acid Peptic Disease / GERD',
    'Type 2 Diabetes Mellitus',
    'Dyslipidemia',
    'Irritable Bowel Syndrome',
    'Metabolic Syndrome',
  ],
  Dermatologist: [
    'Contact Dermatitis',
    'Atopic Eczema',
    'Urticaria',
    'Tinea Corporis',
    'Acne Vulgaris',
  ],
  'Orthopedic Surgeon': [
    'Mechanical Lower Back Pain',
    'Cervical Spondylosis',
    'Knee Osteoarthritis (Grade 1-2)',
    'Rotator Cuff Tendinitis',
    'Plantar Fasciitis',
  ],
  Pediatrician: [
    'Acute Viral Pharyngitis',
    'Pediatric Acute Bronchitis',
    'Gastroenteritis with Mild Dehydration',
    'Allergic Bronchospasm',
  ],
};

export const COMMON_MEDICATIONS = [
  { name: 'Tab. Atorvastatin 10mg', dosage: '1 Tablet', frequency: '0-0-1 (Night)', duration: '30 Days', instructions: 'After dinner' },
  { name: 'Tab. Metoprolol 25mg', dosage: '1 Tablet', frequency: '1-0-0 (Morning)', duration: '14 Days', instructions: 'With water after breakfast' },
  { name: 'Tab. Pantoprazole 40mg', dosage: '1 Tablet', frequency: '1-0-0 (Morning)', duration: '7 Days', instructions: 'Empty stomach 30 mins before food' },
  { name: 'Tab. Paracetamol 650mg', dosage: '1 Tablet', frequency: 'SOS (As Needed)', duration: '5 Days', instructions: 'After food for pain/fever' },
  { name: 'Tab. Telmisartan 40mg', dosage: '1 Tablet', frequency: '1-0-0 (Morning)', duration: '30 Days', instructions: 'After breakfast' },
  { name: 'Tab. Amoxicillin + Clavulanate 625mg', dosage: '1 Tablet', frequency: '1-0-1 (Morning & Night)', duration: '5 Days', instructions: 'After food' },
  { name: 'Tab. Montelukast + Levocetirizine', dosage: '1 Tablet', frequency: '0-0-1 (Night)', duration: '10 Days', instructions: 'At bedtime' },
  { name: 'Tab. Rosuvastatin 10mg', dosage: '1 Tablet', frequency: '0-0-1 (Night)', duration: '30 Days', instructions: 'After dinner' },
  { name: 'Tab. Aspirin 75mg', dosage: '1 Tablet', frequency: '0-1-0 (Afternoon)', duration: '30 Days', instructions: 'After lunch' },
  { name: 'Tab. Metformin 500mg', dosage: '1 Tablet', frequency: '1-0-1 (Morning & Night)', duration: '30 Days', instructions: 'With meals' },
];

/**
 * Calculates BMI from weight (kg) and height (cm).
 */
export function calculateBmi(weightKg, heightCm) {
  const w = parseFloat(weightKg);
  const h = parseFloat(heightCm);
  if (!w || !h || h <= 0) return '';
  const heightMeters = h / 100;
  const bmi = w / (heightMeters * heightMeters);
  return Number.isFinite(bmi) ? bmi.toFixed(1) : '';
}

/**
 * Evaluates BMI category.
 */
export function getBmiCategory(bmiVal) {
  const val = parseFloat(bmiVal);
  if (!val || Number.isNaN(val)) return null;
  if (val < 18.5) return { label: 'Underweight', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (val < 25) return { label: 'Normal', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (val < 30) return { label: 'Overweight', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Obese', color: 'text-rose-700 bg-rose-50 border-rose-200' };
}

/**
 * Evaluates Blood Pressure category.
 */
export function getBpCategory(bpStr) {
  if (!bpStr || typeof bpStr !== 'string') return null;
  const parts = bpStr.split('/').map((s) => parseInt(s.trim(), 10));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return null;
  const [sys, dia] = parts;
  if (sys < 120 && dia < 80) return { label: 'Normal', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (sys <= 129 && dia < 80) return { label: 'Elevated', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (sys <= 139 || dia <= 89) return { label: 'Stage 1 HTN', color: 'text-orange-700 bg-orange-50 border-orange-200' };
  return { label: 'Stage 2 HTN', color: 'text-rose-700 bg-rose-50 border-rose-200' };
}

/**
 * Evaluates Heart Rate category.
 */
export function getHrCategory(hrVal) {
  const hr = parseInt(hrVal, 10);
  if (!hr || Number.isNaN(hr)) return null;
  if (hr >= 60 && hr <= 100) return { label: 'Normal (60-100)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (hr < 60) return { label: 'Bradycardia (<60)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Tachycardia (>100)', color: 'text-rose-700 bg-rose-50 border-rose-200' };
}

/**
 * Evaluates Oxygen Saturation (SpO2) category.
 */
export function getSpo2Category(spo2Val) {
  const val = parseInt(spo2Val, 10);
  if (!val || Number.isNaN(val)) return null;
  if (val >= 95) return { label: 'Normal (≥95%)', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (val >= 90) return { label: 'Borderline (90-94%)', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  return { label: 'Low (<90%)', color: 'text-rose-700 bg-rose-50 border-rose-200' };
}

/**
 * Evaluates Temperature category (°F).
 */
export function getTempCategory(tempVal) {
  const val = parseFloat(tempVal);
  if (!val || Number.isNaN(val)) return null;
  if (val >= 97.0 && val <= 99.0) return { label: 'Normal', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' };
  if (val > 99.0 && val <= 100.4) return { label: 'Low Grade Fever', color: 'text-amber-700 bg-amber-50 border-amber-200' };
  if (val > 100.4) return { label: 'Fever', color: 'text-rose-700 bg-rose-50 border-rose-200' };
  return { label: 'Hypothermia', color: 'text-blue-700 bg-blue-50 border-blue-200' };
}

/**
 * Format date string into "1 Oct 2026"
 */
export function formatReportDate(dateStr) {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return String(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return String(dateStr);
  }
}

/**
 * Parse prescription notes string into structured consultation object.
 */
export function parseConsultationNotes(rawString, appt = null) {
  // The stored symptoms_summary often already carries the
  // "AI Pre-Consultation:" label, which produced a doubled prefix in the
  // report. Add the label only when it is not already present.
  const summary = (appt?.symptoms_summary || '').trim();
  const alreadyLabelled = /^AI\s+Pre-Consultation\s*:/i.test(summary);
  const fallbackTriage = summary
    ? `${alreadyLabelled ? '' : 'AI Pre-Consultation: '}${summary}`
    : '';

  const emptyResult = {
    diagnosis: '',
    vitals: {
      bp: '',
      hr: '',
      spo2: '',
      temp: '',
      bmi: '',
      weight: '',
      height: '',
    },
    triage_reference: fallbackTriage,
    medications: [],
    advice: '',
    raw_notes: '',
  };

  if (!rawString || typeof rawString !== 'string') {
    return emptyResult;
  }

  const trimmed = rawString.trim();

  // Try parsing as JSON
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      if (data && typeof data === 'object') {
        return {
          diagnosis: data.diagnosis || '',
          vitals: {
            bp: data.vitals?.bp || '',
            hr: data.vitals?.hr || '',
            spo2: data.vitals?.spo2 || '',
            temp: data.vitals?.temp || '',
            bmi: data.vitals?.bmi || '',
            weight: data.vitals?.weight || '',
            height: data.vitals?.height || '',
          },
          triage_reference: data.triage_reference || fallbackTriage,
          medications: Array.isArray(data.medications)
            ? data.medications.map((m, idx) => ({
                id: m.id || `med-${idx + 1}`,
                name: m.name || '',
                dosage: m.dosage || '1 Tablet',
                frequency: m.frequency || '1-0-0 (Morning)',
                duration: m.duration || '7 Days',
                instructions: m.instructions || 'After meals',
              }))
            : [],
          advice: data.advice || data.doctor_advice || data.notes || '',
          raw_notes: trimmed,
        };
      }
    } catch {
      // Fall through to plain text handling
    }
  }

  // Plain text fallback (backward compatibility)
  return {
    ...emptyResult,
    advice: trimmed,
    raw_notes: trimmed,
  };
}

/**
 * Serialize structured consultation data into a JSON string for storage in prescription_notes.
 */
export function serializeConsultationNotes(consultation) {
  if (!consultation) return '';
  const payload = {
    diagnosis: consultation.diagnosis || '',
    vitals: {
      bp: consultation.vitals?.bp || '',
      hr: consultation.vitals?.hr || '',
      spo2: consultation.vitals?.spo2 || '',
      temp: consultation.vitals?.temp || '',
      bmi: consultation.vitals?.bmi || '',
      weight: consultation.vitals?.weight || '',
      height: consultation.vitals?.height || '',
    },
    triage_reference: consultation.triage_reference || '',
    medications: Array.isArray(consultation.medications)
      ? consultation.medications.map((m) => ({
          name: m.name || '',
          dosage: m.dosage || '',
          frequency: m.frequency || '',
          duration: m.duration || '',
          instructions: m.instructions || '',
        }))
      : [],
    advice: consultation.advice || '',
  };
  return JSON.stringify(payload);
}
