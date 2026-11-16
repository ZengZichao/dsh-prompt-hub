/**
 * dsh-prompt-hub — Host half.
 *
 * Owns the prompt library as one JSON document under `$DSH_HOME/prompt-hub/data.json`
 * and exposes it three ways, all over the same operations:
 *
 *   GET  /dsh-prompt-hub/data  → { ok: true, data, rev }
 *   POST /dsh-prompt-hub/data  → body { data, expectedRev? }
 *                                 → { ok: true, data, rev }
 *                                 → 409 { ok:false, code:'conflict', data, rev }
 *   prompt_hub (agent tool)    → search / list / get / create / update / delete
 *                                 create_category / rename_category / delete_category
 *                                 reorder_category
 *
 * The document shape is:
 *   { version: 1, rev: 12,
 *     categories: [{ id, name, order }],
 *     prompts:    [{ id, categoryId, title, content, tags, pinned,
 *                    createdAt, updatedAt }] }
 *
 * `rev` is the compare-and-swap token: a writer that passes `expectedRev` is
 * rejected when the file has moved on, so the browser and the agent tool cannot
 * silently overwrite each other. Every successful write first copies the current
 * file into `backups/` (kept to MAX_BACKUPS), and a corrupt or unreadable file is
 * repaired from the newest backup instead of bricking the panel.
 */

import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const name = 'dsh-prompt-hub'
export const inject = ['tools']

const ROUTE = '/dsh-prompt-hub/data'
const DATA_DIR = 'prompt-hub'
const DATA_FILE = 'data.json'
const BACKUP_DIR = 'backups'
const BACKUP_RE = /^data\..*\.json$/
const MAX_BACKUPS = 10
const MAX_BODY_BYTES = 2 * 1024 * 1024
const MAX_CATEGORIES = 500
const MAX_PROMPTS = 5000
const MAX_CONTENT_CHARS = 100_000
const MAX_NAME_CHARS = 200
const MAX_TAGS = 20
const MAX_TAG_CHARS = 40
const PREVIEW_CHARS = 160
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const LIST_PAGE_SIZE = 50

const TOOL_NAME = 'prompt_hub'
const ACTIONS = [
  'search', 'list', 'get',
  'create', 'update', 'delete',
  'create_category', 'rename_category', 'delete_category', 'reorder_category',
]

const KNOWN_TOP = new Set(['version', 'rev', 'categories', 'prompts'])
const KNOWN_CATEGORY = new Set(['id', 'name', 'order'])
const KNOWN_PROMPT = new Set(['id', 'categoryId', 'title', 'content', 'tags', 'pinned', 'createdAt', 'updatedAt'])

/** Empty library used when no file exists yet. */
function emptyData() {
  return { version: 1, rev: 0, categories: [], prompts: [] }
}

/**
 * Resolve `$DSH_HOME`.
 *
 * The host provides `dshHomePath` as a function `(...segments) => path`
 * (`@deepseek-ai/dsh-home-paths`, registered by app-boot; some builds expose a
 * string or `{ path }`). Everything is defensive: the plugin must still work
 * when the service is absent, so it falls back to the environment and then to
 * `~/.dsh`.
 */
function resolveHome(ctx) {
  try {
    const service = typeof ctx.get === 'function' ? ctx.get('dshHomePath', false) : undefined
    if (typeof service === 'function') {
      const home = service()
      if (typeof home === 'string' && home) return home
    }
    if (typeof service === 'string' && service) return service
    if (service && typeof service.path === 'string' && service.path) return service.path
  } catch { /* fall through */ }
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanString(value, maxChars) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (trimmed.length > maxChars) return trimmed.slice(0, maxChars)
  return trimmed
}

/** Copy keys a future schema may have added, so a save never drops them. */
function unknownKeys(entry, known) {
  const extra = {}
  for (const key of Object.keys(entry)) {
    if (!known.has(key) && entry[key] !== undefined) extra[key] = entry[key]
  }
  return extra
}

function normalizeTags(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const tags = []
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const tag = entry.trim()
    if (!tag || tag.length > MAX_TAG_CHARS) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    tags.push(tag)
    if (tags.length >= MAX_TAGS) break
  }
  return tags
}

