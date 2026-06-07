import { describe, it, expect } from 'vitest';
import {
  analyzeConversation,
  buildLocalReport,
  pronunciationScore,
  fluencyScore,
  grammarScore,
  taskCompletionScore,
} from '@/lib/analyzer';
import { Session, Message, Correction } from '@/types';

function userMsg(
  content: string,
  extra: Partial<Message> = {},
): Message {
  return {
    id: Math.random().toString(36).slice(2),
    role: 'user',
    content,
    timestamp: Date.now(),
    ...extra,
  };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's1',
    scenarioId: 'job-interview',
    scenarioName: '求职面试',
    startTime: 0,
    endTime: 120000,
    messages: [],
    corrections: [],
    voiceMode: 'free',
    status: 'completed',
    ...overrides,
  };
}

describe('analyzeConversation', () => {
  it('computes stats from user turns with durations and confidence', () => {
    const session = makeSession({
      messages: [
        { id: 'a', role: 'assistant', content: 'Welcome!', timestamp: 0 },
        userMsg('Hello there friend', { durationMs: 2000, confidence: 0.9 }),
        userMsg('I would like coffee please', { durationMs: 2000, confidence: 0.8 }),
      ],
      corrections: [
        {
          id: 'c1',
          errorType: 'grammar',
          original: 'I would like coffee please',
          corrected: 'I would like a coffee, please',
          explanation: 'article',
          severity: 'minor',
        },
      ],
    });

    const stats = analyzeConversation(session);
    expect(stats.userTurns).toBe(2);
    expect(stats.totalWords).toBe(8);
    expect(stats.uniqueWords).toBe(7); // words with length > 2, lowercased
    expect(stats.avgWordsPerTurn).toBe(4);
    expect(stats.vocabularyDiversity).toBe(100); // ttr scaled & capped
    expect(stats.wpm).toBe(120); // 8 words over 4000ms
    expect(stats.avgConfidence).toBeCloseTo(0.85, 5);
    expect(stats.correctionCount).toBe(1);
    expect(stats.errorRate).toBe(0.5);
    expect(stats.durationSeconds).toBe(120);
  });

  it('handles a session with no user speech', () => {
    const stats = analyzeConversation(
      makeSession({
        messages: [{ id: 'a', role: 'assistant', content: 'Hi', timestamp: 0 }],
      }),
    );
    expect(stats.userTurns).toBe(0);
    expect(stats.totalWords).toBe(0);
    expect(stats.avgWordsPerTurn).toBe(0);
    expect(stats.wpm).toBeNull();
    expect(stats.avgConfidence).toBeNull();
    expect(stats.errorRate).toBe(0);
  });

  it('leaves wpm null when no durations are present', () => {
    const stats = analyzeConversation(
      makeSession({ messages: [userMsg('hello world test')] }),
    );
    expect(stats.wpm).toBeNull();
  });
});

describe('heuristic scores', () => {
  it('pronunciationScore maps confidence to 0-100, neutral when null', () => {
    expect(pronunciationScore(null)).toBe(70);
    expect(pronunciationScore(0.9)).toBe(90);
    expect(pronunciationScore(0.1)).toBe(40); // clamped low
    expect(pronunciationScore(1)).toBe(99); // clamped high
  });

  it('fluencyScore peaks in the conversational band and penalises rushing', () => {
    const comfortable = fluencyScore(125, 5);
    const slow = fluencyScore(40, 5);
    const fast = fluencyScore(220, 5);
    expect(comfortable).toBeGreaterThan(slow);
    expect(comfortable).toBeGreaterThan(fast);
    expect(comfortable).toBeLessThanOrEqual(96);
  });

  it('fluencyScore falls back to words-per-turn when wpm is null', () => {
    expect(fluencyScore(null, 0)).toBe(50);
    expect(fluencyScore(null, 10)).toBe(90);
    expect(fluencyScore(null, 100)).toBe(92); // clamped
  });

  it('grammarScore decreases with error rate', () => {
    expect(grammarScore(0)).toBe(95);
    expect(grammarScore(1)).toBeLessThan(grammarScore(0));
    expect(grammarScore(100)).toBe(45); // clamped floor
  });

  it('taskCompletionScore grows with turns and clamps', () => {
    expect(taskCompletionScore(0)).toBe(50);
    expect(taskCompletionScore(5)).toBe(95);
    expect(taskCompletionScore(100)).toBe(95); // clamped
  });
});

describe('buildLocalReport', () => {
  it('produces a complete, in-range report and maps corrections to errors', () => {
    const corrections: Correction[] = [
      {
        id: 'c1',
        errorType: 'grammar',
        original: 'He go',
        corrected: 'He goes',
        explanation: 'third person singular',
        severity: 'major',
      },
    ];
    const session = makeSession({
      messages: [
        userMsg('I really enjoy learning new things', {
          durationMs: 3000,
          confidence: 0.88,
        }),
        userMsg('Could you help me practice more', {
          durationMs: 3000,
          confidence: 0.82,
        }),
      ],
      corrections,
    });

    const report = buildLocalReport(session);
    expect(report.sessionId).toBe('s1');
    expect(report.overallScore).toBeGreaterThanOrEqual(0);
    expect(report.overallScore).toBeLessThanOrEqual(100);

    for (const key of [
      'pronunciation',
      'grammar',
      'vocabulary',
      'fluency',
      'naturalness',
      'taskCompletion',
    ] as const) {
      expect(report.dimensions[key].score).toBeGreaterThanOrEqual(0);
      expect(report.dimensions[key].score).toBeLessThanOrEqual(100);
    }

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({
      type: 'grammar',
      original: 'He go',
      corrected: 'He goes',
    });
    expect(report.suggestions.length).toBeGreaterThan(0);
  });
});
