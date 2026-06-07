// ============================================================
// API Config — shared defaults, migration & engine resolution
// ============================================================
// Single source of truth for reading the persisted api-config and deriving
// which speech/LLM engines are active for the selected voice mode.
//
// Mode semantics (v6):
//   free     : ASR=browser · LLM=builtin(Zhipu) · TTS=browser
//   standard : ASR=browser · LLM=builtin|custom · TTS=小米(builtin)
//   advanced : ASR=硅基(builtin|custom) · LLM=builtin|custom · TTS=小米(builtin|custom)
// ============================================================

import { ApiConfig, TTSSource, ASRSource } from '@/types';

export const DEFAULT_ASR_MODEL = 'FunAudioLLM/SenseVoiceSmall';
export const DEFAULT_TTS_VOICE = 'Chloe';

export const DEFAULT_API_CONFIG: ApiConfig = {
  provider: 'free',
  apiKey: '',
  baseUrl: '',
  model: '',
  voiceMode: 'free',
  ttsRate: 1.0,
  llmSource: 'builtin',
  ttsApiVoice: DEFAULT_TTS_VOICE,
  asrApiModel: DEFAULT_ASR_MODEL,
};

/**
 * Normalize a raw (possibly legacy) parsed config into a complete ApiConfig.
 * Handles migration of the old 'realtime' voice mode and fills sensible
 * defaults (including a derived llmSource for pre-existing standard setups).
 */
export function normalizeConfig(raw: unknown): ApiConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  // Migrate legacy 'realtime' → 'advanced'.
  let voiceMode = r.voiceMode as ApiConfig['voiceMode'];
  if ((voiceMode as string) === 'realtime') voiceMode = 'advanced';
  if (voiceMode !== 'standard' && voiceMode !== 'advanced') voiceMode = 'free';

  // Derive llmSource: if unset, infer from whether a user key was saved.
  let llmSource = r.llmSource as ApiConfig['llmSource'];
  if (llmSource !== 'builtin' && llmSource !== 'custom') {
    llmSource = r.apiKey ? 'custom' : 'builtin';
  }

  return {
    ...DEFAULT_API_CONFIG,
    ...r,
    voiceMode,
    llmSource,
    ttsApiVoice: (r.ttsApiVoice as string) || DEFAULT_TTS_VOICE,
    asrApiModel: (r.asrApiModel as string) || DEFAULT_ASR_MODEL,
  } as ApiConfig;
}

/** Read and normalize the persisted config (client only). */
export function loadApiConfig(): ApiConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_API_CONFIG };
  try {
    const saved = localStorage.getItem('api-config');
    if (saved) return normalizeConfig(JSON.parse(saved));
  } catch {
    /* ignore */
  }
  return { ...DEFAULT_API_CONFIG };
}

// ─── Engine resolution (mode-driven) ─────────────────────────

/** Whether the LLM should use the server-side built-in key. */
export function usesBuiltinLLM(config: ApiConfig): boolean {
  return config.voiceMode === 'free' || config.llmSource !== 'custom';
}

/** Effective ASR engine for the mode. */
export function effectiveAsrSource(config: ApiConfig): ASRSource {
  return config.voiceMode === 'advanced' ? 'api' : 'browser';
}

/** Effective TTS engine for the mode. */
export function effectiveTtsSource(config: ApiConfig): TTSSource {
  return config.voiceMode === 'free' ? 'browser' : 'api';
}

/** Human-readable mode label. */
export function voiceModeLabel(voiceMode: ApiConfig['voiceMode']): string {
  if (voiceMode === 'advanced') return '高级模式';
  if (voiceMode === 'standard') return '标准模式';
  return '免费模式';
}
