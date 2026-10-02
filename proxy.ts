import { createServerClient } from "@supabase/ssr"
import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin"

// Privileged API handlers use service-role data access: enforce ownership first.
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  if (["/api/instagram/callback", "/api/instagram/webhook", "/api/instagram/login", "/api/session"].includes(path)) return NextResponse.next()
  let response = NextResponse.next({ request })
  response.headers.set("Cache-Control", "no-store")
  const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: values => {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        response.headers.set("Cache-Control", "no-store")
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  const { data: { user }, error } = await auth.auth.getUser()
  const owner = user?.app_metadata.instagram_user_id
  if (error || typeof owner !== "string" || !/^\d+$/.test(owner)) return NextResponse.json({ error: "Please log in again" }, { status: 401 })
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin")
    if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  let body: Record<string, unknown> = {}
  if (!["GET", "HEAD", "OPTIONS", "DELETE"].includes(request.method)) {
    try {
      body = await request.clone().json()
      if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid body")
    } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  }
  const requestedOwners = [request.nextUrl.searchParams.get("userId"), body.userId, body.user_id]
  if (requestedOwners.some(value => value !== undefined && value !== null && String(value) !== owner)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const resourceId = path === "/api/inbox/messages" ? request.nextUrl.searchParams.get("conversationId")
    : path === "/api/automations" && ["PUT", "PATCH", "DELETE"].includes(request.method) ? (request.method === "DELETE" ? request.nextUrl.searchParams.get("id") : body.id) : null
  if (resourceId) {
    const table = path === "/api/inbox/messages" ? "conversations" : "automations"
    const { data, error } = await getSupabaseAdmin().from(table).select("id").eq("id", resourceId).eq("user_id", owner).maybeSingle()
    if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  return response
}

export const config = { matcher: "/api/:path*" }
