"use client"

import { useEffect, useState, useRef } from "react"
import { Search, Loader2, MoreVertical, Mail, MailOpen, Pin, PinOff, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
import { SwipeConversation } from "./SwipeConversation"
import { RecipientAvatar } from "./RecipientAvatar"
import type { Conversation } from "@/types/db"

interface ConversationListProps {
    onActionCompleted?: (id: string) => void
    revision?: number
    userId: string
    selectedId: string | null
    onSelect: (id: string, username: string, recipientId: string, displayName?: string | null, profilePic?: string | null) => void
}

export function ConversationList({ onActionCompleted, userId, selectedId, onSelect, revision = 0 }: ConversationListProps) {
    const profiles = useRef(new Map<string, Partial<Conversation>>())
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loading, setLoading] = useState(true)
    const [search, setSearch] = useState("")
    const query = search.trim().replace(/^@/, "").normalize("NFKC").toLocaleLowerCase()
    const visibleConversations = [...conversations].sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned) || Date.parse(b.last_message_at) - Date.parse(a.last_message_at)).filter(conv => !query || [conv.recipient_username, conv.recipient_display_name, conv.last_message_preview].some(value => (value || "").normalize("NFKC").toLocaleLowerCase().includes(query)))

    const [busyId, setBusyId] = useState<string | null>(null)
    const [actionError, setActionError] = useState("")
    const [menuId, setMenuId] = useState<string | null>(null)
    const [dropdownId, setDropdownId] = useState<string | null>(null)
    async function act(conv: Conversation, action: "read" | "unread" | "close" | "pin") {
        if (busyId) return
        if (action === "close" && !window.confirm(`@${conv.recipient_username} 대화를 삭제할까요? 이 앱의 메시지 기록만 삭제되며 인스타그램 원본 DM은 그대로 남아요.`)) return
        setBusyId(conv.id); setActionError("")
        try {
            const response = await fetch(action === "close" ? `/api/inbox/conversations?conversationId=${encodeURIComponent(conv.id)}` : "/api/inbox/conversations", {
                method: action === "close" ? "DELETE" : "PATCH",
                ...(action !== "close" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "pin" ? { conversationId: conv.id, isPinned: !conv.is_pinned } : { conversationId: conv.id, isUnread: action === "unread", ...(action === "read" ? { readThrough: conv.last_incoming_at || conv.last_message_at } : {}) }) } : {}),
            })
            if (!response.ok) throw new Error()
            const result = await response.json()
            setConversations(previous => action === "close" ? previous.filter(value => value.id !== conv.id) : previous.map(value => value.id === conv.id ? action === "pin" ? { ...value, is_pinned: result.isPinned } : { ...value, is_unread: action === "unread" || (result.changed === false && value.is_unread) } : value))
            if (action !== "pin") onActionCompleted?.(conv.id)
        } catch { setActionError("변경하지 못했어요. 다시 시도해주세요.") }
        finally { setBusyId(null) }
    }
    function dateLabel(value: string) {
        const date = new Date(value)
        if (!Number.isFinite(date.getTime())) return ""
        const today = new Date()
        const yesterday = new Date(today)
        yesterday.setDate(today.getDate() - 1)
        if (date.toDateString() === today.toDateString()) return "오늘"
        if (date.toDateString() === yesterday.toDateString()) return "어제"
        return date.toLocaleDateString("ko-KR", { year: "numeric", month: "numeric", day: "numeric" })
    }

    useEffect(() => {
        if (!userId) return
        const controller = new AbortController()

        const fetchConversations = async () => {
            try {
                const res = await fetch(`/api/inbox/conversations?userId=${userId}`, { signal: controller.signal, cache: "no-store" })
                const data = await res.json()
                if (!controller.signal.aborted && Array.isArray(data)) {
                    setConversations(data.map(conv => ({ ...conv, ...profiles.current.get(String(conv.recipient_id)) })))
                    setLoading(false)
                    // Profiles never block the first list paint. Retain them across push refreshes.
                    const missing = data.filter(conv => !profiles.current.has(String(conv.recipient_id)))
                    for (let offset = 0; offset < missing.length && !controller.signal.aborted; offset += 8) {
                        const ids = missing.slice(offset, offset + 8).map(conv => conv.recipient_id).join(",")
                        const response = await fetch(`/api/inbox/conversations?userId=${encodeURIComponent(userId)}&profiles=${encodeURIComponent(ids)}`, { signal: controller.signal, cache: "no-store" })
                        if (!response.ok) continue
                        const details = await response.json()
                        if (!Array.isArray(details) || controller.signal.aborted) continue
                        details.forEach(profile => profiles.current.set(String(profile.recipient_id), profile))
                        setConversations(previous => previous.map(conv => ({ ...conv, ...profiles.current.get(String(conv.recipient_id)) })))
                    }
                }
            } catch (error) {
                if (!controller.signal.aborted) console.error("Failed to load conversations", error)
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        fetchConversations()
        return () => controller.abort()
    }, [userId, revision])

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
        )
    }

    return (
        <div className="flex flex-col flex-1 min-h-0 border-r border-border bg-card w-full md:w-[350px]">
            <div className="p-4 border-b border-border">
                <h2 className="text-lg font-semibold text-foreground mb-4">메시지함</h2>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        className="w-full bg-background border border-input rounded-xl pl-10 pr-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-colors"
                        aria-label="대화 검색"
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="아이디, 이름, 최근 메시지 검색…"
                    />
                </div>
            </div>

            {actionError && <p role="alert" className="px-4 py-2 text-sm text-destructive">{actionError}</p>}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {visibleConversations.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                        {query ? "검색 결과가 없어요." : "진행 중인 대화가 없습니다."}
                    </div>
                ) : (
                    visibleConversations.map((conv) => (
                        <SwipeConversation key={conv.id} disabled={!!busyId} onLongPress={() => setDropdownId(conv.id)} onUnread={() => void act(conv, "unread")} onRead={() => void act(conv, "read")}>
                        <ContextMenu onOpenChange={open => setMenuId(open ? conv.id : null)}>
                        <ContextMenuTrigger asChild>
                        <div
                            role="button" tabIndex={0}
                            onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(conv.id, conv.recipient_username, conv.recipient_id, conv.recipient_display_name, conv.recipient_profile_pic) } }}
                            onClick={() => { if (!menuId && !dropdownId && !busyId) onSelect(conv.id, conv.recipient_username, conv.recipient_id.toString(), conv.recipient_display_name, conv.recipient_profile_pic) }}
                            className={cn(
                                "select-none [-webkit-touch-callout:none] p-3 rounded-lg flex items-center gap-3 cursor-pointer transition-colors border border-transparent",
                                selectedId === conv.id
                                    ? "bg-accent border-border"
                                    : "hover:bg-accent hover:border-border"
                            )}
                        >
                            <RecipientAvatar url={conv.recipient_profile_pic} name={conv.recipient_display_name || conv.recipient_username} className="w-12 h-12" />
                            <div className="flex-1 min-w-0 text-left">
                                <div className="flex items-center justify-between mb-0.5">
                                    <span className={cn(
                                        conv.is_unread ? "font-bold text-sm truncate" : "font-normal text-sm truncate",
                                        selectedId === conv.id ? "text-accent-yellow-foreground dark:text-accent-yellow" : "text-foreground"
                                    )}>
                                        @{conv.recipient_username}
                                    </span>
                                    {conv.is_pinned && <Pin className="size-3 shrink-0 mx-1 text-primary" aria-label="고정된 대화" />}
                                    {conv.is_unread && <span className="size-2 rounded-full bg-blue-500 shrink-0 mx-2" role="img" aria-label="읽지 않은 메시지" title="읽지 않음" />}
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                        {dateLabel(conv.last_message_at)}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                    {conv.last_message_preview || conv.recipient_display_name || "대화 보기"}
                                </p>
                            </div>
                            <DropdownMenu open={dropdownId === conv.id} onOpenChange={open => setDropdownId(open ? conv.id : null)}>
                                <DropdownMenuTrigger asChild><button type="button" aria-label={`@${conv.recipient_username} 대화 메뉴`} onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} className="p-2 shrink-0 rounded hover:bg-muted"><MoreVertical className="size-4" /></button></DropdownMenuTrigger>
                                <DropdownMenuContent onClick={event => event.stopPropagation()}>
                                    <DropdownMenuItem disabled={!!busyId} onSelect={() => void act(conv, "pin")}>{conv.is_pinned ? <PinOff /> : <Pin />}{conv.is_pinned ? "고정 해제" : "상단 고정"}</DropdownMenuItem>
                                    <DropdownMenuItem disabled={!!busyId} onSelect={() => void act(conv, "read")}><MailOpen />읽음으로 표시</DropdownMenuItem>
                                    <DropdownMenuItem disabled={!!busyId} onSelect={() => void act(conv, "unread")}><Mail />읽지 않음으로 표시</DropdownMenuItem>
                                    <DropdownMenuItem disabled={!!busyId} onSelect={() => void act(conv, "close")}><X />대화 닫기 · 기록 삭제</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                        </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent onClick={event => event.stopPropagation()}>
                            <ContextMenuItem disabled={!!busyId} onSelect={() => void act(conv, "pin")}>{conv.is_pinned ? <PinOff className="size-4 mr-2" /> : <Pin className="size-4 mr-2" />}{conv.is_pinned ? "고정 해제" : "상단 고정"}</ContextMenuItem>
                            <ContextMenuItem disabled={!!busyId} onSelect={() => void act(conv, "unread")}><Mail className="size-4 mr-2" />읽지 않음으로 표시</ContextMenuItem>
                            <ContextMenuItem disabled={!!busyId} onSelect={() => void act(conv, "close")}><X className="size-4 mr-2" />대화 닫기 · 기록 삭제</ContextMenuItem>
                        </ContextMenuContent>
                        </ContextMenu>
                        </SwipeConversation>
                    ))
                )}
            </div>
        </div>
    )
}
