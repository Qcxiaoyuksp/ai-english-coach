// ============================================================
// useWebSpeech — React Hook for Web Speech API
// ============================================================
// Wraps the SpeechManager class from lib/speech into a React-
// friendly hook with state management and lifecycle handling.
// ============================================================

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SpeechManager } from '@/lib/speech/speech-manager';
import { SpeechServiceState, MicPermissionStatus } from '@/lib/speech/types';
import { TTSOptions } from '@/types';

export interface UseWebSpeechReturn {
  /** Start recording user speech */
  startListening: () => void;
  /** Stop recording */
  stopListening: () => void;
  /** Speak text via TTS */
  speak: (text: string, options?: TTSOptions) => Promise<void>;
  /** Stop any ongoing TTS */
  stopSpeaking: () => void;
  /** The latest recognized transcript (interim or final) */
  transcript: string;
  /** Whether the latest transcript is final */
  isTranscriptFinal: boolean;
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

export function useWebSpeech(): UseWebSpeechReturn {
  const managerRef = useRef<SpeechManager | null>(null);

  const [state, setState] = useState<SpeechServiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [isTranscriptFinal, setIsTranscriptFinal] = useState(false);
  const [micPermission, setMicPermission] = useState<MicPermissionStatus>('unknown');
  const [isSupported, setIsSupported] = useState(false);

  // Stable callback refs to avoid re-creating the manager
  const onFinalTranscriptRef = useRef<((text: string) => void) | null>(null);

  useEffect(() => {
    const manager = new SpeechManager({
      onStateChange: (newState) => {
        setState(newState);
      },
      onSpeechResult: (text, isFinal) => {
        setTranscript(text);
        setIsTranscriptFinal(isFinal);
        if (isFinal && onFinalTranscriptRef.current) {
          onFinalTranscriptRef.current(text);
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

  const startListening = useCallback(() => {
    setTranscript('');
    setIsTranscriptFinal(false);
    managerRef.current?.startListening();
  }, []);

  const stopListening = useCallback(() => {
    managerRef.current?.stopListening();
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
    setTranscript('');
    setIsTranscriptFinal(false);
    managerRef.current?.reset();
  }, []);

  return {
    startListening,
    stopListening,
    speak,
    stopSpeaking,
    transcript,
    isTranscriptFinal,
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
