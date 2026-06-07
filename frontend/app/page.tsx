'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BUILT_IN_SCENARIOS, DIFFICULTY_LABELS } from '@/lib/scenarios';
import { Scenario } from '@/types';
import {
  listCustomScenarios,
  saveCustomScenario,
  deleteCustomScenario,
} from '@/lib/storage';
import { useIsClient } from '@/hooks/useIsClient';
import { loadApiConfig, voiceModeLabel } from '@/lib/config';
import ScenarioCreator from '@/components/ScenarioCreator';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

function getModeBadge(): { label: string; needsApiKey: boolean } {
  if (typeof window === 'undefined') {
    return { label: '免费模式 · 浏览器语音', needsApiKey: false };
  }
  const config = loadApiConfig();
  // A custom-LLM choice that has no key configured yet.
  const needsApiKey = config.voiceMode !== 'free' &&
    config.llmSource === 'custom' && !config.apiKey;
  const label =
    config.voiceMode === 'free'
      ? '免费模式 · 浏览器语音'
      : `${voiceModeLabel(config.voiceMode)}${needsApiKey ? ' · 未配置 Key' : ''}`;
  return { label, needsApiKey };
}

export default function HomePage() {
  const isClient = useIsClient();
  const [customOverride, setCustomOverride] = useState<Scenario[] | null>(null);
  const [showCreator, setShowCreator] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Scenario | null>(null);

  // Browser-only values; default to empty/false during SSR + first render.
  const customScenarios =
    customOverride ?? (isClient ? listCustomScenarios() : []);
  const { label: modeBadgeLabel, needsApiKey } = isClient
    ? getModeBadge()
    : { label: '免费模式 · 浏览器语音', needsApiKey: false };

  const allScenarios = [...BUILT_IN_SCENARIOS, ...customScenarios];

  const handleCreateScenario = (scenario: Scenario) => {
    saveCustomScenario(scenario);
    setCustomOverride(listCustomScenarios());
    setShowCreator(false);
  };

  const confirmDeleteScenario = () => {
    if (pendingDelete) {
      deleteCustomScenario(pendingDelete.id);
      setCustomOverride(listCustomScenarios());
    }
    setPendingDelete(null);
  };

  return (
    <div className="container">
      {/* Hero Section */}
      <section className="hero animate-fade-in">
        <div className="hero-badge">
          <span
            className={`hero-badge-dot ${needsApiKey ? 'warning' : ''}`}
          />
          {modeBadgeLabel}
        </div>
        <h1 className="hero-title">
          AI <span className="gradient-text">English Coach</span>
        </h1>
        <p className="hero-subtitle">
          选择一个真实场景，开始你的英语口语练习。
          <br />
          AI 教练将与你进行沉浸式对话，实时纠错，并在练习结束后给出详细评估报告。
        </p>
        {needsApiKey && (
          <Link href="/settings" className="btn btn-secondary btn-sm" style={{ marginTop: '0.5rem' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
            配置 API 获取更好体验
          </Link>
        )}
      </section>

      {/* Section Label */}
      <h2 className="section-heading">🎭 选择练习场景</h2>

      {/* Scenario Grid */}
      <div className="scenario-grid stagger-children">
        {allScenarios.map((scenario) => (
          <ScenarioCard
            key={scenario.id}
            scenario={scenario}
            onDelete={
              scenario.isCustom
                ? () => setPendingDelete(scenario)
                : undefined
            }
          />
        ))}

        {/* Add Custom Scenario */}
        <div
          className="add-scenario-card"
          onClick={() => setShowCreator(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && setShowCreator(true)}
          id="add-custom-scenario"
        >
          <div className="add-scenario-icon">+</div>
          <span style={{ fontWeight: 500 }}>自定义场景</span>
          <span style={{ fontSize: 'var(--text-xs)' }}>
            创建你自己的练习场景
          </span>
        </div>
      </div>

      {/* Scenario Creator Modal */}
      {showCreator && (
        <ScenarioCreator
          onClose={() => setShowCreator(false)}
          onCreate={handleCreateScenario}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!pendingDelete}
        title="删除自定义场景"
        message={
          pendingDelete
            ? `确定要删除「${pendingDelete.nameZh || pendingDelete.name}」吗？此操作不可撤销。`
            : ''
        }
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={confirmDeleteScenario}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

// ─── Scenario Card Component ────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  onDelete,
}: {
  scenario: Scenario;
  onDelete?: () => void;
}) {
  const diffInfo = DIFFICULTY_LABELS[scenario.difficulty];

  return (
    <Link
      href={`/practice/${scenario.id}`}
      className="scenario-card"
      id={`scenario-${scenario.id}`}
    >
      <span className="scenario-card-icon">{scenario.icon}</span>

      <div className="scenario-card-header">
        <span className="scenario-card-name">{scenario.name}</span>
        <span className={`badge badge-${scenario.difficulty}`}>
          {diffInfo.labelZh}
        </span>
      </div>

      <div className="scenario-card-name-zh">{scenario.nameZh}</div>

      <p className="scenario-card-desc">{scenario.descriptionZh}</p>

      <div className="scenario-card-footer">
        <div className="scenario-card-meta">
          <span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ~{scenario.estimatedMinutes} 分钟
          </span>
          <span>
            {scenario.keyVocabulary.length} 个核心词汇
          </span>
        </div>
        <div className="scenario-card-arrow">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      {/* Delete button for custom scenarios */}
      {onDelete && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          style={{
            position: 'absolute',
            top: 'var(--space-3)',
            right: 'var(--space-3)',
            color: 'var(--color-text-muted)',
          }}
          aria-label="删除场景"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
        </button>
      )}
    </Link>
  );
}