function newId(prefix) {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return prefix + '_' + crypto.randomUUID().slice(0, 8)
    }
  } catch { /* fall through */ }
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/**
 * Validate and normalize an untrusted library document.
 *
 * Structural problems throw (the caller sent something unusable); individual
 * malformed rows are dropped so one bad entry cannot hide the rest. Unknown
 * fields are carried through, so adding a field later never destroys data
 * written by an older build.
 */
export function normalizeData(raw) {
  if (!isPlainObject(raw)) throw new Error('data must be an object')

  const rawCategories = raw.categories === undefined ? [] : raw.categories
  const rawPrompts = raw.prompts === undefined ? [] : raw.prompts
  if (!Array.isArray(rawCategories)) throw new Error('categories must be an array')
  if (!Array.isArray(rawPrompts)) throw new Error('prompts must be an array')
  if (rawCategories.length > MAX_CATEGORIES) throw new Error(`too many categories (max ${MAX_CATEGORIES})`)
  if (rawPrompts.length > MAX_PROMPTS) throw new Error(`too many prompts (max ${MAX_PROMPTS})`)

  const categories = []
  const categoryIds = new Set()
  for (const entry of rawCategories) {
    if (!isPlainObject(entry)) continue
    const id = cleanString(entry.id, 128)
    const name = cleanString(entry.name, MAX_NAME_CHARS)
    if (!id || !name || categoryIds.has(id)) continue
    const order = Number.isFinite(entry.order) ? entry.order : categories.length
    categoryIds.add(id)
    categories.push({ id, name, order, ...unknownKeys(entry, KNOWN_CATEGORY) })
  }

  const prompts = []
  const promptIds = new Set()
  for (const entry of rawPrompts) {
    if (!isPlainObject(entry)) continue
    const id = cleanString(entry.id, 128)
    const title = cleanString(entry.title, MAX_NAME_CHARS)
    if (!id || !title || promptIds.has(id)) continue
    const content = typeof entry.content === 'string' ? entry.content : ''
    if (content.length > MAX_CONTENT_CHARS) {
      throw new Error(`prompt "${title}" exceeds ${MAX_CONTENT_CHARS} characters`)
    }
    const categoryId = typeof entry.categoryId === 'string' ? entry.categoryId : ''
    const createdAt = Number.isFinite(entry.createdAt) ? entry.createdAt : Date.now()
    const updatedAt = Number.isFinite(entry.updatedAt) ? entry.updatedAt : createdAt
    promptIds.add(id)
    prompts.push({
      id, categoryId, title, content,
      tags: normalizeTags(entry.tags),
      pinned: entry.pinned === true,
      createdAt, updatedAt,
      ...unknownKeys(entry, KNOWN_PROMPT),
    })
  }

  const version = Number.isFinite(raw.version) ? raw.version : 1
  const rev = Number.isFinite(raw.rev) ? raw.rev : 0
  return { version, rev, categories, prompts, ...unknownKeys(raw, KNOWN_TOP) }
}

// ------------------------------------------------------------- operations ----
// One implementation, two callers (the HTTP route and the agent tool).

/** Find a category by id or exact name. Returns undefined when absent. */
function findCategory(data, idOrName) {
  if (typeof idOrName !== 'string' || idOrName.trim() === '') return undefined
  const needle = idOrName.trim()
  return data.categories.find((category) => category.id === needle || category.name === needle)
}

/** True when a category filter was supplied, so an unknown name can mean "no matches". */
function hasCategoryFilter(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Resolve a category reference to an id.
 *
 * `required` decides what an unknown name means: a filter treats it as "match
 * nothing", a write treats it as an error, because silently putting a prompt in
 * the wrong place is worse than refusing.
 */
function categoryIdFor(data, value, required) {
  if (!hasCategoryFilter(value)) return ''
  const category = findCategory(data, value)
  if (!category) {
    if (required) throw new Error(`no category named "${String(value).trim()}"`)
    return ''
  }
  return category.id
}

/** Pinned first, then most recently updated. */
function sortPrompts(prompts) {
  return prompts.slice().sort((a, b) => {
    const ap = a.pinned ? 1 : 0
    const bp = b.pinned ? 1 : 0
    if (ap !== bp) return bp - ap
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })
}

function listCategories(data) {
  return data.categories
    .slice()
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name))
    .map((category) => ({
      id: category.id,
      name: category.name,
      count: data.prompts.filter((prompt) => prompt.categoryId === category.id).length,
    }))
}

