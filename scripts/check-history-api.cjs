const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function load(path, mocks) {
 const m = { exports: {} }
 new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n => mocks[n] || require(n),m,m.exports)
 return m.exports
}
const normalise = load('lib/history/normalise.ts', {})
let identity = { userId: '123' }
const rows = new Map()
const db = { from(table) {
 assert.equal(table, 'instagram_history_events')
 return { upsert(events, options) {
  assert.equal(options.onConflict, 'user_id,source_key'); assert.equal(options.ignoreDuplicates,true)
  return { async select() {
   const inserted = []
   for (const event of events) { assert.equal(event.user_id,'123'); if (!rows.has(event.source_key)) { rows.set(event.source_key,event); inserted.push({source_key:event.source_key}) } }
   return {data:inserted,error:null}
  } }
 } }
} }
const route = load('app/api/history/import/route.ts', {
 'next/server':{ NextResponse:{json:(data,opts)=>({data,status:opts?.status || 200})} },
 '@/lib/instagram-auth':{getInstagramIdentity:async()=>identity},
 '@/lib/supabase-server':{getSupabaseServerClient:async()=>db},
 '@/lib/history/normalise':normalise,
})
const data = {participants:[{name:'Me'},{name:'Customer'}],thread_path:'inbox/customer_1',messages:[{sender_name:'Customer',timestamp_ms:1700000000000,content:'Original'}]}
const payload = { data, sourcePath:'messages/inbox/customer_1/message_1.json',ownerNames:['Me'],occurrences:[0] }
const request = body => ({text:async()=>typeof body==='string'?body:JSON.stringify(body)})
async function run() {
 assert.equal((await route.POST(request(payload))).data.inserted,1)
 assert.equal((await route.POST(request(payload))).data.duplicates,1)
 assert.equal(rows.size,1);assert.equal([...rows.values()][0].original_text,'Original')
 assert.equal((await route.POST(request({...payload,occurrences:[]}))).status,400)
 assert.equal((await route.POST(request('bad JSON'))).status,400)
 assert.equal((await route.POST(request(' '.repeat(1024*1024+1)))).status,413)
 identity=null
 assert.equal((await route.POST(request(payload))).status,401)
 console.log('History API: verified session, owner scope, repeat import, raw preservation, payload limits and invalid input passed')
}
run().catch(e=>{console.error(e);process.exit(1)})
