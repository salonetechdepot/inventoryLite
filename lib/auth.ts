import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'
import { getJwtSecret } from './env'

const JWT_SECRET = new TextEncoder().encode(getJwtSecret())

export interface User {
  id: string
  email: string
  phone_e164?: string | null
  business_name: string
  theme_color?: string | null
  shop_logo_url?: string | null
  created_at: Date
}

export interface SessionPayload {
  userId: string
  email: string
  businessName: string
  expiresAt: Date
}

// Hash password
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

// Verify password
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

function sessionMaxAgeSeconds(): number {
  const days = Number(process.env.SESSION_MAX_AGE_DAYS || '365')
  const safeDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 365
  return safeDays * 24 * 60 * 60
}

function sessionMaxAgeLabel(): string {
  const seconds = sessionMaxAgeSeconds()
  return `${Math.floor(seconds / 86400)}d`
}

// Create JWT token
export async function createToken(payload: Omit<SessionPayload, 'expiresAt'>): Promise<string> {
  const expiresAt = new Date(Date.now() + sessionMaxAgeSeconds() * 1000)

  return new SignJWT({ ...payload, expiresAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(sessionMaxAgeLabel())
    .sign(JWT_SECRET)
}

// Verify JWT token
export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

// Create session (set cookie)
export async function createSession(user: User): Promise<void> {
  const token = await createToken({
    userId: user.id,
    email: user.email,
    businessName: user.business_name,
  })
  
  const cookieStore = await cookies()
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: sessionMaxAgeSeconds(),
    path: '/',
  })
}

// Get current session
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get('session')?.value
  
  if (!token) return null
  
  return verifyToken(token)
}

// Get current user from database
export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession()
  if (!session) return null
  
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      phoneE164: true,
      businessName: true,
      themeColor: true,
      shopLogoUrl: true,
      createdAt: true
    }
  })

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
    phone_e164: user.phoneE164,
    business_name: user.businessName,
    theme_color: user.themeColor,
    shop_logo_url: user.shopLogoUrl,
    created_at: user.createdAt ?? new Date()
  }
}

// Logout (clear session)
export async function logout(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete('session')
}

// Register new user
export async function registerUser(
  email: string,
  password: string,
  businessName: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    // Check if user exists
    const existing = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true }
    })
    if (existing) {
      return { success: false, error: 'Email already registered' }
    }
    
    // Hash password and create user
    const passwordHash = await hashPassword(password)
    const createdUser = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        businessName
      },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        businessName: true,
        themeColor: true,
        shopLogoUrl: true,
        createdAt: true
      }
    })

    const user: User = {
      id: createdUser.id,
      email: createdUser.email,
      phone_e164: createdUser.phoneE164,
      business_name: createdUser.businessName,
      theme_color: createdUser.themeColor,
      shop_logo_url: createdUser.shopLogoUrl,
      created_at: createdUser.createdAt ?? new Date()
    }
    
    // Create default categories for the user
    await prisma.category.createMany({
      data: [
        { userId: user.id, name: 'Food & Drinks', icon: 'utensils', isDefault: true },
        { userId: user.id, name: 'Electronics', icon: 'smartphone', isDefault: true },
        { userId: user.id, name: 'Clothing', icon: 'shirt', isDefault: true },
        { userId: user.id, name: 'Household', icon: 'home', isDefault: true },
        { userId: user.id, name: 'Other', icon: 'package', isDefault: true }
      ]
    })
    
    return { success: true, user }
  } catch (error) {
    console.error('Registration error:', error)
    return { success: false, error: 'Failed to create account' }
  }
}

// Login user
export async function loginUser(
  email: string,
  password: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        passwordHash: true,
        businessName: true,
        themeColor: true,
        shopLogoUrl: true,
        createdAt: true
      }
    })

    if (!user) {
      return { success: false, error: 'Invalid email or password' }
    }
    
    const isValid = await verifyPassword(password, user.passwordHash)
    
    if (!isValid) {
      return { success: false, error: 'Invalid email or password' }
    }
    
    // Create session
    await createSession({
      id: user.id,
      email: user.email,
      business_name: user.businessName,
      theme_color: user.themeColor,
      shop_logo_url: user.shopLogoUrl,
      created_at: user.createdAt ?? new Date()
    })
    
    return { 
      success: true, 
      user: {
        id: user.id,
        email: user.email,
        phone_e164: user.phoneE164,
        business_name: user.businessName,
        created_at: user.createdAt ?? new Date()
      }
    }
  } catch (error) {
    console.error('Login error:', error)
    return { success: false, error: 'Login failed' }
  }
}

