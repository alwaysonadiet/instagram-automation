"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { LandingPage } from "@/components/layout/landing-page"

export default function Home() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check if we have an active session or a callback code
    const code = searchParams.get("code")
    if (code) {
      router.replace("/dashboard?code=" + encodeURIComponent(code))
      return
    }
    let cancelled = false
    fetch("/api/session", { cache: "no-store" }).then(res => {
      if (res.ok && !cancelled) router.replace("/dashboard")
    }).catch(() => {})
    return () => { cancelled = true }

  }, [searchParams, router])

  return <LandingPage />
}
