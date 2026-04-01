import { cookies } from 'next/headers'
import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'
import { sql } from './db'

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-in-production'
)

export interface User {
  id: string
  email: string
  business_name: string
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

// Create JWT token
export async function createToken(payload: Omit<SessionPayload, 'expiresAt'>): Promise<string> {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
  
  return new SignJWT({ ...payload, expiresAt })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
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
    maxAge: 7 * 24 * 60 * 60, // 7 days
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
  
  const result = await sql`
    SELECT id, email, business_name, created_at 
    FROM users 
    WHERE id = ${session.userId}
  `
  
  return result[0] as User | undefined ?? null
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
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()}`
    if (existing.length > 0) {
      return { success: false, error: 'Email already registered' }
    }
    
    // Hash password and create user
    const passwordHash = await hashPassword(password)
    const result = await sql`
      INSERT INTO users (email, password_hash, business_name)
      VALUES (${email.toLowerCase()}, ${passwordHash}, ${businessName})
      RETURNING id, email, business_name, created_at
    `
    
    const user = result[0] as User
    
    // Create default categories for the user
    await sql`
      INSERT INTO categories (user_id, name, icon, is_default)
      VALUES 
        (${user.id}, 'Food & Drinks', 'utensils', true),
        (${user.id}, 'Electronics', 'smartphone', true),
        (${user.id}, 'Clothing', 'shirt', true),
        (${user.id}, 'Household', 'home', true),
        (${user.id}, 'Other', 'package', true)
    `
    
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
    const result = await sql`
      SELECT id, email, password_hash, business_name, created_at 
      FROM users 
      WHERE email = ${email.toLowerCase()}
    `
    
    if (result.length === 0) {
      return { success: false, error: 'Invalid email or password' }
    }
    
    const user = result[0] as User & { password_hash: string }
    const isValid = await verifyPassword(password, user.password_hash)
    
    if (!isValid) {
      return { success: false, error: 'Invalid email or password' }
    }
    
    // Create session
    await createSession(user)
    
    return { 
      success: true, 
      user: {
        id: user.id,
        email: user.email,
        business_name: user.business_name,
        created_at: user.created_at
      }
    }
  } catch (error) {
    console.error('Login error:', error)
    return { success: false, error: 'Login failed' }
  }
}
