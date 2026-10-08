// Lightweight ingestion lane: no Next server render or duplicate middleware work.
// The bearer token is always verified remotely. Never trust body/cookie owner IDs.
import { normaliseExport } from "../lib/history/normalise"
export interface HistoryEnv { NEXT_PUBLIC_SUPABASE_URL: string; NEXT_PUBLIC_SUPABASE_ANON_KEY: string; SUPABASE_SERVICE_ROLE_KEY: string }
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store" } })
export async function handleHistoryImport(request: Request, env: HistoryEnv): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405)
  const origin = request.headers.get("origin")
  if (origin && origin !== new URL(request.url).origin) return json({ error: "Forbidden" }, 403)
  const token = request.headers.get("authorization")
  if (!token?.startsWith("Bearer ") || token.length > 10000) return json({ error: "다시 로그인해 주세요.", code: "AUTH_REQUIRED" }, 401)
  try {
    const auth = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/user`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: token }, signal: AbortSignal.timeout(15000) })
    if (auth.status >= 500 || auth.status === 429) return json({ error: "인증 서버 연결을 재시도합니다." }, 503)
    if (!auth.ok) return json({ error: "다시 로그인해 주세요.", code: "AUTH_REQUIRED" }, 401)
    const user = await auth.json() as { app_metadata?: { instagram_user_id?: unknown } }
    const owner = user.app_metadata?.instagram_user_id
    if (typeof owner !== "string" || !/^\d+$/.test(owner)) return json({ error: "Forbidden" }, 403)
    const raw = await request.text()
    if (new TextEncoder().encode(raw).length > 256 * 1024) return json({ error: "메시지 배치가 너무 큽니다.", code: "BATCH_TOO_LARGE" }, 413)
    let messages
    try {
      const body = JSON.parse(raw)
      if (typeof body.sourcePath !== "string" || !body.sourcePath.length || body.sourcePath.length > 1000 || !Array.isArray(body.ownerNames) || body.ownerNames.length > 10 || body.ownerNames.some((n: unknown) => typeof n !== "string" || !n.length || n.length > 200) || !Array.isArray(body.occurrences) || body.occurrences.length > 10 || body.occurrences.some((n: unknown) => !Number.isInteger(n) || Number(n) < 0 || Number(n) > 100000)) throw Error("Invalid input")
      messages = await normaliseExport(body.data, body.sourcePath, body.ownerNames, body.occurrences)
      if (!messages.length || messages.length > 10) throw Error("Invalid batch")
    } catch { return json({ error: "메시지 JSON 형식이 올바르지 않습니다." }, 400) }
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/instagram_history_events?on_conflict=user_id,source_key&select=source_key`, {
      method: "POST", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify(messages.map(m => ({ user_id: owner, source_key: m.key, thread_key: m.threadKey, source_path: m.sourcePath, sender_name: m.sender, participants: m.participants, direction: m.direction, sent_at: m.timestamp, original_event: m.original, original_text: m.text, display_text: m.displayText, attachments: m.attachments, meta_message_id: m.metaMessageId }))), signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) return json({ error: "저장 서버 연결을 재시도합니다." }, 503)
    const saved = await response.json() as unknown[]
    return json({ inserted: saved.length, duplicates: messages.length - saved.length })
  } catch { return json({ error: "연결이 끊겼어요. 이 배치를 다시 시도합니다." }, 503) }
}
