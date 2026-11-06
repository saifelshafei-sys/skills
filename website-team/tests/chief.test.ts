import { expect, test } from 'claude-code/testing'

const IN = (tools: string[]) => ({ model: 'm', promptModel: 'm', surfaces: [], tools, outputStyle: null, traits: [] })
const BASE = { sections: [{ id: 'intro', text: 'engine intro', scope: 'shared' as const }] }

test('the main session gets the Chief of Staff section', async ($, on) => {
  on('prompt.compose', () => BASE)
  const out = await $.prompt.compose(IN(['Agent', 'Read']))
  const chief = out.sections.find(s => s.id === 'website-team:chief-of-staff')
  expect(chief?.scope).toBe('session')
  expect(chief?.text.includes('website-team:web-designer')).toBe(true)
  expect(out.sections[0]?.id).toBe('intro')
})

test('an agent without the Agent tool is not told to delegate', async ($, on) => {
  on('prompt.compose', () => BASE)
  const out = await $.prompt.compose(IN(['Read', 'Edit']))
  expect(out.sections.some(s => s.id === 'website-team:chief-of-staff')).toBe(false)
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
  expect(before.sections.some(s => s.id === 'website-team:chief-of-staff')).toBe(true)
  const said = await $.command.run({ command: 'delegate', args: 'off' } as never)
  expect(JSON.stringify(said).includes('is off')).toBe(true)
  const out = await $.prompt.compose(IN(['Agent']))
  expect(out.sections.some(s => s.id === 'website-team:chief-of-staff')).toBe(false)
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
  expect(out.sections.some(s => s.id === 'website-team:chief-of-staff')).toBe(true)
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
