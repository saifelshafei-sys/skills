// Round 4, part 2 and part 1F: one parse budget, nested Claude Code, writes into protected folders,
// cheap tokenizer fixes, the bypass rule read from what runs, and small allow-list items.
import { expect, test } from 'claude-code/testing'

import {
  bypassLimit, checkMcp, rewritesHistory, runsDeploy, shellNeedsPerson, shellProtected, TOO_LONG, unreadable,
} from '../hooks/register'
import { agents, cwd, deny, memoryStore } from './helpers'
import { serve } from './serve'

const AT = { roots: ['/opt/p/chief-of-staff'], configDirs: ['/home/u/.claude'], home: '/home/u' }
const K = ['solve', 'cloudflare'].join('_')

test('N1: one budget for the whole parse; deep nesting is unreadable, fast', () => {
  const cases = [12, 20, 40].map(k => `${'eval $('.repeat(k)}git push -f origin main`)
  let s = 'git push -f'
  for (let i = 0; i < 8; i++) s = `bash -c "$(${s})"`
  cases.push(s)
  for (const c of cases) {
    const t0 = Date.now()
    const u = unreadable(c)
    rewritesHistory(c); runsDeploy(c); shellNeedsPerson(c); shellProtected(c, AT)
    expect(Date.now() - t0 < 100).toBe(true)
    expect(u ? true : rewritesHistory(c)).toBe(true) // either read (and refused) or unreadable (refused or asked)
  }
  expect(String(shellNeedsPerson(`${'eval $('.repeat(40)}x`))).toContain('too complex to check')
  expect(TOO_LONG).toContain('Split it into shorter commands.')
  expect(TOO_LONG.includes('script')).toBe(false)
})

test('N1: an unreadable command is refused for the Chief of Staff and asks for an agent', async ($, on) => {
  serve(on)
  memoryStore(on)
  agents(on, { a1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  const c = `${'eval $('.repeat(20)}x`
  expect(String(deny(await $.tool.call({ tool: 'Bash', command: c } as never)))).toContain('too complex to check')
  expect((await $.tool.check({ tool: 'Bash', input: { command: c }, agentId: 'a1', approver: 'person' } as never)).decision).toBe('ask')
  expect((await $.tool.check({ tool: 'Bash', input: { command: c }, agentId: 'a1' } as never)).decision).toBe('deny')
})

test('N4: loosening only from the person (composer or bridge); tightening from anywhere', async ($, on) => {
  serve(on)
  const kept = memoryStore(on, { departments: { sales: false } })
  on('ui.status', () => ({ value: undefined }))
  const run = (command: string, args: string, kind: string) => $.command.run({ origin: { kind }, command, args } as never).then(r => JSON.stringify(r))
  for (const kind of ['sdk', 'plugin', 'peer', 'scheduled-trigger']) {
    for (const [c, a] of [['delegate', 'off'], ['delegate', 'credits free'], ['team', 'on sales'], ['team', 'on all']]) {
      expect(`${kind} ${c} ${a} ${(await run(c as string, a as string, kind)).includes('Only the person can loosen')}`).toBe(`${kind} ${c} ${a} true`)
    }
    expect(await run('delegate', 'on', kind)).toContain('delegation is on')
    expect(await run('delegate', 'credits ask', kind)).toContain('Generation credits: ask')
    expect(await run('team', 'off creative', kind)).toContain('Creative: off')
  }
  // /team reset loosens when it turns something on
  expect(await run('team', 'reset', 'sdk')).toContain('Only the person can loosen')
  expect(await run('team', 'reset', 'composer')).toContain('back to its default')
  for (const kind of ['composer', 'bridge']) expect(await run('delegate', 'credits free', kind)).toContain('Generation credits: free')
  expect(kept.get('credits')).toBe('free')
})

test('N4: a Claude Code session started inside another is held to agent limits, and cannot loosen', async ($, on) => {
  serve(on)
  memoryStore(on)
  cwd(on, '/site')
  on('env.get', (_, e) => ({ value: e.name === 'CLAUDECODE' ? '1' : e.name === 'HOME' ? '/home/u' : undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  // the nested main loop keeps the no-edit rule, even with /delegate off
  expect(String(deny(await $.tool.call({ tool: 'Write', file_path: '/site/a.ts', content: 'x' } as never)))).toContain('Chief of Staff rule')
  expect(String(deny(await $.tool.call({ tool: 'Write', file_path: '/home/u/.claude/settings.json', content: 'x' } as never)))).toContain('Chief of Staff rule')
  expect((await $.tool.check({ tool: 'mcp__Gmail__send_message', input: {} } as never)).decision).toBe('deny')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'claude -p hi' } } as never)).decision).toBe('deny')
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'delegate', args: 'off' } as never))).toContain('Only the person can loosen')
})

