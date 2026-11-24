// 0.10: departments, the team from agent frontmatter, /team, the generated prompt.
import { expect, test } from 'claude-code/testing'

import {
  chiefPrompt, departmentLimit, enabledIds, FALLBACK_DEPARTMENTS, limitsFor, parseFrontmatter, readFrontmatter, roleLimit, teamCommand,
  writeLimitWhy,
} from '../hooks/register'
import { FILES } from './files'
import { agents, BASE, deny, edited, memoryStore, promptOf, TEAM, teamOf, withAgent } from './helpers'
import { serve } from './serve'

/** The one-liners the Chief of Staff saw before 0.10 (hard-coded then), by role, in the 0.9 order. */
const DOES_BEFORE: Record<string, string> = {
  'reverse-engineer': 'how another site or app does something, with REA; evidence report, never copied code',
  'creative-director': 'creative direction first (concept, mood, tone), then taste review of design and copy before build',
  'marketing-strategist': 'audience, positioning, page message order, call to action',
  'web-designer': 'layout, visual design, design tokens, responsive behaviour',
  'copywriter': 'every word on the site',
  'frontend-developer': 'pages, components, forms, client-side state',
  'backend-developer': 'APIs, database, auth, integrations',
  'seo-specialist': 'keywords, metadata, sitemap, structured data',
  'qa-tester': 'testing, automated tests, bug reports',
  'security-reviewer': 'read-only security review before release',
  'security-engineer': 'fixes security problems and hardens the app (auth, inputs, headers, secrets, dependencies); does not deploy',
  'devops-engineer': 'hosting, CI, env vars, release checks',
}

/** Every routing sentence of the 0.9 prompt: each must still be there with the default departments. */
const ROUTING_BEFORE = [
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
  '- Security hardening runs reviewer, engineer, reviewer: security-reviewer audits first, security-engineer fixes what it found, then security-reviewer re-tests independently and writes the final report. Key rotation at a provider and git history rewrites go back to the person (history rewrites and force pushes are blocked for everyone).',
  '- One agent, one role: if a brief would ask an agent to do another role\'s work, split it and assign that part to the other role.',
  'Use Superpowers to plan, never to implement yourself',
  'Never let an agent deploy, change DNS, delete data, or spend money without the person confirming first.',
]

const DEFAULT_ON = ['product-engineering', 'security', 'creative', 'marketing-pr', 'social', 'finance', 'risk-audit-compliance']
const DEPARTMENT_IDS = ['product-engineering', 'security', 'creative', 'marketing-pr', 'social', 'sales', 'data-analytics',
  'finance', 'risk-audit-compliance', 'legal', 'operations-people', 'strategy-research']

test('frontmatter parser: plain, quoted, lists, comments, CRLF, none', () => {
  const fm = parseFrontmatter('---\r\nname: web-designer\r\ndescription: "Web designer: layout"\r\ntools: Read, Write\r\n# a comment\r\n' +
    "checked-by: [creative-director, 'qa-tester']\r\nconfirm:\r\n  - send email\r\n  - publish posts\r\ncan-deploy: true\r\ndoes: fixes #42 # and C# apps\r\n---\r\nbody: not frontmatter\r\n")
  expect(fm.name).toBe('web-designer')
  expect(fm.description).toBe('Web designer: layout')
  expect(fm.tools).toBe('Read, Write')
  expect(fm['checked-by']).toBe('creative-director, qa-tester')
  expect(fm.confirm).toBe('send email, publish posts')
  expect(fm['can-deploy']).toBe('true')
  expect(fm.does).toBe('fixes #42 # and C# apps') // no inline comments: a # is part of the value
  expect(fm.body).toBeUndefined()
  expect(parseFrontmatter('# no frontmatter\nname: x\n')).toEqual({})
  expect(parseFrontmatter('---\nname: x\n')).toEqual({})
  // keys are read in lower case, and a key given twice (in any case) is reported; the first value stays
  const twice = readFrontmatter('---\nName: a\nname: b\nwrite-limit: md-only\nWrite-Limit: none\n---\n')
  expect(twice.fields.name).toBe('a')
  expect(twice.fields['write-limit']).toBe('md-only')
  expect(twice.repeated).toEqual(['name', 'write-limit'])
  // a long line and a file with no closing --- stay fast
  const t0 = Date.now()
  parseFrontmatter(`---\nname: a${' '.repeat(80000)}b # c\n---\n`)
  parseFrontmatter('---\n' + 'x: y\n'.repeat(100000))
  expect(Date.now() - t0 < 2000).toBe(true)
})

