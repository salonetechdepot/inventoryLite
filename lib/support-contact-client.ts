import type { SupportContact } from '@/lib/tenant-lock'

/** Client-safe defaults until session API returns env-backed support details. */
export function getSupportContact(): SupportContact {
  return {
    phone: '—',
    email: '—',
    whatsapp: '—',
  }
}
