import { createSession, ensureTenantWorkspace } from '@/lib/auth'
import type { AuthorizedTenant } from '@/lib/roarbyte-api'
import { getTenantLockInfo, lockedAccountResponse } from '@/lib/tenant-lock'
import type { NextResponse } from 'next/server'

export async function establishLiteSession(tenant: AuthorizedTenant) {
  const lock = await getTenantLockInfo(tenant.tenantId)
  if (lock.isLocked) {
    return { ok: false as const, response: lockedAccountResponse(lock) }
  }

  const user = await ensureTenantWorkspace(tenant)
  const { expiresAt: sessionExpiresAt } = await createSession(tenant)

  return { ok: true as const, user, sessionExpiresAt }
}

export type EstablishLiteSessionResult =
  | { ok: true; user: Awaited<ReturnType<typeof ensureTenantWorkspace>>; sessionExpiresAt: string }
  | { ok: false; response: NextResponse }
