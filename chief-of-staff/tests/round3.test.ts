// Round 3, items 4-13: generation, read verbs that act, the engine's read-only word, the protected set,
// history and bypass rules, cheap shell items, the allow-list additions, and the known oddities.
import { expect, test } from 'claude-code/testing'

import {
  buildTeam, bypassLimit, checkMcp, departmentLimit, enabledIds, parseFrontmatter, rewritesHistory, roleLimit, runsDeploy, runsLeasePush,
  shellNeedsPerson,
} from '../hooks/register'
import { FILES } from './files'
import { agentFiles, agents, cwd, deny, memoryStore, withAgent } from './helpers'
import { serve } from './serve'

const verdict = (t: string, isReadOnly = false, free = true) => `${t} ${checkMcp(t, isReadOnly, free).verdict}`

test('item 5: read verbs that act ask; an action-word server prefix is kept', () => {
  for (const t of ['mcp__sentry__resolve_issue', 'mcp__linear__resolve_issue', 'mcp__github__resolve_review_thread', 'mcp__x__check_task', 'mcp__x__check_in',
    'mcp__x__suggest_changes', 'mcp__x__scan_network', 'mcp__postgres__query', 'mcp__mysql__mysql_query', 'mcp__bq__query_table', 'mcp__x__run_query',
    'mcp__gdrive__download_file', 'mcp__x__extract_files', 'mcp__send__send_get_users', 'mcp__post__post_list_comments', 'mcp__deploy__deploy_get_status',
    'mcp__publish__publish_get', 'mcp__x__get_or_create_user', 'mcp__x__count_and_reset', 'mcp__x__read_and_mark']) {
    expect(verdict(t)).toBe(`${t} ask`)
  }
  expect(verdict('mcp__Slack__slack_read_channel')).toBe('mcp__Slack__slack_read_channel pass')
})

