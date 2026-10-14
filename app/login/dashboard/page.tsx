import { LoginPageContent } from "@/components/login-page-content"

/** Portal compatibility: main app may redirect to /login/dashboard?token=… */
export default function LoginDashboardPortalPage() {
  return <LoginPageContent />
}
