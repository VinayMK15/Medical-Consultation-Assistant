import React, { useState, useEffect, useCallback } from 'react';
import api from '../../../shared/utils/api';

/** Helper to generate calendar grid dates for a given year/month. */
function generateCalendarDays(year, month) {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  const days = [];
  // Add padding days for the previous month
  const startPadding = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
  for (let i = 0; i < startPadding; i++) {
    days.push(null);
  }
  
  // Add actual days
  for (let d = 1; d <= lastDay.getDate(); d++) {
    // format as YYYY-MM-DD
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    days.push({ day: d, dateStr, isWeekend: new Date(year, month - 1, d).getDay() === 0 || new Date(year, month - 1, d).getDay() === 6 });
  }
  
  return days;
}

export default function DoctorCalendar() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  
  const [summary, setSummary] = useState({ booked_counts: {}, blocked_dates: [] });
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [isToggling, setIsToggling] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/doctor/calendar-summary', {
        params: { year, month }
      });
      setSummary(res.data);
    } catch (err) {
      setErrorMsg('Failed to load calendar data.');
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handlePrevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleToggleBlocked = async (dateStr) => {
    setIsToggling(true);
    setErrorMsg('');
    try {
      const res = await api.post('/api/doctor/blocked-dates', { date: dateStr });
      // Update local state smoothly
      setSummary((prev) => ({
        ...prev,
        blocked_dates: res.data.blocked_dates,
      }));
    } catch (err) {
      setErrorMsg(err.response?.data?.detail || 'Failed to update vacation status.');
    } finally {
      setIsToggling(false);
    }
  };

  const days = generateCalendarDays(year, month);
  const monthName = new Date(year, month - 1, 1).toLocaleString('default', { month: 'long' });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      {/* ── Left: Calendar Grid ── */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{monthName} {year}</h2>
            <p className="text-xs font-semibold text-slate-500">Manage your monthly availability</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50">&lt;</button>
            <button onClick={() => { setYear(today.getFullYear()); setMonth(today.getMonth() + 1); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50">Today</button>
            <button onClick={handleNextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50">&gt;</button>
          </div>
        </div>

        {errorMsg && (
          <div className="border-b border-red-100 bg-red-50 px-6 py-3 text-xs font-semibold text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="p-6">
          <div className="grid grid-cols-7 gap-2">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="text-center text-xs font-bold uppercase tracking-wide text-slate-400 pb-2">
                {d}
              </div>
            ))}
            
            {loading ? (
              <div className="col-span-7 flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
              </div>
            ) : (
              days.map((dayObj, i) => {
                if (!dayObj) return <div key={`empty-${i}`} className="h-16 sm:h-20 rounded-xl bg-slate-50/50" />;
                
                const todayStr = today.toISOString().split('T')[0];
                const isPast = dayObj.dateStr < todayStr;
                const isBlocked = summary.blocked_dates.includes(dayObj.dateStr);
                const bookedCount = summary.booked_counts[dayObj.dateStr] || 0;
                const isSelected = selectedDate === dayObj.dateStr;
                const isToday = dayObj.dateStr === todayStr;

                let bgClass = "bg-white hover:border-indigo-300";
                if (isPast) {
                  bgClass = isSelected
                    ? "border-indigo-400 ring-2 ring-indigo-200 shadow-sm"
                    : "border-slate-200/90 hover:border-slate-300";
                } else if (isBlocked) {
                  bgClass = "bg-slate-100 opacity-60";
                } else if (isSelected) {
                  bgClass = "bg-indigo-50 border-indigo-400 ring-2 ring-indigo-100";
                } else if (isToday) {
                  bgClass = "bg-blue-50/60 border-blue-300 ring-1 ring-blue-300";
                }

                const textureStyle = isPast
                  ? {
                      backgroundImage:
                        'repeating-linear-gradient(135deg, rgba(241, 245, 249, 0.95), rgba(241, 245, 249, 0.95) 6px, rgba(226, 232, 240, 0.65) 6px, rgba(226, 232, 240, 0.65) 12px)',
                    }
                  : {};

                return (
                  <button
                    key={dayObj.dateStr}
                    onClick={() => setSelectedDate(dayObj.dateStr)}
                    style={textureStyle}
                    className={`relative flex h-16 sm:h-20 flex-col rounded-xl border p-2 transition text-left focus:outline-none ${bgClass}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-bold ${isPast ? 'text-slate-400 font-medium' : isBlocked ? 'text-slate-400' : isToday ? 'text-blue-700 font-extrabold' : 'text-slate-700'}`}>
                        {dayObj.day}
                      </span>
                      {isToday && (
                        <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[9px] font-extrabold uppercase text-white">
                          Today
                        </span>
                      )}
                    </div>
                    
                    <div className="mt-auto space-y-1">
                      {isBlocked ? (
                        <div className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 truncate">
                          🌴 Vacation
                        </div>
                      ) : bookedCount > 0 ? (
                        <div className={`rounded px-1.5 py-0.5 text-[10px] font-bold truncate ${isPast ? 'bg-slate-200/80 text-slate-600' : 'bg-indigo-100 text-indigo-700'}`}>
                          • {bookedCount} booked
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ── Right: Date Details Panel ── */}
      <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm h-fit">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-600">Day Details</p>
          <h3 className="mt-1 text-base font-bold text-slate-950">
            {selectedDate ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) : 'No date selected'}
          </h3>
        </div>
        
        <div className="p-5">
          {!selectedDate ? (
            <div className="text-center py-10">
              <span className="text-3xl">📅</span>
              <p className="mt-3 text-sm text-slate-400">Select a date on the calendar to manage availability.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Vacation Toggle */}
              {(() => {
                const todayStr = new Date().toISOString().split('T')[0];
                const isSelectedDatePast = selectedDate < todayStr;
                return (
                  <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-sm font-bold text-slate-800">Vacation / Leave</p>
                    <p className="mt-1 text-xs text-slate-500 mb-4">
                      {isSelectedDatePast
                        ? 'Past dates cannot be set as vacation.'
                        : 'Mark this day as a vacation to completely block patients from booking any slots.'}
                    </p>
                    <button
                      onClick={() => handleToggleBlocked(selectedDate)}
                      disabled={isToggling || isSelectedDatePast}
                      title={isSelectedDatePast ? 'Past dates cannot be set as vacation.' : ''}
                      className={`w-full rounded-lg px-4 py-2 text-sm font-bold transition focus:outline-none ${
                        isSelectedDatePast
                          ? 'bg-slate-200 text-slate-400 cursor-not-allowed opacity-75 border border-slate-300'
                          : summary.blocked_dates.includes(selectedDate)
                          ? 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                          : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-500/20'
                      }`}
                    >
                      {isToggling
                        ? 'Updating...'
                        : summary.blocked_dates.includes(selectedDate)
                        ? 'Remove Vacation Block'
                        : isSelectedDatePast
                        ? '🌴 Past Date (Cannot Block)'
                        : '🌴 Mark as Vacation'}
                    </button>
                  </div>
                );
              })()}

              {/* Day Summary */}
              {!summary.blocked_dates.includes(selectedDate) && (
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <p className="text-sm font-bold text-blue-900">Appointments</p>
                  <p className="mt-1 text-3xl font-black text-blue-700">
                    {summary.booked_counts[selectedDate] || 0}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-blue-600/80 uppercase tracking-wide">
                    Booked for this day
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
