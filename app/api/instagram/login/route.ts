import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const clientId = process.env.INSTAGRAM_APP_ID
  const redirectUri = process.env.NEXT_PUBLIC_INSTAGRAM_REDIRECT_URI
  if (!clientId || !redirectUri) return NextResponse.json({ error: "Instagram login is not configured" }, { status: 503 })
  const state = randomUUID()
  const url = new URL("https://www.instagram.com/oauth/authorize")
  url.search = new URLSearchParams({ enable_fb_login: "0", force_authentication: "1", client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_manage_comments", state }).toString()
  const response = request.nextUrl.searchParams.get("format") === "json"
    ? NextResponse.json({ url: url.toString() }, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.redirect(url)
  response.cookies.set("ig_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 })
  return response
}
