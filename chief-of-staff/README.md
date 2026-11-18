# chief-of-staff

Makes your main Claude Code session a Chief of Staff that delegates to named agents, organised in
departments (this plugin was called `website-team` before 0.6.0). The Chief of Staff plans and assigns the
work; with the `agent-board` plugin each agent shows on the board, greyed out while idle and as a live
card while it works.

Since 0.10.0 the team is data: each agent's department, one-line job, limits and checks are in its own
`agents/<name>.md`, and the departments are in `departments.json`. Adding an agent is writing one file.

**These hooks are best-effort guardrails against mistakes and prompt injection, not containment.** They
match tool names and command text, and a determined command can be spelled another way. Real containment
comes from the environment's network policy and Claude Code's permission mode and rules. Every guardrail
here fails closed: when the plugin cannot tell what a call is, it refuses or asks.

**The guardrails only run when Claude Code loads the plugin's hooks module.** See
[Are the hooks running?](#are-the-hooks-running) below: without it, the agents still exist, but no limit
is enforced.

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
- `/team on <id>` and `/team off <id>` switch departments (several ids, separated by spaces or commas);
  `/team on all` and `/team off all` switch every one; `/team reset` goes back to the defaults. An unknown
  id changes nothing. The choice is kept per machine, like `/delegate`, and applies from your next message.

While a department is off, its agents are left out of the Chief of Staff's team list and are not offered
to the model, its routing rules are dropped, and the Chief of Staff is told it is off and how to turn it
on, so it can tell you. A rule that names a role in a department that is off says so ("ask the person to
run `/team on <id>` first"). If the Chief of Staff still tries to assign one of its agents, the call is
refused with "ask the person to run `/team on <id>`", however the type is capitalised. Agents from other
plugins and built-ins (`general-purpose`, `Explore`) are never refused. `/delegate off` does not lift this.

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
| `name`, `description`, `tools`, `skills` | as in Claude Code | Unchanged: Claude Code reads them (it logs the team fields below as keys it does not apply, which is expected) |
| `department` | an `id` from `departments.json` | Where the agent is listed and which `/team` switch controls it. Missing or unknown: the agent **cannot be assigned** until the file is fixed, and `/team` lists it |
| `does` | one line | What the Chief of Staff reads about the role. Missing: the description's first sentence |
| `order` | a whole number | Where the agent sits in its department's list, lowest first (the shipped roles use 10, 20, ...). Without it, after the numbered ones, by name |
| `write-limit` | `none` (default), `no-scripts`, `md-only` | `md-only`: only `.md` reports and notes. `no-scripts`: no scripts, build or deploy config (`.js`, `.ts`, `.py`, `.sh`, `wrangler.*`, `package.json`, CI files...); styles, HTML and component markup are fine. It can only **tighten**: the shipped roles keep the limits in the plugin's code (see below) whatever their file says |
| `limit-hint` | one line, quoted | Added to the role's denial message ("Describe the technique in your report; ...") |
| `can-deploy` | `true` | Honoured **only** for a role the plugin's code allows to deploy (today only `devops-engineer`), and only as the exact type `chief-of-staff:<name>`. A new role gets deploy rights only by being added to `FLOOR` in `hooks/register.ts`, a code change on purpose |
| `checked-by` | role names, comma-separated | Adds a routing line "`<role>`'s output goes to `<checker>` before it is called done" |
| `confirm` | actions, comma-separated | Adds a line telling the Chief of Staff this role needs your OK before those actions, and is named in the confirm gate's message |

Lists may also be written `[a, b]` or as `- item` lines. There are no inline comments: a `#` inside a
value is part of it. Quote a value that holds `: `.

**A file with any problem cannot be assigned until it is fixed, and its agent writes only `.md`**: an
unknown department, `write-limit` or `can-deploy` value, a key given twice (in any case, `Name:` and
`name:`), or a second file with the same `name`. `/team` and the Chief of Staff's instructions list them.
Only regular files of up to 64 KiB are read (no links, no FIFOs). An agent of this plugin whose file is
missing writes only `.md` and never deploys.

**The floor.** `FLOOR` in `hooks/register.ts` holds the twelve shipped roles' limits: `web-designer`
`no-scripts`, `reverse-engineer` and `creative-director` `md-only`, and only `devops-engineer` may deploy.
A file can make its role stricter than that, never looser.

After adding or changing an agent file, run `node scripts/fixture.mjs` so the tests check the new file
too (see Tests).

### departments.json

Each department has `id`, `name`, a one-line `purpose`, `default` (`"on"` or `"off"`) and `rules`: the
routing lines the Chief of Staff gets while it is on. Rules that span departments (security review for
anything with a form, login, payment or user data; one agent, one role; web research; reverse engineer
first; never deploy, delete or spend without your OK) are part of the plugin's own text and always there.
If `departments.json` is missing or broken, the plugin uses its built-in copy of the twelve departments
and their defaults (without the routing rules) and `/team` says so.

## The Chief of Staff always delegates

Your main session is the Chief of Staff. These things make it delegate:

- **A hard rule.** The main session cannot use Edit, Write, MultiEdit or NotebookEdit: those calls are
  refused with a note to hand the work to an agent. Agents can still change files. This is the only rule
  `/delegate off` lifts.
- **Role limits**, from the floor and each agent's frontmatter. `reverse-engineer` and `creative-director`
  are `md-only`; `web-designer` is `no-scripts`. The same limits apply to MCP file tools (`write_file`,
  `edit_block`, `move_file`, ...) through their path arguments. An agent whose type cannot be told gets
  the tightest limits (`md-only`, no deploy).
- **Deploys and history.** Only `devops-engineer` can run deploy commands (`wrangler deploy`,
  `npx wrangler@3 deploy`, `vercel`, `vercel --prod`, `netlify deploy`, `npm run deploy`,
  `npm run-script deploy`, `pnpm -C site deploy`, `make deploy`, ...), the Chief of Staff included.
  Rewriting git history is refused for everyone: `git filter-repo`, `git filter-branch`, BFG and pushes
  that overwrite or delete on the remote (`--force`, `-f`, `--mirror`, `--delete`, `-d`, `+branch`,
  `:branch`, quoted or not); only `devops-engineer` may `git push --force-with-lease`. The same checks run
  over the arguments of MCP tools that run processes, shells or commands. Leaked keys are reported with
  their location and rotation steps for you to act on. A blocked agent is told who the work belongs to.
- **Protected paths.** No agent may write this plugin's own folder (its real path too), installed
  plugins and their store (`.claude/plugins/`), or Claude Code's settings files (`.claude/settings*.json`),
  with the file tools, MCP file tools or a shell command that writes there (best effort).
- **Departments.** Agents of a department that is off cannot be assigned (see `/team`).
- **The confirm gate**, an allow-list. When an agent (not the Chief of Staff) calls a connected (MCP)
  tool, you are asked first, with "Draft it and report back; the Chief of Staff does this only after the
  person confirms.", unless the tool is clearly read-only. Only an approval dialog for a person counts:
  where nobody can be asked, or a host would answer, the call is refused with that message.
  - Read-only means the engine says so, or every word of the tool's name is a read verb (`get`, `list`,
    `search`, `read`, `find`, ...) or a known noun, and the first word is not an action (`get_post`
    passes, `post_status` asks). Anything unknown asks.
  - Drafts pass: `create_draft`, `update_draft`, `create_comment_draft`, Slack's `send_message_draft`.
    Any other action next to "draft" (`send_draft`, `publish_draft`, `commit_comment_draft`) asks.
  - Names that hide a send, post, pay, publish, deploy, delete, transfer, refund, charge, merge or push
    (`sendmessage`, `SMSSend`) ask, and so do tools that run other tools or code (Composio
    `MULTI_EXECUTE` and `PROXY_EXECUTE`, `apps_invoke`, `execute_*`, process, shell and browser exec tools).
  - Generating images, video, audio, voices and designs (Higgsfield `generate_*`, `create_voice`,
    `upscale_*`, `remove_background`; Canva `create-design`, `generate-design`, `generate-image`;
    text-to-speech) passes while generation credits are `free`, the default; `/delegate credits ask` makes
    each one ask. Renting GPUs, buying credits, publishing, sharing, deploying, sending, ads writes,
    contests, connecting accounts and secrets or databases always ask.
  - Shell commands that run `claude`, change GitHub (`gh pr merge`, `gh release create|delete|edit`,
    `gh repo delete|edit`, `gh workflow run`, `gh api` with a write method or `-f`/`-F` fields), or send
    data to another host with `curl` or `wget` (a non-GET method, `-d`, `--data*`, `-F`, `--upload-file`;
    localhost is fine) ask the same way.
  - The Chief of Staff itself is not gated: it asks you in the conversation.
- **Instructions.** A "Chief of Staff" section in the main session's instructions, generated each message:
  the team grouped by department (only departments that are on and have assignable agents), the
  departments that are off, agent files with problems, department rules, the `checked-by` and `confirm`
  lines, and how to run the work: split it, brief each agent fully, run independent tasks in parallel,
  check reports, sum up. Agents never get this section.

It still answers plain questions itself. The status line shows `Chief of Staff: delegating` while the
rule is on. Turn it off and on per machine with `/delegate off` and `/delegate on`; `/delegate` shows the
settings, and `/delegate credits ask` or `/delegate credits free` sets generation credits.

You can also ask for roles directly: "Have the web designer and the frontend developer build the homepage,
then the security reviewer check it." For hardening, the security reviewer audits, the security engineer
fixes, and the security reviewer re-tests. Edit any file in `agents/` to change a role.

## Are the hooks running?

Every rule above lives in the plugin's hooks module (`hooks/register.ts`). Claude Code (checked on 2.1.327)
loads the hooks module of a plugin you installed yourself only when all of these hold:

- Its rollout switch for installed plugins' hooks modules (`tengu_plugin_hooks_modules`, a server-side
  feature flag) is on for your account. While the session's first flag fetch has not answered, the
  module waits and loads at a turn start once it reads on: the line "hooks modules are turned off for
  installed plugins in this process: this wake's flag fetch has not answered the rollout switch" is that
  wait, and is normally followed by the module loading. If the switch is served off, the module never
  loads in that process.