test('every agent file declares its department and settings; nothing is wrong with the files', () => {
  expect(TEAM.problems).toEqual([])
  expect(TEAM.departments.map(d => d.id)).toEqual(DEPARTMENT_IDS)
  expect(TEAM.departments.filter(d => d.isDefaultOn).map(d => d.id)).toEqual(DEFAULT_ON)
  expect(FALLBACK_DEPARTMENTS.map(d => `${d.id}:${d.isDefaultOn}`)).toEqual(TEAM.departments.map(d => `${d.id}:${d.isDefaultOn}`))
  expect(TEAM.agents.length).toBe(27)
  for (const [name, does] of Object.entries(DOES_BEFORE)) expect(`${name}: ${TEAM.agents.find(a => a.name === name)?.does}`).toBe(`${name}: ${does}`)
  const where = Object.fromEntries(TEAM.agents.map(a => [a.name, a.department]))
  expect(where).toEqual({
    'reverse-engineer': 'product-engineering', 'frontend-developer': 'product-engineering', 'backend-developer': 'product-engineering',
    'qa-tester': 'product-engineering', 'devops-engineer': 'product-engineering', 'security-reviewer': 'security', 'security-engineer': 'security',
    'creative-director': 'creative', 'web-designer': 'creative', 'copywriter': 'creative', 'marketing-strategist': 'marketing-pr', 'seo-specialist': 'marketing-pr',
    'brand-designer': 'creative', 'graphic-designer': 'creative', 'video-producer': 'creative', 'social-strategist': 'social',
    'content-producer': 'social', 'community-manager': 'social', 'social-publisher': 'social',
    'financial-analyst': 'finance', 'credit-analyst': 'finance', 'bookkeeper': 'finance', 'risk-manager': 'risk-audit-compliance',
    'controls-analyst': 'risk-audit-compliance', 'internal-auditor': 'risk-audit-compliance', 'model-risk-validator': 'risk-audit-compliance',
    'compliance-officer': 'risk-audit-compliance',
  })
  const limits = Object.fromEntries(TEAM.agents.filter(a => a.writeLimit !== 'none').map(a => [a.name, a.writeLimit]))
  expect(limits).toEqual({ 'reverse-engineer': 'md-only', 'creative-director': 'md-only', 'web-designer': 'no-scripts', 'brand-designer': 'no-scripts',
    'graphic-designer': 'md-only', 'video-producer': 'md-only', 'social-strategist': 'md-only', 'content-producer': 'md-only', 'community-manager': 'md-only',
    'social-publisher': 'md-only', 'risk-manager': 'md-only', 'controls-analyst': 'md-only', 'internal-auditor': 'md-only',
    'model-risk-validator': 'md-only', 'compliance-officer': 'md-only' })
  expect(TEAM.agents.filter(a => a.canDeploy).map(a => a.name)).toEqual(['devops-engineer'])
  // the hand-picked order of 0.9 within each department, with the 0.11 and 0.12 roles slotted in by order:
  expect(TEAM.agents.map(a => a.name)).toEqual(['reverse-engineer', 'frontend-developer', 'backend-developer', 'qa-tester', 'devops-engineer',
    'security-reviewer', 'security-engineer', 'creative-director', 'brand-designer', 'web-designer', 'copywriter', 'graphic-designer', 'video-producer',
    'marketing-strategist', 'seo-specialist', 'social-strategist', 'content-producer', 'community-manager', 'social-publisher',
    'financial-analyst', 'credit-analyst', 'bookkeeper', 'risk-manager', 'controls-analyst', 'internal-auditor', 'model-risk-validator', 'compliance-officer'])
  // the files keep what Claude Code reads
  expect(parseFrontmatter(FILES['agents/web-designer.md'] as string).skills).toBe('taste-skill:design-taste-frontend, design-taste-frontend')
  expect(parseFrontmatter(FILES['agents/security-reviewer.md'] as string).tools).toBe('Read, Grep, Glob, Bash, WebSearch, WebFetch')
})

