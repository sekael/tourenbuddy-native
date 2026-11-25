import type { Env } from './config'

/** Verifies a Supabase JWT and returns the user id, or null if invalid. */
export async function verifySupabaseJwt(request: Request, env: Env): Promise<string | null> {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer '))
    return null

  const token = authHeader.slice(7)
  let res: Response
  try {
    res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    })
  }
  catch (err) {
    console.error(`[verifySupabaseJwt] network error reaching ${env.SUPABASE_URL}/auth/v1/user:`, err)
    return null
  }

  if (!res.ok) {
    const body = await res.text()
    console.error(`[verifySupabaseJwt] ${res.status} from ${env.SUPABASE_URL}/auth/v1/user: ${body}`)
    return null
  }

  const user = (await res.json()) as { id?: string }
  return user.id ?? null
}
