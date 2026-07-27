/**
 * Unit Tests: AI Prompt Builders
 *
 * Tests the prompt template functions used across AI providers.
 */

import { describe, it, expect } from 'vitest'
import {
  buildLessonPersonalizationPrompt,
  buildCapstoneGradingPrompt,
  buildAssistantPrompt,
} from '../../src/ai/prompts.js'
import type {
  LessonPersonalizationInput,
  CapstoneGradingInput,
  AssistantInput,
} from '../../src/ai/types.js'

describe('buildLessonPersonalizationPrompt', () => {
  const baseInput: LessonPersonalizationInput = {
    concept: 'JavaScript Closures',
    conceptDescription: 'A closure is a function that has access to variables from its outer scope.',
    misconceptions: ['Closures cause memory leaks', 'Closures are the same as callbacks'],
    examples: ['Counter function', 'Private variables pattern'],
    experienceLevel: 'beginner',
  }

  it('returns an array of messages', () => {
    const messages = buildLessonPersonalizationPrompt(baseInput)
    expect(Array.isArray(messages)).toBe(true)
    expect(messages.length).toBe(2)
  })

  it('includes system message with role instructions', () => {
    const messages = buildLessonPersonalizationPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage).toBeDefined()
    expect(systemMessage?.content).toContain('expert instructor')
    expect(systemMessage?.content).toContain('JSON')
  })

  it('includes user message with concept details', () => {
    const messages = buildLessonPersonalizationPrompt(baseInput)
    const userMessage = messages.find(m => m.role === 'user')

    expect(userMessage).toBeDefined()
    expect(userMessage?.content).toContain('JavaScript Closures')
    expect(userMessage?.content).toContain('access to variables')
  })

  it('adapts for beginner level', () => {
    const input = { ...baseInput, experienceLevel: 'beginner' as const }
    const messages = buildLessonPersonalizationPrompt(input)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('beginner')
    expect(systemMessage?.content).toContain('simple language')
  })

  it('adapts for intermediate level', () => {
    const input = { ...baseInput, experienceLevel: 'intermediate' as const }
    const messages = buildLessonPersonalizationPrompt(input)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('some experience')
    expect(systemMessage?.content).toContain('industry terms')
  })

  it('adapts for advanced level', () => {
    const input = { ...baseInput, experienceLevel: 'advanced' as const }
    const messages = buildLessonPersonalizationPrompt(input)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('advanced')
    expect(systemMessage?.content).toContain('concise')
    expect(systemMessage?.content).toContain('edge cases')
  })

  it('includes misconceptions in system prompt', () => {
    const messages = buildLessonPersonalizationPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('memory leaks')
    expect(systemMessage?.content).toContain('callbacks')
  })

  it('includes examples in user prompt', () => {
    const messages = buildLessonPersonalizationPrompt(baseInput)
    const userMessage = messages.find(m => m.role === 'user')

    expect(userMessage?.content).toContain('Counter function')
    expect(userMessage?.content).toContain('Private variables')
  })

  it('handles empty misconceptions', () => {
    const input = { ...baseInput, misconceptions: [] }
    const messages = buildLessonPersonalizationPrompt(input)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('None specified')
  })

  it('includes previous context when provided', () => {
    const input = { ...baseInput, previousContext: 'Previously learned about functions and scope.' }
    const messages = buildLessonPersonalizationPrompt(input)
    const userMessage = messages.find(m => m.role === 'user')

    expect(userMessage?.content).toContain('previous lessons')
    expect(userMessage?.content).toContain('functions and scope')
  })
})

describe('buildCapstoneGradingPrompt', () => {
  const baseInput: CapstoneGradingInput = {
    submission: 'Here is my project code: function add(a, b) { return a + b; }',
    projectPrompt: 'Build a calculator with basic arithmetic operations.',
    rubricCriteria: [
      {
        name: 'Functionality',
        description: 'Code works correctly',
        weight: 40,
        levels: [
          { label: 'Excellent', description: 'All features work', score: 40 },
          { label: 'Good', description: 'Most features work', score: 30 },
          { label: 'Needs Work', description: 'Some features work', score: 20 },
        ],
      },
      {
        name: 'Code Quality',
        description: 'Clean, readable code',
        weight: 30,
        levels: [
          { label: 'Excellent', description: 'Very clean', score: 30 },
          { label: 'Good', description: 'Readable', score: 20 },
          { label: 'Needs Work', description: 'Hard to read', score: 10 },
        ],
      },
    ],
    skillName: 'JavaScript',
  }

  it('returns an array of messages', () => {
    const messages = buildCapstoneGradingPrompt(baseInput)
    expect(Array.isArray(messages)).toBe(true)
    expect(messages.length).toBe(2)
  })

  it('includes system message with grader role', () => {
    const messages = buildCapstoneGradingPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage).toBeDefined()
    expect(systemMessage?.content).toContain('expert grader')
    expect(systemMessage?.content).toContain('JavaScript')
  })

  it('includes rubric criteria in system prompt', () => {
    const messages = buildCapstoneGradingPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('Functionality')
    expect(systemMessage?.content).toContain('Code Quality')
    expect(systemMessage?.content).toContain('weight: 40')
  })

  it('includes submission in user prompt', () => {
    const messages = buildCapstoneGradingPrompt(baseInput)
    const userMessage = messages.find(m => m.role === 'user')

    expect(userMessage?.content).toContain('function add')
    expect(userMessage?.content).toContain('return a + b')
  })

  it('includes project prompt', () => {
    const messages = buildCapstoneGradingPrompt(baseInput)
    const userMessage = messages.find(m => m.role === 'user')

    expect(userMessage?.content).toContain('calculator')
    expect(userMessage?.content).toContain('arithmetic operations')
  })

  it('specifies expected JSON output format', () => {
    const messages = buildCapstoneGradingPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('scores')
    expect(systemMessage?.content).toContain('overallFeedback')
    expect(systemMessage?.content).toContain('overallStatus')
  })
})

describe('buildAssistantPrompt', () => {
  const baseInput: AssistantInput = {
    question: 'What is the difference between let and const?',
    lessonContext: 'This lesson covers JavaScript variable declarations including var, let, and const.',
    conceptName: 'JavaScript Variables',
    experienceLevel: 'beginner',
  }

  it('returns an array of messages', () => {
    const messages = buildAssistantPrompt(baseInput)
    expect(Array.isArray(messages)).toBe(true)
    expect(messages.length).toBe(2)
  })

  it('includes system message with assistant role', () => {
    const messages = buildAssistantPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage).toBeDefined()
    expect(systemMessage?.content).toContain('learning assistant')
  })

  it('includes concept name and level', () => {
    const messages = buildAssistantPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('JavaScript Variables')
    expect(systemMessage?.content).toContain('beginner')
  })

  it('includes lesson context', () => {
    const messages = buildAssistantPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('variable declarations')
    expect(systemMessage?.content).toContain('var, let, and const')
  })

  it('includes user question', () => {
    const messages = buildAssistantPrompt(baseInput)
    const userMessage = messages.find(m => m.role === 'user')

    expect(userMessage).toBeDefined()
    expect(userMessage?.content).toBe('What is the difference between let and const?')
  })

  it('specifies concise answer requirement', () => {
    const messages = buildAssistantPrompt(baseInput)
    const systemMessage = messages.find(m => m.role === 'system')

    expect(systemMessage?.content).toContain('200 words')
    expect(systemMessage?.content).toContain('concise')
  })
})
