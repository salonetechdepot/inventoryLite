import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PrismaClient } from '@prisma/client'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
if (!process.env.DATABASE_URL) {
  const envPath = path.join(root, '.env')
  const text = readFileSync(envPath, 'utf8')
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^DATABASE_URL=(.*)$/)
    if (!m) continue
    let val = m[1].trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    process.env.DATABASE_URL = val
    break
  }
}

const url = process.env.DATABASE_URL ?? ''
console.log('DATABASE_URL loaded:', url ? `${url.slice(0, 35)}...${url.slice(-25)}` : '(missing)')
console.log('Has channel_binding:', url.includes('channel_binding'))
console.log('Has stray psql:', url.includes('psql'))

const prisma = new PrismaClient()
try {
  const rows = await prisma.$queryRaw`SELECT current_user AS user, current_database() AS db`
  console.log('Prisma connect OK:', rows)
} catch (e) {
  console.error('Prisma connect FAIL:', e.message)
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
