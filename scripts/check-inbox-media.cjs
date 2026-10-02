const fs = require('fs');
const path = process.cwd();
const ts = require(path + '/node_modules/typescript');
const crypto = require('crypto');
const assert = require('assert/strict');
process.env.INSTAGRAM_APP_SECRET = 'test-secret';
let saved = []; let sent = 0; let reopened = false;
const user = {id:'owner',business_account_id:'business',page_id:'business',access_token:'fake',username:'owner'};
function query(table) {
 let op = 'select', row;
 const q = {select(){return q},eq(){return q},or(){return q},update(value){op='update';if(table==='conversations' && value.is_closed===false) reopened=true;return q},insert(r){op='insert';row=r;return q},single(){return Promise.resolve(result())},then(a,b){return Promise.resolve(result()).then(a,b)}};
 function result(){
  if(table==='users') return {data:user};
  if(table==='automations') return {data:[]};
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
 '@/lib/instagram-api':new Proxy({}, {get:()=>async()=>{sent++;return {ok:true}}}),
 '@/lib/ai-reply':{}, '@/lib/unlock-tracking':{}
};
const source=fs.readFileSync(path+'/app/api/instagram/webhook/route.ts','utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
new Function('require','module','exports',compiled)(n=>mocks[n]||require(n),mod,mod.exports);
async function post(message,signatureValid=true,outgoing=false){
 const raw=JSON.stringify({entry:[{id:'business',messaging:[{sender:{id:outgoing?'business':'sender'},recipient:{id:outgoing?'sender':'business'},message}]}]});
 const sig='sha256='+crypto.createHmac('sha256',signatureValid?'test-secret':'wrong').update(raw).digest('hex');
 return mod.exports.POST({text:async()=>raw,headers:{get:()=>sig}});
}
(async()=>{
 assert.equal((await post({mid:'m1',text:'Hello TEST'})).status,200);
 assert.equal(saved.length,1);assert.equal(saved[0].content,'Hello TEST');assert.equal(sent,0);
 saved=[];
 assert.equal((await post({mid:'photo',attachments:[{type:'image',payload:{url:'https://example.test/photo.jpg'}}]})).status,200);
 assert.equal(saved.length,1);assert.equal(saved[0].content,'[사진]');
 assert.deepEqual(saved[0].attachments,[{type:'image',url:'https://example.test/photo.jpg'}]);assert.equal(sent,0);
 saved=[];
 assert.equal((await post({mid:'caption',text:'Caption',attachments:[{type:'image',payload:{url:'https://example.test/photo.jpg'}},{type:'video',payload:{url:'javascript:bad'}}]})).status,200);
 assert.equal(saved[0].content,'Caption');assert.equal(saved[0].attachments.length,2);assert.equal(saved[0].attachments[1].url,null);
 saved=[];
 await post({mid:'story',text:'Story answer',reply_to:{story:{id:'123',url:'https://example.test/story.jpg'}}});
 assert.equal(saved[0].content,'Story answer');
 assert.deepEqual(saved[0].attachments,[{type:'story_reply',id:'123',url:'https://example.test/story.jpg'}]);
 
 saved=[];assert.equal((await post({mid:'m2',text:'blocked'},false)).status,401);assert.equal(saved.length,0);
 await post({mid:'forged',text:'echo',is_echo:true});assert.equal(saved.length,0);
 await post({mid:'echo',text:'My Instagram reply',is_echo:true},true,true);assert.equal(saved.length,1);assert.equal(saved[0].is_from_instagram,false);assert.equal(saved[0].sender_id,'business');assert.equal(sent,0);
 console.log('PASS: text, media and story context saved; signatures and echoes remain protected.');
})().catch(e=>{console.error(e);process.exitCode=1});
