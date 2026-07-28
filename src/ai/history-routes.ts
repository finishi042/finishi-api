/**
 * AI Chat History Routes
 *
 * CRUD operations for AI tutor conversation history.
 * Requires authentication — the user must be logged in.
 */

import type { FastifyPluginAsync } from 'fastify'
import { authenticate } from '../shared/middleware/auth.js'
import { formatResponse, formatError, wrapHandler } from '../shared/handler.js'

// ── Types ─────────────────────────────────────────────────────────────────

interface Conversation {
  id: string
  user_id: string
  title: string
  is_pinned: boolean
  created_at: string
  updated_at: string
}

interface Message {
  id: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
  created_at: string
}

interface ConversationWithPreview extends Conversation {
  last_message?: string
  message_count: number
}

// ── Routes ────────────────────────────────────────────────────────────────

const aiHistoryRoutes: FastifyPluginAsync = async (fastify) => {
  // All history routes require authentication
  fastify.addHook('onRequest', authenticate)

  /**
   * GET /ai/conversations
   *
   * List all conversations for the current user.
   * Returns conversations with last message preview, ordered by most recent.
   */
  fastify.get<{
    Querystring: { limit?: string; offset?: string; pinned?: string }
  }>('/conversations', wrapHandler('Failed to fetch conversations', async (request, reply) => {
    const userId = request.user!.id
    const limit = Math.min(parseInt(request.query.limit || '50', 10), 100)
    const offset = parseInt(request.query.offset || '0', 10)
    const pinnedOnly = request.query.pinned === 'true'

    let query = request.supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (pinnedOnly) {
      query = query.eq('is_pinned', true)
    }

    const { data: conversations, error } = await query

    if (error) throw error

    // Fetch last message for each conversation
    const conversationsWithPreview: ConversationWithPreview[] = await Promise.all(
      (conversations || []).map(async (conv: Conversation) => {
        const { data: messages, count } = await request.supabase
          .from('ai_messages')
          .select('content', { count: 'exact' })
          .eq('conversation_id', conv.id)
          .order('created_at', { ascending: false })
          .limit(1)

        return {
          ...conv,
          last_message: messages?.[0]?.content?.substring(0, 100),
          message_count: count || 0,
        }
      })
    )

    return reply.send(formatResponse(conversationsWithPreview))
  }))

  /**
   * POST /ai/conversations
   *
   * Create a new conversation.
   */
  fastify.post<{
    Body: { title?: string }
  }>('/conversations', wrapHandler('Failed to create conversation', async (request, reply) => {
    const userId = request.user!.id
    const title = request.body?.title || 'New Chat'

    const { data, error } = await request.supabase
      .from('ai_conversations')
      .insert({ user_id: userId, title })
      .select()
      .single()

    if (error) throw error

    return reply.code(201).send(formatResponse(data as Conversation))
  }))

  /**
   * GET /ai/conversations/:id
   *
   * Get a conversation with all its messages.
   */
  fastify.get<{
    Params: { id: string }
  }>('/conversations/:id', wrapHandler('Failed to fetch conversation', async (request, reply) => {
    const userId = request.user!.id
    const conversationId = request.params.id

    // Fetch conversation (ensures user owns it)
    const { data: conversation, error: convError } = await request.supabase
      .from('ai_conversations')
      .select('*')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (convError) {
      if (convError.code === 'PGRST116') {
        return reply.code(404).send(formatError('Conversation not found'))
      }
      throw convError
    }

    // Fetch all messages
    const { data: messages, error: msgError } = await request.supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (msgError) throw msgError

    return reply.send(formatResponse({
      ...conversation,
      messages: messages || [],
    }))
  }))

  /**
   * PATCH /ai/conversations/:id
   *
   * Update a conversation (title, pinned status).
   */
  fastify.patch<{
    Params: { id: string }
    Body: { title?: string; is_pinned?: boolean }
  }>('/conversations/:id', wrapHandler('Failed to update conversation', async (request, reply) => {
    const userId = request.user!.id
    const conversationId = request.params.id
    const { title, is_pinned } = request.body || {}

    if (title === undefined && is_pinned === undefined) {
      return reply.code(400).send(formatError('No fields to update', 'VALIDATION_ERROR'))
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (title !== undefined) updates.title = title
    if (is_pinned !== undefined) updates.is_pinned = is_pinned

    const { data, error } = await request.supabase
      .from('ai_conversations')
      .update(updates)
      .eq('id', conversationId)
      .eq('user_id', userId)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return reply.code(404).send(formatError('Conversation not found'))
      }
      throw error
    }

    return reply.send(formatResponse(data as Conversation))
  }))

  /**
   * DELETE /ai/conversations/:id
   *
   * Delete a conversation and all its messages.
   */
  fastify.delete<{
    Params: { id: string }
  }>('/conversations/:id', wrapHandler('Failed to delete conversation', async (request, reply) => {
    const userId = request.user!.id
    const conversationId = request.params.id

    const { error } = await request.supabase
      .from('ai_conversations')
      .delete()
      .eq('id', conversationId)
      .eq('user_id', userId)

    if (error) throw error

    return reply.code(204).send()
  }))

  /**
   * POST /ai/conversations/:id/messages
   *
   * Add a message to a conversation.
   * Used to persist both user and assistant messages.
   */
  fastify.post<{
    Params: { id: string }
    Body: { role: 'user' | 'assistant'; content: string }
  }>('/conversations/:id/messages', wrapHandler('Failed to add message', async (request, reply) => {
    const userId = request.user!.id
    const conversationId = request.params.id
    const { role, content } = request.body || {}

    if (!role || !content) {
      return reply.code(400).send(formatError('role and content are required', 'VALIDATION_ERROR'))
    }

    if (!['user', 'assistant'].includes(role)) {
      return reply.code(400).send(formatError('role must be user or assistant', 'VALIDATION_ERROR'))
    }

    // Verify user owns the conversation
    const { data: conversation, error: convError } = await request.supabase
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (convError || !conversation) {
      return reply.code(404).send(formatError('Conversation not found'))
    }

    // Insert the message
    const { data: message, error: msgError } = await request.supabase
      .from('ai_messages')
      .insert({ conversation_id: conversationId, role, content })
      .select()
      .single()

    if (msgError) throw msgError

    // Update conversation's updated_at and auto-generate title from first user message
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // Check if this is the first user message (for auto-title)
    if (role === 'user') {
      const { count } = await request.supabase
        .from('ai_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conversationId)
        .eq('role', 'user')

      // If this is the first or second user message, update title
      if (count && count <= 2) {
        // Generate a title from the content (first 50 chars, trim at word boundary)
        let title = content.substring(0, 50)
        if (content.length > 50) {
          const lastSpace = title.lastIndexOf(' ')
          if (lastSpace > 20) title = title.substring(0, lastSpace)
          title += '...'
        }
        updateData.title = title
      }
    }

    await request.supabase
      .from('ai_conversations')
      .update(updateData)
      .eq('id', conversationId)

    return reply.code(201).send(formatResponse(message as Message))
  }))

  /**
   * POST /ai/conversations/:id/messages/batch
   *
   * Add multiple messages to a conversation at once.
   * Useful for saving a full exchange (user + assistant) in one call.
   */
  fastify.post<{
    Params: { id: string }
    Body: { messages: Array<{ role: 'user' | 'assistant'; content: string }> }
  }>('/conversations/:id/messages/batch', wrapHandler('Failed to add messages', async (request, reply) => {
    const userId = request.user!.id
    const conversationId = request.params.id
    const { messages } = request.body || {}

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return reply.code(400).send(formatError('messages array is required', 'VALIDATION_ERROR'))
    }

    // Validate messages
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        return reply.code(400).send(formatError('Each message must have role and content', 'VALIDATION_ERROR'))
      }
      if (!['user', 'assistant'].includes(msg.role)) {
        return reply.code(400).send(formatError('role must be user or assistant', 'VALIDATION_ERROR'))
      }
    }

    // Verify user owns the conversation
    const { data: conversation, error: convError } = await request.supabase
      .from('ai_conversations')
      .select('id, title')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .single()

    if (convError || !conversation) {
      return reply.code(404).send(formatError('Conversation not found'))
    }

    // Insert all messages
    const messagesToInsert = messages.map((msg) => ({
      conversation_id: conversationId,
      role: msg.role,
      content: msg.content,
    }))

    const { data: insertedMessages, error: msgError } = await request.supabase
      .from('ai_messages')
      .insert(messagesToInsert)
      .select()

    if (msgError) throw msgError

    // Update conversation timestamp and possibly title
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

    // Auto-title from first user message if title is still default
    if (conversation.title === 'New Chat') {
      const firstUserMsg = messages.find((m) => m.role === 'user')
      if (firstUserMsg) {
        let title = firstUserMsg.content.substring(0, 50)
        if (firstUserMsg.content.length > 50) {
          const lastSpace = title.lastIndexOf(' ')
          if (lastSpace > 20) title = title.substring(0, lastSpace)
          title += '...'
        }
        updateData.title = title
      }
    }

    await request.supabase
      .from('ai_conversations')
      .update(updateData)
      .eq('id', conversationId)

    return reply.code(201).send(formatResponse(insertedMessages as Message[]))
  }))
}

export default aiHistoryRoutes
