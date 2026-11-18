import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

import { buildTeam, bypassLimit, HISTORY_REWRITE, roleLimit as limitIn, runsCommand, runsDeploy } from '../hooks/register'
import type { Team } from '../hooks/register'
import { FILES } from './files'
import { serve } from './serve'

/** The team as the agent files define it; roleLimit reads each role's limits from it. */
const TEAM: Team = buildTeam(FILES['departments.json'], agentFiles(FILES))
const roleLimit = (role: string, tool: string, path: string, command: string) => limitIn(role, tool, path, command, TEAM)

function agentFiles(files: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(files).filter(([k]) => k.startsWith('agents/')).map(([k, v]) => [k.slice('agents/'.length), v]))
}

const IN = (tools: string[]) => ({ model: 'm', promptModel: 'm', surfaces: [], tools, outputStyle: null, traits: [] })
const BASE = { sections: [{ id: 'intro', text: 'engine intro', scope: 'shared' as const }] }

test('the main session gets the Chief of Staff section', async ($, on) => {
  serve(on)
  on('prompt.compose', () => BASE)
  const out = await $.prompt.compose(IN(['Agent', 'Read']))
  const chief = out.sections.find(s => s.id === 'chief-of-staff:chief-of-staff')
  expect(chief?.scope).toBe('session')
  expect(chief?.text.includes('chief-of-staff:web-designer')).toBe(true)
  expect(chief?.text.includes('never one task: at least web-designer, then frontend-developer, then qa-tester')).toBe(true)
  expect(chief?.text.includes('It does not write JavaScript, Python')).toBe(true)
  expect(chief?.text.includes('start with creative-director (direction)')).toBe(true)
  expect(chief?.text.includes('goes to reverse-engineer first')).toBe(true)
  expect(chief?.text.includes('Use Superpowers to plan, never to implement yourself')).toBe(true)
  expect(chief?.text.includes('chief-of-staff:security-engineer')).toBe(true)
  expect(chief?.text.includes('Security hardening runs reviewer, engineer, reviewer')).toBe(true)
  expect(out.sections[0]?.id).toBe('intro')
})

test('an agent without the Agent tool is not told to delegate', async ($, on) => {
  on('prompt.compose', () => BASE)
  const out = await $.prompt.compose(IN(['Read', 'Edit']))
  expect(out.sections.some(s => s.id === 'chief-of-staff:chief-of-staff')).toBe(false)
})

