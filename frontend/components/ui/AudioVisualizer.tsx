// ============================================================
// AudioVisualizer — Canvas-based Audio Waveform Component
// ============================================================
// Renders audio frequency data as animated bars on a canvas.
// Supports active (mic) and idle (ambient pulse) modes.
// ============================================================

'use client';

import { useRef, useEffect, useCallback } from 'react';

interface AudioVisualizerProps {
  /** Frequency data from useAudioVisualizer */
  frequencyData: Uint8Array | null;
  /** Whether the visualizer is actively receiving data */
  isActive: boolean;
  /** Width of the canvas */
  width?: number;
  /** Height of the canvas */
  height?: number;

  /** Primary color */
  color?: string;
  /** CSS class name */
  className?: string;
}

export default function AudioVisualizer({
  frequencyData,
  isActive,
  width = 280,
  height = 80,

  color = '#3b82f6',
  className = '',
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const idlePhaseRef = useRef(0);

  const drawBars = useCallback(
    (ctx: CanvasRenderingContext2D, data: Uint8Array, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);

      const barCount = Math.min(data.length, 48);
      const barWidth = (w / barCount) * 0.6;
      const gap = (w / barCount) * 0.4;
      const centerY = h / 2;

      for (let i = 0; i < barCount; i++) {
        const value = data[Math.floor((i / barCount) * data.length)] / 255;
        const barHeight = Math.max(value * (h * 0.8), 2);

        const x = i * (barWidth + gap) + gap / 2;
        const y = centerY - barHeight / 2;

        // Gradient from primary to accent
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, `${color}40`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 2);
        ctx.fill();
      }
    },
    [color],
  );

  const drawIdle = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.clearRect(0, 0, w, h);

      const barCount = 48;
      const barWidth = (w / barCount) * 0.6;
      const gap = (w / barCount) * 0.4;
      const centerY = h / 2;

      idlePhaseRef.current += 0.02;

      for (let i = 0; i < barCount; i++) {
        // Gentle wave animation
        const wave = Math.sin(idlePhaseRef.current + i * 0.3) * 0.3 + 0.3;
        const barHeight = Math.max(wave * 8 + 2, 2);

        const x = i * (barWidth + gap) + gap / 2;
        const y = centerY - barHeight / 2;

        ctx.fillStyle = `${color}30`;
        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, 1);
        ctx.fill();
      }
    },
    [color],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const animate = () => {
      if (isActive && frequencyData) {
        drawBars(ctx, frequencyData, width, height);
      } else {
        drawIdle(ctx, width, height);
      }
      animFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isActive, frequencyData, width, height, drawBars, drawIdle]);

  return (
    <canvas
      ref={canvasRef}
      className={`audio-visualizer ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
      }}
      aria-hidden="true"
    />
  );
}
