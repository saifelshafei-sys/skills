# chief-of-staff

Makes your main Claude Code session a Chief of Staff that delegates to named agents, organised in
departments (this plugin was called `website-team` before 0.6.0). The Chief of Staff plans and assigns the
work; with the `agent-board` plugin each agent shows on the board, greyed out while idle and as a live
card while it works.

Since 0.10.0 the team is data: each agent's department, one-line job, limits and checks are in its own
`agents/<name>.md`, and the departments are in `departments.json`. Adding an agent is writing one file.

## Departments

The plan is a 50-agent organisation in twelve departments, added over several releases. All twelve exist
now; the five marked on are on by default. Turn them on and off with `/team`.

| Department (`id`) | Default | Agents today |
|---|---|---|
| Product & Engineering (`product-engineering`) | on | `reverse-engineer`, `frontend-developer`, `backend-developer`, `qa-tester`, `devops-engineer` |
| Security (`security`) | on | `security-reviewer`, `security-engineer` |
| Creative (`creative`) | on | `creative-director`, `web-designer`, `copywriter` |
| Marketing & PR (`marketing-pr`) | on | `marketing-strategist`, `seo-specialist` |
| Social (`social`) | on | none yet |
| Sales (`sales`) | off | none yet |
| Data & Analytics (`data-analytics`) | off | none yet |
| Finance (`finance`) | off | none yet |
| Risk, Audit & Compliance (`risk-audit-compliance`) | off | none yet |
| Legal (`legal`) | off | none yet |
| Operations & People (`operations-people`) | off | none yet |
| Strategy & Research (`strategy-research`) | off | none yet |

