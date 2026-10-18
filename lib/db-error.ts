import { Prisma } from '@prisma/client'

/** Turn a database failure into a message a shop owner can act on. */
export function describeDbError(error: unknown, fallback: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return 'This record already exists on the server. Refresh and try again.'
      case 'P2003':
        return 'A linked record (shop or product) is missing on the server. Sign in again, then retry.'
      case 'P2011':
      case 'P2012': {
        const field = (error.meta?.constraint ?? error.meta?.target ?? '') as string
        return field
          ? `${fallback}: the server needs a value for ${String(field)}.`
          : `${fallback}: a required field was empty.`
      }
      case 'P2025':
        return 'A product or receipt in this checkout no longer exists. Refresh and try again.'
      default:
        return `${fallback} (database error ${error.code}).`
    }
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return `${fallback}: the request did not match the database.`
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return 'The database is unreachable right now. Your sale will be kept so you can retry.'
  }
  return fallback
}
