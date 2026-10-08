import { NextRequest, NextResponse } from "next/server"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { decodeMetaText } from "@/lib/history/normalise"

export async function GET(request: NextRequest) {
  const identity = await getInstagramIdentity()
  if (!identity) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 })
  const db = await getSupabaseServerClient()
  const params = request.nextUrl.searchParams
  const offset = Number(params.get("offset") || 0)
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) return NextResponse.json({ error: "잘못된 페이지입니다." }, { status: 400 })
  const thread = params.get("thread")
  if (thread) {
    if (thread.length > 1000) return NextResponse.json({ error: "잘못된 대화입니다." }, { status: 400 })
    const { data, error } = await db.from("instagram_history_events").select("source_key,sender_name,direction,sent_at,display_text,attachments")
      .eq("user_id", identity.userId).eq("thread_key", thread).order("sent_at").order("source_key").range(offset, offset + 100)
    if (error) return NextResponse.json({ error: "대화를 불러오지 못했어요." }, { status: 503 })
    return NextResponse.json({ messages: (data || []).slice(0,100).map(m => ({ ...m, sender_name: decodeMetaText(m.sender_name) })), more: (data?.length || 0) > 100 })
  }
  const [summary, threads] = await Promise.all([
    db.rpc("history_overview", { p_owner: identity.userId }),
    db.rpc("history_threads", { p_owner: identity.userId, p_skip: offset, p_take: 31 })
  ])
  if (summary.error || threads.error) return NextResponse.json({ error: "저장된 대화를 불러오지 못했어요." }, { status: 503 })
  return NextResponse.json({ summary: summary.data, threads: (threads.data || []).slice(0,30).map((t: { participants: string[] }) => ({ ...t, participants: t.participants.map(decodeMetaText) })), more: (threads.data?.length || 0) > 30 })
}
