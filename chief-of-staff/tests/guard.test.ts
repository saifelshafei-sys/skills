// 0.10 rework: the guardrails fail closed. Confirm gate (allow-list), floor, protected paths,
// /delegate off, shell routes, regex gaps.
import { expect, test } from 'claude-code/testing'

import {
  checkMcp, CONFIRM, FORCE_PUSH, HISTORY_REWRITE, isProtectedPath, rewritesHistory, roleLimit, runsCommand, runsDeploy,
  sendsForPerson, shellNeedsPerson, shellWritesTo, toolWords,
} from '../hooks/register'
import { MADE_UP, MUST_GATE, MUST_PASS, NOW_ASK, REAL_ASK, REAL_PASS } from './gate-names'
import { agents, deny, memoryStore, TEAM } from './helpers'
import { serve } from './serve'

const verdict = (t: string, isReadOnly = false, free = true) => `${t} ${checkMcp(t, isReadOnly, free).verdict}`

test('confirm gate: QA and security tables', () => {
  for (const t of [...MUST_GATE, ...NOW_ASK, ...REAL_ASK, ...MADE_UP]) expect(verdict(t)).toBe(`${t} ask`)
  for (const t of [...MUST_PASS, ...REAL_PASS]) expect(verdict(t)).toBe(`${t} pass`)
  expect(MUST_GATE.length + NOW_ASK.length + REAL_ASK.length + MADE_UP.length + MUST_PASS.length + REAL_PASS.length > 300).toBe(true)
})

test('confirm gate: allow-list rules', () => {
  // an action first, a conjunction, or an undo: asks
  for (const t of ['mcp__x__post_status', 'mcp__x__get_and_send', 'mcp__x__unsubscribe', 'mcp__x__undo_send', 'mcp__x__send_draft',
    'mcp__x__schedule_status', 'mcp__x__publish_preview', 'mcp__x__delete_history', 'mcp__x__list_and_delete', 'mcp__x__view_and_delete']) {
    expect(verdict(t)).toBe(`${t} ask`)
  }
  // drafts: create and update only, plus Slack's send_message_draft
  for (const t of ['mcp__Gmail__create_draft', 'mcp__Taplio__create_comment_draft', 'mcp__Gmail__update_draft', 'mcp__Slack__slack_send_message_draft']) {
    expect(verdict(t)).toBe(`${t} pass`)
  }
  for (const t of ['mcp__x__send_draft', 'mcp__x__publish_draft', 'mcp__x__schedule_draft', 'mcp__x__commit_comment_draft', 'mcp__x__delete_draft',
    'mcp__x__post_draft', 'mcp__x__reply_draft', 'mcp__x__forward_draft', 'mcp__x__submit_draft', 'mcp__x__create_draft_and_send']) {
    expect(verdict(t)).toBe(`${t} ask`)
  }
  // names with no separators
  for (const t of ['mcp__x__sendmessage', 'mcp__x__SMSSend', 'mcp__x__SENDEMAIL', 'mcp__x__emailsend', 'mcp__x__xpost', 'mcp__x__autopay',
    'mcp__x__forcepush', 'mcp__x__autodeploy', 'mcp__x__refundall', 'mcp__x__chargecard', 'mcp__x__automerge', 'mcp__x__bulkdelete']) {
    expect(verdict(t)).toBe(`${t} ask`)
  }
  // meta-tools that run other tools or code: always ask, even when the engine says read-only
  for (const t of ['mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL', 'mcp__Composio__COMPOSIO_PROXY_EXECUTE', 'mcp__Higgsfield__apps_invoke',
    'mcp__Higgsfield__execute_preset', 'mcp__Higgsfield__sandbox_exec', 'mcp__plugin_desktop-commander_desktop-commander__start_process',
    'mcp__plugin_desktop-commander_desktop-commander__interact_with_process', 'mcp__plugin_browser-use_browser-use__browser_exec',
    'mcp__Higgsfield__scene_builder_3d_run_python', 'mcp__Composio__COMPOSIO_REMOTE_BASH_TOOL']) {
    expect(verdict(t, true)).toBe(`${t} ask`)
  }
  // the engine's read-only word passes an unknown name, never a sending one
  expect(verdict('mcp__x__frobnicate_widgets', true)).toBe('mcp__x__frobnicate_widgets pass')
  expect(verdict('mcp__x__frobnicate_widgets')).toBe('mcp__x__frobnicate_widgets ask')
  expect(verdict('mcp__x__send_message', true)).toBe('mcp__x__send_message ask')
  expect(verdict('mcp__x__sendmessage', true)).toBe('mcp__x__sendmessage ask')
  // reads pass, the server's own name dropped
  for (const t of ['mcp__Slack__slack_read_channel', 'mcp__Gmail__search_threads', 'mcp__Taplio__get_post', 'mcp__Booking_com__accommodations_search',
    'mcp__scrapling__browser_fetch', 'mcp__scrapling__browser_fetch_once', 'mcp__scrapling__browser_extract', 'mcp__Canva__list-comments']) {
    expect(verdict(t)).toBe(`${t} pass`)
  }
  expect(toolWords('mcp__Slack__slack_send_message')).toBe('send_message')
  expect(toolWords('mcp__x__SMSSend')).toBe('sms_send')
  expect(sendsForPerson('Bash')).toBe(false)
})

