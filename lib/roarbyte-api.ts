import axios, { AxiosError } from 'axios'
import { LITE_INVENTORY_MODULE_ID, SUPER_ADMIN_ROLE } from '@/lib/constants'
import { publicError } from '@/lib/public-error'

/** Base Login URL from env, e.g. https://host/api/Login — used in browser via NEXT_PUBLIC_API_URL. */
export function getLoginApiUrl(): string {
  const raw = (
    process.env.NEXT_PUBLIC_API_URL ||
    (typeof window === 'undefined' ? process.env.API_URL : '') ||
    ''
  ).trim()
  return raw.replace(/\/$/, '')
}

export function getLoginConfirmUrl(): string {
  return `${getLoginApiUrl()}/confirm`
}

/** Roarbyte API origin, e.g. https://roarbyte-inventory-api.onrender.com */
export function getRoarbyteApiOrigin(): string {
  const loginUrl = getLoginApiUrl()
  if (!loginUrl) return ''
  try {
    return new URL(loginUrl).origin
  } catch {
    return ''
  }
}

export function getAuthMeUrl(): string {
  const origin = getRoarbyteApiOrigin()
  return origin ? `${origin}/api/Auth/me` : ''
}

export const roarbyteApi = axios.create({
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
})

export type LoginSendResponse = {
  message?: string
  channel?: string
  debug_code?: string | null
}

export type ExternalModule = {
  id: string
  name?: string
  amount?: number
  is_active?: boolean
  isActive?: boolean
}

export type LoginConfirmPayload = {
  token?: string
  refresh_token?: string
  expires?: string
  roles?: string[]
  has_roles?: boolean
  subscription_active?: boolean
  modules?: ExternalModule[]
  user?: {
    id?: string
    tenant_id?: string | null
    email?: string | null
    first_name?: string | null
    last_name?: string | null
    phone?: string | null
    tenant_name?: string | null
    roles?: string[]
  }
  // legacy / alternate shapes
  access_token?: string
  accessToken?: string
  tenant_id?: string
  tenantId?: string
  TenantId?: string
  email?: string
  phone?: string
  phone_e164?: string
  business_name?: string
  businessName?: string
  name?: string
  role?: unknown
  user_roles?: unknown
  Modules?: ExternalModule[]
  subscription?: {
    is_active?: boolean
    isActive?: boolean
    status?: string
  }
  Subscription?: {
    is_active?: boolean
    isActive?: boolean
    status?: string
  }
  login_information?: Record<string, unknown>
  loginInformation?: Record<string, unknown>
  message?: string
  [key: string]: unknown
}

export type AuthorizedTenant = {
  token: string
  tenantId: string
  email: string
  phoneE164: string | null
  businessName: string
  roles: string[]
  modules: ExternalModule[]
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return null
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const json =
      typeof atob === 'function'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf8')
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return null
  }
}

function collectRoles(source: Record<string, unknown>): string[] {
  const user = asRecord(source.user)
  const buckets = [
    source.roles,
    source.role,
    source.user_roles,
    source.Roles,
    source.UserRoles,
    user?.roles,
    // common JWT claim names
    source['http://schemas.microsoft.com/ws/2008/06/identity/claims/role'],
  ]
  const roles: string[] = []
  for (const bucket of buckets) {
    if (!bucket) continue
    if (typeof bucket === 'string') {
      roles.push(bucket)
      continue
    }
    if (Array.isArray(bucket)) {
      for (const item of bucket) {
        if (typeof item === 'string') roles.push(item)
        else {
          const row = asRecord(item)
          const name = pickString(row?.name, row?.role, row?.RoleName, row?.role_name)
          if (name) roles.push(name)
        }
      }
    }
  }
  return roles
}

function uniqueRoles(sources: Record<string, unknown>[]): string[] {
  const seen = new Set<string>()
  const roles: string[] = []
  for (const source of sources) {
    for (const role of collectRoles(source)) {
      const key = role.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      roles.push(role)
    }
  }
  return roles
}