test('/delegate off turns it off', async ($, on) => {
  const kept = new Map<string, unknown>()
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('prompt.compose', () => BASE)
  on('command.register', () => ({ value: { command: 'delegate' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const before = await $.prompt.compose(IN(['Agent']))
  expect(before.sections.some(s => s.id === 'chief-of-staff:chief-of-staff')).toBe(true)
  const said = await $.command.run({ command: 'delegate', args: 'off' } as never)
  expect(JSON.stringify(said).includes('is off')).toBe(true)
  const out = await $.prompt.compose(IN(['Agent']))
  expect(out.sections.some(s => s.id === 'chief-of-staff:chief-of-staff')).toBe(false)
})

test('the Chief of Staff cannot edit files; an agent can', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  const chief = await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b' } as never)
  expect(String((chief as { deny?: string }).deny).includes('Chief of Staff rule')).toBe(true)
  const agent = await $.tool.call({ tool: 'Edit', file_path: '/a.ts', old_string: 'a', new_string: 'b', agentId: 'a1' } as never)
  expect((agent as { deny?: string }).deny).toBeUndefined()
  const read = await $.tool.call({ tool: 'Read', file_path: '/a.ts' } as never)
  expect((read as { deny?: string }).deny).toBeUndefined()
})

test('older Claude Code (Task tool) also gets the section', async ($, on) => {
  on('prompt.compose', () => BASE)
  const out = await $.prompt.compose(IN(['Task', 'Read']))
  expect(out.sections.some(s => s.id === 'chief-of-staff:chief-of-staff')).toBe(true)
})

test('/delegate off lets the Chief of Staff edit again', async ($, on) => {
  const kept = new Map<string, unknown>()
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('tool.call', () => ({ result: {} }))
  on('command.register', () => ({ value: { command: 'delegate' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.command.run({ command: 'delegate', args: 'off' } as never)
  const chief = await $.tool.call({ tool: 'Write', file_path: '/a.ts', content: 'x' } as never)
  expect((chief as { deny?: string }).deny).toBeUndefined()
})


test('role limits: what each role may and may not do', () => {
  // web-designer: styles, markup and components yes; scripts and config no
  for (const ok of ['/site/home.css', '/site/index.html', '/site/Hero.tsx', '/site/Nav.vue', '/site/logo.svg', '/site/tokens.json']) {
    expect(`${ok} ${roleLimit('web-designer', 'Write', ok, '') ?? 'allowed'}`).toBe(`${ok} allowed`)
  }
  for (const no of ['/site/contrast.js', '/site/static.ts', 'C:\\\\site\\\\finish.py', '/site/wrangler.toml', '/site/package.json', '/site/.github/workflows/ci.yml', '/site/build.sh']) {
    expect(String(roleLimit('web-designer', 'Edit', no, '')).startsWith('Role limit: web-designer')).toBe(true)
  }
  // creative-director: markdown notes only
  expect(roleLimit('creative-director', 'Write', '/site/creative-brief.md', '')).toBeUndefined()
  expect(String(roleLimit('creative-director', 'Edit', '/site/home.css', ''))).toContain('Role limit: creative-director')
  // reverse-engineer: markdown reports only
  expect(roleLimit('reverse-engineer', 'Write', '/site/research/scroll.md', '')).toBeUndefined()
  expect(String(roleLimit('reverse-engineer', 'Write', '/site/scroll.js', ''))).toContain('Role limit: reverse-engineer')
  // other roles may write code
  expect(roleLimit('frontend-developer', 'Write', '/site/contrast.js', '')).toBeUndefined()
  // deploys: only devops-engineer
  expect(roleLimit('devops-engineer', 'Bash', '', 'npx wrangler deploy')).toBeUndefined()
  expect(String(roleLimit('frontend-developer', 'Bash', '', 'npx wrangler deploy'))).toContain('only devops-engineer deploys')
  expect(String(roleLimit('', 'Bash', '', 'vercel --prod'))).toContain('Assign the deploy')
  // ordinary commands, including a local dev server, stay allowed
  for (const cmd of ['npm run build', 'npx wrangler dev', 'npm test', 'git status']) {
    expect(`${cmd} ${roleLimit('web-designer', 'Bash', '', cmd) ?? 'allowed'}`).toBe(`${cmd} allowed`)
  }
})

test('deploy limit: running a deploy is blocked, mentioning one is not', () => {
  for (const cmd of ['wrangler deploy', 'npx wrangler pages deploy dist', 'cd site && npm run deploy', 'FOO=1 vercel --prod', 'bash -c "wrangler deploy"',
    "eval 'netlify deploy'", 'echo "$(firebase deploy)"', 'npm test; ./node_modules/.bin/wrangler deploy', 'bash <<EOF\nwrangler deploy\nEOF', "cat <<'EOF' > a.txt && vercel deploy\nhi\nEOF"]) {
    expect(`${cmd} ${roleLimit('frontend-developer', 'Bash', '', cmd) ?? 'allowed'}`).toContain('only devops-engineer deploys')
  }
  for (const cmd of ["cat > page.html <<'EOF'\n<p>Run wrangler deploy to ship</p>\nEOF", 'cat <<EOF > a.md\nnpx vercel --prod\nEOF', 'cat <<-"EOF" > b.md\n\tnetlify deploy\n\tEOF',
    'echo "run wrangler deploy later"', "grep -r 'netlify deploy' docs/", 'git commit -m "docs: explain firebase deploy"', 'cat <<<"wrangler deploy"']) {
    expect(`${cmd} ${roleLimit('frontend-developer', 'Bash', '', cmd) ?? 'allowed'}`).toBe(`${cmd} allowed`)
  }
  expect(runsDeploy('wrangler deploy')).toBe(true)
  expect(roleLimit('devops-engineer', 'Bash', '', 'wrangler deploy')).toBeUndefined()
})

test('history limit: rewriting git history or force pushing is blocked for everyone', () => {
  const blocked = (role: string, cmd: string) => `${role}: ${cmd} ${roleLimit(role, 'Bash', '', cmd) ?? 'allowed'}`
  for (const cmd of ['git filter-repo --path .env --invert-paths', 'bfg --delete-files .env', 'git push --force origin main',
    'git push -f', 'git push -uf origin main', 'git push origin +main', 'git rebase -i HEAD~3 && git push --force', 'java -jar bfg-1.14.0.jar --delete-files .env',
    'git -C site filter-branch --tree-filter "rm -f .env" HEAD', 'bash -c "git push --force"', 'git push --force-with-lease']) {
    expect(blocked('security-engineer', cmd)).toContain("Rewriting git history is the person's call")
  }
  for (const cmd of ['git log -p | grep -i api_key', 'echo "never run git filter-repo"', 'git push origin main', 'git push --follow-tags',
    'gitleaks detect --source .', "grep -r 'git push --force' docs/", 'git rebase main', 'git commit -m "explain bfg"']) {
    expect(blocked('security-engineer', cmd)).toBe(`security-engineer: ${cmd} allowed`)
  }
  // devops-engineer may push with a lease, but not plain --force or a filter tool
  expect(roleLimit('devops-engineer', 'Bash', '', 'git push --force-with-lease')).toBeUndefined()
  expect(roleLimit('devops-engineer', 'Bash', '', 'git rebase main && git push --force-with-lease origin feat')).toBeUndefined()
  expect(String(roleLimit('devops-engineer', 'Bash', '', 'git push --force origin main'))).toContain('Rewriting git history')
  expect(String(roleLimit('devops-engineer', 'Bash', '', 'git filter-repo --path .env --invert-paths'))).toContain('Rewriting git history')
  // the main session too
  expect(String(roleLimit('', 'Bash', '', 'git filter-branch --index-filter "git rm --cached .env" HEAD'))).toContain('Rewriting git history')
  expect(runsCommand('git filter-repo --analyze', HISTORY_REWRITE)).toBe(true)
  expect(runsCommand('echo git filter-repo', HISTORY_REWRITE)).toBe(false)
})

test('a security-engineer agent is refused a force push through the hook', async ($, on) => {
  serve(on)
  on('agent.list', () => ({ value: [{ id: 's1', type: 'chief-of-staff:security-engineer', description: '', status: 'running' } as never] }))
  on('tool.call', () => ({ result: {} }))
  const push = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main', agentId: 's1' } as never)
  expect(String((push as { deny?: string }).deny)).toContain("Rewriting git history is the person's call")
  const scan = await $.tool.call({ tool: 'Bash', command: 'git log -p | grep -i api_key', agentId: 's1' } as never)
  expect((scan as { deny?: string }).deny).toBeUndefined()
  const fix = await $.tool.call({ tool: 'Edit', file_path: '/site/server.ts', old_string: 'a', new_string: 'b', agentId: 's1' } as never)
  expect((fix as { deny?: string }).deny).toBeUndefined()
})

test('a web-designer agent is refused a .js file; a frontend-developer is not', async ($, on) => {
  serve(on)
  on('agent.list', () => ({ value: [
    { id: 'd1', type: 'chief-of-staff:web-designer', description: '', status: 'running' } as never,
    { id: 'f1', type: 'chief-of-staff:frontend-developer', description: '', status: 'running' } as never,
  ] }))
  on('tool.call', () => ({ result: {} }))
  const designer = await $.tool.call({ tool: 'Write', file_path: '/site/contrast.js', content: 'x', agentId: 'd1' } as never)
  expect(String((designer as { deny?: string }).deny)).toContain('Role limit: web-designer')
  const css = await $.tool.call({ tool: 'Write', file_path: '/site/home.css', content: 'x', agentId: 'd1' } as never)
  expect((css as { deny?: string }).deny).toBeUndefined()
  const dev = await $.tool.call({ tool: 'Write', file_path: '/site/contrast.js', content: 'x', agentId: 'f1' } as never)
  expect((dev as { deny?: string }).deny).toBeUndefined()
  const deploy = await $.tool.call({ tool: 'Bash', command: 'npx wrangler deploy', agentId: 'f1' } as never)
  expect(String((deploy as { deny?: string }).deny)).toContain('only devops-engineer deploys')
})

test('getting past bot protection is refused for everyone; normal scraping is not', async ($, on) => {
  expect(bypassLimit('mcp__scrapling__browser_fetch', { url: 'https://x.com', solve_cloudflare: true })).toContain('Not allowed')
  expect(bypassLimit('mcp__scrapling__browser_fetch', { url: 'https://x.com', solve_cloudflare: false })).toBeUndefined()
  expect(bypassLimit('mcp__scrapling__make_request', { url: 'https://x.com' })).toBeUndefined()
  expect(bypassLimit('Bash', { command: 'scrapling extract stealthy-fetch https://x.com out.md --solve-cloudflare' })).toContain('Not allowed')
  expect(bypassLimit('Bash', { command: 'python -c "StealthyFetcher.fetch(u, solve_cloudflare=True)"' })).toContain('Not allowed')
  expect(bypassLimit('Bash', { command: 'scrapling extract get https://x.com out.md' })).toBeUndefined()

  // the hook refuses it even with /delegate off, and for an agent
  const kept = new Map<string, unknown>([['delegate', false]])
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  on('tool.call', () => ({ result: {} }))
  const r = await $.tool.call({ tool: 'mcp__scrapling__browser_fetch_once', url: 'https://x.com', solve_cloudflare: true, agentId: 'a1' } as never)
  expect(String((r as { deny?: string }).deny)).toContain('Not allowed')
  const ok = await $.tool.call({ tool: 'mcp__scrapling__make_request', url: 'https://x.com', agentId: 'a1' } as never)
  expect((ok as { deny?: string }).deny).toBeUndefined()
})


// ---- 0.10: departments and agent frontmatter ----

import {
  agentOfType, chiefPrompt, CONFIRM, departmentLimit, enabledIds, parseFrontmatter, sendsForPerson, teamCommand, toolWords,
} from '../hooks/register'

/** The one-liners the Chief of Staff saw before 0.10 (hard-coded then), by role. */
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

const DEFAULT_ON = ['product-engineering', 'security', 'creative', 'marketing-pr', 'social']
const DEPARTMENT_IDS = ['product-engineering', 'security', 'creative', 'marketing-pr', 'social', 'sales', 'data-analytics',
  'finance', 'risk-audit-compliance', 'legal', 'operations-people', 'strategy-research']

/** FILES with one agent file replaced (or added); `undefined` removes it. */
function withAgent(name: string, text: string | undefined, files: Record<string, string> = FILES): Record<string, string> {
  const out = { ...files }
  if (text === undefined) delete out[`agents/${name}.md`]
  else out[`agents/${name}.md`] = text
  return out
}
/** An agent file's text with frontmatter lines replaced or added: `{ 'write-limit': 'md-only' }`. */
function edited(name: string, fields: Record<string, string | undefined>): string {
  const text = FILES[`agents/${name}.md`] as string
  const end = text.indexOf('\n---', 4)
  let head = text.slice(0, end)
  for (const [k, v] of Object.entries(fields)) {
    const line = new RegExp(`^${k}:.*$`, 'm')
    head = line.test(head) ? head.replace(line, v === undefined ? '' : `${k}: ${v}`).replace(/\n\n+/g, '\n') : v === undefined ? head : `${head}\n${k}: ${v}`
  }
  return head + text.slice(end)
}
const teamOf = (files: Record<string, string>) => buildTeam(files['departments.json'], agentFiles(files))
const promptOf = async ($: Engine) =>
  (await $.prompt.compose(IN(['Agent']))).sections.find(s => s.id === 'chief-of-staff:chief-of-staff')?.text ?? ''
const memoryStore = (on: On, start: Record<string, unknown> = {}) => {
  const kept = new Map<string, unknown>(Object.entries(start))
  on('store.set', (_, e) => (kept.set(e.key, e.value), { value: undefined }))
  on('store.get', (_, e) => ({ value: kept.get(e.key) }))
  return kept
}

test('frontmatter parser: plain, quoted, lists, comments, CRLF, none', () => {
  const fm = parseFrontmatter('---\r\nname: web-designer\r\ndescription: "Web designer: layout"\r\ntools: Read, Write\r\n# a comment\r\n' +
    "checked-by: [creative-director, 'qa-tester']\r\nconfirm:\r\n  - send email\r\n  - publish posts\r\ncan-deploy: true  # yes\r\n---\r\nbody: not frontmatter\r\n")
  expect(fm.name).toBe('web-designer')
  expect(fm.description).toBe('Web designer: layout')
  expect(fm.tools).toBe('Read, Write')
  expect(fm['checked-by']).toBe('creative-director, qa-tester')
  expect(fm.confirm).toBe('send email, publish posts')
  expect(fm['can-deploy']).toBe('true')
  expect(fm.body).toBeUndefined()
  expect(parseFrontmatter('# no frontmatter\nname: x\n')).toEqual({})
  expect(parseFrontmatter('---\nname: x\n')).toEqual({})
})

test('every agent file declares its department and settings; nothing is wrong with the files', () => {
  expect(TEAM.problems).toEqual([])
  expect(TEAM.departments.map(d => d.id)).toEqual(DEPARTMENT_IDS)
  expect(TEAM.departments.filter(d => d.isDefaultOn).map(d => d.id)).toEqual(DEFAULT_ON)
  expect(TEAM.agents.length).toBe(12)
  for (const [name, does] of Object.entries(DOES_BEFORE)) expect(`${name}: ${TEAM.agents.find(a => a.name === name)?.does}`).toBe(`${name}: ${does}`)
  const where = Object.fromEntries(TEAM.agents.map(a => [a.name, a.department]))
  expect(where).toEqual({
    'reverse-engineer': 'product-engineering', 'frontend-developer': 'product-engineering', 'backend-developer': 'product-engineering',
    'qa-tester': 'product-engineering', 'devops-engineer': 'product-engineering', 'security-reviewer': 'security', 'security-engineer': 'security',
    'creative-director': 'creative', 'web-designer': 'creative', 'copywriter': 'creative', 'marketing-strategist': 'marketing-pr', 'seo-specialist': 'marketing-pr',
  })
  const limits = Object.fromEntries(TEAM.agents.filter(a => a.writeLimit !== 'none').map(a => [a.name, a.writeLimit]))
  expect(limits).toEqual({ 'reverse-engineer': 'md-only', 'creative-director': 'md-only', 'web-designer': 'no-scripts' })
  expect(TEAM.agents.filter(a => a.canDeploy).map(a => a.name)).toEqual(['devops-engineer'])
  // the files keep what Claude Code reads
  expect(parseFrontmatter(FILES['agents/web-designer.md'] as string).skills).toBe('taste-skill:design-taste-frontend, design-taste-frontend')
  expect(parseFrontmatter(FILES['agents/security-reviewer.md'] as string).tools).toBe('Read, Grep, Glob, Bash, WebSearch, WebFetch')
})

test('the generated prompt groups the team by department and keeps every routing rule', async ($, on) => {
  serve(on)
  on('prompt.compose', () => BASE)
  const text = await promptOf($)
  for (const line of ROUTING_BEFORE) expect(`${text.includes(line)} ${line}`).toBe(`true ${line}`)
  for (const name of Object.keys(DOES_BEFORE)) expect(text.includes(`- chief-of-staff:${name}: ${DOES_BEFORE[name]}`)).toBe(true)
  // departments in order, each header before its agents
  const at = (s: string) => text.indexOf(s)
  expect(at('Product & Engineering (') < at('- chief-of-staff:devops-engineer')).toBe(true)
  expect(at('- chief-of-staff:devops-engineer') < at('Security (')).toBe(true)
  expect(at('Security (') < at('- chief-of-staff:security-reviewer')).toBe(true)
  expect(at('- chief-of-staff:security-reviewer') < at('Creative (')).toBe(true)
  expect(at('Creative (') < at('- chief-of-staff:web-designer')).toBe(true)
  expect(at('- chief-of-staff:web-designer') < at('Marketing & PR (')).toBe(true)
  expect(at('Marketing & PR (') < at('- chief-of-staff:seo-specialist')).toBe(true)
  // Social is on but has no agents: no header; the departments that are off are named with the command
  expect(text.includes('Social (')).toBe(false)
  expect(text.includes('Sales (turn on with /team on sales)')).toBe(true)
  expect(text.includes('Strategy & Research (turn on with /team on strategy-research)')).toBe(true)
  expect(text.includes('/team on social')).toBe(false)
  // the order of the parts: team, off line, department rules, maker-checker lines, core rules, core text
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
  expect(off).toContain("- security-engineer's output goes to qa-tester (its department, Product & Engineering, is off: ask the person to run /team on product-engineering), then security-reviewer")
  // a maker whose department is off has no line
  expect(chiefPrompt(TEAM, enabledIds(TEAM, { security: false })).includes("security-engineer's output")).toBe(false)
  // a checker that is not on the team is a problem, not a crash
  expect(teamOf(withAgent('copywriter', edited('copywriter', { 'checked-by': 'nobody' }))).problems.join()).toContain('checked-by names nobody')
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

test('/team shows the departments; /team on and off change them from the next message', async ($, on) => {
  serve(on)
  const kept = memoryStore(on)
  on('prompt.compose', () => BASE)
  on('command.register', () => ({ value: { command: 'team' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const shown = JSON.stringify(await $.command.run({ command: 'team', args: '' } as never))
  expect(shown).toContain('Product & Engineering (product-engineering): on. backend-developer, devops-engineer, frontend-developer, qa-tester, reverse-engineer')
  expect(shown).toContain('Sales (sales): off. No agents yet.')
  expect(shown).toContain('Social (social): on. No agents yet.')

  const off = JSON.stringify(await $.command.run({ command: 'team', args: 'off creative' } as never))
  expect(off).toContain('Creative: off. It applies from your next message.')
  expect(kept.get('departments')).toEqual({ creative: false })
  expect((await promptOf($)).includes('chief-of-staff:web-designer')).toBe(false)

  await $.command.run({ command: 'team', args: 'on creative' } as never)
  expect((await promptOf($)).includes('chief-of-staff:web-designer')).toBe(true)

  await $.command.run({ command: 'team', args: 'off all' } as never)
  const none = await promptOf($)
  expect(none.includes('chief-of-staff:')).toBe(false)
  expect(none.includes('Product & Engineering (turn on with /team on product-engineering)')).toBe(true)
  await $.command.run({ command: 'team', args: 'on all' } as never)
  const all = await promptOf($)
  expect(all.includes('Departments that are off')).toBe(false)

  const bad = JSON.stringify(await $.command.run({ command: 'team', args: 'on marketing' } as never))
  expect(bad).toContain('Unknown department: marketing')
  expect(JSON.stringify(await $.command.run({ command: 'team', args: 'sideways' } as never))).toContain('Use /team')
})

test('teamCommand on its own: on, off, all, unknown, Other', () => {
  expect(teamCommand('on sales', TEAM, {}).chosen).toEqual({ sales: true })
  expect(teamCommand('OFF  Security', TEAM, { sales: true }).chosen).toEqual({ sales: true, security: false })
  expect(Object.keys(teamCommand('off all', TEAM, {}).chosen ?? {})).toEqual(DEPARTMENT_IDS)
  expect(teamCommand('on other', TEAM, {}).text).toContain('Other is always on')
  expect(teamCommand('on', TEAM, {}).chosen).toBeUndefined()
})

test('assigning an agent of a department that is off is refused; other roles never are', async ($, on) => {
  serve(on)
  memoryStore(on, { departments: { security: false } })
  on('tool.call', () => ({ result: {} }))
  const deny = (r: unknown) => (r as { deny?: string }).deny
  const blocked = await $.tool.call({ tool: 'Agent', subagent_type: 'chief-of-staff:security-reviewer', description: 'audit', prompt: 'x' } as never)
  expect(String(deny(blocked))).toContain('The Security department is off')
  expect(String(deny(blocked))).toContain('/team on security')
  const task = await $.tool.call({ tool: 'Task', subagent_type: 'chief-of-staff:security-engineer', description: 'fix', prompt: 'x' } as never)
  expect(String(deny(task))).toContain('/team on security')
  for (const type of ['general-purpose', 'Explore', 'other-plugin:security-reviewer', 'chief-of-staff:web-designer', 'chief-of-staff:not-a-role']) {
    const ok = await $.tool.call({ tool: 'Agent', subagent_type: type, description: 'x', prompt: 'x' } as never)
    expect(`${type} ${deny(ok) ?? 'allowed'}`).toBe(`${type} allowed`)
  }
  expect(departmentLimit('chief-of-staff:security-reviewer', TEAM, enabledIds(TEAM, {}))).toBeUndefined()
  expect(departmentLimit(undefined, TEAM, enabledIds(TEAM, {}))).toBeUndefined()
  expect(agentOfType(TEAM, 'security-reviewer')).toBeUndefined()
})

test('/delegate off also lifts the department limit', async ($, on) => {
  serve(on)
  memoryStore(on, { departments: { security: false }, delegate: false })
  on('tool.call', () => ({ result: {} }))
  const r = await $.tool.call({ tool: 'Agent', subagent_type: 'chief-of-staff:security-reviewer', description: 'audit', prompt: 'x' } as never)
  expect((r as { deny?: string }).deny).toBeUndefined()
})

test('write-limit and can-deploy come from the frontmatter, not from the role name', () => {
  let files = withAgent('qa-tester', edited('qa-tester', { 'write-limit': 'md-only' }))
  files = withAgent('web-designer', edited('web-designer', { 'write-limit': undefined }), files)
  files = withAgent('copywriter', edited('copywriter', { 'write-limit': 'no-scripts' }), files)
  files = withAgent('devops-engineer', edited('devops-engineer', { 'can-deploy': undefined }), files)
  files = withAgent('backend-developer', edited('backend-developer', { 'can-deploy': 'true' }), files)
  const team = teamOf(files)
  expect(team.problems).toEqual([])
  const limit = (role: string, tool: string, path: string, command = '') => limitIn(role, tool, path, command, team)
  // md-only
  expect(String(limit('qa-tester', 'Write', '/site/e2e.spec.ts'))).toContain('Role limit: qa-tester writes only .md')
  expect(limit('qa-tester', 'Write', '/site/bugs.md')).toBeUndefined()
  // no-scripts moved from web-designer to copywriter
  expect(limit('web-designer', 'Write', '/site/contrast.js')).toBeUndefined()
  expect(String(limit('copywriter', 'Edit', '/site/build.sh'))).toContain('Role limit: copywriter does not write scripts, build or config files')
  expect(limit('copywriter', 'Edit', '/site/copy.json')).toBeUndefined()
  // can-deploy moved from devops-engineer to backend-developer
  expect(limit('backend-developer', 'Bash', '', 'npx wrangler deploy')).toBeUndefined()
  expect(limit('backend-developer', 'Bash', '', 'git push --force-with-lease')).toBeUndefined()
  expect(String(limit('devops-engineer', 'Bash', '', 'npx wrangler deploy'))).toContain('only backend-developer deploys')
  expect(String(limit('devops-engineer', 'Bash', '', 'git push --force-with-lease'))).toContain('Rewriting git history')
  expect(String(limit('', 'Bash', '', 'vercel --prod'))).toContain('Assign the deploy to chief-of-staff:backend-developer')
  // plain force push and filter tools stay refused for a can-deploy role
  expect(String(limit('backend-developer', 'Bash', '', 'git push --force'))).toContain('Rewriting git history')
  // a typo in write-limit is read as the tightest limit, and said
  const typo = teamOf(withAgent('frontend-developer', edited('frontend-developer', { 'write-limit': 'no-script' })))
  expect(typo.problems.join()).toContain('unknown write-limit "no-script"; treated as md-only')
  expect(String(limitIn('frontend-developer', 'Write', '/a.ts', '', typo))).toContain('writes only .md')
  // with no can-deploy role at all, nobody deploys
  expect(String(limitIn('', 'Bash', '', 'wrangler deploy', teamOf(withAgent('devops-engineer', edited('devops-engineer', { 'can-deploy': undefined }))))))
    .toContain('no role on the team may deploy')
})

test('confirm gate: which MCP tools send, post, publish, delete or pay', () => {
  const sends = [
    'mcp__Gmail__send_message', 'mcp__Gmail__reply', 'mcp__Gmail__forward', 'mcp__Gmail__trash_message', 'mcp__Gmail__trash_thread',
    'mcp__Slack__slack_send_message', 'mcp__Slack__slack_schedule_message', 'mcp__Slack__slack_add_reaction',
    'mcp__Taplio__publish_draft', 'mcp__Taplio__schedule_draft', 'mcp__Taplio__commit_comment_draft', 'mcp__Taplio__like_post',
    'mcp__Taplio__send_connection_request', 'mcp__Taplio__delete_draft', 'mcp__Canva__comment-on-design', 'mcp__Canva__reply-to-comment',
    'mcp__Google_Calendar__delete_event', 'mcp__Google_Calendar__respond_to_event', 'mcp__Higgsfield__publish_website',
    'mcp__github__create_comment', 'mcp__x__create_post', 'mcp__x__post', 'mcp__stripe__create_payment', 'mcp__bank__transfer_funds',
    'mcp__mail__sendEmail', 'mcp__Claude_Docs__delete', 'mcp__x__delete_list', 'mcp__x__send_list_digest', 'mcp__shop__purchase_item', 'mcp__social__retweet',
  ]
  const passes = [
    'mcp__Gmail__search_threads', 'mcp__Gmail__get_message', 'mcp__Gmail__create_draft', 'mcp__Gmail__update_draft', 'mcp__Gmail__list_drafts',
    'mcp__Gmail__untrash_message', 'mcp__Gmail__label_message', 'mcp__Slack__slack_read_channel', 'mcp__Slack__slack_search_public',
    'mcp__Slack__slack_send_message_draft', 'mcp__Slack__slack_get_reactions', 'mcp__Taplio__create_comment_draft', 'mcp__Taplio__update_comment_draft',
    'mcp__Taplio__list_posts', 'mcp__Taplio__get_post', 'mcp__Taplio__get_post_like', 'mcp__Taplio__find_posts_to_comment',
    'mcp__Taplio__find_comments_to_reply', 'mcp__Taplio__list_comments', 'mcp__Taplio__cancel_like', 'mcp__Taplio__unschedule',
    'mcp__Taplio__create_draft', 'mcp__Canva__list-comments', 'mcp__Higgsfield__tiktok_publish_status', 'mcp__Higgsfield__tiktok_prepare_publish',
    'mcp__Google_Calendar__list_events', 'mcp__scrapling__make_request', 'mcp__scrapling__browser_fetch', 'mcp__x__sender_info',
    'mcp__x__postgres_query', 'mcp__x__likely_matches', 'mcp__x__payload_preview', 'mcp__Canva__remove-background',
    'Bash', 'WebFetch', 'Write',
  ]
  for (const t of sends) expect(`${t} ${sendsForPerson(t)}`).toBe(`${t} true`)
  for (const t of passes) expect(`${t} ${sendsForPerson(t)}`).toBe(`${t} false`)
  expect(toolWords('mcp__plugin_x_y__sendMessageNow')).toBe('send_message_now')
  expect(toolWords('mcp__Canva__comment-on-design')).toBe('comment_on_design')
})

test('confirm gate in the hook: an agent is stopped, the Chief of Staff is not', async ($, on) => {
  serve(on)
  const kept = memoryStore(on)
  on('agent.list', () => ({ value: [{ id: 'm1', type: 'chief-of-staff:devops-engineer', description: '', status: 'running' } as never] }))
  on('tool.check', () => ({ decision: 'allow' }))
  // nobody to ask (as here): refused with the message
  const agent = await $.tool.check({ tool: 'mcp__Gmail__send_message', input: {}, agentId: 'm1' } as never)
  expect(agent.decision).toBe('deny')
  expect(String(agent.reason)).toContain(CONFIRM)
  expect(String(agent.reason)).toContain('devops-engineer wants to run mcp__Gmail__send_message')
  expect(String(agent.reason)).toContain("devops-engineer needs the person's OK for: deploy to production; change DNS; delete resources")
  // reading is fine, and the main session is never gated
  expect((await $.tool.check({ tool: 'mcp__Gmail__search_threads', input: {}, agentId: 'm1' } as never)).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__Gmail__send_message', input: {} } as never)).decision).toBe('allow')
  // /delegate off lifts it
  kept.set('delegate', false)
  expect((await $.tool.check({ tool: 'mcp__Gmail__send_message', input: {}, agentId: 'm1' } as never)).decision).toBe('allow')
})

test('confirm gate: with a person to ask, it asks instead of refusing', async ($, on) => {
  serve(on)
  on('tool.check', () => ({ decision: 'allow' }))
  const r = await $.tool.check({ tool: 'mcp__Slack__slack_send_message', input: {}, agentId: 'a1', approver: 'person' } as never)
  // `approver: 'person'`: the engine shows the person the dialog with this reason
  expect(r.decision).toBe('ask')
  expect(String(r.reason)).toContain(CONFIRM)
  expect(String(r.reason)).toContain('A subagent wants to run mcp__Slack__slack_send_message')
})

test('an agent file with a bad or missing department goes under Other; nothing crashes', async ($, on) => {
  let files = withAgent('qa-tester', edited('qa-tester', { department: 'quality' }))
  files = withAgent('copywriter', edited('copywriter', { department: undefined }), files)
  files = withAgent('broken', '---\nthis is: [not, closed\n---\n', files) // no name: skipped
  files = withAgent('odd', 'no frontmatter at all', files)
  files = withAgent('fresh', '---\nname: fresh\ndescription: A new role. It does things.\n---\nbody', files)
  serve(on, files)
  const kept = memoryStore(on)
  on('prompt.compose', () => BASE)
  on('command.register', () => ({ value: { command: 'team' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const text = await promptOf($)
  const other = text.indexOf('Other (')
  expect(other > text.indexOf('Marketing & PR (')).toBe(true)
  expect(text.indexOf('- chief-of-staff:qa-tester: testing, automated tests, bug reports') > other).toBe(true)
  expect(text.indexOf('- chief-of-staff:copywriter: every word on the site') > other).toBe(true)
  expect(text).toContain('- chief-of-staff:fresh: A new role') // no does: the description's first sentence
  const shown = JSON.stringify(await $.command.run({ command: 'team', args: '' } as never))
  expect(shown).toContain('Other (other): always on. copywriter, fresh, qa-tester')
  expect(shown).toContain('qa-tester.md: unknown department \\"quality\\"; listed under Other')
  expect(shown).toContain('copywriter.md: no department; listed under Other')
  expect(shown).toContain('broken.md: no valid name')
  // /team off all leaves Other on
  await $.command.run({ command: 'team', args: 'off all' } as never)
  expect((await promptOf($)).includes('- chief-of-staff:qa-tester')).toBe(true)
  expect(kept.get('departments')).toBeDefined()
})

test('a broken departments.json or no readable files still gives a working prompt', async ($, on) => {
  const broken = teamOf({ ...FILES, 'departments.json': '{ nope' })
  expect(broken.problems[0]).toBe('departments.json is not valid JSON')
  expect(broken.agents.every(a => a.department === 'other')).toBe(true)
  expect(chiefPrompt(broken, enabledIds(broken, {}))).toContain('Other (')
  // no file system answer at all (no serve): the core text is still there
  on('prompt.compose', () => BASE)
  const text = await promptOf($)
  expect(text).toContain('# You are the Chief of Staff')
  expect(text).toContain('no agents could be loaded')
  expect(text).toContain('How to run the work:')
})
