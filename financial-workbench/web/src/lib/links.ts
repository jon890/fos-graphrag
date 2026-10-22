import { isSafeReturnTo } from '../routes'

const RETURN_TO_KEY = 'workbench.returnTo'

/** 항목 상세를 여는 주소. origin 은 화면이 쓰는 주소다 */
export function nodeLink(id: string, origin: string): string {
  return `${origin}/workspace?node=${encodeURIComponent(id)}`
}

/** 브라우저 저장소는 막혀 있을 수 있어 접근 자체를 try 안에서 한다 */
function tabStorage(storage?: Storage | null): Storage | null {
  try {
    return storage === undefined ? (globalThis.sessionStorage ?? null) : storage
  } catch {
    return null
  }
}

/** 로그인을 건너도 남도록 보던 경로와 query 를 탭 저장소에 둔다. 안전하지 않은 주소와 막힌 저장소는 아무것도 하지 않는다 */
export function rememberReturnTo(path: string, storage?: Storage | null): void {
  if (!isSafeReturnTo(path)) return
  try {
    tabStorage(storage)?.setItem(RETURN_TO_KEY, path)
  } catch {
    // 저장하지 못하면 로그인 뒤 보던 화면으로 돌아가지 못할 뿐이다.
  }
}

/** 둔 주소를 꺼내고 지운다. 없거나 안전하지 않거나 저장소를 쓸 수 없으면 null */
export function takeReturnTo(storage?: Storage | null): string | null {
  try {
    const s = tabStorage(storage)
    if (!s) return null
    const path = s.getItem(RETURN_TO_KEY)
    s.removeItem(RETURN_TO_KEY)
    return path && isSafeReturnTo(path) ? path : null
  } catch {
    return null
  }
}
