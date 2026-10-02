"use client"

import { useEffect, useState } from "react"
import { UserCircle } from "lucide-react"
import { cn } from "@/lib/utils"

export function RecipientAvatar({ url, name, className }: { url?: string | null; name?: string | null; className?: string }) {
    const [failed, setFailed] = useState(false)
    useEffect(() => setFailed(false), [url])
    return (
        <div className={cn("rounded-full bg-muted border border-border flex items-center justify-center shrink-0 overflow-hidden", className)}>
            {url && !failed ? (
                <img src={url} alt={name ? `${name} 프로필 사진` : "프로필 사진"} className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} />
            ) : <UserCircle className="w-2/3 h-2/3 text-muted-foreground" />}
        </div>
    )
}
