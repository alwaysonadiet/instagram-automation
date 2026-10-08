import { dbRequest, type IntelligenceEnv } from "./intelligence"
import { json } from "./intelligence-api"
export async function handlePurchaseWebhook(request: Request, env: IntelligenceEnv) {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const owner = new URL(request.url).searchParams.get("owner") || ""
  if (!/^\d+$/.test(owner)) return json({ error: "Unauthorized" }, 401)
  try {
    const raw = await request.text()
    if (new TextEncoder().encode(raw).length > 256 * 1024) return json({ error: "Payload too large" }, 413)
    const settings = await dbRequest(env, `ci_settings?user_id=eq.${owner}&select=purchase_secret`)
    if (!settings[0]?.purchase_secret) return json({ error: "Unauthorized" }, 401)
    const key = await crypto.subtle.importKey("raw",new TextEncoder().encode(settings[0].purchase_secret),{name:"HMAC",hash:"SHA-256"},false,["sign"])
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(raw)))
    const signature = btoa(String.fromCharCode(...bytes)),provided = request.headers.get("x-wc-webhook-signature") || ""
    let mismatch = signature.length ^ provided.length
    for(let i=0;i<signature.length;i++) mismatch |= signature.charCodeAt(i) ^ (provided.charCodeAt(i) || 0)
    if (mismatch) return json({ error: "Unauthorized" }, 401)
    const order = JSON.parse(raw)
    // WooCommerce sends a setup ping before real orders.
    if (!order.id) return json({ success: true, ping: true })
    const orderKey = "woocommerce:"+String(order.id)
    const existing = await dbRequest(env,`ci_purchases?user_id=eq.${owner}&order_key=eq.${encodeURIComponent(orderKey)}&select=order_key,amount`)
    if (["refunded","cancelled","failed"].includes(order.status)) {
      if (existing.length) await dbRequest(env,`ci_purchases?user_id=eq.${owner}&order_key=eq.${encodeURIComponent(orderKey)}`,{status:order.status,refunded_amount:order.status==="refunded"?existing[0].amount:0},"PATCH")
      return json({success:true,status_updated:true})
    }
    if (!["processing","completed"].includes(order.status)) return json({ success:true,ignored:true })
    const paid = order.date_paid_gmt ? order.date_paid_gmt.replace(/Z$/,'')+'Z' : null
    if (!paid || !Number.isFinite(Date.parse(paid)) || !/^\d{1,12}(\.\d{1,2})?$/.test(String(order.total)) || !/^[A-Z]{3}$/.test(order.currency || "")) return json({ error: "Invalid paid order" },400)
    const refunds = (Array.isArray(order.refunds) ? order.refunds : []).reduce((sum:number,r:{total:unknown})=>sum+Math.abs(Number(r.total)||0),0).toFixed(2)
    if(existing.length) {
      await dbRequest(env,`ci_purchases?user_id=eq.${owner}&order_key=eq.${encodeURIComponent(orderKey)}`,{status:"paid",refunded_amount:refunds},"PATCH")
      return json({success:true,duplicate:true})
    }
    const clickId = (Array.isArray(order.meta_data) ? order.meta_data : []).find((m:{key:string})=>m.key==="_ci_click_id")?.value
    const clicks = typeof clickId==="string" && /^[a-f0-9-]{36}$/i.test(clickId) ? await dbRequest(env,`ci_clicks?user_id=eq.${owner}&id=eq.${clickId}&select=id,slug,clicked_at`) : []
    const links = clicks.length ? await dbRequest(env,`ci_links?user_id=eq.${owner}&slug=eq.${clicks[0].slug}&select=customer_key`) : []
    const withinWindow = clicks.length && Date.parse(paid)>=Date.parse(clicks[0].clicked_at) && Date.parse(paid)-Date.parse(clicks[0].clicked_at)<=30*86400000
    await dbRequest(env,"ci_purchases",{user_id:owner,order_key:orderKey,currency:order.currency,amount:order.total,paid_at:paid,source:"verified_webhook",status:"paid",refunded_amount:refunds,click_id:withinWindow?clicks[0].id:null,customer_key:withinWindow?links[0]?.customer_key:null})
    return json({ success:true })
  } catch { return json({ error:"처리하지 못했어요. 웹훅을 재시도해 주세요." },503) }
}
