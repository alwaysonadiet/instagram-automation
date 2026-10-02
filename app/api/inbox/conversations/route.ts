import { type NextRequest, NextResponse } from "next/server"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
    try {
        const userId = request.nextUrl.searchParams.get("userId")
        if (!userId) return NextResponse.json({ error: "Missing userId" }, { status: 400 })

        const supabase = await getSupabaseServerClient()

        // Fetch conversations sorted by last message
        const { data: conversations, error } = await supabase
            .from("conversations")
            .select("*")
            .eq("user_id", userId)
            .order("last_message_at", { ascending: false })

        if (error) throw error

        return NextResponse.json(conversations)
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
