import { dbRequest, type IntelligenceEnv } from "./intelligence"
type State = { owner_id: string; status: string; conversation_after: string | null; conversations: { id: string; participants?: { data: { id: string; username?: string; name?: string }[] } }[]; active: State["conversations"][number] | null; message_after: string | null; conversations_done: number; messages_inserted: number }
export async function runBackfillStep(env: IntelligenceEnv, owner?: string) {
  const state = await dbRequest(env,"rpc/ci_claim_backfill",{p_owner:owner || null}) as State | null
  if (!state) return {status:"idle"}
  owner = state.owner_id
  if (!/^\d+$/.test(owner)) return { status:"error" }
  const account = await dbRequest(env, "rpc/ci_source_account", { p_owner: owner }) as { id: string; business_account_id: string; username: string; access_token: string }
  const graph = async (path: string, params: Record<string,string>) => {
    const url = new URL(`https://graph.instagram.com/v24.0/${path}`)
    for(const [key,value] of Object.entries(params)) url.searchParams.set(key,value)
    const response = await fetch(url,{headers:{Authorization:`Bearer ${account.access_token}`},signal:AbortSignal.timeout(20000)})
    if(!response.ok) throw Error(`Meta HTTP ${response.status}`)
    return response.json()
  }
  try {
    let pending = state.conversations || [], active=state.active, next=state.conversation_after
    if (!active && !pending.length) {
      if (state.status==="running" && !next) { await dbRequest(env,`ci_backfill?user_id=eq.${owner}`,{status:"complete",lease_until:null,updated_at:new Date().toISOString()},"PATCH"); await dbRequest(env,"rpc/ci_reconcile_history",{p_owner:owner});return {status:"complete"} }
      const page = await graph(`${account.business_account_id}/conversations`,{platform:"instagram",fields:"id,participants",limit:"10",...(next?{after:next}:{})})
      pending=page.data || [];next=page.paging?.next ? page.paging?.cursors?.after || null : null
      if(!pending.length) { await dbRequest(env,`ci_backfill?user_id=eq.${owner}`,{status:"complete",lease_until:null,updated_at:new Date().toISOString()},"PATCH");await dbRequest(env,"rpc/ci_reconcile_history",{p_owner:owner});return {status:"complete"} }
    }
    if(!active) active=pending.shift() || null
    if(!active) return {status:"idle"}
    const people=active.participants?.data || []
    const recipient=people.filter(p=>p.id!==account.id && p.id!==account.business_account_id)
    // The app's DM data model is one-to-one. Do not invent a customer for groups.
    if(recipient.length!==1) { await dbRequest(env,`ci_backfill?user_id=eq.${owner}`,{status:"running",lease_until:null,active:null,conversations:pending,conversation_after:next,message_after:null,conversations_done:state.conversations_done+1,updated_at:new Date().toISOString()},"PATCH");return {status:"skipped_group"} }
    const owned = await dbRequest(env,`conversations?user_id=eq.${owner}&recipient_id=eq.${encodeURIComponent(recipient[0].id)}&select=id&limit=1`)
    let conversation=owned[0]
    if(!conversation) { const created=await dbRequest(env,"conversations",{user_id:owner,recipient_id:recipient[0].id,recipient_username:recipient[0].username || recipient[0].id,is_unread:false,last_message_at:"1970-01-01T00:00:00Z"});conversation=created[0] }
    const page=await graph(`${active.id}/messages`,{fields:"id,created_time,from,message,attachments",limit:"10",...(state.message_after?{after:state.message_after}:{})})
    const messages=(page.data || []).filter((m:{id?:unknown;created_time?:string;from?:{id?:string}})=>typeof m.id==="string" && Number.isFinite(Date.parse(m.created_time || "")) && typeof m.from?.id==="string").map((m:{id:string;created_time:string;from:{id:string;username?:string};message?:string;attachments?:{data?:unknown[]}})=>({id:m.id,user_id:owner,conversation_id:conversation.id,sender_id:m.from.id,sender_username:m.from.username || m.from.id,content:m.message || "[첨부파일]",attachments:m.attachments?.data || [],created_at:new Date(m.created_time).toISOString(),ingest_source:"backfill",is_from_instagram:m.from.id!==account.id && m.from.id!==account.business_account_id}))
    let inserted=0
    if(messages.length) {
      const response=await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/messages?on_conflict=id&select=id`,{method:"POST",headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,"Content-Type":"application/json",Prefer:"resolution=ignore-duplicates,return=representation"},body:JSON.stringify(messages),signal:AbortSignal.timeout(20000)})
      if(!response.ok) throw Error(`Database HTTP ${response.status}`)
      inserted=(await response.json() as unknown[]).length
    }
    if (messages.length) {
      const latest=messages.map((m:{created_at:string})=>m.created_at).sort().at(-1)!
      await dbRequest(env,`conversations?user_id=eq.${owner}&id=eq.${conversation.id}&last_message_at=lt.${encodeURIComponent(latest)}`,{last_message_at:latest},"PATCH")
    }
    const after=page.paging?.next ? page.paging?.cursors?.after || null : null
    await dbRequest(env,`ci_backfill?user_id=eq.${owner}`,{status:"running",lease_until:null,active:after?active:null,conversations:pending,conversation_after:next,message_after:after,conversations_done:state.conversations_done+(after?0:1),messages_inserted:state.messages_inserted+inserted,last_error:null,updated_at:new Date().toISOString()},"PATCH")
    return {status:"running",inserted}
  } catch(error) {
    await dbRequest(env,`ci_backfill?user_id=eq.${owner}`,{status:"error",lease_until:null,last_error:error instanceof Error?error.message:"Meta backfill failed",updated_at:new Date().toISOString()},"PATCH")
    return {status:"error"}
  }
}
