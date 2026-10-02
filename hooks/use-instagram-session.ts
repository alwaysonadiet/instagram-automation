"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"

// A single OAuth code exchange shared by concurrent mounted hooks / StrictMode.
const pendingCodes = new Map<string, Promise<any>>()
function exchangeCode(code: string) {
    let pending = pendingCodes.get(code)
    if (!pending) {
        pending = fetch("/api/instagram/callback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) }).then(res => res.json())
        pendingCodes.set(code, pending)
        void pending.finally(() => setTimeout(() => pendingCodes.delete(code), 30000)).catch(() => {})
    }
    return pending
}

export function useInstagramSession() {
    const [username, setUsername] = useState<string | null>(null)
    const [userId, setUserId] = useState<string | null>(null)
    const [profilePic, setProfilePic] = useState<string | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    const searchParams = useSearchParams()
    const router = useRouter()

    useEffect(() => {
        const code = searchParams.get("code")

        const handleSession = async () => {
            // CASE A: New Login from Instagram
            if (code) {
                try {
                    const data = await exchangeCode(code)

                    if (data.success) {
                        localStorage.setItem("ig_user_id", data.userId)
                        localStorage.setItem("ig_username", data.username)
                        if (data.profilePic) localStorage.setItem("ig_profile_pic", data.profilePic)

                        setUserId(data.userId)
                        setUsername(data.username)
                        setProfilePic(data.profilePic || null)
                        // Remove code from URL
                        router.replace("/dashboard")
                    } else {
                        router.replace("/?error=login_failed")
                    }
                } catch (err) {
                    console.error("Login failed:", err)
                }
            }
            // CASE B: Restore Session from LocalStorage
            else {
                try {
                    const res = await fetch("/api/session", { cache: "no-store" })
                    if (res.ok) {
                        const session = await res.json()
                        setUserId(session.userId)
                        setUsername(session.username)
                        setProfilePic(session.profilePic)
                    } else {
                        localStorage.removeItem("ig_user_id")
                        localStorage.removeItem("ig_username")
                    }
                } catch { /* A network error is not an authenticated session. */ }

            }
            setIsLoading(false)
        }

        handleSession()
    }, [searchParams, router])

    const logout = async () => {
        await fetch("/api/session", { method: "DELETE" })
        localStorage.removeItem("ig_user_id")
        localStorage.removeItem("ig_username")
        localStorage.removeItem("ig_profile_pic")
        document.cookie = "insta_session=; Max-Age=0; path=/;"
        setUsername(null)
        setUserId(null)
        setProfilePic(null)
        router.push("/")
    }

    return { userId, username, profilePic, isLoading, logout }
}
