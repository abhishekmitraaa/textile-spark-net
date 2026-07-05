import { useCallback, useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────
// Voice search via the browser's built-in Web Speech API
// (SpeechRecognition / webkitSpeechRecognition). No library, no API key —
// works in Chrome, Edge and Safari over HTTPS after the mic permission
// prompt. Firefox has no support, hence the `supported` flag.
//
// `onResult(text, isFinal)` fires with interim transcripts as the user speaks
// (isFinal=false) and once with the final transcript (isFinal=true), so the
// caller can live-fill the input and run the search when speech ends.
// ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type Recognition = any;

function getRecognitionCtor(): any {
  if (typeof window === "undefined") return null;
  return (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition || null;
}

export function useSpeechSearch(onResult: (text: string, isFinal: boolean) => void) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef<Recognition | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setSupported(Boolean(getRecognitionCtor()));
  }, []);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* already stopped */ }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    // Recreate each session — some engines don't cleanly restart a reused instance.
    const rec: Recognition = new Ctor();
    rec.lang = (typeof navigator !== "undefined" && navigator.language) || "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => setListening(true);
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    rec.onresult = (e: any) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += transcript;
        else interim += transcript;
      }
      if (final.trim()) onResultRef.current(final.trim(), true);
      else if (interim.trim()) onResultRef.current(interim.trim(), false);
    };
    recRef.current = rec;
    try { rec.start(); } catch { /* start() throws if already running */ }
  }, []);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  // Clean up any active session on unmount.
  useEffect(() => () => { try { recRef.current?.abort?.(); } catch { /* noop */ } }, []);

  return { listening, supported, start, stop, toggle };
}
