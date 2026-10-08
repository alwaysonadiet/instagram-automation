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

        const profileIds = request.nextUrl.searchParams.get("profiles")
        if (profileIds) {
            const ids = [...new Set(profileIds.split(","))].filter(id => /^\d+$/.test(id)).slice(0, 8)
            const { data: owned } = await supabase.from("conversations").select("recipient_id,recipient_username").eq("user_id", userId).in("recipient_id", ids)
            const { data: user } = await supabase.from("users").select("access_token").eq("id", identity.userId).single()
            if (!user?.access_token) return NextResponse.json([])
            return NextResponse.json(await Promise.all((owned || []).map(async conversation => {
                const profile = await fetchProfile(user.access_token, String(conversation.recipient_id))
                return { recipient_id: String(conversation.recipient_id), recipient_username: profile?.username || conversation.recipient_username, recipient_display_name: profile?.name || null, recipient_profile_pic: profile?.profile_pic?.startsWith("https://") ? profile.profile_pic : null }
            })))
        }

        // Fetch conversations sorted by last message
        const { data: conversations, error } = await supabase
            .from("conversations")
            .select("*,messages!inner(content,attachments,is_from_instagram,created_at)")
            .eq("user_id", userId)
            .not("messages.content", "like", "ACT::%")
            .neq("messages.content", "[자동화 버튼 클릭]")
            .order("is_pinned", { ascending: false })
            .order("last_message_at", { ascending: false })
            .order("created_at", { referencedTable: "messages", ascending: false })
            .limit(1, { referencedTable: "messages" })

        if (error) throw error

        const rows = (conversations || []).map(({ messages, ...conversation }) => {
            const latest = messages?.[0]
            const text = latest?.content?.trim() || (latest?.attachments?.length ? "[첨부파일]" : "")
            return { ...conversation, last_message_preview: text ? `${latest?.is_from_instagram ? "" : "나: "}${text}`.replace(/\s+/g, " ").slice(0, 240) : "" }
        })
        return NextResponse.json(rows)
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
    if (typeof body.isPinned === "boolean" && typeof body.conversationId === "string" && body.isUnread === undefined) {
        const supabase = await getSupabaseServerClient()
        const { data, error } = await supabase.from("conversations")
            .update({ is_pinned: body.isPinned }).eq("id", body.conversationId).eq("user_id", identity.userId)
            .select("id,is_pinned").maybeSingle()
        if (error) return NextResponse.json({ error: "Could not update pin" }, { status: 500 })
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
        return NextResponse.json({ success: true, isPinned: data.is_pinned })
    }
    if (typeof body.conversationId !== "string" || typeof body.isUnread !== "boolean" ||
        (!body.isUnread && (typeof body.readThrough !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(body.readThrough) || !Number.isFinite(Date.parse(body.readThrough))))) {
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
    if (!body.isUnread) query = query.or(`last_incoming_at.is.null,last_incoming_at.lte.${body.readThrough}`)
    const { data, error } = await query.select("id")
    if (error) return NextResponse.json({ error: "Could not update read status" }, { status: 500 })
    return NextResponse.json({ success: true, changed: !!data?.length })
}
