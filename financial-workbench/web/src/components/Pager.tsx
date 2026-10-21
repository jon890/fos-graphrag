import type { Page } from '../api/types'
import { Button } from '@/components/ui/button'

export function Pager({ page, onPage, testIdPrefix }: { page: Page<unknown>; onPage: (p: number) => void; testIdPrefix: string }) {
  const last = Math.max(page.totalPages - 1, 0)
  return (
    <div className="my-3 flex items-center justify-center gap-3">
      <Button variant="outline" size="sm" data-testid={`${testIdPrefix}-prev`} disabled={page.page <= 0} onClick={() => onPage(page.page - 1)}>
        이전
      </Button>
      <span className="text-sm" data-testid={`${testIdPrefix}-info`}>
        {page.totalPages === 0 ? 0 : page.page + 1} / {page.totalPages} 쪽 (전체 {page.totalItems}건)
      </span>
      <Button variant="outline" size="sm" data-testid={`${testIdPrefix}-next`} disabled={page.page >= last} onClick={() => onPage(page.page + 1)}>
        다음
      </Button>
    </div>
  )
}