function moduleFromId(id: string, isActive = true): ExternalModule {
  return {
    id,
    is_active: isActive,
    ...(id.toLowerCase() === LITE_INVENTORY_MODULE_ID.toLowerCase()
      ? { name: 'Lite Inventory System' }
      : {}),
  }
}

function collectModuleIdLists(source: Record<string, unknown>): ExternalModule[] {
  const modules: ExternalModule[] = []
  const listKeys = [
    'module_ids',
    'moduleIds',
    'active_module_ids',
    'activeModuleIds',
    'tenant_module_ids',
    'tenantModuleIds',
  ]
  for (const key of listKeys) {
    const bucket = source[key]
    if (!Array.isArray(bucket)) continue
    for (const item of bucket) {
      if (typeof item === 'string' && item.trim()) {
        modules.push(moduleFromId(item.trim()))
      }
    }
  }

  if (source.lite_inventory === true || source.has_lite_inventory === true) {
    modules.push(moduleFromId(LITE_INVENTORY_MODULE_ID))
  }

  return modules
}

function collectModules(source: Record<string, unknown>): ExternalModule[] {
  const buckets = [source.modules, source.Modules, source.tenant_modules, source.tenantModules]
  const modules: ExternalModule[] = []
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue
    for (const item of bucket) {
      if (typeof item === 'string' && item.trim()) {
        modules.push(moduleFromId(item.trim()))
        continue
      }
      const row = asRecord(item)
      if (!row) continue
      const id = pickString(row.id, row.Id, row.module_id, row.moduleId)
      if (!id) continue
      modules.push({
        id,
        name: pickString(row.name, row.Name) ?? undefined,
        amount: typeof row.amount === 'number' ? row.amount : undefined,
        is_active:
          typeof row.is_active === 'boolean'
            ? row.is_active
            : typeof row.isActive === 'boolean'
              ? row.isActive
              : true,
      })
    }
  }

  modules.push(...collectModuleIdLists(source))

  const tenant = asRecord(source.tenant) ?? asRecord(source.Tenant)
  if (tenant) {
    modules.push(...collectModules(tenant))
    modules.push(...collectModuleIdLists(tenant))
  }

  const user = asRecord(source.user)
  if (user) {
    modules.push(...collectModules(user))
    modules.push(...collectModuleIdLists(user))
  }

  return modules
}

function uniqueModules(sources: Record<string, unknown>[]): ExternalModule[] {
  const byId = new Map<string, ExternalModule>()
  for (const source of sources) {
    for (const module of collectModules(source)) {
      byId.set(module.id.toLowerCase(), module)
    }
  }
  return [...byId.values()]
}

function subscriptionRecordActive(sub: Record<string, unknown>): boolean {
  if (sub.is_active === true || sub.isActive === true) return true
  const status = pickString(sub.status, sub.Status)?.toLowerCase()
  return status === 'active' || status === 'paid' || status === 'trialing'
}

function subscriptionActiveIn(source: Record<string, unknown>): boolean {
  if (source.subscription_active === true || source.has_active_subscription === true) return true
  if (source.is_subscribed === true || source.isSubscribed === true) return true

  const sub = asRecord(source.subscription) ?? asRecord(source.Subscription)
  if (sub && subscriptionRecordActive(sub)) return true

  const tenant = asRecord(source.tenant) ?? asRecord(source.Tenant)
  if (tenant) {
    if (tenant.subscription_active === true) return true
    const tenantSub = asRecord(tenant.subscription) ?? asRecord(tenant.Subscription)
    if (tenantSub && subscriptionRecordActive(tenantSub)) return true
  }

  const user = asRecord(source.user)
  if (user) {
    if (user.subscription_active === true || user.has_active_subscription === true) return true
    const userSub = asRecord(user.subscription) ?? asRecord(user.Subscription)
    if (userSub && subscriptionRecordActive(userSub)) return true
  }

  return false
}

