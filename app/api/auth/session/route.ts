import { NextResponse } from 'next/server'
import { getSession, getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const session = await getSession()
    
    if (!session) {
      return NextResponse.json({ user: null })
    }
    
    const user = await getCurrentUser()
    
    return NextResponse.json({ user })
  } catch (error) {
    console.error('Session API error:', error)
    return NextResponse.json({ user: null })
  }
}
