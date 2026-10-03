import { type NextRequest, NextResponse } from "next/server"
import { fetchProfile } from "@/lib/instagram-api"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
    try {
        const userId = request.nextUrl.searchParams.get("userId")
        if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

        const identity = await getInstagramIdentity()
        if (!identity) return NextResponse.json({ error: "Please log in again" }, { status: 401 })
        if (identity.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

        const supabase = await getSupabaseServerClient()

        // Fetch conversations sorted by last message
        const { data: conversations, error } = await supabase
            .from("conversations")
            .select("*,messages!inner(id)")
            .eq("user_id", userId)
            .not("messages.content", "like", "ACT::%")
            .neq("messages.content", "[자동화 버튼 클릭]")
            .order("last_message_at", { ascending: false })

        if (error) throw error

        const rows = (conversations || []).map(({ messages, ...conversation }) => conversation)
        if (!rows.length) return NextResponse.json(rows)
        const { data: user } = await supabase.from("users").select("access_token").eq("id", identity.userId).single()
        if (!user?.access_token) return NextResponse.json(rows)
        // Profile responses are cached for a day; no background polling or photo uploads.
        const enriched = []
        for (let offset = 0; offset < rows.length; offset += 8) {
            enriched.push(...await Promise.all(rows.slice(offset, offset + 8).map(async conversation => {
                const profile = await fetchProfile(user.access_token, String(conversation.recipient_id))
                return {
                    ...conversation,
                    recipient_username: profile?.username || conversation.recipient_username,
                    recipient_display_name: profile?.name || null,
                    recipient_profile_pic: profile?.profile_pic?.startsWith("https://") ? profile.profile_pic : null,
                }
            })))
        }
        return NextResponse.json(enriched)
    } catch (error) {
        console.error("[Inbox] Conversations GET error:", error)
        return NextResponse.json({ error: "Failed to fetch conversations" }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    const identity = await getInstagramIdentity()
    if (!identity) return NextResponse.json({ error: "Please log in again" }, { status: 401 })
    const conversationId = request.nextUrl.searchParams.get("conversationId")
    if (!conversationId) return NextResponse.json({ error: "Missing conversationId" }, { status: 400 })
    const supabase = await getSupabaseServerClient()
    // Messages reference conversations with ON DELETE CASCADE. Instagram is untouched.
    const { data, error } = await supabase.from("conversations")
        .delete().eq("id", conversationId).eq("user_id", identity.userId)
        .select("id").maybeSingle()
    if (error) return NextResponse.json({ error: "Could not close conversation" }, { status: 500 })
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ success: true })
}

export async function PATCH(request: NextRequest) {
    const identity = await getInstagramIdentity()
    if (!identity) return NextResponse.json({ error: "Please log in again" }, { status: 401 })
    let body
    try { body = await request.json() } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }) }
    if (typeof body.conversationId !== "string" || typeof body.isUnread !== "boolean" ||
        (!body.isUnread && (typeof body.readThrough !== "string" || !Number.isFinite(Date.parse(body.readThrough))))) {
        return NextResponse.json({ error: "Invalid read status" }, { status: 400 })
    }
    const supabase = await getSupabaseServerClient()
    const { data: owned, error: lookupError } = await supabase.from("conversations").select("id")
        .eq("id", body.conversationId).eq("user_id", identity.userId).maybeSingle()
    if (lookupError) return NextResponse.json({ error: "Could not update read status" }, { status: 500 })
    if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })
    let query = supabase.from("conversations").update({ is_unread: body.isUnread })
        .eq("id", body.conversationId).eq("user_id", identity.userId).eq("is_unread", !body.isUnread)
    // A message arriving after the displayed batch must stay unread.
    if (!body.isUnread) query = query.or(`last_incoming_at.is.null,last_incoming_at.lte.${new Date(body.readThrough).toISOString()}`)
    const { data, error } = await query.select("id")
    if (error) return NextResponse.json({ error: "Could not update read status" }, { status: 500 })
    return NextResponse.json({ success: true, changed: !!data?.length })
}
