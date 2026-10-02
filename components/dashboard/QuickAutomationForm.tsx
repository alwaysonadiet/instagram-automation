"use client"

import { useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import type { Automation } from "@/lib/types"

type Source = Automation["trigger_source"]

export function QuickAutomationForm({ userId, initialSource, onSuccess }: {
  userId: string
  initialSource: Source
  onSuccess: (source: Source) => void
}) {
  const [source, setSource] = useState<Source>(initialSource)
  const [keyword, setKeyword] = useState("")
  const [answer, setAnswer] = useState("")
  const [allComments, setAllComments] = useState(false)
  const [replyMode, setReplyMode] = useState<"dm_only" | "public_only" | "both">("dm_only")
  const [publicReplies, setPublicReplies] = useState("")
  const variants = publicReplies.split("\n").map(value => value.trim()).filter(Boolean)
  const comment = source === "comment"
  const valid = (comment && allComments || !!keyword.trim()) &&
    (comment && replyMode === "public_only" || !!answer.trim()) &&
    (!comment || replyMode === "dm_only" || variants.length > 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const submitting = useRef(false)
  const field = "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || !valid) return
    submitting.current = true
    setSaving(true)
    setError("")
    try {
      const response = await fetch("/api/automations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          name: comment && allComments ? "모든 댓글에 답장" : `Reply to ${keyword.trim()}`,
          trigger_source: source,
          trigger_type: comment && allComments ? "reply_all" : source === "story" ? "reply" : "keyword",
          trigger_value: comment && allComments ? "ALL_COMMENTS" : keyword.trim(),
          content: { message: comment && replyMode === "public_only" ? "" : answer.trim(), ...(comment ? { reply_mode: replyMode, public_replies: variants } : {}) },
          specific_media_id: null,
        }),
      })
      if (!response.ok) throw new Error("Could not save. Please try again.")
      setKeyword("")
      setAnswer("")
      setPublicReplies("")
      onSuccess(source)
    } catch {
      setError("Could not save. Check your connection and try again.")
    } finally {
      submitting.current = false
      setSaving(false)
    }
  }

  return <form onSubmit={save} className="overflow-hidden rounded-xl border border-border bg-card">
    <fieldset disabled={saving} className="min-w-0">
      <label className="flex items-center gap-3 border-b border-border px-4 py-3"><span className="shrink-0 text-xs text-muted-foreground">Reply to</span>
        <select value={source} onChange={event => setSource(event.target.value as Source)} className="rounded-md bg-card py-1 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <option value="dm">Direct messages</option><option value="comment">Post comments</option><option value="story">Story replies</option>
        </select>
      </label>
      {comment && <div className="border-b border-border px-4 py-3 space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allComments} onChange={event => setAllComments(event.target.checked)} />모든 댓글에 반응 (키워드 없이)</label>
        <label className="flex items-center gap-3 text-sm">보낼 답장
          <select value={replyMode} onChange={event => setReplyMode(event.target.value as typeof replyMode)} className={field + " max-w-56"}>
            <option value="dm_only">자동 DM만</option><option value="both">자동 DM + 대댓글</option><option value="public_only">대댓글만</option>
          </select>
        </label>
      </div>}
      <div className="grid sm:grid-cols-[1fr_2fr]">
      <label className="block border-b border-border p-4 sm:border-b-0 sm:border-r"><span className="text-xs font-medium text-muted-foreground">When they say</span>
        <input required={!(comment && allComments)} disabled={comment && allComments} value={keyword} onChange={event => setKeyword(event.target.value)} placeholder={comment && allComments ? "어떤 댓글이든 반응합니다" : "예: 자동화, 자료"} className="mt-2 w-full rounded-sm bg-card py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      {!(comment && replyMode === "public_only") && <label className="block p-4"><span className="text-xs font-medium text-muted-foreground">Send this reply</span>
        <textarea required maxLength={1000} rows={3} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Our plans start at ₹499. Here’s the link…" className="mt-2 w-full resize-y rounded-sm bg-card py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>}
      </div>
      {comment && replyMode !== "dm_only" && <label className="block border-t border-border p-4">
        <span className="text-sm font-medium">대댓글 문구 여러 개</span>
        <p className="mt-1 text-xs text-muted-foreground">한 줄에 문구 하나씩 적어주세요. 같은 키워드에도 매번 목록에서 하나를 무작위로 골라 답장합니다.</p>
        <textarea required rows={3} value={publicReplies} onChange={event => setPublicReplies(event.target.value)} placeholder={"DM으로 보내드렸어요 💌\n메시지함을 확인해주세요 😊\n자료 보내드렸습니다!"} className={field + " mt-2"} />
      </label>}
      <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{source === "comment" ? "릴스 · 캐러셀 · 일반 게시물 댓글에 적용" : source === "story" ? "Matches keywords in story replies" : "Matches keywords in incoming DMs"}</p>
      <button disabled={saving || !valid} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {saving && <Loader2 className="size-4 animate-spin" />}{saving ? "Saving…" : "Save reply"}
      </button>
      </div>
      {error && <p role="alert" className="px-4 pb-3 text-sm text-destructive">{error}</p>}
    </fieldset>
  </form>
}
