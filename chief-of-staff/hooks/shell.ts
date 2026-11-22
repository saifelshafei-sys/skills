/**
 * What a shell command runs, for the limits: deploys, history rewrites, force
 * pushes, writes to protected places, and the commands an agent may run only
 * with the person's OK.
 *
 * A command is read by a small tokenizer that walks it once (quotes, escapes,
 * `$(...)` and backticks, `bash -c`, `eval`, heredocs fed to a shell,
 * redirects, `cd`), so no check can backtrack. Commands over MAX_COMMAND
 * characters are not read at all: an agent's ask the person, or are refused.
 *
 * These are best-effort guardrails against mistakes and prompt injection, not
 * containment: a determined command can always be spelled another way (a
 * variable for the program name, base64, a script file, an alias). Real
 * containment comes from the environment's network policy and permission
 * mode. README.md lists the known gaps.
 */

/** The longest command (or MCP command field) the checks read; a longer one from an agent asks or is refused. */
export const MAX_COMMAND = 16 * 1024

/** One word as the shell would pass it: quotes and escapes removed. `dynamic`: it holds a variable, a substitution or a glob. */
export type Word = { text: string; dynamic: boolean }
/** A redirect: its operator and its target. */
export type Redirect = { op: string; target: Word }
/** A simple command as written: its words (assignments and wrappers included) and redirects. */
export type Simple = { words: Word[]; redirects: Redirect[]; heredocs: string[] }

const SHELLS = new Set(['sh', 'bash', 'zsh', 'dash', 'ksh', 'ash', 'fish', 'pwsh', 'powershell'])
const MAX_DEPTH = 6
/** One budget for a whole command, nested parses included: past it the command is unreadable. */
export const MAX_SIMPLE_COMMANDS = 2000
export const MAX_SCANNED = 4 * 16 * 1024
export type Budget = { simples: number; chars: number; over: boolean }
const newBudget = (): Budget => ({ simples: 0, chars: 0, over: false })

