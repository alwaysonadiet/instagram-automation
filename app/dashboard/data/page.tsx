"use client"
import { uploadHistoryBatch } from "@/lib/history/upload"
import { HistoryArchive } from "@/components/history/HistoryArchive"
import { intelligenceFetch } from "@/lib/intelligence/client"
import { useEffect, useRef, useState } from "react"
import { readHistoryFile } from "@/lib/history/archive"
import { decodeMetaText, normaliseExport, type HistoryMessage } from "@/lib/history/normalise"

export default function DataPage() {
  const [revision, setRevision] = useState(0)
  const [ownerNames, setOwnerNames] = useState("")
  const [files, setFiles] = useState<{ path: string; data: unknown; messages: HistoryMessage[] }[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [error, setError] = useState("")
  const fileInput = useRef<HTMLInputElement>(null)
  useEffect(() => { let active = true; intelligenceFetch("/api/history/config").then(data => { if (active) setOwnerNames((data.settings.owner_names || []).join("\n")) }).catch(() => {}); return () => { active = false } }, [])
  const names = ownerNames.split("\n").map(v => v.trim()).filter(Boolean)
  async function preview(file?: File) {
    if (!file || busy) return
    setBusy(true); setError(""); setFiles([]); setStatus("메시지 파일을 읽고 있어요…")
    try {
      const entries = await readHistoryFile(file)
      const parsed = []
      for (const entry of entries) parsed.push({ ...entry, messages: await normaliseExport(entry.data, entry.path, names) })
      setFiles(parsed); setStatus("미리보기가 준비됐어요. 내보내기에 표시된 내 이름을 확인한 뒤 저장하세요.")
    } catch (e) { setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다."); setStatus("") }
    finally { setBusy(false); if (fileInput.current) fileInput.current.value = "" }
  }
  async function save() {
    setBusy(true); setError("")
    let inserted = 0, duplicates = 0, processed = 0
    const started = Date.now()
    const total = files.reduce((n, f) => n + f.messages.length, 0)
    const progress = () => { const seconds = (Date.now() - started) / 1000; const eta = processed ? Math.ceil(seconds / processed * (total - processed)) : null; setStatus(`원문 저장 ${processed.toLocaleString()} / ${total.toLocaleString()}개 (${Math.round(processed / total * 100)}%) · 신규 ${inserted.toLocaleString()} · 중복 ${duplicates.toLocaleString()} · 경과 ${Math.round(seconds)}초 · 남은 시간 ${eta === null ? "계산 중" : eta + "초"}`) }
    try {
      for (const entry of files) {
        const messages = await normaliseExport(entry.data, entry.path, names)
        const metadata = entry.data as Record<string, unknown>
        for (let offset = 0; offset < messages.length; offset += 10) {
          const batch = messages.slice(offset, offset + 10)
          const result = await uploadHistoryBatch({
            sourcePath: entry.path, ownerNames: names, occurrences: batch.map(m => m.occurrence),
            data: { ...metadata, messages: batch.map(m => m.original) },
          }, attempt => setStatus(`연결 재시도 ${attempt}/4 · ${processed.toLocaleString()} / ${total.toLocaleString()}개 처리됨`))
          inserted += result.inserted; duplicates += result.duplicates
          processed += batch.length; progress()
        }
      }
      setRevision(v => v + 1)
      setStatus(`완료: ${inserted.toLocaleString()}개 저장 · ${duplicates.toLocaleString()}개 중복 건너뜀`)
    } catch (e) {
      setError(`${e instanceof Error ? e.message : "저장하지 못했습니다."} 이미 저장된 메시지는 유지됩니다. 같은 파일로 다시 시도할 수 있어요.`)
    } finally { setRevision(v => v + 1); setBusy(false) }
  }
  async function correctDirections() {
    if (!names.length || busy) return
    setBusy(true); setError("")
    try {
      const response = await fetch("/api/history/direction", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerNames: names }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setStatus(`저장된 ${Number(result.updated).toLocaleString()}개 메시지의 발신 방향을 다시 구분했어요. 원문은 그대로 유지됩니다.`)
      setRevision(v => v + 1)
    } catch (e) { setError(e instanceof Error ? e.message : "수정하지 못했어요.") }
    finally { setBusy(false) }
  }
  const total = files.reduce((n, f) => n + f.messages.length, 0)
  const participants = Array.from(new Set(files.flatMap(f => f.messages.flatMap(m => m.participants.map(decodeMetaText)))))
  return <div className="mx-auto max-w-4xl space-y-6 p-6">
    <div><h1 className="text-3xl font-semibold">Data</h1><p className="mt-2 text-muted-foreground">과거 Instagram DM을 원문 그대로 보관합니다.</p></div>
    <section className="space-y-4 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Import Instagram History</h2>
      <p className="text-sm text-muted-foreground">Instagram 내보내기에서 Messages · 전체 기간 · JSON을 선택하세요. ZIP의 미디어는 업로드하지 않고 파일 참조만 보관합니다.</p>
      <label className="block text-sm">내보내기에 표시된 내 이름 (이전 이름이 있다면 한 줄에 하나씩)
        <textarea className="mt-2 block w-full rounded-lg border bg-background p-3" value={ownerNames} onChange={e => setOwnerNames(e.target.value)} rows={2} disabled={busy} />
      </label>
      <button type="button" disabled={busy || !names.length} onClick={() => void correctDirections()} className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">이 이름으로 저장된 메시지 발신 방향 수정</button>
      <div className="rounded-lg border-2 border-dashed p-8 text-center" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void preview(e.dataTransfer.files[0]) }}>
        <label className="cursor-pointer">ZIP 또는 JSON 선택 / 여기에 놓기<input ref={fileInput} type="file" accept=".zip,.json" className="sr-only" disabled={busy} onChange={e => void preview(e.target.files?.[0])} /></label>
      </div>
      <p className="text-sm" role="status" aria-live="polite">{status}</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {total > 0 && <><p>{files.length}개 파일 · {total.toLocaleString()}개 메시지</p>
        <p className="text-sm text-muted-foreground">참여자 이름 예시: {participants.slice(0, 10).join(", ")}</p>
        <div className="space-y-2 rounded-lg bg-muted p-3">{files.flatMap(f => f.messages).slice(0, 5).map(m => <div key={`${m.sourcePath}:${m.key}`} className="text-sm"><p className="text-xs text-muted-foreground">{decodeMetaText(m.sender)} · {m.timestamp}</p><p className="whitespace-pre-wrap break-words">{m.displayText || "[첨부파일 또는 시스템 이벤트]"}</p></div>)}</div>
        <p className="text-sm">내 이름을 확인할 수 없으면 발신 방향은 미확인으로 저장됩니다. 고객 ID 연결 전까지 원문 보관함에 저장하며, 자동화는 실행하지 않습니다.</p>
        <button className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy} onClick={() => void save()}>{busy ? "처리 중…" : "원문 저장"}</button>
      </>}
    </section>
    <HistoryArchive revision={revision} />
  </div>
}
