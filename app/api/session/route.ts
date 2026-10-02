import { NextResponse } from "next/server"
import { getAuthClient, getInstagramIdentity } from "@/lib/instagram-auth"

export async function GET() {
  const identity = await getInstagramIdentity()
  return NextResponse.json(identity || { error: "Please log in again" }, { status: identity ? 200 : 401, headers: { "Cache-Control": "no-store" } })
}

export async function DELETE() {
  const auth = await getAuthClient()
  await auth.auth.signOut()
  const response = NextResponse.json({ ok: true })
  response.cookies.delete("insta_session")
  return response
}
