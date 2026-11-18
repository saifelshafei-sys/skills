/**
 * The team as data: each agent's settings come from the frontmatter of its
 * own `agents/<name>.md`, and the departments from `departments.json`. Both
 * are read at run time (see readTeam in register.ts), so a new agent is one
 * new .md file and no code change.
 *
 * Everything here is pure: text in, values out. Nothing in it can throw on a
 * bad file; problems are collected in `Team.problems` instead.
 */

/** The plugin's name, the prefix of every agent type: `chief-of-staff:web-designer`. */
export const PLUGIN = 'chief-of-staff'

/** Where an agent goes when its department is missing or unknown. Always on. */
export const OTHER = { id: 'other', name: 'Other', purpose: 'Agents whose department is missing or unknown.', isDefaultOn: true, rules: [] as string[] }

/**
 * What files a role may write. `none`: any. `md-only`: only `.md` reports and
 * notes. `no-scripts`: no scripts, build or deploy config (DESIGNER_OFF_LIMITS).
 */
export type WriteLimit = 'none' | 'md-only' | 'no-scripts'
export const WRITE_LIMITS: readonly WriteLimit[] = ['none', 'md-only', 'no-scripts']

export type Department = {
  id: string
  name: string
  /** One line: what the department is for. */
  purpose: string
  /** On when the person has not set it with /team. */
  isDefaultOn: boolean
  /** Routing rules (prose lines) the Chief of Staff gets while the department is on. */
  rules: string[]
}

export type Agent = {
  /** Short name, the file's `name:` (`web-designer`). */
  name: string
  /** What the Agent tool takes as subagent_type (`chief-of-staff:web-designer`). */
  type: string
  /** A department id from departments.json, or `other`. */
  department: string
  /** The one line the Chief of Staff reads about the role. */
  does: string
  writeLimit: WriteLimit
  /** May run deploy commands and `git push --force-with-lease`. */
  canDeploy: boolean
  /** Roles that check this role's output before it is called done. */
  checkedBy: string[]
  /** Actions that need the person's OK first (prose). */
  confirm: string[]
}

export type Team = {
  departments: Department[]
  agents: Agent[]
  /** What was wrong with the files, for /team to show. Never fatal. */
  problems: string[]
}

export const EMPTY_TEAM: Team = { departments: [], agents: [], problems: [] }

/**
 * A tiny frontmatter parser: the `---` block at the top of a Markdown file,
 * one `key: value` per line. Values may be quoted; a value may also be a
 * `[a, b]` list or a block of `- item` lines (both are joined with ", ", so
 * every value comes back as a string). Comments (`# ...` lines) are skipped.
 * No frontmatter gives `{}`.
 */
