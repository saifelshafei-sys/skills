import { expect, test } from 'claude-code/testing'

import { bypassLimit, HISTORY_REWRITE, roleLimit, runsCommand, runsDeploy } from '../hooks/register'

const IN = (tools: string[]) => ({ model: 'm', promptModel: 'm', surfaces: [], tools, outputStyle: null, traits: [] })
const BASE = { sections: [{ id: 'intro', text: 'engine intro', scope: 'shared' as const }] }

test('the main session gets the Chief of Staff section', async ($, on) => {
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
  on('agent.list', () => ({ value: [{ id: 's1', type: 'chief-of-staff:security-engineer', description: '', status: 'running' }] }))
  on('tool.call', () => ({ result: {} }))
  const push = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main', agentId: 's1' } as never)
  expect(String((push as { deny?: string }).deny)).toContain("Rewriting git history is the person's call")
  const scan = await $.tool.call({ tool: 'Bash', command: 'git log -p | grep -i api_key', agentId: 's1' } as never)
  expect((scan as { deny?: string }).deny).toBeUndefined()
  const fix = await $.tool.call({ tool: 'Edit', file_path: '/site/server.ts', old_string: 'a', new_string: 'b', agentId: 's1' } as never)
  expect((fix as { deny?: string }).deny).toBeUndefined()
})

test('a web-designer agent is refused a .js file; a frontend-developer is not', async ($, on) => {
  on('agent.list', () => ({ value: [
    { id: 'd1', type: 'chief-of-staff:web-designer', description: '', status: 'running' },
    { id: 'f1', type: 'chief-of-staff:frontend-developer', description: '', status: 'running' },
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
