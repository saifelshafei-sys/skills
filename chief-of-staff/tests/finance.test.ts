// 0.12: the Finance and Risk, Audit & Compliance departments filled, and the 0.11 and 0.12 roles in FLOOR.
import { expect, test } from 'claude-code/testing'

import { chiefPrompt, enabledIds, FLOOR, limitsFor, parseFrontmatter, roleLimit, writeLimitAt } from '../hooks/register'
import { FILES } from './files'
import { agents, BASE, cwd, deny, edited, memoryStore, promptOf, TEAM, teamOf, withAgent } from './helpers'
import { serve } from './serve'

const NEW: Record<string, [department: string, writeLimit: string, writeDirs: string, checkedBy: string]> = {
  'financial-analyst': ['finance', 'none', '', 'model-risk-validator'],
  'credit-analyst': ['finance', 'none', '', 'risk-manager'],
  'bookkeeper': ['finance', 'none', '', 'controls-analyst'],
  'risk-manager': ['risk-audit-compliance', 'md-only', '', ''],
  'controls-analyst': ['risk-audit-compliance', 'md-only', 'controls', 'internal-auditor'],
  'internal-auditor': ['risk-audit-compliance', 'md-only', 'audit', ''],
  'model-risk-validator': ['risk-audit-compliance', 'md-only', 'validation', ''],
  'compliance-officer': ['risk-audit-compliance', 'md-only', '', ''],
}
const SOCIAL_CREATIVE = ['brand-designer', 'graphic-designer', 'video-producer', 'social-strategist', 'content-producer', 'community-manager', 'social-publisher']
const fm = (name: string) => parseFrontmatter(FILES[`agents/${name}.md`] as string)
const toolsOf = (name: string) => String(fm(name).tools).split(',').map(s => s.trim())
const P = '/home/me/books'
const SCOPE = { cwd: P, temps: [] }
const at = (team: typeof TEAM, name: string, path: string) => writeLimitAt(limitsFor(`chief-of-staff:${name}`, team), path, SCOPE)

test('the eight load in Finance and Risk, Audit & Compliance, with their limits, write-dirs, checkers, confirm lines and tools', () => {
  expect(TEAM.problems).toEqual([])
  for (const [name, [department, writeLimit, writeDirs, checkedBy]] of Object.entries(NEW)) {
    const a = TEAM.agents.find(x => x.name === name)
    const l = limitsFor(`chief-of-staff:${name}`, TEAM)
    expect(`${name} ${a?.department} ${a?.writeLimit} ${l.writeLimit} ${l.writeDirs.join(',')} ${l.canDeploy} ${a?.problems.length}`)
      .toBe(`${name} ${department} ${writeLimit} ${writeLimit} ${writeDirs} false 0`)
    expect(`${name} ${a?.checkedBy.join(',')}`).toBe(`${name} ${checkedBy}`)
    expect(`${name} ${a?.confirm.join('; ')}`).toBe(`${name} ${name === 'bookkeeper' ? 'post entries to any system; pay or transfer anything' : ''}`)
    // no connected (MCP) tools: there are no finance connectors, and the authenticated data servers are left out
    expect(`${name} ${toolsOf(name).filter(t => t.startsWith('mcp__') || /daloopa|riskmodels|bigquery/i.test(t))}`).toBe(`${name} `)
    const skills = String(fm(name).skills ?? '').split(',').map(s => s.trim()).filter(Boolean)
    expect(skills.length <= 3).toBe(true)
    for (const s of skills) expect(`${name} ${/^(finance:(variance-analysis|reconciliation|journal-entry-prep|financial-statements|sox-testing|audit-support)|anthropic-skills:xlsx|data:(statistical-analysis|validate-data))$/.test(s)}`).toBe(`${name} true`)
    // every one carries the draft, no-invented-numbers, source-data, no-action and refusal rules
    const body = FILES[`agents/${name}.md`] as string
    for (const rule of ['DRAFT for review: not investment, legal, tax or accounting advice.', '[MISSING: what\'s needed]', 'Never overwrite source data files',
      'Never move money, post entries to an accounting or banking system, file anything with a regulator, or email anyone. Draft it and report back.',
      'stop and report the exact refusal. Never work around it']) expect(`${name} ${body.includes(rule)} ${rule}`).toBe(`${name} true ${rule}`)
  }
  expect(fm('credit-analyst').description).toContain('PROPOSED')
  expect(FILES['agents/model-risk-validator.md']).toContain('## Checklist: financial and statistical models')
  expect(FILES['agents/model-risk-validator.md']).toContain('## Checklist: AI and LLM models')
  // the independent roles cannot edit in place
  for (const name of ['internal-auditor', 'model-risk-validator']) expect(toolsOf(name).includes('Edit')).toBe(false)
  expect(TEAM.departments.filter(d => d.id === 'finance' || d.id === 'risk-audit-compliance').map(d => d.isDefaultOn)).toEqual([true, true])
})

