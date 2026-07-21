/**
 * Groq Provider Implementation
 *
 * Uses Groq's OpenAI-compatible API for ultra-fast inference.
 * Free tier: ~6,000 requests/day on smaller models.
 * Hosts Llama 3, Mixtral, Gemma.
 */

import type {
  AIProvider,
  AIProviderConfig,
  AICompletionRequest,
  AICompletionResponse,
  LessonPersonalizationInput,
  LessonPersonalizationOutput,
  CapstoneGradingInput,
  CapstoneGradingOutput,
  AssistantInput,
  AssistantOutput,
} from '../types.js'
import {
  buildLessonPersonalizationPrompt,
  buildCapstoneGradingPrompt,
  buildAssistantPrompt,
} from '../prompts.js'
import { monitoredFetch } from '../../monitoring/tracked-fetch.js'

export class GroqProvider implements AIProvider {
  readonly name = 'groq' as const
  private config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = this.config.model || 'llama-3.1-70b-versatile'
    const url = `${this.config.baseUrl || 'https://api.groq.com/openai/v1'}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 2048,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
    }

    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' }
    }

    const response = await monitoredFetch('groq', url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Groq API error (${response.status}): ${errorText}`)
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[]
      model: string
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    return {
      content: data.choices[0].message.content,
      provider: 'groq',
      model: data.model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }
  }

  async personalizaLesson(input: LessonPersonalizationInput): Promise<LessonPersonalizationOutput> {
    const messages = buildLessonPersonalizationPrompt(input)
    const response = await this.complete({ messages, responseFormat: 'json', temperature: 0.7 })
    return JSON.parse(response.content) as LessonPersonalizationOutput
  }

  async gradeCapstone(input: CapstoneGradingInput): Promise<CapstoneGradingOutput> {
    const messages = buildCapstoneGradingPrompt(input)
    const response = await this.complete({ messages, responseFormat: 'json', temperature: 0.3 })
    return JSON.parse(response.content) as CapstoneGradingOutput
  }

  async assistantChat(input: AssistantInput): Promise<AssistantOutput> {
    const messages = buildAssistantPrompt(input)
    const response = await this.complete({ messages, temperature: 0.6, maxTokens: 512 })
    return { answer: response.content }
  }
}
