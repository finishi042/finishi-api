/**
 * Shared prompt templates for AI features.
 * Kept separate so they're reusable across providers.
 */

import type {
  LessonPersonalizationInput,
  CapstoneGradingInput,
  AssistantInput,
  AIMessage,
} from './types.js'

// ─── Lesson Personalization ────────────────────────────────────────────────

export function buildLessonPersonalizationPrompt(input: LessonPersonalizationInput): AIMessage[] {
  const levelDescriptions = {
    beginner: 'This learner is a beginner — use simple language, avoid jargon, provide step-by-step explanations.',
    intermediate: 'This learner has some experience — you can use industry terms but explain nuanced concepts.',
    advanced: 'This learner is advanced — be concise, focus on edge cases, deeper insights, and expert-level applications.',
  }

  return [
    {
      role: 'system',
      content: `You are an expert instructor creating a focused 10-minute micro-lesson. 
${levelDescriptions[input.experienceLevel]}

You must output valid JSON with exactly these fields:
- title: A compelling lesson title (max 80 chars)
- explanation: The core teaching content (300-500 words, markdown allowed)
- example: A real-world application example (100-200 words)
- keyTakeaway: A concise summary (1-2 sentences)
- reflection: One actionable item the learner can do today (1-2 sentences)

Common misconceptions to address if relevant: ${input.misconceptions.join(', ') || 'None specified'}`,
    },
    {
      role: 'user',
      content: `Create a lesson about: "${input.concept}"

Concept description: ${input.conceptDescription}

Reference examples to draw from: ${input.examples.join('\n') || 'Use your own relevant examples'}

${input.previousContext ? `Context from previous lessons: ${input.previousContext}` : ''}

Output JSON only, no markdown code fences.`,
    },
  ]
}

// ─── Capstone Grading ──────────────────────────────────────────────────────

export function buildCapstoneGradingPrompt(input: CapstoneGradingInput): AIMessage[] {
  const rubricText = input.rubricCriteria.map((c) =>
    `- ${c.name} (weight: ${c.weight}): ${c.description}\n  Levels: ${c.levels.map((l) => `${l.label}(${l.score}): ${l.description}`).join(' | ')}`
  ).join('\n')

  return [
    {
      role: 'system',
      content: `You are an expert grader for a "${input.skillName}" capstone project.
Grade the submission against the provided rubric. Be fair, specific, and constructive.

Output valid JSON with exactly these fields:
- scores: An object where each key is a criterion name, and the value is { "score": number, "maxScore": number, "feedback": "specific feedback" }
- overallFeedback: A 2-3 sentence qualitative summary of the work
- overallStatus: One of "strong", "improving", or "needs_practice"

Rubric:
${rubricText}`,
    },
    {
      role: 'user',
      content: `Project prompt: ${input.projectPrompt}

Learner's submission:
---
${input.submission}
---

Grade this submission. Output JSON only, no markdown code fences.`,
    },
  ]
}

// ─── AI Assistant ──────────────────────────────────────────────────────────

export function buildAssistantPrompt(input: AssistantInput): AIMessage[] {
  return [
    {
      role: 'system',
      content: `You are a helpful learning assistant for a micro-learning platform. The learner is studying "${input.conceptName}" at the ${input.experienceLevel} level.

Keep answers concise (under 200 words), friendly, and focused on the current lesson. If asked something outside the lesson scope, gently redirect.

Current lesson content for context:
${input.lessonContext}`,
    },
    {
      role: 'user',
      content: input.question,
    },
  ]
}
