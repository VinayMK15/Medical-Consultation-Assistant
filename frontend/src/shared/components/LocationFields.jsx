import React, { useState, useEffect, useRef, useId, useCallback } from 'react';
import { CITY_COORDS } from '../constants/cities';

/**
 * Location input fields shared by Signup and Profile → Personal Info.
 *
 * These live here rather than in a feature because the same two fields
 * appear in both places, and the city drives doctor proximity matching —
 * so it must behave identically wherever it is edited.
 */

const controlCls = (hasError) =>
  `h-10 w-full rounded-[var(--radius-control,0.5rem)] border bg-white px-3 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none focus:ring-2 ${
    hasError
      ? 'border-danger-400 focus:ring-danger-400'
      : 'border-slate-300 focus:border-primary-500 focus:ring-primary-500'
  }`;

/** Close a floating list on an outside mousedown. */
function useClickOutside(refs, onOutside) {
  useEffect(() => {
    function handle(e) {
      const inside = refs.some((r) => r.current && r.current.contains(e.target));
      if (!inside) onOutside();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

// ── City Autocomplete ────────────────────────────────────────────────────────
export function CityAutocomplete({
  label,
  value,
  onChange,
  error,
  disabled,
  cities = Object.keys(CITY_COORDS),
  hint,
}) {
  const inputId = useId();
  const listId = `${inputId}-list`;

  // Seeded from `value` and re-synced when it changes from outside. The
  // original version started empty and only ever updated on typing or
  // selection, so an already-populated field (Profile edit) rendered blank
  // and appeared to lose the user's city.
  const [query, setQuery] = useState(value || '');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useClickOutside([wrapRef], () => setOpen(false));

  const matches = cities.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()));

  const commit = (city) => {
    setQuery(city);
    onChange(city);
    setOpen(false);
    setHighlight(0);
    inputRef.current?.focus();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => {
        const n = matches.length;
        if (!n) return 0;
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        return (h + delta + n) % n;
      });
    } else if (e.key === 'Enter') {
      // Only intercept Enter when a suggestion is actually highlighted,
      // otherwise the form would submit instead of letting the user tab on.
      if (open && matches[highlight]) {
        e.preventDefault();
        commit(matches[highlight]);
      }
    } else if (e.key === 'Escape') {
      if (open) { e.stopPropagation(); setOpen(false); }
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[highlight] ? `${listId}-${highlight}` : undefined}
        value={query}
        disabled={disabled}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setHighlight(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Start typing your city..."
        className={controlCls(error)}
        autoComplete="off"
      />

      {open && matches.length > 0 && (
        <ul
          id={listId}
          ref={listRef}
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {matches.map((city, i) => (
            <li key={city} id={`${listId}-${i}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                // onMouseDown fires before the input's blur, so the click
                // isn't lost to the dropdown closing first.
                onMouseDown={(e) => { e.preventDefault(); commit(city); }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full px-3 py-2 text-left text-sm ${
                  i === highlight
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-700 hover:bg-primary-50 hover:text-primary-700'
                }`}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1.5 text-sm text-danger-600">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

// ── Address Autocomplete ─────────────────────────────────────────────────────
export function AddressAutocomplete({ label, value, onChange, error, disabled, hint }) {
  const inputId = useId();
  const listId = `${inputId}-list`;

  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const wrapRef = useRef(null);
  // The debounce handle must be a ref, not state: a state update would
  // re-render mid-keystroke and a stale closure could clear the wrong
  // timer. Also cleared on unmount so a pending fetch can't set state
  // after the component is gone.
  const timerRef = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);
  useEffect(() => () => clearTimeout(timerRef.current), []);
  useClickOutside([wrapRef], () => setOpen(false));

  const fetchSuggestions = useCallback(async (q) => {
    if (!q || q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1`
      );
      const data = await res.json();
      if (Array.isArray(data)) setSuggestions(data);
    } catch {
      // Offline, rate-limited, or blocked: the field stays a plain text
      // input and the user can still type an address by hand.
      setSuggestions([]);
    }
  }, []);

  const onInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    onChange(q);
    setOpen(true);
    setHighlight(0);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fetchSuggestions(q), 300);
  };

  const commit = (place) => {
    const formatted = [
      place.address?.road,
      place.address?.suburb,
      place.address?.city,
      place.address?.state,
    ].filter(Boolean).join(', ') || place.display_name;
    setQuery(formatted);
    onChange(formatted);
    setOpen(false);
    setSuggestions([]);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) { setOpen(true); return; }
      setHighlight((h) => {
        const n = suggestions.length;
        if (!n) return 0;
        const delta = e.key === 'ArrowDown' ? 1 : -1;
        return (h + delta + n) % n;
      });
    } else if (e.key === 'Enter') {
      if (open && suggestions[highlight]) {
        e.preventDefault();
        commit(suggestions[highlight]);
      }
    } else if (e.key === 'Escape') {
      if (open) { e.stopPropagation(); setOpen(false); }
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && suggestions[highlight] ? `${listId}-${highlight}` : undefined}
        value={query}
        disabled={disabled}
        onChange={onInput}
        onFocus={() => { if (suggestions.length) setOpen(true); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder="Start typing your address..."
        className={controlCls(error)}
        autoComplete="off"
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-48 w-full divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg"
        >
          {suggestions.map((place, i) => (
            <li key={place.place_id || i} id={`${listId}-${i}`} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); commit(place); }}
                onMouseEnter={() => setHighlight(i)}
                className={`w-full px-3 py-2 text-left text-sm ${
                  i === highlight
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-slate-700 hover:bg-primary-50 hover:text-primary-700'
                }`}
              >
                {place.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1.5 text-sm text-danger-600">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
