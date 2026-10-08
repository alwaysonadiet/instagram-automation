"use client"
import { useEffect, useState } from "react"

type Thread = { thread_key: string; participants: string[]; message_count: number; last_at: string; unknown_count: number }
type Message = { source_key: string; sender_name: string; direction: string; sent_at: string; display_text: string; attachments: unknown[] }
type Summary = { messages: number; conversations: number; unknown: number }
export function HistoryArchive({ revision = 0 }: { revision?: number }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [thread, setThread] = useState("")
  const [messages, setMessages] = useState<Message[]>([])
  const [page, setPage] = useState(0)
  const [messagePage, setMessagePage] = useState(0)
  const [more, setMore] = useState(false)
  const [moreMessages, setMoreMessages] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    let active = true
    setLoading(true); setError("")
    fetch(`/api/history/archive?offset=${page * 30}`).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error)
      if (active) { setSummary(data.summary); setThreads(data.threads); setMore(data.more) }
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [page, revision])
  useEffect(() => {
    if (!thread) return
    let active = true
    setLoading(true); setError(""); setMessages([])
    fetch(`/api/history/archive?thread=${encodeURIComponent(thread)}&offset=${messagePage * 100}`).then(async r => {
      const data = await r.json(); if (!r.ok) throw new Error(data.error)
      if (active) { setMessages(data.messages); setMoreMessages(data.more) }
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [thread, messagePage, revision])
  const button = "rounded-lg border px-3 py-2 text-sm disabled:opacity-50"
  return <section className="space-y-4 rounded-xl border p-5">
    <h2 className="text-xl font-semibold">저장된 과거 대화</h2>
    {summary && <p>{Number(summary.messages).toLocaleString()}개 메시지 · {Number(summary.conversations).toLocaleString()}개 대화 · 발신 방향 미확인 {Number(summary.unknown).toLocaleString()}개</p>}
    <p className="text-sm text-muted-foreground">내보내기 원문 보관함입니다. 이름만으로 현재 Inbox 고객과 자동으로 합치지 않습니다. 첨부파일은 정보만 보관하며 파일 자체는 원본 ZIP에 있어요.</p>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    {loading && <p role="status">불러오는 중…</p>}
    {!thread ? <>
      <div className="space-y-2">{threads.map(t => <button type="button" key={t.thread_key} className="block w-full rounded-lg border p-3 text-left" onClick={() => { setMessagePage(0); setThread(t.thread_key) }}>
        <p className="break-words">{t.participants.join(" · ")}</p><p className="text-xs text-muted-foreground">{Number(t.message_count).toLocaleString()}개 메시지 · {new Date(t.last_at).toLocaleDateString("ko-KR")}</p>
      </button>)}</div>
      {summary?.messages === 0 && <p>아직 저장된 대화가 없어요.</p>}
      <div className="flex gap-2"><button type="button" className={button} disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>이전 대화</button><button type="button" className={button} disabled={!more || loading} onClick={() => setPage(p => p + 1)}>다음 대화</button></div>
    </> : <>
      <button type="button" className={button} onClick={() => setThread("")}>대화 목록으로</button>
      <div className="max-h-[600px] space-y-3 overflow-y-auto">{messages.map(m => <div key={m.source_key} className="rounded-lg bg-muted p-3">
        <p className="text-xs text-muted-foreground">{m.sender_name} · {m.direction === "outgoing" ? "내 메시지" : m.direction === "incoming" ? "상대방 메시지" : "발신 방향 미확인"} · {new Date(m.sent_at).toLocaleString("ko-KR")}</p>
        <p className="whitespace-pre-wrap break-words">{m.display_text || "[첨부파일 또는 시스템 이벤트]"}</p>{m.attachments.length > 0 && <p className="text-xs">첨부 정보 {m.attachments.length}개</p>}
      </div>)}</div>
      <div className="flex gap-2"><button type="button" className={button} disabled={messagePage === 0 || loading} onClick={() => setMessagePage(p => p - 1)}>이전 메시지</button><button type="button" className={button} disabled={!moreMessages || loading} onClick={() => setMessagePage(p => p + 1)}>다음 메시지</button></div>
    </>}
  </section>
}
