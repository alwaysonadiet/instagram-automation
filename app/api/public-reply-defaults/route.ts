import { NextRequest, NextResponse } from "next/server"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { publicReplyDefaults } from "@/lib/public-replies"

export async function GET() {
  const identity = await getInstagramIdentity()
  if (!identity) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 })
  const db = await getSupabaseServerClient()
  const { data, error } = await db.from("users").select("public_reply_defaults").eq("id", identity.userId).single()
  if (error) return NextResponse.json({ error: "기본 문구를 불러오지 못했어요." }, { status: 503 })
  return NextResponse.json({ replies: publicReplyDefaults(data.public_reply_defaults) })
}
export async function PUT(request: NextRequest) {
  const identity = await getInstagramIdentity()
  if (!identity) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 })
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  let replies: string[]
  try {
    const raw = await request.text()
    if (raw.length > 30000) throw new Error()
    const body = JSON.parse(raw)
    if (!Array.isArray(body.replies) || body.replies.length < 1 || body.replies.length > 30 || body.replies.some((v: unknown) => typeof v !== "string" || !v.trim() || v.length > 1000)) throw new Error()
    replies = body.replies.map((v: string) => v.trim())
  } catch { return NextResponse.json({ error: "문구를 1~30개 입력해 주세요. 각 문구는 1,000자까지 가능해요." }, { status: 400 }) }
  const db = await getSupabaseServerClient()
  const { data, error } = await db.from("users").update({ public_reply_defaults: replies }).eq("id", identity.userId).select("id").single()
  if (error || !data) return NextResponse.json({ error: "저장하지 못했어요." }, { status: 503 })
  return NextResponse.json({ replies })
}