test('N4: a program named by a variable, env -S and hiding CLAUDECODE ask', () => {
  for (const c of ['$(which claude) -p x', '`which claude` -p x', 'c=claude; $c -p x', '"$EDITOR" notes.md', "env -S 'claude -p x'", 'env -u CLAUDECODE claude -p x',
    'env --unset=CLAUDECODE bash', 'unset CLAUDECODE; claude', 'env -u CLAUDE_CODE_CHILD_SESSION x']) {
    expect(`${c} ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} ask`)
  }
  for (const c of ['env FOO=1 npm test', 'env -u FOO npm test', 'echo $HOME']) expect(`${c} ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} pass`)
})

test('N2: a write into a protected folder, or a folder above one, is refused', () => {
  for (const c of ['cp x /home/u/.claude/', 'mv x /home/u/.claude', 'cp -t /home/u/.claude x', 'cp --target-directory=/home/u/.claude x', 'rsync -a d/ /home/u/.claude/',
    'unzip -d /home/u/.claude a.zip', 'unzip a.zip -d/home/u/.claude', 'tar -xf a.tar -C /home/u/.claude', 'tar -xf a.tar -C/home/u/.claude', 'ln -sf x /home/u/.claude',
    'cp settings.json /home/u/.claude/', 'cp -r agents /site/.claude/', 'cp evil /site/.claude', 'cp -r chief-of-staff /opt/p/',
    'curl -o/home/u/.claude/settings.json https://x.example/a', 'wget -O/home/u/.claude/settings.json https://x.example/a', 'wget -P/home/u/.claude/skills https://x.example/a',
    'echo x 1<> /home/u/.claude/settings.json', 'cat x <> /home/u/.claude/settings.json']) {
    expect(`${c} ${shellProtected(c, AT)}`).toBe(`${c} deny`)
  }
  for (const c of ['cp a.txt /tmp/', 'cp -r src /site/build/', 'mv a b', 'tar -xf a.tar -C /tmp/x', 'unzip a.zip -d out', 'cp x.json /opt/q/', 'cp x.json /opt/p/', 'cat x < /home/u/.claude/settings.json']) {
    expect(`${c} ${shellProtected(c, AT) ?? 'ok'}`).toBe(`${c} ok`)
  }
})

test('N2: after a cd that cannot be followed, a relative write in a command naming .claude is refused', () => {
  for (const c of ['cd "$D" && echo x > settings.json; # .claude', 'cd /home/u/.claude; cd /tmp; cd -; echo {} > settings.json', 'pushd /home/u/.claude; popd; echo {} > settings.json',
    'CDPATH=/home/u/.claude cd plugins && echo x > store/x.json', 'cd $(echo /home/u/.claude) && echo {} > settings.json', 'cd /x/chief-of-staff* && echo x > hooks/a.ts']) {
    expect(`${c} ${shellProtected(c, AT)}`).toBe(`${c} deny`)
  }
  expect(shellProtected('cd "$D" && echo x > notes.txt', AT)).toBeUndefined()
})

