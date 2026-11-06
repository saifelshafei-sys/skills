import { expect, test } from 'claude-code/testing'

import { roleLimit } from '../hooks/register'

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