function subscriptionExplicitlyInactiveIn(source: Record<string, unknown>): boolean {
  if (source.subscription_active === false || source.has_active_subscription === false) return true

  const sub = asRecord(source.subscription) ?? asRecord(source.Subscription)
  if (sub) {
    if (sub.is_active === false || sub.isActive === false) return true
    const status = pickString(sub.status, sub.Status)?.toLowerCase()
    if (
      status &&
      (status === 'inactive' ||
        status === 'cancelled' ||
        status === 'canceled' ||
        status === 'expired' ||
        status === 'past_due')
    ) {
      return true
    }
  }

  return false
}

type AuthPayloadOptions = {
  /** Portal SSO: /api/Auth/me often omits subscription flags though the user already passed main-app gates. */
  trustPortalSession?: boolean
}

function subscriptionActive(
  sources: Record<string, unknown>[],
  options?: AuthPayloadOptions
): boolean {
  if (sources.some(subscriptionActiveIn)) return true
  if (options?.trustPortalSession && !sources.some(subscriptionExplicitlyInactiveIn)) {
    return true
  }
  return false
}

function hasSuperAdmin(roles: string[]): boolean {
  return roles.some((role) => role.toLowerCase() === SUPER_ADMIN_ROLE.toLowerCase())
}

function hasLiteInventoryModule(modules: ExternalModule[]): boolean {
  return modules.some((module) => {
    const active = module.is_active !== false && module.isActive !== false
    return active && module.id.toLowerCase() === LITE_INVENTORY_MODULE_ID.toLowerCase()
  })
}

function liteModuleExplicitlyInactive(modules: ExternalModule[]): boolean {
  const liteId = LITE_INVENTORY_MODULE_ID.toLowerCase()
  return modules.some(
    (module) =>
      module.id.toLowerCase() === liteId &&
      (module.is_active === false || module.isActive === false)
  )
}

function liteInventoryAccessAllowed(
  modules: ExternalModule[],
  options?: AuthPayloadOptions
): boolean {
  if (hasLiteInventoryModule(modules)) return true
  if (!options?.trustPortalSession) return false
  if (liteModuleExplicitlyInactive(modules)) return false
  // User opened Lite from the main portal; /api/Auth/me often omits module lists.
  return true
}

function resolveModulesForTenant(
  modules: ExternalModule[],
  options?: AuthPayloadOptions
): ExternalModule[] {
  if (hasLiteInventoryModule(modules)) return modules
  if (options?.trustPortalSession && liteInventoryAccessAllowed(modules, options)) {
    return [...modules, moduleFromId(LITE_INVENTORY_MODULE_ID)]
  }
  return modules
}

export function apiErrorMessage(error: unknown, fallback = 'Request failed'): string {
  if (axios.isAxiosError(error)) {
    const ax = error as AxiosError<{ message?: string; title?: string; errors?: Record<string, string[]> }>
    const data = ax.response?.data
    if (typeof data === 'string') return publicError(data, fallback)
    if (data?.message) return publicError(data.message, fallback)
    if (data?.title) return publicError(data.title, fallback)
    if (data?.errors) {
      const first = Object.values(data.errors).flat()[0]
      if (first) return publicError(first, fallback)
    }
    return publicError(ax.message, fallback)
  }
  if (error instanceof Error) return publicError(error.message, fallback)
  return fallback
}

/** POST API_URL (/api/Login) — send OTP to email or phone. */
export async function sendLoginOtp(emailOrPhone: string): Promise<LoginSendResponse> {
  const url = getLoginApiUrl()
  if (!url) throw new Error('API_URL is not configured')
  const { data } = await roarbyteApi.post<LoginSendResponse>(url, {
    email_or_phone: emailOrPhone.trim(),
  })
  return data
}

/**
 * POST API_URL/confirm — verify OTP.
 * Requires SuperAdmin role, active subscription, and Lite Inventory module.
 */
export type LoginConfirmFailureReason =
  | 'invalid_otp'
  | 'missing_token'
  | 'missing_tenant'
  | 'access_denied_role'
  | 'access_denied_subscription'
  | 'access_denied_module'
  | 'api_error'

