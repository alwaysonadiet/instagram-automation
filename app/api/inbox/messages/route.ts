import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function GET(request: NextRequest) {
    try {
        const conversationId = request.nextUrl.searchParams.get("conversationId")
        if (!conversationId) return NextResponse.json({ error: "Missing conversationId" }, { status: 400 })

        const supabase = await getSupabaseServerClient()

        // Fetch messages for this conversation
        const { data: messages, error } = await supabase
            .from("messages")
            .select("*")
            .eq("conversation_id", conversationId)
            .not("content", "like", "ACT::%")
            .neq("content", "[자동화 버튼 클릭]")
            .order("created_at", { ascending: true })

        if (error) throw error

        return NextResponse.json(messages)
    } catch (error) {
        console.error("[Inbox] Messages GET error:", error)
        return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 })
    }
}
