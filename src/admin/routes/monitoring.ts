import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, wrapHandler } from '../../shared/handler.js'
import {
  sinceTimestamp,
  errorRate,
  average,
  percentile,
  parseHours,
  parsePage,
  parseLimit,
} from '../../monitoring/analytics.js'

/**
 * Admin monitoring routes — request/response analytics.
 *
 * Each handler has a single responsibility: validate params → query → shape response.
 * Computation logic is delegated to shared analytics helpers (DRY).
 */

const adminMonitoringRoutes: FastifyPluginAsync = async (fastify) => {

  // ─── GET /monitoring/summary ──────────────────────────────────────────────

  fastify.get('/monitoring/summary', wrapHandler('Failed to fetch monitoring summary', async (request, reply) => {
    const hoursAgo = parseHours((request.query as any).hours)
    const since = sinceTimestamp(hoursAgo)

    const [
      { count: totalRequests },
      { count: totalErrors },
      { count: inboundRequests },
      { count: outboundRequests },
      { data: inboundDurationsRaw },
      { data: outboundDurationsRaw },
    ] = await Promise.all([
      request.supabase.from('request_logs').select('*', { count: 'exact', head: true }).gte('started_at', since),
      request.supabase.from('request_logs').select('*', { count: 'exact', head: true }).gte('started_at', since).eq('is_error', true),
      request.supabase.from('request_logs').select('*', { count: 'exact', head: true }).gte('started_at', since).eq('direction', 'inbound'),
      request.supabase.from('request_logs').select('*', { count: 'exact', head: true }).gte('started_at', since).eq('direction', 'outbound'),
      request.supabase.from('request_logs').select('duration_ms').gte('started_at', since).eq('direction', 'inbound').order('started_at', { ascending: false }).limit(1000),
      request.supabase.from('request_logs').select('duration_ms').gte('started_at', since).eq('direction', 'outbound').order('started_at', { ascending: false }).limit(1000),
    ])

    const inboundDurations = (inboundDurationsRaw ?? []).map((r: any) => Number(r.duration_ms))
    const outboundDurations = (outboundDurationsRaw ?? []).map((r: any) => Number(r.duration_ms))

    return reply.send(formatResponse({
      period_hours: hoursAgo,
      total_requests: totalRequests ?? 0,
      inbound_requests: inboundRequests ?? 0,
      outbound_requests: outboundRequests ?? 0,
      total_errors: totalErrors ?? 0,
      error_rate: errorRate(totalErrors ?? 0, totalRequests ?? 0),
      avg_response_time_ms: average(inboundDurations),
      p95_response_time_ms: percentile(inboundDurations, 0.95),
      avg_provider_time_ms: average(outboundDurations),
    }))
  }))

  // ─── GET /monitoring/timeseries ───────────────────────────────────────────

  fastify.get('/monitoring/timeseries', wrapHandler('Failed to fetch monitoring timeseries', async (request, reply) => {
    const { hours, bucket = '1h', direction } = request.query as {
      hours?: string; bucket?: string; direction?: string
    }
    const hoursAgo = parseHours(hours)
    const since = sinceTimestamp(hoursAgo)

    const bucketMinutes = parseBucketMinutes(bucket)

    let query = request.supabase
      .from('request_logs')
      .select('started_at, duration_ms, is_error, direction')
      .gte('started_at', since)
      .order('started_at', { ascending: true })
      .limit(5000)

    if (direction === 'inbound' || direction === 'outbound') {
      query = query.eq('direction', direction)
    }

    const { data: logs, error } = await query
    if (error) throw error

    const timeseries = bucketLogs(logs ?? [], bucketMinutes)

    return reply.send(formatResponse({
      period_hours: hoursAgo,
      bucket,
      direction: direction ?? 'all',
      points: timeseries,
    }))
  }))

  // ─── GET /monitoring/top-endpoints ────────────────────────────────────────

  fastify.get('/monitoring/top-endpoints', wrapHandler('Failed to fetch top endpoints', async (request, reply) => {
    const { hours, limit } = request.query as { hours?: string; limit?: string }
    const hoursAgo = parseHours(hours)
    const topN = Math.min(parseInt(limit ?? '', 10) || 20, 50)
    const since = sinceTimestamp(hoursAgo)

    const { data: logs, error } = await request.supabase
      .from('request_logs')
      .select('method, path, duration_ms, is_error, status_code')
      .gte('started_at', since)
      .eq('direction', 'inbound')
      .order('started_at', { ascending: false })
      .limit(5000)

    if (error) throw error

    const endpoints = aggregateEndpoints(logs ?? [], topN)

    return reply.send(formatResponse({
      period_hours: hoursAgo,
      endpoints,
    }))
  }))

  // ─── GET /monitoring/providers ────────────────────────────────────────────

  fastify.get('/monitoring/providers', wrapHandler('Failed to fetch provider health', async (request, reply) => {
    const hoursAgo = parseHours((request.query as any).hours)
    const since = sinceTimestamp(hoursAgo)

    const { data: logs, error } = await request.supabase
      .from('request_logs')
      .select('provider, duration_ms, is_error, status_code, started_at')
      .gte('started_at', since)
      .eq('direction', 'outbound')
      .order('started_at', { ascending: false })
      .limit(3000)

    if (error) throw error

    const providers = aggregateProviders(logs ?? [])

    return reply.send(formatResponse({
      period_hours: hoursAgo,
      providers,
    }))
  }))

  // ─── GET /monitoring/errors ───────────────────────────────────────────────

  fastify.get('/monitoring/errors', wrapHandler('Failed to fetch recent errors', async (request, reply) => {
    const { hours, page, limit, direction, provider } = request.query as {
      hours?: string; page?: string; limit?: string; direction?: string; provider?: string
    }
    const hoursAgo = parseHours(hours)
    const pageNum = parsePage(page)
    const pageSize = parseLimit(limit)
    const since = sinceTimestamp(hoursAgo)

    let query = request.supabase
      .from('request_logs')
      .select('id, direction, provider, method, path, status_code, duration_ms, error_message, error_code, started_at, user_id, request_id, ip_address', { count: 'exact' })
      .gte('started_at', since)
      .eq('is_error', true)
      .order('started_at', { ascending: false })
      .range((pageNum - 1) * pageSize, pageNum * pageSize - 1)

    if (direction === 'inbound' || direction === 'outbound') {
      query = query.eq('direction', direction)
    }
    if (provider) {
      query = query.eq('provider', provider)
    }

    const { data, count, error } = await query
    if (error) throw error

    return reply.send(formatResponse({
      period_hours: hoursAgo,
      errors: data ?? [],
      meta: { page: pageNum, limit: pageSize, total: count ?? 0 },
    }))
  }))

  // ─── GET /monitoring/logs ─────────────────────────────────────────────────

  fastify.get('/monitoring/logs', wrapHandler('Failed to fetch request logs', async (request, reply) => {
    const { page, limit, direction, provider, method, is_error, path: pathFilter } = request.query as {
      page?: string; limit?: string; direction?: string; provider?: string;
      method?: string; is_error?: string; path?: string
    }
    const pageNum = parsePage(page)
    const pageSize = parseLimit(limit, 50)

    let query = request.supabase
      .from('request_logs')
      .select('id, direction, provider, method, path, status_code, duration_ms, is_error, error_message, started_at, user_id, request_id, ip_address, user_agent, request_body_size, response_body_size', { count: 'exact' })
      .order('started_at', { ascending: false })
      .range((pageNum - 1) * pageSize, pageNum * pageSize - 1)

    if (direction === 'inbound' || direction === 'outbound') {
      query = query.eq('direction', direction)
    }
    if (provider) query = query.eq('provider', provider)
    if (method) query = query.eq('method', method.toUpperCase())
    if (is_error === 'true') query = query.eq('is_error', true)
    if (pathFilter) query = query.ilike('path', `%${pathFilter}%`)

    const { data, count, error } = await query
    if (error) throw error

    return reply.send(formatResponse({
      logs: data ?? [],
      meta: { page: pageNum, limit: pageSize, total: count ?? 0 },
    }))
  }))
}

