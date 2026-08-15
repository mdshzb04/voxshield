import { NextRequest, NextResponse } from "next/server";
import { GROQ_SYSTEM_PROMPT } from "@/lib/groq-prompt";
import { runPolicyEngine } from "@/lib/policy";
import { RawSignal } from "@/lib/types";
import { fetchWithTimeout, rateLimit } from "@/lib/api-guard";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

function getLlmConfig():
  | { url: string; apiKey: string; model: string; provider: string }
  | null {
  if (process.env.OPENAI_API_KEY) {
    return {
      url: OPENAI_URL,
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini",
      provider: "OpenAI",
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      url: GROQ_URL,
      apiKey: process.env.GROQ_API_KEY,
      model: "llama-3.3-70b-versatile",
      provider: "Groq",
    };
  }
  return null;
}

function parseGroqJson(content: string): RawSignal[] {
  const trimmed = content.trim();
  const jsonStr = trimmed.startsWith("{")
    ? trimmed
    : trimmed.match(/\{[\s\S]*\}/)?.[0];
  if (!jsonStr) return [];

  const parsed = JSON.parse(jsonStr) as { signals?: RawSignal[] };
  if (!Array.isArray(parsed.signals)) return [];
  return parsed.signals.filter(
    (s) => typeof s.type === "string" && typeof s.evidence === "string"
  );
}

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const llm = getLlmConfig();
  if (!llm) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY or GROQ_API_KEY not configured" },
      { status: 500 }
    );
  }

  let transcript: string;
  try {
    const body = await req.json();
    transcript = body.transcript ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!transcript.trim()) {
    return NextResponse.json({
      signals: [],
      score: 0,
      band: "LOW",
      raw: { signals: [] },
    });
  }

  try {
    const llmRes = await fetchWithTimeout(llm.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${llm.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: llm.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: GROQ_SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analyze this transcript and return detected signals as JSON:\n\n${transcript}`,
          },
        ],
      }),
    });

    if (!llmRes.ok) {
      return NextResponse.json(
        { error: "detection_unavailable", message: "Please try again" },
        { status: 503 }
      );
    }

    const llmData = await llmRes.json();
    const content = llmData.choices?.[0]?.message?.content ?? "{}";
    const rawSignals = parseGroqJson(content);
    const result = runPolicyEngine(transcript, rawSignals);

    return NextResponse.json({
      ...result,
      raw: { signals: rawSignals },
    });
  } catch {
    return NextResponse.json(
      { error: "detection_unavailable", message: "Please try again" },
      { status: 503 }
    );
  }
}
