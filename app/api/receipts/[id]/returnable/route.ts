import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getReturnableLinesForReceipt } from '@/lib/return-from-sale'

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await context.params
    const result = await getReturnableLinesForReceipt(session.userId, id)

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
