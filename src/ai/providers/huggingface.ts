/**
 * HuggingFace Inference API Provider Implementation
 * Uses the free Inference API (serverless) — no GPU costs for low-volume usage.
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

export class HuggingFaceProvider implements AIProvider {
  readonly name = 'huggingface' as const
  private config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = this.config.model || 'mistralai/Mistral-7B-Instruct-v0.3'
    const baseUrl = this.config.baseUrl || 'https://api-inference.huggingface.co/models'
    const url = `${baseUrl}/${model}/v1/chat/completions`

    const body = {
      model,
      messages: request.messages,
      max_tokens: request.maxTokens ?? this.config.maxTokens ?? 2048,
      temperature: request.temperature ?? this.config.temperature ?? 0.7,
      stream: false,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`HuggingFace API error (${response.status}): ${errorText}`)
    }

    const data = await response.json() as {
      choices: { message: { content: string } }[]
      model: string
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    return {
      content: data.choices[0].message.content,
      provider: 'huggingface',
      model,
      usage: data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : undefined,
    }
  }

  async personalizaLesson(input: LessonPersonalizationInput): Promise<LessonPersonalizationOutput> {
    const messages = buildLessonPersonalizationPrompt(input)
    const response = await this.complete({ messages, temperature: 0.7 })

    // HuggingFace models may not always produce clean JSON — attempt extraction
    const content = this.extractJson(response.content)
    return JSON.parse(content) as LessonPersonalizationOutput
  }

  async gradeCapstone(input: CapstoneGradingInput): Promise<CapstoneGradingOutput> {
    const messages = buildCapstoneGradingPrompt(input)
    const response = await this.complete({ messages, temperature: 0.3 })
    const content = this.extractJson(response.content)
    return JSON.parse(content) as CapstoneGradingOutput
  }

  async assistantChat(input: AssistantInput): Promise<AssistantOutput> {
    const messages = buildAssistantPrompt(input)
    const response = await this.complete({ messages, temperature: 0.6, maxTokens: 512 })
    return { answer: response.content }
  }

  /** Attempt to extract JSON from responses that may include markdown fences */
  private extractJson(text: string): string {
    // Try to find JSON within code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (fenceMatch) return fenceMatch[1].trim()

    // Try to find raw JSON object
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) return jsonMatch[0]

    return text
  }
}
