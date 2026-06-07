// ============================================================
// AudioRecorder — MediaRecorder wrapper for cloud ASR
// ============================================================
// Records a full microphone clip via MediaRecorder. Unlike the browser's
// Web Speech recognition, recording only ends when the caller explicitly
// stops — natural pauses never cut the utterance short. The resulting Blob is
// uploaded to the server-side /api/asr proxy for transcription.
// ============================================================

import { ApiConfig } from '@/types';

/** Preferred recording MIME types, in order. The browser picks the first it
 *  supports; SiliconFlow accepts common containers (webm/opus, mp4/aac). */
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];

  /** Whether this browser can record audio at all. */
  static isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      typeof MediaRecorder !== 'undefined' &&
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices?.getUserMedia
    );
  }

  private pickMimeType(): string | undefined {
    if (typeof MediaRecorder === 'undefined') return undefined;
    return PREFERRED_MIME_TYPES.find((t) => {
      try {
        return MediaRecorder.isTypeSupported(t);
      } catch {
        return false;
      }
    });
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /** Request the mic and begin recording. Throws if permission is denied. */
  async start(): Promise<void> {
    if (!AudioRecorder.isSupported()) {
      throw new Error('此浏览器不支持录音 (MediaRecorder)');
    }
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = this.pickMimeType();
    this.mediaRecorder = new MediaRecorder(
      this.stream,
      mimeType ? { mimeType } : undefined,
    );
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start();
  }

  /**
   * Stop recording and resolve with the recorded audio Blob.
   * Always releases the microphone stream.
   */
  stop(): Promise<Blob> {
    return new Promise<Blob>((resolve, reject) => {
      const recorder = this.mediaRecorder;
      if (!recorder) {
        this.releaseStream();
        reject(new Error('录音尚未开始'));
        return;
      }
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const blob = new Blob(this.chunks, { type });
        this.chunks = [];
        this.mediaRecorder = null;
        this.releaseStream();
        resolve(blob);
      };
      try {
        recorder.stop();
      } catch (err) {
        this.releaseStream();
        reject(err instanceof Error ? err : new Error('停止录音失败'));
      }
    });
  }

  /** Abort recording without producing a clip. */
  cancel(): void {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = null;
      try {
        this.mediaRecorder.stop();
      } catch {
        /* ignore */
      }
    }
    this.mediaRecorder = null;
    this.chunks = [];
    this.releaseStream();
  }

  private releaseStream(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
  }
}

/** File extension that matches a recorded Blob's MIME type. */
function extensionForBlob(blob: Blob): string {
  if (blob.type.includes('mp4')) return 'mp4';
  if (blob.type.includes('ogg')) return 'ogg';
  return 'webm';
}

/**
 * Create a short silent 16-bit PCM mono WAV blob. Used to do a lightweight
 * connectivity test of a custom ASR endpoint (the transcription may be empty;
 * a 200 response means the key/url/model are usable).
 */
export function createTestWavBlob(seconds = 0.6, sampleRate = 16000): Blob {
  const numSamples = Math.floor(seconds * sampleRate);
  const dataSize = numSamples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // audio format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  // Samples left as zeros (silence).
  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Upload a recorded clip to the server-side /api/asr proxy and return the
 * transcribed text. Throws on failure so the caller can surface an error.
 */
export async function transcribeAudio(
  blob: Blob,
  config: ApiConfig,
): Promise<string> {
  const form = new FormData();
  form.append('file', blob, `audio.${extensionForBlob(blob)}`);
  if (config.asrApiModel) form.append('model', config.asrApiModel);
  if (config.asrApiKey) form.append('apiKey', config.asrApiKey);
  if (config.asrApiBaseUrl) form.append('baseUrl', config.asrApiBaseUrl);

  const response = await fetch('/api/asr', { method: 'POST', body: form });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || `ASR request failed: ${response.status}`);
  }
  const data = await response.json();
  return (data.text || '').trim();
}
