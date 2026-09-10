import React, { useState, useEffect, useRef } from 'react';

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
  const [selectedLang, setSelectedLang] = useState('hi-IN');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimText, setInterimText] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSupported, setIsSupported] = useState(true);

  const recognitionRef = useRef(null);

  // Initialize SpeechRecognition
  useEffect(() => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setErrorMsg('Speech recognition is not supported in this browser. Please use Google Chrome or Microsoft Edge.');
    }
  }, []);

  // Cleanup on unmount or close
  useEffect(() => {
    if (!isOpen) {
      stopListening();
      setTranscript('');
      setInterimText('');
      setErrorMsg('');
    }
  }, [isOpen]);

  const startListening = () => {
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
      recognition.lang = selectedLang;
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
          // No speech detected, keep waiting or stop gracefully
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
    if (isListening) {
      stopListening();
      // Wait for recognition to stop before restarting in new language
      setTimeout(() => {
        startListeningWithLang(newLang);
      }, 200);
    }
  };

  const startListeningWithLang = (lang) => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => setIsListening(true);
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
      recognition.onerror = () => setIsListening(false);
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
    }
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

  if (!isOpen) return null;

  const currentDisplayText = (transcript + (interimText ? ' ' + interimText : '')).trim();
  const selectedLangObj = SUPPORTED_VOICE_LANGS.find((l) => l.code === selectedLang) || SUPPORTED_VOICE_LANGS[0];

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl transition-all border border-slate-100">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Voice Symptom Intake</h3>
              <p className="text-xs text-slate-500">Speak naturally in your preferred regional language</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              stopListening();
              onClose();
            }}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Language Selection Row */}
        <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
            <span>🌐</span> Spoken Language:
          </span>
          <select
            value={selectedLang}
            onChange={handleLanguageChange}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 cursor-pointer"
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
              type="button"
              onClick={toggleListening}
              disabled={!isSupported}
              className={`relative z-10 flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition transform active:scale-95 ${
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

          <p className="mt-3 text-sm font-medium text-slate-700">
            {isListening ? (
              <span className="flex items-center gap-1.5 text-red-600 animate-pulse font-semibold">
                <span className="h-2 w-2 rounded-full bg-red-600" />
                Listening in {selectedLangObj.native}... (Tap to stop)
              </span>
            ) : (
              <span className="text-slate-500">Tap microphone and describe your symptoms</span>
            )}
          </p>
        </div>

        {/* Transcribed Text Area */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Speech Transcript
            </span>
            {currentDisplayText && (
              <button
                type="button"
                onClick={handleClear}
                className="text-xs font-medium text-slate-400 hover:text-red-500 transition"
              >
                Clear
              </button>
            )}
          </div>

          <div className="min-h-[72px] max-h-36 overflow-y-auto text-sm leading-relaxed text-slate-800">
            {currentDisplayText ? (
              <p className="font-medium text-slate-900">
                {transcript}
                {interimText && <span className="text-slate-400 italic"> {interimText}</span>}
              </p>
            ) : (
              <p className="text-slate-400 italic text-xs">
                Spoken words in {selectedLangObj.native} ({selectedLangObj.label}) will appear here in real time...
              </p>
            )}
          </div>
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="mt-3 rounded-lg bg-red-50 p-2.5 text-xs font-medium text-red-600 border border-red-100 flex items-center gap-2">
            <span>⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => {
              stopListening();
              onClose();
            }}
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleApply}
            disabled={!currentDisplayText}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span>✓</span>
            <span>Use in Search</span>
          </button>
        </div>

      </div>
    </div>
  );
}
