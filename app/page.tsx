"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RiskGauge from "@/components/RiskGauge";
import { FALLBACK_LINE_DELAY_MS, FALLBACK_LINES } from "@/lib/fallback";
import { buildSafeResponse, SIGNAL_LABELS, WHY_IT_MATTERS } from "@/lib/policy";
import {
  DetectionResult,
  RiskBand,
  TimelineEntry,
  ValidatedSignal,
} from "@/lib/types";

const DEBOUNCE_MS = 1000;
const MIN_NEW_CHARS = 8;

interface TranscriptLine {
  id: string;
  text: string;
}

type CallerProfile = "unknown" | "bank" | "vendor" | "agency";

const PROFILE_COPY: Record<
  CallerProfile,
  { label: string; caller: string; context: string; response: string }
> = {
  unknown: {
    label: "Unknown caller",
    caller: "+91 98XX XXX 214",
    context: "Citizen protection",
    response: "I will verify this through an official number and call back.",
  },
  bank: {
    label: "Banking call",
    caller: "Bank support",
    context: "Fintech fraud",
    response: "I cannot share OTPs or card details on a call.",
  },
  vendor: {
    label: "Vendor call",
    caller: "Business vendor",
    context: "Enterprise security",
    response: "Please send the request through our approved support channel.",
  },
  agency: {
    label: "Gov service",
    caller: "Public office",
    context: "Government safety",
    response: "I will confirm this on the official government portal.",
  },
};

const RISK_BAND_UI: Record<
  RiskBand,
  { score: string; badge: string; evidence: string; action: string }
> = {
  LOW: {
    score: "text-emerald-600",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    evidence: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    action: "Continue, but keep verification on.",
  },
  CAUTION: {
    score: "text-amber-600",
    badge: "bg-amber-50 text-amber-800 ring-amber-200",
    evidence: "bg-amber-50 text-amber-900 ring-amber-200",
    action: "Slow down and verify before sharing anything.",
  },
  HIGH: {
    score: "text-orange-600",
    badge: "bg-orange-50 text-orange-800 ring-orange-200",
    evidence: "bg-orange-50 text-orange-900 ring-orange-200",
    action: "End the call and use an official callback number.",
  },
  CRITICAL: {
    score: "text-rose-600",
    badge: "bg-rose-50 text-rose-700 ring-rose-200",
    evidence: "bg-rose-50 text-rose-900 ring-rose-200",
    action: "Hang up now. Block, preserve evidence, and report.",
  },
};

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center">
      {children}
    </span>
  );
}

function SvgIcon({
  children,
  fill = "none",
}: {
  children: React.ReactNode;
  fill?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function MicIcon() {
  return (
    <SvgIcon>
      <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z" />
      <path d="M19 11a7 7 0 0 1-14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </SvgIcon>
  );
}

function StopIcon() {
  return (
    <SvgIcon fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2.5" stroke="none" />
    </SvgIcon>
  );
}

function PlayIcon() {
  return (
    <SvgIcon fill="currentColor">
      <path d="M8 5v14l11-7z" stroke="none" />
    </SvgIcon>
  );
}

function UploadIcon() {
  return (
    <SvgIcon>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M5 20h14" />
    </SvgIcon>
  );
}

function ResetIcon() {
  return (
    <SvgIcon>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v6h6" />
    </SvgIcon>
  );
}

function PhoneOffIcon() {
  return (
    <SvgIcon>
      <path d="m3 3 18 18" />
      <path d="M14.2 14.2c-1.1.7-2.5.9-3.7.3a10 10 0 0 1-4.9-4.9c-.6-1.2-.4-2.6.3-3.7L4.5 4.5C3.1 5.9 2.8 8 3.6 9.9a14 14 0 0 0 10.5 10.5c1.9.8 4 .5 5.4-.9l-2.4-2.4c-.8.4-1.8.2-2.4-.4Z" />
    </SvgIcon>
  );
}

function CopyIcon() {
  return (
    <SvgIcon>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </SvgIcon>
  );
}

function SpeakerIcon() {
  return (
    <SvgIcon>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a4 4 0 0 1 0 7" />
      <path d="M18 5a8 8 0 0 1 0 14" />
    </SvgIcon>
  );
}

function highlightTranscript(
  text: string,
  evidences: string[],
  evidenceClass: string
): React.ReactNode[] {
  if (!text || evidences.length === 0) return [text];

  const sorted = [...evidences].filter(Boolean).sort((a, b) => b.length - a.length);
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    let earliest = -1;
    let matchLen = 0;

    for (const ev of sorted) {
      const idx = remaining.toLowerCase().indexOf(ev.toLowerCase());
      if (idx !== -1 && (earliest === -1 || idx < earliest)) {
        earliest = idx;
        matchLen = ev.length;
      }
    }

    if (earliest === -1) {
      parts.push(remaining);
      break;
    }

    if (earliest > 0) parts.push(remaining.slice(0, earliest));
    parts.push(
      <span key={key++} className={`rounded px-1 py-0.5 ring-1 ${evidenceClass}`}>
        {remaining.slice(earliest, earliest + matchLen)}
      </span>
    );
    remaining = remaining.slice(earliest + matchLen);
  }

  return parts;
}

function splitTranscriptLines(text: string): TranscriptLine[] {
  const parts = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  return parts
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t, i) => ({ id: `line-${i}`, text: t }));
}

