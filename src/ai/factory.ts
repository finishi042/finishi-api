/**
 * AI Provider Factory
 *
 * Creates the appropriate AI provider based on configuration.
 * Plug-and-play: change AI_PROVIDER env var to swap providers.
 */

import type { AIProvider, AIProviderConfig, AIProviderName } from './types.js'
import { OpenAIProvider } from './providers/openai.js'
import { HuggingFaceProvider } from './providers/huggingface.js'
import { MockAIProvider } from './providers/mock.js'

/** Create an AI provider instance from config */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config)
    case 'huggingface':
      return new HuggingFaceProvider(config)
    case 'mock':
      return new MockAIProvider()
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`)
  }
}

/** Create an AI provider from environment variables */
export function createAIProviderFromEnv(): AIProvider {
  const provider = (process.env.AI_PROVIDER || 'mock') as AIProviderName

  const config: AIProviderConfig = {
    provider,
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || undefined,
    baseUrl: process.env.AI_BASE_URL || undefined,
    maxTokens: process.env.AI_MAX_TOKENS ? parseInt(process.env.AI_MAX_TOKENS, 10) : undefined,
    temperature: process.env.AI_TEMPERATURE ? parseFloat(process.env.AI_TEMPERATURE) : undefined,
  }

  // Validate API key is present for non-mock providers
  if (provider !== 'mock' && !config.apiKey) {
    console.warn(`[AI] Provider "${provider}" selected but AI_API_KEY is not set. Falling back to mock.`)
    return new MockAIProvider()
  }

  return createAIProvider(config)
}