test('role-specific denial hints come from limit-hint', () => {
  expect(roleLimit('reverse-engineer', 'Write', '/site/scroll.js', '', TEAM)).toBe(
    'Role limit: reverse-engineer writes only .md reports and notes, not /site/scroll.js. Describe the technique in your report; the Chief of Staff assigns the build.')
  expect(String(roleLimit('creative-director', 'Edit', '/site/home.css', '', TEAM))).toContain('creative-brief.md and review notes')
  expect(roleLimit('web-designer', 'Write', '/site/a.js', '', TEAM)).toBe('Role limit: web-designer does not write scripts, build or config files (/site/a.js). ' +
    'Finish the design part, then list in your report exactly what the frontend developer (code) or DevOps engineer (build, deploy) must do; the Chief of Staff assigns it.')
})

test('the generated prompt groups the team by department and keeps every routing rule', async ($, on) => {
  serve(on)
  on('prompt.compose', () => BASE)
  const text = await promptOf($)
  for (const line of ROUTING_BEFORE) expect(`${text.includes(line)} ${line}`).toBe(`true ${line}`)
  for (const name of Object.keys(DOES_BEFORE)) expect(text.includes(`- chief-of-staff:${name}: ${DOES_BEFORE[name]}`)).toBe(true)
  const at = (s: string) => text.indexOf(s)
  // departments in order, each header before its agents, agents in the 0.9 order
  expect(at('Product & Engineering (') < at('- chief-of-staff:reverse-engineer')).toBe(true)
  expect(at('- chief-of-staff:reverse-engineer') < at('- chief-of-staff:frontend-developer')).toBe(true)
  expect(at('- chief-of-staff:qa-tester') < at('- chief-of-staff:devops-engineer')).toBe(true)
  expect(at('- chief-of-staff:devops-engineer') < at('Security (')).toBe(true)
  expect(at('Security (') < at('- chief-of-staff:security-reviewer')).toBe(true)
  expect(at('- chief-of-staff:security-reviewer') < at('- chief-of-staff:security-engineer')).toBe(true)
  expect(at('- chief-of-staff:security-engineer') < at('Creative (')).toBe(true)
  expect(at('Creative (') < at('- chief-of-staff:creative-director')).toBe(true)
  expect(at('- chief-of-staff:creative-director') < at('- chief-of-staff:web-designer')).toBe(true)
  expect(at('- chief-of-staff:copywriter') < at('Marketing & PR (')).toBe(true)
  expect(at('Marketing & PR (') < at('- chief-of-staff:marketing-strategist')).toBe(true)
  // Social has agents since 0.11: its header follows Marketing & PR; the departments that are off are named with the command
  expect(at('- chief-of-staff:seo-specialist') < at('Social (')).toBe(true)
  expect(at('Social (') < at('- chief-of-staff:social-strategist')).toBe(true)
  expect(text.includes('Sales (turn on with /team on sales)')).toBe(true)
  expect(text.includes('Strategy & Research (turn on with /team on strategy-research)')).toBe(true)
  expect(text.includes('/team on social')).toBe(false)
  expect(text.includes('Agent files with problems')).toBe(false)
  // the parts in order: team, off line, department rules, maker-checker lines, core rules, core text
  expect(at('- chief-of-staff:seo-specialist') < at('Departments that are off')).toBe(true)
  expect(at('Departments that are off') < at('- frontend-developer writes pages')).toBe(true)
  expect(at('- copywriter writes the words') < at("- security-engineer's output goes to")).toBe(true)
  expect(at("- security-engineer's output goes to") < at('- One agent, one role')).toBe(true)
  expect(at('- One agent, one role') < at('How to run the work:')).toBe(true)
})

