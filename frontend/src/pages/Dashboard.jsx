import React, { useState, useEffect, useRef, useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- Leaflet icon fix (missing marker icons in Vite/Webpack builds) ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// City -> coordinates lookup
const CITY_COORDS = {
  Bangalore: [12.9716, 77.5946],
  Mumbai: [19.0760, 72.8777],
  Delhi: [28.6139, 77.2090],
  Chennai: [13.0827, 80.2707],
  Kolkata: [22.5726, 88.3639],
  Hyderabad: [17.3850, 78.4867],
  Pune: [18.5204, 73.8567],
  London: [51.5074, -0.1278],
  'New York': [40.7128, -74.0060],
};

// Smoothly re-centers the map when coords change
function RecenterMap({ coords }) {
  const map = useMap();
  useEffect(() => {
    map.setView(coords, 13, { animate: true });
  }, [coords, map]);
  return null;
}

function MatchedDoctorsPanel({ doctors, city, isCollapsed, onToggle, onBookDoctor }) {
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
            {doctors.map((doc, index) => (
              <div key={doc.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-start gap-3 min-w-0">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-slate-900">{doc.name}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-wide text-blue-600">{doc.specialty}</p>
                    <p className="mt-2 text-xs leading-5 text-slate-500">{doc.address}</p>
                  </div>
                </div>
                <button
                  onClick={() => onBookDoctor(doc)}
                  className="shrink-0 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                >
                  Book Now
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatMessage({ msg, user }) {
  if (msg.sender === 'bot') {
    return (
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700 ring-1 ring-blue-100">
          AI
        </div>
        <div className="max-w-[86%] rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 shadow-sm">
          {msg.text}
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
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const doctorInitials = doctor?.name
    ?.split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || 'DR';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!date || !time) return;
    setIsSubmitting(true);
    try {
      const appointmentTime = new Date(`${date}T${time}`).toISOString();
      await onConfirm({
        doctor_id: doctor.id,
        appointment_time: appointmentTime,
        symptoms_summary: symptoms.trim() || 'Routine Checkup',
      });
      // Reset fields on success (parent handles close)
      setDate('');
      setTime('');
      setSymptoms('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl">

        {/* ── Header ── */}
        <div className="flex items-center gap-4 border-b border-slate-100 px-6 py-5">
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

        {/* ── Form ── */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">

          {/* Date + Time in 2-column grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Date
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                min={new Date().toISOString().split('T')[0]}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
                Time
              </label>
              <input
                type="time"
                required
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Symptoms / Reason */}
          <div>
            <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">
              Reason for Visit <span className="normal-case font-medium text-slate-400">(Optional)</span>
            </label>
            <textarea
              rows={3}
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
              placeholder="Briefly describe your symptoms or reason for the visit..."
              className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-100"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-4">
            <p className="text-xs text-slate-400">You can cancel any time before the appointment.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !date || !time}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white shadow-md shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Confirming...
                  </>
                ) : (
                  'Confirm Booking'
                )}
              </button>
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
  const [mapCenter, setMapCenter] = useState([12.9716, 77.5946]);
  const [mapCity, setMapCity] = useState('Bangalore');
  const [doctors, setDoctors] = useState([]);
  const [isRouting, setIsRouting] = useState(false);
  const [isRouteSummaryCollapsed, setIsRouteSummaryCollapsed] = useState(false);
  const [isDoctorsPanelCollapsed, setIsDoctorsPanelCollapsed] = useState(false);
  const chatBottomRef = useRef(null);

  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleBookDoctor = (doctor) => {
    setSelectedDoctor(doctor);
    setIsModalOpen(true);
  };

  const handleConfirmBooking = async (payload) => {
    try {
      await api.post('/api/appointments', payload);
      setIsModalOpen(false);
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
      throw error; // Re-throw so the modal's isSubmitting resets correctly
    }
  };

  // Stable session ID: unique per user per tab, persists across refreshes
  const sessionIdRef = useRef(getOrCreateSessionId(user?.email));

  const patientName = user?.full_name || user?.name || 'Patient';

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isRouting]);

  const handleSendMessage = async () => {
    const userText = chatInput.trim();
    if (!userText || isRouting) return;

    setMessages((prev) => [...prev, { sender: 'user', text: userText }]);
    setChatInput('');
    setIsRouting(true);

    try {
      const response = await api.post('/process', {
        text: userText,
        session_id: sessionIdRef.current,
      });
      const data = response.data;

      setMessages((prev) => [...prev, { sender: 'bot', text: data.reply }]);

      if (data.city && CITY_COORDS[data.city]) {
        setMapCenter(CITY_COORDS[data.city]);
        setMapCity(data.area || data.city);
      }

      if (data.status === 'incomplete') {
        setMissingInfo(data.city ? 'Symptoms' : 'City or area');
      } else {
        setMissingInfo(null);
      }

      setDoctors(data.doctors || []);
    } catch {
      setMessages((prev) => [
        ...prev,
        { sender: 'bot', text: 'Sorry, I could not reach the routing server. Please try again.' },
      ]);
    } finally {
      setIsRouting(false);
    }
  };

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

            <div className="flex items-end gap-3">
              <div className="flex-1 rounded-xl border border-slate-200 bg-slate-50 p-3 transition focus-within:border-blue-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
                <textarea
                  rows="2"
                  className="w-full resize-none bg-transparent text-sm leading-6 text-slate-900 outline-none"
                  placeholder="Example: chest pain near Indiranagar Bangalore"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
              </div>

              <button
                onClick={handleSendMessage}
                disabled={isRouting || !chatInput.trim()}
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
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
            />
          </div>

          <MapContainer center={mapCenter} zoom={13} className="h-full w-full" style={{ zIndex: 0 }}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {doctors.map((doc) => {
              let markerLat = doc.lat;
              let markerLng = doc.lng;
              if (!markerLat || !markerLng || (markerLat === 0 && markerLng === 0)) {
                const fallback = CITY_COORDS[mapCity] || mapCenter;
                markerLat = fallback[0];
                markerLng = fallback[1];
              }
              return (
                <Marker key={doc.id} position={[markerLat, markerLng]}>
                  <Popup>
                    <div className="text-sm">
                      <p className="font-bold">{doc.name}</p>
                      <p className="text-blue-600">{doc.specialty}</p>
                      <p className="mt-1 text-xs text-slate-500">{doc.address}</p>
                      <button
                        onClick={() => handleBookDoctor(doc)}
                        className="mt-2 w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-bold text-white transition hover:bg-blue-700"
                      >
                        Book Now
                      </button>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            <RecenterMap coords={mapCenter} />
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
    </div>
  );
}