function summarize(prompt, categories) {
  const category = categories.find((entry) => entry.id === prompt.categoryId)
  const flat = prompt.content.replace(/\s+/g, ' ').trim()
  return {
    id: prompt.id,
    title: prompt.title,
    categoryId: prompt.categoryId,
    category: category ? category.name : '',
    tags: prompt.tags || [],
    pinned: prompt.pinned === true,
    updatedAt: prompt.updatedAt,
    preview: flat.length > PREVIEW_CHARS ? flat.slice(0, PREVIEW_CHARS) + '…' : flat,
  }
}

function describePrompt(data, prompt) {
  const category = data.categories.find((entry) => entry.id === prompt.categoryId)
  return {
    id: prompt.id,
    title: prompt.title,
    categoryId: prompt.categoryId,
    category: category ? category.name : '',
    tags: prompt.tags || [],
    pinned: prompt.pinned === true,
    content: prompt.content,
    createdAt: prompt.createdAt,
    updatedAt: prompt.updatedAt,
  }
}

/** Collect the prompts matching a filter, then page them. */
function selectPrompts(data, options) {
  const query = typeof options?.query === 'string' ? options.query.trim().toLowerCase() : ''
  const filterValue = options?.category
  const filter = hasCategoryFilter(filterValue) ? findCategory(data, filterValue) : undefined
  if (filter === undefined && hasCategoryFilter(filterValue)) {
    return { matches: [], total: 0, truncated: false }
  }
  const tag = typeof options?.tag === 'string' ? options.tag.trim().toLowerCase() : ''
  const pinnedOnly = options?.pinned === true
  const offset = Number.isFinite(options?.offset) ? Math.max(0, Math.floor(options.offset)) : 0
  let limit = Number.isFinite(options?.limit) ? Math.floor(options.limit) : DEFAULT_LIMIT
  if (limit <= 0) limit = DEFAULT_LIMIT
  limit = Math.min(MAX_LIMIT, limit)

  const matches = []
  for (const prompt of sortPrompts(data.prompts)) {
    if (filter && prompt.categoryId !== filter.id) continue
    if (tag && !(prompt.tags || []).some((entry) => entry.toLowerCase().includes(tag))) continue
    if (pinnedOnly && !prompt.pinned) continue
    if (query) {
      const haystack = (prompt.title + '\n' + (prompt.tags || []).join(' ') + '\n' + prompt.content).toLowerCase()
      if (!haystack.includes(query)) continue
    }
    matches.push(prompt)
  }
  const page = matches.slice(offset, offset + limit)
  return { matches: page, total: matches.length, truncated: matches.length > offset + page.length }
}

/** Create a prompt. */
function createPrompt(data, input) {
  const title = cleanString(input?.title, MAX_NAME_CHARS)
  const content = typeof input?.content === 'string' ? input.content : ''
  if (!title) throw new Error('title is required')
  if (!content.trim()) throw new Error('content is required')
  // A supplied category must exist: silently filing a prompt under nothing is
  // worse than refusing and letting the model create the category first.
  const categoryId = categoryIdFor(data, input?.category ?? input?.categoryId, true)
  const now = Date.now()
  const prompt = {
    id: newId('p'),
    categoryId,
    title,
    content,
    tags: normalizeTags(input?.tags),
    pinned: input?.pinned === true,
    createdAt: now,
    updatedAt: now,
  }
  return { data: { ...data, prompts: [prompt, ...data.prompts] }, prompt }
}

/** Update a prompt. Only the supplied fields change. */
function updatePrompt(data, input) {
  const id = cleanString(input?.id, 128)
  const existing = data.prompts.find((prompt) => prompt.id === id)
  if (!existing) throw new Error(`no prompt with id "${id}"`)

  const title = input?.title !== undefined ? cleanString(input.title, MAX_NAME_CHARS) : existing.title
  const content = input?.content !== undefined ? String(input.content) : existing.content
  if (!title) throw new Error('title must not be empty')
  if (!content.trim()) throw new Error('content must not be empty')

  let categoryId = existing.categoryId
  if (input?.category !== undefined || input?.categoryId !== undefined) {
    categoryId = categoryIdFor(data, input?.category ?? input?.categoryId, true)
  }
  const tags = input?.tags !== undefined ? normalizeTags(input.tags) : existing.tags
  const pinned = input?.pinned !== undefined ? input.pinned === true : existing.pinned

  const updated = { ...existing, title, content, categoryId, tags, pinned, updatedAt: Date.now() }
  return { data: { ...data, prompts: data.prompts.map((prompt) => prompt.id === id ? updated : prompt) }, prompt: updated }
}