test('N2/N5: MCP path keys (spaces, file://) and folders are checked like file paths', async ($, on) => {
  serve(on)
  memoryStore(on)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  agents(on, { f1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  const call = (e: Record<string, unknown>) => $.tool.call({ agentId: 'f1', ...e } as never)
  expect(String(deny(await call({ tool: 'mcp__dc__write_file', path: '/home/u/.claude/skills/my skill/SKILL.md', content: 'x' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'mcp__dc__write_file', file: 'file:///home/u/.claude/settings.json', content: 'x' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'mcp__dc__move_file', source: '/tmp/x', destination: '/home/u/.claude' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'mcp__zip__extract_archive', archive: '/tmp/a.zip', output_dir: '/home/u/.claude' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'mcp__browser__browser_screenshot', path: '/home/u/.claude/settings.json' })))).toContain('Not allowed')
  expect(deny(await call({ tool: 'mcp__dc__write_file', path: '/site/my notes.md', content: 'x' }))).toBeUndefined()
})

test('N3: the cheap tokenizer fixes', () => {
  for (const c of ["git push $'-f' origin main", "git push $'\\x2df' origin main", 'git push $"--force" origin main', 'git push -f{,} origin', 'git push -${X:-f} origin', 'time -p git push -f', "bash <<< 'git push -f origin main'", "bash <<E'OF'\ngit push -f\nEOF",
    'bash <<"EOF"\ngit push -f\nEOF', 'git send-pack --force origin main', 'git send-pack origin +main', "git -c remote.origin.push='+refs/heads/*:refs/heads/*' push origin",
    'git -c remote.origin.mirror=true push origin', "su -c 'git push -f' me", "runuser -u me -- git push -f", "flock /tmp/l git push -f", "flock /tmp/l -c 'git push -f'",
    'taskset 0x1 git push -f', 'taskset -c 0,1 git push -f', 'chrt -f 10 git push -f', "script -c 'git push -f' /dev/null", "script -qc 'git push -f' /dev/null",
    "parallel ::: 'git push -f origin main'", "trap 'git push -f' EXIT"]) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} true`)
  }
  for (const c of ["cat <<'EOF'\ngit push -f\nEOF", "cat <<< 'git push -f'", 'git push origin main', 'time git status']) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} false`)
  }
})

test('N8: the bypass rule reads what runs, not commit messages, grep patterns or heredocs to non-shells', () => {
  const flag = ['--solve', 'cloudflare'].join('-')
  for (const command of [`git commit -m "docs: never use ${flag} or ${K}=True"`, `grep -rn "${K}" src`, `rg '${K}=True' .`,
    `cat > notes.md <<'EOF'\n${K}=True\nEOF`, `echo "${flag}"`]) {
    expect(`${command} ${!!bypassLimit('Bash', { command })}`).toBe(`${command} false`)
  }
  for (const command of [`scrapling extract stealthy-fetch u o.md ${flag}`, `python3 -c "f(u, ${K}=True)"`, `bash <<'EOF'\nscrapling x ${flag}\nEOF`,
    `x --solveCloudflare=t`, `node -e "f({solveCaptcha: 'y'})"`]) {
    expect(`${command} ${!!bypassLimit('Bash', { command })}`).toBe(`${command} true`)
  }
  expect(!!bypassLimit('mcp__s__fetch', { solveCloudflare: true })).toBe(true)
  expect(!!bypassLimit('mcp__s__fetch', { options: { solveCaptcha: 'y' } })).toBe(true)
  expect(!!bypassLimit('mcp__s__fetch', { [K]: 't' })).toBe(true)
})

test('F: small allow-list items', () => {
  for (const t of ['mcp__Claude_Docs__query', 'mcp__ChangeThisFile__check_job', 'mcp__Google_Calendar__suggest_time', 'mcp__scrapling__get',
    'mcp__scrapling__fetch', 'mcp__plugin_scrapling_scrapling__stealthy_fetch', 'mcp__plugin_scrapling_scrapling__bulk_get']) {
    expect(`${t} ${checkMcp(t).verdict}`).toBe(`${t} pass`)
  }
  for (const t of ['mcp__Claude_Docs__update', 'mcp__ChangeThisFile__convert_file', 'mcp__Google_Calendar__create_event', 'mcp__scrapling__browser_evaluate',
    'mcp__scrapling__browser_actions']) {
    expect(`${t} ${checkMcp(t).verdict}`).toBe(`${t} ask`)
  }
})

