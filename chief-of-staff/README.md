# chief-of-staff

Makes your main Claude Code session a Chief of Staff that delegates to eleven named agents
(this plugin was called `website-team` before 0.6.0). The Chief of Staff plans and assigns the work; with the `agent-board` plugin each one shows on the board under its
department, greyed out while idle and as a live card while it works.

| Agent | Department on the board | Does |
|---|---|---|
| `reverse-engineer` | Planning & research | How another site or app does something, using [REA](https://github.com/morluto/rea); writes `.md` reports only, never copies code or assets |
| `creative-director` | Design & UX | Creative direction first (concept, mood, tone), then reviews design and copy before build; writes only `.md` notes |
| `web-designer` | Design & UX | Layout, visual design, design tokens, responsive behaviour |
| `frontend-developer` | Engineering | Pages, components, forms, client-side state |
| `backend-developer` | Engineering | APIs, database, auth, integrations |
| `qa-tester` | Quality & testing | End-to-end and automated tests, bug reports |
| `security-reviewer` | Security | Read-only security review with ranked findings and fixes |
| `marketing-strategist` | Marketing & growth | Audience, positioning, page message order, CTA |
| `copywriter` | Marketing & growth | Every word on the site |
| `seo-specialist` | Marketing & growth | Keywords, metadata, sitemap, structured data |
| `devops-engineer` | Release & operations | Hosting, CI, env vars, release checks; never deploys without your OK |

## The Chief of Staff always delegates

Your main session is the Chief of Staff. Two things make it delegate:

- **A hard rule.** The main session cannot use Edit, Write, MultiEdit or NotebookEdit: those calls are
  refused with a note to hand the work to an agent. Agents can still change files.
- **Role limits.** `reverse-engineer` and `creative-director` write only `.md` notes (its brief and reviews). `web-designer` cannot write scripts, build or config files (`.js`, `.ts`, `.py`,
  `.sh`, `wrangler.*`, `package.json`, CI files); styles, HTML and component markup are fine. Only
  `devops-engineer` can run deploy commands (`wrangler deploy`, `vercel --prod`, ...), the Chief of
  Staff included. A blocked agent is told who the work belongs to.
- **Instructions.** A "Chief of Staff" section in the main session's instructions lists the eleven roles
  and how to run the work: split it, brief each agent fully, run independent tasks in parallel, check
  reports, sum up. Agents never get this section.

It still answers plain questions itself. The status line shows `Chief of Staff: delegating` while the
rule is on. Turn it off and on per machine with `/delegate off` and `/delegate on`; `/delegate` shows
the setting.

You can also ask for roles directly: "Have the web designer and the frontend developer build the homepage,
then the security reviewer check it." Edit any file in `agents/` to change a role.

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
