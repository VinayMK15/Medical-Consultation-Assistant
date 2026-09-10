import React, { useState, useEffect, useRef, useContext } from 'react';
import { AuthContext } from '../../shared/context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../shared/utils/api';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  INDIA_CENTER,
  INDIA_BOUNDS,
  INDIA_MIN_ZOOM,
  INDIA_MAX_ZOOM,
  CITY_AREA_COORDS,
  CITY_COORDS,
} from '../../shared/constants/cities';
import VoiceInputModal from './components/VoiceInputModal';

// Smoothly re-centers the map when coords change
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Custom red pin for patient's location
const patientIcon = L.divIcon({
  className: 'custom-patient-marker',
  html: `
    <div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;">
      <div style="
        background-color: #DC2626;
        width: 24px;
        height: 24px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 3px 6px rgba(0,0,0,0.35);
        border: 2px solid #FFFFFF;
      ">
        <div style="
          width: 8px;
          height: 8px;
          background: white;
          border-radius: 50%;
          transform: rotate(45deg);
        "></div>
      </div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 30],
  popupAnchor: [0, -28],
});

// Resolves coordinates from address or city with area substring matching
function resolveCoordinates(address, city) {
  if (address) {
    if (CITY_AREA_COORDS[address]) {
      return CITY_AREA_COORDS[address];
    }
    const cleanAddr = address.toLowerCase();
    for (const [area, coords] of Object.entries(CITY_AREA_COORDS)) {
      if (cleanAddr.includes(area.toLowerCase())) {
        return coords;
      }
    }
  }
  if (city) {
    if (CITY_AREA_COORDS[city]) {
      return CITY_AREA_COORDS[city];
    }
    if (CITY_COORDS[city]) {
      return CITY_COORDS[city];
    }
  }
  return null;
}

// Haversine straight-line distance helper in km
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function RecenterMap({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords) {
      map.setView(coords, 12, { animate: true });
    }
  }, [coords, map]);
  return null;
}

// Renders the OSRM route as a glowing dual-layer Leaflet Polyline
// OSRM returns [lng, lat] pairs — Leaflet needs [lat, lng]
function RouteLayer({ geometry }) {
  if (!geometry || !geometry.coordinates) return null;
  const positions = geometry.coordinates.map(([lng, lat]) => [lat, lng]);
  return (
    <>
      {/* Outer contrast halo */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#065F46',
          weight: 7,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
      {/* Inner bright highlight */}
      <Polyline
        positions={positions}
        pathOptions={{
          color: '#10B981',
          weight: 4,
          opacity: 1,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </>
  );
}

function MatchedDoctorsPanel({
  doctors,
  city,
  isCollapsed,
  onToggle,
  onBookDoctor,
  bookedDoctorId,
  selectedDoctorId,
  onSelectDoctor,
}) {
  const title = doctors.length > 0 ? `${doctors.length} doctors near ${city}` : 'No matches yet';

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-left shadow-xl shadow-slate-900/10 backdrop-blur transition hover:bg-white"
        aria-label="Expand matched specialists"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Matched specialists</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{title}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Expand</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Matched specialists</p>
            <h3 className="mt-1 text-base font-bold text-slate-950">{title}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">
              {doctors.length > 0 ? 'Ready' : 'Waiting'}
            </span>
            <button
              type="button"
              onClick={onToggle}
              className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
              aria-label="Minimize matched specialists"
            >
              Minimize
            </button>
          </div>
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto p-3">
        {doctors.length === 0 ? (
          <div className="rounded-xl bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Enter symptoms and a city or area to see matched doctors here.
          </div>
        ) : (
          <div className="space-y-2">
            {doctors.map((doc, index) => {
              const isThisDoctorBooked = bookedDoctorId === doc.id;
              const isSearchLocked = bookedDoctorId !== null;
              const isSelected = selectedDoctorId === doc.id;

              return (
                <div
                  key={doc.id}
                  onClick={() => onSelectDoctor && onSelectDoctor(doc)}
                  className={`flex items-center justify-between gap-3 rounded-xl border p-4 transition cursor-pointer ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/60 ring-2 ring-emerald-400'
                      : 'border-slate-100 bg-slate-50 hover:bg-slate-100/80'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isSelected ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{doc.name}</p>
                      <p className="mt-1 text-xs font-bold uppercase tracking-wide text-blue-600">{doc.specialty}</p>
                      <p className="mt-2 text-xs leading-5 text-slate-500">{doc.address}</p>
                      {Boolean(doc.distance_km && doc.distance_km > 0) && (
                        <span
                          style={{
                            fontSize: "12px",
                            color: "#1D9E75",
                            fontWeight: "500",
                            marginTop: "4px",
                            display: "block",
                          }}
                        >
                          📍 {doc.distance_km} km away
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectDoctor && onSelectDoctor(doc);
                      }}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition shadow-sm ${
                        isSelected
                          ? 'bg-teal-600 text-white shadow-teal-500/20'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {isSelected ? '🗺️ Active' : '🗺️ Route'}
                    </button>

                    {isThisDoctorBooked ? (
                      <span className="rounded-lg border border-green-200 bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700 shadow-sm flex items-center gap-1">
                        ✓ Booked
                      </span>
                    ) : isSearchLocked ? (
                      <button
                        disabled
                        type="button"
                        title="You have already booked a doctor for this search entry."
                        className="rounded-lg border border-slate-200 bg-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-400 cursor-not-allowed opacity-80"
                      >
                        1 Booked Max
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBookDoctor(doc);
                        }}
                        className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                      >
                        Book Now
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatMessage({ msg, user }) {
  const [isPlaying, setIsPlaying] = useState(false);

  const handleSpeak = (text) => {
    if (!window.speechSynthesis) return;
    if (isPlaying) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setIsPlaying(false);
    utterance.onerror = () => setIsPlaying(false);
    setIsPlaying(true);
    window.speechSynthesis.speak(utterance);
  };

  if (msg.sender === 'bot') {
    return (
      <div className="flex gap-3 items-start group">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
          AI
        </div>
        <div className="max-w-[86%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
          {msg.text}
          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => handleSpeak(msg.text)}
              title={isPlaying ? 'Stop listening' : 'Listen to message'}
              className={`flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition ${
                isPlaying
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              }`}
            >
              {isPlaying ? (
                <>
                  <svg className="h-3.5 w-3.5 text-blue-600 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                  <span>Playing...</span>
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
                  </svg>
                  <span>Listen 🔊</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row-reverse gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold uppercase text-white">
        {user?.full_name ? user.full_name.charAt(0) : 'U'}
      </div>
      <div className="max-w-[86%] rounded-2xl rounded-tr-md bg-blue-600 px-4 py-3 text-sm leading-6 text-white shadow-sm shadow-blue-500/20">
        {msg.text}
      </div>
    </div>
  );
}

function LoadingMessage() {
  return (
    <div className="flex gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
        AI
      </div>
      <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
        Routing request...
      </div>
    </div>
  );
}

function SafetyNote() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
      MedAssist helps route you to doctors. It does not provide diagnosis, treatment, or emergency care.
    </div>
  );
}

function RouteSummary({ doctors, city, missingInfo, isRouting, isCollapsed, onToggle }) {
  const statusLabel = isRouting ? 'Routing' : doctors.length > 0 ? `${doctors.length} matches` : 'Ready';

  if (isCollapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 text-left shadow-xl shadow-slate-900/10 backdrop-blur transition hover:bg-white"
        aria-label="Expand routing map summary"
      >
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Routing map</p>
          <p className="mt-1 text-sm font-bold text-slate-950">{statusLabel}</p>
        </div>
        <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">Expand</span>
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white/95 p-5 shadow-xl shadow-slate-900/10 backdrop-blur">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Routing map</p>
          <h3 className="mt-1 text-lg font-bold text-slate-950">Doctor discovery</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${
            isRouting
              ? 'bg-amber-50 text-amber-700'
              : doctors.length > 0
                ? 'bg-green-50 text-green-700'
                : 'bg-blue-50 text-blue-700'
          }`}>
            {statusLabel}
          </span>
          <button
            type="button"
            onClick={onToggle}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
            aria-label="Minimize routing map summary"
          >
            Minimize
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-3">
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Search area</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">{city}</p>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Next input</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {missingInfo || 'Symptoms and location received'}
          </p>
        </div>
      </div>
    </div>
  );
}

// Generate a stable, unique session ID per user per browser tab.
// Stored in sessionStorage so it survives page refreshes but resets when
// the tab is closed — keeping sessions correctly isolated.
function getOrCreateSessionId(userEmail) {
  const key = `medassist_session_${userEmail || 'anon'}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${userEmail || 'anon'}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function BookingModal({ isOpen, onClose, doctor, onConfirm }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [availableSlots, setAvailableSlots] = useState([]);
  const [allSlots, setAllSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [slotError, setSlotError] = useState('');
  const [validationMsg, setValidationMsg] = useState('');

  // Reset everything when doctor changes or modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedDate('');
      setAvailableSlots([]);
      setAllSlots([]);
      setSelectedSlot('');
      setSymptoms('');
      setSlotError('');
      setValidationMsg('');
    }
  }, [isOpen, doctor?.id]);

  // Fetch available slots whenever date changes
  useEffect(() => {
    if (!selectedDate || !doctor?.id) {
      setAvailableSlots([]);
      setAllSlots([]);
      setSelectedSlot('');
      return;
    }

    const fetchSlots = async () => {
      setIsLoadingSlots(true);
      setSlotError('');
      setSelectedSlot('');
      try {
        const res = await api.get('/api/appointments/available-slots', {
          params: { doctor_id: doctor.id, date: selectedDate },
        });
        setAvailableSlots(res.data.available_slots || []);
        setAllSlots(res.data.all_slots || res.data.available_slots || []);
      } catch (err) {
        setSlotError(err.response?.data?.detail || 'Failed to load available slots.');
        setAvailableSlots([]);
        setAllSlots([]);
      } finally {
        setIsLoadingSlots(false);
      }
    };

    fetchSlots();
  }, [selectedDate, doctor?.id]);

  if (!isOpen) return null;

  const doctorInitials = doctor?.name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'DR';

  /** Format "HH:MM" → "9:00 AM" */
  const formatTo12h = (time24) => {
    const [h, m] = time24.split(':').map(Number);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${display}:${String(m).padStart(2, '0')} ${suffix}`;
  };

  /** Format "YYYY-MM-DD" → "Mon, May 19" */
  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationMsg('');

    if (!selectedDate) {
      setValidationMsg('Please select a date.');
      return;
    }
    if (!selectedSlot) {
      setValidationMsg('Please select a time slot.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onConfirm({
        doctor_id: doctor.id,
        appointment_date: selectedDate,
        slot_time: selectedSlot,
        symptoms_summary: symptoms.trim() || 'Routine Checkup',
      });
    } catch (err) {
      // Show the error message inside the modal
      const detail = err?.response?.data?.detail || err?.message || 'Booking failed. Please try again.';
      setValidationMsg(typeof detail === 'string' ? detail : JSON.stringify(detail));
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl max-h-[90vh] flex flex-col">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5 shrink-0">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-100 text-lg font-bold text-blue-700">
            {doctorInitials}
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-600">Book Appointment</p>
            <h3 className="mt-0.5 truncate text-lg font-bold text-slate-900">{doctor?.name}</h3>
            {doctor?.specialty && (
              <span className="mt-1 inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700">
                {doctor.specialty}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* ── Form (scrollable body) ── */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

            {/* Step 1 — Date Picker */}
            <div>
              <label
                htmlFor="booking-date"
                className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-[10px] font-bold text-blue-700">1</span>
                Select Date
              </label>
              <input
                id="booking-date"
                type="date"
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={today}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
              {selectedDate && (
                <p className="mt-1.5 text-xs text-slate-400">{formatDateDisplay(selectedDate)}</p>
              )}
            </div>

            {/* Step 2 — Slot Grid */}
            <div>
              <label className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-[10px] font-bold text-blue-700">2</span>
                Select Time Slot
              </label>

              {!selectedDate ? (
                /* No date selected yet */
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                  <p className="text-2xl">📅</p>
                  <p className="mt-2 text-sm font-medium text-slate-400">Pick a date first to see available slots</p>
                </div>
              ) : isLoadingSlots ? (
                /* Loading spinner */
                <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-8">
                  <div className="text-center">
                    <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-[3px] border-blue-200 border-t-blue-600" />
                    <p className="text-xs font-semibold text-slate-400">Loading available slots…</p>
                  </div>
                </div>
              ) : slotError ? (
                /* Fetch error */
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-center">
                  <p className="text-sm font-medium text-red-600">{slotError}</p>
                </div>
              ) : (allSlots.length === 0 && availableSlots.length === 0) ? (
                /* Doctor fully booked or no slots */
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-8 text-center">
                  <p className="text-2xl">😔</p>
                  <p className="mt-2 text-sm font-bold text-amber-700">No available slots on this date</p>
                  <p className="mt-1 text-xs text-amber-600">The doctor is fully booked or not working. Please select another date.</p>
                </div>
              ) : (
                /* Slot pill grid */
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {availableSlots.length} available
                      </span>
                      {allSlots.length - availableSlots.length > 0 && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 border border-red-100">
                          {allSlots.length - availableSlots.length} booked
                        </span>
                      )}
                    </div>
                    {selectedSlot && (
                      <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-700">
                        Selected: {formatTo12h(selectedSlot)}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {(allSlots.length > 0 ? allSlots : availableSlots).map((slot) => {
                      const isAvailable = availableSlots.includes(slot);
                      if (!isAvailable) {
                        return (
                          <div
                            key={slot}
                            title="This slot is already booked"
                            className="flex flex-col items-center justify-center rounded-lg border border-slate-200 bg-slate-100/90 px-2 py-2 text-center text-slate-400 opacity-75 cursor-not-allowed select-none"
                          >
                            <span className="text-xs font-semibold line-through text-slate-400">{formatTo12h(slot)}</span>
                            <span className="mt-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-tight text-red-600">
                              Booked
                            </span>
                          </div>
                        );
                      }

                      return (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setSelectedSlot(slot);
                            setValidationMsg('');
                          }}
                          className={`rounded-lg border px-3 py-2.5 text-xs font-bold transition ${
                            selectedSlot === slot
                              ? 'border-blue-400 bg-blue-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]'
                              : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                        >
                          {formatTo12h(slot)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Step 3 — Symptoms */}
            <div>
              <label
                htmlFor="booking-symptoms"
                className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md bg-blue-100 text-[10px] font-bold text-blue-700">3</span>
                Reason for Visit
                <span className="normal-case font-medium text-slate-400">(Optional)</span>
              </label>
              <textarea
                id="booking-symptoms"
                rows={3}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Briefly describe your symptoms or reason for the visit..."
                className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* ── Footer Actions ── */}
          <div className="border-t border-slate-100 px-6 py-4 shrink-0">
            {validationMsg && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">
                ⚠ {validationMsg}
              </p>
            )}

            {/* Booking Summary */}
            {selectedDate && selectedSlot && (
              <div className="mb-3 flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2">
                <span className="text-sm">📋</span>
                <p className="text-xs font-semibold text-blue-800">
                  {formatDateDisplay(selectedDate)} at {formatTo12h(selectedSlot)} with {doctor?.name}
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">You can cancel before the appointment.</p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedDate || !selectedSlot}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? (
                    <>
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Confirming…
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    {
      sender: 'bot',
      text: "Hi, I'm the MedAssist routing assistant. Tell me your symptoms and your city or area, and I'll help find relevant doctors nearby.",
    },
  ]);
  const [missingInfo, setMissingInfo] = useState('Symptoms and city or area');
  const [mapCenter, setMapCenter] = useState(null);
  const [mapCity, setMapCity] = useState('Bangalore');
  const [doctors, setDoctors] = useState([]);
  const [isRouting, setIsRouting] = useState(false);
  const [isRouteSummaryCollapsed, setIsRouteSummaryCollapsed] = useState(false);
  const [isDoctorsPanelCollapsed, setIsDoctorsPanelCollapsed] = useState(false);
  const chatBottomRef = useRef(null);

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [bookedDoctorId, setBookedDoctorId] = useState(null);

  const [activeRoute, setActiveRoute]   = useState(null);   // GeoJSON LineString geometry
  const [routeInfo, setRouteInfo]       = useState(null);   // { distanceKm, durationMins }
  const [routeLoading, setRouteLoading] = useState(false);  // true while OSRM fetches

  const [locationMode, setLocationMode] = useState('live'); // 'home' | 'live'
  const [homeLocation, setHomeLocation] = useState(null); // { lat, lng, label } loaded from profile
  const [patientCoords, setPatientCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [patientPin, setPatientPin] = useState(null); // { lat, lng, label } — visible red pin on map

  // Load patient home location from profile on mount
  useEffect(() => {
    api.get('/api/patient/profile').then((res) => {
      const p = res.data;
      if (p) {
        const label = p.address
          ? `${p.address}, ${p.city || ''}`
          : p.city || '';
        
        // Check for specific area match in address (e.g. Indiranagar)
        const specificAreaCoords = resolveCoordinates(p.address, null);
        if (specificAreaCoords) {
          setHomeLocation({
            lat: specificAreaCoords[0],
            lng: specificAreaCoords[1],
            label: label || 'Home Location',
          });
        } else if (p.lat && p.lng) {
          setHomeLocation({
            lat: parseFloat(p.lat),
            lng: parseFloat(p.lng),
            label: label || 'Home Location',
          });
        } else {
          const coords = resolveCoordinates(p.address, p.city);
          if (coords) {
            setHomeLocation({
              lat: coords[0],
              lng: coords[1],
              label: label || p.city || 'Home Location',
            });
          } else {
            setHomeLocation({
              lat: null,
              lng: null,
              label: label || p.city || 'Home Location',
            });
          }
        }
      }
    }).catch(() => {});
  }, []);

  const handleLiveLocation = () => {
    setLocationStatus('Detecting...');
    if (!navigator.geolocation) {
      setLocationStatus('Geolocation not supported by your browser');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setPatientCoords(coords);
        setLocationStatus('📍 Live location ready');
        setMapCenter([coords.lat, coords.lng]);
        // Scenario 2: update patient pin to real GPS coords
        const pin = {
          lat:   coords.lat,
          lng:   coords.lng,
          label: '📍 Your Live Location',
        };
        setPatientPin(pin);
        if (doctors.length > 0) {
          fetchRoute(selectedDoctor || doctors[0], pin);
        }
      },
      () => {
        setPatientCoords(null);
        setLocationStatus('Using city from your message');
      },
      { timeout: 8000 }
    );
  };

  // Fetch a real road route from OSRM between patient and a selected doctor
  const fetchRoute = async (doctor, customPin = null) => {
    if (!doctor) return;

    // Resolve patient coordinates from any available source
    const activePin = customPin || patientPin;
    const patLat =
      activePin?.lat ??
      (locationMode === 'home' ? homeLocation?.lat : patientCoords?.lat) ??
      homeLocation?.lat ??
      patientCoords?.lat ??
      (mapCenter ? mapCenter[0] : null);

    const patLng =
      activePin?.lng ??
      (locationMode === 'home' ? homeLocation?.lng : patientCoords?.lng) ??
      homeLocation?.lng ??
      patientCoords?.lng ??
      (mapCenter ? mapCenter[1] : null);

    let docLat = doctor.lat;
    let docLng = doctor.lng;
    if (!docLat || !docLng || (docLat === 0 && docLng === 0)) {
      const docCoords = resolveCoordinates(doctor.address, doctor.city || mapCity);
      if (docCoords) {
        docLat = docCoords[0];
        docLng = docCoords[1];
      } else if (mapCenter) {
        docLat = mapCenter[0];
        docLng = mapCenter[1];
      }
    }

    // Guard: skip if either endpoint cannot be resolved
    if (!patLat || !patLng || !docLat || !docLng) {
      setActiveRoute(null);
      setRouteInfo(null);
      return;
    }

    setRouteLoading(true);
    setSelectedDoctor(doctor);

    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${patLng},${patLat};${docLng},${docLat}` +
        `?overview=full&geometries=geojson`;

      const res = await fetch(url);
      const data = await res.json();

      if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        setActiveRoute(route.geometry);
        setRouteInfo({
          distanceKm: (route.distance / 1000).toFixed(1),
          durationMins: Math.ceil(route.duration / 60),
        });
      } else {
        // Fallback straight-line polyline if driving route calculation is unavailable
        setActiveRoute({
          type: 'LineString',
          coordinates: [
            [patLng, patLat],
            [docLng, docLat],
          ],
        });
        const distKm = calculateDistance(patLat, patLng, docLat, docLng).toFixed(1);
        setRouteInfo({
          distanceKm: distKm,
          durationMins: Math.ceil((distKm / 30) * 60) || 5,
        });
      }
    } catch {
      // Fallback straight-line polyline on network error or offline OSRM
      setActiveRoute({
        type: 'LineString',
        coordinates: [
          [patLng, patLat],
          [docLng, docLat],
        ],
      });
      const distKm = calculateDistance(patLat, patLng, docLat, docLng).toFixed(1);
      setRouteInfo({
        distanceKm: distKm,
        durationMins: Math.ceil((distKm / 30) * 60) || 5,
      });
    } finally {
      setRouteLoading(false);
    }
  };

  const clearRoute = () => {
    setActiveRoute(null);
    setRouteInfo(null);
    setSelectedDoctor(null);
    setRouteLoading(false);
  };

  const handleBookDoctor = (doctor) => {
    if (bookedDoctorId) {
      return;
    }
    setSelectedDoctor(doctor);
    setIsModalOpen(true);
  };

  const handleConfirmBooking = async (payload) => {
    try {
      await api.post('/api/appointments', payload);
      setIsModalOpen(false);
      if (selectedDoctor?.id) {
        setBookedDoctorId(selectedDoctor.id);
      }
      setSelectedDoctor(null);
      // Add a success message to chat instead of a blocking alert
      setMessages((prev) => [
        ...prev,
        {
          sender: 'bot',
          text: `Your appointment has been booked successfully! You'll find it in your profile under Appointment History.`,
        },
      ]);
    } catch (error) {
      console.error('Failed to book appointment:', error);
      // Re-throw with the original error so the modal can display the detail
      throw error;
    }
  };

  // Stable session ID: unique per user per tab, persists across refreshes
  const sessionIdRef = useRef(getOrCreateSessionId(user?.email));

  const patientName = user?.full_name || user?.name || 'Patient';

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRouting]);

  const sendMessageWithText = async (customText) => {
    const userText = (customText !== undefined ? customText : chatInput).trim();
    if (!userText || isRouting) return;

    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');
    setIsRouting(true);
    setBookedDoctorId(null); // Reset single booking lock for fresh search entry

    // Resolve which coords to send based on active mode
    const resolvedLat = locationMode === 'home'
      ? homeLocation?.lat
      : patientCoords?.lat ?? null;

    const resolvedLng = locationMode === 'home'
      ? homeLocation?.lng
      : patientCoords?.lng ?? null;

    try {
      const response = await api.post('/process', {
        text: userText,
        message: userText,
        session_id: sessionIdRef.current,
        patient_lat: resolvedLat ?? null,
        patient_lng: resolvedLng ?? null,
      });
      const data = response.data;

      setMessages((prev) => [...prev, { sender: 'bot', text: data.reply }]);

      let currentCenter = mapCenter;
      if (data.city && CITY_COORDS[data.city]) {
        currentCenter = CITY_COORDS[data.city];
        setMapCenter(currentCenter);
        setMapCity(data.area || data.city);
      }

      if (data.status === 'incomplete') {
        setMissingInfo(data.city ? 'Symptoms' : 'City or area');
      } else {
        setMissingInfo(null);
      }

      let activePin = patientPin;
      if (locationMode === 'home' && homeLocation && homeLocation.lat && homeLocation.lng) {
        activePin = {
          lat:   homeLocation.lat,
          lng:   homeLocation.lng,
          label: `🏠 ${homeLocation.label}`,
        };
        setPatientPin(activePin);
      } else if (locationMode === 'live' && !patientCoords) {
        // Scenario 1: typed address — GPS not active, use NLP-resolved coords echoed back
        const nlpLat = data.patient_lat || null;
        const nlpLng = data.patient_lng || null;
        if (nlpLat && nlpLng) {
          activePin = {
            lat:   nlpLat,
            lng:   nlpLng,
            label: data.area
              ? `${data.area}, ${data.city}`
              : data.city || 'Your Location',
          };
          setPatientPin(activePin);
        }
      }

      clearRoute(); // Clear previous route on new search
      const sorted = (data.doctors || []).sort((a, b) =>
        (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity)
      );
      setDoctors(sorted);

      // Automatically highlight route to the nearest matched doctor
      if (sorted.length > 0) {
        fetchRoute(sorted[0], activePin);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Sorry, I could not reach the routing server. Please try again.' },
      ]);
    } finally {
      setIsRouting(false);
    }
  };

  const handleSendMessage = () => sendMessageWithText();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-[1000] border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-xl font-bold text-white shadow-sm shadow-blue-500/20">
              M
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-950">MedAssist</h1>
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-teal-600">Doctor routing workspace</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-green-100 bg-green-50 px-3 py-1 text-xs font-bold text-green-700">
              Routing active
            </span>
            <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold uppercase text-white">
                {patientName.charAt(0)}
              </span>
              <span className="text-sm font-semibold text-slate-700">{patientName}</span>
            </div>
            <button
              onClick={() => navigate('/profile')}
              className="flex items-center justify-center rounded-full border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-blue-600"
              aria-label="Profile Settings"
              title="Profile Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
              </svg>
            </button>
            <button
              onClick={logout}
              className="rounded-full border border-red-100 bg-red-50 px-4 py-2 text-xs font-bold text-red-600 transition hover:bg-red-100"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="grid h-[calc(100vh-77px)] grid-cols-1 grid-rows-[1fr_1fr] lg:grid-rows-1 lg:grid-cols-[500px_1fr] xl:grid-cols-[560px_1fr] overflow-hidden">
        <section className="flex h-full min-h-0 flex-col border-r border-slate-200 bg-slate-50">
          <div className="border-b border-slate-200 bg-white px-5 py-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-600">Routing intake</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Find a relevant doctor</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Share symptoms and location. MedAssist maps the request to a specialist category and nearby doctors.
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="space-y-5">
              <SafetyNote />
              {messages.map((msg, index) => (
                <ChatMessage key={index} msg={msg} user={user} />
              ))}
              {isRouting && <LoadingMessage />}
              <div ref={chatBottomRef} />
            </div>
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {missingInfo && (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                  Needs: {missingInfo}
                </span>
              )}
              <span className="rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-blue-700">
                Doctor routing only
              </span>
            </div>

            {/* Location Mode Toggle */}
            <div style={{
              display: 'flex', gap: '8px',
              marginBottom: '10px', flexWrap: 'wrap'
            }}>
              {/* Home Mode */}
              <button
                type="button"
                onClick={() => {
                  setLocationMode('home');
                  // Scenario 3: update patient pin to saved home location
                  if (homeLocation && homeLocation.lat && homeLocation.lng) {
                    const pin = {
                      lat:   homeLocation.lat,
                      lng:   homeLocation.lng,
                      label: `🏠 ${homeLocation.label}`,
                    };
                    setPatientPin(pin);
                    setMapCenter([homeLocation.lat, homeLocation.lng]);
                    if (doctors.length > 0) {
                      fetchRoute(selectedDoctor || doctors[0], pin);
                    }
                  }
                }}
                disabled={!homeLocation}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: locationMode === 'home' ? '#1D9E75' : '#D1D5DB',
                  background: locationMode === 'home' ? '#E1F5EE' : 'transparent',
                  color: locationMode === 'home' ? '#0F6E56' : '#6B7280',
                  fontWeight: '500', fontSize: '13px',
                  cursor: homeLocation ? 'pointer' : 'not-allowed',
                  opacity: homeLocation ? 1 : 0.5
                }}
              >
                🏠 {homeLocation ? homeLocation.label : 'Set Home in Profile'}
              </button>

              {/* Live Mode */}
              <button
                type="button"
                onClick={() => {
                  setLocationMode('live');
                  setPatientPin(null); // clear home pin before GPS detects
                  handleLiveLocation();
                }}
                style={{
                  padding: '6px 16px',
                  borderRadius: '20px',
                  border: '1px solid',
                  borderColor: locationMode === 'live' ? '#1D9E75' : '#D1D5DB',
                  background: locationMode === 'live' ? '#E1F5EE' : 'transparent',
                  color: locationMode === 'live' ? '#0F6E56' : '#6B7280',
                  fontWeight: '500', fontSize: '13px',
                  cursor: 'pointer'
                }}
              >
                📍 {locationMode === 'live' && patientCoords
                  ? 'Live On'
                  : 'Live Location'}
              </button>

              {locationStatus && (
                <span style={{ fontSize: '12px', color: '#9CA3AF', alignSelf: 'center' }}>
                  {locationStatus}
                </span>
              )}
            </div>

            <div className="flex items-end gap-2.5">
              <div className="flex-1 flex items-end rounded-xl border border-slate-200 bg-slate-50 p-2.5 transition focus-within:border-blue-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <textarea
                  rows="2"
                  className="w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none"
                  placeholder="Describe your symptoms (e.g. chest pain near Indiranagar)..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                
                {/* Voice Input Trigger Button */}
                <button
                  type="button"
                  onClick={() => setIsVoiceModalOpen(true)}
                  title="Speak symptoms in Hindi, Tamil, Telugu, etc."
                  className="ml-2 mb-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition hover:bg-blue-100 hover:text-blue-700 active:scale-95 shadow-sm"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
              </div>

              <button
                type="button"
                onClick={handleSendMessage}
                disabled={isRouting || !chatInput.trim()}
                className="flex h-[46px] items-center justify-center rounded-xl bg-blue-600 px-5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isRouting ? 'Routing...' : 'Send'}
              </button>
            </div>
          </div>
        </section>

        <section className="relative h-full min-h-0 bg-slate-200">
          <div className="absolute left-5 top-5 z-[500] w-[min(360px,calc(100%-40px))]">
            <RouteSummary
              doctors={doctors}
              city={mapCity}
              missingInfo={missingInfo}
              isRouting={isRouting}
              isCollapsed={isRouteSummaryCollapsed}
              onToggle={() => setIsRouteSummaryCollapsed((prev) => !prev)}
            />
          </div>

          <div className="absolute bottom-5 right-5 z-[500] w-[min(460px,calc(100%-40px))]">
            <MatchedDoctorsPanel
              doctors={doctors}
              city={mapCity}
              isCollapsed={isDoctorsPanelCollapsed}
              onToggle={() => setIsDoctorsPanelCollapsed((prev) => !prev)}
              onBookDoctor={handleBookDoctor}
              bookedDoctorId={bookedDoctorId}
              selectedDoctorId={selectedDoctor?.id}
              onSelectDoctor={fetchRoute}
            />
          </div>

          <MapContainer
            center={mapCenter || INDIA_CENTER}
            zoom={mapCenter ? 12 : 5}
            minZoom={INDIA_MIN_ZOOM}
            maxZoom={INDIA_MAX_ZOOM}
            maxBounds={INDIA_BOUNDS}
            maxBoundsViscosity={1.0}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              bounds={INDIA_BOUNDS}
            />

            {doctors.map((doc) => {
              let markerLat = doc.lat;
              let markerLng = doc.lng;
              if (!markerLat || !markerLng || (markerLat === 0 && markerLng === 0)) {
                const fallback = CITY_COORDS[mapCity] || mapCenter || INDIA_CENTER;
                markerLat = fallback[0];
                markerLng = fallback[1];
              }
              const isThisDoctorBooked = bookedDoctorId === doc.id;
              const isSearchLocked = bookedDoctorId !== null;
              const isSelected = selectedDoctor?.id === doc.id;

              return (
                <Marker
                  key={doc.id}
                  position={[markerLat, markerLng]}
                  eventHandlers={{ click: () => fetchRoute(doc) }}
                >
                  <Popup>
                    <div style={{ minWidth: '180px' }}>
                      <b style={{ fontSize: '14px' }}>{doc.name}</b>
                      <p style={{ margin: '4px 0', color: '#6B7280', fontSize: '13px' }}>
                        {doc.specialty}
                      </p>
                      <p style={{ margin: '4px 0', fontSize: '12px' }}>{doc.address}</p>

                      {Boolean(doc.distance_km && doc.distance_km > 0) && (
                        <p style={{ margin: '4px 0', color: '#1D9E75', fontSize: '12px', fontWeight: '500' }}>
                          📍 {doc.distance_km} km away
                        </p>
                      )}

                      {/* OSRM route info — only shows on the selected doctor's popup */}
                      {isSelected && routeLoading && (
                        <p style={{ margin: '6px 0 2px', fontSize: '12px', color: '#9CA3AF' }}>
                          🗺️ Calculating route...
                        </p>
                      )}
                      {isSelected && routeInfo && (
                        <div style={{
                          marginTop: '8px', padding: '6px 10px',
                          background: '#E1F5EE', borderRadius: '8px',
                          fontSize: '12px', color: '#085041',
                        }}>
                          🛣️ {routeInfo.distanceKm} km by road
                          &nbsp;·&nbsp;
                          🕐 ~{routeInfo.durationMins} mins
                        </div>
                      )}

                      {/* Booking controls */}
                      {isThisDoctorBooked ? (
                        <span className="mt-2 block w-full text-center rounded border border-green-200 bg-green-100 py-1 text-xs font-bold text-green-700">
                          ✓ Booked
                        </span>
                      ) : isSearchLocked ? (
                        <button
                          disabled
                          className="mt-2 w-full rounded border border-slate-200 bg-slate-200 py-1 text-xs font-semibold text-slate-400 cursor-not-allowed"
                        >
                          1 Booked Max
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBookDoctor(doc)}
                          className="mt-2 w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
                        >
                          Book Now
                        </button>
                      )}

                      {/* Clear route button — only shown when a route is active for this doctor */}
                      {isSelected && routeInfo && (
                        <button
                          onClick={(e) => { e.stopPropagation(); clearRoute(); }}
                          style={{
                            marginTop: '8px', width: '100%', padding: '5px',
                            borderRadius: '6px', border: '1px solid #D1D5DB',
                            background: 'transparent', fontSize: '12px',
                            color: '#6B7280', cursor: 'pointer',
                          }}
                        >
                          ✕ Clear Route
                        </button>
                      )}
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            <RecenterMap coords={mapCenter} />

            {/* OSRM Route Layer — green polyline following real roads */}
            {activeRoute && <RouteLayer geometry={activeRoute} />}

            {/* Patient Location Pin — red, always on top of doctor pins */}
            {patientPin && patientPin.lat && patientPin.lng && (
              <Marker
                position={[patientPin.lat, patientPin.lng]}
                icon={patientIcon}
                zIndexOffset={1000}
              >
                <Popup>
                  <div style={{ minWidth: '160px' }}>
                    <b style={{ fontSize: '13px', color: '#DC2626' }}>
                      Your Location
                    </b>
                    <p style={{
                      margin: '4px 0 0',
                      fontSize: '12px',
                      color: '#6B7280',
                    }}>
                      {patientPin.label}
                    </p>
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </section>
      </main>

      {/* Modals placed outside main structural layout */}
      <BookingModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        doctor={selectedDoctor} 
        onConfirm={handleConfirmBooking} 
      />

      {/* Voice Input Modal for Regional Languages */}
      <VoiceInputModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onApplyText={(spokenText) => {
          sendMessageWithText(spokenText);
        }}
      />
    </div>
  );
}
