/**
 * What a shell command runs, for the limits: deploys, history rewrites, force
 * pushes, and the commands an agent may run only with the person's OK.
 *
 * These are best-effort guardrails against mistakes and prompt injection, not
 * containment: a determined command can always be spelled another way. Real
 * containment comes from the environment's network policy and permission mode.
 */

/** Commands that ship the site; only a role the FLOOR lets deploy (devops-engineer) runs them. */
export const DEPLOY = new RegExp([
  String.raw`(?:node\s+(?:-\S+\s+)*\S*)?wrangler(?:@\S+|\.[cm]?js)?\s+(?:-\S+\s+)*(?:deploy|publish|pages\s+deploy|versions\s+deploy)`,
  String.raw`vercel(?:@\S+)?\s+(?:[^\s;&|]+\s+)*?(?:deploy|--prod)`,
  String.raw`vercel(?:@\S+)?(?=\s*(?:$|[;&|\n)]))`,
  String.raw`netlify(?:-cli)?(?:@\S+)?\s+(?:-\S+\s+)*deploy`,
  String.raw`firebase(?:-tools)?(?:@\S+)?\s+(?:-\S+\s+)*deploy`,
  String.raw`npm\s+(?:(?:--prefix|-C|-w|--workspace)\s+\S+\s+)*(?:run|run-script)\s+(?:-\S+\s+)*deploy`,
  String.raw`pnpm\s+(?:(?:-C|--dir|--filter|-F|-w|--workspace-root)\s*\S*\s+)*(?:run\s+)?deploy`,
  String.raw`yarn\s+(?:(?:--cwd|workspace)\s+\S+\s+)*(?:run\s+)?deploy`,
  String.raw`bun\s+(?:run\s+)?deploy`,
  String.raw`make\s+(?:[^\s;&|]+\s+)*?deploy`,
].map(s => `(?:${s})`).join('|').replace(/^/, '(?:') + String.raw`)(?![\w-])`, 'i')

/** Where a command starts: line start, `;`, `&`, `|`, newline, `(`, `$(`, a backtick or `{`. */
const COMMAND_START = String.raw`(?:^|[;&|\n(\x60{])\s*`
/** What may come before the command: shell keywords, `FOO=1` env assignments, runners such as npx. */
const COMMAND_PREFIX = String.raw`(?:(?:then|do|else|elif|if|while|until|!)\s+)*(?:[A-Za-z_]\w*=\S*\s+)*` +
  String.raw`(?:(?:npx|bunx|pnpm\s+(?:dlx|exec)|yarn\s+dlx|sudo|env|command|exec|nohup|time|xargs)\s+(?:-\S+\s+)*(?:[A-Za-z_]\w*=\S*\s+)*)*(?:\S*\/)?`
/** `git` with its global options (`-C dir`, `-c k=v`, `--no-pager`) before the subcommand. */
const GIT = String.raw`git\s+(?:-[cC]\s+\S+\s+|--?[\w-]+(?:=\S*)?\s+)*`
/** Tools that rewrite a repository's history: refused for everyone. */
export const HISTORY_REWRITE = new RegExp(String.raw`(?:${GIT}filter-(?:repo|branch)|git-filter-repo|bfg|java\s+(?:-\S+\s+)*-jar\s+\S*bfg[\w.-]*\.jar)(?![\w-])`, 'i')
/**
 * A push that overwrites or removes what is on the remote: `--force`, `-f`
 * (or `-uf`), `--mirror`, `--delete`, `-d`, a `+branch` or a `:branch` refspec.
 */
export const FORCE_PUSH = new RegExp(String.raw`${GIT}push(?![\w-])[^;&|\n)]*?\s(?:--force(?![\w-])|--mirror(?![\w-])|--delete(?![\w-])|-[A-Za-z]*[fd][A-Za-z]*(?![\w-])|\+[^\s+]|:[^\s:])`, 'i')
/** `git push --force-with-lease`: normal branch work, so roles the FLOOR lets deploy (devops-engineer) only. */
export const LEASE_PUSH = new RegExp(String.raw`${GIT}push(?![\w-])[^;&|\n)]*?\s--force-with-lease(?![\w-])`, 'i')

