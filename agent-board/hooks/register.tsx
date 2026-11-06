import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { AgentState, Board, Roster, Worker } from '../types'

const PANE = 'agent-board'
const TITLE = 'Agent board'
const EMPTY: Board = {
  chief: { isWorking: false, activity: 'Waiting for you', built: [], steps: 0 },
  workers: {},
}
// Bump a tag when its value's fields change: it drops what an older version stored.
const board = atom({ plugin: 'agent-board', key: 'board' } as const, EMPTY, { shape: 'board-1' })
const roster = atom({ plugin: 'agent-board', key: 'roster' } as const, {} as Roster, { shape: 'roster-1' })

const BUILD_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit'])
const ENDED: AgentState[] = ['completed', 'failed', 'killed']

/**
 * Departments, in the order the board shows them. An agent joins the first
 * department whose words its type name holds; failing that, the first whose
 * words its description holds; failing both, Other. Name first, so a
 * code-reviewer whose description mentions security stays in Quality.
 * Generalists come before Engineering so claude-code-guide is not a coder.
 */
export const DEPARTMENTS: { name: string; words: string[] }[] = [
  { name: 'Security', words: ['secur', 'audit', 'vulnerab', 'threat', 'pentest', 'scan'] },
  { name: 'Quality & testing', words: ['review', 'test', 'qa', 'verif', 'lint'] },
  { name: 'Design & UX', words: ['design', 'ux', 'ui', 'accessib', 'a11y', 'figma', 'brand'] },
  { name: 'Marketing & growth', words: ['marketing', 'seo', 'campaign', 'content', 'growth', 'sales', 'copy'] },
  { name: 'Docs & writing', words: ['doc', 'writ', 'adr'] },
  { name: 'Release & operations', words: ['release', 'deploy', 'ci', 'infra', 'devops', 'render', 'monitor', 'ops'] },
  { name: 'Planning & research', words: ['plan', 'spec(?!ial)', 'analy', 'research', 'explor', 'architect', 'strateg'] },
  { name: 'Generalists', words: ['general', 'claude', 'assistant', 'guide', 'setup'] },
  { name: 'Engineering', words: ['code', 'coder', 'engineer', 'develop', 'frontend', 'backend', 'build', 'implement', 'perf', 'patch', 'debug'] },
]
export const OTHER = 'Other'

/**
 * Agents whose name and description point the wrong way, placed by hand.
 * Keyed by the short name (no plugin prefix); add a line to move one.
 */
export const OVERRIDES: Record<string, string> = {
  'impeccable-manual-edit-applier': 'Engineering',
  'project-scanner': 'Planning & research',
  'impeccable-asset-producer': 'Design & UX',
  'tour-builder': 'Docs & writing',
  'creative-director': 'Design & UX',
}

/**
 * Short names that two or more agents share (`explore` from claude-security and
 * the built-in `Explore`); those rows also show where the agent comes from.
 */
export function clashes(types: string[]): Set<string> {
  const seen = new Map<string, Set<string>>()
  for (const t of types) {
    const k = shortName(t).toLowerCase()
    seen.set(k, (seen.get(k) ?? new Set()).add(t))
  }
  return new Set([...seen].filter(([, all]) => all.size > 1).map(([k]) => k))
}

/** A row's label: the short name, plus its plugin when the short name clashes. */
export function label(type: string, clash: Set<string>): string {
  const short = shortName(type)
  if (!clash.has(short.toLowerCase())) return short
  return `${short} · ${type.includes(':') ? type.slice(0, type.lastIndexOf(':')) : 'built-in'}`
}

/** The name a person reads: `chief-of-staff:web-designer` shows as `web-designer`. */
export function shortName(type: string): string {
  return type.includes(':') ? type.slice(type.lastIndexOf(':') + 1) : type
}

/** True when a word (a regex source) starts a word of the text: "doc" matches "documentation", not "adoc". */
function hasWord(text: string, words: string[]): boolean {
  const t = text.toLowerCase()
  return words.some(w => new RegExp(`(^|[^a-z0-9])${w}`).test(t))
}

