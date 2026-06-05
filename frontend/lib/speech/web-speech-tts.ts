// ============================================================
// Web Speech TTS — Browser Speech Synthesis Wrapper
// ============================================================
// Encapsulates the Web Speech API's SpeechSynthesis for
// text-to-speech with voice selection, rate/pitch control,
// queue management, and browser compatibility detection.
// ============================================================

import { TTSOptions } from '@/types';
import { TTSService } from './types';

/**
 * Web Speech API based Text-to-Speech service.
 *
 * Features:
 * - Automatic English voice selection (prefers natural voices)
 * - Adjustable speech rate and pitch
 * - Queue management to prevent overlapping speech
 * - Promise-based speak() for easy async/await usage
 */
export class WebSpeechTTS implements TTSService {
  private _isSpeaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private queue: Array<{ text: string; options?: TTSOptions; resolve: () => void }> = [];
  private isProcessingQueue = false;

  // ─── Callbacks ──────────────────────────────────────────────
  onEnd: () => void = () => {};

  // ─── Public Methods ─────────────────────────────────────────

  isSupported(): boolean {
    if (typeof window === 'undefined') return false;
    return !!window.speechSynthesis;
  }

  isSpeaking(): boolean {
    return this._isSpeaking;
  }

  /**
   * Get available speech synthesis voices.
   * Note: Voices may load asynchronously; call this after a short delay
   * or listen for the `voiceschanged` event.
   */
  getVoices(): SpeechSynthesisVoice[] {
    if (!this.isSupported()) return [];
    return window.speechSynthesis.getVoices();
  }

  /**
   * Get available English voices, sorted by preference.
   * Prefers natural-sounding voices (Samantha, Daniel, Karen, etc.)
   */
  getEnglishVoices(): SpeechSynthesisVoice[] {
    const voices = this.getVoices();
    const englishVoices = voices.filter((v) => v.lang.startsWith('en'));

    // Sort: prefer specific high-quality voices
    const preferredNames = ['Samantha', 'Daniel', 'Karen', 'Moira', 'Alex', 'Victoria'];

    return englishVoices.sort((a, b) => {
      const aIdx = preferredNames.findIndex((name) => a.name.includes(name));
      const bIdx = preferredNames.findIndex((name) => b.name.includes(name));
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
      return 0;
    });
  }

  /**
   * Speak the given text. Queues if already speaking.
   * Returns a promise that resolves when the speech finishes.
   */
  speak(text: string, options?: TTSOptions): Promise<void> {
    if (!this.isSupported()) {
      return Promise.reject(new Error('Speech synthesis is not supported'));
    }

    if (!text.trim()) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queue.push({ text, options, resolve });
      this.processQueue();
    });
  }

  /**
   * Stop all speech immediately and clear the queue.
   */
  stop(): void {
    this.queue = [];
    this.isProcessingQueue = false;

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    this.currentUtterance = null;
    this._isSpeaking = false;
    this.onEnd();
  }

  // ─── Private Methods ────────────────────────────────────────

  private processQueue(): void {
    if (this.isProcessingQueue || this.queue.length === 0) return;

    this.isProcessingQueue = true;
    const item = this.queue.shift()!;
    this.speakSingle(item.text, item.options)
      .then(() => {
        item.resolve();
        this.isProcessingQueue = false;
        // Process next item in queue
        if (this.queue.length > 0) {
          this.processQueue();
        } else {
          this._isSpeaking = false;
          this.onEnd();
        }
      })
      .catch(() => {
        item.resolve();
        this.isProcessingQueue = false;
        this._isSpeaking = false;
        this.onEnd();
      });
  }

  private speakSingle(text: string, options?: TTSOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = options?.rate ?? 1.0;
      utterance.pitch = options?.pitch ?? 1.0;

      // Select voice
      const voice = this.selectVoice(options?.voice);
      if (voice) {
        utterance.voice = voice;
      }

      this.currentUtterance = utterance;
      this._isSpeaking = true;

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = () => {
        this.currentUtterance = null;
        resolve(); // Resolve even on error to not block the queue
      };

      // Chrome has a bug where long texts get cut off — work around it
      // by keeping the synthesis alive with a periodic resume
      this.startChromeBugWorkaround();

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Select the best voice based on preference.
   */
  private selectVoice(preferredVoiceName?: string): SpeechSynthesisVoice | null {
    const voices = this.getVoices();
    if (voices.length === 0) return null;

    // If a specific voice is requested, try to find it
    if (preferredVoiceName) {
      const match = voices.find((v) => v.name === preferredVoiceName);
      if (match) return match;
    }

    // Auto-select best English voice
    const englishVoices = this.getEnglishVoices();
    return englishVoices[0] || voices.find((v) => v.lang.startsWith('en')) || null;
  }

  /**
   * Chrome has a known bug where speechSynthesis pauses after ~15 seconds.
   * This workaround periodically calls resume() to keep it going.
   */
  private startChromeBugWorkaround(): void {
    const interval = setInterval(() => {
      if (!this._isSpeaking || !window.speechSynthesis.speaking) {
        clearInterval(interval);
        return;
      }
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    }, 10000);
  }
}
