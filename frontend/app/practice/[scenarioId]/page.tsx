// ============================================================
// Practice Page — Voice Conversation Interface
// ============================================================
// The main practice page where users engage in spoken English
// conversations with the AI coach in the selected scenario.
// ============================================================

'use client';

import { use, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DIFFICULTY_LABELS } from '@/lib/scenarios';
import { Scenario } from '@/types';
import { resolveScenario } from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';
import { useVoiceSession } from '@/hooks/useVoiceSession';
import VoiceChat from '@/components/VoiceChat';
import TranscriptPanel from '@/components/TranscriptPanel';
import FeedbackBubble from '@/components/FeedbackBubble';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getVoiceModeLabel(): string {
  if (typeof window === 'undefined') return '免费模式';
  try {
    const config = localStorage.getItem('api-config');
    if (config) {
      const parsed = JSON.parse(config);
      if (parsed.voiceMode === 'realtime') return '高级模式';
      if (parsed.apiKey) return '标准模式';
    }
  } catch { /* ignore */ }
  return '免费模式';
}

export default function PracticePage({
  params,
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = use(params);
  const isClient = useIsClient();
  const [showTranscript, setShowTranscript] = useState(true);

  // Resolve scenario only on the client (custom scenarios live in localStorage),
  // so SSR and the first client render agree (both render nothing).
  const scenario = useMemo(() => {
    return isClient ? resolveScenario(scenarioId) : null;
  }, [scenarioId, isClient]);

  if (!isClient) {
    return null;
  }

  if (!scenario) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
        <h1>场景未找到</h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-4)' }}>
          无法找到 ID 为 &quot;{scenarioId}&quot; 的练习场景。
        </p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 'var(--space-6)' }}>
          返回首页
        </Link>
      </div>
    );
  }

  return <PracticeContent scenario={scenario} showTranscript={showTranscript} setShowTranscript={setShowTranscript} />;
}

// Separated to use hooks conditionally safe
function PracticeContent({
  scenario,
  showTranscript,
  setShowTranscript,
}: {
  scenario: Scenario;
  showTranscript: boolean;
  setShowTranscript: (v: boolean) => void;
}) {
  const session = useVoiceSession(scenario);
  const router = useRouter();
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const diffInfo = DIFFICULTY_LABELS[scenario.difficulty];
  const modeLabel = useMemo(() => getVoiceModeLabel(), []);

  const handleEndPractice = useCallback(() => {
    setShowEndConfirm(true);
  }, []);

  const confirmEndPractice = useCallback(() => {
    setShowEndConfirm(false);
    const sessionId = session.endSession();
    if (sessionId) {
      router.push(`/report/${sessionId}`);
    } else {
      // No user speech → no report was generated; exit cleanly to home.
      router.push('/');
    }
  }, [session, router]);

  const hasUserSpeech = session.messages.some((m) => m.role === 'user');

  return (
    <div className="practice-page animate-fade-in">
      {/* Top Bar */}
      <div className="practice-topbar">
        <div className="practice-topbar-inner container">
          <Link href="/" className="btn btn-ghost btn-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            返回
          </Link>

          <div className="practice-topbar-center">
            <span style={{ marginRight: 'var(--space-2)' }}>{scenario.icon}</span>
            {scenario.nameZh}
            <span className={`badge badge-${scenario.difficulty}`} style={{ marginLeft: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
              {diffInfo.labelZh}
            </span>
          </div>

          <div className="practice-timer">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {formatTime(session.elapsedSeconds)}
            <span className="badge badge-beginner" style={{ marginLeft: 'var(--space-2)', fontSize: '0.65rem', padding: '2px 8px' }}>
              {modeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="practice-content container">
        {!session.isActive ? (
          /* Start Screen */
          <div className="practice-start animate-fade-in-up">
            <div className="practice-start-icon">{scenario.icon}</div>
            <h2 className="practice-start-title">{scenario.name}</h2>
            <p className="practice-start-desc">{scenario.descriptionZh}</p>

            {/* Browser Support Check */}
            {!session.isSupported && (
              <div
                style={{
                  padding: 'var(--space-4)',
                  background: 'rgba(244, 63, 94, 0.1)',
                  border: '1px solid rgba(244, 63, 94, 0.2)',
                  borderRadius: 'var(--radius-md)',
                  marginBottom: 'var(--space-4)',
                  fontSize: 'var(--text-sm)',
                  color: 'var(--color-accent-rose)',
                }}
              >
                ⚠️ 您的浏览器不支持语音识别。请使用 Chrome 或 Edge 浏览器以获得最佳体验。
              </div>
            )}

            <button
              className="btn btn-primary btn-lg"
              onClick={session.startSession}
              disabled={!session.isSupported}
              id="start-practice-btn"
            >
              🎙️ 开始练习
            </button>

            {/* Key Vocabulary Preview */}
            <div className="practice-vocab">
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-3)' }}>
                📚 核心词汇
              </p>
              <div className="practice-vocab-list">
                {scenario.keyVocabulary.map((word) => (
                  <span key={word} className="practice-vocab-chip">{word}</span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Active Session */
          <>
            <VoiceChat
              sessionState={session.sessionState}
              isActive={session.isActive}
              interimTranscript={session.interimTranscript}
              onToggleListening={session.toggleListening}
              onStopAI={session.stopAI}
              scenarioIcon={scenario.icon}
            />

            {/* Toggle transcript button */}
            <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
              <button
                className={`btn btn-sm ${showTranscript ? 'btn-secondary' : 'btn-ghost'}`}
                onClick={() => setShowTranscript(!showTranscript)}
              >
                💬 {showTranscript ? '隐藏字幕' : '显示字幕'}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={handleEndPractice}
                id="end-practice-btn"
              >
                ⏹ 结束练习
              </button>
            </div>

            {/* Transcript Panel */}
            {showTranscript && (
              <TranscriptPanel messages={session.messages} />
            )}

            {/* Floating Corrections */}
            {session.corrections.length > 0 && (
              <FeedbackBubble corrections={session.corrections} />
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={showEndConfirm}
        title="结束本次练习"
        message={
          hasUserSpeech
            ? '确定要结束吗？结束后将生成本次练习的评估报告。'
            : '你还没有开口说话，结束将不会生成评估报告。确定要退出吗？'
        }
        confirmText={hasUserSpeech ? '结束并查看报告' : '退出练习'}
        cancelText="继续练习"
        danger={!hasUserSpeech}
        onConfirm={confirmEndPractice}
        onCancel={() => setShowEndConfirm(false)}
      />
    </div>
  );
}