/** A shell that runs a heredoc body or a quoted string as commands: keep that text. */
const RUNS_HEREDOC = /\b(ba|z|da|k)?sh\s*$/
const RUNS_QUOTED = /(\b(ba|z|da|k)?sh\s+(-\w+\s+)*-\w*c\s*|\beval\s+)$/

/**
 * Whether a shell command actually runs `pattern`, not merely mentions it.
 * Heredoc bodies and quoted strings are dropped first (unless a shell runs
 * them: `bash -c "..."`, `eval '...'`, `bash <<EOF`, or `"$(...)"`), then the
 * pattern must sit at a command position. When unsure, it says yes.
 */
export function runsCommand(command: string, pattern: RegExp): boolean {
  const source = pattern.source.startsWith(String.raw`\b`) ? pattern.source.slice(2) : pattern.source
  return new RegExp(COMMAND_START + COMMAND_PREFIX + `(?:${source})`, 'i').test(runnableText(command))
}

/** Whether a shell command actually runs a deploy, not merely mentions one. */
export function runsDeploy(command: string): boolean {
  return runsCommand(command, DEPLOY)
}

/** Whether a command force-pushes or deletes on the remote; a quoted `"+main"` or `':main'` refspec counts. */
export function runsForcePush(command: string): boolean {
  return runsCommand(command, FORCE_PUSH) || runsCommand(command.replace(/(["'])([+:][^\s"']+)\1/g, '$2'), FORCE_PUSH)
}

/** Whether a command rewrites history or overwrites the remote: refused for everyone. */
export function rewritesHistory(command: string): boolean {
  return runsCommand(command, HISTORY_REWRITE) || runsForcePush(command)
}

/** The command with inert text (heredoc bodies, quoted strings) emptied, so only what runs is left. */
export function runnableText(command: string): string {
  const noHeredocs = command.replace(
    /(?<!<)<<(-?)[ \t]*(['"]?)([A-Za-z_][\w.-]*)\2([^\n]*)(?:\n[\s\S]*?(?:\n[ \t]*\3[ \t]*(?=\n|$)|$)|$)/g,
    (all, _dash, _q, _tag, rest, offset: number, whole: string) => {
      const before = whole.slice(whole.lastIndexOf('\n', offset - 1) + 1, offset)
      return RUNS_HEREDOC.test(before) ? all : `<<HEREDOC${rest}`
    })
  return noHeredocs.replace(/'[^']*'|"(?:[^"\\]|\\[\s\S])*"/g, (quoted, offset: number, whole: string) => {
    const inner = quoted.slice(1, -1)
    if (RUNS_QUOTED.test(whole.slice(0, offset))) return `(${inner})`
    const q = quoted[0] ?? ''
    if (q === '"' && /\$\(|\x60/.test(inner)) return `(${inner})`
    return q + q
  })
}

/** The runnable command split into simple commands (`a && b | c` is three). */
function segments(command: string): string[] {
  return runnableText(command).split(/[;&|\n()\x60{}]+/).map(s => s.trim()).filter(Boolean)
}

/** A segment with its leading env assignments, `sudo`, `env`, `command` and paths dropped: `FOO=1 /usr/bin/curl x` is `curl x`. */
function bare(segment: string): string {
  return segment
    .replace(/^(?:(?:then|do|else|elif|if|while|until|!)\s+)*/, '')
    .replace(/^(?:(?:[A-Za-z_]\w*=\S*|sudo|env|command|exec|nohup|time|npx|bunx)\s+(?:-\S+\s+)*)*/, '')
    .replace(/^\S*\//, '')
}

/** `claude`, any way it is run. */
export const CLAUDE_CLI = /claude(?:\.exe)?(?![\w.-])/i
/** GitHub CLI commands that change a repository, a release or a workflow. */
export const GH_WRITE = /gh\s+(?:-\S+\s+\S+\s+)*(?:pr\s+merge|release\s+(?:create|delete|edit|upload)|repo\s+(?:delete|edit|archive|rename|transfer)|workflow\s+(?:run|enable|disable)|secret\s+(?:set|delete)|variable\s+(?:set|delete))(?![\w-])/i
const GH_API = /^gh\s+(?:-\S+\s+\S+\s+)*api(?![\w-])/i
const GH_API_WRITE = /\s(?:-X\s*|--method[=\s]+)['"]?(?:POST|PUT|PATCH|DELETE)\b|\s-[fF](?:\s|$)|\s--(?:raw-)?field(?:[=\s]|$)|\s--input(?:[=\s]|$)/i
const HTTP_TOOL = /^(?:curl|wget|http|https|xh)(?![\w.-])/i
const HTTP_WRITE = /\s(?:-X\s*|--request[=\s]+|--method[=\s]+)['"]?(?!GET\b|HEAD\b|OPTIONS\b)\w+|\s-[a-zA-Z]*[dFT]|\s--(?:data[\w-]*|form[\w-]*|upload-file|json|post-data|post-file|body-data|body-file)(?:[=\s]|$)/
const LOCAL_HOST = /^(?:localhost|127(?:\.\d{1,3}){3}|\[::1\]|::1|0\.0\.0\.0)$/i

/** Whether an HTTP client segment sends data to, or changes something on, a host that is not this machine. */
function httpWrites(segment: string): boolean {
  if (!HTTP_WRITE.test(` ${segment}`)) return false
  const hosts = [...segment.matchAll(/\b[a-z][\w+.-]*:\/\/(?:[^@\s/]*@)?(\[[^\]]+\]|[^\s/:?#]+)/gi)].map(m => m[1] ?? '')
  return hosts.length === 0 || hosts.some(h => !LOCAL_HOST.test(h))
}

/**
 * Why an agent's shell command needs the person's OK, or undefined: it runs
 * `claude`, changes GitHub (merge, release, repo, workflow, `gh api` writes),
 * or sends data to another host with curl or wget. When unsure, it says yes.
 */
export function shellNeedsPerson(command: string): string | undefined {
  if (runsCommand(command, CLAUDE_CLI)) return 'starts Claude Code (claude)'
  if (runsCommand(command, GH_WRITE)) return 'changes a GitHub repository, release or workflow (gh)'
  for (const s of segments(command).map(bare)) {
    if (GH_API.test(s) && GH_API_WRITE.test(` ${s}`)) return 'writes through the GitHub API (gh api)'
    if (HTTP_TOOL.test(s) && httpWrites(s)) return 'sends data to another host (curl or wget)'
  }
  return undefined
}

/** A command that writes, moves, links or removes files (redirects, tee, cp, mv, sed -i, ...). */
const SHELL_WRITES = /(?:^|[^<>&\d])>{1,2}(?!&)|\b(?:tee|cp|mv|rm|rmdir|ln|install|rsync|dd|truncate|touch|chmod|chown|mkdir|unlink|patch|ed|ex|vi|vim|nano)\b|\b(?:sed|perl|ruby)\s+(?:-\S+\s+)*-\w*i|\bgit\s+(?:-C\s+\S+\s+)*(?:checkout|restore|apply|am|reset|clean|stash)\b|\b(?:python3?|node|bun|deno)\b[\s\S]*\b(?:write|open|unlink|rename|rm|copy)\w*\s*\(/i

/**
 * Whether a command writes to one of `protectedPaths` (spelled as given):
 * the path appears in the command and the command writes files. Best effort.
 */
export function shellWritesTo(command: string, protectedPaths: string[]): boolean {
  if (!SHELL_WRITES.test(command)) return false
  const text = command.replace(/\\/g, '/').toLowerCase()
  return protectedPaths.some(p => p !== '' && text.includes(p.replace(/\\/g, '/').toLowerCase()))
}
