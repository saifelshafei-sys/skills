import type { EngineInterface, Register } from 'claude-code'

import { checkMcp, toolWords } from './gate'
import { classify, hasFolder, mentionsProtected, normalize } from './paths'
import type { PathClass, Protected } from './paths'
import { bypassInCommand, destinations, historyKind, MAX_COMMAND, plainText, runsDeploy, runsLeasePush, shellNeedsPerson, UNKNOWN_CWD, unreadable } from './shell'
import {
  agentNamed, annotate, brokenLine, buildTeam, checkLines, confirmLines, departmentRules, EMPTY_TEAM,
  enabledIds, isClean, MAX_FILE_BYTES, offLine, ownName, PLUGIN, strictest, teamLines,
} from './team'
import type { Agent, Team, WriteLimit } from './team'

export * from './gate'
export * from './paths'
export * from './shell'
export * from './team'

const STORE_KEY = 'delegate'
/** The person's /team choices, in the plugin store like /delegate's. */
const TEAM_KEY = 'departments'
/** `/delegate credits ask | free`: whether media generation needs the person's OK. */
const CREDITS_KEY = 'credits'

/** Tools that change files. The Chief of Staff may not use them: agents do. */
export const BUILD_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

/** The tool that starts an agent: `Agent` now, `Task` in older Claude Code. */
const SPAWN_TOOLS = ['Agent', 'Task']

/** Files a `no-scripts` role (web-designer) may not write: scripts, build and deploy config. */
export const DESIGNER_OFF_LIMITS =
  /(\.(m?js|cjs|ts|mts|cts|py|sh|bash|ps1|bat|rb|go|rs|php|toml)$)|((^|[\\/])(package(-lock)?\.json|wrangler\.[a-z]+|Dockerfile|docker-compose\.ya?ml|vercel\.json|netlify\.toml)$)|((^|[\\/])\.github[\\/])/i

/**
 * The limits of the shipped roles (the twelve from before 0.11, the seven
 * Creative and Social roles from 0.11, the eight Finance and Risk roles from
 * 0.12), in code so no file can loosen
 * them: an agent file may make its role stricter, never looser. Only a role
 * listed here with `canDeploy` may deploy, and only as the exact type
 * `chief-of-staff:<name>` with `can-deploy: true` in a clean file. A new role
 * gets deploy rights only by being added here. `writeDirs`: project folders a
 * role's `write-dirs:` may open for any file type, despite its write limit.
 */
export const FLOOR: Readonly<Record<string, { writeLimit: WriteLimit; canDeploy: boolean; writeDirs?: string[] }>> = {
  'reverse-engineer': { writeLimit: 'md-only', canDeploy: false, writeDirs: ['research', 'captures'] },
  'creative-director': { writeLimit: 'md-only', canDeploy: false },
  'web-designer': { writeLimit: 'no-scripts', canDeploy: false },
  'devops-engineer': { writeLimit: 'none', canDeploy: true },
  'frontend-developer': { writeLimit: 'none', canDeploy: false },
  'backend-developer': { writeLimit: 'none', canDeploy: false },
  'qa-tester': { writeLimit: 'none', canDeploy: false },
  'security-reviewer': { writeLimit: 'none', canDeploy: false },
  'security-engineer': { writeLimit: 'none', canDeploy: false },
  'copywriter': { writeLimit: 'none', canDeploy: false },
  'marketing-strategist': { writeLimit: 'none', canDeploy: false },
  'seo-specialist': { writeLimit: 'none', canDeploy: false },
  // 0.11: Creative and Social
  'brand-designer': { writeLimit: 'no-scripts', canDeploy: false },
  'graphic-designer': { writeLimit: 'md-only', canDeploy: false },
  'video-producer': { writeLimit: 'md-only', canDeploy: false },
  'social-strategist': { writeLimit: 'md-only', canDeploy: false },
  'content-producer': { writeLimit: 'md-only', canDeploy: false },
  'community-manager': { writeLimit: 'md-only', canDeploy: false },
  'social-publisher': { writeLimit: 'md-only', canDeploy: false },
  // 0.12: Finance and Risk, Audit & Compliance
  'financial-analyst': { writeLimit: 'none', canDeploy: false },
  'credit-analyst': { writeLimit: 'none', canDeploy: false },
  'bookkeeper': { writeLimit: 'none', canDeploy: false },
  'risk-manager': { writeLimit: 'md-only', canDeploy: false },
  'controls-analyst': { writeLimit: 'md-only', canDeploy: false, writeDirs: ['controls'] },
  'internal-auditor': { writeLimit: 'md-only', canDeploy: false, writeDirs: ['audit'] },
  'model-risk-validator': { writeLimit: 'md-only', canDeploy: false, writeDirs: ['validation'] },
  'compliance-officer': { writeLimit: 'md-only', canDeploy: false },
}

