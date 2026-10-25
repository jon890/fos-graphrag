import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { moreItems, type TabKey } from '../../routes'
import { HEADER_TAB_CLASS } from './TopTabs'

const MORE_LABEL: Partial<Record<TabKey, string>> = { changes: '변경 이력', ontology: '온톨로지 상세', review: '검토 대기', users: '사용자', tokens: '연동 토큰' }

interface Props {
  role: string
  activeTab: TabKey | null
  onOpen: (key: TabKey) => void
}

/**
 * 머리글의 「더보기」 메뉴. 항목은 역할마다 다르다(moreItems).
 * 모달 메뉴는 스크롤을 잠그려고 <style> 을 넣어 CSP(style-src 'self')에 막히므로 modal={false} 로 연다.
 */
export function MoreMenu({ role, activeTab, onOpen }: Props) {
  const items = moreItems(role)
  // 열람자가 주소로 연 /review 처럼 메뉴에 없는 화면이어도 더보기 쪽 화면이면 선택된 것으로 보인다.
  const active = activeTab !== null && activeTab in MORE_LABEL
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        className={`${HEADER_TAB_CLASS} outline-none data-[active=true]:border-blue-400 data-[active=true]:text-white`}
        data-testid="more-open"
        data-active={String(active)}
      >
        더보기 ▾
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((key) => (
          <DropdownMenuItem key={key} data-testid={`more-item-${key}`} onSelect={() => onOpen(key)}>
            {MORE_LABEL[key]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
