import { prisma } from '@/lib/prisma'
import { newEntityId } from '@/lib/entity-id'
import type { AuthorizedTenant } from '@/lib/roarbyte-api'
import { buildTenantSettingsSeed, fetchTenantById } from '@/lib/roarbyte-api'
import { ensureDefaultWarehouse } from '@/lib/warehouse'

const DEFAULT_CATEGORIES: Array<{ name: string; icon: string }> = [
  { name: 'Food & Drinks', icon: 'utensils' },
  { name: 'Electronics', icon: 'smartphone' },
  { name: 'Clothing', icon: 'shirt' },
  { name: 'Household', icon: 'home' },
  { name: 'Other', icon: 'package' },
]

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120)
  return base || 'shop'
}

export async function ensureTenantWorkspace(tenant: AuthorizedTenant) {
  let externalTenant = null
  try {
    externalTenant = await fetchTenantById(tenant.tenantId, tenant.token)
  } catch (error) {
    console.warn('[ensureTenantWorkspace] tenant fetch failed:', error)
  }

  const seed = buildTenantSettingsSeed(tenant, externalTenant)
  const now = new Date()

  let row = await prisma.tenant.findUnique({ where: { id: tenant.tenantId } })

  if (!row) {
    const slugBase = slugify(seed.businessName)
    row = await prisma.tenant.create({
      data: {
        id: tenant.tenantId,
        name: seed.businessName,
        slug: `${slugBase}-${tenant.tenantId.slice(0, 8)}`,
        email: seed.email,
        phone: seed.phoneE164,
        imageUrl: seed.shopLogoUrl,
        themeColor: seed.themeColor,
        createdAt: now,
        isActive: true,
      },
    })
  } else {
    row = await prisma.tenant.update({
      where: { id: tenant.tenantId },
      data: {
        name: seed.businessName || row.name,
        email: seed.email ?? row.email,
        phone: seed.phoneE164 ?? row.phone,
        imageUrl: seed.shopLogoUrl ?? row.imageUrl,
      },
    })
  }

  await prisma.retailTenantSettings.upsert({
    where: { tenantId: tenant.tenantId },
    create: { tenantId: tenant.tenantId },
    update: {},
  })

  const settings = await prisma.retailTenantSettings.findUniqueOrThrow({
    where: { tenantId: tenant.tenantId },
  })

  if (!settings.liteCategoriesSeeded) {
    for (const cat of DEFAULT_CATEGORIES) {
      const categoryId = newEntityId()
      await prisma.category.create({
        data: {
          id: categoryId,
          tenantId: tenant.tenantId,
          name: cat.name,
          createdAt: now,
          updatedAt: now,
          meta: {
            create: {
              tenantId: tenant.tenantId,
              icon: cat.icon,
              isDefault: true,
            },
          },
        },
      })
    }
    await prisma.retailTenantSettings.update({
      where: { tenantId: tenant.tenantId },
      data: { liteCategoriesSeeded: true },
    })
  }

  await ensureDefaultWarehouse(tenant.tenantId)

  return {
    id: row.id,
    tenant_id: row.id,
    email: row.email || tenant.email,
    phone_e164: row.phone,
    business_name: row.name,
    theme_color: row.themeColor,
    shop_logo_url: row.imageUrl,
    created_at: row.createdAt,
  }
}

export async function getTenantProfile(tenantId: string) {
  const row = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!row) return null
  return {
    id: row.id,
    tenant_id: row.id,
    email: row.email,
    phone_e164: row.phone,
    business_name: row.name,
    theme_color: row.themeColor,
    shop_logo_url: row.imageUrl,
    created_at: row.createdAt,
  }
}
