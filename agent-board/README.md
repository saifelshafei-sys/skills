# agent-board

A live panel beside the Claude Code chat that shows every agent in the session as an org chart.
The main session sits at the top as the **Chief of Staff**; each agent it assigns appears under it
(and agents those agents spawn appear under them), with:

- its name or role and status (running, done, failed)
- the task it was given
- what it is doing right now ("Building hero.tsx", "Running: npm test")
- the files it has written
- a button that opens that agent's own transcript

Agents are grouped by department (Security, Quality & testing, Design & UX, Marketing & growth,
Docs & writing, Release & operations, Planning & research, Generalists, Engineering). Every agent
type the session can assign is listed, greyed out while idle; one that is working expands into a
card. The team list fills in after the first message, when Claude Code lists its agents. Departments
are picked from each agent's name (then its description); edit `DEPARTMENTS` in
`hooks/register.tsx` to change them, or add an agent to `OVERRIDES` there to place it by hand.

Open it with `/board`. It opens by itself when a session starts.

Tip: agents show by their `name`, so ask the Chief of Staff to name agents by role
("web-designer", "coder", "security") when it assigns them.

## Install

At the prompt of a terminal session:

```
/plugin marketplace add saifelshafei-sys/skills
/plugin install agent-board@saifelshafei-skills
```

From a shell:

```bash
claude plugin marketplace add saifelshafei-sys/skills
claude plugin install agent-board@saifelshafei-skills
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with
`saifelshafei-sys/skills`, then Add plugin.

This repository is private: installing needs a git credential for github.com on the machine
(an SSH key, or `gh auth login` then `gh auth setup-git`).

## Limits

It only sees agents inside the one session it runs in; separate sessions are not shown.
