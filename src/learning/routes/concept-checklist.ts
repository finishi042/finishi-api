import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'

/**
 * F5: Progress — Per-Concept Checklist
 *
 * Returns a done/in-progress checklist per concept, paired with qualitative labels.
 * Replaces the percentage-based progress with structured tracking.
 */
const conceptChecklistRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /concept-checklist?skill_id=<uuid>
   * Returns per-concept progress with qualitative status labels.
   */
  fastify.get('/concept-checklist', wrapHandler('Failed to fetch concept checklist', async (request, reply) => {
    const userId = request.user!.id
    const { skill_id } = request.query as { skill_id?: string }

    if (!skill_id) {
      return reply.code(400).send(formatError('skill_id query parameter is required', 'VALIDATION_ERROR'))
    }

    // Get all concept nodes for the skill
    const { data: nodes, error: nodesErr } = await request.supabase
      .from('skill_graph_nodes')
      .select('id, concept, description, difficulty, order_index')
      .eq('skill_id', skill_id)
      .order('order_index', { ascending: true })

    if (nodesErr) throw nodesErr
    if (!nodes || nodes.length === 0) {
      return reply.code(404).send(formatError('No skill graph found'))
    }

    // Get mastery records for this user
    const nodeIds = nodes.map((n) => n.id)
    const { data: masteryRecords } = await request.supabase
      .from('mastery')
      .select('node_id, status, last_reviewed_at')
      .eq('user_id', userId)
      .in('node_id', nodeIds)

    const masteryMap = new Map((masteryRecords ?? []).map((m) => [m.node_id, m]))

    // Build checklist
    const checklist = nodes.map((node) => {
      const mastery = masteryMap.get(node.id)
      const status = mastery?.status || 'not_started'

      // Map internal status to user-facing label
      let displayStatus: 'done' | 'in_progress' | 'not_started'
      let qualitativeLabel: string | null = null

      if (status === 'strong') {
        displayStatus = 'done'
        qualitativeLabel = 'Strong'
      } else if (status === 'improving') {
        displayStatus = 'done'
        qualitativeLabel = 'Improving'
      } else if (status === 'in_progress' || status === 'needs_practice') {
        displayStatus = 'in_progress'
        qualitativeLabel = status === 'needs_practice' ? 'Needs Practice' : null
      } else {
        displayStatus = 'not_started'
      }

      return {
        node_id: node.id,
        concept: node.concept,
        description: node.description,
        difficulty: node.difficulty,
        order_index: node.order_index,
        status: displayStatus,
        qualitative_label: qualitativeLabel,
        last_reviewed_at: mastery?.last_reviewed_at || null,
      }
    })

    // Summary stats
    const done = checklist.filter((c) => c.status === 'done').length
    const inProgress = checklist.filter((c) => c.status === 'in_progress').length
    const notStarted = checklist.filter((c) => c.status === 'not_started').length
    const total = checklist.length

    // Finish rate indicator: days remaining estimate
    const remaining = inProgress + notStarted
    const estimatedDaysLeft = remaining // 1 concept per day

    return reply.send(formatResponse({
      checklist,
      summary: {
        total,
        done,
        in_progress: inProgress,
        not_started: notStarted,
        estimated_days_remaining: estimatedDaysLeft,
        finish_rate: total > 0 ? Math.round((done / total) * 100) : 0,
      },
    }))
  }))

  /**
   * GET /progress/overview — Combined progress view (streak + checklist summary + finish rate)
   * This is the dashboard-friendly endpoint.
   */
  fastify.get('/progress/overview', wrapHandler('Failed to fetch progress overview', async (request, reply) => {
    const userId = request.user!.id

    // Get user streak
    const { data: streak } = await request.supabase
      .from('user_streaks')
      .select('*')
      .eq('user_id', userId)
      .single()

    // Get all active learning paths
    const { data: paths } = await request.supabase
      .from('learning_paths')
      .select('id, skill_id, skill_name, experience_level, started_at, estimated_finish_date, completed_at')
      .eq('user_id', userId)
      .eq('personalized', true)

    // For each path, get basic mastery counts
    const pathSummaries = await Promise.all((paths ?? []).map(async (path) => {
      const { data: nodes } = await request.supabase
        .from('skill_graph_nodes')
        .select('id')
        .eq('skill_id', path.skill_id)

      const nodeIds = (nodes ?? []).map((n) => n.id)
      if (nodeIds.length === 0) return { ...path, done: 0, total: 0 }

      const { data: mastery } = await request.supabase
        .from('mastery')
        .select('status')
        .eq('user_id', userId)
        .in('node_id', nodeIds)

      const done = (mastery ?? []).filter((m) => m.status === 'strong' || m.status === 'improving').length

      return {
        ...path,
        done,
        total: nodeIds.length,
        finish_rate: nodeIds.length > 0 ? Math.round((done / nodeIds.length) * 100) : 0,
      }
    }))

    // Lesson attempt stats
    const { data: attempts } = await request.supabase
      .from('lesson_attempts')
      .select('time_spent_secs, completed')
      .eq('user_id', userId)

    const totalTimeMins = Math.round((attempts ?? []).reduce((sum, a) => sum + (a.time_spent_secs || 0), 0) / 60)
    const totalCompleted = (attempts ?? []).filter((a) => a.completed).length

    return reply.send(formatResponse({
      streak: streak ?? { current_streak: 0, longest_streak: 0 },
      paths: pathSummaries,
      total_time_mins: totalTimeMins,
      total_lessons_completed: totalCompleted,
    }))
  }))
}

export default conceptChecklistRoutes