- Managed settings do not set `disableAllHooks` or `allowManagedHooksOnly`, and the session is not
  started with `--bare` or `--safe-mode`.

There is no setting of your own that forces the switch on. A plugin your organization manages, or one
built into Claude Code, loads regardless.

To check: `/delegate` and `/team` exist and answer, and the status line shows
`Chief of Staff: delegating`. Or run `claude --debug` and look in the debug log for
`hooks module chief-of-staff@... loaded` or `... not loaded: <why>`. If the hooks are not loaded, the
agents and their `tools:` lists still work, but nothing here is enforced: the Chief of Staff can edit
files, any agent can deploy, and nothing asks before a send. In that case keep Claude Code's own
permission rules (for example `deny` rules for `Bash(wrangler deploy:*)` and `Bash(git push --force:*)`)
and a permission mode that asks.

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
Under the confirm gate, `browser_fetch`, `browser_fetch_once`, `browser_extract`, `browser_screenshot`
and `list_sessions` run without asking; `make_request`, `session_make_request`, `open_request_session`,
`browser_open`, `browser_network_request(s)` and `close_session` ask you first, because their names do
not say they only read (`make_request` can send any HTTP method).
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
`tests/gate-names.ts` holds the confirm gate's tables: every tool name QA and the security review tried.
