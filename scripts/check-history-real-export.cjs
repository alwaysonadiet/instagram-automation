// Read-only verification. Private archive paths/content are never committed or printed.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(path) {
  const mod = { exports: {} }
  const js = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  new Function('require', 'module', 'exports', js)(require, mod, mod.exports)
  return mod.exports
}
async function main() {
  const archivePath = process.argv[2]
  if (!archivePath) throw new Error('Pass a local Instagram export ZIP path')
  const { readHistoryFile } = load('lib/history/archive.ts')
  const { normaliseExport, decodeMetaText } = load('lib/history/normalise.ts')
  const file = new File([fs.readFileSync(archivePath)], 'instagram.zip')
  const entries = await readHistoryFile(file)
  // Discover the most frequent sender only for this verification; not an identity merge rule.
  const counts = new Map()
  for (const entry of entries) for (const m of entry.data.messages) {
    counts.set(m.sender_name, (counts.get(m.sender_name) || 0) + 1)
  }
  const owner = [...counts].sort((a, b) => b[1] - a[1])[0][0]
  const ownerNames = [decodeMetaText(owner).normalize('NFC')]
  const threads = new Set(), keys = new Set()
  let messages = 0, flatFiles = 0, outgoing = 0, incoming = 0, unknown = 0, text = 0
  let earliest = null, latest = null
  for (const entry of entries) {
    const first = await normaliseExport(entry.data, entry.path, ownerNames)
    const repeat = await normaliseExport(entry.data, entry.path, ownerNames)
    assert.deepEqual(first, repeat, 'Repeat import must retain source keys')
    if (!/\/message_\d+\.json$/i.test(entry.path)) flatFiles++
    for (const m of first) {
      assert.ok(!keys.has(m.key), 'Unexpected duplicate source key across export files')
      keys.add(m.key); threads.add(m.threadKey); messages++
      if (m.direction === 'outgoing') outgoing++
      else if (m.direction === 'incoming') incoming++
      else unknown++
      if (m.text) text++
      assert.equal(m.text, m.original.content ?? '', 'Raw text must remain unchanged')
      earliest = !earliest || m.timestamp < earliest ? m.timestamp : earliest
      latest = !latest || m.timestamp > latest ? m.timestamp : latest
    }
    // Verify identity survives the browser's sorted, resumable upload batches.
    const batchedKeys = []
    for (let i = 0; i < first.length; i += 100) {
      const batch = first.slice(i, i + 100)
      const roundtrip = await normaliseExport({ ...entry.data, messages: batch.map(m => m.original) }, entry.path, ownerNames, batch.map(m => m.occurrence))
      batchedKeys.push(...roundtrip.map(m => m.key))
    }
    assert.deepEqual(batchedKeys.sort(), first.map(m => m.key).sort())
  }
  console.log(JSON.stringify({ files: entries.length, conversations: threads.size, messages, text, flatFiles, outgoing, incoming, unknown, earliest, latest, repeatImportVerified: true, batchesVerified: true, rawTextVerified: true }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
