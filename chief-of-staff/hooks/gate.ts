/**
 * The confirm gate's allow-list: which MCP tools an agent may call without
 * the person's OK. Everything not clearly read-only asks (or is refused where
 * nobody can be asked). Being exact matters more than being clever: an
 * unknown word asks.
 *
 * A tool may run without asking when:
 * - it is not a meta-tool that runs other tools or commands, and
 * - no word hides a high-risk verb (`sendmessage`, `SMSSend`), and
 * - the engine says it is read-only (`isReadOnly`), or its name is a read:
 *   every word (after the server's own name, `slack_` in
 *   `slack_read_channel`) is a read verb (get, list, search, ...) or a known
 *   noun, at least one is a read verb, and the first is not an action word
 *   (`post_status` asks, `get_post` does not); or
 * - it writes a draft and nothing more (`create_draft`, `update_comment_draft`,
 *   Slack's `send_message_draft`); or
 * - it generates media (images, video, audio, voice, designs) and the person
 *   left generation credits on `free` (`/delegate credits`).
 */

/** Verbs that only read. */
export const READ_VERBS = new Set([
  'get', 'list', 'search', 'read', 'find', 'fetch', 'query', 'describe', 'show', 'view', 'count', 'lookup',
  'inspect', 'estimate', 'suggest', 'browse', 'explore', 'download', 'resolve', 'check', 'scan', 'summarize', 'display',
  'extract', 'screenshot',
])

/**
 * Nouns a read may name. Plural forms of words that are also actions
 * (`posts`, `comments`, `replies`, `likes`) are nouns; their singulars count
 * as nouns only after a read verb (`get_post`), never as the first word.
 */
export const NOUNS = new Set([
  // people and places
  'user', 'users', 'profile', 'profiles', 'member', 'members', 'me', 'account', 'accounts', 'team', 'teams', 'org', 'orgs',
  'organization', 'organizations', 'workspace', 'workspaces', 'channel', 'channels', 'contact', 'contacts', 'people', 'person',
  'company', 'companies', 'customer', 'customers', 'audience', 'audiences', 'creator', 'creators', 'owner', 'owners',
  // messages and posts
  'message', 'messages', 'thread', 'threads', 'email', 'emails', 'mail', 'inbox', 'draft', 'drafts', 'label', 'labels',
  'attachment', 'attachments', 'conversation', 'conversations', 'chat', 'chats', 'post', 'posts', 'comment', 'comments',
  'reply', 'replies', 'like', 'likes', 'reaction', 'reactions', 'mention', 'mentions', 'feed', 'feeds', 'inspiration',
  'notification', 'notifications', 'connection', 'connections', 'request', 'requests', 'invitation', 'invitations',
  // calendar and time
  'event', 'events', 'calendar', 'calendars', 'time', 'times', 'slot', 'slots', 'availability', 'schedule', 'schedules',
  'date', 'dates', 'meeting', 'meetings',
  // files and content
  'file', 'files', 'folder', 'folders', 'directory', 'directories', 'document', 'documents', 'doc', 'docs', 'page', 'pages',
  'design', 'designs', 'template', 'templates', 'asset', 'assets', 'media', 'image', 'images', 'video', 'videos', 'audio',
  'voice', 'voices', 'canvas', 'canvases', 'list', 'lists', 'record', 'records', 'item', 'items', 'note', 'notes', 'content',
  'component', 'components', 'theme', 'themes', 'brand', 'brands', 'kit', 'kits', 'dataset', 'datasets', 'table', 'tables',
  'row', 'rows', 'column', 'columns', 'sheet', 'sheets', 'pdf', 'pdfs', 'text', 'url', 'urls', 'link', 'links', 'site',
  'sites', 'website', 'websites', 'repo', 'repos', 'repository', 'repositories', 'branch', 'branches', 'issue', 'issues',
  'pull', 'pulls', 'review', 'reviews', 'release', 'releases', 'tag', 'tags', 'project', 'projects', 'task', 'tasks',
  'job', 'jobs', 'run', 'runs', 'log', 'logs', 'bookmark', 'bookmarks', 'generation', 'generations', 'preset', 'presets',
  'model', 'models', 'character', 'characters', 'element', 'elements', 'block', 'blocks', 'snapshot', 'snapshots',
  'publication', 'sharing', 'game', 'playable', 'deployment', 'deployments', 'product', 'products', 'order', 'orders', 'invoice', 'invoices',
  'payment', 'payments', 'transaction', 'transactions', 'subscription', 'subscriptions', 'plan', 'plans', 'price', 'prices',
  'property', 'properties', 'accommodation', 'accommodations', 'attraction', 'attractions', 'hotel', 'hotels', 'room', 'rooms',
  'job', 'resume', 'resumes', 'session', 'sessions', 'process', 'processes', 'search', 'result', 'results', 'query', 'queries',
  // facts about things
  'status', 'info', 'details', 'detail', 'data', 'stats', 'analytics', 'metrics', 'usage', 'balance', 'cost', 'costs',
  'quote', 'quotes', 'history', 'config', 'settings', 'options', 'preferences', 'summary', 'overview', 'insights', 'insight',
  'formats', 'format', 'categories', 'category', 'types', 'type', 'fields', 'field', 'schema', 'schemas', 'version', 'versions',
  'changes', 'diff', 'tree', 'outline', 'trending', 'music', 'id', 'ids', 'name', 'names', 'count', 'counts', 'state',
  'size', 'sizes', 'preview', 'previews', 'public', 'private', 'all', 'my', 'recent', 'latest', 'new', 'more', 'next',
  'user', 'raw', 'full', 'by', 'to', 'for', 'of', 'in', 'from', 'with', 'per', 'about', 'on', 'spam', 'sensitive',
  'unread', 'starred', 'archived', 'shared', 'available', 'current', 'default', 'top', 'related', 'similar',
  'browser', 'network', 'once', 'web', 'html', 'markdown', 'screenshots',
])