const GENERATES = ['mcp__Higgsfield__generate_image', 'mcp__Higgsfield__generate_video', 'mcp__Higgsfield__generate_audio', 'mcp__Higgsfield__generate_3d',
  'mcp__Higgsfield__generate_image_batch', 'mcp__Higgsfield__create_voice', 'mcp__Higgsfield__create_voice_from_confirmed_audio',
  'mcp__Higgsfield__upscale_image', 'mcp__Higgsfield__upscale_video', 'mcp__Higgsfield__remove_background', 'mcp__Higgsfield__outpaint_image',
  'mcp__Higgsfield__reframe', 'mcp__Higgsfield__voice_change', 'mcp__Higgsfield__separate_stems', 'mcp__Higgsfield__separate_image_layers',
  'mcp__Higgsfield__motion_control', 'mcp__Higgsfield__scene_builder_3d_generate_angles', 'mcp__Higgsfield__scene_builder_3d_generate_video',
  'mcp__Higgsfield__build_ai_influencer', 'mcp__Canva__create-design', 'mcp__Canva__create-video', 'mcp__Canva__create-design-from-brand-template',
  'mcp__Canva__create-design-from-candidate', 'mcp__Canva__resize-design', 'mcp__Canva__generate-design', 'mcp__Canva__generate-design-structured',
  'mcp__Canva__generate-image', 'mcp__Canva__remove-background', 'mcp__x__generate_music', 'mcp__x__thumbnail_generate', 'mcp__x__generate_sound_effect']
const SPENDS_OR_SHARES = ['mcp__Higgsfield__gpu_rent', 'mcp__Higgsfield__gpu_job_start', 'mcp__Higgsfield__gpu_rental_exec', 'mcp__Higgsfield__gpu_rental_generate',
  'mcp__Higgsfield__gpu_generate', 'mcp__Higgsfield__publish_website', 'mcp__Higgsfield__share_project', 'mcp__Higgsfield__deploy_website',
  'mcp__Higgsfield__send_feedback', 'mcp__Higgsfield__meta_ads_write', 'mcp__Higgsfield__participate_in_contest', 'mcp__Higgsfield__tiktok_connect',
  'mcp__Higgsfield__meta_ads_connect', 'mcp__Higgsfield__website_secrets', 'mcp__Higgsfield__website_db', 'mcp__x__buy_credits', 'mcp__x__generate_and_publish',
  // round 3: only generate_<media>, <media>_generate and the named media tools are free
  'mcp__Higgsfield__ai_influencer_generate', 'mcp__Higgsfield__ads_studio_generate', 'mcp__ElevenLabs__text_to_speech', 'mcp__stripe__generate_invoice',
  'mcp__stripe__generate_payment_link', 'mcp__x__generate_api_key', 'mcp__x__generate_token', 'mcp__x__generate_and_email_report', 'mcp__x__generate_sms',
  'mcp__x__generate_pr', 'mcp__x__generate_commit', 'mcp__x__generate_release', 'mcp__x__generate_invite_link', 'mcp__x__generate_tweet', 'mcp__x__email_generate',
  'mcp__x__campaign_generate', 'mcp__x__upscale_and_email', 'mcp__x__generate_and_share', 'mcp__x__create_design_and_publish', 'mcp__x__generate_and_upload',
  'mcp__x__generate_and_save_to_drive', 'mcp__x__scene_builder_3d_generate_and_publish', 'mcp__x__create_design_from_x_and_send']

