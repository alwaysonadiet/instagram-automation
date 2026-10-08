"use client"

import { useState, type ReactNode } from "react"
import { Copy } from "lucide-react"

export function CopyableMessage({ text, children, className }: { text: string; children: ReactNode; className: string }) {
    const [status, setStatus] = useState("")
    async function copy() {
        try {
            if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text)
            else {
                const field = document.createElement("textarea")
                field.value = text; field.style.position = "fixed"; field.style.opacity = "0"
                document.body.append(field); field.select()
                try { if (!document.execCommand("copy")) throw new Error() } finally { field.remove() }
            }
            setStatus("복사했어요")
        } catch { setStatus("복사하지 못했어요. 다시 시도해주세요.") }
    }
    return <div className={className}>
        {children}
        {text && <button type="button" aria-label="메시지 복사" onClick={() => void copy()} className="mt-1 flex items-center gap-1 text-[10px] opacity-70 hover:opacity-100"><Copy className="size-3" />복사</button>}
        {status && <p role="status" className="mt-1 text-[10px]">{status}</p>}
    </div>
}