test('write limits: internal-auditor writes audit/, model-risk-validator validation/, risk-manager .md only', () => {
  expect(at(TEAM, 'internal-auditor', `${P}/audit/x.md`)).toBeUndefined()
  expect(at(TEAM, 'internal-auditor', `${P}/audit/wp.xlsx`)).toBeUndefined()
  expect(String(at(TEAM, 'internal-auditor', `${P}/src/app.py`))).toContain('Role limit: internal-auditor writes only .md')
  expect(at(TEAM, 'model-risk-validator', `${P}/validation/backtest.py`)).toBeUndefined()
  expect(String(at(TEAM, 'model-risk-validator', `${P}/models/pd_model.py`))).toContain('you never edit the model')
  expect(at(TEAM, 'controls-analyst', `${P}/controls/totals.py`)).toBeUndefined()
  expect(String(at(TEAM, 'controls-analyst', `${P}/audit/wp.xlsx`))).toContain('Role limit: controls-analyst')
  expect(at(TEAM, 'risk-manager', `${P}/risk/register.md`)).toBeUndefined()
  for (const p of ['risk/register.xlsx', 'audit/wp.xlsx', 'validation/x.py', 'controls/x.py']) expect(String(at(TEAM, 'risk-manager', `${P}/${p}`))).toContain('Role limit: risk-manager')
  expect(String(roleLimit('compliance-officer', 'Write', `${P}/compliance/x.docx`, '', TEAM))).toContain('writes only .md')
  for (const name of ['financial-analyst', 'credit-analyst', 'bookkeeper']) expect(at(TEAM, name, `${P}/model.working.xlsx`)).toBeUndefined()
})

test('write limits through the tool call: an agent of the team gets its write-dirs, nothing more', async ($, on) => {
  serve(on)
  memoryStore(on)
  cwd(on, P)
  agents(on, { a: 'chief-of-staff:internal-auditor', v: 'chief-of-staff:model-risk-validator', r: 'chief-of-staff:risk-manager' })
  on('tool.call', () => ({ result: {} }))
  const write = async (agentId: string, file_path: string) => deny(await $.tool.call({ tool: 'Write', file_path, content: 'x', agentId } as never))
  expect(await write('a', `${P}/audit/wp.xlsx`)).toBeUndefined()
  expect(String(await write('a', `${P}/src/app.py`))).toContain('Role limit: internal-auditor')
  expect(await write('v', `${P}/validation/backtest.py`)).toBeUndefined()
  expect(String(await write('v', `${P}/models/pd_model.py`))).toContain('Role limit: model-risk-validator')
  expect(await write('r', `${P}/risk/register.md`)).toBeUndefined()
  expect(String(await write('r', `${P}/risk/register.xlsx`))).toContain('Role limit: risk-manager')
})

