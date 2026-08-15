export const SIGNAL_TYPES = [
  "otp_request",
  "payment_pressure",
  "urgency_language",
  "authority_impersonation",
  "isolation_language",
  "remote_access_request",
  "suspicious_link_request",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

export interface RawSignal {
  type: string;
  evidence: string;
}

export interface ValidatedSignal {
  type: SignalType;
  evidence: string;
  points: number;
}

export interface TimelineEntry {
  id: string;
  timestamp: Date;
  type: SignalType;
  evidence: string;
  points: number;
  runningTotal: number;
}

export type RiskBand = "LOW" | "CAUTION" | "HIGH" | "CRITICAL";

export interface DetectionResult {
  signals: ValidatedSignal[];
  score: number;
  band: RiskBand;
}
