"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  apiErrorMessage,
  confirmLoginOtp,
  sendLoginOtp,
  type AuthorizedTenant,
} from "@/lib/roarbyte-api"
import { normalizeLoginIdentity, normalizeOtpCode } from "@/lib/login-identity"
import { publicError } from "@/lib/public-error"
import { hasSessionExpiry, isSessionExpired } from "@/lib/session-expiry"
import { runDeltaSync } from "@/lib/offline-sync"

export type AuthUser = {
  id: string
  tenant_id: string
  email: string
  phone_e164?: string | null
  business_name: string
  theme_color?: string | null
  shop_logo_url?: string | null
}

async function readJsonObject(res: Response): Promise<Record<string, unknown> | null> {
  const raw = await res.text()
  if (!raw.trim()) return {}
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }
  return null
}

function authUsersEqual(a: AuthUser | null, b: AuthUser | null): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.email === b.email &&
    a.business_name === b.business_name &&
    a.theme_color === b.theme_color &&
    a.shop_logo_url === b.shop_logo_url
  )
}

type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  sessionExpiresAt: string | null
  /** Exact identity string used with Roarbyte send + confirm (lowercased email or E.164 phone). */
  pendingLoginIdentity: string | null
  isHydrated: boolean
  setHydrated: (value: boolean) => void
  setUser: (user: AuthUser | null) => void
  setSessionExpiresAt: (expiresAt: string | null) => void
  isSessionValid: () => boolean
  sendOtp: (emailOrPhone: string) => Promise<{ ok: true } | { ok: false; error: string }>
  confirmOtp: (
    code: string,
    emailOrPhone?: string
  ) => Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }>
  establishServerSession: (tenant: AuthorizedTenant) => Promise<AuthUser>
  completePortalHandoff: (accessToken: string) => Promise<AuthUser>
  logout: () => Promise<void>
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      sessionExpiresAt: null,
      pendingLoginIdentity: null,
      isHydrated: false,

      setHydrated: (value) =>
        set((state) => (state.isHydrated === value ? state : { isHydrated: value })),

      setUser: (user) =>
        set((state) => (authUsersEqual(state.user, user) ? state : { user })),

      setSessionExpiresAt: (expiresAt) =>
        set((state) =>
          state.sessionExpiresAt === expiresAt ? state : { sessionExpiresAt: expiresAt }
        ),

      isSessionValid: () => {
        const { user, sessionExpiresAt } = get()
        return (
          Boolean(user) &&
          hasSessionExpiry(sessionExpiresAt) &&
          !isSessionExpired(sessionExpiresAt)
        )
      },

      sendOtp: async (emailOrPhone) => {
        const identity = normalizeLoginIdentity(emailOrPhone)
        if (!identity.ok) {
          return { ok: false as const, error: identity.error }
        }

        try {
          await sendLoginOtp(identity.value)
          set({ pendingLoginIdentity: identity.value })
          return { ok: true as const }
        } catch (error) {
          return {
            ok: false as const,
            error: apiErrorMessage(error, "Could not send code"),
          }
        }
      },

      confirmOtp: async (code, emailOrPhoneOverride) => {
        const emailOrPhone = emailOrPhoneOverride ?? get().pendingLoginIdentity
        if (!emailOrPhone) {
          return { ok: false as const, error: "Start login again and request a new code." }
        }

        const normalizedCode = normalizeOtpCode(code)
        if (normalizedCode.length !== 6) {
          return { ok: false as const, error: "Enter the 6-digit code" }
        }

        const result = await confirmLoginOtp(emailOrPhone, normalizedCode)
        if (!result.ok) {
          return { ok: false as const, error: result.error }
        }

        try {
          const user = await get().establishServerSession(result.tenant)
          set({
            user,
            accessToken: result.tenant.token,
            pendingLoginIdentity: null,
          })
          return { ok: true as const, user }
        } catch (error) {
          return {
            ok: false as const,
            error: publicError(
              error instanceof Error ? error.message : error,
              "Could not sign you in. Request a new code and try again."
            ),
          }
        }
      },

      establishServerSession: async (tenant) => {
        const res = await fetch("/api/auth/establish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            token: tenant.token,
            tenantId: tenant.tenantId,
            email: tenant.email,
            phoneE164: tenant.phoneE164,
            businessName: tenant.businessName,
            roles: tenant.roles,
            modules: tenant.modules,
          }),
        })
        const data = await readJsonObject(res)
        if (!res.ok || !data?.user) {
          throw new Error(
            publicError(
              data?.error,
              "Could not sign you in. Request a new code and try again."
            )
          )
        }
        const user = data.user as AuthUser
        set({
          user,
          accessToken: tenant.token,
          sessionExpiresAt:
            typeof data.sessionExpiresAt === "string" ? data.sessionExpiresAt : null,
        })
        void runDeltaSync({ full: true })
        return user
      },

      completePortalHandoff: async (accessToken) => {
        const res = await fetch("/api/auth/sso", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: accessToken }),
        })
        const data = await readJsonObject(res)
        if (!res.ok || !data?.user) {
          throw new Error(
            publicError(data?.error, "Sign-in link expired or invalid.")
          )
        }
        const user = data.user as AuthUser
        set({
          user,
          accessToken,
          sessionExpiresAt:
            typeof data.sessionExpiresAt === "string" ? data.sessionExpiresAt : null,
        })
        void runDeltaSync({ full: true })
        return user
      },

      logout: async () => {
        try {
          await fetch("/api/auth/logout", { method: "POST" })
        } catch {
          // ignore
        }
        set({
          user: null,
          accessToken: null,
          sessionExpiresAt: null,
          pendingLoginIdentity: null,
        })
      },
    }),
    {
      name: "biva-auth-v1",
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        sessionExpiresAt: state.sessionExpiresAt,
        pendingLoginIdentity: state.pendingLoginIdentity,
      }),
      onRehydrateStorage: () => (state) => {
        const expiresAt = state?.sessionExpiresAt
        const valid =
          Boolean(state?.user) &&
          hasSessionExpiry(expiresAt) &&
          !isSessionExpired(expiresAt)
        // Offline grace: an expired till keeps selling offline; sign-in is enforced once online.
        const offlineGrace =
          Boolean(state?.user) && typeof navigator !== "undefined" && !navigator.onLine
        useAuthStore.setState({
          ...(valid || offlineGrace
            ? {}
            : {
                user: null,
                accessToken: null,
                sessionExpiresAt: null,
              }),
          isHydrated: true,
        })
      },
    }
  )
)