test('checked-by and confirm make the maker-checker and confirm lines', () => {
  const on = enabledIds(TEAM, {})
  const text = chiefPrompt(TEAM, on)
  expect(text).toContain("- security-engineer's output goes to security-reviewer before it is called done.")
  expect(text).toContain("- web-designer's output goes to creative-director before it is called done.")
  expect(text).toContain("- copywriter's output goes to creative-director before it is called done.")
  expect(text).toContain("- frontend-developer's output goes to qa-tester before it is called done.")
  expect(text).toContain("- devops-engineer needs the person's OK, through you, before it does any of: deploy to production; change DNS; delete resources.")
  // two checkers, in order; a checker whose department is off is named with the command
  const team = teamOf(withAgent('security-engineer', edited('security-engineer', { 'checked-by': 'qa-tester, security-reviewer' })))
  expect(chiefPrompt(team, enabledIds(team, {}))).toContain("- security-engineer's output goes to qa-tester, then security-reviewer before it is called done.")
  const off = chiefPrompt(team, enabledIds(team, { 'product-engineering': false }))
  expect(off).toContain("- security-engineer's output goes to qa-tester, then security-reviewer before it is called done. " +
    '(qa-tester is in Product & Engineering, which is off: ask the person to run /team on product-engineering first.)')
  // a maker whose department is off has no line
  expect(chiefPrompt(TEAM, enabledIds(TEAM, { security: false })).includes("security-engineer's output")).toBe(false)
  // a checker that is not on the team is a problem, not a crash
  expect(teamOf(withAgent('copywriter', edited('copywriter', { 'checked-by': 'nobody' }))).problems.join()).toContain('checked-by names nobody')
})

test('a rule that names a role of a department that is off says to turn it on', () => {
  const text = chiefPrompt(TEAM, enabledIds(TEAM, { 'product-engineering': false, security: false }))
  expect(text).toContain('goes to reverse-engineer first; the team then builds an original version from its report. Never copy another product\'s code, text or assets. ' +
    '(reverse-engineer is in Product & Engineering, which is off: ask the person to run /team on product-engineering first.)')
  expect(text).toContain('also gets security-reviewer before it is called done. (security-reviewer is in Security, which is off: ask the person to run /team on security first.)')
  expect(text).toContain('goes to seo-specialist, marketing-strategist or reverse-engineer; they may use the Scrapling MCP tools if installed. Getting past CAPTCHAs or Cloudflare is blocked for everyone. ' +
    '(reverse-engineer is in Product & Engineering, which is off')
  // a department rule naming a role elsewhere is annotated too
  const creativeOnly = chiefPrompt(TEAM, enabledIds(TEAM, { 'product-engineering': false }))
  expect(creativeOnly).toContain('only approved work goes to frontend-developer. (frontend-developer is in Product & Engineering, which is off')
  // with every department on, no notes
  expect(chiefPrompt(TEAM, enabledIds(TEAM, {})).includes('which is off: ask')).toBe(false)
})

test('a department that is off is hidden from the team list and named as off', async ($, on) => {
  serve(on)
  memoryStore(on, { departments: { creative: false, sales: true } })
  on('prompt.compose', () => BASE)
  const text = await promptOf($)
  expect(text.includes('chief-of-staff:web-designer')).toBe(false)
  expect(text.includes('chief-of-staff:copywriter')).toBe(false)
  expect(text.includes('- web-designer produces the design only')).toBe(false)
  expect(text.includes('Creative (turn on with /team on creative)')).toBe(true)
  expect(text.includes('/team on sales')).toBe(false) // on now, but with no agents: not listed at all
  expect(text.includes('chief-of-staff:frontend-developer')).toBe(true)
  expect(text.includes('- One agent, one role')).toBe(true) // core rules stay
})

