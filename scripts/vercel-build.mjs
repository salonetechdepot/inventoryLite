import { execSync } from "node:child_process"

function run(command) {
  console.log(`> ${command}`)
  execSync(command, { stdio: "inherit", env: process.env })
}

run("npx prisma generate")

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error(
    "\n[vercel-build] DATABASE_URL is missing. Add it in Vercel → Project → Settings → Environment Variables (Production).\n"
  )
  process.exit(1)
}

try {
  run("npx prisma migrate deploy")
} catch {
  console.error(
    "\n[vercel-build] prisma migrate deploy failed. Wake Neon (free tier), verify DATABASE_URL, then redeploy.\n"
  )
  process.exit(1)
}

run("npx next build")
