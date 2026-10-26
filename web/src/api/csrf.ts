export const CSRF_COOKIE = 'XSRF-TOKEN'
export const CSRF_HEADER = 'X-XSRF-TOKEN'

/** document.cookie 문자열에서 이름이 정확히 같은 쿠키 값을 찾는다. 없거나 비어 있으면 null. */
export function readCookie(cookieString: string, name: string): string | null {
  if (!cookieString) return null
  for (const part of cookieString.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    const key = part.slice(0, eq).trim()
    if (key !== name) continue
    const raw = part.slice(eq + 1).trim()
    if (raw === '') return null
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return null
}
