import { NextRequest, NextResponse } from 'next/server';
import { listModels } from '@/lib/ai-providers/provider';
import { ApiConfig } from '@/types';

/**
 * Server-side proxy to fetch the list of available models for a provider.
 * The user's API key stays on the server and is never exposed to the client.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { config }: { config: ApiConfig } = body;

    if (!config) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    if (!config.apiKey) {
      return NextResponse.json({ error: 'API Key 未配置' }, { status: 400 });
    }

    const models = await listModels(config);
    return NextResponse.json({ models });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[API /models] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