| Agent | Does |
|---|---|
| `reverse-engineer` | How another site or app does something, using [REA](https://github.com/morluto/rea); writes `.md` reports only, never copies code or assets |
| `creative-director` | Creative direction first (concept, mood, tone), then reviews design and copy before build; writes only `.md` notes |
| `web-designer` | Layout, visual design, design tokens, responsive behaviour |
| `frontend-developer` | Pages, components, forms, client-side state |
| `backend-developer` | APIs, database, auth, integrations |
| `qa-tester` | End-to-end and automated tests, bug reports |
| `security-reviewer` | Read-only security review with ranked findings and fixes |
| `security-engineer` | Fixes what the reviewer found and hardens the app (auth, inputs, headers, secrets, dependencies, monitoring); never deploys |
| `marketing-strategist` | Audience, positioning, page message order, CTA |
| `copywriter` | Every word on the site |
| `seo-specialist` | Keywords, metadata, sitemap, structured data |
| `devops-engineer` | Hosting, CI, env vars, release checks; never deploys without your OK |

(The agent-board plugin still groups agents by the words in their names, so its columns are not these
departments yet.)

### /team

- `/team` lists every department, whether it is on, and its agents (and any problems in the team files).
- `/team on <id>` and `/team off <id>` switch one (several ids may follow); `/team on all` and
  `/team off all` switch every one. The choice is kept per machine, like `/delegate`, and applies from
  your next message.

While a department is off, its agents are left out of the Chief of Staff's team list, its routing rules
are dropped, and the Chief of Staff is told it is off and how to turn it on, so it can tell you. If it
still tries to assign one of its agents, the call is refused with "ask the person to run
`/team on <id>`". Agents from other plugins and built-ins (`general-purpose`, `Explore`) are never refused.

## Adding an agent: one file

Write `agents/<name>.md` with Claude Code's usual agent frontmatter plus the team fields, and the body
(its instructions). No code change; the Chief of Staff reads the files at the start of each message.

```markdown
---
name: social-media-manager
description: Social media manager. Use to plan, write and schedule posts and replies for the brand's accounts.
tools: Read, Write, Edit, Glob, Grep, WebSearch, WebFetch
department: social
does: social posts, replies and the content calendar
write-limit: md-only
checked-by: creative-director
confirm: publish or schedule a post, reply in public
---

You are the team's social media manager. ...
```

| Field | Values | What it does |
|---|---|---|
| `name`, `description`, `tools`, `skills` | as in Claude Code | Unchanged: Claude Code reads them |
| `department` | an `id` from `departments.json` | Where the agent is listed and which `/team` switch controls it. Missing or unknown: the agent is listed under **Other** (always on), and `/team` shows the problem |
| `does` | one line | What the Chief of Staff reads about the role. Missing: the description's first sentence |
| `write-limit` | `none` (default), `md-only`, `no-scripts` | `md-only`: only `.md` reports and notes. `no-scripts`: no scripts, build or deploy config (`.js`, `.ts`, `.py`, `.sh`, `wrangler.*`, `package.json`, CI files...); styles, HTML and component markup are fine. An unknown value is read as `md-only`, the tightest |
| `can-deploy` | `true` | May run deploy commands (`wrangler deploy`, `vercel --prod`, ...) and `git push --force-with-lease`. Today only `devops-engineer` |
| `checked-by` | role names, comma-separated | Adds a routing line "`<role>`'s output goes to `<checker>` before it is called done" |
| `confirm` | actions, comma-separated | Adds a line telling the Chief of Staff this role needs your OK before those actions, and is named in the confirm gate's message |

Lists may also be written `[a, b]` or as `- item` lines. After adding or changing an agent file, run
`node scripts/fixture.mjs` so the tests check the new file too (see Tests).

### departments.json

Each department has `id`, `name`, a one-line `purpose`, `default` (`"on"` or `"off"`) and `rules`: the
routing lines the Chief of Staff gets while it is on. Rules that span departments (security review for
anything with a form, login, payment or user data; one agent, one role; web research; reverse engineer
first; never deploy, delete or spend without your OK) are part of the plugin's own text and always there.

## The Chief of Staff always delegates

Your main session is the Chief of Staff. These things make it delegate:

- **A hard rule.** The main session cannot use Edit, Write, MultiEdit or NotebookEdit: those calls are
  refused with a note to hand the work to an agent. Agents can still change files.
- **Role limits**, from each agent's frontmatter. `reverse-engineer` and `creative-director` are
  `md-only`; `web-designer` is `no-scripts`. Only `can-deploy` roles (`devops-engineer`) can run deploy
  commands, the Chief of Staff included. Rewriting git history is refused for everyone, the Chief of Staff
  included: `git filter-repo`, `git filter-branch`, BFG and force pushes (`--force`, `-f`, `+branch`); only
  `can-deploy` roles may `git push --force-with-lease`. Leaked keys are reported with their location and
  rotation steps for you to act on. A blocked agent is told who the work belongs to.
- **Departments.** Agents of a department that is off cannot be assigned (see `/team`).
- **The confirm gate.** When an agent (not the Chief of Staff) calls a connected (MCP) tool that clearly
  sends, posts, publishes, schedules, comments, likes, reacts, deletes, trashes, pays or transfers
  (`send_message`, `reply`, `forward`, `publish_draft`, `schedule_message`, `create_comment`,
  `commit_comment_draft`, `like_post`, `delete_event`, `trash_message`, `create_payment`, ...), you are
  asked first, with "Draft it and report back; the Chief of Staff does this only after the person
  confirms." Where nobody can be asked (a headless run) the call is refused with that message. Reading
  (`search_*`, `list_*`, `get_*`, `read_*`) and drafts (`create_draft`, `create_comment_draft`) pass. The
  Chief of Staff itself is not gated: it asks you in the conversation.
- **Instructions.** A "Chief of Staff" section in the main session's instructions, generated each message:
  the team grouped by department (only departments that are on and have agents), the departments that are
  off, department rules, the `checked-by` and `confirm` lines, and how to run the work: split it, brief
  each agent fully, run independent tasks in parallel, check reports, sum up. Agents never get this section.

It still answers plain questions itself. The status line shows `Chief of Staff: delegating` while the
rule is on. Turn it off and on per machine with `/delegate off` and `/delegate on`; `/delegate` shows
the setting. `/delegate off` lifts every rule above except the bot-protection one below.

You can also ask for roles directly: "Have the web designer and the frontend developer build the homepage,
then the security reviewer check it." For hardening, the security reviewer audits, the security engineer
fixes, and the security reviewer re-tests. Edit any file in `agents/` to change a role.

## Install

Inside a Claude Code session:

```
/plugin marketplace add saifelshafei-sys/skills
/plugin install chief-of-staff@saifelshafei-skills
```

From a shell:

```bash
claude plugin marketplace add saifelshafei-sys/skills
claude plugin install chief-of-staff@saifelshafei-skills
```

For the live agent board too:

```bash
claude plugin install agent-board@saifelshafei-skills
```

## Superpowers

If [Superpowers](https://github.com/obra/superpowers) is installed, the Chief of Staff uses its planning
skills (brainstorming, writing-plans) to split big jobs, and never its execution skills to do the
work itself: each step still goes to a role.

## REA for the reverse engineer

`reverse-engineer` uses REA's `reverse-engineer-anything` skill and MCP tools. Install REA once per
machine (see [morluto/rea](https://github.com/morluto/rea)):

```bash
claude plugin marketplace add morluto/rea
claude plugin install rea@rea
```

Without REA the agent still works from the public page alone and says so.

## taste-skill for the web designer

`web-designer` preloads taste-skill's `design-taste-frontend` skill when that plugin is installed; `creative-director` and `copywriter` don't, because they have no Bash and the skill needs it to run its scripts.

## Scrapling for web research

`seo-specialist`, `marketing-strategist` and `reverse-engineer` can use
[Scrapling](https://github.com/D4Vinci/Scrapling)'s MCP tools to capture pages and crawl sites. Its
CAPTCHA and Cloudflare solving is refused by a hook for every agent, whatever `/delegate` says.
Install once per machine (needs Python):

```bash
py -m pip install "scrapling[ai]"
scrapling install
claude mcp add --scope user scrapling -- scrapling-mcp
```

## Tests

From the repository root:

```bash
node chief-of-staff/scripts/fixture.mjs --check   # tests/files.ts matches agents/*.md and departments.json
claude plugin test chief-of-staff                 # the hook tests
claude plugin validate chief-of-staff             # manifest, hooks and type check
```

The plugin reads its agent files at run time. The tests run with no file system, so they read a copy,
`tests/files.ts`; `node chief-of-staff/scripts/fixture.mjs` rewrites it after you change a team file.