function authorizedTenantFromAuthPayload(
  data: LoginConfirmPayload,
  accessToken: string,
  identityHint?: string,
  options?: AuthPayloadOptions
):
  | { ok: true; tenant: AuthorizedTenant }
  | { ok: false; error: string; reason: LoginConfirmFailureReason } {
  const user = data.user ?? {}
  const token =
    pickString(accessToken, data.token, data.access_token, data.accessToken, data.Token, data.AccessToken) ??
    ''
  const jwtClaims = token ? decodeJwtPayload(token) : null
  const loginInfo = asRecord(data.login_information) ?? asRecord(data.loginInformation) ?? {}
  const responseSources = [jwtClaims ?? {}, loginInfo, data as Record<string, unknown>, { user }]

  const tenantId = pickString(
    user.tenant_id,
    data.tenant_id,
    data.tenantId,
    data.TenantId,
    loginInfo.tenant_id,
    loginInfo.tenantId,
    jwtClaims?.tenant_id,
    jwtClaims?.tenantId,
    jwtClaims?.TenantId,
    jwtClaims?.tid
  )

  if (!token) {
    return {
      ok: false,
      error: 'Login succeeded but no access token was returned.',
      reason: 'missing_token',
    }
  }
  if (!tenantId) {
    return {
      ok: false,
      error: 'Login succeeded but no tenant id was returned.',
      reason: 'missing_tenant',
    }
  }

  const roles = uniqueRoles(responseSources)
  const modules = uniqueModules(responseSources)

  if (!hasSuperAdmin(roles)) {
    return {
      ok: false,
      error: 'Access denied. Only SuperAdmin users can sign in to this app.',
      reason: 'access_denied_role',
    }
  }

  if (!subscriptionActive(responseSources, options)) {
    return {
      ok: false,
      error: 'Access denied. An active subscription is required.',
      reason: 'access_denied_subscription',
    }
  }

  if (!liteInventoryAccessAllowed(modules, options)) {
    return {
      ok: false,
      error: 'Access denied. Lite Inventory System module is not active for this account.',
      reason: 'access_denied_module',
    }
  }

  const resolvedModules = resolveModulesForTenant(modules, options)

  const hint = identityHint?.trim() ?? ''
  const email =
    pickString(
      user.email,
      data.email,
      loginInfo.email,
      jwtClaims?.email,
      hint.includes('@') ? hint : null
    ) ?? ''
  const phoneE164 = pickString(
    user.phone,
    data.phone_e164,
    data.phone,
    loginInfo.phone_e164,
    loginInfo.phone,
    hint && !hint.includes('@') ? hint : null
  )
  const businessName =
    pickString(
      user.tenant_name,
      data.business_name,
      data.businessName,
      data.name,
      loginInfo.business_name,
      loginInfo.businessName,
      loginInfo.name,
      jwtClaims?.business_name,
      jwtClaims?.businessName,
      user.first_name && user.last_name ? `${user.first_name} ${user.last_name}`.trim() : null
    ) ?? 'My Shop'

  return {
    ok: true,
    tenant: {
      token,
      tenantId,
      email,
      phoneE164,
      businessName,
      roles,
      modules: resolvedModules,
    },
  }
}

/** GET /api/Auth/me — validate portal SSO access token. */
export async function authorizeAccessToken(
  accessToken: string
): Promise<
  | { ok: true; tenant: AuthorizedTenant }
  | { ok: false; error: string; reason: LoginConfirmFailureReason }
> {
  const url = getAuthMeUrl()
  if (!url) {
    return { ok: false, error: 'API_URL is not configured', reason: 'api_error' }
  }

  const trimmed = accessToken.trim()
  if (!trimmed) {
    return { ok: false, error: 'Missing access token.', reason: 'missing_token' }
  }

  try {
    const { data } = await roarbyteApi.get<LoginConfirmPayload>(url, {
      headers: { Authorization: `Bearer ${trimmed}` },
    })

    if (process.env.NODE_ENV === 'development') {
      console.info('[auth/me] Roarbyte portal token validated')
    }

    return authorizedTenantFromAuthPayload(data, trimmed, undefined, {
      trustPortalSession: true,
    })
  } catch (error) {
    const message = apiErrorMessage(error, 'Sign-in link expired or invalid.')
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (process.env.NODE_ENV === 'development') {
      console.warn('[auth/me] Portal token rejected', { status, message })
    }
    return {
      ok: false,
      error: status === 401 || status === 403 ? 'Sign-in link expired or invalid.' : message,
      reason: status === 401 || status === 403 ? 'invalid_otp' : 'api_error',
    }
  }
}

