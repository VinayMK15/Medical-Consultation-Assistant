import React from 'react';

/**
 * Single stroke-icon set for the admin portal.
 *
 * The dashboard previously leaned on emoji (👨‍⚕️, ➕, 🗑️) which render at
 * different sizes and weights per platform, so the table rows looked uneven
 * against the crisp Tailwind cards around them. Every admin icon now comes
 * from here on a shared 24×24 grid with one stroke width, so a row of
 * buttons lines up pixel for pixel.
 */
const PATHS = {
  // Navigation
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20.2 20.2-4.1-4.1" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M6.5 3v4.5a3.5 3.5 0 0 0 7 0V3" />
      <path d="M5 3h3M12 3h3" />
      <path d="M10 11v3.5a4.5 4.5 0 0 0 9 0V13" />
      <path d="M19 10.6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z" />
    </>
  ),
  users: (
    <>
      <path d="M16.5 20v-1.5a4 4 0 0 0-4-4h-5a4 4 0 0 0-4 4V20" />
      <circle cx="10" cy="7.5" r="3.5" />
      <path d="M20.5 20v-1.5a4 4 0 0 0-3-3.87" />
      <path d="M15.5 4.13a4 4 0 0 1 0 6.74" />
    </>
  ),

  // Detail page sections
  clipboard: (
    <>
      <path d="M9 5.5H7.5A1.5 1.5 0 0 0 6 7v12.5A1.5 1.5 0 0 0 7.5 21h9a1.5 1.5 0 0 0 1.5-1.5V7a1.5 1.5 0 0 0-1.5-1.5H15" />
      <rect x="9" y="3" width="6" height="4" rx="1.2" />
      <path d="M9.5 11.5h5M9.5 15h3.5" />
    </>
  ),
  calendar: (
    <>
      <path d="M6.75 3v2.5M17.25 3v2.5M3.5 9.5h17" />
      <rect x="4" y="4.75" width="16" height="16" rx="1.8" />
    </>
  ),
  plane: (
    <>
      <path d="M3.5 11.25 20.5 4l-6.75 16.5-2.4-7.35-7.85-1.9Z" />
      <path d="m11.35 13.15 3.9-4.4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.25V12l3.25 2" />
    </>
  ),
  building: (
    <>
      <path d="M4 20.5h16" />
      <path d="M6.5 20.5V6l6-2.5 6 2.5v14.5" />
      <path d="M10 9.5h1.5M14 9.5h1.5M10 13.5h1.5M14 13.5h1.5" />
      <path d="M10.5 20.5v-3.5h3v3.5" />
    </>
  ),
  document: (
    <>
      <path d="M7 3.5h6l4 4v12.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V3.5Z" />
      <path d="M13 3.5V8h4" />
      <path d="M9.75 12.5h4.5M9.75 16h4.5" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 5 5.75v5.5c0 4.1 2.85 7.95 7 9.25 4.15-1.3 7-5.15 7-9.25v-5.5L12 3Z" />
      <path d="m9.25 12 2 2 3.5-3.75" />
    </>
  ),

  // Field icons
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="1.8" />
      <path d="m3.75 7.5 8.25 5.5 8.25-5.5" />
    </>
  ),
  phone: (
    <>
      <path d="M6.4 3.75 8.5 7a1.1 1.1 0 0 1-.2 1.4l-1.3 1a11.5 11.5 0 0 0 5.6 5.6l1-1.3a1.1 1.1 0 0 1 1.4-.2l3.25 2.1-1.4 4.15a1.9 1.9 0 0 1-2.15 1.3C9.35 19.5 4.5 14.65 4.5 8.8a1.9 1.9 0 0 1 1.3-2.15l4.15-1.4Z" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.7 7-11a7 7 0 1 0-14 0c0 5.3 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  badge: (
    <>
      <path d="M7 3.5h6l4 4v12.25a.75.75 0 0 1-.75.75h-8.5a.75.75 0 0 1-.75-.75V3.5Z" />
      <path d="M13 3.5V8h4" />
      <path d="m9.75 15.5 1.75 1.75 3.25-3.5" />
    </>
  ),
  award: (
    <>
      <circle cx="12" cy="8.75" r="5.25" />
      <path d="m8.6 13.1-1.1 7.4 4.5-2.6 4.5 2.6-1.1-7.4" />
    </>
  ),
  card: (
    <>
      <rect x="3" y="5.25" width="18" height="13.5" rx="2" />
      <path d="M6.75 9.5h4M6.75 13h7M6.75 15.75h4.5" />
    </>
  ),
  heart: (
    <>
      <path d="M12 20.25s-7.5-4.6-7.5-9.6a4.4 4.4 0 0 1 7.5-3.1 4.4 4.4 0 0 1 7.5 3.1c0 5-7.5 9.6-7.5 9.6Z" />
    </>
  ),
  bell: (
    <>
      <path d="M18 15.5V11a6 6 0 0 0-12 0v4.5L4.5 18h15L18 15.5Z" />
      <path d="M9.75 18a2.25 2.25 0 0 0 4.5 0" />
    </>
  ),
  userCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.25 11a2.75 2.75 0 1 1 5.5 0" />
      <path d="M6.75 18.5c.85-2.4 2.9-3.5 5.25-3.5s4.4 1.1 5.25 3.5" />
    </>
  ),

  // Actions
  plus: <path d="M12 5.25v13.5M5.25 12h13.5" />,
  check: <path d="m4.75 12.5 4.75 4.75L19.25 6.5" />,
  x: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  edit: (
    <>
      <path d="M4 20.25h4.25L19 9.5a2.83 2.83 0 0 0-4-4L4.25 16v4.25Z" />
      <path d="m13.75 6.75 3.5 3.5" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.75A1.25 1.25 0 0 1 10.75 3.5h2.5a1.25 1.25 0 0 1 1.25 1.25V6.5" />
      <path d="m6.75 6.5.9 13.05A1.5 1.5 0 0 0 9.15 21h5.7a1.5 1.5 0 0 0 1.5-1.45l.9-13.05" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  chevronLeft: <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />,
  chevronRight: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
  refresh: (
    <>
      <path d="M20.25 12a8.25 8.25 0 1 1-2.4-5.8" />
      <path d="M20.5 4v4.25h-4.25" />
    </>
  ),
  printer: (
    <>
      <path d="M7 8.5V3.5h10v5" />
      <path d="M6.5 18.5h-1A1.5 1.5 0 0 1 4 17v-4.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 12.5V17a1.5 1.5 0 0 1-1.5 1.5h-1" />
      <path d="M7 14.5h10V21H7v-6.5Z" />
    </>
  ),
  logout: (
    <>
      <path d="M14.5 4.5H6.75A1.75 1.75 0 0 0 5 6.25v11.5A1.75 1.75 0 0 0 6.75 19.5h7.75" />
      <path d="M10 12h10.5M17.25 8.5 20.5 12l-3.25 3.5" />
    </>
  ),
  alert: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.75v5M12 16h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.75h.01" />
    </>
  ),
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  filter: <path d="M4 6.75h16M7 12h10M10 17.25h4" />,
  externalLink: (
    <>
      <path d="M14 4.5h5.5V10" />
      <path d="m19.5 4.5-8 8" />
      <path d="M18 14v5.25a.75.75 0 0 1-.75.75H5.25a.75.75 0 0 1-.75-.75V6.75A.75.75 0 0 1 5.25 6H10.5" />
    </>
  ),
};

export default function Icon({ name, className = 'h-5 w-5' }) {
  const content = PATHS[name];
  if (!content) return null;
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      {content}
    </svg>
  );
}