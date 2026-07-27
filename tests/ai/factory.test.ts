import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock all provider modules
vi.mock('../../src/ai/providers/openai.js', () => ({
  OpenAIProvider: class {
    name = 'openai'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/ai/providers/huggingface.js', () => ({
  HuggingFaceProvider: class {
    name = 'huggingface'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/ai/providers/gemini.js', () => ({
  GeminiProvider: class {
    name = 'gemini'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/ai/providers/groq.js', () => ({
  GroqProvider: class {
    name = 'groq'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/ai/providers/openrouter.js', () => ({
  OpenRouterProvider: class {
    name = 'openrouter'
    constructor(public config: any) {}
  },
}))
vi.mock('../../src/ai/providers/fallback.js', () => ({
  FallbackProvider: class {
    name = 'fallback'
    constructor(public providers: any[]) {}
  },
}))
vi.mock('../../src/ai/providers/mock.js', () => ({
  MockAIProvider: class {
    name = 'mock'
  },
}))

const { createAIProvider, createAIProviderFromEnv } = await import('../../src/ai/factory.js')

describe('createAIProvider', () => {
  it('creates an OpenAIProvider for provider "openai"', () => {
    const provider = createAIProvider({ provider: 'openai', apiKey: 'sk-test' })
    expect(provider.name).toBe('openai')
  })

  it('creates a HuggingFaceProvider for provider "huggingface"', () => {
    const provider = createAIProvider({ provider: 'huggingface', apiKey: 'hf-test' })
    expect(provider.name).toBe('huggingface')
  })

  it('creates a GeminiProvider for provider "gemini"', () => {
    const provider = createAIProvider({ provider: 'gemini', apiKey: 'gemini-test' })
    expect(provider.name).toBe('gemini')
  })

  it('creates a GroqProvider for provider "groq"', () => {
    const provider = createAIProvider({ provider: 'groq', apiKey: 'groq-test' })
    expect(provider.name).toBe('groq')
  })

  it('creates an OpenRouterProvider for provider "openrouter"', () => {
    const provider = createAIProvider({ provider: 'openrouter', apiKey: 'or-test' })
    expect(provider.name).toBe('openrouter')
  })

  it('creates a MockAIProvider for provider "mock"', () => {
    const provider = createAIProvider({ provider: 'mock', apiKey: '' })
    expect(provider.name).toBe('mock')
  })

  it('throws an error for unknown provider', () => {
    expect(() => createAIProvider({ provider: 'unknown' as any, apiKey: 'test' })).toThrow(
      'Unknown AI provider: unknown'
    )
  })
})

describe('createAIProviderFromEnv', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    // Clear all AI-related env vars
    delete process.env.AI_PROVIDER
    delete process.env.AI_API_KEY
    delete process.env.AI_MODEL
    delete process.env.AI_BASE_URL
    delete process.env.AI_MAX_TOKENS
    delete process.env.AI_TEMPERATURE
    delete process.env.AI_FALLBACK_CHAIN
    delete process.env.GEMINI_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.OPENROUTER_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('defaults to mock provider when AI_PROVIDER is not set', () => {
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('mock')
  })

  it('returns mock provider for explicit "mock" value', () => {
    process.env.AI_PROVIDER = 'mock'
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('mock')
  })

  it('creates gemini provider from env', () => {
    process.env.AI_PROVIDER = 'gemini'
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('gemini')
  })

  it('creates groq provider from env', () => {
    process.env.AI_PROVIDER = 'groq'
    process.env.GROQ_API_KEY = 'test-groq-key'
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('groq')
  })

  it('creates openai provider from env', () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'test-openai-key'
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('openai')
  })

  it('falls back to mock when provider is set but no API key', () => {
    process.env.AI_PROVIDER = 'gemini'
    // No GEMINI_API_KEY set
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('mock')
  })

  it('uses generic AI_API_KEY when provider-specific key is not set', () => {
    process.env.AI_PROVIDER = 'gemini'
    process.env.AI_API_KEY = 'generic-api-key'
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('gemini')
  })

  it('creates fallback provider with configured chain', () => {
    process.env.AI_PROVIDER = 'fallback'
    process.env.AI_FALLBACK_CHAIN = 'gemini,groq'
    process.env.GEMINI_API_KEY = 'gemini-key'
    process.env.GROQ_API_KEY = 'groq-key'
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('fallback')
  })

  it('falls back to mock when fallback chain has no configured providers', () => {
    process.env.AI_PROVIDER = 'fallback'
    process.env.AI_FALLBACK_CHAIN = 'gemini,groq'
    // No API keys set
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('mock')
  })
})
