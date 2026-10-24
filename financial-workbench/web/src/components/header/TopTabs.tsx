import { TOP_TABS, type TabKey } from '../../routes'

const TOP_TAB_LABEL: Partial<Record<TabKey, string>> = { map: '개념 지도', workspace: '작업 공간', list: '목록' }

/** 머리글 탭과 「더보기」 단추가 함께 쓰는 모양. 선택되면 파란 밑줄이 생긴다 */
export const HEADER_TAB_CLASS =
  'shrink-0 cursor-pointer rounded-none border-0 border-b-[3px] border-transparent bg-transparent px-2 py-2.5 text-sm whitespace-nowrap text-slate-300 lg:px-3 lg:py-3'

interface Props {
  activeTab: TabKey | null
  onOpen: (key: TabKey) => void
}

/** 머리글의 탭 셋. 나머지 화면은 MoreMenu 에 있다 */
export function TopTabs({ activeTab, onOpen }: Props) {
  return (
    <div className="flex min-w-0 flex-nowrap" role="tablist">
      {TOP_TABS.map((key) => (
        <button
          key={key}
          role="tab"
          aria-selected={activeTab === key}
          className={`${HEADER_TAB_CLASS} aria-selected:border-blue-400 aria-selected:text-white`}
          data-testid={`tab-${key}`}
          onClick={() => onOpen(key)}
        >
          {TOP_TAB_LABEL[key]}
        </button>
      ))}
    </div>
  )
}
