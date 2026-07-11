/**
 * Admin notification emitter — convenience functions called by other services
 * to generate admin notifications when key platform events happen.
 *
 * All functions are fire-and-forget (catch errors silently) so they never
 * break the calling flow.
 */
import { createAdminNotification } from './service.js'

export function notifyAdminUserSignup(userId: string, email: string, fullName?: string): void {
  createAdminNotification({
    type: 'user',
    title: 'New user registered',
    body: `${fullName ?? email} just joined the platform.`,
    ref_type: 'user',
    ref_id: userId,
  }).catch(() => {})
}

export function notifyAdminPlanChange(userId: string, email: string, plan: string): void {
  createAdminNotification({
    type: 'plan',
    title: 'Plan upgrade',
    body: `${email} upgraded to ${plan}.`,
    ref_type: 'subscription',
    ref_id: userId,
  }).catch(() => {})
}

export function notifyAdminLessonPublished(lessonId: string, title: string): void {
  createAdminNotification({
    type: 'lesson',
    title: 'Lesson published',
    body: `"${title}" is now live and available to learners.`,
    ref_type: 'lesson',
    ref_id: lessonId,
  }).catch(() => {})
}

export function notifyAdminWaitlistSubmission(email: string, name?: string): void {
  createAdminNotification({
    type: 'waitlist',
    title: 'New waitlist signup',
    body: `${name ?? email} submitted a waitlist request.`,
    ref_type: 'waitlist',
    ref_id: email,
  }).catch(() => {})
}

export function notifyAdminEventCreated(eventId: string, title: string): void {
  createAdminNotification({
    type: 'event',
    title: 'New event created',
    body: `"${title}" has been added to the platform.`,
    ref_type: 'event',
    ref_id: eventId,
  }).catch(() => {})
}

export function notifyAdminWarning(title: string, body: string): void {
  createAdminNotification({
    type: 'warning',
    title,
    body,
  }).catch(() => {})
}
