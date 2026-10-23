import type { CurrentUser, Ontology } from '../api/types'
import { withEulReul, withJosa } from './labels'

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

/** 따라하기의 주장 종류와 대상 타입. 대상 타입의 활성 항목이 있는 것을 Provider 가 고른다 */
export interface PracticePlan {
  predicate: string
  objectType: string
}

/** 따라하기로 만든 항목 ID. 키는 그 항목을 만든 단계 id 다 */
export interface PracticeCreated {
  company?: string
  document?: string
  claim?: string
}

export interface GuideProgress {
  userId: string
  kind: GuideKind
  step: number
  startedAt: string
  created: PracticeCreated
  /** 따라하기에만 있다 */
  plan?: PracticePlan
}

/** 화면 이름을 읽는 함수. useLabels() 의 일부다 */
export interface GuideLabels {
  type: (type: string) => string
  predicate: (predicate: string) => string
}

/** 따라하기의 단계. 문구는 docs/flow.md 「편집자와 관리자의 따라하기」 다 */
export function practiceSteps(labels: GuideLabels, plan: PracticePlan): GuideStep[] {
  const company = labels.type('Company')
  const object = labels.type(plan.objectType)
  return [
    {
      id: 'intro',
      target: null,
      pane: null,
      title: '워크벤치 따라하기',
      body: '투자 지식을 근거와 함께 쌓는 곳입니다. 연습 항목 세 개를 직접 만들어 봅니다. 끝나면 연습 항목은 보관되어 검색에 나오지 않습니다.',
    },
    {
      id: 'company',
      target: 'create-submit',
      pane: 'search',
      title: `${company} 만들기`,
      body: `먼저 ${withEulReul(company)} 하나 만듭니다. 이름은 바꿔도 됩니다. 「만들기」 를 누르세요.`,
    },
    {
      id: 'document',
      target: 'create-submit',
      pane: 'search',
      title: `${labels.type('Document')} 만들기`,
      body: '주장에는 근거가 필요합니다. 근거로 쓸 문서를 등록합니다.',
    },
    {
      id: 'claim',
      target: 'claim-add-submit',
      pane: 'detail',
      title: `주장 만들기: ${labels.predicate(plan.predicate)}`,
      body: `이제 주장을 만듭니다. 대상에 ${object} 하나를 고르고 「만들기」 를 누르세요. 관계, 근거 문서, 설명과 근거 문장은 미리 채웠습니다.`,
    },
    {
      id: 'done',
      target: 'graph-canvas',
      pane: 'graph',
      title: '마침',
      body: `주장이 그래프에 ${withJosa(company, '와(과)')} ${withEulReul(object)} 잇는 선으로 보입니다. 다른 편집자가 검토하면 실선이 됩니다. 「끝내기」 를 누르면 연습 항목을 보관합니다.`,
    },
  ]
}

/** 진행 중인 따라하기가 있을 때 먼저 묻는 단계 */
export const RESUME_STEP: GuideStep = {
  id: 'resume',
  target: null,
  pane: null,
  title: '따라하기 이어서 하기',
  body: '하던 따라하기가 있습니다. 이어서 하거나 그만둘 수 있습니다. 그만두면 만든 연습 항목을 보관합니다.',
}

/** 만드는 단계. 「다음」 대신 「그만두기」 를 두고, 항목을 만들면 다음 단계로 간다 */
export const PRACTICE_CREATE_STEPS = ['company', 'document', 'claim']

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 연습 기업과 근거 문서의 이름. 시각은 실행 환경의 지역 시각이다 */
export function practiceNames(displayName: string, startedAt: Date): { company: string; document: string } {
  const at = `${pad2(startedAt.getMonth() + 1)}${pad2(startedAt.getDate())}-${pad2(startedAt.getHours())}${pad2(startedAt.getMinutes())}`
  return { company: `[연습] ${displayName} 기업 ${at}`, document: `[연습] ${displayName} 메모 ${at}` }
}

/** 연습 주장의 설명과 근거 문장 */
export const PRACTICE_TEXT = '[연습] 가이드로 만든 주장입니다'

/** 연습 항목을 보관할 때 남기는 이유 */
export const PRACTICE_ARCHIVE_REASON = '첫 접속 가이드 연습 항목'

const PREFERRED_PREDICATE = 'BELONGS_TO_SECTOR'

/** 기업을 주체로 받는 주장 종류. 「속한다」 를 먼저 둔다. 기업이나 근거 문서 타입이 없으면 빈 목록이다 */
export function practicePredicateCandidates(ontology: Ontology): string[] {
  if (!ontology.nodeTypes.Company || !ontology.nodeTypes.Document) return []
  const names = Object.keys(ontology.claimPredicates).filter((n) => ontology.claimPredicates[n].subjectTypes.includes('Company'))
  return [...names.filter((n) => n === PREFERRED_PREDICATE), ...names.filter((n) => n !== PREFERRED_PREDICATE)]
}

/** 연습 근거 문서 폼의 처음 값. 근거 문서 타입에 없는 속성과 선택지는 넣지 않는다 */
export function practiceDocumentValues(ontology: Ontology, title: string): Record<string, string> {
  const defs = ontology.nodeTypes.Document?.properties ?? {}
  const values: Record<string, string> = {}
  if (defs.title) values.title = title
  if (defs.url) values.url = 'https://example.com/practice'
  if (defs.documentType?.values?.includes('OTHER')) values.documentType = 'OTHER'
  return values
}

/** 보관할 순서. 주장을 근거 문서보다 먼저 보관해야 「유일한 근거」 규칙에 걸리지 않는다 */
export function archiveOrder(created: PracticeCreated): string[] {
  return [created.claim, created.document, created.company].filter((id): id is string => !!id)
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
    const created = (p.created ?? {}) as PracticeCreated
    if (p.kind === 'browse') return { userId: p.userId, kind: p.kind, step: p.step, startedAt: p.startedAt, created }
    // 따라하기는 고른 주장 종류가 있어야 이어서 할 수 있다.
    const plan = p.plan
    if (!plan || typeof plan.predicate !== 'string' || typeof plan.objectType !== 'string') return null
    return { userId: p.userId, kind: p.kind, step: p.step, startedAt: p.startedAt, created, plan: { predicate: plan.predicate, objectType: plan.objectType } }
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

/** 로그인한 뒤 작업 공간에서 가이드를 저절로 열지. 진행 중인 따라하기는 끝낸 기록과 상관없이 연다 */
export function shouldAutoStart(user: CurrentUser, progress: GuideProgress | null = null): boolean {
  return user.guideDoneAt === null || progress?.kind === 'practice'
}
