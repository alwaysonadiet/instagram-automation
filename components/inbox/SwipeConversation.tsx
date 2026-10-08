"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"
import { Mail, MailOpen } from "lucide-react"

export function SwipeConversation({ children, disabled, onUnread, onRead, onLongPress }: {
  children: ReactNode; disabled: boolean; onUnread: () => void; onRead: () => void; onLongPress: () => void
}) {
  const [offset, setOffset] = useState(0)
  const [ready, setReady] = useState(false)
  const gesture = useRef<{ x: number; y: number; dx: number; width: number; threshold: number; horizontal: boolean; vertical: boolean } | null>(null)
  const suppressClick = useRef(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const held = useRef(false)
  function cancelHold() { if (holdTimer.current) clearTimeout(holdTimer.current); holdTimer.current = null }
  useEffect(() => () => { if (holdTimer.current) clearTimeout(holdTimer.current) }, [])
  function finish(cancelled = false) {
    cancelHold()
    const current = gesture.current
    gesture.current = null
    setOffset(0); setReady(false)
    if (!current?.horizontal) return
    suppressClick.current = true
    if (!cancelled && !disabled && Math.abs(current.dx) >= current.threshold) {
      if (current.dx > 0) onUnread()
      else onRead()
    }
  }
  return <div className="relative overflow-hidden rounded-lg" style={{ touchAction: "pan-y" }}
      onPointerDownCapture={event => {
        if (!event.currentTarget.contains(event.target as Node)) return
        cancelHold()
        held.current = false
        if (disabled || event.pointerType !== "touch" || (event.target as HTMLElement).closest("button")) return
        event.stopPropagation()
        suppressClick.current = false
        const width = event.currentTarget.clientWidth
        gesture.current = { x: event.clientX, y: event.clientY, dx: 0, width, threshold: Math.min(160, Math.max(80, width * 0.4)), horizontal: false, vertical: false }
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null
          gesture.current = null
          held.current = true
          suppressClick.current = true
          onLongPress()
        }, 550)
      }}
      onPointerMove={event => {
        const current = gesture.current
        if (!current || current.vertical) return
        const dx = event.clientX - current.x, dy = event.clientY - current.y
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelHold()
        if (!current.horizontal) {
          if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { current.vertical = true; return }
          if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.3) return
          current.horizontal = true
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        current.dx = dx
        setOffset(Math.max(-current.width, Math.min(current.width, dx)))
        setReady(Math.abs(dx) >= current.threshold)
      }}
      onPointerUp={() => finish()} onPointerCancel={() => finish(true)} onLostPointerCapture={event => { if (event.target === event.currentTarget) finish(true) }}
      onContextMenuCapture={event => { if (held.current || gesture.current) { event.preventDefault(); event.stopPropagation() } }}
      onClickCapture={event => {
        if (suppressClick.current && event.currentTarget.contains(event.target as Node)) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false }
      }}>
    <div aria-hidden="true" className={`pointer-events-none absolute inset-0 flex items-center px-6 gap-2 text-sm text-white ${offset >= 0 ? "bg-blue-600 justify-start" : "bg-emerald-600 justify-end"}`}>
      {offset >= 0 ? <Mail className="size-5" /> : <MailOpen className="size-5" />}
      <span>{ready ? (offset >= 0 ? "놓으면 읽지 않음" : "놓으면 읽음") : (offset >= 0 ? "읽지 않음" : "읽음")}</span>
    </div>
    <div className="relative bg-card" style={{ transform: `translate3d(${offset}px, 0, 0)`, willChange: "transform" }}>
      {children}
    </div>
  </div>
}
