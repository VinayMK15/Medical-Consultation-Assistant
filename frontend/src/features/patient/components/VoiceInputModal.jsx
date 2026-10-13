import React, { useState, useEffect, useRef } from 'react';
import Modal from '../../../shared/components/ui/Modal';

// Supported Indian regional languages for Web Speech API
export const SUPPORTED_VOICE_LANGS = [
  { code: 'hi-IN', label: 'Hindi', native: 'हिंदी' },
  { code: 'en-IN', label: 'English (India)', native: 'English' },
  { code: 'ta-IN', label: 'Tamil', native: 'தமிழ்' },
  { code: 'te-IN', label: 'Telugu', native: 'తెలుగు' },
  { code: 'kn-IN', label: 'Kannada', native: 'ಕನ್ನಡ' },
  { code: 'ml-IN', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'mr-IN', label: 'Marathi', native: 'मराठी' },
  { code: 'bn-IN', label: 'Bengali', native: 'বাংলা' },
  { code: 'gu-IN', label: 'Gujarati', native: 'ગુજરાતી' },
  { code: 'pa-IN', label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
];

export default function VoiceInputModal({ isOpen, onClose, onApplyText }) {
  // Read the browser locale once at mount. The whole interface is in English,
  // yet voice input used to listen in Hindi until the user opened the dropdown.
  // Anyone can still override from the select below.
  const [selectedLang, setSelectedLang] = useState(() => {
    try {
      const browser = (navigator.language || '').toLowerCase();      // "hi-in"
      const base = browser.split('-')[0];                             // "hi"
      const match = SUPPORTED_VOICE_LANGS.find(
        (l) =>
          l.code.toLowerCase() === browser ||
          l.code.toLowerCase().startsWith(base + '-')
      );
      return match ? match.code : 'en-IN';
    } catch {
      return 'en-IN';
    }
  });
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef(null);
  const micRef = useRef(null);
  // The language-switch restart is debounced by a timer, so it has to be
  // cancellable — see handleLanguageChange.
  const restartTimerRef = useRef(null);

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setErrorMsg('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
    }
  }, []);

  // Cleanup when the dialog closes. Defined after stopListening below so it
  // is not referenced before its declaration (it was, via the effect body).
  // The Modal primitive now calls stopListening on close too, so this only
  // has to reset the transcript state.

  // `langOverride` exists so the language-switch restart reuses this exact path.
  // There used to be a second, trimmed-down copy of this function, which
  // swallowed every recognition error and left stale interim text on screen.
  const startListening = (langOverride) => {
    const lang = langOverride || selectedLang;
    setErrorMsg('');
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setErrorMsg('Speech recognition is not supported in this browser.');
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsListening(true);
        setErrorMsg('');
      };

      recognition.onresult = (event) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            currentFinal += item[0].transcript + ' ';
          } else {
            currentInterim += item[0].transcript;
          }
        }

        if (currentFinal) {
          setTranscript((prev) => (prev ? `${prev.trim()} ${currentFinal.trim()}` : currentFinal.trim()));
        }
        setInterimText(currentInterim);
      };

      recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setErrorMsg('Microphone access was denied. Please allow microphone permissions in your browser.');
        } else if (event.error === 'no-speech') {
          // Silence used to fall through with no message and no state change,
          // so tapping the mic and saying nothing did nothing at all. In a
          // noisy ward, or with a muted mic, "we did not hear that" is the
          // actionable message. Instructional wording: the banner is red, but
          // this is not a failure.
          setErrorMsg('We did not catch that. Tap the microphone and describe your symptoms again.');
        } else if (event.error !== 'aborted') {
          setErrorMsg(`Voice recognition error: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimText('');
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('Failed to start speech recognition:', err);
      setErrorMsg('Could not access microphone.');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop error
      }
    }
    setIsListening(false);
    setInterimText('');
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  const handleLanguageChange = (e) => {
    const newLang = e.target.value;
    setSelectedLang(newLang);

    // A restart queued by the previous change must not fire, or two recognition
    // instances run concurrently and both write into the same state.
    clearTimeout(restartTimerRef.current);

    if (!isListening) return;

    stopListening();
    restartTimerRef.current = setTimeout(() => {
      restartTimerRef.current = null;
      startListening(newLang);
    }, 200);
  };

  const handleApply = () => {
    const fullText = (transcript + (interimText ? ' ' + interimText : '')).trim();
    if (fullText) {
      stopListening();
      onApplyText(fullText);
      onClose();
    }
  };

  const handleClear = () => {
    setTranscript('');
    setInterimText('');
    setErrorMsg('');
  };

  // Reset the transcript when the dialog is reopened, so a previous
  // conversation's text doesn't reappear.
  useEffect(() => {
    if (!isOpen) {
      // Covers the dialog closing inside the 200ms restart window. Without
      // this, a queued restart would start recognition on a closed modal and
      // leave the microphone hot with no visible UI.
      clearTimeout(restartTimerRef.current);
      setTranscript('');
      setInterimText('');
      setErrorMsg('');
    }
  }, [isOpen]);

  // A pending restart must not survive unmount either.
  useEffect(() => () => clearTimeout(restartTimerRef.current), []);

  const currentDisplayText = (transcript + (interimText ? ' ' + interimText : '')).trim();
  const selectedLangObj = SUPPORTED_VOICE_LANGS.find((l) => l.code === selectedLang) || SUPPORTED_VOICE_LANGS[0];

  // Never leave the mic running if the dialog is dismissed by any route.
  const handleClose = () => {
    // Cleared here too, not only in the isOpen effect: this path can run
    // before that effect flushes.
    clearTimeout(restartTimerRef.current);
    stopListening();
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      labelledBy="voice-intake-title"
      initialFocusRef={micRef}
      overlayClassName="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn"
      panelClassName="max-w-lg rounded-2xl border border-slate-100 p-6"
      closeButtonClassName="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      closeButtonLabel="Close voice input"
    >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h3 id="voice-intake-title" className="text-lg font-bold text-slate-900">Voice Symptom Intake</h3>
              <p className="text-sm text-slate-500">Speak naturally in your preferred regional language</p>
            </div>
          </div>
        </div>

        {/* Language Selection Row */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3 border border-slate-200">
          <label
            htmlFor="voice-lang"
            className="text-sm font-semibold text-slate-700 flex items-center gap-1.5"
          >
            <span aria-hidden="true">🌐</span> Spoken Language:
          </label>
          <select
            id="voice-lang"
            value={selectedLang}
            onChange={handleLanguageChange}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer"
          >
            {SUPPORTED_VOICE_LANGS.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.native} ({lang.label})
              </option>
            ))}
          </select>
        </div>

        {/* Pulsing Mic Visualizer */}
        <div className="my-6 flex flex-col items-center justify-center">
          <div className="relative flex items-center justify-center">
            {isListening && (
              <>
                <span className="absolute h-28 w-28 rounded-full bg-blue-400/20 animate-ping" />
                <span className="absolute h-24 w-24 rounded-full bg-blue-500/25 animate-pulse" />
              </>
            )}
            <button
              ref={micRef}
              type="button"
              onClick={toggleListening}
              disabled={!isSupported}
              // The listening state is announced rather than conveyed only by
              // the pulsing visual, which a screen reader cannot perceive.
              aria-label={
                !isSupported
                  ? 'Speech input is not supported in this browser'
                  : isListening
                    ? `Stop listening in ${selectedLangObj.native}`
                    : `Start listening in ${selectedLangObj.native}`
              }
              aria-pressed={isListening}
              className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition transform active:scale-95 focus:outline-none focus-visible:ring-4 focus-visible:ring-blue-300 ${
                isListening
                  ? 'bg-red-500 text-white shadow-red-500/30 hover:bg-red-600'
                  : 'bg-blue-600 text-white shadow-blue-500/30 hover:bg-blue-700'
              } ${!isSupported ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isListening ? (
                <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </button>
          </div>

          <p
            // aria-live so recognition results are spoken as they arrive;
            // before this, the transcript updated silently.
            aria-live="polite"
            aria-atomic="true"
            className="mt-3 text-sm font-medium text-slate-700"
          >
            {isListening ? (
              <span className="flex items-center gap-1.5 text-red-600 animate-pulse font-semibold">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-red-600" />
                Listening in {selectedLangObj.native}... (Tap to stop)
              </span>
            ) : (
              <span className="text-slate-600">Tap microphone and describe your symptoms</span>
            )}
          </p>
        </div>

        {/* Transcribed Text Area */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-semibold text-slate-600">
              Speech Transcript
            </span>
            {currentDisplayText && (
              <button
                type="button"
                onClick={handleClear}
                className="min-h-11 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:text-red-600 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Clear
              </button>
            )}
          </div>

          <div className="min-h-[72px] max-h-36 overflow-y-auto text-sm leading-relaxed text-slate-800">
            {currentDisplayText ? (
              <p className="font-medium text-slate-900">
                {transcript}
                {interimText && <span className="text-slate-500 italic"> {interimText}</span>}
              </p>
            ) : (
              <p className="text-slate-500 italic text-sm">
                Spoken words in {selectedLangObj.native} ({selectedLangObj.label}) will appear here in real time...
              </p>
            )}
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div
            role="alert"
            className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700 border border-red-100 flex items-center gap-2"
          >
            <span aria-hidden="true">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={handleClose}
            className="min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={!currentDisplayText}
            className="flex min-h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            <span aria-hidden="true">✓</span>
            <span>Use in Search</span>
          </button>
        </div>
    </Modal>
  );
}