function getRiskBandFromScore(score: number): RiskBand {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "CAUTION";
  return "LOW";
}

export default function VoxShield() {
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [interim, setInterim] = useState("");
  const [listening, setListening] = useState(false);
  const [demoStreaming, setDemoStreaming] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [inputMode, setInputMode] = useState<"standby" | "live" | "demo" | "upload">("standby");
  const [callerProfile, setCallerProfile] = useState<CallerProfile>("unknown");
  const [micSupported, setMicSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [score, setScore] = useState(0);
  const [band, setBand] = useState<DetectionResult["band"]>("LOW");
  const [signals, setSignals] = useState<ValidatedSignal[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [safeResponse, setSafeResponse] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [copied, setCopied] = useState<"response" | "packet" | "verify" | "share" | "helpline" | "case" | null>(null);
  const [replaying, setReplaying] = useState(false);
  const [scoreAnimKey, setScoreAnimKey] = useState(0);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const transcriptRef = useRef("");
  const lastSentRef = useRef("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenSignalsRef = useRef<Set<string>>(new Set());
  const listeningRef = useRef(false);
  const demoAbortRef = useRef(false);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const replayTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const busy = listening || demoStreaming || uploading;
  const evidences = signals.map((s) => s.evidence);
  const riskUi = RISK_BAND_UI[band];
  const activeProfile = PROFILE_COPY[callerProfile];
  const hasContent = transcriptLines.length > 0 || interim;
  const hasDetectedSignals = signals.length > 0;
  const noRiskMessage = "No risk signals detected. No specific safety response or report is needed for this content.";
  const liveState =
    inputMode === "live"
      ? "Monitoring call"
      : inputMode === "demo"
        ? "Demo call"
        : inputMode === "upload"
          ? uploading
            ? "Transcribing"
            : "Uploaded call"
          : "Ready";
  const userSafeResponse = hasDetectedSignals
    ? safeResponse || activeProfile.response
    : "";
  const verifyText = [
    "VoxShield verification checklist",
    `Caller: ${activeProfile.caller}`,
    `Context: ${activeProfile.context}`,
    "1. Do not share OTP, PIN, password, card number, or remote-access approval.",
    "2. End the call politely.",
    "3. Call back using the official number from website, card, app, or government portal.",
    "4. If money or credentials were requested, preserve this report packet.",
  ].join("\n");
  const helplineText = [
    "Cyber fraud helpline: 1930",
    "Use this only from a phone account that supports calling.",
    "If calling is unavailable here, dial 1930 from your mobile phone.",
    "Keep the VoxShield report packet ready before calling.",
  ].join("\n");
  const attackChain = [
    {
      label: "Trust setup",
      hit: signals.some((s) => s.type === "authority_impersonation"),
      text: "Caller claims bank, office, police, support, or another authority.",
    },
    {
      label: "Pressure",
      hit: signals.some((s) => s.type === "urgency_language" || s.type === "payment_pressure"),
      text: "Caller creates time pressure or pushes immediate payment.",
    },
    {
      label: "Isolation",
      hit: signals.some((s) => s.type === "isolation_language"),
      text: "Caller discourages asking family, manager, bank, or official support.",
    },
    {
      label: "Access request",
      hit: signals.some((s) => s.type === "otp_request" || s.type === "remote_access_request" || s.type === "suspicious_link_request"),
      text: "Caller asks for OTP, remote access, screen share, link, or download.",
    },
  ];
  const packetText = hasDetectedSignals
    ? [
        "VoxShield incident packet",
        `Generated: ${new Date().toLocaleString("en-IN")}`,
        `Caller type: ${activeProfile.label}`,
        `Industry context: ${activeProfile.context}`,
        `Risk: ${band} (${score}/100)`,
        `Signals: ${signals.map((s) => SIGNAL_LABELS[s.type]).join(", ")}`,
        `Evidence:\n${signals.map((s) => `- ${SIGNAL_LABELS[s.type]} (+${s.points}): "${s.evidence}"`).join("\n")}`,
        `Attack chain: ${attackChain.filter((item) => item.hit).map((item) => item.label).join(" > ")}`,
        `Suggested action: ${riskUi.action}`,
        `Safe line: ${userSafeResponse}`,
        `Transcript: ${transcriptRef.current}`,
      ].join("\n")
    : "";

  const cancelReplay = useCallback(() => {
    replayTimersRef.current.forEach(clearTimeout);
    replayTimersRef.current = [];
    setReplaying(false);
  }, []);

  const resetDetectionState = useCallback(() => {
    cancelReplay();
    transcriptRef.current = "";
    lastSentRef.current = "";
    seenSignalsRef.current.clear();
    setTranscriptLines([]);
    setInterim("");
    setSignals([]);
    setScore(0);
    setBand("LOW");
    setTimeline([]);
    setSafeResponse("");
  }, [cancelReplay]);

  const animateScoreTo = useCallback((from: number, to: number) => {
    const steps = 12;
    for (let step = 1; step <= steps; step++) {
      const timer = setTimeout(() => {
        const next = Math.round(from + ((to - from) * step) / steps);
        setScore(next);
        setScoreAnimKey((k) => k + 1);
      }, step * 24);
      replayTimersRef.current.push(timer);
    }
  }, []);

  const replayAttack = useCallback(() => {
    if (replaying || score <= 0 || timeline.length === 0) return;

    const replayEntries = [...timeline];
    const finalScore = score;
    const finalBand = band;
    cancelReplay();
    setReplaying(true);
    setTimeline([]);
    setScore(0);
    setBand("LOW");
    setScoreAnimKey((k) => k + 1);

    let previousScore = 0;
    replayEntries.forEach((entry, index) => {
      const timer = setTimeout(() => {
        setTimeline((prev) => [...prev, entry]);
        animateScoreTo(previousScore, entry.runningTotal);
        previousScore = entry.runningTotal;

        if (index === replayEntries.length - 1) {
          const doneTimer = setTimeout(() => {
            setScore(finalScore);
            setBand(finalBand);
            setScoreAnimKey((k) => k + 1);
            setReplaying(false);
            replayTimersRef.current = [];
          }, 340);
          replayTimersRef.current.push(doneTimer);
        }
      }, 450 * (index + 1));
      replayTimersRef.current.push(timer);
    });
  }, [animateScoreTo, band, cancelReplay, replaying, score, timeline]);

  const runDetection = useCallback(async (text: string, force = false) => {
    if (!text.trim() || (!force && text === lastSentRef.current)) return;
    lastSentRef.current = text;
    setDetecting(true);
    setError(null);

    try {
      const res = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Detection failed");

      setSignals(data.signals);
      setScore(data.score);
      setBand(data.band);
      setSafeResponse(buildSafeResponse(data.signals));
      setScoreAnimKey((k) => k + 1);

      const newSignals = (data.signals as ValidatedSignal[]).filter((sig) => {
        const key = `${sig.type}::${sig.evidence.toLowerCase()}`;
        if (seenSignalsRef.current.has(key)) return false;
        seenSignalsRef.current.add(key);
        return true;
      });

      if (newSignals.length === 0) return;

      setTimeline((prev) => {
        let running = prev.length > 0 ? prev[prev.length - 1].runningTotal : 0;
        const newEntries: TimelineEntry[] = newSignals.map((sig) => {
          running = Math.min(running + sig.points, 100);
          return {
            id: `${sig.type}::${sig.evidence.toLowerCase()}`,
            timestamp: new Date(),
            type: sig.type,
            evidence: sig.evidence,
            points: sig.points,
            runningTotal: running,
          };
        });

        return [...prev, ...newEntries];
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Detection failed");
    } finally {
      setDetecting(false);
    }
  }, []);

  const scheduleDetection = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const newChars = text.length - lastSentRef.current.length;
        if (newChars >= MIN_NEW_CHARS || !lastSentRef.current) {
          runDetection(text);
        }
      }, DEBOUNCE_MS);
    },
    [runDetection]
  );

  const cancelDemoStream = useCallback(() => {
    demoAbortRef.current = true;
    demoTimersRef.current.forEach(clearTimeout);
    demoTimersRef.current = [];
    setDemoStreaming(false);
  }, []);

  const startListening = useCallback(() => {
    cancelDemoStream();
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setMicSupported(false);
      setError("Web Speech API is not supported in this browser. Use Chrome.");
      return;
    }

    resetDetectionState();
    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = transcriptRef.current;
      let interimText = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const chunk = result[0].transcript.trim();
          finalText += `${chunk} `;
          setTranscriptLines((prev) => [
            ...prev,
            { id: `live-${Date.now()}-${i}`, text: chunk },
          ]);
        } else {
          interimText += result[0].transcript;
        }
      }

      transcriptRef.current = finalText;
      setInterim(interimText);
      scheduleDetection(finalText.trim());
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error !== "no-speech" && event.error !== "aborted") {
        setError(`Mic error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      if (listeningRef.current) {
        try {
          recognition.start();
        } catch {
          listeningRef.current = false;
          setListening(false);
          setInputMode("standby");
        }
      }
    };

    recognitionRef.current = recognition;
    listeningRef.current = true;
    recognition.start();
    setListening(true);
    setInputMode("live");
    setError(null);
  }, [cancelDemoStream, resetDetectionState, scheduleDetection]);

  const stopListening = useCallback(() => {
    listeningRef.current = false;
    setListening(false);
    setInputMode("standby");
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (transcriptRef.current.trim()) {
      runDetection(transcriptRef.current.trim());
    }
  }, [runDetection]);

  const loadFallback = useCallback(() => {
    stopListening();
    cancelDemoStream();
    demoAbortRef.current = false;
    resetDetectionState();
    setDemoStreaming(true);
    setInputMode("demo");
    setError(null);

    const streamLine = (index: number) => {
      if (demoAbortRef.current || index >= FALLBACK_LINES.length) {
        setDemoStreaming(false);
        setInputMode("standby");
        return;
      }

      const line = FALLBACK_LINES[index];
      const accumulated = index === 0 ? line : `${transcriptRef.current} ${line}`.trim();
      transcriptRef.current = accumulated;
      setTranscriptLines((prev) => [...prev, { id: `demo-${index}`, text: line }]);
      scheduleDetection(accumulated);

      const timer = setTimeout(() => streamLine(index + 1), FALLBACK_LINE_DELAY_MS);
      demoTimersRef.current.push(timer);
    };

    streamLine(0);
  }, [cancelDemoStream, resetDetectionState, scheduleDetection, stopListening]);

  const handleAudioUpload = useCallback(
    async (file: File) => {
      stopListening();
      cancelDemoStream();
      resetDetectionState();
      setUploading(true);
      setInputMode("upload");
      setError(null);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Transcription failed");

        const text = data.transcript as string;
        transcriptRef.current = text;
        setTranscriptLines(splitTranscriptLines(text));
        await runDetection(text, true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
        setInputMode("standby");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [cancelDemoStream, resetDetectionState, runDetection, stopListening]
  );

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleAudioUpload(file);
    },
    [handleAudioUpload]
  );

  const resetAll = useCallback(() => {
    cancelDemoStream();
    stopListening();
    resetDetectionState();
    setInputMode("standby");
    setError(null);
    setCopied(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [cancelDemoStream, resetDetectionState, stopListening]);

  const speakResponse = useCallback(() => {
    if (!userSafeResponse || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(userSafeResponse);
    utterance.rate = 0.92;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [userSafeResponse]);

  const copyText = useCallback(async (kind: "response" | "packet" | "verify" | "helpline" | "case") => {
    if (!hasDetectedSignals && (kind === "response" || kind === "packet" || kind === "case")) {
      setError("No risk detected, so no safety response or report is needed.");
      return;
    }

    const text =
      kind === "response"
        ? userSafeResponse
        : kind === "verify"
          ? verifyText
          : kind === "helpline"
            ? helplineText
            : packetText;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Clipboard access was unavailable. Please copy the text manually.");
    }
  }, [hasDetectedSignals, helplineText, packetText, userSafeResponse, verifyText]);

  const shareReport = useCallback(async () => {
    if (!hasDetectedSignals) {
      setError("No risk detected, so no report is needed.");
      return;
    }

    const shareData = {
      title: "VoxShield call report",
      text: packetText,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(packetText);
      }
      setCopied("share");
      setTimeout(() => setCopied(null), 1800);
    } catch (error) {
      setCopied(null);
      if (error instanceof DOMException && error.name === "AbortError") return;
      setError("Could not share or copy the report. Please use Copy case pack instead.");
    }
  }, [hasDetectedSignals, packetText]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      demoTimersRef.current.forEach(clearTimeout);
      replayTimersRef.current.forEach(clearTimeout);
      recognitionRef.current?.stop();
      window.speechSynthesis?.cancel();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fbfbfa] text-slate-950">
      <nav className="vs-navbar sticky top-0 z-20 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-2.5 rounded-md text-sm font-semibold tracking-[-0.02em] text-slate-950 transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40"
            aria-label="Refresh VoxShield"
            title="Refresh VoxShield"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className="h-7 w-7 shrink-0 text-slate-950"
            >
              <path d="M12 2.5 19 5v5.8c0 4.8-2.9 8.5-7 10.7-4.1-2.2-7-5.9-7-10.7V5l7-2.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M8.6 13.1v-2.2M12 14.5V9.7M15.4 13.1v-2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>VoxShield</span>
          </button>
          <div className="hidden h-full items-center gap-7 text-sm md:flex">
            <a href="#call" className="vs-nav-link vs-nav-link--call">Call</a>
            <a href="#evidence" className="vs-nav-link vs-nav-link--evidence">Evidence</a>
          </div>
          <button
            onClick={loadFallback}
            disabled={busy}
            className="vs-btn-secondary h-9 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon>
              <PlayIcon />
            </Icon>
            Demo
          </button>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <section id="call" className="grid min-h-[calc(100dvh-7rem)] gap-8 lg:grid-cols-[380px_1fr] lg:items-center">
          <div className="mx-auto w-full max-w-[360px] rounded-[1.5rem] border border-slate-200 bg-[#141414] p-3 shadow-[0_24px_70px_rgba(15,23,42,0.12)]">
            <div className="rounded-[1.55rem] bg-white p-4">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>9:41</span>
                <span>{liveState}</span>
              </div>
              {replaying && (
                <p className="mt-3 text-center text-xs font-medium text-slate-500">
                  Replaying detected pattern...
                </p>
              )}

              <div className="mt-8 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 text-slate-700">
                  <Icon>
                    <MicIcon />
                  </Icon>
                </div>
                <p className="mt-4 text-sm text-slate-500">{activeProfile.label}</p>
                <h1 className="mt-1 text-2xl font-semibold">{activeProfile.caller}</h1>
                <p className="mt-2 text-sm text-slate-500">{activeProfile.context}</p>
              </div>

              <div className="mt-7 flex items-center justify-center">
                <RiskGauge
                  score={score}
                  band={band}
                  bandLabel={band}
                  labelClass={riskUi.score}
                  animKey={scoreAnimKey}
                  detecting={detecting}
                />
              </div>

              <div className={`mt-5 rounded-md px-3 py-2 text-center text-sm font-medium ring-1 ${riskUi.badge}`}>
                {riskUi.action}
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                {!listening ? (
                  <button
                    onClick={startListening}
                    disabled={busy}
                    className="phone-action bg-[#111111] text-white disabled:cursor-not-allowed disabled:opacity-40"
                    title="Start listening"
                  >
                    <Icon>
                      <MicIcon />
                    </Icon>
                    <span>Listen</span>
                  </button>
                ) : (
                  <button onClick={stopListening} className="phone-action bg-rose-600 text-white" title="Stop listening">
                    <Icon>
                      <StopIcon />
                    </Icon>
                    <span>Stop</span>
                  </button>
                )}
                <button
                  onClick={speakResponse}
                  disabled={!hasDetectedSignals || speaking}
                  className="phone-action bg-slate-100 text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  title={hasDetectedSignals ? "Speak safe response" : "No safety response needed"}
                >
                  <Icon>
                    <SpeakerIcon />
                  </Icon>
                  <span>{speaking ? "Voice" : "Reply"}</span>
                </button>
                <button
                  onClick={() => copyText("packet")}
                  disabled={!hasDetectedSignals}
                  className="phone-action bg-slate-100 text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  title={hasDetectedSignals ? "Copy report packet" : "No report needed"}
                >
                  <Icon>
                    <CopyIcon />
                  </Icon>
                  <span>{copied === "packet" ? "Copied" : "Report"}</span>
                </button>
              </div>

              <button
                onClick={stopListening}
                disabled={!listening}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-3 text-sm font-medium text-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon>
                  <PhoneOffIcon />
                </Icon>
                End suspicious call
              </button>
            </div>
          </div>

          <div className="space-y-7">
            <div>
              <p className="text-sm font-medium text-slate-500">
                Live protection during risky phone calls
              </p>
              <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight text-slate-950 text-balance sm:text-5xl">
                Catch scam patterns while the call is still happening.
              </h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
                VoxShield listens, highlights risky phrases, gives a safe line to say, and prepares a report users can share with family, bank staff, or cybercrime support.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              {(Object.keys(PROFILE_COPY) as CallerProfile[]).map((profile) => (
                <button
                  key={profile}
                  onClick={() => setCallerProfile(profile)}
                  className={`rounded-md border px-3 py-3 text-left text-sm transition ${
                    callerProfile === profile
                      ? "border-[#111111] bg-[#111111] text-white"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {PROFILE_COPY[profile].label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
                className="hidden"
                onChange={onFileChange}
              />
              <button onClick={loadFallback} disabled={busy} className="vs-btn-primary disabled:cursor-not-allowed disabled:opacity-40">
                <Icon>
                  <PlayIcon />
                </Icon>
                Run scam demo
              </button>
              {(score > 0 && timeline.length > 0) || replaying ? (
                <button onClick={replayAttack} disabled={replaying} className="vs-btn-secondary disabled:cursor-not-allowed disabled:opacity-50">
                  <Icon>
                    <PlayIcon />
                  </Icon>
                  {replaying ? "Replaying..." : "Replay Attack"}
                </button>
              ) : null}
              <button onClick={() => fileInputRef.current?.click()} disabled={busy} className="vs-btn-secondary disabled:cursor-not-allowed disabled:opacity-40">
                <Icon>
                  <UploadIcon />
                </Icon>
                Upload call audio
              </button>
              {hasDetectedSignals && (
                <button onClick={() => copyText("response")} className="vs-btn-secondary">
                  <Icon>
                    <CopyIcon />
                  </Icon>
                  {copied === "response" ? "Copied response" : "Copy safe response"}
                </button>
              )}
              <button onClick={resetAll} disabled={demoStreaming || uploading} className="vs-btn-ghost disabled:opacity-40">
                <Icon>
                  <ResetIcon />
                </Icon>
                Reset
              </button>
            </div>

            {(error || !micSupported) && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {error || "Mic unavailable. Use the demo script or upload an audio file."}
              </div>
            )}

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Verification Desk</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    One place for callback safety, report sharing, and urgent escalation.
                  </p>
                </div>
                <button onClick={() => copyText("verify")} className="vs-btn-secondary shrink-0">
                  <Icon>
                    <CopyIcon />
                  </Icon>
                  {copied === "verify" ? "Copied checklist" : "Copy checklist"}
                </button>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <p className="rounded-md bg-slate-50 p-3">End call before sharing OTP, PIN, card, password, or remote access.</p>
                <p className="rounded-md bg-slate-50 p-3">Call back using only official app, card, website, or portal contact.</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                {hasDetectedSignals ? (
                  <button onClick={shareReport} className="vs-btn-primary">
                    <Icon>
                      <CopyIcon />
                    </Icon>
                    {copied === "share" ? "Report ready" : "Share report"}
                  </button>
                ) : (
                  <p className="self-center text-sm text-slate-500">No risk detected, no report needed.</p>
                )}
                <button onClick={() => copyText("helpline")} className="vs-btn-secondary">
                  <Icon>
                    <PhoneOffIcon />
                  </Icon>
                  {copied === "helpline" ? "Copied 1930 steps" : "Copy 1930 steps"}
                </button>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Attack Chain</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    Turns detected phrases into a case-ready scam pattern.
                  </p>
                </div>
                {hasDetectedSignals ? (
                  <button onClick={() => copyText("case")} className="vs-btn-secondary shrink-0">
                    <Icon>
                      <CopyIcon />
                    </Icon>
                    {copied === "case" ? "Copied case pack" : "Copy case pack"}
                  </button>
                ) : (
                  <p className="text-sm text-slate-500">No case pack needed.</p>
                )}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {attackChain.map((item, index) => (
                  <div
                    key={item.label}
                    className={`rounded-md border p-3 text-sm ${
                      item.hit
                        ? "border-rose-200 bg-rose-50 text-rose-950"
                        : "border-slate-200 bg-slate-50 text-slate-500"
                    }`}
                  >
                    <p className="font-medium">{index + 1}. {item.label}</p>
                    <p className="mt-2 text-xs leading-5">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="evidence" className="grid gap-6 border-t border-slate-200 py-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Live evidence</h2>
              <span className="text-xs uppercase tracking-[0.18em] text-slate-400">
                {inputMode === "demo" ? "Simulated" : inputMode === "upload" ? "Uploaded" : inputMode === "live" ? "Recording" : "Idle"}
              </span>
            </div>
            <div className="min-h-[210px] rounded-md border border-slate-200 bg-white p-4 text-[15px] leading-7 text-slate-700">
              {!hasContent ? (
                <p className="text-sm text-slate-400">
                  Start listening, run the demo, or upload call audio.
                </p>
              ) : (
                <div className="space-y-3">
                  {transcriptLines.map((line) => (
                    <p key={line.id} className="animate-fade-in-up border-l-2 border-slate-200 pl-3">
                      {highlightTranscript(line.text, evidences, riskUi.evidence)}
                    </p>
                  ))}
                  {interim && <p className="pl-3 text-slate-400">{interim}</p>}
                </div>
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-4 text-lg font-semibold">Response and report</h2>
            <div className="space-y-4 rounded-md border border-slate-200 bg-white p-4">
              {hasDetectedSignals ? (
                <>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Say this
                    </p>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{userSafeResponse}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={speakResponse} disabled={speaking} className="vs-btn-secondary disabled:opacity-50">
                      <Icon>
                        <SpeakerIcon />
                      </Icon>
                      {speaking ? "Speaking" : "Speak"}
                    </button>
                    <button onClick={() => copyText("packet")} className="vs-btn-secondary">
                      <Icon>
                        <CopyIcon />
                      </Icon>
                      {copied === "packet" ? "Copied packet" : "Copy packet"}
                    </button>
                  </div>
                </>
              ) : (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Analysis result
                  </p>
                  <p className="mt-2 text-sm leading-6 text-emerald-700">{noRiskMessage}</p>
                </div>
              )}
              <div className="border-t border-slate-200 pt-4">
                {signals.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    {hasContent && !busy ? "No scam signals detected." : "No risk signals yet."}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {signals.map((sig) => (
                      <div key={`${sig.type}-${sig.evidence}`} className="rounded-md bg-slate-50 p-3">
                        <p className="text-sm font-medium text-slate-900">
                          {SIGNAL_LABELS[sig.type]}
                        </p>
                        <p className="mt-1 font-mono text-xs text-slate-600">
                          &quot;{sig.evidence}&quot;
                        </p>
                        <p className="mt-2 text-xs leading-5 text-slate-500">
                          {WHY_IT_MATTERS[sig.type]}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {timeline.length > 0 && (
          <section className="border-t border-slate-200 py-8">
            <h2 className="mb-4 text-lg font-semibold">Risk timeline</h2>
            <ol className="grid gap-3 md:grid-cols-2">
              {timeline.map((entry, i) => (
                <li
                  key={entry.id}
                  className="animate-slide-in-left rounded-md border border-slate-200 bg-white p-4 text-sm"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium text-slate-900">
                      +{entry.points} {SIGNAL_LABELS[entry.type]}
                    </span>
                    <span className={`font-mono text-xs font-semibold ${RISK_BAND_UI[getRiskBandFromScore(entry.runningTotal)].score}`}>
                      {entry.runningTotal}/100
                    </span>
                  </div>
                  <p className="mt-2 truncate font-mono text-xs text-slate-500">
                    &quot;{entry.evidence}&quot;
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
    </div>
  );
}
