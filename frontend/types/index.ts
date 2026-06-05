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
  | 'openai-compatible'
  | 'free';

export interface ApiConfig {
  provider: ProviderType;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  voiceMode: VoiceMode;
  ttsVoice?: string;
  ttsRate?: number;
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
}

// --- Voice Session State ---

export type VoiceSessionState =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';
