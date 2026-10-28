import { execSync } from "node:child_process"

function run(command) {
  console.log(`> ${command}`)
  execSync(command, { stdio: "inherit", env: process.env })
}

run("npx prisma generate")

const databaseUrl = process.env.DATABASE_URL?.trim()
if (!databaseUrl) {
  console.error(
    "\n[vercel-build] DATABASE_URL is missing. Add it in the host → Environment Variables (Production).\n"
  )
  process.exit(1)
}

// Shared main-app database: do not run `prisma migrate deploy`. Those older
// migrations create separate users/products tables. Lite tables are applied
// once with prisma/migrations/20260720120000_shared_main_db_lite/migration.sql.

run("npx next build")
