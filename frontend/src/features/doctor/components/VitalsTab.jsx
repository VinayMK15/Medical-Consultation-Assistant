import React from 'react';
import {
  calculateBmi,
  getBmiCategory,
  getBpCategory,
  getHrCategory,
  getSpo2Category,
  getTempCategory,
  hasContent,
} from '../../../shared/utils/consultation';

export default function VitalsTab({
  vitals,
  onChange,
  readOnly = false,
  onRequestConfirm,
}) {
  const v = vitals || {
    bp: '',
    hr: '',
    spo2: '',
    temp: '',
    bmi: '',
    weight: '',
    height: '',
  };

  const updateField = (field, value) => {
    if (readOnly) return;
    const next = { ...v, [field]: value };

    // Auto calculate BMI if height and weight change
    if (field === 'weight' || field === 'height') {
      const w = field === 'weight' ? value : next.weight;
      const h = field === 'height' ? value : next.height;
      if (w && h) {
        const calculated = calculateBmi(w, h);
        if (calculated) next.bmi = calculated;
      }
    }

    onChange(next);
  };

  // The "Normal Vitals" preset was removed from this tab. It wrote textbook
  // numbers (BP 120/80, HR 72, SpO2 99%, 98.6F, BMI 22.4, 68kg, 174cm) into a
  // real patient's record — measurements nobody took, which then flowed into
  // the printed report a patient may rely on. It carried no flag: demo mode
  // was gated behind VITE_DEMO_MODE, this was visible to every doctor in every
  // build. "Clear" stays — it removes data, it does not invent it.

  const doClearVitals = () => {
    onChange({
      bp: '',
      hr: '',
      spo2: '',
      temp: '',
      bmi: '',
      weight: '',
      height: '',
    });
  };

  // "Clear" previously wiped all seven fields on a single unconfirmed click,
  // losing real measurements with no way back. Confirm when there is anything
  // to lose; a no-op clear needs no prompt.
  const requestClear = () => {
    if (!hasContent(v)) {
      doClearVitals();
      return;
    }
    onRequestConfirm?.({
      title: 'Clear all vitals?',
      body: 'This erases the blood pressure, heart rate, oxygen saturation, temperature, height, weight and BMI you have recorded. This cannot be undone.',
      confirmLabel: 'Clear vitals',
      tone: 'danger',
      action: doClearVitals,
    });
  };

  const bpCat = getBpCategory(v.bp);
  const hrCat = getHrCategory(v.hr);
  const spo2Cat = getSpo2Category(v.spo2);
  const tempCat = getTempCategory(v.temp);
  const bmiCat = getBmiCategory(v.bmi);

  return (
    <div className="space-y-6">
      {/* Tab Header & Quick Presets */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h3l2.25-6 3 12 2.25-6h6.75" />
              </svg>
            </span>
            <h3 className="text-base font-bold text-slate-900">Patient Vitals & Biometrics</h3>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Recorded measurements sync directly with the official printed consultation report.
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={requestClear}
            className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-800 inline-flex items-center min-h-11"
          >
            Clear
          </button>
        )}
      </div>

      {/* Live Recorded Vitals Strip Banner (Exact style as Report) */}
      <div className="rounded-2xl border border-blue-200/90 bg-gradient-to-r from-blue-50/70 to-indigo-50/40 p-4 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs sm:text-sm">
            <span className="font-bold text-blue-900 tracking-wide flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-blue-600 animate-pulse" />
              Recorded Vitals:
            </span>
            <span className="text-slate-700">
              BP: <strong className="font-extrabold text-slate-900">{v.bp || '—'}</strong> mmHg
            </span>
            <span className="text-slate-700">
              HR: <strong className="font-extrabold text-slate-900">{v.hr || '—'}</strong> bpm
            </span>
            <span className="text-slate-700">
              SpO2: <strong className="font-extrabold text-slate-900">{v.spo2 ? `${v.spo2}%` : '—'}</strong>
            </span>
            <span className="text-slate-700">
              Temp: <strong className="font-extrabold text-slate-900">{v.temp ? `${v.temp}°F` : '—'}</strong>
            </span>
            <span className="text-slate-700">
              BMI: <strong className="font-extrabold text-slate-900">{v.bmi || '—'}</strong>
            </span>
          </div>
          <span className="self-start sm:self-auto rounded-full bg-white/80 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider text-blue-700 border border-blue-200/60">
            Print Preview Strip
          </span>
        </div>
      </div>

      {/* Vitals Form Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Blood Pressure */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="vitals-bp" className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Blood Pressure (BP)
            </label>
            {bpCat && (
              <span className={`rounded-md border px-1.5 py-0.5 text-xs font-bold ${bpCat.color}`}>
                {bpCat.label}
              </span>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              id="vitals-bp"
              type="text"
              aria-describedby="vitals-bp-hint"
              value={v.bp || ''}
              onChange={(e) => updateField('bp', e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 128/82"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pr-16 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
            />
            <span className="absolute right-3 pointer-events-none text-sm font-bold text-slate-500">
              mmHg
            </span>
          </div>
          <p id="vitals-bp-hint" className="mt-1.5 text-sm text-slate-600">Target: &lt; 120/80 mmHg</p>
        </div>

        {/* Heart Rate */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="vitals-hr" className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Heart Rate (HR)
            </label>
            {hrCat && (
              <span className={`rounded-md border px-1.5 py-0.5 text-xs font-bold ${hrCat.color}`}>
                {hrCat.label}
              </span>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              id="vitals-hr"
              type="number"
              aria-describedby="vitals-hr-hint"
              value={v.hr || ''}
              onChange={(e) => updateField('hr', e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 76"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pr-16 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
            />
            <span className="absolute right-3 pointer-events-none text-sm font-bold text-slate-500">
              bpm
            </span>
          </div>
          <p id="vitals-hr-hint" className="mt-1.5 text-sm text-slate-600">Normal resting: 60–100 bpm</p>
        </div>

        {/* Oxygen Saturation */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="vitals-spo2" className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Oxygen Saturation (SpO2)
            </label>
            {spo2Cat && (
              <span className={`rounded-md border px-1.5 py-0.5 text-xs font-bold ${spo2Cat.color}`}>
                {spo2Cat.label}
              </span>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              id="vitals-spo2"
              type="number"
              aria-describedby="vitals-spo2-hint"
              value={v.spo2 || ''}
              onChange={(e) => updateField('spo2', e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 98"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pr-16 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
            />
            <span className="absolute right-3 pointer-events-none text-sm font-bold text-slate-500">
              %
            </span>
          </div>
          <p id="vitals-spo2-hint" className="mt-1.5 text-sm text-slate-600">Target: 95%–100%</p>
        </div>

        {/* Body Temperature */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="vitals-temp" className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Temperature
            </label>
            {tempCat && (
              <span className={`rounded-md border px-1.5 py-0.5 text-xs font-bold ${tempCat.color}`}>
                {tempCat.label}
              </span>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              id="vitals-temp"
              type="number"
              step="0.1"
              aria-describedby="vitals-temp-hint"
              value={v.temp || ''}
              onChange={(e) => updateField('temp', e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 98.4"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pr-16 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
            />
            <span className="absolute right-3 pointer-events-none text-sm font-bold text-slate-500">
              °F
            </span>
          </div>
          <p id="vitals-temp-hint" className="mt-1.5 text-sm text-slate-600">Normal: 97.0°F – 99.0°F</p>
        </div>

        {/* Height & Weight */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="vitals-height" className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Height &amp; Weight
            </label>
            <span className="text-sm text-slate-600">Auto-calc BMI</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="relative flex items-center">
              <input
                id="vitals-height"
                type="number"
                aria-label="Height in centimetres"
                value={v.height || ''}
                onChange={(e) => updateField('height', e.target.value)}
                disabled={readOnly}
                placeholder="175"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3 pr-10 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
              />
              <span className="pointer-events-none absolute right-2 text-sm font-bold text-slate-500">
                cm
              </span>
            </div>
            <div className="relative flex items-center">
              <input
                id="vitals-weight"
                type="number"
                aria-label="Weight in kilograms"
                value={v.weight || ''}
                onChange={(e) => updateField('weight', e.target.value)}
                disabled={readOnly}
                placeholder="72"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-3 pr-10 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
              />
              <span className="pointer-events-none absolute right-2 text-sm font-bold text-slate-500">
                kg
              </span>
            </div>
          </div>
          <p className="mt-1.5 text-sm text-slate-600">Used for body mass indexing</p>
        </div>

        {/* Body Mass Index (BMI) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300">
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-bold uppercase tracking-wide text-slate-700">
              Body Mass Index (BMI)
            </label>
            {bmiCat && (
              <span className={`rounded-md border px-1.5 py-0.5 text-xs font-bold ${bmiCat.color}`}>
                {bmiCat.label}
              </span>
            )}
          </div>
          <div className="relative flex items-center">
            <input
              type="number"
              step="0.1"
              value={v.bmi || ''}
              onChange={(e) => updateField('bmi', e.target.value)}
              disabled={readOnly}
              placeholder="e.g. 23.6"
              className="w-full rounded-xl border border-slate-200 bg-slate-50 pr-16 px-3.5 py-3 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-600"
            />
            <span className="absolute right-3 pointer-events-none text-sm font-bold text-slate-500">
              kg/m²
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-600">Normal range: 18.5 – 24.9</p>
        </div>
      </div>
    </div>
  );
}
