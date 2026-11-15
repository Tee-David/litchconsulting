"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";

/* Minimal typing for the Web Speech API (not in the TS DOM lib). */
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERRORS: Record<string, string> = {
  "not-allowed": "The browser blocks the microphone for this site. Click the lock icon in the address bar, allow the microphone, then try again.",
  "service-not-allowed": "The browser blocks the microphone for this site. Click the lock icon in the address bar, allow the microphone, then try again.",
  "no-speech": "Nothing was heard. Tap the microphone and speak.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a connection. Type instead.",
};

/**
 * Talk to Sage: tap the mic, speak, tap again to stop. The live transcript fills the
 * composer as you talk; it never sends on its own, so you can edit it first.
 * Uses the browser's speech recognition (Nigerian English).
 */
export function useVoice(onText: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const latest = useRef("");

  useEffect(() => setSupported(Boolean(ctor())), []);

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  // An error clears itself after a short time; it never stays on screen.
  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 7000);
    return () => clearTimeout(t);
  }, [error]);

  const start = useCallback(async () => {
    const C = ctor();
    if (!C || rec.current) return;
    setError(null);
    // Ask for the microphone first: the browser shows its own prompt once, and a
    // refusal gives a clear message instead of a silent failure.
    if (navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setError(name === "NotFoundError" ? ERRORS["audio-capture"] : ERRORS["not-allowed"]);
        return;
      }
    }
    if (rec.current) return;
    finalText.current = "";
    latest.current = "";
    const r = new C();
    r.lang = "en-NG";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText.current += res[0].transcript;
        else interim += res[0].transcript;
      }
      latest.current = (finalText.current + interim).replace(/\s+/g, " ").trim();
      setTranscript(latest.current);
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") setError(ERRORS[e.error] ?? "Speech recognition stopped. Type instead.");
    };
    r.onend = () => {
      rec.current = null;
      setListening(false);
      if (latest.current) onText(latest.current);
      setTranscript("");
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      rec.current = null;
      setError("Speech recognition could not start.");
    }
  }, [onText]);

  useEffect(() => () => rec.current?.abort(), []);

  // Tap to start, tap again to stop (mouse, touch, pen and keyboard alike).
  const handlers = {
    onClick: (e: React.MouseEvent) => {
      e.preventDefault();
      if (listening) stop();
      else void start();
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { supported, listening, transcript, error, handlers, Icon: listening ? MicOff : Mic };
}
