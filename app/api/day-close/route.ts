import { NextResponse } from "next/server"
import { z } from "zod"
import { getApiSession } from "@/lib/api-session"
import { prisma } from "@/lib/prisma"
import { moneySchema, parseJsonBody } from "@/lib/api-validation"
import {
  buildCloseSnapshot,
  businessDateToUtcDate,
  businessDayUtcRange,
  emptyMethodTotals,
  formatBusinessDateLabel,
  getBusinessDateKey,
  normalizeMethodTotals,
  roundMoney,
  sumMethodTotals,
} from "@/lib/day-close"
import { normalizePaymentMethod } from "@/lib/payment-methods"
import { getSessionTimezone } from "@/lib/session-expiry"

export const dynamic = "force-dynamic"

const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

const dayCloseCreateSchema = z.object({
  businessDate: dateKeySchema.optional(),
  countedByMethod: z.record(z.string(), moneySchema).default({}),
  countedCash: moneySchema.optional(),
  notes: z.string().trim().max(500).nullish(),
})

function formatDayClose(row: {
  id: string
  businessDate: Date
  expectedByMethod: unknown
  countedByMethod: unknown
  expectedCash: { toString(): string } | number
  countedCash: { toString(): string } | number
  cashVariance: { toString(): string } | number
  expectedTotal: { toString(): string } | number
  countedTotal: { toString(): string } | number
  totalVariance: { toString(): string } | number
  changeGivenTotal: { toString(): string } | number
  saleCount: number
  returnCount: number
  paymentCount: number
  notes: string | null
  closedAt: Date
  createdAt: Date
  updatedAt: Date
}) {
  const dateKey = row.businessDate.toISOString().slice(0, 10)
  return {
    id: row.id,
    business_date: dateKey,
    business_date_label: formatBusinessDateLabel(dateKey),
    expected_by_method: normalizeMethodTotals(row.expectedByMethod),
    counted_by_method: normalizeMethodTotals(row.countedByMethod),
    expected_cash: Number(row.expectedCash),
    counted_cash: Number(row.countedCash),
    cash_variance: Number(row.cashVariance),
    expected_total: Number(row.expectedTotal),
    counted_total: Number(row.countedTotal),
    total_variance: Number(row.totalVariance),
    change_given_total: Number(row.changeGivenTotal),
    sale_count: row.saleCount,
    return_count: row.returnCount,
    payment_count: row.paymentCount,
    notes: row.notes,
    closed_at: row.closedAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }
}

async function computeExpectedForDay(tenantId: string, dateKey: string) {
  const timeZone = getSessionTimezone()
  const { start, end } = businessDayUtcRange(dateKey, timeZone)

  const [payments, saleReceipts, returnReceipts] = await Promise.all([
    prisma.payment.findMany({
      where: {
        tenantId,
        createdAt: { gte: start, lt: end },
      },
      select: {
        amount: true,
        method: true,
        receipt: { select: { type: true } },
      },
    }),
    prisma.receipt.count({
      where: {
        tenantId,
        type: "SALE",
        createdAt: { gte: start, lt: end },
      },
    }),
    prisma.receipt.count({
      where: {
        tenantId,
        type: "RETURN",
        createdAt: { gte: start, lt: end },
      },
    }),
  ])

  const changeAgg = await prisma.receipt.aggregate({
    where: {
      tenantId,
      type: "SALE",
      createdAt: { gte: start, lt: end },
    },
    _sum: { changeGiven: true },
  })

  const expectedByMethod = emptyMethodTotals()
  for (const payment of payments) {
    const method = normalizePaymentMethod(payment.method)
    if (method === "credit") continue
    const sign = payment.receipt.type === "RETURN" ? -1 : 1
    const amount = roundMoney(Math.max(0, Number(payment.amount)) * sign)
    expectedByMethod[method] = roundMoney((expectedByMethod[method] || 0) + amount)
  }
  for (const key of Object.keys(expectedByMethod)) {
    expectedByMethod[key] = roundMoney(Math.max(0, expectedByMethod[key] || 0))
  }

  return {
    dateKey,
    start: start.toISOString(),
    end: end.toISOString(),
    expectedByMethod,
    expectedCash: roundMoney(expectedByMethod.cash || 0),
    expectedTotal: roundMoney(sumMethodTotals(expectedByMethod)),
    changeGivenTotal: roundMoney(Number(changeAgg._sum.changeGiven || 0)),
    saleCount: saleReceipts,
    returnCount: returnReceipts,
    paymentCount: payments.length,
  }
}

