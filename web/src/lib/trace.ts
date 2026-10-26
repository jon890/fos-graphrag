import type { KnowledgeMark, KnowledgeSummary, StudyItem, TraceStep, TraceView } from '../api/types'

// 근거 따라가기와 공부 화면의 순수 규칙. 화면은 docs/flow.md 「근거 따라가기」, 「공부」, 응답은 docs/api-contract.md 「근거 따라가기」, 「내 이해 표시」.

export interface TraceSummary {
  steps: number
  supported: number
  partial: number
  missing: number
  /** 내가 「잘 모르겠어요」 로 표시한 단계 수 */
  unsure: number
}

/** 단계 카드의 자리. root 는 지금 항목, origin 은 가장 깊은 단계(출발점), middle 은 나머지다 */
export type StepRole = 'root' | 'origin' | 'middle'

/** 화면 순서. 깊은 단계가 위, 지금 항목이 맨 아래다. 같은 깊이는 응답 순서(만든 순서)를 지킨다 */
export function stepCards(view: TraceView): TraceStep[] {
  return view.steps
    .map((step, index) => ({ step, index }))
    .sort((a, b) => b.step.depth - a.step.depth || a.index - b.index)
    .map((x) => x.step)
}

export function traceSummary(view: TraceView): TraceSummary {
  const count = (pick: (s: TraceStep) => boolean) => view.steps.filter(pick).length
  return {
    steps: view.steps.length,
    supported: count((s) => s.status === 'SUPPORTED'),
    partial: count((s) => s.status === 'PARTIAL'),
    missing: count((s) => s.status === 'MISSING'),
    unsure: count((s) => s.knowledge?.level === 'UNSURE'),
  }
}

/** 단계가 지금 항목 하나뿐이면 그 단계는 root 다 */
export function stepRole(view: TraceView, step: TraceStep): StepRole {
  if (step.depth === 0) return 'root'
  const deepest = Math.max(...view.steps.map((s) => s.depth))
  return step.depth === deepest ? 'origin' : 'middle'
}

/** 그 단계의 이해 표시만 바꾼 응답. 요약 줄도 이 값으로 다시 센다 */
export function withStepKnowledge(view: TraceView, nodeId: string, mark: KnowledgeMark): TraceView {
  return { ...view, steps: view.steps.map((s) => (s.node.id === nodeId ? { ...s, knowledge: mark } : s)) }
}

/** 공부 카드에 보이는 결정 맥락의 최대 수. 서버도 3개까지만 담는다 */
const STUDY_CONTEXT_LIMIT = 3

/** 공부 카드의 단계 맥락. 항목이 결정이면(depth 0) 「투자 결정」 이다 */
export function studyContextText(item: StudyItem): string {
  if (item.contexts.length === 0) return '이어진 투자 결정이 없습니다'
  if (item.contexts.some((c) => c.depth === 0)) return '투자 결정'
  return item.contexts
    .slice(0, STUDY_CONTEXT_LIMIT)
    .map((c) => `${c.decision.label}의 ${c.depth}단계 위`)
    .join(', ')
}

export interface StudyTodo {
  kind: 'document' | 'concept' | 'attach'
  label: string
  /** 문서 주소. document 일 때만 있다 */
  url?: string
  /** 문서나 개념의 id. attach 에는 없다 */
  id?: string
}

/** 공부 카드의 할 일. 근거 문서마다 읽기, 문서가 없으면 붙이기 안내 하나, 그 뒤에 개념마다 설명 읽기다 */
export function studyTodos(item: StudyItem): StudyTodo[] {
  const documents: StudyTodo[] = item.documents.length
    ? item.documents.map((d) => ({ kind: 'document', label: `「${d.title}」 읽기`, url: d.url, id: d.id }))
    : [{ kind: 'attach', label: '근거 문서가 없습니다. 공부한 자료를 근거로 붙여 주세요' }]
  const concepts: StudyTodo[] = item.concepts.map((c) => ({ kind: 'concept', label: `개념 「${c.label}」 설명 읽기`, id: c.id }))
  return [...documents, ...concepts]
}

/** 서버가 세는 결정의 최대 수. 넘으면 decisionsTruncated 가 참이다 */
const COMPETENCE_DECISION_LIMIT = 200

/** 공부 탭 위쪽의 능력 범위 문장 */
export function competenceText(summary: KnowledgeSummary): string {
  const { total, understood } = summary.decisions
  if (total === 0) return '아직 투자 결정이 없습니다.'
  const text = `투자 결정 ${total}개 가운데 ${understood}개는 근거를 다 이해함`
  return summary.decisionsTruncated ? `${text} (앞 ${COMPETENCE_DECISION_LIMIT}개만 셌습니다)` : text
}
