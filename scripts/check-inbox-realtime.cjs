const fs = require('node:fs')
const assert = require('node:assert/strict')
const ts = require('typescript')

function load(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const mod = { exports: {} }
  new Function('require', 'module', 'exports', source)(name => mocks[name] || require(name), mod, mod.exports)
  return mod.exports
}

async function checkAuthorization() {
  let user = null
  let resourceOwned = false
  let ownershipChecks = 0
  const response = () => ({ headers: new Headers(), cookies: { set() {} }, status: 200 })
  const { proxy } = load('proxy.ts', {
    '@supabase/ssr': { createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    'next/server': { NextResponse: { next: response, json: (_body, opts) => ({ status: opts.status }) } },
    '@/lib/supabase-admin': { getSupabaseAdmin: () => ({ from: () => {
      ownershipChecks++
      const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: resourceOwned ? { id: 'owned' } : null }) }
      return query
    } }) },
  })
  const request = (path, method = 'GET', body = {}) => ({
    nextUrl: new URL('https://example.test' + path), method, headers: new Headers(),
    cookies: { getAll: () => [], set() {} }, clone: () => ({ json: async () => body }),
  })
  assert.equal((await proxy(request('/api/inbox/conversations?userId=28163924569973068'))).status, 401)
  user = { app_metadata: { instagram_user_id: '28163924569973068' } }
  assert.equal((await proxy(request('/api/inbox/conversations?userId=28163924569973068'))).status, 200)
  assert.equal((await proxy(request('/api/inbox/conversations?userId=28163924569973069'))).status, 403)
  assert.equal((await proxy(request('/api/inbox/send', 'POST', { userId: 'other' }))).status, 403)
  assert.equal((await proxy(request('/api/instagram/send-message', 'POST', { user_id: 'other' }))).status, 403)
  assert.equal((await proxy(request('/api/inbox/send?userId=28163924569973068', 'POST', { userId: 'other' }))).status, 403)
  assert.equal((await proxy(request('/api/inbox/messages?conversationId=other'))).status, 404)
  assert.equal((await proxy(request('/api/automations', 'PATCH', { id: 'other' }))).status, 404)
  resourceOwned = true
  assert.equal((await proxy(request('/api/automations?id=owned', 'DELETE'))).status, 200)
  assert.equal(ownershipChecks, 3)
  user = { app_metadata: {}, user_metadata: { instagram_user_id: '28163924569973068' } }
  assert.equal((await proxy(request('/api/inbox/conversations?userId=28163924569973068'))).status, 401)
  assert.equal((await proxy(request('/api/instagram/webhook', 'POST'))).status, 200)
}

async function checkOAuthBridge() {
  const crypto = require('node:crypto')
  const oldFetch = global.fetch
  const envKeys = ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET', 'NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI']
  const oldEnv = envKeys.map(key => process.env[key])
  envKeys.forEach(key => { process.env[key] = 'test-only' })
  let identityAssigned = false, verified = false, stored = false
  const owner = '28163924569973068'
  const code = 'test-code'
  const { POST } = load('app/api/instagram/callback/route.ts', {
    'next/server': { NextResponse: { json: (data, opts) => ({ data, status: opts?.status || 200, cookies: { set() {}, delete() {} } }) } },
    '@/lib/instagram-auth': { getAuthClient: async () => ({ auth: { verifyOtp: async params => {
      assert.equal(identityAssigned, true, 'trusted metadata must exist before JWT issuance')
      assert.deepEqual(params, { token_hash: 'test-hash', type: 'email' })
      verified = true
      return { error: null }
    } } }) },
    '@/lib/supabase-server': { getSupabaseServerClient: async () => ({
      from: () => ({ upsert: async value => { assert.equal(value.id, owner); stored = true; return {} } }),
      auth: { admin: {
        generateLink: async params => {
          assert.equal(stored, true)
          assert.equal(params.email, `instagram-${owner}@accounts.ladynomad.invalid`)
          return { data: { user: { id: 'auth-user' }, properties: { hashed_token: 'test-hash' } } }
        },
        updateUserById: async (_id, value) => { assert.equal(value.app_metadata.instagram_user_id, owner); identityAssigned = true; return {} },
      } },
    }) },
  })
  const req = valid => ({ json: async () => ({ code }), cookies: { get: () => ({ value: valid ? crypto.createHash('sha256').update(code).digest('hex') : 'forged' }) } })
  try {
    assert.equal((await POST(req(false))).status, 400)
    let calls = 0
    global.fetch = async url => {
      calls++
      return { ok: true, json: async () => calls === 1 ? { access_token: 'fake-short', user_id: owner } : calls === 2 ? { access_token: 'fake-long', expires_in: 3600 } : calls === 3 ? { username: 'test-owner', user_id: '17841444646044111' } : { success: true } }
    }
    const result = await POST(req(true))
    assert.equal(result.status, 200)
    assert.equal(result.data.userId, owner)
    assert.equal(verified, true)
    assert.equal(calls, 4, 'account message subscription is refreshed')
  } finally {
    global.fetch = oldFetch
    envKeys.forEach((key, i) => { if (oldEnv[i] === undefined) delete process.env[key]; else process.env[key] = oldEnv[i] })
  }
}

