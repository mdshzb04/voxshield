/** Realistic banking-scam script — streamed line-by-line in demo mode */
export const FALLBACK_LINES = [
  "Hello, this is Vikram calling from the State Bank fraud department.",
  "Your account has been flagged for suspicious international transactions.",
  "Please stay on the line and don't tell anyone about this call.",
  "I need you to tell me the OTP you just received on your phone.",
  "Also, please install AnyDesk so our security team can secure your device.",
  "You must transfer fifteen thousand rupees via UPI within the next hour.",
] as const;

export const FALLBACK_LINE_DELAY_MS = 1750;

/** Full joined transcript (for reference / tests) */
export const FALLBACK_TRANSCRIPT = FALLBACK_LINES.join(" ");