export async function GET(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const { searchParams } = new URL(request.url)
    const rawDate = searchParams.get("date")
    const dateKey = rawDate?.trim() || getBusinessDateKey()
    const parsedDate = dateKeySchema.safeParse(dateKey)
    if (!parsedDate.success) {
      return NextResponse.json({ error: "Invalid date. Use YYYY-MM-DD." }, { status: 400 })
    }

    const expected = await computeExpectedForDay(session.tenantId, parsedDate.data)
    const businessDate = businessDateToUtcDate(parsedDate.data)

    const [existing, recent] = await Promise.all([
      prisma.dayClose.findUnique({
        where: {
          tenantId_businessDate: {
            tenantId: session.tenantId,
            businessDate,
          },
        },
      }),
      prisma.dayClose.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { businessDate: "desc" },
        take: 30,
      }),
    ])

    return NextResponse.json({
      business_date: parsedDate.data,
      business_date_label: formatBusinessDateLabel(parsedDate.data),
      expected_by_method: expected.expectedByMethod,
      expected_cash: expected.expectedCash,
      expected_total: expected.expectedTotal,
      change_given_total: expected.changeGivenTotal,
      sale_count: expected.saleCount,
      return_count: expected.returnCount,
      payment_count: expected.paymentCount,
      range_start: expected.start,
      range_end: expected.end,
      existing_close: existing ? formatDayClose(existing) : null,
      recent_closes: recent.map(formatDayClose),
    })
  } catch (error) {
    console.error("Day close GET error:", error)
    return NextResponse.json({ error: "Failed to load day close" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const sessionResult = await getApiSession()
    if (sessionResult instanceof NextResponse) return sessionResult
    const session = sessionResult

    const parsed = await parseJsonBody(request, dayCloseCreateSchema)
    if (!parsed.ok) return parsed.response

    const dateKey = parsed.data.businessDate || getBusinessDateKey()
    const expected = await computeExpectedForDay(session.tenantId, dateKey)

    const countedInput = {
      ...expected.expectedByMethod,
      ...parsed.data.countedByMethod,
    }
    if (parsed.data.countedCash !== undefined) {
      countedInput.cash = parsed.data.countedCash
    }

    const snapshot = buildCloseSnapshot({
      expectedByMethod: expected.expectedByMethod,
      countedByMethod: countedInput,
    })

    const businessDate = businessDateToUtcDate(dateKey)
    const now = new Date()

    const saved = await prisma.dayClose.upsert({
      where: {
        tenantId_businessDate: {
          tenantId: session.tenantId,
          businessDate,
        },
      },
      create: {
        tenantId: session.tenantId,
        businessDate,
        expectedByMethod: snapshot.expectedByMethod,
        countedByMethod: snapshot.countedByMethod,
        expectedCash: snapshot.expectedCash,
        countedCash: snapshot.countedCash,
        cashVariance: snapshot.cashVariance,
        expectedTotal: snapshot.expectedTotal,
        countedTotal: snapshot.countedTotal,
        totalVariance: snapshot.totalVariance,
        changeGivenTotal: expected.changeGivenTotal,
        saleCount: expected.saleCount,
        returnCount: expected.returnCount,
        paymentCount: expected.paymentCount,
        notes: parsed.data.notes?.trim() || null,
        closedAt: now,
      },
      update: {
        expectedByMethod: snapshot.expectedByMethod,
        countedByMethod: snapshot.countedByMethod,
        expectedCash: snapshot.expectedCash,
        countedCash: snapshot.countedCash,
        cashVariance: snapshot.cashVariance,
        expectedTotal: snapshot.expectedTotal,
        countedTotal: snapshot.countedTotal,
        totalVariance: snapshot.totalVariance,
        changeGivenTotal: expected.changeGivenTotal,
        saleCount: expected.saleCount,
        returnCount: expected.returnCount,
        paymentCount: expected.paymentCount,
        notes: parsed.data.notes?.trim() || null,
        closedAt: now,
      },
    })

    return NextResponse.json({
      success: true,
      close: formatDayClose(saved),
    })
  } catch (error) {
    console.error("Day close POST error:", error)
    return NextResponse.json({ error: "Failed to save day close" }, { status: 500 })
  }
}
