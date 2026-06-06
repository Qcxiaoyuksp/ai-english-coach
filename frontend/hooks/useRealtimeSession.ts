// ============================================================
// useRealtimeSession — OpenAI Realtime API Hook (Placeholder)
// ============================================================
// Placeholder hook for the OpenAI Realtime API WebRTC mode.
// This will be fully implemented when the Realtime API
// integration is added. Currently returns a noop interface.
// ============================================================

'use client';

import { Message } from '@/types';

export interface UseRealtimeSessionReturn {
  isSupported: boolean;
  isConnected: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  messages: Message[];
}

/**
 * Placeholder for OpenAI Realtime API integration.
 * Returns a stub interface indicating the feature is not yet available.
 */
export function useRealtimeSession(): UseRealtimeSessionReturn {
  return {
    isSupported: false,
    isConnected: false,
    connect: async () => {
      console.warn('[useRealtimeSession] OpenAI Realtime API is not yet implemented.');
    },
    disconnect: () => {},
    messages: [],
  };
}
