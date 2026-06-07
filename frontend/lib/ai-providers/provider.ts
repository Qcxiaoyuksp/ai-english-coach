import { ChatMessage, ChatResponse, ApiConfig } from '@/types';

/**
 * Normalize a user-provided OpenAI-compatible Base URL into a clean base that
 * the call layer can safely append `/chat/completions` or `/models` to.
 *
 * Accepts any of these shapes and returns the same base:
 *   https://api.x.com/v1
 *   https://api.x.com/v1/
 *   https://api.x.com/v1/chat
 *   https://api.x.com/v1/chat/completions
 */
export function normalizeBaseUrl(raw: string): string {
  let url = (raw || '').trim().replace(/\/+$/, '');
  // Strip a trailing endpoint path the user may have pasted in.
  url = url.replace(/\/(chat\/completions|completions|chat)$/i, '');
  return url;
}

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
  const baseUrl = normalizeBaseUrl(config.baseUrl || 'https://api.openai.com/v1');
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

// ─── Model Listing ───────────────────────────────────────────────────────────

/**
 * Fetch the list of available model ids for the configured provider, using the
 * user's API key. Runs server-side (see app/api/models/route.ts) so the key is
 * never exposed to the browser.
 */
export async function listModels(config: ApiConfig): Promise<string[]> {
  if (config.provider === 'gemini') {
    const baseUrl = normalizeBaseUrl(
      config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    );
    const response = await fetch(
      `${baseUrl}/models?key=${config.apiKey}`
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `Failed to list models: ${response.status}`
      );
    }
    const data = await response.json();
    return ((data.models as { name?: string }[]) || [])
      .map((m) => (m.name || '').replace(/^models\//, ''))
      .filter(Boolean);
  }

  // OpenAI-compatible: GET {base}/models. Some providers expose the list under
  // a versioned path (e.g. SiliconFlow needs `/v1/models`), so when the user's
  // Base URL has no explicit version segment we also try `{base}/v1/models`.
  const base = normalizeBaseUrl(config.baseUrl || 'https://api.openai.com/v1');
  const candidates = [base];
  if (!/\/v\d+[a-z]*$/i.test(base)) {
    candidates.push(`${base}/v1`);
  }

  let lastStatus = 0;
  let lastMessage = '';
  for (const candidate of candidates) {
    const response = await fetch(`${candidate}/models`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });

    if (response.ok) {
      const data = await response.json();
      // OpenAI shape: { data: [{ id }, ...] }. Some gateways use { models: [...] }.
      const raw = (data.data || data.models || []) as {
        id?: string;
        name?: string;
      }[];
      return raw
        .map((m) => m.id || m.name || '')
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    }

    // Auth/permission errors won't be fixed by trying another path — surface now.
    if (response.status === 401 || response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.error?.message || `API Key 无效或无权限 (${response.status})`,
      );
    }

    lastStatus = response.status;
    const errorData = await response.json().catch(() => ({}));
    lastMessage = errorData.error?.message || '';
  }

  throw new Error(
    lastMessage ||
      `无法获取模型列表 (${lastStatus})。该提供商可能不支持模型列表接口，请手动填写模型名称。`,
  );
}
