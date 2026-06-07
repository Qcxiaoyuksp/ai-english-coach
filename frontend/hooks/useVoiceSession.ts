// ============================================================
// useVoiceSession — Core Voice Session Hook
// ============================================================
// Manages the entire conversation lifecycle: speech recognition,
// AI response generation, TTS playback, message history, and
// session timing. Supports free/standard/advanced modes.
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
import { CORRECTION_TOOL, buildSystemPrompt, sanitizeSpokenReply } from '@/lib/prompts';
import { generateFreeReply } from '@/lib/free-coach';
import { buildLocalReport } from '@/lib/analyzer';
import {
  saveSession,
  saveDraft,
  getDraft,
  clearDraft,
  saveReport,
  getReportBySession,
} from '@/lib/storage';
import { AudioRecorder, transcribeAudio } from '@/lib/speech/recorder';
import {
  loadApiConfig,
  usesBuiltinLLM,
  effectiveAsrSource,
  effectiveTtsSource,
} from '@/lib/config';

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

/** Assemble TTS options from the current config. The engine follows the voice
 *  mode (free→browser, standard/advanced→小米 api). In advanced mode the user
 *  may supply their own TTS API credentials; otherwise the server built-in is
 *  used (key stays server-side). */
function buildTTSOptions(config: ApiConfig): TTSOptions {
  const rate = config.ttsRate ?? 1.0;
  if (effectiveTtsSource(config) === 'api') {
    const useCustom = config.voiceMode === 'advanced' && !!config.ttsUseCustomApi;
    return {
      rate,
      source: 'api',
      apiVoice: config.ttsApiVoice,
      apiConfig: useCustom
        ? {
            apiKey: config.ttsApiKey,
            baseUrl: config.ttsApiBaseUrl,
            model: config.ttsApiModel,
          }
        : undefined,
    };
  }
  return { rate, source: 'browser' };
}

/** ASR credentials to send for cloud transcription. Custom creds only when the
 *  user opted in (advanced mode); otherwise the server built-in key is used. */
function buildAsrConfig(config: ApiConfig): ApiConfig {
  const useCustom = config.voiceMode === 'advanced' && !!config.asrUseCustomApi;
  return {
    ...config,
    asrApiKey: useCustom ? config.asrApiKey : undefined,
    asrApiBaseUrl: useCustom ? config.asrApiBaseUrl : undefined,
  };
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
  // Cloud ASR (API mode) recording state.
  const recorderRef = useRef<AudioRecorder | null>(null);
  const apiRecordingRef = useRef(false);
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
        // LLM source: free mode and "builtin" use the server-side key (via
        // /api/chat useServerKey); "custom" uses the user's configured key.
        // Either way the correction tool is enabled. If the built-in LLM is
        // unavailable we fall back to local scripted replies.
        const useServerKey = usesBuiltinLLM(config);
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

        // Strip any tool/correction payload the model may have inlined into
        // its reply so it isn't displayed or read aloud. Keep a safe fallback.
        aiResponse = sanitizeSpokenReply(aiResponse);
        if (!aiResponse) aiResponse = 'Got it. Please, go on.';

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
    // Abort any in-progress cloud-ASR recording.
    if (recorderRef.current) {
      recorderRef.current.cancel();
      recorderRef.current = null;
    }
    apiRecordingRef.current = false;
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
      // Auto-generate a baseline report on session end so history/trends are
      // always complete without requiring the user to open each report. The
      // report page later upgrades this to an LLM-graded report (standard/
      // advanced modes). Don't clobber an existing report (e.g. resumed view).
      if (!getReportBySession(session.id)) {
        try {
          saveReport(buildLocalReport(session));
        } catch (err) {
          console.error('[useVoiceSession] Failed to auto-save report:', err);
        }
      }
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
  //
  // Two engines:
  //  • browser (default): Web Speech accumulates an interim+final transcript.
  //  • api: MediaRecorder records a full clip, then the server-side ASR
  //    transcribes it (more accurate, immune to pause-based cutoffs).
  const toggleListening = useCallback(() => {
    if (
      sessionState === 'speaking' ||
      sessionState === 'processing' ||
      sessionState === 'transcribing'
    ) {
      return;
    }

    const useApiAsr = effectiveAsrSource(configRef.current) === 'api';

    // ─── Cloud ASR (record → transcribe) ─────────────────────
    if (useApiAsr) {
      if (apiRecordingRef.current) {
        // Stop recording and transcribe.
        apiRecordingRef.current = false;
        const recorder = recorderRef.current;
        recorderRef.current = null;
        const durationMs = listenStartRef.current
          ? Date.now() - listenStartRef.current
          : undefined;
        setSessionState('transcribing');
        (async () => {
          try {
            if (!recorder) throw new Error('录音未开始');
            const blob = await recorder.stop();
            const text = await transcribeAudio(blob, buildAsrConfig(configRef.current));
            if (text && !isProcessingRef.current) {
              await handleUserMessageRef.current?.(text, { durationMs });
            } else {
              setSessionState('idle');
            }
          } catch (err) {
            console.error('[useVoiceSession] Cloud ASR failed:', err);
            const errorMsg: Message = {
              id: generateId(),
              role: 'assistant',
              content:
                '抱歉，语音识别失败了。请再说一次，或在设置中切换为浏览器识别。',
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, errorMsg]);
            setSessionState('idle');
          }
        })();
      } else {
        // Start recording.
        const recorder = new AudioRecorder();
        recorderRef.current = recorder;
        listenStartRef.current = Date.now();
        setSessionState('listening');
        recorder.start().catch((err) => {
          console.error('[useVoiceSession] Failed to start recording:', err);
          apiRecordingRef.current = false;
          recorderRef.current = null;
          setSessionState('idle');
        });
        apiRecordingRef.current = true;
      }
      return;
    }

    // ─── Browser Web Speech ──────────────────────────────────
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

  // Capability depends on the selected ASR engine: cloud ASR needs
  // MediaRecorder (works in Edge/Firefox too), browser ASR needs Web Speech.
  const isSupported =
    effectiveAsrSource(configRef.current) === 'api'
      ? AudioRecorder.isSupported()
      : webSpeech.isSupported;

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
    isSupported,
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
