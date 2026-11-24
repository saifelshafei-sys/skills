// QA round 4: daily-work usability matrix, adopted with assertions. Every case runs without a refusal or an ask,
// except the few that need the person's OK by design (EXPECTED_ASK below).
import { expect, test } from 'claude-code/testing'

import { agents, cwd, deny, memoryStore } from './helpers'
import { serve } from './serve'

type C = [role: string, tool: string, input: Record<string, unknown>]
const P = '/home/u/site'
const W = (file_path: string, content = 'x') => ({ file_path, content })
const B = (command: string) => ({ command })
const DRAW = '/home/u/.claude/plugins/cache/taste-skill/skills/brandkit/scripts/draw.mjs'

const cases: C[] = [
  // frontend-developer
  ['frontend-developer', 'Bash', B('npm install')],
  ['frontend-developer', 'Bash', B('npm ci')],
  ['frontend-developer', 'Bash', B('npm install -D vitest @playwright/test')],
  ['frontend-developer', 'Bash', B('npm test')],
  ['frontend-developer', 'Bash', B('npm run test -- --run')],
  ['frontend-developer', 'Bash', B('npm run build')],
  ['frontend-developer', 'Bash', B('npx vite build')],
  ['frontend-developer', 'Bash', B(`cd ${P} && npm run build && npm run lint`)],
  ['frontend-developer', 'Bash', B('git status && git diff --stat')],
  ['frontend-developer', 'Bash', B('git checkout -b feature/hero')],
  ['frontend-developer', 'Bash', B('git add -A')],
  ['frontend-developer', 'Bash', B('git add src/components/Hero.tsx src/styles/hero.css')],
  ['frontend-developer', 'Bash', B('git commit -m "Add hero section"')],
  ['frontend-developer', 'Bash', B(`git commit -m "$(cat <<'EOF'\nAdd hero section\n\nCo-Authored-By: Claude <noreply@anthropic.com>\nEOF\n)"`)],
  ['frontend-developer', 'Bash', B('git push')],
  ['frontend-developer', 'Bash', B('git push -u origin feature/hero')],
  ['frontend-developer', 'Bash', B('git push origin HEAD')],
  ['frontend-developer', 'Bash', B('git push --set-upstream origin feature/hero')],
  ['frontend-developer', 'Bash', B('git pull --rebase origin main')],
  ['frontend-developer', 'Bash', B('git fetch origin && git rebase origin/main')],
  ['frontend-developer', 'Bash', B('git stash && git stash pop')],
  ['frontend-developer', 'Bash', B('git log --oneline -5')],
  ['frontend-developer', 'Bash', B(`cd ${P} && git add . && git commit -m "wip" && git push origin feature/hero`)],
  ['frontend-developer', 'Bash', B('npx prettier --write src')],
  ['frontend-developer', 'Bash', B('npx eslint . --fix')],
  ['frontend-developer', 'Bash', B('npx tsc --noEmit')],
  ['frontend-developer', 'Bash', B('npm run dev > /tmp/dev.log 2>&1 &')],
  ['frontend-developer', 'Bash', B('curl -s http://localhost:5173/ | head -20')],
  ['frontend-developer', 'Bash', B('mkdir -p src/components && touch src/components/Hero.tsx')],
  ['frontend-developer', 'Bash', B('cat > src/config.ts <<\'EOF\'\nexport const x = 1\nEOF')],
  ['frontend-developer', 'Bash', B('echo "VITE_API=http://localhost:8787" > .env.local')],
  ['frontend-developer', 'Bash', B('rm -rf node_modules dist && npm install')],
  ['frontend-developer', 'Bash', B('gh pr view 12')],
  ['frontend-developer', 'Bash', B('gh pr checks 12')],
  ['frontend-developer', 'Write', W(`${P}/src/components/Hero.tsx`)],
  ['frontend-developer', 'Edit', { file_path: `${P}/src/App.tsx`, old_string: 'a', new_string: 'b' }],
  ['frontend-developer', 'Write', W(`${P}/package.json`, '{}')],
  ['frontend-developer', 'Write', W(`${P}/vite.config.ts`)],
  ['frontend-developer', 'Write', W(`${P}/src/styles.css`)],
  ['frontend-developer', 'Write', W(`${P}/index.html`)],
  ['frontend-developer', 'Write', W(`${P}/.env.local`)],
  ['frontend-developer', 'Write', W(`${P}/README.md`)],
  ['frontend-developer', 'MultiEdit', { file_path: `${P}/src/main.ts`, edits: [] }],
  // backend-developer
  ['backend-developer', 'Bash', B('curl -X POST http://localhost:3000/api/users -H "Content-Type: application/json" -d \'{"name":"a"}\'')],
  ['backend-developer', 'Bash', B('curl -s -XPOST localhost:8787/api/login -d user=a')],
  ['backend-developer', 'Bash', B('curl -X POST http://127.0.0.1:8000/graphql --data @query.json')],
  ['backend-developer', 'Bash', B('curl -X PUT http://[::1]:3000/items/1 -d x=1')],
  ['backend-developer', 'Bash', B('curl -X DELETE http://localhost:3000/items/1')],
  ['backend-developer', 'Bash', B('curl -sS -X POST http://0.0.0.0:3000/hook -d @fixtures/event.json')],
  ['backend-developer', 'Bash', B('curl --json \'{"a":1}\' http://localhost:3000/api')],
  ['backend-developer', 'Bash', B('http POST localhost:3000/api a=1')],
  ['backend-developer', 'Bash', B('wget --post-data "a=1" http://localhost:3000/api -O -')],
  ['backend-developer', 'Bash', B('npx prisma migrate dev --name init')],
  ['backend-developer', 'Bash', B('npx prisma migrate reset --force')],
  ['backend-developer', 'Bash', B('npx prisma db push')],
  ['backend-developer', 'Bash', B('npx drizzle-kit push')],
  ['backend-developer', 'Bash', B('npx knex migrate:latest')],
  ['backend-developer', 'Bash', B('python manage.py migrate')],
  ['backend-developer', 'Bash', B('alembic upgrade head')],
  ['backend-developer', 'Bash', B('npx wrangler d1 migrations apply DB --local')],
  ['backend-developer', 'Bash', B('npx wrangler dev')],
  ['backend-developer', 'Bash', B('psql postgres://localhost/dev -c "select 1"')],
  ['backend-developer', 'Bash', B('sqlite3 dev.db < migrations/001.sql')],
  ['backend-developer', 'Bash', B('docker compose up -d db')],
  ['backend-developer', 'Bash', B('node scripts/seed.mjs')],
  ['backend-developer', 'Bash', B('python3 -m pytest -q')],
  ['backend-developer', 'Write', W(`${P}/server/routes/users.ts`)],
  ['backend-developer', 'Write', W(`${P}/migrations/002_add_users.sql`)],
  ['backend-developer', 'Write', W(`${P}/scripts/seed.py`)],
  // qa-tester
  ['qa-tester', 'Bash', B('npx playwright install chromium')],
  ['qa-tester', 'Bash', B('npx playwright install --with-deps chromium')],
  ['qa-tester', 'Bash', B('npx playwright test')],
  ['qa-tester', 'Bash', B('npx playwright test tests/e2e/home.spec.ts --project=chromium --reporter=line')],
  ['qa-tester', 'Bash', B('npx playwright screenshot http://localhost:5173 shot.png')],
  ['qa-tester', 'Bash', B('node tests/e2e/smoke.mjs')],
  ['qa-tester', 'Bash', B('npx vitest run')],
  ['qa-tester', 'Bash', B('npm test 2>&1 | tail -40')],
  ['qa-tester', 'Bash', B('cat > tests/e2e/login.spec.ts <<\'EOF\'\nimport { test } from "@playwright/test"\nEOF')],
  ['qa-tester', 'Bash', B('curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/')],
  ['qa-tester', 'Bash', B('curl -X POST http://localhost:3000/api/login -d "u=a&p=b"')],
  ['qa-tester', 'Write', W(`${P}/tests/e2e/home.spec.ts`)],
  ['qa-tester', 'Write', W(`${P}/tests/unit/cart.test.js`)],
  ['qa-tester', 'Write', W(`${P}/playwright.config.ts`)],
  ['qa-tester', 'Write', W(`${P}/tests/fixtures/user.json`)],
  // devops-engineer
  ['devops-engineer', 'Bash', B('npx wrangler deploy')],
  ['devops-engineer', 'Bash', B('wrangler deploy --env production')],
  ['devops-engineer', 'Bash', B('npx wrangler pages deploy dist --project-name site')],
  ['devops-engineer', 'Bash', B('npm run deploy')],
  ['devops-engineer', 'Bash', B('git push --force-with-lease')],
  ['devops-engineer', 'Bash', B('git push --force-with-lease origin feature/ci')],
  ['devops-engineer', 'Bash', B('git rebase origin/main && git push --force-with-lease origin feature/ci')],
  ['devops-engineer', 'Bash', B('docker build -t site .')],
  ['devops-engineer', 'Bash', B('npx wrangler secret list')],
  ['devops-engineer', 'Bash', B('npx wrangler tail')],
  ['devops-engineer', 'Bash', B('gh run list --limit 5')],
  ['devops-engineer', 'Bash', B('gh run view 123 --log-failed')],
  ['devops-engineer', 'Write', W(`${P}/wrangler.toml`)],
  ['devops-engineer', 'Write', W(`${P}/.github/workflows/ci.yml`)],
  ['devops-engineer', 'Write', W(`${P}/Dockerfile`)],
  // seo-specialist
  ['seo-specialist', 'mcp__scrapling__get', { url: 'https://example.com', extraction_type: 'markdown' }],
  ['seo-specialist', 'mcp__scrapling__fetch', { url: 'https://example.com' }],
  ['seo-specialist', 'mcp__scrapling__stealthy_fetch', { url: 'https://example.com' }],
  ['seo-specialist', 'mcp__scrapling__bulk_get', { urls: ['https://example.com/a', 'https://example.com/b'] }],
  ['seo-specialist', 'mcp__scrapling__make_request', { url: 'https://example.com' }],
  ['seo-specialist', 'mcp__scrapling__browser_fetch', { url: 'https://example.com' }],
  ['seo-specialist', 'mcp__scrapling__browser_fetch_once', { url: 'https://example.com' }],
  ['seo-specialist', 'mcp__scrapling__browser_extract', { url: 'https://example.com', selector: 'h1' }],
  ['seo-specialist', 'mcp__scrapling__browser_screenshot', { url: 'https://example.com' }],
  ['seo-specialist', 'mcp__scrapling__open_request_session', {}],
  ['seo-specialist', 'mcp__scrapling__session_make_request', { session_id: 's', url: 'https://example.com' }],
  ['seo-specialist', 'mcp__scrapling__browser_network_requests', {}],
  ['seo-specialist', 'mcp__scrapling__list_sessions', {}],
  ['seo-specialist', 'mcp__scrapling__close_session', { session_id: 's' }],
  ['seo-specialist', 'Bash', B('scrapling extract get https://example.com page.md')],
  ['seo-specialist', 'Bash', B('scrapling extract fetch https://example.com page.md --css-selector main')],
  ['seo-specialist', 'Bash', B('scrapling extract stealthy-fetch https://example.com page.md')],
  ['seo-specialist', 'Bash', B('curl -sI https://example.com')],
  ['seo-specialist', 'Bash', B('curl -s https://example.com/robots.txt')],
  ['seo-specialist', 'Bash', B('curl -s https://example.com/sitemap.xml -o sitemap.xml')],
  ['seo-specialist', 'Write', W(`${P}/seo/audit.md`)],
  ['seo-specialist', 'Write', W(`${P}/public/robots.txt`)],
  ['seo-specialist', 'Edit', { file_path: `${P}/index.html`, old_string: '<title>', new_string: '<title>X' }],
  // web-designer
  ['web-designer', 'Bash', B(`node ${DRAW} --out ${P}/design/logo.svg`)],
  ['web-designer', 'Bash', B(`node ${DRAW} > ${P}/design/palette.svg`)],
  ['web-designer', 'Bash', B(`cd ${P} && node ~/.claude/plugins/cache/taste-skill/scripts/draw.mjs hero`)],
  ['web-designer', 'Bash', B('python3 ~/.claude/plugins/cache/taste-skill/scripts/contrast.py "#111" "#fff"')],
  ['web-designer', 'Bash', B('ls design && cat design/tokens.css')],
  ['web-designer', 'Bash', B(`mkdir -p ${P}/design`)],
  ['web-designer', 'Bash', B(`cat > ${P}/styles/tokens.css <<'EOF'\n:root{--a:1}\nEOF`)],
  ['web-designer', 'Write', W(`${P}/styles/main.css`)],
  ['web-designer', 'Write', W(`${P}/index.html`)],
  ['web-designer', 'Write', W(`${P}/design/spec.md`)],
  ['web-designer', 'Write', W(`${P}/design/tokens.json`)],
  ['web-designer', 'Write', W(`${P}/design/logo.svg`)],
  ['web-designer', 'Edit', { file_path: `${P}/styles/main.css`, old_string: 'a', new_string: 'b' }],
  // reverse-engineer
  ['reverse-engineer', 'Bash', B('rea --version')],
  ['reverse-engineer', 'Bash', B('rea analyze ./target.apk --out report')],
  ['reverse-engineer', 'Bash', B('rea inspect https://example.com --capture capture.har')],
  ['reverse-engineer', 'Bash', B('rea decompile app.asar -o out/')],
  ['reverse-engineer', 'Bash', B('npx asar extract app.asar out/')],
  ['reverse-engineer', 'Bash', B('strings -n 8 bin/app | head')],
  ['reverse-engineer', 'Bash', B('curl -s https://example.com/app.js -o /tmp/app.js')],
  ['reverse-engineer', 'Write', W(`${P}/research/how-x-works.md`)],
  ['reverse-engineer', 'Bash', B(`cat > ${P}/research/notes.md <<'EOF'\n# notes\nEOF`)],
  // copywriter
  ['copywriter', 'Write', W(`${P}/content/home.md`)],
  ['copywriter', 'Edit', { file_path: `${P}/content/about.md`, old_string: 'a', new_string: 'b' }],
  ['copywriter', 'Write', W(`${P}/content/home.mdx`)],
  ['copywriter', 'Write', W(`${P}/copy/home.txt`)],
  // creative-director
  ['creative-director', 'Write', W(`${P}/creative-brief.md`)],
  ['creative-director', 'Write', W(`${P}/reviews/hero-review.md`)],
  // security
  ['security-reviewer', 'Bash', B('npm audit --json')],
  ['security-reviewer', 'Bash', B('grep -rn "api_key" src')],
  ['security-reviewer', 'Bash', B('git log -p -S password --all | head')],
  ['security-engineer', 'Bash', B('npm audit fix')],
  ['security-engineer', 'Write', W(`${P}/server/middleware/csp.ts`)],
  // marketing-strategist
  ['marketing-strategist', 'mcp__scrapling__browser_fetch', { url: 'https://example.com' }],
  ['marketing-strategist', 'Write', W(`${P}/strategy/positioning.md`)],
  // Chief of Staff
  ['', 'Bash', B('cat ~/.claude/settings.json')],
  ['', 'Bash', B('cat /home/u/.claude/settings.json')],
  ['', 'Bash', B('jq . ~/.claude/settings.json')],
  ['', 'Bash', B('ls ~/.claude/plugins')],
  ['', 'Read', { file_path: '/home/u/.claude/settings.json' }],
  ['', 'Bash', B('git status')],
  ['', 'Bash', B('git log --oneline -5')],
  ['', 'Bash', B('gh pr view 12')],
]

