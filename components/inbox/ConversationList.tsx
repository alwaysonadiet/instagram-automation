"use client"

import { useEffect, useState } from "react"
import { Search, Loader2, MoreVertical, Mail, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu"
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"
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
    const [conversations, setConversations] = useState<Conversation[]>([])
    const [loading, setLoading] = useState(true)

    const [busyId, setBusyId] = useState<string | null>(null)
    const [actionError, setActionError] = useState("")
    const [menuId, setMenuId] = useState<string | null>(null)
    async function act(conv: Conversation, action: "unread" | "close") {
        if (busyId) return
        setBusyId(conv.id); setActionError("")
        try {
            const response = await fetch(action === "close" ? `/api/inbox/conversations?conversationId=${encodeURIComponent(conv.id)}` : "/api/inbox/conversations", {
                method: action === "close" ? "DELETE" : "PATCH",
                ...(action === "unread" ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId: conv.id, isUnread: true }) } : {}),
            })
            if (!response.ok) throw new Error()
            setConversations(previous => action === "close" ? previous.filter(value => value.id !== conv.id) : previous.map(value => value.id === conv.id ? { ...value, is_unread: true } : value))
            onActionCompleted?.(conv.id)
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
                    setConversations(data)
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
                        placeholder="Search messages..."
                    />
                </div>
            </div>

            {actionError && <p role="alert" className="px-4 py-2 text-sm text-destructive">{actionError}</p>}
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {conversations.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground text-sm">
                        진행 중인 대화가 없습니다.
                    </div>
                ) : (
                    conversations.map((conv) => (
                        <ContextMenu key={conv.id} onOpenChange={open => setMenuId(open ? conv.id : null)}>
                        <ContextMenuTrigger asChild>
                        <div
                            role="button" tabIndex={0}
                            onKeyDown={event => { if (event.target !== event.currentTarget) return; if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(conv.id, conv.recipient_username, conv.recipient_id, conv.recipient_display_name, conv.recipient_profile_pic) } }}
                            onClick={() => { if (!menuId && !busyId) onSelect(conv.id, conv.recipient_username, conv.recipient_id.toString(), conv.recipient_display_name, conv.recipient_profile_pic) }}
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
                                    {conv.is_unread && <span className="size-2 rounded-full bg-blue-500 shrink-0 mx-2" role="img" aria-label="읽지 않은 메시지" title="읽지 않음" />}
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                                        {dateLabel(conv.last_message_at)}
                                    </span>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">
                                    {conv.recipient_display_name || "대화 보기"}
                                </p>
                            </div>
                            <DropdownMenu>
                                <DropdownMenuTrigger asChild><button type="button" aria-label={`@${conv.recipient_username} 대화 메뉴`} onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} className="p-2 shrink-0 rounded hover:bg-muted"><MoreVertical className="size-4" /></button></DropdownMenuTrigger>
                                <DropdownMenuContent onClick={event => event.stopPropagation()}>
                                    <DropdownMenuItem disabled={!!busyId} onSelect={() => void act(conv, "unread")}><Mail />읽지 않음으로 표시</DropdownMenuItem>
                                    <DropdownMenuItem disabled={!!busyId} onSelect={() => void act(conv, "close")}><X />대화 닫기 · 기록 삭제</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>

                        </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent onClick={event => event.stopPropagation()}>
                            <ContextMenuItem disabled={!!busyId} onSelect={() => void act(conv, "unread")}><Mail className="size-4 mr-2" />읽지 않음으로 표시</ContextMenuItem>
                            <ContextMenuItem disabled={!!busyId} onSelect={() => void act(conv, "close")}><X className="size-4 mr-2" />대화 닫기 · 기록 삭제</ContextMenuItem>
                        </ContextMenuContent>
                        </ContextMenu>
                    ))
                )}
            </div>
        </div>
    )
}