/** Scrapling (or any) settings that get past bot protection: always refused. */
/** Keys whose truthy value gets past bot protection (Scrapling's and any): always refused. */
export const BYPASS_ARGS = /^(solve_?cloudflare|solve_?captcha|captcha.*|bypass.*)$/i
/** The same in a command line: the `--solve-...` flag in either spelling, or the key set to a truthy value with `=` or `:`, any quotes. */
export const BYPASS_SHELL = /--solve[-_]?(?:cloudflare|captcha)\b|\bsolve_?(?:cloudflare|captcha)\b['"]?\s*[=:]\s*['"]?(?:true|1|yes|on|t|y)\b/i
const TRUTHY = (v: unknown) => v === true || v === 1 || (typeof v === 'string' && /^(?:true|1|yes|on|t|y)$/i.test(v.trim()))

/** Whether some key at most four levels down asks to get past bot protection with a truthy value. */
function bypassIn(value: unknown, depth = 0): boolean {
  if (depth > 4 || !value || typeof value !== 'object') return false
  return Object.entries(value).some(([k, v]) => (BYPASS_ARGS.test(k) && TRUTHY(v)) || bypassIn(v, depth + 1))
}

/** Why a call tries to get past a site's bot protection, or undefined. Refused for everyone, always. */
export function bypassLimit(tool: string, fields: Record<string, unknown>): string | undefined {
  const why = 'Not allowed: this team does not get past CAPTCHAs, Cloudflare challenges or other bot protection. ' +
    'If a site blocks normal access, report it as blocked and move on (or use its public pages, an official API, or ask the person).'
  if (tool.startsWith('mcp__') && bypassIn(fields)) return why
  // Only in what actually runs: not a commit message, a grep pattern or a heredoc fed to a non-shell.
  if (commandFields(fields).some(c => bypassInCommand(c, BYPASS_SHELL))) return why
  return undefined
}

/** A role's short name: `chief-of-staff:web-designer` is `web-designer`. */
export function roleName(type: string | undefined): string {
  if (!type) return ''
  return type.includes(':') ? type.slice(type.lastIndexOf(':') + 1) : type
}

/** Why a history rewrite (filter-repo, filter-branch, BFG) is refused: what agents use it for is removing a leaked key. */
export const HISTORY_LIMIT = "Rewriting git history is the person's call: it can't be undone and breaks other copies. " +
  "Report the leaked key's location and rotation steps instead."
/** Why a force push, mirror or prune is refused (a deploying role may still `--force-with-lease`). */
export const FORCE_LIMIT = "Rewriting git history is the person's call: a force push, mirror or prune overwrites the remote, can't be undone " +
  'and breaks other copies. Push normally, or report that the push needs the person.'

/** What a caller may do: its write limit, whether it may deploy, and the hint its denials carry. */
export type Limits = { role: string; writeLimit: WriteLimit; canDeploy: boolean; hint: string; isBroken: boolean; writeDirs: string[] }

/** The Chief of Staff itself: no write limit (its own no-edit rule is separate), no deploy. */
export const CHIEF: Limits = { role: '', writeLimit: 'none', canDeploy: false, hint: '', isBroken: false, writeDirs: [] }
/** An agent whose type cannot be told: the tightest limits. */
export const UNKNOWN: Limits = { role: 'this agent', writeLimit: 'md-only', canDeploy: false, hint: '', isBroken: true, writeDirs: [] }

/**
 * The limits of a caller by its agent type (`chief-of-staff:web-designer`),
 * '' for the Chief of Staff, undefined when it cannot be told. This plugin's
 * roles get the FLOOR tightened by their file; one not loaded cleanly writes
 * only .md and never deploys. Another plugin's role or a built-in keeps the
 * FLOOR's restriction of its short name, and never deploys.
 */
export function limitsFor(type: string | undefined, team: Team): Limits {
  if (type === '') return CHIEF
  if (type === undefined) return UNKNOWN
  const own = ownName(type)
  const name = (own ?? roleName(type)).trim().toLowerCase()
  const floor = Object.hasOwn(FLOOR, name) ? FLOOR[name] : undefined
  if (own === undefined) return { role: name, writeLimit: floor?.writeLimit ?? 'none', canDeploy: false, hint: '', isBroken: false, writeDirs: [] }
  const agent = agentNamed(team, own)
  if (!agent || !isClean(agent)) return { role: own, writeLimit: 'md-only', canDeploy: false, hint: '', isBroken: true, writeDirs: [] }
  return {
    role: own,
    // A role not in the FLOOR that states no write-limit writes only .md (fail closed).
    writeLimit: strictest(floor?.writeLimit ?? 'none', agent.declaresWriteLimit ? agent.writeLimit : floor ? 'none' : 'md-only'),
    canDeploy: floor?.canDeploy === true && agent.canDeploy,
    hint: agent.limitHint,
    isBroken: false,
    // Folders the file opens, as far as the FLOOR allows them (reverse-engineer's research/ and captures/, the auditors' and validators' own folders).
    writeDirs: agent.writeDirs.filter(d => floor?.writeDirs?.includes(d)),
  }
}

/** Agents that may deploy: in the FLOOR as deployers, with a clean file that says `can-deploy: true`. */
export function deployers(team: Team): Agent[] {
  return team.agents.filter(a => limitsFor(a.type, team).canDeploy)
}

/** Why a caller with these limits may not write `path`, or undefined when it may. */
export function writeLimitWhy(limits: Limits, path: string): string | undefined {
  const who = limits.role || 'the Chief of Staff'
  if (limits.writeLimit === 'no-scripts' && DESIGNER_OFF_LIMITS.test(path)) {
    return `Role limit: ${who} does not write scripts, build or config files (${path}). ` +
      (limits.hint || 'Finish your part, then list in your report exactly what the frontend developer (code) or DevOps engineer (build, deploy) must do; the Chief of Staff assigns it.')
  }
  if (limits.writeLimit === 'md-only' && !/\.md$/i.test(path)) {
    if (limits.isBroken) {
      return `Role limit: ${who} writes only .md files until its agent file loads cleanly (see /team), not ${path}. Report what you would change; the Chief of Staff assigns it.`
    }
    return `Role limit: ${who} writes only .md reports and notes, not ${path}. ` +
      (limits.hint || 'Put what you found or want changed in your notes; the Chief of Staff assigns the maker.')
  }
  return undefined
}

/** Where a write limit applies: the project (the session's folder and below), outside temp folders. */
export type Scope = { cwd?: string; home?: string; temps: string[] }
export const TEMP_DIRS = ['/tmp', '/var/tmp', '/private/tmp', '/var/folders', '/private/var/folders']

/**
 * Why a caller may not write `path` under its write limit, or undefined. The
 * limit holds only inside the project: the session's folder and below (all
 * paths when that is not known), never in a temp folder; a `write-dirs:`
 * folder at the top of the project is open to any file. Protected places are
 * checked separately and everywhere.
 */
export function writeLimitAt(limits: Limits, path: string, scope: Scope): string | undefined {
  if (limits.writeLimit === 'none') return undefined
  const n = normalize(path, scope.home) ?? path.replace(/\\/g, '/')
  const temps = [...TEMP_DIRS, ...scope.temps].map(t => t.replace(/\\/g, '/').replace(/\/+$/, ''))
  const c = scope.cwd?.replace(/\\/g, '/').replace(/\/+$/, '')
  const insideProject = c !== undefined && c !== '' && (!n.startsWith('/') || n === c || n.startsWith(`${c}/`))
  // Inside the project the limit holds, even when the project itself is under a temp folder.
  if (!insideProject && temps.some(t => t !== '' && (n === t || n.startsWith(`${t}/`)))) return undefined
  let rel = n
  if (c && n.startsWith('/')) {
    if (!insideProject) return undefined
    rel = n === c ? '' : n.slice(c.length + 1)
  }
  const top = rel.replace(/^\.\//, '').split('/')[0] ?? ''
  if (!rel.startsWith('/') && limits.writeDirs.includes(top)) return undefined
  return writeLimitWhy(limits, path)
}

/** Why a caller with these limits may not run `command`, or undefined. */
export function commandLimitWhy(limits: Limits, command: string, team: Team): string | undefined {
  const kind = historyKind(command)
  if (kind === 'rewrite') return HISTORY_LIMIT
  if (kind === 'force') return FORCE_LIMIT
  if (!limits.canDeploy && runsLeasePush(command)) return FORCE_LIMIT
  if (!limits.canDeploy && runsDeploy(command)) {
    const can = deployers(team)
    if (can.length === 0) return 'Role limit: no role on the team may deploy right now (devops-engineer must be on the team with can-deploy: true in a clean agent file).'
    return `Role limit: only ${can.map(a => a.name).join(' or ')} deploys. ` +
      (limits.role === ''
        ? `Assign the deploy to ${can.map(a => a.type).join(' or ')}, after the person confirms it.`
        : `Stop and report that the work is ready to deploy; the Chief of Staff assigns ${can.map(a => a.name).join(' or ')}.`)
  }
  return undefined
}

/**
 * Why a call breaks a role's limit, or undefined when it may run. `role` is
 * this plugin's role by short name (`web-designer`), a full agent type
 * (`other-plugin:web-designer`), or '' for the Chief of Staff.
 */
export function roleLimit(role: string, tool: string, path: string, command: string, team: Team = EMPTY_TEAM): string | undefined {
  const limits = limitsFor(role === '' || role.includes(':') ? role : `${PLUGIN}:${role}`, team)
  if (tool === 'Bash') return commandLimitWhy(limits, command, team)
  if (BUILD_TOOLS.includes(tool)) return writeLimitWhy(limits, path)
  return undefined
}

/**
 * Whether a shell command writes to a protected place, as best it can tell:
 * a destination it can read (redirect, tee, cp, mv, sed -i, curl -o, tar -C,
 * ...) that is protected or names the plugin's folder; or a write it cannot
 * follow (an inline interpreter, a script, a variable in the destination)
 * in a command that mentions a protected place. Plain reads pass: only the
 * destination counts.
 */
export function shellProtected(command: string, at: Protected, cwd?: string): PathClass {
  if (unreadable(command)) return 'deny'
  const { dests, code } = destinations(command)
  const plain = plainText(command)
  // Inline code whose writes cannot be followed: refused when the code names a protected place.
  if (code.some(c => mentionsProtected(plainText(c), at))) return 'deny'
  let worst: PathClass
  for (const d of dests) {
    if (d.path.dynamic || d.path.text.startsWith(UNKNOWN_CWD)) { if (mentionsProtected(plain, at)) return 'deny'; continue }
    const c = destClass(joinCwd(d.path.text, cwd), at, d.into === true)
    if (c === 'deny') return 'deny'
    if (c === 'ask') worst = 'ask'
  }
  return worst
}

/** A relative path joined to the session's folder, when that is known. */
export function joinCwd(path: string, cwd: string | undefined): string {
  if (!cwd || /^(?:\/|~|\$HOME|\$\{HOME\}|[A-Za-z]:[\\/])/.test(path)) return path
  return `${cwd.replace(/[\\/]+$/, '')}/${path}`
}

/**
 * Whether a folder holds protected places in a way a write into it can reach:
 * any `.claude` folder, a Claude Code config folder, or a protected folder.
 */
export function isProtectedDir(plain: string, at: Protected): boolean {
  const p = plain.replace(/\/+$/, '').toLowerCase()
  if (/(^|\/)\.claude$/.test(p)) return true
  if (at.configDirs.some(d => d.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === p)) return true
  return classify(p, at) === 'deny'
}

/** What may happen to a write destination: refused if protected, under the plugin's folder name, or (for a write into a folder) a protected folder. */
export function destClass(path: string, at: Protected, into: boolean): PathClass {
  const n = normalize(path, at.home)
  if (n === undefined || hasFolder(n, at)) return 'deny'
  if (into && isProtectedDir(n, at)) return 'deny'
  return classify(n, at)
}

/** shellProtected with the protected places given as spellings (the plugin's folder, `.claude/...`): for tests and tools. */
export function shellWritesTo(command: string, spellings: string[]): boolean {
  const roots = spellings.filter(s => !/(^|\/)\.claude(\/|$)/.test(s.replace(/\\/g, '/')))
  const configDirs = spellings.filter(s => /\/\.claude\/(plugins|settings)$/.test(s)).map(s => s.replace(/\/(plugins|settings)$/, ''))
  return shellProtected(command, { roots, configDirs: [...new Set(configDirs)], home: undefined }) === 'deny'
}

/** The command-like fields a tool's input can carry: Bash, Monitor and PowerShell's `command`, an MCP process tool's. */
export const COMMAND_FIELDS = ['command', 'cmd', 'input', 'script', 'code']
/** MCP tools that run commands or code (by the words of their own name, so `desktop-commander` is not one). */
const MCP_RUNS = /(?:^|_)(?:process|processes|exec|execute|shell|command|commands|terminal|bash|run|script|code|eval|sandbox|python|interact)(?:_|$)/
/** MCP tools that write, move or produce files: their path-like arguments are checked. */
const MCP_WRITES = /(?:^|_)(?:write|edit|move|copy|put|save|download|export|output|generate|upload|create|extract|convert|unzip|rename|append|replace|patch|delete|remove|mkdir|insert|block|screenshot|capture|record|render|print|dump|snapshot)(?:_|$)/

/** The commands a call runs: a non-MCP tool's string `command`, or an MCP process tool's command-like fields. */
export function commandsOf(tool: string, fields: Record<string, unknown>): string[] {
  if (!tool.startsWith('mcp__')) return typeof fields.command === 'string' ? [fields.command] : []
  if (!MCP_RUNS.test(toolWords(tool))) return []
  return commandFields(fields)
}

/** Strings under command-like keys (command, cmd, input, script, code), up to four levels down. */
function commandFields(value: unknown, depth = 0, out: string[] = []): string[] {
  if (depth > 4 || !value || typeof value !== 'object') return out
  for (const [k, v] of Object.entries(value)) {
    if (COMMAND_FIELDS.includes(k)) strings(v, 0, out, 2)
    else commandFields(v, depth + 1, out)
  }
  return out
}

/** Whether an MCP tool's name says it writes, moves or produces files. */
export const mcpWrites = (tool: string) => MCP_WRITES.test(toolWords(tool))

/** Keys that name a path: their values are paths even with spaces in them, and `file://` is taken off. */
const PATH_KEYS = /^(?:path|paths|file|files|file_?path|filename|file_?name|dest|destination|target|output|output_?path|output_?dir|out|out_?dir|dir|directory|folder|to|save_?path|download_?path)$/i

/**
 * String fields that look like paths: values of path keys (spaces allowed,
 * `file://` removed), and strings that start with `/`, `~`, `./` or `../`, or
 * hold a `/` and a file extension (no URLs, no spaces). At most four levels down.
 */
export function pathLike(fields: Record<string, unknown>): string[] {
  const out: string[] = []
  const walk = (v: unknown, depth: number, key: string) => {
    if (typeof v === 'string') {
      let t = v.trim()
      if (t.length === 0 || t.length >= 4096) return
      if (/^file:\/\//i.test(t)) t = decodeURIComponent(t.replace(/^file:\/\/(?:localhost)?/i, ''))
      if (PATH_KEYS.test(key) && !/^[a-z][\w+.-]*:\/\//i.test(t)) { out.push(t); return }
      if (!/\s/.test(t) && !t.includes('://') &&
        (/^(?:\/|~|\.\.?\/|[A-Za-z]:[\\/])/.test(t) || (/[\\/]/.test(t) && /\.[A-Za-z0-9]{1,8}$/.test(t)))) out.push(t)
    } else if (depth < 4 && v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) if (!OWN_FIELDS.has(k)) walk(x, depth + 1, Array.isArray(v) ? key : k)
    }
  }
  walk(fields, -1, '')
  return out
}

export const PROTECTED_LIMIT = (path: string) =>
  `Not allowed: agents do not change this plugin, installed plugins, their store, or Claude Code's settings, agents, skills, commands, hooks, MCP or memory files (${path}). ` +
  'Report the change you want; the person makes it.'
export const UNRESOLVED_LIMIT = (path: string) =>
  `Not allowed: the path ${path} cannot be resolved, so it cannot be checked. Use a plain absolute path.`
export const TOO_LONG = `Not allowed: the command is too long (over ${MAX_COMMAND / 1024} KB) or too complex to check. Split it into shorter commands.`

/** The confirm gate's message, for the dialog and, where nobody can be asked, for the agent. */
export const CONFIRM = 'Draft it and report back; the Chief of Staff does this only after the person confirms.'
export function confirmReason(role: string, what: string, agent?: Agent): string {
  const who = role || 'A subagent'
  const listed = agent && agent.confirm.length > 0 ? ` (${role} needs the person's OK for: ${agent.confirm.join('; ')})` : ''
  return `${who} wants to ${what}${listed}. ${CONFIRM}`
}

export const GUARD_FAILED = (tool: string) =>
  `Chief of Staff guard failed while checking ${tool}, so the call is refused. Try again; if it keeps failing, tell the person.`

export const BLOCKED = (tool: string) =>
  `Chief of Staff rule: you do not ${tool === 'Write' ? 'create' : 'edit'} files yourself. ` +
  'Delegate this to the matching team agent (chief-of-staff:<role>) with the Agent tool (a full brief: goal, files, constraints, what to report). ' +
  'If no role fits, use general-purpose. The person can turn this rule off with /delegate off.'

/**
 * Why this plugin's agent type may not be assigned now, or undefined. Other
 * plugins' roles and built-ins are never refused. The type is matched trimmed
 * and in any case, as Claude Code resolves it.
 */
export function departmentLimit(type: string | undefined, team: Team, on: Set<string>): string | undefined {
  const name = ownName(type)
  if (name === undefined) return undefined
  const agent = team.agents.find(a => a.name === name)
  if (!agent) return `${PLUGIN}:${name} is not on the team (no agent file of that name loaded). Check the name, or ask the person to run /team.`
  if (!isClean(agent)) {
    return `${agent.type} cannot be assigned: its agent file has problems (${agent.problems.join('; ')}). Tell the person to fix it; /team lists the problems.`
  }
  if (on.has(agent.department)) return undefined
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

/** The opening and closing lines while the person has turned delegation off (/delegate off): no no-edit rule. */
const INTRO_CAN_EDIT = 'You run a team of specialist agents. The person has turned delegation off (/delegate off), so you may edit files yourself; still delegate work that fits a role to the team with the Agent tool, plan, assign, coordinate, check results, and report to the person.'
const OUTRO_CAN_EDIT = 'Answer plain questions and talk with the person yourself. If no team role fits a task, use general-purpose or do it yourself, and say so.'

/** Routing rules that span departments: always in the prompt, with a note for a named role that cannot be assigned now. */
export const CORE_RULES = [
  '- Web research (crawling a site, capturing pages as Markdown, SEO audits) goes to seo-specialist, marketing-strategist or reverse-engineer; they may use the Scrapling MCP tools if installed. Getting past CAPTCHAs or Cloudflare is blocked for everyone.',
  '- "How does <another product> do <feature>?" goes to reverse-engineer first; the team then builds an original version from its report. Never copy another product\'s code, text or assets.',
  '- Anything with a form, login, payment, API or user data also gets security-reviewer before it is called done.',
  '- One agent, one role: if a brief would ask an agent to do another role\'s work, split it and assign that part to the other role.',
  '- If a guardrail refuses something you believe is legitimate, stop and report the exact refusal. Never work around it (for example by writing the command to a script file and running it). Tell every agent the same in its brief.',
  '- Agents need the person\'s OK for any connected (MCP) tool that is not clearly read-only, and for shell commands that run claude, change GitHub or send data out: they draft it and report back, and you do it only after the person confirms.',
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
 * The Chief of Staff's instructions, generated from the team: departments
 * that are on and their agents, departments that are off, agent files with
 * problems, department rules, maker-checker and confirm lines, then the core
 * text. A rule that names a role that cannot be assigned now says so.
 */
export function chiefPrompt(team: Team, on: Set<string>, canEdit = false): string {
  const off = offLine(team, on)
  const broken = brokenLine(team)
  const list = teamLines(team, on)
  const none = team.agents.length === 0
    ? '- (no agents could be loaded: use general-purpose and tell the person to check the plugin with /team)'
    : '- (no department with assignable agents is on: tell the person, who can turn one on with /team on <id>)'
  return [
    ...(canEdit ? INTRO.map(l => (l.startsWith('You run a team') ? INTRO_CAN_EDIT : l)) : INTRO),
    ...(list.length > 0 ? list : [none]),
    ...(off ? ['', off] : []),
    ...(broken ? ['', broken] : []),
    '',
    'Routing rules (follow them even when one agent could do it all):',
    ...departmentRules(team, on),
    ...checkLines(team, on),
    ...confirmLines(team, on),
    ...CORE_RULES.map(r => annotate(r, team, on)),
    ...(canEdit ? OUTRO.map(l => (l.startsWith('Answer plain questions') ? OUTRO_CAN_EDIT : l)) : OUTRO),
  ].join('\n')
}

export async function isOn(get: (key: string) => Promise<unknown>): Promise<boolean> {
  return (await get(STORE_KEY)) !== false
}

/** The person's /team choices: department id to on (true) or off (false); anything else stored is ignored. */
export async function chosenDepartments(get: (key: string) => Promise<unknown>): Promise<Record<string, boolean>> {
  const v = await get(TEAM_KEY)
  const out: Record<string, boolean> = Object.create(null)
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const k of Object.keys(v)) {
      const b = (v as Record<string, unknown>)[k]
      if (b === true || b === false) out[k] = b
    }
  }
  return out
}

/** Reads agents/*.md and departments.json from the plugin's folder: regular files of up to 64 KiB only. Never throws. */
async function readTeam($: EngineInterface): Promise<Team> {
  const root = $.plugin.root.replace(/[\\/]+$/, '')
  const skipped: string[] = []
  const listing = async (dir: string) => {
    try {
      return await $.fs.list(dir)
    } catch {
      return undefined
    }
  }
  const usable = (e: { name: string; kind: string; isLink: boolean; size: number }, where: string) => {
    if (e.kind !== 'file' || e.isLink) { skipped.push(`${where}${e.name} is not a regular file; skipped`); return false }
    if (e.size > MAX_FILE_BYTES) { skipped.push(`${where}${e.name} is over ${MAX_FILE_BYTES / 1024} KiB; skipped`); return false }
    return true
  }
  const text = async (path: string): Promise<string | undefined> => {
    try {
      const t = await $.fs.read(path, { length: MAX_FILE_BYTES })
      return typeof t === 'string' ? t : undefined
    } catch {
      return undefined
    }
  }
  const top = await listing(root)
  const dj = top?.find(e => e.name === 'departments.json')
  const json = dj && usable(dj, '') ? await text(`${root}/departments.json`) : undefined
  const entries = await listing(`${root}/agents`)
  const names = (entries ?? []).filter(e => /\.md$/i.test(e.name) && usable(e, 'agents/')).map(e => e.name)
  const bodies = await Promise.all(names.map(n => text(`${root}/agents/${n}`)))
  if (entries === undefined) skipped.unshift('the agents folder could not be listed')
  return buildTeam(json, Object.fromEntries(names.map((n, i) => [n, bodies[i]])), skipped)
}

/** The team, read once and kept; prompt.compose, /team and session.start read it again, so edits apply from the next message. */
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

/** Whether media generation runs without asking: on unless the person set `/delegate credits ask`; unreadable means ask. */
async function creditsFree($: EngineInterface): Promise<boolean> {
  try {
    return (await $.store.get(CREDITS_KEY)) !== 'ask'
  } catch {
    return false
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

/** The calling agent's type: '' for the Chief of Staff, undefined when it cannot be told. */
async function typeOf($: EngineInterface, agentId: string | undefined): Promise<string | undefined> {
  if (agentId === undefined) return (await isNested($)) ? undefined : ''
  try {
    return (await $.agent.list()).find(a => a.id === agentId)?.type
  } catch {
    return undefined
  }
}

/** Where no agent may write, resolved for this machine. */
async function protectedPlaces($: EngineInterface): Promise<Protected> {
  const roots = [$.plugin.root.replace(/[\\/]+$/, '')]
  try {
    const real = (await $.fs.stat($.plugin.root, { resolve: true })).realPath
    if (real) roots.push(real)
  } catch {
    // The spelling alone.
  }
  const get = async (read: () => Promise<string | undefined>) => {
    try {
      return (await read())?.trim() || undefined
    } catch {
      return undefined
    }
  }
  const home = (await get(() => $.env.get('HOME'))) ?? (await get(() => $.env.get('USERPROFILE')))
  const config = await get(() => $.env.get('CLAUDE_CONFIG_DIR'))
  const configDirs = [config, home ? `${home.replace(/[\\/]+$/, '')}/.claude` : undefined]
    .filter((d): d is string => !!d).map(d => d.replace(/\\/g, '/'))
  return { roots: roots.map(r => r.replace(/\\/g, '/')), configDirs, home }
}

/** The real path of a plain path: its nearest existing ancestor resolved, the rest joined on; undefined when none resolves. */
async function realOf($: EngineInterface, path: string): Promise<string | undefined> {
  let at = path
  let rest = ''
  for (let i = 0; i < 64; i++) {
    const stat = await $.fs.stat(at, { resolve: true }).catch(() => undefined)
    if (stat?.realPath) return normalize(`${stat.realPath.replace(/\\/g, '/').replace(/\/+$/, '')}${rest}`, undefined)
    if (at === '/' || at === '.' || /^[A-Za-z]:\/?$/.test(at)) return undefined
    const cut = at.lastIndexOf('/')
    if (cut < 0) { rest = `/${at}${rest}`; at = '.'; continue }
    rest = `${at.slice(cut)}${rest}`
    at = cut === 0 ? '/' : at.slice(0, cut)
  }
  return undefined
}

/** What may happen to an agent's write to `path`: refused, asked of the person, unresolvable, or nothing. */
async function pathClassOf($: EngineInterface, path: string, at: Protected): Promise<PathClass | 'unresolved'> {
  const plain = normalize(path, at.home)
  if (plain === undefined) return 'unresolved'
  const real = await realOf($, plain)
  if (real === undefined) return 'unresolved'
  const classes = [destClass(plain, at, true), destClass(real, at, true)]
  return classes.includes('deny') ? 'deny' : classes.includes('ask') ? 'ask' : undefined
}

/** Every string in a value, nested ones too (bounded). */
function strings(value: unknown, depth = 0, out: string[] = [], max = 6): string[] {
  if (typeof value === 'string') out.push(value)
  else if (depth < max && value && typeof value === 'object') for (const v of Object.values(value)) strings(v, depth + 1, out, max)
  return out
}

const OWN_FIELDS = new Set(['tool', 'agentId', 'tool_use_id'])

/** Origins of a command run that are the person's own: Enter at the prompt, the Remote Control bridge, their own `claude -p`. */
const PERSON_ORIGINS = new Set(['composer', 'bridge'])
const byPerson = (e: { origin?: { kind?: string } }) => PERSON_ORIGINS.has(e.origin?.kind ?? '')
const NOT_PERSON = 'Only the person can loosen this setting, typed at the prompt or through Remote Control: not `claude -p`, a plugin, a schedule, ' +
  'another session or a Claude Code session started by an agent. Tightening works from anywhere.'

/**
 * Whether this session was started from inside another Claude Code session
 * (`CLAUDECODE` or `CLAUDE_CODE_CHILD_SESSION` set, as Claude Code sets them
 * for what it runs): then the whole session is held to agent limits, and
 * nothing can loosen the settings.
 */
let nestedRead: Promise<boolean> | undefined
function isNested($: EngineInterface): Promise<boolean> {
  nestedRead ??= (async () => {
    for (const name of ['CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION'] as const) {
      try {
        const v = name === 'CLAUDECODE' ? await $.env.get('CLAUDECODE') : await $.env.get('CLAUDE_CODE_CHILD_SESSION')
        if (v !== undefined && v.trim() !== '' && v.trim() !== '0') return true
      } catch {
        // Not readable: not known to be nested.
      }
    }
    return false
  })()
  return nestedRead
}

/** Where write limits apply now: the session's folder, $HOME, and temp folders ($TMPDIR, Claude's scratchpad). */
async function scopeOf($: EngineInterface, at: Protected): Promise<Scope> {
  let cwd: string | undefined
  try {
    cwd = (await $.session.cwd()).replace(/\\/g, '/')
  } catch {
    cwd = undefined
  }
  const temps: string[] = []
  try {
    const t = await $.env.get('TMPDIR')
    if (t) temps.push(t)
  } catch {
    // None.
  }
  return { cwd, home: at.home, temps }
}

/** Shell write destinations resolved through their nearest existing folder, then classified. */
async function shellPathClass($: EngineInterface, command: string, at: Protected, cwd: string | undefined): Promise<PathClass> {
  const lexical = shellProtected(command, at, cwd)
  if (lexical === 'deny') return 'deny'
  let worst = lexical
  for (const d of destinations(command).dests) {
    if (d.path.dynamic || d.path.text.startsWith(UNKNOWN_CWD)) continue
    const plain = normalize(joinCwd(d.path.text, cwd), at.home)
    if (plain === undefined) return 'deny'
    const real = await realOf($, plain)
    const c = real === undefined ? undefined : destClass(real, at, d.into === true)
    if (c === 'deny') return 'deny'
    if (c === 'ask') worst = 'ask'
  }
  return worst
}

/** What /team shows: every department, on or off, and its agents; agent files with problems. */
export function teamReport(team: Team, on: Set<string>): string {
  const lines = ['Departments (change with /team on <id> or /team off <id>, several ids or "all"; /team reset goes back to the defaults):']
  for (const d of team.departments) {
    const agents = team.agents.filter(a => a.department === d.id).map(a => (isClean(a) ? a.name : `${a.name} (cannot be assigned: see problems)`))
    lines.push(`- ${d.name} (${d.id}): ${on.has(d.id) ? 'on' : 'off'}. ${agents.length > 0 ? agents.join(', ') : 'No agents yet.'}`)
  }
  const lost = team.agents.filter(a => a.department === '')
  if (lost.length > 0) lines.push(`- No department (cannot be assigned until their files name one): ${lost.map(a => a.name).join(', ')}`)
  if (team.problems.length > 0) lines.push('', 'Problems in the team files:', ...team.problems.map(p => `- ${p}`))
  return lines.join('\n')
}

/** Answers `/team`, `/team on|off <ids>` (or `all`), `/team reset`: the text, and the choices to store when they change. */
export function teamCommand(args: string, team: Team, chosen: Readonly<Record<string, boolean>>): { text: string; chosen?: Record<string, boolean> } {
  const [verb = '', ...rest] = args.trim().toLowerCase().split(/[\s,]+/).filter(Boolean)
  if (verb === '') return { text: teamReport(team, enabledIds(team, chosen)) }
  if (verb === 'reset' && rest.length === 0) {
    const none: Record<string, boolean> = Object.create(null)
    return { text: `Every department is back to its default. It applies from your next message.\n\n${teamReport(team, enabledIds(team, none))}`, chosen: none }
  }
  if ((verb !== 'on' && verb !== 'off') || rest.length === 0) {
    return { text: 'Use /team to see the departments, /team on <id> or /team off <id> (several ids, or all), or /team reset.' }
  }
  const asked = [...new Set(rest)]
  const unknown = asked.filter(id => id !== 'all' && !team.departments.some(d => d.id === id))
  if (unknown.length > 0) {
    return { text: `Unknown department: ${unknown.join(', ')}. Nothing changed. Departments: ${team.departments.map(d => d.id).join(', ')}.` }
  }
  const ids = asked.includes('all') ? team.departments.map(d => d.id) : asked
  const next: Record<string, boolean> = Object.create(null)
  for (const k of Object.keys(chosen)) if (chosen[k] === true || chosen[k] === false) next[k] = chosen[k]
  for (const id of ids) next[id] = verb === 'on'
  const names = ids.map(id => team.departments.find(d => d.id === id)?.name ?? id)
  return { text: `${names.join(', ')}: ${verb}. It applies from your next message.\n\n${teamReport(team, enabledIds(team, next))}`, chosen: next }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'delegate',
      description: 'Chief of Staff delegation: on, off, credits ask | free, or show the settings',
      argumentHint: 'on | off | credits ask | credits free',
    })
    await $.command.register({
      name: 'team',
      description: 'Chief of Staff departments: show them, turn them on or off, or reset',
      argumentHint: 'on <id> | off <id> | on all | off all | reset',
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

  // The hard rules. Only the Chief of Staff's own no-edit rule follows
  // /delegate; role limits, deploys, history rewrites, protected paths and
  // the department gate always apply. A guard that fails refuses.
  on('tool.call', async ($, e, next) => {
    const tool = e.tool
    const fields = e as unknown as Record<string, unknown>
    const text = (k: string) => (typeof fields[k] === 'string' ? (fields[k] as string) : '')
    const isFile = BUILD_TOOLS.includes(tool)
    const isSpawn = SPAWN_TOOLS.includes(tool)
    const isMcp = tool.startsWith('mcp__')
    // Bot-protection bypass is refused for everyone, always.
    const bypass = bypassLimit(tool, fields)
    if (bypass) return { deny: bypass }
    // Commands: Bash, Monitor, PowerShell (any tool with a string `command`), and an MCP process tool's command fields.
    const commands = commandsOf(tool, fields)
    if (!isFile && !isSpawn && !isMcp && commands.length === 0) return next(e)
    // A session started inside another Claude Code session is held to agent limits throughout, and its
    // main loop keeps the no-edit rule whatever /delegate says.
    const nested = await isNested($)
    const isAgent = e.agentId !== undefined || nested
    if (e.agentId === undefined && isFile && (nested || (await delegating($)))) return { deny: BLOCKED(tool) }

    // A command too long or too complex to read: the Chief of Staff's is refused; an agent's goes to the person (tool.check).
    const readable = commands.filter(c => !unreadable(c))
    if (!isAgent && readable.length < commands.length) return { deny: TOO_LONG }
    // History rewrites and force pushes: refused for everyone, before anything else is looked up.
    for (const c of readable) {
      const kind = historyKind(c)
      if (kind) return { deny: kind === 'rewrite' ? HISTORY_LIMIT : FORCE_LIMIT }
    }

    const team = await teamOf($)
    if (isSpawn) {
      const type = text('subagent_type')
      let why = departmentLimit(type, team, await enabled($, team))
      if (why && ownName(type) !== undefined && !team.agents.some(a => a.name === ownName(type))) {
        const fresh = await teamOf($, true) // A file added since the last read.
        why = departmentLimit(type, fresh, await enabled($, fresh))
      }
      return why ? { deny: why } : next(e)
    }

    const type = await typeOf($, e.agentId)
    // In a nested session only an exact FLOOR role keeps its own limits; every other agent writes only .md and never deploys.
    const own = ownName(type)
    const limits = nested && !(own !== undefined && Object.hasOwn(FLOOR, own)) ? UNKNOWN : limitsFor(type, team)
    for (const c of readable) {
      const why = commandLimitWhy(limits, c, team)
      if (why) return { deny: why }
    }
    const paths = isFile ? [text('file_path') || text('notebook_path')]
      : isMcp && mcpWrites(tool) ? pathLike(fields) : []
    const at = await protectedPlaces($)
    const scope = await scopeOf($, at)
    if (isAgent) {
      for (const p of paths) {
        const c = await pathClassOf($, joinCwd(p, scope.cwd), at)
        if (c === 'unresolved') return { deny: UNRESOLVED_LIMIT(p) }
        if (c === 'deny') return { deny: PROTECTED_LIMIT(p) }
      }
      for (const c of readable) {
        if ((await shellPathClass($, c, at, scope.cwd)) === 'deny') return { deny: PROTECTED_LIMIT('a protected path in the command') }
        // Best effort: the write limit on files a command writes (redirects, tee, cp, sed -i, ...), inside the project.
        for (const d of destinations(c).dests) {
          if (!d.content || d.into || d.path.dynamic || d.path.text.startsWith(UNKNOWN_CWD)) continue
          const n = normalize(d.path.text, at.home)
          if (n === undefined || n.startsWith('/dev/') || !/\.[A-Za-z0-9]+$/.test(n)) continue
          const why = writeLimitAt(limits, joinCwd(n, scope.cwd), scope)
          if (why) return { deny: why }
        }
      }
    }
    for (const p of paths) {
      const why = writeLimitAt(limits, joinCwd(p, scope.cwd), scope)
      if (why) return { deny: why }
    }
    return next(e)
  }).catch(($, e, next) => {
    if (next.called) return next(e)
    const t = e.tool
    const fields = e as unknown as Record<string, unknown>
    return BUILD_TOOLS.includes(t) || SPAWN_TOOLS.includes(t) || typeof fields.command === 'string' || t.startsWith('mcp__')
      ? { deny: GUARD_FAILED(t) } : next(e)
  })

  // Departments that are off, and agent files with problems, are not offered
  // to the model at all, and their spawns are refused.
  on('agent.offer', async ($, e, next) => {
    if (ownName(e.agent) === undefined) return next(e)
    const team = await teamOf($)
    return departmentLimit(e.agent, team, await enabled($, team)) ? { isOffered: false } : next(e)
  }).catch(($, e, next) => (next.called || ownName(e.agent) === undefined ? next(e) : { isOffered: false }))

  on('agent.spawn', async ($, e, next) => {
    if (ownName(e.subagentType) === undefined) return next(e)
    const team = await teamOf($)
    const why = departmentLimit(e.subagentType, team, await enabled($, team))
    return why ? { deny: why } : next(e)
  }).catch(($, e, next) => (next.called || ownName(e.subagentType) === undefined ? next(e) : { deny: GUARD_FAILED('this spawn') }))

  // The confirm gate. What an agent may do only with the person's OK goes to
  // the person (an ask), or is refused where no person can be asked: an MCP
  // call that is not clearly read-only; a command that runs claude, changes
  // GitHub, publishes, moves main, sends data out, or is too long to check;
  // a write to a project's CLAUDE.md. The Chief of Staff is not gated: it
  // asks the person itself. Always on.
  on('tool.check', async ($, e, next) => {
    if (e.agentId === undefined && !(await isNested($))) return next(e)
    const input = (e.input ?? {}) as Record<string, unknown>
    let what: string | undefined
    if (e.tool.startsWith('mcp__')) {
      const long = commandsOf(e.tool, input).some(c => c.length > MAX_COMMAND)
      const check = checkMcp(e.tool, e.isReadOnly === true, await creditsFree($))
      if (long) what = `run ${e.tool} with a command over ${MAX_COMMAND / 1024} KB, too long to check`
      else if (check.verdict === 'ask') what = `run ${e.tool}, which needs the person's OK: ${check.why}`
    } else if (typeof input.command === 'string') {
      const why = shellNeedsPerson(input.command)
      const at = await protectedPlaces($)
      if (why) what = `run a ${e.tool} command that ${why}`
      else if ((await shellPathClass($, input.command, at, (await scopeOf($, at)).cwd)) === 'ask') what = `run a ${e.tool} command that writes a CLAUDE.md memory file`
    } else if (BUILD_TOOLS.includes(e.tool)) {
      const p = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : ''
      const at = await protectedPlaces($)
      const n = normalize(p, at.home)
      if (n !== undefined && classify(n, at) === 'ask') what = `edit ${p}, a CLAUDE.md memory file every later session reads`
    }
    if (what === undefined) return next(e)
    const verdict = await next(e)
    if (verdict.decision === 'deny') return verdict
    const type = await typeOf($, e.agentId)
    const role = ownName(type) ?? (type ? roleName(type) : '')
    const reason = confirmReason(role, what, agentNamed(await teamOf($), role))
    return e.approver === 'person' ? { decision: 'ask' as const, reason } : { decision: 'deny' as const, reason }
  }).catch(($, e, next) => {
    if (e.agentId === undefined && nestedRead === undefined) return next(e)
    const input = (e.input ?? {}) as Record<string, unknown>
    if (e.tool.startsWith('mcp__') || typeof input.command === 'string' || BUILD_TOOLS.includes(e.tool)) {
      return { decision: 'deny' as const, reason: GUARD_FAILED(e.tool) }
    }
    return next(e)
  })

  on('command.run', { command: 'delegate' }, async ($, e) => {
    const [want = '', arg = ''] = e.args.trim().toLowerCase().split(/\s+/)
    // Loosening (delegation off, credits free) only from the person; tightening from anywhere.
    const loosens = (want === 'off' && arg === '') || (want === 'credits' && arg === 'free')
    if (loosens && (!byPerson(e) || (await isNested($)))) return { text: NOT_PERSON }
    if ((want === 'on' || want === 'off') && arg === '') {
      await $.store.set(STORE_KEY, want === 'on')
      $.ui.status(want === 'on' ? 'Chief of Staff: delegating' : undefined)
      return {
        text: `Chief of Staff delegation is ${want}. It applies from your next message.` +
          (want === 'off' ? ' Only the Chief of Staff\'s own no-edit rule is lifted: role limits, departments, deploy and history rules, and the confirm gate stay on.' : ''),
      }
    }
    if (want === 'credits' && (arg === 'ask' || arg === 'free')) {
      await $.store.set(CREDITS_KEY, arg)
      return { text: arg === 'free'
        ? 'Generation credits: free. Agents may generate images, video, audio, voices and designs without asking.'
        : 'Generation credits: ask. Agents ask you before each image, video, audio, voice or design generation.' }
    }
    if (want !== '') return { text: 'Use /delegate on, /delegate off, /delegate credits ask or /delegate credits free.' }
    const isDelegating = await isOn(k => $.store.get(k))
    const free = await creditsFree($)
    return { text: `Chief of Staff delegation is ${isDelegating ? 'on' : 'off'}. Generation credits: ${free ? 'free' : 'ask'}. ` +
      'Use /delegate on | off | credits ask | credits free.' }
  })

  on('command.run', { command: 'team' }, async ($, e) => {
    const team = await teamOf($, true)
    const chosen = await chosenDepartments(k => $.store.get(k))
    const said = teamCommand(e.args, team, chosen)
    if (said.chosen) {
      // Turning a department on (also by /team reset) loosens: only from the person. Turning one off works from anywhere.
      const before = enabledIds(team, chosen)
      const loosens = [...enabledIds(team, said.chosen)].some(id => !before.has(id))
      if (loosens && (!byPerson(e) || (await isNested($)))) return { text: NOT_PERSON }
      await $.store.set(TEAM_KEY, { ...said.chosen })
    }
    return { text: said.text }
  })

  // Only the main session can assign work: it is the one offered the Agent (or older Task) tool.
  // With /delegate off the team, departments and rules stay; only the no-edit wording goes.
  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (!e.tools.some(t => SPAWN_TOOLS.includes(t))) return composed
    const canEdit = !(await delegating($))
    const team = await teamOf($, true)
    return {
      sections: [
        ...composed.sections.filter(s => s.id !== 'chief-of-staff:chief-of-staff'),
        { id: 'chief-of-staff:chief-of-staff', text: chiefPrompt(team, await enabled($, team), canEdit), scope: 'session' as const },
      ],
    }
  })
}
