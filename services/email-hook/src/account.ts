import type { Env } from './config'
import { verifySupabaseJwt } from './auth'
import { jsonResponse } from './config'

/**
 * POST /account/delete (change: add-native-backend, design D5): the verified caller's Storage
 * objects first, then their auth user, whose rows cascade. Never an id from the body.
 */

function serviceHeaders(env: Env): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  }
}

// Storage's bulk delete takes up to 1,000 names per call.
const DELETE_BATCH = 1000

async function deleteStorageObjects(userId: string, env: Env): Promise<boolean> {
  const list = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/account_storage_objects`, {
    method: 'POST',
    headers: { ...serviceHeaders(env), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_user_id: userId }),
  })
  if (!list.ok) {
    console.error(`[account] listing objects failed: ${list.status}`)
    return false
  }
  const objects = (await list.json()) as { bucket_id: string, name: string }[]
  const byBucket = new Map<string, string[]>()
  for (const { bucket_id, name } of objects) {
    // The database already pins the prefix; checked again so a bug there cannot reach others.
    if (name.split('/')[0] !== userId)
      continue
    byBucket.set(bucket_id, [...(byBucket.get(bucket_id) ?? []), name])
  }
  for (const [bucket, names] of byBucket) {
    for (let i = 0; i < names.length; i += DELETE_BATCH) {
      const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${bucket}`, {
        method: 'DELETE',
        headers: { ...serviceHeaders(env), 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: names.slice(i, i + DELETE_BATCH) }),
      })
      if (!res.ok) {
        console.error(`[account] deleting ${bucket} objects failed: ${res.status}`)
        return false
      }
    }
  }
  return true
}

export async function handleAccountDelete(request: Request, env: Env): Promise<Response> {
  const userId = await verifySupabaseJwt(request, env)
  if (!userId)
    return jsonResponse(401, { error: 'unauthorized' })

  // Objects first: a failure keeps the account, so a retry finds everything it needs.
  if (!(await deleteStorageObjects(userId, env)))
    return jsonResponse(502, { error: 'storage_delete_failed' })

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: 'DELETE',
    headers: serviceHeaders(env),
  })
  // Already gone (a retry after a lost response): the outcome the caller asked for.
  if (!res.ok && res.status !== 404) {
    console.error(`[account] deleting user failed: ${res.status}`)
    return jsonResponse(502, { error: 'user_delete_failed' })
  }
  return jsonResponse(200, { deleted: true })
}