test('generation credits: free by default, ask when the person says so; spending, sharing and publishing always ask', () => {
  for (const t of GENERATES) {
    expect(verdict(t, false, true)).toBe(`${t} pass`)
    expect(verdict(t, false, false)).toBe(`${t} ask`)
  }
  for (const t of SPENDS_OR_SHARES) expect(verdict(t, false, true)).toBe(`${t} ask`)
})

test('confirm gate in the hook: asks a person, refuses with no person or a host; the Chief of Staff is not gated', async ($, on) => {
  serve(on)
  const kept = memoryStore(on)
  agents(on, { m1: 'chief-of-staff:devops-engineer' })
  on('tool.check', () => ({ decision: 'allow' }))
  const check = (tool: string, extra: Record<string, unknown> = {}) => $.tool.check({ tool, input: {}, agentId: 'm1', ...extra } as never)
  const none = await check('mcp__Gmail__send_message')
  expect(none.decision).toBe('deny')
  expect(String(none.reason)).toContain(CONFIRM)
  expect(String(none.reason)).toContain('devops-engineer wants to run mcp__Gmail__send_message')
  expect(String(none.reason)).toContain("devops-engineer needs the person's OK for: deploy to production; change DNS; delete resources")
  expect((await check('mcp__Gmail__send_message', { approver: 'person' })).decision).toBe('ask')
  expect((await check('mcp__Gmail__send_message', { approver: 'host' })).decision).toBe('deny')
  expect((await check('mcp__Gmail__search_threads')).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'mcp__Gmail__send_message', input: {} } as never)).decision).toBe('allow')
  // /delegate off does not lift it
  kept.set('delegate', false)
  expect((await check('mcp__Gmail__send_message', { approver: 'person' })).decision).toBe('ask')
  // credits
  expect((await check('mcp__Higgsfield__generate_image')).decision).toBe('allow')
  kept.set('credits', 'ask')
  expect((await check('mcp__Higgsfield__generate_image', { approver: 'person' })).decision).toBe('ask')
})

test('/delegate credits ask | free is stored and shown', async ($, on) => {
  const kept = memoryStore(on)
  on('command.register', () => ({ value: { command: 'delegate' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'delegate', args: '' } as never))).toContain('Generation credits: free')
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'delegate', args: 'credits ask' } as never))).toContain('Generation credits: ask')
  expect(kept.get('credits')).toBe('ask')
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'delegate', args: '' } as never))).toContain('Generation credits: ask')
  await $.command.run({ origin: { kind: 'composer' }, command: 'delegate', args: 'credits free' } as never)
  expect(kept.get('credits')).toBe('free')
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'delegate', args: 'credits maybe' } as never))).toContain('Use /delegate')
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'composer' }, command: 'delegate', args: 'off' } as never))).toContain('stay on')
})

