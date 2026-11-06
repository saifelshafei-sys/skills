import { expect, test } from 'claude-code/testing'

import { clashes, department, label } from '../hooks/register'

const PANE = {
  plugin: 'agent-board',
  component: 'Pane',
  requestId: 'agent-board',
  props: {
    title: 'Agent board',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 80 },
    view: {},
  },
} as const

test('the agent types this account has land in sensible departments', () => {
  const want: Record<string, string> = {
    'agent-protocols:accessibility-specialist': 'Design & UX',
    'agent-protocols:code-reviewer': 'Quality & testing',
    'agent-protocols:documentation-specialist': 'Docs & writing',
    'agent-protocols:performance-engineer': 'Engineering',
    'agent-protocols:release-engineer': 'Release & operations',
    'agent-protocols:security-auditor': 'Security',
    'agent-protocols:spec-analyst': 'Planning & research',
    'agent-protocols:test-engineer': 'Quality & testing',
    'claude-security:claude-security': 'Security',
    'claude-security:patch-generator': 'Engineering',
    'claude-security:scan-verifier': 'Security',
    'render:render-assistant': 'Release & operations',
    Explore: 'Planning & research',
    Plan: 'Planning & research',
    'general-purpose': 'Generalists',
    'claude-code-guide': 'Generalists',
    'statusline-setup': 'Generalists',
    'web-designer': 'Design & UX',
    coder: 'Engineering',
    'seo-writer': 'Marketing & growth',
    'impeccable:impeccable-manual-edit-applier': 'Engineering',
    'understand-anything:project-scanner': 'Planning & research',
    'impeccable:impeccable-asset-producer': 'Design & UX',
    'understand-anything:tour-builder': 'Docs & writing',
  }
  for (const [type, dept] of Object.entries(want)) expect(`${type} → ${department(type)}`).toBe(`${type} → ${dept}`)
  expect(department('zeta', 'Reviews pull requests')).toBe('Quality & testing')
  expect(department('zeta', 'nothing matches')).toBe('Other')
})

test('idle agents are listed by department; a working one becomes a card', async ($, on) => {
  on('command.register', () => ({ value: { command: 'board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('clock.every', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('agent.offer', () => ({ isOffered: true }))
  on('agent.spawn', () => ({ agentId: 'a1', model: 'x' }))
  on('tool.call', () => ({ result: {} }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const agent of ['agent-protocols:security-auditor', 'agent-protocols:code-reviewer', 'agent-protocols:test-engineer']) {
    await $.agent.offer({ agent, description: '', source: 'plugin', provider: { plugin: 'x', tier: 'user' } } as never)
  }
  await $.agent.spawn({ prompt: 'p', description: 'Audit the login form', subagentType: 'agent-protocols:security-auditor' } as never)
  await $.tool.call({ tool: 'Read', file_path: '/site/login.tsx', agentId: 'a1' } as never)

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await ui.find({ type: 'Text', text: /^Team:/ }))?.text).toBe('Team: 3 agents · 1 working · 0 done')
  expect((await ui.find({ type: 'Text', text: /^Security$/ }))?.text).toBe('Security')
  expect((await ui.find({ type: 'Text', text: /^Quality & testing$/ }))?.text).toBe('Quality & testing')
  expect((await ui.find({ type: 'Text', text: /code-reviewer/ }))?.text).toBe('○ code-reviewer')
  expect((await ui.find({ type: 'Text', text: /^security-auditor$/ }))?.text).toBe('security-auditor')
  expect(await ui.find({ type: 'Text', text: /agent-protocols:/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /^Task:/ }))?.text).toBe('Task: Audit the login form')
  expect((await ui.find({ type: 'Text', text: /^Now:.*login/ }))?.text).toBe('Now: Reading login.tsx')
  await ui.unmount()
})

test('two agents with one short name show where each comes from', () => {
  const types = ['Explore', 'claude-security:explore', 'agent-protocols:code-reviewer']
  const clash = clashes(types)
  expect(label('Explore', clash)).toBe('Explore · built-in')
  expect(label('claude-security:explore', clash)).toBe('explore · claude-security')
  expect(label('agent-protocols:code-reviewer', clash)).toBe('code-reviewer')
})