test('/team shows the departments; /team on, off and reset change them from the next message', async ($, on) => {
  serve(on)
  const kept = memoryStore(on)
  on('prompt.compose', () => BASE)
  on('command.register', () => ({ value: { command: 'team' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const shown = JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: '' } as never))
  expect(shown).toContain('Product & Engineering (product-engineering): on. reverse-engineer, frontend-developer, backend-developer, qa-tester, devops-engineer')
  expect(shown).toContain('Sales (sales): off. No agents yet.')
  expect(shown).toContain('Social (social): on. social-strategist, content-producer, community-manager, social-publisher')

  const off = JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: 'off creative' } as never))
  expect(off).toContain('Creative: off. It applies from your next message.')
  expect(kept.get('departments')).toEqual({ creative: false })
  expect((await promptOf($)).includes('chief-of-staff:web-designer')).toBe(false)

  await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: 'on creative' } as never)
  expect((await promptOf($)).includes('chief-of-staff:web-designer')).toBe(true)

  await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: 'off all' } as never)
  const none = await promptOf($)
  expect(none.includes('- chief-of-staff:')).toBe(false)
  expect(none.includes('no department with assignable agents is on')).toBe(true)
  expect(none.includes('Product & Engineering (turn on with /team on product-engineering)')).toBe(true)
  await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: 'on all' } as never)
  expect((await promptOf($)).includes('Departments that are off')).toBe(false)

  await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: 'reset' } as never)
  expect(kept.get('departments')).toEqual({})
  expect((await promptOf($)).includes('Sales (turn on with /team on sales)')).toBe(true)

  const bad = JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: 'on marketing' } as never))
  expect(bad).toContain('Unknown department: marketing')
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: 'sideways' } as never))).toContain('Use /team')
})

test('teamCommand on its own: lists, commas, dedupe, all, unknown, reset', () => {
  expect(teamCommand('on sales', TEAM, {}).chosen).toEqual({ sales: true })
  expect(teamCommand('OFF  Security', TEAM, { sales: true }).chosen).toEqual({ sales: true, security: false })
  expect(teamCommand('off creative,social creative', TEAM, {}).chosen).toEqual({ creative: false, social: false })
  expect(Object.keys(teamCommand('off all', TEAM, {}).chosen ?? {})).toEqual(DEPARTMENT_IDS)
  expect(teamCommand('off all bogus', TEAM, {}).chosen).toBeUndefined()
  expect(teamCommand('off all bogus', TEAM, {}).text).toContain('Unknown department: bogus. Nothing changed.')
  expect(teamCommand('on other', TEAM, {}).chosen).toBeUndefined()
  expect(teamCommand('on', TEAM, {}).chosen).toBeUndefined()
  expect(teamCommand('reset', TEAM, { sales: true }).chosen).toEqual({})
  // stored values: only true or false count, and only own keys
  const odd = Object.assign(Object.create({ sales: true }), { creative: 0, legal: 'yes', finance: true }) as Record<string, boolean>
  const on = enabledIds(TEAM, odd)
  expect([on.has('sales'), on.has('creative'), on.has('legal'), on.has('finance')]).toEqual([false, true, false, true])
})

