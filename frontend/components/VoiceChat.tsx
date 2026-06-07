// ============================================================
// VoiceChat — Core Voice Interaction Component
// ============================================================
// The main voice chat interface with AI avatar, microphone
// button, audio visualizer, and state-driven animations.
// ============================================================

'use client';

import { useEffect } from 'react';
import { useAudioVisualizer } from '@/hooks/useAudioVisualizer';
import AudioVisualizer from '@/components/ui/AudioVisualizer';
import { VoiceSessionState } from '@/types';

interface VoiceChatProps {
  /** Current session state */
  sessionState: VoiceSessionState;
  /** Whether the session is active */
  isActive: boolean;
  /** Interim transcript text */
  interimTranscript: string;
  /** Toggle microphone listening */
  onToggleListening: () => void;
  /** Stop AI speaking */
  onStopAI: () => void;
  /** Scenario emoji icon */
  scenarioIcon: string;
}

const STATUS_LABELS: Record<VoiceSessionState, string> = {
  idle: '准备就绪 — 点击麦克风开始说话',
  listening: '正在聆听 — 说完后再点一次结束',
  transcribing: '正在识别你的语音...',
  processing: 'AI 思考中...',
  speaking: 'AI 说话中...',
  error: '出现错误，请重试',
};

export default function VoiceChat({
  sessionState,
  isActive,
  interimTranscript,
  onToggleListening,
  onStopAI,
  scenarioIcon,
}: VoiceChatProps) {
  const visualizer = useAudioVisualizer();

  // Start/stop visualizer when listening state changes
  useEffect(() => {
    if (sessionState === 'listening' && !visualizer.isActive) {
      visualizer.start();
    } else if (sessionState !== 'listening' && visualizer.isActive) {
      visualizer.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      visualizer.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMicDisabled =
    sessionState === 'processing' ||
    sessionState === 'transcribing' ||
    sessionState === 'speaking';

  return (
    <div className="practice-session">
      {/* AI Avatar */}
      <div className="practice-ai-section">
        <div
          className={`practice-ai-avatar ${sessionState === 'speaking' ? 'speaking' : ''}`}
        >
          <span className="practice-ai-avatar-icon">{scenarioIcon}</span>
          {sessionState === 'speaking' && (
            <>
              <div className="practice-ai-ring" />
              <div className="practice-ai-ring ring-2" />
              <div className="practice-ai-ring ring-3" />
            </>
          )}
        </div>

        {/* Status label */}
        <div className="practice-status">
          {sessionState === 'speaking' ? (
            <button
              className="btn btn-ghost btn-sm"
              onClick={onStopAI}
              style={{ color: 'var(--color-accent-rose)' }}
            >
              ⏹ 停止播放
            </button>
          ) : (
            STATUS_LABELS[sessionState]
          )}
        </div>
      </div>

      {/* Audio Visualizer */}
      <AudioVisualizer
        frequencyData={visualizer.frequencyData}
        isActive={visualizer.isActive}
        width={280}
        height={60}
        color={sessionState === 'listening' ? '#f43f5e' : '#3b82f6'}
      />

      {/* Interim transcript */}
      {interimTranscript && sessionState === 'listening' && (
        <div className="practice-interim">
          &quot;{interimTranscript}&quot;
        </div>
      )}

      {/* Microphone Button */}
      <div className="practice-mic-section">
        <button
          className={`practice-mic-btn ${sessionState === 'listening' ? 'active' : ''}`}
          onClick={onToggleListening}
          disabled={!isActive || isMicDisabled}
          aria-label={
            sessionState === 'listening' ? '停止录音' : '开始录音'
          }
          id="mic-button"
        >
          {sessionState === 'processing' || sessionState === 'transcribing' ? (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="animate-spin"
            >
              <path d="M21 12a9 9 0 11-6.219-8.56" />
            </svg>
          ) : (
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
              <path d="M19 10v2a7 7 0 01-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          )}
          {/* Pulse rings when listening */}
          {sessionState === 'listening' && (
            <>
              <span className="practice-mic-pulse" />
              <span
                className="practice-mic-pulse"
                style={{ animationDelay: '0.5s' }}
              />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
