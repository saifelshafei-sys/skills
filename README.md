# skills

## Skills

| Skill | Source | Use |
|---|---|---|
| [`find-skills`](find-skills/SKILL.md) | [vercel-labs/skills](https://github.com/vercel-labs/skills) | Searches skills.sh with `npx skills find` and installs matches |

Install one with `npx skills add saifelshafei-sys/skills --skill <name>`.

## Plugins

| Plugin | Use |
|---|---|
| [`agent-board`](agent-board/README.md) | Live panel showing every agent in a Claude Code session: role, task, current step, files built |
| [`chief-of-staff`](chief-of-staff/README.md) | Chief of Staff that delegates to named agents in departments you switch with `/team`: today twelve (reverse engineer, creative director, designer, frontend and backend developers, QA, security reviewer and engineer, marketing, copy, SEO, DevOps); each agent is one `.md` file |
| [`graphify`](graphify/README.md) | Vendored [graphify](https://github.com/Graphify-Labs/graphify) skill: turns code, docs and papers into a queryable knowledge graph. Needs the CLI: `uv tool install graphifyy` |
| [`web-craft`](web-craft/README.md) | Award-level website skills: `/awwwards` builds a site, `/jury` scores one, `/teardown` makes interactive 3D explainers of real machines |

Install in two steps, from a shell:

```bash
claude plugin marketplace add saifelshafei-sys/skills
claude plugin install <plugin>@saifelshafei-skills
```

Or inside a Claude Code session: `/plugin marketplace add saifelshafei-sys/skills`, then `/plugin install <plugin>@saifelshafei-skills`.
