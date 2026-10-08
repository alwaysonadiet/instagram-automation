import "server-only"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import type { SendResult } from "@/lib/instagram-api"
export async function trackAutomatedSend(user: { id: string | number }, pending: Promise<SendResult>, recipient: { id?: string; comment_id?: string }) {
  const result = await pending
  if (result.ok && result.id) {
    try {
      const db = await getSupabaseServerClient()
      const { error } = await db.from("message_provenance").upsert({ user_id: user.id, meta_message_id: result.id, delivery_kind: "automation", recipient_id: recipient.id || null, comment_id: recipient.comment_id || null }, { onConflict: "user_id,meta_message_id", ignoreDuplicates: true })
      if (error) console.error("[provenance] Could not record automated send", error.code)
    } catch { console.error("[provenance] Could not record automated send") }
  }
  return result
}
