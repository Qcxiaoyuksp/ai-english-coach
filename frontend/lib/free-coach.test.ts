import { describe, it, expect } from 'vitest';
import { generateFreeReply } from '@/lib/free-coach';
import { Scenario } from '@/types';

function scenario(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 'job-interview',
    name: 'Job Interview',
    nameZh: '求职面试',
    icon: '💼',
    description: '',
    descriptionZh: '',
    difficulty: 'intermediate',
    estimatedMinutes: 10,
    systemPrompt: '',
    starterMessage: '',
    keyVocabulary: ['experience', 'strength'],
    isCustom: false,
    ...overrides,
  };
}

describe('generateFreeReply', () => {
  it('advances the scenario flow on a statement', () => {
    const reply = generateFreeReply({
      scenario: scenario(),
      userText: 'I am good at solving problems',
      turnIndex: 0,
    });
    expect(reply).toBe(
      'Thanks for that. Could you walk me through your most relevant experience?',
    );
  });

  it('progresses to the next flow line as turnIndex increases', () => {
    const r0 = generateFreeReply({ scenario: scenario(), userText: 'ok', turnIndex: 0 });
    const r1 = generateFreeReply({ scenario: scenario(), userText: 'ok', turnIndex: 1 });
    expect(r0).not.toBe(r1);
  });

  it('answers from the question pool when the user asks a question', () => {
    const reply = generateFreeReply({
      scenario: scenario(),
      userText: 'What is the salary?',
      turnIndex: 0,
    });
    expect(reply).toBe(
      'Good question. We really value teamwork and initiative here. Now, back to you —',
    );
  });

  it('detects questions without a question mark via leading wh-/aux words', () => {
    const reply = generateFreeReply({
      scenario: scenario(),
      userText: 'can you tell me about the team',
      turnIndex: 0,
    });
    // A question-pool reply, not a flow line.
    expect(reply.startsWith('Good question')).toBe(true);
  });

  it('acknowledges scenario key vocabulary on statements', () => {
    const reply = generateFreeReply({
      scenario: scenario(),
      userText: 'I have a lot of experience in this field',
      turnIndex: 0,
    });
    expect(reply.startsWith('Nice use of "experience".')).toBe(true);
  });

  it('does not prefix vocab acknowledgement on questions', () => {
    const reply = generateFreeReply({
      scenario: scenario(),
      userText: 'What experience do you need?',
      turnIndex: 0,
    });
    expect(reply.startsWith('Nice use of')).toBe(false);
  });

  it('falls back to a generic flow for unknown scenarios', () => {
    const reply = generateFreeReply({
      scenario: scenario({ id: 'totally-unknown', keyVocabulary: [] }),
      userText: 'I think it went well',
      turnIndex: 0,
    });
    expect(reply).toBe('Could you tell me a bit more about that?');
  });

  it('clamps the flow index to the last line for long conversations', () => {
    const reply = generateFreeReply({
      scenario: scenario(),
      userText: 'thanks',
      turnIndex: 999,
    });
    expect(reply).toBe("Thank you — that's all from my side. You did well!");
  });
});
