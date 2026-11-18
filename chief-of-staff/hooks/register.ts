import type { EngineInterface, Register } from 'claude-code'

import {
  agentNamed, agentOfType, allDepartments, buildTeam, checkLines, confirmLines, departmentRules, EMPTY_TEAM,
  enabledIds, offLine, OTHER, teamLines,
} from './team'
import type { Agent, Team, WriteLimit } from './team'

export * from './team'

const STORE_KEY = 'delegate'
/** The person's /team choices, in the plugin store like /delegate's. */
const TEAM_KEY = 'departments'

/** Tools that change files. The Chief of Staff may not use them: agents do. */
export const BUILD_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

/** The tool that starts an agent: `Agent` now, `Task` in older Claude Code. */
const SPAWN_TOOLS = ['Agent', 'Task']

/** Files a `write-limit: no-scripts` role (web-designer) may not write: scripts, build and deploy config. */
export const DESIGNER_OFF_LIMITS =
  /(\.(m?js|cjs|ts|mts|cts|py|sh|bash|ps1|bat|rb|go|rs|php|toml)$)|((^|[\\/])(package(-lock)?\.json|wrangler\.[a-z]+|Dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml)$)|((^|[\\/])\.github[\\/])/i

/** Commands that ship the site; only a `can-deploy: true` role (devops-engineer) runs them. */
export const DEPLOY = /\b(wrangler\s+(deploy|publish|pages\s+deploy)|vercel\s+(deploy|--prod)|netlify\s+deploy|firebase\s+deploy|npm\s+run\s+deploy|pnpm\s+(run\s+)?deploy|yarn\s+deploy)\b/i

/** Where a command starts: line start, `;`, `&`, `|`, newline, `(`, `$(`, a backtick or `{`. */
const COMMAND_START = String.raw`(?:^|[;&|\n(\x60{])\s*`
/** What may come before the command: shell keywords, `FOO=1` env assignments, runners such as npx. */
const COMMAND_PREFIX = String.raw`(?:(?:then|do|else|elif|if|while|until|!)\s+)*(?:[A-Za-z_]\w*=\S*\s+)*` +
  String.raw`(?:(?:npx|bunx|pnpm\s+(?:dlx|exec)|yarn\s+dlx|sudo|env|command|exec|nohup|time|xargs)\s+(?:-\S+\s+)*(?:[A-Za-z_]\w*=\S*\s+)*)*(?:\S*\/)?`
/** `git` with its global options (`-C dir`, `-c k=v`, `--no-pager`) before the subcommand. */
const GIT = String.raw`git\s+(?:-[cC]\s+\S+\s+|--?[\w-]+(?:=\S*)?\s+)*`
/** Tools that rewrite a repository's history: refused for everyone. */
export const HISTORY_REWRITE = new RegExp(String.raw`(?:${GIT}filter-(?:repo|branch)|bfg|java\s+(?:-\S+\s+)*-jar\s+\S*bfg[\w.-]*\.jar)(?![\w-])`, 'i')
/** A push that overwrites the remote: `--force`, `-f` (or `-uf`), or a `+branch` refspec. */
export const FORCE_PUSH = new RegExp(String.raw`${GIT}push(?![\w-])[^;&|\n)]*?\s(?:--force(?![\w-])|-[A-Za-z]*f[A-Za-z]*(?![\w-])|\+[^\s+])`, 'i')
/** `git push --force-with-lease`: normal branch work, so `can-deploy` roles (devops-engineer) only. */
export const LEASE_PUSH = new RegExp(String.raw`${GIT}push(?![\w-])[^;&|\n)]*?\s--force-with-lease(?![\w-])`, 'i')

/** A shell that runs a heredoc body or a quoted string as commands: keep that text. */
const RUNS_HEREDOC = /\b(ba|z|da|k)?sh\s*$/
const RUNS_QUOTED = /(\b(ba|z|da|k)?sh\s+(-\w+\s+)*-\w*c\s*|\beval\s+)$/