test('shell commands an agent runs only with the person\'s OK', async ($, on) => {
  const asks = ['claude -p "do it"', 'npx claude', 'cd x && claude --dangerously-skip-permissions', 'gh pr merge 12 --squash', 'gh release create v1.0',
    'gh release delete v1', 'gh repo delete me/x --yes', 'gh repo edit --visibility public', 'gh workflow run deploy.yml', 'gh api -X POST repos/a/b/issues',
    'gh api repos/a/b/issues --method PATCH', 'gh api repos/a/b/issues -f title=x', 'gh api graphql -F query=@q.graphql', 'curl -X POST https://api.example.com/x',
    'curl -d a=b https://example.com', 'curl --data-binary @f https://example.com', 'curl -F file=@a.txt https://upload.example.com', 'curl -T a.txt https://x.example',
    'wget --post-data=a=b https://example.com', 'curl --json \'{"a":1}\' https://example.com', 'FOO=1 /usr/bin/curl -XDELETE https://example.com/x',
    'curl -X POST "$URL"']
  const passes = ['curl https://example.com', 'curl -sSL -o page.html https://example.com', 'curl -X POST http://localhost:3000/api', 'curl -d a=b http://127.0.0.1:8787/x',
    'wget https://example.com/a.zip', 'gh pr view 12', 'gh api repos/a/b', 'gh pr list', 'echo claude', 'git log', 'npm test', 'cat claude.md']
  for (const c of asks) expect(`${c} => ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} => ask`)
  for (const c of passes) expect(`${c} => ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} => pass`)

  serve(on)
  memoryStore(on)
  agents(on, { a1: 'chief-of-staff:backend-developer' })
  on('tool.check', () => ({ decision: 'allow' }))
  const bash = (command: string, extra: Record<string, unknown> = {}) => $.tool.check({ tool: 'Bash', input: { command }, agentId: 'a1', ...extra } as never)
  expect((await bash('claude -p hi')).decision).toBe('deny')
  expect((await bash('gh pr merge 1', { approver: 'person' })).decision).toBe('ask')
  expect((await bash('npm test')).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'claude -p hi' } } as never)).decision).toBe('allow') // the Chief of Staff
})

test('regex gaps: force push and deploy spellings', () => {
  // round 4: deleting a remote branch asks (shellNeedsPerson); overwriting it stays refused
  for (const c of ['git push --delete origin main', 'git push -d origin main', 'git push origin :main', 'git push origin ":main"']) {
    expect(`${c} ${rewritesHistory(c)} ${String(shellNeedsPerson(c))}`).toBe(`${c} false deletes a remote branch. Deleting a remote branch needs the person's OK`)
  }
  for (const c of ['git push --mirror', 'git push --prune origin', 'git push origin "+main"',
    "git push origin '+main'", 'git-filter-repo --path x', 'git push -fu origin main']) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} true`)
  }
  for (const c of ['git push origin main', 'git push -u origin feat', 'git push --follow-tags', 'git push origin main:main', 'git push origin HEAD:refs/heads/x',
    'echo "git push --mirror"', 'git push origin dev-delete']) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} false`)
  }
  for (const c of ['npx wrangler@3 deploy', 'node node_modules/wrangler/bin/wrangler.js deploy', 'npm run-script deploy', 'pnpm -C site deploy',
    'pnpm --filter web deploy', 'npx netlify-cli deploy --prod', 'make deploy', 'make -C site deploy', 'vercel', 'npx vercel', 'bunx --bun wrangler deploy',
    'npx wrangler versions deploy', 'yarn --cwd site deploy', 'npx firebase-tools deploy', 'npm run deploy-docs']) {
    expect(`${c} ${runsDeploy(c)}`).toBe(`${c} true`)
  }
  for (const c of ['make build', 'make test; echo deploy', 'vercel dev', 'vercel env pull', 'npx wrangler dev', 'echo "make deploy"']) {
    expect(`${c} ${runsDeploy(c)}`).toBe(`${c} false`)
  }
  expect(runsCommand('git filter-repo --analyze', HISTORY_REWRITE)).toBe(true)
  expect(runsCommand('git push --mirror', FORCE_PUSH)).toBe(true)
})

