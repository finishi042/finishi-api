import { z } from 'zod'

// ── Input Schemas ─────────────────────────────────────────────────────────

export const SignupSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .refine(
      (val) => /[A-Z]/.test(val),
      'Password must contain at least one uppercase letter'
    )
    .refine(
      (val) => /[a-z]/.test(val),
      'Password must contain at least one lowercase letter'
    )
    .refine(
      (val) => /[0-9]/.test(val),
      'Password must contain at least one number'
    )
    .refine(
      (val) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val),
      'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)'
    ),
  full_name: z.string().min(1).max(120).trim().optional(),
}).strict()

export const LoginSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  password: z.string().min(1).max(128),
}).strict()

// Password complexity: min 8 chars, at least 1 uppercase, 1 lowercase, 1 number, 1 special char
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must not exceed 128 characters')
  .refine(
    (val) => /[A-Z]/.test(val),
    'Password must contain at least one uppercase letter'
  )
  .refine(
    (val) => /[a-z]/.test(val),
    'Password must contain at least one lowercase letter'
  )
  .refine(
    (val) => /[0-9]/.test(val),
    'Password must contain at least one number'
  )
  .refine(
    (val) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(val),
    'Password must contain at least one special character (!@#$%^&*()_+-=[]{};\':"|,.<>/?)'
  )

export const ForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
}).strict()

export const VerifyOtpSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be 6 digits'),
}).strict()

export const ResetPasswordSchema = z.object({
  email: z.string().email('Invalid email address').max(254),
  otp: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must be 6 digits'),
  password: passwordSchema,
}).strict()

export const UpdatePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: passwordSchema,
}).strict()

export { passwordSchema }

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

export const ForgotPasswordOutput = z.object({
  message: z.string(),
})

export const VerifyOtpOutput = z.object({
  valid: z.boolean(),
  message: z.string(),
})

export const ResetPasswordOutput = z.object({
  message: z.string(),
})

export const UpdatePasswordOutput = z.object({
  message: z.string(),
})

export const MeOutput = AuthUserOutput

// ── Types ─────────────────────────────────────────────────────────────────

export type SignupInput = z.infer<typeof SignupSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type AuthUserResponse = z.infer<typeof AuthUserOutput>
