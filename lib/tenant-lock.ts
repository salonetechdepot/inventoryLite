import { NextResponse } from 'next/server'
import { getSession, type SessionPayload } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export type SupportContact = {
  phone: string
  email: string
  whatsapp: string
}

export type TenantLockInfo = {
  isLocked: boolean
  lockedAt: string | null
  lockedReason: string | null
  lockedBy: string | null
}

export function getSupportContact(): SupportContact {
  const placeholder = '—'
  return {
    phone: process.env.ROARBYTE_SUPPORT_PHONE?.trim() || placeholder,
    email: process.env.ROARBYTE_SUPPORT_EMAIL?.trim() || placeholder,
    whatsapp: process.env.ROARBYTE_SUPPORT_WHATSAPP?.trim() || placeholder,
  }
}

export function lockedAccountPayload(lock?: Partial<TenantLockInfo>) {
  return {
    locked: true as const,
    code: 'TENANT_LOCKED' as const,
    message: 'Account locked. Please contact Roarbyte Support.',
    support: getSupportContact(),
    lock: {
      isLocked: true,
      lockedAt: lock?.lockedAt ?? null,
      lockedReason: lock?.lockedReason ?? null,
      lockedBy: lock?.lockedBy ?? null,
    },
  }
}

export function lockedAccountResponse(lock?: Partial<TenantLockInfo>, status = 403) {
  return NextResponse.json(lockedAccountPayload(lock), { status })
}

export async function getTenantLockInfo(tenantId: string): Promise<TenantLockInfo> {
  const row = await prisma.tenantSettings.findUnique({
    where: { tenantId },
    select: {
      isLocked: true,
      lockedAt: true,
      lockedReason: true,
      lockedBy: true,
    },
  })

  if (!row) {
    return {
      isLocked: false,
      lockedAt: null,
      lockedReason: null,
      lockedBy: null,
    }
  }

  return {
    isLocked: row.isLocked,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    lockedReason: row.lockedReason,
    lockedBy: row.lockedBy,
  }
}

export async function isTenantLocked(tenantId: string): Promise<boolean> {
  const info = await getTenantLockInfo(tenantId)
  return info.isLocked
}

export type ActiveSessionResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; reason: 'unauthorized' }
  | { ok: false; reason: 'locked'; lock: TenantLockInfo }

/** Shop API guard — rejects locked tenants when online enforcement applies. */
export async function requireActiveSession(): Promise<ActiveSessionResult> {
  const session = await getSession()
  if (!session) return { ok: false, reason: 'unauthorized' }

  const lock = await getTenantLockInfo(session.tenantId)
  if (lock.isLocked) {
    return { ok: false, reason: 'locked', lock }
  }

  return { ok: true, session }
}

export async function setTenantLockState(input: {
  tenantId: string
  locked: boolean
  reason?: string | null
  lockedBy: string
}) {
  return prisma.tenantSettings.update({
    where: { tenantId: input.tenantId },
    data: {
      isLocked: input.locked,
      lockedAt: input.locked ? new Date() : null,
      lockedReason: input.locked ? input.reason?.trim() || null : null,
      lockedBy: input.locked ? input.lockedBy : null,
    },
    select: {
      tenantId: true,
      isLocked: true,
      lockedAt: true,
      lockedReason: true,
      lockedBy: true,
    },
  })
}
