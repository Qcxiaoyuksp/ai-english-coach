// ============================================================
// API /tts — Cloud Text-to-Speech proxy (Xiaomi MiMo adapter)
// ============================================================
// Synthesizes natural speech for the AI's replies. The TTS key lives on the
// server (XIAOMI_TTS_API_KEY) and is never exposed to the browser; users may
// optionally supply their own key/base/model in the request body.
//
// Xiaomi MiMo TTS is NOT the OpenAI `/audio/speech` shape — it reuses the
// chat/completions endpoint:
//   POST {base}/chat/completions
//   header: api-key: <KEY>
//   body: { model, messages:[{role:'user',content:<style>},
//                            {role:'assistant',content:<text to speak>}],
//           audio: { format:'wav', voice } }
//   response: choices[0].message.audio.data  (base64-encoded wav)
// Docs: https://platform.xiaomimimo.com/docs/zh-CN/usage-guide/speech-synthesis-v2.5
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1';
const DEFAULT_MODEL = 'mimo-v2.5-tts';
const DEFAULT_VOICE = 'Chloe';

// A fixed, gentle English-coaching delivery. Per the docs, a `role:user`
// message steers tone/pace without its text appearing in the spoken audio.
const STYLE_PROMPT =
  'Speak in natural, friendly, clear American English at a calm conversational ' +
  'pace, like a warm and encouraging English-speaking tutor.';

/** Strip a trailing endpoint path so we can safely append /chat/completions. */
function normalizeBase(raw: string): string {
  let url = (raw || '').trim().replace(/\/+$/, '');
  url = url.replace(/\/(chat\/completions|completions|chat)$/i, '');
  return url;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      text,
      voice,
      apiKey: userKey,
      baseUrl: userBaseUrl,
      model: userModel,
    }: {
      text?: string;
      voice?: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
    } = body;

    if (!text || !text.trim()) {
      return NextResponse.json({ error: '缺少待合成文本' }, { status: 400 });
    }

    // User-supplied key takes precedence; otherwise use the server built-in.
    const apiKey = userKey?.trim() || process.env.XIAOMI_TTS_API_KEY;
    if (!apiKey) {
      // Signals the client to fall back to the browser TTS.
      return NextResponse.json(
        { error: 'TTS_API_UNAVAILABLE' },
        { status: 503 },
      );
    }

    const base = normalizeBase(
      userBaseUrl?.trim() || process.env.XIAOMI_TTS_BASE_URL || DEFAULT_BASE_URL,
    );
    const model =
      userModel?.trim() || process.env.XIAOMI_TTS_MODEL || DEFAULT_MODEL;
    const selectedVoice = voice?.trim() || DEFAULT_VOICE;

    const upstream = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Xiaomi uses an `api-key` header; also send Bearer for compatibility.
        'api-key': apiKey,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: STYLE_PROMPT },
          { role: 'assistant', content: text },
        ],
        audio: { format: 'wav', voice: selectedVoice },
      }),
    });

    if (!upstream.ok) {
      const errData = await upstream.json().catch(() => ({}));
      const message =
        errData?.error?.message ||
        errData?.message ||
        `TTS 合成失败 (${upstream.status})`;
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    const data = await upstream.json();
    const b64: string | undefined = data?.choices?.[0]?.message?.audio?.data;
    if (!b64) {
      return NextResponse.json(
        { error: 'TTS 响应中未包含音频数据' },
        { status: 502 },
      );
    }

    const audioBuffer = Buffer.from(b64, 'base64');
    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/wav',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /tts] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
