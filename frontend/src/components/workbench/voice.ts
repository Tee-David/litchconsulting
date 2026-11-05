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
  "not-allowed": "Microphone access is blocked. Allow it in the browser to talk to Sage.",
  "service-not-allowed": "Microphone access is blocked. Allow it in the browser to talk to Sage.",
  "no-speech": "Nothing was heard. Hold the button while you speak.",
  "audio-capture": "No microphone was found.",
  network: "Speech recognition needs a connection. Type instead.",
};

/**
 * Push-to-talk: hold the mic, speak, release. The live transcript fills the
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

  const start = useCallback(() => {
    const C = ctor();
    if (!C || rec.current) return;
    setError(null);
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

  // Hold to talk (mouse, touch and pen); Space/Enter toggle for keyboard users.
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.preventDefault();
      start();
    },
    onPointerUp: stop,
    onPointerLeave: () => listening && stop(),
    onPointerCancel: stop,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (listening) stop();
        else start();
      }
    },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };

  return { supported, listening, transcript, error, handlers, Icon: listening ? MicOff : Mic };
}
