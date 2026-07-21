/**
 * OpenRouter Provider Implementation
 *
 * One API, hundreds of models. OpenAI-compatible format.
 * Acts as an aggregator — switch models without changing code.
 * Some models have free tiers; paid usage is very affordable.
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

export class OpenRouterProvider implements AIProvider {
  readonly name = 'openrouter' as const
  private config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = this.config.model || 'meta-llama/llama-3.1-70b-instruct:free'
    const url = `${this.config.baseUrl || 'https://openrouter.ai/api/v1'}/chat/completions`

    const body: Record<string, unknown> = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 2048,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
    }

    if (request.responseFormat === 'json') {
      body.response_format = { type: 'json_object' }
    }

    const response = await monitoredFetch('openrouter', url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'HTTP-Referer': 'https://finishi.app',
        'X-Title': 'Finishi',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error (${response.status}): ${errorText}`)
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[]
      model: string
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    return {
      content: data.choices[0].message.content,
      provider: 'openrouter',
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
