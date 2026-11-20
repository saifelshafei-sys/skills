// Round 3 blockers: no backtracking and a length cap, every command tool checked like Bash,
// protected paths resolved before they are compared.
import { expect, test } from 'claude-code/testing'

import {
  classify, destinations, MAX_COMMAND, normalize, parse, rewritesHistory, runsDeploy, shellNeedsPerson, shellWritesTo,
} from '../hooks/register'
import { agents, deny, memoryStore } from './helpers'
import { serve } from './serve'

test('blocker 1: git -c repeated cannot hide a force push, and nothing backtracks', () => {
  for (const n of [10, 20, 26, 40]) {
    const c = `git ${'-c '.repeat(n)}x; git push -f origin main`
    expect(`${n} ${rewritesHistory(c)}`).toBe(`${n} true`)
    expect(rewritesHistory(`git ${'-c -c '.repeat(n)}push -f origin main`)).toBe(true)
    expect(rewritesHistory(`git ${'-c a=b '.repeat(n)}push -f`)).toBe(true)
  }
  // every check answers fast on a long, hostile command
  const long = `git ${'-c '.repeat(70000)}x; git push -f`
  expect(long.length > 200 * 1024).toBe(true)
  const t0 = Date.now()
  for (const f of [rewritesHistory, runsDeploy, shellNeedsPerson, destinations]) f(long)
  for (const f of [rewritesHistory, runsDeploy, shellNeedsPerson, destinations]) f(`x ${"''".repeat(5000)} ${'"$('.repeat(2000)}`)
  for (const f of [rewritesHistory, runsDeploy, shellNeedsPerson]) f(`curl -d x ${'a.'.repeat(7000)}`)
  expect(Date.now() - t0 < 100).toBe(true)
  // over the cap: refused or asked, never read
  expect(rewritesHistory('x'.repeat(MAX_COMMAND + 1))).toBe(true)
  expect(String(shellNeedsPerson('x'.repeat(MAX_COMMAND + 1)))).toContain('too long to check')
})

test('blocker 1: the tokenizer reads quotes, escapes, substitutions and shells', () => {
  expect(parse('echo "a b" c\\ d \'e f\'')[0]?.words.map(w => w.text)).toEqual(['echo', 'a b', 'c d', 'e f'])
  for (const c of ['"git" push -f', "'git' push -f", '\\git push -f', 'g\\it push -f', 'timeout 9 git push -f', 'nice -n 5 git push -f', 'setsid git push -f',
    'stdbuf -o0 git push -f', 'ionice -c 3 git push -f', 'echo $(git push -f)', 'echo "$(git push -f)"', 'echo `git push -f`', 'bash -c "git push -f"',
    "sh -lc 'git push -f'", 'eval git push -f', 'bash <<EOF\ngit push -f\nEOF', 'find . -exec git push -f \\;', '(git push -f)', '{ git push -f; }',
    'git push origin $(git rev-parse HEAD~5):refs/heads/main --force', 'git push --prune origin', 'git -C . push -f', 'git --git-dir=.git push -f']) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} true`)
  }
  for (const c of ['echo "git push -f"', "cat <<'EOF' > notes.md\ngit push -f\nEOF", 'git commit -m "never git push -f"', 'grep -r "git push --force" docs/',
    '# git push -f', 'git push origin main', 'cat <<<"git push -f"']) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} false`)
  }
})

