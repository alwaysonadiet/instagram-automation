"use client"

import { useEffect, useRef, useState } from "react"
import { DEFAULT_PUBLIC_REPLIES as DEFAULT_REPLIES } from "@/lib/public-replies"
import { Loader2 } from "lucide-react"
import type { Automation, MediaItem } from "@/lib/types"

const DEFAULT_DM = "요청해주셔서 감사해요 💗\n안내 내용을 보내드려요. 확인해주세요 😊"

type Source = Automation["trigger_source"]

export function QuickAutomationForm({ userId, initialSource, onSuccess, editRule }: {
  userId: string
  initialSource: Source
  onSuccess: (source: Source) => void
  editRule?: Automation
}) {
  const existing = editRule?.response_content || {}
  const [name, setName] = useState(editRule?.name || "")
  const [delay, setDelay] = useState(String(existing.delay_seconds ?? (editRule ? 0 : 22)))
  const [randomDelay, setRandomDelay] = useState(editRule ? existing.delay_random === true : true)
  const [source, setSource] = useState<Source>(editRule?.trigger_source || initialSource)
  const [keyword, setKeyword] = useState(editRule && !["ALL", "ALL_COMMENTS", "ALL_MENTIONS", "ALL_REACTIONS"].includes(editRule.trigger_value.toUpperCase()) ? editRule.trigger_value : "")
  const [answer, setAnswer] = useState(existing.message ?? DEFAULT_DM)
  const [mediaScope, setMediaScope] = useState<"all" | "specific">(editRule?.specific_media_id ? "specific" : "all")
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(editRule?.specific_media_id ? { id: editRule.specific_media_id, caption: "저장된 게시물" } as MediaItem : null)
  const [media, setMedia] = useState<MediaItem[]>([])
  const [mediaLoaded, setMediaLoaded] = useState(false)
  const [mediaLoading, setMediaLoading] = useState(false)
  const [mediaError, setMediaError] = useState("")
  const [mediaCursor, setMediaCursor] = useState<string | null>(null)
  const mediaRequest = useRef(false)
  const mediaGrid = useRef<HTMLDivElement>(null)
  async function loadMedia(more = false) {
    if (mediaRequest.current) return
    mediaRequest.current = true
    setMediaLoading(true)
    setMediaError("")
    try {
      const response = await fetch(`/api/instagram/media?userId=${encodeURIComponent(userId)}${more && mediaCursor ? `&after=${encodeURIComponent(mediaCursor)}` : ""}`)
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || "게시물을 불러오지 못했어요.")
      setMedia(previous => more ? [...previous, ...result.data.filter((item: MediaItem) => !previous.some(value => value.id === item.id))] : result.data)
      setMediaCursor(result.next_cursor || null)
      setMediaLoaded(true)
      if (more) requestAnimationFrame(() => requestAnimationFrame(() => {
        const grid = mediaGrid.current
        grid?.children[media.length]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      }))
    } catch (error) { setMediaError(error instanceof Error ? error.message : "게시물을 불러오지 못했어요. 다시 시도해주세요.") }
    finally { mediaRequest.current = false; setMediaLoading(false) }
  }
  const [includeReplies, setIncludeReplies] = useState(editRule ? existing.include_replies === true : true)
  const [allComments, setAllComments] = useState(editRule?.trigger_type === "reply_all")
  const [replyMode, setReplyMode] = useState<"dm_only" | "public_only" | "both">(existing.reply_mode || "both")
  const [publicReplies, setPublicReplies] = useState((existing.public_replies ?? DEFAULT_REPLIES).join("\n"))
  useEffect(() => {
    if (editRule) return
    let active = true
    fetch("/api/public-reply-defaults").then(async response => {
      if (!response.ok) return
      const data = await response.json()
      if (active && Array.isArray(data.replies)) setPublicReplies(previous => previous === DEFAULT_REPLIES.join("\n") ? data.replies.join("\n") : previous)
    }).catch(() => {})
    return () => { active = false }
  }, [editRule])
  const [defaultsBusy, setDefaultsBusy] = useState(false)
  const [defaultsStatus, setDefaultsStatus] = useState("")
  const [defaultsError, setDefaultsError] = useState("")
  async function manageDefaults(saveCurrent: boolean) {
    if (defaultsBusy) return
    setDefaultsBusy(true); setDefaultsStatus(""); setDefaultsError("")
    try {
      const replies = publicReplies.split("\n").map(value => value.trim()).filter(Boolean)
      const response = await fetch("/api/public-reply-defaults", saveCurrent ? {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replies })
      } : undefined)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "기본 문구를 처리하지 못했어요.")
      if (!saveCurrent) setPublicReplies(data.replies.join("\n"))
      setDefaultsStatus(saveCurrent ? "기본 문구로 저장했어요. 새 자동화에 사용할 수 있어요." : "저장된 기본 문구를 불러왔어요.")
    } catch (error) { setDefaultsError(error instanceof Error ? error.message : "처리하지 못했어요.") }
    finally { setDefaultsBusy(false) }
  }
  const [buttons, setButtons] = useState<{ title: string; url: string }[]>((existing.buttons || []).filter(button => button.type === "web_url").map(button => ({ title: button.title, url: button.url || "" })))
  const [checkFollow, setCheckFollow] = useState(existing.check_follow === true)
  const [followGate, setFollowGate] = useState({ message: "자료를 받으려면 먼저 팔로우해주세요 💌\n팔로우 후 아래 버튼을 눌러주세요.", not_following_message: "아직 팔로우가 확인되지 않았어요. 팔로우 후 위 버튼을 다시 눌러주세요.", confirm_button: "팔로우 했어요 ✅", ...existing.follow_gate })
  const hasDM = !(source === "comment" && replyMode === "public_only")
  const buttonsValid = buttons.every(button => button.title.trim() && /^https:\/\//i.test(button.url.trim()))
  const variants = publicReplies.split("\n").map(value => value.trim()).filter(Boolean)
  const comment = source === "comment"
  const valid = (!comment || mediaScope === "all" || !!selectedMedia) && (comment && allComments || !!keyword.trim() || !!editRule && ["ALL", "ALL_MENTIONS", "ALL_REACTIONS"].includes(editRule.trigger_value.toUpperCase())) &&
    (comment && replyMode === "public_only" || !!answer.trim()) &&
    (!comment || replyMode === "dm_only" || variants.length > 0) &&
    (!hasDM || !checkFollow || !!followGate.message.trim() && !!followGate.not_following_message.trim() && !!followGate.confirm_button.trim()) &&
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
        method: editRule ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          ...(editRule ? { id: editRule.id } : {}),
          name: name.trim() || (comment && allComments ? "모든 댓글에 답장" : `Reply to ${keyword.trim() || "모든 메시지"}`),
          trigger_source: source,
          trigger_type: comment && allComments ? "reply_all" : source === "story" ? (editRule?.trigger_source === "story" ? editRule.trigger_type : "reply") : "keyword",
          trigger_value: comment && allComments ? "ALL_COMMENTS" : keyword.trim() || editRule?.trigger_value || "ALL",
          content: { ...existing, delay_seconds: Number(delay), delay_random: randomDelay, ...(hasDM ? { check_follow: checkFollow, ...(checkFollow ? { follow_gate: followGate } : {}), buttons: [...(existing.buttons || []).filter(button => button.type === "postback"), ...buttons.map(button => ({ type: "web_url", title: button.title.trim(), url: button.url.trim() }))] } : {}), message: comment && replyMode === "public_only" ? "" : answer.trim(), ...(comment ? { reply_mode: replyMode, public_replies: variants, include_replies: includeReplies } : {}) },
          specific_media_id: comment && mediaScope === "specific" ? selectedMedia?.id : null,
        }),
      })
      if (!response.ok) throw new Error("Could not save. Please try again.")
      setKeyword("")
      setAnswer(DEFAULT_DM)
      setName("")
      setDelay("22")
      setRandomDelay(true)
      setIncludeReplies(true)
      setPublicReplies(DEFAULT_REPLIES.join("\n"))
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
      <label className="block border-b border-border p-4 text-sm">워크플로우 이름<input value={name} onChange={event => setName(event.target.value)} placeholder="예: 비밀노트 자료 안내 (비워두면 자동으로 이름을 붙여요)" className={field + " mt-2"} /></label>
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
            <div ref={mediaGrid} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6 max-h-80 overflow-y-auto">
              {media.map(item => <button key={item.id} type="button" aria-pressed={selectedMedia?.id === item.id} onClick={() => setSelectedMedia(item)} className={`overflow-hidden rounded-lg border-2 text-left ${selectedMedia?.id === item.id ? "border-primary" : "border-transparent"}`}>
                {item.image_url ? <img src={item.image_url} alt={item.caption || "인스타그램 게시물"} loading="lazy" className="aspect-square w-full object-cover" /> : <div className="aspect-square bg-muted flex items-center justify-center text-xs">미리보기 없음</div>}
                <span className="block truncate p-1 text-xs">{item.media_type === "CAROUSEL_ALBUM" ? "캐러셀" : item.media_type === "VIDEO" ? "릴스 / 동영상" : "게시물"} · {item.caption || "설명 없음"}</span>
              </button>)}
            </div>
            {mediaLoading && <p role="status" className="text-xs">게시물 불러오는 중…</p>}
            {mediaError && <p role="alert" className="text-xs text-destructive">{mediaError} <button type="button" onClick={() => void loadMedia(!!mediaCursor)} className="underline">다시 시도</button></p>}
            {!mediaLoading && mediaLoaded && media.length === 0 && <p className="text-xs">선택할 게시물이 없어요.</p>}
            {mediaCursor && <button type="button" disabled={mediaLoading} onClick={() => void loadMedia(true)} className="text-sm underline">{mediaLoading ? "불러오는 중…" : "이전 게시물 더 보기"}</button>}
            <p className="text-xs text-muted-foreground">불러온 게시물 {media.length}개</p>
            <p className="text-xs text-muted-foreground">{selectedMedia ? `선택됨: ${selectedMedia.caption || "설명 없는 게시물"}` : "자동화를 적용할 게시물 하나를 선택해주세요."}</p>
          </div>}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allComments} onChange={event => setAllComments(event.target.checked)} />모든 댓글에 반응 (키워드 없이)</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={includeReplies} onChange={event => setIncludeReplies(event.target.checked)} />대댓글에도 반응하기</label>
        <label className="flex items-center gap-3 text-sm">보낼 답장
          <select value={replyMode} onChange={event => setReplyMode(event.target.value as typeof replyMode)} className={field + " max-w-56"}>
            <option value="dm_only">자동 DM만</option><option value="both">자동 DM + 대댓글</option><option value="public_only">대댓글만</option>
          </select>
        </label>
      </div>}
      <div className="grid sm:grid-cols-[1fr_2fr]">
      <label className="block border-b border-border p-4 sm:border-b-0 sm:border-r"><span className="text-xs font-medium text-muted-foreground">When they say</span>
        <input required={!(comment && allComments) && !editRule} disabled={comment && allComments} value={keyword} onChange={event => setKeyword(event.target.value)} placeholder={comment && allComments ? "어떤 댓글이든 반응합니다" : "예: 자동화, 자료"} className="mt-2 w-full rounded-sm bg-card py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </label>
      {hasDM && <section className="p-4 space-y-3" aria-label="DM 메시지와 링크 버튼">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={checkFollow} onChange={event => setCheckFollow(event.target.checked)} />팔로우 확인 후 자료 보내기</label>
        {checkFollow && <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium">1. 미팔로워에게 보낼 첫 안내 DM</p>
          <p className="text-xs text-muted-foreground">이미 팔로워면 아래 자료 DM을 바로 보내요. 미팔로워 또는 확인이 어려운 경우 이 안내를 보내고, 버튼을 누르면 다시 확인합니다.</p>
          <label className="block text-xs">안내 메시지<textarea required maxLength={640} rows={5} value={followGate.message} onChange={event => setFollowGate(previous => ({ ...previous, message: event.target.value }))} className={field + " mt-1"} /></label>
          <label className="block text-xs">팔로우 확인 버튼 이름<input required maxLength={20} value={followGate.confirm_button} onChange={event => setFollowGate(previous => ({ ...previous, confirm_button: event.target.value }))} className={field + " mt-1"} /></label>
          <p className="text-xs text-muted-foreground">버튼 클릭 → 팔로우함: 자료 DM / 팔로우 안 함: 아래 미팔로우 안내</p>
        </div>}
        <label className="block"><span className="text-xs font-medium text-muted-foreground">{checkFollow ? "2. 팔로우 확인 성공 시 자료 DM" : "Send this DM"}</span>
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

        {checkFollow && <div className="rounded-lg border border-border p-3 space-y-3">
          <p className="text-sm font-medium">3. 미팔로우 시 안내 DM</p>
          <label className="block text-xs">안내 메시지<textarea required maxLength={1000} rows={3} value={followGate.not_following_message} onChange={event => setFollowGate(previous => ({ ...previous, not_following_message: event.target.value }))} className={field + " mt-1"} /></label>
          <p className="text-xs text-muted-foreground">자료는 보내지 않아요. 팔로우한 뒤 첫 DM의 확인 버튼을 다시 누르면 다시 확인합니다. 확인 오류 시에도 자료는 보내지 않아요.</p>
        </div>}

      </section>}
      </div>
      {comment && replyMode !== "dm_only" && <section className="block border-t border-border p-4">
        <span className="text-sm font-medium">대댓글 문구 여러 개</span>
        <p className="mt-1 text-xs text-muted-foreground">한 줄에 문구 하나씩 적어주세요. 같은 키워드에도 매번 목록에서 하나를 무작위로 골라 답장합니다.</p>
        <div className="mt-2 flex flex-wrap gap-4 text-sm">
          <button type="button" disabled={defaultsBusy} onClick={() => void manageDefaults(false)} className="underline disabled:opacity-50">기본 문구 불러오기</button>
          <button type="button" disabled={defaultsBusy || !publicReplies.trim()} onClick={() => void manageDefaults(true)} className="underline disabled:opacity-50">{defaultsBusy ? "처리 중…" : "기본문구로 저장하기"}</button>
        </div>
        <p role="status" className="mt-2 text-xs text-muted-foreground">{defaultsStatus}</p>
        {defaultsError && <p role="alert" className="mt-2 text-xs text-destructive">{defaultsError}</p>}
        <textarea aria-label="대댓글 문구 여러 개" required rows={7} value={publicReplies} onChange={event => setPublicReplies(event.target.value)} placeholder={"DM으로 보내드렸어요 💌\n메시지함을 확인해주세요 😊\n자료 보내드렸습니다!"} className={field + " mt-2"} />
      </section>}
      {hasDM && <div className="border-t border-border p-4 space-y-3">
        <label className="block text-sm">DM 발송 지연<select value={delay} onChange={event => setDelay(event.target.value)} className={field + " mt-2"}>
          {[0, 3, 5, 10, 15, 22, 30, ...(![0, 3, 5, 10, 15, 22, 30].includes(Number(delay)) ? [Number(delay)] : [])].map(seconds => <option key={seconds} value={seconds}>{seconds === 0 ? "즉시 발송" : `${seconds}초`}</option>)}
        </select></label>
        {Number(delay) > 0 && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={randomDelay} onChange={event => setRandomDelay(event.target.checked)} />무작위 지연 (1~{delay}초)</label>}
      </div>}
      <div className="flex items-center justify-between gap-4 border-t border-border px-4 py-3">
      <p className="text-xs text-muted-foreground">{source === "comment" ? (mediaScope === "specific" ? "선택한 게시물의 댓글에만 적용" : "전체 게시물 · 캐러셀 · 릴스 댓글에 적용") : source === "story" ? "Matches keywords in story replies" : "Matches keywords in incoming DMs"}</p>
      <button disabled={saving || !valid} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {saving && <Loader2 className="size-4 animate-spin" />}{saving ? "Saving…" : editRule ? "수정 저장" : "자동화 저장"}
      </button>
      </div>
      {error && <p role="alert" className="px-4 pb-3 text-sm text-destructive">{error}</p>}
    </fieldset>
  </form>
}
