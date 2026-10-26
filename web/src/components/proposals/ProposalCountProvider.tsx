import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router'
import { api } from '../../api/client'

interface ProposalCount {
  /** 대기 중인 내 제안 수. 아직 읽지 못했거나 읽기에 실패하면 null 이다 */
  count: number | null
  refresh: () => void
}

const ProposalCountContext = createContext<ProposalCount>({ count: null, refresh: () => {} })

export function useProposalCount(): ProposalCount {
  return useContext(ProposalCountContext)
}

/**
 * 머리글 배지의 대기 수. 로그인한 화면이 처음 그려질 때와 화면 경로가 바뀔 때 다시 읽고, 승인이나 거절 뒤에는 refresh 로 읽는다.
 * 주기적으로 묻지 않는다. 실패하면 null 로 두어 배지를 숨긴다.
 */
export function ProposalCountProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState<number | null>(null)
  // 늦게 온 옛 응답이 새 응답을 덮지 않게 마지막 요청만 반영한다
  const seq = useRef(0)
  const { pathname } = useLocation()

  const refresh = useCallback(() => {
    const mine = ++seq.current
    api.proposals
      .summary()
      .then((s) => mine === seq.current && setCount(s.pending))
      .catch(() => mine === seq.current && setCount(null))
  }, [])

  useEffect(() => {
    refresh()
  }, [pathname, refresh])

  const value = useMemo(() => ({ count, refresh }), [count, refresh])
  return <ProposalCountContext.Provider value={value}>{children}</ProposalCountContext.Provider>
}
