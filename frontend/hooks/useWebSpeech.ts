// ============================================================
// useWebSpeech — React Hook for Web Speech API
// ============================================================
// Wraps the SpeechManager class from lib/speech into a React-
// friendly hook with state management and lifecycle handling.
//
// Recording model: STT runs in *continuous* mode. While the user
// is talking we accumulate every finalized chunk into one running
// transcript and keep the latest interim (in-progress) text for a
// live preview. Nothing is submitted automatically on a pause —
// the caller decides when an utterance is "done" (typically when
// the user taps the mic again) and reads the accumulated result
// via `getResult()`.
// ============================================================

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SpeechManager } from '@/lib/speech/speech-manager';
import { SpeechServiceState, MicPermissionStatus } from '@/lib/speech/types';
import { TTSOptions } from '@/types';

/** The accumulated result of one listening turn. */
export interface SpeechResult {
  /** Full transcript = accumulated final chunks + current interim text. */
  transcript: string;
  /** Average recognition confidence (0-1) across final chunks, if available. */
  confidence: number | undefined;
}

export interface UseWebSpeechReturn {
  /** Start recording user speech (resets the accumulated transcript) */
  startListening: () => void;
  /** Stop recording */
  stopListening: () => void;
  /** Speak text via TTS */
  speak: (text: string, options?: TTSOptions) => Promise<void>;
  /** Stop any ongoing TTS */
  stopSpeaking: () => void;
  /** Accumulated finalized transcript for the current listening turn */
  finalTranscript: string;
  /** Latest interim (in-progress) transcript, not yet finalized */
  interimTranscript: string;
  /** Read the full accumulated result synchronously (final + interim). */
  getResult: () => SpeechResult;
  /** Whether STT is currently active */
  isListening: boolean;
  /** Whether TTS is currently speaking */
  isSpeaking: boolean;
  /** Current state of the speech service */
  state: SpeechServiceState;
  /** Whether Web Speech API is supported */
  isSupported: boolean;
  /** Microphone permission status */
  micPermission: MicPermissionStatus;
  /** Request mic permission */
  requestMicPermission: () => Promise<MicPermissionStatus>;
  /** Get available English voices */
  getEnglishVoices: () => SpeechSynthesisVoice[];
  /** Reset everything */
  reset: () => void;
}

function combine(final: string, interim: string): string {
  return [final, interim].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

export function useWebSpeech(): UseWebSpeechReturn {
  const managerRef = useRef<SpeechManager | null>(null);

  const [state, setState] = useState<SpeechServiceState>('idle');
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [micPermission, setMicPermission] = useState<MicPermissionStatus>('unknown');
  const [isSupported, setIsSupported] = useState(false);

  // Refs mirror the accumulated transcript so callers can read the result
  // synchronously at the moment they stop listening, even before React has
  // flushed the corresponding state updates.
  const finalRef = useRef('');
  const interimRef = useRef('');
  const confSumRef = useRef(0);
  const confCountRef = useRef(0);

  useEffect(() => {
    const manager = new SpeechManager({
      onStateChange: (newState) => {
        setState(newState);
      },
      onSpeechResult: (text, isFinal, conf) => {
        if (isFinal) {
          finalRef.current = combine(finalRef.current, text);
          interimRef.current = '';
          setFinalTranscript(finalRef.current);
          setInterimTranscript('');
          if (typeof conf === 'number' && conf > 0) {
            confSumRef.current += conf;
            confCountRef.current += 1;
          }
        } else {
          interimRef.current = text;
          setInterimTranscript(text);
        }
      },
      onError: (error) => {
        console.error('[useWebSpeech] Error:', error.message);
      },
      onSpeakEnd: () => {
        // State is managed by the SpeechManager
      },
    });

    managerRef.current = manager;
    setIsSupported(manager.isFullySupported());

    // Check initial mic permission
    manager.checkMicPermission().then(setMicPermission);

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, []);

  const resetAccumulation = useCallback(() => {
    finalRef.current = '';
    interimRef.current = '';
    confSumRef.current = 0;
    confCountRef.current = 0;
    setFinalTranscript('');
    setInterimTranscript('');
  }, []);

  const startListening = useCallback(() => {
    resetAccumulation();
    managerRef.current?.startListening();
  }, [resetAccumulation]);

  const stopListening = useCallback(() => {
    managerRef.current?.stopListening();
  }, []);

  const getResult = useCallback((): SpeechResult => {
    return {
      transcript: combine(finalRef.current, interimRef.current),
      confidence:
        confCountRef.current > 0
          ? confSumRef.current / confCountRef.current
          : undefined,
    };
  }, []);

  const speak = useCallback(async (text: string, options?: TTSOptions) => {
    if (managerRef.current) {
      await managerRef.current.speak(text, options);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    managerRef.current?.stopSpeaking();
  }, []);

  const requestMicPermission = useCallback(async (): Promise<MicPermissionStatus> => {
    if (!managerRef.current) return 'unknown';
    const status = await managerRef.current.requestMicPermission();
    setMicPermission(status);
    return status;
  }, []);

  const getEnglishVoices = useCallback((): SpeechSynthesisVoice[] => {
    return managerRef.current?.getEnglishVoices() ?? [];
  }, []);

  const reset = useCallback(() => {
    resetAccumulation();
    managerRef.current?.reset();
  }, [resetAccumulation]);

  return {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    finalTranscript,
    interimTranscript,
    getResult,
    isListening: state === 'listening',
    isSpeaking: state === 'speaking',
    state,
    isSupported,
    micPermission,
    requestMicPermission,
    getEnglishVoices,
    reset,
  };
}
