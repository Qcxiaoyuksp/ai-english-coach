'use client';

import { use, useMemo } from 'react';
import Link from 'next/link';
import { Session, Correction } from '@/types';
import { getSession, resolveScenario } from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';

interface ReportData {
  overallScore: number;
  dimensions: {
    name: string;
    nameZh: string;
    score: number;
    feedback: string;
  }[];
  errors: Correction[];
  suggestions: string[];
}

function computeReport(sess: Session): ReportData {
  const userMessages = sess.messages.filter((m) => m.role === 'user');
  const totalWords = userMessages.reduce(
    (acc, m) => acc + m.content.split(/\s+/).length,
    0
  );
  const uniqueWords = new Set(
    userMessages
      .flatMap((m) => m.content.toLowerCase().split(/\s+/))
      .filter((w) => w.length > 2)
  );
  const errorCount = sess.corrections.length;
  const sentenceCount = userMessages.length;

  const vocabDiversity = Math.min(100, Math.round((uniqueWords.size / Math.max(totalWords, 1)) * 200));
  const errorRate = sentenceCount > 0 ? errorCount / sentenceCount : 0;
  const grammarScore = Math.max(40, Math.round(100 - errorRate * 50));
  const fluencyScore = Math.min(100, Math.max(40, Math.round(60 + totalWords * 0.5)));
  const overallScore = Math.round(
    (grammarScore * 0.25 + vocabDiversity * 0.2 + fluencyScore * 0.2 + 70 * 0.15 + 72 * 0.1 + 75 * 0.1)
  );

  return {
    overallScore,
    dimensions: [
      { name: 'Pronunciation', nameZh: '发音', score: 70, feedback: '发音基本清晰，部分单词需要改进' },
      { name: 'Grammar', nameZh: '语法', score: grammarScore, feedback: `检测到 ${errorCount} 个语法错误` },
      { name: 'Vocabulary', nameZh: '词汇', score: vocabDiversity, feedback: `使用了 ${uniqueWords.size} 个不同单词` },
      { name: 'Fluency', nameZh: '流利度', score: fluencyScore, feedback: `共说了 ${totalWords} 个单词` },
      { name: 'Naturalness', nameZh: '自然度', score: 72, feedback: '对话比较自然，可继续提升' },
      { name: 'Task Completion', nameZh: '任务完成', score: 75, feedback: '基本完成了场景任务' },
    ],
    errors: sess.corrections,
    suggestions: [
      '多练习使用完整的句子来表达想法',
      '注意时态的一致性',
      '尝试使用更多样的词汇来替代常用词',
      '练习使用连接词让句子更流畅',
      '多关注常见的发音模式',
    ],
  };
}

