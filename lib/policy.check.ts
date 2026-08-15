import {
  calculateScore,
  getRiskBand,
  runPolicyEngine,
  validateEvidence,
  validateSignals,
} from "./policy";

// ponytail: inline self-check — no test framework for hackathon speed
const transcript =
  "Tell me the OTP you just received. Transfer via UPI immediately. I am from the bank.";

const raw = [
  { type: "otp_request", evidence: "Tell me the OTP you just received" },
  { type: "payment_pressure", evidence: "Transfer via UPI immediately" },
  { type: "authority_impersonation", evidence: "I am from the bank" },
  { type: "otp_request", evidence: "FAKE EVIDENCE NOT IN TRANSCRIPT" },
];

const validated = validateSignals(transcript, raw);
console.assert(validated.length === 3, "should reject invalid evidence");
console.assert(
  validateEvidence(transcript, "Tell me the OTP you just received"),
  "evidence must match"
);
console.assert(!validateEvidence(transcript, "nonexistent"), "reject fake");

const result = runPolicyEngine(transcript, raw);
console.assert(result.score === 75, `expected 75 got ${result.score}`);
console.assert(result.band === "CRITICAL", `expected CRITICAL got ${result.band}`);
console.assert(calculateScore(validated) === 75);
console.assert(getRiskBand(50) === "HIGH");

console.log("policy self-check: OK");
