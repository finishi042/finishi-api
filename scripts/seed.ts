/**
 * Seed script — populates the database with sample data so the frontend
 * shows real content instead of hardcoded fallbacks.
 *
 * Usage:
 *   npx tsx scripts/seed.ts
 *
 * Requires a valid .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

config()

const supabaseUrl = process.env.SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || supabaseUrl.includes('your-project')) {
  console.error('❌ Please set real SUPABASE_URL in .env')
  process.exit(1)
}
if (!serviceRoleKey || serviceRoleKey.includes('your-')) {
  console.error('❌ Please set real SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function seed() {
  console.log('🌱 Seeding database...\n')

  // ─── Get the first user (or fail) ────────────────────────────────
  const { data: users, error: userErr } = await supabase.auth.admin.listUsers()
  if (userErr || !users?.users?.length) {
    console.error('❌ No users found. Create a user in Supabase Auth first.')
    process.exit(1)
  }
  const userId = users.users[0].id
  console.log(`👤 Seeding data for user: ${users.users[0].email} (${userId})`)

  // ─── Events ──────────────────────────────────────────────────────
  const events = [
    {
      title: 'Live Q&A: Database Design Deep Dive',
      type: 'live-session',
      skill_name: 'Databases',
      event_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      event_time: '6:00 PM WAT',
      duration_mins: 60,
      host_name: 'Dr. Chidi Okonkwo',
      host_title: 'Lead Instructor',
      capacity: 200,
      registered_count: 142,
      status: 'upcoming',
      description: 'Join our lead instructor for a live session on advanced database relationships, indexing strategies, and real-world schema design.',
      platform: 'virtual',
      location: 'Zoom',
    },
    {
      title: 'Workshop: TypeScript for React Developers',
      type: 'workshop',
      skill_name: 'TypeScript',
      event_date: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
      event_time: '3:00 PM WAT',
      duration_mins: 90,
      host_name: 'Amara Diallo',
      host_title: 'Senior Engineer',
      capacity: 300,
      registered_count: 204,
      status: 'upcoming',
      description: 'A hands-on workshop converting a React JS project to TypeScript — with best practices for typing props, state, and API responses.',
      platform: 'virtual',
      location: 'Google Meet',
    },
    {
      title: 'Weekly Challenge: Build a REST API',
      type: 'bootcamp',
      skill_name: 'Backend',
      event_date: new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
      event_time: '10:00 AM WAT',
      duration_mins: 120,
      host_name: 'Finishi Team',
      capacity: 100,
      registered_count: 89,
      status: 'upcoming',
      description: 'Put your backend knowledge to the test. Design and build a simple REST API with authentication in under 2 hours.',
      platform: 'virtual',
      location: 'Discord',
    },
  ]

  const { error: evErr } = await supabase.from('events').upsert(events, { onConflict: 'title' }).select()
  console.log(evErr ? `  ⚠️  Events: ${evErr.message}` : `  ✅ Events seeded (${events.length})`)

  // ─── Notifications ───────────────────────────────────────────────
  const notifications = [
    { user_id: userId, type: 'streak', title: '5-Day Streak! 🔥', body: "You're on fire! Log in tomorrow to hit 6 days and earn the 'Consistent Learner' badge.", read: false },
    { user_id: userId, type: 'event', title: 'Live Session Starting Soon', body: 'Database Design Deep Dive with Dr. Chidi Okonkwo starts in 30 minutes.', read: false },
    { user_id: userId, type: 'lesson', title: 'New Lesson Ready', body: "Your next lesson 'Database Indexing Strategies' is unlocked. It takes just 10 minutes.", read: false },
    { user_id: userId, type: 'achievement', title: 'Lesson Completed! 🎉', body: "You finished 'Introduction to Databases'. Your quiz score was 100%. Keep going!", read: true },
    { user_id: userId, type: 'ai', title: 'AI Insight', body: 'Your learning pace is 23% faster than last week. You are building great consistency.', read: true },
    { user_id: userId, type: 'challenge', title: 'Weekly Challenge Open', body: 'Build a REST API — the challenge opens tomorrow at 10:00 AM WAT. Register now.', read: true },
  ]

  const { error: notifErr } = await supabase.from('notifications').insert(notifications)
  console.log(notifErr ? `  ⚠️  Notifications: ${notifErr.message}` : `  ✅ Notifications seeded (${notifications.length})`)

  // ─── Focus Sessions ──────────────────────────────────────────────
  const focusSessions = Array.from({ length: 12 }, (_, i) => ({
    user_id: userId,
    duration_mins: [10, 25, 45, 10, 25, 10, 45, 10, 25, 10, 10, 25][i],
    type: ['finishi', 'pomodoro', 'deep-work', 'finishi', 'pomodoro', 'finishi', 'deep-work', 'finishi', 'pomodoro', 'finishi', 'finishi', 'pomodoro'][i],
    completed: true,
    started_at: new Date(Date.now() - (12 - i) * 86400000).toISOString(),
    ended_at: new Date(Date.now() - (12 - i) * 86400000 + [10, 25, 45, 10, 25, 10, 45, 10, 25, 10, 10, 25][i] * 60000).toISOString(),
  }))

  const { error: fsErr } = await supabase.from('focus_sessions').insert(focusSessions)
  console.log(fsErr ? `  ⚠️  Focus Sessions: ${fsErr.message}` : `  ✅ Focus Sessions seeded (${focusSessions.length})`)

  // ─── Ensure lessons exist for quiz ───────────────────────────────
  const { data: existingLessons } = await supabase.from('lessons').select('id').limit(1)
  let lessonId: string | null = existingLessons?.[0]?.id ?? null

  if (!lessonId) {
    const { data: newLesson } = await supabase
      .from('lessons')
      .insert({
        title: 'Practice Database Design Fundamentals',
        skill_name: 'Databases',
        description: 'Learn how databases are structured and how relationships work between tables.',
        duration_mins: 10,
        status: 'published',
        view_count: 0,
        content: `## What is a Database?\n\nA database is an organised collection of structured information stored electronically. Think of it as a digital filing cabinet for your application's data.\n\n## Key Concepts\n\n- **Tables** store related data in rows and columns\n- **Primary Keys** uniquely identify each row\n- **Foreign Keys** link tables together\n- **Indexes** speed up queries\n- **Relationships** define how tables relate (one-to-one, one-to-many, many-to-many)`,
      })
      .select()
      .single()
    lessonId = newLesson?.id ?? null
    console.log(newLesson ? '  ✅ Lesson created' : '  ⚠️  Could not create lesson')
  }

  // ─── Quiz ────────────────────────────────────────────────────────
  if (lessonId) {
    const quiz = {
      lesson_id: lessonId,
      title: 'Database Design Fundamentals Quiz',
      passing_score: 70,
      questions: [
        { id: 'q1', question: 'What is a database?', options: ['A design tool for creating user interfaces', 'A collection of organised, structured data', 'A programming language used to build apps', 'A type of web server'], correct_answer: 'A collection of organised, structured data', explanation: 'A database is an organised collection of structured information stored electronically.' },
        { id: 'q2', question: 'Databases help applications store and retrieve information.', options: ['True', 'False'], correct_answer: 'True', explanation: 'Nearly every app relies on databases to store and retrieve user data.' },
        { id: 'q3', question: 'What is the role of a Primary Key?', options: ['It stores the user password', 'It links two tables together', 'It uniquely identifies each row in a table', 'It defines column names'], correct_answer: 'It uniquely identifies each row in a table', explanation: 'A primary key uniquely identifies every row in a table.' },
        { id: 'q4', question: 'A Foreign Key creates a link between two tables by referencing a Primary Key.', options: ['True', 'False'], correct_answer: 'True', explanation: 'A foreign key points to the primary key in another table, creating a relationship.' },
        { id: 'q5', question: "Which relationship type describes 'one user can have many posts'?", options: ['Many-to-Many', 'One-to-One', 'One-to-Many', 'Zero-to-Many'], correct_answer: 'One-to-Many', explanation: 'One-to-Many is the most common relationship type.' },
      ],
    }

    const { error: quizErr } = await supabase.from('quizzes').upsert(quiz, { onConflict: 'lesson_id' })
    console.log(quizErr ? `  ⚠️  Quiz: ${quizErr.message}` : '  ✅ Quiz seeded')
  }

  // ─── User Streak ─────────────────────────────────────────────────
  const { error: streakErr } = await supabase.from('user_streaks').upsert(
    { user_id: userId, current_streak: 9, longest_streak: 14, last_active_date: new Date().toISOString().split('T')[0] },
    { onConflict: 'user_id' }
  )
  console.log(streakErr ? `  ⚠️  Streak: ${streakErr.message}` : '  ✅ User streak seeded (9 days)')

  // ─── User Profile update ─────────────────────────────────────────
  const { error: profileErr } = await supabase.from('users').upsert(
    {
      id: userId,
      email: users.users[0].email,
      full_name: 'Adebayo Adeyemi',
      role: 'user',
      plan: 'free',
      status: 'active',
      lessons_completed: 9,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  )
  console.log(profileErr ? `  ⚠️  Profile: ${profileErr.message}` : '  ✅ User profile seeded')

  // ─── User Settings ───────────────────────────────────────────────
  const { error: settingsErr } = await supabase.from('user_settings').upsert(
    {
      user_id: userId,
      daily_goal_mins: 30,
      reminder_time: '09:00',
      notif_daily: true,
      notif_streak: true,
      notif_weekly: true,
      notif_tips: true,
      privacy_analytics: true,
      privacy_improve: true,
      theme: 'light',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  console.log(settingsErr ? `  ⚠️  Settings: ${settingsErr.message}` : '  ✅ User settings seeded')

  console.log('\n✨ Seed complete! Start the API and frontend to see real data.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