export default function ReportPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const isClient = useIsClient();
  const session = isClient ? getSession(sessionId) : null;

  const report = useMemo<ReportData | null>(() => {
    if (!session) return null;
    return computeReport(session);
  }, [session]);

  const getScenario = (scenarioId: string) => resolveScenario(scenarioId);

  const formatDuration = (start: number, end: number) => {
    const seconds = Math.round((end - start) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'var(--color-accent-emerald)';
    if (score >= 60) return 'var(--color-accent-amber)';
    return 'var(--color-accent-rose)';
  };

  if (!isClient) {
    return null;
  }

  if (!session) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
        <p style={{ color: 'var(--color-text-muted)' }}>未找到该练习记录</p>
        <Link href="/" className="btn btn-primary" style={{ marginTop: 'var(--space-4)' }}>
          返回首页
        </Link>
      </div>
    );
  }

  const scenario = getScenario(session.scenarioId);

  return (
    <div className="container">
      <div className="report-page animate-fade-in-up">
        {/* Header */}
        <div className="report-header">
          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>
            📊 练习报告
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>
            {scenario?.icon} {scenario?.nameZh || session.scenarioId} ·{' '}
            {session.endTime ? formatDuration(session.startTime, session.endTime) : '未知时长'}
          </p>

          {/* Score Circle */}
          {report && (
            <div className="report-score-circle" style={{ marginTop: 'var(--space-6)' }}>
              <svg viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
                <circle
                  cx="80" cy="80" r="70"
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="8"
                />
                <circle
                  cx="80" cy="80" r="70"
                  fill="none"
                  stroke={getScoreColor(report.overallScore)}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 70}
                  strokeDashoffset={2 * Math.PI * 70 * (1 - report.overallScore / 100)}
                  style={{ transition: 'stroke-dashoffset 1.5s ease' }}
                />
              </svg>
              <div className="report-score-value">
                <div
                  className="report-score-number gradient-text"
                  style={{ fontSize: 'var(--text-4xl)' }}
                >
                  {report.overallScore}
                </div>
                <div className="report-score-label">综合得分</div>
              </div>
            </div>
          )}
        </div>

        {report && (
          <>
            {/* Dimensions Grid */}
            <div className="report-grid">
              {/* Score Dimensions */}
              <div className="report-card">
                <h3 className="report-card-title">📈 六维评分</h3>
                {report.dimensions.map((dim) => (
                  <div key={dim.name} className="report-dimension">
                    <span className="report-dimension-name">{dim.nameZh}</span>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <span
                        className="report-dimension-score"
                        style={{ color: getScoreColor(dim.score) }}
                      >
                        {dim.score}
                      </span>
                      <div className="report-dimension-bar">
                        <div
                          className="report-dimension-fill"
                          style={{ width: `${dim.score}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Suggestions */}
              <div className="report-card">
                <h3 className="report-card-title">💡 改进建议</h3>
                <ul style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  {report.suggestions.map((suggestion, i) => (
                    <li
                      key={i}
                      style={{
                        fontSize: 'var(--text-sm)',
                        color: 'var(--color-text-secondary)',
                        paddingLeft: 'var(--space-4)',
                        position: 'relative',
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          left: 0,
                          color: 'var(--color-accent-blue-light)',
                        }}
                      >
                        •
                      </span>
                      {suggestion}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Errors */}
            {report.errors.length > 0 && (
              <div className="report-card" style={{ marginBottom: 'var(--space-8)' }}>
                <h3 className="report-card-title">❌ 错误详情</h3>
                {report.errors.map((error) => {
                  const typeLabels: Record<string, { icon: string; label: string; color: string }> = {
                    grammar: { icon: '🔤', label: '语法', color: 'var(--color-accent-amber)' },
                    expression: { icon: '🗣️', label: '表达', color: 'var(--color-accent-purple)' },
                    vocabulary: { icon: '📝', label: '用词', color: 'var(--color-accent-cyan)' },
                  };
                  const typeInfo = typeLabels[error.errorType] || typeLabels.grammar;

                  return (
                    <div key={error.id} className="report-error-item">
                      <div className="report-error-type" style={{ color: typeInfo.color }}>
                        {typeInfo.icon} {typeInfo.label}
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)' }}>
                        <span style={{ color: 'var(--color-accent-rose)' }}>
                          ❌ <s>{error.original}</s>
                        </span>
                      </div>
                      <div style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                        <span style={{ color: 'var(--color-accent-emerald)' }}>
                          ✅ {error.corrected}
                        </span>
                      </div>
                      <div
                        style={{
                          fontSize: 'var(--text-xs)',
                          color: 'var(--color-text-muted)',
                          marginTop: 'var(--space-2)',
                        }}
                      >
                        {error.explanation}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Conversation Review */}
            <div className="report-card" style={{ marginBottom: 'var(--space-8)' }}>
              <h3 className="report-card-title">💬 对话回顾</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                {session.messages.map((msg) => (
                  <div
                    key={msg.id}
                    style={{
                      padding: 'var(--space-3) var(--space-4)',
                      background:
                        msg.role === 'user'
                          ? 'rgba(59, 130, 246, 0.08)'
                          : 'var(--color-bg-glass)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: 'var(--text-sm)',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-muted)',
                      }}
                    >
                      {msg.role === 'user' ? '🙋 You' : '🤖 AI'}
                    </span>
                    <p style={{ marginTop: 'var(--space-1)', lineHeight: 'var(--leading-relaxed)' }}>
                      {msg.content}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="report-actions">
          <Link
            href={`/practice/${session.scenarioId}`}
            className="btn btn-primary btn-lg"
          >
            🔄 再次练习
          </Link>
          <Link href="/" className="btn btn-secondary btn-lg">
            🏠 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
