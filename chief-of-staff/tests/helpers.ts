import type { On } from 'claude-code'
import type { Engine } from 'claude-code/testing'

import { buildTeam } from '../hooks/register'
import type { Team } from '../hooks/register'
import { FILES } from './files'

export const IN = (tools: string[]) => ({ model: 'm', promptModel: 'm', surfaces: [], tools, outputStyle: null, traits: [] })
export const BASE = { sections: [{ id: 'intro', text: 'engine intro', scope: 'shared' as const }] }

/** The agent files of a fixture, keyed by file name (`web-designer.md`). */
export function agentFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([k]) => k.startsWith('agents/')).map(([k, v]) => [k.slice('agents/'.length), v]))
}

/** The team built from a fixture's files. */
export const teamOf = (files: Record<string, string>): Team => buildTeam(files['departments.json'], agentFiles(files))

/** The team as the shipped agent files define it. */
export const TEAM: Team = teamOf(FILES)

/** FILES with one agent file replaced (or added); `undefined` removes it. */
export function withAgent(name: string, text: string | undefined, files: Record<string, string> = FILES): Record<string, string> {
  const out = { ...files }
  if (text === undefined) delete out[`agents/${name}.md`]
  else out[`agents/${name}.md`] = text
  return out
}

/** A shipped agent file's text with frontmatter lines replaced, added or (undefined) removed. */
export function edited(name: string, fields: Record<string, string | undefined>, files: Record<string, string> = FILES): string {
  const text = files[`agents/${name}.md`] as string
  const end = text.indexOf('\n---', 4)
  let head = text.slice(0, end)
  for (const [k, v] of Object.entries(fields)) {
    const line = new RegExp(`^${k}:.*$`, 'm')
    head = line.test(head) ? head.replace(line, v === undefined ? '' : `${k}: ${v}`).replace(/\n\n+/g, '\n') : v === undefined ? head : `${head}\n${k}: ${v}`
  }
  return head + text.slice(end)
}

/** The Chief of Staff section the main session gets now ('' when none). */
export const promptOf = async ($: Engine) =>
  (await $.prompt.compose(IN(['Agent']))).sections.find(s => s.id === 'chief-of-staff:chief-of-staff')?.text ?? ''

/** A plugin store in memory. */
export function memoryStore(on: On, start: Record<string, unknown> = {}): Map<string, unknown> {
  const kept = new Map<string, unknown>(Object.entries(start))
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  return kept
}

/** Agents the engine lists, by id and type. */
export function agents(on: On, list: Record<string, string>): void {
  on('agent.list', () => ({ value: Object.entries(list).map(([id, type]) => ({ id, type, description: '', status: 'running' }) as never) }))
}

/** The deny text of a tool call's result, or undefined. */
export const deny = (r: unknown): string | undefined => (r as { deny?: string }).deny
