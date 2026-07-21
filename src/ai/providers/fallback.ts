/**
 * Fallback Provider — tries providers in priority order.
 *
 * If the primary provider fails (rate limit, outage, error),
 * automatically tries the next one in the chain.
 * Your application never notices.
 *
 * Usage:
 *   AI_PROVIDER=fallback
 *   AI_FALLBACK_CHAIN=gemini,groq,openrouter
 */

import type {
  AIProvider,
  AIProviderName,
  AICompletionRequest,
  AICompletionResponse,
  LessonPersonalizationInput,
  LessonPersonalizationOutput,
  CapstoneGradingInput,
  CapstoneGradingOutput,
  AssistantInput,
  AssistantOutput,
} from '../types.js'

export class FallbackProvider implements AIProvider {
  readonly name = 'fallback' as AIProviderName
  private providers: AIProvider[]

  constructor(providers: AIProvider[]) {
    if (providers.length === 0) {
      throw new Error('FallbackProvider requires at least one provider')
    }
    this.providers = providers
  }

  get providerNames(): string[] {
    return this.providers.map((p) => p.name)
  }

  private async tryAll<T>(
    fn: (provider: AIProvider) => Promise<T>,
    operation: string,
  ): Promise<T> {
    let lastError: Error | null = null

    for (const provider of this.providers) {
      try {
        return await fn(provider)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        console.warn(
          `[AI Fallback] ${provider.name} failed for ${operation}: ${lastError.message}. Trying next...`
        )
      }
    }

    throw new Error(
      `[AI Fallback] All providers failed for ${operation}. Last error: ${lastError?.message}`
    )
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    return this.tryAll((p) => p.complete(request), 'complete')
  }

  async personalizaLesson(input: LessonPersonalizationInput): Promise<LessonPersonalizationOutput> {
    return this.tryAll((p) => p.personalizaLesson(input), 'personalizaLesson')
  }

  async gradeCapstone(input: CapstoneGradingInput): Promise<CapstoneGradingOutput> {
    return this.tryAll((p) => p.gradeCapstone(input), 'gradeCapstone')
  }

  async assistantChat(input: AssistantInput): Promise<AssistantOutput> {
    return this.tryAll((p) => p.assistantChat(input), 'assistantChat')
  }
}
