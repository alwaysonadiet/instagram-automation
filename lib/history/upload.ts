import { getSupabaseBrowserClient } from "../supabase-browser"
export async function uploadHistoryBatch(payload: unknown, onRetry: (attempt: number) => void) {
  const body = JSON.stringify(payload)
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const { data: { session } } = await getSupabaseBrowserClient().auth.getSession()
      if (!session?.access_token) throw new Error("다시 로그인한 뒤 같은 ZIP을 선택하면 이어서 저장할 수 있어요.")
      const response = await fetch("/api/history/import", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body, signal: AbortSignal.timeout(45000) })
      const text = await response.text()
      let result: { error?: string; inserted: number; duplicates: number }
      try { result = JSON.parse(text) } catch {
        if (attempt < 4 && (response.status >= 500 || response.status === 429)) { onRetry(attempt + 1); await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); continue }
        throw new Error(`저장 요청이 중단됐어요 (HTTP ${response.status}). 같은 ZIP으로 다시 시도할 수 있어요.`)
      }
      if (response.ok) return result
      if ((response.status >= 500 || response.status === 429) && attempt < 4) { onRetry(attempt + 1); await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); continue }
      throw new Error(result.error || `저장하지 못했어요 (HTTP ${response.status}).`)
    } catch (error) {
      if (attempt < 4 && error instanceof Error && ["AbortError", "TimeoutError", "TypeError"].includes(error.name)) { onRetry(attempt + 1); await new Promise(resolve => setTimeout(resolve, 500 * 2 ** attempt)); continue }
      throw error
    }
  }
  throw new Error("저장 연결을 다시 확인해 주세요.")
}
