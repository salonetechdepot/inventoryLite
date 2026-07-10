'use client'

import { useEffect, useState } from 'react'
import { AccountLockedView } from '@/components/account-locked-view'
import type { SupportContact } from '@/lib/tenant-lock'
import { getSupportContact } from '@/lib/support-contact-client'

export default function AccountLockedPage() {
  const [support, setSupport] = useState<SupportContact>(() => getSupportContact())
  const [reason, setReason] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/auth/session', { credentials: 'same-origin' })
        const data = await res.json()
        if (data?.support) setSupport(data.support)
        if (data?.lock?.lockedReason) setReason(data.lock.lockedReason)
      } catch {
        // Keep placeholder support details.
      }
    })()
  }, [])

  return <AccountLockedView support={support} reason={reason} />
}
