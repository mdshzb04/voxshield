import {
  DetectionResult,
  RawSignal,
  RiskBand,
  SIGNAL_TYPES,
  SignalType,
  ValidatedSignal,
} from "./types";

export const SIGNAL_POINTS: Record<SignalType, number> = {
  otp_request: 35,
  payment_pressure: 25,
  urgency_language: 15,
  authority_impersonation: 15,
  isolation_language: 10,
  remote_access_request: 20,
  suspicious_link_request: 15,
};

export const SIGNAL_LABELS: Record<SignalType, string> = {
  otp_request: "OTP / Credential Request",
  payment_pressure: "Payment Pressure",
  urgency_language: "Urgency Language",
  authority_impersonation: "Authority Impersonation",
  isolation_language: "Isolation Language",
  remote_access_request: "Remote Access Request",
  suspicious_link_request: "Suspicious Link / Download",
};

export const WHY_IT_MATTERS: Record<SignalType, string> = {
  otp_request:
    "Attackers can use OTPs to authorize transactions or gain account access.",
  payment_pressure:
    "Legitimate institutions never demand immediate payment via gift cards, crypto, or urgent transfers.",
  urgency_language:
    "Artificial time pressure prevents you from verifying claims independently.",
  authority_impersonation:
    "Scammers impersonate banks, police, or government to bypass your skepticism.",
  isolation_language:
    "Telling victims not to contact others prevents independent verification.",
  remote_access_request:
    "Remote-control software can give an attacker direct access to your device.",
  suspicious_link_request:
    "Malicious links and downloads can steal credentials or install malware.",
};

export const SAFE_RESPONSES: Record<SignalType, string> = {
  otp_request:
    "I will not share any verification codes. I'll hang up and call my bank using the number on my card.",
  payment_pressure:
    "I don't make payments under pressure. I'll verify this through official channels first.",
  urgency_language:
    "If this is legitimate, it can wait while I verify independently.",
  authority_impersonation:
    "I'll verify your identity by calling the official number listed on my statement.",
  isolation_language:
    "I'm going to consult someone I trust and call back on an official line.",
  remote_access_request:
    "I won't install remote access software or share my screen with anyone on this call.",
  suspicious_link_request:
    "I won't click links or download anything from this call. I'll visit the official website directly.",
};

const DEFAULT_SAFE_RESPONSE =
  "I need to verify this independently. I'll call back using the official number on my card or statement. I won't share any codes or make payments on this call.";

export function isSignalType(value: string): value is SignalType {
  return (SIGNAL_TYPES as readonly string[]).includes(value);
}

/** Evidence must appear verbatim in transcript (case-insensitive match on normalized whitespace). */
export function validateEvidence(
  transcript: string,
  evidence: string
): boolean {
  if (!evidence.trim()) return false;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(transcript).includes(norm(evidence));
}

export function validateSignals(
  transcript: string,
  raw: RawSignal[]
): ValidatedSignal[] {
  const seen = new Set<string>();
  const validated: ValidatedSignal[] = [];

  for (const item of raw) {
    if (!isSignalType(item.type)) continue;
    if (!validateEvidence(transcript, item.evidence)) continue;

    const key = `${item.type}::${item.evidence.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    validated.push({
      type: item.type,
      evidence: item.evidence,
      points: SIGNAL_POINTS[item.type],
    });
  }

  return validated;
}

export function calculateScore(signals: ValidatedSignal[]): number {
  const total = signals.reduce((sum, s) => sum + s.points, 0);
  return Math.min(total, 100);
}

export function getRiskBand(score: number): RiskBand {
  if (score >= 75) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "CAUTION";
  return "LOW";
}

export const BAND_COLORS: Record<
  RiskBand,
  { bg: string; text: string; border: string }
> = {
  LOW: { bg: "bg-green-100", text: "text-green-800", border: "border-green-400" },
  CAUTION: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-yellow-400",
  },
  HIGH: {
    bg: "bg-orange-100",
    text: "text-orange-800",
    border: "border-orange-400",
  },
  CRITICAL: {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-red-500",
  },
};

export function runPolicyEngine(
  transcript: string,
  raw: RawSignal[]
): DetectionResult {
  const signals = validateSignals(transcript, raw);
  const score = calculateScore(signals);
  return { signals, score, band: getRiskBand(score) };
}

export function buildSafeResponse(signals: ValidatedSignal[]): string {
  if (signals.length === 0) return DEFAULT_SAFE_RESPONSE;
  const unique = Array.from(new Set(signals.map((s) => s.type)));
  return unique.map((t) => SAFE_RESPONSES[t]).join(" ");
}
