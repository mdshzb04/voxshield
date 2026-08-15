# VoxShield

Real-time voice security agent that listens to live conversations, transcribes speech in the browser, detects potential social-engineering patterns, and calculates a deterministic risk score — all on one screen.

Built for the Independence Day AI Hackathon (Theme: Security).

## The Problem

Scam calls work because nobody is listening for manipulation *as it happens*. Number-blocking tools only help before you pick up. Once you're on the call, urgency, fake authority, and OTP requests pile up faster than most people can evaluate them.

## How It Works

```mermaid
flowchart TB
    Citizen(["Citizen on a call"])
    Monitor(["Deployment health monitor"])

    subgraph Public["Public internet"]
        Citizen
        Monitor
    end

    subgraph Browser["Citizen device · VoxShield browser UI"]
        direction TB
        UI["Call safety companion<br/>phone UI, evidence, and timeline"]
        Mic["Live microphone<br/>Web Speech API"]
        Upload["Recorded call upload"]
        Demo["Scam demo script"]
        Session["Session-only transcript and result state"]
        Actions["In-call intervention<br/>safe response · TTS · report · Replay Attack"]

        UI --> Mic
        UI --> Upload
        UI --> Demo
        Mic -->|"recognized speech"| Session
        Demo --> Session
        Session --> UI
        UI --> Actions
    end

    subgraph App["VoxShield deployment · Next.js"]
        direction TB
        Guard["API guard<br/>20 requests/minute/IP · 10-second timeout"]
        Transcribe["POST /api/transcribe"]
        Detect["POST /api/detect"]
        Policy["Deterministic policy engine<br/>verbatim-evidence validation<br/>fixed scoring and risk band"]
        Health["GET /api/health"]

        Guard --> Transcribe
        Guard --> Detect
        Detect --> Policy
    end

    subgraph Providers["AI provider APIs"]
        Whisper["OpenAI Whisper<br/>audio transcription"]
        Extractor["OpenAI or Groq<br/>signal extraction only"]
    end

    subgraph Privacy["Privacy boundary"]
        NoStore["No VoxShield database or object storage<br/>raw audio and transcripts are not persisted"]
    end

    Citizen -->|"HTTPS"| UI
    Upload -->|"multipart audio"| Transcribe
    Transcribe -->|"audio"| Whisper
    Whisper -->|"transcript"| Transcribe
    Transcribe -->|"transcript"| Session
    Session -->|"JSON transcript"| Detect
    Detect -->|"analysis prompt"| Extractor
    Extractor -->|"raw signals + evidence"| Detect
    Policy -->|"score, band, validated signals"| Session
    Monitor -->|"GET /api/health"| Health

    classDef public fill:#f8fafc,stroke:#64748b,color:#0f172a,stroke-width:1.5px;
    classDef client fill:#e0f2fe,stroke:#0284c7,color:#0c4a6e,stroke-width:1.5px;
    classDef app fill:#f1f5f9,stroke:#475569,color:#0f172a,stroke-width:1.5px;
    classDef provider fill:#fff7ed,stroke:#ea580c,color:#7c2d12,stroke-width:1.5px;
    classDef output fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:1.5px;
    classDef privacy fill:#fef2f2,stroke:#e11d48,color:#881337,stroke-width:1.5px;

    class Citizen,Monitor public;
    class UI,Mic,Upload,Demo,Session client;
    class Actions output;
    class Guard,Transcribe,Detect,Policy,Health app;
    class Whisper,Extractor provider;
    class NoStore privacy;

    style Public fill:#f8fafc,stroke:#94a3b8,stroke-width:1.5px;
    style Browser fill:#f8fafc,stroke:#7dd3fc,stroke-width:1.5px;
    style App fill:#f8fafc,stroke:#94a3b8,stroke-width:1.5px;
    style Providers fill:#f8fafc,stroke:#fdba74,stroke-width:1.5px;
    style Privacy fill:#fffafa,stroke:#fda4af,stroke-width:1.5px;
```

**Separation of concerns (real in code, not just marketing):**

1. **LLM extractor (OpenAI or Groq)** — identifies potential patterns and returns verbatim evidence substrings. It never assigns scores or makes security decisions.
2. **Policy engine** (`lib/policy.ts`) — validates evidence against the transcript, applies fixed point values, caps at 100, and determines risk bands.

### Signal Types & Scoring

| Pattern | Points |
|---------|--------|
| OTP / credential request | +35 |
| Payment pressure (UPI, gift cards, crypto) | +25 |
| Remote access request (AnyDesk, TeamViewer) | +20 |
| Urgency language | +15 |
| Authority impersonation | +15 |
| Suspicious link / download | +15 |
| Isolation language | +10 |

**Risk bands:** 0–24 LOW · 25–49 CAUTION · 50–74 HIGH · 75–100 CRITICAL

## Privacy

- Live microphone audio is **not stored** — browser speech capture stays in the session
- Uploaded call audio is sent to Whisper for transcription; transcripts are sent to the configured OpenAI or Groq extractor only during the session
- Nothing is persisted to a database or disk

## Run Locally

```bash
cd voxshield
cp .env.local.example .env.local
# Add your free Groq API key to .env.local

npm install
npm run dev
```



### Demo Options

1. **Live mic** — click "Start Listening" and speak a scam scenario
2. **Demo script** — click "Load Demo Script" for a hardcoded banking-scam transcript through the same pipeline

## Stack

- Next.js 14 + Tailwind CSS
- Browser Web Speech API (transcription)
- Groq API (signal extraction)
- Browser SpeechSynthesis (safe response playback)

## Framing

VoxShield detects **potential social-engineering patterns**, not certainty that someone is a scammer. The deterministic policy engine makes the security decision; the LLM only extracts evidence.
