import { ChatMessage, ChatResponse, ApiConfig } from '@/types';

/**
 * Creates an AI chat completion based on the configured provider.
 * Supports: OpenAI, Gemini, DeepSeek, Groq, and any OpenAI-compatible API.
 */
export async function chatWithProvider(
  config: ApiConfig,
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; tools?: unknown[] }
): Promise<ChatResponse> {
  if (config.provider === 'gemini') {
    return chatWithGemini(config, messages, options);
  }
  // OpenAI, DeepSeek, Groq, and openai-compatible all use OpenAI format
  return chatWithOpenAICompatible(config, messages, options);
}

// ─── OpenAI-Compatible API ───────────────────────────────────────────────────

async function chatWithOpenAICompatible(
  config: ApiConfig,
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; tools?: unknown[] }
): Promise<ChatResponse> {
  const baseUrl = (config.baseUrl || 'https://api.openai.com/v1').replace(
    /\/$/,
    ''
  );
  const model = config.model || 'gpt-4o-mini';

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.8,
    max_tokens: options?.maxTokens ?? 1024,
  };

  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `API request failed: ${response.status}`
    );
  }

  const data = await response.json();
  const choice = data.choices?.[0];

  const result: ChatResponse = {
    content: choice?.message?.content || '',
  };

  if (choice?.message?.tool_calls) {
    result.toolCalls = choice.message.tool_calls.map(
      (tc: { function: { name: string; arguments: string } }) => ({
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })
    );
  }

  return result;
}

// ─── Google Gemini API ───────────────────────────────────────────────────────

async function chatWithGemini(
  config: ApiConfig,
  messages: ChatMessage[],
  options?: { maxTokens?: number; temperature?: number; tools?: unknown[] }
): Promise<ChatResponse> {
  const model = config.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`;

  // Convert messages to Gemini format
  const systemInstruction = messages.find((m) => m.role === 'system');
  const conversationMessages = messages.filter((m) => m.role !== 'system');

  const contents = conversationMessages.map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: options?.temperature ?? 0.8,
      maxOutputTokens: options?.maxTokens ?? 1024,
    },
  };

  if (systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: systemInstruction.content }],
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Gemini API failed: ${response.status}`
    );
  }

  const data = await response.json();
  const content =
    data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  return { content };
}
