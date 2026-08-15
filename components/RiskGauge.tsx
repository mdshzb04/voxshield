import { RiskBand } from "@/lib/types";

const BAND_STROKE: Record<RiskBand, string> = {
  LOW: "#10b981",
  CAUTION: "#f59e0b",
  HIGH: "#f97316",
  CRITICAL: "#f43f5e",
};

interface RiskGaugeProps {
  score: number;
  band: RiskBand;
  bandLabel: string;
  labelClass: string;
  animKey: number;
  detecting: boolean;
}

export default function RiskGauge({
  score,
  band,
  bandLabel,
  labelClass,
  animKey,
  detecting,
}: RiskGaugeProps) {
  const size = 220;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeColor = BAND_STROKE[band];

  return (
    <div className="relative flex flex-col items-center py-2">
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset,stroke] duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 10px ${strokeColor}26)` }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
          Risk score
        </p>
        <div
          key={animKey}
          className={`animate-score-pop text-6xl font-semibold tabular-nums leading-none ${labelClass}`}
        >
          {score}
        </div>
        <p className="mt-1 text-sm text-slate-500">/ 100</p>
        <p className={`mt-2 text-sm font-semibold uppercase tracking-[0.2em] ${labelClass}`}>
          {bandLabel}
        </p>
        {detecting && (
          <p className="mt-2 text-[10px] text-slate-500 animate-pulse-glow">
            Analyzing...
          </p>
        )}
      </div>
    </div>
  );
}
