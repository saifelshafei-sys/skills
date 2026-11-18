import type { On } from 'claude-code'

import { FILES } from './files'

/**
 * Answers the plugin's `$.fs.read` and `$.fs.list` from `files` (paths
 * relative to the plugin folder, as in tests/files.ts), since tests run with
 * no file system. Call it before the test's first `$` call.
 */
export function serve(on: On, files: Record<string, string> = FILES): void {
  const key = (path: string) => Object.keys(files).find(k => path.replace(/\\/g, '/').endsWith(`/${k}`))
  on('fs.read', (_, e) => {
    const k = key(e.path)
    if (k === undefined) throw new Error(`ENOENT: ${e.path}`)
    return { value: files[k] as string }
  })
  on('fs.list', (_, e) => {
    const dir = e.path.replace(/\\/g, '/').replace(/\/+$/, '')
    const names = Object.keys(files).filter(k => k.includes('/') && dir.endsWith(`/${k.slice(0, k.lastIndexOf('/'))}`))
    if (names.length === 0) throw new Error(`ENOENT: ${e.path}`)
    return { value: names.map(k => ({ name: k.slice(k.lastIndexOf('/') + 1), kind: 'file' as const, size: (files[k] ?? '').length, mtimeMs: 0, isLink: false })) }
  })
}
