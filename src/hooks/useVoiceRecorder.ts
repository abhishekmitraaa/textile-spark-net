import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Records a voice note in the browser (Help & Support plan P3c).
 *
 * MediaRecorder picks the first format this browser can record: Opus in WebM
 * (Chrome, Edge, Firefox, Android), then AAC in MP4 (Safari, iOS). Both are on the
 * support bucket's allowlist and pass support-attachment-verify's signature check.
 * A note stops itself at MAX_SECONDS. When the microphone is refused or recording
 * isn't supported, `state` says so and the page offers a file picker instead.
 *
 * (Not useSpeechSearch: that turns speech into text and keeps no audio.)
 */
export const MAX_SECONDS = 120;
const CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus"];

export type RecorderState = "idle" | "recording" | "denied" | "unsupported";

export interface VoiceNote {
  file: File;
  durationMs: number;
}

function pickMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return null;
  }
  return CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? null;
}

export function useVoiceRecorder() {
  const [state, setState] = useState<RecorderState>(() => (pickMime() ? "idle" : "unsupported"));
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const resolveStop = useRef<((note: VoiceNote | null) => void) | null>(null);
  const discard = useRef(false);

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
    setSeconds(0);
  }, []);

  useEffect(() => () => {
    discard.current = true;
    try {
      recorder.current?.stop();
    } catch {
      // already stopped
    }
    cleanup();
  }, [cleanup]);

  /** Start recording. Resolves false when the microphone isn't available. */
  const start = useCallback(async (): Promise<boolean> => {
    const mime = pickMime();
    if (!mime) {
      setState("unsupported");
      return false;
    }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState("denied");
      return false;
    }
    chunks.current = [];
    discard.current = false;
    const rec = new MediaRecorder(stream.current, { mimeType: mime });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.current.push(e.data);
    };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.current;
      const type = (rec.mimeType || mime).split(";")[0];
      const blob = new Blob(chunks.current, { type });
      const ext = type === "audio/mp4" ? "m4a" : type.split("/")[1];
      const note = discard.current || blob.size === 0
        ? null
        : { file: new File([blob], `voice-note.${ext}`, { type }), durationMs };
      cleanup();
      setState("idle");
      resolveStop.current?.(note);
      resolveStop.current = null;
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start();
    setState("recording");
    timer.current = window.setInterval(() => {
      const s = Math.floor((Date.now() - startedAt.current) / 1000);
      setSeconds(s);
      if (s >= MAX_SECONDS) recorder.current?.stop();
    }, 250);
    return true;
  }, [cleanup]);

  /** Stop and keep the note. Resolves null if nothing was recorded. */
  const stop = useCallback((): Promise<VoiceNote | null> => {
    const rec = recorder.current;
    if (!rec || rec.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      resolveStop.current = resolve;
      rec.stop();
    });
  }, []);

  /** Stop and throw the recording away. */
  const cancel = useCallback(() => {
    discard.current = true;
    const rec = recorder.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  return { state, seconds, start, stop, cancel };
}
