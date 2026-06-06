// ============================================================
// Speech Manager — Unified Speech Service Controller
// ============================================================
// Manages both STT and TTS services, handles state transitions,
// microphone permissions, and provides a single interface for
// the rest of the application.
// ============================================================

import { TTSOptions } from '@/types';
import { SpeechServiceState, MicPermissionStatus } from './types';
import { WebSpeechSTT } from './web-speech-stt';
import { WebSpeechTTS } from './web-speech-tts';

export interface SpeechManagerCallbacks {
  /** Called when the overall state changes */
  onStateChange?: (state: SpeechServiceState) => void;
  /** Called when speech is recognized. `confidence` (0-1) is provided for
   *  final results when the browser supplies it. */
  onSpeechResult?: (transcript: string, isFinal: boolean, confidence?: number) => void;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
  /** Called when TTS finishes speaking */
  onSpeakEnd?: () => void;
}

/**
 * Unified Speech Manager.
 *
 * Coordinates STT (Speech-to-Text) and TTS (Text-to-Speech) services.
 * Ensures they don't conflict (e.g., stops listening while speaking).
 * Provides a clean interface for the UI layer.
 */
export class SpeechManager {
  private stt: WebSpeechSTT;
  private tts: WebSpeechTTS;
  private _state: SpeechServiceState = 'idle';
  private callbacks: SpeechManagerCallbacks;

  constructor(callbacks: SpeechManagerCallbacks = {}) {
    this.callbacks = callbacks;

    // Initialize STT
    this.stt = new WebSpeechSTT({
      lang: 'en-US',
      continuous: false,   // One utterance at a time for conversation flow
      interimResults: true,
    });

    this.stt.onResult = (transcript, isFinal, confidence) => {
      this.callbacks.onSpeechResult?.(transcript, isFinal, confidence);
    };

    this.stt.onError = (error) => {
      this.setState('error');
      this.callbacks.onError?.(error);
      // Auto-recover from error state after a short delay
      setTimeout(() => {
        if (this._state === 'error') {
          this.setState('idle');
        }
      }, 2000);
    };

    this.stt.onEnd = () => {
      if (this._state === 'listening') {
        this.setState('idle');
      }
    };

    // Initialize TTS
    this.tts = new WebSpeechTTS();

    this.tts.onEnd = () => {
      if (this._state === 'speaking') {
        this.setState('idle');
        this.callbacks.onSpeakEnd?.();
      }
    };
  }

  // ─── State ──────────────────────────────────────────────────

  get state(): SpeechServiceState {
    return this._state;
  }

  private setState(newState: SpeechServiceState): void {
    if (this._state !== newState) {
      this._state = newState;
      this.callbacks.onStateChange?.(newState);
    }
  }

  // ─── Capability Checks ──────────────────────────────────────

  /** Check if speech recognition is supported */
  isSTTSupported(): boolean {
    return this.stt.isSupported();
  }

  /** Check if speech synthesis is supported */
  isTTSSupported(): boolean {
    return this.tts.isSupported();
  }

  /** Check if both STT and TTS are supported */
  isFullySupported(): boolean {
    return this.isSTTSupported() && this.isTTSSupported();
  }

  // ─── Microphone Permission ──────────────────────────────────

  /**
   * Request microphone permission from the user.
   * Returns the permission status.
   */
  async requestMicPermission(): Promise<MicPermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
      return 'unknown';
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Immediately stop the stream — we just needed permission
      stream.getTracks().forEach((track) => track.stop());
      return 'granted';
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          return 'denied';
        }
      }
      return 'unknown';
    }
  }

  /**
   * Check the current microphone permission without prompting.
   */
  async checkMicPermission(): Promise<MicPermissionStatus> {
    if (typeof navigator === 'undefined' || !navigator.permissions) {
      return 'unknown';
    }

    try {
      const result = await navigator.permissions.query({
        name: 'microphone' as PermissionName,
      });
      return result.state as MicPermissionStatus;
    } catch {
      return 'unknown';
    }
  }

  // ─── STT Controls ──────────────────────────────────────────

  /**
   * Start listening for speech.
   * Will stop any ongoing TTS before starting.
   */
  startListening(): void {
    // Don't start if already in a busy state
    if (this._state === 'speaking') {
      this.tts.stop();
    }

    this.setState('listening');
    this.stt.start();
  }

  /**
   * Stop listening.
   */
  stopListening(): void {
    this.stt.stop();
    if (this._state === 'listening') {
      this.setState('idle');
    }
  }

  // ─── TTS Controls ──────────────────────────────────────────

  /**
   * Speak the given text.
   * Will stop listening before speaking to avoid echo/feedback.
   */
  async speak(text: string, options?: TTSOptions): Promise<void> {
    // Stop listening to avoid echo
    if (this._state === 'listening') {
      this.stt.stop();
    }

    this.setState('speaking');
    try {
      await this.tts.speak(text, options);
    } finally {
      if (this._state === 'speaking') {
        this.setState('idle');
        this.callbacks.onSpeakEnd?.();
      }
    }
  }

  /**
   * Stop any ongoing speech.
   */
  stopSpeaking(): void {
    this.tts.stop();
    if (this._state === 'speaking') {
      this.setState('idle');
    }
  }

  /**
   * Get available TTS voices.
   */
  getVoices(): SpeechSynthesisVoice[] {
    return this.tts.getVoices();
  }

  /**
   * Get English voices sorted by preference.
   */
  getEnglishVoices(): SpeechSynthesisVoice[] {
    return this.tts.getEnglishVoices();
  }

  // ─── Lifecycle ──────────────────────────────────────────────

  /**
   * Stop everything and reset to idle.
   */
  reset(): void {
    this.stt.stop();
    this.tts.stop();
    this.setState('idle');
  }

  /**
   * Clean up all resources.
   * Call this when the component unmounts.
   */
  destroy(): void {
    this.reset();
  }
}
