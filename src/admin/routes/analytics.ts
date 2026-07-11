import type { FastifyPluginAsync } from 'fastify'
import { formatResponse, wrapHandler } from '../../shared/handler.js'
import type { Analytics } from '../types.js'

const adminAnalyticsRoutes: FastifyPluginAsync = async (fastify) => {
  /** GET /analytics — Get platform analytics */
  fastify.get('/analytics', wrapHandler('Failed to fetch analytics', async (request, reply) => {
    const { count: totalUsers, error: usersError } = await request.supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
    if (usersError) throw usersError

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { count: activeUsers, error: activeError } = await request.supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('last_login', thirtyDaysAgo.toISOString())
    if (activeError) throw activeError

    const { count: totalCourses, error: coursesError } = await request.supabase
      .from('courses')
      .select('*', { count: 'exact', head: true })
    if (coursesError) throw coursesError

    const { count: enrollments, error: enrollmentsError } = await request.supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
    if (enrollmentsError) throw enrollmentsError

    const { count: completedCourses, error: completedError } = await request.supabase
      .from('enrollments')
      .select('*', { count: 'exact', head: true })
      .not('completed_at', 'is', null)
    if (completedError) throw completedError

    const completionRate =
      enrollments && enrollments > 0 ? ((completedCourses || 0) / enrollments) * 100 : 0

    const analytics: Analytics = {
      total_users: totalUsers || 0,
      active_users: activeUsers || 0,
      total_courses: totalCourses || 0,
      enrollments: enrollments || 0,
      completion_rate: Math.round(completionRate * 100) / 100,
    }

    return reply.send(formatResponse(analytics))
  }))

  /** GET /dashboard — KPI cards + recent learner activity + popular skills + learning paths overview */
  fastify.get('/dashboard', wrapHandler('Failed to fetch dashboard data', async (request, reply) => {
    const [
      { count: totalUsers },
      { count: activeUsers },
      { count: lessonsCompleted },
      { count: learningPaths },
      { data: recentActivity },
      { data: popularSkills },
      { data: pathsOverview },
      { data: recentLessons },
    ] = await Promise.all([
      request.supabase.from('users').select('*', { count: 'exact', head: true }),
      request.supabase.from('users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      request.supabase.from('progress').select('*', { count: 'exact', head: true }).not('completed_at', 'is', null),
      request.supabase.from('learning_paths').select('*', { count: 'exact', head: true }),
      request.supabase
        .from('users')
        .select('id, full_name, avatar_url, last_login')
        .order('last_login', { ascending: false })
        .limit(5),
      request.supabase
        .from('skills')
        .select('id, name, color, learner_count')
        .order('learner_count', { ascending: false })
        .limit(4),
      request.supabase
        .from('learning_paths')
        .select('id, name, skill_name, enrolled_count, completion_rate, status')
        .order('enrolled_count', { ascending: false })
        .limit(3),
      request.supabase
        .from('lessons')
        .select('id, title, skill_name, created_at, status, view_count')
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    return reply.send(formatResponse({
      kpis: {
        total_users: totalUsers ?? 0,
        active_learners: activeUsers ?? 0,
        lessons_completed: lessonsCompleted ?? 0,
        learning_paths: learningPaths ?? 0,
      },
      recent_activity: recentActivity ?? [],
      popular_skills: popularSkills ?? [],
      paths_overview: pathsOverview ?? [],
      recent_lessons: recentLessons ?? [],
    }))
  }))
}

export default adminAnalyticsRoutes
