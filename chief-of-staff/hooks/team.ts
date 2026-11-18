/**
 * The team as data: each agent's settings come from the frontmatter of its
 * own `agents/<name>.md`, and the departments from `departments.json`. Both
 * are read at run time (see readTeam in register.ts), so a new agent is one
 * new .md file and no code change.
 *
 * The files can only tighten what a role may do. The limits a shipped role
 * keeps whatever its file says, and the only roles that may deploy, are in
 * FLOOR in register.ts.
 *
 * Everything here is pure: text in, values out. Nothing in it throws on a bad
 * file; each problem is recorded, and an agent with a problem cannot be
 * assigned until it is fixed.
 */

/** The plugin's name, the prefix of every agent type: `chief-of-staff:web-designer`. */
export const PLUGIN = 'chief-of-staff'

/** The biggest team file read (agents/*.md, departments.json); a bigger one is skipped. */
export const MAX_FILE_BYTES = 64 * 1024

/**
 * What files a role may write. `none`: any. `no-scripts`: no scripts, build
 * or deploy config (DESIGNER_OFF_LIMITS). `md-only`: only `.md` reports and
 * notes. Listed loosest first.
 */
export type WriteLimit = 'none' | 'no-scripts' | 'md-only'
export const WRITE_LIMITS: readonly WriteLimit[] = ['none', 'no-scripts', 'md-only']

/** The tighter of two write limits. */
export function strictest(a: WriteLimit, b: WriteLimit): WriteLimit {
  return WRITE_LIMITS.indexOf(a) >= WRITE_LIMITS.indexOf(b) ? a : b
}

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

/**
 * The twelve departments, used when departments.json is missing or cannot be
 * read, so a broken file never turns a department on or loses one.
 */
export const FALLBACK_DEPARTMENTS: readonly Department[] = [
  ['product-engineering', 'Product & Engineering', 'research, build, test and ship the product', true],
  ['security', 'Security', 'find and fix security problems before release', true],
  ['creative', 'Creative', 'creative direction, design and words', true],
  ['marketing-pr', 'Marketing & PR', 'audience, positioning, message and search', true],
  ['social', 'Social', 'social media posts, replies and community', true],
  ['sales', 'Sales', 'leads, outreach, proposals and the pipeline', false],
  ['data-analytics', 'Data & Analytics', 'metrics, dashboards, analysis and experiments', false],
  ['finance', 'Finance', 'budgets, invoices, pricing and financial reports', false],
  ['risk-audit-compliance', 'Risk, Audit & Compliance', 'risk registers, audits, policies and regulatory checks', false],
  ['legal', 'Legal', 'contracts, terms, privacy and intellectual property', false],
  ['operations-people', 'Operations & People', 'processes, tools, hiring and onboarding', false],
  ['strategy-research', 'Strategy & Research', 'market research, competitors and business strategy', false],
].map(([id, name, purpose, on]) => ({ id: id as string, name: name as string, purpose: purpose as string, isDefaultOn: on as boolean, rules: [] }))

export type Agent = {
  /** Short name, the file's `name:` (`web-designer`). */
  name: string
  /** What the Agent tool takes as subagent_type (`chief-of-staff:web-designer`). */
  type: string
  /** The file it came from (`web-designer.md`), or every file for a repeated name. */
  file: string
  /** A department id, or '' when the file names none that exists. */
  department: string
  /** The one line the Chief of Staff reads about the role. */
  does: string
  /** As the file states it; register.ts tightens it with the FLOOR. */
  writeLimit: WriteLimit
  /** The file says `can-deploy: true`. Honoured only for a role the FLOOR lets deploy. */
  canDeploy: boolean
  /** Roles that check this role's output before it is called done. */
  checkedBy: string[]
  /** Actions that need the person's OK first (prose). */
  confirm: string[]
  /** Where it sits in its department's list (lower first); unset sorts after, by name. */
  order: number | undefined
  /** Added to the role's denial message (`limit-hint:`). */
  limitHint: string
  /** What is wrong with its file. Any problem: it cannot be assigned, and it writes only .md. */
  problems: string[]
}

export type Team = {
  departments: Department[]
  agents: Agent[]
  /** What was wrong with the files, for /team to show. Never fatal. */
  problems: string[]
}

