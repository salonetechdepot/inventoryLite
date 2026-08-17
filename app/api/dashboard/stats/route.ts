import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { loadDashboardStatsForTenant } from '@/lib/server/dashboard-stats'

export async function GET() {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const payload = await loadDashboardStatsForTenant(session.tenantId)
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 })
  }
}
