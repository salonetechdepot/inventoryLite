const TECHNICAL =
  /json\.parse|unexpected character|unexpected token|is not valid json|syntaxerror|<!doctype|<html|failed to execute/i

/** User-facing copy. Drops parser and HTML errors so they never land on a form. */
export function publicError(message: unknown, fallback: string): string {
  const text = typeof message === 'string' ? message.trim() : ''
  if (!text || text.length > 240 || TECHNICAL.test(text)) return fallback
  return text
}