test('item 5: path checks run on every agent MCP call that writes, downloads, exports or generates', async ($, on) => {
  serve(on)
  memoryStore(on)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  agents(on, { r1: 'chief-of-staff:reverse-engineer', f1: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  const call = (e: Record<string, unknown>) => $.tool.call(e as never)
  expect(String(deny(await call({ tool: 'mcp__gdrive__download_file', file_id: '1', path: '/home/u/.claude/settings.json', agentId: 'f1' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'mcp__img__generate_image', output_path: '/site/x.js', agentId: 'r1' })))).toContain('Role limit: reverse-engineer')
  expect(String(deny(await call({ tool: 'mcp__docs__export_page', options: { target: { file: '~/.claude/agents/x.md' } }, agentId: 'f1' })))).toContain('Not allowed')
  expect(String(deny(await call({ tool: 'mcp__zip__unzip', archive: '/tmp/a.zip', to: './.claude/skills/', agentId: 'f1' })))).toContain('Not allowed')
  expect(deny(await call({ tool: 'mcp__gdrive__download_file', file_id: '1', path: '/site/notes.md', agentId: 'r1' }))).toBeUndefined()
  // a read tool's path arguments are not write targets
  expect(deny(await call({ tool: 'mcp__fs__read_file', path: '/home/u/.claude/settings.json', agentId: 'f1' }))).toBeUndefined()
  // a URL or prose is not a path
  expect(deny(await call({ tool: 'mcp__docs__create_page', body: 'see https://x.example/a.js and docs/a b.js', agentId: 'r1' }))).toBeUndefined()
})

test('item 6: the engine\'s read-only word is not trusted when the name holds an action word', () => {
  for (const t of ['mcp__x__create_event', 'mcp__x__update_record', 'mcp__x__share_file', 'mcp__x__make_call', 'mcp__x__write_file', 'mcp__x__send_email',
    'mcp__x__start_process', 'mcp__x__do_file_job', 'mcp__x__set_config', 'mcp__x__delete_widget']) {
    expect(verdict(t, true)).toBe(`${t} ask`)
  }
  expect(verdict('mcp__x__frobnicate_widgets', true)).toBe('mcp__x__frobnicate_widgets pass')
})

test('item 7: a project CLAUDE.md asks; Claude Code\'s own memory and config are refused', async ($, on) => {
  serve(on)
  memoryStore(on)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  agents(on, { f1: 'chief-of-staff:frontend-developer' })
  cwd(on, '/site')
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  const write = (file_path: string) => $.tool.call({ tool: 'Write', file_path, content: 'x', agentId: 'f1' } as never)
  for (const p of ['/home/u/.claude/CLAUDE.md', '/home/u/.claude.json', '/site/.mcp.json', '/home/u/.claude/agents/x.md', '/home/u/.claude/skills/s/SKILL.md',
    '/home/u/.claude/commands/c.md', '/site/.claude/agents/a.md', '/site/.claude/skills/s.md', '/site/.claude/commands/c.md', '/site/.claude/hooks/h.sh',
    '/site/.claude/settings.local.json', '/etc/claude-code/managed-settings.json']) {
    expect(`${p} ${deny(await write(p)) ? 'refused' : 'allowed'}`).toBe(`${p} refused`)
  }
  expect(deny(await write('/site/CLAUDE.md'))).toBeUndefined() // not refused here: tool.check asks
  const ask = (file_path: string, extra: Record<string, unknown> = {}) =>
    $.tool.check({ tool: 'Edit', input: { file_path, old_string: 'a', new_string: 'b' }, agentId: 'f1', ...extra } as never)
  expect((await ask('/site/CLAUDE.md', { approver: 'person' })).decision).toBe('ask')
  expect((await ask('/site/docs/CLAUDE.local.md')).decision).toBe('deny')
  expect((await ask('/site/README.md')).decision).toBe('allow')
  expect((await $.tool.check({ tool: 'Bash', input: { command: 'echo x >> CLAUDE.md' }, agentId: 'f1', approver: 'person' } as never)).decision).toBe('ask')
})

test('item 8: force pushes after a substitution, --prune, and ref moves', () => {
  for (const c of ['git push origin $(git rev-parse HEAD~5):refs/heads/main --force', 'git push --prune origin', 'git push origin --all --prune',
  ]) {
    expect(`${c} ${rewritesHistory(c)}`).toBe(`${c} true`)
  }
  for (const c of ['git update-ref refs/heads/main HEAD~3', 'git update-ref -d refs/heads/main', 'git branch -f main HEAD~3', 'git branch -D master',
    'git branch --delete --force main']) {
    expect(`${c} ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} ask`)
  }
  for (const c of ['git branch -D feature', 'git branch -f topic', 'git update-ref refs/tags/v1 HEAD', 'git branch']) {
    expect(`${c} ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} pass`)
  }
  expect(runsLeasePush('git push origin --force-with-lease=main')).toBe(true)
})

test('item 8: bot-protection bypass with any truthy value, nested, and in any command field', () => {
  const k = ['solve', 'cloudflare'].join('_')
  const c = ['solve', 'captcha'].join('_')
  for (const v of [true, 'true', 'True', 1, '1', 'yes']) {
    expect(`${JSON.stringify(v)} ${!!bypassLimit('mcp__scrapling__stealthy_fetch', { url: 'u', [k]: v })}`).toBe(`${JSON.stringify(v)} true`)
  }
  expect(!!bypassLimit('mcp__s__fetch', { a: { b: { c: { [c]: 'yes' } } } })).toBe(true)
  expect(!!bypassLimit('mcp__s__fetch', { a: { b: { c: { d: { e: { [k]: true } } } } } })).toBe(false) // past depth 4
  for (const v of [false, 'false', 0, '0', 'no']) expect(!!bypassLimit('mcp__s__fetch', { [k]: v })).toBe(false)
  const flag = ['--solve', 'cloudflare'].join('-')
  const flag2 = ['--solve', 'cloudflare'].join('_')
  for (const command of [`scrapling extract stealthy-fetch u o.md ${flag}`, `x ${flag2}`, `python -c "f(u, ${k}=True)"`, `python -c "f(u, ${k} = 1)"`,
    `node -e "f({'${k}': true})"`, `node -e 'f({"${k}": "true"})'`]) {
    for (const tool of ['Bash', 'Monitor', 'PowerShell']) expect(`${tool} ${command} ${!!bypassLimit(tool, { command })}`).toBe(`${tool} ${command} true`)
    expect(!!bypassLimit('mcp__plugin_desktop-commander_desktop-commander__start_process', { command })).toBe(true)
  }
  expect(!!bypassLimit('Bash', { command: `echo ${k}=False` })).toBe(false)
})

test('item 9: the cheap shell items', () => {
  for (const c of ['"git" push -f', "'wrangler' deploy", 'timeout 600 wrangler deploy', 'nice wrangler deploy', 'setsid wrangler deploy',
    'stdbuf -o0 wrangler deploy', 'ionice -c3 wrangler deploy']) {
    expect(`${c} ${rewritesHistory(c) || runsDeploy(c)}`).toBe(`${c} true`)
  }
  for (const c of ['npm exec wrangler deploy', 'npm exec -- wrangler deploy', 'yarn wrangler deploy', 'bun x wrangler deploy', 'wrangler --env prod deploy',
    'wrangler -e prod deploy', 'vc --prod', 'vc', 'make deploy', 'make deploy-prod', 'make -C site deploy:staging', 'npm run deploy:prod']) {
    expect(`${c} ${runsDeploy(c)}`).toBe(`${c} true`)
  }
  for (const c of ['"claude" -p hi', 'npx @anthropic-ai/claude-code -p hi', 'bunx @anthropic-ai/claude-code', 'node /usr/lib/node_modules/@anthropic-ai/claude-code/cli.js -p x',
    'npm publish', 'pnpm publish --access public', 'gh gist create a.txt', 'gh repo create x --public', 'gh pr create --fill', 'gh issue create -t x',
    'gh issue comment 1 -b x', 'gh pr review 1 --approve', 'gh api repos/o/r -X"DELETE"', "gh api repos/o/r -X 'PATCH'", 'gh api repos/o/r -ftitle=x',
    'gh api repos/o/r -H "X-HTTP-Method-Override: DELETE"', 'gh -R o/r pr merge 1']) {
    expect(`${c} ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} ask`)
  }
  for (const c of ['wget -T 10 https://example.com/a', 'wget -nd -r https://example.com/', 'gh pr view 1', 'gh issue list', 'npm pack', 'claudette --help']) {
    expect(`${c} ${shellNeedsPerson(c) ? 'ask' : 'pass'}`).toBe(`${c} pass`)
  }
})

test('item 12: the allow-list additions pass; each acting sibling still asks', () => {
  const pass = [
    'mcp__scrapling__make_request', 'mcp__scrapling__open_request_session', 'mcp__scrapling__session_make_request', 'mcp__scrapling__browser_open',
    'mcp__scrapling__browser_close', 'mcp__scrapling__close_session', 'mcp__scrapling__list_sessions', 'mcp__scrapling__bulk_get', 'mcp__scrapling__bulk_fetch',
    'mcp__scrapling__stealthy_fetch', 'mcp__scrapling__bulk_stealthy_fetch',
    'mcp__Gmail__label_message', 'mcp__Gmail__label_thread', 'mcp__Gmail__unlabel_message', 'mcp__Gmail__untrash_thread', 'mcp__Gmail__unmark_message_spam',
    'mcp__Gmail__download_gmail_attachment', 'mcp__Taplio__pick_media',
    'mcp__Higgsfield__balance', 'mcp__Higgsfield__transactions', 'mcp__Higgsfield__show_plans_and_credits', 'mcp__Higgsfield__get_project',
    'mcp__Higgsfield__list_projects', 'mcp__Higgsfield__apps_describe', 'mcp__Higgsfield__apps_search', 'mcp__Higgsfield__gpu_explore', 'mcp__Higgsfield__gpu_list_gpus',
    'mcp__Higgsfield__gpu_my', 'mcp__Higgsfield__gpu_private_models', 'mcp__Higgsfield__gpu_job_quote', 'mcp__Higgsfield__gpu_job_status', 'mcp__Higgsfield__gpu_rental',
    'mcp__Higgsfield__gpu_rental_logs', 'mcp__Higgsfield__meta_ads_read', 'mcp__Higgsfield__meta_ads_tools', 'mcp__Higgsfield__tiktok_accounts',
    'mcp__Higgsfield__tiktok_music_trending', 'mcp__Higgsfield__tiktok_publish_status', 'mcp__Higgsfield__video_analysis_jobs', 'mcp__Higgsfield__video_analysis_status',
    'mcp__Higgsfield__virality_predictor', 'mcp__Higgsfield__website_status', 'mcp__Higgsfield__ads_studio_get_brand', 'mcp__Higgsfield__ads_studio_list_runs',
    'mcp__Higgsfield__ads_studio_quote', 'mcp__Higgsfield__ads_studio_story_presets', 'mcp__Higgsfield__ads_studio_story_recipe', 'mcp__Higgsfield__ai_influencer_get_options',
    'mcp__Higgsfield__ai_influencer_list_presets', 'mcp__Higgsfield__ai_influencer_prepare', 'mcp__Higgsfield__resolve_explainer_preset', 'mcp__Higgsfield__get_katana_config',
    'mcp__Higgsfield__scene_builder_3d_get_project', 'mcp__Higgsfield__scene_builder_3d_list_projects', 'mcp__Higgsfield__scene_builder_3d_search_assets',
    'mcp__Higgsfield__scene_builder_3d_show_scene', 'mcp__Higgsfield__jobs_wait', 'mcp__Higgsfield__job_display', 'mcp__Higgsfield__get_preset_instructions',
    'mcp__Higgsfield__get_workflow_instructions', 'mcp__Higgsfield__get_workflow_bundle_file',
    'mcp__Canva__export-design', 'mcp__Canva__get-export-formats', 'mcp__Canva__get-create-design-async-job', 'mcp__Canva__get-video-generation-status',
    'mcp__Canva__get-video-production-guide', 'mcp__Canva__help', 'mcp__Canva__resolve-shortlink', 'mcp__Canva__request-outline-review',
    'mcp__21st__get_component', 'mcp__21st__list_bookmarks', 'mcp__21st__search', 'mcp__21st__search_picker', 'mcp__21st__video_export_status', 'mcp__21st__video_get_doc',
    'mcp__21st__video_list_blocks', 'mcp__21st__video_search_blocks', 'mcp__21st__video_snapshot',
    'mcp__99tests__get_report', 'mcp__99tests__get_sample_report', 'mcp__99tests__list_packages', 'mcp__Booking_com__answer_property_qa_by_ids_v2',
    'mcp__ChangeThisFile__list_conversions', 'mcp__Claude_Docs__guide', 'mcp__Composio__COMPOSIO_GET_TOOL_SCHEMAS', 'mcp__Composio__COMPOSIO_SEARCH_TOOLS',
    'mcp__Composio__COMPOSIO_SEARCH_SKILLS', 'mcp__Composio__COMPOSIO_WAIT_FOR_CONNECTIONS', 'mcp__Slack__slack_search_channels', 'mcp__Slack__slack_search_users',
    'mcp__plugin-authoring__scan_secrets', 'mcp__plugin_desktop-commander_desktop-commander__read_multiple_files',
    'mcp__plugin_desktop-commander_desktop-commander__read_process_output', 'mcp__plugin_desktop-commander_desktop-commander__get_recent_tool_calls',
    'mcp__plugin_desktop-commander_desktop-commander__list_searches', 'mcp__plugin_desktop-commander_desktop-commander__start_search',
    'mcp__plugin_desktop-commander_desktop-commander__stop_search', 'mcp__plugin_desktop-commander_desktop-commander__get_more_search_results',
    'mcp__github__get_file_contents', 'mcp__github__list_commits', 'mcp__github__search_code', 'mcp__playwright__browser_snapshot',
    'mcp__playwright__browser_take_screenshot', 'mcp__kb__retrieve_documents', 'mcp__context7__get-library-docs', 'mcp__vercel__get_deployment_build_logs',
    'mcp__x__get_deleted_messages', 'mcp__x__list_published_posts', 'mcp__x__get_sender', 'mcp__x__get_payload', 'mcp__x__list_merged_pulls', 'mcp__x__get_pushed_commits',
  ]
  const ask = [
    'mcp__scrapling__browser_eval', 'mcp__Gmail__send_message', 'mcp__Gmail__trash_message', 'mcp__Gmail__delete_label', 'mcp__Taplio__unschedule',
    'mcp__Taplio__publish_draft', 'mcp__Higgsfield__gpu_rent', 'mcp__Higgsfield__gpu_job_start', 'mcp__Higgsfield__gpu_rental_exec', 'mcp__Higgsfield__meta_ads_write',
    'mcp__Higgsfield__publish_website', 'mcp__Higgsfield__ads_studio_generate', 'mcp__Higgsfield__ads_studio_cancel_run', 'mcp__Higgsfield__ai_influencer_generate',
    'mcp__Higgsfield__apps_invoke', 'mcp__Higgsfield__tiktok_connect', 'mcp__Higgsfield__tiktok_prepare_publish', 'mcp__Higgsfield__share_project',
    'mcp__Canva__publish-brand-template', 'mcp__Canva__comment-on-design', 'mcp__Canva__reply-to-comment', 'mcp__21st__delete_component', 'mcp__21st__submit_component',
    'mcp__21st__video_export', 'mcp__99tests__create_test_job', 'mcp__ChangeThisFile__convert_file', 'mcp__Claude_Docs__delete', 'mcp__Composio__COMPOSIO_MULTI_EXECUTE_TOOL',
    'mcp__Composio__COMPOSIO_MANAGE_CONNECTIONS', 'mcp__Slack__slack_send_message', 'mcp__plugin_desktop-commander_desktop-commander__start_process',
    'mcp__plugin_desktop-commander_desktop-commander__write_file', 'mcp__plugin_desktop-commander_desktop-commander__kill_process', 'mcp__github__create_or_update_file',
    'mcp__github__push_files', 'mcp__kb__retrieve_and_delete', 'mcp__x__deleted_messages_purge',
  ]
  for (const t of pass) expect(verdict(t)).toBe(`${t} pass`)
  for (const t of ask) expect(verdict(t)).toBe(`${t} ask`)
})

test('item 13: Slack\'s send_message_draft is a draft only on the Slack server', () => {
  expect(verdict('mcp__Slack__slack_send_message_draft')).toBe('mcp__Slack__slack_send_message_draft pass')
  expect(verdict('mcp__claude_ai_Slack__slack_send_message_draft')).toBe('mcp__claude_ai_Slack__slack_send_message_draft pass')
  expect(verdict('mcp__other__send_message_draft')).toBe('mcp__other__send_message_draft ask')
})

test('item 13: a new role without write-limit writes only .md; folded descriptions; does or description required', () => {
  const files = withAgent('growth-hacker', '---\nname: growth-hacker\ndepartment: marketing-pr\ndescription: >\n  Growth hacker. Runs\n  experiments.\n---\n')
  const team = buildTeam(FILES['departments.json'], agentFiles(withAgent('blank', '---\nname: blank\ndepartment: creative\n---\n', files)))
  expect(team.agents.find(a => a.name === 'growth-hacker')?.does).toBe('Growth hacker')
  expect(String(roleLimit('growth-hacker', 'Write', '/site/a.ts', '', team))).toContain('writes only .md')
  expect(roleLimit('growth-hacker', 'Write', '/site/a.md', '', team)).toBeUndefined()
  expect(roleLimit('frontend-developer', 'Write', '/site/a.ts', '', team)).toBeUndefined() // a FLOOR role keeps its floor
  expect(team.problems.join()).toContain('blank.md: no does and no description')
  expect(String(departmentLimit('chief-of-staff:blank', team, enabledIds(team, {})))).toContain('its agent file has problems')
  expect(parseFrontmatter('---\nname: a\ndescription: |\n  line one\n  line two\nnext: x\n---\n')).toEqual({ name: 'a', description: 'line one\nline two', next: 'x' })
})

test('item 13: /delegate and /team change only on the person\'s own run', async ($, on) => {
  serve(on)
  const kept = memoryStore(on)
  on('command.register', () => ({ value: { command: 'team' } }))
  on('ui.status', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  for (const origin of [{ kind: 'plugin', name: 'x' }, { kind: 'scheduled-trigger' }, { kind: 'peer' }, undefined]) {
    expect(JSON.stringify(await $.command.run({ origin, command: 'delegate', args: 'off' } as never))).toContain('Only the person can loosen this setting')
    expect(JSON.stringify(await $.command.run({ origin, command: 'team', args: 'on all' } as never))).toContain('Only the person can loosen this setting')
  }
  expect(kept.get('delegate')).toBeUndefined()
  expect(kept.get('departments')).toBeUndefined()
  // looking is fine from anywhere
  expect(JSON.stringify(await $.command.run({ origin: { kind: 'plugin', name: 'x' }, command: 'team', args: '' } as never))).toContain('Departments')
  for (const kind of ['composer', 'bridge', 'sdk']) {
    expect(JSON.stringify(await $.command.run({ origin: { kind }, command: 'delegate', args: 'credits ask' } as never))).toContain('Generation credits: ask')
  }
})
