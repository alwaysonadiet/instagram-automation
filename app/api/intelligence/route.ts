import { NextResponse } from "next/server"
export function GET() { return NextResponse.json({ error: "Cloudflare 앱에서 다시 로그인해 주세요." }, { status: 401 }) }
export const POST = GET