/** Which department an agent type belongs to. */
export function department(type: string, description = ''): string {
  const name = type.includes(':') ? type.slice(type.lastIndexOf(':') + 1) : type
  const placed = OVERRIDES[name]
  if (placed) return placed
  return (
    DEPARTMENTS.find(d => hasWord(name, d.words))?.name ??
    DEPARTMENTS.find(d => hasWord(description, d.words))?.name ??
    OTHER
  )
}

function arg(e: unknown, key: string): string {
  const v = (e as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : ''
}

function base(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path
}

function cut(text: string, n: number): string {
  const one = text.replace(/\s+/g, ' ').trim()
  return one.length > n ? `${one.slice(0, Math.max(1, n - 1))}…` : one
}

/** One plain sentence for what a tool call is doing. */
export function describe(e: unknown): string {
  const tool = arg(e, 'tool')
  const file = base(arg(e, 'file_path') || arg(e, 'notebook_path') || arg(e, 'path'))
  if (BUILD_TOOLS.has(tool)) return `Building ${file}`
  switch (tool) {
    case 'Read': return `Reading ${file}`
    case 'Bash': return `Running: ${cut(arg(e, 'description') || arg(e, 'command'), 60)}`
    case 'Grep':
    case 'Glob': return `Searching for ${cut(arg(e, 'pattern'), 40)}`
    case 'WebSearch': return `Researching: ${cut(arg(e, 'query'), 50)}`
    case 'WebFetch': return `Reading a web page`
    case 'Agent': return `Assigning: ${cut(arg(e, 'description'), 50)}`
    case 'SendMessage': return `Messaging a teammate`
    case 'Skill': return `Using skill ${arg(e, 'skill')}`
    case 'AskUserQuestion': return `Asking you a question`
    default:
      if (tool.startsWith('Task')) return 'Updating the task list'
      if (tool.startsWith('mcp__')) return `Using ${tool.split('__').slice(1).join(' ')}`
      return `Using ${tool}`
  }
}

/**
 * The Chief of Staff's line: what it is doing while its turn runs; once the
 * turn is over, who it is waiting on, the team before the person.
 */
export function chiefNow(isWorking: boolean, activity: string, working: number): string {
  if (isWorking) return activity
  if (working > 0) return `Waiting on ${working} agent${working === 1 ? '' : 's'}`
  return 'Waiting for you'
}

/** Update the board without ever blocking the agent's real work if it fails. */
async function mark($: EngineInterface, fn: (b: Board) => Board): Promise<void> {
  try {
    await update($, board, fn)
  } catch {
    // The board is a view; a failed write must not stop a tool call.
  }
}

function addBuilt(list: string[], file: string): string[] {
  if (!file) return list
  return [...list.filter(f => f !== file), file].slice(-6)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'board', description: 'Open the live agent board' })
    void $.ui.open({ id: PANE, title: TITLE })

    // Keep each agent's status in line with the engine's own list.
    $.clock.every(2500, async () => {
      const list = await $.agent.list()
      await update($, board, b => {
        const workers = { ...b.workers }
        for (const a of list) {
          const old = workers[a.id]
          const isEnded = ENDED.includes(a.status)
          workers[a.id] = {
            id: a.id,
            parentId: old?.parentId ?? a.parentId,
            name: old?.name ?? a.name,
            role: old?.role ?? a.type,
            task: old?.task || a.description,
            status: a.status,
            activity: isEnded ? (a.status === 'completed' ? 'Finished' : `Stopped (${a.status})`) : (old?.activity ?? 'Starting'),
            built: old?.built ?? [],
            steps: old?.steps ?? 0,
            startedAt: old?.startedAt ?? Date.now(),
            endedAt: isEnded ? (old?.endedAt ?? Date.now()) : undefined,
          }
        }
        return { ...b, workers }
      })
    })

    return next(e)
  })

  on('command.run', { command: 'board' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })
    return { text: 'Agent board opened.' }
  })

  // Every agent type the engine offers the model is on the team, working or not.
  on('agent.offer', async ($, e, next) => {
    const offered = await next(e)
    if (offered.isOffered) {
      try {
        const known = (await read($, roster))[e.agent]
        if (!known || known.description !== e.description) {
          await update($, roster, r => ({ ...r, [e.agent]: { type: e.agent, description: e.description, source: e.source } }))
        }
      } catch {
        // A view only: never get in the way of the offer.
      }
    }
    return offered
  })

  on('prompt.submit', async ($, e, next) => {
    await mark($, b => ({ ...b, chief: { ...b.chief, isWorking: true, activity: 'Reading your request' } }))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const started = await next(e)
    if ('agentId' in started && started.agentId) {
      const id = started.agentId
      const worker: Worker = {
        id,
        parentId: e.parentAgentId,
        name: e.name,
        role: e.subagentType || 'general-purpose',
        task: e.description || cut(e.prompt, 80),
        status: 'running',
        activity: 'Starting',
        built: [],
        steps: 0,
        startedAt: Date.now(),
      }
      await mark($, b => ({ ...b, workers: { ...b.workers, [id]: worker } }))
    }
    return started
  })

  on('tool.call', async ($, e, next) => {
    const now = describe(e)
    const id = e.agentId
    const file = BUILD_TOOLS.has(e.tool) ? arg(e, 'file_path') || arg(e, 'notebook_path') : ''
    await mark($, b => {
      if (id === undefined) {
        return { ...b, chief: { ...b.chief, isWorking: true, activity: now, steps: b.chief.steps + 1 } }
      }
      const w = b.workers[id]
      if (!w) return b
      return { ...b, workers: { ...b.workers, [id]: { ...w, status: 'running', activity: now, steps: w.steps + 1 } } }
    })
    const ran = await next(e)
    if (file) {
      await mark($, b => {
        if (id === undefined) return { ...b, chief: { ...b.chief, built: addBuilt(b.chief.built, base(file)) } }
        const w = b.workers[id]
        return w ? { ...b, workers: { ...b.workers, [id]: { ...w, built: addBuilt(w.built, base(file)) } } } : b
      })
    }
    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    await mark($, b => {
      if (id === undefined) return { ...b, chief: { ...b.chief, isWorking: false, activity: 'Waiting for you' } }
      const w = b.workers[id]
      return w ? { ...b, workers: { ...b.workers, [id]: { ...w, activity: e.isAborted ? 'Stopped' : 'Turn finished, reporting back' } } } : b
    })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const b = await read($, board)
    const team = await read($, roster)
    const cols = Math.max(20, e.props.bodyColumns)
    const all = Object.values(b.workers).sort((x, y) => x.startedAt - y.startedAt)
    const known = new Set(all.map(w => w.id))
    const working = all.filter(w => !ENDED.includes(w.status)).length
    const done = all.length - working

    const dot = (s: AgentState) =>
      s === 'running' ? { mark: '●', color: 'warning' } :
      s === 'completed' ? { mark: '✓', color: 'success' } :
      s === 'failed' || s === 'killed' ? { mark: '✕', color: 'error' } :
      { mark: '○', color: 'subtle' }

    const card = (w: Worker, depth: number): RenderChildren => {
      const d = dot(w.status)
      const width = cols - depth * 2 - 6
      const kids = all.filter(k => k.parentId === w.id)
      return (
        <Box key={w.id} flexDirection="column" marginLeft={depth * 2} marginTop={1}>
          <Box flexDirection="row" gap={1}>
            <Text color={d.color}>{d.mark}</Text>
            <Text bold wrap="truncate">{cut(w.name ? shortName(w.name) : label(w.role, clash), width - 12)}</Text>
            <Text dimColor>{w.status}</Text>
          </Box>
          <Box flexDirection="column" marginLeft={2}>
            {w.name && shortName(w.name) !== shortName(w.role) && <Text dimColor wrap="truncate">Role: {shortName(w.role)}</Text>}
            <Text wrap="truncate">Task: {cut(w.task, width - 6)}</Text>
            <Text color={w.status === 'running' ? 'claude' : undefined} dimColor={w.status !== 'running'} wrap="truncate">
              Now: {cut(w.activity, width - 5)}
            </Text>
            {w.built.length > 0 && <Text dimColor wrap="truncate">Built: {w.built.join(', ')}</Text>}
            <Button label="Open transcript" plain dimColor onPress={() => void $.ui.view({ agentId: w.id })} />
          </Box>
          {kids.map(k => card(k, 1))}
        </Box>
      )
    }

    // Top-level workers (spawned by the Chief of Staff) sit in their department;
    // agents a worker spawned sit under that worker instead.
    const top = all.filter(w => !w.parentId || !known.has(w.parentId))
    const busyTypes = new Set(top.map(w => w.role))
    const groups = new Map<string, { idle: string[]; active: Worker[] }>()
    const group = (name: string) => {
      const g = groups.get(name) ?? { idle: [], active: [] }
      groups.set(name, g)
      return g
    }
    for (const r of Object.values(team)) {
      if (!busyTypes.has(r.type)) group(department(r.type, r.description)).idle.push(r.type)
    }
    for (const w of top) group(department(w.role, team[w.role]?.description)).active.push(w)
    const order = [...DEPARTMENTS.map(d => d.name), OTHER].filter(n => groups.has(n))
    const teamSize = new Set([...Object.keys(team), ...busyTypes]).size
    const clash = clashes([...new Set([...Object.keys(team), ...all.map(w => w.role)])])

    return (
      <Box flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color={b.chief.isWorking || working > 0 ? 'warning' : 'success'}>{b.chief.isWorking ? '●' : working > 0 ? '◐' : '○'}</Text>
          <Text bold>Chief of Staff</Text>
          <Text dimColor>main session</Text>
        </Box>
        <Box flexDirection="column" marginLeft={2}>
          <Text color={b.chief.isWorking ? 'claude' : undefined} dimColor={!b.chief.isWorking} wrap="truncate">
            Now: {cut(chiefNow(b.chief.isWorking, b.chief.activity, working), cols - 7)}
          </Text>
          {b.chief.built.length > 0 && <Text dimColor wrap="truncate">Built: {b.chief.built.join(', ')}</Text>}
          <Text dimColor>Team: {teamSize} agents · {working} working · {done} done</Text>
        </Box>
        {order.length === 0 && (
          <Box marginTop={1} marginLeft={2}>
            <Text dimColor>The team list fills in after your first message, when Claude Code lists the agents it can assign.</Text>
          </Box>
        )}
        {order.map(name => {
          const g = groups.get(name)!
          const busy = g.active.filter(w => !ENDED.includes(w.status)).length
          return (
            <Box key={name} flexDirection="column" marginLeft={2} marginTop={1}>
              <Box flexDirection="row" gap={1}>
                <Text bold color={busy > 0 ? 'warning' : undefined}>{name}</Text>
                <Text dimColor>{g.idle.length + g.active.length}{busy > 0 ? ` · ${busy} working` : ''}</Text>
              </Box>
              <Box flexDirection="column" marginLeft={2}>
                {g.active.map(w => card(w, 0))}
                {g.idle.sort((x, y) => shortName(x).localeCompare(shortName(y))).map(t => (
                  <Text key={t} dimColor wrap="truncate">○ {cut(label(t, clash), cols - 8)}</Text>
                ))}
              </Box>
            </Box>
          )
        })}
        {done > 0 && (
          <Box marginTop={1}>
            <Button
              label="Clear finished"
              plain
              onPress={() => void update($, board, x => ({
                ...x,
                workers: Object.fromEntries(Object.entries(x.workers).filter(([, w]) => !ENDED.includes(w.status))),
              }))}
            />
          </Box>
        )}
      </Box>
    )
  })
}
