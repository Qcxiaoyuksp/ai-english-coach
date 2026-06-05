'use client';

import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import { BUILT_IN_SCENARIOS, DIFFICULTY_LABELS } from '@/lib/scenarios';
import { Scenario, Correction } from '@/types';

function loadScenario(scenarioId: string): Scenario | null {
  const builtin = BUILT_IN_SCENARIOS.find((s) => s.id === scenarioId);
  if (builtin) return builtin;
  if (typeof window === 'undefined') return null;
  try {
    const custom = JSON.parse(localStorage.getItem('custom-scenarios') || '[]');
    return custom.find((s: { id: string }) => s.id === scenarioId) || null;
  } catch {
    return null;
  }
}

export default function PracticePage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = use(params);
  const [scenario] = useState<Scenario | null>(() => loadScenario(scenarioId));
  const [showTranscript, setShowTranscript] = useState(true);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const {
    state,
    messages,
    corrections,
    interimTranscript,
    elapsedSeconds,
    isSupported,
    startListening,
    stopListening,
    endSession,
    isSessionStarted,
    startSession,
  } = useVoiceSession({ scenarioId });

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, interimTranscript]);

  // Format time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (!scenario) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>加载场景中...</p>
      </div>
    );
  }

  const diffInfo = DIFFICULTY_LABELS[scenario.difficulty];

  return (
    <div className="practice-page">
      {/* Top Bar */}
      <div className="practice-topbar">
        <div className="practice-topbar-inner container">
          <Link href="/" className="btn btn-ghost btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            返回
          </Link>
          <div className="practice-topbar-center">
            <span>{scenario.icon} {scenario.nameZh}</span>
            <span className={`badge badge-${scenario.difficulty}`} style={{ marginLeft: 'var(--space-2)' }}>
              {diffInfo.labelZh}
            </span>
          </div>
          <div className="practice-timer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            {formatTime(elapsedSeconds)}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="practice-content container">
        {!isSessionStarted ? (
          /* Pre-Session Screen */
          <div className="practice-start animate-fade-in">
            <div className="practice-start-icon">{scenario.icon}</div>
            <h2 className="practice-start-title">{scenario.name}</h2>
            <p className="practice-start-desc">{scenario.descriptionZh}</p>

            {/* Key Vocabulary */}
            {scenario.keyVocabulary.length > 0 && (
              <div className="practice-vocab">
                <h4 style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-2)' }}>
                  📝 核心词汇
                </h4>
                <div className="practice-vocab-list">
                  {scenario.keyVocabulary.map((word) => (
                    <span key={word} className="practice-vocab-chip">
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {!isSupported ? (
              <div style={{ color: 'var(--color-accent-rose)', marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)' }}>
                ⚠️ 你的浏览器不支持语音识别。请使用 Chrome 或 Edge 浏览器。
              </div>
            ) : (
              <button
                className="btn btn-primary btn-lg"
                onClick={startSession}
                style={{ marginTop: 'var(--space-8)' }}
              >
                🎙️ 开始练习
              </button>
            )}
          </div>
        ) : (
          /* Active Session */
          <div className="practice-session animate-fade-in">
            {/* AI Avatar & Status */}
            <div className="practice-ai-section">
              <div className={`practice-ai-avatar ${state === 'speaking' ? 'speaking' : ''}`}>
                <span className="practice-ai-avatar-icon">{scenario.icon}</span>
                {state === 'speaking' && (
                  <>
                    <span className="practice-ai-ring ring-1" />
                    <span className="practice-ai-ring ring-2" />
                    <span className="practice-ai-ring ring-3" />
                  </>
                )}
              </div>
              <div className="practice-status">
                {state === 'idle' && '点击麦克风开始说话'}
                {state === 'listening' && '🎤 正在聆听...'}
                {state === 'processing' && '🤔 AI 思考中...'}
                {state === 'speaking' && '🔊 AI 正在回复...'}
                {state === 'error' && '⚠️ 出错了，请重试'}
              </div>
            </div>

            {/* Microphone Button */}
            <div className="practice-mic-section">
              <button
                className={`practice-mic-btn ${state === 'listening' ? 'active' : ''}`}
                onClick={state === 'listening' ? stopListening : startListening}
                disabled={state === 'processing' || state === 'speaking'}
                id="mic-button"
              >
                {state === 'listening' ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                )}
                {state === 'listening' && <span className="practice-mic-pulse" />}
              </button>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-4)' }}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setShowTranscript(!showTranscript)}
                >
                  {showTranscript ? '隐藏字幕' : '显示字幕'}
                </button>
                <button className="btn btn-danger btn-sm" onClick={endSession}>
                  结束练习
                </button>
              </div>
            </div>

            {/* Interim Transcript */}
            {interimTranscript && (
              <div className="practice-interim">
                <span className="animate-pulse">{interimTranscript}</span>
              </div>
            )}

            {/* Transcript Panel */}
            {showTranscript && messages.length > 0 && (
              <div className="practice-transcript">
                <h4 className="practice-transcript-title">💬 对话记录</h4>
                <div className="practice-transcript-messages">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`practice-message ${msg.role === 'user' ? 'user' : 'ai'}`}
                    >
                      <div className="practice-message-role">
                        {msg.role === 'user' ? '🙋 You' : `🤖 AI`}
                      </div>
                      <div className="practice-message-content">
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {interimTranscript && (
                    <div className="practice-message user">
                      <div className="practice-message-role">🙋 You</div>
                      <div
                        className="practice-message-content"
                        style={{ opacity: 0.5, fontStyle: 'italic' }}
                      >
                        {interimTranscript}...
                      </div>
                    </div>
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </div>
            )}

            {/* Correction Bubbles */}
            {corrections.length > 0 && (
              <div className="practice-corrections">
                {corrections.slice(-3).map((corr) => (
                  <CorrectionBubble key={corr.id} correction={corr} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Correction Bubble ──────────────────────────────────────────────────────

function CorrectionBubble({ correction }: { correction: Correction }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 8000);
    return () => clearTimeout(timer);
  }, []);

  if (!visible) return null;

  const typeLabels = {
    grammar: { icon: '🔤', label: '语法' },
    expression: { icon: '🗣️', label: '表达' },
    vocabulary: { icon: '📝', label: '用词' },
  };

  const typeInfo = typeLabels[correction.errorType] || typeLabels.grammar;

  return (
    <div className="correction-bubble animate-fade-in-up">
      <div className="correction-type">
        {typeInfo.icon} {typeInfo.label}
      </div>
      <div className="correction-original">
        ❌ <s>{correction.original}</s>
      </div>
      <div className="correction-corrected">
        ✅ {correction.corrected}
      </div>
      <div className="correction-explanation">{correction.explanation}</div>
    </div>
  );
}
