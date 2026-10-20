export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '-'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('ko-KR', { hour12: false })
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
