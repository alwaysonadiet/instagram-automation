"use client"
import { useEffect, useState } from "react"
import { DEFAULT_PUBLIC_REPLIES } from "@/lib/public-replies"

export function PublicReplyDefaults() {
  const [text, setText] = useState(DEFAULT_PUBLIC_REPLIES.join("\n"))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  useEffect(() => {
    let active = true
    fetch("/api/public-reply-defaults").then(async r => {
      const data = await r.json()
      if (!r.ok) throw new Error(data.error)
      if (active) setText(data.replies.join("\n"))
    }).catch(e => { if (active) setError(e.message || "불러오지 못했어요.") }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  async function save() {
    setSaving(true); setError(""); setStatus("")
    try {
      const res = await fetch("/api/public-reply-defaults", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replies: text.split("\n").map(v => v.trim()).filter(Boolean) }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setText(data.replies.join("\n")); setStatus("기본 문구를 저장했어요.")
    } catch (e) { setError(e instanceof Error ? e.message : "저장하지 못했어요.") }
    finally { setSaving(false) }
  }
  return <section className="mt-7 space-y-4 rounded-xl border border-border bg-card p-6">
    <h2 className="text-lg font-semibold">기본 대댓글 문구</h2>
    <p className="text-sm text-muted-foreground">한 줄에 한 문구씩 입력하세요. 자동화에 별도 문구가 없으면 이 목록에서 무작위로 하나를 보냅니다. 키트 전용 문구는 키트 자동화의 별도 목록에 넣으면 다른 상품과 섞이지 않아요.</p>
    <label className="block"><span className="text-sm">대댓글 목록</span><textarea rows={9} disabled={loading || saving} value={text} onChange={e => setText(e.target.value)} className="mt-2 w-full rounded-lg border bg-background p-3 text-sm" /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <p role="status" className="text-sm">{loading ? "불러오는 중…" : status}</p>
    <button type="button" disabled={loading || saving || !!error && !text.trim()} onClick={() => void save()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50">{saving ? "저장 중…" : "기본 문구 저장"}</button>
  </section>
}
