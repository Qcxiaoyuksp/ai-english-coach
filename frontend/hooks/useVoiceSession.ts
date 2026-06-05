'use client';

import { useCallback, useRef, useState, useEffect } from 'react';
import { ApiConfig, ChatMessage, Message, Correction, VoiceSessionState } from '@/types';
import { BUILT_IN_SCENARIOS } from '@/lib/scenarios';

// ─── Correction Tool Definition ──────────────────────────────────────────────

const CORRECTION_TOOL = {
  type: 'function',
  function: {
    name: 'provide_correction',
    description:
      'Call this when the user makes a significant grammar, vocabulary, or expression error during conversation.',
    parameters: {
      type: 'object',
      properties: {
        error_type: {
          type: 'string',
          enum: ['grammar', 'expression', 'vocabulary'],
          description: 'Type of error',
        },
        original: {
          type: 'string',
          description: 'What the user said (the error)',
        },
        corrected: {
          type: 'string',
          description: 'Corrected version',
        },
        explanation: {
          type: 'string',
          description: 'Brief explanation of the error (in English)',
        },
      },
      required: ['error_type', 'original', 'corrected', 'explanation'],
    },
  },
};

// ─── Web Speech API Helpers ──────────────────────────────────────────────────

function createSpeechRecognition(): SpeechRecognition | null {
  if (typeof window === 'undefined') return null;
  const SpeechRecognitionCtor =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) return null;

  const recognition = new SpeechRecognitionCtor();
  recognition.lang = 'en-US';
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  return recognition;
}

function speakText(
  text: string,
  rate: number = 1.0,
  onEnd?: () => void
): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = rate;
  utterance.pitch = 1.0;

  // Try to find a natural English voice
  const voices = window.speechSynthesis.getVoices();
  const englishVoices = voices.filter(
    (v) => v.lang.startsWith('en') && !v.name.includes('Google')
  );
  const preferredVoice =
    englishVoices.find((v) => v.name.includes('Samantha')) ||
    englishVoices.find((v) => v.name.includes('Daniel')) ||
    englishVoices.find((v) => v.name.includes('Karen')) ||
    voices.find((v) => v.lang.startsWith('en'));

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  utterance.onend = () => onEnd?.();
  utterance.onerror = () => onEnd?.();

  window.speechSynthesis.speak(utterance);
}

// ─── useVoiceSession Hook ────────────────────────────────────────────────────

interface UseVoiceSessionOptions {
  scenarioId: string;
}

interface UseVoiceSessionReturn {
  state: VoiceSessionState;
  messages: Message[];
  corrections: Correction[];
  interimTranscript: string;
  elapsedSeconds: number;
  isSupported: boolean;
  startListening: () => void;
  stopListening: () => void;
  endSession: () => void;
  isSessionStarted: boolean;
  startSession: () => void;
}

