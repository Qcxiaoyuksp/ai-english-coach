// ============================================================
// Speech Service — Type Definitions
// ============================================================

import { TTSOptions } from '@/types';

/**
 * Speech-to-Text (STT) service interface.
 * Abstracts browser speech recognition for consistent usage.
 */
export interface STTService {
  /** Start listening for speech input */
  start(): void;
  /** Stop listening */
  stop(): void;
  /** Whether the service is currently listening */
  isListening(): boolean;
  /** Check if the browser supports this service */
  isSupported(): boolean;

  // ─── Callbacks ────────────────────────────────────────────
  /** Called when speech is recognized (interim or final) */
  onResult: (transcript: string, isFinal: boolean) => void;
  /** Called when an error occurs */
  onError: (error: Error) => void;
  /** Called when the recognition session ends */
  onEnd: () => void;
}

/**
 * Text-to-Speech (TTS) service interface.
 * Abstracts browser speech synthesis for consistent usage.
 */
export interface TTSService {
  /** Speak the given text, returns a promise that resolves when done */
  speak(text: string, options?: TTSOptions): Promise<void>;
  /** Stop any ongoing speech immediately */
  stop(): void;
  /** Whether the service is currently speaking */
  isSpeaking(): boolean;
  /** Check if the browser supports this service */
  isSupported(): boolean;
  /** Get available voices for the current browser */
  getVoices(): SpeechSynthesisVoice[];

  // ─── Callbacks ────────────────────────────────────────────
  /** Called when speech playback ends */
  onEnd: () => void;
}

/**
 * Combined speech service state.
 */
export type SpeechServiceState =
  | 'idle'        // Ready, not doing anything
  | 'listening'   // STT is active, recording user speech
  | 'speaking'    // TTS is active, playing back audio
  | 'error';      // An error occurred

/**
 * Microphone permission status.
 */
export type MicPermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';
