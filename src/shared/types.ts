import type { User as SupabaseUser } from '@supabase/supabase-js'

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  USER = 'user',
}

export interface AuthUser extends SupabaseUser {
  role?: UserRole
  app_metadata: { role?: UserRole; [key: string]: unknown }
  user_metadata: { [key: string]: unknown }
}

export interface JWTPayload {
  sub: string
  email?: string
  role?: UserRole
  aud: string
  exp: number
  iat: number
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: { message: string; code?: string }
  meta?: { page?: number; limit?: number; total?: number }
}

export interface PaginationParams {
  page?: number
  limit?: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}
