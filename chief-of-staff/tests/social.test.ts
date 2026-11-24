// 0.11: the Creative and Social departments filled. Seven new roles, their routing, and the confirm gate on their tools.
import { expect, test } from 'claude-code/testing'

import { chiefPrompt, CONFIRM, enabledIds, parseFrontmatter, roleLimit } from '../hooks/register'
import { FILES } from './files'
import { agents, BASE, memoryStore, promptOf, TEAM } from './helpers'
import { serve } from './serve'

const NEW: Record<string, [department: string, writeLimit: string, checkedBy: string]> = {
  'brand-designer': ['creative', 'no-scripts', 'creative-director'],
  'graphic-designer': ['creative', 'md-only', 'creative-director'],
  'video-producer': ['creative', 'md-only', 'creative-director'],
  'social-strategist': ['social', 'md-only', 'marketing-strategist'],
  'content-producer': ['social', 'md-only', 'creative-director'],
  'community-manager': ['social', 'md-only', ''],
  'social-publisher': ['social', 'md-only', ''],
}
const toolsOf = (name: string) => String(parseFrontmatter(FILES[`agents/${name}.md`] as string).tools).split(',').map(s => s.trim())
const PUBLISHES = ['mcp__Taplio__schedule_draft', 'mcp__Taplio__publish_draft', 'mcp__Taplio__commit_comment_draft']

test('the seven new roles load cleanly in Creative and Social, with their limits and checkers', () => {
  expect(TEAM.problems).toEqual([])
  for (const [name, [department, writeLimit, checkedBy]] of Object.entries(NEW)) {
    const a = TEAM.agents.find(x => x.name === name)
    expect(`${name} ${a?.department} ${a?.writeLimit} ${a?.canDeploy} ${a?.problems.length}`).toBe(`${name} ${department} ${writeLimit} false 0`)
    expect(`${name} ${parseFrontmatter(FILES[`agents/${name}.md`] as string)['checked-by'] ?? ''}`).toBe(`${name} ${checkedBy}`)
  }
  // the md-only roles cannot write artwork or code into the project; brand-designer can write tokens but not scripts
  expect(String(roleLimit('graphic-designer', 'Write', '/site/banner.svg', '', TEAM))).toContain('writes only .md')
  expect(roleLimit('video-producer', 'Write', '/site/video/reel.md', '', TEAM)).toBeUndefined()
  expect(roleLimit('brand-designer', 'Write', '/site/brand/tokens.css', '', TEAM)).toBeUndefined()
  expect(String(roleLimit('brand-designer', 'Write', '/site/build.js', '', TEAM))).toContain('does not write scripts')
})

test('tools: only social-publisher can schedule, publish or commit; nobody new can rent GPUs, publish video or write ads', () => {
  for (const name of Object.keys(NEW)) {
    const tools = toolsOf(name)
    for (const t of PUBLISHES) expect(`${name} ${t} ${tools.includes(t)}`).toBe(`${name} ${t} ${name === 'social-publisher'}`)
    expect(`${name} ${tools.filter(t => /gpu_|publish_project|publish_website|tiktok_|meta_ads_|share_project|execute_preset|apps_invoke|Bash/.test(t))}`).toBe(`${name} `)
  }
  for (const name of TEAM.agents.map(a => a.name).filter(n => !NEW[n])) {
    for (const t of PUBLISHES) expect(toolsOf(name).includes(t)).toBe(false)
  }
  expect(toolsOf('social-publisher').some(t => /create_draft|update_draft|create_comment_draft|^Write$|^Edit$/.test(t))).toBe(false)
  expect(toolsOf('content-producer')).toContain('mcp__Taplio__create_draft')
  expect(toolsOf('community-manager')).toContain('mcp__Taplio__create_comment_draft')
  for (const t of ['mcp__Taplio__commit_comment_draft', 'mcp__Taplio__like_post', 'mcp__Taplio__send_connection_request']) expect(toolsOf('community-manager').includes(t)).toBe(false)
  expect(toolsOf('social-strategist').filter(t => t.startsWith('mcp__Taplio__') && !/__(get|list|search)_/.test(t))).toEqual([])
})