export default adminMonitoringRoutes

// ─── Private Aggregation Helpers ───────────────────────────────────────────

function parseBucketMinutes(bucket: string): number {
  switch (bucket) {
    case '5m': return 5
    case '15m': return 15
    case '1h': return 60
    case '6h': return 360
    case '1d': return 1440
    default: return 60
  }
}

function bucketLogs(logs: any[], bucketMinutes: number) {
  const buckets = new Map<string, { count: number; errors: number; total_duration: number }>()

  for (const log of logs) {
    const ts = new Date(log.started_at).getTime()
    const bucketTs = new Date(Math.floor(ts / (bucketMinutes * 60000)) * bucketMinutes * 60000).toISOString()

    if (!buckets.has(bucketTs)) {
      buckets.set(bucketTs, { count: 0, errors: 0, total_duration: 0 })
    }
    const b = buckets.get(bucketTs)!
    b.count++
    if (log.is_error) b.errors++
    b.total_duration += Number(log.duration_ms)
  }

  return Array.from(buckets.entries()).map(([timestamp, data]) => ({
    timestamp,
    requests: data.count,
    errors: data.errors,
    avg_duration_ms: data.count > 0 ? Math.round(data.total_duration / data.count) : 0,
  }))
}

function aggregateEndpoints(logs: any[], topN: number) {
  const endpoints = new Map<string, {
    method: string; path: string; count: number;
    errors: number; total_duration: number; status_codes: Record<number, number>
  }>()

  for (const log of logs) {
    const cleanPath = log.path.split('?')[0]
    const key = `${log.method} ${cleanPath}`

    if (!endpoints.has(key)) {
      endpoints.set(key, { method: log.method, path: cleanPath, count: 0, errors: 0, total_duration: 0, status_codes: {} })
    }
    const ep = endpoints.get(key)!
    ep.count++
    if (log.is_error) ep.errors++
    ep.total_duration += Number(log.duration_ms)
    ep.status_codes[log.status_code] = (ep.status_codes[log.status_code] ?? 0) + 1
  }

  return Array.from(endpoints.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, topN)
    .map(ep => ({
      method: ep.method,
      path: ep.path,
      total_requests: ep.count,
      error_count: ep.errors,
      error_rate: errorRate(ep.errors, ep.count),
      avg_duration_ms: ep.count > 0 ? Math.round(ep.total_duration / ep.count) : 0,
      status_codes: ep.status_codes,
    }))
}

