import { useCallback, useSyncExternalStore } from 'react'

/** matchMedia 가 없으면 fallback 을 돌려준다 */
export function readMediaQuery(query: string, fallback: boolean, win: Pick<Window, 'matchMedia'> | null): boolean {
  if (!win || typeof win.matchMedia !== 'function') return fallback
  return win.matchMedia(query).matches
}

/** 미디어 쿼리가 맞는지 구독한다. 서버 렌더링과 테스트에서는 fallback(기본 true) */
export function useMediaQuery(query: string, fallback = true): boolean {
  const win = typeof window === 'undefined' ? null : window
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!win || typeof win.matchMedia !== 'function') return () => {}
      const list = win.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    [win, query],
  )
  return useSyncExternalStore(
    subscribe,
    () => readMediaQuery(query, fallback, win),
    () => fallback,
  )
}
