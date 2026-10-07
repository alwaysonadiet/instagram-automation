const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(path, mocks = {}) {
 const module = { exports: {} }
 const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
 new Function('require', 'module', 'exports', source)(name => mocks[name] || require(name), module, module.exports)
 return module.exports
}
const { normaliseExport, decodeMetaText } = load('lib/history/normalise.ts')
const { readHistoryFile } = load('lib/history/archive.ts')
const { zipSync, strToU8 } = require('fflate')
async function run() {
 const input = { participants: [{ name: 'Me' }, { name: 'Customer' }], thread_path: 'inbox/customer_123', messages: [
  { sender_name: 'Customer', timestamp_ms: 1700000000000, content: '안녕하세요', photos: [{ uri: 'messages/photo.jpg' }] },
  { sender_name: 'Me', timestamp_ms: 1700000001000, content: 'Hi' },
  { sender_name: 'Customer', timestamp_ms: 1700000000000, content: '안녕하세요', photos: [{ uri: 'messages/photo.jpg' }] },
 ] }
 const path = 'your_instagram_activity/messages/inbox/customer_123/message_1.json'
 const a = await normaliseExport(input, path, ['Me'])
 const b = await normaliseExport(input, path, ['Me'])
 assert.deepEqual(a, b)
 assert.equal(new Set(a.map(m => m.key)).size, 3, 'identical real messages must be preserved')
 assert.equal(a[0].direction, 'incoming'); assert.equal(a[2].direction, 'outgoing')
 assert.equal(a[0].text, '안녕하세요'); assert.deepEqual(a[0].original, input.messages[0])
 assert.equal(a[0].attachments[0].reference.uri, 'messages/photo.jpg')
 assert.equal(decodeMetaText(Buffer.from('안녕하세요').toString('latin1')), '안녕하세요')
 assert.equal(decodeMetaText('café'), 'café'); assert.equal(decodeMetaText('안녕하세요'), '안녕하세요')
 const unknown = await normaliseExport(input, path, ['Different name'])
 assert.ok(unknown.every(m => m.direction === 'unknown'))
 const batches = []
 for (const m of a) batches.push(...await normaliseExport({ ...input, messages: [m.original] }, path, ['Me'], [m.occurrence]))
 assert.deepEqual(batches.map(m => m.key).sort(), a.map(m => m.key).sort(), 'batch boundary must not change identity')
 assert.deepEqual((await normaliseExport(input, 'other/message_1.json', ['Me'])).map(m => m.key), a.map(m => m.key), 'thread_path survives a renamed ZIP')
 await assert.rejects(() => normaliseExport({ ...input, messages: [{ sender_name: 'Me', timestamp_ms: 9e15 }] }, path, []))
 const archive = zipSync({ [path]: strToU8(JSON.stringify(input)), 'photo.jpg': new Uint8Array(200), 'profile.json': strToU8('{}') })
 const parsed = await readHistoryFile(new File([archive], 'instagram.zip'))
 assert.equal(parsed.length, 1); assert.deepEqual(parsed[0].data, input)
 await assert.rejects(() => readHistoryFile(new File([zipSync({ 'profile.json': strToU8('{}') })], 'empty.zip')))
 console.log('History: raw preservation, encoding, attachment references, repeat import, repeated real events, batching, direction, ZIP selection and malformed input passed')
}
run().catch(e => { console.error(e); process.exit(1) })
