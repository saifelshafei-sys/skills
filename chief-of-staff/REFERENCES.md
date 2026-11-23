# References for building agents

**Source:** msitarzewski/agency-agents (https://github.com/msitarzewski/agency-agents), pinned to commit `8ae6164`. MIT License, © 2025 AgentLand Contributors. About 300 agent personality prompts in 22 folders.

## How to use it

- It's reference material only. Never install it into `~/.claude/agents/`: those agents would sit outside every chief-of-staff guardrail (department, write limits, checker, confirm gate), and 300 of them would swamp routing.
- To build a department: clone that commit (`git clone https://github.com/msitarzewski/agency-agents.git && git -C agency-agents checkout 8ae6164`), read the closest agents, then write NEW chief-of-staff agent files in this plugin's format:
  - frontmatter `department`, `does`, `write-limit`, `checked-by`, `confirm` (see README)
  - a short Rules section, including the "report a refusal, never work around it" rule
  - Report back
- Adapt and shorten. Don't copy files verbatim; their files are long personality prompts.
- Credit agency-agents (MIT) in the README when an agent is adapted from it.

## Map (department → their agents worth adapting)

| Department | From agency-agents |
|---|---|
| Finance | Financial Analyst, FP&A Analyst, Bookkeeper & Controller, Tax Strategist |
| Sales & Deals | Pipeline Analyst, Deal Strategist, Proposal Strategist, Outbound Strategist, Offer & Lead Gen Strategist |
| Risk, Audit & Compliance | Compliance Auditor, Legal Compliance Checker |
| Marketing & PR / Social | the marketing/ folder (37 agents); Paid Social Strategist and Ad Creative Strategist from paid-media/ |
| Creative | Brand Guardian, UX Architect, UX Researcher, Visual Storyteller, UI Finish-Gate Reviewer |
| Product & Engineering | Product Manager, Sprint Prioritizer, API Tester, Accessibility Auditor, Performance Benchmarker |
| Security | Penetration Tester, Incident Responder, Secrets & Credential Hygiene Engineer |
| Operations & People | Senior Project Manager, Meeting Notes Specialist, Executive Summary Generator, Support Responder |

## Not covered there, so write from scratch

Credit analyst, model risk validator, internal auditor, controls analyst, VBA developer.

## Updating the pin

Check the new commit's LICENSE is still MIT, then update the commit above.
