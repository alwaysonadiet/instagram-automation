import "server-only"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function getAuthClient() {
  const jar = await cookies()
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: values => values.forEach(({ name, value, options }) => jar.set(name, value, options)),
    },
  })
}

export async function getInstagramIdentity() {
  const auth = await getAuthClient()
  const { data: { user }, error } = await auth.auth.getUser()
  const userId = user?.app_metadata.instagram_user_id
  if (error || typeof userId !== "string" || !/^\d+$/.test(userId)) return null
  return { userId, username: String(user?.app_metadata.instagram_username || ""), profilePic: user?.app_metadata.instagram_profile_pic || null }
}