test('daily work is not refused', async ($, on) => {
  serve(on)
  memoryStore(on)
  cwd(on, P)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/home/u' : undefined }))
  const roles = [...new Set(cases.map(c => c[0]).filter(Boolean))]
  agents(on, Object.fromEntries(roles.map(r => [r, `chief-of-staff:${r}`])))
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  const bad: string[] = []
  for (const [role, tool, input] of cases) {
    const agentId = role || undefined
    const call = deny(await $.tool.call({ tool, ...input, agentId } as never))
    const chk = await $.tool.check({ tool, input, agentId, approver: 'person' } as never)
    const chk2 = await $.tool.check({ tool, input, agentId } as never)
    const v = call ? 'DENY' : chk.decision === 'ask' ? 'ASK' : chk.decision === 'deny' ? 'CHKDENY' : 'ok'
    const msg = call ?? (chk as { reason?: string }).reason ?? ''
    const line = `${v.padEnd(7)} ${(role || 'chief').padEnd(20)} ${tool} ${JSON.stringify(input).slice(0, 160)}${msg ? ' => ' + msg : ''}${chk2.decision === 'deny' && v === 'ASK' ? ' [no-approver: deny]' : ''}`
    if (v !== 'ok') bad.push(line)
  }
  expect(bad).toEqual([])
})

