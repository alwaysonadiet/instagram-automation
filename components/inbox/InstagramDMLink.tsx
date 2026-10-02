"use client"

import { useEffect, useState, type MouseEvent, type ReactNode } from "react"

export function InstagramDMLink({ username, accountUsername, children, className }: {
    username: string
    accountUsername?: string | null
    children: ReactNode
    className?: string
}) {
    const [mobile, setMobile] = useState(false)
    useEffect(() => {
        setMobile(/Android|iPhone|iPad|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
    }, [])
    const confirmAccount = (event: MouseEvent<HTMLAnchorElement>) => {
        event.stopPropagation()
        const account = accountUsername ? `@${accountUsername}` : "이 사이트에 연결한 계정"
        const destination = mobile ? "인스타 앱" : "인스타 웹"
        const action = mobile ? "상대방 DM 열기" : "상대 프로필 열기 → ‘메시지’ 버튼으로 대화 열기"
        if (!window.confirm(`${destination}에서 ${account} 계정이 선택돼 있나요?\n\n확인: ${action}\n취소: 인스타에서 계정을 전환한 뒤 다시 눌러주세요.\n\n이 사이트에서는 인스타의 현재 계정을 확인하거나 자동 전환할 수 없어요.`)) {
            event.preventDefault()
        }
    }
    return <a href={mobile ? `https://ig.me/m/${encodeURIComponent(username)}` : `https://www.instagram.com/${encodeURIComponent(username)}/`} target="_blank" rel="noopener noreferrer" onClick={confirmAccount} className={className} aria-label={`@${username} 인스타 DM 열기`}>{children}</a>
}
