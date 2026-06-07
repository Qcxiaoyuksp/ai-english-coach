import { describe, it, expect } from 'vitest';
import { sanitizeSpokenReply, buildSystemPrompt } from '@/lib/prompts';

describe('sanitizeSpokenReply', () => {
  it('leaves a normal reply unchanged (whitespace collapsed)', () => {
    expect(sanitizeSpokenReply('Great, may I have your name?')).toBe(
      'Great, may I have your name?',
    );
  });

  it('strips a trailing inline provide_correction JSON blob', () => {
    const raw =
      'Great, may I have your name or confirmation number? { "function": "provide_correction", "params": { "user_mistake": "repetition", "correction": "reservation", "explanation": "..." } }';
    expect(sanitizeSpokenReply(raw)).toBe(
      'Great, may I have your name or confirmation number?',
    );
  });

  it('removes fenced code blocks', () => {
    const raw = 'Sure, here you go. ```json\n{"a":1}\n``` Anything else?';
    const out = sanitizeSpokenReply(raw);
    expect(out).not.toContain('```');
    expect(out).not.toContain('{"a":1}');
    expect(out.startsWith('Sure, here you go.')).toBe(true);
  });

  it('cuts a JSON object that mentions a correction field', () => {
    const raw = 'Nice. {"correction": "reservation"}';
    expect(sanitizeSpokenReply(raw)).toBe('Nice.');
  });

  it('returns empty string for empty/whitespace input', () => {
    expect(sanitizeSpokenReply('')).toBe('');
    expect(sanitizeSpokenReply('   \n  ')).toBe('');
  });
});

describe('buildSystemPrompt', () => {
  it('appends the coaching strategy to the scenario prompt', () => {
    const out = buildSystemPrompt('You are a hotel receptionist.');
    expect(out.startsWith('You are a hotel receptionist.')).toBe(true);
    expect(out).toContain('provide_correction');
  });
});
