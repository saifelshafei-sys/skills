import type { Register } from 'claude-code'

const STORE_KEY = 'delegate'

/** Tools that change files. The Chief of Staff may not use them: agents do. */
export const BUILD_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

/** The tool that starts an agent: `Agent` now, `Task` in older Claude Code. */
const SPAWN_TOOLS = ['Agent', 'Task']

/** Files a web-designer may not write: scripts, build and deploy config. */
export const DESIGNER_OFF_LIMITS =
  /(\.(m?js|cjs|ts|mts|cts|py|sh|bash|ps1|bat|rb|go|rs|php|toml)$)|((^|[\\/])(package(-lock)?\.json|wrangler\.[a-z]+|Dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml)$)|((^|[\\/])\.github[\\/])/i

/** Commands that ship the site; only devops-engineer runs them. */
export const DEPLOY = /\b(wrangler\s+(deploy|publish|pages\s+deploy)|vercel\s+(deploy|--prod)|netlify\s+deploy|firebase\s+deploy|npm\s+run\s+deploy|pnpm\s+(run\s+)?deploy|yarn\s+deploy)\b/i

/** Scrapling (or any) settings that get past bot protection: always refused. */
export const BYPASS_ARGS = /^(solve_cloudflare|solve_captcha|captcha.*|bypass.*)$/i
export const BYPASS_SHELL = /(--solve-cloudflare\b|solve_cloudflare\s*=\s*True|solve_cloudflare["']?\s*:\s*true)/i

/** Why a call tries to get past a site's bot protection, or undefined. */
export function bypassLimit(tool: string, fields: Record<string, unknown>): string | undefined {
  const why = 'Not allowed: this team does not get past CAPTCHAs, Cloudflare challenges or other bot protection. ' +
    'If a site blocks normal access, report it as blocked and move on (or use its public pages, an official API, or ask the person).'
  if (tool.startsWith('mcp__') && Object.entries(fields).some(([k, v]) => BYPASS_ARGS.test(k) && v === true)) return why
  if (tool === 'Bash' && typeof fields.command === 'string' && BYPASS_SHELL.test(fields.command)) return why
  return undefined
}

/** A role's short name: `chief-of-staff:web-designer` is `web-designer`. */
export function roleName(type: string | undefined): string {
  if (!type) return ''
  return type.includes(':') ? type.slice(type.lastIndexOf(':') + 1) : type
}

/**
 * Why a call breaks a role's limit, or undefined when it may run. `role` is
 * the calling agent's short type, '' for the Chief of Staff.
 */
export function roleLimit(role: string, tool: string, path: string, command: string): string | undefined {
  if (role === 'web-designer' && BUILD_TOOLS.includes(tool) && DESIGNER_OFF_LIMITS.test(path)) {
    return `Role limit: web-designer does not write scripts, build or config files (${path}). ` +
      'Finish the design part, then list in your report exactly what the frontend developer (code) or DevOps engineer (build, deploy) must do; the Chief of Staff assigns it.'
  }
  if (role === 'reverse-engineer' && BUILD_TOOLS.includes(tool) && !/\.md$/i.test(path)) {
    return `Role limit: reverse-engineer writes only .md reports, not ${path}. ` +
      'Describe the technique in your report; the Chief of Staff assigns the build.'
  }
  if (role === 'creative-director' && BUILD_TOOLS.includes(tool) && !/\.md$/i.test(path)) {
    return `Role limit: creative-director writes only creative-brief.md and review notes (.md), not ${path}. ` +
      'Put the direction or the change you want in your notes; the Chief of Staff assigns the maker.'
  }
  if (tool === 'Bash' && DEPLOY.test(command) && role !== 'devops-engineer') {
    return 'Role limit: only devops-engineer deploys. ' +
      (role === '' ? 'Assign the deploy to chief-of-staff:devops-engineer, after the person confirms it.' : 'Stop and report that the work is ready to deploy; the Chief of Staff assigns DevOps.')
  }
  return undefined
}

export const BLOCKED = (tool: string) =>
  `Chief of Staff rule: you do not ${tool === 'Write' ? 'create' : 'edit'} files yourself. ` +
  'Delegate this to the matching team agent (chief-of-staff:<role>) with the Agent tool (a full brief: goal, files, constraints, what to report). ' +
  'If no role fits, use general-purpose. The person can turn this rule off with /delegate off.'

export const TEAM: { type: string; does: string }[] = [
  { type: 'chief-of-staff:reverse-engineer', does: 'how another site or app does something, with REA; evidence report, never copied code' },
  { type: 'chief-of-staff:creative-director', does: 'creative direction first (concept, mood, tone), then taste review of design and copy before build' },
  { type: 'chief-of-staff:marketing-strategist', does: 'audience, positioning, page message order, call to action' },
  { type: 'chief-of-staff:web-designer', does: 'layout, visual design, design tokens, responsive behaviour' },
  { type: 'chief-of-staff:copywriter', does: 'every word on the site' },
  { type: 'chief-of-staff:frontend-developer', does: 'pages, components, forms, client-side state' },
  { type: 'chief-of-staff:backend-developer', does: 'APIs, database, auth, integrations' },
  { type: 'chief-of-staff:seo-specialist', does: 'keywords, metadata, sitemap, structured data' },
  { type: 'chief-of-staff:qa-tester', does: 'testing, automated tests, bug reports' },
  { type: 'chief-of-staff:security-reviewer', does: 'read-only security review before release' },
  { type: 'chief-of-staff:devops-engineer', does: 'hosting, CI, env vars, release checks' },
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
  '- devops-engineer owns build, hosting, CI and deploy steps (wrangler, Docker, pipelines). Deploy commands are blocked for everyone else, you included.',
  '- web-designer is blocked from writing scripts, build and config files (.js, .ts, .py, wrangler, package.json); route that work to the developers or DevOps from the start.',
  '- copywriter writes the words; marketing-strategist decides the message first when the page is new or repositioned; seo-specialist sets titles, metadata and structure.',
  '- Building or rebuilding a page is never one task: at least web-designer, then frontend-developer, then qa-tester.',
  '- New pages, redesigns, campaigns and brand work start with creative-director (direction), then copywriter and web-designer work from its brief, then creative-director reviews their output; only approved work goes to frontend-developer.',
  '- creative-director advises and approves; it writes only creative-brief.md and review notes, never code or page files.',
  '- Web research (crawling a site, capturing pages as Markdown, SEO audits) goes to seo-specialist, marketing-strategist or reverse-engineer; they may use the Scrapling MCP tools if installed. Getting past CAPTCHAs or Cloudflare is blocked for everyone.',
  '- "How does <another product> do <feature>?" goes to reverse-engineer first; the team then builds an original version from its report. Never copy another product\'s code, text or assets.',
  '- Anything with a form, login, payment, API or user data also gets security-reviewer before it is called done.',
  '- One agent, one role: if a brief would ask an agent to do another role\'s work, split it and assign that part to the other role.',
  '',
  'Superpowers, if installed:',
  '- For a big or unclear job, use its planning skills (superpowers:brainstorming, superpowers:writing-plans) to shape and split the work before you assign anything.',
  '- Use Superpowers to plan, never to implement yourself: when a skill such as executing-plans says to do the work, assign each step to the matching role instead.',
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

  // The hard rules: the main session (no agentId) may not change files, and
  // each role keeps to its own work (roleLimit).
  on('tool.call', async ($, e, next) => {
    const isFileTool = BUILD_TOOLS.includes(e.tool)
    // Bot-protection bypass is refused for everyone, even with /delegate off.
    const bypass = bypassLimit(e.tool, e as unknown as Record<string, unknown>)
    if (bypass) return { deny: bypass }
    if (!isFileTool && e.tool !== 'Bash') return next(e)
    let isActive = true
    try {
      isActive = await isOn(k => $.store.get(k))
    } catch {
      // Store unreadable: keep the default, on.
    }
    if (!isActive) return next(e)
    if (e.agentId === undefined && isFileTool) return { deny: BLOCKED(e.tool) }

    const fields = e as unknown as Record<string, unknown>
    const text = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string) : '')
    let role = ''
    if (e.agentId !== undefined) {
      try {
        role = roleName((await $.agent.list()).find(a => a.id === e.agentId)?.type)
      } catch {
        return next(e) // Cannot tell the role: do not block real work on a guess.
      }
    }
    const why = roleLimit(role, e.tool, text('file_path') || text('notebook_path'), text('command'))
    return why ? { deny: why } : next(e)
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
        ...composed.sections.filter(s => s.id !== 'chief-of-staff:chief-of-staff'),
        { id: 'chief-of-staff:chief-of-staff', text: CHIEF_OF_STAFF, scope: 'session' as const },
      ],
    }
  })
}
