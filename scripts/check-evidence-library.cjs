const fs=require('fs'),ts=require('typescript'),assert=require('node:assert/strict')
function load(path,mocks){const m={exports:{}};new Function('require','module','exports',ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>mocks[n]||require(n),m,m.exports);return m.exports}
let calls=[]
const {handleIntelligence}=load('cloudflare/intelligence-api.ts',{'./backfill':{},'./intelligence':{dbRequest:async(_env,path,body)=>{calls.push({path,body});return {items:[],total:0}}}})
global.fetch=async()=>Response.json({app_metadata:{instagram_user_id:'123'}})
const env={NEXT_PUBLIC_SUPABASE_URL:'https://fixture.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test'}
const request=query=>new Request('https://app.test/api/intelligence'+query,{headers:{Authorization:'Bearer valid',Origin:'https://app.test'}})
;(async()=>{
 let r=await handleIntelligence(request('?action=library&scope=testimonial&search='+encodeURIComponent('첫 판매')+'&offset=25&user_id=999'),env)
 assert.equal(r.status,200);assert.equal(calls[0].path,'rpc/ci_evidence_library');assert.deepEqual(calls[0].body,{p_owner:'123',p_days:0,p_product:null,p_scope:'testimonial',p_search:'첫 판매',p_offset:25,p_topic:null})
 for(const q of ['offset=-1','offset=1.5','offset=100001','topic=unknown','search='+'a'.repeat(201),'days=2','scope=unknown']) assert.equal((await handleIntelligence(request('?action=library&'+q),env)).status,400,q)
 for(const scope of ['marketing','testimonial','progress','objection','support','all']) assert.equal((await handleIntelligence(request('?action=library&scope='+scope),env)).status,200)
 console.log('PASS library: owner cannot be overridden; all-time search, pagination, scopes and bounded filters')
})().catch(e=>{console.error(e);process.exitCode=1})