export function parseFrontmatter(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return out
  let listKey: string | undefined
  for (const raw of (m[1] ?? '').split(/\r?\n/)) {
    if (/^\s*(#.*)?$/.test(raw)) continue
    const item = /^\s+-\s+(.*)$/.exec(raw) ?? (listKey !== undefined ? /^-\s+(.*)$/.exec(raw) : null)
    if (item && listKey !== undefined) {
      const v = unquote((item[1] ?? '').trim())
      out[listKey] = out[listKey] ? `${out[listKey]}, ${v}` : v
      continue
    }
    const kv = /^([A-Za-z_][\w-]*)\s*:(?:\s+(.*))?$/.exec(raw.trimEnd())
    if (!kv) { listKey = undefined; continue }
    const key = (kv[1] ?? '').toLowerCase()
    const value = (kv[2] ?? '').trim()
    listKey = value === '' ? key : undefined
    if (value.startsWith('[') && value.endsWith(']')) {
      out[key] = value.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean).join(', ')
    } else {
      out[key] = unquote(value)
    }
  }
  return out
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) return v.slice(1, -1)
  return v.replace(/\s+#.*$/, '')
}

/** A comma-separated value as a list: `a, b` is `['a', 'b']`. */
export function listOf(value: string | undefined): string[] {
  return (value ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

function isTrue(value: string | undefined): boolean {
  return /^(true|yes|on)$/i.test((value ?? '').trim())
}

/** The first sentence of a description, for an agent with no `does:`. */
function firstSentence(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return (/^(.*?[.!?])(\s|$)/.exec(one)?.[1] ?? one).replace(/\.$/, '')
}

/**
 * Departments from departments.json's text: `{ "departments": [...] }` or a
 * bare array, each `{ id, name, purpose, default: "on" | "off", rules: [] }`.
 * A bad file gives no departments and a problem, never a throw.
 */
export function parseDepartments(json: string | undefined, problems: string[] = []): Department[] {
  if (json === undefined) { problems.push('departments.json could not be read'); return [] }
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    problems.push('departments.json is not valid JSON')
    return []
  }
  const list = Array.isArray(data) ? data : (data as { departments?: unknown } | null)?.departments
  if (!Array.isArray(list)) { problems.push('departments.json has no "departments" list'); return [] }
  const seen = new Set<string>()
  const out: Department[] = []
  for (const d of list as Record<string, unknown>[]) {
    const id = typeof d?.id === 'string' ? d.id.trim().toLowerCase() : ''
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id === OTHER.id || seen.has(id)) {
      problems.push(`departments.json: skipped a department with a missing, bad or repeated id (${JSON.stringify(d?.id)})`)
      continue
    }
    seen.add(id)
    const on = d.default
    out.push({
      id,
      name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : id,
      purpose: typeof d.purpose === 'string' ? d.purpose.trim() : '',
      isDefaultOn: on === true || (typeof on === 'string' && /^(on|true|yes)$/i.test(on)),
      rules: Array.isArray(d.rules) ? d.rules.filter((r): r is string => typeof r === 'string' && r.trim() !== '').map(r => r.trim()) : [],
    })
  }
  return out
}

/**
 * One agent from its file's text. A missing or unknown department puts it
 * under Other; a bad write-limit is read as `md-only`, the tightest, so a typo
 * never widens what a role may do. Undefined only when the file has no name.
 */
export function parseAgent(file: string, text: string, departments: Department[], problems: string[] = []): Agent | undefined {
  const fm = parseFrontmatter(text)
  const name = (fm.name ?? '').trim()
  if (!/^[A-Za-z0-9][\w.-]*$/.test(name)) {
    problems.push(`${file}: no valid name in its frontmatter; skipped`)
    return undefined
  }
  let department = (fm.department ?? '').trim().toLowerCase()
  if (!departments.some(d => d.id === department)) {
    problems.push(`${file}: ${department ? `unknown department "${department}"` : 'no department'}; listed under Other`)
    department = OTHER.id
  }
  let writeLimit = (fm['write-limit'] ?? 'none').trim().toLowerCase() as WriteLimit
  if (!WRITE_LIMITS.includes(writeLimit)) {
    problems.push(`${file}: unknown write-limit "${fm['write-limit']}"; treated as md-only`)
    writeLimit = 'md-only'
  }
  return {
    name,
    type: `${PLUGIN}:${name}`,
    department,
    does: (fm.does ?? '').trim() || firstSentence(fm.description ?? '') || name,
    writeLimit,
    canDeploy: isTrue(fm['can-deploy']),
    checkedBy: listOf(fm['checked-by']),
    confirm: listOf(fm.confirm),
  }
}

/**
 * The whole team from the files' text: `agents` maps a file name to its text
 * (undefined for a file that could not be read). Agents come out in
 * department order, then by name.
 */
export function buildTeam(departmentsJson: string | undefined, agents: Record<string, string | undefined>): Team {
  const problems: string[] = []
  const departments = parseDepartments(departmentsJson, problems)
  const order = (id: string) => { const i = departments.findIndex(d => d.id === id); return i < 0 ? departments.length : i }
  const list: Agent[] = []
  for (const [file, text] of Object.entries(agents).sort(([a], [b]) => a.localeCompare(b))) {
    if (text === undefined) { problems.push(`${file} could not be read`); continue }
    const agent = parseAgent(file, text, departments, problems)
    if (!agent) continue
    if (list.some(a => a.name === agent.name)) { problems.push(`${file}: a second agent named ${agent.name}; skipped`); continue }
    list.push(agent)
  }
  for (const a of list) {
    for (const c of a.checkedBy) if (!list.some(b => b.name === c)) problems.push(`${a.name}: checked-by names ${c}, which is not on the team`)
  }
  list.sort((a, b) => order(a.department) - order(b.department) || a.name.localeCompare(b.name))
  return { departments, agents: list, problems }
}

/** Departments as /team shows them: every listed one, plus Other when an agent is in it. */
export function allDepartments(team: Team): Department[] {
  return team.agents.some(a => a.department === OTHER.id) ? [...team.departments, OTHER] : team.departments
}

/** Which departments are on: the person's /team choices over each one's default. Other is always on. */
export function enabledIds(team: Team, chosen: Record<string, boolean> | undefined): Set<string> {
  const on = new Set<string>([OTHER.id])
  for (const d of team.departments) if (chosen?.[d.id] ?? d.isDefaultOn) on.add(d.id)
  return on
}

/** An agent of this plugin by its subagent_type, or undefined for anyone else's (general-purpose, other plugins). */
export function agentOfType(team: Team, type: string | undefined): Agent | undefined {
  if (!type || !type.startsWith(`${PLUGIN}:`)) return undefined
  const name = type.slice(PLUGIN.length + 1)
  return team.agents.find(a => a.name === name)
}

/** An agent by its short name (`web-designer`). */
export function agentNamed(team: Team, name: string): Agent | undefined {
  return team.agents.find(a => a.name === name)
}

const departmentOf = (team: Team, id: string) => allDepartments(team).find(d => d.id === id)

/** The maker-checker lines: "<role>'s output goes to <checker> before it is called done." */
export function checkLines(team: Team, on: Set<string>): string[] {
  const lines: string[] = []
  for (const a of team.agents) {
    if (!on.has(a.department) || a.checkedBy.length === 0) continue
    const checkers = a.checkedBy.map(c => {
      const checker = agentNamed(team, c)
      if (checker && !on.has(checker.department)) {
        return `${c} (its department, ${departmentOf(team, checker.department)?.name ?? checker.department}, is off: ask the person to run /team on ${checker.department})`
      }
      return c
    })
    lines.push(`- ${a.name}'s output goes to ${checkers.join(', then ')} before it is called done.`)
  }
  return lines
}

/** The confirm lines: actions a role does only after the person's OK. */
export function confirmLines(team: Team, on: Set<string>): string[] {
  return team.agents
    .filter(a => on.has(a.department) && a.confirm.length > 0)
    .map(a => `- ${a.name} needs the person's OK, through you, before it does any of: ${a.confirm.join('; ')}.`)
}

/**
 * The team section of the Chief of Staff's prompt: enabled departments that
 * have agents, each with its agents; then the departments that are off.
 */
export function teamLines(team: Team, on: Set<string>): string[] {
  const lines: string[] = []
  for (const d of allDepartments(team)) {
    const agents = team.agents.filter(a => a.department === d.id)
    if (!on.has(d.id) || agents.length === 0) continue
    lines.push(`${d.name}${d.purpose ? ` (${d.purpose.replace(/\.$/, '')})` : ''}:`)
    for (const a of agents) lines.push(`- ${a.type}: ${a.does}`)
  }
  return lines
}

/** Departments that are off, by name, with the command that turns each on. */
export function offLine(team: Team, on: Set<string>): string | undefined {
  const off = team.departments.filter(d => !on.has(d.id))
  if (off.length === 0) return undefined
  return 'Departments that are off (their agents cannot be assigned; if a request needs one, tell the person): ' +
    off.map(d => `${d.name} (turn on with /team on ${d.id})`).join(', ') + '.'
}

/** The department routing rules, in department order, for enabled departments. */
export function departmentRules(team: Team, on: Set<string>): string[] {
  return team.departments.filter(d => on.has(d.id)).flatMap(d => d.rules.map(r => `- ${r}`))
}
