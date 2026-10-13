import React, { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import AuthTopNav from '../../shared/components/AuthTopNav';
import Button from '../../shared/components/ui/Button';
import { Input, Textarea } from '../../shared/components/ui/Input';
import useDocumentTitle from '../../hooks/useDocumentTitle';
import api from '../../shared/utils/api';

const faqs = [
  {
    q: 'Is MedAssist a diagnostic tool?',
    a: 'No. MedAssist is a routing tool that helps you find the right specialist based on your symptoms. It does not provide medical diagnoses or consultations.',
  },
  {
    q: 'How does specialist matching work?',
    a: 'Describe your symptoms in natural language. Our NLP system analyzes your input and matches you with relevant specialists near your location.',
  },
  {
    q: 'Is my health information private?',
    a: 'Your symptom descriptions and personal details stay in your account. The only people who can see an appointment are the doctor you booked with, and administrators who verify provider licences. See our Privacy Policy for the full breakdown.',
  },
  {
    q: 'How do I book an appointment?',
    a: 'After finding a specialist, click "Book Now" on their profile, select a convenient date and time slot, and confirm your booking.',
  },
];

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false);
  // Ties the toggle to the panel it controls, so a screen reader hears
  // which answer is being expanded.
  const panelId = `faq-panel-${q.replace(/\W+/g, '-').toLowerCase()}`;
  const buttonId = `faq-button-${q.replace(/\W+/g, '-').toLowerCase()}`;

  return (
    <div className="border-b border-slate-200">
      <button
        type="button"
        id={buttonId}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center justify-between gap-4 py-4 text-left text-sm font-semibold text-slate-900 transition hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
      >
        {q}
        <svg
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <p id={panelId} role="region" aria-labelledby={buttonId} className="pb-4 text-sm leading-relaxed text-slate-600">
          {a}
        </p>
      )}
    </div>
  );
}

export default function Contact() {
  useDocumentTitle('Contact');
  const [form, setForm] = useState({ name: '', email: '', message: '' });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.name.trim()) next.name = 'Name is required.';
    if (!form.email.trim()) next.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(form.email)) next.email = 'Please enter a valid email.';
    if (!form.message.trim()) next.message = 'Message is required.';
    setErrors(next);
    setFormError('');
    if (Object.keys(next).length > 0) return;

    setLoading(true);
    try {
      // Real submission. POST /api/contact stores the message for the admin
      // inbox — no IP or user agent is recorded, only what was typed here.
      await api.post('/api/contact', {
        name: form.name.trim(),
        email: form.email.trim(),
        message: form.message.trim(),
      });
      setSubmitted(true);
    } catch (err) {
      const detail = err.response?.data?.detail;
      setFormError(
        detail
          ? Array.isArray(detail)
            ? detail[0].msg
            : detail
          : 'We could not send your message. Please try again, or email support@medassist.com.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Contact Us — MedAssist</title>
        <meta name="description" content="Get in touch with the MedAssist team. Have questions about our symptom-based specialist routing? We're here to help." />
      </Helmet>

      <div className="flex min-h-screen flex-col bg-slate-50">
        <AuthTopNav />

        <main id="main-content" className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 lg:px-8" tabIndex={-1}>
          {/* Header */}
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
              Get in Touch
            </h1>
            <p className="mt-3 text-base text-slate-600">
              Have a question or feedback? We'd love to hear from you.
            </p>
          </div>

          <div className="mt-10 grid gap-10 lg:grid-cols-2">
            {/* Contact Form */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              {submitted ? (
                <div className="text-center">
                  <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-50 text-3xl font-bold text-green-600">
                    ✓
                  </div>
                  <h2 className="text-xl font-bold text-slate-950">Message sent!</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    Thank you for reaching out. We'll get back to you within 24 hours.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-6"
                    onClick={() => {
                      setSubmitted(false);
                      setFormError('');
                      setForm({ name: '', email: '', message: '' });
                    }}
                  >
                    Send another message
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-slate-950">Send us a message</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    Fill out the form below and we'll respond as soon as possible.
                  </p>

                  {formError && (
                    <div
                      role="alert"
                      className="mt-4 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700"
                    >
                      {formError}
                    </div>
                  )}

                  <form noValidate onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <Input
                      label="Name"
                      name="name"
                      autoComplete="name"
                      placeholder="Your full name"
                      value={form.name}
                      onChange={handleChange('name')}
                      error={errors.name}
                    />
                    <Input
                      label="Email address"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      value={form.email}
                      onChange={handleChange('email')}
                      error={errors.email}
                    />
                    <Textarea
                      label="Message"
                      name="message"
                      rows={5}
                      maxLength={4000}
                      placeholder="How can we help you?"
                      value={form.message}
                      onChange={handleChange('message')}
                      error={errors.message}
                    />
                    <Button type="submit" variant="primary" size="lg" loading={loading} className="w-full">
                      Send message
                    </Button>
                    <p className="text-center text-xs text-slate-500">
                      Please do not include medical details. This form is not monitored
                      for emergencies — call <span className="font-semibold text-slate-700">112</span> if you need urgent help.
                    </p>
                  </form>
                </>
              )}
            </div>

            {/* Contact Info + FAQ */}
            <div className="space-y-8">
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-lg font-bold text-slate-950">Contact Information</h2>
                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Email</p>
                      <a
                        href="mailto:support@medassist.com"
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        support@medassist.com
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Phone</p>
                      <a
                        href="tel:+9118001234567"
                        className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        +91 1800-123-4567
                      </a>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Address</p>
                      <address className="text-sm not-italic text-slate-600">
                        123 Health Street, Medical District, Mumbai 400001
                      </address>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
                <h2 className="text-lg font-bold text-slate-950">Frequently Asked Questions</h2>
                <div className="mt-4">
                  {faqs.map((faq) => (
                    <FAQItem key={faq.q} q={faq.q} a={faq.a} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
