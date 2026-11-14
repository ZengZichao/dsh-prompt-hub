/**
 * Host-half tests for dsh-prompt-hub.
 *
 * Run with `npm test` (or `node --test test/host.test.mjs`) from the package
 * root. Every test gets its own throwaway `$DSH_HOME` under the system temp
 * directory; no real library is touched.
 */

import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { apply, normalizeData } from '../index.js'

const tempRoots = []

/** A fresh `$DSH_HOME`, the plugin mounted on it, and its registrations. */
async function makeCtx() {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-ph-test-'))
  tempRoots.push(home)
  const file = path.join(home, 'prompt-hub', 'data.json')
  const backupDir = path.join(home, 'prompt-hub', 'backups')
  const registered = {}
  const scope = {
    webServer: {
      register(route) {
        registered.route = route.handler
        return () => { delete registered.route }
      },
    },
    effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    on() { return () => {} },
  }
  const ctx = {
    get(name) { if (name === 'dshHomePath') return () => home; return undefined },
    inject(_deps, cb) { cb(scope); return () => {} },
    effect(fn) { const dispose = fn(); return typeof dispose === 'function' ? dispose : () => {} },
    tools: {
      register(definition) {
        registered.tool = definition
        return () => { delete registered.tool }
      },
    },
  }
  apply(ctx)
  return { ctx, registered, home, file, backupDir }
}

test('cleanup', async () => {
  for (const root of tempRoots) {
    await fs.rm(root, { recursive: true, force: true }).catch(() => {})
  }
})

function request(method, body, origin) {
  return {
    method,
    headers: { host: '127.0.0.1:62726', origin: origin === undefined ? 'http://127.0.0.1:62726' : origin },
    setEncoding() {},
    on(event, cb) {
      if (event === 'data') cb(Buffer.from(body === undefined ? '' : JSON.stringify(body)))
      if (event === 'end') cb()
      return this
    },
  }
}

function response() {
  return {
    statusCode: null, payload: null,
    writeHead(status) { this.statusCode = status; return this },
    end(chunk) { this.payload = chunk; return this },
  }
}

async function get(registered) {
  const res = response()
  await registered.route(request('GET'), res)
  return { status: res.statusCode, body: JSON.parse(res.payload) }
}

async function post(registered, body) {
  const res = response()
  await registered.route(request('POST', body), res)
  return { status: res.statusCode, body: JSON.parse(res.payload) }
}

const run = (tool, args) => tool.execute(args)
const rendered = (tool, args, value) => tool.output.render(args, value)[0].text

// ---------------------------------------------------------- normalizeData ----

test('normalizeData fills defaults and preserves unknown fields', () => {
  const out = normalizeData({
    version: 1,
    rev: 7,
    futureTop: { keep: true },
    categories: [{ id: 'c1', name: '通用', order: 0, futureCat: 1 }],
    prompts: [{ id: 'p1', title: '标题', content: '内容', categoryId: 'c1', futurePrompt: 2 }],
  })
  assert.equal(out.version, 1)
  assert.equal(out.rev, 7)
  assert.deepEqual(out.futureTop, { keep: true })
  assert.equal(out.categories[0].futureCat, 1)
  assert.deepEqual(out.prompts[0].tags, [])
  assert.equal(out.prompts[0].pinned, false)
  assert.equal(out.prompts[0].futurePrompt, 2)
})

test('normalizeData normalizes tags and drops duplicates', () => {
  const out = normalizeData({
    prompts: [{ id: 'p1', title: 't', content: 'c', tags: [' A ', 'a', 'b', '', 5, 'x'.repeat(60)] }],
  })
  assert.deepEqual(out.prompts[0].tags, ['A', 'b'])
})

test('normalizeData rejects non-array collections and oversized content', () => {
  assert.throws(() => normalizeData({ categories: {} }), /categories must be an array/)
  assert.throws(() => normalizeData({ prompts: 'x' }), /prompts must be an array/)
  assert.throws(
    () => normalizeData({ prompts: [{ id: 'p1', title: 't', content: 'x'.repeat(100001) }] }),
    /exceeds/,
  )
})