/** Verbs that are never read words, wherever they stand (also matched inside unsplit names). */
export const HIGH_RISK = ['send', 'post', 'pay', 'publish', 'deploy', 'delete', 'transfer', 'refund', 'charge', 'merge', 'push']

/** Tools that run other tools, code, commands or processes: always ask. */
export const META = /(?:^|_)(?:multi_execute|proxy_execute|execute|exec|invoke|eval|shell|terminal|bash|command|commands|script|scripts|python|sandbox|interact|process|start_process|run_python|run_code|run_command|apps_invoke)(?:_|$)/

/** Draft work that does no more than write a draft. */
export const DRAFT_ONLY = /^(?:(?:create|update)_(?:(?:email|comment|post|message|reply|connection_request)_)?draft|send_message_draft)$/

/** Media generation (spends generation credits): free unless the person set `/delegate credits ask`. */
export const GENERATES = /^(?:generate(?:_[a-z0-9]+)*|[a-z0-9]+(?:_[a-z0-9]+)*_generate|upscale_[a-z0-9_]+|create_voice|remove_background|create_design|text_to_speech|speech_to_speech|text_to_sound_effects?|text_to_voice|voice_design)$/
/** Words that keep a generation tool asking anyway: renting hardware, buying, sharing, publishing. */
const NOT_JUST_GENERATION = /(?:^|_)(?:gpu|rent|rental|buy|purchase|credits?|billing|checkout|share|publish|deploy|send|post|upload|website|contest|connect|secret|secrets|db|exec|batch_send)(?:_|$)/

/**
 * An MCP tool's own name (after `mcp__<server>__`) as lower-case words joined
 * by `_`: separators, camelCase and acronyms all split (`sendMessage`,
 * `SMSSend`, `comment-on-design`). The server's own name as a first word is
 * dropped (`slack_read_channel` on the Slack server is `read_channel`).
 */
