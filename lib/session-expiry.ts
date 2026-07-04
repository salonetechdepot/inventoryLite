/** Business-day session ends at this local hour (default 5 AM). */
const DEFAULT_CUTOFF_HOUR = 5
const DEFAULT_TIMEZONE = 'Africa/Freetown'

type ZonedParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function getSessionTimezone(): string {
  if (typeof window !== 'undefined') {
    return (
      process.env.NEXT_PUBLIC_SESSION_TIMEZONE?.trim() ||
      Intl.DateTimeFormat().resolvedOptions().timeZone ||
      DEFAULT_TIMEZONE
    )
  }
  return process.env.SESSION_TIMEZONE?.trim() || DEFAULT_TIMEZONE
}

export function getSessionCutoffHour(): number {
  const raw =
    typeof window !== 'undefined'
      ? process.env.NEXT_PUBLIC_SESSION_CUTOFF_HOUR
      : process.env.SESSION_CUTOFF_HOUR
  const hour = Number(raw ?? DEFAULT_CUTOFF_HOUR)
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : DEFAULT_CUTOFF_HOUR
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(date)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  let hour = pick('hour')
  if (hour === 24) hour = 0
  return {
    year: pick('year'),
    month: pick('month'),
    day: pick('day'),
    hour,
    minute: pick('minute'),
    second: pick('second'),
  }
}

function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string
): Date {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second)
  for (let i = 0; i < 4; i++) {
    const p = getZonedParts(new Date(utc), timeZone)
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second)
    const actualMs = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
    utc += targetMs - actualMs
  }
  return new Date(utc)
}

function addDaysInZone(
  year: number,
  month: number,
  day: number,
  days: number,
  timeZone: string
): Pick<ZonedParts, 'year' | 'month' | 'day'> {
  const anchor = zonedTimeToUtc(year, month, day, 12, 0, 0, timeZone)
  const future = new Date(anchor.getTime() + days * 86400000)
  const p = getZonedParts(future, timeZone)
  return { year: p.year, month: p.month, day: p.day }
}

/** Next business-day cutoff (e.g. today or tomorrow at 5:00 AM local). */
export function computeSessionExpiresAt(from: Date = new Date(), timeZone?: string): Date {
  const tz = timeZone ?? getSessionTimezone()
  const cutoffHour = getSessionCutoffHour()
  const now = getZonedParts(from, tz)

  let targetYear = now.year
  let targetMonth = now.month
  let targetDay = now.day

  if (now.hour >= cutoffHour) {
    const next = addDaysInZone(now.year, now.month, now.day, 1, tz)
    targetYear = next.year
    targetMonth = next.month
    targetDay = next.day
  }

  return zonedTimeToUtc(targetYear, targetMonth, targetDay, cutoffHour, 0, 0, tz)
}

export function sessionExpiresAtIso(expiresAt: Date): string {
  return expiresAt.toISOString()
}

export function hasSessionExpiry(
  expiresAt: string | number | Date | null | undefined
): boolean {
  if (expiresAt == null || expiresAt === '') return false
  if (expiresAt instanceof Date) return Number.isFinite(expiresAt.getTime())
  if (typeof expiresAt === 'number') return Number.isFinite(expiresAt)
  return Number.isFinite(new Date(expiresAt).getTime())
}

/** True only when expiry is known and already passed. */
export function isSessionExpired(
  expiresAt: string | number | Date | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!hasSessionExpiry(expiresAt)) return false
  const ms =
    expiresAt instanceof Date
      ? expiresAt.getTime()
      : typeof expiresAt === 'number'
        ? expiresAt
        : new Date(expiresAt as string).getTime()
  return nowMs >= ms
}

/** Clear cached/offline sessions with missing or past expiry. */
export function shouldClearStoredSession(
  expiresAt: string | number | Date | null | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!hasSessionExpiry(expiresAt)) return true
  return isSessionExpired(expiresAt, nowMs)
}

export function secondsUntilExpiry(expiresAt: Date, nowMs: number = Date.now()): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - nowMs) / 1000))
}
