import { Mail, MessageCircle, Phone, ShieldAlert } from 'lucide-react'
import type { SupportContact } from '@/lib/tenant-lock'

type Props = {
  support: SupportContact
  reason?: string | null
}

export function AccountLockedView({ support, reason }: Props) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-sm space-y-5 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <ShieldAlert className="size-7 text-destructive" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold">Account locked</h1>
          <p className="text-sm text-muted-foreground">
            Please contact Roarbyte Support to restore access to this account.
          </p>
          {reason ? (
            <p className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/40">
              {reason}
            </p>
          ) : null}
        </div>

        <div className="text-left space-y-3 rounded-lg border p-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Roarbyte Support
          </p>
          <div className="flex items-center gap-3">
            <Phone className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Phone</p>
              <p className="font-medium">{support.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">Email</p>
              <p className="font-medium break-all">{support.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <MessageCircle className="size-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">WhatsApp</p>
              <p className="font-medium">{support.whatsapp}</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