/** Internal email placeholder for phone-only sign-up (still unique in DB). */
export function syntheticEmailFromPhoneE164(phoneE164: string): string {
  const digits = phoneE164.replace(/\D/g, '')
  return `p${digits}@phone.sl`
}

export function isSyntheticPhoneEmail(email: string): boolean {
  return email.toLowerCase().endsWith('@phone.sl')
}

/** After email OTP verification — passwordless account. */
export async function registerUserWithVerifiedEmail(
  email: string,
  businessName: string
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const normalized = email.toLowerCase().trim()
    if (isSyntheticPhoneEmail(normalized)) {
      return { success: false, error: 'Use WhatsApp sign-up for phone-only accounts' }
    }

    const existing = await prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true },
    })
    if (existing) {
      return { success: false, error: 'Email already registered' }
    }

    const passwordHash = await hashPassword(
      `${Date.now()}:${normalized}:${Math.random().toString(36).slice(2)}`
    )

    const createdUser = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash,
        businessName: businessName.trim(),
      },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        businessName: true,
        themeColor: true,
        shopLogoUrl: true,
        createdAt: true,
      },
    })

    const user: User = {
      id: createdUser.id,
      email: createdUser.email,
      phone_e164: createdUser.phoneE164,
      business_name: createdUser.businessName,
      theme_color: createdUser.themeColor,
      shop_logo_url: createdUser.shopLogoUrl,
      created_at: createdUser.createdAt ?? new Date(),
    }

    await prisma.category.createMany({
      data: [
        { userId: user.id, name: 'Food & Drinks', icon: 'utensils', isDefault: true },
        { userId: user.id, name: 'Electronics', icon: 'smartphone', isDefault: true },
        { userId: user.id, name: 'Clothing', icon: 'shirt', isDefault: true },
        { userId: user.id, name: 'Household', icon: 'home', isDefault: true },
        { userId: user.id, name: 'Other', icon: 'package', isDefault: true },
      ],
    })

    return { success: true, user }
  } catch (error) {
    console.error('Email registration error:', error)
    return { success: false, error: 'Failed to create account' }
  }
}

/** After WhatsApp OTP verification — creates shop defaults like email registration. */
export async function registerUserWithVerifiedPhone(
  phoneE164: string,
  businessName: string,
  password?: string | null
): Promise<{ success: boolean; user?: User; error?: string }> {
  try {
    const existingPhone = await prisma.user.findUnique({
      where: { phoneE164 },
      select: { id: true },
    })
    if (existingPhone) {
      return { success: false, error: 'This number is already registered' }
    }

    const email = syntheticEmailFromPhoneE164(phoneE164)
    const existingEmail = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    })
    if (existingEmail) {
      return { success: false, error: 'Could not create account for this number' }
    }

    let passwordHash: string
    if (password && password.length >= 6) {
      passwordHash = await hashPassword(password)
    } else {
      passwordHash = await hashPassword(
        `${Date.now()}:${phoneE164}:${Math.random().toString(36).slice(2)}`
      )
    }

    const createdUser = await prisma.user.create({
      data: {
        email,
        phoneE164,
        passwordHash,
        businessName: businessName.trim(),
      },
      select: {
        id: true,
        email: true,
        phoneE164: true,
        businessName: true,
        themeColor: true,
        shopLogoUrl: true,
        createdAt: true,
      },
    })

    const user: User = {
      id: createdUser.id,
      email: createdUser.email,
      phone_e164: createdUser.phoneE164,
      business_name: createdUser.businessName,
      theme_color: createdUser.themeColor,
      shop_logo_url: createdUser.shopLogoUrl,
      created_at: createdUser.createdAt ?? new Date(),
    }

    await prisma.category.createMany({
      data: [
        { userId: user.id, name: 'Food & Drinks', icon: 'utensils', isDefault: true },
        { userId: user.id, name: 'Electronics', icon: 'smartphone', isDefault: true },
        { userId: user.id, name: 'Clothing', icon: 'shirt', isDefault: true },
        { userId: user.id, name: 'Household', icon: 'home', isDefault: true },
        { userId: user.id, name: 'Other', icon: 'package', isDefault: true },
      ],
    })

    return { success: true, user }
  } catch (error) {
    console.error('Phone registration error:', error)
    return { success: false, error: 'Failed to create account' }
  }
}