async function checkRealtime() {
  const effects = [], cleanups = [], state = []
  let event, status, removed = 0, sounds = 0, queued = []
  const originalTimeout = global.setTimeout
  const originalClear = global.clearTimeout
  const originalDocument = global.document
  const originalStorage = global.localStorage
  const preferences = new Map()
  global.localStorage = { getItem: key => preferences.get(key) || null, setItem: (key, value) => preferences.set(key, value) }
  const originalAudio = global.AudioContext
  global.setTimeout = fn => { queued.push(fn); return queued.length }
  global.clearTimeout = () => {}
  global.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} }
  global.AudioContext = class {
    state = 'running'; currentTime = 0; destination = {}
    async resume() {}
    async close() {}
    createOscillator() { return { connect() {}, disconnect() {}, frequency: { setValueAtTime() {} }, start() { sounds++ }, stop() {} } }
    createGain() { return { connect() {}, disconnect() {}, gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} } } }
  }
  try {
    const channel = {
      on(_type, filter, handler) { assert.equal(filter.filter, 'user_id=eq.28163924569973068'); event = handler; return channel },
      subscribe(handler) { status = handler; return channel },
    }
    const { useInboxRealtime } = load('hooks/use-inbox-realtime.ts', {
      react: {
        useRef: current => ({ current }), useCallback: fn => fn,
        useEffect: fn => effects.push(fn),
        useState: initial => { const i = state.length; state.push(initial); return [initial, value => { state[i] = typeof value === 'function' ? value(state[i]) : value }] },
      },
      '@/lib/supabase-browser': { getSupabaseBrowserClient: () => ({ channel: () => channel, removeChannel: async () => { removed++ } }) },
    })
    const hook = useInboxRealtime('28163924569973068', 'selected')
    effects.forEach(fn => cleanups.push(fn()))
    assert.equal(queued.length, 0, 'idle inbox must not poll')
    await hook.toggleSound()
    assert.equal(sounds, 1, 'sound enabling plays a confirmation')
    assert.equal(preferences.get('inbox-sound-28163924569973068'), 'on', 'sound preference survives reload')
    status('SUBSCRIBED'); queued.splice(0).forEach(fn => fn())
    assert.equal(state[0], 1); assert.equal(state[1], 1)
    event({ new: { id: 'incoming', conversation_id: 'selected', is_from_instagram: true } })
    event({ new: { id: 'incoming', conversation_id: 'selected', is_from_instagram: true } })
    assert.equal(sounds, 2, 'duplicate event must not ring twice')
    queued.splice(0).forEach(fn => fn())
    assert.equal(state[0], 2); assert.equal(state[1], 2)
    event({ new: { id: 'outgoing', conversation_id: 'other', is_from_instagram: false } })
    queued.splice(0).forEach(fn => fn())
    assert.equal(sounds, 2, 'outgoing messages must not ring')
    assert.equal(state[0], 3); assert.equal(state[1], 2, 'other chats do not refresh selected messages')
    status('CHANNEL_ERROR'); assert.equal(state[2], false)
    status('SUBSCRIBED'); queued.splice(0).forEach(fn => fn())
    assert.equal(state[1], 3, 'reconnect catches up')
    cleanups.forEach(fn => fn?.())
    assert.equal(removed, 1)
    assert.equal(queued.length, 0)
    effects.length = 0; state.length = 0; cleanups.length = 0
    const restored = useInboxRealtime('28163924569973068', 'selected')
    effects.forEach(fn => cleanups.push(fn()))
    await Promise.resolve()
    assert.equal(state[3], true, 'remount restores enabled preference')
    event({ new: { id: 'after-reload', conversation_id: 'selected', is_from_instagram: true } })
    assert.equal(sounds, 3, 'restored sound rings when browser permits audio')
    cleanups.forEach(fn => fn?.())
  } finally {
    global.setTimeout = originalTimeout; global.clearTimeout = originalClear
    global.document = originalDocument; global.AudioContext = originalAudio; global.localStorage = originalStorage
  }
}

async function checkConversationStatus() {
  let identity = null, owned = true, requestedOwner, requestedId
  let deleted = false
  const query = {
    delete() { deleted = true; return query },
    eq(key, value) { if (key === 'user_id') requestedOwner = value; if (key === 'id') requestedId = value; return query },
    select() { return query },
    maybeSingle: async () => ({ data: owned ? { id: 'own-conversation' } : null }),
  }
  const { DELETE } = load('app/api/inbox/conversations/route.ts', {
    '@/lib/instagram-api': { fetchProfile: async () => null },
    'next/server': { NextResponse: { json: (data, options) => ({ data, status: options?.status || 200 }) } },
    '@/lib/instagram-auth': { getInstagramIdentity: async () => identity },
    '@/lib/supabase-server': { getSupabaseServerClient: async () => ({ from: () => query }) },
  })
  const request = id => ({ nextUrl: new URL('https://example.test/api/inbox/conversations' + (id ? '?conversationId=' + id : '')) })
  assert.equal((await DELETE(request('own-conversation'))).status, 401)
  assert.equal(deleted, false)
  identity = { userId: '28163924569973068' }
  assert.equal((await DELETE(request('own-conversation'))).status, 200)
  assert.equal(deleted, true)
  assert.equal(requestedOwner, identity.userId)
  assert.equal(requestedId, 'own-conversation')
  owned = false
  assert.equal((await DELETE(request('other'))).status, 404)
  assert.equal((await DELETE(request(null))).status, 400)
}

Promise.resolve().then(checkAuthorization).then(checkOAuthBridge).then(checkRealtime).then(checkConversationStatus).then(() => {
  console.log('PASS: verified ownership, no idle polling, event refresh, incoming sound, deduplication, reconnect and cleanup')
}).catch(error => { console.error(error); process.exitCode = 1 })
