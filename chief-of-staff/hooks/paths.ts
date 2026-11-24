/**
 * Places no agent may write: this plugin's own folder, installed plugins and
 * their store, Claude Code's settings, agents, skills, commands and hooks,
 * MCP and managed settings. A project's own CLAUDE.md is written only with
 * the person's OK.
 */

/** Where protection applies on this machine: the plugin's folder (as spelled and resolved), Claude Code's config folders, and $HOME. */
export type Protected = { roots: string[]; configDirs: string[]; home: string | undefined }

/** What may happen to a path: refused, asked of the person, or nothing. */
export type PathClass = 'deny' | 'ask' | undefined

/**
 * A path made plain: backslashes as slashes, a leading `~`, `$HOME` or
 * `${HOME}` expanded, `.` and `..` and repeated slashes resolved. Undefined
 * when it starts with `~` and $HOME is not known.
 */
export function normalize(path: string, home: string | undefined): string | undefined {
  let p = path.trim().replace(/\\/g, '/')
  const homeRef = /^(?:~|\$HOME|\$\{HOME\})(?=\/|$)/.exec(p)
  if (homeRef) {
    if (!home) return undefined
    p = home.replace(/\\/g, '/').replace(/\/+$/, '') + p.slice(homeRef[0].length)
  } else if (p.startsWith('~')) return undefined // ~user
  const drive = /^[A-Za-z]:(?=\/)/.exec(p)?.[0] ?? ''
  const rest = p.slice(drive.length)
  const isAbsolute = rest.startsWith('/')
  const out: string[] = []
  for (const part of rest.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') { if (out.length > 0 && out[out.length - 1] !== '..') out.pop(); else if (!isAbsolute) out.push('..'); continue }
    out.push(part)
  }
  return `${drive}${isAbsolute ? '/' : ''}${out.join('/')}` || (isAbsolute ? '/' : '.')
}

const strip = (d: string) => d.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const under = (p: string, dir: string) => { const d = strip(dir); return d !== '' && (p === d || p.startsWith(`${d}/`)) }

/** Claude Code's own folders inside a `.claude` folder: agents may not write them. */
const CLAUDE_DIRS = /(^|\/)\.claude\/(?:plugins|agents|skills|commands|hooks|output-styles)(\/|$)/
const CLAUDE_FILES = /(^|\/)\.claude\/settings[^/]*\.json$/
const ANY_FILES = /(^|\/)(?:\.claude\.json|\.mcp\.json|managed-settings\.json|managed-mcp\.json)$/
const MEMORY = /(^|\/)claude(?:\.local)?\.md$/

/**
 * Whether a plain path (see normalize) is refused for agents, needs the
 * person's OK (a project's CLAUDE.md or CLAUDE.local.md), or is fine.
 */
export function classify(path: string, at: Protected): PathClass {
  const p = path.toLowerCase()
  if (at.roots.some(r => under(p, r))) return 'deny'
  if (CLAUDE_DIRS.test(p) || CLAUDE_FILES.test(p) || ANY_FILES.test(p)) return 'deny'
  for (const d of at.configDirs) {
    const c = strip(d)
    if (/^(?:plugins|agents|skills|commands|hooks|output-styles)(\/|$)/.test(p.slice(c.length + 1)) && under(p, c)) return 'deny'
    if (under(p, c) && /^settings[^/]*\.json$|^claude(?:\.local)?\.md$/.test(p.slice(c.length + 1))) return 'deny'
  }
  if (/(^|\/)\.claude\/claude(?:\.local)?\.md$/.test(p) && at.home && under(p, `${at.home}/.claude`)) return 'deny'
  if (MEMORY.test(p)) return 'ask'
  return undefined
}

/** Whether a path is refused for agents (`classify` says deny), after normalising it; an unresolvable `~` counts. */
export function isProtectedPath(path: string, at: Protected | { roots: string[]; configDirs: string[] }): boolean {
  const full: Protected = { home: undefined, ...at }
  const n = normalize(path, full.home ?? (path.startsWith('~') ? '/~' : undefined))
  return n === undefined || classify(n, full) === 'deny' || classify(path.replace(/\\/g, '/'), full) === 'deny'
}

/**
 * Whether a command's text mentions a protected place, for commands that
 * write in ways the checks cannot follow: `.claude` with plugins, settings,
 * agents, skills, commands, hooks or CLAUDE.md; `.claude.json`, `.mcp.json`,
 * managed settings; the plugin's folder.
 */
export function mentionsProtected(plain: string, at: Protected): boolean {
  if (/\.claude/.test(plain) && /plug|setting|agent|skill|command|hook|claude\.md|output-style/.test(plain)) return true
  if (/\.claude\.json|\.mcp\.json|managed-settings|managed-mcp/.test(plain)) return true
  return at.roots.some(r => r !== '' && (plain.includes(strip(r)) || plain.includes(folderName(r))))
}

/** The last part of a folder's path: the plugin folder `chief-of-staff`. */
export function folderName(dir: string): string {
  const parts = strip(dir).split('/').filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  // An installed copy lives in .../chief-of-staff/<version>: the plugin's name is the folder above.
  return /^\d+\.\d+/.test(last) ? parts[parts.length - 2] ?? last : last
}

/** Whether a plain path has the plugin's folder name as one of its parts (`x/chief-of-staff/hooks/a.ts`). */
export function hasFolder(path: string, at: Protected): boolean {
  const parts = path.toLowerCase().split('/')
  return at.roots.some(r => { const f = folderName(r); return f !== '' && parts.includes(f) })
}
