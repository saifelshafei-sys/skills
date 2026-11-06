import type { Register } from 'claude-code'

const STORE_KEY = 'delegate'

/** Tools that change files. The Chief of Staff may not use them: agents do. */
export const BUILD_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

/** The tool that starts an agent: `Agent` now, `Task` in older Claude Code. */
const SPAWN_TOOLS = ['Agent', 'Task']

export const BLOCKED = (tool: string) =>
  `Chief of Staff rule: you do not ${tool === 'Write' ? 'create' : 'edit'} files yourself. ` +
  'Delegate this to the matching website-team agent with the Agent tool (a full brief: goal, files, constraints, what to report). ' +
  'If no role fits, use general-purpose. The person can turn this rule off with /delegate off.'

export const TEAM: { type: string; does: string }[] = [
  { type: 'website-team:marketing-strategist', does: 'audience, positioning, page message order, call to action' },
  { type: 'website-team:web-designer', does: 'layout, visual design, design tokens, responsive behaviour' },
  { type: 'website-team:copywriter', does: 'every word on the site' },
  { type: 'website-team:frontend-developer', does: 'pages, components, forms, client-side state' },
  { type: 'website-team:backend-developer', does: 'APIs, database, auth, integrations' },
  { type: 'website-team:seo-specialist', does: 'keywords, metadata, sitemap, structured data' },
  { type: 'website-team:qa-tester', does: 'testing, automated tests, bug reports' },
  { type: 'website-team:security-reviewer', does: 'read-only security review before release' },
  { type: 'website-team:devops-engineer', does: 'hosting, CI, env vars, release checks' },
]

export const CHIEF_OF_STAFF = [
  '# You are the Chief of Staff',
  '',
  'You run a team of specialist agents. You do not edit or create files yourself: Edit, Write, MultiEdit and NotebookEdit are blocked for you. For any work on a project (building, designing, writing, fixing, reviewing, testing, shipping), delegate it to the team with the Agent tool. Your own job is to plan, assign, coordinate, check results, and report to the person. You may read files and search to plan and to check work.',
  '',
  'Your team (pass the type as subagent_type, and set name to the short role, e.g. "web-designer"):',
  ...TEAM.map(t => `- ${t.type}: ${t.does}`),
  '',
  'Routing rules (follow them even when one agent could do it all):',
  '- web-designer produces the design only: layout, styles, design tokens, visual specs. It does not write JavaScript, Python, build scripts or deploy steps.',
  '- frontend-developer writes pages, components and any client-side JavaScript or TypeScript; backend-developer writes servers, APIs, data and server-side scripts.',
  '- devops-engineer owns build, hosting, CI and deploy steps (wrangler, Docker, pipelines).',
  '- copywriter writes the words; marketing-strategist decides the message first when the page is new or repositioned; seo-specialist sets titles, metadata and structure.',
  '- Building or rebuilding a page is never one task: at least web-designer, then frontend-developer, then qa-tester.',
  '- Anything with a form, login, payment, API or user data also gets security-reviewer before it is called done.',
  '- One agent, one role: if a brief would ask an agent to do another role\'s work, split it and assign that part to the other role.',
  '',
  'How to run the work:',
  '1. Split the request by role, never into one big task, and say in one or two lines who gets what.',
  '2. Assign each task to the agent whose role fits. Give each a complete brief: goal, files or context, constraints, and what to report back. They do not see this conversation.',
  '3. Run independent tasks in parallel (several Agent calls in one message); run dependent ones in order (strategy and design before build, build before QA and security).',
  '4. Check each report before building on it. Send weak work back to the same role with specific feedback.',
  '5. End with a short summary for the person: what was done, by whom, and what is open.',
  '',
  'Answer plain questions and talk with the person yourself; anything that changes a file goes to an agent, even a one-line change. If no team role fits a task, use general-purpose and say so. Do not use shell commands to write files as a way around this.',
  'Never let an agent deploy, change DNS, delete data, or spend money without the person confirming first.',
].join('\n')

export async function isOn(get: (key: string) => Promise<unknown>): Promise<boolean> {
  return (await get(STORE_KEY)) !== false
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'delegate',
      description: 'Chief of Staff delegation: on, off, or show the current setting',
      argumentHint: 'on | off',
    })
    // Say so at start-up, so the person can see the rule is loaded.
    try {
      if (await isOn(k => $.store.get(k))) $.ui.status('Chief of Staff: delegating')
    } catch {
      // Status only.
    }
    return next(e)
  })

  // The hard rule: the main session (no agentId) may not change files.
  on('tool.call', async ($, e, next) => {
    if (e.agentId !== undefined || !BUILD_TOOLS.includes(e.tool)) return next(e)
    let isActive = true
    try {
      isActive = await isOn(k => $.store.get(k))
    } catch {
      // Store unreadable: keep the default, on.
    }
    return isActive ? { deny: BLOCKED(e.tool) } : next(e)
  })

  on('command.run', { command: 'delegate' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    if (want === 'on' || want === 'off') {
      await $.store.set(STORE_KEY, want === 'on')
      $.ui.status(want === 'on' ? 'Chief of Staff: delegating' : undefined)
      return { text: `Chief of Staff delegation is ${want}. It applies from your next message.` }
    }
    return { text: `Chief of Staff delegation is ${(await isOn(k => $.store.get(k))) ? 'on' : 'off'}. Use /delegate on or /delegate off.` }
  })

  // Only the main session can assign work: it is the one offered the Agent (or older Task) tool.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.some(t => SPAWN_TOOLS.includes(t))) return composed
    try {
      if (!(await isOn(k => $.store.get(k)))) return composed
    } catch {
      // Store unreadable: keep the default, on.
    }
    return {
      sections: [
        ...composed.sections.filter(s => s.id !== 'website-team:chief-of-staff'),
        { id: 'website-team:chief-of-staff', text: CHIEF_OF_STAFF, scope: 'session' as const },
      ],
    }
  })
}
