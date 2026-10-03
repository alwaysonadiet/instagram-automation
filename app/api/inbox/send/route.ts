import { type NextRequest, NextResponse } from "next/server"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { userId, recipientId, message, attachment } = body

        if (!userId || !recipientId || (!message && !attachment)) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
        }

        const identity = await getInstagramIdentity()
        if (!identity) return NextResponse.json({ error: "Please log in again" }, { status: 401 })
        if (identity.userId !== userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

        const supabase = await getSupabaseServerClient()

        // 1. Get User Access Token
        const { data: user, error: userError } = await supabase
            .from("users")
            .select("access_token, username, business_account_id")
            .eq("id", userId)
            .single()

        if (userError || !user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        // 2. Prepare Payload for Instagram API
        const apiBody: any = { recipient: { id: recipientId } }

        if (message) {
            apiBody.message = { text: message }
        } else if (attachment) {
            apiBody.message = { attachment }
        }

        // 3. Send to Instagram
        const res = await fetch(
            `https://graph.instagram.com/v24.0/me/messages?access_token=${user.access_token}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(apiBody)
            }
        )

        const data = await res.json()

        if (!res.ok || data.error) {
            console.error("[Inbox Send] Instagram API Error:", data.error)
            return NextResponse.json({ error: data.error?.message || "Instagram send failed" }, { status: 500 })
        }

        // 4. Log to Database (Outbound Message)
        // Find Conversation ID first
        let { data: conv } = await supabase
            .from("conversations")
            .select("id")
            .eq("user_id", userId)
            .eq("recipient_id", recipientId)
            .single()

        // If conversation doesn't exist (unlikely if replying, but possible if initiating), create it logic is tricky here 
        // without knowing username. Assuming it exists for now as this is usually a reply flow.

        let savedMessage = null
        if (conv) {
            // The send response and webhook echo identify the same message.
            // Ignore a conflict if the echo arrived before this request completed.
            const messageId = data.message_id
            if (typeof messageId !== "string" || !messageId) {
                console.error("[Inbox Send] Missing Instagram message ID")
                return NextResponse.json({ success: true, data, savedMessage: null })
            }
            const { error: saveError } = await supabase.from("messages").upsert({
                id: messageId,
                conversation_id: conv.id,
                user_id: userId,
                sender_id: user.business_account_id,
                sender_username: user.username,
                content: message || "[Attachment]",
                is_from_instagram: false
            }, { onConflict: "id", ignoreDuplicates: true })
            if (saveError) console.error("[Inbox Send] Failed to save outbound message", saveError.message)
            const { data: stored } = await supabase.from("messages").select("*")
                .eq("id", messageId).eq("user_id", userId).single()
            savedMessage = stored

            // Update conversation timestamp
            await supabase
                .from("conversations")
                .update({ last_message_at: new Date().toISOString() })
                .eq("id", conv.id)
        }

        return NextResponse.json({ success: true, data, savedMessage })

    } catch (error) {
        console.error("[Inbox Send] Internal Error:", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
