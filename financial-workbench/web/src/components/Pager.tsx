import type { Page } from '../api/types'

export function Pager({ page, onPage, testIdPrefix }: { page: Page<unknown>; onPage: (p: number) => void; testIdPrefix: string }) {
  const last = Math.max(page.totalPages - 1, 0)
  return (
    <div className="pager">
      <button data-testid={`${testIdPrefix}-prev`} disabled={page.page <= 0} onClick={() => onPage(page.page - 1)}>
        이전
      </button>
      <span data-testid={`${testIdPrefix}-info`}>
        {page.totalPages === 0 ? 0 : page.page + 1} / {page.totalPages} 쪽 (전체 {page.totalItems}건)
      </span>
      <button data-testid={`${testIdPrefix}-next`} disabled={page.page >= last} onClick={() => onPage(page.page + 1)}>
        다음
      </button>
    </div>
  )
}
