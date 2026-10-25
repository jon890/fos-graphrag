import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { moreItems, type TabKey } from '../../routes'
import { HEADER_TAB_CLASS } from './TopTabs'

const MORE_LABEL: Partial<Record<TabKey, string>> = { changes: '변경 이력', ontology: '온톨로지 상세', review: '검토 대기', users: '사용자', tokens: '연동 토큰', proposals: '제안' }

interface Props {
  role: string
  activeTab: TabKey | null
  onOpen: (key: TabKey) => void
  /** 대기 중인 제안 수. 1 이상이면 배지로 보이고, 0 이나 null(읽지 못함)이면 보이지 않는다 */
  pendingCount: number | null
}

const BADGE_CLASS = 'ml-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-4 font-bold text-white'

/**
 * 머리글의 「더보기」 메뉴. 항목은 역할마다 다르다(moreItems).
 * 모달 메뉴는 스크롤을 잠그려고 <style> 을 넣어 CSP(style-src 'self')에 막히므로 modal={false} 로 연다.
 */
export function MoreMenu({ role, activeTab, onOpen, pendingCount }: Props) {
  const items = moreItems(role)
  // 열람자가 주소로 연 /review 처럼 메뉴에 없는 화면이어도 더보기 쪽 화면이면 선택된 것으로 보인다.
  const badge = pendingCount !== null && pendingCount > 0 ? pendingCount : null
  const active = activeTab !== null && activeTab in MORE_LABEL
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={`${HEADER_TAB_CLASS} outline-none data-[active=true]:border-blue-400 data-[active=true]:text-white`}
        data-testid="more-open"
        data-active={String(active)}
      >
        더보기 ▾
        {badge !== null && (
          <span className={BADGE_CLASS} data-testid="more-pending-badge" data-count={badge}>
            {badge}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((key) => (
          <DropdownMenuItem key={key} data-testid={`more-item-${key}`} onSelect={() => onOpen(key)}>
            {MORE_LABEL[key]}
            {key === 'proposals' && badge !== null && (
              <span className={BADGE_CLASS} data-testid="more-item-proposals-badge" data-count={badge}>
                {badge}
              </span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
