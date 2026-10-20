import { useLabels } from '../context'
import { colorForType } from '../lib/graph'

/** 노드 타입 배지. 색은 타입 키로, 글자는 온톨로지 표시 이름으로 정한다 */
export function TypeBadge({ type }: { type: string }) {
  const labels = useLabels()
  return (
    <span className="type-badge" style={{ backgroundColor: colorForType(type) }} data-type={type}>
      {labels.type(type)}
    </span>
  )
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const labels = useLabels()
  if (!status) return null
  return (
    <span className={`status-badge status-${status.toLowerCase()}`} data-testid="review-status-badge" data-status={status}>
      {labels.status(status)}
    </span>
  )
}