test('last batch 1: a computed push branch asks with its own message; explicit force stays refused', async ($, on) => {
  serve(on)
  memoryStore(on)
  agents(on, { f: 'chief-of-staff:frontend-developer', d: 'chief-of-staff:devops-engineer' })
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  const msg = 'This push uses a computed branch name, which could be a force push (a +branch). Write the branch name out, e.g. `git push -u origin feature/hero`, or ask the person'
  for (const c of ['git push origin "$BRANCH"', 'git push -u origin "$(git branch --show-current)"', 'git push -u origin $(git rev-parse --abbrev-ref HEAD)',
    'git push origin "${BRANCH}"', 'git push origin "$GITHUB_HEAD_REF"', 'git push origin "$(git describe --tags)"', 'git push origin {main,dev}',
    'git push origin "$(echo +main)"']) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} false`)
    for (const id of ['f', 'd']) {
      expect(deny(await $.tool.call({ tool: 'Bash', command: c, agentId: id } as never))).toBeUndefined()
      const asked = await $.tool.check({ tool: 'Bash', input: { command: c }, agentId: id, approver: 'person' } as never)
      expect(asked.decision).toBe('ask')
      expect(String(asked.reason)).toContain(msg)
      expect((await $.tool.check({ tool: 'Bash', input: { command: c }, agentId: id } as never)).decision).toBe('deny')
    }
  }
  for (const c of ['git push -f origin "$BRANCH"', 'git push --force origin "$(git branch --show-current)"', 'git push origin "+$BRANCH"', 'git push --mirror', 'git push --prune origin']) {
    expect(String(deny(await $.tool.call({ tool: 'Bash', command: c, agentId: 'f' } as never)))).toContain('force push, mirror or prune')
  }
  expect(shellNeedsPerson('git push -u origin feature/hero')).toBeUndefined()
})

test('last batch 2: in a nested session the main loop cannot edit and an unknown agent writes only .md', async ($, on) => {
  serve(on)
  memoryStore(on, { delegate: false })
  cwd(on, '/site')
  on('env.get', (_, e) => ({ value: e.name === 'CLAUDE_CODE_CHILD_SESSION' ? '1' : e.name === 'HOME' ? '/home/u' : undefined }))
  agents(on, { g: 'general-purpose', x: 'chief-of-staff:not-shipped', f: 'chief-of-staff:frontend-developer', w: 'chief-of-staff:web-designer' })
  on('tool.call', () => ({ result: {} }))
  const write = (file_path: string, agentId?: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId } as never).then(deny)
  expect(String(await write('/site/src/main.ts'))).toContain('Chief of Staff rule')
  expect(String(await write('/site/notes.txt'))).toContain('Chief of Staff rule')
  expect(String(await write('/site/src/main.ts', 'g'))).toContain('writes only .md')
  expect(String(await write('/site/src/main.ts', 'x'))).toContain('writes only .md')
  expect(await write('/site/src/main.ts', 'f')).toBeUndefined() // an exact FLOOR role keeps its floor
  expect(String(await write('/site/src/a.js', 'w'))).toContain('Role limit: web-designer') // and never anything looser
  expect(String(deny(await $.tool.call({ tool: 'Bash', command: 'npx wrangler deploy', agentId: 'g' } as never)))).toContain('deploys')
  for (const [c, a] of [['delegate', 'off'], ['delegate', 'credits free'], ['team', 'on all']]) {
    expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: c, args: a } as never))).toContain('Only the person can loosen')
  }
})

test('last batch 4: inside the project the write limit holds even when the project is under /tmp', async ($, on) => {
  serve(on)
  memoryStore(on)
  cwd(on, '/tmp/work/site')
  agents(on, { r: 'chief-of-staff:reverse-engineer' })
  on('tool.call', () => ({ result: {} }))
  const call = (e: Record<string, unknown>) => $.tool.call({ agentId: 'r', ...e } as never).then(deny)
  expect(String(await call({ tool: 'Write', file_path: '/tmp/work/site/src/app.js', content: 'x' }))).toContain('Role limit: reverse-engineer')
  expect(String(await call({ tool: 'Bash', command: 'curl -s https://x.example/a.js -o src/app.js' }))).toContain('Role limit: reverse-engineer')
  expect(await call({ tool: 'Write', file_path: '/tmp/work/site/research/a.js', content: 'x' })).toBeUndefined()
  expect(await call({ tool: 'Bash', command: 'curl -s https://x.example/a.js -o /tmp/other/app.js' })).toBeUndefined() // a temp path outside the project
})