export const EMPTY_TEAM: Team = { departments: [...FALLBACK_DEPARTMENTS], agents: [], problems: [] }

/** Whether an agent's file loaded with no problem. */
export const isClean = (a: Agent) => a.problems.length === 0

/**
 * A tiny frontmatter parser: the `---` block at the top of a Markdown file,
 * one `key: value` per line. Keys are read in lower case. A value may be
 * quoted, a `[a, b]` list, or a block of `- item` lines (both are joined with
 * ", ", so every value comes back as a string). Whole-line `#` comments are
 * skipped; a `#` inside a value is part of it (no inline comments). A key
 * given twice (in any case) is listed in `repeated`; the first value stays.
 */
export function parseFrontmatter(text: string): Record<string, string> {
  return readFrontmatter(text).fields
}

export function readFrontmatter(text: string): { fields: Record<string, string>; repeated: string[]; hasBlock: boolean } {
  const fields: Record<string, string> = Object.create(null)
  const repeated: string[] = []
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  if ((lines[0] ?? '').trimEnd() !== '---') return { fields, repeated, hasBlock: false }
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---')
  if (end < 0) return { fields, repeated, hasBlock: false }
  let listKey: string | undefined
  for (const raw of lines.slice(1, end)) {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) continue
    const item = /^\s*-\s+(.*)$/.exec(raw)
    if (item && listKey !== undefined) {
      const v = unquote((item[1] ?? '').trim())
      fields[listKey] = fields[listKey] ? `${fields[listKey]}, ${v}` : v
      continue
    }
    listKey = undefined
    const colon = raw.indexOf(':')
    const key = colon < 0 ? '' : raw.slice(0, colon).trim().toLowerCase()
    if (!/^[a-z_][\w-]*$/.test(key) || raw.slice(0, colon) !== raw.slice(0, colon).trimStart()) continue
    const value = raw.slice(colon + 1).trim()
    if (key in fields) { repeated.push(key); continue }
    if (value === '') { fields[key] = ''; listKey = key; continue }
    fields[key] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map(s => unquote(s.trim())).filter(Boolean).join(', ')
      : unquote(value)
  }
  return { fields, repeated, hasBlock: true }
}

function unquote(v: string): string {
  if (v.length >= 2 && ((v[0] === '"' && v.endsWith('"')) || (v[0] === "'" && v.endsWith("'")))) return v.slice(1, -1)
  return v
}

/** A comma-separated value as a list: `a, b` is `['a', 'b']`. */
export function listOf(value: string | undefined): string[] {
  return [...new Set((value ?? '').split(',').map(s => s.trim()).filter(Boolean))]
}

/** The first sentence of a description, for an agent with no `does:`. */
function firstSentence(text: string): string {
  const one = text.replace(/\s+/g, ' ').trim()
  const stop = one.search(/[.!?](\s|$)/)
  return (stop < 0 ? one : one.slice(0, stop)).slice(0, 300)
}

/**
 * Departments from departments.json's text: `{ "departments": [...] }` or a
 * bare array, each `{ id, name, purpose, default: "on" | "off", rules: [] }`.
 * Missing or unreadable: the twelve built-in departments (with no rules) and
 * a problem, never a throw.
 */
export function parseDepartments(json: string | undefined, problems: string[] = []): Department[] {
  const fallback = (why: string) => {
    problems.push(`departments.json ${why}: using the built-in twelve departments, without their routing rules`)
    return FALLBACK_DEPARTMENTS.map(d => ({ ...d, rules: [] }))
  }
  if (json === undefined) return fallback('could not be read')
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return fallback('is not valid JSON')
  }
  const list = Array.isArray(data) ? data : (data as { departments?: unknown } | null)?.departments
  if (!Array.isArray(list) || list.length === 0) return fallback('has no "departments" list')
  const out: Department[] = []
  for (const d of list as unknown[]) {
    const r = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>
    const id = typeof r.id === 'string' ? r.id.trim().toLowerCase() : ''
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || out.some(x => x.id === id)) {
      problems.push(`departments.json: skipped a department with a missing, bad or repeated id (${JSON.stringify(r.id ?? null)})`)
      continue
    }
    const on = r.default
    out.push({
      id,
      name: typeof r.name === 'string' && r.name.trim() ? r.name.trim() : id,
      purpose: typeof r.purpose === 'string' ? r.purpose.trim() : '',
      isDefaultOn: on === true || (typeof on === 'string' && /^(on|true|yes)$/i.test(on.trim())),
      rules: Array.isArray(r.rules) ? r.rules.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map(x => x.trim()) : [],
    })
  }
  return out.length > 0 ? out : fallback('has no usable department')
}

