import { NextResponse } from 'next/server'
import { getApiSession } from '@/lib/api-session'
import { getReturnableLinesForReceipt } from '@/lib/return-from-sale'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { id } = await context.params
    const result = await getReturnableLinesForReceipt(session.tenantId, id)

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      original_receipt_id: id,
      original_receipt: result.original_receipt,
      customer_name: result.customer_name,
      customer_phone: result.customer_phone,
      lines: result.lines,
    })
  } catch (error) {
    console.error('Returnable lines error:', error)
    return NextResponse.json({ error: 'Failed to load returnable items' }, { status: 500 })
  }
}
