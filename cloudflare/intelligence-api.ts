import { runBackfillStep } from "./backfill"
import { dbRequest, runOneAnalysis, type IntelligenceEnv } from "./intelligence"
export const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } })
export async function verifiedOwner(request: Request, env: IntelligenceEnv): Promise<string | null> {
  const token = request.headers.get("authorization")
  if (!token?.startsWith("Bearer ") || token.length > 10000) return null
  const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: token }, signal: AbortSignal.timeout(15000) })
  if (!res.ok) return null
  const user = await res.json() as { app_metadata?: { instagram_user_id?: unknown } }
  const owner = user.app_metadata?.instagram_user_id
  return typeof owner === "string" && /^\d+$/.test(owner) ? owner : null
}
export async function handleIntelligence(request: Request, env: IntelligenceEnv): Promise<Response> {
  const url = new URL(request.url)
  const origin = request.headers.get("origin")
  if (origin && origin !== url.origin) return json({ error: "Forbidden" }, 403)
  try {
    const owner = await verifiedOwner(request, env)
    if (!owner) return json({ error: "다시 로그인해 주세요." }, 401)
    const action = url.searchParams.get("action") || "dashboard"
    if (request.method === "GET") {
      if (action === "workspace") return json(await dbRequest(env,"rpc/ci_workspace",{p_owner:owner}))
      if (url.pathname === "/api/history/config" || action === "settings") {
        const settings = await dbRequest(env, `ci_settings?user_id=eq.${owner}&select=owner_names,analysis_enabled,daily_limit`)
        return json({ settings: settings[0] || { owner_names: [], analysis_enabled: true, daily_limit: 5 } })
      }
      if (action === "conversations") return json({ conversations: await dbRequest(env,`conversations?user_id=eq.${owner}&select=id,recipient_username,recipient_id&order=last_message_at.desc&limit=200`) })
      if (action === "backfill") return json({ backfill: (await dbRequest(env,`ci_backfill?user_id=eq.${owner}&select=status,conversations_done,messages_inserted,last_error,updated_at`))[0] || null })
      if (action === "integration") {
        const settings = await dbRequest(env, `ci_settings?user_id=eq.${owner}&select=purchase_secret`)
        return json({ endpoint: `${url.origin}/api/intelligence/purchase?owner=${owner}`, secret: settings[0]?.purchase_secret, instructions: "WooCommerce 웹훅 주문 생성/수정 → URL·Secret 설정. 추적 링크의 ci_click_id를 주문 _ci_click_id 메타에 보관하는 플러그인이 필요합니다." })
      }
      if (action === "customer") {
        const key = url.searchParams.get("key") || ""
        if (!key || key.length > 1200) return json({ error: "Invalid customer" }, 400)
        const offset = Math.min(100000, Math.max(0, Number(url.searchParams.get("offset")) || 0))
        const select = "event_key,occurred_at,direction,text,kind,quality_kind,source,attachments"
        const anchor = url.searchParams.get("anchor")
        let events
        if (anchor) {
          const target = await dbRequest(env,`ci_messages?user_id=eq.${owner}&customer_key=eq.${encodeURIComponent(key)}&event_key=eq.${encodeURIComponent(anchor)}&select=occurred_at&limit=1`)
          if (!target.length) return json({error:"원문을 찾지 못했어요."},404)
          const prefix=`ci_messages?user_id=eq.${owner}&customer_key=eq.${encodeURIComponent(key)}&select=${select}`
          const [before,after]=await Promise.all([dbRequest(env,`${prefix}&occurred_at=lt.${encodeURIComponent(target[0].occurred_at)}&order=occurred_at.desc,event_key.desc&limit=12`),dbRequest(env,`${prefix}&occurred_at=gte.${encodeURIComponent(target[0].occurred_at)}&order=occurred_at.asc,event_key.asc&limit=13`)])
          events=[...before.reverse(),...after]
        } else events = await dbRequest(env, `ci_messages?user_id=eq.${owner}&customer_key=eq.${encodeURIComponent(key)}&select=${select}&order=occurred_at.asc,event_key.asc&offset=${offset}&limit=101`)
        const insights = await dbRequest(env, `ci_jobs?user_id=eq.${owner}&customer_key=eq.${encodeURIComponent(key)}&status=eq.ready&schema_version=eq.2&select=period,insight&order=period.asc`)
        const purchases = await dbRequest(env, `ci_purchases?user_id=eq.${owner}&customer_key=eq.${encodeURIComponent(key)}&select=order_key,currency,amount,paid_at,source&order=paid_at.asc`)
        return json({ messages: events.slice(0, 100), more: !anchor && events.length > 100, insights, purchases })
      }
      if (action === "learning") return json({ learning: await dbRequest(env,"rpc/ci_conversion_learning",{p_owner:owner}) })
      if (action === "content") return json({ ideas: await dbRequest(env, `ci_content?user_id=eq.${owner}&order=created_at.desc&limit=50`), links: await dbRequest(env, `ci_links?user_id=eq.${owner}&select=slug,content_id,destination,customer_key&order=created_at.desc&limit=50`) })
      const product = url.searchParams.get("product")
      const days = Number(url.searchParams.get("days") ?? 30)
      const scope = url.searchParams.get("scope") || "marketing"
      if (![0,7,30,90,365].includes(days) || !["marketing","support","testimonial"].includes(scope)) return json({error:"Invalid filter"},400)
      return json(await dbRequest(env, "rpc/ci_dashboard_v2", { p_owner: owner, p_product: product || null, p_days: days, p_scope: scope }))
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
    const raw = await request.text()
    if (raw.length > 30000) return json({ error: "Payload too large" }, 413)
    const body = JSON.parse(raw)
    if (action === "backfill") {
      const existing = await dbRequest(env,`ci_backfill?user_id=eq.${owner}&select=status`)
      if (!existing.length) await dbRequest(env,"ci_backfill",{user_id:owner})
      else if (existing[0].status==="error") await dbRequest(env,`ci_backfill?user_id=eq.${owner}`,{status:"running",last_error:null},"PATCH")
      return json(await runBackfillStep(env,owner))
    }
    if (action === "settings") {
      if (typeof body.analysis_enabled !== "boolean" || !Number.isInteger(body.daily_limit) || body.daily_limit < 0 || body.daily_limit > 20) return json({ error: "Invalid settings" }, 400)
      await dbRequest(env, `ci_settings?user_id=eq.${owner}`, { analysis_enabled: body.analysis_enabled, daily_limit: body.daily_limit }, "PATCH")
      return json({ success: true })
    }
    if (action === "product") {
      if (typeof body.product_key !== "string" || !/^[a-z0-9-]{1,50}$/.test(body.product_key) || typeof body.label !== "string" || !body.label.trim() || body.label.length > 100 || !Array.isArray(body.keywords) || body.keywords.length > 20 || body.keywords.some((s: unknown) => typeof s !== "string" || !s.trim() || s.length > 100)) return json({ error: "Invalid product" }, 400)
      // UPDATE or INSERT after verifying the composite owner key; no cross-owner edits.
      const existing = await dbRequest(env, `ci_products?user_id=eq.${owner}&product_key=eq.${body.product_key}&select=product_key`)
      if (existing.length) await dbRequest(env, `ci_products?user_id=eq.${owner}&product_key=eq.${body.product_key}`, { label: body.label.trim(), keywords: body.keywords }, "PATCH")
      else await dbRequest(env, "ci_products", { user_id: owner, product_key: body.product_key, label: body.label.trim(), keywords: body.keywords })
      return json({ success: true })
    }
    if (action === "content") {
      const formats = ["Reel", "Carousel", "Story", "FAQ", "Sales Page", "Content Idea"]
      if (!formats.includes(body.format) || typeof body.event_key !== "string" || body.event_key.length > 1200) return json({ error: "Invalid content request" }, 400)
      const evidence = await dbRequest(env, `ci_messages?user_id=eq.${owner}&event_key=eq.${encodeURIComponent(body.event_key)}&kind=eq.customer&quality_kind=in.(problem,desire,objection,question,support,testimonial)&select=event_key,text&limit=1`)
      if (!evidence.length) return json({ error: "고객 원문을 찾지 못했어요." }, 404)
      const quote = evidence[0].text
      const outline = `고객 원문 (내부 참고):\n${quote}\n\n도입: 이 질문이 반복되는 상황을 설명하세요.\n핵심: 바로 적용할 수 있는 해결 방법 1~3개를 적으세요.\n근거: 실제 사례나 확인 가능한 결과를 추가하세요.\n마무리: 다음 행동 한 가지를 안내하세요.\n\n게시 전 개인정보와 표현을 검토하세요.`
      const saved = await dbRequest(env, "ci_content", { user_id: owner, format: body.format, title: quote.slice(0, 100), outline, evidence_keys: [evidence[0].event_key] })
      return json({ idea: saved[0] })
    }
    if (action === "edit-content") {
      if (typeof body.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 200 || typeof body.outline !== "string" || body.outline.length > 20000) return json({ error: "Invalid content" }, 400)
      await dbRequest(env, `ci_content?user_id=eq.${owner}&id=eq.${body.id}`, { title: body.title, outline: body.outline }, "PATCH")
      return json({ success: true })
    }
    if (action === "link") {
      const destination = typeof body.destination === "string" ? new URL(body.destination) : null
      if (!destination || destination.protocol !== "https:" || body.destination.length > 2000 || !/^[a-f0-9-]{36}$/i.test(body.content_id || "")) return json({ error: "HTTPS 구매 링크와 콘텐츠를 선택하세요." }, 400)
      const content = await dbRequest(env, `ci_content?user_id=eq.${owner}&id=eq.${body.content_id}&select=id&limit=1`)
      if (!content.length) return json({ error: "Not found" }, 404)
      if (body.customer_key) {
        const customer = await dbRequest(env, `ci_messages?user_id=eq.${owner}&customer_key=eq.${encodeURIComponent(body.customer_key)}&select=event_key&limit=1`)
        if (!customer.length) return json({ error: "Invalid customer" }, 400)
      }
      const slug = crypto.randomUUID().replaceAll("-", "")
      await dbRequest(env, "ci_links", { slug, user_id: owner, content_id: body.content_id, destination: body.destination, customer_key: body.customer_key || null })
      return json({ url: `${url.origin}/r/${slug}` })
    }
    if (action === "purchase") {
      if (body.confirmed !== true || typeof body.order_key !== "string" || !body.order_key.trim() || body.order_key.length > 200 || !/^[A-Z]{3}$/.test(body.currency || "") || !/^\d{1,12}(\.\d{1,2})?$/.test(String(body.amount)) || !Number.isFinite(Date.parse(body.paid_at)) || !body.customer_key) return json({ error: "확인된 결제의 주문번호·금액·통화·날짜·고객이 필요해요." }, 400)
      const customer = await dbRequest(env, `ci_messages?user_id=eq.${owner}&customer_key=eq.${encodeURIComponent(body.customer_key)}&select=event_key&limit=1`)
      if (!customer.length) return json({ error: "Invalid customer" }, 400)
      const existing = await dbRequest(env, `ci_purchases?user_id=eq.${owner}&order_key=eq.${encodeURIComponent(body.order_key)}&select=order_key`)
      if (existing.length) return json({ success: true, duplicate: true })
      await dbRequest(env, "ci_purchases", { user_id: owner, order_key: body.order_key, currency: body.currency, amount: body.amount, paid_at: new Date(body.paid_at).toISOString(), customer_key: body.customer_key, source: "manual_confirmed" })
      return json({ success: true })
    }
    if (action === "merge") {
      if (typeof body.thread_key !== "string" || body.thread_key.length > 1000 || !/^[a-f0-9-]{36}$/i.test(body.conversation_id || "")) return json({ error: "Invalid identity link" }, 400)
      const conversation = await dbRequest(env, `conversations?user_id=eq.${owner}&id=eq.${body.conversation_id}&select=id&limit=1`)
      if (!conversation.length) return json({ error: "Not found" }, 404)
      await dbRequest(env, `instagram_history_events?user_id=eq.${owner}&thread_key=eq.${encodeURIComponent(body.thread_key)}`, { linked_conversation_id: body.conversation_id }, "PATCH")
      await dbRequest(env, "rpc/ci_seed_jobs", { p_owner: owner })
      return json({ success: true })
    }
    if (action === "analyze") return json(await runOneAnalysis(env))
    return json({ error: "Unknown action" }, 400)
  } catch { return json({ error: "고객 데이터 조회가 지연됐어요. 잠시 후 새로고침해 주세요." }, 503) }
}
export async function handleTrackedClick(request: Request, env: IntelligenceEnv) {
  if (!["GET", "HEAD"].includes(request.method)) return json({ error: "Method not allowed" }, 405)
  const slug = new URL(request.url).pathname.slice(3)
  if (!/^[a-f0-9]{32}$/.test(slug)) return json({ error: "Not found" }, 404)
  try {
    const links = await dbRequest(env, `ci_links?slug=eq.${slug}&select=slug,owner_id,destination`)
    if (!links.length) return json({ error: "Not found" }, 404)
    const link = links[0], destination = new URL(link.destination)
    if (request.method === "GET") {
      const clicks = await dbRequest(env, "ci_clicks", { slug, user_id: link.owner_id })
      destination.searchParams.set("ci_click_id", clicks[0].id)
    }
    return new Response(null, { status: 302, headers: { Location: destination.toString(), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } })
  } catch { return json({ error: "링크 연결을 다시 시도해 주세요." }, 503) }
}
