import { NextResponse } from 'next/server'
import { registerUser, createSession } from '@/lib/auth'

export async function POST(request: Request) {
  try {
    const { email, password, businessName } = await request.json()
    
    if (!email || !password || !businessName) {
      return NextResponse.json(
        { error: 'All fields are required' },
        { status: 400 }
      )
    }
    
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }
    
    const result = await registerUser(email, password, businessName)
    
    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      )
    }
    
    // Create session for the new user
    if (result.user) {
      await createSession(result.user)
    }
    
    return NextResponse.json({ 
      success: true, 
      user: result.user 
    })
  } catch (error) {
    console.error('Register API error:', error)
    return NextResponse.json(
      { error: 'An error occurred during registration' },
      { status: 500 }
    )
  }
}