function deletePrompt(data, id) {
  const target = data.prompts.find((prompt) => prompt.id === id)
  if (!target) throw new Error(`no prompt with id "${id}"`)
  return { data: { ...data, prompts: data.prompts.filter((prompt) => prompt.id !== id) }, deleted: target }
}

function togglePin(data, id) {
  const existing = data.prompts.find((prompt) => prompt.id === id)
  if (!existing) throw new Error(`no prompt with id "${id}"`)
  const updated = { ...existing, pinned: !existing.pinned, updatedAt: Date.now() }
  return { data: { ...data, prompts: data.prompts.map((prompt) => prompt.id === id ? updated : prompt) }, prompt: updated }
}

/** Create a category. */
function createCategory(data, input) {
  const name = cleanString(input?.name, MAX_NAME_CHARS)
  if (!name) throw new Error('name is required')
  const category = { id: newId('c'), name, order: data.categories.length }
  return { data: { ...data, categories: [...data.categories, category] }, category }
}

/** Rename a category. */
function renameCategory(data, input) {
  const id = cleanString(input?.id, 128)
  const name = cleanString(input?.name, MAX_NAME_CHARS)
  if (!name) throw new Error('name is required')
  const existing = data.categories.find((category) => category.id === id)
  if (!existing) throw new Error(`no category with id "${id}"`)
  const updated = { ...existing, name }
  return { data: { ...data, categories: data.categories.map((category) => category.id === id ? updated : category) }, category: updated }
}

/** Delete a category; its prompts move to uncategorized. */
function deleteCategory(data, id) {
  const target = data.categories.find((category) => category.id === id)
  if (!target) throw new Error(`no category with id "${id}"`)
  return {
    data: {
      ...data,
      categories: data.categories.filter((category) => category.id !== id),
      prompts: data.prompts.map((prompt) => prompt.categoryId === id ? { ...prompt, categoryId: '' } : prompt),
    },
    deleted: target,
  }
}

/** Move a category one slot up or down and renumber the whole list. */
function reorderCategory(data, id, direction) {
  const ordered = data.categories.slice().sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name))
  const index = ordered.findIndex((category) => category.id === id)
  if (index < 0) throw new Error(`no category with id "${id}"`)
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= ordered.length) throw new Error(`category is already at the ${direction === 'up' ? 'top' : 'bottom'}`)
  const [moved] = ordered.splice(index, 1)
  ordered.splice(target, 0, moved)
  const categories = ordered.map((category, position) => ({ ...category, order: position }))
  return { data: { ...data, categories }, categories }
}

// -------------------------------------------------------------- rendering ----

function formatCategories(categories) {
  if (!Array.isArray(categories) || categories.length === 0) return ''
  return 'Categories: ' + categories.map((category) => `${category.name} (${category.count})`).join(', ') + '\n'
}

function formatPromptLine(prompt) {
  const bits = []
  if (prompt.pinned) bits.push('📌')
  bits.push(prompt.title)
  if (prompt.category) bits.push(`[${prompt.category}]`)
  if (Array.isArray(prompt.tags) && prompt.tags.length > 0) bits.push(prompt.tags.map((tag) => `#${tag}`).join(' '))
  return `- ${bits.join(' ')} (id: ${prompt.id})\n  ${prompt.preview}`
}

