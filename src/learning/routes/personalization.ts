import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, formatError, wrapHandler } from '../../shared/handler.js'

/**
 * F3: Personalization Engine
 *
 * Rule-based next-lesson selection wired to the skill graph.
 * Logic: walks the concept graph, picks the highest-priority node whose
 * prerequisites are all met (mastery status != 'not_started') and that
 * the user hasn't completed yet. AI personalizes the lesson content.
 */
const personalizationRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /next-lesson?skill_id=<uuid>
   * Returns the next lesson for the user, personalized via AI.
   * If a generated lesson already exists for today's concept, returns it.
   * Otherwise generates a new one.
   */
  fastify.get('/next-lesson', wrapHandler('Failed to get next lesson', async (request, reply) => {
    const userId = request.user!.id
    const { skill_id } = request.query as { skill_id?: string }

    if (!skill_id) {
      return reply.code(400).send(formatError('skill_id query parameter is required', 'VALIDATION_ERROR'))
    }

    // 1. Get user's learning path for this skill
    const { data: path } = await request.supabase
      .from('learning_paths')
      .select('*')
      .eq('user_id', userId)
      .eq('skill_id', skill_id)
      .single()

    const experienceLevel = (path?.experience_level || 'beginner') as 'beginner' | 'intermediate' | 'advanced'

    // 2. Get all concept nodes for this skill, ordered by priority
    const { data: nodes, error: nodesErr } = await request.supabase
      .from('skill_graph_nodes')
      .select('*')
      .eq('skill_id', skill_id)
      .order('order_index', { ascending: true })

    if (nodesErr) throw nodesErr
    if (!nodes || nodes.length === 0) {
      return reply.code(404).send(formatError('No skill graph found for this skill'))
    }

    // 3. Get user's mastery state for all nodes in this skill
    const nodeIds = nodes.map((n) => n.id)
    const { data: masteryRecords } = await request.supabase
      .from('mastery')
      .select('*')
      .eq('user_id', userId)
      .in('node_id', nodeIds)

    const masteryMap = new Map((masteryRecords ?? []).map((m) => [m.node_id, m.status]))

    // 4. Find the next node — first incomplete node whose prerequisites are satisfied
    const completedStatuses = new Set(['strong', 'improving'])
    const inProgressStatuses = new Set(['in_progress', 'needs_practice'])
    const completedNodeIds = new Set(
      (masteryRecords ?? [])
        .filter((m) => completedStatuses.has(m.status) || inProgressStatuses.has(m.status))
        .map((m) => m.node_id)
    )

    let nextNode = null
    for (const node of nodes) {
      const status = masteryMap.get(node.id) || 'not_started'

      // Skip nodes already marked strong
      if (status === 'strong') continue

      // Check prerequisites are met (all prereqs must be at least in_progress)
      const prereqs: string[] = node.prerequisites || []
      const prereqsMet = prereqs.every((prereqId: string) => completedNodeIds.has(prereqId))

      if (prereqsMet) {
        nextNode = node
        break
      }
    }

    // If all nodes are strong, the skill is complete — indicate that
    if (!nextNode) {
      return reply.send(formatResponse({
        complete: true,
        message: 'All concepts mastered! Ready for the capstone project.',
        total_nodes: nodes.length,
        mastered_nodes: nodes.filter((n) => masteryMap.get(n.id) === 'strong').length,
      }))
    }

    // 5. Check if there's already a generated lesson for this node
    const { data: existingLesson } = await request.supabase
      .from('lessons')
      .select('*')
      .eq('node_id', nextNode.id)
      .eq('skill_id', skill_id)
      .limit(1)
      .single()

    if (existingLesson) {
      return reply.send(formatResponse({
        complete: false,
        lesson: existingLesson,
        node: nextNode,
        experience_level: experienceLevel,
        progress: {
          current_index: nextNode.order_index + 1,
          total_nodes: nodes.length,
          mastered: nodes.filter((n) => masteryMap.get(n.id) === 'strong').length,
        },
      }))
    }

    // 6. Generate a personalized lesson using AI
    const ai = request.server.ai
    const previousConcepts = nodes
      .filter((n) => n.order_index < nextNode!.order_index && completedNodeIds.has(n.id))
      .map((n) => n.concept)
      .join(', ')

    const personalized = await ai.personalizaLesson({
      concept: nextNode.concept,
      conceptDescription: nextNode.description || '',
      misconceptions: nextNode.misconceptions || [],
      examples: nextNode.examples || [],
      experienceLevel,
      previousContext: previousConcepts || undefined,
    })

    // 7. Store the generated lesson
    const { data: newLesson, error: lessonErr } = await request.supabase
      .from('lessons')
      .insert({
        title: personalized.title,
        skill_name: (await request.supabase.from('skills').select('name').eq('id', skill_id).single()).data?.name || '',
        skill_id,
        node_id: nextNode.id,
        description: personalized.keyTakeaway,
        duration_mins: 10,
        day_number: nextNode.order_index + 1,
        status: 'published',
        content: JSON.stringify({
          explanation: personalized.explanation,
          example: personalized.example,
          key_takeaway: personalized.keyTakeaway,
          reflection: personalized.reflection,
        }),
      })
      .select()
      .single()

    if (lessonErr) throw lessonErr

    request.log.info({ userId, skill_id, nodeId: nextNode.id, lessonId: newLesson.id }, 'Personalized lesson generated')

    return reply.send(formatResponse({
      complete: false,
      lesson: newLesson,
      node: nextNode,
      experience_level: experienceLevel,
      progress: {
        current_index: nextNode.order_index + 1,
        total_nodes: nodes.length,
        mastered: nodes.filter((n) => masteryMap.get(n.id) === 'strong').length,
      },
    }))
  }))

  /**
   * GET /skill-graph?skill_id=<uuid>
   * Returns the full skill graph with user's mastery overlay
   */
  fastify.get('/skill-graph', wrapHandler('Failed to fetch skill graph', async (request, reply) => {
    const userId = request.user!.id
    const { skill_id } = request.query as { skill_id?: string }

    if (!skill_id) {
      return reply.code(400).send(formatError('skill_id query parameter is required', 'VALIDATION_ERROR'))
    }

    const { data: nodes, error } = await request.supabase
      .from('skill_graph_nodes')
      .select('*')
      .eq('skill_id', skill_id)
      .order('order_index', { ascending: true })

    if (error) throw error

    // Overlay user's mastery
    const nodeIds = (nodes ?? []).map((n) => n.id)
    const { data: masteryRecords } = await request.supabase
      .from('mastery')
      .select('*')
      .eq('user_id', userId)
      .in('node_id', nodeIds)

    const masteryMap = new Map((masteryRecords ?? []).map((m) => [m.node_id, m]))

    const graph = (nodes ?? []).map((node) => ({
      ...node,
      mastery_status: masteryMap.get(node.id)?.status || 'not_started',
      last_reviewed_at: masteryMap.get(node.id)?.last_reviewed_at || null,
    }))

    return reply.send(formatResponse(graph))
  }))

  /**
   * POST /mastery/:nodeId — Manually update mastery status (e.g., after quiz)
   */
  fastify.post<{ Params: { nodeId: string } }>('/mastery/:nodeId', async (request, reply) => {
    const userId = request.user!.id
    const { nodeId } = request.params
    const { status } = request.body as { status?: string }

    const validStatuses = ['not_started', 'in_progress', 'needs_practice', 'improving', 'strong']
    if (!status || !validStatuses.includes(status)) {
      return reply.code(400).send(formatError(`status must be one of: ${validStatuses.join(', ')}`, 'VALIDATION_ERROR'))
    }

    return wrapHandler('Failed to update mastery', async (req, rep) => {
      const { data, error } = await req.supabase
        .from('mastery')
        .upsert({
          user_id: userId,
          node_id: nodeId,
          status,
          last_reviewed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,node_id' })
        .select()
        .single()

      if (error) throw error
      return rep.send(formatResponse(data))
    })(request, reply)
  })
}

export default personalizationRoutes