test('the generated prompt lists the new roles under Creative and Social, with their rules, checkers and confirm lines', async ($, on) => {
  serve(on)
  on('prompt.compose', () => BASE)
  const text = await promptOf($)
  const at = (s: string) => text.indexOf(s)
  expect(at('Creative (') < at('- chief-of-staff:brand-designer')).toBe(true)
  expect(at('- chief-of-staff:video-producer') < at('Marketing & PR (')).toBe(true)
  expect(at('Social (') < at('- chief-of-staff:social-strategist')).toBe(true)
  expect(at('- chief-of-staff:social-strategist') < at('- chief-of-staff:social-publisher')).toBe(true)
  for (const line of [
    '- brand-designer sets the brand first (brand/guidelines.md); graphic-designer and video-producer follow brand/guidelines.md. Visuals go to creative-director before they are used.',
    '- Social work runs social-strategist (plan), then content-producer (drafts), then graphic-designer or video-producer (visuals), then creative-director (review), then the person approves, then social-publisher (schedule or publish).',
    "- Nothing is posted, commented, liked or scheduled without the person's OK.",
    '- LinkedIn goes through Taplio. For other platforms (Instagram, TikTok, X, YouTube) the team drafts and the person posts manually.',
    "- brand-designer's output goes to creative-director before it is called done.",
    "- graphic-designer's output goes to creative-director before it is called done.",
    "- video-producer's output goes to creative-director before it is called done.",
    "- content-producer's output goes to creative-director before it is called done.",
    "- social-strategist's output goes to marketing-strategist before it is called done.",
    "- social-publisher needs the person's OK, through you, before it does any of: publish a post; schedule a post; post a comment; like a post; send a connection request.",
    "- graphic-designer needs the person's OK, through you, before it does any of: share a design publicly; publish a design; export a design for public use.",
    "- community-manager needs the person's OK, through you, before it does any of:",
  ]) expect(`${text.includes(line)} ${line}`).toBe(`true ${line}`)
  // with Social off, its rules go and the Chief of Staff is told how to turn it on
  const off = chiefPrompt(TEAM, enabledIds(TEAM, { social: false }))
  expect(off.includes('chief-of-staff:social-publisher')).toBe(false)
  expect(off.includes('Social work runs')).toBe(false)
  expect(off).toContain('Social (turn on with /team on social)')
})

test('confirm gate: social-publisher asks to publish or schedule; content-producer drafts freely; graphic-designer asks to share or publish', async ($, on) => {
  serve(on)
  memoryStore(on)
  agents(on, { p1: 'chief-of-staff:social-publisher', c1: 'chief-of-staff:content-producer', g1: 'chief-of-staff:graphic-designer',
    m1: 'chief-of-staff:community-manager', v1: 'chief-of-staff:video-producer' })
  on('tool.check', () => ({ decision: 'allow' }))
  const check = (agentId: string, tool: string, extra: Record<string, unknown> = {}) => $.tool.check({ tool, input: {}, agentId, ...extra } as never)
  for (const t of [...PUBLISHES, 'mcp__Taplio__like_post', 'mcp__Taplio__send_connection_request']) {
    expect(`${t} ${(await check('p1', t, { approver: 'person' })).decision}`).toBe(`${t} ask`)
    const none = await check('p1', t)
    expect(`${t} ${none.decision}`).toBe(`${t} deny`)
    expect(String(none.reason)).toContain(CONFIRM)
    expect(String(none.reason)).toContain('social-publisher needs the person\'s OK for: publish a post; schedule a post')
  }
  expect((await check('p1', 'mcp__Taplio__get_draft')).decision).toBe('allow')
  for (const t of ['mcp__Taplio__create_draft', 'mcp__Taplio__update_draft', 'mcp__Taplio__search_inspiration']) {
    expect(`${t} ${(await check('c1', t)).decision}`).toBe(`${t} allow`)
  }
  expect((await check('c1', 'mcp__Taplio__publish_draft', { approver: 'person' })).decision).toBe('ask')
  expect((await check('m1', 'mcp__Taplio__create_comment_draft')).decision).toBe('allow')
  expect((await check('m1', 'mcp__Taplio__commit_comment_draft', { approver: 'person' })).decision).toBe('ask')
  for (const t of ['mcp__Canva__publish-brand-template', 'mcp__Higgsfield__share_project', 'mcp__Higgsfield__update_project_sharing', 'mcp__Canva__edit-design']) {
    expect(`${t} ${(await check('g1', t, { approver: 'person' })).decision}`).toBe(`${t} ask`)
    expect(`${t} ${(await check('g1', t)).decision}`).toBe(`${t} deny`)
  }
  expect(String((await check('g1', 'mcp__Canva__publish-brand-template')).reason)).toContain('share a design publicly; publish a design; export a design for public use')
  // generation stays within free credits; anything that rents, publishes or spends asks
  for (const t of ['mcp__Canva__create-design', 'mcp__Higgsfield__generate_image']) expect((await check('g1', t)).decision).toBe('allow')
  expect((await check('v1', 'mcp__Higgsfield__generate_video')).decision).toBe('allow')
  for (const t of ['mcp__Higgsfield__gpu_rent', 'mcp__Higgsfield__tiktok_prepare_publish', 'mcp__Higgsfield__meta_ads_write']) {
    expect(`${t} ${(await check('v1', t, { approver: 'person' })).decision}`).toBe(`${t} ask`)
  }
})