test('FLOOR holds the 0.11 and 0.12 roles; a looser file value never loosens them, a stricter one tightens', () => {
  for (const name of [...SOCIAL_CREATIVE, ...Object.keys(NEW)]) {
    const floor = FLOOR[name]
    expect(`${name} ${floor !== undefined} ${floor?.canDeploy}`).toBe(`${name} true false`)
    // the file asks for no limit, every write folder there is, and deploy rights
    const loose = teamOf(withAgent(name, edited(name, { 'write-limit': 'none', 'write-dirs': 'audit, validation, controls, research, captures, src, models', 'can-deploy': 'true' })))
    expect(loose.problems).toEqual([])
    const l = limitsFor(`chief-of-staff:${name}`, loose)
    expect(`${name} ${l.writeLimit} ${l.writeDirs.join(',')} ${l.canDeploy}`).toBe(`${name} ${floor?.writeLimit} ${(floor?.writeDirs ?? []).join(',')} false`)
    // a file that drops write-limit keeps the floor (not the .md-only default of an unknown role)
    const silent = limitsFor(`chief-of-staff:${name}`, teamOf(withAgent(name, edited(name, { 'write-limit': undefined }))))
    expect(`${name} ${silent.writeLimit}`).toBe(`${name} ${floor?.writeLimit}`)
    // and md-only in the file always tightens
    expect(`${name} ${limitsFor(`chief-of-staff:${name}`, teamOf(withAgent(name, edited(name, { 'write-limit': 'md-only' })))).writeLimit}`).toBe(`${name} md-only`)
  }
  const auditor = teamOf(withAgent('internal-auditor', edited('internal-auditor', { 'write-limit': 'none', 'write-dirs': 'audit, src' })))
  expect(String(at(auditor, 'internal-auditor', `${P}/src/app.py`))).toContain('Role limit: internal-auditor writes only .md')
  expect(at(auditor, 'internal-auditor', `${P}/audit/wp.xlsx`)).toBeUndefined()
  const validator = teamOf(withAgent('model-risk-validator', edited('model-risk-validator', { 'write-limit': 'no-scripts', 'write-dirs': 'validation, models' })))
  expect(String(at(validator, 'model-risk-validator', `${P}/models/pd_model.py`))).toContain('Role limit: model-risk-validator')
  const brand = teamOf(withAgent('brand-designer', edited('brand-designer', { 'write-limit': 'none' })))
  expect(String(roleLimit('brand-designer', 'Write', '/site/build.js', '', brand))).toContain('does not write scripts')
  const social = teamOf(withAgent('social-publisher', edited('social-publisher', { 'write-limit': 'none' })))
  expect(String(roleLimit('social-publisher', 'Write', '/site/post.html', '', social))).toContain('writes only .md')
  // a file can narrow its write-dirs: controls-analyst without write-dirs gets none
  const narrow = teamOf(withAgent('controls-analyst', edited('controls-analyst', { 'write-dirs': undefined })))
  expect(String(at(narrow, 'controls-analyst', `${P}/controls/totals.py`))).toContain('Role limit: controls-analyst')
})

test('the generated prompt lists the new roles under Finance and Risk, Audit & Compliance, with their rules', async ($, on) => {
  serve(on)
  on('prompt.compose', () => BASE)
  const text = await promptOf($)
  const i = (s: string) => text.indexOf(s)
  expect(i('Finance (') >= 0 && i('Finance (') < i('- chief-of-staff:financial-analyst')).toBe(true)
  expect(i('- chief-of-staff:financial-analyst') < i('- chief-of-staff:credit-analyst')).toBe(true)
  expect(i('- chief-of-staff:credit-analyst') < i('- chief-of-staff:bookkeeper')).toBe(true)
  expect(i('- chief-of-staff:bookkeeper') < i('Risk, Audit & Compliance (')).toBe(true)
  expect(i('Risk, Audit & Compliance (') < i('- chief-of-staff:risk-manager')).toBe(true)
  expect(i('- chief-of-staff:model-risk-validator') < i('- chief-of-staff:compliance-officer')).toBe(true)
  for (const line of [
    '- Any model used for a decision goes to model-risk-validator before it is relied on.',
    '- Credit ratings go credit-analyst (PROPOSED rating), then risk-manager (sign-off note), then the person decides.',
    '- Bookkeeping goes bookkeeper (prepares), then controls-analyst (reviews), then the person.',
    '- Nothing is posted, paid or filed without the person: finance agents draft and report back.',
    '- The maker never checks its own work.',
    '- internal-auditor and model-risk-validator are independent: never assign them to review work they helped produce, and never let them fix what they find; the fix goes back to the maker.',
    '- Findings use severity ratings.',
    "- financial-analyst's output goes to model-risk-validator before it is called done.",
    "- credit-analyst's output goes to risk-manager before it is called done.",
    "- bookkeeper's output goes to controls-analyst before it is called done.",
    "- controls-analyst's output goes to internal-auditor before it is called done.",
    "- bookkeeper needs the person's OK, through you, before it does any of: post entries to any system; pay or transfer anything.",
  ]) expect(`${text.includes(line)} ${line}`).toBe(`true ${line}`)
  // with Risk off, the finance rules that name its roles say so, and the Chief of Staff is told how to turn it on
  const off = chiefPrompt(TEAM, enabledIds(TEAM, { 'risk-audit-compliance': false }))
  expect(off.includes('- chief-of-staff:risk-manager')).toBe(false)
  expect(off.includes('The maker never checks its own work.')).toBe(false)
  expect(off).toContain('Risk, Audit & Compliance (turn on with /team on risk-audit-compliance)')
  expect(off).toContain('/team on risk-audit-compliance')
})
