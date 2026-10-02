const fs = require('fs');
const path = process.cwd();
const ts = require(path + '/node_modules/typescript');
const crypto = require('crypto');
const assert = require('assert/strict');
process.env.INSTAGRAM_APP_SECRET = 'test-secret';
let saved = []; let sent = 0; let reopened = false; let rules = []; let replies = []; let dms = [];
const user = {id:'owner',business_account_id:'business',page_id:'business',access_token:'fake',username:'owner'};
function query(table) {
 let op = 'select', row;
 const q = {select(){return q},eq(){return q},or(){return q},update(value){op='update';if(table==='conversations' && value.is_closed===false) reopened=true;return q},insert(r){op='insert';row=r;return q},single(){return Promise.resolve(result())},then(a,b){return Promise.resolve(result()).then(a,b)}};
 function result(){
  if(table==='users') return {data:user};
  if(table==='automations') return {data:rules};
  if(table==='conversations') return {data:{id:'conv'}};
  if(table==='messages'&&op==='insert'){saved.push(row);return {error:null}};
  return {data:null};
 }
 return q;
}
const mocks = {
 'next/server':{NextResponse:{json:(data,opts)=>({data,status:opts?.status||200})}},
 '@/lib/supabase-server':{getSupabaseServerClient:async()=>({from:query})},
 '@/lib/supabase-migrate':{ensureSchema:async()=>{}},
 '@/lib/instagram-api':new Proxy({}, {get:(_target,name)=>async(...args)=>{if(name==='replyToComment') replies.push(args); if(name==='sendTextDM') dms.push(args);return {ok:true}}}),
 '@/lib/ai-reply':{}, '@/lib/unlock-tracking':{}
};
const source=fs.readFileSync(path+'/app/api/instagram/webhook/route.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',compiled)(n=>mocks[n]||require(n),mod,mod.exports);
async function post(message,signatureValid=true){
 const raw=JSON.stringify({entry:[{id:'business',messaging:[{sender:{id:'sender'},recipient:{id:'business'},message}]}]});
 const sig='sha256='+crypto.createHmac('sha256',signatureValid?'test-secret':'wrong').update(raw).digest('hex');
 return mod.exports.POST({text:async()=>raw,headers:{get:()=>sig}});
}

async function comment(text, media='carousel', parent=null){
 const raw=JSON.stringify({entry:[{id:'business',changes:[{field:'comments',value:{id:'comment',text,from:{id:'sender'},media:{id:media},parent_id:parent}}]}]});
 const sig='sha256='+crypto.createHmac('sha256','test-secret').update(raw).digest('hex');
 return mod.exports.POST({text:async()=>raw,headers:{get:()=>sig}});
}
(async()=>{
 const rule=(type,content,specific=null)=>({name:type,trigger_source:'comment',trigger_type:type,trigger_value:type==='keyword'?'자료':'ALL_COMMENTS',specific_media_id:specific,response_content:content});
 rules=[rule('reply_all',{reply_mode:'both',message:'DM',public_replies:['A','B','C']})];
 const random=Math.random;
 try {
  Math.random=()=>0;await comment('anything','reel');
  Math.random=()=>0.99;await comment('😊','carousel');
 } finally {Math.random=random}
 assert.deepEqual(replies.map(a=>a[2]),['A','C']);assert.equal(dms.length,2);
 assert.deepEqual(dms[0][1],{comment_id:'comment'});
 replies=[];dms=[];
 rules=[rule('reply_all',{reply_mode:'public_only',public_replies:['public']})];
 await comment('random');assert.equal(replies.length,1);assert.equal(dms.length,0);
 replies=[];dms=[];
 rules=[rule('reply_all',{reply_mode:'both',message:'fallback',public_replies:['all']}),rule('keyword',{reply_mode:'dm_only',message:'keyword'})];
 await comment('자료');assert.equal(replies.length,0);assert.equal(dms[0][2],'keyword');
 replies=[];dms=[];await comment('random','carousel','parent');assert.equal(replies.length,0);assert.equal(dms.length,0);
 console.log('PASS: reel/carousel comment handling, reply variants, all comments, modes, keyword precedence and nested reply protection');
})().catch(e=>{console.error(e);process.exitCode=1});
