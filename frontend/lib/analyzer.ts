// ============================================================
// analyzer.ts — Conversation Metrics & Honest Scoring
// ============================================================
// Pure, deterministic functions that derive transparent metrics
// from a practice session and turn them into 0-100 dimension
// scores. Used directly for the free-mode (no API key) report
// and to GROUND the LLM-based report so scores are evidence-based
// rather than hallucinated.
//
// Pronunciation/fluency are deliberately based on real signals
// (speech-recognition confidence + words-per-minute), and the
// report UI labels them honestly. No audio-level phoneme scoring
// is claimed.
// ============================================================

import {
  Session,
  Report,
  ReportDimensions,
  ReportError,
} from '@/types';

// ─── Stats ───────────────────────────────────────────────────

export interface ConversationStats {
  /** Number of user turns (utterances). */
  userTurns: number;
  /** Total words spoken by the user. */
  totalWords: number;
  /** Distinct word count (lowercased, length > 2). */
  uniqueWords: number;
  /** Average words per user turn. */
  avgWordsPerTurn: number;
  /** Type-token ratio scaled to 0-100. */
  vocabularyDiversity: number;
  /** Words per minute, or null when no duration data is available. */
  wpm: number | null;
  /** Mean STT recognition confidence (0-1), or null when unavailable. */
  avgConfidence: number | null;
  /** Number of corrections logged during the session. */
  correctionCount: number;
  /** Corrections per user turn. */
  errorRate: number;
  /** Total session duration in seconds. */
  durationSeconds: number;
}

