"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"

function SessionExpiredNoticeInner() {
  const searchParams = useSearchParams()
  if (searchParams.get("reason") !== "session_expired") return null

  return (
    <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-center text-foreground">
      Your session ended at 5:00 AM. Sign in again to start today&apos;s shop day.
    </div>
  )
}

export function SessionExpiredNotice() {
  return (
    <Suspense fallback={null}>
      <SessionExpiredNoticeInner />
    </Suspense>
  )
}