/** Cases that need the person's OK by design: remote branch deletes, GitHub changes, data sent to another host. */
const EXPECTED_ASK = [
  'ASK frontend-developer {"command":"git push origin --delete feature/old-hero"} (no approver: refused)',
  'ASK frontend-developer {"command":"git push origin :feature/old-hero"} (no approver: refused)',
  'ASK frontend-developer {"command":"gh pr create --fill"} (no approver: refused)',
  'ASK backend-developer {"command":"curl -X POST https://api.staging.example.com/v1/items -d x=1"} (no approver: refused)',
  'ASK devops-engineer {"command":"gh workflow run deploy.yml"} (no approver: refused)',
  'ASK devops-engineer {"command":"gh secret set CF_TOKEN < token.txt"} (no approver: refused)',
]

const T = '/root/.claude/plugins/synced/67cd2445-b450-4670-a6ff-0f14133fb61a_9a8e82de-3da6-44b4-9311-1a2ba8a75c2f/taste-skill/skills/taste-skill'
const R = '/root/site'
const cases2: C[] = [
  ['web-designer', 'Bash', B(`node ${T}/scripts/draw.mjs --sector saas --brief "invoicing for freelancers" --options`)],
  ['web-designer', 'Bash', B(`node ${T}/scripts/draw.mjs --show`)],
  ['web-designer', 'Bash', B(`node ${T}/scripts/lint.mjs src`)],
  ['web-designer', 'Bash', B(`node ${T}/scripts/inspect.mjs http://localhost:5173`)],
  ['web-designer', 'Bash', B(`node ${T}/scripts/assets.mjs "harbour cranes" --get`)],
  ['web-designer', 'Bash', B(`cd ${R} && node ${T}/scripts/lint.mjs index.html styles`)],
  ['web-designer', 'Bash', B(`cat ${T}/SKILL.md`)],
  ['web-designer', 'Bash', B(`cp ${T}/assets/reset.css ${R}/styles/reset.css`)],
  ['web-designer', 'Bash', B(`ls ${T}/library`)],
  ['frontend-developer', 'Bash', B('cat ~/.claude/plugins/installed_plugins.json')],
  ['frontend-developer', 'Bash', B('grep -rn "draw.mjs" ~/.claude/plugins/synced | head')],
  ['frontend-developer', 'Bash', B('cat ~/.claude/settings.json')],
  ['frontend-developer', 'Bash', B('python3 ~/.claude/skills/graphify/scripts/build.py .')],
  ['frontend-developer', 'Bash', B('node ~/.claude/plugins/cache/web-craft/web-craft/1.0.0/skills/jury/scripts/shoot.mjs http://localhost:5173')],
  ['frontend-developer', 'Bash', B('git push origin --delete feature/old-hero')],
  ['frontend-developer', 'Bash', B('git push origin :feature/old-hero')],
  ['frontend-developer', 'Bash', B('git branch -d feature/old-hero')],
  ['frontend-developer', 'Bash', B('git push origin HEAD:refs/heads/feature/hero')],
  ['frontend-developer', 'Bash', B('git push origin feature/hero:feature/hero')],
  ['frontend-developer', 'Bash', B('git tag v1.2.0 && git push origin v1.2.0')],
  ['frontend-developer', 'Bash', B('git push --tags')],
  ['frontend-developer', 'Bash', B('npm version patch')],
  ['frontend-developer', 'Bash', B('git commit --amend --no-edit')],
  ['frontend-developer', 'Bash', B('gh pr create --fill')],
  ['frontend-developer', 'Bash', B('git reset --hard origin/feature/hero')],
  ['frontend-developer', 'Monitor', B('npm run dev')],
  ['backend-developer', 'Bash', B('curl -X POST https://api.staging.example.com/v1/items -d x=1')],
  ['backend-developer', 'Bash', B('curl -X POST "http://localhost:3000/api/users?debug=1" -d @body.json')],
  ['backend-developer', 'Bash', B('curl -X POST http://host.docker.internal:3000/api')],
  ['backend-developer', 'Bash', B('curl -X POST http://api.localhost:3000/x -d a=1')],
  ['backend-developer', 'Bash', B('curl -fsS -X POST http://localhost:8787/__scheduled')],
  ['backend-developer', 'Bash', B('npx wrangler d1 execute DB --local --file=./schema.sql')],
  ['backend-developer', 'Bash', B('npx wrangler d1 migrations apply DB --remote')],
  ['qa-tester', 'Bash', B('npx playwright test --reporter=html && npx playwright show-report')],
  ['qa-tester', 'Bash', B('npx playwright codegen http://localhost:5173 -o tests/e2e/gen.spec.ts')],
  ['qa-tester', 'Bash', B('npx playwright test --update-snapshots')],
  ['devops-engineer', 'Bash', B('gh workflow run deploy.yml')],
  ['devops-engineer', 'Bash', B('gh secret set CF_TOKEN < token.txt')],
  ['devops-engineer', 'Bash', B('npx wrangler secret put API_KEY')],
  ['devops-engineer', 'Bash', B('git push --force-with-lease=main:abc123 origin main')],
  ['devops-engineer', 'Bash', B('git push --force-with-lease origin HEAD')],
  ['reverse-engineer', 'Bash', B('npx -y rea-agents@6.8.0 doctor --client claude_code --json')],
  ['reverse-engineer', 'Bash', B('rea doctor --json > research/doctor.json')],
  ['reverse-engineer', 'Bash', B('mkdir -p research/captures && curl -s https://example.com/main.js -o research/captures/main.js')],
  ['reverse-engineer', 'Bash', B('wget -q https://example.com/app.apk -O /tmp/app.apk')],
  ['reverse-engineer', 'Bash', B('unzip -o app.apk -d /tmp/apk')],
  ['reverse-engineer', 'Bash', B('npx prettier main.min.js > /tmp/main.pretty.js')],
  ['reverse-engineer', 'Write', W(`${R}/research/report.md`)],
  ['reverse-engineer', 'mcp__plugin_rea_rea__inspect_web_page', { url: 'https://example.com' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__analyze_web_bundle', { url: 'https://example.com' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__analyze_javascript_application', { path: '/tmp/app' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__capture_web_screenshot', { url: 'https://example.com' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__open_binary', { path: '/tmp/app' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__binary_overview', {}],
  ['reverse-engineer', 'mcp__plugin_rea_rea__list_procedures', {}],
  ['reverse-engineer', 'mcp__plugin_rea_rea__procedure_pseudo_code', { address: '0x1000' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__search_strings', { query: 'api' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__trace_application_feature', { feature: 'login' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__inspect_artifact', { path: '/tmp/app.apk' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__inspect_android_package', { path: '/tmp/app.apk' }],
  ['reverse-engineer', 'mcp__plugin_rea_rea__compare_application_versions', {}],
  ['seo-specialist', 'mcp__plugin_scrapling_scrapling__get', { url: 'https://example.com' }],
  ['seo-specialist', 'mcp__plugin_scrapling_scrapling__stealthy_fetch', { url: 'https://example.com' }],
  ['copywriter', 'Write', W(`${R}/content/pricing.md`)],
  ['copywriter', 'Write', W(`${R}/README.md`)],
  ['', 'Bash', B('cat ~/.claude/settings.json | jq .permissions')],
  ['', 'Bash', B('head -50 ~/.claude/settings.json')],
  ['', 'Bash', B('cat ~/.claude/plugins/installed_plugins.json')],
]

test('daily work, real paths', async ($, on) => {
  serve(on)
  memoryStore(on)
  cwd(on, R)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/root' : undefined }))
  const roles = [...new Set(cases2.map(c => c[0]).filter(Boolean))]
  agents(on, Object.fromEntries(roles.map(r => [r, `chief-of-staff:${r}`])))
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  const notOk: string[] = []
  for (const [role, tool, input] of cases2) {
    const agentId = role || undefined
    const call = deny(await $.tool.call({ tool, ...input, agentId } as never))
    const chk = await $.tool.check({ tool, input, agentId, approver: 'person' } as never)
    const chk2 = await $.tool.check({ tool, input, agentId } as never)
    const v = call ? 'DENY' : chk.decision === 'ask' ? 'ASK' : chk.decision === 'deny' ? 'CHKDENY' : 'ok'
    const msg = call ?? (chk as { reason?: string }).reason ?? ''
    if (v !== 'ok') notOk.push(`${v} ${role} ${JSON.stringify(input)}${chk2.decision === 'deny' ? ' (no approver: refused)' : ''}${v === 'ASK' ? '' : ' => ' + msg}`)
  }
  expect(notOk).toEqual(EXPECTED_ASK)
})

test('A-E: what stays refused or asked next to the daily work', async ($, on) => {
  serve(on)
  memoryStore(on)
  cwd(on, R)
  on('env.get', (_, e) => ({ value: e.name === 'HOME' ? '/root' : undefined }))
  agents(on, { w: 'chief-of-staff:web-designer', r: 'chief-of-staff:reverse-engineer', c: 'chief-of-staff:creative-director', f: 'chief-of-staff:frontend-developer' })
  on('tool.call', () => ({ result: {} }))
  on('tool.check', () => ({ decision: 'allow' }))
  const call = async (agentId: string, tool: string, input: Record<string, unknown>) => deny(await $.tool.call({ tool, ...input, agentId } as never))
  const check = async (agentId: string, tool: string, input: Record<string, unknown>) => (await $.tool.check({ tool, input, agentId, approver: 'person' } as never)).decision
  // A: inline code that writes a protected place is still refused
  expect(String(await call('w', 'Bash', B(`node -e "require('fs').writeFileSync('$HOME/.claude/settings.json','{}')"`)))).toContain('Not allowed')
  expect(String(await call('w', 'Bash', B(`python3 -c "open('/root/.claude/plugins/x','w')"`)))).toContain('Not allowed')
  // B: REA tools that change a device, a process or the analysis ask
  for (const t of ['set_comment', 'push_adb_file', 'install_adb_package', 'uninstall_adb_package', 'start_adb_app', 'stop_adb_app', 'execute_rizin_command',
    'instrument_with_frida', 'load_frida_script', 'gdb_console', 'rizin_debug_command', 'cutter_command']) {
    expect(`${t} ${await check('r', `mcp__plugin_rea_rea__${t}`, {})}`).toBe(`${t} ask`)
    expect(`${t} ${await check('r', `mcp__rea__${t}`, {})}`).toBe(`${t} ask`)
  }
  for (const t of ['binary_overview', 'list_procedures', 'procedure_pseudo_code', 'search_strings', 'get_call_graph', 'inspect_macho', 'read_bytes', 'xrefs',
    'analyze_function', 'trace_application_feature', 'compare_application_versions', 'capture_web_screenshot', 'open_binary']) {
    expect(`${t} ${await check('r', `mcp__rea__${t}`, {})}`).toBe(`${t} allow`)
  }
  // C: md-only and no-scripts hold inside the project (outside temp folders); write-dirs open research/ and captures/ to reverse-engineer only
  expect(String(await call('r', 'Bash', B('curl -s https://example.com/app.js -o src/app.js')))).toContain('Role limit: reverse-engineer')
  expect(await call('r', 'Bash', B('curl -s https://example.com/app.js -o captures/app.js'))).toBeUndefined()
  expect(await call('r', 'Write', W(`${R}/research/data.json`))).toBeUndefined()
  expect(String(await call('c', 'Write', W(`${R}/research/data.json`)))).toContain('Role limit: creative-director')
  expect(String(await call('w', 'Bash', B(`echo x > ${R}/src/app.js`)))).toContain('Role limit: web-designer')
  expect(await call('w', 'Bash', B('echo x > /tmp/app.js'))).toBeUndefined()
  expect(String(await call('r', 'Bash', B('curl -s https://x.example/a -o /root/.claude/settings.json')))).toContain('Not allowed') // protected stays refused
  // D: remote branch deletes ask with their own message; mirror and prune stay refused
  expect(String((await $.tool.check({ tool: 'Bash', input: B('git push origin --delete main'), agentId: 'f' } as never) as { reason?: string }).reason))
    .toContain("Deleting a remote branch needs the person's OK")
  for (const c of ['git push --mirror origin', 'git push --prune origin']) expect(String(await call('f', 'Bash', B(c)))).toContain('a force push, mirror or prune')
  expect(String(await call('f', 'Bash', B('git filter-repo --path .env --invert-paths')))).toContain("leaked key's location")
  // E: local hosts
  for (const h of ['http://api.localhost:3000/x', 'http://host.docker.internal:3000/api', 'http://localhost:1/x', 'http://127.0.0.2/x', 'http://[::1]:3000/x', 'http://0.0.0.0:3000/x']) {
    expect(`${h} ${await check('f', 'Bash', B(`curl -X POST ${h} -d a=1`))}`).toBe(`${h} allow`)
  }
  expect(await check('f', 'Bash', B('curl -X POST http://localhost.example.com/x -d a=1'))).toBe('ask')
})