const WORD_RE = /[a-zA-Z']+/g;

function wordsOf(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Derive transparent statistics from a completed session. */
export function analyzeConversation(session: Session): ConversationStats {
  const userMessages = session.messages.filter((m) => m.role === 'user');
  const userTurns = userMessages.length;

  const allWords: string[] = [];
  for (const m of userMessages) allWords.push(...wordsOf(m.content));
  const totalWords = allWords.length;

  const unique = new Set(
    allWords.map((w) => w.toLowerCase()).filter((w) => w.length > 2)
  );
  const uniqueWords = unique.size;

  const avgWordsPerTurn = userTurns > 0 ? totalWords / userTurns : 0;

  // Type-token ratio scaled. Longer transcripts naturally have a lower TTR,
  // so we scale generously and cap at 100.
  const ttr = totalWords > 0 ? uniqueWords / totalWords : 0;
  const vocabularyDiversity = clamp(Math.round(ttr * 180), 0, 100);

  // Words per minute, using captured per-utterance durations when present.
  const durations = userMessages
    .map((m) => m.durationMs)
    .filter((d): d is number => typeof d === 'number' && d > 0);
  let wpm: number | null = null;
  if (durations.length > 0) {
    const totalSpokenMs = durations.reduce((a, b) => a + b, 0);
    // Only words from utterances that had a measured duration.
    const wordsWithDuration = userMessages
      .filter((m) => typeof m.durationMs === 'number' && m.durationMs > 0)
      .reduce((acc, m) => acc + wordsOf(m.content).length, 0);
    const minutes = totalSpokenMs / 60000;
    if (minutes > 0) wpm = Math.round(wordsWithDuration / minutes);
  }

  // Mean recognition confidence across utterances that reported it.
  const confidences = userMessages
    .map((m) => m.confidence)
    .filter((c): c is number => typeof c === 'number' && c > 0);
  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : null;

  const correctionCount = session.corrections.length;
  const errorRate = userTurns > 0 ? correctionCount / userTurns : 0;

  const durationSeconds = session.endTime
    ? Math.max(0, Math.round((session.endTime - session.startTime) / 1000))
    : 0;

  return {
    userTurns,
    totalWords,
    uniqueWords,
    avgWordsPerTurn: Math.round(avgWordsPerTurn * 10) / 10,
    vocabularyDiversity,
    wpm,
    avgConfidence,
    correctionCount,
    errorRate: Math.round(errorRate * 100) / 100,
    durationSeconds,
  };
}

// ─── Heuristic scores (transparent) ──────────────────────────

/** Intelligibility from recognition confidence (0-1) → 0-100.
 *  When no confidence is available, returns a neutral 70. */
export function pronunciationScore(avgConfidence: number | null): number {
  if (avgConfidence == null) return 70;
  // Map a typical confidence range [0.55, 0.95] onto [55, 97].
  return clamp(Math.round(avgConfidence * 100), 40, 99);
}

/** Fluency from words-per-minute, peaking in a natural conversational band.
 *  Falls back to average-words-per-turn when WPM is unavailable. */
export function fluencyScore(
  wpm: number | null,
  avgWordsPerTurn: number
): number {
  if (wpm == null) {
    // Fallback: longer, fuller answers read as more fluent.
    return clamp(Math.round(50 + avgWordsPerTurn * 4), 45, 92);
  }
  // Comfortable conversational band ~ 100-150 wpm.
  if (wpm >= 100 && wpm <= 150) return clamp(90 + Math.round((150 - Math.abs(125 - wpm)) / 25), 88, 96);
  if (wpm < 100) return clamp(Math.round(55 + (wpm / 100) * 33), 45, 88);
  // Faster than 150: gently penalise rushing.
  return clamp(Math.round(92 - (wpm - 150) / 6), 60, 92);
}

/** Grammar from correction density. */
export function grammarScore(errorRate: number): number {
  return clamp(Math.round(95 - errorRate * 22), 45, 98);
}

/** Task completion from how sustained the conversation was. */
export function taskCompletionScore(userTurns: number): number {
  return clamp(50 + userTurns * 9, 50, 95);
}

// ─── Local report (free mode / no API key) ───────────────────

function dimensionFeedback(stats: ConversationStats) {
  const confText =
    stats.avgConfidence != null
      ? `语音识别平均置信度 ${(stats.avgConfidence * 100).toFixed(0)}%`
      : '本次未获取到识别置信度数据';
  const wpmText =
    stats.wpm != null ? `语速约 ${stats.wpm} 词/分钟` : `平均每轮 ${stats.avgWordsPerTurn} 个词`;
  return { confText, wpmText };
}

/**
 * Build a complete report locally, without any LLM call.
 * Used for free mode and as a fallback when the API is unavailable.
 */
export function buildLocalReport(session: Session): Report {
  const stats = analyzeConversation(session);
  const { confText, wpmText } = dimensionFeedback(stats);

  const pronunciation = pronunciationScore(stats.avgConfidence);
  const fluency = fluencyScore(stats.wpm, stats.avgWordsPerTurn);
  const vocabulary = stats.vocabularyDiversity;
  const grammar = grammarScore(stats.errorRate);
  const naturalness = clamp(Math.round((fluency + vocabulary) / 2), 40, 96);
  const taskCompletion = taskCompletionScore(stats.userTurns);

  const dimensions: ReportDimensions = {
    pronunciation: {
      score: pronunciation,
      feedback: `发音可懂度（${confText}）。该分数基于语音识别置信度，反映表达的清晰程度。`,
    },
    grammar: {
      score: grammar,
      feedback: `本次共记录 ${stats.correctionCount} 处纠错，错误密度 ${stats.errorRate} 处/轮。`,
    },
    vocabulary: {
      score: vocabulary,
      feedback: `使用了约 ${stats.uniqueWords} 个不同单词，词汇多样性 ${stats.vocabularyDiversity}/100。`,
    },
    fluency: {
      score: fluency,
      feedback: `流利度（${wpmText}）。`,
    },
    naturalness: {
      score: naturalness,
      feedback: '综合流利度与表达丰富度的估算。',
    },
    taskCompletion: {
      score: taskCompletion,
      feedback: `完成了 ${stats.userTurns} 轮对话。`,
    },
  };

  const overallScore = Math.round(
    pronunciation * 0.2 +
      grammar * 0.2 +
      vocabulary * 0.15 +
      fluency * 0.2 +
      naturalness * 0.1 +
      taskCompletion * 0.15
  );

  const errors: ReportError[] = session.corrections.map((c) => ({
    type: c.errorType,
    original: c.original,
    corrected: c.corrected,
    explanation: c.explanation,
    context: '',
  }));

  const suggestions = buildSuggestions(dimensions);

  return {
    id: `report-${session.id}`,
    sessionId: session.id,
    createdAt: Date.now(),
    overallScore,
    dimensions,
    errors,
    highlights: [],
    suggestions,
    keyVocabulary: [],
  };
}

/** Rule-based suggestions targeting the weakest dimensions. */
function buildSuggestions(dims: ReportDimensions): string[] {
  const entries: { key: keyof ReportDimensions; tip: string; score: number }[] = [
    { key: 'pronunciation', tip: '放慢语速、咬字清晰，可以提升发音的可懂度。', score: dims.pronunciation.score },
    { key: 'grammar', tip: '留意时态与主谓一致，复述正确表达有助于巩固。', score: dims.grammar.score },
    { key: 'vocabulary', tip: '尝试用同义词替换高频词，丰富词汇表达。', score: dims.vocabulary.score },
    { key: 'fluency', tip: '用完整句子作答、减少长停顿，可提升流利度。', score: dims.fluency.score },
    { key: 'taskCompletion', tip: '围绕场景目标多轮深入，把任务完整走完。', score: dims.taskCompletion.score },
  ];
  const weakest = entries.sort((a, b) => a.score - b.score).slice(0, 3).map((e) => e.tip);
  weakest.push('坚持每天练习，进步会体现在历史趋势里。');
  return weakest;
}
