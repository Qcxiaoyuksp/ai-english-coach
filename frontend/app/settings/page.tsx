'use client';

import { useState, useEffect, useRef } from 'react';
import { ApiConfig, ProviderType, VoiceMode } from '@/types';
import { useIsClient } from '@/hooks/useIsClient';
import { DEFAULT_API_CONFIG, normalizeConfig } from '@/lib/config';
import { createTestWavBlob, transcribeAudio } from '@/lib/speech/recorder';

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
    description: '支持 GPT-4o 系列',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    defaultModel: 'gemini-2.5-flash',
    description: '有免费额度，推荐初次使用',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultBaseUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4-flash',
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
    id: 'zhipu',
    label: '智谱 GLM',
    defaultBaseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModel: 'glm-4.7-flash',
    description: 'glm-4.7-flash 免费，中文能力强',
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    defaultBaseUrl: 'https://api.siliconflow.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    description: '聚合多家开源模型，有免费额度',
  },
  {
    id: 'modelscope',
    label: 'ModelScope 魔搭',
    defaultBaseUrl: 'https://api-inference.modelscope.cn/v1',
    defaultModel: 'Qwen/Qwen2.5-7B-Instruct',
    description: '魔搭社区免费推理 API',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    defaultModel: 'openai/gpt-4o-mini',
    description: '一个 Key 聚合众多模型',
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
    desc: '零配置 · 浏览器语音 + 内置 AI 对话',
  },
  {
    mode: 'standard',
    icon: '🟡',
    name: '标准模式',
    desc: '浏览器识别 + 内置/自配 LLM + 内置小米发音',
  },
  {
    mode: 'advanced',
    icon: '🔵',
    name: '高级模式',
    desc: '云端 ASR + 内置/自配 LLM + 云端 TTS（可自填各家 API）',
  },
];

const XIAOMI_TTS_VOICES: { id: string; label: string }[] = [
  { id: 'Chloe', label: 'Chloe（英文女声）' },
  { id: 'Mia', label: 'Mia（英文女声）' },
  { id: 'Milo', label: 'Milo（英文男声）' },
  { id: 'Dean', label: 'Dean（英文男声）' },
];

const ASR_MODELS: { id: string; label: string }[] = [
  { id: 'FunAudioLLM/SenseVoiceSmall', label: 'SenseVoiceSmall（多语种，推荐英文）' },
  { id: 'TeleAI/TeleSpeechASR', label: 'TeleSpeechASR（偏中文）' },
];

function loadInitialConfig(): ApiConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_API_CONFIG };
  try {
    const savedConfig = localStorage.getItem('api-config');
    if (savedConfig) return normalizeConfig(JSON.parse(savedConfig));
  } catch {
    // Ignore
  }
  return { ...DEFAULT_API_CONFIG };
}

// Per-provider memory of { apiKey, baseUrl, model } so switching providers
// back and forth doesn't lose previously entered values.
type ProviderProfile = { apiKey?: string; baseUrl?: string; model?: string };

function loadProfiles(): Record<string, ProviderProfile> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem('provider-profiles') || '{}');
  } catch {
    return {};
  }
}

function saveProfiles(profiles: Record<string, ProviderProfile>): void {
  try {
    localStorage.setItem('provider-profiles', JSON.stringify(profiles));
  } catch {
    /* ignore */
  }
}

