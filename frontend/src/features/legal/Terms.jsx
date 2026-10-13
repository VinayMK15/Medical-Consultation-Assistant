import React from 'react';
import LegalLayout from './LegalLayout';

const SECTIONS = [
  {
    heading: 'What MedAssist is',
    paragraphs: [
      'MedAssist is a routing tool. You describe your symptoms and the application suggests which type of specialist is relevant, then helps you find and book an appointment with a nearby provider.',
      'It does not diagnose conditions, does not give medical advice, and does not replace consultation with a licensed clinician.',
    ],
  },
  {
    heading: 'Not for emergencies',
    paragraphs: [
      'Do not use MedAssist for urgent or life-threatening symptoms. If you may be having a medical emergency, contact your local emergency number immediately. In India that is 112.',
    ],
  },
  {
    heading: 'Account responsibilities',
    items: [
      'You must provide accurate information when registering.',
      'You are responsible for keeping your password confidential.',
      'One account per person. Sharing an account makes your medical history unreadable and can mix up records.',
      'You must be legally able to consent to the processing of your own health information.',
    ],
  },
  {
    heading: 'Provider accounts',
    paragraphs: [
      'Doctors register with qualifications, a licence number, and a specialisation. A provider account does not become active until an administrator verifies those details.',
      'Only verified providers may accept bookings.',
    ],
  },
  {
    heading: 'Booking and appointments',
    items: [
      'An appointment slot can be held by only one patient. If two patients try to book the same slot, the second booking is rejected.',
      'You can cancel an upcoming appointment from your appointment history.',
      'Booking an appointment does not guarantee that you will be seen, and does not create a doctor-patient relationship until the consultation takes place.',
    ],
  },
  {
    heading: 'Acceptable use',
    items: [
      'Do not submit symptom text for another person unless you are their legal guardian and are authorised to do so.',
      'Do not attempt to access another user’s account or records.',
      'Do not attempt to register as a provider without a valid medical licence.',
      'Do not use automated tools to scrape, overload, or probe the service.',
    ],
  },
  {
    heading: 'Availability and changes',
    paragraphs: [
      'This is an academic demonstration project. Features may change or be removed without notice, and no guarantee of availability is offered.',
      'Where the terms here conflict with your local law, your local law takes precedence.',
    ],
  },
  {
    heading: 'Limitation of liability',
    paragraphs: [
      'To the extent permitted by law, the project team is not liable for indirect or consequential loss arising from use of this application, including any decision made in reliance on a suggested specialty or a route shown on the map.',
    ],
  },
];

export default function Terms() {
  return (
    <LegalLayout
      title="Terms of Service"
      lastUpdated="October 2026"
      intro="These terms describe the rules for using MedAssist. By creating an account or using the application, you agree to them."
      sections={SECTIONS}
    />
  );
}