# graphify

A vendored copy of the `graphify` skill from
[Graphify-Labs/graphify](https://github.com/Graphify-Labs/graphify), packaged as a Claude Code
plugin. It turns a folder of code, docs, papers and images into a knowledge graph you can query
(`/graphify`, then query, path and explain), with an HTML view, JSON and a `GRAPH_REPORT.md`.

- Vendored version: **0.9.113** (see `skills/graphify/.graphify_version`)
- The skill text in `skills/graphify/` is copied unchanged from upstream.
- License: Apache-2.0, see [LICENSE](LICENSE) and [NOTICE](NOTICE). Parts contributed before
  upstream relicensed remain under MIT, see [LICENSE-MIT](LICENSE-MIT).

## It needs the CLI

The skill drives the `graphify` command-line tool. Without it the skill does nothing useful.

```bash
uv tool install graphifyy
```

The PyPI package is `graphifyy`, with two y's. Other `graphify*` packages on PyPI are not
affiliated with this project.

## If you use the owner's cloud environment

That environment's setup script already installs the CLI and a user-level copy of the skill
(`~/.claude/skills/graphify`). Installing this plugin as well gives you a second skill,
`graphify:graphify`, next to `graphify`. Pick one: either skip the plugin there, or remove the
user-level copy.

## Privacy

- Code is parsed locally (AST). It is not sent anywhere.
- Docs, images and PDFs need semantic extraction. Inside Claude Code that uses the session's own
  model, or Google Gemini if `GEMINI_API_KEY` or `GOOGLE_API_KEY` is set.
- The headless CLI (run outside a Claude session) uses whichever provider key is set in the
  environment.
- `--code-only` skips docs, papers and images and keeps everything local.

## Install

```bash
claude plugin marketplace add saifelshafei-sys/skills
claude plugin install graphify@saifelshafei-skills
```

## Updating to a new upstream version

```bash
uv tool upgrade graphifyy      # new CLI
graphify install               # refreshes ~/.claude/skills/graphify
graphify/scripts/sync.sh       # copies the skill here and sets plugin.json's version
git diff                       # review the upstream changes
```

`sync.sh` takes an optional path to the skill folder (or `GRAPHIFY_SKILL_DIR`); it defaults to
`~/.claude/skills/graphify`. Check upstream's LICENSE and NOTICE for changes too, update the
version in this README, and commit.
