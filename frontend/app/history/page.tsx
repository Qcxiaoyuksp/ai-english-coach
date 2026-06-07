'use client';

import Link from 'next/link';
import { listSessions, listReports, resolveScenario } from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';
import ProgressTrend, { TrendPoint } from '@/components/ProgressTrend';
import { Correction } from '@/types';

const ERROR_TYPE_LABELS: Record<Correction['errorType'], string> = {
  grammar: '语法',
  expression: '表达',
  vocabulary: '词汇',
};

export default function HistoryPage() {
  const isClient = useIsClient();
  const sessions = isClient ? listSessions() : [];
  const reports = isClient ? listReports() : [];

  const getScenario = (scenarioId: string) => resolveScenario(scenarioId);

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (start: number, end?: number) => {
    if (!end) return '--';
    const seconds = Math.round((end - start) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Stats
  const totalSessions = sessions.length;
  const totalMinutes = sessions.reduce((acc, s) => {
    if (s.endTime) {
      return acc + (s.endTime - s.startTime) / 60000;
    }
    return acc;
  }, 0);

  const avgMessages = sessions.length > 0
    ? Math.round(
        sessions.reduce((acc, s) => acc + s.messages.filter((m) => m.role === 'user').length, 0) /
        sessions.length
      )
    : 0;

  // ─── Score trend (oldest → newest) from saved reports ───────
  const shortDate = (timestamp: number) => {
    const d = new Date(timestamp);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };
  const trendPoints: TrendPoint[] = [...reports]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((r) => ({ score: r.overallScore, label: shortDate(r.createdAt) }));
  const avgScore =
    trendPoints.length > 0
      ? Math.round(
          trendPoints.reduce((acc, p) => acc + p.score, 0) / trendPoints.length
        )
      : null;

  // ─── Frequent corrections aggregated across all sessions ────
  const allCorrections = sessions.flatMap((s) => s.corrections ?? []);
  const typeCounts: Record<Correction['errorType'], number> = {
    grammar: 0,
    expression: 0,
    vocabulary: 0,
  };
  const freqMap = new Map<
    string,
    { original: string; corrected: string; count: number }
  >();
  for (const c of allCorrections) {
    if (c.errorType in typeCounts) typeCounts[c.errorType] += 1;
    const key = `${c.original.toLowerCase().trim()} → ${c.corrected.toLowerCase().trim()}`;
    const existing = freqMap.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      freqMap.set(key, { original: c.original, corrected: c.corrected, count: 1 });
    }
  }
  const topCorrections = [...freqMap.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return (
    <div className="container">
      <div className="history-page animate-fade-in-up">
        <h1 className="section-heading">📚 学习记录</h1>

        {/* Stats */}
        <div className="history-stats stagger-children">
          <div className="history-stat-card">
            <div className="history-stat-value gradient-text">{totalSessions}</div>
            <div className="history-stat-label">练习次数</div>
          </div>
          <div className="history-stat-card">
            <div className="history-stat-value gradient-text">
              {Math.round(totalMinutes)}
            </div>
            <div className="history-stat-label">总练习分钟</div>
          </div>
          <div className="history-stat-card">
            <div className="history-stat-value gradient-text">{avgMessages}</div>
            <div className="history-stat-label">平均对话轮次</div>
          </div>
        </div>

        {/* Score Trend */}
        {trendPoints.length >= 2 && (
          <div className="progress-section">
            <div className="progress-section-head">
              <h2 className="settings-section-title">📈 成绩趋势</h2>
              {avgScore !== null && (
                <span className="progress-avg">
                  平均 <strong className="gradient-text">{avgScore}</strong> 分
                </span>
              )}
            </div>
            <ProgressTrend points={trendPoints} />
          </div>
        )}

        {/* Frequent corrections */}
        {allCorrections.length > 0 && (
          <div className="progress-section">
            <h2 className="settings-section-title">🔁 高频纠错</h2>
            <div className="error-type-chips">
              {(Object.keys(typeCounts) as Correction['errorType'][]).map(
                (t) => (
                  <div key={t} className="error-type-chip">
                    <span className="error-type-count gradient-text">
                      {typeCounts[t]}
                    </span>
                    <span className="error-type-label">
                      {ERROR_TYPE_LABELS[t]}
                    </span>
                  </div>
                )
              )}
            </div>
            {topCorrections.length > 0 && (
              <ul className="error-freq-list">
                {topCorrections.map((c, i) => (
                  <li key={i} className="error-freq-item">
                    <span className="error-freq-original">{c.original}</span>
                    <span className="error-freq-arrow">→</span>
                    <span className="error-freq-corrected">{c.corrected}</span>
                    {c.count > 1 && (
                      <span className="error-freq-badge">×{c.count}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Session List */}
        {sessions.length > 0 ? (
          <div className="history-list">
            {sessions.map((session) => {
              const scenario = getScenario(session.scenarioId);
              return (
                <Link
                  key={session.id}
                  href={`/report/${session.id}`}
                  className="history-item"
                >
                  <div className="history-item-left">
                    <span className="history-item-icon">
                      {scenario?.icon || '💬'}
                    </span>
                    <div>
                      <div className="history-item-name">
                        {scenario?.nameZh || session.scenarioId}
                      </div>
                      <div className="history-item-date">
                        {formatDate(session.startTime)}
                      </div>
                    </div>
                  </div>
                  <div className="history-item-right">
                    <div className="history-item-score">
                      {session.messages.filter((m) => m.role === 'user').length} 轮
                    </div>
                    <div className="history-item-duration">
                      ⏱️ {formatDuration(session.startTime, session.endTime)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="history-empty">
            <div className="history-empty-icon">📝</div>
            <p>还没有练习记录</p>
            <p style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
              完成一次口语练习后，记录将显示在这里
            </p>
            <Link href="/" className="btn btn-primary" style={{ marginTop: 'var(--space-6)' }}>
              开始练习
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