test('assigning an agent of a department that is off is refused; other roles never are', async ($, on) => {
  serve(on)
  memoryStore(on, { departments: { security: false } })
  on('tool.call', () => ({ result: {} }))
  const blocked = await $.tool.call({ tool: 'Agent', subagent_type: 'chief-of-staff:security-reviewer', description: 'audit', prompt: 'x' } as never)
  expect(String(deny(blocked))).toContain('The Security department is off')
  expect(String(deny(blocked))).toContain('/team on security')
  const task = await $.tool.call({ tool: 'Task', subagent_type: 'chief-of-staff:security-engineer', description: 'fix', prompt: 'x' } as never)
  expect(String(deny(task))).toContain('/team on security')
  for (const type of ['general-purpose', 'Explore', 'other-plugin:security-reviewer', 'security-reviewer', 'chief-of-staff:web-designer']) {
    const ok = await $.tool.call({ tool: 'Agent', subagent_type: type, description: 'x', prompt: 'x' } as never)
    expect(`${type} ${deny(ok) ?? 'allowed'}`).toBe(`${type} allowed`)
  }
  // a type of this plugin that is not on the team is refused
  const unknown = await $.tool.call({ tool: 'Agent', subagent_type: 'chief-of-staff:not-a-role', description: 'x', prompt: 'x' } as never)
  expect(String(deny(unknown))).toContain('is not on the team')
  expect(departmentLimit('chief-of-staff:security-reviewer', TEAM, enabledIds(TEAM, {}))).toBeUndefined()
  expect(departmentLimit(undefined, TEAM, enabledIds(TEAM, {}))).toBeUndefined()
})

test('/delegate off does not lift the department limit', async ($, on) => {
  serve(on)
  memoryStore(on, { departments: { security: false }, delegate: false })
  on('tool.call', () => ({ result: {} }))
  const r = await $.tool.call({ tool: 'Agent', subagent_type: 'chief-of-staff:security-reviewer', description: 'audit', prompt: 'x' } as never)
  expect(String(deny(r))).toContain('The Security department is off')
})

test('agent.offer and agent.spawn keep a department that is off out', async ($, on) => {
  serve(on)
  memoryStore(on, { departments: { creative: false } })
  on('agent.offer', () => ({ isOffered: true }))
  on('agent.spawn', () => ({ model: 'm' }))
  const offer = (agent: string) => $.agent.offer({ agent, description: '', source: 'plugin', provider: { plugin: 'chief-of-staff', tier: 'user' } } as never)
  expect((await offer('chief-of-staff:web-designer')).isOffered).toBe(false)
  expect((await offer('chief-of-staff:frontend-developer')).isOffered).toBe(true)
  expect((await offer('general-purpose')).isOffered).toBe(true)
  const spawn = (subagentType: string) => $.agent.spawn({ tool_use_id: 't', prompt: 'x', description: 'x', subagentType, provider: { plugin: 'chief-of-staff', tier: 'user' }, parentModel: 'm' } as never)
  expect(String(deny(await spawn('Chief-Of-Staff:Web-Designer')))).toContain('The Creative department is off')
  expect(deny(await spawn('chief-of-staff:qa-tester'))).toBeUndefined()
})