/** Decodes a `$'...'` body's C escapes (`\n`, `\t`, `\xHH`, `\0NNN`, `\'`). */
function cEscapes(body: string): string {
  return body.replace(/\\(x[0-9a-fA-F]{1,2}|[0-7]{1,3}|u[0-9a-fA-F]{1,4}|.)/g, (_, e: string) => {
    if (e[0] === 'x' || e[0] === 'u') return String.fromCharCode(parseInt(e.slice(1), 16))
    if (/^[0-7]/.test(e)) return String.fromCharCode(parseInt(e, 8))
    return ({ n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', e: '\x1b', f: '\f', v: '\v' } as Record<string, string>)[e] ?? e
  })
}

/** Reads `$(...)` (from just after `$(`) or a backtick body; returns the body and the index after it. Linear. */
function readGroup(s: string, i: number, close: ')' | '`', nest = 0): [string, number] {
  if (nest > 32) return [s.slice(i), s.length]
  let depth = 1
  let j = i
  while (j < s.length) {
    const c = s[j]
    if (c === '\\') { j += 2; continue }
    if (close === ')') {
      if (c === "'") { const k = s.indexOf("'", j + 1); j = k < 0 ? s.length : k + 1; continue }
      if (c === '"') { j = skipDouble(s, j + 1, nest + 1); continue }
      if (c === '(') depth++
      else if (c === ')' && --depth === 0) return [s.slice(i, j), j + 1]
    } else if (c === '`') return [s.slice(i, j), j + 1]
    j++
  }
  return [s.slice(i), s.length]
}

/** The index after a double-quoted string that starts at `i` (just after the quote). Linear. */
function skipDouble(s: string, i: number, nest = 0): number {
  if (nest > 32) return s.length
  let j = i
  while (j < s.length) {
    const c = s[j]
    if (c === '\\') { j += 2; continue }
    if (c === '"') return j + 1
    if (c === '$' && s[j + 1] === '(') { j = readGroup(s, j + 2, ')', nest + 1)[1]; continue }
    if (c === '`') { j = readGroup(s, j + 1, '`', nest + 1)[1]; continue }
    j++
  }
  return s.length
}

/**
 * Splits a command into simple commands, walking it once: `;`, `&`, `|`,
 * newlines, parentheses and braces separate commands; quotes and escapes are
 * removed from words; `$(...)` and backticks are read as commands of their
 * own; a heredoc's body is read as commands only when a shell reads it.
 */
export function parse(command: string, depth = 0, budget: Budget = newBudget()): Simple[] {
  const out: Simple[] = []
  budget.chars += command.length
  if (depth > MAX_DEPTH || budget.chars > MAX_SCANNED || budget.over) { budget.over = true; return out }
  let cur: Simple = { words: [], redirects: [], heredocs: [] }
  let text = ''
  let dynamic = false
  let started = false
  let pendingOp: string | undefined
  const pendingHeredocs: { tag: string; strip: boolean; into: Simple }[] = []
  const subs: string[] = []
  const endWord = () => {
    if (!started) return
    const w = { text, dynamic }
    if (pendingOp !== undefined) {
      // A here-string is read as commands only when a shell reads it, like a heredoc.
      if (pendingOp === '<<<') cur.heredocs.push(w.text)
      else cur.redirects.push({ op: pendingOp, target: w })
      pendingOp = undefined
    } else cur.words.push(w)
    text = ''; dynamic = false; started = false
  }
  const endCommand = () => {
    endWord()
    pendingOp = undefined
    if (cur.words.length > 0 || cur.redirects.length > 0 || cur.heredocs.length > 0) {
      out.push(cur)
      if (++budget.simples > MAX_SIMPLE_COMMANDS) budget.over = true
    }
    cur = { words: [], redirects: [], heredocs: [] }
  }
  const s = command
  let i = 0
  while (i < s.length) {
    const c = s[i] as string
    if (c === '\\') {
      if (s[i + 1] === '\n') { i += 2; continue }
      text += s[i + 1] ?? ''; started = true; i += 2; continue
    }
    if (c === "'") {
      const k = s.indexOf("'", i + 1)
      text += s.slice(i + 1, k < 0 ? s.length : k); started = true
      i = k < 0 ? s.length : k + 1; continue
    }
    if (c === '"') {
      const end = skipDouble(s, i + 1)
      const body = s.slice(i + 1, Math.max(i + 1, end - 1))
      let j = 0
      while (j < body.length) {
        const d = body[j] as string
        if (d === '\\' && j + 1 < body.length && '"\\$`\n'.includes(body[j + 1] as string)) { text += body[j + 1]; j += 2; continue }
        if (d === '$' && body[j + 1] === '(') { const [inner, k] = readGroup(body, j + 2, ')'); subs.push(inner); text += `$(${inner})`; dynamic = true; j = k; continue }
        if (d === '`') { const [inner, k] = readGroup(body, j + 1, '`'); subs.push(inner); text += `\`${inner}\``; dynamic = true; j = k; continue }
        if (d === '$' && /[\w{]/.test(body[j + 1] ?? '')) dynamic = true
        text += d; j++
      }
      started = true; i = end; continue
    }
    if (c === '$' && s[i + 1] === "'") {
      // $'...': C escapes.
      let k = i + 2
      while (k < s.length && s[k] !== "'") k += s[k] === '\\' ? 2 : 1
      text += cEscapes(s.slice(i + 2, Math.min(k, s.length))); started = true; i = k + 1; continue
    }
    if (c === '$' && s[i + 1] === '"') { i++; continue } // $"...": read as "..."
    if (c === '$' && s[i + 1] === '(') {
      const [inner, k] = readGroup(s, i + 2, ')')
      subs.push(inner); text += `$(${inner})`; dynamic = true; started = true; i = k; continue
    }
    if (c === '`') {
      const [inner, k] = readGroup(s, i + 1, '`')
      subs.push(inner); text += `\`${inner}\``; dynamic = true; started = true; i = k; continue
    }
    if (c === '$') {
      const m = /^\$(?:\{[^}]*\}|[A-Za-z_]\w*|[0-9@*#?$!-])/.exec(s.slice(i, i + 256))
      if (m) { text += m[0]; dynamic = true; started = true; i += m[0].length; continue }
    }
    if (c === '#' && !started) {
      const k = s.indexOf('\n', i)
      i = k < 0 ? s.length : k; continue
    }
    if (c === '<' && s[i + 1] === '<' && s[i + 2] === '<') { endWord(); pendingOp = '<<<'; i += 3; continue }
    if (c === '<' && s[i + 1] === '<') {
      endWord()
      let j = i + 2
      const strip = s[j] === '-'
      if (strip) j++
      while (s[j] === ' ' || s[j] === '\t') j++
      // The tag is the next word, quotes and backslashes removed (`'EOF'`, `"E"OF`, `\\EOF`).
      const m = /^[^\s;&|<>()]+/.exec(s.slice(j, j + 128))
      if (m) {
        const tag = m[0].replace(/["'\\]/g, '')
        if (tag !== '') { pendingHeredocs.push({ tag, strip, into: cur }); i = j + m[0].length; continue }
      }
      i = j; continue
    }
    if (c === '>' || c === '<' || (c === '&' && s[i + 1] === '>')) {
      // An fd number just before it (`2>`) belongs to the operator.
      if (started && /^\d+$/.test(text) && !dynamic) { text = ''; started = false }
      endWord()
      let op = c
      let j = i + 1
      if (c === '&') { op = '&>'; j = i + 2 }
      if (s[j] === '>' && c !== '<') { op += '>'; j++ }
      if (c === '<' && s[j] === '>') { op = '<>'; j++ } // read and write
      if (s[j] === '|') j++
      if (s[j] === '&') {
        // `>&2`, `<&0`, `>&-`: a duplication, no file.
        const m = /^&(\d+|-)/.exec(s.slice(j, j + 12))
        if (m) { i = j + m[0].length; continue }
      }
      pendingOp = op; i = j; continue
    }
    if (c === '\n') {
      endCommand()
      i++
      // Heredoc bodies start on the next line.
      for (const h of pendingHeredocs.splice(0)) {
        let body = ''
        while (i < s.length) {
          const k = s.indexOf('\n', i)
          const line = s.slice(i, k < 0 ? s.length : k)
          i = k < 0 ? s.length : k + 1
          if ((h.strip ? line.replace(/^\t+/, '') : line).trimEnd() === h.tag) break
          body += `${line}\n`
        }
        h.into.heredocs.push(body)
      }
      continue
    }
    // `{ cmd; }` groups: a brace alone; `{a,b}` in a word is brace expansion and stays in the word.
    if (c === ';' || c === '|' || c === '&' || c === '(' || c === ')' || (c === '{' && !started && /[\s]/.test(s[i + 1] ?? ' ')) || (c === '}' && !started)) { endCommand(); i++; continue }
    if (c === ' ' || c === '\t' || c === '\r') { endWord(); i++; continue }
    if ((c === '*' || c === '?' || c === '[') && !started) dynamic = true
    if (c === '*' || c === '?') dynamic = true
    text += c; started = true; i++
  }
  endCommand()
  for (const h of pendingHeredocs) h.into.heredocs.push('')
  // Only this level's commands are expanded: what came back from a deeper parse already was.
  const local = [...out]
  for (const sub of subs) { if (budget.over) break; out.push(...parse(sub, depth + 1, budget)) }
  // What a shell runs: `sh -c "..."`, `eval ...`, a heredoc or here-string fed to a shell,
  // `su -c`, `runuser -c`, `flock ... -c`, `script -c`.
  for (const cmd of local) {
    if (budget.over) break
    const { name, args } = peel(cmd.words)
    if (SHELLS.has(name)) {
      const flag = args.findIndex(a => /^-[a-zA-Z]*c[a-zA-Z]*$/.test(a.text) || /^-(?:command|c)$/i.test(a.text))
      if (flag >= 0 && args[flag + 1]) out.push(...parse(args[flag + 1]?.text ?? '', depth + 1, budget))
      for (const body of cmd.heredocs) out.push(...parse(body, depth + 1, budget))
    } else if (name === 'eval') {
      out.push(...parse(args.map(a => a.text).join(' '), depth + 1, budget))
    } else if (name === 'trap') {
      // trap 'cmd' SIGNAL runs cmd later.
      const p = args.filter(a => !a.text.startsWith('-'))
      if (p.length > 1 && p[0]) out.push(...parse(p[0].text, depth + 1, budget))
    } else if (name === 'parallel' || cmd.words.some(w => programName(w.text) === 'parallel')) {
      // parallel ::: 'cmd1' 'cmd2' with no command of its own runs each argument.
      const at = cmd.words.findIndex(w => w.text === ':::')
      const before = cmd.words.slice(0, at).filter(w => !w.text.startsWith('-') && programName(w.text) !== 'parallel')
      if (at >= 0 && before.length === 0) for (const w of cmd.words.slice(at + 1)) out.push(...parse(w.text, depth + 1, budget))
    } else if (['su', 'runuser', 'flock', 'script'].includes(name) || cmd.words.some(w => ['su', 'runuser', 'script', 'flock'].includes(programName(w.text)))) {
      const all = cmd.words
      const flag = all.findIndex(a => /^-[a-zA-Z]*c$/.test(a.text) || a.text === '--command' || a.text.startsWith('--command='))
      if (flag >= 0) {
        const f = all[flag] as Word
        out.push(...parse(f.text.startsWith('--command=') ? f.text.slice(10) : all[flag + 1]?.text ?? '', depth + 1, budget))
      }
    }
  }
  return out
}

/** Programs that run the command after them: their own options, then the command. */
const WRAPPERS: Record<string, { values: string[]; takesFirst?: boolean }> = {
  sudo: { values: ['-u', '-g', '-C', '-h', '-p', '-U', '-r', '-t', '-D'] },
  doas: { values: ['-u', '-C'] },
  env: { values: ['-u', '-C', '-S', '--unset', '--chdir'] },
  command: { values: [] },
  builtin: { values: [] },
  exec: { values: ['-a'] },
  nohup: { values: [] },
  time: { values: ['-f', '-o'] },
  nice: { values: ['-n', '--adjustment'] },
  setsid: { values: [] },
  stdbuf: { values: ['-i', '-o', '-e'] },
  ionice: { values: ['-c', '-n', '-p', '-P', '-u'] },
  timeout: { values: ['-s', '-k', '--signal', '--kill-after'], takesFirst: true },
  xargs: { values: ['-I', '-i', '-n', '-P', '-L', '-l', '-d', '-a', '-E', '-e', '-s', '--max-args', '--max-procs', '--delimiter', '--arg-file', '--replace'] },
  watch: { values: ['-n', '-d', '--interval'] },
  runuser: { values: ['-u', '--user', '-g', '--group', '-G', '--supp-group', '-s', '--shell', '-c', '--command'] },
  flock: { values: ['-w', '--timeout', '-E', '--conflict-exit-code'], takesFirst: true },
  chrt: { values: ['-T', '-P', '-D', '--sched-runtime', '--sched-period', '--sched-deadline'], takesFirst: true },
  parallel: { values: ['-j', '--jobs', '-S', '--sshlogin', '--joblog', '--results', '--delay', '--timeout', '-a', '--arg-file', '--colsep', '-d', '--delimiter'] },
  caffeinate: { values: ['-t', '-w'] },
  chronic: { values: [] },
  unbuffer: { values: [] },
}

/** Runners whose first positional is a package or program to run. */
const RUNNERS: Record<string, string[]> = {
  npx: ['-p', '--package', '-c', '--call', '--cache', '--registry', '-w', '--workspace', '--userconfig'],
  bunx: ['-p', '--package'],
  pnpx: ['-p', '--package'],
}

/** A program's own name: `/usr/bin/curl` is `curl`, `wrangler@3` is `wrangler`, `@anthropic-ai/claude-code@1` stays scoped. */
function programName(word: string): string {
  let w = word.replace(/\\/g, '/').trim()
  if (w.startsWith('@')) {
    const at = w.indexOf('@', 1)
    return (at > 0 ? w.slice(0, at) : w).toLowerCase()
  }
  w = w.slice(w.lastIndexOf('/') + 1)
  const at = w.indexOf('@')
  if (at > 0) w = w.slice(0, at)
  return w.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase()
}

/** Skips options (and the values of those in `values`) from `i`; returns the index of the first positional. */
function skipOptions(args: Word[], i: number, values: string[]): number {
  while (i < args.length) {
    const a = args[i]?.text ?? ''
    if (a === '--') return i + 1
    if (!a.startsWith('-') || a === '-') return i
    if (values.includes(a)) i += 2
    else i += 1
  }
  return i
}

/**
 * A simple command with assignments, keywords, wrappers (sudo, env, timeout,
 * nice, setsid, stdbuf, ionice, xargs, ...) and runners (npx, bunx, pnpm
 * dlx/exec, yarn dlx, npm exec, bun x, node <script>) peeled off: the program
 * that really runs and its arguments.
 */
export function peel(words: Word[]): { name: string; args: Word[]; dynamic?: boolean } {
  let i = 0
  for (let guard = 0; guard < 64 && i < words.length; guard++) {
    const w = words[i]?.text ?? ''
    if (/^[A-Za-z_]\w*=/.test(w)) { i++; continue }
    if (['then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', '{', '}', 'coproc'].includes(w)) { i++; continue }
    const name = programName(w)
    if (words[i]?.dynamic) return { name: name || '$', args: words.slice(i + 1), dynamic: true }
    if (name === 'taskset') {
      // taskset MASK cmd, or taskset -c LIST cmd, or taskset -p (no command)
      const list = words.slice(i + 1).findIndex(a => a.text === '-c' || a.text === '--cpu-list')
      i = skipOptions(words, i + 1, ['-c', '--cpu-list'])
      if (list < 0) i++
      continue
    }
    const wrap = Object.hasOwn(WRAPPERS, name) ? WRAPPERS[name] : undefined
    if (wrap) {
      i = skipOptions(words, i + 1, wrap.values)
      if (name === 'env') while (i < words.length && /^[A-Za-z_]\w*=/.test(words[i]?.text ?? '')) i++
      if (wrap.takesFirst) i++
      if (name === 'nice' && /^-\d+$/.test(words[i - 1]?.text ?? '')) { /* nice -10 cmd: already skipped */ }
      continue
    }
    if (Object.hasOwn(RUNNERS, name)) { i = skipOptions(words, i + 1, RUNNERS[name] ?? []); continue }
    const next = words[i + 1]?.text ?? ''
    if ((name === 'pnpm' && (next === 'dlx' || next === 'exec')) || (name === 'yarn' && (next === 'dlx' || next === 'exec')) ||
      (name === 'npm' && (next === 'exec' || next === 'x')) || (name === 'bun' && next === 'x')) {
      i = skipOptions(words, i + 2, ['-p', '--package', '-c', '--call', '-w', '--workspace'])
      continue
    }
    if (/^(?:node|nodejs|bun|deno|tsx|ts-node)$/.test(name)) {
      const j = skipOptions(words, i + 1, ['-r', '--require', '--import', '--loader', '-e', '--eval', '-p', '--print'])
      const script = (words[j]?.text ?? '').replace(/\\/g, '/').toLowerCase()
      if (/(^|\/)claude-code\/cli\.[cm]?js$/.test(script)) return { name: 'claude', args: words.slice(j + 1) }
      if (/(^|\/)wrangler(\/bin\/wrangler)?(\.[cm]?js)?$/.test(script) || /(^|\/)wrangler-dist\/cli\.js$/.test(script)) return { name: 'wrangler', args: words.slice(j + 1) }
      return { name, args: words.slice(i + 1) }
    }
    return { name, args: words.slice(i + 1) }
  }
  return { name: '', args: [] }
}

/** A peeled command: the program that runs, its arguments, the simple command it came from. `dynamic`: its name is a variable or substitution. */
export type Cmd = { name: string; args: Word[]; simple: Simple; dynamic?: boolean }
/** A command read once: what it runs, and whether it was too long or too complex to read. */
export type Read = { cmds: Cmd[]; unreadable: boolean }

const cache = new Map<string, Read>()
/** Reads a command (cached for the last few): the commands it runs, peeled, and whether it is unreadable. */
export function read(command: string): Read {
  const hit = cache.get(command)
  if (hit) return hit
  let result: Read
  if (command.length > MAX_COMMAND) result = { cmds: [], unreadable: true }
  else {
    const budget = newBudget()
    const cmds: Cmd[] = []
    for (const simple of parse(command, 0, budget)) {
      const p = peel(simple.words)
      cmds.push({ ...p, simple })
      // find -exec <cmd> ... ;  and  yarn <bin> ...  run another program.
      if (p.name === 'find') {
        const at = p.args.findIndex(a => /^-(?:exec|execdir|ok|okdir)$/.test(a.text))
        if (at >= 0) cmds.push({ ...peel(p.args.slice(at + 1).filter(a => a.text !== ';' && a.text !== '+')), simple })
      }
      if (p.name === 'yarn') {
        const j = skipOptions(p.args, 0, ['--cwd'])
        const sub = p.args[j]?.text ?? ''
        if (sub !== '' && !YARN_COMMANDS.has(sub) && !sub.startsWith('deploy')) cmds.push({ ...peel(p.args.slice(j)), simple })
      }
    }
    result = { cmds, unreadable: budget.over }
  }
  if (cache.size > 32) cache.clear()
  cache.set(command, result)
  return result
}

/** The commands a command runs, peeled. */
export function commands(command: string): Cmd[] {
  return read(command).cmds
}

/** Whether a command is too long or too complex to read: refused for the Chief of Staff, asked (or refused) for agents. */
export function unreadable(command: string): boolean {
  return read(command).unreadable
}

const YARN_COMMANDS = new Set(['add', 'install', 'remove', 'run', 'workspace', 'workspaces', 'init', 'info', 'why', 'upgrade', 'up', 'dlx', 'exec',
  'node', 'config', 'cache', 'set', 'plugin', 'version', 'publish', 'pack', 'npm', 'constraints', 'explain', 'rebuild', 'patch', 'link', 'unlink',
  'test', 'build', 'dev', 'start', 'lint', 'audit', 'list', 'outdated', 'global', 'create', 'bin', 'login', 'logout', 'tag', 'team', 'owner'])

const positionals = (args: Word[], values: string[] = []) => {
  const out: Word[] = []
  for (let i = 0; i < args.length; i++) {
    const a = args[i]?.text ?? ''
    if (a === '--') { out.push(...args.slice(i + 1)); break }
    if (a.startsWith('-') && a !== '-') { if (values.includes(a)) i++; continue }
    out.push(args[i] as Word)
  }
  return out
}

/** `git` with its global options skipped: the subcommand, its arguments, `-C`, and the `-c` settings. */
function gitSub(args: Word[]): { sub: string; rest: Word[]; dir: string | undefined; config: string[] } {
  let i = 0
  let dir: string | undefined
  const config: string[] = []
  while (i < args.length) {
    const a = args[i]?.text ?? ''
    if (a === '-C') { dir = args[i + 1]?.text; i += 2; continue }
    if (a === '-c') { config.push((args[i + 1]?.text ?? '').toLowerCase()); i += 2; continue }
    if (['--git-dir', '--work-tree', '--namespace', '--super-prefix', '--config-env', '--exec-path'].includes(a)) { i += 2; continue }
    if (a.startsWith('-')) { i++; continue }
    break
  }
  return { sub: (args[i]?.text ?? '').toLowerCase(), rest: args.slice(i + 1), dir, config }
}

/**
 * Whether a `git push` (or `send-pack`) overwrites the remote: `--force`,
 * `-f`, `--mirror`, `--prune`, a `+ref`, any argument built from a variable
 * or substitution or holding braces, or `-c remote.*.push=+...` /
 * `-c remote.*.mirror=true`.
 */
function pushOverwrites(rest: Word[], config: string[]): boolean {
  if (config.some(c => /^remote\..*\.push=\+/.test(c) || /^remote\..*\.mirror=(?:true|1|yes|on)$/.test(c))) return true
  for (const w of rest) {
    const a = w.text
    if (/^--(?:force|mirror|prune)$/i.test(a)) return true
    if (/^-[a-zA-Z]+$/.test(a) && a.includes('f')) return true
    if (!a.startsWith('-') && a.startsWith('+')) return true
    if (w.dynamic || /[{}]/.test(a)) return true
  }
  return false
}

/** Whether a `git push` deletes a remote branch: `--delete`, `-d`, or a `:branch` refspec. */
function pushDeletes(rest: Word[]): boolean {
  return rest.some(w => /^--delete$/i.test(w.text) || (/^-[a-zA-Z]+$/.test(w.text) && w.text.includes('d')) || (!w.text.startsWith('-') && /^:[^:]/.test(w.text)))
}

/**
 * Whether a command rewrites history (`filter-repo`, `filter-branch`, BFG)
 * or overwrites the remote (a force push, mirror or prune): refused for
 * everyone. Unreadable commands count.
 */
export function historyKind(command: string): 'rewrite' | 'force' | undefined {
  const r = read(command)
  if (r.unreadable) return 'force'
  for (const { name, args } of r.cmds) {
    if (name === 'git-filter-repo' || name === 'bfg' || name === 'git-filter-branch') return 'rewrite'
    if (name === 'java' && args.some(a => /bfg[\w.-]*\.jar$/i.test(a.text))) return 'rewrite'
    if (/^python[\d.]*$/.test(name) && args.some((a, i) => a.text === '-m' && /^git[_-]filter[_-]repo$/.test(args[i + 1]?.text ?? ''))) return 'rewrite'
    if (name !== 'git') continue
    const { sub, rest, config } = gitSub(args)
    if (sub === 'filter-repo' || sub === 'filter-branch') return 'rewrite'
    if ((sub === 'push' || sub === 'send-pack') && pushOverwrites(rest, config)) return 'force'
  }
  return undefined
}

/** Whether a command rewrites history or overwrites the remote: refused for everyone. */
export function rewritesHistory(command: string): boolean {
  return historyKind(command) !== undefined
}

/** Whether a command runs `git push --force-with-lease`: normal branch work, so deploying roles only. */
export function runsLeasePush(command: string): boolean {
  if (unreadable(command)) return true
  return commands(command).some(({ name, args }) => {
    if (name !== 'git') return false
    const { sub, rest } = gitSub(args)
    return sub === 'push' && rest.some(a => /^--force-with-lease(?:=|$)/i.test(a.text))
  })
}

const starts = (w: Word | undefined, prefix: string) => (w?.text ?? '').toLowerCase().startsWith(prefix)

/** Whether one peeled command ships the site. */
function deploys(name: string, args: Word[]): boolean {
  switch (name) {
    case 'wrangler': {
      const p = positionals(args, ['--env', '-e', '-c', '--config', '--cwd', '--name', '--compatibility-date', '--account-id'])
      const [a, b] = [p[0]?.text.toLowerCase() ?? '', p[1]?.text.toLowerCase() ?? '']
      return a === 'deploy' || a === 'publish' || (['pages', 'versions', 'triggers'].includes(a) && (b === 'deploy' || b === 'publish'))
    }
    case 'vercel':
    case 'vc': {
      if (args.some(a => a.text === '--prod' || a.text === '--production')) return true
      const p = positionals(args, ['--token', '-t', '--scope', '-S', '--cwd', '-A', '--local-config', '-e', '--env', '-b', '--build-env', '-m', '--meta', '--regions', '-Q', '--global-config', '--team', '-T'])
      const first = p[0]?.text.toLowerCase()
      if (first === undefined) return true
      return ['deploy', 'redeploy', 'promote', 'rollback'].includes(first) || (!VERCEL_COMMANDS.has(first) && /[./]/.test(first))
    }
    case 'netlify':
    case 'netlify-cli':
    case 'ntl':
      return positionals(args, ['--site', '-s', '--auth', '--dir', '-d', '--functions', '-f', '--message', '-m', '--alias', '--context'])[0]?.text === 'deploy'
    case 'firebase':
    case 'firebase-tools':
      return positionals(args, ['--project', '-P', '--only', '--except', '--message', '-m', '--config', '-c', '--token'])[0]?.text === 'deploy'
    case 'npm': {
      const p = positionals(args, ['--prefix', '-C', '-w', '--workspace'])
      return ['run', 'run-script', 'rum', 'urn'].includes(p[0]?.text ?? '') && starts(p[1], 'deploy')
    }
    case 'pnpm': {
      const p = positionals(args, ['-C', '--dir', '--filter', '-F', '--workspace-dir'])
      return starts(p[0], 'deploy') || (p[0]?.text === 'run' && starts(p[1], 'deploy'))
    }
    case 'yarn': {
      const p = positionals(args, ['--cwd'])
      if (p[0]?.text === 'workspace') return p[2]?.text === 'run' ? starts(p[3], 'deploy') : starts(p[2], 'deploy')
      return starts(p[0], 'deploy') || (p[0]?.text === 'run' && starts(p[1], 'deploy'))
    }
    case 'bun': {
      const p = positionals(args, ['--cwd'])
      return starts(p[0], 'deploy') || (p[0]?.text === 'run' && starts(p[1], 'deploy'))
    }
    case 'make':
    case 'gmake':
      return positionals(args, ['-C', '-f', '--file', '--directory', '-I', '-o', '-W', '-j', '-l']).some(a => !a.text.includes('=') && starts(a, 'deploy'))
    default:
      return false
  }
}

const VERCEL_COMMANDS = new Set(['dev', 'env', 'login', 'logout', 'link', 'pull', 'ls', 'list', 'inspect', 'logs', 'domains', 'dns', 'certs', 'secrets',
  'alias', 'rm', 'remove', 'projects', 'project', 'teams', 'whoami', 'switch', 'build', 'init', 'help', 'git', 'bisect', 'integration', 'telemetry', 'blob'])

/** Whether a shell command actually runs a deploy, not merely mentions one. */
export function runsDeploy(command: string): boolean {
  if (unreadable(command)) return true
  return commands(command).some(({ name, args }) => deploys(name, args))
}

/**
 * Whether a command runs `pattern` at a command position, as the peeled
 * command reads (`npx wrangler deploy` reads `wrangler deploy`). Kept for
 * patterns of callers; the plugin's own checks above read tokens.
 */
export function runsCommand(command: string, pattern: RegExp): boolean {
  if (unreadable(command)) return true
  const source = pattern.source.startsWith(String.raw`\b`) ? pattern.source.slice(2) : pattern.source
  const re = new RegExp(`^(?:${source})`, pattern.flags.replace('g', ''))
  return commands(command).some(({ name, args }) => re.test([name, ...args.map(a => a.text)].join(' ').slice(0, MAX_COMMAND)))
}

/** `git` and its global options, written so no input can make it backtrack. */
const GIT = String.raw`git(?:\s+(?:-[cC]\s+\S+|--[\w-]+(?:=\S*)?|-(?![cC](?:\s|$))\w[\w-]*))*\s+`
/** Tools that rewrite a repository's history (as a pattern, for runsCommand). */
export const HISTORY_REWRITE = new RegExp(String.raw`(?:${GIT}filter-(?:repo|branch)|git-filter-repo|bfg|java\s+(?:-\S+\s+)*-jar\s+\S*bfg[\w.-]*\.jar)(?![\w-])`, 'i')
/** A push that overwrites or removes on the remote (as a pattern, for runsCommand). */
export const FORCE_PUSH = new RegExp(String.raw`${GIT}push(?![\w-])(?:\s+\S+)*?\s+(?:--force(?![\w-])|--mirror(?![\w-])|--delete(?![\w-])|--prune(?![\w-])|-[A-Za-z]*[fd][A-Za-z]*(?![\w-])|\+[^\s+]|:[^\s:])`, 'i')
/** `git push --force-with-lease` (as a pattern, for runsCommand). */
export const LEASE_PUSH = new RegExp(String.raw`${GIT}push(?![\w-])(?:\s+\S+)*?\s+--force-with-lease(?![\w-])`, 'i')
/** Deploy commands (as a pattern, for runsCommand); runsDeploy reads tokens instead. */
export const DEPLOY = /(?:wrangler|vercel|vc|netlify|firebase)\s/i

/** Whether a command writes through the GitHub API (`gh api` with a write method, fields, an input or a method override). */
function ghApiWrites(args: Word[]): boolean {
  for (let i = 0; i < args.length; i++) {
    const a = args[i]?.text ?? ''
    const method = /^(?:-X|--method)(?:=)?(.*)$/i.exec(a)
    if (method) {
      const v = (method[1] || args[i + 1]?.text || '').toUpperCase()
      if (/^(?:POST|PUT|PATCH|DELETE)$/.test(v)) return true
      continue
    }
    if (/^-[fF]/.test(a) || /^--(?:raw-)?field(?:=|$)/.test(a) || /^--input(?:=|$)/.test(a)) return true
    if ((a === '-H' || a === '--header') && /x-http-method-override/i.test(args[i + 1]?.text ?? '')) return true
    if (/^(?:-H|--header=)/.test(a) && /x-http-method-override/i.test(a)) return true
  }
  return false
}

/** gh subcommands that change a repository, a release, a workflow, a secret, an issue, a pull request or a gist. */
const GH_WRITES: Record<string, string[]> = {
  pr: ['merge', 'create', 'review', 'comment', 'close', 'reopen', 'edit', 'ready', 'lock'],
  release: ['create', 'delete', 'edit', 'upload', 'delete-asset'],
  repo: ['delete', 'edit', 'archive', 'unarchive', 'rename', 'transfer', 'create', 'fork', 'sync', 'deploy-key'],
  workflow: ['run', 'enable', 'disable'],
  run: ['rerun', 'cancel', 'delete'],
  secret: ['set', 'delete', 'remove'],
  variable: ['set', 'delete'],
  gist: ['create', 'edit', 'delete', 'clone'],
  issue: ['create', 'comment', 'close', 'reopen', 'edit', 'delete', 'transfer', 'lock', 'pin'],
  label: ['create', 'edit', 'delete', 'clone'],
  ssh_key: ['add', 'delete'],
  'ssh-key': ['add', 'delete'],
  'gpg-key': ['add', 'delete'],
}

const HTTP = new Set(['curl', 'wget', 'http', 'https', 'xh', 'xhs', 'httpie'])
const CURL_VALUES = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-urlencode', '--data-ascii', '-F', '--form', '--form-string', '-T', '--upload-file',
  '--json', '-X', '--request', '-H', '--header', '-o', '--output', '-x', '--proxy', '-A', '--user-agent', '-e', '--referer', '-u', '--user', '-b', '--cookie',
  '-c', '--cookie-jar', '-m', '--max-time', '--connect-timeout', '-w', '--write-out', '-K', '--config', '--resolve', '--cacert', '--cert', '-E', '--key', '-r',
  '--range', '-C', '--continue-at', '-y', '-Y', '-z', '--retry', '--retry-delay', '--limit-rate', '--local-port', '-U', '--proxy-user', '--interface',
  '--dns-servers', '--connect-to', '-D', '--dump-header', '--trace', '--trace-ascii', '--stderr', '-Q', '--quote', '--max-filesize', '--output-dir'])
const CURL_SHORT_VALUES = 'dFTXHoxAeubcmwKrCyYzUDEQ'
const WGET_VALUES = new Set(['-O', '--output-document', '-o', '--output-file', '-a', '--append-output', '-t', '--tries', '-T', '--timeout', '-w', '--wait',
  '-e', '--execute', '--header', '-U', '--user-agent', '-P', '--directory-prefix', '--user', '--password', '-i', '--input-file', '-Q', '--quota',
  '--post-data', '--post-file', '--body-data', '--body-file', '--method', '-l', '--level', '-A', '--accept', '-R', '--reject', '-D', '--domains', '--referer'])

/** Whether a host is this machine. */
function isLocal(candidate: Word): boolean {
  if (candidate.dynamic) return false
  const raw = candidate.text.trim()
  if (raw === '') return false
  if (/^:\d+/.test(raw)) return true // httpie's :3000
  try {
    const host = new URL(/^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`).hostname.toLowerCase()
    return host === 'localhost' || host.endsWith('.localhost') || host === 'host.docker.internal' || host === '[::1]' || host === '0.0.0.0' ||
      /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)
  } catch {
    return false
  }
}

/** Whether an HTTP client run sends data to, or changes something on, a host that is not this machine. When unsure, yes. */
function httpWrites(name: string, args: Word[]): boolean {
  let writes = false
  const hosts: Word[] = []
  if (name === 'curl') {
    for (let i = 0; i < args.length; i++) {
      const a = args[i]?.text ?? ''
      if (a === '--url') { if (args[i + 1]) hosts.push(args[i + 1] as Word); i++; continue }
      if (a.startsWith('--')) {
        const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined]
        if (/^--(?:data|data-raw|data-binary|data-urlencode|data-ascii|form|form-string|upload-file|json)$/.test(flag)) writes = true
        if (flag === '--request') { const v = (inline ?? args[i + 1]?.text ?? '').toUpperCase(); if (!/^(?:GET|HEAD|OPTIONS)$/.test(v)) writes = true }
        if (inline === undefined && CURL_VALUES.has(flag)) i++
        continue
      }
      if (a.startsWith('-') && a.length > 1) {
        for (let k = 1; k < a.length; k++) {
          const f = a[k] as string
          if ('dFT'.includes(f)) writes = true
          if (CURL_SHORT_VALUES.includes(f)) {
            const value = a.slice(k + 1) || args[i + 1]?.text || ''
            if (f === 'X' && !/^(?:GET|HEAD|OPTIONS)$/i.test(value)) writes = true
            if (!a.slice(k + 1)) i++
            break
          }
        }
        continue
      }
      hosts.push(args[i] as Word)
    }
  } else if (name === 'wget') {
    for (let i = 0; i < args.length; i++) {
      const a = args[i]?.text ?? ''
      if (a.startsWith('--')) {
        const [flag, inline] = a.includes('=') ? [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)] : [a, undefined]
        if (/^--(?:post-data|post-file|body-data|body-file)$/.test(flag)) writes = true
        if (flag === '--method') { const v = (inline ?? args[i + 1]?.text ?? '').toUpperCase(); if (!/^(?:GET|HEAD|OPTIONS)$/.test(v)) writes = true }
        if (inline === undefined && WGET_VALUES.has(flag)) i++
        continue
      }
      if (a.startsWith('-') && a.length > 1) { if (WGET_VALUES.has(a)) i++; continue }
      hosts.push(args[i] as Word)
    }
  } else {
    const p = positionals(args, ['--auth', '-a', '--session', '--proxy', '--output', '-o', '--verify', '--cert', '--cert-key'])
    let at = 0
    if (/^(?:POST|PUT|PATCH|DELETE)$/i.test(p[0]?.text ?? '')) { writes = true; at = 1 }
    if (p[at]) hosts.push(p[at] as Word)
    if (p.slice(at + 1).some(w => /[=@]|:=/.test(w.text))) writes = true
    if (args.some(a => /^--(?:form|raw|json)$/.test(a.text) || a.text === '-f')) writes = writes || p.length > at + 1
  }
  return writes && (hosts.length === 0 || hosts.some(h => !isLocal(h)))
}

/**
 * Why an agent's shell command needs the person's OK, or undefined: it runs
 * `claude`, changes GitHub (merge, release, repo, workflow, issue, pull
 * request, gist, `gh api` writes), publishes a package, moves a branch ref,
 * or sends data to another host with curl or wget. When unsure, it says yes.
 */
export function shellNeedsPerson(command: string): string | undefined {
  if (command.length > MAX_COMMAND) return `is over ${MAX_COMMAND / 1024} KB, too long to check`
  const r = read(command)
  if (r.unreadable) return 'is too complex to check'
  for (const { name, args, simple, dynamic } of r.cmds) {
    if (dynamic) return 'runs a program named by a variable or substitution'
    const env = simple.words.findIndex(w => programName(w.text) === 'env')
    if (env >= 0 && simple.words.slice(env + 1).some(w => /^(?:-S|--split-string)/.test(w.text))) return 'runs a command through env -S'
    if (simple.words.some((w, i) => (/^(?:-u|--unset)$/.test(w.text) && /^CLAUDE/i.test(simple.words[i + 1]?.text ?? '')) || /^--unset=CLAUDE/i.test(w.text))) {
      return "hides Claude Code's own environment (env -u CLAUDE...)"
    }
    if (name === 'unset' && args.some(a => /^CLAUDE/i.test(a.text))) return "hides Claude Code's own environment (unset CLAUDE...)"

    if (name === 'claude' || name === '@anthropic-ai/claude-code' || name === 'claude-code') return 'starts Claude Code (claude)'
    if (name === 'gh') {
      const p = positionals(args, ['-R', '--repo', '--hostname'])
      const [a, b] = [p[0]?.text.toLowerCase() ?? '', p[1]?.text.toLowerCase() ?? '']
      if (a === 'api' && ghApiWrites(args)) return 'writes through the GitHub API (gh api)'
      if (Object.hasOwn(GH_WRITES, a) && GH_WRITES[a]?.includes(b)) return `changes GitHub (gh ${a} ${b})`
    }
    if (['npm', 'pnpm', 'yarn', 'bun'].includes(name) && positionals(args, ['--prefix', '-C', '--dir', '--cwd', '--tag', '--access', '--otp', '--registry'])
      .some(a => a.text === 'publish')) return `publishes a package (${name} publish)`
    if (name === 'git') {
      const { sub, rest } = gitSub(args)
      if (sub === 'update-ref' && rest.some(a => /^refs\/heads\//.test(a.text))) return 'moves a branch ref (git update-ref)'
      if (sub === 'push' && pushDeletes(rest)) return "deletes a remote branch. Deleting a remote branch needs the person's OK"

      if (sub === 'branch' && rest.some(a => /^-[a-zA-Z]*[DfMC]|^--(?:force|delete)$/.test(a.text)) &&
        rest.some(a => /^(?:main|master|origin\/main|origin\/master)$/.test(a.text))) return 'force-moves or deletes main or master (git branch)'
    }
    if (HTTP.has(name) && httpWrites(name, args)) return `sends data to another host (${name})`
  }
  return undefined
}

/** A destination a command writes to, and whether it writes file content there (redirects, tee, cp, sed -i, ...). */
export type Destination = { path: Word; content: boolean; into?: boolean }

const INTERPRETERS = /^(?:python[\d.]*|node|nodejs|ruby|perl|php|deno|bun|tsx|ts-node|osascript|lua|Rscript|pwsh|powershell)$/i
/** The flag that hands an interpreter inline code. */
const INLINE_CODE: Record<string, string[]> = {
  python: ['-c'], node: ['-e', '--eval', '-p', '--print'], nodejs: ['-e', '--eval', '-p', '--print'], bun: ['-e', '--eval', '-p', '--print'],
  deno: ['eval'], tsx: ['-e', '--eval'], 'ts-node': ['-e', '--eval'], ruby: ['-e'], perl: ['-e', '-E'], php: ['-r'], osascript: ['-e'], lua: ['-e'],
  rscript: ['-e'], pwsh: ['-c', '-command'], powershell: ['-c', '-command'],
}

/** A cwd no longer known: after `cd` to a variable, a glob, `cd -`, `popd` or with `CDPATH=` set. */
export const UNKNOWN_CWD = '\u0000unknown'

/** The value of an option given as `-o value`, `-ovalue`, `-o/x` or `--output=value`. */
function optionValue(args: Word[], i: number, short: string[], long: string[]): Word | undefined {
  const a = args[i]
  if (!a) return undefined
  if (short.includes(a.text) || long.includes(a.text)) return args[i + 1]
  for (const l of long) if (a.text.startsWith(`${l}=`)) return { text: a.text.slice(l.length + 1), dynamic: a.dynamic }
  for (const sh of short) if (a.text.startsWith(sh) && a.text.length > sh.length && !a.text.startsWith('--')) return { text: a.text.slice(sh.length), dynamic: a.dynamic }
  return undefined
}

/**
 * Where a command writes, as best it can tell: redirect targets (`>`, `>>`,
 * `<>`), tee, cp, mv, install, ln, rsync, dd of=, curl -o, wget -O/-P, tar -x
 * -C, unzip -d, sed -i, perl -i, touch, mkdir, rm, chmod, sponge, git -C <dir>
 * with a writing subcommand, `git clone <url> <dir>`. A write into a folder
 * also lists the folder (`into`), and for cp, mv, install, ln and rsync the
 * path each source lands at. A relative path is joined to the directory a
 * `cd` before it moved to; after a `cd` that cannot be followed it starts
 * with UNKNOWN_CWD. `code`: the inline code an interpreter runs
 * (`python -c`, `node -e`), whose writes the checks cannot follow. A script
 * file an interpreter runs is read, not written: it is no destination.
 */
export function destinations(command: string): { dests: Destination[]; opaque: boolean; code: string[] } {
  const dests: Destination[] = []
  const code: string[] = []
  const r = read(command)
  if (r.unreadable) return { dests, opaque: true, code: [command] }
  let cwd = ''
  const at = (w: Word): Word => {
    if (w.text.startsWith('/') || w.text.startsWith('~') || /^[A-Za-z]:[\\/]/.test(w.text) || w.text.startsWith('$')) return w
    if (cwd === '') return w
    return { text: `${cwd.replace(/[\\/]+$/, '')}/${w.text}`, dynamic: w.dynamic || cwd === UNKNOWN_CWD }
  }
  const add = (w: Word | undefined, content: boolean, into = false) => { if (w && w.text !== '') dests.push({ path: at(w), content, into }) }
  for (const { name, args, simple } of r.cmds) {
    if (simple.words.some(w => /^CDPATH=/.test(w.text))) cwd = UNKNOWN_CWD
    for (const rd of simple.redirects) if (rd.op.includes('>')) add(rd.target, true)
    const p = positionals(args)
    switch (name) {
      case 'cd':
      case 'pushd': {
        const to = p[0]
        if (!to || to.dynamic || to.text === '-' || /[*?[]/.test(to.text)) cwd = UNKNOWN_CWD
        else if (to.text.startsWith('/') || to.text.startsWith('~')) cwd = to.text
        else cwd = cwd === UNKNOWN_CWD ? UNKNOWN_CWD : cwd ? `${cwd}/${to.text}` : to.text
        break
      }
      case 'popd':
        cwd = UNKNOWN_CWD
        break
      case 'tee': case 'sponge':
        for (const w of p) add(w, true)
        break
      case 'cp': case 'mv': case 'install': case 'ln': case 'rsync': case 'scp': {
        let target: Word | undefined
        args.forEach((_, i) => { target = target ?? optionValue(args, i, ['-t'], ['--target-directory']) })
        const sources = target ? p : p.slice(0, -1)
        target = target ?? p[p.length - 1]
        if (target) {
          add(target, true, true)
          for (const src of sources) {
            const base = src.text.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
            if (base !== '' && !src.dynamic) add({ text: `${target.text.replace(/[\\/]+$/, '')}/${base}`, dynamic: target.dynamic }, true)
          }
        }
        if (name === 'mv') for (const w of sources) add(w, false)
        break
      }
      case 'dd':
        for (const a of args) if (a.text.startsWith('of=')) add({ text: a.text.slice(3), dynamic: a.dynamic }, true)
        break
      case 'curl':
        args.forEach((a, i) => {
          const o = optionValue(args, i, ['-o'], ['--output', '--output-dir'])
          if (o) add(o, true, a.text === '--output-dir' || a.text.startsWith('--output-dir='))
          else if (/^-[a-zA-Z]*o$/.test(a.text) && a.text !== '-o') add(args[i + 1], true)
          else if (/^-[a-zA-Z]*O/.test(a.text) || a.text === '--remote-name') add({ text: '.', dynamic: false }, true, true)
        })
        break
      case 'wget': {
        let any = false
        args.forEach((_, i) => {
          const o = optionValue(args, i, ['-O'], ['--output-document'])
          if (o) { add(o, true); any = true }
          const d = optionValue(args, i, ['-P'], ['--directory-prefix'])
          if (d) { add(d, true, true); any = true }
        })
        if (!any) add({ text: '.', dynamic: false }, true, true)
        break
      }
      case 'tar': case 'bsdtar': {
        const mode = args[0]?.text ?? ''
        if (/x/.test(mode) || args.some(a => a.text === '--extract' || a.text === '-x' || /^-[a-zA-Z]*x/.test(a.text))) {
          let dir: Word | undefined
          args.forEach((_, i) => { dir = dir ?? optionValue(args, i, ['-C'], ['--directory']) })
          add(dir ?? { text: '.', dynamic: false }, true, true)
        }
        break
      }
      case 'unzip': case '7z': case 'unrar': {
        let dir: Word | undefined
        args.forEach((_, i) => { dir = dir ?? optionValue(args, i, ['-d'], []) ?? (name === '7z' ? optionValue(args, i, ['-o'], []) : undefined) })
        add(dir ?? { text: '.', dynamic: false }, true, true)
        break
      }
      case 'awk': case 'gawk':
        if (args.some((a, i) => (a.text === '-i' && args[i + 1]?.text === 'inplace') || a.text === '-iinplace')) {
          for (const w of p.slice(p[0]?.text === 'inplace' ? 2 : 1)) add(w, true)
        }
        break
      case 'sed': case 'perl': case 'ruby': {
        const inPlace = args.some(a => /^-[a-zA-Z]*i/.test(a.text) || a.text.startsWith('--in-place'))
        if (inPlace) {
          const hasScript = args.some(a => a.text === '-e' || a.text === '-f' || a.text === '--expression')
          for (const w of hasScript ? p : p.slice(1)) add(w, true)
        }
        if (name !== 'sed') {
          const flag = args.findIndex(a => (INLINE_CODE[name] ?? []).includes(a.text))
          if (flag >= 0 && args[flag + 1]) code.push(args[flag + 1]?.text ?? '')
        }
        break
      }
      case 'touch': case 'mkdir': case 'rm': case 'rmdir': case 'unlink': case 'truncate': case 'shred': case 'chmod': case 'chown': case 'chgrp':
        for (const w of p) add(w, false)
        break
      case 'git': {
        const { sub, rest, dir } = gitSub(args)
        if (['pull', 'checkout', 'switch', 'reset', 'clean', 'apply', 'am', 'merge', 'rebase', 'restore', 'stash', 'commit', 'fetch', 'cherry-pick', 'revert', 'mv', 'rm', 'worktree', 'submodule', 'init'].includes(sub)) {
          add(dir !== undefined ? { text: dir, dynamic: false } : { text: '.', dynamic: false }, false, true)
        }
        if (sub === 'clone') { const q = positionals(rest, ['-b', '--branch', '--depth', '-o', '--origin', '--reference', '-c', '--config']); add(q[1] ?? { text: '.', dynamic: false }, false, true) }
        break
      }
      default:
        if (INTERPRETERS.test(name)) {
          const key = name.toLowerCase().replace(/[\d.]+$/, '')
          const flag = args.findIndex(a => (INLINE_CODE[key] ?? []).includes(a.text.toLowerCase()))
          if (flag >= 0 && args[flag + 1]) code.push(args[flag + 1]?.text ?? '')
        }
    }
  }
  return { dests, opaque: code.length > 0, code }
}

/**
 * Whether a command asks to get past bot protection, read from what runs:
 * the argv of each command (quotes removed, so any quoting counts) and the
 * inline code of `python -c` or `node -e`; not text handed to grep, git,
 * echo, cat and the like, and not a heredoc fed to a program that is no
 * shell. An unreadable command is read as written.
 */
export function bypassInCommand(command: string, pattern: RegExp): boolean {
  const r = read(command)
  if (r.unreadable) return pattern.test(command.slice(0, MAX_SCANNED))
  return r.cmds.some(({ name, args }) => !TEXT_TOOLS.has(name) && pattern.test([name, ...args.map(a => a.text)].join(' ')))
}

/** Programs whose arguments are text, not settings: a bypass key in them is a mention. */
const TEXT_TOOLS = new Set(['grep', 'egrep', 'fgrep', 'rg', 'ag', 'ack', 'git', 'echo', 'printf', 'cat', 'less', 'more', 'head', 'tail', 'wc', 'jq', 'yq',
  'sed', 'awk', 'sort', 'uniq', 'diff', 'tr', 'cut', 'tee', 'gh', 'man', 'which', 'type', 'test', '['])

/** The command's text with quotes and backslashes taken out and runs of slashes squeezed, lower case: for spotting a protected name anywhere in it. */
export function plainText(command: string): string {
  return command.replace(/["'\\]/g, '').replace(/\/+/g, '/').replace(/\/\.\//g, '/').toLowerCase()
}

/** What runs, as plain text: each simple command's words joined (quotes, heredoc bodies and comments gone). */
export function runnableText(command: string): string {
  if (command.length > MAX_COMMAND) return command
  return parse(command, 0, newBudget()).map(c => c.words.map(w => w.text).join(' ')).join('\n')
}
