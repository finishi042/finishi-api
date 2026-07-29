/**
 * Handlebars-based email renderer.
 *
 * Template files live in ./templates/*.hbs and are loaded once then cached.
 * The shared layout partial (layout.hbs) wraps every template body.
 *
 * Available context variables per template:
 *
 *  layout.hbs  — subject, year, body (injected automatically)
 *  invite.hbs  — name?, message, skill?, ctaUrl
 *  welcome.hbs — name, skill?, ctaUrl
 *  general.hbs — name?, message, ctaLabel?, ctaUrl?
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import Handlebars from 'handlebars'

// ── Path resolution (ESM-safe) ────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url)
const __dir = dirname(__filename)
const TEMPLATES_DIR = join(__dir, 'templates')

// ── Compiled-template cache ───────────────────────────────────────────────

const cache = new Map<string, HandlebarsTemplateDelegate>()

function load(name: string): HandlebarsTemplateDelegate {
  const cached = cache.get(name)
  if (cached) return cached

  const src = readFileSync(join(TEMPLATES_DIR, `${name}.hbs`), 'utf8')
  const compiled = Handlebars.compile(src)
  cache.set(name, compiled)
  return compiled
}

// ── Layout partial ────────────────────────────────────────────────────────

let layoutFn: HandlebarsTemplateDelegate | null = null

function getLayout(): HandlebarsTemplateDelegate {
  if (layoutFn) return layoutFn
  const src = readFileSync(join(TEMPLATES_DIR, 'layout.hbs'), 'utf8')
  layoutFn = Handlebars.compile(src)
  return layoutFn
}

// ── Handlebars helpers ────────────────────────────────────────────────────

// Register once — safe to call multiple times
Handlebars.registerHelper('eq', (a: unknown, b: unknown) => a === b)
Handlebars.registerHelper('or', (a: unknown, b: unknown) => a || b)

// ── Public render API ─────────────────────────────────────────────────────

export type TemplateName = 'invite' | 'welcome' | 'general' | 'otp'

export interface RenderContext {
  // Layout / shared
  subject?: string
  year?: number
  // Personalisation
  name?: string
  // Content
  message?: string
  skill?: string
  ctaUrl?: string
  ctaLabel?: string
  // OTP
  otp?: string
}

/**
 * Templates that ship their own full HTML document and skip the shared layout.
 */
const STANDALONE_TEMPLATES: ReadonlySet<TemplateName> = new Set(['welcome'])

/**
 * Render a named template into a full HTML email string.
 *
 * @param template  One of 'invite' | 'welcome' | 'general' | 'otp'
 * @param ctx       Variables injected into both the body template and the layout
 * @returns         Complete HTML document as a string
 */
export function renderTemplate(template: TemplateName, ctx: RenderContext): string {
  const bodyCtx = { ...ctx, year: ctx.year ?? new Date().getFullYear() }

  // Render the body fragment
  const bodyHtml = load(template)(bodyCtx)

  // Standalone templates include their own <html> wrapper
  if (STANDALONE_TEMPLATES.has(template)) {
    return bodyHtml
  }

  // Wrap in the shared layout
  return getLayout()({ ...bodyCtx, body: bodyHtml })
}

/**
 * Clear the in-memory cache. Useful in tests or when templates are hot-reloaded.
 */
export function clearTemplateCache(): void {
  cache.clear()
  layoutFn = null
}
