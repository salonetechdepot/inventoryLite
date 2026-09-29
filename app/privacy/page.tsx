import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getAppDisplayName, getPrivacyContactEmail } from '@/lib/site'

export const metadata: Metadata = {
  title: `Privacy Policy | ${getAppDisplayName()}`,
  description: 'How BIVA collects, uses, and protects your information.',
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

export default function PrivacyPolicyPage() {
  const appName = getAppDisplayName()
  const contactEmail = getPrivacyContactEmail()
  const effectiveDate = '19 May 2026'

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 pb-16">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">
              <ArrowLeft className="mr-2 size-4" />
              Back
            </Link>
          </Button>
        </div>

        <div className="mb-8 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-full bg-primary">
            <Package className="size-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
            <p className="text-sm text-muted-foreground">
              {appName} · Effective {effectiveDate}
            </p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-base font-medium text-muted-foreground">
              This policy explains what information we collect when you use {appName},
              how we use it, and the choices you have. {appName} is inventory and
              point-of-sale software aimed at small businesses, including in Sierra Leone.
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-8">
            <Section title="1. Who we are">
              <p>
                {appName} (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) operates the
                inventory management service you sign in to. The business or person
                who hosts or deploys {appName} for your organisation is the{' '}
                <strong className="font-medium text-foreground">service operator</strong>.
                This policy describes how the service handles data on behalf of your account.
              </p>
            </Section>

            <Section title="2. Information we collect">
              <p>
                <strong className="font-medium text-foreground">Account information.</strong>{' '}
                When you register or sign in, we collect your business name, email address,
                and/or mobile phone number (in E.164 format). We use one-time verification
                codes sent via SMS or email — we do not ask you to create or use a password
                for day-to-day sign-in.
              </p>
              <p>
                <strong className="font-medium text-foreground">Business and inventory data.</strong>{' '}
                You may store product names, quantities, prices, cost prices, categories,
                barcodes or scan codes, tags, specifications (such as brand, model, size, or
                color), product images, and stock alerts. This data is tied to your account
                and used to run inventory, sales, returns, and reports.
              </p>
              <p>
                <strong className="font-medium text-foreground">Sales and customer data.</strong>{' '}
                When you record a sale or return, we store transaction details such as items
                sold, amounts, discounts, payments, return conditions, and optional customer
                name or phone number that you enter. You control what customer details you
                add.
              </p>
              <p>
                <strong className="font-medium text-foreground">Shop branding.</strong>{' '}
                You may upload a shop logo and choose theme preferences. Logo images are
                stored so they can be shown in your account and on receipts where applicable.
              </p>
              <p>
                <strong className="font-medium text-foreground">Authentication data.</strong>{' '}
                We store hashed verification codes and related metadata (such as expiry time
                and attempt counts) only long enough to complete sign-in, registration, or
                contact updates. Session cookies keep you signed in on your device for a
                configurable period (by default, up to one year).
              </p>
              <p>
                <strong className="font-medium text-foreground">Data on your device.</strong>{' '}
                {appName} can work offline. Your browser may store cached products, sales,
                receipts, and analytics in local storage (IndexedDB) and queue changes to
                sync when you are back online. This data stays on your device unless you
                clear site data or uninstall the app.
              </p>
              <p>
                <strong className="font-medium text-foreground">Usage analytics.</strong>{' '}
                If enabled by the deployment, we may collect anonymous, aggregated usage
                events (for example, page views) through our hosting provider&apos;s
                analytics tools. These events are not used to sell your inventory or
                customer data.
              </p>
            </Section>

            <Section title="3. How we use your information">
              <ul className="list-disc space-y-2 pl-5">
                <li>Create and secure your account and keep you signed in</li>
                <li>Send one-time codes for login, registration, and contact verification</li>
                <li>Provide inventory, sales, returns, receipts, and reporting features</li>
                <li>Sync your data when you use the app online or after working offline</li>
                <li>Protect against abuse (for example, limiting how often codes can be sent)</li>
                <li>Improve reliability and fix errors</li>
              </ul>
              <p>
                We do not sell your personal information. We do not use your product or
                customer lists for advertising to third parties.
              </p>
            </Section>

            <Section title="4. Legal bases (where applicable)">
              <p>
                Depending on your location, we process personal data because it is necessary
                to perform our contract with you (providing the service), because you have
                consented (for example, when you enter customer details or upload images), or
                because we have a legitimate interest in securing and improving the service
                (such as fraud prevention and rate limiting).
              </p>
            </Section>

            <Section title="5. Third-party services">
              <p>
                To run {appName}, data may be processed by trusted providers that help us
                deliver the service, including:
              </p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong className="font-medium text-foreground">Twilio</strong> —
                  to deliver one-time sign-in and verification codes by SMS to your phone
                  number
                </li>
                <li>
                  <strong className="font-medium text-foreground">Resend</strong> — to send
                  one-time codes and related messages to your email address
                </li>
                <li>
                  <strong className="font-medium text-foreground">Hosting and storage</strong>{' '}
                  — for example, database hosting, application hosting, private image storage,
                  and optional privacy-friendly analytics
                </li>
              </ul>
              <p>
                These providers process data only as needed to perform their role. Their own
                privacy policies also apply to how they handle information on their systems.
              </p>
            </Section>

            <Section title="6. How long we keep data">
              <p>
                We keep your account and business data while your account is active. If you
                or the service operator delete your account, associated business data is
                removed from our systems subject to reasonable backup retention periods.
              </p>
              <p>
                One-time verification codes are deleted after use or shortly after they
                expire. Server logs and security records may be kept for a limited time for
                troubleshooting and abuse prevention.
              </p>
            </Section>

            <Section title="7. Security">
              <p>
                We use technical and organisational measures appropriate to the service,
                including encrypted connections (HTTPS), hashed verification codes, and
                access controls so each account can only access its own data. No method of
                transmission or storage is completely secure; please use a strong device
                lock and sign out on shared devices.
              </p>
            </Section>

            <Section title="8. Your rights and choices">
              <p>You can:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Update your business name, theme, logo, email, or phone from Account settings (email/phone changes require verification)</li>
                <li>Export or review your business data through the app while signed in</li>
                <li>Sign out to end your session on the current device</li>
                <li>Clear local offline data by clearing your browser&apos;s site data for {appName}</li>
                <li>Request access, correction, or deletion of your account data by contacting us (see below)</li>
              </ul>
              <p>
                If you enter customer names or phone numbers, you are responsible for
                telling those customers how you use their information and obtaining any
                consent required by local law.
              </p>
            </Section>

            <Section title="9. Children">
              <p>
                {appName} is intended for business use and is not directed at children under
                16. We do not knowingly collect personal information from children.
              </p>
            </Section>

            <Section title="10. International transfers">
              <p>
                Your data may be stored or processed in countries other than where you live
                (for example, where our hosting or messaging providers operate). Where
                required, appropriate safeguards are used for such transfers.
              </p>
            </Section>

            <Section title="11. Changes to this policy">
              <p>
                We may update this policy from time to time. We will post the revised version
                on this page and update the effective date. Continued use of {appName} after
                changes take effect means you accept the updated policy.
              </p>
            </Section>

            <Section title="12. Contact us">
              <p>
                For privacy questions, data access requests, or to report a concern:
              </p>
              {contactEmail ? (
                <p>
                  Email:{' '}
                  <a
                    href={`mailto:${contactEmail}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {contactEmail}
                  </a>
                </p>
              ) : (
                <p>
                  Contact the operator of the {appName} instance you use, or set a{' '}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">PRIVACY_CONTACT_EMAIL</code>{' '}
                  environment variable on your deployment so this page shows a direct address.
                </p>
              )}
            </Section>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
