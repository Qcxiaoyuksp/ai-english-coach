// ============================================================
// API /asr — Cloud Speech-to-Text proxy (SiliconFlow)
// ============================================================
// Transcribes a recorded audio clip into text. The ASR key lives on the server
// (SILICONFLOW_ASR_API_KEY) and is never exposed to the browser; users may
// optionally supply their own key/base/model via the multipart form.
//
// SiliconFlow transcription is OpenAI-compatible:
//   POST {base}/audio/transcriptions   (multipart/form-data)
//   header: Authorization: Bearer <KEY>
//   fields: file (audio), model
//   response: { "text": "..." }
// Docs: https://docs.siliconflow.cn/en/api-reference/audio/create-audio-transcriptions
// ============================================================

import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEFAULT_MODEL = 'FunAudioLLM/SenseVoiceSmall';

/** Strip a trailing endpoint path so we can safely append /audio/transcriptions. */
function normalizeBase(raw: string): string {
  let url = (raw || '').trim().replace(/\/+$/, '');
  url = url.replace(/\/(audio\/transcriptions|audio)$/i, '');
  return url;
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: '缺少音频文件' }, { status: 400 });
    }

    const userKey = (form.get('apiKey') as string | null)?.trim();
    const userBaseUrl = (form.get('baseUrl') as string | null)?.trim();
    const userModel = (form.get('model') as string | null)?.trim();

    // User-supplied key takes precedence; otherwise use the server built-in.
    const apiKey = userKey || process.env.SILICONFLOW_ASR_API_KEY;
    if (!apiKey) {
      // Signals the client that no cloud ASR is configured.
      return NextResponse.json(
        { error: 'ASR_API_UNAVAILABLE' },
        { status: 503 },
      );
    }

    const base = normalizeBase(
      userBaseUrl || process.env.SILICONFLOW_ASR_BASE_URL || DEFAULT_BASE_URL,
    );
    const model = userModel || process.env.SILICONFLOW_ASR_MODEL || DEFAULT_MODEL;

    // Re-package the uploaded clip into a fresh multipart request upstream.
    const upstreamForm = new FormData();
    const filename = (file as File).name || 'audio.webm';
    upstreamForm.append('file', file, filename);
    upstreamForm.append('model', model);

    const upstream = await fetch(`${base}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: upstreamForm,
    });

    if (!upstream.ok) {
      const errData = await upstream.json().catch(() => ({}));
      const message =
        errData?.error?.message ||
        errData?.message ||
        `语音识别失败 (${upstream.status})`;
      return NextResponse.json({ error: message }, { status: upstream.status });
    }

    const data = await upstream.json();
    return NextResponse.json({ text: (data?.text || '').trim() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /asr] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
