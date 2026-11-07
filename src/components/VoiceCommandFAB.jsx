import React, { useState, useRef } from 'react';
import { Mic, MicOff, Send, Sparkles, Loader2, CheckCircle2, AlertCircle, Keyboard, X } from 'lucide-react';

export default function VoiceCommandFAB({ apiKey, onActionSuccess }) {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showInputBox, setShowInputBox] = useState(false);
  const [manualText, setManualText] = useState('');
  const [feedback, setFeedback] = useState(null);
  const recognitionRef = useRef(null);

  const showToast = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback(null), 4500);
  };

  const sendToGeminiVoice = async (textCommand) => {
    if (!textCommand?.trim() || !apiKey) return;
    setIsProcessing(true);
    setFeedback(null);

    try {
      const response = await fetch('/api/gemini-voice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        },
        body: JSON.stringify({ text: textCommand.trim() })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error procesando el comando con Gemini');
      }

      showToast('success', data.message || 'Comando ejecutado correctamente');
      setManualText('');
      setShowInputBox(false);

      if (onActionSuccess) onActionSuccess();
    } catch (err) {
      showToast('error', err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setShowInputBox(true);
      showToast('error', 'Usa el dictado de tu teclado en el cuadro de texto.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-ES';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setFeedback(null);
    };

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setIsListening(false);
      sendToGeminiVoice(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
      showToast('error', 'No se pudo capturar el audio. Prueba de nuevo.');
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    sendToGeminiVoice(manualText);
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 z-40 flex flex-col items-end gap-2.5">
      {feedback && (
        <div
          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-xl border text-xs font-medium max-w-[85vw] sm:max-w-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-950/95 border-emerald-700 text-emerald-200'
              : 'bg-rose-950/95 border-rose-700 text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0"/>
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0"/>
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {showInputBox && (
        <form
          onSubmit={handleManualSubmit}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-2xl shadow-2xl w-[90vw] sm:w-96 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between text-xs text-slate-400 px-1">
            <span className="flex items-center gap-1.5 font-medium text-indigo-400">
              <Sparkles className="w-3.5 h-3.5"/> Comando natural para Gemini
            </span>
            <button
              type="button"
              onClick={() => setShowInputBox(false)}
              className="p-1 hover:text-slate-200"
            >
              <X className="w-4 h-4"/>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              autoFocus
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="Ej: Pasa a In Progress la tarea de..."
              className="flex-1 bg-slate-100 dark:bg-slate-800 text-sm px-3 py-2.5 rounded-xl outline-none focus:ring-2 ring-indigo-500"
            />
            <button
              type="submit"
              disabled={isProcessing || !manualText.trim()}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl transition shrink-0"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin"/> : <Send className="w-5 h-5"/>}
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center gap-2">
        <button
          onClick={() => setShowInputBox(!showInputBox)}
          className="p-3.5 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-lg hover:border-indigo-500 active:scale-95 transition"
          title="Escribir o dictar con teclado"
        >
          <Keyboard className="w-5 h-5"/>
        </button>

        <button
          onClick={toggleListening}
          disabled={isProcessing}
          className={`flex items-center gap-2 px-4 sm:px-5 py-3.5 rounded-full font-medium text-sm text-white shadow-xl active:scale-95 transition-all ${
            isListening
              ? 'bg-rose-600 hover:bg-rose-500 animate-pulse ring-4 ring-rose-500/30'
              : isProcessing
              ? 'bg-indigo-800 cursor-wait'
              : 'bg-indigo-600 hover:bg-indigo-500'
          }`}
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin"/>
              <span className="hidden sm:inline">Procesando...</span>
            </>
          ) : isListening ? (
            <>
              <MicOff className="w-5 h-5"/>
              <span>Escuchando...</span>
            </>
          ) : (
            <>
              <Mic className="w-5 h-5"/>
              <span className="hidden sm:inline">Dictar a Gemini</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
