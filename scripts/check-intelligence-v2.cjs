const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict')
function load(path,mocks={}){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>mocks[n]||require(n),m,m.exports);return m.exports}
let calls=[]
const {handleIntelligence}=load('cloudflare/intelligence-api.ts',{'./backfill':{},'./intelligence':{dbRequest:async(_env,path,body)=>{calls.push({path,body});return path==='rpc/ci_dashboard_v2'?{summary:{signals:2}}:[]}}})
global.fetch=async()=>Response.json({app_metadata:{instagram_user_id:'123'}})
const env={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test'}
const request=(query='',body)=>new Request('https://app.test/api/intelligence'+query,{method:body?'POST':'GET',headers:{Authorization:'Bearer valid',Origin:'https://app.test'},...(body?{body:JSON.stringify(body)}:{})})
;(async()=>{
 let r=await handleIntelligence(request('?days=30&scope=marketing'),env)
 assert.equal(r.status,200);assert.deepEqual(calls[0].body,{p_owner:'123',p_product:null,p_days:30,p_scope:'marketing'})
 assert.equal((await handleIntelligence(request('?scope=unsupported'),env)).status,400)
 assert.equal((await handleIntelligence(request('?action=content',{user_id:'999',format:'Reel',event_key:'noise-event'}),env)).status,404)
 assert.ok(calls.at(-1).path.includes('user_id=eq.123'));assert.ok(calls.at(-1).path.includes('quality_kind=in.'))
 assert.equal((await handleIntelligence(request('?action=customer&key=export:test&anchor=foreign-event'),env)).status,404)
 assert.equal((await handleIntelligence(new Request('https://app.test/api/intelligence'),env)).status,401)
 console.log('PASS v2 API: owner-scoped filters, invalid filters rejected, noise cannot become content, foreign evidence blocked')
})().catch(e=>{console.error(e);process.exitCode=1})