function formatToolResult(args, value) {
  if (!isPlainObject(value) || value.ok !== true) {
    return 'prompt_hub failed: ' + (isPlainObject(value) && value.message ? value.message : 'operation failed')
  }
  switch (value.action) {
    case 'search':
    case 'list': {
      const header = formatCategories(value.categories)
      if (!Array.isArray(value.prompts) || value.prompts.length === 0) {
        return header ? header + 'No prompts.' : 'No prompts.'
      }
      const lines = value.prompts.map(formatPromptLine)
      const tail = value.truncated ? `\n… ${value.total - value.prompts.length} more; narrow the search or pass a higher limit/offset.` : ''
      return header + lines.join('\n') + tail
    }
    case 'get': {
      const prompt = value.prompt
      const heading = `${prompt.pinned ? '📌 ' : ''}# ${prompt.title}${prompt.category ? ` [${prompt.category}]` : ''}`
      const tags = Array.isArray(prompt.tags) && prompt.tags.length > 0 ? `\nTags: ${prompt.tags.map((tag) => `#${tag}`).join(' ')}` : ''
      return `${heading}${tags}\n\n${prompt.content}`
    }
    case 'create':
    case 'update':
      return `Saved prompt "${value.prompt.title}" (id: ${value.prompt.id}).`
    case 'delete':
      return `Deleted prompt "${value.title}" (id: ${value.id}).`
    case 'create_category':
    case 'rename_category':
      return `Saved category "${value.category.name}" (id: ${value.category.id}).`
    case 'delete_category':
      return `Deleted category "${value.name}" (id: ${value.id}); its prompts are now uncategorized.`
    case 'reorder_category':
      return `Reordered category "${value.category.name}" (id: ${value.category.id}) to position ${value.category.order}.`
    default:
      return JSON.stringify(value)
  }
}

// ----------------------------------------------------------------- plugin ----

/** Accept the desktop document origin, a real same-origin request, or a non-browser caller. */
function isTrustedRequest(request) {
  const origin = request.headers ? request.headers.origin : undefined
  if (origin === undefined) return true
  if (origin === 'dsh-app://app') return true
  const host = request.headers ? request.headers.host : undefined
  if (host === undefined) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': 'application/json; charset=utf-8',
  })
  response.end(JSON.stringify(payload))
}

/** Read a bounded JSON request body; resolves to {} for an empty body. */
function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    let settled = false
    request.setEncoding('utf8')
    request.on('data', (chunk) => {
      if (settled) return
      raw += chunk
      if (raw.length > MAX_BODY_BYTES) {
        settled = true
        reject(new Error('request body too large'))
        // Stop pulling more of an oversized body into memory.
        try { request.pause() } catch { /* streams without pause are still settled */ }
      }
    })
    request.on('end', () => {
      if (settled) return
      settled = true
      if (raw.length === 0) return resolve({})
      try { resolve(JSON.parse(raw)) } catch { reject(new Error('invalid JSON')) }
    })
    request.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
  })
}

