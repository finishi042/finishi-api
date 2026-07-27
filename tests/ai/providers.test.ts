/**
 * Unit Tests: AI Providers
 *
 * Tests the mock provider and provider factory.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { MockAIProvider } from '../../src/ai/providers/mock.js'
import type {
  AICompletionRequest,
  LessonPersonalizationInput,
  CapstoneGradingInput,
  AssistantInput,
} from '../../src/ai/types.js'

describe('MockAIProvider', () => {
  let provider: MockAIProvider

  beforeEach(() => {
    provider = new MockAIProvider()
  })

  describe('provider identity', () => {
    it('has correct name', () => {
      expect(provider.name).toBe('mock')
    })
  })

  describe('complete', () => {
    it('returns a mock response', async () => {
      const request: AICompletionRequest = {
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Hello, how are you?' },
        ],
      }

      const response = await provider.complete(request)

      expect(response.content).toContain('[Mock AI Response]')
      expect(response.content).toContain('Hello, how are you?')
      expect(response.provider).toBe('mock')
      expect(response.model).toBe('mock-v1')
    })

    it('includes usage stats', async () => {
      const request: AICompletionRequest = {
        messages: [{ role: 'user', content: 'Test' }],
      }

      const response = await provider.complete(request)

      expect(response.usage).toBeDefined()
      expect(response.usage?.promptTokens).toBe(0)
      expect(response.usage?.completionTokens).toBe(0)
      expect(response.usage?.totalTokens).toBe(0)
    })

    it('truncates long messages in response', async () => {
      const longMessage = 'a'.repeat(200)
      const request: AICompletionRequest = {
        messages: [{ role: 'user', content: longMessage }],
      }

      const response = await provider.complete(request)

      expect(response.content).toContain('...')
      expect(response.content.length).toBeLessThan(longMessage.length + 50)
    })
  })

  describe('personalizaLesson', () => {
    const input: LessonPersonalizationInput = {
      concept: 'React Hooks',
      conceptDescription: 'Hooks let you use state in function components.',
      misconceptions: ['Hooks replace classes'],
      examples: ['useState for counter', 'useEffect for data fetching'],
      experienceLevel: 'intermediate',
    }

    it('returns personalized lesson structure', async () => {
      const result = await provider.personalizaLesson(input)

      expect(result.title).toContain('React Hooks')
      expect(result.explanation).toContain('React Hooks')
      expect(result.explanation).toContain('intermediate')
      expect(result.example).toBeDefined()
      expect(result.keyTakeaway).toBeDefined()
      expect(result.reflection).toBeDefined()
    })

    it('uses provided examples', async () => {
      const result = await provider.personalizaLesson(input)

      expect(result.example).toContain('useState')
    })

    it('includes concept description', async () => {
      const result = await provider.personalizaLesson(input)

      expect(result.explanation).toContain('state in function components')
    })
  })

  describe('gradeCapstone', () => {
    const input: CapstoneGradingInput = {
      submission: 'function calculate(a, b) { return a + b; }',
      projectPrompt: 'Build a calculator',
      rubricCriteria: [
        {
          name: 'Functionality',
          description: 'Code works correctly',
          weight: 50,
          levels: [
            { label: 'Excellent', description: 'All works', score: 50 },
            { label: 'Good', description: 'Mostly works', score: 35 },
            { label: 'Needs Work', description: 'Partially works', score: 20 },
          ],
        },
        {
          name: 'Code Quality',
          description: 'Clean code',
          weight: 50,
          levels: [
            { label: 'Excellent', description: 'Very clean', score: 50 },
            { label: 'Good', description: 'Clean', score: 35 },
            { label: 'Needs Work', description: 'Messy', score: 20 },
          ],
        },
      ],
      skillName: 'JavaScript',
    }

    it('returns grading structure', async () => {
      const result = await provider.gradeCapstone(input)

      expect(result.scores).toBeDefined()
      expect(result.overallFeedback).toBeDefined()
      expect(result.overallStatus).toBeDefined()
    })

    it('grades all criteria', async () => {
      const result = await provider.gradeCapstone(input)

      expect(result.scores['Functionality']).toBeDefined()
      expect(result.scores['Code Quality']).toBeDefined()
    })

    it('provides score and feedback for each criterion', async () => {
      const result = await provider.gradeCapstone(input)

      for (const criterion of input.rubricCriteria) {
        const score = result.scores[criterion.name]
        expect(score.score).toBeGreaterThan(0)
        expect(score.maxScore).toBeGreaterThan(0)
        expect(score.feedback).toBeDefined()
        expect(score.feedback.length).toBeGreaterThan(0)
      }
    })

    it('returns valid overall status', async () => {
      const result = await provider.gradeCapstone(input)

      expect(['strong', 'improving', 'needs_practice']).toContain(result.overallStatus)
    })
  })

  describe('assistantChat', () => {
    const input: AssistantInput = {
      question: 'How do I declare a variable?',
      lessonContext: 'This lesson covers JavaScript basics.',
      conceptName: 'JavaScript Basics',
      experienceLevel: 'beginner',
    }

    it('returns an answer', async () => {
      const result = await provider.assistantChat(input)

      expect(result.answer).toBeDefined()
      expect(result.answer.length).toBeGreaterThan(0)
    })

    it('includes concept name in response', async () => {
      const result = await provider.assistantChat(input)

      expect(result.answer).toContain('JavaScript Basics')
    })

    it('echoes the question', async () => {
      const result = await provider.assistantChat(input)

      expect(result.answer).toContain('How do I declare a variable?')
    })

    it('indicates mock response', async () => {
      const result = await provider.assistantChat(input)

      expect(result.answer).toContain('[Mock]')
    })
  })
})

describe('AI Provider Factory', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
    delete process.env.AI_PROVIDER
    delete process.env.AI_API_KEY
    delete process.env.GEMINI_API_KEY
    delete process.env.GROQ_API_KEY
    delete process.env.OPENAI_API_KEY
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('defaults to mock provider', async () => {
    const { createAIProviderFromEnv } = await import('../../src/ai/factory.js')
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('mock')
  })

  it('creates specific provider when configured', async () => {
    process.env.AI_PROVIDER = 'mock'
    vi.resetModules()

    const { createAIProviderFromEnv } = await import('../../src/ai/factory.js')
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('mock')
  })

  it('falls back to mock when API key is missing', async () => {
    process.env.AI_PROVIDER = 'gemini'
    // No GEMINI_API_KEY
    vi.resetModules()

    const { createAIProviderFromEnv } = await import('../../src/ai/factory.js')
    const provider = createAIProviderFromEnv()
    expect(provider.name).toBe('mock')
  })

  it('throws error for unknown provider in createAIProvider', async () => {
    const { createAIProvider } = await import('../../src/ai/factory.js')

    expect(() => createAIProvider({ provider: 'unknown' as any, apiKey: 'test' })).toThrow(
      'Unknown AI provider'
    )
  })
})
