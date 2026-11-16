/**
 * Client-half smoke tests for dsh-prompt-hub.
 *
 * client.js is a browser bundle entry: it registers itself through
 * `window.__ModuleLoader__` and pulls React from the host's `require`. These
 * tests stub just enough of that environment to assert the module contract
 * (registration id, injected services, apply) without a DOM or a bundler.
 */

import assert from 'node:assert/strict'
import { test } from 'node:test'

/** The registration entry client.js handed to the host's ModuleLoader. */
let entry = null
globalThis.window = {
  __ModuleLoader__: {
    load(registered) { entry = registered },
  },
}
await import('../client.js')
delete globalThis.window

/** Invoke the factory with a minimal React stub and return its exports. */
function loadClient() {
  assert.ok(entry, 'client.js must register itself with window.__ModuleLoader__')
  const react = { createElement: () => null, Fragment: 'Fragment' }
  return entry.factory((id) => {
    if (id === 'react') return react
    if (id === 'react-dom') return null
    throw new Error(`unexpected require: ${id}`)
  })
}

test('the client registers under the expected id', () => {
  assert.ok(entry)
  assert.equal(entry.id, 'dsh-prompt-hub')
})

test('the client declares every service it touches', () => {
  const exports = loadClient()
  assert.deepEqual(exports.inject, ['slots', 'locale', 'layout'])
})

test('the client exposes the host contract', () => {
  const exports = loadClient()
  assert.equal(exports.name, 'dsh-prompt-hub')
  assert.equal(typeof exports.apply, 'function')
})