test('normalizeData keeps malformed rows out instead of failing the whole document', () => {
  const out = normalizeData({
    categories: [{ id: 'c1', name: 'a' }, { id: 'c1', name: 'b' }, { name: 'no id' }, null],
    prompts: [{ id: 'p1', title: 'a' }, { id: 'p1', title: 'b' }, { id: 'p2', title: '  ' }],
  })
  assert.equal(out.categories.length, 1)
  assert.equal(out.prompts.length, 1)
})

// ---------------------------------------------------------------- writes ----

test('writes bump rev and the route returns it', async () => {
  const { registered } = await makeCtx()
  assert.equal(typeof registered.tool.execute, 'function')

  const first = await post(registered, { data: { categories: [], prompts: [] } })
  assert.equal(first.status, 200)
  assert.equal(first.body.rev, 1)

  const second = await post(registered, { data: first.body.data, expectedRev: 1 })
  assert.equal(second.status, 200)
  assert.equal(second.body.rev, 2)
})

test('a stale expectedRev is rejected with 409 and the current document', async () => {
  const { registered } = await makeCtx()
  const first = await post(registered, { data: { categories: [], prompts: [] } })
  await post(registered, { data: first.body.data, expectedRev: 1 })

  const stale = await post(registered, { data: first.body.data, expectedRev: 1 })
  assert.equal(stale.status, 409)
  assert.equal(stale.body.code, 'conflict')
  assert.equal(stale.body.rev, 2)
  assert.ok(stale.body.data)
})

test('every write keeps a backup, pruned to the newest ten', async () => {
  const { registered, backupDir } = await makeCtx()
  let current = { categories: [], prompts: [] }
  for (let index = 0; index < 14; index += 1) {
    const result = await post(registered, { data: current, expectedRev: index === 0 ? undefined : current.rev })
    assert.equal(result.status, 200)
    current = result.body.data
  }
  const backups = (await fs.readdir(backupDir)).filter((name) => /^data\..*\.json$/.test(name))
  assert.equal(backups.length, 10)
})

test('a corrupt file is repaired from the newest backup', async () => {
  const { registered, file, backupDir } = await makeCtx()

  const first = await post(registered, { data: { categories: [{ id: 'c1', name: '通用' }], prompts: [] } })
  assert.equal(first.status, 200)
  const second = await post(registered, { data: { ...first.body.data, categories: [] }, expectedRev: 1 })
  assert.equal(second.status, 200)
  assert.equal((await fs.readdir(backupDir)).length, 1)

  await fs.writeFile(file, '{ this is not json', 'utf8')
  const repaired = await get(registered)
  assert.equal(repaired.status, 200)
  assert.deepEqual(repaired.body.data.categories.map((category) => category.name), ['通用'])
})

test('the route still rejects untrusted origins and unknown methods', async () => {
  const { registered } = await makeCtx()
  const forbidden = response()
  await registered.route(request('GET', undefined, 'http://evil.example.com'), forbidden)
  assert.equal(forbidden.statusCode, 403)

  const method = response()
  await registered.route(request('DELETE'), method)
  assert.equal(method.statusCode, 405)
})

// ------------------------------------------------------------ agent tool ----

test('the tool creates, searches, pins, reorders and deletes', async () => {
  const { registered } = await makeCtx()
  const tool = registered.tool

  const category = await run(tool, { action: 'create_category', name: '写作' })
  assert.equal(category.ok, true)
  assert.ok(category.category.id.startsWith('c_'))

  const second = await run(tool, { action: 'create_category', name: '编程' })
  assert.ok(second.category.id.startsWith('c_'))

  const created = await run(tool, {
    action: 'create', title: '审稿提示词', content: '请审查这段代码。',
    category: '写作', tags: ['review', '代码'],
  })
  assert.equal(created.ok, true)
  assert.equal(created.prompt.category, '写作')
  assert.deepEqual(created.prompt.tags, ['review', '代码'])

  const pinned = await run(tool, { action: 'update', id: created.prompt.id, pinned: true })
  assert.equal(pinned.prompt.pinned, true)

  const found = await run(tool, { action: 'search', query: '审查' })
  assert.equal(found.total, 1)
  assert.equal(found.prompts[0].id, created.prompt.id)
  assert.ok(rendered(tool, { action: 'search' }, found).includes('📌'))

  const byTag = await run(tool, { action: 'search', tag: 'review' })
  assert.equal(byTag.total, 1)
  const noTag = await run(tool, { action: 'search', tag: 'missing' })
  assert.equal(noTag.total, 0)

  const got = await run(tool, { action: 'get', id: created.prompt.id })
  assert.equal(got.prompt.content, '请审查这段代码。')
  assert.ok(rendered(tool, { action: 'get' }, got).includes('# 审稿提示词'))

  const reordered = await run(tool, { action: 'reorder_category', id: second.category.id, direction: 'up' })
  assert.equal(reordered.category.order, 0)

  const listed = await run(tool, { action: 'list' })
  assert.equal(listed.total, 1)
  assert.deepEqual(listed.categories.map((entry) => entry.name), ['编程', '写作'])

  const renamed = await run(tool, { action: 'rename_category', id: category.category.id, name: '写作改写' })
  assert.equal(renamed.category.name, '写作改写')

  const removed = await run(tool, { action: 'delete', id: created.prompt.id })
  assert.equal(removed.title, '审稿提示词')
  const afterDelete = await run(tool, { action: 'list' })
  assert.equal(afterDelete.total, 0)

  const removedCategory = await run(tool, { action: 'delete_category', id: category.category.id })
  assert.equal(removedCategory.name, '写作改写')
})