/**
 * Whether a shell command actually runs `pattern`, not merely mentions it.
 * Heredoc bodies and quoted strings are dropped first (unless a shell runs
 * them: `bash -c "..."`, `eval '...'`, `bash <<EOF`, or `"$(...)"`), then the
 * pattern must sit at a command position. When unsure, it says yes.
 */
export function runsCommand(command: string, pattern: RegExp): boolean {
  const source = pattern.source.startsWith(String.raw`\b`) ? pattern.source.slice(2) : pattern.source
  return new RegExp(COMMAND_START + COMMAND_PREFIX + `(?:${source})`, 'i').test(runnableText(command))
}

/** Whether a shell command actually runs a deploy, not merely mentions one. */
export function runsDeploy(command: string): boolean {
  return runsCommand(command, DEPLOY)
}

/** The command with inert text (heredoc bodies, quoted strings) emptied, so only what runs is left. */
function runnableText(command: string): string {
  const noHeredocs = command.replace(
    /(?<!<)<<(-?)[ \t]*(['"]?)([A-Za-z_][\w.-]*)\2([^\n]*)(?:\n[\s\S]*?(?:\n[ \t]*\3[ \t]*(?=\n|$)|$)|$)/g,
    (all, _dash, _q, _tag, rest, offset: number, whole: string) => {
      const before = whole.slice(whole.lastIndexOf('\n', offset - 1) + 1, offset)
      return RUNS_HEREDOC.test(before) ? all : `<<HEREDOC${rest}`
    })
  return noHeredocs.replace(/'[^']*'|"(?:[^"\\]|\\[\s\S])*"/g, (quoted, offset: number, whole: string) => {
    const inner = quoted.slice(1, -1)
    if (RUNS_QUOTED.test(whole.slice(0, offset))) return `(${inner})`
    const q = quoted[0] ?? ''
    if (q === '"' && /\$\(|\x60/.test(inner)) return `(${inner})`
    return q + q
  })
}

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

/** Why a history rewrite or force push is refused (a can-deploy role may still `--force-with-lease`). */
export const HISTORY_LIMIT = "Rewriting git history is the person's call: it can't be undone and breaks other copies. " +
  "Report the leaked key's location and rotation steps instead."

/** Why a role with this write-limit may not write `path`, or undefined when it may. */
export function writeLimit(role: string, limit: WriteLimit, path: string): string | undefined {
  if (limit === 'no-scripts' && DESIGNER_OFF_LIMITS.test(path)) {
    return `Role limit: ${role} does not write scripts, build or config files (${path}). ` +
      'Finish your part (the design), then list in your report exactly what the frontend developer (code) or DevOps engineer (build, deploy) must do; the Chief of Staff assigns it.'
  }
  if (limit === 'md-only' && !/\.md$/i.test(path)) {
    return `Role limit: ${role} writes only .md reports and notes, not ${path}. ` +
      'Put what you found, the direction or the change you want in your notes; the Chief of Staff assigns the maker.'
  }
  return undefined
}

/**
 * Why a call breaks a role's limit, or undefined when it may run. `role` is
 * the calling agent's short type, '' for the Chief of Staff; its limits come
 * from its frontmatter in `team` (write-limit, can-deploy).
 */
export function roleLimit(role: string, tool: string, path: string, command: string, team: Team = EMPTY_TEAM): string | undefined {
  const agent = role === '' ? undefined : agentNamed(team, role)
  if (agent && BUILD_TOOLS.includes(tool)) {
    const why = writeLimit(role, agent.writeLimit, path)
    if (why) return why
  }
  if (tool !== 'Bash') return undefined
  const canDeploy = agent?.canDeploy === true
  if (runsCommand(command, HISTORY_REWRITE) || runsCommand(command, FORCE_PUSH) || (!canDeploy && runsCommand(command, LEASE_PUSH))) {
    return HISTORY_LIMIT
  }
  if (!canDeploy && runsDeploy(command)) {
    const deployers = team.agents.filter(a => a.canDeploy)
    if (deployers.length === 0) return 'Role limit: no role on the team may deploy (none has can-deploy: true in its agent file).'
    return `Role limit: only ${deployers.map(a => a.name).join(' or ')} deploys. ` +
      (role === ''
        ? `Assign the deploy to ${deployers.map(a => a.type).join(' or ')}, after the person confirms it.`
        : `Stop and report that the work is ready to deploy; the Chief of Staff assigns ${deployers.map(a => a.name).join(' or ')}.`)
  }
  return undefined
}

/**
 * MCP tools that act for the person where others see it: send, post,
 * publish, schedule, comment, like, delete, trash, pay or transfer.
 * Matched on the tool's own name (after `mcp__<server>__`), split into
 * lower-case words (`slack_send_message`, `sendMessage` and
 * `comment-on-design` all split), so `send` matches `send_message` but not
 * `sender_info`, and `post` matches `create_post` but not `list_posts`.
 */
export const SENDS = /(?:^|_)(?:send|reply|forward|publish|schedule|post|comment|commit|like|react|reaction|respond|rsvp|tweet|retweet|upvote|delete|trash|destroy|purge|pay|payment|transfer|purchase|buy|checkout)(?:_|$)/
/**
 * A tool whose first word, or second after a service prefix, only reads,
 * prepares or undoes: `get_post`, `list_comments`, `cancel_like`,
 * `untrash_message`, `tiktok_prepare_publish`.
 */
export const READS = /^(?:[a-z0-9]+_)?(?:get|list|search|read|find|fetch|query|describe|show|view|count|lookup|preview|inspect|analy[sz]e|estimate|check|validate|resolve|download|prepare|cancel|undo|un[a-z]+)(?:_|$)/
/** A tool that reads about an action, not does it: `tiktok_publish_status`. */
export const ABOUT = /_(?:status|statuses|settings|options|config|info|history|analytics|preview)$/
/** A draft is fine to write (`create_comment_draft`, `slack_send_message_draft`); finishing one is not. */
export const DRAFT = /(?:^|_)drafts?(?:_|$)/
export const FINISHES_DRAFT = /(?:^|_)(?:publish|schedule|commit|delete|trash)(?:_|$)/

/** An MCP tool's own name as lower-case words joined by `_`: `mcp__Gmail__sendMessage` is `send_message`. */
export function toolWords(tool: string): string {
  const own = tool.startsWith('mcp__') ? tool.split('__').slice(2).join('_') : tool
  return own.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join('_')
}

/** Whether an MCP tool clearly sends, posts, publishes, deletes or pays for the person. */
export function sendsForPerson(tool: string): boolean {
  if (!tool.startsWith('mcp__')) return false
  const words = toolWords(tool)
  // `delete_list` is a delete, not a list: a read word counts only when the first word is not an action.
  const first = words.split('_')[0] ?? ''
  if (words === '' || (READS.test(words) && !SENDS.test(first)) || ABOUT.test(words)) return false
  if (DRAFT.test(words)) return FINISHES_DRAFT.test(words)
  return SENDS.test(words)
}

/** The confirm gate's message, for the dialog and, where nobody can be asked, for the agent. */
export const CONFIRM = 'Draft it and report back; the Chief of Staff does this only after the person confirms.'
export function confirmReason(role: string, tool: string, agent?: Agent): string {
  const who = role || 'A subagent'
  const listed = agent && agent.confirm.length > 0 ? ` (${role} needs the person's OK for: ${agent.confirm.join('; ')})` : ''
  return `${who} wants to run ${tool}, which acts for the person where others can see it (send, post, publish, delete or pay)${listed}. ${CONFIRM}`
}

export const BLOCKED = (tool: string) =>
  `Chief of Staff rule: you do not ${tool === 'Write' ? 'create' : 'edit'} files yourself. ` +
  'Delegate this to the matching team agent (chief-of-staff:<role>) with the Agent tool (a full brief: goal, files, constraints, what to report). ' +
  'If no role fits, use general-purpose. The person can turn this rule off with /delegate off.'

/** Why the Chief of Staff may not assign this agent type now, or undefined. Other plugins' roles are never refused. */
export function departmentLimit(type: string | undefined, team: Team, on: Set<string>): string | undefined {
  const agent = agentOfType(team, type)
  if (!agent || on.has(agent.department)) return undefined
  const d = team.departments.find(x => x.id === agent.department)
  return `The ${d?.name ?? agent.department} department is off, so ${agent.type} cannot be assigned. ` +
    `Ask the person to run /team on ${agent.department} if they want it (it applies from their next message), or do the work with a role that is on.`
}

/** The core text before the team list. */
const INTRO = [
  '# You are the Chief of Staff',
  '',
  'You run a team of specialist agents. You do not edit or create files yourself: Edit, Write, MultiEdit and NotebookEdit are blocked for you. For any work on a project (building, designing, writing, fixing, reviewing, testing, shipping), delegate it to the team with the Agent tool. Your own job is to plan, assign, coordinate, check results, and report to the person. You may read files and search to plan and to check work.',
  '',
  'Your team, by department (pass the type as subagent_type, and set name to the short role, e.g. "web-designer"):',
]

/** Routing rules that span departments: always in the prompt. */
const CORE_RULES = [
  '- Web research (crawling a site, capturing pages as Markdown, SEO audits) goes to seo-specialist, marketing-strategist or reverse-engineer; they may use the Scrapling MCP tools if installed. Getting past CAPTCHAs or Cloudflare is blocked for everyone.',
  '- "How does <another product> do <feature>?" goes to reverse-engineer first; the team then builds an original version from its report. Never copy another product\'s code, text or assets.',
  '- Anything with a form, login, payment, API or user data also gets security-reviewer before it is called done.',
  '- One agent, one role: if a brief would ask an agent to do another role\'s work, split it and assign that part to the other role.',
  '- Agents may not send, post, publish, schedule, comment, like, delete, pay or transfer through connected tools: they draft it and report back, and you do it only after the person confirms.',
]

/** The core text after the routing rules: unchanged by departments. */
const OUTRO = [
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
]

/**
 * The Chief of Staff's instructions, generated from the team: enabled
 * departments and their agents, departments that are off, department rules,
 * maker-checker and confirm lines, then the core text.
 */
export function chiefPrompt(team: Team, on: Set<string>): string {
  const off = offLine(team, on)
  const team_ = teamLines(team, on)
  return [
    ...INTRO,
    ...(team_.length > 0 ? team_ : ['- (no agents could be loaded: use general-purpose and tell the person to check the plugin with /team)']),
    ...(off ? ['', off] : []),
    '',
    'Routing rules (follow them even when one agent could do it all):',
    ...departmentRules(team, on),
    ...checkLines(team, on),
    ...confirmLines(team, on),
    ...CORE_RULES,
    ...OUTRO,
  ].join('\n')
}

export async function isOn(get: (key: string) => Promise<unknown>): Promise<boolean> {
  return (await get(STORE_KEY)) !== false
}

/** The person's /team choices: department id to on (true) or off (false). */
export async function chosenDepartments(get: (key: string) => Promise<unknown>): Promise<Record<string, boolean>> {
  const v = await get(TEAM_KEY)
  return v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, boolean>) } : {}
}

