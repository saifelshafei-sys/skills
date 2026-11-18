import type { On } from 'claude-code'

import { FILES } from './files'

type Entry = { kind: 'file' | 'dir' | 'other'; isLink: boolean; size: number }

/**
 * Answers the plugin's `$.fs.list`, `$.fs.read` and `$.fs.stat` from `files`
 * (paths relative to the plugin folder, as in tests/files.ts), since tests
 * run with no file system. `kinds` overrides an entry (a link, a FIFO, a
 * size). Call it before the test's first `$` call.
 */
export function serve(on: On, files: Record<string, string> = FILES, kinds: Record<string, Partial<Entry>> = {}): void {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '')
  const key = (path: string) => Object.keys(files).find(k => norm(path).endsWith(`/${k}`))
  const entry = (k: string): Entry => ({ kind: 'file', isLink: false, size: (files[k] ?? '').length, ...kinds[k] })
  on('fs.read', (_, e) => {
    const k = key(e.path)
    if (k === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: files[k] as string }
  })
  on('fs.list', (_, e) => {
    const dir = norm(e.path)
    const folders = [...new Set(Object.keys(files).filter(k => k.includes('/')).map(k => k.slice(0, k.lastIndexOf('/'))))]
    const folder = folders.find(f => dir.endsWith(`/${f}`))
    const names = folder !== undefined
      ? Object.keys(files).filter(k => k.startsWith(`${folder}/`) && !k.slice(folder.length + 1).includes('/'))
      : Object.keys(files).filter(k => !k.includes('/'))
    const out = names.map(k => ({ name: k.slice(k.lastIndexOf('/') + 1), mtimeMs: 0, ...entry(k) }))
    if (folder === undefined) out.push(...folders.filter(f => !f.includes('/')).map(f => ({ name: f, kind: 'dir' as const, isLink: false, size: 0, mtimeMs: 0 })))
    return { value: out }
  })
  on('fs.stat', (_, e) => {
    const k = key(e.path)
    if (k === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: { ...entry(k), mtimeMs: 0, realPath: e.path } }
  })
}
