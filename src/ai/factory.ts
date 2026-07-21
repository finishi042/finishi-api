/**
 * AI Provider Factory
 *
 * Creates the appropriate AI provider based on configuration.
 * Plug-and-play: change AI_PROVIDER env var to swap providers.
 *
 * Supports a "fallback" mode that chains multiple providers:
 *   AI_PROVIDER=fallback
 *   AI_FALLBACK_CHAIN=gemini,groq,openrouter
 *   GEMINI_API_KEY=...
 *   GROQ_API_KEY=...
 *   OPENROUTER_API_KEY=...
 */

import type { AIProvider, AIProviderConfig, AIProviderName } from './types.js'
import { OpenAIProvider } from './providers/openai.js'
import { HuggingFaceProvider } from './providers/huggingface.js'
import { GeminiProvider } from './providers/gemini.js'
import { GroqProvider } from './providers/groq.js'
import { OpenRouterProvider } from './providers/openrouter.js'
import { FallbackProvider } from './providers/fallback.js'
import { MockAIProvider } from './providers/mock.js'

/** Create an AI provider instance from config */
export function createAIProvider(config: AIProviderConfig): AIProvider {
  switch (config.provider) {
    case 'openai':
      return new OpenAIProvider(config)
    case 'huggingface':
      return new HuggingFaceProvider(config)
    case 'gemini':
      return new GeminiProvider(config)
    case 'groq':
      return new GroqProvider(config)
    case 'openrouter':
      return new OpenRouterProvider(config)
    case 'mock':
      return new MockAIProvider()
    default:
      throw new Error(`Unknown AI provider: ${config.provider}`)
  }
}

/**
 * Build a provider config for a specific provider name using
 * provider-specific env vars (e.g., GEMINI_API_KEY, GROQ_API_KEY).
 * Falls back to generic AI_API_KEY / AI_MODEL if provider-specific ones aren't set.
 */
function getProviderConfig(name: AIProviderName): AIProviderConfig {
  const prefix = name.toUpperCase()

  return {
    provider: name,
    apiKey: process.env[`${prefix}_API_KEY`] || process.env.AI_API_KEY || '',
    model: process.env[`${prefix}_MODEL`] || process.env.AI_MODEL || undefined,
    baseUrl: process.env[`${prefix}_BASE_URL`] || process.env.AI_BASE_URL || undefined,
    maxTokens: process.env.AI_MAX_TOKENS ? parseInt(process.env.AI_MAX_TOKENS, 10) : undefined,
    temperature: process.env.AI_TEMPERATURE ? parseFloat(process.env.AI_TEMPERATURE) : undefined,
  }
}

/** Create a fallback provider from AI_FALLBACK_CHAIN env var */
function createFallbackProvider(): AIProvider {
  const chain = (process.env.AI_FALLBACK_CHAIN || 'gemini,groq,openrouter')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean) as AIProviderName[]

  const providers: AIProvider[] = []

  for (const name of chain) {
    const config = getProviderConfig(name)

    // Skip providers without an API key
    if (!config.apiKey) {
      console.warn(`[AI Factory] Skipping ${name} in fallback chain — no API key set.`)
      continue
    }

    providers.push(createAIProvider(config))
  }

  if (providers.length === 0) {
    console.warn('[AI Factory] No configured providers in fallback chain. Using mock.')
    return new MockAIProvider()
  }

  return new FallbackProvider(providers)
}

/** Create an AI provider from environment variables */
export function createAIProviderFromEnv(): AIProvider {
  const provider = (process.env.AI_PROVIDER || 'mock') as AIProviderName

  // Fallback mode — chain multiple providers
  if (provider === 'fallback') {
    return createFallbackProvider()
  }

  const config = getProviderConfig(provider)

  // Validate API key is present for non-mock providers
  if (provider !== 'mock' && !config.apiKey) {
    console.warn(`[AI] Provider "${provider}" selected but no API key found. Falling back to mock.`)
    return new MockAIProvider()
  }

  return createAIProvider(config)
}
