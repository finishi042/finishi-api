/**
 * Seed: Product Management Skill Graph (Flagship Skill)
 *
 * ⚠️  PLACEHOLDER CONTENT — Draft for development and testing only.
 *     This concept graph must be reviewed and validated by a PM subject-matter expert
 *     before being treated as the production curriculum.
 *
 * Run: npx tsx scripts/seed-skill-graph.ts
 */

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ConceptNode {
  concept: string
  description: string
  prerequisites: string[]  // concept names — resolved to UUIDs after insert
  misconceptions: string[]
  examples: string[]
  difficulty: 1 | 2 | 3
  priority: number
  order_index: number
}

// ─── Flagship Skill Definition ─────────────────────────────────────────────

const SKILL = {
  name: 'Product Management',
  description: 'Master the fundamentals of Product Management — from discovery to delivery — in 28 days.',
  color: '#7B2CBF',
  category: 'Business & Strategy',
  is_flagship: true,
  estimated_days: 28,
}

// ─── Concept Graph Nodes ───────────────────────────────────────────────────
// 28 concepts, one per day, ordered by prerequisite chain

const CONCEPTS: ConceptNode[] = [
  {
    concept: 'What is Product Management',
    description: 'The role, responsibilities, and mental models of a product manager. How PMs differ from project managers, engineers, and designers.',
    prerequisites: [],
    misconceptions: ['PMs are just project managers', 'PMs need to code', 'PMs have authority over engineering'],
    examples: ['A PM at Spotify deciding whether to build podcasts vs improve playlists', 'A PM writing a one-pager to align stakeholders'],
    difficulty: 1, priority: 1, order_index: 0,
  },
  {
    concept: 'Customer Discovery',
    description: 'Techniques for understanding who your users are, what problems they face, and how they currently solve them.',
    prerequisites: ['What is Product Management'],
    misconceptions: ['Surveys alone are enough', 'Customers always know what they want', 'Discovery only happens at the start'],
    examples: ['Running 5 customer interviews in a week', 'A startup discovering their assumed user was not the actual buyer'],
    difficulty: 1, priority: 2, order_index: 1,
  },
  {
    concept: 'User Personas',
    description: 'Creating research-backed archetypes that represent distinct user segments with different needs, goals, and behaviors.',
    prerequisites: ['Customer Discovery'],
    misconceptions: ['Personas are made-up characters', 'One persona fits all users', 'Demographics alone define a persona'],
    examples: ['Creating a "Budget-conscious Freelancer" persona from interview data', 'Using personas to resolve a feature priority debate'],
    difficulty: 1, priority: 3, order_index: 2,
  },
  {
    concept: 'Problem Framing',
    description: 'Articulating the user problem clearly before jumping to solutions. Techniques like "How might we" and problem statements.',
    prerequisites: ['Customer Discovery', 'User Personas'],
    misconceptions: ['A feature request IS the problem', 'Problems are obvious and don\'t need framing', 'One problem = one solution'],
    examples: ['Reframing "we need a chat feature" into "users struggle to get quick answers"', 'Writing a problem statement for a checkout drop-off'],
    difficulty: 1, priority: 4, order_index: 3,
  },
  {
    concept: 'Jobs To Be Done',
    description: 'The JTBD framework: understanding the functional, social, and emotional "jobs" customers hire products to do.',
    prerequisites: ['Problem Framing'],
    misconceptions: ['JTBD is just another way to write user stories', 'Jobs are the same as features', 'Only functional jobs matter'],
    examples: ['Milkshake example — commuters hire milkshakes to make boring drives interesting', 'Reframing a calendar app around the job of "feeling in control of my week"'],
    difficulty: 2, priority: 5, order_index: 4,
  },
  {
    concept: 'Market Research & Competitive Analysis',
    description: 'How to assess market size, identify competitors, and find positioning opportunities without getting lost in data.',
    prerequisites: ['What is Product Management'],
    misconceptions: ['Your only competitors are direct feature clones', 'TAM/SAM/SOM is precise', 'Market research replaces talking to users'],
    examples: ['Mapping a competitive landscape for a project management tool', 'Identifying an underserved niche by analyzing competitor review complaints'],
    difficulty: 2, priority: 6, order_index: 5,
  },
  {
    concept: 'Value Proposition Design',
    description: 'Crafting a clear statement of why your product is worth choosing. The Value Proposition Canvas and positioning statements.',
    prerequisites: ['Jobs To Be Done', 'Market Research & Competitive Analysis'],
    misconceptions: ['A value prop is a tagline', 'Value props don\'t change', 'Features = value'],
    examples: ['Slack\'s value prop: "Be less busy" — selling reduced email, not chat', 'Writing a positioning statement using Geoffrey Moore\'s template'],
    difficulty: 2, priority: 7, order_index: 6,
  },
  {
    concept: 'Product Vision & Strategy',
    description: 'Setting a north-star vision and translating it into a strategy with clear bets, time horizons, and success criteria.',
    prerequisites: ['Value Proposition Design'],
    misconceptions: ['Vision = roadmap', 'Strategy is a list of features', 'Once set, vision shouldn\'t change'],
    examples: ['Amazon\'s "Earth\'s most customer-centric company" vision guiding Kindle, AWS, Prime', 'A startup writing a 1-year strategy with 3 key bets'],
    difficulty: 2, priority: 8, order_index: 7,
  },
  {
    concept: 'OKRs and Goal Setting',
    description: 'Using Objectives and Key Results to align teams, measure outcomes, and avoid vanity metrics.',
    prerequisites: ['Product Vision & Strategy'],
    misconceptions: ['OKRs are KPIs', 'Every task needs an OKR', 'Hitting 100% means good OKRs'],
    examples: ['Setting a product OKR: "Users find value faster" measured by activation rate', 'Differentiating output OKRs (ship 3 features) from outcome OKRs (reduce churn by 10%)'],
    difficulty: 2, priority: 9, order_index: 8,
  },
  {
    concept: 'Prioritization Frameworks',
    description: 'RICE, ICE, MoSCoW, Kano Model — how to decide what to build next when everything feels urgent.',
    prerequisites: ['OKRs and Goal Setting'],
    misconceptions: ['Frameworks give objective answers', 'The highest-scored item always wins', 'You only need one framework'],
    examples: ['Scoring 10 feature ideas with RICE and finding the surprise winner', 'Using Kano to distinguish must-haves from delighters'],
    difficulty: 2, priority: 10, order_index: 9,
  },
  {
    concept: 'Roadmapping',
    description: 'Building outcome-oriented roadmaps that communicate direction without over-committing on dates.',
    prerequisites: ['Prioritization Frameworks'],
    misconceptions: ['A roadmap is a Gantt chart', 'Roadmaps are commitments', 'Roadmaps should include every detail'],
    examples: ['A Now/Next/Later roadmap for a mobile app', 'Using a theme-based roadmap to align with quarterly OKRs'],
    difficulty: 2, priority: 11, order_index: 10,
  },
  {
    concept: 'User Stories & Requirements',
    description: 'Writing effective user stories, acceptance criteria, and knowing when to use other formats (jobs stories, specs).',
    prerequisites: ['Problem Framing'],
    misconceptions: ['User stories are requirements docs', 'Every story must follow "As a... I want... so that..."', 'More detail = better stories'],
    examples: ['A well-written story with INVEST criteria', 'Converting a vague request into testable acceptance criteria'],
    difficulty: 1, priority: 12, order_index: 11,
  },
  {
    concept: 'MVP & Experiment Design',
    description: 'Defining the smallest thing you can build to validate a hypothesis. Types of MVPs and when to use each.',
    prerequisites: ['User Stories & Requirements', 'Value Proposition Design'],
    misconceptions: ['MVP means crappy product', 'MVP is version 1', 'You only need one MVP per product'],
    examples: ['Dropbox\'s video MVP validating demand before writing code', 'A concierge MVP for a matching service — doing it manually first'],
    difficulty: 2, priority: 13, order_index: 12,
  },
  {
    concept: 'Wireframing & Prototyping',
    description: 'Communicating product ideas visually without needing to be a designer. Fidelity levels and when to use each.',
    prerequisites: ['User Stories & Requirements'],
    misconceptions: ['Wireframes need to look polished', 'Prototypes = code', 'Only designers should wireframe'],
    examples: ['Sketching 3 checkout flow variations on paper in 30 minutes', 'Using Figma to build a clickable prototype for user testing'],
    difficulty: 1, priority: 14, order_index: 13,
  },
  {
    concept: 'Working with Engineering',
    description: 'How PMs collaborate with engineers effectively — scoping, trade-offs, technical debt, and building trust.',
    prerequisites: ['User Stories & Requirements', 'Roadmapping'],
    misconceptions: ['PMs tell engineers what to build', 'PMs don\'t need to understand tech', 'Engineering estimates are commitments'],
    examples: ['Negotiating scope when an engineer says "this will take 3 months"', 'A PM learning just enough SQL to validate a hypothesis themselves'],
    difficulty: 2, priority: 15, order_index: 14,
  },
  {
    concept: 'Working with Design',
    description: 'Collaborating with designers on UX research, design critiques, and balancing business goals with user experience.',
    prerequisites: ['Wireframing & Prototyping'],
    misconceptions: ['PMs approve designs', 'Good UX = pretty UI', 'Design comes after requirements are final'],
    examples: ['Running a design critique focused on user outcomes', 'A PM and designer co-facilitating a design sprint'],
    difficulty: 2, priority: 16, order_index: 15,
  },
  {
    concept: 'Agile & Scrum Basics',
    description: 'Sprint planning, standups, retros, and backlog management — how agile ceremonies support product delivery.',
    prerequisites: ['Working with Engineering'],
    misconceptions: ['Agile means no planning', 'Scrum is the only agile framework', 'Velocity predicts the future'],
    examples: ['Running an effective sprint planning meeting', 'A team switching from Scrum to Kanban and why'],
    difficulty: 1, priority: 17, order_index: 16,
  },
  {
    concept: 'Product Analytics Fundamentals',
    description: 'Setting up instrumentation, defining events, and using data to understand user behavior — not just dashboards.',
    prerequisites: ['OKRs and Goal Setting'],
    misconceptions: ['More data = better decisions', 'Analytics tools give you answers', 'You need a data team to start'],
    examples: ['Setting up a funnel to find where users drop off in onboarding', 'Defining a "activation" event and measuring it weekly'],
    difficulty: 2, priority: 18, order_index: 17,
  },
  {
    concept: 'A/B Testing & Experimentation',
    description: 'Designing experiments, statistical significance, and knowing when (and when not) to A/B test.',
    prerequisites: ['Product Analytics Fundamentals', 'MVP & Experiment Design'],
    misconceptions: ['You can test everything', 'Statistically significant = meaningful', 'Short tests are fine'],
    examples: ['Testing a new onboarding flow with a 50/50 split', 'Deciding NOT to A/B test a small-audience feature and using qualitative feedback instead'],
    difficulty: 3, priority: 19, order_index: 18,
  },
  {
    concept: 'Metrics & KPIs',
    description: 'Choosing the right metrics, avoiding vanity metrics, and building a metrics hierarchy (north star → driver → input).',
    prerequisites: ['Product Analytics Fundamentals', 'OKRs and Goal Setting'],
    misconceptions: ['Revenue is always the north star', 'More metrics = better informed', 'Metrics drive themselves'],
    examples: ['A social app choosing "weekly posts" over "total signups" as their north star', 'Building a driver tree from retention down to activation and onboarding steps'],
    difficulty: 2, priority: 20, order_index: 19,
  },
  {
    concept: 'User Onboarding',
    description: 'Designing first experiences that get users to their "aha moment" fast. Activation funnels and progressive disclosure.',
    prerequisites: ['Product Analytics Fundamentals', 'User Personas'],
    misconceptions: ['Onboarding = product tour', 'One onboarding fits all users', 'Onboarding ends after signup'],
    examples: ['Notion\'s empty-state templates driving first use', 'A B2B tool segmenting onboarding by role (admin vs end-user)'],
    difficulty: 2, priority: 21, order_index: 20,
  },
  {
    concept: 'Retention & Engagement',
    description: 'Understanding cohort retention, habit loops, and strategies to keep users coming back.',
    prerequisites: ['Metrics & KPIs', 'User Onboarding'],
    misconceptions: ['Notifications = retention', 'Retention is a feature', 'All churn is bad'],
    examples: ['Duolingo\'s streak + loss aversion habit loop', 'Analyzing a cohort curve to identify the "flatten" point'],
    difficulty: 3, priority: 22, order_index: 21,
  },
  {
    concept: 'Pricing & Monetization',
    description: 'Pricing models, willingness-to-pay research, and packaging — how to capture value without killing growth.',
    prerequisites: ['Value Proposition Design', 'Metrics & KPIs'],
    misconceptions: ['Price = cost + margin', 'Free is always good for growth', 'You can\'t change pricing later'],
    examples: ['A SaaS choosing per-seat vs usage-based pricing', 'Running a Van Westendorp survey to find price sensitivity'],
    difficulty: 3, priority: 23, order_index: 22,
  },
  {
    concept: 'Stakeholder Management',
    description: 'Communicating with execs, managing up, saying no gracefully, and building political capital.',
    prerequisites: ['Product Vision & Strategy', 'Roadmapping'],
    misconceptions: ['PMs should avoid politics', 'Stakeholder input = stakeholder decisions', 'Saying no burns bridges'],
    examples: ['Using a "disagree and commit" approach with a skeptical exec', 'Preparing a 5-minute product review that preempts exec concerns'],
    difficulty: 2, priority: 24, order_index: 23,
  },
  {
    concept: 'Product Launch',
    description: 'Planning and executing a launch — internal readiness, messaging, channels, and measuring success.',
    prerequisites: ['Stakeholder Management', 'Working with Engineering'],
    misconceptions: ['Launch = ship', 'Launches are one-day events', 'Only marketing owns launches'],
    examples: ['A phased rollout: internal → beta → public', 'A PM writing a launch one-pager: goals, audiences, channels, metrics'],
    difficulty: 2, priority: 25, order_index: 24,
  },
  {
    concept: 'Feedback Loops & Iteration',
    description: 'Collecting, organizing, and acting on user feedback post-launch. Closing the loop with users.',
    prerequisites: ['Product Launch', 'Product Analytics Fundamentals'],
    misconceptions: ['All feedback is equal', 'Loudest users = most important users', 'Feedback = feature requests'],
    examples: ['Tagging feedback by persona/problem-theme rather than requested feature', 'A PM sending a "you asked, we built" email after shipping a top request'],
    difficulty: 2, priority: 26, order_index: 25,
  },
  {
    concept: 'Product-Led Growth',
    description: 'Using the product itself as the primary growth engine — virality, self-serve, and network effects.',
    prerequisites: ['Retention & Engagement', 'Pricing & Monetization'],
    misconceptions: ['PLG means no sales team', 'PLG only works for B2C', 'Freemium = PLG'],
    examples: ['Calendly\'s viral loop — every invite exposes a new potential user', 'A B2B tool adding a free tier and measuring PQL (product-qualified leads)'],
    difficulty: 3, priority: 27, order_index: 26,
  },
  {
    concept: 'PM Career & Growth',
    description: 'Building a PM career — IC vs management tracks, portfolio building, interviewing, and continuous learning.',
    prerequisites: ['What is Product Management'],
    misconceptions: ['You need an MBA to be a PM', 'Senior PM = people manager', 'PM interviews only test frameworks'],
    examples: ['A PM building a portfolio with case studies from side projects', 'Transitioning from engineering to PM with an internal transfer'],
    difficulty: 1, priority: 28, order_index: 27,
  },
]

