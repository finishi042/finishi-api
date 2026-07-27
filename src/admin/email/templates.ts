/**
 * Public template API consumed by route handlers.
 *
 * Each function accepts a typed data object and returns { subject, html }.
 * The actual HTML is produced by Handlebars templates in ./templates/*.hbs —
 * edit those files to change email copy/layout without touching TypeScript.
 */

import { renderTemplate } from './renderer.js'

// ── Waitlist invite ───────────────────────────────────────────────────────

export interface InviteTemplateData {
  name?: string
  message: string
  skill?: string
  ctaUrl: string
}

export function inviteTemplate(data: InviteTemplateData): { subject: string; html: string } {
  return {
    subject: "You're invited to Finishi 🎉",
    html: renderTemplate('invite', {
      name: data.name,
      message: data.message,
      skill: data.skill,
      ctaUrl: data.ctaUrl,
    }),
  }
}

// ── General / custom email ────────────────────────────────────────────────

export interface GeneralTemplateData {
  subject: string
  message: string
  ctaLabel?: string
  ctaUrl?: string
  name?: string
}

export function generalTemplate(data: GeneralTemplateData): { subject: string; html: string } {
  return {
    subject: data.subject,
    html: renderTemplate('general', {
      subject: data.subject,
      name: data.name,
      message: data.message,
      ctaLabel: data.ctaLabel,
      ctaUrl: data.ctaUrl,
    }),
  }
}

// ── Welcome / onboarding ──────────────────────────────────────────────────

export interface WelcomeTemplateData {
  name: string
  skill?: string
  ctaUrl: string
}

export function welcomeTemplate(data: WelcomeTemplateData): { subject: string; html: string } {
  return {
    subject: `Welcome to Finishi, ${data.name}! 🚀`,
    html: renderTemplate('welcome', {
      name: data.name,
      skill: data.skill,
      ctaUrl: data.ctaUrl,
    }),
  }
}
