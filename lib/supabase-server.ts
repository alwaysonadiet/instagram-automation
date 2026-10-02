import "server-only"
import { getSupabaseAdmin } from "./supabase-admin"

// Backend data access must never inherit a browser Auth session.
export async function getSupabaseServerClient() {
  return getSupabaseAdmin()
}