/** Reads agents/*.md and departments.json from the plugin's folder. Never throws. */
async function readTeam($: EngineInterface): Promise<Team> {
  const root = $.plugin.root.replace(/[\\/]+$/, '')
  const text = async (path: string): Promise<string | undefined> => {
    try {
      const t = await $.fs.read(path)
      return typeof t === 'string' ? t : undefined
    } catch {
      return undefined
    }
  }
  let names: string[] | undefined
  try {
    names = (await $.fs.list(`${root}/agents`)).filter(f => f.kind !== 'dir' && /\.md$/i.test(f.name)).map(f => f.name)
  } catch {
    names = undefined
  }
  const [json, ...bodies] = await Promise.all([text(`${root}/departments.json`), ...(names ?? []).map(n => text(`${root}/agents/${n}`))])
  const team = buildTeam(json, Object.fromEntries((names ?? []).map((n, i) => [n, bodies[i]])))
  if (names === undefined) team.problems.unshift('the agents folder could not be listed')
  return team
}

/** The team, read once and kept; prompt.compose and session.start read it again, so edits apply from the next message. */
let loaded: Promise<Team> | undefined
function teamOf($: EngineInterface, isFresh = false): Promise<Team> {
  if (isFresh || !loaded) loaded = readTeam($).catch(() => ({ ...EMPTY_TEAM, problems: ['the team could not be read'] }))
  return loaded
}

