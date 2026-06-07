// ============================================================
// API TTS — Cloud Text-to-Speech (Xiaomi MiMo) Client
// ============================================================
// Fetches synthesized audio from the server-side /api/tts proxy and plays it
// through an HTMLAudioElement. Implements the same TTSService interface as the
// browser engine so the SpeechManager can swap between them transparently.
//
// On any failure (no key configured, network error, decode error) speak()
// rejects so the caller (SpeechManager) can fall back to the browser TTS.
// ============================================================

import { TTSOptions } from '@/types';
import { TTSService } from './types';

export class ApiTTS implements TTSService {
  private _isSpeaking = false;
  private audio: HTMLAudioElement | null = null;
  private objectUrl: string | null = null;
  private stopped = false;

  // ─── Callbacks ──────────────────────────────────────────────
  onEnd: () => void = () => {};

  isSupported(): boolean {
    return typeof window !== 'undefined' && typeof Audio !== 'undefined';
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  /** API TTS does not expose browser voices. */
  getVoices(): SpeechSynthesisVoice[] {
    return [];
  }

  /**
   * Synthesize and play the given text. Resolves when playback finishes.
   * Rejects on any error so the caller can fall back to the browser engine.
   */
  async speak(text: string, options?: TTSOptions): Promise<void> {
    if (!text.trim()) return;
    if (!this.isSupported()) {
      throw new Error('Audio playback is not supported');
    }

    this.stopped = false;

    const response = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: options?.apiVoice,
        apiKey: options?.apiConfig?.apiKey,
        baseUrl: options?.apiConfig?.baseUrl,
        model: options?.apiConfig?.model,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `TTS request failed: ${response.status}`);
    }

    const blob = await response.blob();
    // The request may have been stopped while we were awaiting the network.
    if (this.stopped) return;

    const url = URL.createObjectURL(blob);
    this.objectUrl = url;

    await new Promise<void>((resolve, reject) => {
      const audio = new Audio(url);
      this.audio = audio;
      this._isSpeaking = true;

      // Map the rate slider onto playbackRate (browser clamps extreme values).
      if (options?.rate && options.rate > 0) {
        audio.playbackRate = options.rate;
      }

      const cleanup = () => {
        this._isSpeaking = false;
        if (this.objectUrl) {
          URL.revokeObjectURL(this.objectUrl);
          this.objectUrl = null;
        }
        this.audio = null;
      };

      audio.onended = () => {
        cleanup();
        resolve();
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch((e) => {
        cleanup();
        reject(e instanceof Error ? e : new Error('Audio play() rejected'));
      });
    });
  }

  /**
   * Stop playback immediately and release resources.
   */
  stop(): void {
    this.stopped = true;
    if (this.audio) {
      this.audio.pause();
      this.audio.onended = null;
      this.audio.onerror = null;
      this.audio = null;
    }
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this._isSpeaking = false;
    this.onEnd();
  }
}