export default function SettingsPage() {
  const isClient = useIsClient();
  const [configOverride, setConfigOverride] = useState<ApiConfig | null>(null);
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [testMessage, setTestMessage] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [showTtsKey, setShowTtsKey] = useState(false);
  const [showAsrKey, setShowAsrKey] = useState(false);
  const [ttsPreview, setTtsPreview] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  const [ttsPreviewMsg, setTtsPreviewMsg] = useState('');
  const [asrTest, setAsrTest] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [asrTestMsg, setAsrTestMsg] = useState('');
  const [ttsTest, setTtsTest] = useState<'idle' | 'loading' | 'success' | 'error'>(
    'idle',
  );
  const [ttsTestMsg, setTtsTestMsg] = useState('');
  const [saved, setSaved] = useState(false);
  // Model list fetched via the server-side /api/models proxy.
  const [models, setModels] = useState<string[]>([]);
  const [modelStatus, setModelStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  const [modelMessage, setModelMessage] = useState('');
  const [showModelList, setShowModelList] = useState(false);
  const modelWrapRef = useRef<HTMLDivElement>(null);

  // Close the model dropdown when clicking anywhere outside of it.
  useEffect(() => {
    if (!showModelList) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (modelWrapRef.current && !modelWrapRef.current.contains(e.target as Node)) {
        setShowModelList(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [showModelList]);

  // Derive config: default during SSR/first render, saved value once on client,
  // then the user's latest edits. Avoids hydration mismatch and setState-in-effect.
  const config = configOverride ?? (isClient ? loadInitialConfig() : DEFAULT_API_CONFIG);

  const saveConfig = (newConfig: ApiConfig) => {
    setConfigOverride(newConfig);
    localStorage.setItem('api-config', JSON.stringify(newConfig));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateConfig = (partial: Partial<ApiConfig>) => {
    const newConfig = { ...config, ...partial };
    saveConfig(newConfig);
    if (
      'provider' in partial ||
      'apiKey' in partial ||
      'baseUrl' in partial ||
      'model' in partial
    ) {
      setTestStatus('idle');
      setTestMessage('');
    }
    if ('provider' in partial || 'apiKey' in partial || 'baseUrl' in partial) {
      setModels([]);
      setModelStatus('idle');
      setModelMessage('');
      setShowModelList(false);
    }
  };

  // Select provider preset (custom-LLM only).
  const selectProvider = (preset: (typeof PROVIDER_PRESETS)[number]) => {
    const profiles = loadProfiles();
    profiles[config.provider] = {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
    };
    saveProfiles(profiles);

    const savedProfile = profiles[preset.id];
    updateConfig({
      provider: preset.id,
      apiKey: savedProfile?.apiKey ?? '',
      baseUrl: savedProfile?.baseUrl ?? preset.defaultBaseUrl,
      model: savedProfile?.model ?? preset.defaultModel,
    });
  };

  // Fetch available models from the provider via our server proxy.
  const fetchModels = async () => {
    if (!config.apiKey) {
      setModelStatus('error');
      setModelMessage('请先输入 API Key');
      return;
    }
    setModelStatus('loading');
    setModelMessage('正在获取模型列表...');
    try {
      const response = await fetch('/api/models', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.models)) {
        setModels(data.models);
        if (data.models.length === 0) {
          setModelStatus('error');
          setModelMessage('未获取到任何模型，请手动填写模型名称');
        } else {
          setModelStatus('idle');
          setModelMessage(`已获取 ${data.models.length} 个模型`);
        }
      } else {
        setModelStatus('error');
        setModelMessage(data.error || `获取失败 (${response.status})`);
      }
    } catch {
      setModelStatus('error');
      setModelMessage('获取失败：网络错误');
    }
  };

  // Test the custom LLM connection.
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

  // Preview the TTS voice. Uses the built-in key unless the user opted into a
  // custom TTS API in advanced mode.
  const previewTts = async () => {
    const useCustom = config.voiceMode === 'advanced' && !!config.ttsUseCustomApi;
    setTtsPreview('loading');
    setTtsPreviewMsg('正在合成试听...');
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: "Hi! I'm your English speaking coach. Let's practice together.",
          voice: config.ttsApiVoice,
          apiKey: useCustom ? config.ttsApiKey : undefined,
          baseUrl: useCustom ? config.ttsApiBaseUrl : undefined,
          model: useCustom ? config.ttsApiModel : undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setTtsPreview('error');
        setTtsPreviewMsg(
          data.error === 'TTS_API_UNAVAILABLE'
            ? '未配置 TTS API Key（服务端未内置，且未填写自己的 Key）'
            : data.error || `试听失败 (${response.status})`,
        );
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = config.ttsRate || 1.0;
      audio.onended = () => {
        URL.revokeObjectURL(url);
        setTtsPreviewMsg('');
      };
      await audio.play();
      setTtsPreview('idle');
      setTtsPreviewMsg('试听播放中…');
    } catch {
      setTtsPreview('error');
      setTtsPreviewMsg('试听失败：网络错误');
    }
  };

  const currentPreset = PROVIDER_PRESETS.find((p) => p.id === config.provider);
  const isCustomLLM = config.llmSource === 'custom';
  const isAdvanced = config.voiceMode === 'advanced';

  // Lightweight connectivity test for a custom ASR API: send a short silent
  // clip; a 200 response (even with empty text) means key/url/model work.
  const testAsr = async () => {
    if (!config.asrApiKey) {
      setAsrTest('error');
      setAsrTestMsg('请先填写 ASR API Key');
      return;
    }
    setAsrTest('loading');
    setAsrTestMsg('正在测试…');
    try {
      const text = await transcribeAudio(createTestWavBlob(), {
        ...config,
        asrApiKey: config.asrApiKey,
        asrApiBaseUrl: config.asrApiBaseUrl,
        asrApiModel: config.asrApiModel,
      });
      setAsrTest('success');
      setAsrTestMsg(text ? `连接成功，识别到：“${text}”` : '连接成功，接口可用');
    } catch (e) {
      setAsrTest('error');
      setAsrTestMsg(e instanceof Error ? e.message : '测试失败');
    }
  };

  // Lightweight test for a custom TTS API: synthesize a short clip and play it.
  const testTts = async () => {
    if (!config.ttsApiKey) {
      setTtsTest('error');
      setTtsTestMsg('请先填写 TTS API Key');
      return;
    }
    setTtsTest('loading');
    setTtsTestMsg('正在测试…');
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: 'This is a TTS connection test.',
          voice: config.ttsApiVoice,
          apiKey: config.ttsApiKey,
          baseUrl: config.ttsApiBaseUrl,
          model: config.ttsApiModel,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setTtsTest('error');
        setTtsTestMsg(data.error || `测试失败 (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.playbackRate = config.ttsRate || 1.0;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play();
      setTtsTest('success');
      setTtsTestMsg('连接成功，已播放测试语音');
    } catch {
      setTtsTest('error');
      setTtsTestMsg('测试失败：网络错误');
    }
  };

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
                onClick={() => updateConfig({ voiceMode: vm.mode })}
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

        {/* LLM Configuration — standard & advanced */}
        {config.voiceMode !== 'free' && (
          <div className="settings-section">
            <h2 className="settings-section-title">🤖 对话模型 (LLM)</h2>

            {/* LLM source */}
            <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
              <label className="input-label">对话模型来源</label>
              <div className="provider-presets">
                <button
                  className={`provider-preset ${!isCustomLLM ? 'active' : ''}`}
                  onClick={() => updateConfig({ llmSource: 'builtin' })}
                >
                  🆓 内置智谱（免费）
                </button>
                <button
                  className={`provider-preset ${isCustomLLM ? 'active' : ''}`}
                  onClick={() => updateConfig({ llmSource: 'custom' })}
                >
                  🔧 自己配置
                </button>
              </div>
              {!isCustomLLM && (
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-muted)',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  使用服务端内置的智谱 GLM 对话，无需配置 Key。
                </p>
              )}
            </div>

            {isCustomLLM && (
              <>
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
                  <div className="input-group" style={{ position: 'relative' }}>
                    <label className="input-label">模型名称</label>
                    <div
                      style={{
                        display: 'flex',
                        gap: 'var(--space-2)',
                        alignItems: 'center',
                      }}
                    >
                      <input
                        className="input"
                        style={{ flex: 1 }}
                        value={config.model || ''}
                        onChange={(e) => updateConfig({ model: e.target.value })}
                        placeholder={currentPreset?.defaultModel || 'gpt-4o-mini'}
                      />
                      {models.length > 0 && (
                        <div className="model-select-wrap" ref={modelWrapRef}>
                          <button
                            type="button"
                            className="model-select-toggle"
                            onClick={() => setShowModelList((v) => !v)}
                            aria-label="从列表选择模型"
                            aria-expanded={showModelList}
                            title="从已获取的模型列表选择"
                          >
                            ▾
                          </button>
                          {showModelList && (
                            <div className="model-dropdown" role="listbox">
                              {models.map((m) => (
                                <button
                                  type="button"
                                  key={m}
                                  className={`model-dropdown-item ${config.model === m ? 'active' : ''}`}
                                  role="option"
                                  aria-selected={config.model === m}
                                  onClick={() => {
                                    updateConfig({ model: m });
                                    setShowModelList(false);
                                  }}
                                >
                                  {m}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={fetchModels}
                        disabled={modelStatus === 'loading'}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {modelStatus === 'loading' ? '获取中...' : '获取模型列表'}
                      </button>
                    </div>
                    {modelMessage && (
                      <p
                        className="model-status-msg"
                        style={{
                          color:
                            modelStatus === 'error'
                              ? 'var(--color-accent-rose)'
                              : 'var(--color-text-muted)',
                        }}
                      >
                        {modelMessage}
                      </p>
                    )}
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
              </>
            )}
          </div>
        )}

        {/* Speech Recognition (ASR) — advanced only */}
        {isAdvanced && (
          <div className="settings-section">
            <h2 className="settings-section-title">🎤 语音识别 (ASR)</h2>

            <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
              <label className="input-label">识别来源</label>
              <div className="provider-presets">
                <button
                  className={`provider-preset ${!config.asrUseCustomApi ? 'active' : ''}`}
                  onClick={() => updateConfig({ asrUseCustomApi: false })}
                >
                  ✨ 内置硅基（默认）
                </button>
                <button
                  className={`provider-preset ${config.asrUseCustomApi ? 'active' : ''}`}
                  onClick={() => updateConfig({ asrUseCustomApi: true })}
                >
                  🔧 自定义 ASR API
                </button>
              </div>
              <p
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)',
                  marginTop: 'var(--space-2)',
                }}
              >
                录制整段音频后云端识别：更准、不会被停顿截断，Edge/Firefox 也可用。
              </p>
            </div>

            <div className="settings-grid">
              {/* Model (built-in SiliconFlow) */}
              {!config.asrUseCustomApi && (
                <div className="input-group">
                  <label className="input-label">识别模型</label>
                  <select
                    className="input"
                    value={config.asrApiModel || 'FunAudioLLM/SenseVoiceSmall'}
                    onChange={(e) => updateConfig({ asrApiModel: e.target.value })}
                  >
                    {ASR_MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Custom ASR API */}
              {config.asrUseCustomApi && (
                <>
                  <div className="input-group settings-full-width">
                    <label className="input-label">ASR API Key</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        className="input"
                        type={showAsrKey ? 'text' : 'password'}
                        value={config.asrApiKey || ''}
                        onChange={(e) => updateConfig({ asrApiKey: e.target.value })}
                        placeholder="你的 ASR 提供商 API Key"
                        style={{ paddingRight: '3rem' }}
                      />
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setShowAsrKey(!showAsrKey)}
                        style={{
                          position: 'absolute',
                          right: '4px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }}
                        aria-label={showAsrKey ? '隐藏' : '显示'}
                      >
                        {showAsrKey ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </div>
                  <div className="input-group">
                    <label className="input-label">Base URL</label>
                    <input
                      className="input"
                      value={config.asrApiBaseUrl || ''}
                      onChange={(e) => updateConfig({ asrApiBaseUrl: e.target.value })}
                      placeholder="https://api.siliconflow.cn/v1"
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">识别模型</label>
                    <input
                      className="input"
                      value={config.asrApiModel || ''}
                      onChange={(e) => updateConfig({ asrApiModel: e.target.value })}
                      placeholder="FunAudioLLM/SenseVoiceSmall"
                    />
                  </div>
                  <div className="input-group settings-full-width">
                    <label className="input-label">连接测试</label>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--space-3)',
                      }}
                    >
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={testAsr}
                        disabled={asrTest === 'loading'}
                        style={{ whiteSpace: 'nowrap' }}
                      >
                        {asrTest === 'loading' ? '测试中...' : '🔍 测试 ASR'}
                      </button>
                      {asrTestMsg && (
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color:
                              asrTest === 'error'
                                ? 'var(--color-accent-rose)'
                                : asrTest === 'success'
                                  ? 'var(--color-accent-emerald)'
                                  : 'var(--color-text-muted)',
                          }}
                        >
                          {asrTestMsg}
                        </span>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Text-to-Speech (TTS) — all modes */}
        <div className="settings-section">
          <h2 className="settings-section-title">🔊 语音合成 (TTS)</h2>

          {config.voiceMode === 'free' ? (
            <p
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--color-text-secondary)',
                marginBottom: 'var(--space-4)',
              }}
            >
              免费模式使用浏览器内置语音合成（SpeechSynthesis）。
            </p>
          ) : (
            <>
              {/* Advanced: built-in vs custom TTS API */}
              {isAdvanced && (
                <div className="input-group" style={{ marginBottom: 'var(--space-5)' }}>
                  <label className="input-label">发音来源</label>
                  <div className="provider-presets">
                    <button
                      className={`provider-preset ${!config.ttsUseCustomApi ? 'active' : ''}`}
                      onClick={() => updateConfig({ ttsUseCustomApi: false })}
                    >
                      ✨ 内置小米（默认）
                    </button>
                    <button
                      className={`provider-preset ${config.ttsUseCustomApi ? 'active' : ''}`}
                      onClick={() => updateConfig({ ttsUseCustomApi: true })}
                    >
                      🔧 自定义 TTS API
                    </button>
                  </div>
                </div>
              )}

              {!isAdvanced && (
                <p
                  style={{
                    fontSize: 'var(--text-xs)',
                    color: 'var(--color-text-muted)',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  使用内置小米 MiMo 云端语音合成（免费），失败时自动回退浏览器语音。
                </p>
              )}

              <div className="settings-grid">
                {/* Custom TTS API (advanced) */}
                {isAdvanced && config.ttsUseCustomApi && (
                  <>
                    <div className="input-group settings-full-width">
                      <label className="input-label">TTS API Key</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="input"
                          type={showTtsKey ? 'text' : 'password'}
                          value={config.ttsApiKey || ''}
                          onChange={(e) => updateConfig({ ttsApiKey: e.target.value })}
                          placeholder="你的 TTS 提供商 API Key"
                          style={{ paddingRight: '3rem' }}
                        />
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setShowTtsKey(!showTtsKey)}
                          style={{
                            position: 'absolute',
                            right: '4px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                          }}
                          aria-label={showTtsKey ? '隐藏' : '显示'}
                        >
                          {showTtsKey ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                    <div className="input-group">
                      <label className="input-label">Base URL</label>
                      <input
                        className="input"
                        value={config.ttsApiBaseUrl || ''}
                        onChange={(e) => updateConfig({ ttsApiBaseUrl: e.target.value })}
                        placeholder="https://api.xiaomimimo.com/v1"
                      />
                    </div>
                    <div className="input-group">
                      <label className="input-label">模型</label>
                      <input
                        className="input"
                        value={config.ttsApiModel || ''}
                        onChange={(e) => updateConfig({ ttsApiModel: e.target.value })}
                        placeholder="mimo-v2.5-tts"
                      />
                    </div>
                    <div className="input-group settings-full-width">
                      <label className="input-label">连接测试</label>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-3)',
                        }}
                      >
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={testTts}
                          disabled={ttsTest === 'loading'}
                          style={{ whiteSpace: 'nowrap' }}
                        >
                          {ttsTest === 'loading' ? '测试中...' : '🔍 测试 TTS'}
                        </button>
                        {ttsTestMsg && (
                          <span
                            style={{
                              fontSize: 'var(--text-xs)',
                              color:
                                ttsTest === 'error'
                                  ? 'var(--color-accent-rose)'
                                  : ttsTest === 'success'
                                    ? 'var(--color-accent-emerald)'
                                    : 'var(--color-text-muted)',
                            }}
                          >
                            {ttsTestMsg}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Voice (Xiaomi presets) — shown for built-in 小米 */}
                {!(isAdvanced && config.ttsUseCustomApi) && (
                  <div className="input-group">
                    <label className="input-label">音色</label>
                    <select
                      className="input"
                      value={config.ttsApiVoice || 'Chloe'}
                      onChange={(e) => updateConfig({ ttsApiVoice: e.target.value })}
                    >
                      {XIAOMI_TTS_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Preview */}
                <div className="input-group">
                  <label className="input-label">试听</label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-3)',
                    }}
                  >
                    <button
                      className="btn btn-secondary"
                      onClick={previewTts}
                      disabled={ttsPreview === 'loading'}
                      style={{ whiteSpace: 'nowrap' }}
                    >
                      {ttsPreview === 'loading' ? '合成中...' : '🔈 试听音色'}
                    </button>
                    {ttsPreviewMsg && (
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          color:
                            ttsPreview === 'error'
                              ? 'var(--color-accent-rose)'
                              : 'var(--color-text-muted)',
                        }}
                      >
                        {ttsPreviewMsg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Rate (all modes) */}
          <div className="settings-grid" style={{ marginTop: 'var(--space-4)' }}>
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
