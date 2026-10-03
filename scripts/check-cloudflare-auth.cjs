const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const { NextRequest } = require('next/server')
let user = null, found = true, authCalls = 0
const auth = { createServerClient: () => ({ auth: { getUser: async () => { authCalls++; return { data: { user }, error: null } } } }) }
const admin = { getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: found ? {id:'resource'} : null, error:null }) }) }) }) }) }) }
const js = ts.transpileModule(fs.readFileSync('middleware.ts','utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
const mod = { exports: {} }
new Function('require','module','exports',js)(name => name === '@supabase/ssr' ? auth : name === '@/lib/supabase-admin' ? admin : require(name), mod, mod.exports)
const check = async (path, status, options = {}) => assert.equal((await mod.exports.middleware(new NextRequest('https://test.example'+path,options))).status,status,path)
;(async()=>{
 await check('/api/inbox/messages',401)
 user = { app_metadata: { instagram_user_id:'123' } }
 await check('/api/inbox/messages?userId=999',403)
 await check('/api/inbox/messages?userId=123',200)
 await check('/api/inbox/send',403,{method:'POST',headers:{origin:'https://evil.example'},body:'{}'})
 await check('/api/inbox/send',400,{method:'POST',body:'invalid'})
 await check('/api/inbox/send',403,{method:'POST',body:JSON.stringify({user_id:'999'})})
 found = false
 await check('/api/inbox/messages?conversationId=other',404)
 await check('/api/automations?id=other',404,{method:'DELETE'})
 const before = authCalls
 for(const path of ['/api/instagram/webhook','/api/instagram/login','/api/instagram/callback','/api/session']) await check(path,200)
 assert.equal(authCalls,before)
 user={ user_metadata:{instagram_user_id:'123'},app_metadata:{} }
 await check('/api/inbox/messages',401)
 console.log('Cloudflare middleware: 13 authentication/ownership/input checks passed')
})().catch(e=>{console.error(e);process.exit(1)})