// ─── Capstone Rubric ───────────────────────────────────────────────────────

const CAPSTONE_RUBRIC = {
  project_prompt: 'Write a 1-page product brief for a new feature in an existing product you use daily. Include: problem statement, target user, proposed solution, success metrics, and key risks.',
  project_description: 'Apply everything you\'ve learned to write a concise, compelling product brief. Choose a real product you use and propose a feature that solves an unmet need. This should demonstrate your ability to frame problems, define solutions, and think about measurement.',
  criteria: [
    {
      name: 'Problem Clarity',
      description: 'Is the problem clearly articulated with evidence of user understanding?',
      weight: 25,
      levels: [
        { label: 'Strong', score: 25, description: 'Problem is specific, user-grounded, and supported by evidence or reasoning' },
        { label: 'Improving', score: 15, description: 'Problem is stated but vague or lacks user perspective' },
        { label: 'Needs Practice', score: 5, description: 'Problem is missing, trivial, or actually a solution in disguise' },
      ],
    },
    {
      name: 'User Focus',
      description: 'Is the target user clearly defined with relevant needs and context?',
      weight: 20,
      levels: [
        { label: 'Strong', score: 20, description: 'Specific user segment with clear needs, context, and behavior' },
        { label: 'Improving', score: 12, description: 'User mentioned but not clearly differentiated or grounded' },
        { label: 'Needs Practice', score: 4, description: 'No clear user definition or "everyone" as the target' },
      ],
    },
    {
      name: 'Solution Quality',
      description: 'Is the proposed solution feasible, clearly scoped, and tied back to the problem?',
      weight: 25,
      levels: [
        { label: 'Strong', score: 25, description: 'Solution is specific, scoped, feasible, and clearly solves the stated problem' },
        { label: 'Improving', score: 15, description: 'Solution exists but is vague, over-scoped, or loosely tied to the problem' },
        { label: 'Needs Practice', score: 5, description: 'Solution is a feature list with no clear connection to a user problem' },
      ],
    },
    {
      name: 'Metrics & Success Criteria',
      description: 'Are success metrics defined that would actually indicate the problem is solved?',
      weight: 20,
      levels: [
        { label: 'Strong', score: 20, description: 'Clear, measurable metrics tied to user outcomes, not just output' },
        { label: 'Improving', score: 12, description: 'Metrics mentioned but vanity metrics or not clearly tied to the problem' },
        { label: 'Needs Practice', score: 4, description: 'No metrics, or "increase revenue" without specifics' },
      ],
    },
    {
      name: 'Risks & Awareness',
      description: 'Does the brief acknowledge key risks or assumptions that could invalidate the approach?',
      weight: 10,
      levels: [
        { label: 'Strong', score: 10, description: 'Key risks identified with awareness of assumptions and potential mitigations' },
        { label: 'Improving', score: 6, description: 'Risks mentioned but generic or not specific to this product/feature' },
        { label: 'Needs Practice', score: 2, description: 'No risks acknowledged' },
      ],
    },
  ],
}

