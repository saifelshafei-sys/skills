// QA regression tests for chief-of-staff 0.10 (found on commit 12b087c), adopted as written except
// BUG 3: a repeated name now gets the tightest limit (md-only), not the original's, and cannot be assigned.
import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { buildTeam, departmentLimit, enabledIds, roleLimit, sendsForPerson, teamCommand } from '../hooks/register'
import { FILES } from './files'
import { serve } from './serve'

const agentFiles = Object.fromEntries(Object.entries(FILES).filter(([k]) => k.startsWith('agents/')).map(([k, v]) => [k.slice(7), v]))
const TEAM = buildTeam(FILES['departments.json'], agentFiles)
const memoryStore = (on: On, start: Record<string, unknown> = {}) => {
  const kept = new Map<string, unknown>(Object.entries(start))
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  return kept
}

// BUG 1: Claude Code resolves subagent_type case-insensitively (verified live), the gate does not.
test('department gate: a mixed-case subagent_type is refused too', async ($, on) => {
  serve(on)
  memoryStore(on, { departments: { creative: false } })
  on('tool.call', () => ({ result: {} }))
  for (const type of ['chief-of-staff:Web-Designer', 'Chief-Of-Staff:web-designer', 'CHIEF-OF-STAFF:WEB-DESIGNER']) {
    const r = await $.tool.call({ tool: 'Agent', subagent_type: type, description: 'x', prompt: 'x' } as never)
    expect(`${type} ${(r as { deny?: string }).deny ? 'denied' : 'allowed'}`).toBe(`${type} denied`)
  }
  expect(departmentLimit('chief-of-staff:Web-Designer', TEAM, enabledIds(TEAM, { creative: false }))).toBeDefined()
})

// BUG 2: confirm gate misses real tools that act for the person where others see it, or spend money.
test('confirm gate: real tools that publish, invite, share or spend', () => {
  for (const t of [
    'mcp__Higgsfield__deploy_website', 'mcp__Google_Calendar__create_event', 'mcp__Google_Calendar__update_event',
    'mcp__Higgsfield__share_project', 'mcp__Higgsfield__update_project_sharing', 'mcp__Higgsfield__gpu_rent',
    'mcp__Higgsfield__gpu_job_start', 'mcp__Higgsfield__meta_ads_write', 'mcp__Higgsfield__participate_in_contest',
    'mcp__Higgsfield__confirm_project_publication_review', 'mcp__Higgsfield__unpublish_project',
    'mcp__x__post_status', 'mcp__x__delete_status', 'mcp__stripe__create_refund', 'mcp__x__place_order', 'mcp__github__merge_pull_request',
  ]) expect(`${t} ${sendsForPerson(t)}`).toBe(`${t} true`)
})

// BUG 3: a second file with the same agent name wins by file-name order and drops the real limits.
test('a duplicate agent name never loosens the original agent\'s write-limit', () => {
  const t = buildTeam(FILES['departments.json'], { ...agentFiles, 'aaa-copy.md': '---\nname: web-designer\ndepartment: creative\nwrite-limit: none\n---\n' })
  // 0.10 decision: a repeated name is a problem, so the agent gets the tightest limit and cannot be assigned
  expect(t.agents.find(a => a.name === 'web-designer')?.writeLimit).toBe('md-only')
  expect(roleLimit('web-designer', 'Write', '/site/a.js', '', t)).toBeDefined()
  expect(roleLimit('web-designer', 'Write', '/site/a.css', '', t)).toBeDefined()
  expect(departmentLimit('chief-of-staff:web-designer', t, enabledIds(t, {}))).toContain('its agent file has problems')
})

// BUG 4: " #" inside an unquoted value is cut as a comment, truncating does:/confirm: text.
test('frontmatter: a # inside a value is kept', () => {
  const t = buildTeam(FILES['departments.json'], { 'a.md': '---\nname: a\ndepartment: creative\ndoes: fixes issue #42 and C# apps\n---\n' })
  expect(t.agents[0]?.does).toBe('fixes issue #42 and C# apps')
})

// BUG 5: /team silently ignores an unknown id when "all" is also given, and accepts commas as one id.
test('/team: unknown ids are reported even with all; commas separate ids', () => {
  expect(teamCommand('off all bogus', TEAM, {}).chosen).toBeUndefined()
  expect(teamCommand('off creative,social', TEAM, {}).chosen).toEqual({ creative: false, social: false })
})

// BUG 6: non-boolean stored choices are read as on.
test('stored department choices: only true/false count', () => {
  const on = enabledIds(TEAM, { sales: 'no' as never, creative: 0 as never })
  expect(on.has('sales')).toBe(false)
  expect(on.has('creative')).toBe(true)
})