test('blocker 1: an agent command over 16 KB asks or is refused; the Chief of Staff\'s is refused', async ($, on) => {
  serve(on)
  memoryStore(on)
  agents(on, { a1: 'chief-of-staff:frontend-developer' })
  on('tool.check', () => ({ decision: 'allow' }))
  on('tool.call', () => ({ result: {} }))
  const long = `echo ${'a'.repeat(MAX_COMMAND)}`
  expect((await $.tool.check({ tool: 'Bash', input: { command: long }, agentId: 'a1' } as never)).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Bash', input: { command: long }, agentId: 'a1', approver: 'person' } as never)).decision).toBe('ask')
  expect(String(deny(await $.tool.call({ tool: 'Bash', command: long } as never)))).toContain('too long to check')
  const t0 = Date.now()
  await $.tool.call({ tool: 'Bash', command: `git ${'-c '.repeat(70000)}x; git push -f`, agentId: 'a1' } as never)
  expect(Date.now() - t0 < 100).toBe(true)
})

test('blocker 2: Monitor, PowerShell and any tool with a command are checked like Bash', async ($, on) => {
  serve(on)
  memoryStore(on)
  agents(on, { a1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  for (const tool of ['Monitor', 'PowerShell', 'SomeFutureShell']) {
    expect(String(deny(await $.tool.call({ tool, command: 'wrangler deploy; git push -f', description: 'x', agentId: 'a1' } as never)))).toContain('Rewriting git history')
    expect(String(deny(await $.tool.call({ tool, command: 'npx wrangler deploy', agentId: 'a1' } as never)))).toContain('only devops-engineer deploys')
    expect(String(deny(await $.tool.call({ tool, command: 'echo {} > ~/.claude/settings.json', agentId: 'a1' } as never)))).toContain('Not allowed')
    expect((await $.tool.check({ tool, input: { command: 'claude -p hi' }, agentId: 'a1' } as never)).decision).toBe('deny')
    expect((await $.tool.check({ tool, input: { command: 'claude -p hi' }, agentId: 'a1', approver: 'person' } as never)).decision).toBe('ask')
    expect(deny(await $.tool.call({ tool, command: 'npm test', agentId: 'a1' } as never))).toBeUndefined()
  }
  // the Chief of Staff too, for history rewrites and deploys
  expect(String(deny(await $.tool.call({ tool: 'Monitor', command: 'git push -f' } as never)))).toContain('Rewriting git history')
})

test('blocker 3: paths are normalised, ~ is expanded, and an unresolvable write is refused', async ($, on) => {
  const at = { roots: ['/opt/p/chief-of-staff'], configDirs: ['/home/u/.claude'], home: '/home/u' }
  expect(normalize('~/.claude/./settings.json', '/home/u')).toBe('/home/u/.claude/settings.json')
  expect(normalize('~/.claude/x/../plugins//store/s.json', '/home/u')).toBe('/home/u/.claude/plugins/store/s.json')
  expect(normalize('$HOME/.claude.json', '/home/u')).toBe('/home/u/.claude.json')
  expect(normalize('~/.claude/settings.json', undefined)).toBeUndefined()
  expect(normalize('C:\\Users\\u\\.claude\\settings.json', undefined)).toBe('C:/Users/u/.claude/settings.json')
  for (const p of ['~/.claude/./settings.json', '~/.claude/x/../plugins/store/s.json', '/opt/p/./chief-of-staff/hooks/register.ts', '/opt//p/chief-of-staff/agents/0.md']) {
    expect(`${p} ${classify(normalize(p, at.home) ?? '', at)}`).toBe(`${p} deny`)
  }

  serve(on, undefined, {}, ['/gone'])
  memoryStore(on)
  agents(on, { a1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  const write = (file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId: 'a1' } as never)
  expect(String(deny(await write('~/.claude/./settings.json')))).toContain('Not allowed: agents do not change')
  expect(String(deny(await write('~/.claude/x/../plugins/store/s.json')))).toContain('Not allowed: agents do not change')
  expect(String(deny(await write('/home/u/.claude.json')))).toContain('Not allowed: agents do not change')
  // a path under a folder that does not exist resolves through its nearest existing folder
  expect(deny(await write('/gone/a.ts'))).toBeUndefined()
  expect(String(deny(await write('~someone/x.ts')))).toContain('cannot be resolved')
  expect(deny(await write('/site/a.ts'))).toBeUndefined()
})

test('blocker 3: shell commands that write to protected places, any spelling; plain reads pass', () => {
  const R = '/opt/p/chief-of-staff'
  const sp = [R, '/home/u/.claude/plugins', '/home/u/.claude/settings', '.claude/plugins', '.claude/settings']
  for (const c of ['echo x > chief-of-staff/hooks/register.ts', 'cd chief-of-staff && echo x > agents/0.md', 'cat > ./chief-of-staff/departments.json </tmp/x',
    "cd ~/.claude && echo '{}' > plugins/store/x.json", "echo '{}' > ~/.claude/'plugins'/store/x.json", "p=plugins; echo '{}' > ~/.claude/$p/store/x.json",
    "echo '{}' > ~/.claude/plug*/store/x.json", "echo x > .claude/agents/devops-engineer.md", "echo x > .mcp.json", 'echo x > ~/.claude.json',
    'tar -xf /tmp/x.tar -C ~/.claude/plugins', 'git -C ~/.claude/plugins/marketplaces/m pull', 'jq . /tmp/x | dd of=/home/u/.claude/settings.json',
    "node -e \"require('fs').writeFileSync(process.env.HOME+'/.claude/plugins/store/x.json','x')\"", 'python3 script.py /home/u/.claude/settings.json',
    'perl -i -pe s/a/b/ /home/u/.claude/settings.json', 'ln -sf /tmp/x /home/u/.claude/settings.json']) {
    expect(`${c} ${shellWritesTo(c, sp)}`).toBe(`${c} true`)
  }
  for (const c of [`grep x ${R}/hooks/gate.ts > /tmp/out`, `cat ${R}/README.md`, 'cat ~/.claude/settings.json', 'ls ~/.claude/plugins', 'echo hi > /site/a.txt',
    `diff ${R}/a ${R}/b > /tmp/d.txt`]) {
    expect(`${c} ${shellWritesTo(c, sp)}`).toBe(`${c} false`)
  }
})
