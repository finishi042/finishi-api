import { z } from 'zod'

// ── Valid option constants ─────────────────────────────────────────────────

export const SKILL_OPTIONS = [
  'UI/UX Design', 'Programming', 'Artificial Intelligence', 'Data Science',
  'Cloud Computing', 'Cybersecurity', 'Marketing', 'Business', 'Finance',
  'Mobile Dev', 'Web Development', 'Content Creation', 'Photography',
  'Video Editing', 'Music', 'Languages', 'Other',
] as const

export const GOAL_OPTIONS = [
  'Get a Job', 'Grow My Career', 'Start a Business', 'School',
  'Earn a Certificate', 'Personal Growth', 'Freelancing', 'Become an Expert',
] as const

export const SKILL_LEVEL_OPTIONS = [
  'Beginner', 'Intermediate', 'Advanced', 'Professional',
] as const

export const LEARNING_STYLE_OPTIONS = [
  'Video Lessons', 'Reading', 'Audio', 'Notes',
  'Flashcards', 'Practice Quizzes', 'Hands-on Projects', 'AI Conversations',
] as const

export const CHALLENGE_OPTIONS = [
  'I procrastinate', 'I get distracted', 'I lose motivation',
  'Courses feel overwhelming', "I don't understand difficult topics",
  "I don't have enough time", 'I forget what I learn', 'I never finish courses',
] as const

export const REMINDER_TIME_OPTIONS = [
  'Morning', 'Afternoon', 'Evening', 'Night', "I'll Decide Later",
] as const

export const VOICE_OPTIONS = [
  'calm_female', 'friendly_female', 'professional_male', 'friendly_male',
] as const

export const VOICE_SPEED_OPTIONS = ['slow', 'normal', 'fast'] as const

// ── Input Schemas ──────────────────────────────────────────────────────────

/** Submit the full onboarding data in one request */
export const SubmitOnboardingSchema = z.object({
  selected_skills: z.array(z.string()).min(1, 'Select at least one skill'),
  learning_goal: z.enum(GOAL_OPTIONS),
  skill_level: z.enum(SKILL_LEVEL_OPTIONS),
  learning_styles: z.array(z.enum(LEARNING_STYLE_OPTIONS)).min(1, 'Select at least one style'),
  challenges: z.array(z.enum(CHALLENGE_OPTIONS)).min(1, 'Select at least one challenge'),
  daily_commitment_mins: z.number().int().min(5).max(120).default(10),
  reminder_time: z.enum(REMINDER_TIME_OPTIONS),
  ai_voice: z.enum(VOICE_OPTIONS).default('calm_female'),
  voice_read_responses: z.boolean().default(true),
  voice_read_summaries: z.boolean().default(true),
  voice_conversations: z.boolean().default(true),
  voice_speed: z.enum(VOICE_SPEED_OPTIONS).default('normal'),
  notif_daily_reminder: z.boolean().default(true),
  notif_streak: z.boolean().default(true),
  notif_achievements: z.boolean().default(false),
  notif_suggestions: z.boolean().default(false),
  notif_weekly_report: z.boolean().default(false),
  notifications_allowed: z.boolean().default(false),
}).strict()

/** Save partial progress (auto-save as user moves through steps) */
export const SaveOnboardingProgressSchema = z.object({
  current_step: z.number().int().min(1).max(13),
  selected_skills: z.array(z.string()).optional(),
  learning_goal: z.enum(GOAL_OPTIONS).optional(),
  skill_level: z.enum(SKILL_LEVEL_OPTIONS).optional(),
  learning_styles: z.array(z.enum(LEARNING_STYLE_OPTIONS)).optional(),
  challenges: z.array(z.enum(CHALLENGE_OPTIONS)).optional(),
  daily_commitment_mins: z.number().int().min(5).max(120).optional(),
  reminder_time: z.enum(REMINDER_TIME_OPTIONS).optional(),
  ai_voice: z.enum(VOICE_OPTIONS).optional(),
  voice_read_responses: z.boolean().optional(),
  voice_read_summaries: z.boolean().optional(),
  voice_conversations: z.boolean().optional(),
  voice_speed: z.enum(VOICE_SPEED_OPTIONS).optional(),
  notif_daily_reminder: z.boolean().optional(),
  notif_streak: z.boolean().optional(),
  notif_achievements: z.boolean().optional(),
  notif_suggestions: z.boolean().optional(),
  notif_weekly_report: z.boolean().optional(),
  notifications_allowed: z.boolean().optional(),
}).strict()

// ── Output Schemas ─────────────────────────────────────────────────────────

export const OnboardingStatusOutput = z.object({
  completed: z.boolean(),
  current_step: z.number(),
  data: z.object({
    selected_skills: z.array(z.string()),
    learning_goal: z.string().nullable(),
    skill_level: z.string().nullable(),
    learning_styles: z.array(z.string()),
    challenges: z.array(z.string()),
    daily_commitment_mins: z.number(),
    reminder_time: z.string().nullable(),
    ai_voice: z.string(),
    voice_read_responses: z.boolean(),
    voice_read_summaries: z.boolean(),
    voice_conversations: z.boolean(),
    voice_speed: z.string(),
    notif_daily_reminder: z.boolean(),
    notif_streak: z.boolean(),
    notif_achievements: z.boolean(),
    notif_suggestions: z.boolean(),
    notif_weekly_report: z.boolean(),
    notifications_allowed: z.boolean(),
    weekly_goal_mins: z.number(),
    estimated_completion_weeks: z.number(),
  }).nullable(),
})

export const OnboardingCompleteOutput = z.object({
  completed: z.literal(true),
  learning_goal: z.string(),
  daily_goal: z.number(),
  weekly_goal: z.number(),
  skill_level: z.string(),
  preferred_style: z.string(),
  biggest_challenge: z.string(),
  study_time: z.string(),
  estimated_completion_weeks: z.number(),
  ai_voice: z.string(),
})

// ── Types ──────────────────────────────────────────────────────────────────

export type SubmitOnboardingInput = z.infer<typeof SubmitOnboardingSchema>
export type SaveOnboardingProgressInput = z.infer<typeof SaveOnboardingProgressSchema>
export type OnboardingStatusResponse = z.infer<typeof OnboardingStatusOutput>
export type OnboardingCompleteResponse = z.infer<typeof OnboardingCompleteOutput>
