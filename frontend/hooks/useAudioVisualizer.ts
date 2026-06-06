// ============================================================
// useAudioVisualizer — Web Audio API Visualizer Hook
// ============================================================
// Extracts frequency data from the microphone stream using an
// AnalyserNode. Drives a requestAnimationFrame loop for smooth
// canvas rendering of audio waveforms.
// ============================================================

'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseAudioVisualizerReturn {
  /** Frequency data array (0-255 per bin) for visualization */
  frequencyData: Uint8Array | null;
  /** Whether the visualizer is active */
  isActive: boolean;
  /** Start capturing audio from the microphone */
  start: () => Promise<void>;
  /** Stop capturing and release resources */
  stop: () => void;
  /** Current volume level (0-1) */
  volume: number;
}

export function useAudioVisualizer(): UseAudioVisualizerReturn {
  const [isActive, setIsActive] = useState(false);
  const [volume, setVolume] = useState(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  // Use a ref for the animation loop to avoid self-reference in useCallback
  const loopRef = useRef<(() => void) | null>(null);

  // Setup the animation loop function on mount
  useEffect(() => {
    loopRef.current = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArrayRef.current);

      // Calculate volume (average of frequency data, normalized to 0-1)
      let sum = 0;
      for (let i = 0; i < dataArrayRef.current.length; i++) {
        sum += dataArrayRef.current[i];
      }
      const avg = sum / dataArrayRef.current.length;
      setVolume(Math.min(avg / 128, 1));

      // Clone the array for React state
      const copy = new Uint8Array(dataArrayRef.current.length) as Uint8Array<ArrayBuffer>;
      copy.set(dataArrayRef.current);
      setFrequencyData(copy);

      animFrameRef.current = requestAnimationFrame(() => loopRef.current?.());
    };
  }, []);

  const start = useCallback(async () => {
    if (audioCtxRef.current) return; // Already started

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      source.connect(analyser);
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      dataArrayRef.current = new Uint8Array(bufferLength);

      setIsActive(true);
      animFrameRef.current = requestAnimationFrame(() => loopRef.current?.());
    } catch (error) {
      console.error('[useAudioVisualizer] Failed to start:', error);
    }
  }, []);

  const stop = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    analyserRef.current = null;
    dataArrayRef.current = null;
    setIsActive(false);
    setVolume(0);
    setFrequencyData(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      if (audioCtxRef.current) audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  return { frequencyData, isActive, start, stop, volume };
}
