import { NextRequest, NextResponse } from 'next/server';
import { chatWithProvider } from '@/lib/ai-providers/provider';
import { ApiConfig, ChatMessage, ProviderType } from '@/types';

/**
 * Build the server-side config for Free mode from environment variables.
 * Returns null when no built-in key is configured (caller should then fall
 * back to local scripted replies). The key lives only on the server and is
 * never sent to the browser.
 */
function getFreeModeConfig(): ApiConfig | null {
  const apiKey = process.env.FREE_LLM_API_KEY;
  if (!apiKey) return null;
  return {
    provider: (process.env.FREE_LLM_PROVIDER as ProviderType) || 'zhipu',
    apiKey,
    baseUrl:
      process.env.FREE_LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
    model: process.env.FREE_LLM_MODEL || 'glm-4.5-air',
    voiceMode: 'free',
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      config,
      messages,
      maxTokens,
      temperature,
      tools,
      useServerKey,
    }: {
      config: ApiConfig;
      messages: ChatMessage[];
      maxTokens?: number;
      temperature?: number;
      tools?: unknown[];
      useServerKey?: boolean;
    } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // Free mode: use the server-side built-in key (never trust a client key here).
    let effectiveConfig: ApiConfig;
    if (useServerKey) {
      const freeConfig = getFreeModeConfig();
      if (!freeConfig) {
        // Signals the client to fall back to local scripted replies.
        return NextResponse.json(
          { error: 'FREE_MODE_UNAVAILABLE' },
          { status: 503 }
        );
      }
      effectiveConfig = freeConfig;
    } else {
      if (!config) {
        return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
      }
      if (!config.apiKey) {
        return NextResponse.json({ error: 'API Key 未配置' }, { status: 400 });
      }
      effectiveConfig = config;
    }

    const result = await chatWithProvider(effectiveConfig, messages, {
      maxTokens,
      temperature,
      tools,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /chat] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
