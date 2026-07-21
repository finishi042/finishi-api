/**
 * AI Provider Abstraction Layer
 *
 * Plug-and-play interface for AI providers (OpenAI, HuggingFace, etc.)
 * Similar to how billing is provider-agnostic, the AI module allows
 * swapping providers without changing consuming code.
 */

// ─── Provider Configuration ────────────────────────────────────────────────

export type AIProviderName = 'openai' | 'huggingface' | 'gemini' | 'groq' | 'openrouter' | 'fallback' | 'mock'

export interface AIProviderConfig {
  provider: AIProviderName
  apiKey: string
  model?: string         // e.g. 'gpt-4o-mini', 'mistralai/Mistral-7B-Instruct-v0.3'
  baseUrl?: string       // custom endpoint URL
  maxTokens?: number
  temperature?: number
}

// ─── Message Types ─────────────────────────────────────────────────────────

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AICompletionRequest {
  messages: AIMessage[]
  maxTokens?: number
  temperature?: number
  responseFormat?: 'text' | 'json'
}

export interface AICompletionResponse {
  content: string
  provider: AIProviderName
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

// ─── Domain-Specific Interfaces ────────────────────────────────────────────

export interface LessonPersonalizationInput {
  concept: string
  conceptDescription: string
  misconceptions: string[]
  examples: string[]
  experienceLevel: 'beginner' | 'intermediate' | 'advanced'
  previousContext?: string   // what the learner has covered so far
}

export interface LessonPersonalizationOutput {
  title: string
  explanation: string
  example: string
  keyTakeaway: string
  reflection: string
}

export interface RubricCriterion {
  name: string
  description: string
  weight: number
  levels: { label: string; description: string; score: number }[]
}

export interface CapstoneGradingInput {
  submission: string
  projectPrompt: string
  rubricCriteria: RubricCriterion[]
  skillName: string
}

export interface CapstoneGradingOutput {
  scores: Record<string, { score: number; maxScore: number; feedback: string }>
  overallFeedback: string
  overallStatus: 'strong' | 'improving' | 'needs_practice'
}

export interface AssistantInput {
  question: string
  lessonContext: string       // current lesson content
  conceptName: string
  experienceLevel: 'beginner' | 'intermediate' | 'advanced'
}

export interface AssistantOutput {
  answer: string
}

// ─── Provider Interface ────────────────────────────────────────────────────

export interface AIProvider {
  readonly name: AIProviderName

  /** Raw completion — for custom prompting */
  complete(request: AICompletionRequest): Promise<AICompletionResponse>

  /** Personalize a lesson for a learner */
  personalizaLesson(input: LessonPersonalizationInput): Promise<LessonPersonalizationOutput>

  /** Grade a capstone submission against a rubric */
  gradeCapstone(input: CapstoneGradingInput): Promise<CapstoneGradingOutput>

  /** Answer a learner's question in context */
  assistantChat(input: AssistantInput): Promise<AssistantOutput>
}
