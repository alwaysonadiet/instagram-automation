import { NextRequest, NextResponse } from "next/server"
import { getInstagramIdentity } from "@/lib/instagram-auth"
import { getSupabaseServerClient } from "@/lib/supabase-server"
import { decodeMetaText } from "@/lib/history/normalise"
export async function PUT(request: NextRequest) {
  const identity = await getInstagramIdentity()
  if (!identity) return NextResponse.json({ error: "다시 로그인해 주세요." }, { status: 401 })
  const origin = request.headers.get("origin")
  if (origin && origin !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  let names: string[]
  try {
    const raw = await request.text(); if (raw.length > 5000) throw new Error()
    const body = JSON.parse(raw)
    if (!Array.isArray(body.ownerNames) || !body.ownerNames.length || body.ownerNames.length > 10 || body.ownerNames.some((v: unknown) => typeof v !== "string" || !v.trim() || v.length > 200)) throw new Error()
    names = body.ownerNames.map((v: string) => decodeMetaText(v).normalize("NFC").trim())
  } catch { return NextResponse.json({ error: "내 이름을 한 줄에 하나씩 입력해 주세요." }, { status: 400 }) }
  const db = await getSupabaseServerClient()
  const { data, error } = await db.rpc("history_set_directions", { p_owner: identity.userId, p_names: names })
  if (error) return NextResponse.json({ error: "발신 방향을 수정하지 못했어요." }, { status: 503 })
  return NextResponse.json({ updated: data })
}
