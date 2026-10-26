export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { hour12: false })
}

/** 날짜만 보인다. 형식이 아니면 그대로 */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('ko-KR')
}

/** 사용자 참조를 표시 이름으로 바꾼다. 서버가 null 을 주는 경우(작성자 사용자 없음)에는 fallback 을 쓴다. */
export function userName(ref: { displayName: string } | null | undefined, fallback = '시스템'): string {
  return ref?.displayName ?? fallback
}

export function orUnknown(value: unknown): string {
  return value === null || value === undefined || value === '' ? '미상' : String(value)
}

export function truncate(text: string | null | undefined, max = 60): string {
  if (!text) return ''
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export function summarizeValue(value: unknown): string {
  if (value === null || value === undefined) return '없음'
  if (typeof value === 'string') return truncate(value, 40)
  return truncate(JSON.stringify(value), 40)
}