test('the tool reports truncation instead of silently capping', async () => {
  const { registered } = await makeCtx()
  const tool = registered.tool
  for (let index = 0; index < 5; index += 1) {
    await run(tool, { action: 'create', title: `提示词 ${index}`, content: `内容 ${index}` })
  }
  const page = await run(tool, { action: 'list', limit: 2 })
  assert.equal(page.prompts.length, 2)
  assert.equal(page.total, 5)
  assert.equal(page.truncated, true)
  assert.ok(rendered(tool, { action: 'list' }, page).includes('3 more'))

  const next = await run(tool, { action: 'list', limit: 2, offset: 2 })
  assert.equal(next.prompts.length, 2)
  assert.equal(next.truncated, true)

  const last = await run(tool, { action: 'list', limit: 2, offset: 4 })
  assert.equal(last.prompts.length, 1)
  assert.equal(last.truncated, false)
})

test('the tool refuses unknown categories and unknown ids with a reason', async () => {
  const { registered } = await makeCtx()
  const tool = registered.tool

  await assert.rejects(
    () => run(tool, { action: 'create', title: 't', content: 'c', category: '不存在' }),
    /no category named/,
  )
  await assert.rejects(() => run(tool, { action: 'update', id: 'p_missing', title: 'x' }), /no prompt with id/)
  await assert.rejects(() => run(tool, { action: 'delete', id: 'p_missing' }), /no prompt with id/)
  await assert.rejects(() => run(tool, { action: 'reorder_category', id: 'c_missing', direction: 'up' }), /no category with id/)

  const unknown = await run(tool, { action: 'nope' })
  assert.equal(unknown.ok, false)
  assert.ok(unknown.message.includes('unknown action'))
})

test('the tool writes through the same file the route reads', async () => {
  const { registered } = await makeCtx()
  await run(registered.tool, { action: 'create_category', name: '工具写入' })
  await run(registered.tool, { action: 'create', title: '来自工具', content: '内容', category: '工具写入' })

  const seen = await get(registered)
  assert.equal(seen.body.data.categories[0].name, '工具写入')
  assert.equal(seen.body.data.prompts[0].title, '来自工具')
  assert.equal(seen.body.rev, 2)
})

test('two concurrent tool writes do not lose an update', async () => {
  const { registered } = await makeCtx()
  const tool = registered.tool
  await run(tool, { action: 'create_category', name: '基础' })

  await Promise.all([
    run(tool, { action: 'create', title: '甲', content: 'A', category: '基础' }),
    run(tool, { action: 'create', title: '乙', content: 'B', category: '基础' }),
    run(tool, { action: 'create', title: '丙', content: 'C', category: '基础' }),
  ])

  const listed = await run(tool, { action: 'list' })
  assert.equal(listed.total, 3)
})

test('the tool schema declares every action and requires action', async () => {
  const { registered } = await makeCtx()
  assert.deepEqual(registered.tool.parameters.required, ['action'])
  assert.deepEqual(registered.tool.parameters.properties.action.enum, [
    'search', 'list', 'get',
    'create', 'update', 'delete',
    'create_category', 'rename_category', 'delete_category', 'reorder_category',
  ])
  assert.equal(typeof registered.tool.output.render, 'function')
})