export function useVoiceSession({
  scenarioId,
}: UseVoiceSessionOptions): UseVoiceSessionReturn {
  const [state, setState] = useState<VoiceSessionState>('idle');
  const [messages, setMessages] = useState<Message[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [config, setConfig] = useState<ApiConfig | null>(null);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const messagesRef = useRef<Message[]>([]);

  // Keep messagesRef in sync
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Load API config
  useEffect(() => {
    try {
      const saved = localStorage.getItem('api-config');
      if (saved) {
        setConfig(JSON.parse(saved));
      } else {
        setConfig({ provider: 'free', voiceMode: 'free', ttsRate: 1.0 });
      }
    } catch {
      setConfig({ provider: 'free', voiceMode: 'free', ttsRate: 1.0 });
    }
  }, []);

  // Check browser support
  const isSupported =
    typeof window !== 'undefined' &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition);

  // Find scenario
  const getScenario = useCallback(() => {
    // Check built-in scenarios
    const builtin = BUILT_IN_SCENARIOS.find((s) => s.id === scenarioId);
    if (builtin) return builtin;

    // Check custom scenarios from localStorage
    try {
      const custom = JSON.parse(
        localStorage.getItem('custom-scenarios') || '[]'
      );
      return custom.find((s: { id: string }) => s.id === scenarioId) || null;
    } catch {
      return null;
    }
  }, [scenarioId]);

  // Timer
  useEffect(() => {
    if (isSessionStarted) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((s) => s + 1);
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isSessionStarted]);

  // ─── Start Session ─────────────────────────────────────────────────────────

  const startSession = useCallback(() => {
    const scenario = getScenario();
    if (!scenario) return;

    // Add AI's starter message
    const starterMsg: Message = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: scenario.starterMessage,
      timestamp: Date.now(),
    };

    setMessages([starterMsg]);
    setIsSessionStarted(true);

    // Speak the starter message
    speakText(scenario.starterMessage, config?.ttsRate || 1.0);
    setState('speaking');
    setTimeout(() => {
      setState('idle');
    }, scenario.starterMessage.length * 60); // Rough estimate
  }, [getScenario, config]);

  // ─── Send Message to LLM ──────────────────────────────────────────────────

  const sendToLLM = useCallback(
    async (userText: string) => {
      const scenario = getScenario();
      if (!scenario || !config) return;

      setState('processing');

      // Add user message
      const userMsg: Message = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: userText,
        timestamp: Date.now(),
      };
      const updatedMessages = [...messagesRef.current, userMsg];
      setMessages(updatedMessages);

      // Build chat messages for the API
      const chatMessages: ChatMessage[] = [
        { role: 'system', content: scenario.systemPrompt },
        ...updatedMessages.map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
      ];

      try {
        let aiContent = '';
        let aiCorrections: Correction[] = [];

        if (
          config.voiceMode === 'free' ||
          !config.apiKey
        ) {
          // Free mode: simple template-based response
          aiContent = generateFreeResponse(scenario.name, userText, updatedMessages);
        } else {
          // Standard/Realtime mode: call LLM
          const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              config,
              messages: chatMessages,
              tools: [CORRECTION_TOOL],
            }),
          });

          if (response.ok) {
            const data = await response.json();
            aiContent = data.content || "I'm sorry, could you please repeat that?";

            // Handle tool calls (corrections)
            if (data.toolCalls) {
              aiCorrections = data.toolCalls
                .filter(
                  (tc: { name: string }) =>
                    tc.name === 'provide_correction'
                )
                .map(
                  (tc: {
                    arguments: {
                      error_type: string;
                      original: string;
                      corrected: string;
                      explanation: string;
                    };
                  }) => ({
                    id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                    errorType: tc.arguments.error_type,
                    original: tc.arguments.original,
                    corrected: tc.arguments.corrected,
                    explanation: tc.arguments.explanation,
                    severity: 'major' as const,
                  })
                );
            }
          } else {
            aiContent =
              "I'm having some trouble. Let's continue — could you repeat that?";
          }
        }

        // Add AI response
        const aiMsg: Message = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: aiContent,
          timestamp: Date.now(),
        };

        setMessages((prev) => [...prev, aiMsg]);

        if (aiCorrections.length > 0) {
          setCorrections((prev) => [...prev, ...aiCorrections]);
        }

        // Speak the response
        setState('speaking');
        speakText(aiContent, config.ttsRate || 1.0, () => {
          setState('idle');
        });
      } catch (error) {
        console.error('LLM error:', error);
        setState('idle');
      }
    },
    [config, getScenario]
  );

  // ─── Start Listening ──────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    if (state === 'speaking' || state === 'processing') return;

    // Stop any ongoing speech
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }

    const recognition = createSpeechRecognition();
    if (!recognition) return;

    recognitionRef.current = recognition;
    setInterimTranscript('');
    setState('listening');

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setInterimTranscript(interim);

      if (finalTranscript) {
        setInterimTranscript('');
        sendToLLM(finalTranscript.trim());
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        setState('error');
        setTimeout(() => setState('idle'), 2000);
      } else {
        setState('idle');
      }
    };

    recognition.onend = () => {
      if (state === 'listening') {
        setState('idle');
      }
    };

    recognition.start();
  }, [state, sendToLLM]);

  // ─── Stop Listening ───────────────────────────────────────────────────────

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setInterimTranscript('');
    if (state === 'listening') {
      setState('idle');
    }
  }, [state]);

  // ─── End Session ──────────────────────────────────────────────────────────

  const endSession = useCallback(() => {
    stopListening();
    if (typeof window !== 'undefined') {
      window.speechSynthesis?.cancel();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    setState('idle');

    // Save session to localStorage
    const session = {
      id: `session-${Date.now()}`,
      scenarioId,
      scenarioName: getScenario()?.nameZh || scenarioId,
      startTime: Date.now() - elapsedSeconds * 1000,
      endTime: Date.now(),
      messages,
      corrections,
      voiceMode: config?.voiceMode || 'free',
      status: 'completed',
    };

    try {
      const sessions = JSON.parse(
        localStorage.getItem('practice-sessions') || '[]'
      );
      sessions.push(session);
      localStorage.setItem('practice-sessions', JSON.stringify(sessions));
    } catch {
      // Ignore storage errors
    }

    // Navigate to report
    window.location.href = `/report/${session.id}`;
  }, [
    stopListening,
    scenarioId,
    getScenario,
    elapsedSeconds,
    messages,
    corrections,
    config,
  ]);

  return {
    state,
    messages,
    corrections,
    interimTranscript,
    elapsedSeconds,
    isSupported,
    startListening,
    stopListening,
    endSession,
    isSessionStarted,
    startSession,
  };
}

// ─── Free Mode Response Generator ───────────────────────────────────────────

function generateFreeResponse(
  scenarioName: string,
  userText: string,
  history: Message[]
): string {
  const turnCount = history.filter((m) => m.role === 'user').length;
  const lowerText = userText.toLowerCase();

  // Simple pattern-based responses for free mode
  if (turnCount <= 1) {
    return "That's great! Tell me more about that. I'm really interested to hear your thoughts.";
  }

  if (lowerText.includes('thank')) {
    return "You're welcome! Is there anything else I can help you with today?";
  }

  if (lowerText.includes('help') || lowerText.includes('problem')) {
    return "I understand your concern. Let me see what I can do to help you with that. Could you provide a bit more detail?";
  }

  if (lowerText.includes('yes') || lowerText.includes('sure') || lowerText.includes('okay')) {
    return "Perfect! Let's move on then. What would you like to discuss next?";
  }

  if (lowerText.includes('no') || lowerText.includes("don't")) {
    return "I see. No problem at all. Is there something else you'd prefer instead?";
  }

  if (lowerText.includes('?')) {
    return "That's a really good question! Let me think about that for a moment. I would say it depends on the specific situation, but generally speaking, the best approach would be to consider all your options carefully.";
  }

  // Generic conversational responses
  const responses = [
    "That's very interesting! Could you elaborate on that a bit more?",
    "I see what you mean. That makes a lot of sense. What else can you tell me about it?",
    "Good point! I appreciate you sharing that. How do you feel about the situation overall?",
    "Interesting perspective! Let me ask you this — have you considered any alternatives?",
    "I understand. Let's explore that further. What would you do in an ideal scenario?",
  ];

  return responses[turnCount % responses.length];
}
