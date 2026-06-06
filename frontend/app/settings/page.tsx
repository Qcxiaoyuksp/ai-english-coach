'use client';

import { useState } from 'react';
import { ApiConfig, ProviderType, VoiceMode } from '@/types';
import { useIsClient } from '@/hooks/useIsClient';

const PROVIDER_PRESETS: {
  id: ProviderType;
  label: string;
  defaultBaseUrl: string;
  defaultModel: string;
  description: string;
}[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4o-mini',
    description: '支持 GPT-4o、Realtime API',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.0-flash',
    description: '有免费额度，推荐初次使用',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    description: '高性价比，中文能力强',
  },
  {
    id: 'groq',
    label: 'Groq',
    defaultBaseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile',
    description: '极速推理，有免费额度',
  },
  {
    id: 'openai-compatible',
    label: '自定义 (OpenAI 兼容)',
    defaultBaseUrl: '',
    defaultModel: '',
    description: '支持任何 OpenAI 兼容 API',
  },
];

const VOICE_MODES: {
  mode: VoiceMode;
  icon: string;
  name: string;
  desc: string;
}[] = [
  {
    mode: 'free',
    icon: '🟢',
    name: '免费模式',
    desc: '浏览器语音，无需 API Key',
  },
  {
    mode: 'standard',
    icon: '🟡',
    name: '标准模式',
    desc: '浏览器语音 + LLM 对话',
  },
  {
    mode: 'realtime',
    icon: '🔵',
    name: '高级模式',
    desc: 'OpenAI Realtime API',
  },
];

const DEFAULT_CONFIG: ApiConfig = {
  provider: 'free',
  apiKey: '',
  baseUrl: '',
  model: '',
  voiceMode: 'free',
  ttsRate: 1.0,
};

function loadInitialConfig(): ApiConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  try {
    const savedConfig = localStorage.getItem('api-config');
    if (savedConfig) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(savedConfig) };
    }
  } catch {
    // Ignore
  }
  return DEFAULT_CONFIG;
}

