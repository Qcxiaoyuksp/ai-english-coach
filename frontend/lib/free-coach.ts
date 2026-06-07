// ============================================================
// free-coach.ts — Offline reply generator for Free mode
// ============================================================
// Free mode runs without any LLM API key, so replies are produced
// locally. Instead of cycling through a handful of generic lines,
// this builds a context-aware reply by:
//   1. walking through a per-scenario conversation flow so the
//      dialogue actually progresses;
//   2. branching on a simple statement-vs-question intent check;
//   3. acknowledging the user's use of scenario key vocabulary.
// It can't truly "understand" the user, but it stays on-topic and
// feels far less robotic than a fixed loop.
// ============================================================

import { Scenario } from '@/types';

export interface FreeReplyInput {
  scenario: Scenario;
  /** The user's latest utterance. */
  userText: string;
  /** 0-based index of this free reply within the session (drives progression). */
  turnIndex: number;
}

// ─── Per-scenario flows (statements advance the conversation) ────────────────
const SCENARIO_FLOWS: Record<string, string[]> = {
  'job-interview': [
    'Thanks for that. Could you walk me through your most relevant experience?',
    'Great. Can you tell me about a challenge you faced and how you handled it?',
    'I see. What would you say is your greatest strength?',
    'Good. Why are you interested in this position?',
    'Makes sense. Do you have any questions about the role or the company?',
    "Thank you — that's all from my side. You did well!",
  ],
  'restaurant-ordering': [
    'Great choice! Would you like anything to drink with that?',
    'Sure. Can I get you any starters or sides?',
    'Noted. Do you have any allergies or dietary requirements?',
    'Perfect. Would you like to hear about our desserts?',
    "Of course. I'll bring the bill whenever you're ready.",
    'Thank you for dining with us — enjoy your meal!',
  ],
  'hotel-checkin': [
    'Thank you. May I have your name or confirmation number, please?',
    'Got it. Could I see your ID and a payment method?',
    'Perfect. Breakfast is from 7 to 10 AM on the second floor.',
    'Sure. The Wi-Fi password is GrandPark2024. Do you need help with luggage?',
    'Wonderful. Check-out is at noon — enjoy your stay!',
  ],
  'customer-service': [
    'I\u2019m sorry to hear that. Could you give me your order number?',
    'Thank you. Can you describe the issue in a bit more detail?',
    'I understand — that must be frustrating. Let me see what I can do.',
    'I can offer you a refund or a replacement. Which would you prefer?',
    'All set. Is there anything else I can help you with?',
    'Thank you for your patience. Have a great day!',
  ],
  'business-meeting': [
    "Thanks for sharing. What's your view on the timeline?",
    'Good point. How do you think we should allocate the budget?',
    'I see. Which marketing channels do you think work best?',
    'Interesting. What risks should we plan for?',
    "Great input. Let's note that as an action item.",
    "Thanks, everyone — let's wrap up here.",
  ],
  'airport-travel': [
    'Thank you. How many bags will you be checking in today?',
    'Got it. Would you prefer a window or an aisle seat?',
    "Perfect. Here's your boarding pass — your gate is 15.",
    'Boarding starts at 2:30 PM. Do you need directions to security?',
    'All set. Have a pleasant flight!',
  ],
};

// ─── Per-scenario answers (used when the user asks a question) ───────────────
const SCENARIO_QUESTION_REPLIES: Record<string, string[]> = {
  'job-interview': [
    'Good question. We really value teamwork and initiative here. Now, back to you —',
    'Sure — the role works closely with several teams. But tell me,',
    "Happy to go into detail later. For now, let's continue:",
  ],
  'restaurant-ordering': [
    "I'd recommend the grilled salmon — it's very popular. What do you think?",
    'That dish comes with a side salad. Would you like it?',
    'Of course, we can adjust that for you. Anything else?',
  ],
  'hotel-checkin': [
    'Yes, we have a pool, gym, and spa on site. Would you like directions?',
    'Of course — room service is available 24/7. Anything else?',
    'Certainly, I can arrange that for you. Shall I go ahead?',
  ],
  'customer-service': [
    'Good question — our return policy covers 30 days. Does that help?',
    'Let me check that for you. Could you confirm your order number?',
    'Yes, we can do that. Would you like me to go ahead?',
  ],
  'business-meeting': [
    "Good question. I'd lean toward a phased rollout — what do you think?",
    "Let's align on that. From your side, what would you prioritize?",
    "That's worth discussing. What's your recommendation?",
  ],
  'airport-travel': [
    'Yes, your gate is number 15, just past security. Anything else?',
    'Boarding begins at 2:30 PM. Would you like directions?',
    'Sure, the lounge is on the upper level. Shall I point you there?',
  ],
};

const GENERIC_FLOW: string[] = [
  'Could you tell me a bit more about that?',
  'Interesting — why do you think so?',
  'I see. How would you handle it differently?',
  'That makes sense. Can you give me an example?',
  'Good point. What happened next?',
  "Let's dig a little deeper — what's the hardest part for you?",
];

const GENERIC_QUESTION_REPLIES: string[] = [
  "That's a great question. What do you think?",
  "Good question — I'd say it depends. How would you approach it?",
  "Let me turn that around: what's your take on it?",
];

/** Heuristic: does the utterance look like a question? */
function isQuestion(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (t.endsWith('?')) return true;
  return /^(who|what|when|where|why|how|which|whose|can|could|would|will|do|does|did|are|is|am|was|were|may|might|should|shall|have|has)\b/.test(
    t,
  );
}

/** Find a scenario key-vocabulary term the user actually used, if any. */
function matchedVocab(text: string, scenario: Scenario): string | null {
  const lower = text.toLowerCase();
  for (const term of scenario.keyVocabulary || []) {
    if (term.length >= 3 && lower.includes(term.toLowerCase())) {
      return term;
    }
  }
  return null;
}

function pick(pool: string[], index: number): string {
  if (pool.length === 0) return '';
  return pool[Math.min(index, pool.length - 1)];
}

/**
 * Generate a free-mode reply for the user's latest utterance.
 */
export function generateFreeReply({
  scenario,
  userText,
  turnIndex,
}: FreeReplyInput): string {
  const question = isQuestion(userText);

  let reply: string;
  if (question) {
    const pool =
      SCENARIO_QUESTION_REPLIES[scenario.id] ?? GENERIC_QUESTION_REPLIES;
    reply = pool[turnIndex % pool.length];
  } else {
    const flow = SCENARIO_FLOWS[scenario.id] ?? GENERIC_FLOW;
    reply = pick(flow, turnIndex);
  }

  // Acknowledge good vocabulary use on statements (keeps the coaching flavor
  // without garbling grammar by echoing raw user words).
  if (!question) {
    const term = matchedVocab(userText, scenario);
    if (term) {
      reply = `Nice use of "${term}". ${reply}`;
    }
  }

  return reply;
}
