// ============================================================
// FeedbackBubble — Real-time Correction Bubbles
// ============================================================
// Non-intrusive floating bubbles that surface live grammar /
// expression / vocabulary corrections during a conversation.
// Shows the most recent corrections (newest at the bottom) so
// the learner — and reviewers — can read them without the
// bubbles vanishing too quickly. All corrections are also
// persisted on the session for the post-practice report.
// ============================================================

'use client';

import { Correction } from '@/types';

interface FeedbackBubbleProps {
  corrections: Correction[];
  /** How many recent corrections to keep visible at once. */
  maxVisible?: number;
}

const ERROR_TYPE_LABELS: Record<
  Correction['errorType'],
  { icon: string; label: string }
> = {
  grammar: { icon: '🔤', label: '语法' },
  expression: { icon: '🗣️', label: '表达' },
  vocabulary: { icon: '📝', label: '用词' },
};

export default function FeedbackBubble({
  corrections,
  maxVisible = 3,
}: FeedbackBubbleProps) {
  const visible = corrections.slice(-maxVisible);

  if (visible.length === 0) return null;

  return (
    <div className="practice-corrections" aria-live="polite">
      {visible.map((c) => {
        const typeInfo =
          ERROR_TYPE_LABELS[c.errorType] ?? { icon: '📝', label: c.errorType };
        return (
          <div key={c.id} className="correction-bubble animate-fade-in-up">
            <div className="correction-type">
              {typeInfo.icon} {typeInfo.label}
            </div>
            <div className="correction-original">
              ❌ <s>{c.original}</s>
            </div>
            <div className="correction-corrected">✅ {c.corrected}</div>
            {c.explanation && (
              <div className="correction-explanation">{c.explanation}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
