import { NextRequest, NextResponse } from 'next/server';
import { chatWithProvider } from '@/lib/ai-providers/provider';
import { ApiConfig, Session } from '@/types';
import { ConversationStats } from '@/lib/analyzer';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      config,
      session,
      stats,
    }: { config: ApiConfig; session: Session; stats?: ConversationStats } = body;

    if (!config?.apiKey || !session) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // Build the analysis prompt
    const conversationText = session.messages
      .map((m) => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`)
      .join('\n');

    // Objective, client-measured metrics that ground the scoring.
    const metricsText = stats
      ? `MEASURED METRICS (objective, computed from the session — use these as evidence, do NOT contradict them):
- User turns: ${stats.userTurns}
- Total words: ${stats.totalWords}, unique words: ${stats.uniqueWords}
- Avg words/turn: ${stats.avgWordsPerTurn}
- Words per minute: ${stats.wpm ?? 'unknown'}
- Mean speech-recognition confidence: ${stats.avgConfidence != null ? (stats.avgConfidence * 100).toFixed(0) + '%' : 'unknown'}
- Corrections logged: ${stats.correctionCount} (error rate ${stats.errorRate}/turn)
`
      : '';

    const analysisPrompt = `Analyze the following English speaking practice conversation and provide a structured assessment.

${metricsText}
CONVERSATION:
${conversationText}

Scoring guidance:
- "pronunciation" and "fluency" are measured objectively from audio/timing on the client; base those scores on the MEASURED METRICS above (confidence → pronunciation, words-per-minute → fluency), not guesswork.
- Judge "grammar", "vocabulary", "naturalness", and "taskCompletion" from the conversation text.

Please provide your analysis in the following JSON format (respond ONLY with the JSON, no markdown):
{
  "overallScore": <number 0-100>,
  "dimensions": {
    "pronunciation": { "score": <number>, "feedback": "<feedback in Chinese>" },
    "grammar": { "score": <number>, "feedback": "<feedback in Chinese>" },
    "vocabulary": { "score": <number>, "feedback": "<feedback in Chinese>" },
    "fluency": { "score": <number>, "feedback": "<feedback in Chinese>" },
    "naturalness": { "score": <number>, "feedback": "<feedback in Chinese>" },
    "taskCompletion": { "score": <number>, "feedback": "<feedback in Chinese>" }
  },
  "errors": [
    {
      "type": "grammar|expression|vocabulary",
      "original": "<what user said>",
      "corrected": "<correct version>",
      "explanation": "<explanation in Chinese>"
    }
  ],
  "suggestions": ["<suggestion in Chinese>", ...],
  "keyVocabulary": [
    { "word": "<word>", "definition": "<definition>", "example": "<example sentence>" }
  ]
}

Assessment guidelines:
- Be thorough but encouraging
- Score fairly based on the user's actual performance
- Focus suggestions on the most impactful improvements
- Write all feedback and suggestions in Chinese
- Write vocabulary definitions and examples in English`;

    const response = await chatWithProvider(config, [
      { role: 'user', content: analysisPrompt },
    ], {
      temperature: 0.3,
      maxTokens: 2000,
    });

    // Parse the AI response as JSON
    try {
      let content = response.content.trim();
      // Remove markdown code blocks if present
      if (content.startsWith('```')) {
        content = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
      }
      const analysis = JSON.parse(content);
      return NextResponse.json(analysis);
    } catch {
      // If JSON parsing fails, return raw suggestions
      return NextResponse.json({
        suggestions: [
          '继续练习，保持对话的流畅性',
          '多关注常见语法结构的正确使用',
          '尝试使用更丰富的词汇表达',
        ],
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /analyze] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
