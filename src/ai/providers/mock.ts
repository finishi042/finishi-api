/**
 * Mock AI Provider — for development/testing without burning API credits.
 */

import type {
  AIProvider,
  AICompletionRequest,
  AICompletionResponse,
  LessonPersonalizationInput,
  LessonPersonalizationOutput,
  CapstoneGradingInput,
  CapstoneGradingOutput,
  AssistantInput,
  AssistantOutput,
} from '../types.js'

export class MockAIProvider implements AIProvider {
  readonly name = 'mock' as const

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const lastMessage = request.messages[request.messages.length - 1]
    return {
      content: `[Mock AI Response] Received: "${lastMessage.content.slice(0, 100)}..."`,
      provider: 'mock',
      model: 'mock-v1',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    }
  }

  async personalizaLesson(input: LessonPersonalizationInput): Promise<LessonPersonalizationOutput> {
    return {
      title: `Understanding ${input.concept}`,
      explanation: `This is a mock lesson about **${input.concept}**.\n\n${input.conceptDescription}\n\nThis content would be AI-personalized for a ${input.experienceLevel} learner in production.`,
      example: input.examples[0] || `Here's a real-world example of ${input.concept} in action.`,
      keyTakeaway: `The key thing to remember about ${input.concept} is its practical application.`,
      reflection: `Try applying ${input.concept} to something you're working on today.`,
    }
  }

  async gradeCapstone(input: CapstoneGradingInput): Promise<CapstoneGradingOutput> {
    const scores: Record<string, { score: number; maxScore: number; feedback: string }> = {}
    for (const criterion of input.rubricCriteria) {
      const maxScore = Math.max(...criterion.levels.map((l) => l.score))
      scores[criterion.name] = {
        score: Math.round(maxScore * 0.75),
        maxScore,
        feedback: `[Mock] Your work on ${criterion.name} shows promise. Consider reviewing the rubric for areas to strengthen.`,
      }
    }
    return {
      scores,
      overallFeedback: '[Mock] This is a solid submission. In production, you would receive detailed AI feedback graded against the expert rubric.',
      overallStatus: 'improving',
    }
  }

  async assistantChat(input: AssistantInput): Promise<AssistantOutput> {
    return {
      answer: `[Mock] Great question about "${input.conceptName}"! In production, the AI assistant would provide a contextual answer based on the lesson content. Your question was: "${input.question}"`,
    }
  }
}