/**
 * One agent from its file's text. Undefined only when the file has no
 * usable name (it is listed as a problem). Anything else wrong is kept on the
 * agent as a problem: it is listed by /team, cannot be assigned, and writes
 * only .md until the file is fixed.
 */
export function parseAgent(file: string, text: string, departments: Department[], problems: string[] = []): Agent | undefined {
  const { fields: fm, repeated, hasBlock } = readFrontmatter(text)
  const name = (fm.name ?? '').trim().toLowerCase()
  if (!hasBlock || !/^[a-z0-9][a-z0-9._-]*$/.test(name)) {
    problems.push(`${file}: no frontmatter with a valid name; skipped`)
    return undefined
  }
  const own: string[] = []
  for (const k of new Set(repeated)) own.push(`${file}: the key "${k}" is given more than once`)
  const department = (fm.department ?? '').trim().toLowerCase()
  if (!departments.some(d => d.id === department)) {
    own.push(`${file}: ${department ? `unknown department "${department}"` : 'no department'}`)
  }
  const rawLimit = (fm['write-limit'] ?? 'none').trim().toLowerCase()
  const limit = WRITE_LIMITS.find(l => l === rawLimit)
  if (!limit) own.push(`${file}: unknown write-limit "${fm['write-limit']}"`)
  const rawDeploy = (fm['can-deploy'] ?? 'false').trim().toLowerCase()
  if (rawDeploy !== 'true' && rawDeploy !== 'false') own.push(`${file}: can-deploy must be true or false, not "${fm['can-deploy']}"`)
  const rawOrder = (fm.order ?? '').trim()
  if (rawOrder !== '' && !/^\d{1,6}$/.test(rawOrder)) own.push(`${file}: order must be a whole number, not "${rawOrder}"`)
  return {
    name,
    type: `${PLUGIN}:${name}`,
    file,
    department: departments.some(d => d.id === department) ? department : '',
    does: (fm.does ?? '').trim().slice(0, 300) || firstSentence(fm.description ?? '') || name,
    writeLimit: own.length > 0 ? 'md-only' : (limit ?? 'md-only'),
    canDeploy: own.length === 0 && rawDeploy === 'true',
    checkedBy: listOf(fm['checked-by']).map(s => s.toLowerCase()),
    confirm: listOf(fm.confirm),
    order: /^\d{1,6}$/.test(rawOrder) ? Number(rawOrder) : undefined,
    limitHint: (fm['limit-hint'] ?? '').trim().slice(0, 300),
    problems: own,
  }
}

/**
 * The whole team from the files' text: `agents` maps a file name to its text
 * (undefined for a file that could not be read). A name given by two files
 * is one agent with the tightest limits and a problem. Agents come out in
 * department order, then by `order`, then by name.
 */
export function buildTeam(departmentsJson: string | undefined, agents: Record<string, string | undefined>, skipped: string[] = []): Team {
  const problems: string[] = [...skipped]
  const departments = parseDepartments(departmentsJson, problems)
  const list: Agent[] = []
  for (const [file, text] of Object.entries(agents).sort(([a], [b]) => a.localeCompare(b))) {
    if (text === undefined) { problems.push(`${file} could not be read`); continue }
    const agent = parseAgent(file, text, departments, problems)
    if (!agent) continue
    const same = list.find(a => a.name === agent.name)
    if (same) {
      same.problems.push(`${agent.file}: a second file named ${agent.name} (also ${same.file.split(', ')[0]})`)
      same.file = `${same.file}, ${agent.file}`
      same.writeLimit = 'md-only'
      same.canDeploy = false
      continue
    }
    list.push(agent)
  }
  for (const a of list) {
    for (const c of a.checkedBy) if (!list.some(b => b.name === c)) problems.push(`${a.name}: checked-by names ${c}, which is not on the team`)
    problems.push(...a.problems.map(p => `${p}; ${a.name} cannot be assigned until it is fixed`))
  }
  const at = (id: string) => { const i = departments.findIndex(d => d.id === id); return i < 0 ? departments.length : i }
  list.sort((a, b) => at(a.department) - at(b.department) || (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name))
  return { departments, agents: list, problems }
}