export function apply(ctx) {
  const home = resolveHome(ctx)
  const file = path.join(home, DATA_DIR, DATA_FILE)
  const backupDirectory = path.join(home, DATA_DIR, BACKUP_DIR)

  /** Serialized writes: a later save never lands before an earlier one. */
  let writing = Promise.resolve()
  /** Serialized read-modify-write for the agent tool, so two calls cannot clobber. */
  let criticalSection = Promise.resolve()

  async function writeFileAtomic(target, json) {
    await fs.mkdir(path.dirname(target), { recursive: true })
    const tmp = `${target}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`
    try {
      await fs.writeFile(tmp, json, 'utf8')
      await fs.rename(tmp, target)
    } catch (error) {
      try { await fs.rm(tmp, { force: true }) } catch { /* best effort */ }
      throw error
    }
  }

  async function pruneBackups() {
    try {
      const names = (await fs.readdir(backupDirectory)).filter((name) => BACKUP_RE.test(name)).sort()
      while (names.length > MAX_BACKUPS) {
        const oldest = names.shift()
        try { await fs.rm(path.join(backupDirectory, oldest), { force: true }) } catch { /* best effort */ }
      }
    } catch { /* backups are best effort */ }
  }

  /** Copy the current file aside before it is replaced. */
  async function backupCurrent() {
    try {
      await fs.mkdir(backupDirectory, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const target = path.join(backupDirectory, `data.${stamp}.${Math.random().toString(36).slice(2, 8)}.json`)
      await fs.copyFile(file, target)
      await pruneBackups()
    } catch { /* no current file yet, or the copy failed: non-fatal */ }
  }

  /** Newest-first repair: restore the main file from the best backup we can read. */
  async function restoreFromBackup() {
    let names = []
    try {
      names = (await fs.readdir(backupDirectory)).filter((name) => BACKUP_RE.test(name)).sort()
    } catch { return undefined }
    for (let index = names.length - 1; index >= 0; index--) {
      try {
        const raw = JSON.parse(await fs.readFile(path.join(backupDirectory, names[index]), 'utf8'))
        const normalized = normalizeData(raw)
        await writeFileAtomic(file, JSON.stringify(normalized))
        return normalized
      } catch { /* try the next oldest */ }
    }
    return undefined
  }

  async function readData() {
    let raw
    try {
      raw = await fs.readFile(file, 'utf8')
    } catch (error) {
      if (error && error.code === 'ENOENT') return emptyData()
      throw error
    }
    try {
      return normalizeData(JSON.parse(raw))
    } catch (error) {
      // A corrupt file must not brick the panel: fall back to the newest backup
      // and put the repaired document back in place.
      const restored = await restoreFromBackup()
      if (restored) return restored
      throw error
    }
  }

  /**
   * Normalize and persist. `expectedRev` is the compare-and-swap token: when it
   * is supplied and the file has moved on, the write is rejected and the current
   * document is returned so the caller can reload instead of overwriting.
   */
  async function writeData(raw, expectedRev) {
    const normalized = normalizeData(raw)
    const run = writing.then(async () => {
      let currentRev = 0
      try {
        const currentRaw = JSON.parse(await fs.readFile(file, 'utf8'))
        currentRev = Number.isFinite(currentRaw?.rev) ? currentRaw.rev : 0
      } catch { currentRev = 0 }

      if (expectedRev !== undefined && currentRev !== expectedRev) {
        const conflict = new Error('the library changed elsewhere; reload and try again')
        conflict.code = 'conflict'
        conflict.rev = currentRev
        conflict.data = await readData()
        throw conflict
      }

      const base = Math.max(currentRev, Number.isFinite(normalized.rev) ? normalized.rev : 0)
      const next = { ...normalized, rev: base + 1 }
      await backupCurrent()
      await writeFileAtomic(file, JSON.stringify(next))
      return next
    })
    writing = run.catch(() => {})
    return run
  }

  /** Read, mutate through one operation, persist. Shared by the agent tool. */
  async function change(operation) {
    const run = criticalSection.then(async () => {
      const current = await readData()
      const result = operation(current)
      const saved = await writeData(result.data, current.rev)
      return { ...result, data: saved }
    })
    criticalSection = run.catch(() => {})
    return run
  }

  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      const dispose = host.webServer.register({
        kind: 'exact',
        path: ROUTE,
        handler: async (request, response) => {
          if (request.method !== 'GET' && request.method !== 'POST') {
            response.writeHead(405, { allow: 'GET, POST' })
            response.end()
            return
          }
          if (!isTrustedRequest(request)) {
            sendJson(response, 403, { ok: false, code: 'untrusted_origin', error: 'untrusted origin' })
            return
          }
          try {
            if (request.method === 'GET') {
              const data = await readData()
              sendJson(response, 200, { ok: true, data, rev: data.rev })
              return
            }
            const body = await readJsonBody(request)
            const payload = isPlainObject(body) && isPlainObject(body.data) ? body.data : body
            const expectedRev = Number.isFinite(body?.expectedRev) ? body.expectedRev : undefined
            const data = await writeData(payload, expectedRev)
            sendJson(response, 200, { ok: true, data, rev: data.rev })
          } catch (error) {
            if (error && error.code === 'conflict') {
              sendJson(response, 409, {
                ok: false, code: 'conflict', error: error.message,
                data: error.data, rev: error.rev,
              })
              return
            }
            const message = error instanceof Error ? error.message : String(error)
            sendJson(response, 400, { ok: false, code: 'invalid_data', error: message })
          }
        },
      })
      return () => dispose()
    }, 'dsh-prompt-hub: data route')
  })

  ctx.effect(() => ctx.tools.register({
    name: TOOL_NAME,
    description: 'Read and manage the prompt library: search prompts by keyword or tag, browse by category, retrieve one prompt\'s full text, and create, update, pin, or delete prompts and categories. Use it when the user refers to a saved prompt, asks you to remember or reuse one, or wants the library updated. Prompts are stored on the user\'s machine and shared with the sidebar prompt hub.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action'],
      properties: {
        action: {
          type: 'string',
          description: 'search: find prompts; list: browse a category; get: one prompt\'s full text; create / update / delete: write prompts; create_category / rename_category / delete_category / reorder_category: manage categories.',
          enum: ACTIONS,
        },
        query: { type: 'string', description: 'Keyword matched against title, tags and content (search).' },
        category: { type: 'string', description: 'Category id or name to filter by (search/list), or the category a prompt belongs to (create/update).' },
        tag: { type: 'string', description: 'Tag to filter by (search/list).' },
        id: { type: 'string', description: 'Prompt or category id from search/list. Required for update, delete and rename_category; selects the entry for reorder_category.' },
        title: { type: 'string', description: 'Prompt title. Required for create.' },
        content: { type: 'string', description: 'Prompt body text. Required for create.' },
        tags: {
          type: 'array',
          description: 'Short labels shown on the prompt and usable as filters.',
          items: { type: 'string' },
        },
        pinned: { type: 'boolean', description: 'Pin the prompt so it sorts first.' },
        name: { type: 'string', description: 'Category name. Required for create_category and rename_category.' },
        direction: { type: 'string', description: 'reorder_category only: up or down.', enum: ['up', 'down'] },
        offset: { type: 'integer', description: 'Number of matches to skip (search/list).' },
        limit: { type: 'integer', description: `Page size (search/list; default ${DEFAULT_LIMIT}, max ${MAX_LIMIT}).` },
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          message: { type: 'string' },
          count: { type: 'integer' },
          total: { type: 'integer' },
          truncated: { type: 'boolean' },
          offset: { type: 'integer' },
          categories: { type: 'array', items: { type: 'object', additionalProperties: true } },
          prompts: { type: 'array', items: { type: 'object', additionalProperties: true } },
          prompt: { type: 'object', additionalProperties: true },
          category: { type: 'object', additionalProperties: true },
        },
      },
      render: (args, value) => [{ type: 'text', text: formatToolResult(args, value) }],
    },
    async execute(args) {
      const action = typeof args?.action === 'string' ? args.action : ''
      const data = await readData()

      switch (action) {
        case 'search': {
          const result = selectPrompts(data, args)
          return {
            ok: true, action,
            count: result.matches.length, total: result.total, truncated: result.truncated,
            categories: listCategories(data),
            prompts: result.matches.map((prompt) => summarize(prompt, data.categories)),
          }
        }
        case 'list': {
          const page = { ...args, limit: Number.isFinite(args?.limit) ? args.limit : LIST_PAGE_SIZE }
          const result = selectPrompts(data, page)
          return {
            ok: true, action,
            count: result.matches.length, total: result.total, truncated: result.truncated,
            offset: Number.isFinite(args?.offset) ? Math.max(0, Math.floor(args.offset)) : 0,
            categories: listCategories(data),
            prompts: result.matches.map((prompt) => summarize(prompt, data.categories)),
          }
        }
        case 'get': {
          const id = cleanString(args?.id, 128)
          const prompt = data.prompts.find((entry) => entry.id === id)
          if (!prompt) return { ok: false, action, message: `no prompt with id "${id}"` }
          return { ok: true, action, prompt: describePrompt(data, prompt) }
        }
        case 'create': {
          const result = await change((current) => createPrompt(current, args))
          return { ok: true, action, prompt: summarize(result.prompt, result.data.categories) }
        }
        case 'update': {
          const result = await change((current) => updatePrompt(current, args))
          return { ok: true, action, prompt: summarize(result.prompt, result.data.categories) }
        }
        case 'delete': {
          const id = cleanString(args?.id, 128)
          const result = await change((current) => deletePrompt(current, id))
          return { ok: true, action, id: result.deleted.id, title: result.deleted.title }
        }
        case 'create_category': {
          const result = await change((current) => createCategory(current, args))
          return { ok: true, action, category: result.category }
        }
        case 'rename_category': {
          const result = await change((current) => renameCategory(current, args))
          return { ok: true, action, category: result.category }
        }
        case 'delete_category': {
          const id = cleanString(args?.id, 128)
          const result = await change((current) => deleteCategory(current, id))
          return { ok: true, action, id: result.deleted.id, name: result.deleted.name }
        }
        case 'reorder_category': {
          const id = cleanString(args?.id, 128)
          const direction = args?.direction === 'up' ? 'up' : 'down'
          const result = await change((current) => reorderCategory(current, id, direction))
          return { ok: true, action, category: result.categories.find((category) => category.id === id) }
        }
        default:
          return { ok: false, action, message: `unknown action "${action}"; expected one of ${ACTIONS.join(', ')}` }
      }
    },
  }), 'dsh-prompt-hub: prompt_hub tool')
}