test('write-limit can only tighten a shipped role; can-deploy is honoured only from the floor', () => {
  let files = withAgent('qa-tester', edited('qa-tester', { 'write-limit': 'md-only' }))
  files = withAgent('web-designer', edited('web-designer', { 'write-limit': undefined }), files)
  files = withAgent('creative-director', edited('creative-director', { 'write-limit': 'none' }), files)
  files = withAgent('copywriter', edited('copywriter', { 'write-limit': 'no-scripts' }), files)
  files = withAgent('backend-developer', edited('backend-developer', { 'can-deploy': 'true' }), files)
  files = withAgent('growth-hacker', '---\nname: growth-hacker\ndepartment: marketing-pr\ndoes: experiments\ncan-deploy: true\n---\n', files)
  const team = teamOf(files)
  expect(team.problems).toEqual([])
  const limit = (role: string, tool: string, path: string, command = '') => roleLimit(role, tool, path, command, team)
  // a file tightens: qa-tester md-only, copywriter no-scripts
  expect(String(limit('qa-tester', 'Write', '/site/e2e.spec.ts'))).toContain('Role limit: qa-tester writes only .md')
  expect(limit('qa-tester', 'Write', '/site/bugs.md')).toBeUndefined()
  expect(String(limit('copywriter', 'Edit', '/site/build.sh'))).toContain('Role limit: copywriter does not write scripts, build or config files')
  // a file cannot loosen: web-designer keeps no-scripts, creative-director keeps md-only
  expect(String(limit('web-designer', 'Write', '/site/contrast.js'))).toContain('Role limit: web-designer')
  expect(String(limit('creative-director', 'Write', '/site/home.css'))).toContain('Role limit: creative-director')
  // can-deploy in a file gives nothing to a role the floor does not let deploy
  expect(String(limit('backend-developer', 'Bash', '', 'npx wrangler deploy'))).toContain('only devops-engineer deploys')
  expect(String(limit('growth-hacker', 'Bash', '', 'npx wrangler deploy'))).toContain('only devops-engineer deploys')
  expect(String(limit('growth-hacker', 'Bash', '', 'git push --force-with-lease'))).toContain('Rewriting git history')
  expect(limit('devops-engineer', 'Bash', '', 'npx wrangler deploy')).toBeUndefined()
  // devops-engineer's file may give it up (stricter): then nobody deploys
  const noDeploy = teamOf(withAgent('devops-engineer', edited('devops-engineer', { 'can-deploy': undefined })))
  expect(String(roleLimit('devops-engineer', 'Bash', '', 'wrangler deploy', noDeploy))).toContain('no role on the team may deploy')
  // privileges by exact type only; restrictions by short name
  expect(String(roleLimit('other-plugin:devops-engineer', 'Bash', '', 'wrangler deploy', TEAM))).toContain('only devops-engineer deploys')
  expect(String(roleLimit('other-plugin:web-designer', 'Write', '/a.js', '', TEAM))).toContain('Role limit: web-designer')
  // a built-in (its type is bare, as the engine lists it) has no write limit
  expect(writeLimitWhy(limitsFor('general-purpose', TEAM), '/a.js')).toBeUndefined()
  expect(writeLimitWhy(limitsFor(undefined, TEAM), '/a.js')).toContain('writes only .md')
})

test('a typo, a repeated key or a second file with the same name: the tightest limits, and not assignable', () => {
  const typo = teamOf(withAgent('frontend-developer', edited('frontend-developer', { 'write-limit': 'no-script' })))
  expect(typo.problems.join()).toContain('unknown write-limit "no-script"')
  expect(String(roleLimit('frontend-developer', 'Write', '/a.ts', '', typo))).toContain('writes only .md files until its agent file loads cleanly')
  expect(String(departmentLimit('chief-of-staff:frontend-developer', typo, enabledIds(typo, {})))).toContain('its agent file has problems')

  const twice = teamOf(withAgent('creative-director', (FILES['agents/creative-director.md'] as string).replace('write-limit: md-only', 'write-limit: md-only\nwrite-limit: none')))
  expect(twice.problems.join()).toContain('the key "write-limit" is given more than once')
  expect(String(roleLimit('creative-director', 'Write', '/x.ts', '', twice))).toContain('writes only .md')

  const spoof = teamOf({ ...FILES, 'agents/0.md': '---\nname: devops-engineer\ndepartment: product-engineering\nwrite-limit: none\ncan-deploy: true\n---\n' })
  expect(spoof.problems.join()).toContain('a second file named devops-engineer')
  expect(String(roleLimit('devops-engineer', 'Bash', '', 'wrangler deploy', spoof))).toContain('no role on the team may deploy')
  expect(String(departmentLimit('chief-of-staff:devops-engineer', spoof, enabledIds(spoof, {})))).toContain('its agent file has problems')
  expect(chiefPrompt(spoof, enabledIds(spoof, {}))).toContain('Agent files with problems (these roles cannot be assigned until they are fixed; tell the person to run /team): devops-engineer.')
  expect(chiefPrompt(spoof, enabledIds(spoof, {})).includes('- chief-of-staff:devops-engineer:')).toBe(false)
})

