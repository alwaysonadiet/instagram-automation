"use client"

import { useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import type { Automation, MediaItem } from "@/lib/types"

type Source = Automation["trigger_source"]

export function QuickAutomationForm({ userId, initialSource, onSuccess }: {
  userId: string
  initialSource: Source
  onSuccess: (source: Source) => void
}) {
  const [source, setSource] = useState<Source>(initialSource)
  const [keyword, setKeyword] = useState("")
  const [answer, setAnswer] = useState("")
  const [mediaScope, setMediaScope] = useState<"all" | "specific">("all")
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState("")
  const [mediaCursor, setMediaCursor] = useState<string | null>(null)
  const mediaRequest = useRef(false)
  async function loadMedia(more = false) {
    if (mediaRequest.current) return
    mediaRequest.current = true
    setMediaLoading(true)
    setMediaError("")
    try {
      const response = await fetch(`/api/instagram/media?userId=${encodeURIComponent(userId)}${more && mediaCursor ? `&after=${encodeURIComponent(mediaCursor)}` : ""}`)
      if (!response.ok) throw new Error()
      const result = await response.json()
      setMedia(previous => more ? [...previous, ...result.data.filter((item: MediaItem) => !previous.some(value => value.id === item.id))] : result.data)
      setMediaCursor(result.next_cursor || null)
      setMediaLoaded(true)
    } catch { setMediaError("게시물을 불러오지 못했어요. 다시 시도해주세요.") }
    finally { mediaRequest.current = false; setMediaLoading(false) }
  }
  const [allComments, setAllComments] = useState(false)
  const [replyMode, setReplyMode] = useState<"dm_only" | "public_only" | "both">("both")
  const [publicReplies, setPublicReplies] = useState("")
  const [buttons, setButtons] = useState<{ title: string; url: string }[]>([])
  const [checkFollow, setCheckFollow] = useState(false)
  const hasDM = !(source === "comment" && replyMode === "public_only")
  const buttonsValid = buttons.every(button => button.title.trim() && /^https:\/\//i.test(button.url.trim()))
  const variants = publicReplies.split("\n").map(value => value.trim()).filter(Boolean)
  const comment = source === "comment"
  const valid = (!comment || mediaScope === "all" || !!selectedMedia) && (comment && allComments || !!keyword.trim()) &&
    (comment && replyMode === "public_only" || !!answer.trim()) &&
    (!comment || replyMode === "dm_only" || variants.length > 0) &&
    (!hasDM || buttonsValid && (buttons.length === 0 || answer.length <= 640))
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
          content: { ...(hasDM ? { check_follow: checkFollow, buttons: buttons.map(button => ({ type: "web_url", title: button.title.trim(), url: button.url.trim() })) } : {}), message: comment && replyMode === "public_only" ? "" : answer.trim(), ...(comment ? { reply_mode: replyMode, public_replies: variants } : {}) },
          specific_media_id: comment && mediaScope === "specific" ? selectedMedia?.id : null,
        }),
      })
      if (!response.ok) throw new Error("Could not save. Please try again.")
      setKeyword("")
      setAnswer("")
      setPublicReplies("")
      setButtons([])
      setCheckFollow(false)
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
        <div className="space-y-3">
          <p className="text-sm font-medium">어떤 게시물의 댓글에 보낼까요?</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={mediaScope === "all"} onClick={() => setMediaScope("all")} className={`rounded-lg border px-3 py-2 text-sm ${mediaScope === "all" ? "border-primary bg-primary/10" : "border-border"}`}>전체 게시물 · 릴스</button>
            <button type="button" aria-pressed={mediaScope === "specific"} onClick={() => { setMediaScope("specific"); if (!mediaLoaded) void loadMedia() }} className={`rounded-lg border px-3 py-2 text-sm ${mediaScope === "specific" ? "border-primary bg-primary/10" : "border-border"}`}>특정 게시물 · 캐러셀 · 릴스 선택</button>
          </div>
          {mediaScope === "all" && <p className="text-xs text-muted-foreground">기존 게시물과 앞으로 올리는 게시물 모두에 적용해요.</p>}
          {mediaScope === "specific" && <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 max-h-80 overflow-y-auto">
              {media.map(item => <button key={item.id} type="button" aria-pressed={selectedMedia?.id === item.id} onClick={() => setSelectedMedia(item)} className={`overflow-hidden rounded-lg border-2 text-left ${selectedMedia?.id === item.id ? "border-primary" : "border-transparent"}`}>
                <img src={item.image_url} alt={item.caption || "인스타그램 게시물"} loading="lazy" className="aspect-square w-full object-cover" />
                <span className="block truncate p-1 text-xs">{item.media_type === "CAROUSEL_ALBUM" ? "캐러셀" : item.media_type === "VIDEO" ? "릴스 / 동영상" : "게시물"} · {item.caption || "설명 없음"}</span>
              </button>)}
            </div>
            {mediaLoading && <p role="status" className="text-xs">게시물 불러오는 중…</p>}
            {mediaError && <p role="alert" className="text-xs text-destructive">{mediaError} <button type="button" onClick={() => void loadMedia()} className="underline">다시 시도</button></p>}
            {!mediaLoading && mediaLoaded && media.length === 0 && <p className="text-xs">선택할 게시물이 없어요.</p>}
            {mediaCursor && <button type="button" disabled={mediaLoading} onClick={() => void loadMedia(true)} className="text-sm underline">이전 게시물 더 보기</button>}
            <p className="text-xs text-muted-foreground">{selectedMedia ? `선택됨: ${selectedMedia.caption || "설명 없는 게시물"}` : "자동화를 적용할 게시물 하나를 선택해주세요."}</p>
          </div>}
        </div>
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
      {hasDM && <section className="p-4 space-y-3" aria-label="DM 메시지와 링크 버튼">
        <label className="block"><span className="text-xs font-medium text-muted-foreground">Send this DM</span>
          <textarea required maxLength={buttons.length ? 640 : 1000} rows={4} value={answer} onChange={event => setAnswer(event.target.value)} placeholder="요청하신 자료를 보내드려요 💌" className="mt-2 w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </label>
        <p className="text-sm font-medium">메시지 아래 링크 버튼 (최대 3개)</p>
        {buttons.map((button, index) => <div key={index} className="flex flex-wrap gap-2">
          <input aria-label={`버튼 ${index + 1} 이름`} required maxLength={20} value={button.title} placeholder="버튼 이름" className={field + " sm:w-40"} onChange={event => setButtons(previous => previous.map((value, i) => i === index ? { ...value, title: event.target.value } : value))} />
          <input aria-label={`버튼 ${index + 1} 링크`} required type="url" pattern="https://.*" value={button.url} placeholder="https://…" className={field + " sm:flex-1"} onChange={event => setButtons(previous => previous.map((value, i) => i === index ? { ...value, url: event.target.value } : value))} />
          <button type="button" onClick={() => setButtons(previous => previous.filter((_, i) => i !== index))} className="text-sm underline">삭제</button>
        </div>)}
        {buttons.length < 3 && <button type="button" onClick={() => setButtons(previous => [...previous, { title: "", url: "" }])} className="text-sm underline">+ 버튼 추가</button>}
        {buttons.length > 0 && <p className="text-xs text-muted-foreground">버튼이 있는 메시지는 640자까지 입력할 수 있어요.</p>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checkFollow} onChange={event => setCheckFollow(event.target.checked)} />팔로우한 사람에게만 자료 보내기</label>
        {checkFollow && <p className="text-xs text-muted-foreground">미팔로워에게는 ‘팔로우 했어요’ 버튼을 먼저 보내요. 버튼을 누르면 다시 확인하고, 팔로우가 확인된 경우에만 위 메시지를 보내요.</p>}
      </section>}
      </div>
      {comment && replyMode !== "dm_only" && <label className="block border-t border-border p-4">
        <span className="text-sm font-medium">대댓글 문구 여러 개</span>
        <p className="mt-1 text-xs text-muted-foreground">한 줄에 문구 하나씩 적어주세요. 같은 키워드에도 매번 목록에서 하나를 무작위로 골라 답장합니다.</p>
        <textarea required rows={3} value={publicReplies} onChange={event => setPublicReplies(event.target.value)} placeholder={"DM으로 보내드렸어요 💌\n메시지함을 확인해주세요 😊\n자료 보내드렸습니다!"} className={field + " mt-2"} />
      </label>}
      <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{source === "comment" ? (mediaScope === "specific" ? "선택한 게시물의 댓글에만 적용" : "전체 게시물 · 캐러셀 · 릴스 댓글에 적용") : source === "story" ? "Matches keywords in story replies" : "Matches keywords in incoming DMs"}</p>
      <button disabled={saving || !valid} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {saving && <Loader2 className="size-4 animate-spin" />}{saving ? "Saving…" : "Save reply"}
      </button>
      </div>
      {error && <p role="alert" className="px-4 pb-3 text-sm text-destructive">{error}</p>}
    </fieldset>
  </form>
}