// ─── Seed Script ───────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding Product Management skill graph...\n')

  // 1. Upsert the flagship skill
  const { data: skill, error: skillErr } = await supabase
    .from('skills')
    .upsert({ ...SKILL, learner_count: 0, lesson_count: CONCEPTS.length }, { onConflict: 'name' })
    .select()
    .single()

  if (skillErr) { console.error('❌ Failed to upsert skill:', skillErr); process.exit(1) }
  console.log(`✅ Skill: "${skill.name}" (${skill.id})`)

  // 2. Insert concept nodes
  const nodeMap: Record<string, string> = {} // concept name → UUID

  for (const concept of CONCEPTS) {
    const { data: node, error: nodeErr } = await supabase
      .from('skill_graph_nodes')
      .upsert({
        skill_id: skill.id,
        concept: concept.concept,
        description: concept.description,
        prerequisites: [],  // populated in pass 2
        misconceptions: concept.misconceptions,
        examples: concept.examples,
        difficulty: concept.difficulty,
        priority: concept.priority,
        order_index: concept.order_index,
      }, { onConflict: 'skill_id,concept' })
      .select()
      .single()

    if (nodeErr) {
      // If upsert fails due to no unique constraint, try insert
      const { data: inserted, error: insertErr } = await supabase
        .from('skill_graph_nodes')
        .insert({
          skill_id: skill.id,
          concept: concept.concept,
          description: concept.description,
          prerequisites: [],
          misconceptions: concept.misconceptions,
          examples: concept.examples,
          difficulty: concept.difficulty,
          priority: concept.priority,
          order_index: concept.order_index,
        })
        .select()
        .single()

      if (insertErr) { console.error(`❌ Failed to insert "${concept.concept}":`, insertErr); continue }
      nodeMap[concept.concept] = inserted.id
      console.log(`  ✅ Node: "${concept.concept}" (${inserted.id})`)
    } else {
      nodeMap[concept.concept] = node.id
      console.log(`  ✅ Node: "${concept.concept}" (${node.id})`)
    }
  }

  // 3. Update prerequisites (resolve names → UUIDs)
  console.log('\n🔗 Linking prerequisites...')
  for (const concept of CONCEPTS) {
    if (concept.prerequisites.length === 0) continue
    const prereqIds = concept.prerequisites
      .map((name) => nodeMap[name])
      .filter(Boolean)

    if (prereqIds.length > 0) {
      await supabase
        .from('skill_graph_nodes')
        .update({ prerequisites: prereqIds })
        .eq('id', nodeMap[concept.concept])
    }
  }

  // 4. Upsert capstone rubric
  const { error: rubricErr } = await supabase
    .from('capstone_rubrics')
    .upsert({
      skill_id: skill.id,
      project_prompt: CAPSTONE_RUBRIC.project_prompt,
      project_description: CAPSTONE_RUBRIC.project_description,
      criteria: CAPSTONE_RUBRIC.criteria,
    }, { onConflict: 'skill_id' })

  if (rubricErr) { console.error('❌ Failed to upsert rubric:', rubricErr) }
  else { console.log('\n✅ Capstone rubric seeded') }

  console.log('\n🎉 Done! Product Management skill graph seeded successfully.')
  console.log('⚠️  REMINDER: This is placeholder content. It requires expert review before production use.')
}

seed().catch((err) => { console.error(err); process.exit(1) })
