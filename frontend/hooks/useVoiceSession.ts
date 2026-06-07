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
  TTSOptions,
} from '@/types';
import { CORRECTION_TOOL, buildSystemPrompt } from '@/lib/prompts';
import { generateFreeReply } from '@/lib/free-coach';
import { saveSession, saveDraft, getDraft, clearDraft } from '@/lib/storage';

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
  /** True when the session was restored from a saved in-progress draft. */
  resumed: boolean;
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

/** Assemble TTS options from the current config. When the user picks the cloud
 *  TTS, the engine is 'api' (with optional own-key overrides); otherwise the
 *  free browser SpeechSynthesis is used. */
function buildTTSOptions(config: ApiConfig): TTSOptions {
  const rate = config.ttsRate ?? 1.0;
  if (config.ttsSource === 'api') {
    return {
      rate,
      source: 'api',
      apiVoice: config.ttsApiVoice,
      apiConfig: {
        apiKey: config.ttsApiKey,
        baseUrl: config.ttsApiBaseUrl,
        model: config.ttsApiModel,
      },
    };
  }
  return { rate, source: 'browser' };
}

export function useVoiceSession(scenario: Scenario): UseVoiceSessionReturn {
  const webSpeech = useWebSpeech();

  // Load any in-progress draft for this scenario once (client-only mount).
  const draftRef = useRef<ReturnType<typeof getDraft> | undefined>(undefined);
  if (draftRef.current === undefined) {
    draftRef.current = getDraft(scenario.id);
  }
  const draft = draftRef.current;
  const resumed = !!draft;

  const [messages, setMessages] = useState<Message[]>(draft?.messages ?? []);
  const [corrections, setCorrections] = useState<Correction[]>(draft?.corrections ?? []);
  const [sessionState, setSessionState] = useState<VoiceSessionState>('idle');
  const [isActive, setIsActive] = useState(resumed);
  const [elapsedSeconds, setElapsedSeconds] = useState(draft?.elapsedSeconds ?? 0);

  // Live preview while listening: show the accumulated final text plus the
  // current interim chunk. Submission happens only when the user taps stop.
  const interimTranscript =
    webSpeech.state === 'listening'
      ? [webSpeech.finalTranscript, webSpeech.interimTranscript]
          .filter(Boolean)
          .join(' ')
          .trim()
      : '';

  const configRef = useRef<ApiConfig>(loadApiConfig());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const freeResponseIdx = useRef(
    draft
      ? Math.max(0, draft.messages.filter((m) => m.role === 'assistant').length - 1)
      : 0
  );
  const isProcessingRef = useRef(false);
  const messagesRef = useRef(messages);
  const correctionsRef = useRef(corrections);
  const elapsedRef = useRef(elapsedSeconds);
  const startTimeRef = useRef<number>(draft?.startTime ?? 0);
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
    elapsedRef.current = elapsedSeconds;
  }, [elapsedSeconds]);

  useEffect(() => {
    scenarioRef.current = scenario;
  }, [scenario]);

  // ─── Auto-save in-progress draft (resume after navigating away) ───
  useEffect(() => {
    if (!isActive || messages.length === 0) return;
    const sc = scenarioRef.current;
    saveDraft({
      scenarioId: sc.id,
      scenarioName: sc.nameZh || sc.name,
      startTime: startTimeRef.current || Date.now(),
      elapsedSeconds: elapsedRef.current,
      messages,
      corrections,
      voiceMode: configRef.current.voiceMode,
      updatedAt: Date.now(),
    });
  }, [messages, corrections, isActive]);

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
        // Free mode is now powered by a server-side built-in LLM (key stays on
        // the server). Standard mode uses the user's configured key. Either way
        // we enable the correction tool. If the LLM is unavailable we fall back
        // to local scripted replies so the session never breaks.
        const useServerKey = config.voiceMode === 'free';
        const canUseLLM = useServerKey || !!config.apiKey;

        let aiResponse = '';
        let llmHandled = false;

        if (canUseLLM) {
          try {
            const chatMessages = buildChatMessages(
              messagesRef.current,
              userMsg,
              scenarioRef.current,
            );
            const result = await callChatAPI(
              config,
              chatMessages,
              [CORRECTION_TOOL],
              useServerKey,
            );
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
              const followUp = await callChatAPI(config, chatMessages, undefined, useServerKey);
              aiResponse = followUp.content;
            }

            // Last-resort safety so TTS always has something to say.
            if (!aiResponse.trim()) {
              aiResponse = 'Got it. Please, go on.';
            }
            llmHandled = true;
          } catch (err) {
            if (!useServerKey) throw err; // Standard mode: surface the error.
            // Free mode: built-in LLM unavailable (e.g. env not set) → fall back.
            console.warn('[useVoiceSession] Free-mode LLM unavailable, using local replies:', err);
          }
        }

        if (!llmHandled) {
          // Local scripted fallback (no key, or free-mode LLM failure).
          await new Promise((r) => setTimeout(r, 500));
          aiResponse = generateFreeReply({
            scenario: scenarioRef.current,
            userText: text,
            turnIndex: freeResponseIdx.current,
          });
          freeResponseIdx.current++;
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
        await webSpeech.speak(aiResponse, buildTTSOptions(config));

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
    await webSpeech.speak(scenario.starterMessage, buildTTSOptions(configRef.current));
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

    // The session is over — drop the in-progress draft either way.
    clearDraft(scenarioRef.current.id);

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
  // Tap once to start recording; tap again to stop. Stopping submits the
  // entire accumulated utterance to the AI — natural pauses no longer cut
  // the user off mid-sentence.
  const toggleListening = useCallback(() => {
    if (sessionState === 'speaking' || sessionState === 'processing') return;

    if (webSpeech.isListening) {
      webSpeech.stopListening();
      const { transcript, confidence } = webSpeech.getResult();
      const userText = transcript.trim();
      if (userText && !isProcessingRef.current) {
        const meta = {
          confidence,
          durationMs: listenStartRef.current
            ? Date.now() - listenStartRef.current
            : undefined,
        };
        handleUserMessageRef.current?.(userText, meta);
      } else {
        setSessionState('idle');
      }
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
    resumed,
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
  useServerKey?: boolean,
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
      ...(useServerKey ? { useServerKey: true } : {}),
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `API error: ${response.status}`);
  }

  return response.json();
}
