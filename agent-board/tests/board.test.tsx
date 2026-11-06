import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'agent-board',
  component: 'Pane',
  requestId: 'agent-board',
  props: {
    title: 'Agent board',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

test('a spawned agent shows its role, task, current step and what it built', async ($, on) => {
  on('command.register', () => ({ value: { command: 'board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.spawn', () => ({ agentId: 'a1', model: 'x' }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.agent.spawn({ prompt: 'Build the hero section', description: 'Design the homepage', subagentType: 'web-designer', name: 'web-designer' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/site/hero.tsx', content: 'x', agentId: 'a1' } as never)
  await $.tool.call({ tool: 'Bash', command: 'npm run build', description: 'Build the site', agentId: 'a1' } as never)

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /Chief of Staff/ }))?.text).toBe('Chief of Staff')
    expect((await ui.find({ type: 'Text', text: /^web-designer$/ }))?.text).toBe('web-designer')
    expect((await ui.find({ type: 'Text', text: /^Task:/ }))?.text).toBe('Task: Design the homepage')
    expect((await ui.find({ type: 'Text', text: /^Now: Running/ }))?.text).toBe('Now: Running: Build the site')
    expect((await ui.find({ type: 'Text', text: /^Built:/ }))?.text).toBe('Built: hero.tsx')
    await ui.unmount()
  }
})

test('an empty board says so', async ($) => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /team list fills in/ }))).toBeTruthy()
  await ui.unmount()
})