test('an agent file with a bad or missing department cannot be assigned and is listed; nothing crashes', async ($, on) => {
  let files = withAgent('qa-tester', edited('qa-tester', { department: 'quality' }))
  files = withAgent('copywriter', edited('copywriter', { department: undefined }), files)
  files = withAgent('broken', '---\nthis is: [not, closed\n---\n', files) // no name: skipped
  files = withAgent('odd', 'no frontmatter at all', files)
  files = withAgent('fresh', '---\nname: fresh\ndepartment: creative\ndescription: A new role. It does things.\n---\nbody', files)
  serve(on, files)
  memoryStore(on)
  on('prompt.compose', () => BASE)
  on('tool.call', () => ({ result: {} }))
  on('command.register', () => ({ value: { command: 'team' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const text = await promptOf($)
  expect(text.includes('- chief-of-staff:qa-tester:')).toBe(false)
  expect(text.includes('- chief-of-staff:copywriter:')).toBe(false)
  expect(text).toContain('- chief-of-staff:fresh: A new role') // no does: the description's first sentence
  expect(text).toContain('Agent files with problems')
  const shown = JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: '' } as never))
  expect(shown).toContain('No department (cannot be assigned until their files name one): copywriter, qa-tester')
  expect(shown).toContain('qa-tester.md: unknown department \\"quality\\"')
  expect(shown).toContain('copywriter.md: no department')
  expect(shown).toContain('broken.md: no frontmatter with a valid name')
  const r = await $.tool.call({ tool: 'Agent', subagent_type: 'chief-of-staff:qa-tester', description: 'x', prompt: 'x' } as never)
  expect(String(deny(r))).toContain('its agent file has problems')
})

test('a missing or broken departments.json falls back to the built-in twelve, never to one bucket', async ($, on) => {
  for (const json of [undefined, '{ nope', '[]', '{}', 'null']) {
    const team = teamOf(json === undefined ? { ...FILES, 'departments.json': undefined as never } : { ...FILES, 'departments.json': json })
    expect(team.departments.map(d => d.id)).toEqual(DEPARTMENT_IDS)
    expect(team.problems[0]).toContain('using the built-in twelve departments')
    expect(team.agents.every(a => a.department !== '' && a.problems.length === 0)).toBe(true)
    expect([...enabledIds(team, {})]).toEqual(DEFAULT_ON)
    expect(roleLimit('web-designer', 'Write', 'a.js', '', team)).toBeDefined()
  }
  // no file system answer at all (no serve): the core text is still there
  on('prompt.compose', () => BASE)
  const text = await promptOf($)
  expect(text).toContain('# You are the Chief of Staff')
  expect(text).toContain('no agents could be loaded')
  expect(text).toContain('How to run the work:')
})

test('only regular agent files of up to 64 KiB are read', async ($, on) => {
  const files = withAgent('huge', `---\nname: huge\ndepartment: creative\n---\n${'x'.repeat(70 * 1024)}`)
  serve(on, files, { 'agents/frontend-developer.md': { isLink: true, kind: 'other' }, 'agents/qa-tester.md': { kind: 'other' } })
  memoryStore(on)
  agents(on, { f1: 'chief-of-staff:frontend-developer' })
  on('command.register', () => ({ value: { command: 'team' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const shown = JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'team', args: '' } as never))
  expect(shown).toContain('agents/huge.md is over 64 KiB; skipped')
  expect(shown).toContain('agents/frontend-developer.md is not a regular file; skipped')
  expect(shown).toContain('agents/qa-tester.md is not a regular file; skipped')
  // a skipped shipped role is not on the team: its agent writes only .md
  const w = await $.tool.call({ tool: 'Write', file_path: '/site/a.ts', content: 'x', agentId: 'f1' } as never)
  expect(String(deny(w))).toContain('writes only .md files until its agent file loads cleanly')
})
