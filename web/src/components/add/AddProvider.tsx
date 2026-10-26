import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { NodeView } from '../../api/types'
import { AddDialog } from './AddDialog'

export interface AddContextValue {
  /** 그 타입의 만들기 창을 연다. 타입 메뉴는 AddMenu 가 그린다 */
  open: (type: string) => void
  close: () => void
  openType: string | null
}

const noop = () => {}

// Provider 없이 그리는 화면(단위 테스트)에서도 쓰는 쪽이 그대로 동작하게 아무것도 하지 않는 기본값을 둔다.
const AddContext = createContext<AddContextValue>({ open: noop, close: noop, openType: null })

export function useAdd(): AddContextValue {
  return useContext(AddContext)
}

interface Props {
  children: ReactNode
  /** 만들었을 때. 안내 문장과 함께 부른다. App 이 안내를 채우고 작업 공간에서 새 항목을 연다 */
  onCreated: (node: NodeView, message: string, kind?: 'success' | 'error') => void
  /** 같은 이름 후보의 「열기」. 작업 공간에서 그 항목을 연다 */
  onOpenNode: (id: string) => void
}

/** 「＋ 추가」 의 만들기 창 상태. 머리글, 그래프, 개념 지도가 같은 창을 연다 */
export function AddProvider({ children, onCreated, onOpenNode }: Props) {
  const [openType, setOpenType] = useState<string | null>(null)
  const open = useCallback((type: string) => setOpenType(type), [])
  const close = useCallback(() => setOpenType(null), [])
  const value = useMemo<AddContextValue>(() => ({ open, close, openType }), [open, close, openType])
  return (
    <AddContext.Provider value={value}>
      {children}
      {openType && <AddDialog key={openType} type={openType} onClose={close} onCreated={onCreated} onOpenNode={onOpenNode} />}
    </AddContext.Provider>
  )
}
