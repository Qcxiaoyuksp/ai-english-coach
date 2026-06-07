'use client';

import { use, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Report, ReportDimensions } from '@/types';
import { getSession, getReportBySession, saveReport, resolveScenario } from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';
import { loadApiConfig, usesBuiltinLLM } from '@/lib/config';
import {
  analyzeConversation,
  buildLocalReport,
  pronunciationScore,
  fluencyScore,
  type ConversationStats,
} from '@/lib/analyzer';
import RadarChart from '@/components/RadarChart';

const DIM_META: { key: keyof ReportDimensions; label: string }[] = [
  { key: 'pronunciation', label: '发音' },
  { key: 'grammar', label: '语法' },
  { key: 'vocabulary', label: '词汇' },
  { key: 'fluency', label: '流利度' },
  { key: 'naturalness', label: '自然度' },
  { key: 'taskCompletion', label: '任务完成' },
];

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && isFinite(v) ? Math.round(v) : fallback;
}

/**
 * Merge an LLM analysis with locally-measured metrics. Pronunciation and
 * fluency are overridden with the objective heuristic scores so the report
 * stays honest; the LLM keeps grammar/vocabulary/naturalness/taskCompletion.
 */
function buildGroundedReport(
  sessionId: string,
  llm: Record<string, unknown>,
  stats: ConversationStats,
  fallback: Report
): Report {
  const llmDims = (llm.dimensions ?? {}) as Record<string, { score?: number; feedback?: string }>;
  const fb = fallback.dimensions;

  const pron = pronunciationScore(stats.avgConfidence);
  const flu = fluencyScore(stats.wpm, stats.avgWordsPerTurn);

  const dimensions: ReportDimensions = {
    pronunciation: fb.pronunciation, // honest, confidence-based (overrides LLM)
    fluency: fb.fluency, // honest, WPM-based (overrides LLM)
    grammar: {
      score: num(llmDims.grammar?.score, fb.grammar.score),
      feedback: llmDims.grammar?.feedback || fb.grammar.feedback,
    },
    vocabulary: {
      score: num(llmDims.vocabulary?.score, fb.vocabulary.score),
      feedback: llmDims.vocabulary?.feedback || fb.vocabulary.feedback,
    },
    naturalness: {
      score: num(llmDims.naturalness?.score, fb.naturalness.score),
      feedback: llmDims.naturalness?.feedback || fb.naturalness.feedback,
    },
    taskCompletion: {
      score: num(llmDims.taskCompletion?.score, fb.taskCompletion.score),
      feedback: llmDims.taskCompletion?.feedback || fb.taskCompletion.feedback,
    },
  };
  // ensure overrides actually use local heuristic numbers
  dimensions.pronunciation = { score: pron, feedback: fb.pronunciation.feedback };
  dimensions.fluency = { score: flu, feedback: fb.fluency.feedback };

  const overallScore = Math.round(
    dimensions.pronunciation.score * 0.2 +
      dimensions.grammar.score * 0.2 +
      dimensions.vocabulary.score * 0.15 +
      dimensions.fluency.score * 0.2 +
      dimensions.naturalness.score * 0.1 +
      dimensions.taskCompletion.score * 0.15
  );

  const errors = Array.isArray(llm.errors) && llm.errors.length > 0
    ? (llm.errors as Record<string, string>[]).map((e) => ({
        type: (e.type as 'grammar' | 'expression' | 'vocabulary') || 'grammar',
        original: e.original || '',
        corrected: e.corrected || '',
        explanation: e.explanation || '',
        context: '',
      }))
    : fallback.errors;

  const suggestions = Array.isArray(llm.suggestions) && llm.suggestions.length > 0
    ? (llm.suggestions as string[])
    : fallback.suggestions;

  const keyVocabulary = Array.isArray(llm.keyVocabulary)
    ? (llm.keyVocabulary as { word: string; definition: string; example: string }[])
    : [];

  return {
    id: `report-${sessionId}`,
    sessionId,
    createdAt: Date.now(),
    overallScore,
    dimensions,
    errors,
    highlights: [],
    suggestions,
    keyVocabulary,
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

  const [report, setReport] = useState<Report | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const startedRef = useRef(false);

  // Generate (or load cached) report after mount. Async work lives inside a
  // nested function so we never call setState synchronously in the effect body.
  useEffect(() => {
    if (!isClient || startedRef.current) return;
    const sess = getSession(sessionId);
    if (!sess) return;
    startedRef.current = true;

    const generate = async () => {
      const cached = getReportBySession(sessionId);
      if (cached) {
        setReport(cached);
        setStatus('ready');
        return;
      }

      const stats = analyzeConversation(sess);
      const localReport = buildLocalReport(sess);
      const config = loadApiConfig();

      let result: Report = localReport;

      // Use the LLM analyzer for non-free modes: built-in LLM (server key) or
      // the user's own key. Falls back to the local report on any failure.
      const useServerKey = usesBuiltinLLM(config);
      const canAnalyze =
        config.voiceMode !== 'free' && (useServerKey || !!config.apiKey);
      if (canAnalyze) {
        try {
          const res = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ config, session: sess, stats, useServerKey }),
          });
          if (res.ok) {
            const json = await res.json();
            if (json && json.dimensions) {
              result = buildGroundedReport(sessionId, json, stats, localReport);
            }
          }
        } catch {
          // Network/parse failure → keep the local report.
        }
      }

      saveReport(result);
      setReport(result);
      setStatus('ready');
    };

    generate();
  }, [isClient, sessionId]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'var(--color-accent-emerald)';
    if (score >= 60) return 'var(--color-accent-amber)';
    return 'var(--color-accent-rose)';
  };

  const formatDuration = (start: number, end: number) => {
    const seconds = Math.round((end - start) / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}分${s}秒`;
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

  const scenario = resolveScenario(session.scenarioId);

  if (status === 'loading' || !report) {
    return (
      <div className="container" style={{ paddingTop: 'var(--space-16)', textAlign: 'center' }}>
        <div className="animate-spin" style={{ fontSize: '2rem' }}>⏳</div>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-4)' }}>
          正在生成评估报告...
        </p>
      </div>
    );
  }

  const radarData = DIM_META.map((d) => ({
    label: d.label,
    score: report.dimensions[d.key].score,
  }));

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
          <div className="report-score-circle" style={{ marginTop: 'var(--space-6)' }}>
            <svg viewBox="0 0 160 160" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="80" cy="80" r="70" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
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
              <div className="report-score-number gradient-text" style={{ fontSize: 'var(--text-4xl)' }}>
                {report.overallScore}
              </div>
              <div className="report-score-label">综合得分</div>
            </div>
          </div>
        </div>

        {/* Dimensions Grid */}
        <div className="report-grid">
          {/* Radar + Score Dimensions */}
          <div className="report-card">
            <h3 className="report-card-title">📈 六维评分</h3>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
              <RadarChart data={radarData} size={260} />
            </div>
            {DIM_META.map((d) => {
              const dim = report.dimensions[d.key];
              return (
                <div key={d.key} className="report-dimension">
                  <span className="report-dimension-name">{d.label}</span>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span className="report-dimension-score" style={{ color: getScoreColor(dim.score) }}>
                      {dim.score}
                    </span>
                    <div className="report-dimension-bar">
                      <div className="report-dimension-fill" style={{ width: `${dim.score}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dimension feedback + Suggestions */}
          <div className="report-card">
            <h3 className="report-card-title">🧭 维度点评</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', marginBottom: 'var(--space-5)' }}>
              {DIM_META.map((d) => (
                <div key={d.key} style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                  <strong style={{ color: 'var(--color-text-primary)' }}>{d.label}：</strong>
                  {report.dimensions[d.key].feedback}
                </div>
              ))}
            </div>

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
                  <span style={{ position: 'absolute', left: 0, color: 'var(--color-accent-blue-light)' }}>•</span>
                  {suggestion}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Key Vocabulary */}
        {report.keyVocabulary.length > 0 && (
          <div className="report-card" style={{ marginBottom: 'var(--space-8)' }}>
            <h3 className="report-card-title">📚 关键词汇</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {report.keyVocabulary.map((v, i) => (
                <div key={i} style={{ fontSize: 'var(--text-sm)' }}>
                  <strong style={{ color: 'var(--color-accent-cyan)' }}>{v.word}</strong>
                  <span style={{ color: 'var(--color-text-muted)' }}> — {v.definition}</span>
                  {v.example && (
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                      e.g. {v.example}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Errors */}
        {report.errors.length > 0 && (
          <div className="report-card" style={{ marginBottom: 'var(--space-8)' }}>
            <h3 className="report-card-title">❌ 错误详情</h3>
            {report.errors.map((error, i) => {
              const typeLabels: Record<string, { icon: string; label: string; color: string }> = {
                grammar: { icon: '🔤', label: '语法', color: 'var(--color-accent-amber)' },
                expression: { icon: '🗣️', label: '表达', color: 'var(--color-accent-purple)' },
                vocabulary: { icon: '📝', label: '用词', color: 'var(--color-accent-cyan)' },
              };
              const typeInfo = typeLabels[error.type] || typeLabels.grammar;
              return (
                <div key={i} className="report-error-item">
                  <div className="report-error-type" style={{ color: typeInfo.color }}>
                    {typeInfo.icon} {typeInfo.label}
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)' }}>
                    <span style={{ color: 'var(--color-accent-rose)' }}>
                      ❌ <s>{error.original}</s>
                    </span>
                  </div>
                  <div style={{ fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                    <span style={{ color: 'var(--color-accent-emerald)' }}>✅ {error.corrected}</span>
                  </div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginTop: 'var(--space-2)' }}>
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
                  background: msg.role === 'user' ? 'rgba(59, 130, 246, 0.08)' : 'var(--color-bg-glass)',
                  borderRadius: 'var(--radius-md)',
                  fontSize: 'var(--text-sm)',
                }}
              >
                <span style={{ fontWeight: 600, fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                  {msg.role === 'user' ? '🙋 You' : '🤖 AI'}
                </span>
                <p style={{ marginTop: 'var(--space-1)', lineHeight: 'var(--leading-relaxed)' }}>
                  {msg.content}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="report-actions">
          <Link href={`/practice/${session.scenarioId}`} className="btn btn-primary btn-lg">
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
