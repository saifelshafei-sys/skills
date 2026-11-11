# web-craft

Three skills for award-level web work.

| Skill | What it does |
|---|---|
| `/awwwards` | Builds an award-caliber website from a one-line prompt: concept, art direction, type, motion, WebGL, real content, SEO, accessibility, performance, then visual QA in a browser. Next.js by default, Astro for static showcases. |
| `/jury` | Scores any website the way an Awwwards jury would, from evidence alone: screenshots, Web Vitals, axe, keyboard and SEO checks, then a blind critic scores it and ranks fixes. |
| `/teardown` | Builds an interactive 3D simulator of a real machine (engine, landing gear, linkage) as one offline HTML page, and records its tour to a 60 fps video with a synced score. |

## What they need

- **awwwards**: Node 20+, Playwright (with Chromium) and axe-core in the project for screenshots and accessibility checks. If no Chromium is found, run `npx playwright install chromium` once.
- **jury**: Node 20+, Playwright (with Chromium) and axe-core, from the project or from `~/.cache/jury` (the skill sets that up).
- **teardown**: Node and a Chromium. Run once in its folder: `npm install && npx playwright install chromium`. The video also needs `ffmpeg` on PATH and the score needs Python 3 (standard library only). `FFMPEG`, `PYTHON` and `CHROMIUM` override the binaries.

All three run shell commands, so the agent using them needs Bash. With the chief-of-staff team,
`creative-director` and `copywriter` have no Bash and can't run `/awwwards` or `/jury`; give
that work to `web-designer` (build) or `qa-tester` (score).

## Install

```
/plugin install web-craft --marketplace saifelshafei-sys/skills
```

## Credits

All three skills are third-party, MIT licensed, and copied unchanged. Each folder keeps its own `LICENSE`.

- `awwwards` and `jury`: [github.com/juliobsz/skills](https://github.com/juliobsz/skills), commit `add880b`
- `teardown`: [github.com/elvarofficial/teardown](https://github.com/elvarofficial/teardown), commit `a91262a`
