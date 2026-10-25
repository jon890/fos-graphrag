import type { ClaimView, NodeDetail, NodeRef } from '../../api/types'
import { useApp, useLabels } from '../../context'
import { StatusBadge, TypeBadge } from '../TypeBadge'

/** 개념 노드 타입. 서버 LearningRules 의 개념 타입 이름과 같다 */
const CONCEPT_TYPE = 'Concept'

/** 절 제목을 고르는 주장 종류 키. 온톨로지에서 빠져도 절은 빈 채로 남는다 */
const ADVOCATES = 'ADVOCATES'
const CRITICIZES = 'CRITICIZES'

interface SectionItem {
  node: NodeRef
  /** 주장 절이면 그 주장의 검토 상태 */
  reviewStatus?: string
}

interface Section {
  key: string
  title: string
  items: SectionItem[]
  /** 이 개념을 쓴 곳은 타입 배지를 함께 보인다 */
  showType: boolean
}

/** 같은 항목을 두 번 보이지 않는다. 처음 나온 것을 남긴다 */
function uniqueByNode(items: SectionItem[]): SectionItem[] {
  const seen = new Set<string>()
  return items.filter((it) => {
    if (seen.has(it.node.id)) return false
    seen.add(it.node.id)
    return true
  })
}

function predicateOf(claim: ClaimView): string {
  const p = claim.properties.predicate
  return typeof p === 'string' ? p : ''
}

/**
 * 개념 상세의 절. 규칙은 docs/flow.md 「개념 상세」.
 * 모두 GET /api/nodes/{id} 응답의 relationships 와 claims 로 만든다.
 */
export function conceptSections(detail: NodeDetail, predicateKeys: string[], predicateLabel: (key: string) => string): Section[] {
  const id = detail.node.id
  const claimItems = new Map<string, SectionItem[]>()
  for (const c of detail.claims) {
    if (c.archived || c.object?.id !== id || !c.subject) continue
    const key = predicateOf(c)
    claimItems.set(key, [...(claimItems.get(key) ?? []), { node: c.subject, reviewStatus: c.reviewStatus }])
  }
  const active = detail.relationships.filter((r) => !r.archived)
  const related = active
    .filter((r) => r.from.type === CONCEPT_TYPE && r.to.type === CONCEPT_TYPE && r.from.id !== r.to.id)
    .map((r) => ({ node: r.from.id === id ? r.to : r.from }))
  const usedBy = active.filter((r) => r.to.id === id && r.from.type !== CONCEPT_TYPE).map((r) => ({ node: r.from }))

  const claimSection = (key: string, title: string): Section => ({ key, title, items: uniqueByNode(claimItems.get(key) ?? []), showType: false })
  // 강조와 비판 밖의 주장 종류는 온톨로지 순서, 온톨로지에 없는 키는 응답 순서로 뒤에 둔다
  const others = [...new Set([...predicateKeys.filter((k) => claimItems.has(k)), ...claimItems.keys()])].filter(
    (k) => k !== ADVOCATES && k !== CRITICIZES && k !== '',
  )
  return [
    claimSection(ADVOCATES, '강조한 사람'),
    claimSection(CRITICIZES, '비판한 사람'),
    { key: 'related', title: '관련 개념', items: uniqueByNode(related), showType: false },
    { key: 'used-by', title: '이 개념을 쓴 곳', items: uniqueByNode(usedBy), showType: true },
    ...others.map((k) => claimSection(k, `${predicateLabel(k)} 주장`)),
  ]
}

const SECTION_ID: Record<string, string> = { [ADVOCATES]: 'advocates', [CRITICIZES]: 'criticizes', related: 'related', 'used-by': 'used-by' }

interface Props {
  detail: NodeDetail
  /** 상세만 바꾸는 열기 */
  onSelect: (id: string) => void
}

/** 개념 노드 상세의 강조한 사람, 비판한 사람, 관련 개념, 이 개념을 쓴 곳 절 */
export function ConceptSections({ detail, onSelect }: Props) {
  const { ontology } = useApp()
  const labels = useLabels()
  const sections = conceptSections(detail, Object.keys(ontology.claimPredicates), labels.predicate)
  return (
    <div className="grid gap-3" data-testid="concept-sections">
      {sections.map((s) => (
        <section key={s.key} className="grid gap-1" data-testid="concept-section" data-section={SECTION_ID[s.key] ?? `predicate-${s.key}`}>
          <h3 className="text-sm font-semibold">{s.title}</h3>
          {s.items.length === 0 ? (
            <p className="text-sm text-muted-foreground" data-testid="concept-section-empty">
              아직 없습니다
            </p>
          ) : (
            <ul className="flex flex-wrap gap-x-3 gap-y-1">
              {s.items.map((it) => (
                <li key={it.node.id} className="flex min-w-0 items-center gap-1.5" data-testid="concept-section-item" data-node-id={it.node.id}>
                  {s.showType && <TypeBadge type={it.node.type} />}
                  <button
                    type="button"
                    className="cursor-pointer text-left text-sm break-words text-blue-700 hover:underline"
                    onClick={() => onSelect(it.node.id)}
                  >
                    {labels.node(it.node)}
                  </button>
                  {it.reviewStatus && <StatusBadge status={it.reviewStatus} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}