function aggregateProviders(logs: any[]) {
  const providers = new Map<string, {
    total_calls: number; errors: number;
    total_duration: number; durations: number[];
    last_call: string; last_error: string | null
  }>()

  for (const log of logs) {
    const provider = log.provider ?? 'unknown'
    if (!providers.has(provider)) {
      providers.set(provider, {
        total_calls: 0, errors: 0,
        total_duration: 0, durations: [],
        last_call: log.started_at, last_error: null,
      })
    }
    const p = providers.get(provider)!
    p.total_calls++
    p.total_duration += Number(log.duration_ms)
    p.durations.push(Number(log.duration_ms))
    if (log.is_error) {
      p.errors++
      if (!p.last_error) p.last_error = log.started_at
    }
  }

  return Array.from(providers.entries())
    .map(([name, data]) => ({
      provider: name,
      total_calls: data.total_calls,
      error_count: data.errors,
      error_rate: errorRate(data.errors, data.total_calls),
      avg_duration_ms: average(data.durations),
      p50_duration_ms: percentile(data.durations, 0.50),
      p95_duration_ms: percentile(data.durations, 0.95),
      p99_duration_ms: percentile(data.durations, 0.99),
      last_call: data.last_call,
      last_error: data.last_error,
      status: data.errors === 0 ? 'healthy'
        : (data.errors / data.total_calls) < 0.05 ? 'degraded'
        : 'unhealthy',
    }))
    .sort((a, b) => b.total_calls - a.total_calls)
}
