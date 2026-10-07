import { randomBytes } from 'crypto'

/** Main-app entity ids (varchar 64). */
export function newEntityId(byteLength = 16): string {
  return randomBytes(byteLength).toString('hex')
}
