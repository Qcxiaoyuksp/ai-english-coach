import { describe, it, expect } from 'vitest';
import {
  DEFAULT_API_CONFIG,
  DEFAULT_ASR_MODEL,
  DEFAULT_TTS_VOICE,
  normalizeConfig,
  usesBuiltinLLM,
  effectiveAsrSource,
  effectiveTtsSource,
  voiceModeLabel,
} from '@/lib/config';
import { ApiConfig } from '@/types';

describe('normalizeConfig', () => {
  it('returns defaults for empty/invalid input', () => {
    expect(normalizeConfig(undefined)).toEqual(DEFAULT_API_CONFIG);
    expect(normalizeConfig(null)).toEqual(DEFAULT_API_CONFIG);
    expect(normalizeConfig('garbage')).toEqual(DEFAULT_API_CONFIG);
    expect(normalizeConfig(42)).toEqual(DEFAULT_API_CONFIG);
  });

  it('migrates the legacy "realtime" voice mode to "advanced"', () => {
    expect(normalizeConfig({ voiceMode: 'realtime' }).voiceMode).toBe('advanced');
  });

  it('falls back to "free" for unknown voice modes', () => {
    expect(normalizeConfig({ voiceMode: 'bogus' }).voiceMode).toBe('free');
    expect(normalizeConfig({}).voiceMode).toBe('free');
  });

  it('preserves valid standard/advanced voice modes', () => {
    expect(normalizeConfig({ voiceMode: 'standard' }).voiceMode).toBe('standard');
    expect(normalizeConfig({ voiceMode: 'advanced' }).voiceMode).toBe('advanced');
  });

  it('derives llmSource=custom when a key exists but llmSource is unset', () => {
    expect(normalizeConfig({ voiceMode: 'standard', apiKey: 'sk-x' }).llmSource).toBe(
      'custom',
    );
  });

  it('derives llmSource=builtin when no key and unset', () => {
    expect(normalizeConfig({ voiceMode: 'standard' }).llmSource).toBe('builtin');
  });

  it('respects an explicit llmSource over the key heuristic', () => {
    expect(
      normalizeConfig({ voiceMode: 'standard', apiKey: 'sk-x', llmSource: 'builtin' })
        .llmSource,
    ).toBe('builtin');
  });

  it('fills default ASR model and TTS voice', () => {
    const c = normalizeConfig({ voiceMode: 'advanced' });
    expect(c.asrApiModel).toBe(DEFAULT_ASR_MODEL);
    expect(c.ttsApiVoice).toBe(DEFAULT_TTS_VOICE);
  });

  it('keeps user-provided ASR model and TTS voice', () => {
    const c = normalizeConfig({
      voiceMode: 'advanced',
      asrApiModel: 'TeleAI/TeleSpeechASR',
      ttsApiVoice: 'Milo',
    });
    expect(c.asrApiModel).toBe('TeleAI/TeleSpeechASR');
    expect(c.ttsApiVoice).toBe('Milo');
  });
});

describe('usesBuiltinLLM', () => {
  const base: ApiConfig = { provider: 'free', voiceMode: 'free' };

  it('is always true for free mode', () => {
    expect(usesBuiltinLLM({ ...base, voiceMode: 'free' })).toBe(true);
  });

  it('is true when llmSource is builtin', () => {
    expect(
      usesBuiltinLLM({ ...base, voiceMode: 'standard', llmSource: 'builtin' }),
    ).toBe(true);
  });

  it('is false when llmSource is custom', () => {
    expect(
      usesBuiltinLLM({ ...base, voiceMode: 'standard', llmSource: 'custom' }),
    ).toBe(false);
    expect(
      usesBuiltinLLM({ ...base, voiceMode: 'advanced', llmSource: 'custom' }),
    ).toBe(false);
  });
});

describe('effectiveAsrSource', () => {
  const base: ApiConfig = { provider: 'free', voiceMode: 'free' };
  it('is api only in advanced mode', () => {
    expect(effectiveAsrSource({ ...base, voiceMode: 'free' })).toBe('browser');
    expect(effectiveAsrSource({ ...base, voiceMode: 'standard' })).toBe('browser');
    expect(effectiveAsrSource({ ...base, voiceMode: 'advanced' })).toBe('api');
  });
});

describe('effectiveTtsSource', () => {
  const base: ApiConfig = { provider: 'free', voiceMode: 'free' };
  it('is browser for free, api for standard/advanced', () => {
    expect(effectiveTtsSource({ ...base, voiceMode: 'free' })).toBe('browser');
    expect(effectiveTtsSource({ ...base, voiceMode: 'standard' })).toBe('api');
    expect(effectiveTtsSource({ ...base, voiceMode: 'advanced' })).toBe('api');
  });
});

describe('voiceModeLabel', () => {
  it('maps modes to Chinese labels', () => {
    expect(voiceModeLabel('free')).toBe('免费模式');
    expect(voiceModeLabel('standard')).toBe('标准模式');
    expect(voiceModeLabel('advanced')).toBe('高级模式');
  });
});
