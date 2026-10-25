import type { KnowledgeMark, TraceStep, TraceView } from '../api/types'

// 근거 따라가기 화면의 순수 규칙. 화면은 docs/flow.md 「근거 따라가기」, 응답은 docs/api-contract.md 「근거 따라가기」.

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