async function delegating($: EngineInterface): Promise<boolean> {
  try {
    return await isOn(k => $.store.get(k))
  } catch {
    return true // Store unreadable: keep the default, on.
  }
}

async function enabled($: EngineInterface, team: Team): Promise<Set<string>> {
  let chosen: Record<string, boolean> = {}
  try {
    chosen = await chosenDepartments(k => $.store.get(k))
  } catch {
    // Store unreadable: each department's default.
  }
  return enabledIds(team, chosen)
}

/** What /team shows: every department, on or off, and its agents. */
export function teamReport(team: Team, on: Set<string>): string {
  const lines = ['Departments (change with /team on <id> or /team off <id>; "all" for every one):']
  for (const d of allDepartments(team)) {
    const agents = team.agents.filter(a => a.department === d.id).map(a => a.name)
    const state = d.id === OTHER.id ? 'always on' : on.has(d.id) ? 'on' : 'off'
    lines.push(`- ${d.name} (${d.id}): ${state}. ${agents.length > 0 ? agents.join(', ') : 'No agents yet.'}`)
  }
  if (team.problems.length > 0) lines.push('', 'Problems in the team files:', ...team.problems.map(p => `- ${p}`))
  return lines.join('\n')
}

/** Answers `/team`, `/team on <id>`, `/team off <id>` (or `all`): the text, and the choices to store when they change. */
export function teamCommand(args: string, team: Team, chosen: Record<string, boolean>): { text: string; chosen?: Record<string, boolean> } {
  const [verb = '', ...rest] = args.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (verb === '') return { text: teamReport(team, enabledIds(team, chosen)) }
  if ((verb !== 'on' && verb !== 'off') || rest.length === 0) {
    return { text: 'Use /team to see the departments, or /team on <id> / /team off <id> (or all).' }
  }
  const want = verb === 'on'
  const ids = rest.includes('all') ? team.departments.map(d => d.id) : rest
  const unknown = ids.filter(id => !team.departments.some(d => d.id === id))
  if (unknown.length > 0) {
    const other = unknown.includes(OTHER.id) ? ' Other is always on.' : ''
    return { text: `Unknown department: ${unknown.join(', ')}.${other} Departments: ${team.departments.map(d => d.id).join(', ')}.` }
  }
  const next = { ...chosen }
  for (const id of ids) next[id] = want
  const names = ids.map(id => team.departments.find(d => d.id === id)?.name ?? id)
  return { text: `${names.join(', ')}: ${verb}. It applies from your next message.\n\n${teamReport(team, enabledIds(team, next))}`, chosen: next }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'delegate',
      description: 'Chief of Staff delegation: on, off, or show the current setting',
      argumentHint: 'on | off',
    })
    await $.command.register({
      name: 'team',
      description: 'Chief of Staff departments: show them, or turn one on or off',
      argumentHint: 'on <id> | off <id> | on all | off all',
    })
    void teamOf($, true)
    // Say so at start-up, so the person can see the rule is loaded.
    try {
      if (await isOn(k => $.store.get(k))) $.ui.status('Chief of Staff: delegating')
    } catch {
      // Status only.
    }
    return next(e)
  })

  // The hard rules: the main session (no agentId) may not change files, each
  // role keeps to its own work (roleLimit), and agents of a department that
  // is off cannot be assigned (departmentLimit).
  on('tool.call', async ($, e, next) => {
    const isFileTool = BUILD_TOOLS.includes(e.tool)
    const isSpawn = SPAWN_TOOLS.includes(e.tool)
    // Bot-protection bypass is refused for everyone, even with /delegate off.
    const bypass = bypassLimit(e.tool, e as unknown as Record<string, unknown>)
    if (bypass) return { deny: bypass }
    if (!isFileTool && !isSpawn && e.tool !== 'Bash') return next(e)
    if (!(await delegating($))) return next(e)
    if (e.agentId === undefined && isFileTool) return { deny: BLOCKED(e.tool) }

    const fields = e as unknown as Record<string, unknown>
    const text = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string) : '')
    const team = await teamOf($)
    if (isSpawn) {
      const why = departmentLimit(text('subagent_type'), team, await enabled($, team))
      return why ? { deny: why } : next(e)
    }
    let role = ''
    if (e.agentId !== undefined) {
      try {
        role = roleName((await $.agent.list()).find(a => a.id === e.agentId)?.type)
      } catch {
        return next(e) // Cannot tell the role: do not block real work on a guess.
      }
    }
    const why = roleLimit(role, e.tool, text('file_path') || text('notebook_path'), text('command'), team)
    return why ? { deny: why } : next(e)
  })

  // The confirm gate: an agent's MCP call that sends, posts, publishes,
  // deletes or pays goes to the person (an ask), or is refused where nobody
  // can be asked. The main session asks the person itself, so it is not gated.
  on('tool.check', async ($, e, next) => {
    if (e.agentId === undefined || !sendsForPerson(e.tool)) return next(e)
    if (!(await delegating($))) return next(e)
    const verdict = await next(e)
    if (verdict.decision === 'deny') return verdict
    let role = ''
    try {
      role = roleName((await $.agent.list()).find(a => a.id === e.agentId)?.type)
    } catch {
      // The message names no role.
    }
    const reason = confirmReason(role, e.tool, agentNamed(await teamOf($), role))
    return e.approver ? { decision: 'ask' as const, reason } : { decision: 'deny' as const, reason }
  }).catch(($, e, next) => (e.agentId !== undefined && sendsForPerson(e.tool)
    ? { decision: 'deny' as const, reason: confirmReason('', e.tool) }
    : next(e)))

  on('command.run', { command: 'delegate' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    if (want === 'on' || want === 'off') {
      await $.store.set(STORE_KEY, want === 'on')
      $.ui.status(want === 'on' ? 'Chief of Staff: delegating' : undefined)
      return { text: `Chief of Staff delegation is ${want}. It applies from your next message.` }
    }
    return { text: `Chief of Staff delegation is ${(await isOn(k => $.store.get(k))) ? 'on' : 'off'}. Use /delegate on or /delegate off.` }
  })

  on('command.run', { command: 'team' }, async ($, e) => {
    const team = await teamOf($, true)
    const said = teamCommand(e.args, team, await chosenDepartments(k => $.store.get(k)))
    if (said.chosen) await $.store.set(TEAM_KEY, said.chosen)
    return { text: said.text }
  })

  // Only the main session can assign work: it is the one offered the Agent (or older Task) tool.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.some(t => SPAWN_TOOLS.includes(t))) return composed
    if (!(await delegating($))) return composed
    const team = await teamOf($, true)
    return {
      sections: [
        ...composed.sections.filter(s => s.id !== 'chief-of-staff:chief-of-staff'),
        { id: 'chief-of-staff:chief-of-staff', text: chiefPrompt(team, await enabled($, team)), scope: 'session' as const },
      ],
    }
  })
}
