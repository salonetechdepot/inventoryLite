import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createSession, ensureTenantWorkspace } from '@/lib/auth'
import { LITE_INVENTORY_MODULE_ID, SUPER_ADMIN_ROLE } from '@/lib/constants'
import { parseJsonBody } from '@/lib/api-validation'
import { getTenantLockInfo, lockedAccountResponse } from '@/lib/tenant-lock'

const establishSchema = z.object({
  token: z.string().min(1),
  tenantId: z.string().uuid(),
  email: z.string().optional().default(''),
  phoneE164: z.string().nullable().optional(),
  businessName: z.string().min(1),
  roles: z.array(z.string()).default([]),
  modules: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        is_active: z.boolean().optional(),
        isActive: z.boolean().optional(),
      })
    )
    .default([]),
})

export async function POST(request: Request) {
  try {
    const parsed = await parseJsonBody(request, establishSchema)
    if (!parsed.ok) return parsed.response

    const { token, tenantId, email, phoneE164, businessName, roles, modules } = parsed.data

    const isSuperAdmin = roles.some(
      (role) => role.toLowerCase() === SUPER_ADMIN_ROLE.toLowerCase()
    )
    if (!isSuperAdmin) {
      return NextResponse.json(
        { error: 'Access denied. Only SuperAdmin users can sign in.' },
        { status: 403 }
      )
    }

    const hasModule = modules.some((module) => {
      const active = module.is_active !== false && module.isActive !== false
      return active && module.id.toLowerCase() === LITE_INVENTORY_MODULE_ID.toLowerCase()
    })
    if (!hasModule) {
      return NextResponse.json(
        { error: 'Access denied. Lite Inventory System module is required.' },
        { status: 403 }
      )
    }

    const lock = await getTenantLockInfo(tenantId)
    if (lock.isLocked) {
      return lockedAccountResponse(lock)
    }

    const tenant = {
      token,
      tenantId,
      email,
      phoneE164: phoneE164 ?? null,
      businessName,
      roles,
      modules,
    }

    const user = await ensureTenantWorkspace(tenant)
    const { expiresAt: sessionExpiresAt } = await createSession(tenant)

    return NextResponse.json({ user, sessionExpiresAt })
  } catch (error) {
    console.error('Establish session error:', error)
    return NextResponse.json({ error: 'Could not establish session' }, { status: 500 })
  }
}
