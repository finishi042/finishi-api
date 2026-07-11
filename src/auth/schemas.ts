import { z } from 'zod'

// ── Input Schemas ─────────────────────────────────────────────────────────

export const SignupSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  full_name: z.string().min(1).max(120).trim().optional(),
}).strict()

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: z.string().min(1).max(128),
}).strict()

// ── Output Schemas ────────────────────────────────────────────────────────
// These define the exact shape returned to clients, stripping any internal fields.

export const AuthUserOutput = z.object({
  user_id: z.string().uuid(),
  email: z.string().email(),
  full_name: z.string().nullable(),
  avatar_url: z.string().url().nullable().optional(),
})

export const SignupOutput = AuthUserOutput.pick({
  user_id: true,
  email: true,
  full_name: true,
})

export const LoginOutput = AuthUserOutput

export const LogoutOutput = z.object({
  logged_out: z.literal(true),
})

export const RefreshOutput = z.object({
  refreshed: z.literal(true),
})

export const MeOutput = AuthUserOutput

// ── Types ─────────────────────────────────────────────────────────────────

export type SignupInput = z.infer<typeof SignupSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type AuthUserResponse = z.infer<typeof AuthUserOutput>
