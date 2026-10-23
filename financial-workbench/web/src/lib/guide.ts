import type { CurrentUser } from '../api/types'

// 첫 접속 가이드의 단계 정의와 진행 상태. 화면 코드 없이 테스트한다.

export type GuideKind = 'browse' | 'practice'

export interface GuideStep {
  id: string
  /** 가리킬 요소의 data-testid. 없으면 화면 아래쪽 카드로 보인다 */
  target: string | null
  /** 좁은 화면에서 이 단계에 들어갈 때 옮길 작업 공간 탭 */
  pane: 'search' | 'graph' | 'detail' | null
  title: string
  body: string
}

/** 열람자의 둘러보기. 문구는 docs/flow.md 「열람자의 둘러보기」 다 */
export const BROWSE_STEPS: GuideStep[] = [
  {
    id: 'intro',
    target: null,
    pane: null,
    title: '워크벤치 둘러보기',
    body: '투자 지식을 근거와 함께 쌓는 곳입니다. 화면을 세 단계로 둘러봅니다.',
  },
  { id: 'search', target: 'search-input', pane: 'search', title: '검색', body: '기업, 인물, 개념의 이름으로 찾습니다.' },
  {
    id: 'graph',
    target: 'graph-canvas',
    pane: 'graph',
    title: '그래프',
    body: '고른 항목과 이어진 항목이 그래프로 보입니다. 기업 사이의 선은 주장입니다.',
  },
  {
    id: 'detail',
    target: 'workspace-pane-detail',
    pane: 'detail',
    title: '상세',
    body: '항목을 누르면 속성, 주장, 근거 문서, 검토 상태가 여기에 나옵니다.',
  },
]

export interface GuideProgress {
  userId: string
  kind: GuideKind
  step: number
  startedAt: string
  /** 따라하기로 만든 항목 ID. 키는 단계 id 다 */
  created: Record<string, string>
}

const PROGRESS_KEY = 'workbench.guide'

/** 브라우저 저장소는 막혀 있을 수 있어 접근 자체를 try 안에서 한다 */
function localStore(storage?: Storage | null): Storage | null {
  try {
    return storage === undefined ? (globalThis.localStorage ?? null) : storage
  } catch {
    return null
  }
}

/** 이 사용자의 진행 상태. 없거나 깨졌거나 다른 사용자의 값이거나 저장소를 쓸 수 없으면 null */
export function readProgress(userId: string, storage?: Storage | null): GuideProgress | null {
  try {
    const raw = localStore(storage)?.getItem(PROGRESS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<GuideProgress> | null
    if (!p || p.userId !== userId) return null
    if ((p.kind !== 'browse' && p.kind !== 'practice') || typeof p.step !== 'number' || typeof p.startedAt !== 'string') return null
    return { userId: p.userId, kind: p.kind, step: p.step, startedAt: p.startedAt, created: p.created ?? {} }
  } catch {
    return null
  }
}

export function writeProgress(p: GuideProgress, storage?: Storage | null): void {
  try {
    localStore(storage)?.setItem(PROGRESS_KEY, JSON.stringify(p))
  } catch {
    // 저장하지 못하면 새로고침 뒤 처음부터 다시 열 뿐이다.
  }
}

export function clearProgress(storage?: Storage | null): void {
  try {
    localStore(storage)?.removeItem(PROGRESS_KEY)
  } catch {
    // 지우지 못해도 읽을 때 같은 사용자의 값인지 다시 본다.
  }
}

/** 로그인한 뒤 작업 공간에서 가이드를 저절로 열지 */
export function shouldAutoStart(user: CurrentUser): boolean {
  return user.guideDoneAt === null
}
