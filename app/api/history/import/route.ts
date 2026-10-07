import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { normaliseExport } from "@/lib/history/normalise"

const schema = z.object({
  sourcePath: z.string().min(1).max(1000),
  ownerNames: z.array(z.string().min(1).max(200)).max(10),
  data: z.unknown(),
  occurrences: z.array(z.number().int().min(0).max(100000)).max(100),
})
export async function POST(request: NextRequest) {
  const identity = await getInstagramIdentity()
  if (!identity) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 })
  // The browser sends small, resumable batches, never a ZIP to the Worker.
  const raw = await request.text()
  if (new TextEncoder().encode(raw).length > 1024 * 1024) return NextResponse.json({ error: "메시지 배치가 너무 큽니다." }, { status: 413 })
  let messages
  try {
    const body = schema.parse(JSON.parse(raw))
    messages = await normaliseExport(body.data, body.sourcePath, body.ownerNames, body.occurrences)
    if (messages.length > 100) return NextResponse.json({ error: "한 번에 100개까지 저장할 수 있습니다." }, { status: 413 })
  } catch {
    return NextResponse.json({ error: "메시지 JSON 형식이 올바르지 않습니다." }, { status: 400 })
  }
  const db = await getSupabaseServerClient()
  // Raw history is an identity-resolution staging layer. Do not infer API IDs.
  const { data, error } = await db.from("instagram_history_events").upsert(messages.map(m => ({
    user_id: identity.userId, source_key: m.key, thread_key: m.threadKey,
    source_path: m.sourcePath, sender_name: m.sender, direction: m.direction,
    sent_at: m.timestamp, original_event: m.original, original_text: m.text,
    display_text: m.displayText, attachments: m.attachments,
    meta_message_id: m.metaMessageId, participants: m.participants,
  })), { onConflict: "user_id,source_key", ignoreDuplicates: true }).select("source_key")
  if (error) return NextResponse.json({ error: "저장하지 못했습니다. 데이터 테이블 설정과 연결을 확인해 주세요." }, { status: 503 })
  return NextResponse.json({ inserted: data?.length ?? 0, duplicates: messages.length - (data?.length ?? 0) })
}
