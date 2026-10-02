"use client"

import { useState } from "react"
import { useInstagramSession } from "@/hooks/use-instagram-session"
import { ConversationList } from "@/components/inbox/ConversationList"
import { ChatWindow } from "@/components/inbox/ChatWindow"
import { useInboxRealtime } from "@/hooks/use-inbox-realtime"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export default function InboxPage() {
    const { userId, username, isLoading } = useInstagramSession()
    const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
    const [selectedRecipientName, setSelectedRecipientName] = useState<string | null>(null)
    const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null)

    const [selectedDisplayName, setSelectedDisplayName] = useState<string | null>(null)
    const [selectedProfilePic, setSelectedProfilePic] = useState<string | null>(null)

    const [localRevision, setLocalRevision] = useState(0)

    const realtime = useInboxRealtime(userId, selectedConversationId)

    const handleSelect = (id: string, name: string, recipientId: string, displayName?: string | null, profilePic?: string | null) => {
        setSelectedConversationId(id)
        setSelectedRecipientName(name)
        setSelectedRecipientId(recipientId)
        setSelectedDisplayName(displayName || null)
        setSelectedProfilePic(profilePic || null)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
            </div>
        )
    }

    if (!userId) {
        return null
    }

    return (
        <div className="h-[calc(100%-1rem)] m-2 md:h-[calc(100%-3rem)] md:m-6 rounded-xl overflow-hidden border border-border bg-card flex relative">
            {/* Left Sidebar: Conversation List */}
            <div className={cn(
                "w-full md:w-[360px] flex-shrink-0 border-r border-border bg-card flex flex-col absolute md:static inset-0 z-10 transition-transform duration-200 md:translate-x-0 h-full",
                selectedConversationId ? "-translate-x-full md:translate-x-0" : "translate-x-0"
            )}>
                <div className="px-4 py-2 border-b flex items-center justify-between gap-2">
                    <span role="status" className="text-xs text-muted-foreground">{realtime.connected ? "실시간 연결됨" : "실시간 연결 중…"}</span>
                    <Button size="sm" variant="outline" onClick={realtime.toggleSound} aria-pressed={realtime.soundEnabled}>{realtime.soundEnabled ? (realtime.soundReady ? "알림음 끄기" : "알림음 켜짐 · 눌러서 활성화") : "알림음 켜기"}</Button>
                </div>
                <ConversationList
                    accountUsername={username}
                    userId={userId}
                    revision={realtime.listRevision + localRevision}
                    selectedId={selectedConversationId}
                    onSelect={handleSelect}
                />
            </div>

            {/* Right Main: Chat Window */}
            <div className={cn(
                "flex-1 min-w-0 min-h-0 w-full absolute md:static inset-0 z-20 bg-card transition-transform duration-200 md:translate-x-0 h-full",
                selectedConversationId ? "translate-x-0" : "translate-x-full md:translate-x-0"
            )}>
                <ChatWindow
                    revision={realtime.chatRevision}
                    onStatusChanged={() => { setSelectedConversationId(null); setLocalRevision(n => n + 1) }}
                    conversationId={selectedConversationId}
                    recipientName={selectedRecipientName}
                    recipientDisplayName={selectedDisplayName}
                    recipientProfilePic={selectedProfilePic}
                    recipientId={selectedRecipientId || undefined}
                    accountUsername={username}
                    userId={userId}
                    onBack={() => setSelectedConversationId(null)}
                />
            </div>
        </div>
    )
}
