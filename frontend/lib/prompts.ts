// ============================================================
// prompts.ts — System prompt helpers & correction tooling
// ============================================================
// Centralizes the AI correction strategy and the OpenAI-style
// function-calling tool used to surface real-time corrections
// during a conversation, without interrupting the dialogue flow.
// ============================================================

/**
 * OpenAI-compatible function-calling tool definition for corrections.
 *
 * NOTE: This is already wrapped in the `{ type: 'function', function: {...} }`
 * shape expected by the OpenAI / DeepSeek `/chat/completions` `tools` field,
 * because `provider.ts` forwards `options.tools` to the request body as-is.
 */
export const CORRECTION_TOOL = {
  type: 'function',
  function: {
    name: 'provide_correction',
    description:
      "Call this function when the user makes a NOTABLE English grammar, vocabulary, or expression mistake. Use it to log a gentle correction. Do NOT call it for trivial/stylistic issues, and never call it more than once per user turn. Calling this must NOT stop you from also replying naturally in the conversation.",
    parameters: {
      type: 'object',
      properties: {
        error_type: {
          type: 'string',
          enum: ['grammar', 'expression', 'vocabulary'],
          description:
            "Type of mistake: 'grammar' (tense, agreement, articles...), 'expression' (unnatural phrasing), or 'vocabulary' (wrong word choice).",
        },
        original: {
          type: 'string',
          description: "The user's original incorrect phrase, quoted verbatim.",
        },
        corrected: {
          type: 'string',
          description: 'The corrected, natural version of the phrase.',
        },
        explanation: {
          type: 'string',
          description:
            'A short, friendly explanation of the fix, written in Simplified Chinese (简体中文).',
        },
      },
      required: ['error_type', 'original', 'corrected', 'explanation'],
    },
  },
} as const;

/**
 * Correction-strategy instructions appended to each scenario's system prompt.
 * Ensures the model keeps the conversation natural while optionally logging
 * a correction via the provide_correction tool.
 */
export const CORRECTION_STRATEGY = `

--- ENGLISH COACHING INSTRUCTIONS ---
You are also a supportive English speaking coach. Follow these rules:
- ALWAYS keep replying naturally and stay in character. Your spoken reply must NEVER be empty.
- If the user makes a NOTABLE grammar, vocabulary, or expression mistake, ALSO call the "provide_correction" function to log it (in addition to your natural reply).
- Be encouraging, never lecture, and never stop the conversation just to correct.
- Correct at most ONE notable error per user turn. Ignore tiny/stylistic imperfections.
- Keep your spoken replies concise (1-3 sentences) so the conversation stays snappy.
- Write correction explanations in Simplified Chinese; keep the spoken conversation in English.`;

/**
 * Build the full system prompt for a scenario, including the coaching strategy.
 */
export function buildSystemPrompt(scenarioSystemPrompt: string): string {
  return `${scenarioSystemPrompt}${CORRECTION_STRATEGY}`;
}
