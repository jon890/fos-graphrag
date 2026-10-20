import { colorForType } from '../lib/graph'

export function TypeBadge({ type }: { type: string }) {
  return (
    <span className="type-badge" style={{ backgroundColor: colorForType(type) }}>
      {type}
    </span>
  )
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null
  return (
    <span className={`status-badge status-${status.toLowerCase()}`} data-testid="review-status-badge">
      {status}
    </span>
  )
}
