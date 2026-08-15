import { NextRequest, NextResponse } from "next/server";
import { fetchWithTimeout, rateLimit } from "@/lib/api-guard";

const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions";
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB
const ALLOWED = ["audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/m4a", "audio/webm"];

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return limited;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "OPENAI_API_KEY required for audio transcription (Whisper)" },
      { status: 500 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 25 MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  const validExt = ["mp3", "wav", "m4a", "webm", "mp4", "mpeg"];
  if (ext && !validExt.includes(ext) && !ALLOWED.includes(file.type)) {
    return NextResponse.json(
      { error: "Unsupported format. Use mp3, wav, or m4a." },
      { status: 400 }
    );
  }

  try {
    const whisperForm = new FormData();
    whisperForm.append("file", file);
    whisperForm.append("model", "whisper-1");
    whisperForm.append("language", "en");

    const res = await fetchWithTimeout(WHISPER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "transcription_unavailable", message: "Please try again" },
        { status: 503 }
      );
    }

    const data = await res.json();
    const transcript = (data.text ?? "").trim();
    if (!transcript) {
      return NextResponse.json(
        { error: "No speech detected in audio file" },
        { status: 422 }
      );
    }

    return NextResponse.json({ transcript });
  } catch {
    return NextResponse.json(
      { error: "transcription_unavailable", message: "Please try again" },
      { status: 503 }
    );
  }
}
