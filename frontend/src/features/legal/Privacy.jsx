import React from 'react';
import LegalLayout from './LegalLayout';

/**
 * Describes what this codebase actually does with data, rather than
 * asserting certifications the project does not hold. Every item below maps
 * to a real field or table in backend/.
 */
const SECTIONS = [
  {
    heading: 'What we collect',
    paragraphs: [
      'MedAssist collects only what is needed to route you to a relevant specialist and manage an appointment.',
    ],
    items: [
      'Account details: full name, email address, phone number, and optionally your age and gender.',
      'Location: the city and address you provide, used to find nearby doctors. Coordinates are derived from that address.',
      'Symptom descriptions: the free-text you type into the triage chat, used to match you to a specialty.',
      'Appointment records: the doctor, date, time slot, and any reason for visit you provide.',
    ],
  },
  {
    heading: 'Passwords',
    paragraphs: [
      'Passwords are hashed with bcrypt before storage. We never store or transmit your password in plain text.',
      'Sessions use signed JSON Web Tokens. Signing out or reaching the inactivity timeout clears the stored token.',
    ],
  },
  {
    heading: 'How your data is used',
    items: [
      'Symptom text is analysed to determine which specialty to recommend. It is not used to diagnose you.',
      'Your address and city are used to calculate proximity to doctors and to draw a route on the map.',
      'Appointment details are shown to the doctor you booked with, so they can prepare for your consultation.',
    ],
  },
  {
    heading: 'Who can see your information',
    paragraphs: [
      'Patients see their own records. A doctor sees appointments booked with them. Administrators can see account records in order to verify provider licences and moderate the platform.',
      'Your symptom descriptions are not shown to other patients, and doctor ratings are not published on this platform.',
    ],
  },
  {
    heading: 'Data retention and deletion',
    paragraphs: [
      'Account and appointment records are retained while your account is active so that your care history remains available to you and to doctors you have booked with.',
      'You may request deletion of your account and associated records by contacting the project team. Deletion removes your profile and appointment history.',
    ],
  },
  {
    heading: 'Third parties',
    paragraphs: [
      'Two external services are contacted at runtime. Map tiles are requested from OpenStreetMap, which receives your map viewport. Route lines are requested from the OSRM routing service, which receives your start and end coordinates.',
      'No advertising or analytics trackers are embedded in this application.',
    ],
  },
  {
    heading: 'Security measures',
    items: [
      'Password hashing with bcrypt.',
      'Rate limiting on authentication and search endpoints.',
      'Role-based access control — patients, doctors, and administrators each reach only their own routes and API endpoints.',
      'Restricted CORS origins.',
      'Server-side validation on every write endpoint.',
    ],
  },
  {
    heading: 'Your choices',
    items: [
      'You can update your name, contact details, and location at any time from your profile page.',
      'You can change your password from your account settings.',
      'You can request account deletion as described above.',
    ],
  },
];

export default function Privacy() {
  return (
    <LegalLayout
      title="Privacy Policy"
      lastUpdated="October 2026"
      intro="This page explains what information MedAssist collects, why it collects it, and who can see it. It is written to match how this application actually behaves."
      sections={SECTIONS}
    />
  );
}