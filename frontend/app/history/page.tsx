'use client';

import Link from 'next/link';
import { listSessions, resolveScenario } from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';

export default function HistoryPage() {
  const isClient = useIsClient();
  const sessions = isClient ? listSessions() : [];

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
