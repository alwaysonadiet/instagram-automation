import { NextRequest, NextResponse } from "next/server"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
  const identity = await getInstagramIdentity()
  if (!identity) return NextResponse.json({ error: "Please log in again" }, { status: 401 })
  if (request.nextUrl.searchParams.get("userId") !== identity.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  try {
    const db = await getSupabaseServerClient()
    const end = new Date(); end.setUTCHours(23, 59, 59, 999)
    const start = new Date(end); start.setUTCDate(start.getUTCDate() - 29); start.setUTCHours(0, 0, 0, 0)
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(start); date.setUTCDate(date.getUTCDate() + i)
      return { date: date.toISOString().slice(0, 10), incoming: 0, sent: 0 }
    })
    const byDay = new Map(days.map(day => [day.date, day]))
    const conversations = new Set<string>(); const reached = new Set<string>()
    let incoming = 0; let sent = 0
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("messages").select("id,conversation_id,is_from_instagram,created_at")
        .eq("user_id", identity.userId).gte("created_at", start.toISOString()).lte("created_at", end.toISOString())
        .not("content", "like", "ACT::%").neq("content", "[자동화 버튼 클릭]")
        .order("created_at").order("id").range(offset, offset + 999)
      if (error) throw error
      for (const message of data || []) {
        const day = byDay.get(message.created_at.slice(0, 10))
        if (message.conversation_id) conversations.add(message.conversation_id)
        if (message.is_from_instagram) { incoming++; if (day) day.incoming++ }
        else { sent++; if (day) day.sent++; if (message.conversation_id) reached.add(message.conversation_id) }
      }
      if (!data || data.length < 1000) break
    }
    return NextResponse.json({ conversations: conversations.size, reached: reached.size, incoming, sent, days, updatedAt: new Date().toISOString() }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Insights query failed", error)
    return NextResponse.json({ error: "인사이트를 불러오지 못했어요. 다시 시도해주세요." }, { status: 500 })
  }
}
