// ============================================================
// AI English Coach — Core Type Definitions
// ============================================================

// --- Voice & Provider Modes ---

export type VoiceMode = 'free' | 'standard' | 'realtime';

export type ProviderType =
  | 'openai'
  | 'gemini'
  | 'deepseek'
  | 'groq'
  | 'zhipu'
  | 'openrouter'
  | 'siliconflow'
  | 'modelscope'
  | 'openai-compatible'
  | 'free';

/** Which engine produces the AI's spoken audio. */
export type TTSSource = 'browser' | 'api';

export interface ApiConfig {
  provider: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  voiceMode: VoiceMode;
  ttsVoice?: string;
  ttsRate?: number;
  // ─── TTS (text-to-speech) output ───────────────────────────
  /** Engine for the AI's voice. 'browser' (default) uses the free Web Speech
   *  SpeechSynthesis; 'api' uses a cloud TTS (Xiaomi MiMo) for natural audio. */
  ttsSource?: TTSSource;
  /** Preset voice name for the API TTS (e.g. Xiaomi 'Chloe'/'Mia'/'Milo'/'Dean'). */
  ttsApiVoice?: string;
  /** Optional user-supplied TTS API key. When blank, the server-side built-in
   *  key (XIAOMI_TTS_API_KEY) is used so no key is exposed to the browser. */
  ttsApiKey?: string;
  /** Optional override for the TTS API base URL (defaults to Xiaomi MiMo). */
  ttsApiBaseUrl?: string;
  /** Optional override for the TTS model (defaults to mimo-v2.5-tts). */
  ttsApiModel?: string;
}

// --- Scenarios ---

export type Difficulty = 'beginner' | 'intermediate' | 'advanced';

export interface Scenario {
  id: string;
  name: string;
  nameZh: string;
  icon: string;
  description: string;
  descriptionZh: string;
  difficulty: Difficulty;
  estimatedMinutes: number;
  systemPrompt: string;
  starterMessage: string;
  keyVocabulary: string[];
  isCustom: boolean;
}

// --- Conversation ---

export type MessageRole = 'user' | 'assistant' | 'system';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  corrections?: Correction[];
  /** STT recognition confidence (0-1) for user utterances, when available. */
  confidence?: number;
  /** Approximate spoken duration in ms for user utterances, when available. */
  durationMs?: number;
}

export interface Correction {
  id: string;
  errorType: 'grammar' | 'expression' | 'vocabulary';
  original: string;
  corrected: string;
  explanation: string;
  severity: 'major' | 'minor';
}

// --- Session ---

export type SessionStatus = 'active' | 'completed' | 'cancelled';

export interface Session {
  id: string;
  scenarioId: string;
  scenarioName: string;
  startTime: number;
  endTime?: number;
  messages: Message[];
  corrections: Correction[];
  voiceMode: VoiceMode;
  status: SessionStatus;
}

/** An in-progress practice session, auto-saved so it can be resumed
 *  after navigating away. Keyed by scenarioId. */
export interface SessionDraft {
  scenarioId: string;
  scenarioName: string;
  startTime: number;
  elapsedSeconds: number;
  messages: Message[];
  corrections: Correction[];
  voiceMode: VoiceMode;
  updatedAt: number;
}

// --- Report ---

export interface DimensionScore {
  score: number; // 0-100
  feedback: string;
}

export interface ReportDimensions {
  pronunciation: DimensionScore;
  grammar: DimensionScore;
  vocabulary: DimensionScore;
  fluency: DimensionScore;
  naturalness: DimensionScore;
  taskCompletion: DimensionScore;
}

export interface Report {
  id: string;
  sessionId: string;
  createdAt: number;
  overallScore: number;
  dimensions: ReportDimensions;
  errors: ReportError[];
  highlights: string[];
  suggestions: string[];
  keyVocabulary: VocabularyItem[];
}

export interface ReportError {
  type: 'grammar' | 'expression' | 'vocabulary';
  original: string;
  corrected: string;
  explanation: string;
  context: string; // surrounding conversation
}

export interface VocabularyItem {
  word: string;
  definition: string;
  example: string;
}

// --- AI Provider Interface ---

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export interface ChatResponse {
  content: string;
  toolCalls?: ToolCall[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface AIProvider {
  name: string;
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;
  streamChat?(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncGenerator<string>;
  supportsTools(): boolean;
}

// --- Speech Service Interfaces ---

export interface STTCallbacks {
  onResult: (transcript: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onEnd: () => void;
}

export interface TTSOptions {
  voice?: string;
  rate?: number;
  pitch?: number;
  /** Which engine to use for this utterance. Defaults to 'browser'. */
  source?: TTSSource;
  /** Preset voice name for the API TTS engine. */
  apiVoice?: string;
  /** Optional user-supplied credentials/overrides for the API TTS engine.
   *  When omitted, the server falls back to its built-in key/defaults. */
  apiConfig?: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
  };
}

// --- Voice Session State ---

export type VoiceSessionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';