export async function confirmLoginOtp(
  emailOrPhone: string,
  code: string
): Promise<
  | { ok: true; tenant: AuthorizedTenant }
  | { ok: false; error: string; reason: LoginConfirmFailureReason }
> {
  const url = getLoginConfirmUrl()
  if (!getLoginApiUrl()) {
    return { ok: false, error: 'API_URL is not configured', reason: 'api_error' }
  }

  const normalizedIdentity = emailOrPhone.trim()
  const normalizedCode = code.replace(/\D/g, '').slice(0, 6)

  try {
    const { data } = await roarbyteApi.post<LoginConfirmPayload>(url, {
      email_or_phone: normalizedIdentity,
      code: normalizedCode,
    })

    if (process.env.NODE_ENV === 'development') {
      const user = data.user ?? {}
      const token =
        pickString(data.token, data.access_token, data.accessToken, data.Token, data.AccessToken) ?? ''
      const jwtClaims = token ? decodeJwtPayload(token) : null
      const loginInfo = asRecord(data.login_information) ?? asRecord(data.loginInformation) ?? {}
      const responseSources = [jwtClaims ?? {}, loginInfo, data as Record<string, unknown>, { user }]
      console.info('[login/confirm] Roarbyte auth response', {
        email_or_phone: normalizedIdentity,
        roles: uniqueRoles(responseSources),
        modules: uniqueModules(responseSources).map((module) => ({
          id: module.id,
          name: module.name,
        })),
        subscription_active: responseSources.map((source) => source.subscription_active),
      })
    }

    const token =
      pickString(data.token, data.access_token, data.accessToken, data.Token, data.AccessToken) ?? ''
    return authorizedTenantFromAuthPayload(data, token, normalizedIdentity)
  } catch (error) {
    const message = apiErrorMessage(error, 'Could not verify code')
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (process.env.NODE_ENV === 'development') {
      console.warn('[login/confirm] Roarbyte OTP rejected', {
        email_or_phone: normalizedIdentity,
        code_length: normalizedCode.length,
        status,
        message,
      })
    }
    return {
      ok: false,
      error: message,
      reason: status === 401 || status === 400 ? 'invalid_otp' : 'api_error',
    }
  }
}

export type TenantDto = {
  id?: string | null
  tenant_id?: string | null
  slug?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  image_url?: string | null
  address?: string | null
  city?: string | null
  country?: string | null
  industry?: string | null
  state?: string | null
  is_active?: boolean
}

export type TenantSettingsSeed = {
  tenantId: string
  email: string | null
  phoneE164: string | null
  businessName: string
  shopLogoUrl: string | null
  themeColor: string | null
}

/** GET /api/Tenants/{id} — requires Roarbyte JWT from login confirm. */
export async function fetchTenantById(
  tenantId: string,
  accessToken: string
): Promise<TenantDto | null> {
  const origin = getRoarbyteApiOrigin()
  if (!origin) throw new Error('API_URL is not configured')

  try {
    const { data } = await roarbyteApi.get<TenantDto>(`${origin}/api/Tenants/${tenantId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    return data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 404) {
      return null
    }
    throw error
  }
}

/** Map Roarbyte tenant + login payload into local tenant_settings fields. */
export function buildTenantSettingsSeed(
  tenant: AuthorizedTenant,
  external?: TenantDto | null
): TenantSettingsSeed {
  return {
    tenantId: tenant.tenantId,
    email: pickString(external?.email, tenant.email) || null,
    phoneE164: pickString(external?.phone, tenant.phoneE164) || null,
    businessName: pickString(external?.name, tenant.businessName) || 'My Shop',
    shopLogoUrl: pickString(external?.image_url) || null,
    themeColor: null,
  }
}
