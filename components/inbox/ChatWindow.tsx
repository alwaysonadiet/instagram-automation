"use client"

import { useEffect, useState, useRef } from "react"
import { Send, Loader2, MoreVertical, Phone, Video, Zap, ChevronLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { RecipientAvatar } from "./RecipientAvatar"
import type { Message } from "@/types/db"

interface ChatWindowProps {
    onStatusChanged?: () => void
    revision?: number
    conversationId: string | null
    recipientId?: string
    recipientDisplayName?: string | null
    recipientProfilePic?: string | null
    recipientName: string | null
    userId: string
    onBack?: () => void
}

export function ChatWindow({ conversationId, recipientId, recipientName, recipientDisplayName, recipientProfilePic, userId, onBack, revision = 0, onStatusChanged }: ChatWindowProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [loading, setLoading] = useState(false)
    const [inputText, setInputText] = useState("")
    const [sending, setSending] = useState(false)
    const [closing, setClosing] = useState(false)
    const [closeError, setCloseError] = useState("")
    const changeStatus = async () => {
        if (!conversationId || closing) return
        setClosing(true); setCloseError("")
        try {
            const result = await fetch(`/api/inbox/conversations?conversationId=${encodeURIComponent(conversationId)}`, { method: "DELETE" })
            if (!result.ok) throw new Error("Failed")
            onStatusChanged?.()
        } catch { setCloseError("대화를 닫지 못했습니다. 다시 시도해 주세요.") }
        finally { setClosing(false) }
    }
    const [isAutomationOpen, setIsAutomationOpen] = useState(false)
    const [automations, setAutomations] = useState<any[]>([])
    const activeConversation = useRef(conversationId)
    activeConversation.current = conversationId
    const loadedConversation = useRef<string | null>(null)
    const messagesRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!conversationId) return
        const controller = new AbortController()

        const fetchMessages = async () => {
            if (loadedConversation.current !== conversationId) {
                setLoading(true)
                setMessages([])
            }
            try {
                const res = await fetch(`/api/inbox/messages?conversationId=${conversationId}`, { signal: controller.signal, cache: "no-store" })
                const data = await res.json()
                if (!controller.signal.aborted && Array.isArray(data)) {
                    loadedConversation.current = conversationId
                    setMessages(data)
                }
            } catch (error) {
                if (!controller.signal.aborted) console.error("Failed to load messages", error)
            } finally {
                if (!controller.signal.aborted) setLoading(false)
            }
        }

        fetchMessages()
        return () => controller.abort()
    }, [conversationId, revision])

    // Fetch automations for quick reply
    useEffect(() => {
        if (userId) {
            fetch(`/api/automations?userId=${userId}`).then(res => res.json()).then(data => {
                if (Array.isArray(data)) setAutomations(data)
            })
        }
    }, [userId])

    useEffect(() => {
        const container = messagesRef.current
        container?.scrollTo({ top: container.scrollHeight, behavior: "smooth" })
    }, [messages])

    const handleSendMessage = async (text: string = inputText) => {
        if (!text.trim() || !recipientId || !userId) return

        setSending(true)
        try {
            const res = await fetch("/api/inbox/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    userId,
                    recipientId,
                    message: text
                })
            })

            if (res.ok) {
                setInputText("")
                const result = await res.json()
                // Realtime may already have fetched this row: use the stored ID to avoid duplicates.
                if (result.savedMessage) {
                    const stored: Message = result.savedMessage
                    if (stored.conversation_id === activeConversation.current) {
                        setMessages(prev => prev.some(msg => msg.id === stored.id) ? prev : [...prev, stored].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)))
                    }
                }

            }
        } catch (e) {
            console.error("Send failed", e)
        } finally {
            setSending(false)
            setIsAutomationOpen(false)
        }
    }

    if (!conversationId) {
        return (
            <div className="flex-1 flex items-center justify-center flex-col gap-4 text-center bg-card h-full">
                <div className="w-16 h-16 rounded-full bg-muted border border-border flex items-center justify-center">
                    <Send className="w-6 h-6 text-muted-foreground" />
                </div>
                <div>
                    <h3 className="text-lg font-semibold text-foreground">Your conversations</h3>
                    <p className="text-muted-foreground text-sm max-w-xs mx-auto mt-2">
                        Select a conversation from the left to start chatting live with your audience.
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex-1 min-h-0 min-w-0 flex flex-col h-full bg-card relative">
            {/* Header */}
            <div className="min-h-16 border-b border-border flex items-center justify-between gap-2 px-3 py-2 md:px-6 bg-card shrink-0">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    {onBack && (
                        <Button variant="ghost" size="icon" onClick={onBack} className="md:hidden -ml-2 text-muted-foreground">
                            <ChevronLeft className="w-6 h-6" />
                        </Button>
                    )}
                    <RecipientAvatar url={recipientProfilePic} name={recipientDisplayName || recipientName} className="w-10 h-10" />
                    <div className="min-w-0">
                        <h3 className="font-bold text-foreground text-sm truncate">
                            {recipientName && /^[A-Za-z0-9._]+$/.test(recipientName) ? (
                                <a href={`https://ig.me/m/${encodeURIComponent(recipientName)}`} target="_blank" rel="noopener noreferrer" className="hover:underline" aria-label={`@${recipientName} 인스타 DM 열기`} title="대화를 나눈 인스타 계정으로 전환한 후 열어주세요">@{recipientName}</a>
                            ) : <>@{recipientName}</>}
                        </h3>
                        {recipientDisplayName && <p className="text-xs text-muted-foreground truncate">{recipientDisplayName}</p>}

                    </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" disabled={closing} onClick={changeStatus} title="이 앱의 대화 기록을 삭제합니다. 인스타 원본은 유지됩니다.">{closing ? "처리 중…" : "닫기 · 기록 삭제"}</Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hidden md:flex" aria-label="Call"><Phone className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground hidden md:flex" aria-label="Video"><Video className="w-4 h-4" /></Button>
                    {recipientName && /^[A-Za-z0-9._]+$/.test(recipientName) && (
                        <Button variant="ghost" size="icon" asChild>
                            <a href={`https://www.instagram.com/${encodeURIComponent(recipientName)}/`} target="_blank" rel="noopener noreferrer" aria-label="인스타 프로필 보기" title="인스타 프로필 보기">
                                <MoreVertical className="w-4 h-4" />
                            </a>
                        </Button>
                    )}
                </div>
            </div>

            {closeError && <p role="alert" className="px-4 py-2 text-sm text-destructive">{closeError}</p>}
            {/* Messages Area */}
            <div ref={messagesRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 md:p-6 space-y-4 md:space-y-6">
                {loading ? (
                    <div className="flex justify-center py-10">
                        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
                    </div>
                ) : (
                    messages.map((msg) => {
                        const isMe = !msg.is_from_instagram
                        return (
                            <div key={msg.id} className={cn("flex w-full", isMe ? "justify-end" : "justify-start")}>
                                <div className={cn(
                                    "max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 text-sm break-words",
                                    isMe
                                        ? "bg-primary text-primary-foreground rounded-br-none"
                                        : "bg-muted text-foreground rounded-bl-none border border-border"
                                )}>
                                    {msg.attachments?.filter(a => a.type === "story_reply").map((story, index) => (
                                        <div key={`story-${index}`} className="mb-2 rounded-lg border border-border p-2 text-xs">
                                            <p className="mb-1 font-semibold">스토리에 대한 답장</p>
                                            {story.url && /^https:\/\//i.test(story.url) ? (
                                                <a href={story.url} target="_blank" rel="noopener noreferrer" className="underline">
                                                    <img src={story.url} alt="답장한 스토리 미리보기" referrerPolicy="no-referrer" loading="lazy" className="max-h-36 rounded mb-1" onError={e => { e.currentTarget.style.display = "none" }} />
                                                    답장한 스토리 보기 ↗
                                                </a>
                                            ) : <p className="text-muted-foreground">원본 스토리 링크가 전달되지 않았습니다.</p>}
                                            <p className="mt-1 text-muted-foreground">스토리가 만료되면 원본을 볼 수 없을 수 있습니다.</p>
                                        </div>
                                    ))}
                                    {/^ACT::[a-zA-Z0-9_-]+$/.test(msg.content || "") ? "[자동화 버튼 클릭]" : msg.content}
                                    {msg.attachments?.filter(a => a.type !== "story_reply").map((attachment, index) => attachment.url && /^https:\/\//i.test(attachment.url) ? (
                                        <div key={index} className="mt-2">
                                            {attachment.type === "image" ? (
                                                <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                                                    <img src={attachment.url} alt="받은 사진" loading="lazy" referrerPolicy="no-referrer" className="max-h-80 rounded-lg object-contain" />
                                                </a>
                                            ) : attachment.type === "video" ? (
                                                <video src={attachment.url} controls preload="none" className="max-h-80 rounded-lg" />
                                            ) : attachment.type === "audio" ? (
                                                <audio src={attachment.url} controls preload="none" />
                                            ) : (
                                                <a href={attachment.url} target="_blank" rel="noopener noreferrer" className="underline">첨부파일 열기</a>
                                            )}
                                        </div>
                                    ) : null)}
                                    <div className={cn(
                                        "text-[10px] mt-1 opacity-70",
                                        isMe ? "text-primary-foreground/70 text-right" : "text-muted-foreground"
                                    )}>
                                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        )
                    })
                )}

            </div>

            {/* Automation Popup */}
            {isAutomationOpen && (
                <div className="absolute bottom-20 left-4 right-4 md:left-auto md:right-4 md:w-80 bg-popover border border-border rounded-xl shadow-lg p-2 z-50">
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Quick Responses</div>
                    <div className="max-h-60 overflow-y-auto space-y-1">
                        {automations.map(auto => (
                            <button
                                key={auto.id}
                                onClick={() => handleSendMessage(auto.response_content?.message || auto.name)}
                                className="w-full text-left px-3 py-2 rounded-lg hover:bg-accent text-sm text-popover-foreground transition-colors flex items-center gap-2"
                            >
                                <Zap className="w-3 h-3 text-accent-yellow-foreground dark:text-accent-yellow" />
                                <span className="truncate">{auto.name}</span>
                            </button>
                        ))}
                        {automations.length === 0 && (
                            <div className="px-3 py-4 text-center text-muted-foreground text-xs">No automations found.</div>
                        )}
                    </div>
                </div>
            )}

            {/* Input Area */}
            <div className="p-3 md:p-4 border-t border-border bg-card shrink-0">
                <div className="flex items-center gap-2 bg-muted rounded-xl border border-border p-1.5 focus-within:border-accent-yellow focus-within:ring-2 focus-within:ring-accent-yellow/30 transition-all">
                    <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setIsAutomationOpen(!isAutomationOpen)}
                        aria-label="Toggle quick responses"
                        className={cn(
                            "h-9 w-9 hover:bg-accent text-muted-foreground hover:text-accent-yellow-foreground dark:hover:text-accent-yellow transition-colors shrink-0",
                            isAutomationOpen && "text-foreground bg-accent"
                        )}
                    >
                        <Zap className="w-5 h-5" />
                    </Button>
                    <input
                        className="flex-1 bg-muted px-3 py-2 text-sm text-foreground focus:outline-none placeholder:text-muted-foreground min-w-0"
                        placeholder="Type a message..."
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !sending) {
                                e.preventDefault()
                                handleSendMessage()
                            }
                        }}
                        disabled={sending}
                    />
                    <Button
                        onClick={() => handleSendMessage()}
                        disabled={sending || !inputText.trim()}
                        size="icon"
                        aria-label="Send message"
                        className="h-9 w-9 bg-primary text-primary-foreground hover:opacity-90 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                </div>
            </div>
        </div>
    )
}
