const fs = require('node:fs')
const ts = require('typescript')
const assert = require('node:assert/strict')
const source = ts.transpileModule(fs.readFileSync('app/api/inbox/send/route.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText
async function run(echoFirst) {
  const rows = new Map()
  let identity = { userId: 'owner' }
  const db = { from(table) {
    let id
    const q = {
      select() { return q }, eq(key, value) { if (key === 'id') id = value; return q },
      async single() { return { data: table === 'users' ? { access_token: 'test', username: 'me', business_account_id: 'owner' } : table === 'conversations' ? { id: 'conv' } : rows.get(id) } },
      async upsert(row, opts) { assert.equal(opts.ignoreDuplicates, true); assert.equal(row.id, 'ig-mid'); if (!rows.has(row.id)) rows.set(row.id, row); return { error: null } },
      update() { return q }, then(resolve) { resolve({ error: null }) }
    }
    return q
  } }
  const mod = { exports: {} }
  const mocks = {
    'next/server': { NextResponse: { json: (data, opts) => ({ data, status: opts?.status || 200 }) } },
    '@/lib/instagram-auth': { getInstagramIdentity: async () => identity },
    '@/lib/supabase-server': { getSupabaseServerClient: async () => db }
  }
  new Function('require','module','exports',source)(name => mocks[name], mod, mod.exports)
  const oldFetch = global.fetch
  global.fetch = async () => {
    if (echoFirst) rows.set('ig-mid', { id: 'ig-mid', content: 'hello', user_id: 'owner' })
    return { ok: true, json: async () => ({ message_id: 'ig-mid' }) }
  }
  try {
    const req = userId => ({ json: async () => ({ userId, recipientId: 'recipient', message: 'hello' }) })
    assert.equal((await mod.exports.POST(req('other'))).status, 403)
    const result = await mod.exports.POST(req('owner'))
    assert.equal(result.status, 200)
    assert.equal(result.data.savedMessage.id, 'ig-mid')
    // Simulate the webhook's INSERT with the same primary key.
    if (!rows.has('ig-mid')) rows.set('ig-mid', { id: 'ig-mid' })
    assert.equal(rows.size, 1)
    identity = null
    assert.equal((await mod.exports.POST(req('owner'))).status, 401)
  } finally { global.fetch = oldFetch }
}
Promise.all([run(false)]).then(() => run(true)).then(() => console.log('Send/echo ordering and ownership checks passed')).catch(e => { console.error(e); process.exit(1) })
