import type { ServerResponse } from 'node:http'

/**
 * Demonstrates the fix. Only used for requests that carry the `repro-fix=path` cookie (`npm run flow:path-bug:with-fix`).
 *
 * Amplify deletes cookies with `Set-Cookie: <name>=;Expires=<past>` and no `Path`, so the browser applies the request's
 * default path and the deletion misses the `Path=/` cookie on `/_next/data/...` and nested URLs. This adds a `Path=/`
 * copy right after each such deletion and keeps the original, which still clears cookies scoped to the current path.
 *
 * Names that the same response also sets are left alone: there the deletion only precedes the new value (Amplify's
 * `setItem` deletes first), so a `Path=/` deletion is unnecessary, and would remove the new value if that order ever
 * changed.
 */
export const withRootPathDeletions = (setCookies: string[]): string[] => {
  const cookies = setCookies.map(parseSetCookie)
  const namesWithNewValue = new Set(
    cookies.filter((cookie) => cookie.value !== '').map((cookie) => cookie.name),
  )

  return setCookies.flatMap((header, index) => {
    const { name, value, attributes } = cookies[index]
    const isDeletion = value === '' && isExpired(attributes)
    const hasPath = attributes.some((attribute) => attribute.toLowerCase().startsWith('path='))

    return isDeletion && !hasPath && !namesWithNewValue.has(name) ? [header, `${header};Path=/`] : [header]
  })
}

export const applyRootPathDeletions = (res: ServerResponse) => {
  const current = res.getHeader('Set-Cookie')
  if (current === undefined) {
    return
  }

  res.setHeader('Set-Cookie', withRootPathDeletions(Array.isArray(current) ? current : [String(current)]))
}

const parseSetCookie = (header: string) => {
  const [pair, ...attributes] = header.split(';').map((part) => part.trim())
  const separator = pair.indexOf('=')

  return { name: pair.slice(0, separator), value: pair.slice(separator + 1), attributes }
}

const isExpired = (attributes: string[]) =>
  attributes.some((attribute) => {
    const [key, value] = attribute.split('=')
    switch (key.toLowerCase()) {
      case 'expires':
        return Date.parse(value) <= Date.now()
      case 'max-age':
        return Number(value) <= 0
      default:
        return false
    }
  })
