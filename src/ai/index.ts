/**
 * AI Module — Public API
 *
 * Usage:
 *   import { getAIProvider } from './ai/index.js'
 *   const ai = getAIProvider()
 *   const lesson = await ai.personalizaLesson({ ... })
 */

export type {
  AIProvider,
  AIProviderName,
  AIProviderConfig,
  AICompletionRequest,
  AICompletionResponse,
  AIMessage,
  LessonPersonalizationInput,
  LessonPersonalizationOutput,
  CapstoneGradingInput,
  CapstoneGradingOutput,
  RubricCriterion,
  AssistantInput,
  AssistantOutput,
} from './types.js'

export { createAIProvider, createAIProviderFromEnv } from './factory.js'
export {
  buildLessonPersonalizationPrompt,
  buildCapstoneGradingPrompt,
  buildAssistantPrompt,
} from './prompts.js'

import { createAIProviderFromEnv } from './factory.js'
import type { AIProvider } from './types.js'

/** Singleton AI provider instance — lazily initialized */
let _provider: AIProvider | null = null

export function getAIProvider(): AIProvider {
  if (!_provider) {
    _provider = createAIProviderFromEnv()
  }
  return _provider
}

/** Reset the provider (useful for testing or hot-reload) */
export function resetAIProvider(): void {
  _provider = null
}
