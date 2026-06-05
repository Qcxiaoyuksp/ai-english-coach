import { NextRequest, NextResponse } from 'next/server';
import { chatWithProvider } from '@/lib/ai-providers/provider';
import { ApiConfig, ChatMessage } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      config,
      messages,
      maxTokens,
      temperature,
      tools,
    }: {
      config: ApiConfig;
      messages: ChatMessage[];
      maxTokens?: number;
      temperature?: number;
      tools?: unknown[];
    } = body;

    if (!config || !messages || messages.length === 0) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (!config.apiKey) {
      return NextResponse.json(
        { error: 'API Key 未配置' },
        { status: 400 }
      );
    }

    const result = await chatWithProvider(config, messages, {
      maxTokens,
      temperature,
      tools,
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /chat] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
