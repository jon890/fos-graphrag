const PENDING_KEY = 'workbench.pendingNode'

/** 항목 상세를 여는 주소. origin 은 화면이 쓰는 주소다 */
export function nodeLink(id: string, origin: string): string {
  return `${origin}/?node=${encodeURIComponent(id)}`
}

/** 주소의 query 에서 node 값을 꺼낸다. 없거나 비면 null */
export function nodeFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get('node')
  return id ? id : null
}

/** 브라우저 저장소는 막혀 있을 수 있어 접근 자체를 try 안에서 한다 */
function tabStorage(storage?: Storage | null): Storage | null {
  try {
    return storage === undefined ? (globalThis.sessionStorage ?? null) : storage
  } catch {
    return null
  }
}

/** 로그인을 건너도 남도록 탭 저장소에 둔다. 저장소를 쓸 수 없으면 아무것도 하지 않는다 */
export function rememberPendingNode(id: string, storage?: Storage | null): void {
  try {
    tabStorage(storage)?.setItem(PENDING_KEY, id)
  } catch {
    // 저장하지 못하면 로그인 뒤 링크 항목을 열지 못할 뿐이다.
  }
}

/** 둔 값을 꺼내고 지운다. 없거나 저장소를 쓸 수 없으면 null */
export function takePendingNode(storage?: Storage | null): string | null {
  try {
    const s = tabStorage(storage)
    if (!s) return null
    const id = s.getItem(PENDING_KEY)
    s.removeItem(PENDING_KEY)
    return id ? id : null
  } catch {
    return null
  }
}
