// ============================================================
// Web Speech STT — Browser Speech Recognition Wrapper
// ============================================================
// Encapsulates the Web Speech API's SpeechRecognition for
// consistent speech-to-text functionality with error handling,
// auto-restart, and browser compatibility detection.
// ============================================================

import { STTService } from './types';

/**
 * Web Speech API based Speech-to-Text service.
 *
 * Best supported on Chrome/Edge. Uses `webkitSpeechRecognition`
 * as a fallback for browsers that don't have the standard API.
 */
export class WebSpeechSTT implements STTService {
  private recognition: SpeechRecognition | null = null;
  private _isListening = false;
  private shouldRestart = false;
  private restartTimeout: ReturnType<typeof setTimeout> | null = null;

  // ─── Configuration ──────────────────────────────────────────
  private lang = 'en-US';
  private continuous = true;
  private interimResults = true;
  private maxAlternatives = 1;

  // ─── Callbacks ──────────────────────────────────────────────
  onResult: (transcript: string, isFinal: boolean) => void = () => {};
  onError: (error: Error) => void = () => {};
  onEnd: () => void = () => {};

  constructor(options?: {
    lang?: string;
    continuous?: boolean;
    interimResults?: boolean;
  }) {
    if (options?.lang) this.lang = options.lang;
    if (options?.continuous !== undefined) this.continuous = options.continuous;
    if (options?.interimResults !== undefined) this.interimResults = options.interimResults;
  }

  // ─── Public Methods ─────────────────────────────────────────

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  isListening(): boolean {
    return this._isListening;
  }

  start(): void {
    if (!this.isSupported()) {
      this.onError(new Error('Speech recognition is not supported in this browser. Please use Chrome or Edge.'));
      return;
    }

    // Clean up previous instance
    this.cleanup();

    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      this.onError(new Error('Speech recognition API not found'));
      return;
    }

    this.recognition = new SpeechRecognitionCtor();
    this.recognition.lang = this.lang;
    this.recognition.continuous = this.continuous;
    this.recognition.interimResults = this.interimResults;
    this.recognition.maxAlternatives = this.maxAlternatives;

    this.shouldRestart = true;

    // ─── Event Handlers ────────────────────────────────────

    this.recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      // Report interim results
      if (interimTranscript) {
        this.onResult(interimTranscript, false);
      }

      // Report final result
      if (finalTranscript) {
        this.onResult(finalTranscript.trim(), true);
      }
    };

    this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorCode = event.error;

      // These are normal/expected events, not real errors
      if (errorCode === 'no-speech' || errorCode === 'aborted') {
        // Auto-restart if we should still be listening
        if (this.shouldRestart && this._isListening) {
          this.scheduleRestart();
        }
        return;
      }

      // Network errors (offline STT services)
      if (errorCode === 'network') {
        this.onError(new Error('Network error during speech recognition. Please check your internet connection.'));
        this._isListening = false;
        return;
      }

      // Permission denied
      if (errorCode === 'not-allowed') {
        this.onError(new Error('Microphone access denied. Please allow microphone permissions in your browser settings.'));
        this._isListening = false;
        this.shouldRestart = false;
        return;
      }

      // Other errors
      this.onError(new Error(`Speech recognition error: ${errorCode}`));
      this._isListening = false;
    };

    this.recognition.onend = () => {
      // Auto-restart if the session ended but we want to keep listening
      if (this.shouldRestart && this._isListening) {
        this.scheduleRestart();
      } else {
        this._isListening = false;
        this.onEnd();
      }
    };

    // Start recognition
    try {
      this.recognition.start();
      this._isListening = true;
    } catch (error) {
      this.onError(
        error instanceof Error
          ? error
          : new Error('Failed to start speech recognition')
      );
      this._isListening = false;
    }
  }

  stop(): void {
    this.shouldRestart = false;
    this._isListening = false;

    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore errors when stopping
      }
    }
  }

  // ─── Private Methods ────────────────────────────────────────

  private cleanup(): void {
    if (this.restartTimeout) {
      clearTimeout(this.restartTimeout);
      this.restartTimeout = null;
    }

    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        // Ignore
      }
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition = null;
    }
  }

  /**
   * Schedule a restart with a small delay to avoid rapid-fire restarts.
   */
  private scheduleRestart(): void {
    if (this.restartTimeout) return;

    this.restartTimeout = setTimeout(() => {
      this.restartTimeout = null;
      if (this.shouldRestart && this._isListening) {
        try {
          this.recognition?.start();
        } catch {
          // If restart fails, try creating a new instance
          this.start();
        }
      }
    }, 300);
  }
}
