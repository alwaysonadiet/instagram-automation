"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase-browser"

export function useInboxRealtime(userId: string | null, conversationId: string | null) {
  const [listRevision, setListRevision] = useState(0)
  const [chatRevision, setChatRevision] = useState(0)
  const [connected, setConnected] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [soundReady, setSoundReady] = useState(false)
  const selected = useRef(conversationId)
  selected.current = conversationId
  const audio = useRef<AudioContext | null>(null)
  const sound = useRef(false)
  const seen = useRef(new Set<string>())

  const playSound = useCallback(() => {
    const context = audio.current
    if (!sound.current || !context || context.state !== "running") return
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.frequency.setValueAtTime(880, context.currentTime)
    oscillator.frequency.setValueAtTime(1046, context.currentTime + 0.12)
    gain.gain.setValueAtTime(0, context.currentTime)
    gain.gain.linearRampToValueAtTime(0.12, context.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.3)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.32)
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
  }, [])

  const activateAudio = useCallback(async () => {
    try {
      if (!audio.current || audio.current.state === "closed") audio.current = new AudioContext()
      await audio.current.resume()
      setSoundReady(audio.current.state === "running")
    } catch { setSoundReady(false) }
  }, [])

  useEffect(() => {
    const key = `inbox-sound-${userId}`
    try {
      sound.current = !!userId && localStorage.getItem(key) === "on"
    } catch { sound.current = false }
    setSoundEnabled(sound.current)
    if (sound.current) void activateAudio()
    const resume = () => { if (sound.current) void activateAudio() }
    document.addEventListener("pointerdown", resume)
    document.addEventListener("keydown", resume)
    return () => {
      document.removeEventListener("pointerdown", resume)
      document.removeEventListener("keydown", resume)
    }
  }, [userId, activateAudio])

  const toggleSound = useCallback(async () => {
    // A remembered preference may still need a gesture after reloading Safari.
    if (sound.current && !soundReady) {
      await activateAudio()
      playSound()
      return
    }
    sound.current = !sound.current
    setSoundEnabled(sound.current)
    try { localStorage.setItem(`inbox-sound-${userId}`, sound.current ? "on" : "off") } catch {}
    if (sound.current) {
      await activateAudio()
      playSound()
    }
  }, [userId, soundReady, activateAudio, playSound])

  useEffect(() => {
    if (!userId) return
    const supabase = getSupabaseBrowserClient()
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let refreshChat = false
    const refresh = (chat: boolean) => {
      refreshChat ||= chat
      if (timer) return
      // Coalesce bursts of real events, never poll for messages.
      timer = setTimeout(() => {
        timer = undefined
        if (stopped) return
        setListRevision(n => n + 1)
        if (refreshChat) setChatRevision(n => n + 1)
        refreshChat = false
      }, 150)
    }
    const channel = supabase.channel(`inbox-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `user_id=eq.${userId}` }, payload => {
        const row = payload.new
        if (stopped || typeof row.id !== "string" || seen.current.has(row.id)) return
        seen.current.add(row.id)
        if (seen.current.size > 500) seen.current.delete(seen.current.values().next().value!)
        refresh(row.conversation_id === selected.current)
        if (row.is_from_instagram === true && row.ingest_source !== "backfill") playSound()
      })
      .subscribe(status => {
        if (stopped) return
        setConnected(status === "SUBSCRIBED")
        // Catch up once on connect/reconnect, including messages missed while offline.
        if (status === "SUBSCRIBED") refresh(true)
      })
    const catchUp = () => { if (document.visibilityState === "visible") refresh(true) }
    document.addEventListener("visibilitychange", catchUp)
    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
      document.removeEventListener("visibilitychange", catchUp)
      void supabase.removeChannel(channel)
    }
  }, [userId, playSound])

  useEffect(() => () => { void audio.current?.close(); audio.current = null }, [])
  return { listRevision, chatRevision, connected, soundEnabled, soundReady, toggleSound }
}
