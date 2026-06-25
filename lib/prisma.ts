import { PrismaClient } from '@prisma/client'
import { validateServerEnv } from './env'

export type { Prisma } from '@prisma/client'

validateServerEnv()

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
