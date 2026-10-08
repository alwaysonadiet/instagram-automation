import { getSupabaseBrowserClient } from "../supabase-browser"
export async function intelligenceFetch(url: string, body?: unknown) {
  const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
  if (!session) throw Error("다시 로그인해 주세요.")
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
  let value
  try { value = await response.json() } catch { throw Error(`서버 연결이 중단됐어요 (HTTP ${response.status}).`) }
  if (!response.ok) throw Error(value.error || "불러오지 못했어요.")
  return value
}