export function toolWords(tool: string): string {
  const parts = tool.startsWith('mcp__') ? tool.slice(5).split('__') : ['', tool]
  const server = (parts.length > 1 ? parts[0] ?? '' : '').toLowerCase().replace(/^plugin_/, '').split(/[^a-z0-9]+/).filter(Boolean)
  const own = (parts.length > 1 ? parts.slice(1) : parts).join('_')
  const words = own
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length > 1 && server.includes(words[0] ?? '')) words.shift()
  return words.join('_')
}

/** Whether a word (not known as a read word or noun) hides a high-risk verb: `sendmessage`, `smssend`. */
function hidesRisk(word: string): boolean {
  return !READ_VERBS.has(word) && !NOUNS.has(word) && !HIGH_RISK.includes(word) && HIGH_RISK.some(v => word.includes(v))
}

/**
 * Words that are nouns after a read verb (`get_post`) but actions when they
 * lead (`post_status`, `schedule_message`, `request_review`).
 */
export const LEADING_ACTIONS = new Set([
  'post', 'comment', 'reply', 'like', 'schedule', 'request', 'review', 'order', 'run', 'message', 'draft', 'label', 'tag',
  'event', 'record', 'note', 'link', 'process', 'quote', 'release', 'design', 'template', 'video', 'image', 'audio', 'voice',
  'preview', 'job', 'bookmark', 'pull', 'invoice', 'payment', 'subscription', 'plan', 'status', 'all', 'new', 'more', 'next',
])

/**
 * Whether a name is a read: every word is a read verb or a known noun, at
 * least one is a read verb, and the first word is not an action word
 * (`post_status` and `schedule_status` are not reads; `get_post`,
 * `accommodations_search` and `browser_fetch_once` are).
 */
export function isReadName(words: string[]): boolean {
  if (words.length === 0) return false
  const first = words[0] ?? ''
  if (HIGH_RISK.includes(first) || (LEADING_ACTIONS.has(first) && !READ_VERBS.has(first))) return false
  return words.some(w => READ_VERBS.has(w)) && words.every(w => NOUNS.has(w) || READ_VERBS.has(w))
}

export type McpVerdict = 'pass' | 'ask'
export type McpCheck = { verdict: McpVerdict; why: string }

/**
 * Whether an agent's MCP call may run without the person's OK. `isReadOnly`
 * is the engine's word on the tool (true only); `creditsFree` the person's
 * `/delegate credits` choice (free unless they set ask).
 */
export function checkMcp(tool: string, isReadOnly = false, creditsFree = true): McpCheck {
  const words = toolWords(tool)
  const list = words.split('_').filter(Boolean)
  if (words === '') return { verdict: 'ask', why: 'its name says nothing' }
  if (META.test(words)) return { verdict: 'ask', why: 'it runs other tools, code or commands' }
  if (list.some(hidesRisk)) return { verdict: 'ask', why: 'its name holds a sending, paying, publishing or deleting verb' }
  if (list.some(w => HIGH_RISK.includes(w)) && !DRAFT_ONLY.test(words) && !isReadName(list)) {
    return { verdict: 'ask', why: 'it sends, posts, publishes, deletes, pays or pushes' }
  }
  if (isReadOnly) return { verdict: 'pass', why: 'the engine says it is read-only' }
  if (isReadName(list)) return { verdict: 'pass', why: 'it only reads' }
  if (DRAFT_ONLY.test(words)) return { verdict: 'pass', why: 'it only writes a draft' }
  if (GENERATES.test(words) && !NOT_JUST_GENERATION.test(words)) {
    return creditsFree
      ? { verdict: 'pass', why: 'it generates media, and generation credits are free (/delegate credits)' }
      : { verdict: 'ask', why: 'it generates media, and the person asked to approve generation credits (/delegate credits ask)' }
  }
  return { verdict: 'ask', why: 'it is not clearly read-only' }
}

/** Whether an agent's call of this MCP tool needs the person's OK. */
export function sendsForPerson(tool: string, isReadOnly = false, creditsFree = true): boolean {
  if (!tool.startsWith('mcp__')) return false
  return checkMcp(tool, isReadOnly, creditsFree).verdict === 'ask'
}