test('/delegate off lifts only the Chief of Staff\'s no-edit rule', async ($, on) => {
  serve(on)
  memoryStore(on, { delegate: false })
  agents(on, { d1: 'chief-of-staff:web-designer', f1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  const call = (e: Record<string, unknown>) => $.tool.call(e as never)
  expect(deny(await call({ tool: 'Write', file_path: '/site/a.ts', content: 'x' }))).toBeUndefined() // the Chief of Staff may edit
  expect(String(deny(await call({ tool: 'Write', file_path: '/site/a.js', content: 'x', agentId: 'd1' })))).toContain('Role limit: web-designer')
  expect(String(deny(await call({ tool: 'Bash', command: 'npx wrangler deploy', agentId: 'f1' })))).toContain('only devops-engineer deploys')
  expect(String(deny(await call({ tool: 'Bash', command: 'npx wrangler deploy' })))).toContain('Assign the deploy')
  expect(String(deny(await call({ tool: 'Bash', command: 'git push --force', agentId: 'f1' })))).toContain('Rewriting git history')
})

test('when the agent cannot be told, the tightest limits apply; history checks run first', async ($, on) => {
  serve(on)
  memoryStore(on)
  on('agent.list', () => { throw new Error('agent list down') })
  on('tool.call', () => ({ result: {} }))
  const call = (e: Record<string, unknown>) => $.tool.call({ agentId: 'x1', ...e } as never)
  expect(String(deny(await call({ tool: 'Write', file_path: '/site/a.ts', content: 'x' })))).toContain('writes only .md')
  expect(deny(await call({ tool: 'Write', file_path: '/site/notes.md', content: 'x' }))).toBeUndefined()
  expect(String(deny(await call({ tool: 'Bash', command: 'wrangler deploy' })))).toContain('deploys')
  expect(String(deny(await call({ tool: 'Bash', command: 'git push --force-with-lease' })))).toContain('Rewriting git history')
  expect(String(deny(await call({ tool: 'Bash', command: 'git push -f' })))).toContain('Rewriting git history')
  expect(deny(await call({ tool: 'Bash', command: 'npm test' }))).toBeUndefined()
})

test('an agent whose id the engine does not list gets the tightest limits, not the Chief of Staff\'s', async ($, on) => {
  serve(on)
  memoryStore(on)
  agents(on, { other: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  const w = await $.tool.call({ tool: 'Write', file_path: '/site/a.ts', content: 'x', agentId: 'ghost' } as never)
  expect(String(deny(w))).toContain('writes only .md')
})

test('protected paths: the plugin, installed plugins and their store, Claude Code settings', async ($, on) => {
  const at = { roots: ['/opt/plugins/chief-of-staff', '/real/chief-of-staff'], configDirs: ['/home/u/.claude', '/cfg'] }
  for (const p of ['/opt/plugins/chief-of-staff/agents/web-designer.md', '/opt/plugins/chief-of-staff', '/real/chief-of-staff/hooks/register.ts',
    '/home/u/.claude/plugins/store/chief-of-staff.json', '/root/.claude/plugins/cache/x/y.ts', '~/.claude/settings.json', '/home/u/.claude/settings.local.json',
    'C:\\Users\\u\\.claude\\settings.json', '/cfg/plugins/x', '/cfg/settings.json', '/site/.claude/settings.json', '/OPT/Plugins/Chief-Of-Staff/x.md',
    // 0.10 round 3: Claude Code's own config is protected too
    '/home/u/.claude/CLAUDE.md', '/home/u/.claude/agents/x.md', '/home/u/.claude/skills/s/SKILL.md', '/home/u/.claude/commands/c.md', '/site/.claude/hooks/h.sh',
    '/home/u/.claude.json', '/site/.mcp.json', '/etc/claude-code/managed-settings.json', '~/.claude/./settings.json', '~/.claude/x/../plugins/store/s.json']) {
    expect(`${p} ${isProtectedPath(p, at)}`).toBe(`${p} true`)
  }
  for (const p of ['/site/index.html', '/opt/plugins/chief-of-staff-notes/a.md', '/cfg/notes.md', '/site/CLAUDE.md', '/home/u/.claude/keybindings.json']) {
    expect(`${p} ${isProtectedPath(p, at)}`).toBe(`${p} false`)
  }
  const spell = ['/opt/plugins/chief-of-staff', '.claude/plugins', '.claude/settings']
  for (const c of ['echo x > ~/.claude/settings.json', 'tee -a /root/.claude/plugins/store/a.json', 'cp a.md /opt/plugins/chief-of-staff/agents/',
    'sed -i s/a/b/ ~/.claude/settings.local.json', 'mv x /root/.claude/plugins/cache/y', "python3 -c \"open('/root/.claude/settings.json','w').write('{}')\""]) {
    expect(`${c} ${shellWritesTo(c, spell)}`).toBe(`${c} true`)
  }
  for (const c of ['cat ~/.claude/settings.json', 'ls /root/.claude/plugins', 'grep -r x /opt/plugins/chief-of-staff', 'echo hi > /site/a.txt']) {
    expect(`${c} ${shellWritesTo(c, spell)}`).toBe(`${c} false`)
  }

  serve(on)
  memoryStore(on)
  agents(on, { f1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  const call = (e: Record<string, unknown>) => $.tool.call({ agentId: 'f1', ...e } as never)
  expect(String(deny(await call({ tool: 'Write', file_path: '/root/.claude/plugins/store/chief-of-staff.json', content: '{}' })))).toContain('Not allowed: agents do not change')
  expect(String(deny(await call({ tool: 'Edit', file_path: '/home/u/.claude/settings.json', old_string: 'a', new_string: 'b' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'Bash', command: 'echo "{}" > ~/.claude/settings.json' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'mcp__dc__write_file', path: '/root/.claude/plugins/cache/x.ts', content: 'x' })))).toContain('Not allowed')
  expect(deny(await call({ tool: 'Write', file_path: '/site/a.ts', content: 'x' }))).toBeUndefined()
})

test('MCP routes: shell tools are checked like Bash, file tools keep the write limit', async ($, on) => {
  serve(on)
  memoryStore(on)
  agents(on, { d1: 'chief-of-staff:web-designer', r1: 'chief-of-staff:reverse-engineer', f1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  const call = (e: Record<string, unknown>) => $.tool.call(e as never)
  expect(String(deny(await call({ tool: 'mcp__dc__start_process', command: 'npx wrangler deploy', agentId: 'f1' })))).toContain('only devops-engineer deploys')
  expect(String(deny(await call({ tool: 'mcp__dc__interact_with_process', pid: 1, input: 'git push --force', agentId: 'f1' })))).toContain('Rewriting git history')
  expect(String(deny(await call({ tool: 'mcp__term__run_command', args: { cmd: 'git filter-repo --path x' }, agentId: 'f1' })))).toContain('Rewriting git history')
  expect(String(deny(await call({ tool: 'mcp__dc__write_file', path: '/site/a.js', content: 'x', agentId: 'd1' })))).toContain('Role limit: web-designer')
  expect(String(deny(await call({ tool: 'mcp__dc__move_file', source: '/site/a.ts', destination: '/site/a.md', agentId: 'r1' })))).toContain('Role limit: reverse-engineer')
  expect(String(deny(await call({ tool: 'mcp__dc__edit_block', file_path: '/site/x.ts', agentId: 'r1' })))).toContain('Role limit: reverse-engineer')
  expect(deny(await call({ tool: 'mcp__dc__write_file', path: '/site/a.css', content: 'x', agentId: 'd1' }))).toBeUndefined()
  expect(deny(await call({ tool: 'mcp__dc__read_file', path: '/site/a.js', agentId: 'd1' }))).toBeUndefined()
})

test('roleLimit stays pure and matches the hook', () => {
  expect(roleLimit('web-designer', 'Write', '/a.js', '', TEAM)).toBeDefined()
  expect(roleLimit('devops-engineer', 'Bash', '', 'git push --force-with-lease', TEAM)).toBeUndefined()
  expect(roleLimit('devops-engineer', 'Bash', '', 'git push --mirror', TEAM)).toContain('Rewriting git history')
})
