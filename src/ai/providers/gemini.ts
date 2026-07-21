/**
 * Google Gemini Provider Implementation
 *
 * Uses the Gemini REST API (generativelanguage.googleapis.com).
 * Free tier: 15 RPM, 1M+ tokens/day on Gemini 2.0 Flash.
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

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini' as const
  private config: AIProviderConfig

  constructor(config: AIProviderConfig) {
    this.config = config
  }

  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const model = this.config.model || 'gemini-2.0-flash'
    const baseUrl = this.config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
    const url = `${baseUrl}/models/${model}:generateContent?key=${this.config.apiKey}`

    // Convert messages to Gemini format
    const systemInstruction = request.messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n')

    const contents = request.messages
      .filter((m) => m.role !== 'system')
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? this.config.maxTokens ?? 2048,
        temperature: request.temperature ?? this.config.temperature ?? 0.7,
      },
    }

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] }
    }

    if (request.responseFormat === 'json') {
      (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json'
    }

    const response = await monitoredFetch('gemini', url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Gemini API error (${response.status}): ${errorText}`)
    }

    const data = await response.json() as {
      candidates: { content: { parts: { text: string }[] } }[]
      usageMetadata?: {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
      }
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    return {
      content,
      provider: 'gemini',
      model,
      usage: data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
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
