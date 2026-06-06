// ============================================================
// useVoiceSession — Core Voice Session Hook
// ============================================================
// Manages the entire conversation lifecycle: speech recognition,
// AI response generation, TTS playback, message history, and
// session timing. Supports free/standard/realtime modes.
// ============================================================

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useWebSpeech } from './useWebSpeech';
import {
  Message,
  Scenario,
  ApiConfig,
  VoiceSessionState,
  ChatMessage,
  Correction,
  Session,
} from '@/types';
import { CORRECTION_TOOL, buildSystemPrompt } from '@/lib/prompts';
import { saveSession } from '@/lib/storage';

// ─── Free-mode built-in responses ────────────────────────────
const FREE_RESPONSES = [
  "That's a great point! Could you tell me more about that?",
  "I see what you mean. How would you handle that situation differently?",
  "Interesting! Let me ask you another question about this topic.",
  "That's a good answer. Let's move on to the next topic.",
  "Could you elaborate on that a bit more?",
  "Very well said! Now, let me ask you something else.",
  "I appreciate your response. What else can you share?",
  "Good thinking! Here's a follow-up question for you.",
];

export interface UseVoiceSessionReturn {
  startSession: () => void;
  endSession: () => string | null;
  toggleListening: () => void;
  stopAI: () => void;
  messages: Message[];
  corrections: Correction[];
  sessionState: VoiceSessionState;
  isActive: boolean;
  interimTranscript: string;
  elapsedSeconds: number;
  isSupported: boolean;
  micPermission: string;
  requestMicPermission: () => Promise<string>;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

function loadApiConfig(): ApiConfig {
  if (typeof window === 'undefined') {
    return { provider: 'free', voiceMode: 'free' };
  }
  try {
    const saved = localStorage.getItem('api-config');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { provider: 'free', voiceMode: 'free' };
}

export function useVoiceSession(scenario: Scenario): UseVoiceSessionReturn {
  const webSpeech = useWebSpeech();

  const [messages, setMessages] = useState<Message[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [sessionState, setSessionState] = useState<VoiceSessionState>('idle');
  const [isActive, setIsActive] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Derive interim transcript directly from webSpeech state (no setState in effect)
  const interimTranscript =
    !webSpeech.isTranscriptFinal && webSpeech.state === 'listening'
      ? webSpeech.transcript
      : '';

  const configRef = useRef<ApiConfig>(loadApiConfig());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const freeResponseIdx = useRef(0);
  const isProcessingRef = useRef(false);
  const messagesRef = useRef(messages);
  const correctionsRef = useRef(corrections);
  const startTimeRef = useRef<number>(0);
  const listenStartRef = useRef<number>(0);
  const scenarioRef = useRef(scenario);
  const handleUserMessageRef = useRef<((text: string, meta?: { confidence?: number; durationMs?: number }) => Promise<void>) | null>(null);

  // Keep refs in sync via effects
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    correctionsRef.current = corrections;
  }, [corrections]);

  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  // ─── Timer ─────────────────────────────────────────────────
  useEffect(() => {
    if (isActive) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive]);

  // ─── Handle user message ───────────────────────────────────
  const handleUserMessage = useCallback(
    async (text: string, meta?: { confidence?: number; durationMs?: number }) => {
      if (isProcessingRef.current) return;
      isProcessingRef.current = true;

      webSpeech.stopListening();
      setSessionState('processing');

      // Add user message
      const userMsg: Message = {
        id: generateId(),
        role: 'user',
        content: text,
        timestamp: Date.now(),
        confidence: meta?.confidence,
        durationMs: meta?.durationMs,
      };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const config = configRef.current;
        let aiResponse: string;

        if (config.voiceMode === 'free' || !config.apiKey) {
          // Free mode: use simple built-in responses
          await new Promise((r) => setTimeout(r, 800));
          aiResponse = FREE_RESPONSES[freeResponseIdx.current % FREE_RESPONSES.length];
          freeResponseIdx.current++;
        } else {
          // Standard mode: call LLM API with the correction tool enabled
          const chatMessages = buildChatMessages(messagesRef.current, userMsg, scenarioRef.current);
          const result = await callChatAPI(config, chatMessages, [CORRECTION_TOOL]);
          aiResponse = result.content;

          // Handle corrections from tool calls
          if (result.toolCalls) {
            for (const tc of result.toolCalls) {
              if (tc.name === 'provide_correction') {
                const correction: Correction = {
                  id: generateId(),
                  errorType: tc.arguments.error_type as Correction['errorType'],
                  original: tc.arguments.original as string,
                  corrected: tc.arguments.corrected as string,
                  explanation: tc.arguments.explanation as string,
                  severity: 'major',
                };
                setCorrections((prev) => [...prev, correction]);
              }
            }
          }

          // Fallback: some models return ONLY a tool call with empty content.
          // Make one more call without tools so the conversation still flows.
          if (!aiResponse.trim() && result.toolCalls && result.toolCalls.length > 0) {
            const followUp = await callChatAPI(config, chatMessages);
            aiResponse = followUp.content;
          }

          // Last-resort safety so TTS always has something to say.
          if (!aiResponse.trim()) {
            aiResponse = 'Got it. Please, go on.';
          }
        }

        // Add AI message
        const aiMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: aiResponse,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, aiMsg]);

        // Speak the AI response
        setSessionState('speaking');
        const ttsRate = config.ttsRate ?? 1.0;
        await webSpeech.speak(aiResponse, { rate: ttsRate });

        setSessionState('idle');
      } catch (error) {
        console.error('[useVoiceSession] Error:', error);
        const errorMsg: Message = {
          id: generateId(),
          role: 'assistant',
          content: "I'm sorry, I encountered an error. Could you repeat that?",
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setSessionState('idle');
      } finally {
        isProcessingRef.current = false;
      }
    },
    [webSpeech],
  );

  // Keep the ref in sync via effect
  useEffect(() => {
    handleUserMessageRef.current = handleUserMessage;
  }, [handleUserMessage]);

  // ─── Handle final transcript → send to AI ─────────────────
  useEffect(() => {
    if (webSpeech.isTranscriptFinal && webSpeech.transcript && !isProcessingRef.current) {
      const userText = webSpeech.transcript.trim();
      if (userText) {
        const meta = {
          confidence: webSpeech.confidence,
          durationMs: listenStartRef.current
            ? Date.now() - listenStartRef.current
            : undefined,
        };
        handleUserMessageRef.current?.(userText, meta);
      }
    }
  }, [webSpeech.isTranscriptFinal, webSpeech.transcript, webSpeech.confidence]);

  // ─── Start session ─────────────────────────────────────────
  const startSession = useCallback(async () => {
    configRef.current = loadApiConfig();
    setMessages([]);
    setCorrections([]);
    setElapsedSeconds(0);
    setSessionState('idle');
    setIsActive(true);
    isProcessingRef.current = false;
    startTimeRef.current = Date.now();

    const starterMsg: Message = {
      id: generateId(),
      role: 'assistant',
      content: scenario.starterMessage,
      timestamp: Date.now(),
    };
    setMessages([starterMsg]);

    // Speak the starter message
    setSessionState('speaking');
    const ttsRate = configRef.current.ttsRate ?? 1.0;
    await webSpeech.speak(scenario.starterMessage, { rate: ttsRate });
    setSessionState('idle');
  }, [scenario, webSpeech]);

  // ─── End session ───────────────────────────────────────────
  // Persists the completed session and returns its id (or null if
  // there was nothing worth saving — e.g. the user never spoke).
  const endSession = useCallback((): string | null => {
    webSpeech.stopListening();
    webSpeech.stopSpeaking();
    setIsActive(false);
    setSessionState('idle');
    isProcessingRef.current = false;

    const finalMessages = messagesRef.current;
    const hasUserSpeech = finalMessages.some((m) => m.role === 'user');
    if (!hasUserSpeech) return null;

    const sc = scenarioRef.current;
    const session: Session = {
      id: generateId(),
      scenarioId: sc.id,
      scenarioName: sc.nameZh || sc.name,
      startTime: startTimeRef.current || finalMessages[0]?.timestamp || Date.now(),
      endTime: Date.now(),
      messages: finalMessages,
      corrections: correctionsRef.current,
      voiceMode: configRef.current.voiceMode,
      status: 'completed',
    };

    try {
      saveSession(session);
    } catch (err) {
      console.error('[useVoiceSession] Failed to save session:', err);
      return null;
    }
    return session.id;
  }, [webSpeech]);

  // ─── Toggle listening ──────────────────────────────────────
  const toggleListening = useCallback(() => {
    if (sessionState === 'speaking' || sessionState === 'processing') return;

    if (webSpeech.isListening) {
      webSpeech.stopListening();
      setSessionState('idle');
    } else {
      webSpeech.startListening();
      listenStartRef.current = Date.now();
      setSessionState('listening');
    }
  }, [sessionState, webSpeech]);

  // ─── Stop AI ───────────────────────────────────────────────
  const stopAI = useCallback(() => {
    webSpeech.stopSpeaking();
    setSessionState('idle');
  }, [webSpeech]);

  return {
    startSession,
    endSession,
    toggleListening,
    stopAI,
    messages,
    corrections,
    sessionState,
    isActive,
    interimTranscript,
    elapsedSeconds,
    isSupported: webSpeech.isSupported,
    micPermission: webSpeech.micPermission,
    requestMicPermission: webSpeech.requestMicPermission,
  };
}

// ─── Helpers ─────────────────────────────────────────────────

function buildChatMessages(
  history: Message[],
  latestUser: Message,
  scenario: Scenario,
): ChatMessage[] {
  const chatMessages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt(scenario.systemPrompt) },
  ];

  const recentHistory = history.slice(-20);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      chatMessages.push({ role: msg.role, content: msg.content });
    }
  }

  chatMessages.push({ role: 'user', content: latestUser.content });
  return chatMessages;
}

async function callChatAPI(
  config: ApiConfig,
  messages: ChatMessage[],
  tools?: unknown[],
): Promise<{ content: string; toolCalls?: { name: string; arguments: Record<string, unknown> }[] }> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config,
      messages,
      maxTokens: 512,
      temperature: 0.8,
      ...(tools && tools.length > 0 ? { tools } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}
