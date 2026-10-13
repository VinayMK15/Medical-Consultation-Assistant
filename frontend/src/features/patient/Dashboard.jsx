import React, { useState, useEffect, useRef, useContext } from 'react';
import { Helmet } from 'react-helmet-async';
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
import { buildIcs, downloadTextFile } from '../../shared/utils/calendar';
import {
  formatTo12h,
  formatDateLong,
  todayKey,
  // The shared export is `slotPeriod`; aliased because this file already
  // uses `slotPeriod` for the active-period state below.
  slotPeriod as periodOf,
  // Aliased so the ~20 existing call sites in this file keep their name.
  formatDateShort as formatDateDisplay,
} from '../../shared/utils/datetime';
import { SlotPeriodIcon } from '../../shared/components/ui/icons';
import Modal from '../../shared/components/ui/Modal';
import SkipLink from '../../shared/components/SkipLink';
import BrandLogo from '../../shared/components/BrandLogo';
import useDocumentTitle from '../../hooks/useDocumentTitle';

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

// Grey pin for background/unmatched doctors
const greyIcon = L.divIcon({
  className: 'custom-doctor-marker-grey',
  html: `
    <div style="display: flex; align-items: center; justify-content: center; width: 26px; height: 26px;">
      <div style="
        background-color: #9CA3AF;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
      "></div>
    </div>
  `,
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

// Blue pin for matched doctors (search results)
const blueIcon = L.divIcon({
  className: 'custom-doctor-marker-blue',
  html: `
    <div style="display: flex; align-items: center; justify-content: center; width: 30px; height: 30px;">
      <div style="
        background-color: #2563EB;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
      "></div>
    </div>
  `,
  iconSize: [30, 30],
  iconAnchor: [15, 15],
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

function InvalidateMapSize({ trigger }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [trigger, map]);
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
  onBookDoctor,
  selectedDoctorId,
  onSelectDoctor,
}) {
  const title = doctors.length > 0 ? `${doctors.length} near ${city}` : 'Find Specialists';

  return (
    // `lg:h-full` for the desktop overlay panel; on small screens this sits in
    // normal flow, so it needs an explicit height for its own internal scroll.
    <div className="flex max-h-[70vh] min-h-[320px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-full lg:max-h-none lg:min-h-0">
      {/* Header */}
      <div className="shrink-0 border-b border-slate-100 bg-white px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Matched Specialists</p>
            <h3 className="mt-0.5 text-xs font-bold text-slate-900 truncate">{title}</h3>
          </div>
          {doctors.length > 0 && (
            <span className="rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
              {doctors.length} found
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        {doctors.length === 0 ? (
          /* ── Styled empty placeholder ── */
          <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
            <div className="text-center px-3">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-1.5">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-xs font-bold text-slate-700">Enter symptoms to find doctors</p>
              <p className="mt-0.5 text-sm leading-5 text-slate-600">Type your symptoms in chat — matched specialists will appear here.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {doctors.map((doc, index) => {
              const isSelected = selectedDoctorId === doc.id;

              // The card is the click target again: tapping anywhere draws the
              // route, as it did before. It keeps role/tabIndex/key handling so
              // this is not mouse-only once more, and the two inner buttons stop
              // propagation so they do not fire the route a second time.
              // (A <button> inside a <button> would be invalid HTML, which is why
              // the card is a div with role="button" rather than a real button.)
              return (
                <div
                  key={doc.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectDoctor?.(doc)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
                      e.preventDefault();
                      onSelectDoctor?.(doc);
                    }
                  }}
                  aria-pressed={isSelected}
                  aria-label={`Show route to ${doc.name}, ${doc.specialty}`}
                  className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-2.5 transition group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${isSelected
                      ? 'border-emerald-200 bg-emerald-50/70 ring-2 ring-emerald-400 shadow-sm'
                      : 'border-slate-100 bg-slate-50 hover:border-blue-200 hover:bg-blue-50/40'
                    }`}
                >
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isSelected ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white'
                        }`}>
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 leading-tight truncate">{doc.name}</p>
                        <p className="mt-0.5 text-xs font-bold uppercase tracking-wide text-blue-600">{doc.specialty}</p>
                        <p className="mt-0.5 text-xs leading-4 text-slate-600 truncate">{doc.address}</p>
                        {Boolean(doc.distance_km && doc.distance_km > 0) && (
                          <p className="mt-0.5 text-xs font-semibold text-emerald-700">
                            📍 {doc.distance_km} km away
                          </p>
                        )}
                      </div>
                    </div>

                    {/* On Map badge — sits opposite the doctor info in the top row */}
                    {isSelected && (
                      <span className="flex shrink-0 items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-xs font-bold text-emerald-700">
                        <svg aria-hidden="true" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        On Map
                      </span>
                    )}
                  </div>

                  {/* Book Now spans the full card width as its own row. It was
                      crammed into a narrow right-hand column under the (now
                      removed) View route button, which made the card lopsided
                      and gave the primary action too little room. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation(); // booking must not also draw the route
                      onBookDoctor(doc);
                    }}
                    aria-label={`Book an appointment with ${doc.name}`}
                    className="flex min-h-11 w-full items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1"
                  >
                    Book Now
                  </button>
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
      <div className="flex gap-3 items-start group animate-in fade-in slide-in-from-bottom-2 duration-300">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white shadow-md ring-2 ring-white">
          AI
        </div>
        <div className="max-w-[86%] rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 shadow-sm">
          {msg.text}
          <div className="mt-2 flex items-center justify-end">
            <button
              type="button"
              onClick={() => handleSpeak(msg.text)}
              title={isPlaying ? 'Stop listening' : 'Listen to message'}
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition ${isPlaying
                ? 'bg-blue-50 text-blue-600'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
            >
              {isPlaying ? (
                <>
                  <svg className="h-3 w-3 text-blue-600" fill="currentColor" viewBox="0 0 24 24">
                    <rect x="6" y="6" width="12" height="12" rx="2" />
                  </svg>
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M11 5L6 9H2v6h4l5 4V5z" />
                  </svg>
                  <span>Listen</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-row-reverse gap-3 items-end animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold uppercase text-slate-600 ring-2 ring-white">
        {user?.full_name ? user.full_name.charAt(0) : 'U'}
      </div>
      <div className="max-w-[86%] rounded-2xl rounded-br-sm bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 text-sm leading-relaxed text-white shadow-md shadow-blue-500/20">
        {msg.text}
      </div>
    </div>
  );
}

function LoadingMessage() {
  return (
    <div className="flex gap-3 animate-in fade-in duration-300">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white shadow-md ring-2 ring-white">
        AI
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-slate-100 bg-white px-5 py-3.5 shadow-sm flex items-center gap-2">
        <span className="flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-1.5 w-1.5 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
    </div>
  );
}

// Generate a stable, unique session ID per user per browser tab.
// Stored in sessionStorage so it survives page refreshes but resets when
// the tab is closed — keeping sessions correctly isolated.
function RecentAppointmentsPanel({ appointments, loading, onViewAll }) {
  // Newest first. A missing/unparseable appointment_date yields NaN from
  // getTime(), and `bDate - aDate` with a NaN operand is NaN — which makes
  // Array#sort treat the element as unordered and drop it in an
  // implementation-defined spot. Parse defensively and sort undated rows last
  // so the panel stays deterministic.
  const timeOf = (a) => {
    if (!a.appointment_date) return NaN;
    const t = new Date(`${a.appointment_date}T${a.slot_time || '00:00'}`).getTime();
    return Number.isNaN(t) ? NaN : t;
  };
  const recentAppointments = appointments
    .slice()
    .sort((a, b) => {
      const aDate = timeOf(a);
      const bDate = timeOf(b);
      if (Number.isNaN(aDate) && Number.isNaN(bDate)) return 0;
      if (Number.isNaN(aDate)) return 1;
      if (Number.isNaN(bDate)) return -1;
      return bDate - aDate;
    })
    .slice(0, 3);

  return (
    <section className="flex max-h-[70vh] min-h-[260px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:h-full lg:max-h-none lg:min-h-0">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-2.5">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Appointments</p>
          <h3 className="text-xs font-bold text-slate-900 leading-tight">Recent activity</h3>
        </div>
        <button
          type="button"
          onClick={onViewAll}
          className="flex min-h-11 items-center gap-0.5 rounded-lg px-2 text-sm font-bold text-blue-600 transition hover:bg-blue-50 hover:text-blue-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          View all
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-12 animate-pulse rounded-lg bg-slate-100" />
            ))}
          </div>
        ) : recentAppointments.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-4 text-center">
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-500 mb-1.5">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-slate-700">No appointments yet</p>
            <p className="mt-0.5 text-xs text-slate-500">Your booked consultations will appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentAppointments.map((appointment) => {
              const status = appointment.status || 'Pending';
              const isCancelled = status.toLowerCase() === 'cancelled';
              const isCompleted = status.toLowerCase() === 'completed';
              const formattedDate = appointment.appointment_date
                ? new Date(`${appointment.appointment_date}T00:00:00`).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                : 'TBD';

              return (
                <div
                  key={appointment.id}
                  className="flex items-center justify-between gap-2.5 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 transition hover:bg-blue-50/40 hover:border-blue-100"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-xs font-bold text-slate-900 leading-tight">{appointment.doctor_name}</p>
                      <span className="truncate text-xs font-semibold text-blue-600">· {appointment.specialty}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 font-medium">
                      🗓️ {formattedDate}{appointment.slot_time ? ` at ${appointment.slot_time}` : ''}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${isCancelled
                        ? 'bg-red-50 text-red-700 border border-red-200'
                        : isCompleted
                          ? 'bg-blue-50 text-blue-700 border border-blue-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                  >
                    {status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function getOrCreateSessionId(userEmail) {
  const key = `medassist_session_${userEmail || 'anon'}`;
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `${userEmail || 'anon'}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function BookingModal({ isOpen, onClose, doctor, onConfirm, onViewProfile }) {
  const [selectedDate, setSelectedDate] = useState('');
  const [weekOffset, setWeekOffset] = useState(0);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [allSlots, setAllSlots] = useState([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [slotPeriod, setSlotPeriod] = useState('morning'); // morning | afternoon | evening
  // Reason is two separate pieces: toggleable quick-chip tags and free text.
  // They used to share one comma-joined string, which meant a chip lit up
  // whenever its text appeared anywhere in the input (substring match) and
  // a chip could not be removed once added.
  const [reasons, setReasons] = useState([]);
  const [symptoms, setSymptoms] = useState('');
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Focused from the keyboard once a slot is picked. A ref rather than an
  // autofocus-on-mount, so the modal's first focus stays on the date strip
  // instead of jumping to an optional field the user may never fill.
  const reasonInputRef = useRef(null);
  // Synchronous double-submit guard: React state updates are async, so two
  // rapid clicks (or Enter + click) can both enter handleSubmit before the
  // disabled button state applies — sending two concurrent POSTs where the
  // loser fails with a 409 "just booked by another request".
  const submittingRef = useRef(false);
  const [slotError, setSlotError] = useState('');
  const [validationMsg, setValidationMsg] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [confirmedDetails, setConfirmedDetails] = useState(null);

  // Local date, not UTC — see todayKey() in shared/utils/datetime.js.
  const todayStr = () => todayKey();

  // Booking horizon. Slot availability is generated from the doctor's shift
  // pattern, so paging past this just shows empty days with no explanation.
  // 8 weeks (~2 months) is comfortably longer than any realistic lead time.
  const MAX_BOOKING_WEEKS = 8;
  const isAtLastWeek = weekOffset >= MAX_BOOKING_WEEKS;

  // 7-day strip starting at today + weekOffset weeks
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7 + i);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return {
      iso,
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      dayNum: d.getDate(),
      // Full form for the button's aria-label — "TUE 29" is meaningless
      // to a screen reader, and the strip spans month boundaries.
      fullLabel: d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
      isToday: iso === todayStr(),
    };
  });

  // A 7-day window usually spans two months, and the cells only show day
  // numbers — so "28 29 30 1 2 3 4" is ambiguous. Collapse the range into a
  // single "Sep 28 – Oct 4" (or plain "Sep 28 – 30" when it stays in one
  // month) so the strip is self-describing.
  const monthRangeLabel = (() => {
    const first = weekDays[0];
    const last = weekDays[6];
    const fmtMonth = (iso) =>
      new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short' });
    const firstMonth = fmtMonth(first.iso);
    const lastMonth = fmtMonth(last.iso);
    if (firstMonth === lastMonth) {
      return `${firstMonth} ${first.dayNum} – ${last.dayNum}`;
    }
    return `${firstMonth} ${first.dayNum} – ${lastMonth} ${last.dayNum}`;
  })();

  // Reset everything when doctor changes or modal opens/closes (default: today)
  useEffect(() => {
    if (isOpen) {
      setSelectedDate(todayStr());
      setWeekOffset(0);
      setAvailableSlots([]);
      setAllSlots([]);
      setSelectedSlot('');
      setSlotPeriod('morning');
      setReasons([]);
      setSymptoms('');
      setSlotError('');
      setValidationMsg('');
      setIsSuccess(false);
      setConfirmedDetails(null);
      submittingRef.current = false;
    }
  }, [isOpen, doctor?.id]);

  // Escape, focus trapping and scroll lock are now handled by the shared
  // Modal primitive. Escape is suppressed mid-submit via onClosePrevented, so
  // an impatient second Esc can't unmount the dialog out from under an
  // in-flight booking and leave the user unsure whether it went through.

  // Single slot fetcher — reused by the date effect and by the 409 refresh
  const fetchSlots = async (dateStr) => {
    setIsLoadingSlots(true);
    setSlotError('');
    setSelectedSlot('');
    try {
      const res = await api.get('/api/appointments/available-slots', {
        params: { doctor_id: doctor.id, date: dateStr },
      });
      const avail = res.data.available_slots || [];
      const all = res.data.all_slots || res.data.available_slots || [];
      setAvailableSlots(avail);
      setAllSlots(all);
      // Default to the first period that actually has slots
      const inPeriod = (slots, p) => slots.filter((s) => periodOf(s) === p);
      if (inPeriod(all, 'morning').length > 0) setSlotPeriod('morning');
      else if (inPeriod(all, 'afternoon').length > 0) setSlotPeriod('afternoon');
      else setSlotPeriod('evening');
      return { avail, all };
    } catch (err) {
      setSlotError(err.response?.data?.detail || 'Failed to load available slots.');
      setAvailableSlots([]);
      setAllSlots([]);
      return { avail: [], all: [] };
    } finally {
      setIsLoadingSlots(false);
    }
  };

  // Fetch available slots whenever date changes
  useEffect(() => {
    if (!selectedDate || !doctor?.id) {
      setAvailableSlots([]);
      setAllSlots([]);
      setSelectedSlot('');
      return;
    }
    fetchSlots(selectedDate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, doctor?.id]);

  if (!isOpen) return null;

  const doctorInitials = doctor?.name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'DR';

  // Period classification and its icons come from shared code so this modal
  // and the doctor shift preview cannot drift apart. `periodOf` is the shared
  // `slotPeriod` helper, aliased on import because this file already uses
  // `slotPeriod` for the active-period state.
  const periodSlots = allSlots.filter((s) => periodOf(s) === slotPeriod);
  const periodMeta = [
    { key: 'morning', label: 'Morning' },
    { key: 'afternoon', label: 'Afternoon' },
    { key: 'evening', label: 'Evening' },
  ];

  const QUICK_CHIPS = ['Routine Checkup', 'Follow-up visit', 'Headache', 'Chest Pain', 'Fever & Cold', 'Back Pain'];

  // Chips toggle a separate tag list rather than appending comma-joined
  // text, so a tag can be removed and free text stays free text.
  const toggleReason = (chip) => {
    setReasons((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  // The single value the API receives, assembled from whichever parts the
  // user actually filled in. Order is stable so the payload doesn't churn.
  const reasonSummary = [...reasons, symptoms.trim()]
    .filter(Boolean)
    .join(', ');

  const focusReasonInput = () => {
    // Desktop only: on touch, a programmatic focus pops the on-screen
    // keyboard over the slot grid the user is still working in.
    if (window.matchMedia?.('(pointer: fine)').matches) {
      reasonInputRef.current?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Synchronous guard: ignore re-entrant submits (double-click / Enter+click)
    if (submittingRef.current) return;
    setValidationMsg('');
    if (!selectedDate) { setValidationMsg('Please select a date.'); return; }
    if (!selectedSlot) { setValidationMsg('Please select a time slot.'); return; }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      await onConfirm({
        doctor_id: doctor.id,
        appointment_date: selectedDate,
        slot_time: selectedSlot,
        symptoms_summary: reasonSummary || 'Routine Checkup',
      });
      // Show success screen
      setConfirmedDetails({
        date: formatDateLong(selectedDate),
        time: formatTo12h(selectedSlot),
        doctor: doctor?.name,
        specialty: doctor?.specialty,
        // Raw ISO parts kept for the .ics export — the formatted strings above
        // are for display and can't be parsed back into a timestamp.
        isoDate: selectedDate,
        isoTime: selectedSlot,
        address: doctor?.address || '',
      });
      setIsSuccess(true);
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail || err?.message || 'Booking failed. Please try again.';
      if (status === 409) {
        // Slot conflict: refresh availability so the grid reflects reality
        // instead of leaving a stale, unbookable slot selected. The exact
        // backend reason is shown verbatim (doctor-taken vs patient-taken
        // vs race) so the cause is diagnosable instead of masked.
        const { avail } = await fetchSlots(selectedDate);
        if (!avail.includes(selectedSlot)) setSelectedSlot('');
        const reason = typeof detail === 'string' ? detail : JSON.stringify(detail);
        setValidationMsg(`${reason} List refreshed — please pick another time.`);
      } else {
        setValidationMsg(typeof detail === 'string' ? detail : JSON.stringify(detail));
      }
    } finally {
      setIsSubmitting(false);
      submittingRef.current = false;
    }
  };

  /* ── Success Screen ── */
  if (isSuccess && confirmedDetails) {
    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm px-4">
        <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
          {/* Success gradient banner */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 px-8 py-10 text-center">
            {/* Animated checkmark circle */}
            <div className="success-anim mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/30 mb-4" style={{ animation: 'successPop 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards' }}>
              <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"
                style={{ animation: 'drawCheck 0.4s ease forwards 0.2s', strokeDasharray: 40, strokeDashoffset: 40 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white">Appointment Confirmed!</h2>
            <p className="mt-1 text-sm text-emerald-100 font-medium">Your booking has been successfully placed.</p>
          </div>

          {/* Confirmed details */}
          <div className="px-7 py-6 space-y-3">
            <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 border border-slate-100">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-sm font-bold text-white shadow-md">
                {doctorInitials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{confirmedDetails.doctor}</p>
                <p className="text-xs font-semibold text-blue-600">{confirmedDetails.specialty}</p>
              </div>
            </div>

            {/* Date and time on one neutral surface with coloured icons.
                Previously blue-50 and teal-50 side by side, so the two
                blocks read as two different meanings rather than one row. */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  <svg className="h-3 w-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  Date
                </p>
                <p className="mt-1 text-xs font-bold text-slate-900">{confirmedDetails.date}</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <p className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-slate-500">
                  <svg className="h-3 w-3 text-emerald-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Time
                </p>
                <p className="mt-1 text-xs font-bold text-slate-900">{confirmedDetails.time}</p>
              </div>
            </div>

            {/* Where to go. A confirmation that omits the clinic leaves the
                user hunting for the address in a separate screen. */}
            {confirmedDetails.address && (
              <div className="flex items-start gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
                <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Clinic</p>
                  <p className="mt-0.5 text-xs font-semibold leading-snug text-slate-700">{confirmedDetails.address}</p>
                </div>
              </div>
            )}

            <p className="text-xs text-center text-slate-500 font-medium">
              📋 You can cancel anytime from your Profile → Appointment History
            </p>
          </div>

          {/* CTAs */}
          <div className="px-7 pb-7">
            <button
              type="button"
              onClick={() => {
                downloadTextFile(
                  `medassist-${confirmedDetails.isoDate}-${confirmedDetails.isoTime.replace(':', '')}.ics`,
                  buildIcs({
                    doctorName: confirmedDetails.doctor,
                    specialty: confirmedDetails.specialty,
                    address: confirmedDetails.address,
                    date: confirmedDetails.isoDate,
                    time: confirmedDetails.isoTime,
                  }),
                  'text/calendar;charset=utf-8'
                );
              }}
              className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Add to calendar
            </button>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-bold text-slate-600 transition hover:bg-slate-50"
              >
                Done
              </button>
              {onViewProfile && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onViewProfile();
                  }}
                  className="flex-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/25 transition hover:from-blue-700 hover:to-indigo-700"
                >
                  View in Profile
                </button>
              )}
            </div>
          </div>
        </div>
        <style>{`
          @keyframes successPop { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes drawCheck { to { stroke-dashoffset: 0; } }
          /* Respect an OS-level request for reduced motion: the pop and the
             stroke draw are decorative, and a vestibular trigger is a real
             cost for a purely celebratory flourish. */
          @media (prefers-reduced-motion: reduce) {
            .success-anim, .success-anim * { animation: none !important; opacity: 1 !important; stroke-dashoffset: 0 !important; }
          }
        `}</style>
      </div>
    );
  }

  /* ── Main Booking Modal: single frame, no scroll ── */
  return (
    // Migrated onto the shared Modal primitive, which supplies the dialog
    // semantics, focus trap, focus restoration and scroll lock this dialog
    // lacked. It previously handled only Escape (inline) and backdrop click.
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="booking-modal-title"
      // Escape is blocked mid-submit; backdrop click is disabled then too.
      onClosePrevented={() => isSubmitting}
      closeOnBackdrop={!isSubmitting}
      overlayClassName="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/55 backdrop-blur-sm px-4 py-4"
      panelClassName="max-h-[85vh] max-w-2xl rounded-3xl shadow-slate-900/25"
      closeButtonClassName="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white/80 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      closeButtonLabel="Close booking dialog"
    >

      {/* ── Compact header: avatar + name/specialty + address in one line ── */}
      <div className="shrink-0 border-b border-slate-100 bg-gradient-to-b from-blue-50/80 via-white to-white px-6 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-base font-bold text-white shadow-md shadow-blue-500/30">
              {doctorInitials}
            </div>
            <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-white">
              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
          </div>

          <div className="min-w-0 flex-1 pr-10">
            <p className="text-sm font-bold uppercase tracking-wide text-teal-700">Book Appointment</p>
            {/* The doctor name is the dialog's heading, and is referenced by
                  aria-labelledby so it names the dialog for screen readers. */}
            <h3 id="booking-modal-title" className="truncate text-base font-bold text-slate-900 leading-tight">
              {doctor?.name}
            </h3>
            <p className="truncate text-sm text-slate-600">
              {doctor?.specialty && <span className="font-bold text-blue-600">{doctor.specialty} · </span>}
              {doctor?.address || ''}
              {doctor?.distance_km > 0 && <span className="font-semibold text-emerald-700"> · {doctor.distance_km} km away</span>}
            </p>
          </div>

          {/* Close button is supplied by the Modal primitive, which renders it at the
            panel's top-right. Removed here to avoid two dismiss controls. */}
        </div>
      </div>

      {/* ── Form: scrollable body + sticky footer ── */}
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-5 px-6 py-4">

            {/* Date strip: 7 days + week nav */}
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Select date</p>
              <div className="mb-1.5 flex items-baseline justify-between">
                <p className="text-xs font-semibold text-slate-600">{monthRangeLabel}</p>
                {weekOffset > 0 && (
                  <button
                    type="button"
                    onClick={() => setWeekOffset(0)}
                    className="text-xs font-bold text-blue-600 transition hover:text-blue-800 hover:underline"
                  >
                    Back to today
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
                  disabled={weekOffset === 0}
                  aria-label="Previous week"
                  className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="grid flex-1 grid-cols-7 gap-1.5">
                  {weekDays.map((d) => {
                    const isSelected = selectedDate === d.iso;
                    return (
                      <button
                        key={d.iso}
                        type="button"
                        onClick={() => { setSelectedDate(d.iso); setValidationMsg(''); }}
                        aria-label={d.fullLabel}
                        aria-pressed={isSelected}
                        className={`flex min-h-[62px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-2.5 transition ${isSelected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-300'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50'
                          }`}
                      >
                        <span className={`text-xs font-bold uppercase tracking-wide ${isSelected ? 'text-blue-100' : 'text-slate-500'}`}>
                          {d.weekday}
                        </span>
                        <span className="text-lg font-bold leading-none">{d.dayNum}</span>
                        {/* Today marker. A dot rather than a text label so the
                            strip's row height stays even and today doesn't
                            visually outweigh its neighbours. */}
                        {d.isToday && (
                          <span
                            className={`h-1 w-1 rounded-full ${isSelected ? 'bg-blue-100' : 'bg-teal-500'}`}
                            aria-hidden="true"
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setWeekOffset((w) => Math.min(MAX_BOOKING_WEEKS, w + 1))}
                  disabled={isAtLastWeek}
                  aria-label="Next week"
                  className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-500"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Slots: period tabs + compact grid */}
            <div>
              <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.18em] text-teal-700">Select time</p>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Time of day">
                  {periodMeta.map((p) => {
                    const freeHere = availableSlots.filter((s) => periodOf(s) === p.key).length;
                    const isActive = slotPeriod === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => setSlotPeriod(p.key)}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold transition ${isActive
                            ? 'bg-white text-blue-700 shadow-sm'
                            : 'text-slate-600 hover:text-slate-800'
                          }`}
                      >
                        <span className={isActive ? 'text-blue-600' : 'text-slate-500'}>
                          <SlotPeriodIcon period={p.key} />
                        </span>
                        {p.label}
                        {/* Per-tab count, so an empty period is visible before
                            you click it instead of only after */}
                        {allSlots.length > 0 && (
                          <span className={`text-xs font-bold ${freeHere > 0 ? 'text-slate-500' : 'text-slate-500'}`}>
                            {freeHere}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {allSlots.length > 0 && (
                  <span className={`text-xs font-bold ${availableSlots.length <= 2 ? 'text-amber-700' : 'text-slate-500'}`}>
                    {availableSlots.length} left
                  </span>
                )}
              </div>

              {/* Thin availability meter — a bar reads "scarcity" faster than
                  a number alone, and shifts the eye to the slot grid. */}
              {allSlots.length > 0 && (
                <div className="mb-2 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${availableSlots.length <= 2 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                    style={{ width: `${(availableSlots.length / allSlots.length) * 100}%` }}
                  />
                </div>
              )}

              {isLoadingSlots ? (
                <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-4">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                  <p className="text-xs font-semibold text-slate-500">Loading slots…</p>
                </div>
              ) : slotError ? (
                <p
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center text-sm font-semibold text-red-700"
                >
                  {slotError}
                </p>
              ) : periodSlots.length === 0 ? (
                /* Calm empty state with a real next action, instead of an
                   amber warning box that only told the user to go elsewhere. */
                <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3 py-5 text-center">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-slate-700">
                    No {slotPeriod} slots {selectedDate ? `on ${formatDateDisplay(selectedDate)}` : 'for this day'}
                  </p>
                  {(() => {
                    // Offer whichever period actually has room, rather than
                    // making the user hunt through the tabs.
                    const alternative = periodMeta.find((p) =>
                      p.key !== slotPeriod && availableSlots.some((s) => periodOf(s) === p.key));
                    return alternative ? (
                      <button
                        type="button"
                        onClick={() => setSlotPeriod(alternative.key)}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-blue-700 transition hover:border-blue-300 hover:bg-blue-50"
                      >
                        Try {alternative.label.toLowerCase()} →
                      </button>
                    ) : (
                      <p className="text-xs text-slate-500">Fully booked — try another day</p>
                    );
                  })()}
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {periodSlots.map((slot) => {
                    const isAvailable = availableSlots.includes(slot);
                    if (!isAvailable) {
                      return (
                        <div
                          key={slot}
                          title="Already booked"
                          aria-label={`${formatTo12h(slot)}, already booked`}
                          className="select-none rounded-lg border border-transparent bg-slate-50/70 px-1 py-2.5 text-center text-slate-500"
                        >
                          <span className="text-xs font-semibold">{formatTo12h(slot)}</span>
                        </div>
                      );
                    }
                    const isSelected = selectedSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => { setSelectedSlot(slot); setValidationMsg(''); focusReasonInput(); }}
                        aria-pressed={isSelected}
                        className={`rounded-lg border px-1 py-2.5 text-xs font-bold transition ${isSelected
                            ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-500/30 ring-2 ring-blue-300'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700'
                          }`}
                      >
                        {formatTo12h(slot)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Reason: toggle tags + free text */}
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                {/* A real <label> for the free-text field. It previously was a
                    bare <p>, so the input below had no accessible name at all. */}
                <label
                  htmlFor="booking-symptoms"
                  className="text-sm font-bold uppercase tracking-wide text-slate-700"
                >
                  Reason for visit
                </label>
                <span className="text-sm text-slate-500">Optional</span>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_CHIPS.map((chip) => {
                  const active = reasons.includes(chip);
                  return (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => toggleReason(chip)}
                      aria-pressed={active}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold border transition ${active
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-700'
                        }`}
                    >
                      {chip}
                      {active && (
                        <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>

              <input
                ref={reasonInputRef}
                id="booking-symptoms"
                type="text"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="Or describe it in your own words"
                className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-100/60"
              />
            </div>

            {/* Inline one-line error (no banner box) */}
            {validationMsg && (
              <p role="alert" className="flex items-center gap-1.5 text-sm font-semibold text-red-700">
                <svg aria-hidden="true" className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                {validationMsg}
              </p>
            )}
          </div>

          {/* ── Sticky footer: selection summary + what-happens-next ──
              Sticky inside the scroll container so Confirm stays reachable
              regardless of content height. */}
          <div className="sticky bottom-0 shrink-0 border-t border-slate-100 bg-white/95 px-6 py-3.5 shadow-[0_-6px_16px_-8px_rgba(15,23,42,0.12)] backdrop-blur">

            {/* Summary card: only once there's something concrete to confirm.
                Previously a single truncating line, so a long doctor name
                silently ate the date and time. */}
            {selectedDate && selectedSlot ? (
              <div className="mb-2.5 flex items-center gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 px-3 py-2">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-slate-900">{doctor?.name}</p>
                  <p className="truncate text-xs font-semibold text-blue-700">
                    {formatDateDisplay(selectedDate)} at {formatTo12h(selectedSlot)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold text-emerald-700">Free cancellation</span>
              </div>
            ) : (
              <p className="mb-2.5 text-xs font-medium text-slate-500">
                {!selectedDate
                  ? 'Pick a day to continue'
                  : selectedSlot
                    ? 'Ready to confirm'
                    : `${formatDateDisplay(selectedDate)} · now pick a time`}
              </p>
            )}

            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 text-xs text-slate-500 font-medium leading-snug">
                Appears under <span className="font-semibold text-slate-600">Profile → Appointment History</span>
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 inline-flex items-center min-h-11">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !selectedDate || !selectedSlot}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 py-2 text-xs font-bold text-white shadow-md shadow-blue-500/30 transition hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none min-h-11">
                  {isSubmitting ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Confirming…
                    </>
                  ) : (
                    <>Confirm Booking →</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </Modal>
  );
}


function HelpModal({ isOpen, onClose }) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      labelledBy="help-modal-title"
      overlayClassName="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm animate-in fade-in duration-150"
      panelClassName="max-w-lg rounded-2xl p-6"
      closeButtonClassName="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      closeButtonLabel="Close help"
    >
      <div className="flex items-center gap-2.5 border-b border-slate-100 pb-4">
        <span aria-hidden="true" className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-base font-bold text-blue-600">
          ❓
        </span>
        <div>
          <h3 id="help-modal-title" className="text-lg font-bold text-slate-900">How MedAssist Works</h3>
          <p className="text-sm text-slate-600">Quick guide to symptom triage and booking</p>
        </div>
      </div>

      {/* A modal is a linear document; a list communicates the sequence. */}
      <ol className="mt-4 max-h-[60vh] space-y-3.5 overflow-y-auto pr-1">
        <li className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3.5">
          <span aria-hidden="true" className="text-xl">💬</span>
          <div>
            <p className="font-bold text-slate-900">1. Describe your symptoms</p>
            <p className="mt-0.5 text-sm text-slate-600">
              Type symptoms in the chat or use the voice input button to speak in Hindi, Tamil, Telugu, and more.
            </p>
          </div>
        </li>

        <li className="flex items-start gap-3 rounded-xl border border-teal-100 bg-teal-50/50 p-3.5">
          <span aria-hidden="true" className="text-xl">🗺️</span>
          <div>
            <p className="font-bold text-slate-900">2. Geo-spatial Doctor Matching</p>
            <p className="mt-0.5 text-sm text-slate-600">
              MedAssist analyses medical intent and maps nearby verified specialists ranked by driving proximity.
            </p>
          </div>
        </li>

        <li className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-3.5">
          <span aria-hidden="true" className="text-xl">📅</span>
          <div>
            <p className="font-bold text-slate-900">3. Slot-based Booking</p>
            <p className="mt-0.5 text-sm text-slate-600">
              Select any 30-minute available window matching doctor shifts, with automated double-booking prevention.
            </p>
          </div>
        </li>

        <li className="rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-sm text-amber-800">
          <p className="flex items-center gap-1.5 font-bold">
            <span aria-hidden="true">⚠️</span> Emergency Notice
          </p>
          <p className="mt-1">
            MedAssist is an AI intake and scheduling assistant. In case of life-threatening emergencies, call <b>112</b> or <b>108</b> immediately.
          </p>
        </li>
      </ol>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Got it, thanks!
        </button>
      </div>
    </Modal>
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
  const [allDoctors, setAllDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [appointmentsLoading, setAppointmentsLoading] = useState(true);
  const [isRouting, setIsRouting] = useState(false);
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const chatBottomRef = useRef(null);

  useEffect(() => {
    if (doctors.length > 0) {
      setIsPanelExpanded(true);
    } else {
      setIsPanelExpanded(false);
    }
  }, [doctors.length]);

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  // Close profile dropdown menu on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [activeRoute, setActiveRoute] = useState(null);   // GeoJSON LineString geometry
  const [routeInfo, setRouteInfo] = useState(null);   // { distanceKm, durationMins }
  const [routeLoading, setRouteLoading] = useState(false);  // true while OSRM fetches

  const [locationMode, setLocationMode] = useState('live'); // 'home' | 'live'
  const [homeLocation, setHomeLocation] = useState(null); // { lat, lng, label } loaded from profile
  const [patientCoords, setPatientCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('');
  const [patientPin, setPatientPin] = useState(null); // { lat, lng, label } — visible red pin on map

  // Legend sits top-right and can be collapsed to a chip when map space is tight.
  const [isLegendOpen, setIsLegendOpen] = useState(true);

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
    }).catch(() => { });
  }, []);

  // Load all verified doctors for background map pins on mount
  useEffect(() => {
    api.get('/api/doctors')
      .then((res) => {
        setAllDoctors(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        setAllDoctors([]);
      });
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
          lat: coords.lat,
          lng: coords.lng,
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
    setSelectedDoctor(doctor);
    setIsModalOpen(true);
  };

  const handleConfirmBooking = async (payload) => {
    try {
      await api.post('/api/appointments', payload);
      const recentResponse = await api.get('/api/patient/appointments');
      setAppointments(recentResponse.data?.data || recentResponse.data || []);
      // Modal transitions to its own success screen; user closes it via "Done" or "View in Profile"
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
  const chatInputRef = useRef(null);

  // Focus the chat box on load for pointer (desktop) devices only —
  // mobile browsers would pop the keyboard uninvited.
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) {
      chatInputRef.current?.focus();
    }
  }, []);

  useDocumentTitle('Dashboard');
  const patientName = user?.full_name || user?.name || 'Patient';

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRouting]);

  useEffect(() => {
    let cancelled = false;

    async function loadRecentAppointments() {
      try {
        const response = await api.get('/api/patient/appointments');
        if (!cancelled) setAppointments(response.data?.data || response.data || []);
      } catch {
        if (!cancelled) setAppointments([]);
      } finally {
        if (!cancelled) setAppointmentsLoading(false);
      }
    }

    loadRecentAppointments();
    return () => { cancelled = true; };
  }, []);

  const sendMessageWithText = async (customText) => {
    const userText = (customText !== undefined ? customText : chatInput).trim();
    if (!userText || isRouting) return;

    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');
    setIsRouting(true);

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
          lat: homeLocation.lat,
          lng: homeLocation.lng,
          label: `🏠 ${homeLocation.label}`,
        };
        setPatientPin(activePin);
      } else if (locationMode === 'live' && !patientCoords) {
        // Scenario 1: typed address — GPS not active, use NLP-resolved coords echoed back
        const nlpLat = data.patient_lat || null;
        const nlpLng = data.patient_lng || null;
        if (nlpLat && nlpLng) {
          activePin = {
            lat: nlpLat,
            lng: nlpLng,
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
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 lg:h-dvh lg:overflow-hidden">
      <Helmet>
        <title>Dashboard</title>
        <meta name="description" content="Describe your symptoms and get matched with the right specialist near you using MedAssist." />
      </Helmet>
      {/* z-[1100], not z-[1000]. `sticky` + a z-index makes this a stacking
          context, so the profile popover's own z-[1100] is resolved *inside* it
          and its effective global level is the header's. At z-[1000] that tied
          with the Map Key legend, and <main> coming later in the DOM won — the
          legend painted over the open menu. Lifting the header lifts the
          popover with it. The specialists panel (1002), bottom area (1001) and
          legend (1000) stay below; the modals (1200/2000) stay above. */}
      <header className="sticky top-0 z-[1100] shrink-0 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur lg:px-6">
        <div className="flex items-center justify-between">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <BrandLogo size="lg" />
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-950 leading-tight">MedAssist</h1>
            </div>
          </div>

          {/* Right Controls: Single Profile Avatar Trigger with Floating Popover */}
          <div className="relative" ref={profileMenuRef}>
            <button
              type="button"
              onClick={() => setIsProfileMenuOpen((prev) => !prev)}
              aria-label="User account menu"
              className="flex items-center gap-2.5 rounded-full border border-slate-200 bg-white p-1 pr-3 shadow-sm transition hover:border-blue-300 hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-xs font-bold uppercase text-white shadow-sm">
                {patientName.charAt(0)}
              </span>
              <span className="text-xs font-semibold text-slate-700 hidden sm:inline-block max-w-[120px] truncate">
                {patientName}
              </span>
              <svg
                className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${isProfileMenuOpen ? 'rotate-180 text-blue-600' : ''
                  }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {/* Floating Popover Menu (Absolute - never stretches header height) */}
            {isProfileMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-56 rounded-2xl border border-slate-200/80 bg-white/95 p-1.5 shadow-2xl shadow-slate-900/15 backdrop-blur-md z-[1100] animate-in fade-in slide-in-from-top-2 duration-150">
                {/* User Info Header */}
                <div className="border-b border-slate-100 px-3 py-2.5 mb-1 bg-slate-50/70 rounded-xl">
                  <p className="text-xs font-bold text-slate-900 truncate">{patientName}</p>
                  <p className="text-xs text-slate-500 truncate">{user?.email || 'patient@medassist.com'}</p>
                </div>

                {/* Profile Option */}
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    navigate('/profile');
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-sm">
                    👤
                  </span>
                  Profile
                </button>

                {/* Help Option */}
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    setIsHelpModalOpen(true);
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-amber-50 hover:text-amber-700"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 text-amber-700 text-sm font-bold">
                    ❓
                  </span>
                  Help
                </button>

                <div className="my-1 border-t border-slate-100" />

                {/* Logout Option */}
                <button
                  type="button"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    logout();
                  }}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-xs font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 text-red-600 text-sm">
                    🚪
                  </span>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <SkipLink />
      <main id="main-content" className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[35%_65%] lg:overflow-hidden" tabIndex={-1}>
        {/* The chat column sized itself to 620px on phones purely so the desktop
            fixed-viewport layout would have something to work with. Below `lg`
            the page scrolls, so a hard floor just added dead space above the
            fold. The map keeps its own floor because a map with no height
            renders as a blank strip. */}
        <section className="flex min-h-[520px] min-w-0 flex-col border-b border-slate-200 bg-slate-50 sm:min-h-[560px] lg:min-h-0 lg:border-b-0 lg:border-r">
          { /* Collapse once the conversation has started so chat reclaims the space */}
          {!messages.some((m) => m.sender === 'user') && (
            <div className="bg-white/80 px-5 py-4 shrink-0 backdrop-blur-md border-b border-slate-100/50">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-50 to-emerald-50 text-teal-700 ring-1 ring-teal-100/50 shadow-sm">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>
                </div>
                <div>
                  <h2 className="text-base font-bold tracking-tight text-slate-900">Medical Triage</h2>
                  <p className="text-sm font-medium text-slate-600">Describe symptoms to find matching specialists.</p>
                </div>
              </div>

              {/* Quick Symptom Chips */}
              <div className="mt-3 flex flex-wrap gap-2">
                {['Cold & Fever', 'Chest Pain', 'Stomach Pain', 'Skin Rash', 'Headache'].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => sendMessageWithText(tag)}
                    className="rounded-full bg-white border border-slate-200/80 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:scale-105 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 active:scale-95"
                  >
                    {tag}
                  </button>
                ))}
              </div>

              {/* Worked example: the router needs symptoms AND a place, and
                nothing else in the UI says so. One clickable line removes
                the "incomplete -> bot asks for city" round-trip. */}
              <button
                type="button"
                onClick={() => sendMessageWithText(`Headache for 3 days in ${mapCity}`)}
                className="mt-3 flex w-full items-start gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-2.5 py-2 text-left transition hover:border-blue-300 hover:bg-blue-50/60"
              >
                <span className="mt-px shrink-0 text-xs font-bold uppercase tracking-wide text-slate-600">
                  Try
                </span>
                <span className="min-w-0 flex-1 text-xs leading-4 text-slate-600">
                  &ldquo;Headache for 3 days in {mapCity}&rdquo;
                  <span className="mt-0.5 block text-xs text-slate-600">
                    Mention your symptoms <em className="not-italic font-semibold text-slate-700">and</em> your area to get matches in one step.
                  </span>
                </span>
                <span className="mt-px shrink-0 text-xs text-slate-500">&rarr;</span>
              </button>
            </div>
          )}
          {/* Slim context strip: fills the void left by the collapsed triage
              header with live session state instead of empty space */}
          {messages.some((m) => m.sender === 'user') && (
            <div className="flex items-center gap-2 border-b border-slate-100/50 bg-white/80 px-4 py-1.5 backdrop-blur-md shrink-0">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-600">
                {locationMode === 'home' ? '🏠' : '📍'}{' '}
                {patientPin?.label
                  || (locationMode === 'home' ? homeLocation?.label : null)
                  || mapCity
                  || 'No location yet — mention your city'}
              </span>
              {missingInfo ? (
                <span className="shrink-0 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-bold text-amber-700">
                  Need: {missingInfo}
                </span>
              ) : (
                <span className="shrink-0 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-700">
                  ✓ Ready to book
                </span>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4 space-y-4">

            {messages.map((msg, index) => (
              <ChatMessage key={index} msg={msg} user={user} />
            ))}
            {/* The "routing tool / call 112" disclaimer is not repeated in the
                thread: the composer renders the same warning permanently, so
                showing it here too just repeated the line on one screen. */}
            {isRouting && <LoadingMessage />}
            <div ref={chatBottomRef} />
          </div>

          <div className="relative border-t border-slate-200 bg-white px-4 py-2.5 shrink-0">
            {locationStatus && (
              <div className="absolute -top-7 right-5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 shadow-sm">
                {locationStatus}
              </div>
            )}

            <div className="flex flex-col gap-2">
              {/* Persistent location-source line: makes the home/live mode visible */}
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600">
                <span>{locationMode === 'home' ? '🏠' : '📍'}</span>
                <span className="truncate">
                  {locationMode === 'home'
                    ? (homeLocation?.label ? `Home · ${homeLocation.label}` : 'Home · address not set')
                    : (patientCoords ? 'Live location · GPS ready' : 'Live location off · type your city or tap the pin')}
                </span>
              </div>
              {/* Input row. Mic sits inside the field on the left and Send inside on the
                  right, so the composer reads as one control rather than a row of
                  chrome. The location mode control shares this line and shrinks
                  to its content width — a grid-cols-2 stretched each segment to
                  half the chat column to hold the word "Home". */}
              <div className="flex items-center gap-2 px-4">
                <div className="relative flex-1 rounded-xl border-2 border-slate-200 bg-slate-50 px-3 py-2 transition-all focus-within:border-blue-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100/50">

                  {/* Mic — left adornment. Tooltip opens downward: the field's
                      top edge sits only a few pixels below the status line, so an
                      upward tooltip would overlap the text above. */}
                  <div className="group/btn absolute left-2.5 top-1/2 z-10 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={() => setIsVoiceModalOpen(true)}
                      aria-label="Voice input"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-blue-50 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <svg className="h-[18px] w-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                    <div className="pointer-events-none absolute left-0 top-full z-20 mt-2 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/btn:opacity-100">
                      Voice Input
                      <span className="absolute left-4 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-800" />
                    </div>
                  </div>

                  <textarea
                    ref={chatInputRef}
                    rows="2"
                    className="w-full resize-none bg-transparent pl-11 pr-11 text-sm leading-snug text-slate-900 outline-none placeholder:text-slate-500 min-h-[44px] max-h-28"
                    placeholder="Describe your symptoms..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage();
                      }
                    }}
                  />

                  {/* Send — right adornment */}
                  <div className="group/btn absolute right-2.5 top-1/2 z-10 -translate-y-1/2">
                    <button
                      type="button"
                      onClick={handleSendMessage}
                      disabled={isRouting || !chatInput.trim()}
                      aria-label="Send message"
                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isRouting ? (
                        <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      ) : (
                        <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V6m0 0l-7 7m7-7l7 7" />
                        </svg>
                      )}
                    </button>
                    <div className="pointer-events-none absolute right-0 top-full z-20 mt-2 whitespace-nowrap rounded-md bg-blue-700 px-2 py-1 text-xs font-semibold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover/btn:opacity-100">
                      Send Message
                      <span className="absolute right-4 top-full translate-x-1/2 border-4 border-transparent border-t-blue-700" />
                    </div>
                  </div>
                </div>

                {/* Location mode — sized to content, beside the field */}
                <div role="radiogroup" aria-label="Location source" className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={locationMode === 'home'}
                    onClick={() => {
                      setLocationMode('home');
                      if (homeLocation && homeLocation.lat && homeLocation.lng) {
                        const pin = { lat: homeLocation.lat, lng: homeLocation.lng, label: `🏠 ${homeLocation.label}` };
                        setPatientPin(pin);
                        setMapCenter([homeLocation.lat, homeLocation.lng]);
                        if (doctors.length > 0) fetchRoute(selectedDoctor || doctors[0], pin);
                      }
                    }}
                    disabled={!homeLocation}
                    // aria-label because the tooltip is hover-only, which a
                    // keyboard or screen-reader user never reaches. This is also
                    // the only place that states *why* Home is unavailable.
                    title={homeLocation ? 'Use your home address' : 'No home address saved yet'}
                    aria-label={
                      !homeLocation
                        ? 'Home Address (add an address in your profile first)'
                        : 'Home address — use as the location source'
                    }
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40 ${locationMode === 'home'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                      }`}
                  >
                    {/* Icon rather than the 🏠 emoji: emoji glyphs are
                      platform-dependent and cannot inherit `currentColor`.
                      The house outline and the map pin are shape-distinct, so
                      the two stay identifiable without colour or a label. */}
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={locationMode === 'live'}
                    onClick={() => {
                      setLocationMode('live');
                      setPatientPin(null);
                      handleLiveLocation();
                    }}
                    title="Use my current location"
                    aria-label="Live GPS — use my current location"
                    className={`flex h-9 w-9 items-center justify-center rounded-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${locationMode === 'live'
                        ? 'bg-blue-600 text-white shadow-sm'
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                      }`}
                  >
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Emergency notice as a full-width strip rather than a floating pill. It is
                a medical-safety notice and deserves more presence. It stays
                below the composer so it can never block input. */}
              <div className="mt-2 flex items-center justify-center gap-1.5 border-t border-amber-200 bg-amber-50 px-4 py-1.5">
                <svg className="h-3.5 w-3.5 shrink-0 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856a1.732 1.732 0 001.732-3L13.732 4a1.732 1.732 0 00-3.464 0L3.34 16a1.732 1.732 0 001.732 3z" />
                </svg>
                <span className="text-xs font-semibold text-amber-800">
                  MedAssist is a routing tool. For emergencies, call <strong>112</strong>.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Map column. Keeps a height floor so Leaflet renders a real map rather
            than a collapsed strip; on `lg` it is bounded by the viewport. */}
        <section className="relative flex min-h-[380px] min-w-0 flex-col bg-slate-50 sm:min-h-[420px] lg:min-h-0 lg:overflow-hidden">
          {/* Map Area — fills available space */}
          <div className="relative flex-1 min-h-[260px] bg-slate-200">
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
              />

              {/* Background: all verified doctors as grey pins */}
              {allDoctors
                .filter((doc) => !doctors.some((matched) => matched.id === doc.id))
                .filter((doc) => (doc.lat ?? doc.practice_lat) && (doc.lng ?? doc.practice_lng))
                .map((doc) => (
                  <Marker
                    key={`bg-${doc.id}`}
                    position={[doc.lat ?? doc.practice_lat, doc.lng ?? doc.practice_lng]}
                    icon={greyIcon}
                  >
                    <Popup>
                      <div style={{ minWidth: '160px' }}>
                        <b style={{ fontSize: '13px' }}>{doc.name ?? doc.full_name}</b>
                        <p style={{ margin: '4px 0', color: '#6B7280', fontSize: '12px' }}>
                          {doc.specialty ?? doc.specialization}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                ))}

              {doctors.map((doc) => {
                let markerLat = doc.lat;
                let markerLng = doc.lng;
                if (!markerLat || !markerLng || (markerLat === 0 && markerLng === 0)) {
                  const fallback = CITY_COORDS[mapCity] || mapCenter || INDIA_CENTER;
                  markerLat = fallback[0];
                  markerLng = fallback[1];
                }
                const isSelected = selectedDoctor?.id === doc.id;

                return (
                  <Marker
                    key={doc.id}
                    position={[markerLat, markerLng]}
                    icon={blueIcon}
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
                        <button
                          onClick={() => handleBookDoctor(doc)}
                          className="mt-2 w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
                        >
                          Book Now
                        </button>

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
              <InvalidateMapSize trigger={isPanelExpanded} />

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

            {/* ── Map legend ──
                Four marker types share this map and nothing on screen said
                which was which: a red pin, a blue pin, a grey pin, and a
                green route line. The popups only explain a pin after you
                have already clicked it, and the grey pins have no
                affordance at all. Mirrors the divIcon colours above. */}
            <div className="absolute right-3 top-3 z-[1000] w-44 rounded-xl border border-slate-200 bg-white/95 shadow-lg shadow-slate-900/10 backdrop-blur">
              <button
                type="button"
                onClick={() => setIsLegendOpen((v) => !v)}
                aria-expanded={isLegendOpen}
                className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">
                  Map key
                </span>
                <svg
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 text-slate-400 transition-transform duration-200 ${isLegendOpen ? 'rotate-180' : ''
                    }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                </svg>
              </button>
              {isLegendOpen && (
                <ul className="space-y-1.5 border-t border-slate-100 px-2.5 pb-2.5 pt-2">
                  <li className="flex items-center gap-2">
                    <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#DC2626"
                        d="M12 2c-3.9 0-7 3.1-7 7 0 5.2 7 13 7 13s7-7.8 7-13c0-3.9-3.1-7-7-7z"
                      />
                      <circle cx="12" cy="9" r="2.6" fill="#fff" />
                    </svg>
                    <span className="text-xs font-medium text-slate-700">Your location</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="7" fill="#2563EB" stroke="#fff" strokeWidth="2.5" />
                    </svg>
                    <span className="text-xs font-medium text-slate-700">Matched specialist</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="6" fill="#9CA3AF" stroke="#fff" strokeWidth="2" />
                    </svg>
                    <span className="text-xs font-medium text-slate-700">Other verified doctors</span>
                  </li>
                  {/* Only shown once a route is drawn — otherwise the legend
                      advertises a line the patient cannot see. */}
                  {activeRoute && (
                    <li className="flex items-center gap-2">
                      <svg className="h-3 w-3 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          d="M2 18 C 7 18, 7 6, 12 6 S 17 18, 22 18"
                          fill="none"
                          stroke="#10B981"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                        />
                      </svg>
                      <span className="text-xs font-medium text-slate-700">Selected route</span>
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          {/* Bottom Area.
              Previously a hard-coded h-[236px] with a md:grid-cols-2 inside.
              Below `md` the two panels stacked *within* those 236px (~112px
              each), and the doctor list then expanded to an absolutely
              positioned 390px panel — covering the map and the appointments
              panel entirely. On a phone that made the map unusable.

              Now: on small screens the two panels sit in normal document flow
              with their own heights and no absolute positioning, so the page
              scrolls naturally. The fixed-height + overlay-expand treatment is
              kept only from `lg`, where the 35/65 split gives it room. */}
          <div className="relative z-[1001] shrink-0 border-t border-slate-200 bg-slate-50 p-3 lg:h-[236px] lg:p-4">
            <div className="grid grid-cols-1 gap-3 lg:h-full lg:grid-cols-2 lg:gap-4">

              {/* Left Column: Matched Specialists */}
              <div className="relative min-h-0 lg:h-full">
                {/* Mobile/tablet: plain flow, fixed comfortable height. */}
                <div className="lg:hidden">
                  <MatchedDoctorsPanel
                    doctors={doctors}
                    city={mapCity}
                    onBookDoctor={handleBookDoctor}
                    selectedDoctorId={selectedDoctor?.id}
                    onSelectDoctor={fetchRoute}
                  />
                </div>

                {/* Desktop: overlay panel that expands upward over the map. */}
                <div
                  className={`absolute bottom-0 left-0 right-0 z-[1002] hidden transition-all duration-300 ease-in-out lg:block ${isPanelExpanded
                      ? 'h-[320px] max-h-[calc(100dvh-140px)] shadow-2xl ring-1 ring-slate-900/10 rounded-2xl'
                      : 'h-full shadow-sm rounded-2xl'
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                    aria-expanded={isPanelExpanded}
                    aria-label={isPanelExpanded ? 'Collapse matched specialists' : 'Expand to view all matched specialists'}
                    className="absolute -top-3.5 left-1/2 flex h-8 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-md transition hover:border-blue-300 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <svg
                      aria-hidden="true"
                      className={`h-4 w-4 transition-transform duration-300 text-slate-600 group-hover:text-blue-600 ${isPanelExpanded ? 'rotate-180' : ''
                        }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>

                  <MatchedDoctorsPanel
                    doctors={doctors}
                    city={mapCity}
                    onBookDoctor={handleBookDoctor}
                    selectedDoctorId={selectedDoctor?.id}
                    onSelectDoctor={fetchRoute}
                  />
                </div>
              </div>

              {/* Right Column: Recent Appointments */}
              <div className="min-h-0 lg:h-full">
                <RecentAppointmentsPanel
                  appointments={appointments}
                  loading={appointmentsLoading}
                  // "View all" landed on the profile page's default tab
                  // (Personal Info), not the appointment history the user was
                  // clearly asking for. Pass the tab explicitly.
                  onViewAll={() => navigate('/profile?tab=history')}
                />
              </div>

            </div>
          </div>
        </section>
      </main>

      {/* Modals placed outside main structural layout */}
      <BookingModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedDoctor(null);
        }}
        doctor={selectedDoctor}
        onConfirm={handleConfirmBooking}
        onViewProfile={() => navigate('/profile')}
      />

      {/* Voice Input Modal for Regional Languages */}
      <VoiceInputModal
        isOpen={isVoiceModalOpen}
        onClose={() => setIsVoiceModalOpen(false)}
        onApplyText={(spokenText) => {
          sendMessageWithText(spokenText);
        }}
      />

      {/* Help Modal */}
      <HelpModal
        isOpen={isHelpModalOpen}
        onClose={() => setIsHelpModalOpen(false)}
      />
    </div>
  );
}
