"use client"

import { useEffect, useState } from "react"
import { CloudUpload } from "lucide-react"
import { getDeviceQueuedMutationCount } from "@/lib/offline-sync"

/** Reassures the cashier that sales saved offline survive signing in again. */
export function LoginPendingSyncNotice() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    void getDeviceQueuedMutationCount()
      .then(setCount)
      .catch(() => setCount(0))
  }, [])

  if (count === 0) return null

  return (
    <div className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm flex gap-2 items-start">
      <CloudUpload className="size-4 shrink-0 mt-0.5 text-primary" />
      <p>
        {count} change{count === 1 ? " is" : "s are"} saved on this device. Sign in with the
        same shop account and {count === 1 ? "it" : "they"} will be sent automatically.
      </p>
    </div>
  )
}