export default function SettingsPage() {
  const isClient = useIsClient();
  const [configOverride, setConfigOverride] = useState<ApiConfig | null>(null);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testMessage, setTestMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // Derive config: default during SSR/first render, saved value once on client,
  // then the user's latest edits. Avoids hydration mismatch and setState-in-effect.
  const config = configOverride ?? (isClient ? loadInitialConfig() : DEFAULT_CONFIG);

  // Auto-save config
  const saveConfig = (newConfig: ApiConfig) => {
    setConfigOverride(newConfig);
    localStorage.setItem('api-config', JSON.stringify(newConfig));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateConfig = (partial: Partial<ApiConfig>) => {
    const newConfig = { ...config, ...partial };
    saveConfig(newConfig);
  };

  // Select provider preset
  const selectProvider = (preset: (typeof PROVIDER_PRESETS)[number]) => {
    updateConfig({
      provider: preset.id,
      baseUrl: preset.defaultBaseUrl,
      model: preset.defaultModel,
      voiceMode:
        preset.id === 'openai'
          ? config.voiceMode
          : config.voiceMode === 'realtime'
            ? 'standard'
            : config.voiceMode,
    });
  };

  // Test API connection
  const testConnection = async () => {
    if (!config.apiKey) {
      setTestStatus('error');
      setTestMessage('请先输入 API Key');
      return;
    }

    setTestStatus('testing');
    setTestMessage('正在测试连接...');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          messages: [
            { role: 'user', content: 'Say "Connection successful!" in exactly those words.' },
          ],
          maxTokens: 20,
        }),
      });

      if (response.ok) {
        setTestStatus('success');
        setTestMessage('连接成功！API 可正常使用');
      } else {
        const data = await response.json();
        setTestStatus('error');
        setTestMessage(data.error || `连接失败 (${response.status})`);
      }
    } catch {
      setTestStatus('error');
      setTestMessage('连接失败：网络错误');
    }
  };

  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === config.provider);

  return (
    <div className="container">
      <div className="settings-page animate-fade-in-up">
        <h1 className="section-heading">⚙️ 设置</h1>

        {/* Voice Mode Selection */}
        <div className="settings-section">
          <h2 className="settings-section-title">🎙️ 语音模式</h2>
          <div className="voice-mode-group">
            {VOICE_MODES.map((vm) => (
              <div
                key={vm.mode}
                className={`voice-mode-option ${config.voiceMode === vm.mode ? 'selected' : ''}`}
                onClick={() => {
                  if (vm.mode === 'realtime' && config.provider !== 'openai') {
                    // Switch to OpenAI if selecting realtime
                    const openai = PROVIDER_PRESETS.find(
                      (p) => p.id === 'openai',
                    )!;
                    updateConfig({
                      voiceMode: vm.mode,
                      provider: 'openai',
                      baseUrl: openai.defaultBaseUrl,
                      model: openai.defaultModel,
                    });
                  } else {
                    updateConfig({ voiceMode: vm.mode });
                  }
                }}
                role="button"
                tabIndex={0}
              >
                <div className="voice-mode-icon">{vm.icon}</div>
                <div className="voice-mode-name">{vm.name}</div>
                <div className="voice-mode-desc">{vm.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* API Provider Configuration */}
        {config.voiceMode !== 'free' && (
          <div className="settings-section">
            <h2 className="settings-section-title">🔌 API 配置</h2>

            {/* Provider Presets */}
            <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
              <label className="input-label">选择 AI 提供商</label>
              <div className="provider-presets">
                {PROVIDER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`provider-preset ${config.provider === preset.id ? 'active' : ''}`}
                    onClick={() => selectProvider(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              {currentPreset && (
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-muted)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  {currentPreset.description}
                </p>
              )}
            </div>

            <div className="settings-grid">
              {/* API Key */}
              <div className="input-group settings-full-width">
                <label className="input-label">API Key</label>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showApiKey ? 'text' : 'password'}
                    value={config.apiKey || ''}
                    onChange={(e) => updateConfig({ apiKey: e.target.value })}
                    placeholder="sk-... 或 AI... 填入你的 API Key"
                    style={{ paddingRight: '3rem' }}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowApiKey(!showApiKey)}
                    style={{
                      position: 'absolute',
                      right: '4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                    aria-label={showApiKey ? '隐藏' : '显示'}
                  >
                    {showApiKey ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {/* Base URL */}
              <div className="input-group">
                <label className="input-label">API Base URL</label>
                <input
                  className="input"
                  value={config.baseUrl || ''}
                  onChange={(e) => updateConfig({ baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                />
              </div>

              {/* Model */}
              <div className="input-group">
                <label className="input-label">模型名称</label>
                <input
                  className="input"
                  value={config.model || ''}
                  onChange={(e) => updateConfig({ model: e.target.value })}
                  placeholder={currentPreset?.defaultModel || 'gpt-4o-mini'}
                />
              </div>
            </div>

            {/* Test Connection */}
            <div
              style={{
                marginTop: 'var(--space-5)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-4)',
              }}
            >
              <button className="btn btn-secondary" onClick={testConnection}>
                🔍 测试连接
              </button>
              {testStatus !== 'idle' && (
                <div className="test-connection">
                  <span className={`test-dot ${testStatus}`} />
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color:
                        testStatus === 'success'
                          ? 'var(--color-accent-emerald)'
                          : testStatus === 'error'
                            ? 'var(--color-accent-rose)'
                            : 'var(--color-text-secondary)',
                    }}
                  >
                    {testMessage}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Voice Settings */}
        <div className="settings-section">
          <h2 className="settings-section-title">🔊 语音设置</h2>
          <div className="settings-grid">
            <div className="input-group">
              <label className="input-label">语速 ({config.ttsRate?.toFixed(1)}x)</label>
              <input
                type="range"
                min="0.5"
                max="2.0"
                step="0.1"
                value={config.ttsRate || 1.0}
                onChange={(e) =>
                  updateConfig({ ttsRate: parseFloat(e.target.value) })
                }
                style={{
                  width: '100%',
                  accentColor: 'var(--color-accent-blue)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Save Indicator */}
        {saved && (
          <div
            style={{
              position: 'fixed',
              bottom: 'var(--space-8)',
              left: '50%',
              transform: 'translateX(-50%)',
              padding: 'var(--space-3) var(--space-6)',
              background: 'var(--color-accent-emerald)',
              color: 'white',
              borderRadius: 'var(--radius-full)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              animation: 'fadeInUp 0.3s ease',
              zIndex: 'var(--z-toast)',
            }}
          >
            ✓ 设置已自动保存
          </div>
        )}
      </div>
    </div>
  );
}