/**
 * Which departments are on: the person's /team choices over each one's
 * default. Only a stored `true` or `false` counts.
 */
export function enabledIds(team: Team, chosen: Readonly<Record<string, unknown>> | undefined): Set<string> {
  const on = new Set<string>()
  for (const d of team.departments) {
    const v = chosen && Object.hasOwn(chosen, d.id) ? chosen[d.id] : undefined
    if (v === true || (v !== false && d.isDefaultOn)) on.add(d.id)
  }
  return on
}

/** The short name in a type, lower case, when it is this plugin's (`Chief-Of-Staff:Web-Designer` is `web-designer`). */
export function ownName(type: string | undefined): string | undefined {
  const t = (type ?? '').trim().toLowerCase()
  return t.startsWith(`${PLUGIN}:`) ? t.slice(PLUGIN.length + 1).trim() : undefined
}

/** An agent of this plugin by its subagent_type, or undefined for anyone else's (general-purpose, other plugins). */
export function agentOfType(team: Team, type: string | undefined): Agent | undefined {
  const name = ownName(type)
  return name === undefined ? undefined : team.agents.find(a => a.name === name)
}

/** An agent by its short name (`web-designer`). */
export function agentNamed(team: Team, name: string): Agent | undefined {
  const n = name.trim().toLowerCase()
  return team.agents.find(a => a.name === n)
}

const departmentName = (team: Team, id: string) => team.departments.find(d => d.id === id)?.name ?? id

/** Agents the Chief of Staff may assign now: a clean file, in a department that is on. */
export const assignable = (team: Team, on: Set<string>) => team.agents.filter(a => isClean(a) && on.has(a.department))

/**
 * A rule with a note for each agent it names that cannot be assigned now:
 * whose department is off, or whose file has a problem.
 */
export function annotate(rule: string, team: Team, on: Set<string>): string {
  const notes: string[] = []
  for (const a of team.agents) {
    if (!new RegExp(`(^|[^\\w-])${a.name.replace(/[.]/g, '\\.')}(?![\\w-])`).test(rule)) continue
    if (!isClean(a)) notes.push(`${a.name}'s agent file has a problem, so it cannot be assigned: tell the person to run /team`)
    else if (!on.has(a.department)) notes.push(`${a.name} is in ${departmentName(team, a.department)}, which is off: ask the person to run /team on ${a.department} first`)
  }
  return notes.length === 0 ? rule : `${rule} (${notes.join('; ')}.)`
}

/** The maker-checker lines: "<role>'s output goes to <checker> before it is called done." */
export function checkLines(team: Team, on: Set<string>): string[] {
  return assignable(team, on).filter(a => a.checkedBy.length > 0)
    .map(a => annotate(`- ${a.name}'s output goes to ${a.checkedBy.join(', then ')} before it is called done.`, team, on))
}

/** The confirm lines: actions a role does only after the person's OK. */
export function confirmLines(team: Team, on: Set<string>): string[] {
  return assignable(team, on).filter(a => a.confirm.length > 0)
    .map(a => `- ${a.name} needs the person's OK, through you, before it does any of: ${a.confirm.join('; ')}.`)
}

/** The team section of the prompt: departments that are on and have assignable agents, each with its agents. */
export function teamLines(team: Team, on: Set<string>): string[] {
  const lines: string[] = []
  const ready = assignable(team, on)
  for (const d of team.departments) {
    const agents = ready.filter(a => a.department === d.id)
    if (agents.length === 0) continue
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

/** Agents whose files have problems, for the prompt. */
export function brokenLine(team: Team): string | undefined {
  const broken = team.agents.filter(a => !isClean(a)).map(a => a.name)
  if (broken.length === 0) return undefined
  return `Agent files with problems (these roles cannot be assigned until they are fixed; tell the person to run /team): ${broken.join(', ')}.`
}

/** The department routing rules, in department order, for enabled departments, each annotated. */
export function departmentRules(team: Team, on: Set<string>): string[] {
  return team.departments.filter(d => on.has(d.id)).flatMap(d => d.rules.map(r => annotate(`- ${r}`, team, on)))
}
