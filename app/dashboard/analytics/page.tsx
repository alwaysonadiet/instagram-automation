"use client"

import { useCallback, useEffect, useState } from "react"
import { MessageSquare, Users, Send, RefreshCw } from "lucide-react"
import { useInstagramSession } from "@/hooks/use-instagram-session"

type Insights = { conversations: number; reached: number; incoming: number; sent: number; updatedAt: string; days: { date: string; incoming: number; sent: number }[] }
export default function AnalyticsPage() {
  const { userId, isLoading } = useInstagramSession()
  const [data, setData] = useState<Insights | null>(null)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!userId) return
    setLoading(true)
    try {
      const response = await fetch(`/api/dashboard/insights?userId=${encodeURIComponent(userId)}`, { cache: "no-store", signal })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "인사이트를 불러오지 못했어요.")
      if (!signal?.aborted) { setData(result); setError("") }
    } catch (error) { if (!signal?.aborted) setError(error instanceof Error ? error.message : "다시 시도해주세요.") }
    finally { if (!signal?.aborted) setLoading(false) }
  }, [userId])
  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    const onFocus = () => { void refresh(controller.signal) }
    window.addEventListener("focus", onFocus)
    return () => { controller.abort(); window.removeEventListener("focus", onFocus) }
  }, [refresh])
  const max = Math.max(1, ...(data?.days.map(day => day.incoming + day.sent) || []))
  return <div className="mx-auto max-w-5xl px-5 py-7 sm:px-8">
    <header className="border-b border-border pb-7 flex items-start justify-between gap-4"><div><h1 className="text-3xl font-semibold">Insights</h1><p className="mt-2 text-sm text-muted-foreground">최근 30일 · 앱에 저장된 DM 활동</p></div><button disabled={loading || !userId} onClick={() => void refresh()} className="flex items-center gap-2 rounded-lg border p-2 text-sm"><RefreshCw className={"size-4 " + (loading ? "animate-spin" : "")} />새로고침</button></header>
    {error && <p role="alert" className="py-4 text-sm text-destructive">{error}</p>}
    {!userId && !isLoading && <p className="py-4">인스타그램에 로그인해주세요.</p>}
    <div className="grid border-b border-border sm:grid-cols-3">
      {[{ label: "대화 수", value: data?.conversations, icon: MessageSquare }, { label: "DM을 보낸 사람 수", value: data?.reached, icon: Users }, { label: "보낸 메시지", value: data?.sent, icon: Send }].map(({ label, value, icon: Icon }) => <div key={label} className="py-6 sm:px-4"><div className="flex justify-between text-sm text-muted-foreground">{label}<Icon className="size-4" /></div><p className="mt-3 text-3xl font-semibold">{value?.toLocaleString() ?? (loading || isLoading ? "불러오는 중…" : "—")}</p></div>)}
    </div>
    <section className="mt-7 rounded-xl border bg-card p-5"><h2 className="font-semibold">일별 메시지 활동</h2><p className="mt-2 text-xs text-muted-foreground">받은 메시지 {data?.incoming ?? 0}개 · 보낸 메시지 {data?.sent ?? 0}개</p>
      <div className="mt-6 flex h-40 items-end gap-1" aria-label="최근 30일 일별 메시지 수">{data?.days.map(day => <div key={day.date} className="flex h-full flex-1 items-end" title={`${day.date}: 받은 ${day.incoming}개 / 보낸 ${day.sent}개`}><div className="w-full rounded-t bg-primary" style={{ height: `${(day.incoming + day.sent) / max * 100}%` }} /></div>)}</div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>{data?.days[0]?.date}</span><span>{data?.days.at(-1)?.date} (UTC)</span></div>
      {data && data.incoming + data.sent === 0 && <p className="mt-4 text-sm">최근 30일에 저장된 DM이 없어요.</p>}
      <details className="mt-5 text-sm"><summary className="cursor-pointer">날짜별 수치 보기</summary><table className="mt-3 w-full text-left text-xs"><thead><tr><th>날짜 (UTC)</th><th>받음</th><th>보냄</th></tr></thead><tbody>{data?.days.map(day => <tr key={day.date}><td className="py-1">{day.date}</td><td>{day.incoming}</td><td>{day.sent}</td></tr>)}</tbody></table></details>
    </section>
    <p className="mt-4 text-xs text-muted-foreground">수동 DM과 자동 DM의 저장된 기록을 함께 집계해요. 저장되지 않은 과거 댓글 자동 DM과 공개 대댓글은 포함되지 않아요.</p>
    {data && <p className="mt-2 text-xs text-muted-foreground">마지막 업데이트: {new Date(data.updatedAt).toLocaleString()}</p>}
  </div>
}
